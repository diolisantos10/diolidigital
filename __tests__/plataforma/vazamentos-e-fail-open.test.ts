// TRÊS FUROS MENORES QUE JÁ ESTAVAM ABERTOS, E UM CÓDIGO MORTO PERIGOSO.
//
// 1. FAIL-OPEN NO PAGAMENTO (`/api/self-serve/webhook`): sem
//    `MERCADOPAGO_WEBHOOK_SECRET`, a verificação de assinatura retornava
//    `true`. Qualquer um com a URL fazia um POST e marcava um pedido como PAGO.
//    "Para não travar uma instância sem configuração" — na prática, serviço de
//    graça para quem descobrisse o endereço.
//
// 2. ERRO CRU DO PROVEDOR PERSISTIDO (`/api/ai-keys/test`): a mensagem do
//    provedor era gravada em `lastTestMessage` e servida por `GET /api/ai-keys`,
//    que exigia SÓ sessão — não master. Provedores ecoam parte da chave em erro
//    de autenticação. Vazamento de credencial COM PERSISTÊNCIA, o pior tipo.
//
// 3. `JSON.parse` NU sobre texto vindo do banco: uma linha truncada derrubava a
//    leitura inteira, com o erro aparecendo longe da causa.
//
// 4. `resolvePortalAccess()` — zero chamadores, e devolvia o texto recebido do
//    visitante como `clientId` AUTORIZADO quando o token não batia. Código morto
//    com nome bom é armadilha esperando alguém com pressa.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";

const db = vi.hoisted(() => ({
  clientRequestDb: { update: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { POST as webhookPagamento } from "@/app/api/self-serve/webhook/route";
import { sanitizarMensagemDeProvedor } from "@/app/api/ai-keys/test/route";
import { parseArtifactCanvas } from "@/lib/agency/persistence/brain-artifact-service";
import * as portalGuard from "@/lib/auth/portal-guard";

const ambienteOriginal = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MERCADOPAGO_ACCESS_TOKEN = "token-mp";
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
  vi.unstubAllGlobals();
});

function notificacaoMp(assinatura?: string): NextRequest {
  return new NextRequest("http://localhost/api/self-serve/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-1",
      ...(assinatura ? { "x-signature": assinatura } : {}),
    },
    body: JSON.stringify({ type: "payment", data: { id: "pay-123" } }),
  });
}

describe("o webhook de pagamento não é mais fail-open", () => {
  it("SEM o segredo configurado → 401 e NENHUM pedido marcado como pago", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;

    const res = await webhookPagamento(notificacaoMp("ts=1,v1=qualquercoisa"));

    expect(res.status).toBe(401);
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("com segredo, assinatura errada → 401 e nada gravado", async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-do-mp";

    const res = await webhookPagamento(notificacaoMp("ts=1,v1=deadbeef"));

    expect(res.status).toBe(401);
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("com segredo e assinatura CERTA → segue o fluxo normal e marca o pedido", async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-do-mp";
    const ts = "1735689600";
    const manifesto = `id:pay-123;request-id:req-1;ts:${ts};`;
    const v1 = createHmac("sha256", "segredo-do-mp").update(manifesto).digest("hex");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "approved", external_reference: "cr-1" }),
      }),
    );

    const res = await webhookPagamento(notificacaoMp(`ts=${ts},v1=${v1}`));

    expect(res.status).toBe(200);
    expect(db.clientRequestDb.update).toHaveBeenCalledWith({
      where: { id: "cr-1" },
      data: { status: "in_progress" },
    });
  });
});

describe("a mensagem do provedor é limpa antes de virar registro", () => {
  it("chave da OpenAI ecoada no erro NÃO é guardada", () => {
    // segredo-permitido: chave FALSA — insumo do teste que prova a redação.
    const cru = "Incorrect API key provided: sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789. You can find your API key at…";
    const limpo = sanitizarMensagemDeProvedor(cru);
    // segredo-permitido: o mesmo valor falso da linha acima.
    expect(limpo).not.toContain("sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz");
    expect(limpo).toContain("credencial removida");
  });

  it("chave do Google (AIza…) e da Perplexity (pplx-…) também somem", () => {
    expect(sanitizarMensagemDeProvedor("API key not valid: AIzaSyA1B2C3D4E5F6G7H8I9J0")).toContain("credencial removida");
    expect(sanitizarMensagemDeProvedor("bad token pplx-abc123def456ghi789")).toContain("credencial removida");
  });

  it("qualquer sequência longa com cara de token vira placeholder", () => {
    const token = "a".repeat(60);
    expect(sanitizarMensagemDeProvedor(`erro com ${token}`)).not.toContain(token);
  });

  it("o MOTIVO continua legível — quem depura precisa dele", () => {
    const limpo = sanitizarMensagemDeProvedor("Chave válida, mas sem saldo na conta (402)");
    expect(limpo).toBe("Chave válida, mas sem saldo na conta (402)");
  });

  it("nunca passa de 300 caracteres", () => {
    expect(sanitizarMensagemDeProvedor("x".repeat(2000)).length).toBeLessThanOrEqual(300);
  });
});

describe("JSON vindo do banco não derruba mais quem lê", () => {
  it("canvas truncado → null, e o chamador decide (ausência NÃO é informação)", () => {
    expect(parseArtifactCanvas({ canvasJson: '{"a": ' })).toBeNull();
    expect(parseArtifactCanvas({ canvasJson: "" })).toBeNull();
  });

  it("canvas bom continua sendo lido normalmente", () => {
    expect(parseArtifactCanvas<{ a: number }>({ canvasJson: '{"a":1}' })).toEqual({ a: 1 });
  });
});

describe("o código morto perigoso foi removido", () => {
  it("resolvePortalAccess() não existe mais — ela devolvia o id do visitante como autorizado", () => {
    expect("resolvePortalAccess" in portalGuard).toBe(false);
  });
});
