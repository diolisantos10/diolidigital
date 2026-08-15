// trava-de-texto.ts — O QUE PODE VIRAR PIXEL.
//
// ── POR QUE ESTA TRAVA EXISTE ───────────────────────────────────────────────
//
// Até 05/08/2026 `artes.ts` proibia QUALQUER texto na arte, e a proibição tinha
// duas razões escritas no cabeçalho dele (`lib/agency/execution/artes.ts:11`):
//
//   1. modelo de imagem erra letra;
//   2. "preço, telefone e prazo dentro de um pixel escapam do piso de verdade,
//      que lê texto e não enxerga imagem — seria o único lugar da casa onde um
//      dado inventado passaria sem ninguém conferir".
//
// O molde resolve a razão 1 por construção: a letra passa a sair do
// rasterizador de fonte. A razão 2 NÃO se resolve sozinha — ela piora, porque
// agora existe texto na imagem. Este arquivo é a resposta a ela, e é ele que
// autoriza o motor de molde a existir sem furar o piso da casa.
//
// ── AS DUAS CONDIÇÕES, AMBAS DETERMINÍSTICAS ────────────────────────────────
//
// A. LASTRO LITERAL. O texto pintado tem de ser TRECHO LITERAL do conteúdo que
//    já passou pela esteira e pelo piso de verdade (a legenda do post, ou a
//    cena descrita do carrossel). Não "parecido", não "resumido por IA": trecho
//    literal, conferido por comparação de string normalizada.
//
// B. NENHUMA CLASSE DE FATO PERIGOSA. Mesmo com lastro, dinheiro, percentual,
//    telefone, prazo e promessa superlativa NÃO entram na arte. Motivo: a
//    correção de uma legenda é uma edição de texto; a correção de um número
//    dentro de um PNG já publicado é um post apagado.
//
// Sem as duas condições, a peça sai SEM camada de texto (só a foto).
//
// ── A LIÇÃO DA 7ª AUDITORIA ADVERSARIAL (05/08/2026) ────────────────────────
//
// A trava caía com UM CARACTERE INVISÍVEL. `"So hoje: R​$ 19,90 o kilo"`
// passava por todas as classes — a regex de preço procura "r$" e encontrava
// "r​$" — e o LASTRO SOBREVIVIA, porque `normalizar` virava o invisível em
// espaço NOS DOIS LADOS. O pixel saía com "R$ 19,90" legível. Soft hyphen
// (U+00AD) e NBSP não são exóticos: é o que Word e PDF colam, e a legenda vem
// de briefing colado.
//
// Por isso TUDO aqui roda sobre a forma HIGIENIZADA (`higienizar`) e a
// comparação de classe roda sobre a forma DOBRADA (`dobrar`: sem acento, sem
// caixa). Duas consequências que valem dizer:
//
//   • o texto que a trava DEVOLVE é o higienizado — é ele que vai virar pixel,
//     e não a string crua que chegou. Assim o bidi override (U+202E), que fazia
//     o DOM bater com o pedido e o pixel mostrar a palavra invertida, morre na
//     entrada em vez de morrer no conferidor;
//   • a segunda auditoria também derrubou a metade que não existia: "hoje",
//     "de graça", "leve três pague dois", "cinquenta por cento", "vinte pila" e
//     "o mais gostoso da cidade" são a forma que a LÍNGUA usa, e nenhuma delas
//     era pega por regex que exige dígito ou a grafia canônica.
//
// ── A LIÇÃO DA 8ª AUDITORIA ADVERSARIAL (05/08/2026) ────────────────────────
//
// Ela derrubou três coisas de uma vez, e as três vieram do MESMO vício: medir a
// trava com o corpus de quem a escreveu.
//
//   ① MORFOLOGIA NÃO É OBFUSCAÇÃO. `desconto`, `oferta`, `promocao` e
//     `liquidacao` estavam na lista; "Descontão", "Ofertão", "Feirão",
//     "Promocional", "Descontinho", "Preço baixo", "Sem juros" e "Zero taxa"
//     passavam inteiros. Aumentativo e diminutivo são a morfologia NORMAL do
//     português — é a forma que um modelo escrevendo legenda de varejo escolhe
//     sozinho, sem adversário nenhum. Por isso a classe passou a ser escrita por
//     RADICAL (`descont(o|ao|inho|aco)`), não por palavra inteira.
//
//   ② O FALSO POSITIVO ERA 22,7%, e o ZERO declarado media o CORPUS. As 14
//     legendas de padaria tinham sido escritas pelo mesmo autor das regexes, no
//     mesmo commit. Rodadas 44 legendas de outras verticais, 10 caíam — e uma
//     delas ("A partir de agora atendemos também aos sábados") caía como PREÇO,
//     rótulo puramente errado. Uma em cada cinco peças saía como foto pelada com
//     a explicação enterrada no `lastError`. Falha para o lado seguro, e é
//     exatamente assim que se treina um time a ignorar o alarme.
//
//     A regra que ficou: **o corpus de medição vem de vertical que o autor da
//     regra não usou**, e as DUAS taxas (falso positivo e falso negativo) saem
//     na mesma rodada. Medido em 05/08/2026 sobre 8 verticais novas (oficina,
//     ótica, floricultura, contabilidade, idiomas, nutrição, gráfica,
//     arquitetura) e sobre um segundo corpus de BORDA, feito de legendas
//     legítimas que encostam de propósito em cada padrão novo:
//
//                          FP (texto)      FN (texto)     FN (selo)
//       corpus novo      14,3% →  0,0%   43,8% → 0,0%   90,0% → 0,0%
//       corpus de borda  62,9% →  2,9%   48,0% → 0,0%   87,5% → 0,0%
//
//     O 2,9% que sobra é uma linha só: "A oferta de papel reciclado depende do
//     fornecedor". `oferta` fica na lista de propósito — separar essa acepção da
//     comercial é julgamento de sentido, e o custo de errar para o outro lado é
//     a palavra "oferta" carimbada numa peça.
//
//   ③ TESTE DE TRAVA TEM DE ISOLAR A OBFUSCAÇÃO QUE ELE AFIRMA FECHAR. O caso
//     que provava "homóglifo cirílico — FECHADO" era `"Sо hoje: Р$ 19,90"`:
//     barrado por `hoje` e por `19,90`, com o homóglifo sem participar do
//     veredito. "Рromocao da semana" passava inteiro, e o pixel saía legível e
//     idêntico ao olho, porque a trava devolve o higienizado e o higienizado
//     preservava o cirílico. FECHADO de verdade agora (tabela `HOMOGLIFOS`,
//     dobrada dentro de `higienizar`), e o teste passou a usar caso em que SÓ o
//     homóglifo decide.
//
// ── O QUE ESTA TRAVA NÃO FECHA — DITO COM TODAS AS LETRAS ───────────────────
//
// Ela é DETERMINÍSTICA e trabalha sobre a FORMA do texto. Estas famílias
// continuam passando, e estão fixadas em teste (`__tests__/design/molde.test.ts`,
// "o resíduo conhecido") para que a lacuna não seja silenciosa:
//
//   1. grafia errada de propósito ("gratiz");
//   2. quantia nua, sem verbo e sem unidade ("Pão por 5");
//   3. prazo perifrástico, sem marcador ("enquanto o forno estiver aceso");
//   4. canal de contato sem número ("chame no zap");
//   5. NOVA, e é uma TROCA CONSCIENTE: o dia corrente SEM marcador de urgência
//      ("Hoje tem pão doce"). `hoje` era barrado nu, e nu ele comia "Hoje é dia
//      de sorrir sem medo" e "A rosa que chegou hoje cedo do produtor". O que
//      transforma o dia em PRAZO é a companhia ("só hoje", "hoje só até as
//      18 h", "até hoje") — e é ela que a classe passou a exigir. `amanha` e
//      `hj` continuam nus: os dois só existem prometendo data;
//   6. homóglifo de alfabeto FORA da tabela (armênio, cherokee, copta). No
//      RÓTULO isso está fechado por outro caminho — o alfabeto do selo é
//      `\p{Script=Latin}`, não `\p{L}` —, mas no texto livre sobra.
//
// Fechar 1–4 exige julgamento de SENTIDO — LLM-judge, o mesmo que o BACKLOG já
// prevê para os gates subjetivos. Qualquer regex larga o bastante para pegá-las
// come legenda legítima, e trava que apaga a camada de texto de toda peça em
// silêncio protege tanto quanto trava nenhuma.

/** Espaços que não são o espaço comum. Vêm de Word, PDF e teclado de celular. */
const ESPACOS_EXOTICOS = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u2028\u2029]/g;

/**
 * Tudo que ocupa zero pixel e mesmo assim quebra uma regex.
 *
 * `\p{Cf}` cobre zero-width space, soft hyphen, joiners, marcas de bidi
 * (U+202A–U+202E, U+2066–U+2069) e BOM. Os intervalos escritos à mão ao lado
 * são os que NÃO estão em `Cf` e enganam do mesmo jeito: seletores de variação,
 * o combining grapheme joiner e os vogais-filler do hangul.
 */
const INVISIVEIS = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180E\u3164\uFE00-\uFE0F\uFFA0]/gu;

/** Controle ASCII, menos `\n`, `\r` e `\t` — que `tituloDaFonte` ainda lê. */
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * HOMÓGLIFO: a letra que não é a letra.
 *
 * `Рromocao` com Р cirílico (U+0420) é, para o olho e para o pixel, idêntico a
 * `Promocao` — e, para toda regex latina desta casa, uma palavra que ela nunca
 * viu. Até a 8ª auditoria isto passava, e o teste que dizia fechar o buraco
 * usava `"Sо hoje: Р$ 19,90"`: barrado por `hoje` e por `19,90`, com o
 * homóglifo sem participar do veredito.
 *
 * Cada par abaixo é `não-latino → latino`, e a dobra acontece na ENTRADA
 * (dentro de `higienizar`), não só no julgamento: assim o texto que a trava
 * DEVOLVE para virar pixel também já é latino, e não sobra a versão em que o
 * veredito e o pixel discordam.
 *
 * Fecha cirílico, grego e as duas latinas sem ponto. NÃO fecha armênio,
 * cherokee nem os confusáveis raros do Unicode — essa metade está declarada no
 * cabeçalho e travada em teste.
 */
const HOMOGLIFOS: Record<string, string> = {
  // cirílico
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M",
  "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T",
  "У": "Y", "Х": "X", "Ѕ": "S", "І": "I", "Ј": "J",
  "Ԛ": "Q", "Ԝ": "W",
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m",
  "н": "h", "о": "o", "р": "p", "с": "c", "т": "t",
  "у": "y", "х": "x", "ѕ": "s", "і": "i", "ј": "j",
  "ԛ": "q", "ԝ": "w",
  // grego
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
  "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O",
  "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
  "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v",
  "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
  "γ": "y",
  // latino sem ponto (teclado turco) e afins
  "ı": "i", "ȷ": "j",
};
const HOMOGLIFO = new RegExp(`[${Object.keys(HOMOGLIFOS).join("")}]`, "gu");

/**
 * A forma em que qualquer texto entra nesta casa antes de ser julgado.
 *
 * NFKC primeiro, e de propósito: ele desfaz largura total (`Ｒ＄ １９`),
 * matemático estilizado (`𝟏𝟗`), sobrescrito e ligadura — todos formas de
 * escrever "R$ 19" que uma regex ASCII não vê. Depois somem os invisíveis, os
 * espaços exóticos viram espaço comum e o homóglifo vira a letra que ele imita.
 */
export function higienizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(INVISIVEIS, "")
    .replace(CONTROLES, "")
    .replace(ESPACOS_EXOTICOS, " ")
    .replace(HOMOGLIFO, (c) => HOMOGLIFOS[c] ?? c);
}

/** Tem caractere invisível ou de controle bidi? Para quem confere DEPOIS —
 *  o renderizador usa isto no DOM, como segunda linha de defesa. */
export function temCaractereInvisivel(s: string): boolean {
  // Regex nova a cada chamada de propósito: as constantes acima têm a flag `g`
  // e `.test()` sobre regex global guarda `lastIndex` — a segunda chamada com a
  // mesma string devolveria `false`. Um portão que alterna entre passar e
  // barrar é pior que portão nenhum.
  return new RegExp(INVISIVEIS.source, "u").test(s) || new RegExp(CONTROLES.source).test(s);
}

/**
 * Higienizado, sem acento e sem caixa — mantendo dígito e pontuação.
 *
 * É a forma sobre a qual as CLASSES são procuradas. Sem isto, cada padrão
 * precisaria escrever "grátis|gratis|GRÁTIS|GRATIS" e um deles seria esquecido.
 */
export function dobrar(s: string | null | undefined): string {
  return higienizar(s)
    .normalize("NFD")
    // TODA marca combinante, n\u00e3o s\u00f3 os acentos latinos (U+0300\u2013U+036F). O que
    // isso fecha al\u00e9m do acento: o keycap de emoji \u2014 "1\ufe0f\u20e31\ufe0f\u20e39\ufe0f\u20e3\u2026" \u00e9 d\u00edgito +
    // seletor de varia\u00e7\u00e3o + U+20E3, e o U+20E3 no meio fazia a corrida de
    // d\u00edgitos do telefone deixar de ser corrida.
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Desfaz o espa\u00e7amento letra-a-letra: "G R A T I S" e "G.R.A.T.I.S" viram
 * "gratis". S\u00f3 colapsa corridas de TR\u00caS OU MAIS caracteres soltos \u2014 "o p\u00e3o e a
 * manh\u00e3" n\u00e3o tem tr\u00eas soltos em sequ\u00eancia, e por isso n\u00e3o \u00e9 tocado.
 *
 * Roda sobre a forma dobrada, e a classe \u00e9 procurada nas DUAS formas.
 */
export function desespacar(d: string): string {
  return d.replace(/(?:\b[a-z0-9][\s.\-_*\u00b7'|]+){2,}\b[a-z0-9]\b/g, (m) => m.replace(/[^a-z0-9]/g, ""));
}

/** Tira acento, caixa e pontuação; colapsa espaço. É a forma em que os dois
 *  lados da comparação de lastro se encontram. */
export function normalizar(s: string): string {
  return dobrar(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O texto é trecho literal da fonte auditada?
 *
 * Comparação por substring da forma normalizada. Normalizar antes é de
 * propósito: o layout aplica caixa alta e o corte pode comer a pontuação final,
 * e nenhuma das duas coisas muda o que a frase AFIRMA. O que a normalização
 * NÃO faz é aproximar palavra: token trocado quebra o lastro, que é o ponto.
 */
export function temLastroLiteral(texto: string, fonte: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return normalizar(fonte).includes(t);
}

// ─── As classes ─────────────────────────────────────────────────────────────
//
// Escritas contra a forma DOBRADA: minúscula, sem acento, com dígito e
// pontuação preservados. Quem escrever padrão novo aqui precisa lembrar disso
// — `/grátis/` nunca casaria.

/** Número por extenso. É o que faz "cinquenta por cento" e "vinte pila" caírem
 *  nas mesmas classes que "50%" e "R$ 20". */
const NUM =
  "(?:zero|uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezasseis|dezessete|dezassete|dezoito|dezenove|dezanove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milhao|milhoes|meia|meio)";

/** Marcador de data no calendário do cliente. */
const DIA =
  "(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|feira|natal|pascoa|carnaval|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";

export interface ClasseDeTexto {
  classe: string;
  padrao: RegExp;
}

// ═══════════════════════════════════════════════════════════════════════════
// A LISTA SE PARTE EM DUAS, E A DIVISÃO É A REGRA (13/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Até hoje isto era um array só, usado por um lugar só (o pixel). O raio-X de
// 13/08 mostrou que a casa tem **duas** perguntas diferentes e só sabia
// responder uma delas:
//
//   • CLASSES DE FATO — preço, percentual, telefone, prazo, promessa comercial.
//     São coisas que o cliente PODE ter de verdade. "R$ 19,90" numa legenda é
//     legítimo se o cliente informou aquele preço, e quem confere isso contra a
//     verdade dele é `piso-de-verdade.ts`, que lê o banco. Estas classes só são
//     proibidas **no pixel**, e o motivo está no cabeçalho: corrigir uma legenda
//     é editar texto; corrigir um número dentro de um PNG publicado é apagar o
//     post.
//
//   • CLASSES DE ALEGAÇÃO — superlativo sem lastro, jargão de robô, promessa
//     vaga, prova social sem prova, multidão inventada. Estas **não têm versão
//     verdadeira**. Não existe cliente para quem "solução inovadora" ou "as
//     melhores empresas da região" seja fato conferível: são afirmações que
//     nenhum banco de dados pode sustentar. Elas são proibidas nos DOIS lugares.
//
// ── POR QUE ISSO IMPORTA, com a medição atrás ───────────────────────────────
//
// O piso de verdade e o contrato de saída barram fato inventado e contagem
// errada. Nenhum dos dois tem opinião sobre texto ruim — isso ficou inteiro nas
// mãos do juiz de IA (`quality-auditor.ts`), que julga com cinco perguntas em
// prosa e a instrução "flag só se houver problema real".
//
// Em 07/08, produção real, esse juiz carimbou `quality_ok` em 8 peças que um
// humano reprovou na hora seguinte (`docs/projetos/cityjobs-registro-07-08.md:139`).
// As frases estão registradas: *"Tem centenas de vagas esperando"*, *"aumenta
// suas chances drasticamente"*, *"as melhores empresas da região"*. As três
// passaram por tudo que esta casa tem — porque nada disso é fato inventado, é
// texto ruim, e texto ruim não tinha trava.
//
// A lei da casa resolve: **prompt é aviso; código é trava.** O que dá para
// escrever em regex vira regex, e a opinião da IA passa a julgar o que sobrou.
//
// ── UMA LISTA, DOIS USOS — e por que não duas listas ────────────────────────
//
// `CLASSES_PROIBIDAS_NA_ARTE` continua existindo e continua sendo a soma das
// duas. A arte é o lugar MAIS restrito da casa, então tudo que é proibido na
// legenda é proibido no pixel por construção — não por alguém lembrar de copiar
// a regra para lá. Duas cópias divergem em três meses; é a doença que este
// repositório já pagou em manual, em preço e em material.

/** O que o cliente PODE ter de verdade — e por isso só é proibido no pixel. */
export const CLASSES_DE_FATO: ClasseDeTexto[] = [
  // ── DINHEIRO ──────────────────────────────────────────────────────────────
  { classe: "preço", padrao: /r\$|\bbrl\b|\breais\b/ },
  { classe: "preço", padrao: /\b\d+[.,]\d{2}\b/ },
  // Gíria de dinheiro só conta com quantidade na frente — "conto" e "prata"
  // sozinhos são substantivos comuns ("conto de fadas").
  { classe: "preço", padrao: new RegExp(`\\b(?:\\d+|${NUM})\\s*(?:pila|contos?|mangos?|pratas?|paus)\\b`) },
  // "A partir de" SÓ com quantia, e não com hora nem com data. A 8ª auditoria
  // achou aqui o erro de rótulo mais puro do arquivo: `\ba partir de\b` marcava
  // "A partir de agora atendemos também aos sábados" — uma frase TEMPORAL — como
  // PREÇO, e a peça saía sem texto com a explicação errada no `lastError`.
  { classe: "preço", padrao: new RegExp(`\\b(?:a\\s+partir\\s+de|so\\s+por|apenas\\s+por|por\\s+so)\\s+(?:r\\$\\s*)?(?:\\d+(?:[.,]\\d+)?|${NUM}\\b)(?!\\s*(?:h|hs|hora|horas|minuto|minutos|min|dia|dias|semana|semanas|mes|meses|ano|anos)\\b)`) },
  { classe: "preço", padrao: /\bde\s+\d+\s+por\s+\d+\b/ },
  // Quantia sem símbolo: "Sai por dezenove e noventa" afirma preço do mesmo
  // jeito que "R$ 19,90". Exige o verbo E o número — "fica por cima" e "feito
  // por um padeiro" continuam passando.
  { classe: "preço", padrao: new RegExp(`\\b(?:custa|custam|sai\\s+por|sao\\s+por|fica\\s+por|ficam\\s+por|paga|pagando|leva\\s+por)\\s+(?:\\d+|${NUM}\\b)`) },
  { classe: "preço", padrao: /\b(?:condicao\s+especial|condicoes\s+especiais|precinho)\b/ },
  // O preço afirmado SEM número. "Preço baixo todo dia" e "Preço justo" fazem a
  // mesma afirmação comercial que "R$ 19,90" e não tinham nenhum padrão.
  { classe: "preço", padrao: /\bprec(?:o|os|inho|inhos|ao|oes)\s+(?:baix[oa]s?|just[oa]s?|especia(?:l|is)|de\s+fabrica|de\s+custo|que\s+cabe)\b/ },
  { classe: "preço", padrao: /\b(?:menor|menores|melhor|melhores)\s+prec(?:o|os)\b/ },
  { classe: "preço", padrao: /\bprec(?:o|os)\s+(?:baixo|justo)\b/ },

  // ── PERCENTUAL ────────────────────────────────────────────────────────────
  { classe: "percentual", padrao: /\d+\s*%/ },
  // Sem exigir dígito: "cinquenta por cento" é a mesma afirmação que "50%".
  { classe: "percentual", padrao: /\bpor\s*cento\b/ },
  { classe: "percentual", padrao: /\bmetade\s+d[oe]\s+pre[cç]o\b|\bmetade\s+do\s+preco\b/ },

  // ── TELEFONE / DOCUMENTO ──────────────────────────────────────────────────
  { classe: "telefone ou documento", padrao: /\d[\d\s.\-()]{7,}/ },
  // Ditado por extenso: "onze nove oito sete seis" é um telefone escrito.
  { classe: "telefone ou documento", padrao: new RegExp(`(?:\\b${NUM}\\b[\\s,.\\-]+){4,}\\b${NUM}\\b`) },
  { classe: "telefone ou documento", padrao: /\b(?:cnpj|cpf|cep)\b/ },

  // ── PRAZO ─────────────────────────────────────────────────────────────────
  // Duração com unidade escrita. "Aberto das 7 às 19 h" NÃO cai aqui de
  // propósito: horário de funcionamento não é prazo, e derrubar a camada de
  // texto inteira por causa dele era falso positivo silencioso.
  { classe: "prazo", padrao: /\b\d{1,3}\s*(?:minutos?|min|horas?|dias?|semanas?|meses|mes)\b/ },
  { classe: "prazo", padrao: /\b(?:em|ate|apenas|so|somente)\s+\d{1,2}\s*(?:h|hs)\b/ },
  { classe: "prazo", padrao: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/ },
  // O dia como promessa. `amanha` e `hj` continuam NUS: os dois só aparecem em
  // texto que promete uma data. `hoje` não — a 8ª auditoria mediu "Hoje é dia
  // de sorrir sem medo" e "A rosa que chegou hoje cedo do produtor" caindo como
  // PRAZO, e legenda legítima perdendo a camada de texto inteira em silêncio é
  // o segundo erro simétrico. Então `hoje` passou a exigir COMPANHIA de
  // urgência — que é o que transforma o dia em prazo. O que sobra ("Hoje tem
  // pão doce") está declarado como resíduo no cabeçalho e travado em teste.
  { classe: "prazo", padrao: /\b(?:amanha|hj)\b/ },
  { classe: "prazo", padrao: /\b(?:so|somente|apenas|ate|valid[oa]s?|corre|corra|aproveite|garanta|ultim[oa]s?)\s+(?:ate\s+)?hoje\b/ },
  { classe: "prazo", padrao: /\bhoje\s*[:!,.\-]*\s*(?:so|somente|apenas|e\s+amanha|ultim[oa]s?|aproveite|corre|corra|garanta)\b/ },
  // O chamado de urgência sem data nenhuma. "Compre já" e "Garanta já" viram
  // carimbo no topo da peça e afirmam prazo sem dizer qual.
  { classe: "prazo", padrao: /\b(?:compre|peca|pecam|garanta|garanta|aproveite|agende|reserve|corra|corre|adquira)\s+(?:ja|agora|correndo)\b/ },
  { classe: "prazo", padrao: new RegExp(`\\bate\\s+(?:os?\\s+|as?\\s+|dia\\s+)?(?:${DIA}|\\d|${NUM}\\b)`) },
  { classe: "prazo", padrao: /\bultim[oa]s?\s+(?:dia|dias|hora|horas|chance|chances|unidade|unidades|vaga|vagas|peca|pecas)\b/ },
  { classe: "prazo", padrao: /\b(?:por\s+tempo\s+limitado|enquanto\s+durar|estoque\s+limitado|ultimas?\s+horas?|corre\s+que\s+acaba)\b/ },
  { classe: "prazo", padrao: new RegExp(`\\b(?:esta|essa|nesta|nessa|neste|nesse)\\s+(?:semana|${DIA})\\b`) },
  { classe: "prazo", padrao: /\bvalid[oa]\s+(?:ate|de|por)\b|\bvalidade\b/ },

  // ── PROMESSA COMERCIAL ────────────────────────────────────────────────────
  // ── A LIÇÃO DO ITEM 1 DA 8ª AUDITORIA: MORFOLOGIA, NÃO GRAFIA ERRADA ──────
  // A lista antiga tinha `desconto`, `oferta`, `promocao` e `liquidacao` — e
  // deixava passar "Descontão", "Ofertão", "Feirão", "Promocional",
  // "Descontinho". Aumentativo e diminutivo NÃO são obfuscação de adversário:
  // são a morfologia normal do português e a forma que um modelo escrevendo
  // legenda de varejo escolhe sozinho. Por isso o padrão é por RADICAL.
  { classe: "promessa comercial", padrao: /\b(?:gratis|gratuit[oa]s?|gratuidade|cortesia|brinde|brindes|cupo(?:m|ns)|cashback|descont(?:o|os|ao|oes|inho|inhos|ac[oa]|acos)|ofert(?:a|as|ao|oes|inha|inhas|ac[oa]|acos)|promoc(?:ao|oes)|promocion(?:al|ais)|promo|liquidac(?:ao|oes)|feir(?:ao|oes)|sorteio|sorteios|sortear|concorra|concorrer)\b/ },
  // Três palavras SAÍRAM da lista nua porque cada uma tem vida fora da promoção,
  // e a 8ª auditoria mediu as três: `queima` ("queima de gordura"), `liquida`
  // ("dieta líquida" — o acento some em `dobrar`) e `premio` ("prêmio de seguro
  // entra como despesa dedutível"). As três continuam barradas na forma
  // comercial, logo abaixo e na regra de `ganhe`.
  { classe: "promessa comercial", padrao: /\bqueima\s+(?:de\s+)?(?:estoque|estoques)\b/ },
  // "liquida" nu comia "dieta líquida" (o acento some em `dobrar`).
  { classe: "promessa comercial", padrao: /\bliquida(?:mos)?\s+(?:tudo|geral|total|o\s+estoque|estoque)\b/ },
  { classe: "promessa comercial", padrao: /\bde\s+graca\b/ },
  // Condição de pagamento como promessa. "Sem juros", "zero taxa de entrega" e
  // "entrega sem custo" são as três formas que a família do varejo usa para
  // dizer desconto sem usar a palavra desconto.
  { classe: "promessa comercial", padrao: /\b(?:sem|zero)\s+(?:juros|taxa|taxas|tarifa|tarifas|custo|custos|entrada|fidelidade)\b|\bjuros\s+zero\b/ },
  { classe: "promessa comercial", padrao: /\bparcel(?:e|ado|ada|ados|amos)\s+em\s+(?:ate\s+)?(?:\d+|\S+)\s*x\b/ },
  // "Ganhe" só com o que se ganha. `\bganh[ea]\b` nu barrava "Quem treina ganha
  // disposição" e "Ganha tempo quem manda o arquivo em PDF" — copy legítima.
  { classe: "promessa comercial", padrao: /\bganh[ea]\s+(?:\S+\s+){0,2}?(?:brinde|brindes|cupom|cupons|desconto|descontos|premio|premios|voucher|vale|frete|bonus|gratis|cortesia|kit|sorteio)\b/ },
  { classe: "promessa comercial", padrao: /\bleve\s+mais\b/ },
  { classe: "promessa comercial", padrao: new RegExp(`\\bleve\\s+(?:\\d+|${NUM})\\s+(?:e\\s+)?pague\\b`) },
  { classe: "promessa comercial", padrao: new RegExp(`\\b(?:2|dois|duas)\\s+por\\s+(?:1|um|uma)\\b`) },
  { classe: "promessa comercial", padrao: /\bna\s+compra\s+d[eoa]\b|\bcompre\s+\S+\s+(?:e\s+)?(?:ganhe|leve)\b/ },
  { classe: "promessa comercial", padrao: /\bfrete\s+gratis\b|\bentrega\s+gratis\b/ },
  { classe: "promessa comercial", padrao: /\bpor\s+(?:nossa|minha|conta\s+d[ao]\s+casa)\b|\bpor\s+conta\s+da\s+casa\b/ },
];

/**
 * O que NÃO tem versão verdadeira — proibido no pixel E no texto da peça.
 *
 * Régua de quem escrever padrão novo aqui: se existe um cliente para quem
 * aquilo é FATO conferível contra o banco, o padrão não é desta lista — é de
 * `CLASSES_DE_FATO`, e quem confere é o piso de verdade.
 */
export const CLASSES_DE_ALEGACAO: ClasseDeTexto[] = [
  // ── SUPERLATIVO NÃO SUSTENTÁVEL ───────────────────────────────────────────
  // O que só existe como afirmação de mercado — estes continuam nus.
  // Saíram daqui, e cada saída tem um caso medido pela 8ª auditoria atrás:
  //   • `perfeit[ao]`  — "O look perfeito para o fim de semana" [moda]
  //   • `melhor/maior` — "Quem come melhor dorme melhor": COMPARATIVO
  //   • `unic[ao]`     — "Cada sorriso é único e merece um cuidado próprio"
  // Nos três, a palavra é adjetivo comum antes de ser superlativo de mercado.
  // O que os separa não é a palavra: é o ARTIGO DEFINIDO e a ÂNCORA ("da
  // cidade", "do mercado") — que é o que os padrões abaixo passaram a exigir.
  { classe: "superlativo não sustentável", padrao: /\b(?:garantid[ao]s?|imperdivel|incomparavel|insuperavel|imbativel|inigualavel|sem\s+igual|lider|lideres|campe[ao]|campeoes|campea|sensacional|incrivel|exclusiv[ao]|premium|definitiv[ao]|revolucionari[ao])\b/ },
  // A lista de exceção não é gosto: são SUBSTANTIVOS DE DISCURSO. "O melhor
  // caminho depende do seu faturamento" e "o maior erro é cortar tudo de uma
  // vez" não afirmam superioridade da empresa — afirmam sobre o assunto. O que
  // faz "o melhor" virar alegação é vir seguido do que a empresa VENDE.
  { classe: "superlativo não sustentável", padrao: /\b(?:o|a|os|as)\s+(?:melhor|maior)(?:es)?\b(?!\s+(?:parte|erro|erros|caminho|jeito|jeitos|forma|formas|maneira|momento|hora|desafio|dificuldade|inimigo|problema|amigo|para|pra)\b)/ },
  { classe: "superlativo não sustentável", padrao: /\b(?:melhor|maior)(?:es)?\s+(?:\S+\s+){0,2}?d[oa]s?\s+(?:cidade|regiao|bairro|estado|pais|brasil|mundo|mercado|ramo|segmento)\b/ },
  { classe: "superlativo não sustentável", padrao: /\b(?:melhor|maior)(?:es)?\s+(?:atendimento|servico|servicos|escolha|qualidade|experiencia|custo)\b/ },
  { classe: "superlativo não sustentável", padrao: /\b(?:o|a|os|as)\s+unic[ao]s?\b|\bunic[ao]s?\s+(?:no\s+mercado|d[oa]\s+(?:cidade|regiao|bairro|estado|pais|brasil|mundo))\b/ },
  { classe: "superlativo não sustentável", padrao: /\bn[o°º]?\s*1\b|\bnumero\s*(?:1|um)\b|\btop\s*(?:\d+|um)\b|\b100\s*%/ },
  // A forma que a língua usa para superlativo: artigo + "mais" + adjetivo.
  // Nua, ela comia "O mais importante é a constância" e "o mais indicado para o
  // seu caso" — discurso, não afirmação de mercado. Agora exige ou a ÂNCORA que
  // fecha o superlativo, ou um adjetivo que só existe como alegação comercial.
  { classe: "superlativo não sustentável", padrao: /\b(?:o|a|os|as)\s+mais\s+[a-z]+\s+(?:d[oa]s?\s+(?:cidade|regiao|bairro|estado|pais|brasil|mundo|mercado|ramo|segmento|todos|todas)|que\s+(?:existe|voce))\b/ },
  { classe: "superlativo não sustentável", padrao: /\b(?:o|a|os|as)\s+mais\s+(?:vendid|amad|procurad|pedid|querid|barat|complet|rapid|potent|eficaz|desejad|premiad|elogiad)[a-z]*\b/ },
  { classe: "superlativo não sustentável", padrao: /\bmais\s+[a-z]+\s+d[ao]\s+(?:cidade|regiao|bairro|estado|pais|brasil|mundo)\b/ },
  // O superlativo INDIRETO: a forma que não usa adjetivo nenhum e afirma a
  // mesma coisa. "Ninguém faz igual" é "o melhor" com outras palavras.
  // `ninguem tem` nu barrava "Ninguém tem obrigação de saber tudo sobre a lei",
  // e `voce nunca` barrava "Você nunca está sozinho no seu processo". Nos dois,
  // o superlativo mora no COMPLEMENTO ("igual", "perto", "comeu assim"), não no
  // pronome — então o complemento passou a ser exigido.
  { classe: "superlativo não sustentável", padrao: /\bninguem\s+(?:faz|tem|serve|entrega|cuida|trata|consegue|cozinha)\s+(?:igual|como|assim)\b|\bninguem\s+(?:chega|chegou)\s+perto\b|\bninguem\s+iguala\b|\bnao\s+existe\s+igual\b|\bsem\s+comparacao\b|\bnada\s+se\s+compara\b/ },
  { classe: "superlativo não sustentável", padrao: /\bnunca\s+(?:viu|vira|comeu|provou|experimentou|sentiu|encontrou|achou|vai\s+encontrar|vai\s+achar)\b/ },

  // ── JARGÃO DE ROBÔ ────────────────────────────────────────────────────────
  //
  // Lista negra nomeada pelo CEO ("solução inovadora", "revolucionar o
  // mercado" e parentes). São frases que não dizem NADA sobre o negócio: cabem
  // em qualquer cliente, o que é a definição operacional de texto ruim nesta
  // casa — os prompts já pedem "específico deste negócio, nada que sirva para
  // qualquer cliente" (`especialistas.ts:293`) e ninguém conferia.
  //
  // Cada padrão exige o SINTAGMA inteiro, nunca a palavra solta. `inovador` nu
  // comeria "um método inovador de assar" (descrição legítima); `transformar`
  // nu comeria metade da copy de nutrição e educação, onde transformação é o
  // serviço vendido. O que é jargão é a colocação fixa, e é ela que entra.
  { classe: "jargão de robô", padrao: /\bsolu(?:cao|coes)\s+(?:\S+\s+){0,1}?inovador[ae]s?\b/ },
  { classe: "jargão de robô", padrao: /\brevolucion\w+\s+(?:o|a|os|as)\s+(?:mercado|setor|segmento|ramo|industria|forma)\b/ },
  { classe: "jargão de robô", padrao: /\bveio\s+para\s+(?:revolucionar|transformar|mudar\s+tudo|ficar)\b/ },
  { classe: "jargão de robô", padrao: /\b(?:pensar|pensando|pensamos)\s+fora\s+da\s+caixa\b/ },
  { classe: "jargão de robô", padrao: /\b(?:novo|outro)\s+patamar\b|\bdivisor\s+de\s+aguas\b/ },
  { classe: "jargão de robô", padrao: /\bcompromisso\s+com\s+a\s+excelencia\b|\bsinonimo\s+de\s+(?:qualidade|sucesso|confianca)\b/ },
  { classe: "jargão de robô", padrao: /\bexperiencia\s+unica\s+e\s+inesquecivel\b|\bexcelencia\s+em\s+atendimento\b/ },
  // "a um clique de distância" — a promessa de facilidade que não afirma nada.
  // Foi a forma exata de uma das peças reprovadas em 07/08 ("seu próximo
  // trabalho está a um clique").
  { classe: "jargão de robô", padrao: /\ba\s+(?:apenas\s+|so\s+|somente\s+)?um\s+clique\b/ },
  // "alavancar" nu vive em finanças ("alavancagem do balanço"). O jargão é
  // alavancar o que é DO LEITOR.
  { classe: "jargão de robô", padrao: /\b(?:alavanc|potencializ|maximiz)\w+\s+(?:o|a|os|as|seu|sua|seus|suas)\s+(?:negocio|negocios|resultado|resultados|venda|vendas|marca|empresa|faturamento|lucro)\b/ },

  // ── PROMESSA VAGA ─────────────────────────────────────────────────────────
  //
  // O ganho prometido ao leitor SEM número que o sustente. É a metade que o
  // piso de verdade não pega de propósito: `RE_PROMESSA`
  // (`piso-de-verdade.ts:198`) exige "%" ou o verbo "garantimos/prometemos"
  // colado a venda/lucro. "Aumenta suas chances drasticamente" não tem nenhum
  // dos dois — e foi ao cliente.
  //
  // O padrão exige DUAS coisas juntas: o verbo de ganho E o intensificador
  // vago. Só o verbo comeria "o objetivo é aumentar as vendas", que é uma frase
  // legítima de documento de estratégia e aparece em quase toda entrega de
  // planejamento. O que transforma objetivo em promessa é o advérbio que
  // promete tamanho sem dizer qual.
  {
    classe: "promessa vaga",
    padrao: new RegExp(
      String.raw`\b(?:aumenta|aumente|aumentar|multiplica|multiplique|multiplicar|dobra|dobre|dobrar|triplica|triplicar|turbina|turbine|impulsiona|impulsione|alavanca|dispara|decola)\w*\s+(?:\S+\s+){0,3}?(?:venda|vendas|faturamento|resultado|resultados|lucro|lucros|cliente|clientes|chance|chances|oportunidade|oportunidades|receita|conversao|conversoes|seguidor|seguidores|alcance)\b[^.!?\n]{0,40}?\b(?:drasticamente|significativamente|exponencialmente|absurdamente|consideravelmente|rapidamente|imediatamente|de\s+verdade|como\s+nunca|muito\s+mais|na\s+hora|do\s+dia\s+para\s+a\s+noite)\b`,
    ),
  },
  {
    classe: "promessa vaga",
    padrao: new RegExp(
      String.raw`\b(?:drasticamente|significativamente|exponencialmente|absurdamente|consideravelmente)\s+(?:mais|maior|melhor)\s+(?:venda|vendas|faturamento|resultado|resultados|lucro|cliente|clientes|chance|chances|receita|conversao|conversoes)\b`,
    ),
  },
  // A promessa de virada de estado, sem número e sem prazo. "Saia do zero e
  // fature todo mês" é a família inteira num molde só.
  { classe: "promessa vaga", padrao: /\b(?:sai[ar]?|saindo)\s+d[oe]\s+zero\s+(?:e|para|pra)\b|\bdo\s+zero\s+a[oa]?\s+(?:sucesso|topo|primeiro\s+milhao)\b/ },
  { classe: "promessa vaga", padrao: /\b(?:transforme|transformamos|mudamos|mude)\s+(?:o\s+|a\s+|seu\s+|sua\s+)?(?:seu|sua)?\s*(?:vida|negocio|futuro|carreira)\b/ },

  // ── PROVA SOCIAL SEM PROVA ────────────────────────────────────────────────
  //
  // Guardrail da casa: nunca inventar depoimento nem prova social. O que entra
  // aqui é a AFIRMAÇÃO sobre clientes satisfeitos feita na voz da marca.
  //
  // O que NÃO entra, e a omissão é decisão: as palavras "depoimento" e "prova
  // social" nuas. Uma pauta legítima PLANEJA colher depoimento real do cliente
  // ("Semana 3: prova social — pedir depoimento ao cliente"), e barrar isso
  // reprovaria o planejamento correto junto com a invenção. A diferença entre
  // planejar colher e fingir ter é o modo do verbo, e é o resíduo declarado no
  // fim deste bloco.
  { classe: "prova social sem prova", padrao: /\bclientes\s+satisfeit[oa]s\b|\balunos\s+satisfeit[oa]s\b/ },
  { classe: "prova social sem prova", padrao: /\bquem\s+(?:ja\s+)?(?:usou|comprou|experimentou|testou|provou|contratou)\s+(?:\S+\s+){0,2}?(?:aprova|aprovou|recomenda|recomendou|nao\s+troca|nao\s+larga|volta\s+sempre)\b/ },
  { classe: "prova social sem prova", padrao: /\baprovad[oa]\s+por\s+(?:mais\s+de|milhares|centenas|dezenas|todos|nossos)\b/ },
  { classe: "prova social sem prova", padrao: /\b(?:milhares|centenas|dezenas|milhoes)\s+de\s+(?:pessoas|clientes|alunos|familias|empresas)\s+(?:ja\s+)?(?:confiam|confiaram|escolheram|aprovam|recomendam|usam)\b/ },
  { classe: "prova social sem prova", padrao: /\bveja\s+o\s+que\s+(?:nossos\s+|os\s+)?(?:clientes|alunos|pacientes)\s+(?:dizem|falam|acham)\b/ },

  // ── MULTIDÃO INVENTADA ────────────────────────────────────────────────────
  //
  // A quantidade que ninguém contou. `piso-de-verdade.ts` confere `R$` e `%` —
  // "centenas de vagas esperando" não é nenhum dos dois, e foi exatamente a
  // frase que chegou ao calendário do CityJobs numa plataforma de vagas.
  //
  // Ancorado em substantivo que um NEGÓCIO alega ter. Sem a âncora, o padrão
  // comeria "milhares de anos de tradição" e "centenas de espécies", que são
  // afirmações sobre o mundo, não sobre a carteira do cliente.
  {
    classe: "multidão inventada",
    padrao: /\b(?:centenas|milhares|milhoes|dezenas)\s+de\s+(?:\S+\s+){0,1}?(?:cliente|clientes|aluno|alunos|pessoa|pessoas|empresa|empresas|vaga|vagas|pedido|pedidos|seguidor|seguidores|familia|familias|profissional|profissionais|oportunidade|oportunidades|avaliacao|avaliacoes|atendimento|atendimentos)\b/,
  },
  {
    classe: "multidão inventada",
    padrao: /\bmais\s+de\s+[\d.]+\s*(?:mil\s+)?(?:cliente|clientes|aluno|alunos|pessoa|pessoas|empresa|empresas|vaga|vagas|pedido|pedidos|seguidor|seguidores|familia|familias|avaliacao|avaliacoes|atendimento|atendimentos)\b/,
  },
  // O número redondo SEM "mais de" — "Já são 12.500 clientes atendidos".
  //
  // Exige a forma de VANGLÓRIA (separador de milhar ou a palavra "mil") e não
  // um dígito qualquer, e a diferença é o falso positivo: "atendemos 2 pessoas
  // por vez" e "3 vagas abertas hoje" são informação operacional legítima, e um
  // padrão que as comesse reprovaria a peça correta o tempo todo. Ninguém
  // escreve "12.500 clientes" com modéstia.
  {
    classe: "multidão inventada",
    padrao: /\b(?:\d{1,3}(?:\.\d{3})+|\d+\s*mil)\s+(?:cliente|clientes|aluno|alunos|pessoa|pessoas|empresa|empresas|vaga|vagas|pedido|pedidos|seguidor|seguidores|familia|familias|avaliacao|avaliacoes|atendimento|atendimentos)\b/,
  },
];

/**
 * Tudo que não pode virar pixel: fato E alegação.
 *
 * A arte é o lugar mais restrito da casa — o que é proibido na legenda é
 * proibido aqui por construção, não por alguém lembrar de copiar a regra.
 */
export const CLASSES_PROIBIDAS_NA_ARTE: ClasseDeTexto[] = [
  ...CLASSES_DE_FATO,
  ...CLASSES_DE_ALEGACAO,
];

/**
 * A primeira classe da lista que pega este texto, com o TRECHO que a acionou.
 *
 * O trecho é o que separa parecer de ruído: "a peça tem jargão" manda o agente
 * reescrever no escuro; "a peça tem jargão em 'solução inovadora'" ele conserta
 * numa passada. É o guardrail 6 da companhia — o alerta carrega a evidência.
 *
 * O trecho devolvido sai da forma DOBRADA (minúscula, sem acento), porque é
 * sobre ela que os padrões correm. Dizer "encontrado: 'solucao inovadora'"
 * quando o original tinha "Solução Inovadora" é fiel ao que a régua viu, e
 * quem lê acha na peça do mesmo jeito.
 */
export function acharClasse(
  texto: string,
  lista: ClasseDeTexto[] = CLASSES_PROIBIDAS_NA_ARTE,
): { classe: string; trecho: string } | null {
  const d = dobrar(texto);
  if (!d.trim()) return null;
  const formas = [d, desespacar(d)];
  for (const { classe, padrao } of lista) {
    for (const forma of formas) {
      // Regex nova a cada teste: os padrões desta casa nascem sem `g`, mas um
      // padrão futuro com `g` guardaria `lastIndex` entre as duas formas e
      // alternaria entre pegar e não pegar. Portão que oscila é pior que
      // portão nenhum — a mesma lição de `temCaractereInvisivel`.
      const m = new RegExp(padrao.source, padrao.flags.replace("g", "")).exec(forma);
      if (m) return { classe, trecho: m[0].trim().slice(0, 120) };
    }
  }
  return null;
}

/** Qual classe pegou este texto — ou `null`. Dobra UMA vez e varre. */
export function classeProibida(texto: string): string | null {
  return acharClasse(texto)?.classe ?? null;
}

export type MotivoDaTrava =
  | "sem_lastro_no_conteudo_auditado"
  /**
   * O rótulo de benefício não é trecho literal da FICHA DE MARCA do cliente.
   *
   * Motivo próprio, e não `sem_lastro_no_conteudo_auditado`, porque a fonte é
   * outra: o chip de benefício não sai da legenda daquele post — ele afirma o
   * que a marca É, e isso o cliente declarou uma vez, na ficha. Confundir as
   * duas fontes numa mensagem só mandaria quem conserta procurar no lugar
   * errado. Ver `travaDeRotuloDeBeneficio`.
   */
  | "sem_lastro_na_ficha_de_marca"
  /** A chamada não é uma chamada: o verbo não é da lista da casa, ou o que vem
   *  depois dele não é o nome da marca. Ver `travaDeChamadaNaArte`. */
  | "chamada_fora_de_forma"
  | "classe_de_fato_proibida"
  | "rotulo_fora_de_forma"
  | "vazio";

export type VereditoDaTrava =
  | { ok: true; texto: string }
  | { ok: false; motivo: MotivoDaTrava; detalhe: string };

const DETALHE_DE_CLASSE = (classe: string) =>
  `${classe} — este tipo de afirmação fica na legenda, onde o piso de verdade a confere e onde dá para corrigir sem apagar o post`;

/**
 * O porteiro do pixel. Nunca lança; devolve veredito legível.
 *
 * `fonte` é o conteúdo JÁ AUDITADO (legenda do post ou cena do carrossel).
 * O `texto` devolvido é o HIGIENIZADO — é ele que deve virar pixel.
 */
export function travaDeTextoNaArte(texto: string, fonte: string): VereditoDaTrava {
  const t = higienizar(texto).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

  const classe = classeProibida(t);
  if (classe) return { ok: false, motivo: "classe_de_fato_proibida", detalhe: DETALHE_DE_CLASSE(classe) };

  if (!temLastroLiteral(t, fonte)) {
    return {
      ok: false,
      motivo: "sem_lastro_no_conteudo_auditado",
      detalhe: "o texto da arte não é trecho literal do conteúdo que passou pela esteira",
    };
  }

  return { ok: true, texto: t };
}

/**
 * A trava dos RÓTULOS: selo (pilar) e assinatura (nome do cliente).
 *
 * ── POR QUE ELA EXISTE, E COM ESTE NOME ─────────────────────────────────────
 *
 * Até a 7ª auditoria, `peca.ts` chamava `travaDeTextoNaArte(selo, selo)` — fonte
 * igual ao alvo, ou seja, `temLastroLiteral` sempre verdadeiro por construção.
 * Era um `if (true)` disfarçado de conferência, e pior: o selo é `post.pillar`,
 * TEXTO LIVRE DE LLM (`publicacao.ts:398`). A auditora pintou um pilar de 90
 * caracteres em caixa alta no topo da peça.
 *
 * A decisão foi não fingir lastro que não existe. Rótulo não tem fonte auditada
 * — o que ele tem é FORMA: rótulo é rótulo, não frase. Então a trava exige
 * (a) tamanho e contagem de palavras de rótulo, (b) alfabeto de rótulo, e
 * (c) a mesma metade de classe de fato que todo o resto. Um pilar que virou
 * parágrafo não é mais rótulo, e não entra.
 */
export interface FormaDeRotulo {
  maxCaracteres: number;
  maxPalavras: number;
  /** Nome de cliente pode ter dígito ("Padaria 2 Irmãos"); pilar não. */
  permiteDigito: boolean;
}

export const FORMA_DO_SELO: FormaDeRotulo = { maxCaracteres: 28, maxPalavras: 3, permiteDigito: false };
export const FORMA_DA_ASSINATURA: FormaDeRotulo = { maxCaracteres: 40, maxPalavras: 6, permiteDigito: true };

/**
 * A FORMA, conferida — o pedaço que `travaDeRotuloNaArte`,
 * `travaDeRotuloDeBeneficio` e `travaDeChamadaNaArte` compartilham.
 *
 * Extraído em 15/08/2026, quando o chip de benefício e a faixa de chamada
 * ganharam régua própria. Uma segunda cópia de "isto ainda é um rótulo?"
 * começaria idêntica e divergiria no primeiro ajuste — e é assim que duas
 * travas passam a discordar sobre a mesma peça.
 *
 * Devolve `null` quando a forma está boa.
 */
function conferirForma(t: string, forma: FormaDeRotulo): VereditoDaTrava | null {
  if (t.length > forma.maxCaracteres) {
    return {
      ok: false,
      motivo: "rotulo_fora_de_forma",
      detalhe: `rótulo com ${t.length} caracteres (máximo ${forma.maxCaracteres}) — isso é uma frase, não um rótulo, e frase precisa de lastro auditado para virar pixel`,
    };
  }
  const palavras = t.split(/\s+/).length;
  if (palavras > forma.maxPalavras) {
    return {
      ok: false,
      motivo: "rotulo_fora_de_forma",
      detalhe: `rótulo com ${palavras} palavras (máximo ${forma.maxPalavras}) — isso é uma frase, não um rótulo`,
    };
  }
  // SCRIPT LATINO, não `\p{L}`. `\p{L}` aceita qualquer alfabeto do mundo, e o
  // homóglifo que `higienizar` não conhece (armênio, cherokee) entraria no selo
  // como letra legítima. Rótulo desta casa é escrito em português.
  const alfabeto = forma.permiteDigito
    ? /^[\p{Script=Latin}\p{M}\p{Nd}\s&'.\-]+$/u
    : /^[\p{Script=Latin}\p{M}\s&'.\-]+$/u;
  if (!alfabeto.test(t)) {
    return {
      ok: false,
      motivo: "rotulo_fora_de_forma",
      detalhe: "rótulo com caractere que não é de rótulo (número, símbolo, pontuação de frase ou letra de outro alfabeto)",
    };
  }
  return null;
}

export function travaDeRotuloNaArte(texto: string, forma: FormaDeRotulo): VereditoDaTrava {
  const t = higienizar(texto).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

  const forada = conferirForma(t, forma);
  if (forada) return forada;

  const classe = classeProibida(t);
  if (classe) return { ok: false, motivo: "classe_de_fato_proibida", detalhe: DETALHE_DE_CLASSE(classe) };

  return { ok: true, texto: t };
}

// ═══════════════════════════════════════════════════════════════════════════
// O RÓTULO DE BENEFÍCIO — a forma que a fábrica não tinha (15/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── O PROBLEMA, MEDIDO ──────────────────────────────────────────────────────
//
// As peças que o CEO produziu à mão para o CityJobs têm TRÊS CHIPS com ícone
// ("Vagas conferidas", "Perto de casa", "Alto Tietê") e uma FAIXA DE CHAMADA
// ("SIGA O CITY JOBS"). Medido contra legenda auditada real, `travaDeTextoNaArte`
// reprovava **6 de 8 chips e 3 de 4 chamadas** desse estilo — e não por defeito
// da trava: por natureza. Ela exige TRECHO LITERAL DA LEGENDA, e chip não é
// trecho de legenda. Chip é RÓTULO: ele afirma o que a marca É, não o que
// aquele post diz.
//
// ── A SAÍDA É A MESMA QUE A CASA JÁ USOU UMA VEZ ────────────────────────────
//
// Quando o SELO (o pilar) teve o mesmo problema, a resposta não foi afrouxar a
// trava: foi dar ao selo uma FORMA PRÓPRIA (`travaDeRotuloNaArte`,
// `FORMA_DO_SELO`). Aqui é a mesma jogada com a peça que faltava: forma própria
// **mais fonte de lastro própria**. O chip precisa ter lastro — só que na FICHA
// DE MARCA do cliente (`BrandBrain.purposeAndPromise`, tagline, léxico
// obrigatório), que é onde ele declarou o que a marca entrega.
//
// ⚠️ **A ORDEM É OBRIGATÓRIA e está escrita aqui de propósito:** se a fábrica
// ganhar chip e faixa SEM esta trava, o portão passa a barrar exatamente a peça
// que se quer produzir — e é assim que alguém desliga o portão. As duas metades
// entram juntas ou nenhuma entra.
//
// ── O QUE **NÃO** FOI AFROUXADO, e é a metade que importa ───────────────────
//
// As classes proibidas continuam TODAS valendo. Medido, com o texto real:
//
//   • "Sem taxa"        → classe de FATO ("promessa comercial"). Continua fora
//     do pixel. É promessa comercial: se ela mudar, corrigir significa APAGAR o
//     post publicado. Fica na legenda, onde o piso de verdade a confere.
//   • "100% gratuito"   → "percentual" + "superlativo não sustentável".
//     Continua fora.
//   • "Vagas conferidas", "Perto de casa", "Alto Tietê", "Cadastro rápido" →
//     nenhuma classe pega. Elas eram barradas SÓ por falta de lastro na
//     legenda — e é exatamente essa a fonte errada.
//
// Ou seja: o que destrava o chip é a FONTE DO LASTRO, nunca a lista de
// proibições. Nada saiu dela.

/** Chip de benefício: cabe numa pílula, ao lado de outras duas. */
export const FORMA_DO_BENEFICIO: FormaDeRotulo = { maxCaracteres: 24, maxPalavras: 3, permiteDigito: false };

/**
 * O rótulo de benefício — chip.
 *
 * `fichaDaMarca` é o que o CLIENTE declarou sobre a própria marca, montado pelo
 * servidor (`fichaParaRotulo`), nunca por quem chama. Ficha vazia REPROVA: sem
 * ela, nada distingue "Vagas conferidas" de um adjetivo que a agência inventou
 * — e inventar benefício em nome do cliente é o dano que esta trava existe para
 * impedir.
 */
export function travaDeRotuloDeBeneficio(texto: string, fichaDaMarca: string): VereditoDaTrava {
  const t = higienizar(texto).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

  const forada = conferirForma(t, FORMA_DO_BENEFICIO);
  if (forada) return forada;

  // As classes vêm ANTES do lastro de propósito: uma ficha de marca que
  // contivesse "100% gratuito" não pode servir de licença para pintá-lo.
  // O que o cliente declarou é a fonte do lastro, não uma exceção às regras.
  const classe = classeProibida(t);
  if (classe) return { ok: false, motivo: "classe_de_fato_proibida", detalhe: DETALHE_DE_CLASSE(classe) };

  if (!temLastroLiteral(t, fichaDaMarca)) {
    return {
      ok: false,
      motivo: "sem_lastro_na_ficha_de_marca",
      detalhe:
        `"${t}" não é trecho literal da ficha de marca deste cliente. Chip de benefício afirma o que a MARCA entrega, ` +
        "e quem declara isso é o cliente (promessa, tagline e léxico obrigatório do BrandBrain) — não a agência, " +
        "e não a legenda deste post.",
    };
  }

  return { ok: true, texto: t };
}

// ═══════════════════════════════════════════════════════════════════════════
// A FAIXA DE CHAMADA — texto DERIVADO, não texto escrito
// ═══════════════════════════════════════════════════════════════════════════
//
// A faixa de baixo ("SIGA O CITY JOBS") não pede lastro em lugar nenhum, porque
// ela não AFIRMA nada sobre o negócio: é um pedido de ação. O risco dela é
// outro — é virar espaço livre onde alguém escreve promessa em caixa alta no
// rodapé de 60 peças por mês.
//
// A resposta é não deixá-la ser texto livre. A chamada tem de ser
// **verbo da casa + nome da marca**, e o verbo sai de uma lista fechada de
// verbos que não prometem coisa nenhuma. Nada aqui é autoria: é montagem.

/** Os verbos que a casa aceita numa faixa de chamada. Nenhum deles promete
 *  resultado — todos pedem uma ação que a pessoa executa no aplicativo. */
export const VERBOS_DE_CHAMADA = [
  "siga", "acompanhe", "salve", "compartilhe", "marque", "envie", "veja",
] as const;

/** A faixa cabe numa linha do pé da peça, em caixa alta. */
export const FORMA_DA_CHAMADA: FormaDeRotulo = { maxCaracteres: 32, maxPalavras: 5, permiteDigito: false };

/** Artigos que separam o verbo do nome. Removidos antes de conferir o lastro —
 *  "SIGA O CITY JOBS" e "SIGA CITY JOBS" são a mesma chamada. */
const ARTIGOS = new Set(["o", "a", "os", "as"]);

/**
 * A chamada é uma chamada?
 *
 * `nomeDaMarca` é a assinatura do cliente, lida do banco. O que vem depois do
 * verbo tem de ser ele — comparado sem espaços, porque "City Jobs" e "CityJobs"
 * são a mesma marca escrita de dois jeitos, e nenhum dos dois é uma afirmação.
 */
export function travaDeChamadaNaArte(texto: string, nomeDaMarca: string): VereditoDaTrava {
  const t = higienizar(texto).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

  const forada = conferirForma(t, FORMA_DA_CHAMADA);
  if (forada) return forada;

  const classe = classeProibida(t);
  if (classe) return { ok: false, motivo: "classe_de_fato_proibida", detalhe: DETALHE_DE_CLASSE(classe) };

  const palavras = normalizar(t).split(" ").filter(Boolean);
  const verbo = palavras[0] ?? "";
  if (!(VERBOS_DE_CHAMADA as readonly string[]).includes(verbo)) {
    return {
      ok: false,
      motivo: "chamada_fora_de_forma",
      detalhe:
        `a faixa começa com "${verbo || "(nada)"}", que não é um verbo de chamada da casa. ` +
        `Aceitos: ${VERBOS_DE_CHAMADA.join(", ")}. A faixa do pé não é espaço livre — é pedido de ação, e ` +
        "espaço livre em 60 peças por mês vira promessa em caixa alta no rodapé.",
    };
  }

  const resto = palavras.slice(1).filter((p) => !ARTIGOS.has(p) && p !== "no" && p !== "na");
  // Sem espaço nenhum dos dois lados: "City Jobs" e "CityJobs" são a mesma
  // marca escrita de dois jeitos, e nenhum dos dois afirma coisa alguma.
  // `desespacar` NÃO serve aqui — ele só colapsa corridas de letra solta
  // ("G R A T I S"), e "city jobs" não é isso.
  const semEspaco = (x: string) => x.replace(/\s+/g, "");
  const marca = semEspaco(normalizar(nomeDaMarca));
  if (!marca) {
    return {
      ok: false,
      motivo: "chamada_fora_de_forma",
      detalhe: "este cliente não tem nome de marca gravado — sem ele, não há como conferir o que a faixa manda seguir.",
    };
  }
  if (semEspaco(resto.join(" ")) !== marca) {
    return {
      ok: false,
      motivo: "chamada_fora_de_forma",
      detalhe:
        `depois do verbo a faixa diz "${resto.join(" ") || "(nada)"}", e o esperado é o nome da marca ("${nomeDaMarca.trim()}"). ` +
        "A faixa é montada, não escrita: verbo da casa + nome do cliente, e nada mais.",
    };
  }

  return { ok: true, texto: t };
}

/** A faixa padrão desta marca — montada, e por isso sempre aprovada pela própria
 *  trava. Existe para que ninguém precise escrever a chamada à mão. */
export function chamadaDaMarca(nomeDaMarca: string): string {
  const n = higienizar(nomeDaMarca).replace(/\s+/g, " ").trim();
  return n ? `Siga o ${n}` : "";
}

/**
 * Deriva o título a partir da fonte auditada.
 *
 * Devolve sempre um PREFIXO da fonte, cortado em fronteira de palavra — ou
 * seja, o lastro literal é propriedade de construção, não sorte. Para o corte,
 * o que vier antes de quebra de linha, fim de frase, hashtag ou emenda ("—",
 * "|") já é o começo natural da ideia; foi assim que as telas da Foocci foram
 * escritas à mão.
 *
 * A QUEBRA DE LINHA É O PRIMEIRO CORTE, e tem de ser: até a 7ª auditoria o
 * `\s+ → " "` acontecia ANTES do `search`, o ramo `\n` era inalcançável e uma
 * legenda de três linhas virava um título de 68 caracteres emendado.
 *
 * Devolve "" quando não sobra frase utilizável. Vazio é vazio: a peça sai sem
 * texto em vez de sair com um pedaço truncado sem sentido.
 */
export function tituloDaFonte(fonte: string, maxCaracteres = 68): string {
  const limpo = higienizar(fonte);
  const primeiraLinha = limpo.split(/[\r\n]/, 1)[0] ?? "";
  const bruta = primeiraLinha.replace(/\s+/g, " ").trim();
  if (!bruta) return "";

  // Segundo corte: onde a primeira ideia termina.
  const parada = bruta.search(/[.!?]|(\s[—|•]\s)|\s#/u);
  let frase = (parada > 0 ? bruta.slice(0, parada) : bruta).trim();
  // Emoji e símbolo de enfeite saem — mas só das PONTAS, para o miolo continuar
  // sendo um trecho contíguo do original.
  frase = frase.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
  if (!frase) return "";
  // Uma palavra só não é chamada — é rótulo. Legenda que só tem hashtag
  // ("#padaria #paoquentinho") cairia aqui como "padaria", e a peça sairia com
  // uma palavra solta gigante no meio. Vazio é vazio: sem frase, sem texto.
  if (frase.split(/\s+/).length < 2) return "";

  if (frase.length <= maxCaracteres) return frase;

  // Corte duro em fronteira de palavra. Sem reticências: reticências não estão
  // na fonte, logo quebrariam o lastro literal.
  const cortada = frase.slice(0, maxCaracteres);
  const ultimo = cortada.lastIndexOf(" ");
  const final = (ultimo > maxCaracteres * 0.5 ? cortada.slice(0, ultimo) : cortada).trim();
  return final.replace(/[^\p{L}\p{N}]+$/u, "");
}
