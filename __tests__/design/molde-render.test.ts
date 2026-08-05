import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";

// ── A PROVA DE QUE A LETRA SAI CERTA ────────────────────────────────────────
//
// Este arquivo sobe o Chromium de verdade (o mesmo de `scripts/shot.mjs`) e
// rasteriza peças reais. É a razão de existir do motor de molde: com o modelo
// de imagem, "PROMOÇÃO" saía "PROMOÇÂO" e ninguém conferia.
//
// A prova é feita em três camadas, e cada uma pega um defeito diferente:
//
//   1. VOLTA COMPLETA JS → HTML → DOM → JS. A string pedida em JavaScript é
//      procurada no DOM da página já renderizada e comparada caractere a
//      caractere. Pega erro de escape, substituição e `text-transform`.
//   2. NADA CORTADO, NADA NA ZONA MORTA. Texto que estoura a caixa ou que cai
//      sob a interface do Instagram é texto errado, e a peça é REPROVADA.
//   3. TINTA NO PIXEL. Renderizar o mesmo molde com títulos diferentes tem de
//      produzir arquivos diferentes, e com título vazio tem de produzir um
//      arquivo diferente dos dois. É o que separa "o texto está no DOM" de "o
//      texto foi realmente pintado" — fonte que não carrega, cor sobre cor ou
//      elemento invisível cairiam aqui.
//
// O que esta prova NÃO faz, dito com todas as letras: não passa OCR no PNG.
// Ela prova que a letra saiu do rasterizador de fonte com o conteúdo pedido —
// que é justamente a propriedade que um modelo de imagem não tem.

import { moldeDoCliente, montarHtmlDaPeca, FORMATOS } from "@/lib/agency/design/molde";
import { renderizarHtml, renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { montarPeca } from "@/lib/agency/design/peca";

const MARCA = { primaryColor: "#2F1B12", secondaryColor: "#E7B96B", typography: "Playfair Display" };
const molde = moldeDoCliente(MARCA);

// 1×1 PNG — serve de "foto" para o caminho com fundo.
const FOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let temNavegador = false;
beforeAll(async () => {
  temNavegador = (await renderizadorDisponivel()).disponivel;
  if (!temNavegador) {
    // Não silencia: sem navegador, a prova da letra NÃO foi feita nesta
    // máquina, e isso precisa aparecer no relatório da rodada.
    console.warn("[molde-render] Chromium ausente — a prova de letra foi PULADA nesta máquina.");
  }
});

const LEGENDA = "Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã. Vem tomar café";

describe("a letra sai certa — a razão de existir do motor de molde", () => {
  it.runIf(existsSync("/opt/pw-browsers"))(
    "o texto pedido é EXATAMENTE o texto renderizado, com acento e caractere especial",
    async () => {
      const titulo = 'Pão & "manteiga" às 6 — o café <de todo dia>';
      const html = montarHtmlDaPeca(
        { formato: "feed", titulo, selo: "PRODUTO", assinatura: "Padaria do João", fundo: null },
        molde,
      );
      const r = await renderizarHtml({
        html,
        largura: FORMATOS.feed.largura,
        altura: FORMATOS.feed.altura,
        textosEsperados: [titulo, "PRODUTO", "Padaria do João"],
        zonaMortaTopo: FORMATOS.feed.margemTopo,
        zonaMortaBase: FORMATOS.feed.margemBase,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      expect(r.conferencia.conferidos).toBe(3);
      expect(r.bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    },
    60_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "texto que o DOM não tem REPROVA a peça — o portão não avisa, ele barra",
    async () => {
      const html = montarHtmlDaPeca({ formato: "feed", titulo: "Pão quentinho" }, molde);
      const r = await renderizarHtml({
        html,
        largura: FORMATOS.feed.largura,
        altura: FORMATOS.feed.altura,
        // Pedimos a conferência de um texto que NÃO está na peça: é o que
        // aconteceria se o molde tivesse trocado a string pelo caminho.
        textosEsperados: ["Pão quentinho", "PROMOÇÃO IMPERDÍVEL"],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("texto_divergente");
    },
    60_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "TINTA NO PIXEL: título diferente produz imagem diferente; sem título, diferente das duas",
    async () => {
      const render = async (titulo: string) => {
        const r = await renderizarHtml({
          html: montarHtmlDaPeca({ formato: "quadrado", titulo, fundo: null }, molde),
          largura: FORMATOS.quadrado.largura,
          altura: FORMATOS.quadrado.altura,
          textosEsperados: titulo ? [titulo] : [],
        });
        if (!r.ok) throw new Error(`${r.motivo}: ${r.erro}`);
        return r.bytes.toString("base64");
      };
      const [a, b, vazio] = await Promise.all([
        render("Pão quentinho todo dia"),
        render("Bastidor da madrugada"),
        render(""),
      ]);
      expect(a).not.toBe(b);
      expect(a).not.toBe(vazio);
      expect(b).not.toBe(vazio);
    },
    90_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "título gigante ENCOLHE para caber — texto cortado é texto errado",
    async () => {
      const gigante = "Todo dia às seis da manhã o pão sai do forno e a casa inteira cheira a manhã e a café passado na hora";
      const html = montarHtmlDaPeca({ formato: "feed", titulo: gigante, selo: "PRODUTO", assinatura: "Padaria" }, molde);
      const r = await renderizarHtml({
        html,
        largura: FORMATOS.feed.largura,
        altura: FORMATOS.feed.altura,
        textosEsperados: [gigante],
        zonaMortaTopo: FORMATOS.feed.margemTopo,
        zonaMortaBase: FORMATOS.feed.margemBase,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      // Coube encolhendo: a LETRA continua inteira, o corpo é que cedeu.
      expect(r.conferencia.encolheu).toBe(true);
      expect(r.conferencia.tituloPx!).toBeLessThan(84);
    },
    60_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "story: o texto respeita a faixa da interface do Instagram",
    async () => {
      const r = await montarPeca({
        formato: "story",
        molde,
        fundoBytes: FOTO,
        fundoMime: "image/png",
        titulo: "Todo dia às seis o pão sai do forno",
        selo: "Produto",
        assinatura: "Padaria do João",
        fonteAuditada: LEGENDA,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      expect(r.largura).toBe(1080);
      expect(r.altura).toBe(1920);
      expect(r.textosPintados).toContain("PRODUTO");
      expect(r.textoRecusado).toEqual([]);
    },
    60_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "texto SEM lastro no conteúdo auditado não é pintado — a peça sai sem ele",
    async () => {
      const r = await montarPeca({
        formato: "feed",
        molde,
        fundoBytes: FOTO,
        titulo: "O melhor pão artesanal da cidade",
        assinatura: "Padaria do João",
        fonteAuditada: LEGENDA,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.textosPintados).not.toContain("O melhor pão artesanal da cidade");
      expect(r.textoRecusado.map((t) => t.papel)).toContain("titulo");
    },
    60_000,
  );

  it.runIf(existsSync("/opt/pw-browsers"))(
    "um molde só serve os três formatos, e cada um sai na medida de publicação",
    async () => {
      for (const [formato, esperado] of [
        ["feed", [1080, 1350]],
        ["story", [1080, 1920]],
        ["carrossel", [1080, 1350]],
      ] as const) {
        const r = await montarPeca({
          formato,
          molde,
          fundoBytes: FOTO,
          titulo: "Todo dia às seis o pão sai do forno",
          assinatura: "Padaria do João",
          indice: formato === "carrossel" ? { atual: 6, total: 6 } : null,
          fonteAuditada: LEGENDA,
        });
        expect(r.ok, r.ok ? "" : `${formato}: ${r.motivo} ${r.erro}`).toBe(true);
        if (!r.ok) return;
        expect([r.largura, r.altura]).toEqual([...esperado]);
        expect(r.origemDoMolde).toBe("marca");
      }
    },
    120_000,
  );
});

describe("sem navegador, o motor degrada DECLARANDO", () => {
  it("um HTML vazio é pedido inválido, não estouro", async () => {
    const r = await renderizarHtml({ html: "", largura: 100, altura: 100, textosEsperados: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("pedido_invalido");
  });

  it("`renderizadorDisponivel` responde o que sabe, sem lançar", async () => {
    const d = await renderizadorDisponivel();
    expect(typeof d.disponivel).toBe("boolean");
  });
});
