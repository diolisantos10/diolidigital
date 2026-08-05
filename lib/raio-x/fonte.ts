// A fonte que as varreduras de CÓDIGO leem: os arquivos do repositório.
//
// Somente leitura, e isso é trava e não aviso: este módulo só expõe `readFile`.
// (O teste `raio-x-nao-escreve` prova que nenhuma varredura importa verbo de
// escrita — guardrail 4: prompt é aviso, código é trava.)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORAR = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  "test-results",
  "generated",
  "docs",
  "public",
  "store",
]);

export type Arquivo = { caminho: string; texto: string };

/** Raiz do projeto. Fixa e derivada do próprio arquivo — nunca de cwd, que muda
 *  conforme quem chama e faria a varredura enxergar árvores diferentes. */
export function raizDoProjeto(): string {
  return join(new URL(".", import.meta.url).pathname, "..", "..");
}

function listar(dir: string, acc: string[]): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const nome of entradas) {
    if (IGNORAR.has(nome) || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    let s;
    try {
      s = statSync(caminho);
    } catch {
      continue;
    }
    if (s.isDirectory()) listar(caminho, acc);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

/**
 * Todos os fontes do projeto, com caminho RELATIVO à raiz.
 * Relativo de propósito: o caminho entra na `chave` do achado, e um caminho
 * absoluto mudaria entre a máquina do Diretor e o container — o que faria o
 * mesmo problema parecer novo toda noite.
 */
export function fontesDoProjeto(subpastas: string[] = ["app", "lib", "components", "scripts"]): Arquivo[] {
  const raiz = raizDoProjeto();
  const arquivos: string[] = [];
  for (const sub of subpastas) listar(join(raiz, sub), arquivos);
  const out: Arquivo[] = [];
  for (const caminho of arquivos.sort()) {
    try {
      out.push({ caminho: relative(raiz, caminho), texto: readFileSync(caminho, "utf8") });
    } catch {
      // Arquivo ilegível é ausência de informação, não ausência de problema:
      // quem chama decide (uma varredura sem nenhum arquivo devolve "cega").
    }
  }
  return out;
}

/** Nº da linha (1-based) de um índice de caractere. É o que transforma um
 *  achado em `arquivo:linha` clicável — evidência, não descrição. */
export function linhaDe(texto: string, indice: number): number {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === "\n") n++;
  return n;
}

/** O bloco `{...}` que começa na primeira chave a partir de `inicio`.
 *  Contagem de chaves simples, ignorando string e comentário — o suficiente
 *  para delimitar um `for`/`while` sem trazer um parser inteiro para dentro. */
export function blocoDe(texto: string, inicio: number): { corpo: string; fim: number } {
  const abre = texto.indexOf("{", inicio);
  if (abre === -1) return { corpo: "", fim: inicio };
  let nivel = 0;
  let dentroDe: string | null = null;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]!;
    const anterior = texto[i - 1];
    if (dentroDe) {
      if (c === dentroDe && anterior !== "\\") dentroDe = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      dentroDe = c;
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      const fimLinha = texto.indexOf("\n", i);
      i = fimLinha === -1 ? texto.length : fimLinha;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fimBloco = texto.indexOf("*/", i);
      i = fimBloco === -1 ? texto.length : fimBloco + 1;
      continue;
    }
    if (c === "{") nivel++;
    else if (c === "}") {
      nivel--;
      if (nivel === 0) return { corpo: texto.slice(abre, i + 1), fim: i };
    }
  }
  return { corpo: texto.slice(abre), fim: texto.length };
}

/** Trecho de uma linha, aparado — vira evidência legível no relatório. */
export function trecho(texto: string, indice: number, limite = 120): string {
  const inicio = texto.lastIndexOf("\n", indice) + 1;
  let fim = texto.indexOf("\n", indice);
  if (fim === -1) fim = texto.length;
  return texto.slice(inicio, fim).trim().slice(0, limite);
}
