// O COFRE, POR PAREAMENTO, contra um SERVIDOR FALSO de verdade (HTTP local).
//
// Contrato da Control Room (PR #118, 04/10/2026): o Dioli gera o próprio
// segredo, guarda cifrado, pede o pareamento mandando SÓ o hash, e o Diego
// aprova com um clique. Ordem do CEO para o teste: "pendente, aprovado, 401
// (repareia), 409, 422, tempo esgotado". O pedido sai pela rede de verdade
// (fetch → node:http) e o servidor confere o que a Control Room conferiria.
//
// As metades que importam:
//   • o SEGREDO nunca sai — no pareamento vai só o hash; nada devolvido o carrega;
//   • pendente: o gateway responde 401 e NADA é pedido de novo (o Diego está
//     para clicar no pedido que existe) — e a casa diz "aguardando";
//   • aprovado e depois 401: aí sim repareia, com segredo NOVO;
//   • persistente: memória do processo apagada (deploy) → o segredo volta do
//     banco, sem pedido novo;
//   • fora de produção, ninguém pede pareamento.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

type Linha = {
  id: string; segredoCifrado: string; hashDoSegredo: string; estado: string;
  solicitadoEm: Date; aprovadoEm: Date | null; ultimaResposta: string | null;
};
const db = vi.hoisted(() => ({
  centros: {} as Record<string, string | null>,
  linha: null as null | {
    id: string; segredoCifrado: string; hashDoSegredo: string; estado: string;
    solicitadoEm: Date; aprovadoEm: Date | null; ultimaResposta: string | null;
  },
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    client: {
      findUnique: vi.fn(async (q: { where: { id: string } }): Promise<{ centroCustoId: string | null } | null> =>
        q.where.id in db.centros ? { centroCustoId: db.centros[q.where.id] ?? null } : null),
    },
    cofrePareamento: {
      findUnique: vi.fn(async (): Promise<Linha | null> => (db.linha ? { ...db.linha } : null)),
      upsert: vi.fn(async (q: { create: Partial<Linha> & { id: string }; update: Partial<Linha> }): Promise<Linha> => {
        db.linha = db.linha
          ? { ...db.linha, ...q.update }
          : { estado: "pendente", aprovadoEm: null, ultimaResposta: null, solicitadoEm: new Date(), segredoCifrado: "", hashDoSegredo: "", ...q.create };
        return { ...db.linha };
      }),
      update: vi.fn(async (q: { data: Partial<Linha> }): Promise<Linha> => {
        if (!db.linha) throw new Error("sem linha");
        db.linha = { ...db.linha, ...q.data };
        return { ...db.linha };
      }),
    },
  },
}));
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: vi.fn(async (): Promise<void> => undefined) }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: vi.fn(async (): Promise<null> => null) }));
vi.mock("@/lib/ai/resolve-key", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/resolve-key")>()),
  resolveProviderKey: vi.fn(async (): Promise<null> => null),
}));

import { pedirAoCofre, cofreLigado, cofreAprovado, corpoDoPedido, AGUARDANDO_O_COFRE, CAMINHO_PADRAO_DO_GATEWAY } from "@/lib/ai/cofre";
import {
  CAMINHO_DO_PAREAMENTO, ESPERA_ENTRE_SONDAGENS_MS, esquecerMemoriaDoPareamento, estadoDoPareamento,
  garantirPareamento, hashDoSegredo, resumoDoPareamento,
} from "@/lib/ai/pareamento-do-cofre";
import { decryptSecret } from "@/lib/security/crypto";
import { generate } from "@/lib/ai/generate";
import { generateDesign } from "@/lib/ai/design-engine";
import { lerPeloCofre, RECADO_SEM_IA } from "@/lib/ai/leitura-pelo-cofre";

interface Recebido { caminho: string; token: string | undefined; cookie: string | undefined; corpo: Record<string, unknown> }
const recebidos: Recebido[] = [];
/** O que o GATEWAY responde na próxima chamada. */
let proxima: { status: number; corpo: unknown; atrasoMs?: number } = { status: 200, corpo: {} };
/** O que o PAREAMENTO responde. */
let respostaDoPareamento: { status: number; corpo: unknown } = { status: 202, corpo: { ok: true, status: "pendente" } };

let servidor: http.Server;
let base = "";

const pedidosDePareamento = () => recebidos.filter((r) => r.caminho === CAMINHO_DO_PAREAMENTO);
const chamadasAoGateway = () => recebidos.filter((r) => r.caminho === CAMINHO_PADRAO_DO_GATEWAY);
const segredoGuardado = () => (db.linha ? decryptSecret(db.linha.segredoCifrado) : null);

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    let bruto = "";
    req.on("data", (c) => (bruto += c));
    req.on("end", () => {
      let corpo: Record<string, unknown> = {};
      try { corpo = JSON.parse(bruto); } catch { /* corpo inválido fica vazio */ }
      recebidos.push({ caminho: req.url ?? "", token: req.headers["x-service-token"] as string | undefined, cookie: req.headers.cookie, corpo });
      const r = req.url === CAMINHO_DO_PAREAMENTO ? respostaDoPareamento : proxima;
      const responder = () => {
        if (res.destroyed) return;
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(r.corpo));
      };
      const atraso = req.url === CAMINHO_DO_PAREAMENTO ? 0 : (proxima.atrasoMs ?? 0);
      if (atraso) setTimeout(responder, atraso);
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

/** Pareia (pedido feito) e, se pedido, simula o clique do Diego já dado. */
async function parear(aprovado: boolean): Promise<string> {
  await garantirPareamento("teste");
  if (aprovado) {
    db.linha!.estado = "aprovado";
    db.linha!.aprovadoEm = new Date();
    esquecerMemoriaDoPareamento();
    await garantirPareamento("novo boot"); // como um deploy: lê do banco
  }
  recebidos.length = 0;
  return segredoGuardado()!;
}

beforeEach(() => {
  vi.useRealTimers();
  recebidos.length = 0;
  db.linha = null;
  db.centros = { cli_com_centro: "cc-cliente-123", cli_sem_centro: null };
  process.env.CREDENTIALS_SECRET = "chave-de-teste-do-cofre";
  process.env.COFRE_PAREAR_FORA_DE_PRODUCAO = "1";
  process.env.CONTROL_ROOM_URL = base;
  process.env.CONTROL_ROOM_CENTRO_CUSTO_PADRAO = "cc-casa";
  delete process.env.CONTROL_ROOM_GATEWAY_PATH;
  esquecerMemoriaDoPareamento();
  proxima = { status: 200, corpo: {} };
  respostaDoPareamento = { status: 202, corpo: { ok: true, status: "pendente" } };
});

const TEXTO = { modalidade: "text" as const, mensagens: [{ role: "user" as const, content: "oi" }], clientId: "cli_com_centro", agentId: "copy" };

describe("o pedido de pareamento", () => {
  it("gera o segredo, guarda CIFRADO e manda SÓ o hash (64 hex minúsculos) com o produto e a origem", async () => {
    await garantirPareamento("boot do serviço, produção");
    const [p] = pedidosDePareamento();
    expect(p!.corpo).toEqual({ produto: "dioli-digital", hash: expect.stringMatching(/^[0-9a-f]{64}$/), origem: "boot do serviço, produção" });
    const segredo = segredoGuardado()!;
    expect(segredo).toMatch(/^[0-9a-f]{64}$/); // 32 bytes em hex
    expect(p!.corpo.hash).toBe(hashDoSegredo(segredo));
    expect(JSON.stringify(p!.corpo)).not.toContain(segredo);
    expect(db.linha!.segredoCifrado).not.toContain(segredo); // nunca em claro no banco
    expect(estadoDoPareamento()).toBe("pendente");
  });

  it("PERSISTENTE: memória apagada (novo deploy) → o segredo volta do banco, SEM pedido novo", async () => {
    await garantirPareamento("boot 1");
    const primeiro = segredoGuardado();
    esquecerMemoriaDoPareamento();
    await garantirPareamento("boot 2");
    expect(pedidosDePareamento()).toHaveLength(1);
    expect(segredoGuardado()).toBe(primeiro);
  });

  it("fora de produção ninguém pede pareamento (não substitui o pedido real)", async () => {
    delete process.env.COFRE_PAREAR_FORA_DE_PRODUCAO;
    await garantirPareamento("boot local");
    expect(recebidos).toHaveLength(0);
    expect(db.linha).toBeNull();
  });

  it("o estado nunca expõe o segredo — só o começo do hash", async () => {
    await garantirPareamento("boot");
    const r = await resumoDoPareamento();
    expect(r.estado).toBe("pendente");
    expect(r.hashInicio).toBe(db.linha!.hashDoSegredo.slice(0, 8));
    expect(JSON.stringify(r)).not.toContain(segredoGuardado()!);
  });
});

describe("PENDENTE: aguardando o clique do Diego", () => {
  it("o gateway responde 401 → 'aguardando', SEM pedido novo de pareamento", async () => {
    await parear(false);
    proxima = { status: 401, corpo: { erro: "nao_pareado" } };
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: false, falha: "desligado", erro: AGUARDANDO_O_COFRE });
    expect(pedidosDePareamento()).toHaveLength(0);
    expect(estadoDoPareamento()).toBe("pendente");
  });

  it("entre sondagens não chama a rede (não martela a Control Room)", async () => {
    await parear(false);
    proxima = { status: 401, corpo: {} };
    await pedirAoCofre(TEXTO);
    await pedirAoCofre(TEXTO);
    await pedirAoCofre(TEXTO);
    expect(chamadasAoGateway()).toHaveLength(1);
  });

  it("passada a espera, sonda de novo — e o 200 vira APROVADO", async () => {
    await parear(false);
    proxima = { status: 401, corpo: {} };
    const agora = Date.now();
    const espiao = vi.spyOn(Date, "now");
    espiao.mockReturnValue(agora);
    await pedirAoCofre(TEXTO);
    espiao.mockReturnValue(agora + ESPERA_ENTRE_SONDAGENS_MS + 1);
    proxima = { status: 200, corpo: { texto: "ok", modelo: "deepseek-chat" } };
    const r = await pedirAoCofre(TEXTO);
    espiao.mockRestore();
    expect(r.ok).toBe(true);
    expect(cofreAprovado()).toBe(true);
    expect(db.linha!.estado).toBe("aprovado");
  });
});

describe("APROVADO: o pedido sai certo e a resposta volta", () => {
  it("texto: o SEGREDO no X-Service-Token (nunca o hash, nunca cookie), caminho e corpo do contrato", async () => {
    const segredo = await parear(true);
    proxima = { status: 200, corpo: { resultado: { texto: "olá" }, modelo: "deepseek-chat", uso: { entrada: 10, saida: 3 }, custo: 0.0004 } };
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: true, texto: "olá", modelo: "deepseek-chat", uso: { entrada: 10, saida: 3 }, custo: 0.0004 });
    const [p] = chamadasAoGateway();
    expect(p!.token).toBe(segredo);
    expect(p!.token).not.toBe(db.linha!.hashDoSegredo);
    expect(p!.cookie).toBeUndefined();
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
  });

  it("imagem: modalidade image, prompt no corpo, e a imagem volta como URL", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { resultado: { b64_json: "A".repeat(64) }, modelo: "grok-2-image" } };
    const r = await pedirAoCofre({ modalidade: "image", mensagens: [{ role: "user", content: "um temaki" }], clientId: "cli_com_centro", tamanho: "square" });
    expect(r.ok && r.imagemUrl).toMatch(/^data:image\/png;base64,A+$/);
    expect(chamadasAoGateway()[0]!.corpo).toMatchObject({ modalidade: "image", prompt: "um temaki", tamanho: "square" });
  });

  it("200 sem nada reconhecível é FALHA declarada — nunca texto inventado", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { status: "ok" } };
    expect(await pedirAoCofre(TEXTO)).toMatchObject({ ok: false, falha: "resposta_ilegivel" });
  });
});

describe("os erros do contrato", () => {
  it("401 DEPOIS de aprovado → repareia: segredo NOVO, pedido novo, estado pendente, e o segredo não vaza", async () => {
    const antigo = await parear(true);
    proxima = { status: 401, corpo: { erro: `revogado ${antigo}` } };
    const r = await pedirAoCofre(TEXTO);
    expect(r).toMatchObject({ ok: false, falha: "nao_autorizado", status: 401 });
    expect(pedidosDePareamento()).toHaveLength(1);
    const novo = segredoGuardado()!;
    expect(novo).not.toBe(antigo);
    expect(pedidosDePareamento()[0]!.corpo.hash).toBe(hashDoSegredo(novo));
    expect(estadoDoPareamento()).toBe("pendente");
    expect(JSON.stringify(r)).not.toContain(antigo);
    expect(JSON.stringify(r)).not.toContain(novo);
  });

  for (const [status, falha] of [[409, "sem_modelo"], [422, "corpo_invalido"], [500, "falha"]] as const) {
    it(`${status} → ${falha}, com o motivo do gateway e SEM o segredo`, async () => {
      const segredo = await parear(true);
      proxima = { status, corpo: { erro: `recusado para ${segredo}` } };
      const r = await pedirAoCofre(TEXTO);
      expect(r).toMatchObject({ ok: false, falha, status });
      expect(!r.ok && r.erro).toContain(`HTTP ${status}`);
      expect(JSON.stringify(r)).not.toContain(segredo);
      expect(pedidosDePareamento()).toHaveLength(0); // erro de pedido não repareia
    });
  }

  it("409/422 vindos de um PENDENTE provam que o segredo foi aceito → aprovado", async () => {
    await parear(false);
    proxima = { status: 409, corpo: { erro: "sem modelo" } };
    await pedirAoCofre(TEXTO);
    expect(estadoDoPareamento()).toBe("aprovado");
  });

  it("tempo esgotado → tempo_esgotado, sem pendurar", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { texto: "tarde demais" }, atrasoMs: 500 };
    expect(await pedirAoCofre({ ...TEXTO, timeoutMs: 100 })).toMatchObject({ ok: false, falha: "tempo_esgotado" });
  });
});

describe("sem pareamento: nada sai, e o recado é de espera", () => {
  it("sem segredo guardado não chama a rede", async () => {
    expect(cofreLigado()).toBe(false);
    expect(await pedirAoCofre(TEXTO)).toMatchObject({ ok: false, falha: "desligado", erro: AGUARDANDO_O_COFRE });
    expect(recebidos).toHaveLength(0);
  });

  it("generate() sem pareamento e sem chave: a frase diz 'aguardando a IA da Control Room'", async () => {
    const r = await generate({ system: "s", user: "u", agentId: "copy", workspaceId: "w1" });
    expect(!r.ok && r.error).toContain("Aguardando a IA da Control Room");
  });

  it("leitura de brand book sem pareamento: recado de espera", async () => {
    const r = await lerPeloCofre({ workspaceId: "w1", fileName: "bb.pdf", mimeType: "application/pdf", texto: "manual", system: "s", instrucao: "i" });
    expect(r).toEqual({ disponivel: false, motivo: RECADO_SEM_IA });
  });
});

describe("o custo cai no centro certo", () => {
  it("cliente sem centro próprio → centro da casa", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { texto: "ok" } };
    await pedirAoCofre({ ...TEXTO, clientId: "cli_sem_centro" });
    expect(chamadasAoGateway()[0]!.corpo.centroCustoId).toBe("cc-casa");
  });

  it("sem centro configurado → o do produto ('dioli-digital')", async () => {
    await parear(true);
    delete process.env.CONTROL_ROOM_CENTRO_CUSTO_PADRAO;
    proxima = { status: 200, corpo: { texto: "ok" } };
    await pedirAoCofre({ ...TEXTO, clientId: "cli_sem_centro" });
    expect(chamadasAoGateway()[0]!.corpo.centroCustoId).toBe("dioli-digital");
  });

  it("o corpo nunca carrega o segredo", async () => {
    const segredo = await parear(true);
    expect(JSON.stringify(corpoDoPedido(TEXTO, "cc", "ref"))).not.toContain(segredo);
  });
});

describe("os chamadores de verdade passam pelo cofre (aprovado)", () => {
  it("generate(): entrega o JSON do cofre e diz o provedor", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { resultado: "{\"legenda\":\"oi\"}", modelo: "deepseek-chat" } };
    const r = await generate({ system: "s", user: "u", agentId: "copy", workspaceId: "w1", clientId: "cli_com_centro" });
    expect(r).toMatchObject({ ok: true, data: { legenda: "oi" }, provider: "deepseek", model: "deepseek-chat" });
  });

  it("o ÁRBITRO (apenasOPreferido) nunca passa pelo cofre — independência do juiz", async () => {
    await parear(true);
    await generate({ system: "s", user: "u", agentId: "qualidade", workspaceId: "w1", preferredProvider: "xai", apenasOPreferido: true });
    expect(chamadasAoGateway()).toHaveLength(0);
  });

  it("generateDesign(): a imagem vem do cofre", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { url: "https://cdn.exemplo/arte.png", modelo: "grok-2-image" } };
    const r = await generateDesign({ prompt: "temaki", workspaceId: "w1", conta: { clientId: "cli_com_centro" } });
    expect(r).toMatchObject({ ok: true, url: "https://cdn.exemplo/arte.png", provider: "cofre" });
  });

  it("generateDesign() com 422: para — pedido ruim não vai a outro produtor", async () => {
    await parear(true);
    proxima = { status: 422, corpo: { erro: "payload" } };
    expect(await generateDesign({ prompt: "temaki", workspaceId: "w1" })).toMatchObject({ ok: false, reason: "bad_request" });
  });

  it("leitura de brand book: o texto vai ao cofre", async () => {
    await parear(true);
    proxima = { status: 200, corpo: { texto: "{\"tone\":\"x\"}" } };
    const r = await lerPeloCofre({ workspaceId: "w1", clientId: "cli_com_centro", fileName: "bb.pdf", mimeType: "application/pdf", texto: "Paleta: vermelho", system: "s", instrucao: "i" });
    expect(r).toEqual({ disponivel: true, ok: true, texto: "{\"tone\":\"x\"}" });
  });
});
