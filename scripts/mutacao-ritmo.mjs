#!/usr/bin/env node
// A MUTAÇÃO DO LIMITADOR DE RITMO.
// Rodar: node scripts/mutacao-ritmo.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const R = "lib/agency/celula/ritmo.ts";
const ALVOS = ["__tests__/celula/ritmo.test.ts"];

const MUTACOES = [
  {
    guarda: "R-M1 · sem configuração, NADA age (ausência de limite ≠ correr livre)",
    arquivo: R,
    de: "  if (config === null) {",
    para: "  if (false) { // MUTAÇÃO: sem freio declarado, passa a agir livremente",
    espera: "configuração ausente deixa de bloquear",
  },
  {
    guarda: "R-M2 · leitura fail-closed da política (campo faltando derruba tudo)",
    arquivo: R,
    de: "  if (intervalo === null || hora === null || dia === null) return null;",
    para: "  if (false) return null; // MUTAÇÃO: campo faltando vira configuração válida",
    espera: "política sem intervalo mínimo passa a ser aceita",
  },
  {
    guarda: "R-M3 · número inválido não vira número (0, negativo, string)",
    arquivo: R,
    de: "    typeof v === \"number\" && Number.isFinite(v) && v > 0 ? v : null;",
    para: "    Number(v) || 1; // MUTAÇÃO: 0/negativo/string viram número qualquer",
    espera: "intervalo 0 e -5 passam a valer como configuração",
  },
  {
    guarda: "R-M4 · o intervalo mínimo entre ações",
    arquivo: R,
    de: "    if (decorridoMs < minimoMs) {",
    para: "    if (false) { // MUTAÇÃO: ritmo de máquina liberado",
    espera: "10s desde a última ação deixa de bloquear",
  },
  {
    guarda: "R-M5 · teto do dia",
    arquivo: R,
    de: "  if (noDia >= config.maximoPorDia) {",
    para: "  if (noDia > config.maximoPorDia + 1000) { // MUTAÇÃO: o teto do dia some",
    espera: "80/80 deixa de bloquear",
  },
  {
    guarda: "R-M6 · teto da hora",
    arquivo: R,
    de: "  if (naHora >= config.maximoPorHora) {",
    para: "  if (naHora > config.maximoPorHora + 1000) { // MUTAÇÃO: o teto da hora some",
    espera: "20/20 na hora deixa de bloquear",
  },
  {
    guarda: "R-M7 · histórico ilegível bloqueia",
    arquivo: R,
    de: "  if (naHora === null || noDia === null) {",
    para: "  if (false) { // MUTAÇÃO: contagem negativa/ausente passa a valer",
    espera: "contagem -1 e undefined deixam de bloquear",
  },
  {
    guarda: "R-M8 · última ação no futuro não vira crédito de tempo",
    arquivo: R,
    de: "    if (decorridoMs < 0) {",
    para: "    if (false) { // MUTAÇÃO: relógio torto passa a liberar",
    espera: "última ação no futuro deixa de bloquear",
  },
];

function rodarTestes() {
  try {
    const saida = execSync(`npx vitest run ${ALVOS.join(" ")} 2>&1`, {
      encoding: "utf-8",
      stdio: "pipe",
      maxBuffer: 40 * 1024 * 1024,
    });
    return { vermelho: false, saida };
  } catch (e) {
    return { vermelho: true, saida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function resumo(saida) {
  const falhas = [...saida.matchAll(/^\s*(?:FAIL|×)\s+(.+)$/gm)].map((m) => m[1].trim());
  const placar = saida.match(/Tests\s+(.+)$/m)?.[1]?.trim() ?? "(placar não lido)";
  return { falhas, placar };
}

const relatorio = [];
let mutacoesQueNaoQuebraram = 0;

// A LINHA DE BASE: verde antes de qualquer mutação.
console.log("── LINHA DE BASE ──");
const base = rodarTestes();
const baseResumo = resumo(base.saida);
console.log(`base: ${base.vermelho ? "VERMELHO ⛔" : "VERDE ✅"} — ${baseResumo.placar}`);
if (base.vermelho) {
  console.error("A linha de base já está vermelha. Mutação sobre suíte vermelha não prova nada. Abortando.");
  process.exit(1);
}

for (const m of MUTACOES) {
  const original = readFileSync(m.arquivo, "utf-8");
  if (!original.includes(m.de)) {
    console.error(`⛔ ${m.guarda}: trecho-alvo NÃO ENCONTRADO em ${m.arquivo}. Mutação não aplicada.`);
    relatorio.push({ ...m, estado: "ALVO_NAO_ENCONTRADO", falhas: [], placar: "-" });
    mutacoesQueNaoQuebraram++;
    continue;
  }
  const mutado = original.replace(m.de, m.para);
  // `replace` sem `assert` não é conserto, é esperança: confere o ARQUIVO.
  if (mutado === original || !mutado.includes(m.para)) {
    throw new Error(`${m.guarda}: a substituição não alterou o arquivo.`);
  }
  writeFileSync(m.arquivo, mutado);
  const conferido = readFileSync(m.arquivo, "utf-8");
  if (!conferido.includes(m.para)) throw new Error(`${m.guarda}: o disco não recebeu a mutação.`);

  let r;
  try {
    r = rodarTestes();
  } finally {
    writeFileSync(m.arquivo, original);
    const restaurado = readFileSync(m.arquivo, "utf-8");
    if (restaurado !== original) throw new Error(`${m.guarda}: RESTAURAÇÃO FALHOU em ${m.arquivo}.`);
  }

  const res = resumo(r.saida);
  console.log(`${r.vermelho ? "✅ VERMELHO" : "⛔ SEGUIU VERDE"} — ${m.guarda} — ${res.placar}`);
  if (!r.vermelho) mutacoesQueNaoQuebraram++;
  relatorio.push({ ...m, estado: r.vermelho ? "VERMELHO" : "SEGUIU_VERDE", falhas: res.falhas, placar: res.placar });
}

writeFileSync(
  "docs/celula-prospeccao/mutacao-onda-1.json",
  JSON.stringify({ rodadoEm: new Date().toISOString(), base: baseResumo.placar, mutacoes: relatorio }, null, 2),
);

console.log(`\nGuardas mutadas: ${MUTACOES.length} · que NÃO quebraram nenhum teste: ${mutacoesQueNaoQuebraram}`);
process.exit(mutacoesQueNaoQuebraram === 0 ? 0 : 2);
