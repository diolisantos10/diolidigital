// logo-da-casa.ts — A DIOLI DEIXA DE SER "CLIENTE SEM LOGO".
//
// ── O QUE ESTE ARQUIVO CONSERTA (08/08/2026) ────────────────────────────────
//
// A peça só sabia ser assinada com o logo REAL se o logo tivesse vindo do
// Google Drive do cliente (`logoDoCliente`, `lib/agency/esteira/material-do-drive.ts:255`).
// Isso funciona para cliente — e deixava a própria Dioli de fora, porque a Dioli
// não conecta um Drive para si mesma. Resultado: toda peça da casa saía assinada
// com o monograma "DD" e a lacuna do logo declarada, enquanto o logo oficial
// estava versionado em `public/brand/` o tempo inteiro.
//
// Uma agência que pede ao próprio dono o arquivo do logo que ela já tem no
// repositório não tem departamento de Design — tem formulário.
//
// ── O QUE ESTE ARQUIVO NÃO É ────────────────────────────────────────────────
//
// NÃO é uma licença para desenhar logo. A regra de ausência continua inteira e
// vale para todo mundo: cliente sem arquivo de logo recebe o monograma das
// iniciais e a falta DECLARADA em `Molde.lacunas` (`LACUNA_DO_LOGO`). O que
// muda aqui é uma coisa só — a Dioli TEM o arquivo, então a Dioli não está na
// lista dos que não têm.
//
// Por isso a porta é uma LISTA FECHADA de nomes, e não um `startsWith("Dioli")`:
// um prefixo entregaria a marca da agência a um cliente que por acaso se chame
// "Dioli Móveis". Nome de marca é do dono dele.
//
// ── E O TOM É CONTA, NÃO GOSTO ──────────────────────────────────────────────
//
// A assinatura mora sobre `molde.primaria` (é essa a cor do rodapé e a do scrim
// da foto). Então a tinta do símbolo sai da MESMA função que decide a cor do
// texto ao lado dele — `tintaSobre`. Escolher "o branco porque fica bonito" é o
// caminho para o logo branco sobre fundo branco.

import { luminancia, type LogoDoMolde } from "./molde";
import { SIMBOLO_DA_CASA } from "./marca-da-casa";

/**
 * Os nomes sob os quais a casa aparece como cliente de si mesma.
 *
 * Lista fechada e comparada por forma normalizada (sem acento, sem caixa, sem
 * espaço duplo). Cresce por decisão de alguém, nunca por padrão que "casa".
 */
export const NOMES_DA_CASA: readonly string[] = [
  "dioli",
  "dioli digital",
  "dioli studio",
  "dioli digital studio",
  "dioli agencia",
  "dioli agency os",
];

/** Tira acento, caixa e espaço sobrando. "Dioli  Digital " → "dioli digital". */
function normalizar(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Este cliente É a própria agência? */
export function ehACasa(nome: string | null | undefined): boolean {
  const n = normalizar(nome);
  return n.length > 0 && NOMES_DA_CASA.includes(n);
}

/** A tinta do símbolo sobre um fundo. Mesma conta que decide a cor do texto. */
export function tomDaCasaSobre(fundo: string): "navy" | "white" {
  return luminancia(fundo) > 0.45 ? "navy" : "white";
}

/**
 * O logo da casa, pronto para entrar no molde — ou `null`.
 *
 * `null` para todo cliente que não é a Dioli, e isso é o ponto: quem chama passa
 * o resultado direto a `moldeComLogo`, que trata `null` do jeito de sempre —
 * monograma e lacuna declarada.
 */
export function logoDaCasa(
  nomeDoCliente: string | null | undefined,
  fundo: string,
): (LogoDoMolde & { mimeType: string }) | null {
  if (!ehACasa(nomeDoCliente)) return null;

  const tom = tomDaCasaSobre(fundo);
  const svg = SIMBOLO_DA_CASA[tom];
  return {
    // Base64 e não SVG cru na URL: `data:image/svg+xml,<svg ...>` depende de
    // escapar `#`, `<` e aspas na mão, e um `#070A1F` não escapado corta a URL
    // no meio — o logo some e o documento continua válido.
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    nome: `dioli-mark-${tom}.svg`,
    mimeType: "image/svg+xml",
  };
}
