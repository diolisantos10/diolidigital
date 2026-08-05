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
// ── O QUE ESTA TRAVA NÃO FECHA — DITO COM TODAS AS LETRAS ───────────────────
//
// Ela é DETERMINÍSTICA e trabalha sobre a FORMA do texto. Quatro famílias
// continuam passando, e estão fixadas em teste (`__tests__/design/molde.test.ts`,
// "o resíduo conhecido") para que a lacuna não seja silenciosa:
//
//   1. grafia errada de propósito ("gratiz");
//   2. quantia nua, sem verbo e sem unidade ("Pão por 5");
//   3. prazo perifrástico, sem marcador ("enquanto o forno estiver aceso");
//   4. canal de contato sem número ("chame no zap").
//
// Fechar qualquer uma exige julgamento de SENTIDO — LLM-judge, o mesmo que o
// BACKLOG já prevê para os gates subjetivos. Qualquer regex larga o bastante
// para pegá-las come legenda legítima de padaria, e trava que apaga a camada de
// texto de toda peça em silêncio protege tanto quanto trava nenhuma. A escolha
// aqui foi manter o falso positivo em ZERO sobre o conjunto legítimo medido, e
// declarar o resíduo em vez de fingir cobertura.

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
 * A forma em que qualquer texto entra nesta casa antes de ser julgado.
 *
 * NFKC primeiro, e de propósito: ele desfaz largura total (`Ｒ＄ １９`),
 * matemático estilizado (`𝟏𝟗`), sobrescrito e ligadura — todos formas de
 * escrever "R$ 19" que uma regex ASCII não vê. Depois somem os invisíveis e os
 * espaços exóticos viram espaço comum.
 */
export function higienizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(INVISIVEIS, "")
    .replace(CONTROLES, "")
    .replace(ESPACOS_EXOTICOS, " ");
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

export const CLASSES_PROIBIDAS_NA_ARTE: Array<{ classe: string; padrao: RegExp }> = [
  // ── DINHEIRO ──────────────────────────────────────────────────────────────
  { classe: "preço", padrao: /r\$|\bbrl\b|\breais\b/ },
  { classe: "preço", padrao: /\b\d+[.,]\d{2}\b/ },
  // Gíria de dinheiro só conta com quantidade na frente — "conto" e "prata"
  // sozinhos são substantivos comuns ("conto de fadas").
  { classe: "preço", padrao: new RegExp(`\\b(?:\\d+|${NUM})\\s*(?:pila|contos?|mangos?|pratas?|paus)\\b`) },
  { classe: "preço", padrao: /\b(?:a\s+partir\s+de|so\s+por|apenas\s+por|de\s+\d+\s+por)\b/ },
  // Quantia sem símbolo: "Sai por dezenove e noventa" afirma preço do mesmo
  // jeito que "R$ 19,90". Exige o verbo E o número — "fica por cima" e "feito
  // por um padeiro" continuam passando.
  { classe: "preço", padrao: new RegExp(`\\b(?:custa|custam|sai\\s+por|sao\\s+por|fica\\s+por|ficam\\s+por|paga|pagando|leva\\s+por)\\s+(?:\\d+|${NUM}\\b)`) },
  { classe: "preço", padrao: /\b(?:condicao\s+especial|condicoes\s+especiais|preco\s+especial|precinho|melhor\s+preco)\b/ },

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
  // O dia como promessa. "hoje" É prazo — a tese da casa diz isso com todas as
  // letras, e o código passa a dizer também.
  { classe: "prazo", padrao: /\b(?:hoje|amanha|hj)\b/ },
  { classe: "prazo", padrao: new RegExp(`\\bate\\s+(?:os?\\s+|as?\\s+|dia\\s+)?(?:${DIA}|\\d|${NUM}\\b)`) },
  { classe: "prazo", padrao: /\bultim[oa]s?\s+(?:dia|dias|hora|horas|chance|chances|unidade|unidades|vaga|vagas|peca|pecas)\b/ },
  { classe: "prazo", padrao: /\b(?:por\s+tempo\s+limitado|enquanto\s+durar|estoque\s+limitado|ultimas?\s+horas?|corre\s+que\s+acaba)\b/ },
  { classe: "prazo", padrao: new RegExp(`\\b(?:esta|essa|nesta|nessa|neste|nesse)\\s+(?:semana|${DIA})\\b`) },
  { classe: "prazo", padrao: /\bvalid[oa]\s+(?:ate|de|por)\b|\bvalidade\b/ },

  // ── PROMESSA COMERCIAL ────────────────────────────────────────────────────
  { classe: "promessa comercial", padrao: /\b(?:gratis|gratuit[oa]s?|cortesia|brinde|brindes|cupom|cupons|cashback|desconto|descontos|promocao|promocoes|oferta|ofertas|liquidacao|queima|sorteio|premio|premios)\b/ },
  { classe: "promessa comercial", padrao: /\bde\s+graca\b/ },
  { classe: "promessa comercial", padrao: /\bganh[ea]\b|\bleve\s+mais\b/ },
  { classe: "promessa comercial", padrao: new RegExp(`\\bleve\\s+(?:\\d+|${NUM})\\s+(?:e\\s+)?pague\\b`) },
  { classe: "promessa comercial", padrao: new RegExp(`\\b(?:2|dois|duas)\\s+por\\s+(?:1|um|uma)\\b`) },
  { classe: "promessa comercial", padrao: /\bna\s+compra\s+d[eoa]\b|\bcompre\s+\S+\s+(?:e\s+)?(?:ganhe|leve)\b/ },
  { classe: "promessa comercial", padrao: /\bfrete\s+gratis\b|\bentrega\s+gratis\b/ },
  { classe: "promessa comercial", padrao: /\bpor\s+(?:nossa|minha|conta\s+d[ao]\s+casa)\b|\bpor\s+conta\s+da\s+casa\b/ },

  // ── SUPERLATIVO NÃO SUSTENTÁVEL ───────────────────────────────────────────
  { classe: "superlativo não sustentável", padrao: /\b(?:melhor|melhores|maior|maiores|unic[ao]|garantid[ao]s?|imperdivel|incomparavel|insuperavel|imbativel|inigualavel|sem\s+igual|lider|lideres|campe[ao]|campeoes|campea|sensacional|incrivel|perfeit[ao]|exclusiv[ao]|premium|definitiv[ao]|revolucionari[ao])\b/ },
  { classe: "superlativo não sustentável", padrao: /\bn[o°º]?\s*1\b|\bnumero\s*(?:1|um)\b|\btop\s*(?:\d+|um)\b|\b100\s*%/ },
  // A forma que a língua usa para superlativo: artigo + "mais" + adjetivo.
  { classe: "superlativo não sustentável", padrao: /\b(?:o|a|os|as)\s+mais\s+[a-z]+/ },
  { classe: "superlativo não sustentável", padrao: /\bmais\s+[a-z]+\s+d[ao]\s+(?:cidade|regiao|bairro|estado|pais|brasil|mundo)\b/ },
  // O superlativo INDIRETO: a forma que não usa adjetivo nenhum e afirma a
  // mesma coisa. "Ninguém faz igual" é "o melhor" com outras palavras.
  { classe: "superlativo não sustentável", padrao: /\bninguem\s+(?:faz|tem|chega|consegue|iguala)\b|\bnao\s+existe\s+igual\b|\bsem\s+comparacao\b|\bnada\s+se\s+compara\b/ },
  { classe: "superlativo não sustentável", padrao: /\bnunca\s+(?:viu|comeu|provou|experimentou|sentiu)\b|\bvoce\s+nunca\b/ },
];

/** Qual classe pegou este texto — ou `null`. Dobra UMA vez e varre. */
export function classeProibida(texto: string): string | null {
  const d = dobrar(texto);
  if (!d.trim()) return null;
  const formas = new Set([d, desespacar(d)]);
  for (const { classe, padrao } of CLASSES_PROIBIDAS_NA_ARTE) {
    for (const forma of formas) if (padrao.test(forma)) return classe;
  }
  return null;
}

export type MotivoDaTrava =
  | "sem_lastro_no_conteudo_auditado"
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

export function travaDeRotuloNaArte(texto: string, forma: FormaDeRotulo): VereditoDaTrava {
  const t = higienizar(texto).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "vazio", detalhe: "nada a pintar" };

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
  const alfabeto = forma.permiteDigito
    ? /^[\p{L}\p{N}\s&'.\-]+$/u
    : /^[\p{L}\s&'.\-]+$/u;
  if (!alfabeto.test(t)) {
    return {
      ok: false,
      motivo: "rotulo_fora_de_forma",
      detalhe: "rótulo com caractere que não é de rótulo (número, símbolo ou pontuação de frase)",
    };
  }

  const classe = classeProibida(t);
  if (classe) return { ok: false, motivo: "classe_de_fato_proibida", detalhe: DETALHE_DE_CLASSE(classe) };

  return { ok: true, texto: t };
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
