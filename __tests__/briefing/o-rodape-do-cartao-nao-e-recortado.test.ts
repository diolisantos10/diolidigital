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
 * ── ⚠️ ONDE ESTE ARQUIVO **NÃO** DISCRIMINA, E ISSO ESTÁ DECLARADO ─────────
 * Medido pelo `qualidade` em 16/08 (revertendo o fonte para `f03efb8` e
 * mantendo os testes): **destes 8 testes, 0 reprovam o código anterior pela
 * REGRA.** `regraAntiga()` é honesta (a transcrição do CSS confere) mas a
 * asserção compara CONSTANTES — `422 > 371` é verde dos dois lados —, e as
 * demais falhavam por símbolo ausente (`alturasDasRegioes` não existia).
 *
 * Isso não tem conserto por teste unitário: a regra antiga era CSS
 * (`min-h-[120px]` num `overflow-hidden`), e CSS não é função que se possa
 * reexecutar em Node. **A prova de conserto do B1 é geométrica, no navegador**,
 * e mora em `scripts/medir-cartao-do-briefing.mjs`:
 *
 *     ANTES  (f03efb8) · 375×600 · painel ABERTO
 *       cartão 213–584 | Falar/Anexar 620–652 | clicável false | recortado TRUE
 *     DEPOIS · 375×600 · painel ABERTO
 *       cartão 213–584 | Falar/Anexar 541–573 | clicável true  | recortado false
 *
 * O que este arquivo faz é o outro trabalho, e ele também é necessário: provar
 * que a aritmética nova FECHA para toda entrada. Declarar é aceitável; fingir
 * que discrimina, não.
 *
 * ── O QUE DISCRIMINA DE VERDADE AQUI É O BLOCO C5, NO FIM ──────────────────
 * Aquele reprova o código de HOJE (`68231a3`) pela regra, porque a assinatura
 * de `alturasDasRegioes` se mantém: mesma chamada, número diferente.
 */
import { describe, it, expect } from "vitest";
import {
  alturasDasRegioes,
  cabecalhoDoCartaoAparece,
  tetoDoCartaoDaConversa,
  ALTURA_MINIMA_DO_CARTAO,
  JANELA_CURTA,
  PISO_DA_CONVERSA,
  PISO_DOS_MATERIAIS,
  PISO_UTIL_DA_CONVERSA,
  ALTURA_UTIL_DOS_MATERIAIS,
  resumoDosAnexos,
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

// ═══════════════════════════════════════════════════════════════════════════
// C5 · A CONVERSA COM 88px E O PAINEL COM 73px — AS DUAS QUEBRADAS JUNTAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido pelo `experiencia` em 16/08 (segunda passada), painel aberto, 375×600:
//
//     sobra = 161  →  materiais = min(190, 161−88) = 73  →  conversa = 88
//
// A conversa era o RESTO, não a prioridade: três linhas com a PRIMEIRA fatiada
// no meio da altura da letra, e a dropzone cortada mostrando meia seta sem
// texto. A ordem declarada ("a conversa recebe o piso; os materiais recebem até
// o que precisam; o que sobrar é da conversa") só entregava o passo 3 com
// `sobra > 278`.
//
// ── POR QUE ESTE BLOCO DISCRIMINA (e o de cima não) ────────────────────────
// A ASSINATURA de `alturasDasRegioes` se mantém — ela já existe em `68231a3`.
// Cada `it` abaixo é a MESMA chamada com o MESMO argumento, e o número devolvido
// pelo código de hoje reprova. Nada aqui falha por símbolo ausente.
describe("C5 · a conversa deixa de ser o resto", () => {
  // ── ⚠️ OS TRÊS PRIMEIROS SÓ USAM NÚMEROS LITERAIS E `alturasDasRegioes` ────
  // Nenhum símbolo novo, de propósito: assim eles REPROVAM `68231a3` pela regra
  // (número devolvido), e não por `is not a function`. Foi essa a régua que o
  // `qualidade` cobrou, e ela custa escrever o número medido na mão.

  it("🔑 375×600, painel aberto, cartão 371 · a conversa recebe 4 LINHAS (≥160)", () => {
    // MEDIDO em `68231a3` com esta MESMA chamada: conversa 88, materiais 173.
    // A conversa era o RESTO. (Com o cabeçalho ainda na tela, era 88/101 — as
    // duas quebradas juntas.)
    const r = alturasDasRegioes({ cartao: 371, cabecalho: 0, rodape: 110, materiaisAbertos: true });
    expect(r.conversa).toBeGreaterThanOrEqual(160);
    // E o painel continua utilizável: a seta E o texto, não meia seta.
    expect(r.materiais).toBeGreaterThanOrEqual(96);
    // Nada estourou: a soma cabe.
    expect(r.conversa + r.materiais + 110).toBeLessThanOrEqual(371);
  });

  it("🔑 a conversa vem ANTES do painel na fila — a ordem declarada é a executada", () => {
    // MEDIDO em `68231a3`: conversa = 290 − min(190, 202) = 100.
    const r = alturasDasRegioes({ cartao: 400, cabecalho: 0, rodape: 110, materiaisAbertos: true });
    expect(r.conversa).toBeGreaterThanOrEqual(160);
  });

  it("🔑 até no aperto a conversa não fica exatamente no piso de sobrevivência", () => {
    // 375×600 com o cabeçalho AINDA na tela: em `68231a3` a conversa recebia
    // exatamente 88 — o piso duro atendido com exatidão, que é um defeito que
    // passa no teste.
    const r = alturasDasRegioes({ cartao: 371, cabecalho: 72, rodape: 110, materiaisAbertos: true });
    expect(r.conversa).toBeGreaterThan(88);
    expect(r.conversa + r.materiais).toBe(371 - 72 - 110);
  });

  // ── Daqui para baixo os símbolos novos entram: são as CONSTANTES da regra,
  //    e servem para que o número não seja repetido à mão em cada asserção.

  it("🔑 o cabeçalho de 72px SAI em janela curta — 82% da conversa a 375×600", () => {
    expect(cabecalhoDoCartaoAparece(600)).toBe(false);
    expect(cabecalhoDoCartaoAparece(639)).toBe(false);
    // E CONTINUA em tela alta: em janela folgada a orientação não custa nada.
    expect(cabecalhoDoCartaoAparece(JANELA_CURTA)).toBe(true);
    expect(cabecalhoDoCartaoAparece(812)).toBe(true);
    expect(cabecalhoDoCartaoAparece(900)).toBe(true);
  });

  it("🔑 painel visível e INÚTIL é pior que fechado: ele empresta, mas nunca do piso duro", () => {
    // Aperto extremo: sobra 150px para as duas regiões.
    const r = alturasDasRegioes({ cartao: 260, cabecalho: 0, rodape: 110, materiaisAbertos: true });
    expect(r.materiais).toBeGreaterThanOrEqual(Math.min(PISO_DOS_MATERIAIS, 150 - PISO_DA_CONVERSA));
    expect(r.conversa).toBeGreaterThanOrEqual(PISO_DA_CONVERSA);
    expect(r.conversa + r.materiais).toBe(150);
  });

  it("os pisos são três, e a ordem entre eles é a regra", () => {
    expect(PISO_DA_CONVERSA).toBeLessThan(PISO_UTIL_DA_CONVERSA);
    expect(PISO_DOS_MATERIAIS).toBeLessThan(ALTURA_UTIL_DOS_MATERIAIS);
  });

  it("✅ no desktop nada mudou: o painel pega o que precisa e a sobra é da conversa", () => {
    const r = alturasDasRegioes({ cartao: 900, cabecalho: 72, rodape: 110, materiaisAbertos: true });
    expect(r.materiais).toBe(ALTURA_UTIL_DOS_MATERIAIS);
    expect(r.conversa).toBe(900 - 72 - 110 - ALTURA_UTIL_DOS_MATERIAIS);
  });

  it("✅ a soma continua fechando para TODA janela — o B1 não foi afrouxado", () => {
    for (let janela = 320; janela <= 1200; janela += 7) {
      for (const rodape of [88, 110, 148, 190]) {
        const cabecalho = cabecalhoDoCartaoAparece(janela) ? 72 : 0;
        const cartao = tetoDoCartaoDaConversa(janela, 213, cabecalho + rodape);
        const r = alturasDasRegioes({ cartao, cabecalho, rodape, materiaisAbertos: true });
        expect(r.conversa).toBeGreaterThanOrEqual(0);
        expect(r.materiais).toBeGreaterThanOrEqual(0);
        expect(r.conversa + r.materiais + cabecalho + rodape).toBeLessThanOrEqual(cartao);
        // E a conversa nunca cai abaixo do piso DURO enquanto houver espaço.
        if (cartao - cabecalho - rodape >= PISO_DA_CONVERSA) {
          expect(r.conversa).toBeGreaterThanOrEqual(PISO_DA_CONVERSA);
        }
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E3 · O QUE O PAINEL PRECISA PASSOU A SER MEDIDO, E O PISO VOLTOU A COMPRAR
//      O QUE ELE DIZ COMPRAR
// ═════════════════════════════════════════════════════════════════════════════
//
// Quarta passada de `experiencia`, 16/08/2026. Dois defeitos, e o segundo é o
// que este bloco existe para não deixar voltar:
//
//   • **a zona de arrastar pintava ZERO pixel nos QUATRO tamanhos**, inclusive a
//     1440×900. Offset dela dentro do painel: 361px, com a lista de 5 anexos
//     aberta acima. O painel valia 96px no celular e 190 acima disso;
//   • **`PISO_DOS_MATERIAIS = 96` estava documentado com uma conta que venceu.**
//     Ele dizia comprar "a zona de arrastar com a seta E a frase, mais a
//     primeira linha da lista" — conta de ANTES de o C5 inverter a ordem das
//     duas. Depois da inversão, 96px não compravam nem uma nem outra. A
//     constante ficou; o que ela comprava mudou.
//
// `ALTURA_UTIL_DOS_MATERIAIS = 190` tinha o mesmo problema, e é a raiz do
// primeiro defeito: era "o painel nunca precisa de mais que ~190", medido antes
// de a lista morar dentro dele. Teto fixo é chute, e chute erra nas duas pontas
// — foi o argumento que matou `flex-[2]/flex-[1]` no B1, repetido em constante.
describe("⛔ E3 · o painel recebe o que MEDE, não o que alguém estimou em julho", () => {
  it("🔑 com conteúdo medido MAIOR que o palpite, o painel cresce até caber", () => {
    // O caso real: 5 anexos, painel de ~300px de conteúdo, desktop com espaço.
    const semMedida = alturasDasRegioes({ cartao: 900, cabecalho: 72, rodape: 139, materiaisAbertos: true });
    const comMedida = alturasDasRegioes({
      cartao: 900, cabecalho: 72, rodape: 139, materiaisAbertos: true,
      precisaDosMateriais: 304,
    });
    expect(semMedida.materiais).toBe(ALTURA_UTIL_DOS_MATERIAIS); // 190, o palpite
    expect(comMedida.materiais).toBe(304);
    // E o que o painel ganhou saiu da SOBRA, nunca do piso útil da conversa.
    expect(comMedida.conversa).toBeGreaterThanOrEqual(PISO_UTIL_DA_CONVERSA);
    expect(comMedida.conversa + comMedida.materiais).toBe(900 - 72 - 139);
  });

  it("🔑 a conversa continua vindo PRIMEIRO: painel faminto não come o piso útil", () => {
    // A queixa original do CEO é a conversa. Medida grande não pode virar
    // licença para o painel tomar a tela.
    const r = alturasDasRegioes({
      cartao: 500, cabecalho: 0, rodape: 139, materiaisAbertos: true,
      precisaDosMateriais: 5_000,
    });
    expect(r.conversa).toBe(PISO_UTIL_DA_CONVERSA);
    expect(r.conversa + r.materiais).toBe(500 - 139);
  });

  it("🔑 e no aperto o piso do painel continua sendo o piso — medida pequena não o fura", () => {
    // Painel que se declara "preciso de 10px" continuaria visível e inútil.
    const r = alturasDasRegioes({
      cartao: 371, cabecalho: 0, rodape: 139, materiaisAbertos: true,
      precisaDosMateriais: 10,
    });
    expect(r.materiais).toBeGreaterThanOrEqual(PISO_DOS_MATERIAIS);
  });

  it("✅ sem medida nenhuma, a conta de ontem é bit a bit a mesma", () => {
    // A assinatura ganhou um campo OPCIONAL: todo chamador antigo tem de
    // continuar recebendo o mesmo número, senão isto é mudança disfarçada.
    for (const cartao of [260, 371, 500, 900]) {
      for (const rodape of [110, 139, 190]) {
        const antes = alturasDasRegioes({ cartao, cabecalho: 72, rodape, materiaisAbertos: true });
        const depois = alturasDasRegioes({
          cartao, cabecalho: 72, rodape, materiaisAbertos: true,
          precisaDosMateriais: undefined,
        });
        expect(depois).toEqual(antes);
      }
    }
  });

  it("✅ a soma continua fechando com medida de qualquer tamanho", () => {
    for (let janela = 320; janela <= 1200; janela += 37) {
      for (const precisa of [0, 40, 96, 190, 304, 640, 5_000]) {
        const cabecalho = cabecalhoDoCartaoAparece(janela) ? 72 : 0;
        const cartao = tetoDoCartaoDaConversa(janela, 213, cabecalho + 139);
        const r = alturasDasRegioes({
          cartao, cabecalho, rodape: 139, materiaisAbertos: true, precisaDosMateriais: precisa,
        });
        expect(r.conversa).toBeGreaterThanOrEqual(0);
        expect(r.materiais).toBeGreaterThanOrEqual(0);
        expect(r.conversa + r.materiais + cabecalho + 139).toBeLessThanOrEqual(cartao);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E3 · A LINHA DE RESUMO É A ÚNICA QUE CABE EM TODOS OS TAMANHOS — ENTÃO É ELA
//      QUE CARREGA O AVISO
// ─────────────────────────────────────────────────────────────────────────────
//
// O `<summary>` tinha ramo para "lendo…" e para "falharam", e **nenhum para
// "não lido"**. Com cinco arquivos ilegíveis a pessoa lia "5 anexos", seco. E os
// selos por arquivo, que são a honestidade desta tela, pintavam 0 de 5 a
// 375×600 e 2 de 5 nos outros tamanhos (medido por `experiencia`, e reproduzido
// por `scripts/medir-a-vista-do-briefing.mjs`).
//
// A conta virou função pura e exportada porque, enquanto morava dentro do JSX,
// o ramo que faltava era invisível para a suíte inteira — nenhum teste desta
// casa renderiza `PublicBriefingRoom`.
describe("⛔ E3 · o resumo dos anexos conta os QUATRO estados", () => {
  type Item = Parameters<typeof resumoDosAnexos>[0][number];
  const it_ = (status: Item["status"], lido?: boolean): Item => ({ status, lido });

  it("🔑 cinco anexos que chegaram e não puderam ser lidos NÃO viram '5 anexos' seco", () => {
    const r = resumoDosAnexos([
      it_("done", false), it_("done", false), it_("done", false), it_("done", false), it_("done", false),
    ]);
    expect(r.total).toBe(5);
    expect(r.naoLidos).toBe(5);
    expect(r.pedeAtencao).toBe(true);
  });

  it("🔑 os quatro estados são contados SEPARADAMENTE — nenhum se esconde no outro", () => {
    const r = resumoDosAnexos([
      it_("done", true),
      it_("done", false),
      it_("uploading"),
      it_("error"),
    ]);
    expect(r).toEqual({ total: 4, lendo: 1, naoLidos: 1, falhados: 1, pedeAtencao: true });
  });

  it("✅ e NÃO inventa aviso no caso limpo — tudo lido não pede atenção nenhuma", () => {
    const r = resumoDosAnexos([it_("done", true), it_("done", true)]);
    expect(r.naoLidos).toBe(0);
    expect(r.falhados).toBe(0);
    expect(r.pedeAtencao).toBe(false);
  });

  it("✅ arquivo ainda subindo não é 'não lido' — é o terceiro estado, e ele espera", () => {
    // Confundir os dois é o B6 de volta: pedir ao cliente que conte o conteúdo
    // de um arquivo que chega em dois segundos.
    const r = resumoDosAnexos([it_("uploading")]);
    expect(r.naoLidos).toBe(0);
    expect(r.lendo).toBe(1);
    expect(r.pedeAtencao).toBe(false);
  });

  it("lista vazia não vira contagem nenhuma", () => {
    expect(resumoDosAnexos([])).toEqual({ total: 0, lendo: 0, naoLidos: 0, falhados: 0, pedeAtencao: false });
  });
});
