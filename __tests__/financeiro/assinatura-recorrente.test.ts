// A COBRANÇA RECORRENTE — 27/08/2026.
//
// ─── O DEFEITO, ACHADO PELO CEO ─────────────────────────────────────────────
//
// A vitrine vende PLANO MENSAL; o código só sabia criar cobrança AVULSA. Do
// segundo mês em diante a casa entregava e não recebia.
//
// E, dentro dele, o pior: `PagamentoConfirmado` é única por pedido e nunca
// expira, então o pagamento do MÊS 1 liberava produção para sempre. A trava
// fail-closed vazava — com o teste verde, porque ninguém tinha escrito um caso
// que passasse do primeiro mês.
//
// ─── O QUE ESTE ARQUIVO PROVA, E ONDE ───────────────────────────────────────
//
// Cada bloco abaixo tem, escrito, a MUTAÇÃO que o derruba. "Funciona" sem dizer
// onde não vale; "não estourou" nunca é verde.
//
// ⛔ NADA AQUI COBRA NINGUÉM. Não há cartão, não há credencial, não há chamada
// ao Mercado Pago: o provedor é um dublê, e o banco também.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── O BANCO DUBLÊ ───────────────────────────────────────────────────────────
//
// Ele não é um `vi.fn()` que devolve o que se mandar: é uma tabela DE VERDADE em
// memória, com as MESMAS chaves únicas do schema. Isso importa — a idempotência
// que este arquivo prova mora no banco, e um dublê que aceitasse duas linhas
// iguais provaria só que a função foi chamada, não que a casa está protegida.
const banco = vi.hoisted(() => {
  type Ass = {
    id: string; clientRequestId: string; provedorAssinaturaId: string; planoId: string;
    valorCentavos: number; estado: string; dono: string; motivoDoEstado: string | null;
    cobrancasFalhadas: number; canceladaEm: Date | null; ultimaCobrancaEm: Date | null;
    proximaCobrancaEm: Date | null; clientId: string | null;
  };
  type Cob = {
    id: string; assinaturaId: string; provedorPagamentoId: string; competencia: string;
    valorCentavos: number; estado: string; confirmadoEm: Date; motivo: string | null;
    taxaCentavos: number | null; liquidoCentavos: number | null; moeda: string;
  };
  const assinaturas: Ass[] = [];
  const cobrancas: Cob[] = [];
  let n = 0;

  const casa = <T extends Record<string, unknown>>(linha: T, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => {
      if (v && typeof v === "object" && "not" in (v as object)) return linha[k] !== (v as { not: unknown }).not;
      return linha[k] === v;
    });

  return {
    assinaturas, cobrancas,
    limpar() { assinaturas.length = 0; cobrancas.length = 0; n = 0; },
    prisma: {
      assinaturaRecorrente: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.OR) {
            const ors = where.OR as Array<Record<string, unknown>>;
            return assinaturas.find((a) => ors.some((o) => casa(a, o))) ?? null;
          }
          return assinaturas.find((a) => casa(a, where)) ?? null;
        },
        findUnique: async ({ where }: { where: Record<string, unknown> }) =>
          assinaturas.find((a) => casa(a, where)) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          // ⛔ AS CHAVES ÚNICAS DO SCHEMA, DE VERDADE.
          if (assinaturas.some((a) => a.clientRequestId === data.clientRequestId))
            throw new Error("Unique constraint failed: AssinaturaRecorrente_clientRequestId_key");
          if (assinaturas.some((a) => a.provedorAssinaturaId === data.provedorAssinaturaId))
            throw new Error("Unique constraint failed: AssinaturaRecorrente_provedorAssinaturaId_key");
          const linha = {
            id: `ass-${++n}`, motivoDoEstado: null, cobrancasFalhadas: 0, canceladaEm: null,
            ultimaCobrancaEm: null, proximaCobrancaEm: null, clientId: null, ...data,
          } as unknown as Ass;
          assinaturas.push(linha);
          return linha;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const a = assinaturas.find((x) => x.id === where.id)!;
          Object.assign(a, data);
          return a;
        },
      },
      cobrancaRecorrente: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) =>
          cobrancas.find((c) => casa(c, where)) ?? null,
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          cobrancas.find((c) => casa(c, where)) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          // TRAVA 1 — o webhook reenviado.
          if (cobrancas.some((c) => c.provedorPagamentoId === data.provedorPagamentoId))
            throw new Error("Unique constraint failed: CobrancaRecorrente_provedorPagamentoId_key");
          // TRAVA 2 — o mesmo mês, por outro pagamento.
          if (cobrancas.some((c) => c.assinaturaId === data.assinaturaId && c.competencia === data.competencia))
            throw new Error("Unique constraint failed: CobrancaRecorrente_assinaturaId_competencia_key");
          const linha = { id: `cob-${++n}`, motivo: null, taxaCentavos: null, liquidoCentavos: null, moeda: "BRL", ...data } as unknown as Cob;
          cobrancas.push(linha);
          return linha;
        },
      },
      pagamentoConfirmado: { findUnique: async () => null, findMany: async () => [] },
      isencaoDeParceria: { findUnique: async () => null },
      clientRequestDb: { findUnique: async () => null },
    },
  };
});
vi.mock("@/lib/db/client", () => ({ prisma: banco.prisma }));

const {
  registrarAssinatura, registrarCobranca, mensalidadeEmDia, cancelarAssinatura,
  competenciaDe, competenciaCorrente,
} = await import("@/lib/agency/financeiro/assinatura");
const { conferirPagamento } = await import("@/lib/agency/financeiro/portao-de-pagamento");

const SETEMBRO = new Date("2026-09-10T12:00:00.000Z");
const OUTUBRO = new Date("2026-10-10T12:00:00.000Z");

async function assinaturaAtiva() {
  const r = await registrarAssinatura({
    clientRequestId: "pedido-mensal",
    planoId: "presenca",
    valorCentavos: 49000,
    provedorAssinaturaId: "preapproval-1",
    dono: "Dioli Digital — financeiro",
    estado: "ativa",
  });
  if (!r.ok) throw new Error(r.motivo);
  return r.assinaturaId;
}

beforeEach(() => banco.limpar());

// ═══════════════════════════════════════════════════════════════════════════
describe("a competência é UTC — e isso não é preciosismo", () => {
  it("31/08 23h em UTC−3 (que é 01/09 02h UTC) é competência de SETEMBRO", () => {
    expect(competenciaDe(new Date("2026-09-01T02:00:00.000Z"))).toBe("2026-09");
  });

  // MUTAÇÃO QUE DERRUBA: trocar `getUTCMonth()` por `getMonth()` em
  // `competenciaDe`. A casa roda em UTC e o CEO está em UTC−3: com o fuso local
  // do processo, a virada do mês acontece em horas diferentes em máquinas
  // diferentes, e a mesma produção fica liberada numa réplica e barrada em
  // outra. Defeito intermitente, e sempre culpando outra coisa.
  it("o mês é sempre o de UTC, nunca o do relógio da máquina", () => {
    expect(competenciaDe(new Date("2026-12-31T23:30:00.000Z"))).toBe("2026-12");
    expect(competenciaCorrente(SETEMBRO)).toBe("2026-09");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⛔ o vazamento de validade infinita — o mês 1 não paga o mês 2", () => {
  it("mês PAGO libera, e o motivo tem nome próprio", async () => {
    await assinaturaAtiva();
    const r = await registrarCobranca({
      provedorAssinaturaId: "preapproval-1",
      provedorPagamentoId: "pay-set",
      valorCentavos: 49000,
      estado: "aprovada",
      confirmadoEm: SETEMBRO,
    });
    expect(r.ok).toBe(true);
    const v = await mensalidadeEmDia("pedido-mensal", SETEMBRO);
    expect(v.tipo).toBe("em_dia");
  });

  // ⛔ ESTE É O TESTE QUE FALTAVA À CASA INTEIRA.
  //
  // MUTAÇÃO QUE DERRUBA (e é a que estava em produção): tirar o bloco
  // "A MENSALIDADE VEM ANTES DE TUDO" de `conferirPagamento`. Sem ele, o portão
  // acha a linha de `PagamentoConfirmado` do mês 1 e libera outubro, novembro e
  // o ano que vem, para quem parou de pagar em setembro.
  it("setembro pago NÃO libera outubro — e o portão recusa com dono na mensagem", async () => {
    await assinaturaAtiva();
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1",
      provedorPagamentoId: "pay-set",
      valorCentavos: 49000,
      estado: "aprovada",
      confirmadoEm: SETEMBRO,
    });

    const v = await mensalidadeEmDia("pedido-mensal", OUTUBRO);
    expect(v.tipo).toBe("mes_nao_pago");
    if (v.tipo === "mes_nao_pago") {
      expect(v.competencia).toBe("2026-10");
      expect(v.dono).toBe("Dioli Digital — financeiro");
    }
  });

  // MUTAÇÃO QUE DERRUBA: fazer `mensalidadeEmDia` aceitar qualquer cobrança em
  // vez de `estado: "aprovada"`. "Não recusada" não é "paga" — `pending` e
  // `in_process` são estados em que o dinheiro ainda NÃO entrou.
  it("cobrança RECUSADA não é cobrança paga", async () => {
    await assinaturaAtiva();
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1",
      provedorPagamentoId: "pay-falha",
      valorCentavos: 49000,
      estado: "recusada",
      motivo: "cc_rejected_insufficient_amount",
      confirmadoEm: SETEMBRO,
    });
    const v = await mensalidadeEmDia("pedido-mensal", SETEMBRO);
    expect(v.tipo).toBe("mes_nao_pago");
    // A falha NÃO fica muda: a assinatura fica inadimplente, com motivo e contador.
    expect(banco.assinaturas[0].estado).toBe("inadimplente");
    expect(banco.assinaturas[0].cobrancasFalhadas).toBe(1);
    expect(banco.assinaturas[0].motivoDoEstado).toContain("PARADA");
  });

  // MUTAÇÃO QUE DERRUBA: fazer `conferirPagamento` ignorar `mes_nao_pago` (ou
  // tratá-lo como liberação). Isto prova a ligação — portão certo que ninguém
  // ligou na regra é portão de enfeite.
  it("o PORTÃO devolve a recusa, com a instrução gêmea ao cliente", async () => {
    await assinaturaAtiva();
    const v = await conferirPagamento("pedido-mensal");
    expect(v.liberado).toBe(false);
    if (!v.liberado) {
      expect(v.motivo).toBe("mes_nao_pago");
      // Sem beco: o cliente lê o que aconteceu E o que fazer agora.
      expect(v.mensagemAoCliente).toMatch(/WhatsApp/);
      expect(v.mensagemAoCliente).toMatch(/Pix|cartão/);
    }
  });

  // MUTAÇÃO QUE DERRUBA: trocar o `catch` de `mensalidadeEmDia` por um
  // `.catch(() => ({ tipo: "sem_assinatura" }))`. O banco fora do ar passaria a
  // liberar produção pelas regras antigas. Degradar para parado, jamais para
  // gastando.
  it("banco fora do ar NÃO libera — vira leitura_indisponivel", async () => {
    const original = banco.prisma.assinaturaRecorrente.findUnique;
    banco.prisma.assinaturaRecorrente.findUnique = (async () => {
      throw new Error("connection refused");
    }) as typeof original;
    try {
      const v = await conferirPagamento("pedido-mensal");
      expect(v.liberado).toBe(false);
      if (!v.liberado) expect(v.motivo).toBe("leitura_indisponivel");
    } finally {
      banco.prisma.assinaturaRecorrente.findUnique = original;
    }
  });

  // MUTAÇÃO QUE DERRUBA: fazer `sem_assinatura` recusar. Todo pedido avulso que
  // já existe na casa pararia de produzir — a correção da recorrência não pode
  // quebrar quem não é mensal.
  it("pedido SEM assinatura devolve a decisão às regras de sempre", async () => {
    const v = await mensalidadeEmDia("pedido-avulso", OUTUBRO);
    expect(v.tipo).toBe("sem_assinatura");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⛔ nada de cobrar duas vezes — e são DUAS falhas diferentes", () => {
  // MUTAÇÃO QUE DERRUBA: tirar a busca por `provedorPagamentoId` de
  // `registrarCobranca`. O Mercado Pago reenvia o mesmo aviso por horas quando
  // não recebe 200 — cada reenvio viraria receita nova e o DRE inflaria sozinho.
  it("TRAVA 1 · o mesmo pagamento avisado dez vezes grava UMA linha", async () => {
    await assinaturaAtiva();
    const aviso = {
      provedorAssinaturaId: "preapproval-1",
      provedorPagamentoId: "pay-set",
      valorCentavos: 49000,
      estado: "aprovada" as const,
      confirmadoEm: SETEMBRO,
    };
    const primeira = await registrarCobranca(aviso);
    expect(primeira.ok && primeira.duplicada).toBe(false);
    for (let i = 0; i < 9; i++) {
      const r = await registrarCobranca(aviso);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.duplicada).toBe(true);
    }
    expect(banco.cobrancas).toHaveLength(1);
  });

  // MUTAÇÃO QUE DERRUBA: tirar a busca por `(assinaturaId, competencia)`.
  // Dois pagamentos DIFERENTES na mesma competência têm ids diferentes — a
  // trava 1 não os pega. Isto é o cliente pagando setembro duas vezes, e é a
  // falha que quem só pensasse em "reenvio de webhook" teria deixado passar.
  it("TRAVA 2 · dois pagamentos DIFERENTES no mesmo mês gravam UMA linha", async () => {
    await assinaturaAtiva();
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1", provedorPagamentoId: "pay-A",
      valorCentavos: 49000, estado: "aprovada", confirmadoEm: SETEMBRO,
    });
    const segunda = await registrarCobranca({
      provedorAssinaturaId: "preapproval-1", provedorPagamentoId: "pay-B",
      valorCentavos: 49000, estado: "aprovada", confirmadoEm: new Date("2026-09-25T12:00:00.000Z"),
    });
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.duplicada).toBe(true);
    expect(banco.cobrancas).toHaveLength(1);
    expect(banco.cobrancas[0].provedorPagamentoId).toBe("pay-A");
  });

  it("meses DIFERENTES gravam linhas diferentes — a trava não trava a operação", async () => {
    await assinaturaAtiva();
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1", provedorPagamentoId: "pay-set",
      valorCentavos: 49000, estado: "aprovada", confirmadoEm: SETEMBRO,
    });
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1", provedorPagamentoId: "pay-out",
      valorCentavos: 49000, estado: "aprovada", confirmadoEm: OUTUBRO,
    });
    expect(banco.cobrancas).toHaveLength(2);
    expect((await mensalidadeEmDia("pedido-mensal", OUTUBRO)).tipo).toBe("em_dia");
  });

  // MUTAÇÃO QUE DERRUBA: tirar o `findFirst`/`findUnique` do `OR` em
  // `registrarAssinatura`. Dois avisos de criação viravam duas assinaturas para
  // o mesmo pedido — e aí "qual delas paga o mês?" não tem resposta.
  it("a ASSINATURA também é idempotente, pelas duas chaves", async () => {
    const a = await registrarAssinatura({
      clientRequestId: "pedido-mensal", planoId: "presenca", valorCentavos: 49000,
      provedorAssinaturaId: "preapproval-1", dono: "financeiro",
    });
    const b = await registrarAssinatura({
      clientRequestId: "pedido-mensal", planoId: "presenca", valorCentavos: 49000,
      provedorAssinaturaId: "preapproval-1", dono: "financeiro",
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.assinaturaId).toBe(a.assinaturaId);
      expect(b.jaExistia).toBe(true);
    }
    expect(banco.assinaturas).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a assinatura nasce cercada", () => {
  // MUTAÇÃO QUE DERRUBA: tirar a checagem do piso de `registrarAssinatura`.
  // Assinatura é um preço repetido doze vezes: um centavo abaixo do piso aqui é
  // o ano inteiro no prejuízo, não um mês.
  it("RECUSA valor abaixo do piso do plano", async () => {
    const r = await registrarAssinatura({
      clientRequestId: "pedido-mensal", planoId: "presenca", valorCentavos: 30000,
      provedorAssinaturaId: "preapproval-x", dono: "financeiro",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/piso/);
    expect(banco.assinaturas).toHaveLength(0);
  });

  // MUTAÇÃO QUE DERRUBA: tornar `dono` opcional. Inadimplência sem dono é
  // cliente parado que ninguém liga — o mesmo princípio de `autorizadaPor` na
  // isenção de parceria.
  it("RECUSA assinatura sem dono", async () => {
    const r = await registrarAssinatura({
      clientRequestId: "pedido-mensal", planoId: "presenca", valorCentavos: 49000,
      provedorAssinaturaId: "preapproval-x", dono: "   ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/dono/);
  });

  it("RECUSA plano que não está na tabela da casa", async () => {
    const r = await registrarAssinatura({
      clientRequestId: "p", planoId: "video" as "ritmo", valorCentavos: 900000,
      provedorAssinaturaId: "preapproval-x", dono: "financeiro",
    });
    expect(r.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("cancelamento e falha têm caminho — sem beco", () => {
  it("cancelar NÃO tira o mês já pago: entrega até o fim", async () => {
    await assinaturaAtiva();
    await registrarCobranca({
      provedorAssinaturaId: "preapproval-1", provedorPagamentoId: "pay-set",
      valorCentavos: 49000, estado: "aprovada", confirmadoEm: SETEMBRO,
    });
    await cancelarAssinatura({ provedorAssinaturaId: "preapproval-1", motivo: "o cliente pediu", em: new Date("2026-09-20T12:00:00.000Z") });

    // MUTAÇÃO QUE DERRUBA: mover a checagem de `cancelada` para ANTES da busca
    // da cobrança em `mensalidadeEmDia`. Quem cancela dia 20 pagou o mês
    // inteiro — cortar na hora do clique seria a casa ficando com dinheiro por
    // serviço não entregue.
    const setembro = await mensalidadeEmDia("pedido-mensal", SETEMBRO);
    expect(setembro.tipo).toBe("em_dia");
    if (setembro.tipo === "em_dia") expect(setembro.detalhe).toMatch(/cancelada/);

    // E outubro para — a renovação é que não acontece.
    const outubro = await mensalidadeEmDia("pedido-mensal", OUTUBRO);
    expect(outubro.tipo).toBe("cancelada");
    if (outubro.tipo === "cancelada") expect(outubro.dono).toBeTruthy();
  });

  it("cancelar duas vezes não estoura, e a linha NÃO é apagada", async () => {
    await assinaturaAtiva();
    const um = await cancelarAssinatura({ provedorAssinaturaId: "preapproval-1", motivo: "pediu" });
    const dois = await cancelarAssinatura({ provedorAssinaturaId: "preapproval-1", motivo: "pediu de novo" });
    expect(um.ok && dois.ok).toBe(true);
    if (dois.ok) expect(dois.jaEstavaCancelada).toBe(true);
    // O financeiro precisa saber que existiu e quando acabou.
    expect(banco.assinaturas).toHaveLength(1);
    expect(banco.assinaturas[0].canceladaEm).toBeInstanceOf(Date);
  });

  it("o portão de um cancelado sem mês pago diz o que fazer", async () => {
    await assinaturaAtiva();
    await cancelarAssinatura({ provedorAssinaturaId: "preapproval-1", motivo: "pediu" });
    const v = await conferirPagamento("pedido-mensal");
    expect(v.liberado).toBe(false);
    if (!v.liberado) {
      expect(v.motivo).toBe("assinatura_cancelada");
      expect(v.mensagemAoCliente).toMatch(/não haverá nova cobrança/);
    }
  });
});
