#!/usr/bin/env node
// mutacao-onda-2.mjs — O AFROUXAMENTO CONTROLADO DE CADA GUARDA.
//
// Guarda sem mutação rodada já falhou seis vezes nesta casa em dois dias.
// Para cada trava: afrouxa a linha, roda o teste, EXIGE vermelho, restaura.
// Se o teste continuar VERDE com a guarda afrouxada, a guarda é decorativa —
// e o script grava isso com todas as letras em vez de esconder.
//
// `replace` sem `assert` não é conserto, é esperança: toda troca confere que o
// alvo existia (exatamente uma vez) antes de trocar, e que o arquivo voltou
// byte a byte ao original depois.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/** @type {{nome:string, guarda:string, arquivo:string, teste:string, de:string, para:string}[]} */
const MUTACOES = JSON.parse(readFileSync(process.argv[2], "utf8"));

const resultados = [];
for (const m of MUTACOES) {
  const original = readFileSync(m.arquivo, "utf8");
  const antes = sha(original);
  const ocorrencias = original.split(m.de).length - 1;
  if (ocorrencias !== 1) {
    resultados.push({ ...m, estado: "ALVO_NAO_ENCONTRADO", ocorrencias, detalhe: `esperava 1 ocorrência do alvo, achei ${ocorrencias}` });
    continue;
  }
  writeFileSync(m.arquivo, original.replace(m.de, m.para));
  const mutado = readFileSync(m.arquivo, "utf8");
  if (mutado === original) {
    writeFileSync(m.arquivo, original);
    resultados.push({ ...m, estado: "MUTACAO_NAO_APLICOU" });
    continue;
  }
  let saida = "", vermelho = false;
  try {
    saida = execSync(`npx vitest run ${m.teste} 2>&1`, { encoding: "utf8", timeout: 300000 });
  } catch (e) {
    vermelho = true;
    saida = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  writeFileSync(m.arquivo, original);
  const depois = sha(readFileSync(m.arquivo, "utf8"));
  const linhaFalha = (saida.match(/×[^\n]*/g) ?? []).map((l) => l.replace(/\s+\d+ms$/, "").trim()).slice(0, 4).join(" · ");
  const contagem = (saida.match(/Tests\s+.*/) ?? [""])[0].trim();
  resultados.push({
    nome: m.nome, guarda: m.guarda, arquivo: m.arquivo, teste: m.teste,
    estado: vermelho ? "VERMELHO_COMO_ESPERADO" : "⚠️ CONTINUOU_VERDE_A_GUARDA_E_DECORATIVA",
    porqueCaiu: linhaFalha || "(sem linha de falha capturada)",
    contagem,
    restaurado: antes === depois,
  });
  console.log(`${vermelho ? "OK  " : "FALHA"} ${m.nome} — ${contagem}`);
}
writeFileSync(process.argv[3], JSON.stringify(resultados, null, 2));
const decorativas = resultados.filter((r) => r.estado !== "VERMELHO_COMO_ESPERADO");
console.log(`\n${resultados.length} mutações · ${resultados.length - decorativas.length} caíram · ${decorativas.length} NÃO caíram`);
if (decorativas.length) console.log(decorativas.map((d) => `  ⚠️ ${d.nome}: ${d.estado}`).join("\n"));
