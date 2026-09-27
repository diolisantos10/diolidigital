// A MÍDIA DE STORY — moldura fixa (9:16, 1080×1920), teto de peso, e a
// conferência que decide ANTES do contêiner. Ver o cabeçalho de
// `lib/integrations/meta/midia-de-story.ts` para o porquê inteiro.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mediaAssetFindUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: { mediaAsset: { findUnique: mediaAssetFindUnique } } }));

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
import { ehJpeg, medidasDaImagem } from "@/lib/agency/media/para-jpeg";
import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";

/** Um PNG REAL de 12×9, vermelho — o mesmo fixture de `para-jpeg.test.ts`: o
 *  teste não pode depender da mesma biblioteca que está sendo conferida. */
const PNG_12x9 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAJCAIAAACJ2loDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVR4nGM4oWFDEDGMKmIgJggAkdN+kQD3XuYAAAAASUVORK5CYII=",
  "base64",
);

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
  it("JPEG dentro do teto aprova", () => {
    expect(conferirImagemDeStory({ mime: "image/jpeg", bytes: 500_000 })).toEqual({ ok: true });
  });

  it("formato desconhecido (mime null) recusa — nunca 'provavelmente jpeg'", () => {
    const r = conferirImagemDeStory({ mime: null, bytes: 500_000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("formato");
  });

  it("mime que não é JPEG recusa nomeando o mime", () => {
    const r = conferirImagemDeStory({ mime: "image/png", bytes: 500_000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("image/png");
  });

  it("tamanho desconhecido (bytes null) recusa", () => {
    const r = conferirImagemDeStory({ mime: "image/jpeg", bytes: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("tamanho");
  });

  it("acima de 8 MB recusa", () => {
    const r = conferirImagemDeStory({ mime: "image/jpeg", bytes: TAMANHO_MAXIMO_DA_IMAGEM_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("MB");
  });
});

// ── metadadosDaMidiaDeStory ───────────────────────────────────────────────────

describe("metadadosDaMidiaDeStory — MediaAsset primeiro, HEAD como reserva", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => { mediaAssetFindUnique.mockReset(); });
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
    expect(m).toEqual({ mime: "image/jpeg", bytes: 123 });
    expect(mediaAssetFindUnique).toHaveBeenCalledWith({ where: { id: "asset123" } });
  });

  it("URL externa (Drive, CDN do cliente) vai direto pro HEAD", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "video/mp4; codecs=avc1", "content-length": "1048576" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://cdn.cliente.com/video.mp4");
    expect(m).toEqual({ mime: "video/mp4", bytes: 1_048_576 });
    expect(mediaAssetFindUnique).not.toHaveBeenCalled();
  });

  it("registro não encontrado no banco cai para o HEAD — nunca 'assume genérico'", async () => {
    mediaAssetFindUnique.mockResolvedValue(null);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/sumiu?exp=1&sig=abc");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 999 });
  });

  it("banco fora do ar cai para o HEAD, nunca lança", async () => {
    mediaAssetFindUnique.mockRejectedValue(new Error("ECONNREFUSED"));
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: headersFalsos({ "content-type": "image/jpeg", "content-length": "999" }),
    })) as unknown as typeof fetch;

    const m = await metadadosDaMidiaDeStory("https://app.dioli/api/media/asset1?exp=1&sig=abc");
    expect(m).toEqual({ mime: "image/jpeg", bytes: 999 });
  });

  it("HEAD sem sucesso, ou rede fora do ar: os dois campos voltam null — nunca um chute", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, headers: headersFalsos({}) })) as unknown as typeof fetch;
    expect(await metadadosDaMidiaDeStory("https://cdn.cliente.com/x.jpg")).toEqual({ mime: null, bytes: null });

    globalThis.fetch = vi.fn(async () => { throw new Error("ETIMEDOUT"); }) as unknown as typeof fetch;
    expect(await metadadosDaMidiaDeStory("https://cdn.cliente.com/x.jpg")).toEqual({ mime: null, bytes: null });
  });
});
