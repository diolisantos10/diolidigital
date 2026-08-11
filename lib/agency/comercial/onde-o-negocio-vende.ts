// ONDE O NEGÓCIO VENDE — a pergunta que ninguém fazia, e que decide para quem o
// dinheiro do cliente é gasto.
//
// ── O buraco, medido contra o código (10/08/2026) ───────────────────────────
//
// `lib/agency/esteira/trafego.ts` faz a coisa certa: ele **se recusa a inventar
// cidade**, e o comentário dele diz por quê — *"segmentar por palpite geográfico
// é o erro que faz a padaria de bairro anunciar no país inteiro"*.
//
// Só que ele lia a cidade de `scope.city`, e **`BriefingScope` nunca teve esse
// campo**. Nenhuma pergunta do SDR capturava região. O resultado prático: toda
// campanha nascia com `cidade: null`, e `null` virava, sem uma palavra,
// **"Brasil inteiro"**.
//
// Para o cliente que o CEO descreveu — *"um padeiro que quer anunciar no bairro
// dele"* — isso não é uma imprecisão de segmentação. É a verba do mês inteira
// entregue a gente que não tem como comprar o pão dele.
//
// ── POR QUE ISTO É O GUARDRAIL 1, E NÃO UM CAMPO NOVO ──────────────────────
//
// *Ausência de informação não é informação.* O silêncio do briefing **não pode
// significar "vende para o Brasil"**. Por isso o alcance tem TRÊS estados e não
// dois — e o terceiro é o que importa:
//
//   `nacional`      → o cliente DISSE que vende para o país inteiro. É um dado.
//   `local`         → o cliente DISSE que atende uma região. É um dado.
//   `nao_declarado` → **ninguém perguntou, ou ninguém respondeu.** Não é um dado,
//                     e nunca vira um por conveniência.
//
// Um `boolean nacional` teria colapsado o terceiro estado no primeiro — que é
// exatamente o defeito que este arquivo existe para consertar.
//
// E há um quarto caso, que é o do padeiro: ele disse **"no meu bairro"** e não
// disse a cidade. Isso é `local` com `cidade: null` — declaração honesta de
// alcance sem o dado que a Meta precisa. Não se adivinha a cidade dele a partir
// do DDD, do CEP do sócio ou do nome do negócio: adivinhar aqui gasta dinheiro
// alheio no lugar errado.

/** O quanto do mapa o negócio atende. Três estados, e o terceiro é a ausência
 *  declarada — nunca um sinônimo dos outros dois. */
export type Alcance = "nacional" | "local" | "nao_declarado";

export interface AreaDeAtendimento {
  alcance: Alcance;
  /** A cidade, quando ela foi dita com todas as letras. Nula quando o alcance é
   *  nacional, quando não foi perguntado, ou quando o cliente disse "meu
   *  bairro" sem dizer qual. */
  cidade: string | null;
  /** Raio em km a partir da cidade, quando o cliente deu um número. */
  raioKm: number | null;
  /** O que a pessoa escreveu, cru e cortado. É a evidência: quem for conferir a
   *  segmentação lê a frase original, não a interpretação dela. É o guardrail 6
   *  aplicado ao briefing. */
  comoFoiDito: string;
}

/** A área de quem nunca foi perguntado. Existe como valor para que "não sei"
 *  seja algo que o código carrega, e não um `undefined` que cada leitor
 *  interpreta do seu jeito. */
export const NAO_PERGUNTADO: AreaDeAtendimento = {
  alcance: "nao_declarado", cidade: null, raioKm: null, comoFoiDito: "",
};

const DIZ_NACIONAL =
  /\b(brasil\s*(inteiro|todo)?|todo\s*(o\s*)?brasil|pa[íi]s\s*(inteiro|todo)|nacional(mente)?|qualquer\s*lugar|todo\s*lugar|em\s*todo\s*canto|s[óo]\s*online|apenas\s*online|100%\s*online|e-?commerce)\b/i;

const DIZ_LOCAL =
  /\b(bairro|regi[ãa]o|aqui\s*(na|no|em)|vizinhan[çc]a|redondeza|arredor|cidade|munic[íi]pio|em\s*volta|perto\s*(daqui|de\s*mim)|local(mente)?|raio\b|km\b|entrega(mos)?\s*(em|na|no))\b/i;

/** Palavras que aparecem depois de "em/na/no" e **não** são cidade. Sem esta
 *  lista, "atendo na região" viraria a cidade "Região". */
const NAO_E_CIDADE =
  /^(bairro|regi[ãa]o|cidade|munic[íi]pio|vizinhan[çc]a|volta|torno|casa|loja|frente|todo|toda|qualquer|redor|arredores|redondezas|brasil|país|pais|geral|m[ée]dia|toda\s|todo\s)/i;

/**
 * Tenta ler a cidade dita com todas as letras.
 *
 * Conservador de propósito: exige a preposição **e** inicial maiúscula. Prefere
 * devolver `null` a devolver um palpite — porque o palpite aqui não é um erro de
 * texto, é verba gasta na cidade errada.
 */
function lerCidade(texto: string): string | null {
  const padroes = [
    /\b(?:cidade\s+de|munic[íi]pio\s+de)\s+([A-ZÀ-Ý][\wÀ-ÿ]+(?:[\s-]+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\wÀ-ÿ]+){0,3})/,
    /\baqui\s+(?:em|na|no)\s+([A-ZÀ-Ý][\wÀ-ÿ]+(?:[\s-]+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\wÀ-ÿ]+){0,3})/,
    /\b(?:em|na|no|de|d[eo]\s+dentro\s+de)\s+([A-ZÀ-Ý][\wÀ-ÿ]+(?:[\s-]+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][\wÀ-ÿ]+){0,3})/,
  ];
  for (const p of padroes) {
    const m = texto.match(p);
    const bruto = m?.[1]?.trim();
    if (!bruto || NAO_E_CIDADE.test(bruto)) continue;
    return bruto.slice(0, 80);
  }
  return null;
}

function lerRaio(texto: string): number | null {
  const m = texto.match(/(\d{1,3})\s*(?:km|quil[ôo]metros?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lê a área de atendimento a partir do que o cliente escreveu.
 *
 * Nunca lança e nunca inventa: texto que não diz nada sobre alcance volta como
 * `nao_declarado`, que é a verdade.
 */
export function lerAreaDeAtendimento(texto: string): AreaDeAtendimento {
  const t = (texto ?? "").trim();
  const comoFoiDito = t.slice(0, 240);
  if (!t) return NAO_PERGUNTADO;

  const cidade = lerCidade(t);
  const raioKm = lerRaio(t);

  // A cidade dita com todas as letras vence a palavra "nacional" solta na
  // frase: *"vendo pelo Brasil todo mas minha loja é em Campinas"* é um negócio
  // que quer aparecer em Campinas. Na dúvida entre gastar largo e gastar perto,
  // gasta-se perto — o erro é reversível e barato.
  if (cidade) return { alcance: "local", cidade, raioKm, comoFoiDito };
  if (DIZ_NACIONAL.test(t)) return { alcance: "nacional", cidade: null, raioKm: null, comoFoiDito };
  if (DIZ_LOCAL.test(t)) return { alcance: "local", cidade: null, raioKm, comoFoiDito };

  return { alcance: "nao_declarado", cidade: null, raioKm, comoFoiDito };
}

/** O que falta para poder segmentar, em português de dono de negócio — ou
 *  `null` quando não falta nada. É a frase que vai virar pendência na tela. */
export function oQueFaltaParaSegmentar(area: AreaDeAtendimento | undefined): string | null {
  if (!area || area.alcance === "nao_declarado") {
    return "ninguém perguntou onde este negócio vende — sem isso o anúncio sai para o Brasil inteiro e a verba do mês vai para gente que não compra deste cliente";
  }
  if (area.alcance === "local" && !area.cidade) {
    const dito = area.comoFoiDito ? ` (ele disse: "${area.comoFoiDito}")` : "";
    return `o cliente disse que atende uma região, mas não disse qual cidade${dito} — precisa confirmar a cidade antes de subir a campanha`;
  }
  return null;
}
