import { describe, it, expect } from "vitest";

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
// O que esta prova NÃO faz, dito com todas as letras: não passa OCR no arquivo.
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

// ── S5: GATE QUE NÃO REGISTRA RESULTADO REPROVA ─────────────────────────────
//
// Até a 7ª auditoria, cada prova aqui era `it.runIf(existsSync("/opt/pw-browsers"))`:
// numa máquina sem esse caminho os 7 testes SUMIAM e a suíte seguia verde.
// Verde sem prova é pior que vermelho — é a regra da casa ("sem gate =
// reprovado"), e valia contra o próprio gate que prova a razão de existir do
// motor.
//
// O desenho novo:
//   • quem decide é `renderizadorDisponivel()`, não um caminho de disco fixo;
//   • quando não há navegador, a ausência tem de ser DECLARADA em
//     `MOLDE_SEM_NAVEGADOR=1`. Sem a declaração, o teste-sentinela abaixo
//     REPROVA a rodada em vez de deixá-la verde por omissão.
const NAVEGADOR = await renderizadorDisponivel();
const DECLARADO_SEM_NAVEGADOR = process.env.MOLDE_SEM_NAVEGADOR === "1";
const provaDaLetra = NAVEGADOR.disponivel ? it : it.skip;

describe("a prova da letra REGISTRA resultado — não some em silêncio", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || DECLARADO_SEM_NAVEGADOR,
      "Sem Chromium, a prova de que a letra sai certa no pixel NÃO foi feita nesta máquina. " +
        "Isto não pode passar como verde: instale o navegador (`npx playwright install chromium`) " +
        "ou declare a lacuna com MOLDE_SEM_NAVEGADOR=1 — e então a rodada registra que a prova não existiu.",
    ).toBe(true);
  });

  it("o veredito do renderizador é uma resposta, não um palpite", () => {
    expect(typeof NAVEGADOR.disponivel).toBe("boolean");
    if (NAVEGADOR.disponivel) expect(NAVEGADOR.caminho).toBeTruthy();
  });
});

const LEGENDA = "Todo dia às seis o pão sai do forno e a casa inteira cheira a manhã. Vem tomar café";

describe("a letra sai certa — a razão de existir do motor de molde", () => {
  provaDaLetra(
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
      // ── JPEG, E NÃO PNG (08/08/2026) ────────────────────────────────────
      // Esta linha exigia a assinatura de PNG. Ela estava certa sobre o que o
      // código fazia e errada sobre o que a casa precisa: o Instagram só
      // publica JPEG, e enquanto isto rasterizou PNG, 100% das peças eram
      // recusadas pela própria trava da casa antes de falar com a Meta.
      // `FF D8 FF` é o começo de todo JPEG (SOI + primeiro marcador).
      expect(r.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    },
    60_000,
  );

  provaDaLetra(
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

  provaDaLetra(
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

  provaDaLetra(
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

  provaDaLetra(
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

  provaDaLetra(
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

  provaDaLetra(
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

  // ── S3: O PONTO CEGO DO CONFERIDOR DE DOM ─────────────────────────────────
  // "Pao ‮oirartnoc‬ quentinho" era APROVADO: DOM idêntico ao pedido, pixel
  // mostrando a palavra invertida. Igualdade não pega veneno que está nos dois
  // lados. Agora ele morre na entrada (trava) e, para quem montar HTML por
  // fora dela, no portão 0 do renderizador.
  provaDaLetra(
    "controle de direção não sobrevive até o pixel",
    async () => {
      const sujo = "Pao ‮oirartnoc‬ quentinho";
      const r = await montarPeca({
        formato: "feed",
        molde,
        fundoBytes: FOTO,
        titulo: sujo,
        assinatura: "Padaria do João",
        fonteAuditada: sujo,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      expect(r.textosPintados).toContain("Pao oirartnoc quentinho");
      for (const t of r.textosPintados) expect(t).not.toMatch(/[‪-‮⁦-⁩​­]/);
    },
    60_000,
  );

  provaDaLetra(
    "HTML montado FORA da trava, com bidi, é REPROVADO pelo renderizador",
    async () => {
      const sujo = "Pao ‮oirartnoc‬ quentinho";
      const r = await renderizarHtml({
        html: montarHtmlDaPeca({ formato: "feed", titulo: sujo, fundo: null }, molde),
        largura: FORMATOS.feed.largura,
        altura: FORMATOS.feed.altura,
        textosEsperados: [sujo],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("texto_invisivel");
    },
    60_000,
  );

  // ── S8: O MOLDE NEUTRO PRECISA SER DECLARADO PARA FORA ────────────────────
  provaDaLetra(
    "cliente sem marca: a peça sai cinza E carrega as lacunas para quem grava",
    async () => {
      const r = await montarPeca({
        formato: "feed",
        molde: moldeDoCliente(null),
        fundoBytes: FOTO,
        titulo: "Todo dia às seis o pão sai do forno",
        assinatura: "Padaria do João",
        fonteAuditada: LEGENDA,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      expect(r.origemDoMolde).toBe("neutro");
      // Antes disto, `lacunas` não tinha um único consumidor fora de teste: o
      // cliente recebia o cinza e nada dizia que o cinza era ausência de marca.
      expect(r.lacunasDoMolde).toContain("cor primária da marca");
    },
    60_000,
  );

  // ── S2: o selo de LLM não pinta parágrafo no topo da peça ─────────────────
  provaDaLetra(
    "pilar de 90 caracteres NÃO vira selo — e a recusa fica registrada",
    async () => {
      const r = await montarPeca({
        formato: "feed",
        molde,
        fundoBytes: FOTO,
        titulo: "Todo dia às seis o pão sai do forno",
        selo: "Pilar de conteúdo que a LLM escreveu inteiro como se fosse uma frase de briefing",
        assinatura: "Padaria do João",
        fonteAuditada: LEGENDA,
      });
      expect(r.ok, r.ok ? "" : `${r.motivo}: ${r.erro}`).toBe(true);
      if (!r.ok) return;
      expect(r.textosPintados.some((t) => t.startsWith("PILAR DE CONTEÚDO"))).toBe(false);
      expect(r.textoRecusado.map((t) => t.papel)).toContain("selo");
    },
    60_000,
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
