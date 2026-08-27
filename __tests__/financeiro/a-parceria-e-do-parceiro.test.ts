// A PARCERIA É DO PARCEIRO — e é isto que rompe o nó circular.
//
// ═══ O NÓ, MEDIDO EM QUATRO PONTOS (27/08/2026) ═════════════════════════════
//
//   1. `conceder-isencao.ts` → `if (!clientRequestId) recusar("sem_pedido")`
//   2. `portao-de-pagamento.ts` → `isencaoDeParceria.findUnique({ clientRequestId })`
//   3. `convite-de-parceria.ts` → recusava com `sem_isencao_viva`
//   4. `client-request-service.ts` → o pedido nasce do briefing
//
//       convite → isenção → pedido → briefing → (convite)
//
// A porta existia e NÃO PODIA SER ABERTA A PRIMEIRA VEZ: não havia como cunhar
// o link do primeiro parceiro. Sétima ocorrência de "trava sem fechadura", em
// forma de círculo.
//
// ⚠️ Precisão: o PEDIDO não ficava trancado — `budget_range` fecha com qualquer
// resposta. O que estava trancado era o CONVITE, e com ele o tratamento de
// parceiro.
//
// ═══ O QUE ESTE ARQUIVO PROVA ══════════════════════════════════════════════
//
//   1. O círculo está ROTO: cunha-se convite SEM pedido nenhum.
//   2. A autorização recusa tudo que a tornaria porta escancarada.
//   3. A isenção do pedido é DERIVADA — uma fonte só, e idempotente.
//   4. Fail-closed: sem parceria viva, cliente comum. Revogada/vencida idem.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  parceriaDoCliente: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  isencaoDeParceria: { findUnique: vi.fn(), create: vi.fn() },
  conviteDeParceria: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const {
  autorizarParceriaDoCliente, parceriaVivaDoCliente, revogarParceriaDoCliente,
  derivarIsencaoDoPedido,
} = await import("@/lib/agency/financeiro/parceria-do-parceiro");
const { cunharConviteDeParceria } = await import("@/lib/agency/comercial/convite-de-parceria");

const AGORA = new Date("2026-08-27T17:00:00.000Z");
const VENCE = new Date("2026-11-27T00:00:00.000Z");
const PASSADO = new Date("2026-08-01T00:00:00.000Z");

const VIVA = {
  id: "p1", clientId: "cli_foocci", autorizadaPor: "Dioli Santos (CEO), D-0B9",
  validaAte: VENCE, escopo: "Social Media — parceria de lançamento",
  pecasContratadas: 12, tetoDeIaCentavosUsd: 200, revogadaEm: null,
};

function autorizacaoBoa(over: Record<string, unknown> = {}) {
  return {
    clientId: "cli_foocci",
    autorizadaPor: "Dioli Santos (CEO), D-0B9",
    validaAte: VENCE,
    escopo: "Social Media — parceria de lançamento",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 200,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.parceriaDoCliente.findUnique.mockResolvedValue(null);
  db.parceriaDoCliente.upsert.mockImplementation(async ({ create }: never) => ({
    id: "p1", ...(create as Record<string, unknown>),
  }));
  db.conviteDeParceria.create.mockImplementation(async ({ data }: never) => ({
    token: (data as Record<string, string>).token,
    expiraEm: (data as Record<string, Date>).expiraEm,
    clientId: (data as Record<string, string>).clientId,
  }));
});

// ════════════════════════════════════════════════════════════════════════════
describe("⚠️ O CÍRCULO ESTÁ ROTO — a prova central deste arquivo", () => {
  it("cunha o convite do PRIMEIRO parceiro SEM pedido, SEM briefing e SEM isenção", async () => {
    // A parceria existe no nível do PARCEIRO. Não há `clientRequestId` em lugar
    // nenhum desta história — que é exatamente o que era impossível antes.
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);

    const r = await cunharConviteDeParceria(
      { clientId: "cli_foocci", criadoPor: "user_master", expiraEm: new Date("2026-09-10T00:00:00.000Z") },
      AGORA,
    );

    expect(r.ok).toBe(true);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Volte `autorizacaoViva` a ler `isencaoDeParceria` (que exige pedido) e a
    // linha fica VERMELHA: sem pedido não há isenção, e o convite do primeiro
    // parceiro volta a ser incunhável. O círculo se refecha.
    expect(db.isencaoDeParceria.findUnique).not.toHaveBeenCalled();
    expect(db.conviteDeParceria.create).toHaveBeenCalledTimes(1);
  });

  it("sem parceria viva, o convite continua sendo RECUSADO — o círculo rompeu, a trava não", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    const r = await cunharConviteDeParceria({ clientId: "cli_x", criadoPor: "user_master" }, AGORA);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.recusa).toBe("sem_parceria_viva");
    expect(db.conviteDeParceria.create).not.toHaveBeenCalled();
  });

  it("o convite não pode valer além da PARCERIA", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);
    const r = await cunharConviteDeParceria(
      { clientId: "cli_foocci", criadoPor: "user_master", expiraEm: new Date("2027-06-01T00:00:00.000Z") },
      AGORA,
    );
    expect(!r.ok && r.recusa).toBe("passa_da_parceria");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("autorizar: nenhuma ausência vira valor", () => {
  it("recusa sem dono nominal — parceria sem dono é buraco", async () => {
    const r = await autorizarParceriaDoCliente(autorizacaoBoa({ autorizadaPor: "  " }), AGORA);
    expect(!r.ok && r.recusa).toBe("sem_dono");
    expect(db.parceriaDoCliente.upsert).not.toHaveBeenCalled();
  });

  it("recusa sem escopo — sem escopo, a parceria cobre tudo", async () => {
    const r = await autorizarParceriaDoCliente(autorizacaoBoa({ escopo: "" }), AGORA);
    expect(!r.ok && r.recusa).toBe("sem_escopo");
  });

  it("recusa validade no passado e validade ilegível, com nomes DIFERENTES", async () => {
    expect((await autorizarParceriaDoCliente(autorizacaoBoa({ validaAte: PASSADO }), AGORA) as { recusa: string }).recusa)
      .toBe("validade_no_passado");
    expect((await autorizarParceriaDoCliente(autorizacaoBoa({ validaAte: "não é data" }), AGORA) as { recusa: string }).recusa)
      .toBe("validade_ilegivel");
  });

  it("⛔ recusa SEM TETO — teto ausente não vira zero, vira erro", async () => {
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Troque a conferência por `?? 0` e a linha fica VERMELHA: a omissão do
    // teto passaria a ser um teto de zero silencioso. Sem teto o parceiro come
    // o crédito do cliente pagante, que é finito e sem recarga automática.
    for (const teto of [undefined, null, "200", Number.NaN, -1, 1.5]) {
      const r = await autorizarParceriaDoCliente(autorizacaoBoa({ tetoDeIaCentavosUsd: teto }), AGORA);
      expect(!r.ok && r.recusa, String(teto)).toBe("teto_invalido");
    }
    // Zero é uma DECISÃO válida e explícita — e passa.
    expect((await autorizarParceriaDoCliente(autorizacaoBoa({ tetoDeIaCentavosUsd: 0 }), AGORA)).ok).toBe(true);
  });

  it("autoriza com tudo em ordem — e NUNCA cria pagamento", async () => {
    const r = await autorizarParceriaDoCliente(autorizacaoBoa(), AGORA);
    expect(r.ok).toBe(true);
    // ⛔ Parceria não é venda. Nenhum `PagamentoConfirmado`, nenhuma receita.
    // A margem negativa fica à vista: investimento se mede.
    expect(JSON.stringify(db)).not.toContain("pagamentoConfirmado");
  });

  it("recusa REESCREVER uma autorização viva com outros termos", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);
    const r = await autorizarParceriaDoCliente(autorizacaoBoa({ tetoDeIaCentavosUsd: 99999 }), AGORA);
    expect(!r.ok && r.recusa).toBe("ja_existe_com_outros_termos");
    expect(db.parceriaDoCliente.upsert).not.toHaveBeenCalled();
  });

  it("os MESMOS termos são idempotentes", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);
    const r = await autorizarParceriaDoCliente(autorizacaoBoa(), AGORA);
    expect(r.ok && r.jaExistia).toBe(true);
    expect(db.parceriaDoCliente.upsert).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("a parceria viva: fail-closed em todo ramo", () => {
  it("ausente, REVOGADA, VENCIDA e banco fora do ar → cliente comum", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    expect(await parceriaVivaDoCliente("cli_foocci", AGORA)).toBeNull();

    db.parceriaDoCliente.findUnique.mockResolvedValue({ ...VIVA, revogadaEm: AGORA });
    expect(await parceriaVivaDoCliente("cli_foocci", AGORA)).toBeNull();

    db.parceriaDoCliente.findUnique.mockResolvedValue({ ...VIVA, validaAte: PASSADO });
    expect(await parceriaVivaDoCliente("cli_foocci", AGORA)).toBeNull();

    // "Não sei" significa CLIENTE COMUM — nunca "trata como parceiro".
    db.parceriaDoCliente.findUnique.mockRejectedValue(new Error("db down"));
    expect(await parceriaVivaDoCliente("cli_foocci", AGORA)).toBeNull();
  });

  it("sem clientId nem toca o banco", async () => {
    expect(await parceriaVivaDoCliente(null, AGORA)).toBeNull();
    expect(await parceriaVivaDoCliente("  ", AGORA)).toBeNull();
    expect(db.parceriaDoCliente.findUnique).not.toHaveBeenCalled();
  });

  it("revogar é idempotente", async () => {
    db.parceriaDoCliente.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await revogarParceriaDoCliente("cli_foocci")).toBe(true);
    db.parceriaDoCliente.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await revogarParceriaDoCliente("cli_foocci")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("a isenção do pedido é DERIVADA — uma fonte só", () => {
  it("pedido de parceiro vivo: deriva com os MESMOS termos da autorização", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);
    db.isencaoDeParceria.findUnique.mockResolvedValue(null);
    db.isencaoDeParceria.create.mockResolvedValue({ id: "i1" });

    const r = await derivarIsencaoDoPedido("req_1", "cli_foocci", AGORA);
    expect(r?.derivou).toBe(true);

    const escrito = db.isencaoDeParceria.create.mock.calls[0]![0].data;
    // Uma fonte, um valor: nada é redigitado, nada pode divergir.
    expect(escrito.autorizadaPor).toBe(VIVA.autorizadaPor);
    expect(escrito.validaAte).toBe(VIVA.validaAte);
    expect(escrito.tetoDeIaCentavosUsd).toBe(VIVA.tetoDeIaCentavosUsd);
    expect(escrito.pecasContratadas).toBe(VIVA.pecasContratadas);
    expect(escrito.escopo).toBe(VIVA.escopo);
  });

  it("já havendo isenção, NÃO reescreve — a do pedido é o fato daquele momento", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(VIVA);
    db.isencaoDeParceria.findUnique.mockResolvedValue({ id: "i_antiga" });
    const r = await derivarIsencaoDoPedido("req_1", "cli_foocci", AGORA);
    expect(r?.derivou).toBe(false);
    // Reescrever mudaria a história de uma produção que já correu.
    expect(db.isencaoDeParceria.create).not.toHaveBeenCalled();
  });

  it("SEM parceria viva não deriva nada — o pedido segue pagante", async () => {
    db.parceriaDoCliente.findUnique.mockResolvedValue(null);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Faça a derivação escrever isenção sem conferir a parceria e esta linha
    // fica VERMELHA: todo pedido do mundo viraria isento em silêncio.
    expect(await derivarIsencaoDoPedido("req_1", "cli_qualquer", AGORA)).toBeNull();
    expect(db.isencaoDeParceria.create).not.toHaveBeenCalled();
  });
});
