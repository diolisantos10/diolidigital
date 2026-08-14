// TROCAR O CONTÊINER SEM TROCAR O CONTEÚDO — medido nos BYTES.
//
// ── POR QUE ESTE ARQUIVO EXISTE (14/08/2026) ────────────────────────────────
//
// Os 6 carrosséis do CityJobs estão agendados com as telas em PNG, e o conserto
// que a casa tinha (`recomporCarrosseis`) REDESENHA cada tela. Redesenhar
// resolve o formato e cobra caro: precisa do roteiro (`scenesJson`) e, pior,
// troca os pixels de uma peça cuja aprovação fica presa ao POST e não ao
// arquivo (`esteira/aprovacao-da-peca.ts`) — o cliente passaria a ter aprovado
// uma imagem que nunca viu.
//
// Este módulo faz o mínimo: os mesmos pixels, noutro contêiner. E é justamente
// por ser "o mínimo" que ele precisa ser medido nos bytes — um conversor que
// silenciosamente redimensiona, gira ou pinta o fundo de preto passaria por
// "só trocou o contêiner" e entregaria outra peça.

import { describe, it, expect, vi } from "vitest";

import {
  paraJpeg,
  medidasDaImagem,
  ehJpeg,
  ehPng,
  QUALIDADE_DO_JPEG,
} from "@/lib/agency/media/para-jpeg";
import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";

/** Um PNG REAL de 12×9, vermelho. Gerado uma vez e fixado aqui: o teste não
 *  pode depender da mesma biblioteca que ele está conferindo. */
const PNG_12x9 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAJCAIAAACJ2loDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVR4nGM4oWFDEDGMKmIgJggAkdN+kQD3XuYAAAAASUVORK5CYII=",
  "base64",
);

/** Um JPEG REAL mínimo (1×1). Serve para o caminho da idempotência. */
const JPEG_1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

describe("as assinaturas são lidas dos BYTES — etiqueta não é evidência", () => {
  it("reconhece PNG e JPEG pelo cabeçalho, e não confunde um com o outro", () => {
    expect(ehPng(PNG_12x9)).toBe(true);
    expect(ehJpeg(PNG_12x9)).toBe(false);
    expect(ehJpeg(JPEG_1x1)).toBe(true);
    expect(ehPng(JPEG_1x1)).toBe(false);
  });

  it("lê a largura e a altura REAIS do PNG — chutar esticaria a peça do cliente", () => {
    expect(medidasDaImagem(PNG_12x9)).toEqual({ largura: 12, altura: 9 });
  });

  it("lê as medidas do JPEG pelo marcador de frame", () => {
    expect(medidasDaImagem(JPEG_1x1)).toEqual({ largura: 1, altura: 1 });
  });

  it("formato que não sabemos ler devolve null — e quem chama recusa", () => {
    // Guardrail 1: ausência de informação não é informação. "Provavelmente é
    // 1080×1350" é exatamente o palpite que entrega a peça esticada.
    expect(medidasDaImagem(Buffer.from("isto não é imagem nenhuma"))).toBeNull();
    expect(medidasDaImagem(Buffer.alloc(0))).toBeNull();
  });
});

describe("a conversão entrega JPEG DE VERDADE, e nas mesmas medidas", () => {
  it("PNG entra, JPEG sai — conferido na assinatura, não no MIME declarado", async () => {
    const r = await paraJpeg(PNG_12x9);
    expect(r.ok, r.ok ? "" : (r as { motivo: string }).motivo).toBe(true);
    if (!r.ok) return;

    expect(r.mime).toBe(MIME_DE_IMAGEM_ACEITO);
    expect(
      ehJpeg(r.bytes),
      "os bytes convertidos NÃO começam com a assinatura de JPEG — MIME que mente passa pela " +
        "trava da casa e morre na Meta, que é pior que ser barrado aqui.",
    ).toBe(true);
    expect(ehPng(r.bytes)).toBe(false);
  });

  it("as MEDIDAS não mudam: trocar o contêiner não pode redimensionar a peça", async () => {
    const r = await paraJpeg(PNG_12x9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A prova de que nada foi reamostrado. Um `object-fit`, uma margem ou um
    // `deviceScaleFactor` errado apareceriam aqui como outra dimensão.
    expect(medidasDaImagem(r.bytes)).toEqual({ largura: 12, altura: 9 });
  });

  it("arquivo já em JPEG volta IDÊNTICO — a passada tem de ser idempotente", async () => {
    const r = await paraJpeg(JPEG_1x1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.por).toBe("ja-era-jpeg");
    // Mesmos bytes, não "bytes equivalentes": reconverter JPEG em JPEG perderia
    // qualidade a cada vez que alguém apertasse o botão duas vezes.
    expect(r.bytes.equals(JPEG_1x1)).toBe(true);
  });

  it("arquivo vazio é recusado com motivo, nunca convertido em silêncio", async () => {
    const r = await paraJpeg(Buffer.alloc(0));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("vazio");
  });

  it("a qualidade é a MESMA do rasterizador — tela convertida ao lado de tela desenhada", () => {
    // Se os dois números divergirem, um carrossel com telas de origens
    // diferentes fica visivelmente desigual de uma tela para a outra.
    const renderizar = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "lib/agency/design/renderizar.ts"),
      "utf8",
    ) as string;
    expect(renderizar).toContain(`quality: ${QUALIDADE_DO_JPEG}`);
  });
});

// ── O SEGUNDO CAMINHO ───────────────────────────────────────────────────────
//
// `sharp` não é dependência declarada deste projeto: ele vem de carona no
// `next`. Depender em silêncio de um pacote transitivo é a armadilha que já
// custou dias aqui. Por isso existe o caminho do rasterizador — e ele precisa
// ser EXERCITADO, senão é um plano B que ninguém sabe se funciona.

const NAVEGADOR = await renderizadorDisponivel();
const prova = NAVEGADOR.disponivel ? it : it.skip;

describe("o plano B (o rasterizador da casa) não é decoração", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || process.env.MOLDE_SEM_NAVEGADOR === "1",
      "Sem Chromium não dá para saber se o caminho de reserva funciona, e é ele que segura o dia " +
        "em que o `sharp` transitivo sumir de um build.",
    ).toBe(true);
  });

  prova(
    "com `sharp` fora do ar, a conversão sai pelo rasterizador — e sai JPEG do mesmo tamanho",
    async () => {
      vi.resetModules();
      // O `sharp` some exatamente como sumiria num contêiner que não o recebeu:
      // o `import()` dinâmico falha, e o módulo tem de assumir o outro caminho.
      vi.doMock("sharp", () => {
        throw new Error("Cannot find module 'sharp'");
      });
      const { paraJpeg: semSharp } = await import("@/lib/agency/media/para-jpeg");

      const r = await semSharp(PNG_12x9);
      expect(r.ok, r.ok ? "" : (r as { motivo: string }).motivo).toBe(true);
      if (!r.ok) return;

      expect(r.por).toBe("rasterizador");
      expect(ehJpeg(r.bytes)).toBe(true);
      expect(medidasDaImagem(r.bytes)).toEqual({ largura: 12, altura: 9 });

      vi.doUnmock("sharp");
      vi.resetModules();
    },
    120_000,
  );
});

describe("sem NENHUMA das duas ferramentas, a porta fecha e diz qual metade falta", () => {
  it("a recusa nomeia os dois caminhos — 'não consegui converter' manda procurar no lugar errado", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    vi.doMock("@/lib/agency/design/renderizar", () => ({
      renderizarHtml: async () => ({ ok: false, motivo: "sem_navegador", erro: "Playwright não está instalado" }),
      renderizadorDisponivel: async () => ({ disponivel: false, caminho: null }),
      MIME_DA_PECA_RENDERIZADA: "image/jpeg",
    }));
    const { paraJpeg: semNada } = await import("@/lib/agency/media/para-jpeg");

    const r = await semNada(PNG_12x9);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("sharp:");
    expect(r.motivo).toContain("rasterizador:");

    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/agency/design/renderizar");
    vi.resetModules();
  });
});
