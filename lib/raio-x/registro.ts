// O REGISTRO — onde a noite fica guardada.
//
// Sem persistência não existe "ontem", e sem "ontem" o raio-x vira paisagem: uma
// lista de 40 itens que ninguém lê porque é sempre a mesma. Este é o ÚNICO
// arquivo do raio-x que escreve, e escreve num lugar só: `docs/raio-x/coletas/`.
// Ele não toca no banco — de propósito. O raio-x é somente leitura sobre o
// sistema; a memória dele mora no repositório, versionada com o commit que ela
// varreu.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { raizDoProjeto } from "./fonte";
import type { Coleta } from "./tipos";

export function pastaDeColetas(): string {
  return join(raizDoProjeto(), "docs", "raio-x", "coletas");
}

function arquivoDe(c: Pick<Coleta, "data" | "metade">): string {
  return join(pastaDeColetas(), `${c.data}-${c.metade}.json`);
}

export function commitAtual(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: raizDoProjeto(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "desconhecido";
  }
}

export function gravarColeta(c: Coleta): string {
  const pasta = pastaDeColetas();
  mkdirSync(pasta, { recursive: true });
  const caminho = arquivoDe(c);
  writeFileSync(caminho, `${JSON.stringify(c, null, 2)}\n`, "utf8");
  return caminho;
}

/**
 * A coleta ANTERIOR da mesma metade. Anterior, não "a de ontem": se a madrugada
 * de ontem falhou, comparar com anteontem ainda informa. O que não pode é
 * comparar código com dados — são perguntas diferentes.
 */
export function coletaAnterior(metade: Coleta["metade"], antesDe: string): Coleta | null {
  const pasta = pastaDeColetas();
  if (!existsSync(pasta)) return null;
  const candidatos = readdirSync(pasta)
    .filter((n) => n.endsWith(`-${metade}.json`) && n < `${antesDe}-${metade}.json`)
    .sort();
  const ultimo = candidatos.at(-1);
  if (!ultimo) return null;
  try {
    return JSON.parse(readFileSync(join(pasta, ultimo), "utf8")) as Coleta;
  } catch {
    return null;
  }
}

export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  // Fuso da casa. Cortar o dia em UTC faria a coleta da madrugada cair no dia
  // seguinte e o relatório da manhã comparar a noite consigo mesma.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
