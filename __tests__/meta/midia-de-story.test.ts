// A MÍDIA DE STORY — moldura fixa (9:16, 1080×1920), teto de peso, e a
// conferência que decide ANTES do contêiner. Ver o cabeçalho de
// `lib/integrations/meta/midia-de-story.ts` para o porquê inteiro.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mediaAssetFindUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: { mediaAsset: { findUnique: mediaAssetFindUnique } } }));

// A resolução de DNS é mockada em TODO o arquivo: sem isto, qualquer teste que
// bata em `confereUrlExternaSegura` (achado de SSRF, 27/09/2026) faria uma
// consulta de rede de verdade — lenta, instável, e proibida no sandbox desta
// suíte. Padrão: resolve para um endereço público qualquer; cada teste que
// precisa de outro comportamento troca com `.mockResolvedValueOnce` /
// `.mockRejectedValueOnce`.
const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async (): Promise<Array<{ address: string; family: number }>> => [
    { address: "8.8.8.8", family: 4 },
  ]),
);
vi.mock("node:dns", () => ({ promises: { lookup: dnsLookupMock } }));

import {
  prepararImagemDeStory,
  conferirVideoDeStory,
  conferirImagemDeStory,
  metadadosDaMidiaDeStory,
  LARGURA_DA_STORY,
  ALTURA_DA_STORY,
  TAMANHO_MAXIMO_DA_IMAGEM_BYTES,
  TAMANHO_MAXIMO_DO_VIDEO_BYTES,
} from "@/lib/integrations/meta/midia-de-story";
import { confereUrlExternaSegura } from "@/lib/security/url-externa-segura";
import { ehJpeg, medidasDaImagem } from "@/lib/agency/media/para-jpeg";
import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";

/** Um PNG REAL de 12×9, vermelho — o mesmo fixture de `para-jpeg.test.ts`: o
 *  teste não pode depender da mesma biblioteca que está sendo conferida. */
const PNG_12x9 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAJCAIAAACJ2loDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVR4nGM4oWFDEDGMKmIgJggAkdN+kQD3XuYAAAAASUVORK5CYII=",
  "base64",
);

/** Um PNG "de mentira" — só a assinatura + o IHDR que declara a dimensão
 *  pedida, sem NENHUM dado de pixel de verdade. É exatamente a forma de um
 *  "decompression bomb": arquivo minúsculo, dimensão declarada gigantesca.
 *  `medidasDaImagem` lê só os campos fixos do cabeçalho — não valida que o
 *  resto do arquivo é coerente com o que o cabeçalho promete. */
function pngComDimensoesDeclaradas(largura: number, altura: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return b;
}

describe("prepararImagemDeStory — a moldura 9:16, sempre a mesma", () => {
  it("arquivo vazio é recusado com motivo, nunca convertido em silêncio", async () => {
    const r = await prepararImagemDeStory(Buffer.alloc(0), "image/png");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("vazio");
  });

  it("uma imagem de qualquer proporção sai EXATAMENTE 1080×1920, em JPEG, dentro do teto de 8 MB", async () => {
    const r = await prepararImagemDeStory(PNG_12x9, "image/png");
    expect(r.ok, r.ok ? "" : (r as { motivo: string }).motivo).toBe(true);
    if (!r.ok) return;

    expect(r.mime).toBe(MIME_DE_IMAGEM_ACEITO);
    expect(r.largura).toBe(LARGURA_DA_STORY);
    expect(r.altura).toBe(ALTURA_DA_STORY);
    expect(r.bytes).toBe(r.buffer.length);
    expect(r.bytes).toBeLessThanOrEqual(TAMANHO_MAXIMO_DA_IMAGEM_BYTES);

    expect(ehJpeg(r.buffer)).toBe(true);
    // A prova de que a moldura é a moldura pedida, não o tamanho original —
    // ao contrário de `paraJpeg`, aqui HÁ redimensionamento, de propósito.
    expect(medidasDaImagem(r.buffer)).toEqual({ largura: LARGURA_DA_STORY, altura: ALTURA_DA_STORY });
  });
});

// ── O SEGUNDO CAMINHO (o rasterizador da casa) ───────────────────────────────

const NAVEGADOR = await renderizadorDisponivel();
const prova = NAVEGADOR.disponivel ? it : it.skip;

describe("prepararImagemDeStory — o plano B não é decoração", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || process.env.MOLDE_SEM_NAVEGADOR === "1",
      "sem Chromium não dá para saber se o caminho de reserva funciona",
    ).toBe(true);
  });

  prova(
    "com `sharp` fora do ar, o rasterizador entrega a MESMA moldura",
    async () => {
      vi.resetModules();
      vi.doMock("sharp", () => {
        throw new Error("Cannot find module 'sharp'");
      });
      const { prepararImagemDeStory: semSharp } = await import(
        "@/lib/integrations/meta/midia-de-story"
      );

      const r = await semSharp(PNG_12x9, "image/png");
      expect(r.ok, r.ok ? "" : (r as { motivo: string }).motivo).toBe(true);
      if (!r.ok) return;

      expect(r.largura).toBe(LARGURA_DA_STORY);
      expect(r.altura).toBe(ALTURA_DA_STORY);
      expect(ehJpeg(r.buffer)).toBe(true);

      vi.doUnmock("sharp");
      vi.resetModules();
    },
    120_000,
  );

  // ── PIXEL-BOMB / decompression bomb no caminho do rasterizador ────────────
  // (achado de segurança, 27/09/2026) — as DUAS metades. Não depende de
  // Chromium estar disponível: a recusa acontece ANTES de qualquer chamada ao
  // navegador, e a prova disso é que `renderizarHtml` nunca é chamado.

  it("CASO PLANTADO — PNG que declara dimensão gigantesca é recusado ANTES de chamar o navegador", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    const renderizarHtmlEspiao = vi.fn();
    vi.doMock("@/lib/agency/design/renderizar", () => ({
      renderizarHtml: renderizarHtmlEspiao,
      renderizadorDisponivel: async () => ({ disponivel: true, caminho: "/x" }),
      MIME_DA_PECA_RENDERIZADA: "image/jpeg",
    }));
    const { prepararImagemDeStory: semSharp } = await import(
      "@/lib/integrations/meta/midia-de-story"
    );

    const pngGigante = pngComDimensoesDeclaradas(40_000, 40_000); // 1.6 bilhão de px
    const r = await semSharp(pngGigante, "image/png");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("teto de segurança");
    expect(renderizarHtmlEspiao).not.toHaveBeenCalled();

    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/agency/design/renderizar");
    vi.resetModules();
  });

  it("CASO LIMPO — imagem de dimensão normal continua indo ao rasterizador (a trava não pega o caso legítimo)", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    const { prepararImagemDeStory: semSharp } = await import(
      "@/lib/integrations/meta/midia-de-story"
    );

    // Mesmo fixture pequeno (12×9) já usado no teste do plano B — bem abaixo
    // do teto. Sem Chromium instalado no sandbox, o que importa provar aqui é
    // que a recusa por teto de pixels NÃO dispara — a falha (se houver) é
    // outra, do navegador ausente, nunca "acima do teto de segurança".
    const r = await semSharp(PNG_12x9, "image/png");
    if (!r.ok) expect(r.motivo).not.toContain("teto de segurança");

    vi.doUnmock("sharp");
    vi.resetModules();
  });
});

describe("prepararImagemDeStory — sem NENHUMA das duas ferramentas, a porta fecha e diz qual metade falta", () => {
  it("a recusa nomeia os dois caminhos", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    vi.doMock("@/lib/agency/design/renderizar", () => ({
      renderizarHtml: async () => ({ ok: false, motivo: "sem_navegador", erro: "Playwright não está instalado" }),
      renderizadorDisponivel: async () => ({ disponivel: false, caminho: null }),
      MIME_DA_PECA_RENDERIZADA: "image/jpeg",
    }));
    const { prepararImagemDeStory: semNada } = await import(
      "@/lib/integrations/meta/midia-de-story"
    );

    const r = await semNada(PNG_12x9, "image/png");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("sharp:");
    expect(r.motivo).toContain("rasterizador:");

    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/agency/design/renderizar");
    vi.resetModules();
  });
});

// ── conferirVideoDeStory ──────────────────────────────────────────────────────

describe("conferirVideoDeStory — só confere, nunca recodifica", () => {
  const OK = { mime: "video/mp4", codec: "h264", duracaoS: 15, bytes: 10 * 1024 * 1024 };

  it("dentro de tudo o que a Meta exige, aprova", () => {
    expect(conferirVideoDeStory(OK)).toEqual({ ok: true });
  });

  it("MIME que não é MP4/MOV é recusado por FORMATO, não por codec", () => {
    const r = conferirVideoDeStory({ ...OK, mime: "video/webm" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("MP4 ou MOV");
    expect(r.motivo).not.toContain("codec");
  });

  it("codec ausente recusa com o motivo exato da ficha", () => {
    const r = conferirVideoDeStory({ ...OK, codec: undefined });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("não consegui conferir o codec");
  });

  it("codec nulo é tratado como desconhecido, não como 'sem codec'", () => {
    const r = conferirVideoDeStory({ ...OK, codec: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("não consegui conferir o codec");
  });

  it("codec que não é H264 nem HEVC é recusado nomeando o codec", () => {
    const r = conferirVideoDeStory({ ...OK, codec: "vp9" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("vp9");
  });

  it("'H.264' e 'HEVC' em qualquer grafia contam como aceitos", () => {
    expect(conferirVideoDeStory({ ...OK, codec: "H.264" })).toEqual({ ok: true });
    expect(conferirVideoDeStory({ ...OK, codec: "HEVC" })).toEqual({ ok: true });
  });

  it("duração desconhecida (null) recusa — ausência não é aprovação por omissão", () => {
    const r = conferirVideoDeStory({ ...OK, duracaoS: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("duração");
  });

  it("duração fora de 3–60s recusa nos dois extremos", () => {
    expect(conferirVideoDeStory({ ...OK, duracaoS: 2 }).ok).toBe(false);
    expect(conferirVideoDeStory({ ...OK, duracaoS: 61 }).ok).toBe(false);
  });

  it("acima de 100 MB recusa", () => {
    const r = conferirVideoDeStory({ ...OK, bytes: TAMANHO_MAXIMO_DO_VIDEO_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("MB");
  });
});

// ── conferirImagemDeStory ──────────────────────────────────────────────────

describe("conferirImagemDeStory — pelos metadados disponíveis", () => {
  // `duracaoS`/`codec` não importam para a conferência de IMAGEM (são campos
  // de vídeo) — presentes aqui só porque o tipo `MetadadosDaMidia` os exige
  // desde que ganhou os dois (1B-B1, 27/09/2026).
  const NULOS = { duracaoS: null, codec: null };

  it("JPEG dentro do teto aprova", () => {
    expect(conferirImagemDeStory({ mime: "image/jpeg", bytes: 500_000, ...NULOS })).toEqual({ ok: true });
  });

  it("formato desconhecido (mime null) recusa — nunca 'provavelmente jpeg'", () => {
    const r = conferirImagemDeStory({ mime: null, bytes: 500_000, ...NULOS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("formato");
  });

  it("mime que não é JPEG recusa nomeando o mime", () => {
    const r = conferirImagemDeStory({ mime: "image/png", bytes: 500_000, ...NULOS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("image/png");
  });

  it("tamanho desconhecido (bytes null) recusa", () => {
    const r = conferirImagemDeStory({ mime: "image/jpeg", bytes: null, ...NULOS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("tamanho");
  });

  it("acima de 8 MB recusa", () => {
    const r = conferirImagemDeStory({ mime: "image/jpeg", bytes: TAMANHO_MAXIMO_DA_IMAGEM_BYTES + 1, ...NULOS });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("MB");
  });
});

// ── metadadosDaMidiaDeStory ───────────────────────────────────────────────────

describe("metadadosDaMidiaDeStory — MediaAsset primeiro, HEAD como reserva", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    mediaAssetFindUnique.mockReset();
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  function headersFalsos(mapa: Record<string, string>) {
    return { get: (chave: string) => mapa[chave] ?? null };
  }

  it("link da própria casa lê o REGISTRO, sem chamar rede", async () => {
    mediaAssetFindUnique.mockResolvedValue({ mimeType: "image/jpeg", sizeBytes: 123 });
    globalThis.fetch = vi.fn(async () => {
      throw new Error("não deveria chamar rede — o registro já respondeu");
    }) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/asset123?exp=1&sig=abc");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 123, duracaoS: null, codec: null });
    expect(mediaAssetFindUnique).toHaveBeenCalledWith({ where: { id: "asset123" } });
  });

  it("link da própria casa, com duracaoS/codec já medidos, devolve os dois (1B-B1)", async () => {
    mediaAssetFindUnique.mockResolvedValue({
      mimeType: "video/mp4", sizeBytes: 2_000_000, duracaoS: 12.5, codec: "h264",
    });
    globalThis.fetch = vi.fn(async () => {
      throw new Error("não deveria chamar rede — o registro já respondeu");
    }) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/asset-video?exp=1&sig=abc");
    expect(m).toEqual({ mime: "video/mp4", bytes: 2_000_000, duracaoS: 12.5, codec: "h264" });
  });

  it("URL externa (Drive, CDN do cliente) vai direto pro HEAD — duração/codec continuam null", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "video/mp4; codecs=avc1", "content-length": "1048576" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://cdn.cliente.com/video.mp4");
    expect(m).toEqual({ mime: "video/mp4", bytes: 1_048_576, duracaoS: null, codec: null });
    expect(mediaAssetFindUnique).not.toHaveBeenCalled();
  });

  it("registro não encontrado no banco cai para o HEAD — nunca 'assume genérico'", async () => {
    mediaAssetFindUnique.mockResolvedValue(null);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/sumiu?exp=1&sig=abc");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 999, duracaoS: null, codec: null });
  });

  it("banco fora do ar cai para o HEAD, nunca lança", async () => {
    mediaAssetFindUnique.mockRejectedValue(new Error("ECONNREFUSED"));
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/asset1?exp=1&sig=abc");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 999, duracaoS: null, codec: null });
  });

  it("HEAD sem sucesso, ou rede fora do ar: os campos voltam null — nunca um chute", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, headers: headersFalsos({}) })) as unknown as typeof fetch;
    expect(await metadadosDaMidiaDeStory("https://cdn.cliente.com/x.jpg")).toEqual({ mime: null, bytes: null, duracaoS: null, codec: null });

    globalThis.fetch = vi.fn(async () => { throw new Error("ETIMEDOUT"); }) as unknown as typeof fetch;
    expect(await metadadosDaMidiaDeStory("https://cdn.cliente.com/x.jpg")).toEqual({ mime: null, bytes: null, duracaoS: null, codec: null });
  });

  // ── SSRF (achado de segurança, 27/09/2026) — as DUAS metades ──────────────
  //
  // `mediaUrl` chega do corpo de `POST /api/meta/publish` sem aprovação de
  // cliente. Sem esta trava, um `mediaUrl` apontando para a rede interna faz o
  // PRÓPRIO SERVIDOR buscá-lo (HEAD). As provas abaixo: 1) o caso plantado é
  // barrado — e o `fetch` de rede NUNCA é chamado, não só "o resultado dá
  // null"; 2) o caso limpo (URL pública de verdade) continua funcionando.

  it("CASO PLANTADO — hostname que resolve para o endereço de metadado de nuvem (169.254.169.254) é recusado, e o fetch de rede nunca é chamado", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetchEspiao = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchEspiao;

    const m = await metadadosDaMidiaDeStory("https://noticias-do-cliente.example/capa.jpg");
    expect(m).toEqual({ mime: null, bytes: null, duracaoS: null, codec: null });
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("CASO PLANTADO — IP literal de rede privada (10.x, 127.x, ::1) é recusado sem sequer consultar o DNS", async () => {
    const fetchEspiao = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchEspiao;

    for (const url of [
      "http://127.0.0.1:8080/interno",
      "http://10.0.0.5/painel",
      "http://[::1]/interno",
    ]) {
      expect(await metadadosDaMidiaDeStory(url)).toEqual({ mime: null, bytes: null, duracaoS: null, codec: null });
    }
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it("CASO PLANTADO — esquema fora de http(s) (ex.: file:) é recusado", async () => {
    const fetchEspiao = vi.fn(async () => ({ ok: true, headers: headersFalsos({}) })) as unknown as typeof fetch;
    globalThis.fetch = fetchEspiao;

    expect(await metadadosDaMidiaDeStory("file:///etc/passwd")).toEqual({ mime: null, bytes: null, duracaoS: null, codec: null });
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it("CASO LIMPO — URL pública de verdade continua indo ao HEAD normalmente", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://cdn.cliente.com/capa.jpg");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 999, duracaoS: null, codec: null });
  });

  it("HEAD é chamado com `redirect: manual` — nunca segue um redirecionamento às cegas", async () => {
    const fetchEspiao = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchEspiao;

    await metadadosDaMidiaDeStory("https://cdn.cliente.com/capa.jpg");
    expect(fetchEspiao).toHaveBeenCalledWith("https://cdn.cliente.com/capa.jpg", { method: "HEAD", redirect: "manual" });
  });
});

// ── confereUrlExternaSegura — a trava de SSRF, isolada ───────────────────────

describe("confereUrlExternaSegura — barra o caso plantado, deixa passar o caso limpo", () => {
  beforeEach(() => {
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("IP literal privado/reservado (IPv4) recusa nomeando o endereço", async () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0"]) {
      const r = await confereUrlExternaSegura(`http://${ip}/x`);
      expect(r.ok, `esperava recusa para ${ip}`).toBe(false);
    }
  });

  it("IP literal privado/reservado (IPv6) recusa, incluindo o mapeamento IPv4-em-IPv6", async () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd12:3456::1"]) {
      expect((await confereUrlExternaSegura(`http://[${ip}]/x`)).ok).toBe(false);
    }
    expect((await confereUrlExternaSegura("http://[::ffff:169.254.169.254]/x")).ok).toBe(false);
  });

  it("hostname que RESOLVE (DNS) para endereço privado recusa — não basta o nome parecer público", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    const r = await confereUrlExternaSegura("https://parece-publico.example/capa.jpg");
    expect(r.ok).toBe(false);
  });

  it("localhost e *.local recusam sem consultar DNS", async () => {
    expect((await confereUrlExternaSegura("http://localhost/x")).ok).toBe(false);
    expect((await confereUrlExternaSegura("http://minha-maquina.local/x")).ok).toBe(false);
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it("esquema fora de http(s) recusa", async () => {
    expect((await confereUrlExternaSegura("file:///etc/passwd")).ok).toBe(false);
    expect((await confereUrlExternaSegura("ftp://exemplo.com/x")).ok).toBe(false);
  });

  it("URL malformada recusa em vez de lançar", async () => {
    expect((await confereUrlExternaSegura("não-é-uma-url")).ok).toBe(false);
  });

  it("DNS que não resolve recusa — dúvida nunca vira aprovação", async () => {
    dnsLookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect((await confereUrlExternaSegura("https://nao-existe.example/x")).ok).toBe(false);
  });

  it("CASO LIMPO — IP público literal aprova", async () => {
    expect((await confereUrlExternaSegura("https://8.8.8.8/x")).ok).toBe(true);
  });

  it("CASO LIMPO — hostname que resolve para IP público aprova", async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    const r = await confereUrlExternaSegura("https://cdn.cliente.com/capa.jpg");
    expect(r.ok).toBe(true);
  });
});
