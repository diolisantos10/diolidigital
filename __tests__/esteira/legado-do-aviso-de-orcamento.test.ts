// O BALDE DOS LEGADOS — pedidos que já falharam antes deste deploy, e
// continuavam invisíveis. 16/08/2026.
//
// Auditoria: `a2d06fb1` já estava em produção antes de `avisoOrcamentoStatus`
// existir. Todo pedido que o relógio processou naquela janela saiu de `new`
// (está em `proposal_pending`) com `avisoOrcamentoStatus = NULL` — não porque
// ninguém tentou avisar, mas porque a coluna que registraria a tentativa
// ainda não existia. `reenviarAvisosQueFalharam` nunca alcança essas linhas:
// sua consulta é `WHERE avisoOrcamentoStatus IN ('falhou', 'skipped')`, e
// `NULL` não é nenhum dos dois.
//
// `NULL` NÃO é "falhou" — é "não sabemos". Por isso vira um balde à parte
// (`contarAvisosLegados` / `reenviarAvisosLegados`), nunca um quinto status
// gravado por palpite, e o reenvio dele é sempre um ato deliberado e
// separado — nunca o comportamento padrão. Este arquivo prova as duas
// metades, com `fetch` da Resend inteiramente mockado — nenhum e-mail real
// sai daqui.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  portalAccess: { findFirst: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import {
  contarAvisosLegados,
  reenviarAvisosLegados,
  reenviarAvisosQueFalharam,
} from "@/lib/agency/esteira/orcamento-do-briefing";

// `{ casaInteira: true }` preserva o comportamento que este arquivo sempre
// testou (sem filtro de workspace) — a fronteira de posse tem teste dedicado
// em `avisos-de-orcamento-workspace.test.ts`, incluído em 16/08/2026 na
// devolução do `seguranca`.
const CASA_INTEIRA = { casaInteira: true as const };

const ESTIMATIVA = {
  contato: { nome: "Dioli", email: "ceo@cityjobs.com.br", whatsapp: null },
  estimate: { totalMin: 1390, totalMax: 2590, items: [{ label: "Social media" }] },
};

function legadoComEmail(over: Record<string, unknown> = {}) {
  return {
    id: "req-legado",
    businessName: "CityJobs",
    briefingJson: JSON.stringify(ESTIMATIVA),
    sdrHandoffJson: null,
    ...over,
  };
}

function legadoSemEmail(over: Record<string, unknown> = {}) {
  return {
    id: "req-sem-canal",
    businessName: "Sem Canal LTDA",
    briefingJson: JSON.stringify({
      contato: { nome: "Fulano", email: null, whatsapp: null },
      estimate: ESTIMATIVA.estimate,
    }),
    sdrHandoffJson: null,
    ...over,
  };
}

/** Roteia a resposta do `$queryRawUnsafe` mockado pelo texto do SQL — o jeito
 *  de simular, num teste de unidade, que a query dos legados (`IS NULL`) e a
 *  query do reenvio normal (`IN ('falhou', 'skipped')`) são consultas
 *  DIFERENTES contra o mesmo banco, cada uma enxergando um subconjunto. */
function roteiaPorSql(mapa: { legados?: unknown[]; falhouOuSkipped?: unknown[] }) {
  db.$queryRawUnsafe.mockImplementation((sql: string) => {
    if (sql.includes("avisoOrcamentoStatus IS NULL")) return Promise.resolve(mapa.legados ?? []);
    if (sql.includes("avisoOrcamentoStatus IN")) return Promise.resolve(mapa.falhouOuSkipped ?? []);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  db.portalAccess.findFirst.mockReset();
  db.portalAccess.findFirst.mockResolvedValue(null);
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue([]);
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(1);
  email.sendEmail.mockReset();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_legado" });
});

describe("a query dos legados nunca é a query do reenvio normal, nem alcança quem já foi avisado", () => {
  it("`contarAvisosLegados` busca `status='proposal_pending' AND avisoOrcamentoStatus IS NULL` — nunca 'avisado', 'falhou', 'skipped' ou 'sem_canal'", async () => {
    await contarAvisosLegados(CASA_INTEIRA);

    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = db.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toMatch(/status = 'proposal_pending'/);
    expect(sql).toMatch(/avisoOrcamentoStatus IS NULL/);
    expect(sql).not.toMatch(/'avisado'/);
    expect(sql).not.toMatch(/'falhou'/);
    expect(sql).not.toMatch(/'skipped'/);
    expect(sql).not.toMatch(/'sem_canal'/);
  });

  it("`reenviarAvisosLegados` usa a MESMA consulta que `contarAvisosLegados` — o que se conta é o que se reenvia", async () => {
    await reenviarAvisosLegados(CASA_INTEIRA);

    const sql = db.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toMatch(/avisoOrcamentoStatus IS NULL/);
  });
});

describe("⛔ pedido legado NÃO é alcançado pelo reenvio padrão — o opt-in desligado não o toca", () => {
  it("aparece no balde de legados, mas `reenviarAvisosQueFalharam` (a rota chama isto por padrão) não manda nada para ele", async () => {
    roteiaPorSql({ legados: [legadoComEmail()], falhouOuSkipped: [] });

    const balde = await contarAvisosLegados(CASA_INTEIRA);
    expect(balde.total).toBe(1);
    expect(balde.itens[0]).toMatchObject({ id: "req-legado", contatoEmail: "ceo@cityjobs.com.br" });

    // A função que a rota chama SEM o campo `incluirLegados` é esta — e ela
    // não vê o legado porque a consulta dela é outra (`IN ('falhou',
    // 'skipped')`, roteada acima para devolver lista vazia).
    const reenvioPadrao = await reenviarAvisosQueFalharam(CASA_INTEIRA);
    expect(reenvioPadrao.reenviados).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe("✅ com o opt-in ligado, o legado É reenviado — e a ambiguidade se autocura", () => {
  it("`reenviarAvisosLegados` manda o e-mail e grava 'avisado'", async () => {
    roteiaPorSql({ legados: [legadoComEmail()] });

    const r = await reenviarAvisosLegados(CASA_INTEIRA);

    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("ceo@cityjobs.com.br");

    // A gravação usa o MESMO `gravarResultadoDoAviso` da entrega original —
    // sem um segundo caminho de escrita para o legado.
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(db.$executeRawUnsafe.mock.calls[0][1]).toBe("avisado");
  });

  it("depois de reenviado, o pedido some do balde — status deixou de ser NULL", async () => {
    // Primeira leitura: o legado está lá, o opt-in reenvia com sucesso.
    roteiaPorSql({ legados: [legadoComEmail()] });
    const primeira = await reenviarAvisosLegados(CASA_INTEIRA);
    expect(primeira.reenviados).toBe(1);

    // A gravação de 'avisado' (provada acima) é exatamente o que faria a
    // consulta real `avisoOrcamentoStatus IS NULL` deixar de devolver esta
    // linha. Simulamos esse efeito devolvendo lista vazia na leitura
    // seguinte, como o banco devolveria de verdade.
    roteiaPorSql({ legados: [] });
    const balde = await contarAvisosLegados(CASA_INTEIRA);

    expect(balde.total).toBe(0);
    // Só o e-mail da primeira tentativa existiu.
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("⛔ sem e-mail não é legado, é `sem_canal` — não entra no balde", () => {
  it("`contarAvisosLegados` filtra fora quem não tem e-mail no leitor único", async () => {
    roteiaPorSql({ legados: [legadoSemEmail()] });

    const balde = await contarAvisosLegados(CASA_INTEIRA);
    expect(balde.total).toBe(0);
    expect(balde.itens).toHaveLength(0);
  });

  it("`reenviarAvisosLegados` não tenta mandar nada para quem não tem e-mail", async () => {
    roteiaPorSql({ legados: [legadoSemEmail()] });

    const r = await reenviarAvisosLegados(CASA_INTEIRA);
    expect(r.reenviados).toBe(0);
    expect(r.aindaFalhando).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("um lote misto só reenvia quem tem e-mail — o outro fica de fora, sem erro", async () => {
    roteiaPorSql({ legados: [legadoSemEmail({ id: "sem-canal-1" }), legadoComEmail({ id: "com-email-1" })] });

    const r = await reenviarAvisosLegados(CASA_INTEIRA);
    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("ceo@cityjobs.com.br");
  });
});

describe("nunca inventa valor para destravar um legado", () => {
  it("legado COM e-mail mas sem estimativa utilizável no briefing não é reenviado", async () => {
    // Contato presente (passa o filtro do balde) — só o `estimate` está
    // ausente, então não há número seguro para reenviar.
    roteiaPorSql({
      legados: [
        legadoComEmail({
          briefingJson: JSON.stringify({
            contato: { nome: "Dioli", email: "ceo@cityjobs.com.br", whatsapp: null },
            scope: {},
          }),
        }),
      ],
    });

    const r = await reenviarAvisosLegados(CASA_INTEIRA);
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(r.reenviados).toBe(0);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("resiliência", () => {
  it("a consulta de legados falhando vira `falhas`, nunca lança", async () => {
    db.$queryRawUnsafe.mockRejectedValueOnce(new Error("banco fora do ar"));
    const r = await reenviarAvisosLegados(CASA_INTEIRA);

    expect(r.falhas).toHaveLength(1);
    expect(r.reenviados).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("`contarAvisosLegados` propaga o erro (quem chama — a rota — decide o formato de 'não consegui contar')", async () => {
    db.$queryRawUnsafe.mockRejectedValueOnce(new Error("banco fora do ar"));
    await expect(contarAvisosLegados(CASA_INTEIRA)).rejects.toThrow("banco fora do ar");
  });
});
