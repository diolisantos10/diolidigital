// analisarImagens() — a camada de VISÃO.
//
// O que estes testes protegem, e por quê:
//   • o contrato "nunca lança": falha vira { ok:false, motivo }, sempre;
//   • a DEGRADAÇÃO DECLARADA: sem provedor com visão, o chamador recebe um
//     motivo legível e segue — nunca uma exceção;
//   • o teto de imagens e de tamanho (isto roda por cliente, por ciclo: teto
//     que não é testado é teto que some no próximo refactor);
//   • a URL do CDN da Meta EXPIRA: 403 numa imagem não pode derrubar as outras;
//   • DeepSeek/Perplexity não enxergam — ter chave delas não pode virar
//     "visão disponível".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const chaves = vi.hoisted(() => ({ porProvedor: new Map<string, { apiKey: string; model: string | null }>() }));

vi.mock("@/lib/ai/resolve-key", () => ({
  resolveProviderKey: vi.fn(async (p: string) => {
    const achou = chaves.porProvedor.get(p);
    return achou ? { ...achou, source: "ui" as const } : null;
  }),
  isAiProvider: (v: string) => ["openai", "claude", "gemini", "deepseek", "perplexity"].includes(v),
  PROVIDER_INTEGRATION_ID: {},
  ALL_PROVIDERS: ["claude", "openai", "gemini", "deepseek", "perplexity"],
}));

import {
  analisarImagens,
  visaoDisponivel,
  LIMITE_DE_IMAGENS,
  MAXIMO_DE_SALTOS,
  TAMANHO_MAXIMO_POR_IMAGEM,
  PROVEDORES_COM_VISAO,
  honraDetalhe,
  chamadasPagasNoPiorCaso,
} from "@/lib/ai/visao";

function conecta(provedor: string, model: string | null = null) {
  chaves.porProvedor.set(provedor, { apiKey: `chave-de-${provedor}`, model });
}

// ─── respostas falsas ───────────────────────────────────────────────────────

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function respostaDeImagem(bytes: Uint8Array = JPEG, contentType = "image/jpeg") {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType, "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}
function imagemMorta(status = 403) {
  return { ok: false, status, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
}
/** Um 302 de verdade: `redirect:"manual"` faz o fetch devolver isto, não seguir. */
function redirecionaPara(destino: string, status = 302) {
  return {
    ok: false, status,
    headers: new Headers({ location: destino }),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
function openAiOk(texto: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: texto } }] }) };
}
function claudeOk(texto: string) {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: texto }] }) };
}
function httpErro(status: number) {
  return { ok: false, status, json: async () => ({}), headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
}

const fetchMock = vi.fn();

/** Roteador: URL de imagem devolve bytes; host de IA devolve o que for pedido. */
function roteia(daIa: (url: string) => unknown, daImagem: (url: string) => unknown = () => respostaDeImagem()) {
  fetchMock.mockImplementation(async (url: string) => {
    const ehIa = /openai\.com|anthropic\.com|googleapis\.com/.test(url);
    return ehIa ? daIa(url) : daImagem(url);
  });
}

const URL_DO_FEED = "https://scontent.cdninstagram.com/v/t51/post1.jpg?_nc_ht=x&oe=ABC";

beforeEach(() => {
  chaves.porProvedor.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.BRAIN_AI_PROVIDER;
});
afterEach(() => vi.unstubAllGlobals());

// ─── 1. Sucesso ─────────────────────────────────────────────────────────────

describe("sucesso", () => {
  it("baixa a imagem, manda como data URL e devolve o texto do modelo", async () => {
    conecta("openai");
    roteia(() => openAiOk("feed com fundo claro e tipografia serifada"));

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: URL_DO_FEED, rotulo: "post 1" }],
      pergunta: "descreva o estilo visual",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toContain("serifada");
    expect(r.provedor).toBe("openai");
    expect(r.imagensLidas).toBe(1);
    expect(r.imagensIgnoradas).toEqual([]);

    const chamadaIa = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("openai.com"))!;
    const corpo = JSON.parse(chamadaIa[1].body as string);
    const partes = corpo.messages[1].content;
    expect(partes[0]).toEqual({ type: "text", text: "descreva o estilo visual" });
    expect(partes[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    // Padrão barato: detail "low". Ver a seção de CUSTO no cabeçalho.
    expect(partes[1].image_url.detail).toBe("low");
  });

  it("aceita bytes em mão, sem baixar nada", async () => {
    conecta("openai");
    roteia(() => openAiOk("ok"));

    const r = await analisarImagens({
      imagens: [{ tipo: "bytes", bytes: JPEG, mime: "image/jpeg" }],
      pergunta: "o que é isto?",
    });

    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // só a IA
  });

  it("formato json extrai o objeto para `dados` e mantém o texto cru", async () => {
    conecta("openai");
    roteia(() => openAiOk('```json\n{"paleta":["#fff","#000"]}\n```'));

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: URL_DO_FEED }],
      pergunta: "qual a paleta?",
      formato: "json",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toEqual({ paleta: ["#fff", "#000"] });
    expect(r.texto).toContain("paleta");
  });

  it("o modelo de visão NÃO é o modelo escolhido na tela (que pode ser cego)", async () => {
    conecta("openai", "o1-mini"); // modelo de texto escolhido em Integrações
    roteia(() => openAiOk("ok"));

    await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    const corpo = JSON.parse(fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("openai.com"))![1].body as string);
    expect(corpo.model).toBe("gpt-4o-mini");
  });

  it("Claude recebe a imagem em base64 no formato dele", async () => {
    conecta("claude");
    roteia(() => claudeOk("estilo minimalista"));

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    expect(r.ok && r.provedor).toBe("claude");
    const corpo = JSON.parse(fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("anthropic.com"))![1].body as string);
    expect(corpo.messages[0].content[0].source).toMatchObject({ type: "base64", media_type: "image/jpeg" });
  });
});

// ─── 2. Degradação declarada ────────────────────────────────────────────────

describe("sem provedor com visão", () => {
  it("devolve motivo legível e NÃO chama rede nenhuma", async () => {
    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("sem_provedor_com_visao");
    expect(r.erro).toContain("Integrações");
    expect(fetchMock).not.toHaveBeenCalled(); // nem a imagem foi baixada
  });

  it("chave de DeepSeek/Perplexity NÃO conta como visão", async () => {
    conecta("deepseek");
    conecta("perplexity");

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("sem_provedor_com_visao");
    expect(PROVEDORES_COM_VISAO).not.toContain("deepseek");

    expect(await visaoDisponivel()).toMatchObject({ disponivel: false, provedor: null });
  });

  it("visaoDisponivel diz quem atenderia", async () => {
    conecta("openai");
    expect(await visaoDisponivel()).toMatchObject({ disponivel: true, provedor: "openai", modelo: "gpt-4o-mini" });
  });
});

// ─── 3. Erro do provedor / rede ─────────────────────────────────────────────

describe("falha da IA", () => {
  it("erro permanente do único provedor vira { ok:false }, não exceção", async () => {
    conecta("openai");
    roteia(() => httpErro(401));

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("erro_do_provedor");
    expect(r.erro).toContain("401");
  });

  it("rede caindo no meio não estoura para o chamador", async () => {
    conecta("openai");
    roteia(() => { throw new TypeError("fetch failed"); });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("erro_de_rede");
  });

  it("provedor preferido fora do ar → a reserva com visão entrega", async () => {
    conecta("claude");
    conecta("openai");
    roteia((url) => (url.includes("anthropic.com") ? httpErro(401) : openAiOk("entregue pela reserva")));

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provedor).toBe("openai");
  });

  it("erro permanente não é re-tentado — retentativa REENVIA a imagem e é paga", async () => {
    conecta("openai");
    let chamadasIa = 0;
    roteia(() => { chamadasIa++; return httpErro(400); });

    await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(chamadasIa).toBe(1);
  });
});

// ─── 3b. O CUSTO MEDIDO (achado da 7ª auditoria) ────────────────────────────
//
// A telemetria de custo em `leitura-do-cliente.ts` dizia "≈US$ 0,011 por ciclo"
// — o preço de UMA chamada bem-sucedida. Com retentativa e troca de provedor,
// o mesmo ciclo pode custar 4×. Número escrito à mão em cabeçalho envelhece
// errado; por isso o gasto agora VOLTA MEDIDO no resultado.

describe("chamadasPagas — o custo do ciclo é medido, não estimado em comentário", () => {
  it("chamada que dá certo de primeira: 1 chamada paga", async () => {
    conecta("openai");
    roteia(() => openAiOk("ok"));
    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(true);
    expect(r.chamadasPagas).toBe(1);
  });

  it("o PIOR CASO dos três provedores é 4 chamadas pagas — 2 + 1 + 1, e o número aparece", async () => {
    conecta("claude"); conecta("openai"); conecta("gemini");
    // 429 é passageiro: o preferido re-tenta, as reservas levam um tiro cada.
    let chamadasIa = 0;
    roteia(() => { chamadasIa++; return httpErro(429); });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    expect(chamadasIa).toBe(4);
    expect(r.chamadasPagas).toBe(4);
    expect(r.chamadasPagas).toBe(chamadasPagasNoPiorCaso(3));
  });

  it("caminho que NÃO gasta um centavo devolve 0 — sem provedor, sem imagem legível", async () => {
    const semProvedor = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(semProvedor.ok).toBe(false);
    expect(semProvedor.chamadasPagas).toBe(0);

    conecta("openai");
    fetchMock.mockImplementation(async () => imagemMorta(403));
    const semImagem = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(semImagem.ok).toBe(false);
    expect(semImagem.chamadasPagas).toBe(0);
  });
});

// ─── 4. A imagem que não dá para ler ────────────────────────────────────────

describe("imagem inacessível", () => {
  it("URL do CDN expirada (403) não derruba as outras — a leitura fica parcial e DITA", async () => {
    conecta("openai");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("li uma");
      return url.includes("morta") ? imagemMorta(403) : respostaDeImagem();
    });

    const r = await analisarImagens({
      imagens: [
        { tipo: "url", url: "https://scontent.cdninstagram.com/morta.jpg", rotulo: "post velho" },
        { tipo: "url", url: URL_DO_FEED, rotulo: "post novo" },
      ],
      pergunta: "?",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imagensLidas).toBe(1);
    expect(r.imagensIgnoradas).toHaveLength(1);
    expect(r.imagensIgnoradas[0].rotulo).toBe("post velho");
    expect(r.imagensIgnoradas[0].motivo).toContain("403");
    expect(r.imagensIgnoradas[0].motivo).toContain("expirou");
  });

  it("todas inacessíveis → falha sem gastar um centavo de IA", async () => {
    conecta("openai");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) throw new Error("não devia ter chamado a IA");
      return imagemMorta(404);
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("nenhuma_imagem_lida");
    expect(r.imagensIgnoradas).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes("openai.com"))).toBe(false);
  });

  it("endereço interno é recusado antes de qualquer requisição", async () => {
    conecta("openai");
    roteia(() => openAiOk("ok"));

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: "http://169.254.169.254/latest/meta-data/", rotulo: "metadata" }],
      pergunta: "?",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("nenhuma_imagem_lida");
    expect(r.imagensIgnoradas?.[0].motivo).toContain("interno");
    expect(fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes("169.254"))).toBe(false);
  });

  // ── SSRF por redirecionamento ─────────────────────────────────────────────
  // Estes quatro são o coração da trava. A URL vem do FEED DO CLIENTE, isto é,
  // de terceiro: checar só o hostname original e depois seguir o 302 às cegas
  // é exatamente o furo que leva ao metadata da nuvem, onde moram credenciais.

  it("302 para host interno é RECUSADO — a checagem vale em cada salto, não só na URL original", async () => {
    conecta("openai");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("ok");
      if (url.includes("169.254")) throw new Error("NUNCA deveria ter buscado o metadata");
      return redirecionaPara("http://169.254.169.254/latest/meta-data/iam/security-credentials/");
    });

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: "https://cdn-publico.exemplo.com/foto.jpg", rotulo: "isca" }],
      pergunta: "?",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("nenhuma_imagem_lida");
    expect(r.imagensIgnoradas?.[0].motivo).toContain("redirecionamento recusado");
    expect(r.imagensIgnoradas?.[0].motivo).toContain("interno");
    // O que realmente importa: o servidor NÃO tocou no endereço de metadados.
    expect(fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes("169.254"))).toBe(false);
  });

  it("redirecionamento legítimo (CDN → CDN) é seguido normalmente", async () => {
    conecta("openai");
    const visitadas: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("li a imagem redirecionada");
      visitadas.push(url);
      if (url.includes("scontent.cdninstagram.com")) {
        return redirecionaPara("https://scontent-gru1.cdninstagram.com/v/t51/post1.jpg");
      }
      return respostaDeImagem();
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imagensLidas).toBe(1);
    expect(r.imagensIgnoradas).toEqual([]);
    expect(visitadas[1]).toContain("scontent-gru1.cdninstagram.com");
  });

  it("Location relativa é resolvida contra o salto ATUAL e também passa pelo porteiro", async () => {
    conecta("openai");
    const visitadas: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("ok");
      visitadas.push(url);
      return url.includes("/real/") ? respostaDeImagem() : redirecionaPara("/real/post1.jpg");
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    expect(r.ok).toBe(true);
    expect(visitadas[1]).toBe("https://scontent.cdninstagram.com/real/post1.jpg");
  });

  it("cadeia de redirecionamentos sem fim para no teto de saltos", async () => {
    conecta("openai");
    let buscas = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("ok");
      buscas++;
      return redirecionaPara(`https://cdn.exemplo.com/salto-${buscas}.jpg`);
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.imagensIgnoradas?.[0].motivo).toContain("redirecionamentos demais");
    expect(buscas).toBe(MAXIMO_DE_SALTOS + 1); // a original + os saltos tolerados
  });

  it("conteúdo que não é imagem é descartado", async () => {
    conecta("openai");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("ok");
      return {
        ok: true, status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => new TextEncoder().encode("<html>login</html>").buffer,
      };
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("nenhuma_imagem_lida");
  });
});

// ─── 5. Os tetos ────────────────────────────────────────────────────────────

describe("limites", () => {
  it(`manda no máximo ${LIMITE_DE_IMAGENS} imagens e reporta o excedente`, async () => {
    conecta("openai");
    roteia(() => openAiOk("ok"));

    const imagens = Array.from({ length: LIMITE_DE_IMAGENS + 3 }, (_, i) => ({
      tipo: "url" as const, url: `${URL_DO_FEED}&i=${i}`, rotulo: `post ${i}`,
    }));

    const r = await analisarImagens({ imagens, pergunta: "?" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imagensLidas).toBe(LIMITE_DE_IMAGENS);
    expect(r.imagensIgnoradas).toHaveLength(3);
    expect(r.imagensIgnoradas[0].motivo).toContain("limite");

    const corpo = JSON.parse(fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("openai.com"))![1].body as string);
    expect(corpo.messages[1].content.filter((c: { type: string }) => c.type === "image_url")).toHaveLength(LIMITE_DE_IMAGENS);
  });

  it("imagem acima do tamanho máximo é descartada pelo content-length, sem baixar tudo", async () => {
    conecta("openai");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("openai.com")) return openAiOk("ok");
      return {
        ok: true, status: 200,
        headers: new Headers({ "content-type": "image/jpeg", "content-length": String(TAMANHO_MAXIMO_POR_IMAGEM + 1) }),
        arrayBuffer: async () => { throw new Error("não devia ter baixado o corpo"); },
      };
    });

    const r = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED, rotulo: "gigante" }], pergunta: "?" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.imagensIgnoradas?.[0].motivo).toContain("grande demais");
  });

  // ── O custo declarado tem que bater com o código ───────────────────────────
  // `detalhe` é um botão da OpenAI, não um conceito da casa. Claude e Gemini
  // cobram pela área em pixels. Como Claude é o PRIMEIRO da ordem, o caso
  // padrão é justamente o que ignora `detalhe` — e isso é DITO no retorno.

  it("na OpenAI o `detalhe` pega e é reportado como aplicado", async () => {
    conecta("openai");
    roteia(() => openAiOk("ok"));

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?", detalhe: "alto",
    });

    expect(r.ok && r.detalheAplicado).toBe(true);
    const corpo = JSON.parse(fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("openai.com"))![1].body as string);
    expect(corpo.messages[1].content[1].image_url.detail).toBe("high");
  });

  it("no Claude o `detalhe` NÃO existe — a imagem é cobrada inteira, e o retorno diz isso", async () => {
    conecta("claude");
    roteia(() => claudeOk("ok"));

    const r = await analisarImagens({
      imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "?", detalhe: "baixo",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provedor).toBe("claude");
    expect(r.detalheAplicado).toBe(false); // o cabeçalho de CUSTO depende disto
    // E o corpo não carrega nenhum campo de detalhe fingindo que carrega.
    const corpo = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("anthropic.com"))![1].body as string;
    expect(corpo).not.toContain("detail");
  });

  it("o provedor PADRÃO (Claude, primeiro da ordem) é o que ignora `detalhe`", () => {
    expect(PROVEDORES_COM_VISAO[0]).toBe("claude");
    expect(honraDetalhe(PROVEDORES_COM_VISAO[0])).toBe(false);
    expect(honraDetalhe("openai")).toBe(true);
    expect(honraDetalhe("gemini")).toBe(false);
  });

  it("pergunta vazia ou lista vazia é pedido inválido, não chamada à IA", async () => {
    conecta("openai");
    const a = await analisarImagens({ imagens: [{ tipo: "url", url: URL_DO_FEED }], pergunta: "   " });
    const b = await analisarImagens({ imagens: [], pergunta: "?" });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.motivo).toBe("pedido_invalido");
    if (!b.ok) expect(b.motivo).toBe("pedido_invalido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
