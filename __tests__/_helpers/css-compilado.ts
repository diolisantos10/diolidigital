// O CSS QUE O NAVEGADOR DO CLIENTE RECEBE — compilado de verdade, no teste.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO EXISTE (Auditor, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O conserto do cartão cortado foi julgado por um teste que afirmava
// `expect(html).toMatch(/aspect-\[9\/16\]/)` — ou seja, sobre a STRING no
// atributo `class`. Só que classe no HTML não é regra no CSS: o Tailwind v4
// varre o TEXTO-FONTE do repositório procurando candidatos e emite só as
// regras que encontrou. Uma classe que o scanner não achou vai para o
// atributo e não pinta nada.
//
// E era esse o caso: a classe era montada por interpolação
// (`aspect-[${...}]`), que o scanner não lê. As regras só existiam porque a
// string aparecia por acidente num comentário JSDoc e num arquivo de teste. O
// Auditor apagou os dois, recompilou, e TODAS as regras `aspect-[ … ]` sumiram.
// Régua verde sobre o componente errado.
//
// Este helper compila `app/globals.css` com o MESMO plugin que o build de
// produção usa (`@tailwindcss/postcss`, o de `postcss.config.mjs`) e devolve o
// CSS resultante, para que a régua caia sobre a CAIXA e não sobre o atributo.
//
// ⚠️ Este arquivo, e todo teste que o usa, NÃO PODE conter a string literal de
// uma classe utilitária que ele está conferindo — o scanner leria o próprio
// teste como fonte e fabricaria a regra que deveria estar faltando. É o mesmo
// erro de "falsificar fundo demais cria uma régua que só pode dar verde". Por
// isso as classes chegam aqui como VALOR, importadas do módulo de produção.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let cache: string | null = null;

/** O CSS compilado do app, uma vez por processo (a compilação leva ~1s). */
export async function cssCompiladoDoApp(): Promise<string> {
  if (cache != null) return cache;
  const [{ default: postcss }, { default: tailwind }] = await Promise.all([
    import("postcss"),
    import("@tailwindcss/postcss"),
  ]);
  const from = join(process.cwd(), "app/globals.css");
  const resultado = await postcss([tailwind()]).process(readFileSync(from, "utf8"), { from });
  cache = resultado.css;
  return cache;
}

/** `aspect-[ 9/16 ]` → o seletor como ele aparece no CSS: `.aspect-\[9\/16\]`. */
export function seletorDaClasse(classe: string): string {
  return "." + classe.replace(/[^\w-]/g, (ch) => "\\" + ch);
}

/** A regra desta classe utilitária existe no CSS que o cliente baixa? */
export async function classeTemRegraNoCss(classe: string): Promise<boolean> {
  return (await cssCompiladoDoApp()).includes(seletorDaClasse(classe));
}
