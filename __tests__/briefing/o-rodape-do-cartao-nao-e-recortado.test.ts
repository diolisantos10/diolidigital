/**
 * ── B1 · ABRIR "ANEXAR" CORTAVA O BOTÃO DE ÁUDIO E O DE FECHAR O PAINEL ─────
 *
 * 16/08/2026, percurso medido pelo Essencial de experiência com o app rodando,
 * a **375×600** (janela curta — a do relato do CEO):
 *
 *   1. `/briefing` → cartão y213–584. Cabe.
 *   2. digitar e enviar → funciona.
 *   3. tocar em **"Anexar"** → a caixa de digitar vai para 538–612 e a linha
 *      **Falar / Anexar** vai para **620–652**, FORA de um cartão que termina
 *      em 584 e é `overflow-hidden`.
 *   4. rolando a página em y=0, 150, 300, 305: `topoDoBotão > fundoDoCartão`
 *      em TODAS. **Recortado não é rolável. Não volta nunca.**
 *
 * O custo: o CEO perde o **microfone** — metade literal do relato dele — e o
 * ÚNICO jeito de fechar o painel, porque o alternador é o próprio botão
 * recortado. Fica preso com meia tela de dropzone entre ele e a conversa.
 *
 * ── A CAUSA, EM NÚMEROS ────────────────────────────────────────────────────
 * Cartão de 371px com três regiões cujos pisos somam mais que ele:
 *
 *     cabeçalho  ~72  (shrink-0)
 *     conversa   120  (min-h-[120px])
 *     materiais  120  (min-h-[120px])
 *     rodapé    ~110  (shrink-0)
 *     ──────────────
 *     total      422  →  51px estouram, e o `overflow-hidden` os corta calado.
 *
 * Quem está por último é o rodapé.
 *
 * ── COMO ESTE TESTE PROVA ──────────────────────────────────────────────────
 * A regra ANTIGA era CSS e está escrita aqui como `regraAntiga` — os mesmos
 * pisos fixos de 120px. Cada afirmação abaixo é feita contra as DUAS: a antiga
 * REPROVA nos números medidos, a nova passa. Sem isso o teste seria uma guarda
 * de regressão, não prova de conserto.
 */
import { describe, it, expect } from "vitest";
import {
  alturasDasRegioes,
  tetoDoCartaoDaConversa,
  ALTURA_MINIMA_DO_CARTAO,
  PISO_DA_CONVERSA,
  ALTURA_UTIL_DOS_MATERIAIS,
} from "@/components/agency/briefing/PublicBriefingRoom";

/** Os números MEDIDOS pelo auditor a 375×600 com o painel aberto. */
const MEDIDO = { janela: 600, topo: 213, cabecalho: 72, rodape: 110 };

/** A regra que produziu o defeito: dois pisos fixos, cegos ao tamanho do
 *  cartão. Existe aqui para que cada afirmação tenha as duas metades. */
function regraAntiga(): { conversa: number; materiais: number } {
  return { conversa: 120, materiais: 120 };
}

function somaDasRegioes(
  r: { conversa: number; materiais: number },
  cabecalho: number,
  rodape: number,
): number {
  return r.conversa + r.materiais + cabecalho + rodape;
}

describe("B1 · com o painel de materiais aberto, o rodapé continua DENTRO do cartão", () => {
  it("🔑 nos números medidos a 375×600, a regra ANTIGA estoura e a nova não", () => {
    const cartao = tetoDoCartaoDaConversa(MEDIDO.janela, MEDIDO.topo, MEDIDO.cabecalho + MEDIDO.rodape);

    // A metade que REPROVA o código de ontem: 72+120+120+110 = 422 > 371.
    expect(somaDasRegioes(regraAntiga(), MEDIDO.cabecalho, MEDIDO.rodape)).toBeGreaterThan(cartao);

    const agora = alturasDasRegioes({
      cartao,
      cabecalho: MEDIDO.cabecalho,
      rodape: MEDIDO.rodape,
      materiaisAbertos: true,
    });
    expect(somaDasRegioes(agora, MEDIDO.cabecalho, MEDIDO.rodape)).toBeLessThanOrEqual(cartao);
  });

  it("🔑 NENHUMA janela, de 320 a 1200, empurra o rodapé para fora", () => {
    for (let janela = 320; janela <= 1200; janela += 7) {
      for (const rodape of [88, 110, 148, 190]) {
        const extremos = MEDIDO.cabecalho + rodape;
        const cartao = tetoDoCartaoDaConversa(janela, MEDIDO.topo, extremos);
        const r = alturasDasRegioes({
          cartao,
          cabecalho: MEDIDO.cabecalho,
          rodape,
          materiaisAbertos: true,
        });
        expect(r.conversa).toBeGreaterThanOrEqual(0);
        expect(r.materiais).toBeGreaterThanOrEqual(0);
        expect(somaDasRegioes(r, MEDIDO.cabecalho, rodape)).toBeLessThanOrEqual(cartao);
      }
    }
  });

  it("🔑 o rodapé CRESCENDO (caixa em duas linhas, erro do microfone) não recorta nada", () => {
    // O rodapé não é fixo: a caixa de digitar cresce e a linha de erro do
    // microfone aparece. A conta tem de continuar valendo depois disso.
    const rodapeGrande = 190;
    const cartao = tetoDoCartaoDaConversa(600, 213, MEDIDO.cabecalho + rodapeGrande);
    const r = alturasDasRegioes({
      cartao,
      cabecalho: MEDIDO.cabecalho,
      rodape: rodapeGrande,
      materiaisAbertos: true,
    });
    expect(somaDasRegioes(r, MEDIDO.cabecalho, rodapeGrande)).toBeLessThanOrEqual(cartao);
    // E o cartão cresceu para caber os extremos — é a página que rola, não o
    // controle que some. "Se não couber, algo cede de forma VISÍVEL."
    expect(cartao).toBeGreaterThanOrEqual(MEDIDO.cabecalho + rodapeGrande + PISO_DA_CONVERSA);
  });

  it("🔑 janela curta: o cartão passa a ser MAIOR que a sobra — rolar, nunca recortar", () => {
    // 375×480 com cabeçalho de página alto: a sobra é 480-213-16 = 251, menor
    // que o necessário. O antigo devolvia 320 sem olhar o rodapé; o novo
    // devolve o que os extremos exigem.
    const extremos = 72 + 190;
    const cartao = tetoDoCartaoDaConversa(480, 213, extremos);
    expect(cartao).toBe(extremos + PISO_DA_CONVERSA);
    // O piso genérico de 320 NÃO teria bastado: 262+88 = 350 > 320.
    expect(cartao).toBeGreaterThan(ALTURA_MINIMA_DO_CARTAO);
  });

  it("com o painel FECHADO, a conversa fica com a sobra inteira", () => {
    const cartao = tetoDoCartaoDaConversa(800, 213, MEDIDO.cabecalho + MEDIDO.rodape);
    const r = alturasDasRegioes({
      cartao,
      cabecalho: MEDIDO.cabecalho,
      rodape: MEDIDO.rodape,
      materiaisAbertos: false,
    });
    expect(r.materiais).toBe(0);
    expect(somaDasRegioes(r, MEDIDO.cabecalho, MEDIDO.rodape)).toBe(cartao);
  });

  it("a CONVERSA recebe o piso primeiro — é a queixa original do CEO", () => {
    // 375×600 com o painel aberto: sobra 189px para as duas regiões.
    const r = alturasDasRegioes({ cartao: 371, cabecalho: 72, rodape: 110, materiaisAbertos: true });
    expect(r.conversa).toBeGreaterThanOrEqual(PISO_DA_CONVERSA);
    // E o painel recebe o resto — 63px (a proporção 2:1 de antes) deixava a
    // zona de arrastar pela metade.
    expect(r.materiais).toBeGreaterThan(63);
  });

  it("o painel NUNCA fica maior do que precisa — no desktop a sobra é da conversa", () => {
    const r = alturasDasRegioes({ cartao: 900, cabecalho: 72, rodape: 110, materiaisAbertos: true });
    expect(r.materiais).toBe(ALTURA_UTIL_DOS_MATERIAIS);
    // A proporção 2:1 daria 239px a um painel que pede ~190: meia tela de vazio
    // roubada da conversa.
    expect(r.conversa).toBe(900 - 72 - 110 - ALTURA_UTIL_DOS_MATERIAIS);
  });

  it("o teto SEM extremos continua se comportando como antes (nada foi afrouxado)", () => {
    // Compatibilidade: quem chamar com dois argumentos recebe a regra velha,
    // que continua certa quando os extremos cabem no piso de 320.
    expect(tetoDoCartaoDaConversa(600, 213)).toBe(371);
    expect(tetoDoCartaoDaConversa(400, 213)).toBe(ALTURA_MINIMA_DO_CARTAO);
  });
});
