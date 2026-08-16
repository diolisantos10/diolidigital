// Ponte entre o disco e a régua pura de `reivindicacoes.ts`.
//
// `reivindicacoes.ts` é zero I/O e zero rede de propósito — é o que permite
// testar a régua de colisão sem precisar de disco nem de git. Este arquivo é
// o único lugar, em `lib/coordenacao/`, que toca o sistema de arquivos: só
// leitura síncrona, sem rede, para o sentinela (que roda em `npm test`, e
// precisa rodar igual no CI e na máquina de qualquer um) nunca depender de
// conseguir alcançar o GitHub.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { conferirRegistro, validarReivindicacao, type Reivindicacao, type ResultadoDoRegistro } from "./reivindicacoes";

/**
 * Lê e valida todo `*.json` de `pasta`. Lança no primeiro JSON malformado ou
 * sem campo obrigatório — essa é uma das três formas de reprovação do
 * sentinela, ao lado das duas colisões que `conferirRegistro` pega.
 *
 * Pasta ausente devolve registro vazio, não erro: `reivindicacoes/` só ganha
 * o primeiro `.json` quando a primeira sessão abrir uma reivindicação, e um
 * repositório limpo não pode reprovar por isso.
 */
export function lerReivindicacoesDoDisco(pasta: string): Reivindicacao[] {
  let arquivos: string[];
  try {
    arquivos = readdirSync(pasta).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  return arquivos
    .sort() // ordem determinística — o resultado não pode depender da ordem que o SO devolve
    .map((arquivo) => {
      const caminho = join(pasta, arquivo);
      let bruto: unknown;
      try {
        bruto = JSON.parse(readFileSync(caminho, "utf8"));
      } catch (e) {
        throw new Error(`${arquivo}: JSON malformado (${e instanceof Error ? e.message : String(e)}).`);
      }
      return validarReivindicacao(bruto, arquivo);
    });
}

/** O veredito completo do sentinela sobre uma pasta do disco: lê, valida, confere. */
export function conferirRegistroNoDisco(pasta: string, agora: Date): ResultadoDoRegistro {
  return conferirRegistro(lerReivindicacoesDoDisco(pasta), agora);
}
