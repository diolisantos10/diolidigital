// O CLIENTE DO COFRE contra um SERVIDOR FALSO de verdade (HTTP local).
//
// Ordem do CEO (04/10/2026): "teste com servidor falso cobrindo 200, 401, 409,
// 422 e tempo esgotado". Aqui o pedido sai pela rede de verdade (fetch →
// node:http), e o servidor confere o que a Control Room conferiria: o
// cabeçalho X-Service-Token, o caminho e o corpo do contrato.
//
// As duas metades de cada trava:
//   • com token → o pedido sai com o cabeçalho e o corpo certos;
//     sem token → NADA sai, e o recado é "aguardando", não erro;
//   • o centro de custo é o do CLIENTE quando ele tem um; senão, o da casa;
//   • o VALOR do token nunca aparece em erro devolvido.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const db = vi.hoisted(() => ({
  centros: {} as Record<string, string | null>,
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findUnique: vi.fn(async (q: { where: { id: string } }): Promise<{ centroCustoId: string | null } | null> =>
        q.where.id in db.centros ? { centroCustoId: db.centros[q.where.id] ?? null } : null),
    },
  },
}));
// O `generate()` e o `generateDesign()` gravam no livro-caixa e consultam a
// fixação por cliente — fora do escopo deste teste.
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async (): Promise<void> => undefined) }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async (): Promise<null> => null) }));
vi.mock("@/lib/ai/resolve-key", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/resolve-key")>()),
  resolveProviderKey: vi.fn(async (): Promise<null> => null),
}));

import { pedirAoCofre, cofreLigado, corpoDoPedido, AGUARDANDO_O_COFRE, CAMINHO_PADRAO_DO_GATEWAY } from "@/lib/ai/cofre";
import { generate } from "@/lib/ai/generate";
import { generateDesign } from "@/lib/ai/design-engine";
import { lerPeloCofre, RECADO_SEM_IA } from "@/lib/ai/leitura-pelo-cofre";

const TOKEN = "tok-de-teste-NUNCA-pode-vazar-7f3a";

interface Recebido { caminho: string; token: string | undefined; cookie: string | undefined; corpo: Record<string, unknown> }
const recebidos: Recebido[] = [];
/** O que o servidor falso responde na próxima chamada. */
let proxima: { status: number; corpo: unknown; atrasoMs?: number } = { status: 200, corpo: {} };

let servidor: http.Server;
let base = "";

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", () => {
      let corpo: Record<string, unknown> = {};
      try { corpo = JSON.parse(bruto); } catch { /* corpo inválido fica vazio */ }
      recebidos.push({
        caminho: req.url ?? "",
        token: req.headers["x-service-token"] as string | undefined,
        cookie: req.headers.cookie,
        corpo,
      });
      const responder = () => {
        if (res.destroyed) return;
        res.writeHead(proxima.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(proxima.corpo));
      };
      if (proxima.atrasoMs) setTimeout(responder, proxima.atrasoMs);
      else responder();
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.closeAllConnections?.();
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

beforeEach(() => {
  recebidos.length = 0;
  db.centros = { cli_com_centro: "cc-cliente-123", cli_sem_centro: null };
  process.env.CONTROL_ROOM_SERVICE_TOKEN = TOKEN;
  process.env.CONTROL_ROOM_URL = base;
  process.env.CONTROL_ROOM_CENTRO_CUSTO_PADRAO = "cc-casa";
  delete process.env.CONTROL_ROOM_GATEWAY_PATH;
  proxima = { status: 200, corpo: {} };
});

const TEXTO = { modalidade: "text" as const, mensagens: [{ role: "user" as const, content: "oi" }], clientId: "cli_com_centro", agentId: "copy" };

describe("200 — o pedido sai certo e a resposta volta", () => {
  it("texto: cabeçalho X-Service-Token, caminho do gateway e corpo do contrato", async () => {
    proxima = { status: 200, corpo: { resultado: { texto: "olá" }, modelo: "deepseek-chat", uso: { entrada: 10, saida: 3 } } };
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: true, texto: "olá", modelo: "deepseek-chat", uso: { entrada: 10, saida: 3 } });

    const [p] = recebidos;
    expect(p!.caminho).toBe(CAMINHO_PADRAO_DO_GATEWAY);
    expect(p!.token).toBe(TOKEN);
    expect(p!.cookie).toBeUndefined(); // nunca cookie de login
    expect(p!.corpo).toMatchObject({
      roleAddress: "dioli.digital.gateway.chamador",
      workClass: "routine",
      modalidade: "text",
      centroCustoId: "cc-cliente-123",
      escopo: { holdingId: "dioli" },
      classificacaoDados: "internal",
      solicitadoPor: "dioli-digital",
      mensagens: [{ role: "user", content: "oi" }],
    });
    expect(String(p!.corpo.payloadRef)).toMatch(/^dioli:copy:cli_com_centro:/);
  });

  it("imagem: modalidade image, prompt no corpo, e a imagem volta como URL", async () => {
    proxima = { status: 200, corpo: { resultado: { b64_json: "A".repeat(64) }, modelo: "grok-2-image" } };
    const r = await pedirAoCofre({ modalidade: "image", mensagens: [{ role: "user", content: "um temaki" }], clientId: "cli_com_centro", tamanho: "square" });
    expect(r.ok && r.imagemUrl).toMatch(/^data:image\/png;base64,A+$/);
    expect(recebidos[0]!.corpo).toMatchObject({ modalidade: "image", prompt: "um temaki", tamanho: "square" });
  });

  it("resposta no formato OpenAI cru também é lida", async () => {
    proxima = { status: 200, corpo: { choices: [{ message: { content: "{\"a\":1}" } }] } };
    const r = await pedirAoCofre(TEXTO);
    expect(r.ok && r.texto).toBe("{\"a\":1}");
  });

  it("200 sem nada reconhecível é FALHA declarada — nunca texto inventado", async () => {
    proxima = { status: 200, corpo: { status: "ok" } };
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: false, falha: "resposta_ilegivel" });
  });
});

describe("os erros do contrato viram falhas com nome", () => {
  for (const [status, falha] of [[401, "nao_autorizado"], [409, "sem_modelo"], [422, "corpo_invalido"], [500, "falha"]] as const) {
    it(`${status} → ${falha}, com o motivo do gateway e SEM o token`, async () => {
      // O gateway ecoa o token na mensagem (pior caso): ele tem de sair mascarado.
      proxima = { status, corpo: { erro: `recusado para ${TOKEN}` } };
      const r = await pedirAoCofre(TEXTO);
      expect(r).toMatchObject({ ok: false, falha, status });
      expect(!r.ok && r.erro).toContain(`HTTP ${status}`);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    });
  }

  it("tempo esgotado → tempo_esgotado, sem pendurar", async () => {
    proxima = { status: 200, corpo: { texto: "tarde demais" }, atrasoMs: 500 };
    const r = await pedirAoCofre({ ...TEXTO, timeoutMs: 100 });
    expect(r).toMatchObject({ ok: false, falha: "tempo_esgotado" });
  });
});

describe("sem token: nada sai, e o recado é de espera", () => {
  it("desligado não chama a rede", async () => {
    delete process.env.CONTROL_ROOM_SERVICE_TOKEN;
    expect(cofreLigado()).toBe(false);
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: false, falha: "desligado", erro: AGUARDANDO_O_COFRE });
    expect(recebidos).toHaveLength(0);
  });

  it("generate() sem token e sem chave: a frase diz 'aguardando a IA da Control Room'", async () => {
    delete process.env.CONTROL_ROOM_SERVICE_TOKEN;
    const r = await generate({ system: "s", user: "u", agentId: "copy", workspaceId: "w1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Aguardando a IA da Control Room");
  });

  it("leitura de brand book sem token: recado de espera", async () => {
    delete process.env.CONTROL_ROOM_SERVICE_TOKEN;
    const r = await lerPeloCofre({ workspaceId: "w1", fileName: "bb.pdf", mimeType: "application/pdf", texto: "manual", system: "s", instrucao: "i" });
    expect(r).toEqual({ disponivel: false, motivo: RECADO_SEM_IA });
  });
});

describe("o custo cai no centro certo", () => {
  it("cliente sem centro próprio → centro da casa", async () => {
    proxima = { status: 200, corpo: { texto: "ok" } };
    await pedirAoCofre({ ...TEXTO, clientId: "cli_sem_centro" });
    expect(recebidos[0]!.corpo.centroCustoId).toBe("cc-casa");
  });

  it("sem centro nenhum → não chama (seria um 422 pago em tempo)", async () => {
    delete process.env.CONTROL_ROOM_CENTRO_CUSTO_PADRAO;
    const r = await pedirAoCofre({ ...TEXTO, clientId: "cli_sem_centro" });
    expect(r).toMatchObject({ ok: false, falha: "sem_centro_de_custo" });
    expect(recebidos).toHaveLength(0);
  });

  it("o corpo nunca carrega o token", () => {
    expect(JSON.stringify(corpoDoPedido(TEXTO, "cc", "ref"))).not.toContain(TOKEN);
  });
});

describe("os chamadores de verdade passam pelo cofre", () => {
  it("generate() (calendário, legenda, analista): entrega o JSON do cofre e diz o provedor", async () => {
    proxima = { status: 200, corpo: { resultado: "{\"legenda\":\"oi\"}", modelo: "deepseek-chat" } };
    const r = await generate({ system: "s", user: "u", agentId: "copy", workspaceId: "w1", clientId: "cli_com_centro" });
    expect(r).toMatchObject({ ok: true, data: { legenda: "oi" }, provider: "deepseek", model: "deepseek-chat" });
    expect(recebidos[0]!.corpo.mensagens).toEqual([{ role: "system", content: "s" }, { role: "user", content: "u" }]);
  });

  it("generate() com 409 do cofre: a falha do cofre é a que sobe", async () => {
    proxima = { status: 409, corpo: { erro: "sem modelo" } };
    const r = await generate({ system: "s", user: "u", agentId: "copy", workspaceId: "w1" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Cofre HTTP 409");
  });

  it("o ÁRBITRO (apenasOPreferido) nunca passa pelo cofre — independência do juiz", async () => {
    await generate({ system: "s", user: "u", agentId: "qualidade", workspaceId: "w1", preferredProvider: "xai", apenasOPreferido: true });
    expect(recebidos).toHaveLength(0);
  });

  it("generateDesign() (arte): a imagem vem do cofre", async () => {
    proxima = { status: 200, corpo: { url: "https://cdn.exemplo/arte.png", modelo: "grok-2-image" } };
    const r = await generateDesign({ prompt: "temaki", workspaceId: "w1", conta: { clientId: "cli_com_centro" } });
    expect(r).toMatchObject({ ok: true, url: "https://cdn.exemplo/arte.png", provider: "cofre" });
    expect(recebidos[0]!.corpo.modalidade).toBe("image");
  });

  it("generateDesign() com 422: para — pedido ruim não vai a outro produtor", async () => {
    proxima = { status: 422, corpo: { erro: "payload" } };
    const r = await generateDesign({ prompt: "temaki", workspaceId: "w1" });
    expect(r).toMatchObject({ ok: false, reason: "bad_request" });
  });

  it("leitura de brand book: o texto vai ao cofre", async () => {
    proxima = { status: 200, corpo: { texto: "{\"tone\":\"x\"}" } };
    const r = await lerPeloCofre({ workspaceId: "w1", clientId: "cli_com_centro", fileName: "bb.pdf", mimeType: "application/pdf", texto: "Paleta: vermelho", system: "s", instrucao: "i" });
    expect(r).toEqual({ disponivel: true, ok: true, texto: "{\"tone\":\"x\"}" });
    expect(JSON.stringify(recebidos[0]!.corpo.mensagens)).toContain("Paleta: vermelho");
  });
});

describe("sem endereço: desligado, também", () => {
  it("token sem CONTROL_ROOM_URL não liga o cofre (endereço não mora no código)", async () => {
    delete process.env.CONTROL_ROOM_URL;
    expect(cofreLigado()).toBe(false);
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: false, falha: "desligado" });
    expect(recebidos).toHaveLength(0);
  });
});
