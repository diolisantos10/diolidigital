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

/**
 * A direção de arte nomeia uma cena fotografável?
 *
 * Nunca lança e nunca chama nada de fora: é uma leitura de string, e é o que a
 * torna barata o bastante para rodar antes de toda geração.
 */
export function conferirDirecaoFotografavel(direcao: string | null | undefined): VereditoDaDirecao {
  const t = (direcao ?? "").trim();
  const achou: SinalDeCena[] = [];

  if (SUJEITO.test(t) || GERUNDIO.test(t)) achou.push("sujeito");
  if (LUGAR.test(t) || LUGAR_POR_NOME_PROPRIO.test(t)) achou.push("lugar");
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
      "Conceito sem lugar nem hora vira desenho vetorial, e o portão do pixel reprova. " +
      "A peça NÃO foi gerada e nada foi gasto: reescreva a direção.",
  };
}

/** "lugar e luz", "sujeito, lugar e luz". */
function listar(itens: SinalDeCena[]): string {
  if (itens.length === 1) return itens[0]!;
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
