// A LEITURA DO PEDIDO — o VERBO, não o assunto. E a QUANTIDADE, não o palpite.
//
// ── O defeito que produziu este arquivo ─────────────────────────────────────
// 06/08/2026, pego pelo CEO no portal do celular. O pedido
// `cmsg7anke00030ps260acx43s` dizia, com todas as letras:
//
//   "Precisamos criar videos meus falando das principais features do foocci
//    para reels e Youtube. PRECISO DO ROTEIRO COM AS FALAS para produzir os
//    videos (…) Alem disso preciso de videos explicando os produtos para os
//    clientes que serao atendidos pelo SDR no whatsapp."
//
// A triagem devolveu **"1 Reel — R$ 350"**. Três erros, e cada um custa dinheiro:
//
//   1. ele pediu o INSUMO (o texto para ELE gravar), não a PEÇA FINAL (o reel
//      editado). Mesmo assunto — vídeo —, entregáveis diferentes, preços
//      diferentes, trabalhos diferentes;
//   2. o texto cita vídeo no PLURAL três vezes e a triagem orçou UM. Quantidade
//      não contada virou 1 por omissão;
//   3. o roteiro já estava entregue (`docs/projetos/foocci/roteiros-video.md`).
//      A agência orçou trabalho concluído.
//
// ── Por que isto é CÓDIGO e não uma linha no prompt ─────────────────────────
// O erro aconteceu com o texto do cliente inteiro na frente do modelo. Pedir a
// ele "preste atenção no verbo" é sugestão; sugestão não é trava. Aqui a leitura
// é léxica, determinística, sem rede e sem IA: roda sempre, dá o mesmo resultado
// sempre, e é conferível teste a teste.
//
// ── O que esta leitura NÃO faz ──────────────────────────────────────────────
// Ela não classifica o pedido nem escolhe departamento — isso continua sendo do
// modelo. Ela é o segundo par de olhos: quando o que ela lê no texto do cliente
// contradiz o que o modelo escolheu, quem manda é o lado que PERGUNTA
// (`precisa_decisao`), nunca o lado que cobra.

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário
// ─────────────────────────────────────────────────────────────────────────────

/** Sem acento e em minúsculas: "vídeos" e "videos" são a mesma palavra para
 *  quem digita no celular, e a trava não pode depender de acentuação. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** O que o cliente recebe para PRODUZIR ele mesmo. Texto, plano, orientação. */
const INSUMOS = "(?:roteiros?|scripts?|copy|copies|legendas?|briefings?|textos?|falas?|planejamentos?|plano de (?:midia|conteudo|comunicacao)|estrutura do video)";

/** O que a agência entrega PRONTO, gravado, editado, publicável. */
const PECAS = "(?:reels?|videos?|filmes?|posts?|carross(?:el|eis)|stor(?:y|ies)|artes?|banners?|criativos?|logotipos?|logos?|campanhas?|anuncios?|pecas?|flyers?)";

/** Só as formas plurais — usadas para saber se ele falou de UMA ou de VÁRIAS. */
const PECAS_PLURAL = "(?:reels|videos|filmes|posts|carrosseis|stories|artes|banners|criativos|logotipos|logos|campanhas|anuncios|pecas|flyers|roteiros|scripts|legendas|textos)";

// Exportada (16/08/2026): `question-engine.ts` precisava ler número por
// extenso ("dois posts por dia") e a casa já tinha ESTA lista pronta — a
// mesma doença do dia (número inventado) seria repetida em código se aqui
// nascesse uma quarta lista da mesma coisa. Uma lista, duas pontas.
export const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const NUM = `(?:\\d{1,3}|${Object.keys(NUMERO_POR_EXTENSO).join("|")})`;

/** Os verbos com que um cliente brasileiro pede alguma coisa.
 *
 *  "gravar" ficou DE FORA de propósito: em quase todo pedido real ele aparece
 *  como "preciso do roteiro **para eu gravar**" — ou seja, quem produz é o
 *  cliente. Tratá-lo como pedido à agência transformava exatamente o caso do
 *  roteiro em "ambíguo", que é atrito onde o texto era claro. */
const VERBOS = "(?:preciso|precisamos|precisava|quero|queremos|queria|gostaria|gostariamos|manda|mandar|envia|enviar|fazer|faz|faca|facam|criar|cria|criem|produzir|produz|montar|monta|editar|escrever|escreve|desenvolver|preparar)";

/** O miolo entre o verbo e o substantivo: "preciso DO roteiro", "criar UNS
 *  VIDEOS NOVOS", "quero 6 REELS". Tudo opcional e repetível. */
const MIOLO = `(?:\\s+(?:de|do|da|dos|das|o|a|os|as|um|uma|uns|umas|so|apenas|mais|novo|novos|nova|novas|meu|meus|minha|minhas|nosso|nossos|nossa|nossas|alguns|algumas|outro|outros|${NUM}))*`;

const PEDIDO_DE_INSUMO = new RegExp(`\\b${VERBOS}${MIOLO}\\s+${INSUMOS}\\b`, "g");
const PEDIDO_DE_PECA = new RegExp(`\\b${VERBOS}${MIOLO}\\s+${PECAS}\\b`, "g");
const MENCAO_DE_INSUMO = new RegExp(`\\b${INSUMOS}\\b`, "g");
const MENCAO_DE_PECA = new RegExp(`\\b${PECAS}\\b`, "g");

/** "com roteiro", "incluindo legenda" — aí o insumo é ATRIBUTO da peça, não o
 *  entregável. É o que separa "quero um reel com roteiro e edição" (peça, sem
 *  atrito) de "preciso do roteiro" (insumo, para o cliente gravar). */
const INSUMO_COMO_ATRIBUTO = new RegExp(`\\b(?:com|incluindo|inclui|contendo|junto com)\\s+(?:a|o|as|os|um|uma)?\\s*${INSUMOS}\\b`, "g");

const CONTAGEM = new RegExp(`\\b(${NUM})\\s+(?:novos?|novas?|outros?|outras?|\\w{0,12}\\s)?(${PECAS})\\b`, "g");
const PLURAL = new RegExp(`\\b${PECAS_PLURAL}\\b`, "g");

// ─────────────────────────────────────────────────────────────────────────────
// O resultado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * - `insumo`   — ele quer o texto/plano para produzir ele mesmo;
 * - `peca`     — ele quer o material pronto;
 * - `ambiguo`  — o texto pede as duas coisas, ou não dá para separar. **É o
 *                caso que PERGUNTA**, nunca o que cobra;
 * - `indefinido` — o texto não cita nem insumo nem peça (ex.: "quero um
 *                orçamento de site"). Não bloqueia nada por si só.
 */
export type Entregavel = "insumo" | "peca" | "ambiguo" | "indefinido";

/** Por que a contagem deu no que deu — o motivo entra na mensagem ao cliente,
 *  porque "não consegui contar" sem dizer o quê é o mesmo que não avisar. */
export type MotivoDaContagem =
  | "contada"             // um número explícito, uma vez só
  | "plural_sem_numero"   // "videos", "reels" — várias, e ele não disse quantas
  | "varias_contagens"    // "6 reels e 4 videos" — soma é palpite, não conta
  | "sem_peca_citada";    // ele não citou peça nenhuma; nada a contar

export interface LeituraDoPedido {
  entregavel: Entregavel;
  /** Quantas peças ele pediu. `null` = **não consegui contar** — e nulo aqui
   *  NUNCA vira 1: quantidade inventada é erro de dinheiro. */
  quantidade: number | null;
  motivoDaContagem: MotivoDaContagem;
  /** Os trechos do texto DELE que sustentam a leitura. Nada de conclusão sem a
   *  citação: é o que permite a mensagem dizer "você escreveu X". */
  evidencias: string[];
}

function achar(texto: string, re: RegExp): string[] {
  re.lastIndex = 0;
  return [...texto.matchAll(re)].map((m) => m[0].trim());
}

/**
 * Lê o texto do cliente e diz o que ele pediu — o VERBO e a QUANTIDADE.
 * Determinística: sem IA, sem rede, sem banco.
 */
export function lerPedido(textoDoCliente: string): LeituraDoPedido {
  const t = normalizar(textoDoCliente ?? "");
  if (!t.trim()) {
    return { entregavel: "indefinido", quantidade: null, motivoDaContagem: "sem_peca_citada", evidencias: [] };
  }

  const pedeInsumo = achar(t, PEDIDO_DE_INSUMO);
  const pedePeca = achar(t, PEDIDO_DE_PECA);
  const citaInsumo = achar(t, MENCAO_DE_INSUMO);
  const citaPeca = achar(t, MENCAO_DE_PECA);
  const insumoAtributo = achar(t, INSUMO_COMO_ATRIBUTO);

  // ── O VERBO ───────────────────────────────────────────────────────────────
  // Pedido explícito manda sobre menção solta: "quero um reel com roteiro"
  // pede uma PEÇA e cita um insumo de passagem.
  let entregavel: Entregavel;
  if (pedeInsumo.length > 0 && pedePeca.length > 0) {
    entregavel = "ambiguo";
  } else if (pedeInsumo.length > 0) {
    entregavel = "insumo";
  } else if (pedePeca.length > 0) {
    entregavel = "peca";
  } else if (citaInsumo.length > 0 && citaPeca.length > 0) {
    // Sem verbo de pedido: o insumo que aparece depois de "com/incluindo" é
    // atributo da peça. Se TODA menção de insumo for atributo, é peça.
    entregavel = insumoAtributo.length >= citaInsumo.length ? "peca" : "ambiguo";
  } else if (citaInsumo.length > 0) {
    entregavel = "insumo";
  } else if (citaPeca.length > 0) {
    entregavel = "peca";
  } else {
    entregavel = "indefinido";
  }

  // ── A QUANTIDADE ──────────────────────────────────────────────────────────
  const contagens = [...t.matchAll(CONTAGEM)];
  const numeros = contagens.map((m) => {
    const bruto = m[1]!;
    return /^\d+$/.test(bruto) ? Number(bruto) : (NUMERO_POR_EXTENSO[bruto] ?? 0);
  }).filter((n) => n > 0);

  const distintos = new Set(contagens.map((m) => m[0]!.trim()));
  const plurais = achar(t, PLURAL);

  let quantidade: number | null;
  let motivoDaContagem: MotivoDaContagem;
  if (distintos.size > 1) {
    // "6 reels e 4 videos": somar seria inventar o total, escolher o maior
    // seria subtrair trabalho. Nem uma coisa nem outra — pergunta.
    quantidade = null;
    motivoDaContagem = "varias_contagens";
  } else if (numeros.length > 0) {
    quantidade = Math.max(...numeros);
    motivoDaContagem = "contada";
  } else if (plurais.length > 0) {
    // Ele falou no plural e não disse quantas. **Ausência de informação não é
    // informação:** isto NÃO vira 1.
    quantidade = null;
    motivoDaContagem = "plural_sem_numero";
  } else if (citaPeca.length > 0 || citaInsumo.length > 0) {
    quantidade = 1;
    motivoDaContagem = "contada";
  } else {
    quantidade = null;
    motivoDaContagem = "sem_peca_citada";
  }

  const evidencias = [...new Set([...pedeInsumo, ...pedePeca, ...[...distintos], ...plurais])].slice(0, 8);
  return { entregavel, quantidade, motivoDaContagem, evidencias };
}

/** Uma frase em português do que a leitura viu — vai para o cliente e para a
 *  caixa de entrada. Motivo sem as palavras dele não convence ninguém. */
export function explicarLeitura(l: LeituraDoPedido): string {
  const citou = l.evidencias.length > 0 ? ` (você escreveu: “${l.evidencias.slice(0, 3).join("”, “")}”)` : "";
  switch (l.motivoDaContagem) {
    case "plural_sem_numero":
      return `você falou no plural e eu não consegui contar quantas peças são${citou}`;
    case "varias_contagens":
      return `você citou mais de uma quantidade e eu não consigo somar sem chutar${citou}`;
    default:
      return `entendi ${l.quantidade ?? "uma quantidade que não consegui contar"} peça(s)${citou}`;
  }
}
