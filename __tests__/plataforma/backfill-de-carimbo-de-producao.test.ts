// O BACKFILL RODA ONDE O BANCO ESTÁ — as duas metades, na mesma porta.
//
// ── Por que este arquivo existe ─────────────────────────────────────────────
// O backfill é **pré-requisito de deploy**: sem ele, exigir carimbo apaga a
// tela do dono legítimo. E ele só existia como script — que precisa do banco
// de PRODUÇÃO, e ninguém alcança o banco de produção (SQLite num volume dentro
// do contêiner do Railway). Um pré-requisito que o CEO não consegue executar
// não é requisito, é intenção. É o mesmo buraco que custou um dia em 07/08 com
// os links do portal.
//
// As duas metades, que é o que impede este teste de virar decoração:
//   ⛔ METADE 1 — sem credencial, 401/403 e **nada gravado**. Sem `CRON_SECRET`
//      no ambiente e sem sessão, a porta não abre.
//   ✅ METADE 2 — com credencial, o relatório sai de verdade: o número que
//      faltava (`deixadasDeFora`) e o motivo linha a linha. Sem esta metade,
//      "fechar a porta" poderia ser "recusar sempre", que passa na metade 1 e
//      não entrega relatório nenhum.
//
// A terceira propriedade, de segurança e não de recurso: **GET não grava**. O
// efeito de um GET com escrita aqui seria carimbar dono em linha de cliente
// pagante por retry de proxy ou pré-carregador de link.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const backfill = vi.fn();
const requireSession = vi.fn();

vi.mock("@/lib/agency/portal/backfill-de-carimbo", () => ({
  backfillDeCarimbo: (...a: unknown[]) => backfill(...a),
}));
vi.mock("@/lib/auth/api-guard", () => ({
  requireSession: (...a: unknown[]) => requireSession(...a),
}));

const { GET, POST } = await import("@/app/api/admin/backfill-de-carimbo/route");

const SEGREDO = "segredo-de-teste-bem-comprido";
const URL_DA_ROTA = "https://www.diolidigital.com.br/api/admin/backfill-de-carimbo";

const RELATORIO = {
  medidoEm: "2026-08-16T00:00:00.000Z",
  aplicou: false,
  solicitacoes: 3,
  carimbadas: 2,
  deixadasDeFora: 1,
  comAtencao: 1,
  totalDeLinhasCarimbadas: 41,
  linhas: [
    {
      clientRequestId: "req-foocci", clientId: "cli-foocci",
      carimbadas: { mensagens: 40, aprovacoes: 1, artefatos: 0, pecas: 0 },
      atencao: "esta solicitação tem token de portal SEM dono escrito — confirme antes de aplicar.",
    },
    { clientRequestId: "req-city", clientId: "cli-city", carimbadas: { mensagens: 0, aprovacoes: 0, artefatos: 0, pecas: 0 } },
    {
      clientRequestId: "req-ambigua", clientId: "cli-b", carimbadas: { mensagens: 0, aprovacoes: 0, artefatos: 0, pecas: 0 },
      deixadaDeFora: "esta solicitação tem registro carimbado para OUTRO cliente — precisa de decisão humana.",
    },
  ],
};

function requisicao(segredo?: string | null) {
  const cabecalhos: Record<string, string> = {};
  if (segredo) cabecalhos.authorization = `Bearer ${segredo}`;
  return new NextRequest(URL_DA_ROTA, { headers: cabecalhos });
}

/** Sessão de navegador NEGADA — é o estado de quem não fez login. */
function semSessao() {
  requireSession.mockResolvedValue({
    error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  backfill.mockResolvedValue(RELATORIO);
  semSessao();
  process.env.CRON_SECRET = SEGREDO;
});
afterEach(() => { delete process.env.CRON_SECRET; });

describe("⛔ METADE 1 — sem credencial, nada roda e NADA é gravado", () => {
  it("GET sem cabeçalho e sem sessão: recusa, e o backfill sequer é chamado", async () => {
    const r = await GET(requisicao(null));
    expect(r.status).toBe(401);
    expect(backfill).not.toHaveBeenCalled();
  });

  it("POST sem credencial NÃO grava — a trava vem ANTES da apuração", async () => {
    const r = await POST(requisicao(null));
    expect(r.status).toBe(401);
    // O que importa não é só o status: é que a função que ESCREVE no banco de
    // clientes pagantes nunca chegou a ser chamada.
    expect(backfill).not.toHaveBeenCalled();
  });

  it("segredo ERRADO (mesmo tamanho) é recusado", async () => {
    const r = await POST(requisicao("segredo-errado-de-igual-tam"));
    expect(r.status).toBe(401);
    expect(backfill).not.toHaveBeenCalled();
  });

  it("CRON_SECRET AUSENTE do ambiente não ABRE a porta — cai na sessão", async () => {
    delete process.env.CRON_SECRET;
    for (const segredo of [null, "qualquer-coisa"]) {
      vi.clearAllMocks(); backfill.mockResolvedValue(RELATORIO); semSessao();
      const r = await POST(requisicao(segredo));
      expect(r.status).toBe(401);
      expect(backfill).not.toHaveBeenCalled();
    }
  });
});

describe("✅ METADE 2 — com credencial, o relatório sai de verdade", () => {
  it("GET devolve o número que faltava e o MOTIVO de cada exclusão", async () => {
    const r = await GET(requisicao(SEGREDO));
    expect(r.status).toBe(200);
    const corpo = await r.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.deixadasDeFora).toBe(1);
    expect(corpo.totalDeLinhasCarimbadas).toBe(41);
    // A linha excluída NÃO some do relatório: sumir leria como "está tudo
    // resolvido", e é justamente essa a lista de trabalho humano que sobra.
    const fora = corpo.linhas.find((l: { clientRequestId: string }) => l.clientRequestId === "req-ambigua");
    expect(fora.deixadaDeFora).toContain("decisão humana");
    expect(corpo.leiaAssim.numeroPrincipal).toBe("deixadasDeFora");
    // A ressalva também não some: é ela que faz a curadoria existir. Sem esta
    // asserção, a rota podia devolver `comAtencao` e nunca dizer o que fazer
    // com ele — número sem instrução é número que ninguém usa.
    expect(corpo.comAtencao).toBe(1);
    expect(corpo.leiaAssim.antesDeAplicar).toContain("atencao");
  });

  it("sessão master (sem segredo) também abre — é o caminho do CEO no navegador", async () => {
    requireSession.mockResolvedValue({ error: null });
    const r = await GET(requisicao(null));
    expect(r.status).toBe(200);
    expect(backfill).toHaveBeenCalledWith(false);
  });
});

describe("🔒 O VERBO É A TRAVA — GET não grava", () => {
  it("GET chama o backfill em modo ENSAIO", async () => {
    await GET(requisicao(SEGREDO));
    expect(backfill).toHaveBeenCalledWith(false);
  });

  it("POST é o único que aplica", async () => {
    backfill.mockResolvedValue({ ...RELATORIO, aplicou: true });
    const r = await POST(requisicao(SEGREDO));
    expect(r.status).toBe(200);
    expect(backfill).toHaveBeenCalledWith(true);
    expect((await r.json()).leiaAssim.comoAplicar).toContain("APLICADO");
  });
});

describe("🚨 FALHA NÃO VIRA ZERO", () => {
  it("banco fora do ar devolve 500 — nunca 'nada para carimbar'", async () => {
    backfill.mockRejectedValue(new Error("sem conexão"));
    const r = await GET(requisicao(SEGREDO));
    expect(r.status).toBe(500);
    const corpo = await r.json();
    // "não consegui apurar" e "não há nada" são fatos OPOSTOS, e o segundo
    // liberaria o deploy por engano.
    expect(corpo.ok).toBeUndefined();
    expect(corpo.deixadasDeFora).toBeUndefined();
    expect(corpo.error).toContain("sem conexão");
  });
});

describe("🧩 UMA REGRA SÓ — a rota e o script chamam o mesmo módulo", () => {
  it("o script não reimplementa o carimbo retroativo", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = readFileSync(resolve(__dirname, "../../scripts/backfill-carimbo-do-portal.mts"), "utf8");
    // Duas implementações do mesmo carimbo divergem — e a que divergisse
    // gravaria dono em linha de cliente com critério diferente da outra.
    expect(fonte).not.toContain("updateMany");
    expect(fonte).toContain("backfillDeCarimbo");
  });

  it("a rota também não reimplementa: ela só chama o módulo", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = readFileSync(
      resolve(__dirname, "../../app/api/admin/backfill-de-carimbo/route.ts"), "utf8",
    );
    expect(fonte).not.toContain("updateMany");
    expect(fonte).not.toContain("prisma.");
  });
});
