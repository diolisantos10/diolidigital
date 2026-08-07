// OS LINKS DE PORTAL SAEM DE PRODUÇÃO — as duas metades.
//
// O buraco: `scripts/links-do-portal.mts` funciona e exige o banco de PRODUÇÃO,
// que ninguém alcança (o SQLite mora num volume dentro do contêiner do
// Railway). Em 07/08/2026 o CEO pediu três links e a casa não conseguiu
// responder. A rota resolve rodando ONDE O BANCO ESTÁ.
//
// As duas metades, que é o que impede este teste de virar decoração:
//   ⛔ METADE 1 — sem o segredo, 401 e NADA listado. E sem `CRON_SECRET` no
//      ambiente, porta FECHADA (503) — nunca aberta.
//   ✅ METADE 2 — com o segredo, a lista correta sai; e o cliente SEM token
//      aparece com o MOTIVO em vez de sumir da resposta. Sem esta metade,
//      "fechar a porta" poderia ser "recusar sempre", que passa na metade 1 e
//      não entrega link nenhum.
//
// A terceira propriedade, que é de segurança e não de recurso: um GET **não
// emite token**. Credencial de 180 dias criada por efeito colateral de uma
// consulta é como credencial vaza.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const findManyClient = vi.fn();
const findManyAcesso = vi.fn();
const criarAcesso = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: { findMany: (...a: unknown[]) => findManyClient(...a) },
    portalAccess: {
      findMany: (...a: unknown[]) => findManyAcesso(...a),
      create: (...a: unknown[]) => criarAcesso(...a),
    },
    $disconnect: vi.fn(),
  },
}));

const { GET } = await import("@/app/api/admin/links-do-portal/route");

const SEGREDO = "segredo-de-teste-bem-comprido";

/** O banco de mentira: dois clientes, um COM token vivo e um SEM nenhum. */
function montarBanco() {
  findManyClient.mockResolvedValue([
    { id: "cli-foocci", name: "Foocci" },
    { id: "cli-city", name: "CityJobs" },
  ]);
  findManyAcesso.mockImplementation(async (args: { where: { clientId: string } }) => {
    if (args.where.clientId === "cli-foocci") {
      return [{
        token: "TOKEN-VIVO-DA-FOOCCI",
        grantedAt: new Date("2026-07-01T00:00:00Z"),
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        revokedAt: null,
        accessCount: 4,
      }];
    }
    return []; // CityJobs nunca teve token.
  });
  criarAcesso.mockImplementation(async () => ({
    token: "TOKEN-NOVO",
    grantedAt: new Date("2026-08-07T00:00:00Z"),
    accessCount: 0,
  }));
}

function pedir(opcoes: { segredo?: string | null; query?: string } = {}) {
  const cabecalhos: Record<string, string> = {};
  if (opcoes.segredo) cabecalhos.authorization = `Bearer ${opcoes.segredo}`;
  return GET(new NextRequest(
    `https://www.diolidigital.com.br/api/admin/links-do-portal${opcoes.query ?? ""}`,
    { headers: cabecalhos },
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  montarBanco();
  process.env.CRON_SECRET = SEGREDO;
});
afterEach(() => { delete process.env.CRON_SECRET; });

describe("⛔ METADE 1 — sem o segredo não sai link nenhum", () => {
  it("sem cabeçalho: 401, e o corpo NÃO traz link nem token", async () => {
    const r = await pedir({ segredo: null });
    expect(r.status).toBe(401);
    const corpo = JSON.stringify(await r.json());
    expect(corpo).not.toContain("TOKEN-VIVO-DA-FOOCCI");
    expect(corpo).not.toContain("portal/access");
    expect(corpo).not.toContain("Foocci");
    // E o banco sequer foi consultado: a trava vem ANTES da leitura.
    expect(findManyClient).not.toHaveBeenCalled();
  });

  it("com o segredo ERRADO: 401 e nada listado", async () => {
    const r = await pedir({ segredo: "segredo-errado-de-mesmo-tamanho" });
    expect(r.status).toBe(401);
    expect(JSON.stringify(await r.json())).not.toContain("TOKEN-VIVO-DA-FOOCCI");
    expect(findManyClient).not.toHaveBeenCalled();
  });

  it("mesmo com ?emitir=1, sem segredo NADA é gravado", async () => {
    const r = await pedir({ segredo: null, query: "?emitir=1" });
    expect(r.status).toBe(401);
    expect(criarAcesso).not.toHaveBeenCalled();
  });

  it("CRON_SECRET AUSENTE do ambiente = porta FECHADA (503), nunca aberta", async () => {
    delete process.env.CRON_SECRET;
    // Nem sem cabeçalho, nem com um cabeçalho qualquer: a porta não abre.
    for (const segredo of [null, "qualquer-coisa"]) {
      const r = await pedir({ segredo });
      expect(r.status).toBe(503);
      expect(JSON.stringify(await r.json())).not.toContain("TOKEN-VIVO-DA-FOOCCI");
    }
    expect(findManyClient).not.toHaveBeenCalled();
  });
});

describe("✅ METADE 2 — com o segredo, a lista sai correta", () => {
  it("monta o link no domínio próprio e reaproveita o token vivo", async () => {
    const r = await pedir({ segredo: SEGREDO });
    expect(r.status).toBe(200);
    const corpo = await r.json();

    const foocci = corpo.linhas.find((l: { procurado: string }) => l.procurado === "Foocci");
    expect(foocci.situacao).toBe("link_existente");
    expect(foocci.link).toBe("https://www.diolidigital.com.br/portal/access/TOKEN-VIVO-DA-FOOCCI");
    expect(foocci.acessos).toBe(4);
    // NADA foi gravado, e nada foi revogado — o link que está no WhatsApp do
    // cliente continua sendo este.
    expect(criarAcesso).not.toHaveBeenCalled();
  });

  it("cliente SEM token aparece com o MOTIVO — não some da resposta", async () => {
    const r = await pedir({ segredo: SEGREDO });
    const corpo = await r.json();

    const city = corpo.linhas.find((l: { procurado: string }) => l.procurado === "CityJobs");
    expect(city).toBeDefined();          // não sumiu
    expect(city.situacao).toBe("sem_token");
    expect(city.link).toBeNull();        // e o link NÃO foi inventado
    expect(city.motivo).toContain("nunca teve token de portal");
    expect(corpo.faltando).toBeGreaterThan(0);
  });

  it("nome que não existe no banco vira linha com motivo, e não derruba os outros", async () => {
    const r = await pedir({ segredo: SEGREDO, query: "?clientes=Foocci,Padaria%20Inexistente" });
    const corpo = await r.json();
    const some = corpo.linhas.find((l: { procurado: string }) => l.procurado === "Padaria Inexistente");
    expect(some.situacao).toBe("cliente_nao_existe");
    expect(some.link).toBeNull();
    // O link que EXISTIA continua saindo: um nome errado não cega os outros.
    expect(corpo.linhas.find((l: { procurado: string }) => l.procurado === "Foocci").link).toContain("TOKEN-VIVO");
  });
});

describe("🔒 EMITIR É EXPLÍCITO — um GET não cria credencial", () => {
  it("sem ?emitir, NADA é gravado, mesmo para quem não tem token", async () => {
    const r = await pedir({ segredo: SEGREDO });
    const corpo = await r.json();
    expect(criarAcesso).not.toHaveBeenCalled();
    expect(corpo.emitiu).toBe(false);
    expect(corpo.aviso).toContain("Leitura pura");
  });

  it("?emitir=0 e ?emitir=sim NÃO ligam a emissão — só '1' e 'true'", async () => {
    for (const v of ["0", "sim", "yes", "please", ""]) {
      vi.clearAllMocks(); montarBanco();
      await pedir({ segredo: SEGREDO, query: `?emitir=${v}` });
      expect(criarAcesso).not.toHaveBeenCalled();
    }
  });

  it("com ?emitir=1 emite SÓ para quem não tem token vivo — e não revoga o vivo", async () => {
    const r = await pedir({ segredo: SEGREDO, query: "?emitir=1" });
    const corpo = await r.json();

    expect(criarAcesso).toHaveBeenCalledTimes(1);
    expect(criarAcesso.mock.calls[0][0].data.clientId).toBe("cli-city");

    const city = corpo.linhas.find((l: { procurado: string }) => l.procurado === "CityJobs");
    expect(city.situacao).toBe("link_novo");
    expect(city.link).toContain("TOKEN-NOVO");

    // O token vivo da Foocci foi REAPROVEITADO, não trocado.
    const foocci = corpo.linhas.find((l: { procurado: string }) => l.procurado === "Foocci");
    expect(foocci.link).toContain("TOKEN-VIVO-DA-FOOCCI");
    expect(foocci.situacao).toBe("link_existente");
  });
});

describe("🧩 UMA REGRA SÓ — o script e a rota chamam o mesmo módulo", () => {
  it("o script não reimplementa a emissão de token", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = readFileSync(resolve(__dirname, "../../scripts/links-do-portal.mts"), "utf8");
    // Se o script voltar a criar token por conta própria, existem duas regras —
    // e a que diverge emite credencial de 180 dias com critério diferente.
    expect(fonte).not.toContain("portalAccess.create");
    expect(fonte).not.toContain("randomBytes");
    expect(fonte).toContain("levantarLinksDoPortal");
  });
});
