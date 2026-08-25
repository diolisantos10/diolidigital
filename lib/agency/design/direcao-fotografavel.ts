// A DIREÇÃO DE ARTE DESCREVE UMA FOTO, OU NÃO DESCREVE NADA.
//
// ── O QUE ESTE ARQUIVO IMPEDE, E QUANTO ISSO CUSTA ──────────────────────────
//
// 15/08/2026, CityJobs: 6 tentativas de imagem, 2 fotos, 4 reprovadas pelo
// portão do pixel com "paleta de ilustração, não fotografia" (101, 178, 244 e
// 432 cores distintas contra um piso de 600). A US$ 0,167 a geração, foram
// US$ 0,668 pagos para receber quatro reprovações.
//
// O portão do pixel (`portao-do-fundo.ts`) é a trava CERTA e continua onde
// está — mas ele só pode falar DEPOIS de a imagem existir, e imagem que existe
// já foi paga. Este portão fala ANTES, e é de graça: ele não olha pixel
// nenhum, olha a FRASE que vai virar o pedido.
//
// ── A RÉGUA: SUJEITO, LUGAR E LUZ ───────────────────────────────────────────
//
// Uma direção fotografável nomeia três coisas, porque é o que um fotógrafo
// precisa para ir até lá: QUEM ou o quê aparece, ONDE, e sob QUE LUZ.
//
//   passa  → "galpão em Suzano no fim da tarde, operador conferindo caixas"
//   barra  → "a confiança de quem encontra uma vaga validada"
//
// A segunda não é uma direção ruim: é um CONCEITO. Conceito não tem lugar nem
// hora, e o gerador de imagem resolve conceito do único jeito que dá — com
// símbolo, ícone e cor chapada. O desenho vetorial não é desobediência do
// modelo; é a resposta coerente ao que foi pedido.
//
// ── POR QUE ELE É FROUXO DE PROPÓSITO ───────────────────────────────────────
//
// "Detector que aperta demais vira carimbo e para de produzir peça legítima."
// Três defesas contra isso, todas deliberadas:
//
//   1. **Basta UM sinal de cada família.** Não conta quantos, não pede ordem,
//      não pede sintaxe. Uma palavra de lugar, uma de luz e uma de sujeito
//      bastam.
//   2. **O gerúndio conta como sujeito.** "conferindo", "descendo", "servindo"
//      — alguém está fazendo aquilo. Em português essa terminação é sinal
//      barato e de precisão alta.
//   3. **Nome próprio depois de "em" conta como lugar.** "em Suzano", "em Mogi
//      das Cruzes". A casa atende o Alto Tietê; a lista fechada de bairros
//      nunca seria completa, e ausência de bairro na lista não é ausência de
//      lugar (guardrail 1 do manual de bordo).
//
// E a falha é BARATA E REVERSÍVEL: nenhuma imagem é gerada, nenhuma tentativa
// é gasta, nenhum dinheiro sai. A peça volta ao especialista com o motivo dito
// — qual das três faltou. Este portão **nunca reprova imagem já gerada**: essa
// é a jurisdição do portão do pixel, e duas réguas sobre a mesma coisa é como
// se constrói contradição.

/** As três famílias que uma direção fotografável nomeia. */
export type SinalDeCena = "sujeito" | "lugar" | "luz";

export interface VereditoDaDirecao {
  fotografavel: boolean;
  /** O que a direção NOMEOU. Sobe junto para o veredito ser auditável. */
  achou: SinalDeCena[];
  /** O que faltou. Vazio quando passou. */
  faltou: SinalDeCena[];
  /** Uma linha para o `lastError` da peça — quem lê é quem vai reescrever. */
  motivo: string;
}

/**
 * LUZ ou HORA DO DIA. Vocabulário fechado e pequeno, de precisão alta: nenhuma
 * destas palavras aparece por acaso num texto que não fala de fotografia.
 */
const LUZ =
  /\bluz\b|\bilumina|\bsol\b|\bsolar\b|ensolarad|\bsombra|contraluz|penumbra|\bneon\b|\bl[âa]mpada|fluorescente|\bjanela|amanhec|manh[ãa]|meio-dia|\bmeio dia\b|\btarde\b|entardec|p[ôo]r do sol|golden hour|\bnoite\b|anoitec|madrugada|nublad|\bchuva|c[ée]u aberto|\bcontraste\b|\bbacklight\b|\bhora dourada\b/i;

/**
 * LUGAR. Vocabulário largo — é a família com mais variedade no mundo real —
 * mais duas regras de forma que pegam o que a lista não previu.
 */
const LUGAR =
  /\bgalp[ãa]o|armaz[ée]m|dep[óo]sito|almoxarifado|\bdoca\b|cozinha|\bbalc[ãa]o|\bloja\b|mercado|\bfeira\b|padaria|a[çc]ougue|restaurante|\bsal[ãa]o\b|\bobra\b|canteiro|oficina|f[áa]brica|linha de produ[çc][ãa]o|\bp[áa]tio\b|estacionamento|\brua\b|avenida|cal[çc]ada|esquina|\bpra[çc]a\b|esta[çc][ãa]o|plataforma|terminal|ponto de [ôo]nibus|escrit[óo]rio|recep[çc][ãa]o|\bsala\b|consult[óo]rio|cl[íi]nica|escola|\bquadra\b|\bcampo\b|\bs[íi]tio\b|fazenda|caminh[ãa]o|\bcabine\b|\bvan\b|bancada|\bmesa\b|vitrine|portaria|corredor|\bcasa\b|quintal|varanda|\bbairro\b|\bcentro\b|\bcidade\b|\bcom[ée]rcio\b|\bfachada\b|\bgaragem\b|\bhorta\b|\bestufa\b|\bcanteiro\b/i;

/** "em Suzano", "em Mogi das Cruzes", "no Braz Cubas": nome próprio depois de
 *  preposição de lugar. A casa atende o Alto Tietê inteiro e nenhuma lista
 *  fechada de bairro daria conta. */
const LUGAR_POR_NOME_PROPRIO = /(?:^|[^\p{L}])(?:[Ee]m|[Nn]o|[Nn]a|[Nn]os|[Nn]as) [A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]\p{L}{2,}/u;

/**
 * SUJEITO: quem ou o quê está na cena. Duas portas — o substantivo de pessoa
 * ou de ofício, e o gerúndio (alguém fazendo alguma coisa).
 */
const SUJEITO =
  /\bpessoa|\bgente\b|\bhomem\b|\bmulher|\bcrian[çc]a|\bjovem\b|\bsenhor|\bequipe\b|\bdupla\b|\bm[ãa]os?\b|\brosto\b|operador|atendente|vendedor|cozinheir|padeir|motorista|entregador|gar[çc]om|funcion[áa]ri|trabalhador|\bcliente\b|mec[âa]nic|pedreir|costureir|\bt[ée]cnic|recepcionista|estoquista|auxiliar|ajudante|passageir|morador|profissional|\bcolaborador/i;

/** Gerúndio: "conferindo", "descendo", "servindo". Alguém está fazendo algo —
 *  e coisa nenhuma faz algo sozinha numa fotografia. */
const GERUNDIO = /\b\p{L}{3,}(?:a|e|i)ndo\b/u;

// ── A QUARTA FAMÍLIA: A TOMADA CONTROLADA (25/08/2026) ──────────────────────
//
// MEDIDO, e é o que obriga esta mudança: rodando a régua acima contra três
// famílias de direção,
//
//   • cena de ambiente com pessoa (o corpus de onde ela nasceu) ... 8 de 8 passam
//   • close-up de produto ....................................... 0 de 5 passam
//   • conceito abstrato (o que ela existe para barrar) .......... 0 de 3 passam
//
// A linha do meio é o defeito. Um story de produto — "o disco de freio que a
// sua oficina troca" — é uma direção CERTA e cara de fotografar, e ela reprovava
// mesmo quando nomeava a luz com todas as letras. A régua nasceu de um corpus só
// (CityJobs: vaga, pessoa, bairro do Alto Tietê) e nunca viu a família em que a
// câmera chega perto de uma COISA. Ausência de vocabulário não é ausência de
// foto (guardrail 1).
//
// ── E POR QUE ISTO NÃO É AFROUXAR ───────────────────────────────────────────
//
// A tomada controlada NÃO ganha desconto: ela ganha um caminho PRÓPRIO, e esse
// caminho custa MAIS palavras, não menos. Para atravessar por aqui a direção
// tem de declarar duas coisas que antes ela não precisava dizer:
//
//   1. o ENQUADRAMENTO FECHADO, com todas as letras ("close-up", "macro",
//      "detalhe de", "primeiro plano"); e
//   2. o que a câmera vê ATRÁS — o fundo, a superfície, o estúdio.
//
// Uma direção mais vaga do que as que reprovavam ontem continua reprovando hoje.
// "imagem bonita do produto, visual limpo e premium" não nomeia enquadramento
// nem fundo, e segue barrada.
//
// O que a família concede, e por quê:
//
//   • SUJEITO — "close-up DO disco de freio": o enquadramento fechado leva um
//     complemento, e esse complemento É o que está na foto. Regra de FORMA, como
//     a de nome próprio depois de "em" (linha 39): nenhuma lista fechada de
//     objetos do mundo daria conta, e a lista incompleta viraria a negação do
//     silêncio. Conceito não sobrevive a esta forma — ninguém escreve "close-up
//     da confiança de quem encontra uma vaga".
//   • LUGAR — numa tomada controlada o fundo É o lugar. É o que o fotógrafo
//     monta, e é a única coisa que a câmera vai enxergar além do objeto. Exigir
//     um galpão atrás de um macro de pastilha de freio é exigir uma foto que
//     ninguém pediu.
//   • LUZ — **NADA MUDA, e é aqui que a economia mora.** A tomada controlada não
//     recebe nenhuma folga de luz. Direção que não nomeia a luz continua
//     reprovando, porque é exatamente a direção sem luz que o gerador resolve
//     com cor chapada e ícone — e é o portão do pixel, DEPOIS de pago, que
//     descobriria. Das três famílias, luz é a que custa dinheiro quando falta.

/** ENQUADRAMENTO FECHADO declarado com todas as letras. Vocabulário pequeno e
 *  de precisão alta: são termos de câmera, não adjetivos de agência. */
const ENQUADRAMENTO_FECHADO =
  /close-?up|\bclose\b|\bmacro\b|primeir[oa]s? plano|plano[- ]detalhe|\bdetalhe\b|enquadramento fechado|\bc[âa]mera perto\b/i;

/** O QUE A CÂMERA VÊ ATRÁS. Numa tomada controlada, é o lugar. */
const FUNDO_OU_SUPERFICIE =
  /\bfundo\b|\bfundos\b|\bbackdrop\b|est[úu]dio|superf[íi]cie|\bbancada\b|\bmesa\b|\btampo\b|\bseamless\b|fundo infinito|\bsobre (?:um |uma |o |a )?(?:pano|tecido|madeira|concreto|m[áa]rmore|metal)/i;

/**
 * "close-up DO disco de freio", "macro DA pastilha", "detalhe DE um filtro".
 *
 * O enquadramento fechado leva complemento, e o complemento é o sujeito da foto.
 * Regra de FORMA e não de lista — mesma escolha da regra de nome próprio.
 */
const SUJEITO_DA_TOMADA_FECHADA =
  /(?:close-?up|\bclose\b|\bmacro\b|primeir[oa] plano|plano[- ]detalhe|\bdetalhe\b)\s+(?:de|do|da|dos|das|d[ao]s? um[a]?|de um[a]?)\s+(\p{L}{3,})/iu;

/**
 * A ABSTRAÇÃO DE AGÊNCIA COMO COMPLEMENTO — o buraco que a forma sozinha deixa.
 *
 * Achado por caso adversarial ao escrever a régua desta mudança: "close-up de
 * QUALIDADE, fundo de confiança, luz de excelência" atravessava. A forma estava
 * satisfeita — enquadramento, complemento, fundo e a palavra "luz" — e a foto
 * não existia. É exatamente o conceito de sempre, vestindo a roupa da família
 * nova.
 *
 * Lista FECHADA e curta, e ela só pode APERTAR: uma palavra que falte aqui não
 * abre porta nenhuma, apenas deixa a direção seguir para as outras conferências.
 * Nenhuma destas palavras é uma coisa que uma câmera consegue enquadrar.
 */
const ABSTRACAO_DE_AGENCIA =
  /^(?:qualidade|confian[çc]a|excel[êe]ncia|profissionalismo|sofistica[çc][ãa]o|modernidade|inova[çc][ãa]o|cuidado|seguran[çc]a|sucesso|credibilidade|tradi[çc][ãa]o|compromisso|experi[êe]ncia|satisfa[çc][ãa]o|eleg[âa]ncia|premium|exclusividade|bem|conforto|agilidade|efici[êe]ncia|dedica[çc][ãa]o|respeito|transpar[êe]ncia|honestidade|paix[ãa]o|energia|for[çc]a|estilo|conceito|sensa[çc][ãa]o|import[âa]ncia|valor|impacto)$/i;

/** O enquadramento fechado nomeia uma COISA que a câmera enquadra? A forma
 *  precisa estar lá E o complemento precisa ser algo do mundo físico. */
function nomeiaOQueEstaEnquadrado(t: string): boolean {
  const m = t.match(SUJEITO_DA_TOMADA_FECHADA);
  return !!m && !ABSTRACAO_DE_AGENCIA.test(m[1]!);
}

/** A direção declara uma TOMADA CONTROLADA? Exige as DUAS declarações: o
 *  enquadramento fechado e o que está atrás. Uma só não basta — "fundo
 *  desfocado" sozinho descreve qualquer fotografia do mundo. */
function ehTomadaControlada(t: string): boolean {
  return ENQUADRAMENTO_FECHADO.test(t) && FUNDO_OU_SUPERFICIE.test(t);
}

/**
 * A direção de arte nomeia uma cena fotografável?
 *
 * Nunca lança e nunca chama nada de fora: é uma leitura de string, e é o que a
 * torna barata o bastante para rodar antes de toda geração.
 */
export function conferirDirecaoFotografavel(direcao: string | null | undefined): VereditoDaDirecao {
  const t = (direcao ?? "").trim();
  const achou: SinalDeCena[] = [];

  // A tomada controlada é conferida UMA vez e reusada: as duas concessões que
  // ela faz (sujeito e lugar) têm de vir da MESMA leitura, ou a direção passaria
  // metade por uma família e metade por outra.
  const tomadaControlada = ehTomadaControlada(t);

  if (SUJEITO.test(t) || GERUNDIO.test(t) || (tomadaControlada && nomeiaOQueEstaEnquadrado(t))) {
    achou.push("sujeito");
  }
  if (LUGAR.test(t) || LUGAR_POR_NOME_PROPRIO.test(t) || tomadaControlada) achou.push("lugar");
  // LUZ não tem porta alternativa, de propósito: ver o bloco da tomada
  // controlada. Luz que falta é a que o portão do pixel só descobre depois de pago.
  if (LUZ.test(t)) achou.push("luz");

  const faltou = (["sujeito", "lugar", "luz"] as SinalDeCena[]).filter((s) => !achou.includes(s));
  if (faltou.length === 0) {
    return { fotografavel: true, achou, faltou: [], motivo: "" };
  }

  return {
    fotografavel: false,
    achou,
    faltou,
    motivo:
      `direção de arte não descreve uma foto: falta ${listar(faltou)}. ` +
      "Uma direção fotografável nomeia QUEM aparece, ONDE e sob QUE LUZ — " +
      'ex.: "galpão em Suzano no fim da tarde, operador conferindo caixas". ' +
      "Se a foto for um CLOSE-UP DE PRODUTO, diga o enquadramento e o fundo com todas as " +
      'letras — ex.: "macro do disco de freio desgastado, fundo desfocado cinza escuro, luz ' +
      'fria de fluorescente da oficina". A LUZ é obrigatória nos dois casos. ' +
      "Conceito sem lugar nem hora vira desenho vetorial, e o portão do pixel reprova. " +
      "A peça NÃO foi gerada e nada foi gasto: reescreva a direção.",
  };
}

/** "lugar e luz", "sujeito, lugar e luz". */
function listar(itens: SinalDeCena[]): string {
  if (itens.length === 1) return itens[0]!;
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
