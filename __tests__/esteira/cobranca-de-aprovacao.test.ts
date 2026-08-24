// A CADEIA INTEIRA, COM TEMPO SIMULADO.
//
// item parado além do prazo → a fila detecta → o aviso é gerado e endereçado ao
// CLIENTE certo, com o link que abre.
//
// As travas que este arquivo defende, e cada uma tem as duas metades:
//
//   1. ⛔ card NO PRAZO não é cobrado (trava que dispara onde não há atraso é
//      trava que alguém desliga) · ✅ card vencido é;
//   2. ⛔ card em que **a bola é da agência** NUNCA é cobrado — cobrar o cliente
//      pelo atraso da casa é o alarme injusto que `aprovacao-parada.ts` existe
//      para impedir;
//   3. ⛔ card já cobrado não gera segundo aviso (idempotência no BANCO, não em
//      memória: um processo que morra no meio não recomeça cobrando de novo);
//   4. ⛔ este módulo NÃO envia nada e NÃO está ligado no relógio.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  approvalRequest: { findMany: vi.fn() },
  client: { findMany: vi.fn() },
  clientNotice: { findFirst: vi.fn(), create: vi.fn() },
  portalAccess: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  cobrarAprovacoesParadas, marcaDoCard, KIND_COBRANCA, textoDaCobranca,
} from "@/lib/agency/esteira/cobranca-de-aprovacao";

// ── O TEMPO É SIMULADO, SEMPRE ──────────────────────────────────────────────
// Segunda 10/08 é a abertura; quinta 13/08 é "agora". Pela régua do contrato
// (2 dias úteis) o card venceu na quarta 12/08 — sem esperar dois dias reais.
const ABERTO_SEGUNDA = new Date("2026-08-10T14:00:00Z");
const QUINTA = new Date("2026-08-13T14:00:00Z");
/** Terça de manhã: o card de segunda AINDA está no prazo. */
const TERCA = new Date("2026-08-11T09:00:00Z");

function card(over: Record<string, unknown> = {}) {
  return {
    id: "ap1", department: "social-media", status: "pending",
    clientId: "c1", clientRequestId: null,
    reviewNote: "Calendário de agosto — 12 peças\n\nPeça 1...",
    createdAt: ABERTO_SEGUNDA, expiresAt: null, questionOpenedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findMany.mockResolvedValue([{ id: "c1" }]);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.clientNotice.findFirst.mockResolvedValue(null);
  db.clientNotice.create.mockImplementation(async () => ({ id: "not1" }));
  db.portalAccess.findMany.mockResolvedValue([{
    id: "pa1", token: "TOKEN-VIVO", clientId: "c1", clientRequestId: null,
    grantedAt: new Date("2026-08-01T00:00:00Z"),
    expiresAt: null, revokedAt: null, accessCount: 0,
  }]);
  process.env.NEXT_PUBLIC_APP_URL = "https://www.diolidigital.com.br";
});

// ── 1. A CADEIA COMPLETA ────────────────────────────────────────────────────

describe("parado além do prazo → detectado → aviso endereçado ao cliente certo", () => {
  it("o card vencido vira UM aviso, para o cliente do card, com o link que abre", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);

    const r = await cobrarAprovacoesParadas("ws1", QUINTA);

    expect(r.geradas).toHaveLength(1);
    const g = r.geradas[0]!;
    expect(g.approvalId).toBe("ap1");
    expect(g.clientId, "cobrança endereçada ao cliente errado").toBe("c1");
    expect(g.temLink).toBe(true);

    const gravado = db.clientNotice.create.mock.calls[0]![0].data;
    expect(gravado.clientId).toBe("c1");
    expect(gravado.workspaceId).toBe("ws1");
    expect(gravado.kind).toBe(KIND_COBRANCA);
    expect(gravado.link).toBe("https://www.diolidigital.com.br/portal/access/TOKEN-VIVO");
  });

  it("o texto fala com o CLIENTE — sem jargão, com o assunto do card", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    const t = r.geradas[0]!.texto;
    expect(t).toContain("Calendário de agosto — 12 peças");
    expect(t).toMatch(/esperando a sua aprovação/i);
    for (const jargao of ["ApprovalRequest", "workspaceId", "expiresAt", "pending"]) {
      expect(t.includes(jargao), `jargão interno vazou para o cliente: ${jargao}`).toBe(false);
    }
  });

  it("card SEM assunto próprio não inventa um", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card({ reviewNote: null })]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas[0]!.texto).toContain("uma entrega sua");
  });

  it("nasce PENDENTE — gravar 'enviado' seria comprovante de algo que não houve", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    await cobrarAprovacoesParadas("ws1", QUINTA);
    const d = db.clientNotice.create.mock.calls[0]![0].data;
    expect(d.status).toBe("pendente");
    expect(d.channel).toBe("nenhum");
    expect(d.sentAt).toBeUndefined();
  });
});

// ── 2. A METADE OPOSTA: NÃO COBRA QUEM NÃO DEVE ─────────────────────────────

describe("⛔ não inventa atraso onde não há", () => {
  it("card de ontem, ainda no prazo, NÃO é cobrado", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    const r = await cobrarAprovacoesParadas("ws1", TERCA);
    expect(r.geradas).toHaveLength(0);
    expect(r.noPrazo).toBe(1);
    expect(db.clientNotice.create, "escreveu cobrança para card no prazo").not.toHaveBeenCalled();
  });

  it("fila vazia não escreve nada", async () => {
    db.approvalRequest.findMany.mockResolvedValue([]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas).toHaveLength(0);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
  });

  it("card aberto na SEXTA não está vencido na segunda — o fim de semana não conta", async () => {
    // Dias corridos cobrariam o cliente no domingo por um prazo vendido em dias
    // úteis. É o defeito mais fácil de cometer e o mais difícil de perceber.
    db.approvalRequest.findMany.mockResolvedValue([
      card({ createdAt: new Date("2026-08-14T15:00:00Z") }),   // sexta
    ]);
    const r = await cobrarAprovacoesParadas("ws1", new Date("2026-08-17T09:00:00Z")); // segunda
    expect(r.geradas).toHaveLength(0);
    expect(r.noPrazo).toBe(1);
  });
});

describe("⛔ a bola da AGÊNCIA nunca vira cobrança do cliente", () => {
  it("card com dúvida aberta sai da cobrança e entra na dívida da casa", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ questionOpenedAt: new Date("2026-08-11T10:00:00Z") }),
    ]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(db.clientNotice.create, "cobrou o cliente pelo atraso da agência").not.toHaveBeenCalled();
    expect(r.geradas).toHaveLength(0);
    expect(r.esperandoAAgencia).toEqual([{ approvalId: "ap1", diasParado: 3 }]);
  });

  it("a dívida da casa é levantada mesmo quando ela é ANTIGA — nunca silêncio", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ createdAt: new Date("2026-07-01T10:00:00Z"), questionOpenedAt: new Date("2026-07-02T10:00:00Z") }),
    ]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.esperandoAAgencia[0]!.diasParado).toBeGreaterThan(30);
  });
});

// ── 3. IDEMPOTÊNCIA, E ELA MORA NO BANCO ────────────────────────────────────

describe("⛔ um aviso por card — repetir seria a rajada na frente do cliente", () => {
  it("card que já tem aviso não gera segundo", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    db.clientNotice.findFirst.mockResolvedValue({ id: "notice-antigo" });
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas).toHaveLength(0);
    expect(r.jaCobrados).toBe(1);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
  });

  it("a busca é pela marca DO CARD — cobrar um card não cala os outros", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    await cobrarAprovacoesParadas("ws1", QUINTA);
    const where = db.clientNotice.findFirst.mock.calls[0]![0].where;
    expect(where.clientId).toBe("c1");
    expect(where.kind).toBe(KIND_COBRANCA);
    expect(where.body.contains).toBe(marcaDoCard("ap1"));
  });

  it("a marca vai NO CORPO gravado — sem ela a idempotência não fecha", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(db.clientNotice.create.mock.calls[0]![0].data.body).toContain(marcaDoCard("ap1"));
  });

  it("dois cards DIFERENTES do mesmo cliente geram dois avisos", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card({ id: "ap1" }), card({ id: "ap2" })]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas.map((g) => g.approvalId)).toEqual(["ap1", "ap2"]);
  });
});

// ── 4. AUSÊNCIA DE INFORMAÇÃO NÃO É INFORMAÇÃO ──────────────────────────────

describe("sem link o aviso SAI mesmo assim, e diz por quê", () => {
  it("cliente sem token de portal vivo é cobrado sem link, com o motivo gravado", async () => {
    // Sem link é ruim. Sem aviso é muito pior — foi assim que a peça pronta
    // morreu esperando um clique que ninguém pediu.
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    db.portalAccess.findMany.mockResolvedValue([]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas).toHaveLength(1);
    expect(r.geradas[0]!.temLink).toBe(false);
    const d = db.clientNotice.create.mock.calls[0]![0].data;
    expect(d.link).toBeNull();
    expect(d.failReason).toMatch(/SEM link do portal/);
    expect(d.failReason).toMatch(/nunca teve token/);
  });

  it("card SEM cliente resolvível não é endereçado por palpite", async () => {
    // Endereçar por palpite manda o portal de um cliente a outro.
    db.approvalRequest.findMany.mockResolvedValue([card({ clientId: null, clientRequestId: "sol1" })]);
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
    expect(r.semDono).toEqual(["ap1"]);
  });
});

describe("teto por rodada", () => {
  it("cobra até o teto e DECLARA o que ficou para a próxima", async () => {
    db.approvalRequest.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => card({ id: `ap${i}` })),
    );
    const r = await cobrarAprovacoesParadas("ws1", QUINTA, { teto: 3 });
    expect(r.geradas).toHaveLength(3);
    expect(r.adiadosPeloTeto).toBe(5);
  });
});

describe("uma rodada que falha não derruba o relógio", () => {
  it("banco fora do ar devolve rodada vazia em vez de lançar", async () => {
    db.approvalRequest.findMany.mockRejectedValue(new Error("db down"));
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas).toEqual([]);
  });

  it("falha ao gravar um cliente não impede o seguinte", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card({ id: "ap1" }), card({ id: "ap2" })]);
    db.clientNotice.create
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce({ id: "not2" });
    const r = await cobrarAprovacoesParadas("ws1", QUINTA);
    expect(r.geradas.map((g) => g.approvalId)).toEqual(["ap2"]);
  });
});

// ── 5. O QUE ESTE MÓDULO NÃO FAZ — E O QUE FICOU DESLIGADO ──────────────────

describe("⛔ registra, não dispara — e NÃO está ligado no relógio", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/esteira/cobranca-de-aprovacao.ts"), "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não manda mensagem por caminho nenhum", () => {
    for (const p of ["sendWhatsApp", "sendEmail", "avisarCliente", "avisarPorEmail", "fetch("]) {
      expect(SRC.includes(p), `passou a disparar sozinho (${p})`).toBe(false);
    }
  });

  it("não decide por ninguém — não aprova, não reprova, não expira card", () => {
    for (const e of ["approvalRequest.update", "approvalRequest.delete", "status: \"approved\""]) {
      expect(SRC.includes(e), `passou a decidir no lugar do cliente (${e})`).toBe(false);
    }
  });

  it("não reimplementa a régua do prazo nem a da fila", () => {
    // Terceira cópia da mesma regra é a terceira verdade que diverge.
    expect(SRC).toContain("lerPrazoDoCard");
    expect(SRC).toContain("aprovacoesParadas");
  });

  it("⛔ CONTINUA DESLIGADO: o despertador NÃO o chama", () => {
    // Ordem explícita do bloco de 15/08: máquina pronta e desligada é entrega;
    // máquina ligada sem ordem é violação. Este teste é o que impede alguém de
    // ligá-la de passagem, sem o ato de quem manda.
    const DESPERTADOR = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8",
    );
    expect(
      DESPERTADOR.includes("cobrarAprovacoesParadas"),
      "a cobrança foi LIGADA no relógio sem ordem — ver o cabeçalho de cobranca-de-aprovacao.ts",
    ).toBe(false);
  });
});

describe("o texto é função pura e testável sem banco", () => {
  it("um dia parado fala 'desde ontem'; mais que isso conta os dias", () => {
    expect(textoDaCobranca({ assunto: "X", diasParado: 1, approvalId: "a" })).toContain("desde ontem");
    expect(textoDaCobranca({ assunto: "X", diasParado: 5, approvalId: "a" })).toContain("há 5 dias");
  });
});
