// ⚠️ ESTE CABEÇALHO REGISTRA UMA CORREÇÃO DE CONTRATO — 15/08/2026.
//
// A versão anterior deste arquivo afirmava, como invariante:
//
//     expect(texto).toContain("https://app.dioli.studio/portal/access/tok123")
//
// onde `tok123` era `Client.portalToken`. **Era o defeito escrito como
// contrato.** Nenhuma porta do portal resolve por essa coluna: todas passam por
// `validatePortalAccess` → `prisma.portalAccess.findUnique({ where: { token } })`,
// outra tabela, outro token, sem cópia entre as duas em lugar nenhum do
// repositório. O teste passava e o cliente recebia link que responde 403.
//
// É o mesmo padrão já catalogado em `docs/pendencias.md` duas vezes (o teste de
// captura de identidade do briefing e o `jornada-real`): **o defeito virando
// invariante**. O que mudou: o link agora sai do `PortalAccess` vivo, pelo
// leitor único `link-do-portal-do-cliente.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
  clientNotice: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  portalAccess: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
}));
const sendWhatsAppMessage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta", () => ({ sendWhatsAppMessage }));

import { avisarCliente, filaDeAvisos, marcarComoEnviado, dispensar } from "@/lib/agency/esteira/avisos";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dioli.studio";
  // ⛔ O canal de e-mail nasce DESLIGADO e estes testes não o ligam: nenhum
  // e-mail sai daqui, nem para endereço de teste.
  delete process.env.AVISO_POR_EMAIL;
  delete process.env.RESEND_API_KEY;
  db.client.findUnique.mockResolvedValue({ phone: "+55 11 99999-8888", email: "cliente@exemplo.com" });
  db.metaConnection.findFirst.mockResolvedValue({ id: "conn1" });
  db.clientNotice.create.mockResolvedValue({ id: "n1" });
  db.clientNotice.findMany.mockResolvedValue([]);
  db.clientNotice.update.mockResolvedValue({});
  db.clientRequestDb.findMany.mockResolvedValue([]);
  // O token que o portal REALMENTE consulta.
  db.portalAccess.findMany.mockResolvedValue([{
    id: "pa1", token: "tok-do-portalaccess", clientId: "c1", clientRequestId: null,
    grantedAt: new Date("2026-08-01T00:00:00Z"), expiresAt: null, revokedAt: null, accessCount: 0,
  }]);
  sendWhatsAppMessage.mockResolvedValue({ ok: true });
});

const PEDIDO = {
  workspaceId: "ws1",
  clientId: "c1",
  projectId: "p1",
  tipo: "material" as const,
  texto: "Precisamos do seu logo para começar as artes.",
};

describe("o aviso NUNCA se perde", () => {
  it("saiu pelo WhatsApp → registra como enviado, com comprovante", async () => {
    const r = await avisarCliente(PEDIDO);
    expect(r.enviadoAutomaticamente).toBe(true);
    expect(r.canal).toBe("whatsapp");

    const gravado = db.clientNotice.create.mock.calls[0][0].data;
    expect(gravado.status).toBe("enviado");
    expect(gravado.sentAt).toBeInstanceOf(Date);
  });

  it("SEM conexão de WhatsApp → vira fila, não some", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    const r = await avisarCliente(PEDIDO);

    expect(r.registrado).toBe(true);
    expect(r.enviadoAutomaticamente).toBe(false);
    expect(db.clientNotice.create.mock.calls[0][0].data.status).toBe("pendente");
  });

  it("cliente sem telefone → vira fila, com o motivo explícito", async () => {
    db.client.findUnique.mockResolvedValue({ phone: null, email: "cliente@exemplo.com" });
    await avisarCliente(PEDIDO);
    expect(db.clientNotice.create.mock.calls[0][0].data.failReason).toMatch(/telefone/i);
  });

  it("a Meta recusa fora da janela de 24h → vira fila com o motivo dela", async () => {
    sendWhatsAppMessage.mockResolvedValue({ ok: false, error: "fora da janela de 24h — use template aprovado" });
    const r = await avisarCliente(PEDIDO);

    expect(r.enviadoAutomaticamente).toBe(false);
    expect(db.clientNotice.create.mock.calls[0][0].data.failReason).toMatch(/24h/);
  });

  it("o envio explodindo não derruba o registro", async () => {
    sendWhatsAppMessage.mockRejectedValue(new Error("rede caiu"));
    const r = await avisarCliente(PEDIDO);
    expect(r.registrado).toBe(true);
    expect(db.clientNotice.create).toHaveBeenCalled();
  });

  it("nem o aviso inteiro falhando derruba quem chamou", async () => {
    db.clientNotice.create.mockRejectedValue(new Error("banco fora"));
    await expect(avisarCliente(PEDIDO)).resolves.toMatchObject({ registrado: false });
  });
});

describe("o link do portal vai junto — e ele ABRE", () => {
  it("a mensagem carrega o token do PortalAccess, que é o que o portal consulta", async () => {
    await avisarCliente(PEDIDO);
    const texto = sendWhatsAppMessage.mock.calls[0][1].text as string;
    expect(texto).toContain("Precisamos do seu logo");
    expect(texto).toContain("https://app.dioli.studio/portal/access/tok-do-portalaccess");
  });

  it("⛔ NUNCA lê `Client.portalToken` — era por aí que o link morria", async () => {
    // A metade que impede a volta do defeito: se alguém reintroduzir a coluna
    // errada no `select`, este teste cai antes de o cliente receber o 403.
    await avisarCliente(PEDIDO);
    const select = db.client.findUnique.mock.calls[0][0].select;
    expect(select.portalToken, "voltou a ler a coluna que o portal não consulta").toBeUndefined();
  });

  it("cliente SEM token vivo: o aviso é registrado sem link, nunca com link falso", async () => {
    // Ausência de informação não é informação. Link inventado é pior que
    // ausência: gasta a paciência do cliente e parece defeito nosso.
    db.portalAccess.findMany.mockResolvedValue([]);
    await avisarCliente(PEDIDO);
    expect(db.clientNotice.create.mock.calls[0][0].data.link).toBeNull();
    const texto = sendWhatsAppMessage.mock.calls[0][1].text as string;
    expect(texto).not.toContain("portal/access");
  });

  it("o telefone vai só com dígitos, como a Meta exige", async () => {
    await avisarCliente(PEDIDO);
    expect(sendWhatsAppMessage.mock.calls[0][1].to).toBe("5511999998888");
  });
});

describe("a fila para o time disparar", () => {
  it("entrega o texto pronto, com link, sem precisar escrever nada", async () => {
    db.clientNotice.findMany.mockResolvedValue([
      {
        id: "n1", kind: "material", body: "Precisamos do seu logo.",
        link: "https://app.dioli.studio/portal/access/tok123",
        failReason: "cliente sem telefone cadastrado",
        createdAt: new Date("2026-07-29T10:00:00Z"),
        client: { name: "Padaria do João" },
      },
    ]);

    const fila = await filaDeAvisos("ws1");
    expect(fila).toHaveLength(1);
    expect(fila[0]!.cliente).toBe("Padaria do João");
    expect(fila[0]!.textoParaEnviar).toContain("Precisamos do seu logo.");
    expect(fila[0]!.textoParaEnviar).toContain("portal/access/tok123");
    expect(fila[0]!.porQueNaoSaiuSozinho).toMatch(/telefone/i);
  });

  it("banco fora do ar devolve fila vazia em vez de quebrar o painel", async () => {
    db.clientNotice.findMany.mockRejectedValue(new Error("db down"));
    expect(await filaDeAvisos("ws1")).toEqual([]);
  });

  it("marcar como enviado registra quem mandou", async () => {
    expect(await marcarComoEnviado("n1", "dioli@studio")).toBe(true);
    const d = db.clientNotice.update.mock.calls[0][0].data;
    expect(d.status).toBe("enviado");
    expect(d.channel).toBe("manual");
    expect(d.sentBy).toBe("dioli@studio");
  });

  it("dispensar sai da fila sem fingir que foi enviado", async () => {
    expect(await dispensar("n1", "dioli@studio")).toBe(true);
    expect(db.clientNotice.update.mock.calls[0][0].data.status).toBe("dispensado");
  });
});
