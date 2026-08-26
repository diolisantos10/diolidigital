// regua-da-peca-final.ts — O PORTEIRO DO ARQUIVO QUE O CLIENTE RECEBE.
//
// ── O INCIDENTE QUE PRODUZIU ESTE ARQUIVO (cliente oculto, 25/08/2026) ──────
//
// Uma peça saiu assim, em PRODUÇÃO, e foi carimbada `visibility:
// "compartilhado"` — ou seja, foi para o portal do cliente:
//
//   SocialPost cmt8xk6ks00790xqofkbfqpab (TRATTORIA DA ANA TESTE)
//   1080x1350, 19.207 bytes — FOTO AUSENTE (retângulo chapado no lugar dela),
//   título cortado no meio da frase, sem assinatura de marca.
//   A peça irmã do mesmo cliente, correta, tinha 150.203 bytes.
//
// ── POR QUE O PORTÃO QUE JÁ EXISTIA NÃO PEGOU ──────────────────────────────
//
// `trava-de-fundo.ts` é uma boa régua e está no lugar CERTO para a pergunta
// dela: ela mede o FUNDO CRU, antes de a marca ser composta por cima. O
// raciocínio está medido — 29× de separação no fundo cru contra 1,2× na peça já
// composta —, e mover aquele portão para a peça composta reprovaria a casa
// inteira. Medido nesta árvore, sobre as 14 peças vivas GUARDADAS EM
// `docs/entregas/pecas-vivas-27-08/` (Fase 2): na peça COMPOSTA elas têm de
// **159 a 532** cores distintas e até 35% de cor dominante,
// contra os pisos de 600 cores e 45% do portão do fundo. **O portão do fundo
// reprovaria TODAS as peças boas da casa.**
//
// O vão não é o portão errado: é uma pergunta que ninguém fazia. O portão do
// fundo pergunta "isto é uma fotografia?". Esta régua pergunta outra coisa, e
// sobre outro arquivo: **"a foto ENTROU na peça que vai ao cliente?"**
//
// ── ONDE A SEPARAÇÃO ESTÁ, E ELA É DE ORDEM DE GRANDEZA ────────────────────
//
// Na FAIXA DA FOTO (35%..80% da altura — abaixo do título, acima da
// assinatura, em todas as composições da casa), medida nas 12 peças vivas de
// produção contra o mutante "a foto não entrou":
//
//   | amostra                          | cores | dominante | textura |
//   |----------------------------------|-------|-----------|---------|
//   | 14 peças REAIS (pior caso)       |   159 |     0,353 |  0,0066 |
//   | 14 peças REAIS (melhor caso)     |   532 |     0,079 |  0,0181 |
//   | mutante: degradê (pior caso)     |    52 |         — |  0,0033 |
//   | mutante: a foto NÃO entrou       |     1 |     1,000 |  0,0000 |
//
// Não é "por pouco": é 159 contra 1. Os pisos ficam frouxos de propósito, pela
// mesma razão escrita em `trava-de-fundo.ts` — régua rente ao caso conhecido
// reprova a próxima peça legítima e acaba desligada por quem não sabe o que ela
// protege.
//
// ── ESTE ARQUIVO É PURO ────────────────────────────────────────────────────
//
// Nada de disco, rede ou `sharp`. Recebe a MEDIDA já feita e decide. Quem mede
// é `medir-peca-final.ts`. Mesma divisão de `trava-de-fundo.ts`/`medir-fundo.ts`
// e pelo mesmo motivo: a régua precisa ser exercitada sem montar meia casa.

/** Por que a peça final foi recusada. */
export type MotivoDaPecaFinal =
  | "foto_nao_entrou"
  | "arquivo_raso_demais"
  | "sem_titulo_pintado"
  | "sem_assinatura_pintada"
  /**
   * A MEDIDA NÃO SAIU — e isso REPROVA.
   *
   * É a lei desta casa, e ela já foi paga caro: **sem portão = reprovado.**
   * Ambiente sem `sharp` não pode significar "passou": foi assim que os portões
   * de decoração desta casa nasceram. Ver o mesmo motivo em `trava-de-fundo.ts`.
   */
  | "nao_foi_possivel_medir";

export type VereditoDaPecaFinal =
  | { ok: true }
  | { ok: false; motivo: MotivoDaPecaFinal; detalhe: string };

/** A medida da FAIXA DA FOTO da peça composta. Ver `medir-peca-final.ts`. */
export interface MedidaDaPecaFinal {
  /** Cores distintas na faixa da foto, com a profundidade reduzida. */
  coresNaFaixaDaFoto: number;
  /** Fração da faixa da foto ocupada pela cor mais comum, de 0 a 1. */
  dominanteNaFaixaDaFoto: number;
  /** Variação média entre pixels vizinhos na faixa da foto, de 0 a 1. */
  texturaNaFaixaDaFoto: number;
  /** Bytes do arquivo por megapixel de imagem. */
  bytesPorMegapixel: number;
}

// ── OS PISOS ────────────────────────────────────────────────────────────────
//
// Calibrados contra as **14 peças REAIS** de produção guardadas em
// `docs/entregas/pecas-vivas-27-08/`, e contra mutantes construídos a partir de
// CADA UMA delas — nunca contra imagem inventada para o teste passar.
//
// ── A DÍVIDA DO DEGRADÊ, PAGA (Fase 2, 27/08/2026) ─────────────────────────
//
// A Fase 1 mediu que o degradê PASSAVA por esta régua e declarou por que não a
// consertou: só uma peça viva estava guardada nesta árvore, e *"calibrar um
// piso novo sobre uma amostra de um é exatamente como se inventa uma régua que
// reprova a casa inteira."* A dívida era guardar as 12 e recalibrar.
//
// As peças estão guardadas (14, não 12) e a recalibração foi feita — e ela
// mostra que **o eixo estava errado**. A Fase 1 procurou o conserto na TEXTURA,
// onde a separação é de 2× e por isso o piso não podia subir. Medido agora, o
// degradê construído sobre cada uma das 14:
//
//   • CORES:   pior peça real 159 · pior degradê 52 → **3,06× de separação**
//   • textura: pior peça real 0,0066 · pior degradê 0,0033 → 2,00× (inalterado)
//
// ── E O PISO CONTINUA EM 24, POR DECISÃO MEDIDA — NÃO POR OMISSÃO ─────────
//
// Com a amostra na mão, a tentativa foi feita: `PISO_DE_CORES_NA_FOTO = 90`, a
// média geométrica de 52 e 159. **A própria régua desta casa recusou.** O
// teste "a separação é de ORDEM DE GRANDEZA, não 'por pouco'" exige
// `pior peça real > PISO × 5`, e 159 não é 5× nenhum piso que fique acima de
// 52. A conta não fecha porque a separação TOTAL é 3,06× — melhor que os 2× da
// textura, e ainda assim menos que a ordem de grandeza que sustenta os outros
// critérios (159 contra 1).
//
// Não existe piso que pegue o degradê E mantenha 5× de folga. Essa é a
// resposta que a amostra deu, e ela é um FATO novo — a Fase 1 não podia
// tê-la porque media sobre uma peça só.
//
// Por que aceitar o não da régua, em vez de afrouxar o corrimão: as duas
// falhas não custam igual. Piso frouxo deixa passar UM degradê, que o cliente
// vê e recusa — visível, reversível, com dono. Piso rente reprova uma peça
// legítima, o cliente fica sem entrega, e o remédio histórico desta casa para
// isso é alguém desligar a régua — que é como se perde também o que ela pegava.
// O guardrail 4 vale aqui: exija o mecanismo, não a boa intenção. O mecanismo
// (5×) disse não.
//
// A dívida, portanto, muda de forma em vez de sumir: **não é mais "faltam as
// peças" (elas estão em `docs/entregas/pecas-vivas-27-08/`), é "falta um
// discriminador de alta margem"** — do tipo já sugerido pela Fase 1, "as linhas
// da faixa sobem em ordem", que separa degradê de foto por construção e não por
// limiar. Enquanto ele não existir, o degradê passa, e isso está escrito aqui e
// medido no teste, não escondido.
/** Piso de cores na faixa da foto. Pior peça real: 159 · pior degradê: 52.
 *  Continua FROUXO de propósito: ver o bloco acima — não há piso que pegue o
 *  degradê com os 5× de folga que esta casa exige. */
export const PISO_DE_CORES_NA_FOTO = 24;
/** Teto da cor dominante na faixa da foto. Pior peça real: 0,353. */
export const TETO_DA_DOMINANTE_NA_FOTO = 0.90;
/** Piso de textura na faixa da foto. Pior peça real: 0,0066 · pior degradê
 *  0,0033 — 2× só, e por isso este piso continua FROUXO de propósito. Quem
 *  pega o degradê é o piso de CORES, acima. */
export const PISO_DE_TEXTURA_NA_FOTO = 0.0015;
/**
 * Piso de bytes por megapixel.
 *
 * ⚠️ **Honestidade sobre qual critério pega o incidente.** Este NÃO é o critério
 * forte: a peça real mais magra da casa tem 54.309 B/MP e o mutante "a foto não
 * entrou" ainda tinha 49.776, porque ele conserva os pixels de foto que ficam
 * ATRÁS do título. Quem separa por ordem de grandeza é a faixa da foto (163
 * cores contra 1). Este piso fica porque é a impressão digital LITERAL do
 * incidente — 19.207 bytes em 1080x1350 são 13.170 B/MP — e porque ele pega um
 * caso que a faixa não pega: o arquivo truncado, que decodifica e mede bem no
 * pedaço que sobrou. Quem achar que esta régua tem quatro defesas contra "a
 * foto não entrou" está enganado: tem uma forte e três de flanco.
 */
export const PISO_DE_BYTES_POR_MEGAPIXEL = 18_000;

/**
 * A FOTO ENTROU? — a pergunta forte, medida no arquivo que vai ao cliente.
 *
 * Os critérios são disjuntivos: **basta um** para reprovar, porque cada um pega
 * um jeito diferente de a peça sair sem foto (o retângulo chapado, o degradê da
 * cor da marca, o arquivo truncado).
 */
export function reguaDoPixelDaPecaFinal(m: MedidaDaPecaFinal): VereditoDaPecaFinal {
  if (m.coresNaFaixaDaFoto < PISO_DE_CORES_NA_FOTO) {
    return {
      ok: false,
      motivo: "foto_nao_entrou",
      detalhe: `a faixa da foto tem ${m.coresNaFaixaDaFoto} cores distintas (piso: ${PISO_DE_CORES_NA_FOTO}). Isso é campo chapado, não fotografia — a foto não entrou na peça.`,
    };
  }
  if (m.dominanteNaFaixaDaFoto > TETO_DA_DOMINANTE_NA_FOTO) {
    return {
      ok: false,
      motivo: "foto_nao_entrou",
      detalhe: `${Math.round(m.dominanteNaFaixaDaFoto * 100)}% da faixa da foto é uma cor só (teto: ${Math.round(TETO_DA_DOMINANTE_NA_FOTO * 100)}%). É o retângulo chapado no lugar da foto.`,
    };
  }
  if (m.texturaNaFaixaDaFoto < PISO_DE_TEXTURA_NA_FOTO) {
    return {
      ok: false,
      motivo: "foto_nao_entrou",
      detalhe: `a variação entre pixels vizinhos na faixa da foto é ${m.texturaNaFaixaDaFoto.toFixed(4)} (piso: ${PISO_DE_TEXTURA_NA_FOTO}). Não há imagem ali.`,
    };
  }
  if (m.bytesPorMegapixel < PISO_DE_BYTES_POR_MEGAPIXEL) {
    return {
      ok: false,
      motivo: "arquivo_raso_demais",
      detalhe: `o arquivo tem ${Math.round(m.bytesPorMegapixel)} bytes por megapixel (piso: ${PISO_DE_BYTES_POR_MEGAPIXEL}). A peça de 19.207 bytes que foi ao cliente em 25/08/2026 tinha 13.170.`,
    };
  }
  return { ok: true };
}

/**
 * O QUE A COMPOSIÇÃO DIZ TER PINTADO.
 *
 * As outras duas perguntas — "o texto coube?" e "a assinatura está lá?" — não
 * se respondem olhando pixel: ler letra de volta da imagem é OCR, e OCR que
 * erra vira régua que reprova peça boa. Elas se respondem no ÚNICO lugar onde a
 * resposta é fato e não estimativa: a lista de textos que o rasterizador
 * conferiu CONTRA O DOM antes de fotografar a tela (`renderizarHtml` →
 * `textosEsperados`). Se o rasterizador confirmou o título e a assinatura no
 * DOM, eles estão no pixel.
 *
 * ⚠️ **O que esta metade NÃO mede, dito em voz alta:** ela prova que a letra
 * FOI PINTADA, não que ela ficou legível nem que coube na caixa. Quem mede
 * transbordo é `renderizarHtml` (motivo `texto_cortado`) e quem mede contraste
 * é `legibilidade-do-titulo.ts`. Esta régua não duplica nenhum dos dois — ela
 * fecha o buraco de a peça sair com a caixa VAZIA.
 */
export interface DeclaracaoDaComposicao {
  /** Os textos que o rasterizador conferiu no DOM. */
  textosPintados: readonly string[];
  /** O título que a peça deveria carregar. Vazio = peça declaradamente sem título. */
  tituloPedido: string;
  /** A assinatura que a peça deveria carregar. Vazio = marca sem nome utilizável. */
  assinaturaPedida: string;
}

/**
 * COMO SE COMPARA UM TEXTO PEDIDO COM UM TEXTO PINTADO.
 *
 * Caixa e espaço em branco não contam. Não é frouxidão: entre o pedido e o DOM
 * há travas que NORMALIZAM de propósito (`travaDeRotuloNaArte` devolve o texto
 * saneado, o selo e a faixa sobem em caixa alta). Comparar byte a byte faria a
 * régua reprovar peça CERTA na primeira marca com acento maiúsculo — e régua
 * que reprova o caso bom é régua desligada. O buraco que ela fecha é a caixa
 * VAZIA, e esse a normalização não esconde.
 */
const mesmaLetra = (t: string): string => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function reguaDaLetraDaPecaFinal(d: DeclaracaoDaComposicao): VereditoDaPecaFinal {
  const pintados = new Set(d.textosPintados.map(mesmaLetra).filter(Boolean));
  const titulo = mesmaLetra(d.tituloPedido);
  if (titulo && !pintados.has(titulo)) {
    return {
      ok: false,
      motivo: "sem_titulo_pintado",
      detalhe: `o título pedido não está entre os textos que o rasterizador conferiu no DOM — a peça sairia com a caixa do título vazia ou com outra frase.`,
    };
  }
  const assinatura = mesmaLetra(d.assinaturaPedida);
  if (assinatura && !pintados.has(assinatura)) {
    return {
      ok: false,
      motivo: "sem_assinatura_pintada",
      detalhe: `a assinatura "${d.assinaturaPedida.trim()}" não foi pintada na peça — ela sairia em nome de ninguém.`,
    };
  }
  return { ok: true };
}

/**
 * A RÉGUA INTEIRA, numa chamada. `medida: null` REPROVA — é a lei do
 * "sem portão = reprovado".
 */
export function reguaDaPecaFinal(
  medida: MedidaDaPecaFinal | null,
  declaracao: DeclaracaoDaComposicao,
): VereditoDaPecaFinal {
  if (!medida) {
    return {
      ok: false,
      motivo: "nao_foi_possivel_medir",
      detalhe:
        "não foi possível medir a peça final (imagem não decodificou, ou não há `sharp` neste ambiente). " +
        "Ausência de medida NUNCA é aprovação: a peça não recebe arquivo nem carimbo.",
    };
  }
  const pixel = reguaDoPixelDaPecaFinal(medida);
  if (!pixel.ok) return pixel;
  return reguaDaLetraDaPecaFinal(declaracao);
}

/** O motivo em UMA linha, para o `lastError` da peça. */
export function motivoDaPecaFinalEmUmaLinha(v: VereditoDaPecaFinal): string {
  if (v.ok) return "";
  return `peça final reprovada (${v.motivo}) — ${v.detalhe}`;
}
