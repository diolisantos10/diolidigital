// trava-de-fundo.ts — O PORTEIRO DO FUNDO. CLIPART NÃO SAI DAQUI.
//
// ── O INCIDENTE QUE PRODUZIU ESTE ARQUIVO (CEO, 08/08/2026) ─────────────────
//
// O CEO reprovou as duas peças do CityJobs de 08/08. O fundo era **desenhado em
// código**: prédios como retângulos chapados, um círculo amarelo de sol. A
// escolha está escrita na mensagem do commit `4c4ea1a`, e escrita como virtude:
//
//   "O FUNDO É DESENHADO EM CÓDIGO (SVG), não gerado por IA (...) SVG escrito à
//    mão não inventa nada, custa zero e é determinístico."
//
// Os três argumentos são verdadeiros e a conclusão é errada. Economizou-se
// centavos de imagem e entregou-se peça amadora em nome de um cliente pagante.
//
// ── POR QUE UM AVISO NÃO RESOLVERIA ────────────────────────────────────────
//
// A lei da casa: **trava, não aviso**. O agente que fez aquilo não desobedeceu
// a nada — ele fez uma escolha de engenharia razoável num vácuo de regra, e
// documentou. Sem mecanismo, o próximo agente com pressa ou com orçamento curto
// faz de novo, com a mesma boa consciência. Um `.md` dizendo "use foto" é
// exatamente o tipo de regra que esta casa já provou não proteger nada.
//
// ── POR QUE NÃO BASTA EXIGIR `fundo !== null` ───────────────────────────────
//
// É a armadilha central, e é a razão de este arquivo medir PIXEL.
//
// A peça reprovada **tinha fundo**. `PecaDoMolde.fundo` estava preenchido: era
// um `data:image/svg+xml` com o desenho dentro. Qualquer guarda do tipo "a peça
// tem imagem de fundo?" responderia SIM e deixaria o clipart passar. O que
// distingue fotografia de desenho não é a presença do campo — é o que há dentro
// dele.
//
// ── AS DUAS PERGUNTAS, E ELAS SÃO INDEPENDENTES ────────────────────────────
//
//   1. A DECLARAÇÃO — o fundo é vetor desenhado por nós? (barato, determinístico)
//   2. O PIXEL — o que está lá tem a riqueza de uma fotografia? (é o que pega o
//      desenho que chegou já rasterizado em PNG, e foi assim que a peça
//      reprovada chegou ao CEO)
//
// A 1 sozinha é contornável (basta rasterizar o SVG antes). A 2 sozinha é cara
// e depende de decodificar imagem. Juntas, fecham o caminho.
//
// ── ESTE ARQUIVO É PURO ─────────────────────────────────────────────────────
//
// Nada de disco, rede ou `sharp`. Ele recebe a MEDIDA já feita e decide. Quem
// mede é `medir-fundo.ts`, que é o único que decodifica imagem. Separado assim
// pelo mesmo motivo de `molde.ts`/`renderizar.ts`: a decisão precisa ser
// testável sem montar meia casa, e a medição precisa poder trocar de biblioteca
// sem reabrir a regra.

/** Por que um fundo foi recusado. */
export type MotivoDoFundo =
  | "sem_fundo"
  | "vetor_desenhado_em_codigo"
  | "pobre_demais_para_ser_foto"
  /**
   * A MEDIDA NÃO SAIU — e isso reprova.
   *
   * Nasceu em 15/08/2026, quando este arquivo saiu do laboratório e entrou no
   * caminho de produção (`portao-do-fundo.ts`). Sem este valor, "não consegui
   * decodificar a imagem" não teria como ser distinguido de "a imagem passou",
   * e o portão viraria decoração no primeiro ambiente sem `sharp` — que é
   * exatamente a forma como os 28 portões de decoração desta casa nasceram.
   *
   * É a lei: **sem portão = reprovado.** Esquecer de medir nunca pode significar
   * aprovado.
   */
  | "nao_foi_possivel_medir";

export type VereditoDoFundo =
  | { ok: true }
  | { ok: false; motivo: MotivoDoFundo; detalhe: string };

/**
 * PERGUNTA 1 — a DECLARAÇÃO do fundo.
 *
 * Recusa a ausência e recusa vetor. `data:image/svg+xml` (em qualquer caixa,
 * com ou sem `;base64`) e SVG cru são desenho nosso, não fotografia.
 *
 * Não recusa PNG nem JPEG: nesta camada eles são plausíveis, e quem decide se
 * o que há dentro deles é foto é a pergunta 2.
 */
export function travaDeFundoDeclarado(fundo: string | null | undefined): VereditoDoFundo {
  const f = (fundo ?? "").trim();
  if (!f) {
    return {
      ok: false,
      motivo: "sem_fundo",
      detalhe:
        "a peça não tem fundo: sai um campo chapado na cor da marca. Isso pode ser degradação declarada num rascunho, mas não é entregável de cliente.",
    };
  }
  const minusculo = f.toLowerCase();
  if (minusculo.startsWith("data:image/svg+xml") || minusculo.includes("<svg")) {
    return {
      ok: false,
      motivo: "vetor_desenhado_em_codigo",
      detalhe:
        "o fundo é um SVG desenhado em código. Foi exatamente isto que o CEO reprovou em 08/08/2026 — prédio-retângulo e sol-círculo. Fundo de peça é FOTOGRAFIA.",
    };
  }
  return { ok: true };
}

/**
 * A medida de um fundo, feita sobre os pixels. Ver `medir-fundo.ts`.
 *
 * Os três números são escolhidos por serem o que separa desenho de fotografia
 * de forma robusta, e não por serem fáceis de calcular:
 */
export interface MedidaDoFundo {
  /**
   * Quantas cores distintas há na amostra, depois de reduzir a profundidade.
   *
   * Ilustração vetorial usa uma paleta: a peça reprovada tinha essencialmente
   * QUATRO cores. Fotografia tem milhares, porque tem luz, sombra e ruído de
   * sensor.
   */
  coresDistintas: number;
  /**
   * Que fração dos pixels é da cor mais comum, de 0 a 1.
   *
   * É a pergunta "existe um bloco chapado dominando a imagem?". Um fundo azul
   * sólido com desenho por cima cai aqui mesmo que a contagem de cores suba por
   * causa do antialiasing das bordas.
   */
  fracaoDaCorDominante: number;
  /**
   * Variação média entre pixels vizinhos, de 0 a 1.
   *
   * Fotografia tem textura em toda parte — folha, tijolo, asfalto, grão. Vetor
   * é liso dentro de cada forma: a variação só existe nas bordas, e a média
   * despenca. É esta que pega o desenho já rasterizado em PNG, que é a forma
   * como a peça reprovada chegou ao CEO.
   */
  texturaMedia: number;
}

/**
 * Os pisos. Nenhum é redondo por acaso — ver `__tests__/design/trava-de-fundo`,
 * onde eles são exercitados contra as peças REPROVADAS de verdade e contra as
 * peças novas de verdade, e não contra imagem inventada para o teste passar.
 *
 * Ficam frouxos de propósito. Uma trava calibrada rente ao caso conhecido
 * reprova a próxima foto legítima que for de neblina, parede branca ou céu
 * limpo — e trava que dispara onde não há risco é desligada por quem não sabe
 * o que ela protege. O alvo é o desenho chapado, que erra por ordens de
 * grandeza, não por pouco.
 */
// ── OS NÚMEROS MEDIDOS, E NÃO ESTIMADOS ────────────────────────────────────
//
// | amostra                        | cores | dominante | textura |
// |--------------------------------|-------|-----------|---------|
// | peça REPROVADA 1 (clipart)     |   232 |     0,528 |   0,031 |
// | peça REPROVADA 2 (clipart)     |   224 |     0,561 |   0,025 |
// | foto real 1 (estação de Mogi)  | 1.958 |     0,018 |   0,056 |
// | foto real 2 (rua do centro)    | 1.675 |     0,018 |   0,072 |
//
// ⚠️ **Honestidade sobre qual critério pegou o incidente:** foram as CORES e a
// COR DOMINANTE. A TEXTURA **não** pegou — o clipart tinha janelinhas e bordas
// suficientes para chegar a 0,031, acima do piso. Ela fica porque pega um caso
// diferente (o degradê liso, o campo de cor com uma forma só), e trava que só
// funciona no caso conhecido é trava calibrada para o retrovisor. Mas quem
// achar que este arquivo tem três defesas contra clipart está enganado: contra
// ESTE clipart, tem duas.
export const PISO_DE_CORES_DISTINTAS = 600;
export const TETO_DA_COR_DOMINANTE = 0.45;
export const PISO_DE_TEXTURA = 0.012;

/**
 * PERGUNTA 2 — o PIXEL.
 *
 * Reprova quando a medida é pobre demais para ter vindo de uma câmera. Os três
 * critérios são conjuntivos ao contrário: **basta um** para reprovar, porque
 * cada um pega um jeito diferente de o desenho chapado passar.
 */
export function travaDeRiquezaDoFundo(m: MedidaDoFundo): VereditoDoFundo {
  if (m.coresDistintas < PISO_DE_CORES_DISTINTAS) {
    return {
      ok: false,
      motivo: "pobre_demais_para_ser_foto",
      detalhe: `o fundo tem ${m.coresDistintas} cores distintas (piso: ${PISO_DE_CORES_DISTINTAS}). Isso é paleta de ilustração, não fotografia.`,
    };
  }
  if (m.fracaoDaCorDominante > TETO_DA_COR_DOMINANTE) {
    return {
      ok: false,
      motivo: "pobre_demais_para_ser_foto",
      detalhe: `${Math.round(m.fracaoDaCorDominante * 100)}% do fundo é uma cor só (teto: ${Math.round(TETO_DA_COR_DOMINANTE * 100)}%). É bloco chapado.`,
    };
  }
  if (m.texturaMedia < PISO_DE_TEXTURA) {
    return {
      ok: false,
      motivo: "pobre_demais_para_ser_foto",
      detalhe: `a variação entre pixels vizinhos é ${m.texturaMedia.toFixed(4)} (piso: ${PISO_DE_TEXTURA}). Fotografia tem textura em toda parte; vetor é liso dentro de cada forma.`,
    };
  }
  return { ok: true };
}
