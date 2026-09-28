// A fila EventoDeWebhook: assinada (mesmo esquema HMAC), reentrega
// exponencial, idempotência por idEvento, e "sem URL → não envia e registra
// 1 vez".

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  eventoDeWebhook: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  proximaTentativaEm,
  montarCorpoDoEvento,
  BACKOFF_MS,
  MAX_TENTATIVAS_WEBHOOK,
  registrarEventoDeWebhook,
  reentregarWebhooksPendentes,
} from "@/lib/integracoes/cityjobs/webhook";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CITYJOBS_WEBHOOK_URL;
  delete process.env.CITYJOBS_HMAC_SEGREDO;
  // `enviarAgora` sempre encadeia `.catch(...)` no update — sem um resolved
  // value default aqui, o mock devolve `undefined` e o `.catch` de
  // `webhook.ts:206`/`:214` explode em runtime ("Cannot read properties of
  // undefined (reading 'catch')") em todo teste que não seta isto na mão.
  db.eventoDeWebhook.update.mockResolvedValue({});
});

describe("backoff exponencial — 1min, 5min, 30min, 2h, 12h", () => {
  it("os 5 passos batem com o contrato §8", () => {
    expect(BACKOFF_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(MAX_TENTATIVAS_WEBHOOK).toBe(5);
  });

  it("cresce a cada tentativa e desiste depois da 5ª", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    expect(proximaTentativaEm(0, agora)!.getTime() - agora.getTime()).toBe(60_000);
    expect(proximaTentativaEm(4, agora)!.getTime() - agora.getTime()).toBe(43_200_000);
    expect(proximaTentativaEm(5, agora)).toBeNull();
    expect(proximaTentativaEm(99, agora)).toBeNull();
  });
});

describe("o corpo do evento — contrato §8", () => {
  it("carrega idEvento, eco de metadados, e nulos explícitos quando ausente", () => {
    const corpo = montarCorpoDoEvento("evt_123", {
      idExterno: "vaga-1",
      evento: "publicado",
      ocorridoEm: new Date("2026-09-28T13:31:04-03:00"),
      permalink: "https://instagram.com/p/x",
      externalPostId: "178888",
      metadados: { vagaId: "4821" },
    });
    expect(corpo).toEqual({
      idEvento: "evt_123",
      idExterno: "vaga-1",
      evento: "publicado",
      ocorridoEm: "2026-09-28T16:31:04.000Z",
      permalink: "https://instagram.com/p/x",
      externalPostId: "178888",
      motivo: null,
      metadados: { vagaId: "4821" },
    });
  });
});

describe("registrarEventoDeWebhook — só enfileira, nunca envia no mesmo request", () => {
  it("cria a linha com tentativas 0 e proximaTentativaEm = agora", async () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    db.eventoDeWebhook.create.mockResolvedValue({});
    const r = await registrarEventoDeWebhook("post_1", { idExterno: "vaga-1", evento: "agendado", ocorridoEm: agora }, agora);
    expect(r.ok).toBe(true);
    expect(db.eventoDeWebhook.create).toHaveBeenCalledTimes(1);
    const chamada = db.eventoDeWebhook.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(chamada.data.tentativas).toBe(0);
    expect(chamada.data.proximaTentativaEm).toBe(agora);
    expect(chamada.data.postExternoId).toBe("post_1");
  });

  it("nunca lança — banco fora do ar vira { ok: false }", async () => {
    db.eventoDeWebhook.create.mockRejectedValue(new Error("fora do ar"));
    const r = await registrarEventoDeWebhook("post_1", { idExterno: "vaga-1", evento: "falhou", ocorridoEm: new Date() });
    expect(r.ok).toBe(false);
  });
});

describe("reentregarWebhooksPendentes", () => {
  it("sem CITYJOBS_WEBHOOK_URL: não envia e registra 1 vez, sem tocar o banco", async () => {
    const r = await reentregarWebhooksPendentes();
    expect(r).toEqual({ entregues: 0, falhas: [expect.stringContaining("CITYJOBS_WEBHOOK_URL")], emReintento: [], desistidos: 0 });
    expect(db.eventoDeWebhook.findMany).not.toHaveBeenCalled();
  });

  it("entrega com sucesso: assina, marca entregueEm", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_1", postExternoId: "post_1", corpoJson: '{"idEvento":"evt_1"}', tentativas: 0 },
    ]);
    const fetchEspiao = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchEspiao);

    const agora = new Date("2026-09-28T12:00:00Z");
    const r = await reentregarWebhooksPendentes(agora);
    expect(r.entregues).toBe(1);
    expect(fetchEspiao).toHaveBeenCalledTimes(1);
    const [, init] = fetchEspiao.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Dioli-Assinatura"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(headers["X-Dioli-Timestamp"]).toBe(String(Math.floor(agora.getTime() / 1000)));
    expect(db.eventoDeWebhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt_1" }, data: expect.objectContaining({ entregueEm: expect.any(Date) }) }),
    );
  });

  it("nunca segue redirect e nunca trava para sempre: redirect:'manual' + signal de timeout no fetch", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_4", postExternoId: "post_1", corpoJson: "{}", tentativas: 0 },
    ]);
    const fetchEspiao = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchEspiao);

    await reentregarWebhooksPendentes(new Date("2026-09-28T12:00:00Z"));

    const [, init] = fetchEspiao.mock.calls[0]!;
    expect((init as RequestInit).redirect).toBe("manual");
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("timeout do webhook vira falha com motivo legível (não é `ok`, cai no backoff normal)", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_5", postExternoId: "post_1", corpoJson: "{}", tentativas: 0 },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const erro = new Error("The operation was aborted due to timeout");
        erro.name = "TimeoutError";
        throw erro;
      }),
    );

    const r = await reentregarWebhooksPendentes(new Date("2026-09-28T12:00:00Z"));
    expect(r.entregues).toBe(0);
    expect(r.emReintento).toHaveLength(1);
    expect(r.emReintento[0]).toMatch(/timeout/i);
  });

  it("resposta 3xx (redirect NÃO seguido) é tratada como falha, nunca como sucesso", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_6", postExternoId: "post_1", corpoJson: "{}", tentativas: 0 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 302 })));

    const r = await reentregarWebhooksPendentes(new Date("2026-09-28T12:00:00Z"));
    expect(r.entregues).toBe(0);
    expect(r.emReintento).toHaveLength(1);
  });

  it("falha com tentativas restantes: agenda reentrega, NÃO entra em `falhas` (não é alarme)", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_2", postExternoId: "post_1", corpoJson: "{}", tentativas: 1 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const r = await reentregarWebhooksPendentes(new Date("2026-09-28T12:00:00Z"));
    expect(r.entregues).toBe(0);
    expect(r.falhas).toEqual([]);
    expect(r.emReintento).toHaveLength(1);
    expect(r.desistidos).toBe(0);
    expect(db.eventoDeWebhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tentativas: 2, proximaTentativaEm: expect.any(Date) }) }),
    );
  });

  it("esgota as tentativas: desiste, vira ALARME (falhas), proximaTentativaEm null", async () => {
    process.env.CITYJOBS_WEBHOOK_URL = "https://cityjobs.example.com/webhooks/dioli";
    process.env.CITYJOBS_HMAC_SEGREDO = "segredo-de-teste";
    db.eventoDeWebhook.findMany.mockResolvedValue([
      { id: "evt_3", postExternoId: "post_1", corpoJson: "{}", tentativas: MAX_TENTATIVAS_WEBHOOK - 1 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    const r = await reentregarWebhooksPendentes(new Date());
    expect(r.desistidos).toBe(1);
    expect(r.falhas).toHaveLength(1);
    expect(db.eventoDeWebhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proximaTentativaEm: null }) }),
    );
  });
});
