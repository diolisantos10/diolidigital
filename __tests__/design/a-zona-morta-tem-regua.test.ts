// A ZONA MORTA TEM RÉGUA — a prova da DETECÇÃO, não da reação.
//
// ═══════════════════════════════════════════════════════════════════════════
// O BURACO, MEDIDO PELO AUDITOR (25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ele desligou o detector real — `invade()`, dentro de `codigoDoConferidor`
// (`design/renderizar.ts`) — e rodou a casa inteira: **411 arquivos, 6019
// testes, zero vermelhos.**
//
// Ou seja: a trava que impede o texto do cliente de sair por baixo da barra de
// progresso do Instagram **não tinha uma régua sequer** em toda a suíte.
//
// `molde-render.test.ts` diz no cabeçalho que prova "nada na zona morta", e ele
// PASSA os parâmetros (`zonaMortaTopo`/`zonaMortaBase`) — mas só afirma o
// caminho feliz. Nenhum caso ali INVADE, então `invade()` podendo devolver
// sempre `false` mantém tudo verde.
//
// E a minha prova anterior era pior: eu falsificava `renderizarHtml` devolvendo
// `texto_na_zona_morta` e afirmava que a corrente parava. Isso prova a REAÇÃO à
// resposta — e dubla exatamente a camada onde o defeito moraria.
//
// ── A DOUTRINA QUE ESTA OPERAÇÃO JÁ PAGOU TRÊS VEZES ───────────────────────
//
//   **Falsificar fundo demais cria uma régua que só pode dar verde.**
//
// A falsificação tem de descer até onde o teste possa REPROVAR. Aqui ela desce
// ao chão: **nada é dublado.** Chromium de verdade, DOM de verdade, medição de
// verdade. Desligar `invade()` deixa este arquivo vermelho — que é a única
// prova de que ele é uma régua e não um enfeite.

import { describe, it, expect } from "vitest";
import { renderizarHtml, renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { FORMATOS } from "@/lib/agency/design/molde";

const NAVEGADOR = await renderizadorDisponivel();

// Pular é honesto: "não medi" não é "está certo", e o `it.skip` DIZ que não
// mediu em vez de passar verde calado. É o padrão que a casa já usa em
// `molde-render.test.ts` e `media/para-jpeg.test.ts`.
const prova = NAVEGADOR.disponivel ? it : it.skip;

const STORY = FORMATOS.story;

/**
 * Uma peça mínima com UM texto, posto onde o teste mandar.
 *
 * `data-papel` é o que o conferidor procura (`querySelectorAll("[data-papel]")`)
 * — o mesmo seletor que o molde real usa. O papel é `assinatura`, e não
 * `titulo`, de propósito: o conferidor ENCOLHE o título até caber quando ele
 * invade, então um título na zona morta pode ser consertado pelo próprio laço e
 * não provaria a detecção. A assinatura não encolhe — o que invadir, invadiu.
 */
function pecaComTextoEm(topoPx: number, texto: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${STORY.largura}px;height:${STORY.altura}px;background:#101010;}
    .t{position:absolute;left:80px;width:900px;color:#fff;font:600 40px/1.2 sans-serif;}
  </style></head><body>
    <div class="t" data-papel="assinatura" style="top:${topoPx}px">${texto}</div>
  </body></html>`;
}

const TEXTO = "Padaria da Esquina";

function pedido(html: string) {
  return {
    html,
    largura: STORY.largura,
    altura: STORY.altura,
    textosEsperados: [TEXTO],
    zonaMortaTopo: STORY.margemTopo,
    zonaMortaBase: STORY.margemBase,
  };
}

describe("a zona morta do Story é MEDIDA, não afirmada", () => {
  prova("texto DENTRO da faixa do topo é REPROVADO — é onde mora a barra de progresso", async () => {
    // 40px do topo, com a zona morta em 260px: bem dentro da faixa que a
    // interface do Instagram cobre. Nada aqui é dublado — o veredito vem do
    // DOM medido pelo Chromium.
    const r = await renderizarHtml(pedido(pecaComTextoEm(40, TEXTO)));
    expect(r.ok, "texto sob a barra de progresso NÃO pode virar peça").toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("texto_na_zona_morta");
  }, 120_000);

  prova("texto DENTRO da faixa da base é REPROVADO — é onde mora a caixa de resposta", async () => {
    // O elemento tem ~48px de altura; posto a 80px do fim, ele entra na faixa
    // de 300px que a base reserva.
    const topo = STORY.altura - 80;
    const r = await renderizarHtml(pedido(pecaComTextoEm(topo, TEXTO)));
    expect(r.ok, "texto sob a caixa de resposta NÃO pode virar peça").toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("texto_na_zona_morta");
  }, 120_000);

  prova("o MESMO texto na área segura PASSA — a régua não é um freio de mão puxado", async () => {
    // A metade que impede a trava de virar "reprova tudo": posto no meio da
    // peça, entre as duas faixas, o mesmo texto atravessa e vira arquivo.
    //
    // Sem esta afirmação, `invade()` devolvendo sempre `true` também deixaria
    // as duas de cima verdes — e uma trava que reprova o legítimo é desligada
    // por quem a encontra.
    const meio = Math.round(STORY.altura / 2);
    const r = await renderizarHtml(pedido(pecaComTextoEm(meio, TEXTO)));
    expect(r.ok, "texto na área segura tem de atravessar").toBe(true);
    if (!r.ok) return;
    expect(r.largura).toBe(STORY.largura);
    expect(r.altura).toBe(STORY.altura);
    expect(r.bytes.length).toBeGreaterThan(1000);
  }, 120_000);

  prova("a faixa medida é a do STORY, não a do feed — 260px em cima, 300px embaixo", async () => {
    // O Story reserva MUITO mais que o feed (72/88), porque ali moram o avatar,
    // a barra de progresso e a caixa de resposta. Um texto a 150px do topo é
    // legítimo num post de feed e é invasão num Story — e é exatamente esse
    // caso que prova que a faixa aplicada é a certa.
    expect(STORY.margemTopo).toBeGreaterThan(FORMATOS.feed.margemTopo);

    const noLimiteDoFeed = await renderizarHtml(pedido(pecaComTextoEm(150, TEXTO)));
    expect(
      noLimiteDoFeed.ok,
      "150px do topo passa num feed e NÃO pode passar num Story",
    ).toBe(false);
    if (noLimiteDoFeed.ok) return;
    expect(noLimiteDoFeed.motivo).toBe("texto_na_zona_morta");
  }, 120_000);
});
