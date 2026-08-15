// A TERCEIRA PORTA DO WHATSAPP — a que quase ficou de fora.
//
// ── Como ela apareceu ───────────────────────────────────────────────────────
//
// O freio `WHATSAPP_SAIDA` nasceu cobrindo as duas pernas que o relógio chama
// pelo nome: `meta/notifications.ts` e `esteira/fila-que-se-cobra.ts`. Só que
// existe uma terceira, e ela é INDIRETA — que é exatamente por que ninguém a
// tinha visto:
//
//     despertador → virarOsMesesVencidos  ─┐
//     despertador → retomarProducao       ─┴→ marcos.falarComOCliente
//                                            → avisos.avisarCliente
//                                            → sendWhatsAppMessage
//
// Um freio que cobrisse só as duas diretas seria o mesmo desenho que deixou
// PUBLICAR de fora da trava de ativos em 06/08/2026: a porta que ninguém está
// olhando é por onde o incidente volta.
//
//   ⛔ METADE 1 — fechado, o aviso NÃO sai pelo WhatsApp… mas o registro FICA.
//   ✅ METADE 2 — aberto, ele volta a sair.
//   🔑 E a que quase ninguém testaria: o aviso segurado pelo freio precisa
//      voltar a ser tentado quando a torneira abrir. Classificado errado, ele
//      seria abandonado justamente no dia em que voltasse a poder sair.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  clientNotice: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
}));
const sendWhatsAppMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta", () => ({ sendWhatsAppMessage }));

import { avisarCliente, MOTIVO_FREIO_FECHADO } from "@/lib/agency/esteira/avisos";
import { cobrarAFila } from "@/lib/agency/esteira/fila-que-se-cobra";
import { CHAVE_DO_WHATSAPP, VALOR_QUE_LIBERA } from "@/lib/agency/freios-de-saida";

const guardado = process.env[CHAVE_DO_WHATSAPP];

const PEDIDO = {
  workspaceId: "ws1", clientId: "cli1", tipo: "entrega" as const,
  texto: "Seu pacote do mês está pronto.",
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[CHAVE_DO_WHATSAPP];
  db.client.findUnique.mockResolvedValue({ phone: "(11) 99999-8888", portalToken: "tok1" });
  db.clientNotice.create.mockResolvedValue({});
  db.clientNotice.update.mockResolvedValue({});
  db.metaConnection.findFirst.mockResolvedValue({ id: "wa1" });
  sendWhatsAppMessage.mockResolvedValue({ ok: true });
});

afterEach(() => {
  if (guardado === undefined) delete process.env[CHAVE_DO_WHATSAPP];
  else process.env[CHAVE_DO_WHATSAPP] = guardado;
});

describe("⛔ METADE 1 — fechado, a terceira porta também segura", () => {
  it("não sai mensagem nenhuma, e nem a conexão é carregada", async () => {
    const r = await avisarCliente(PEDIDO);
    expect(sendWhatsAppMessage, "a terceira porta continuou aberta").not.toHaveBeenCalled();
    expect(db.metaConnection.findFirst).not.toHaveBeenCalled();
    expect(r.enviadoAutomaticamente).toBe(false);
  });

  it("o aviso NÃO se perde: fica registrado, pendente, com o motivo", async () => {
    // Aqui "fechado não consome" tem um limite declarado: o `ClientNotice` É
    // criado, porque ele é o que garante que o cliente será avisado um dia. O
    // que não acontece é o envio — e nada é marcado como enviado.
    await avisarCliente(PEDIDO);
    const linha = db.clientNotice.create.mock.calls[0]![0].data;
    expect(linha.status).toBe("pendente");
    expect(linha.channel).toBe("nenhum");
    expect(linha.sentAt, "marcou como enviado o que não saiu").toBeUndefined();
    expect(linha.failReason).toBe(MOTIVO_FREIO_FECHADO);
  });

  it("o motivo NOMEIA a chave — quem lê o painel precisa saber o que soltar", async () => {
    await avisarCliente(PEDIDO);
    expect(db.clientNotice.create.mock.calls[0]![0].data.failReason).toContain(CHAVE_DO_WHATSAPP);
  });
});

describe("✅ METADE 2 — aberto, a terceira porta volta a mandar", () => {
  it("o aviso legítimo sai pelo WhatsApp", async () => {
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
    const r = await avisarCliente(PEDIDO);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(r.enviadoAutomaticamente).toBe(true);
    expect(db.clientNotice.create.mock.calls[0]![0].data.status).toBe("enviado");
  });
});

// ─── 🔑 A METADE QUE FECHA O CICLO ──────────────────────────────────────────

describe("🔑 o aviso que o freio segurou VOLTA quando a torneira abre", () => {
  it("é classificado como temporário, e é re-tentado", async () => {
    // Se `MOTIVO_FREIO_FECHADO` contivesse "opt-in", "janela" ou "24h", a fila
    // o leria como recusa de POLÍTICA e NUNCA o re-tentaria. O aviso morreria
    // em silêncio no dia exato em que voltasse a poder sair — o mesmo padrão da
    // fila morta invisível, com o freio no papel de assassino.
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
    db.clientNotice.findMany.mockResolvedValue([{
      id: "av1", workspaceId: "ws1", clientId: "cli1", projectId: null,
      kind: "entrega", body: "Seu pacote do mês está pronto.", status: "pendente",
      channel: "nenhum", failReason: MOTIVO_FREIO_FECHADO,
      retryCount: 0, createdAt: new Date("2026-08-01T12:00:00Z"),
    }]);

    const r = await cobrarAFila("ws1", new Date("2026-08-15T12:00:00Z"));
    expect(r.reenviados, "o aviso segurado pelo freio foi abandonado").toEqual(["av1"]);
    expect(r.barradosPorPolitica).toEqual([]);
    expect(r.precisamDeCadastro).toEqual([]);
  });
});
