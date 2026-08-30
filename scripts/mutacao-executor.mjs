#!/usr/bin/env node
// A MUTAÇÃO DO EXECUTOR. Rodar: node scripts/mutacao-executor.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const E = "lib/agency/celula/executor.ts";
const ALVOS = ["__tests__/celula/executor.test.ts"];

const MUTACOES = [
  {
    guarda: "E-M1 · sem ATESTAÇÃO do perfil, nada é planejado",
    arquivo: E,
    de: "  if (at === null || at === undefined) {",
    para: "  if (false) { // MUTAÇÃO: opera sem ninguém ter conferido o perfil",
    espera: "planeja acao sem atestacao",
  },
  {
    guarda: "E-M2 · atestação que admite outra sessão bloqueia",
    arquivo: E,
    de: "  if (at.nenhumaOutraSessao !== true) {",
    para: "  if (at.nenhumaOutraSessao === undefined) { // MUTAÇÃO: 'ha outra sessao' deixa de bloquear",
    espera: "perfil com Gmail/banco passa a ser aceito",
  },
  {
    guarda: "E-M3 · o perfil atestado tem de ser DEDICADO",
    arquivo: E,
    de: "  if (!perfil.ok) {",
    para: "  if (false) { // MUTAÇÃO: o perfil pessoal do CEO passa",
    espera: "perfil padrao do Chrome passa a ser aceito",
  },
  {
    guarda: "E-M4 · lista de permissão de destinos",
    arquivo: E,
    de: "  if (!destino.alcancavel) {",
    para: "  if (false) { // MUTAÇÃO: qualquer destino passa",
    espera: "mail.google.com passa a ser planejavel",
  },
  {
    guarda: "E-M5 · escrita exige aceite humano (supervisionado)",
    arquivo: E,
    de: "  if (ACOES_DE_ESCRITA.includes(acao)) {",
    para: "  if (false) { // MUTAÇÃO: o SDR passa a enviar sozinho",
    espera: "SDR passa a enviar mensagem sem aceite",
  },
  {
    guarda: "E-M6 · o limitador de ritmo",
    arquivo: E,
    de: "  if (!ritmo.pode) {",
    para: "  if (false) { // MUTAÇÃO: ritmo de maquina liberado",
    espera: "3s desde a ultima acao deixa de barrar",
  },
  {
    guarda: "E-M7 · o registro confere o destino que o operador RELATOU",
    arquivo: E,
    de: "  if (!permitido) {",
    para: "  if (false) { // MUTAÇÃO: destino divergente vira execucao registrada",
    espera: "99freelas.com.br.evil.com passa a ser registrado como execucao boa",
  },
  {
    guarda: "E-M8 · evidência faltando bloqueia o registro",
    arquivo: E,
    de: "  if (faltando.length > 0) {",
    para: "  if (false) { // MUTAÇÃO: 'executei' sem prova passa",
    espera: "relato sem evidencia passa a ser registrado",
  },
  {
    guarda: "E-M9 · ação desconhecida é indisponível",
    arquivo: E,
    de: "  if (typeof p.acao !== \"string\" || !ACOES.includes(p.acao)) {",
    para: "  if (false) { // MUTAÇÃO: 'logar' e 'ENVIAR_MENSAGEM' passam",
    espera: "acao inventada deixa de ser barrada",
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
  "docs/celula-prospeccao/mutacao-executor.json",
  JSON.stringify({ rodadoEm: new Date().toISOString(), base: baseResumo.placar, mutacoes: relatorio }, null, 2),
);

console.log(`\nGuardas mutadas: ${MUTACOES.length} · que NÃO quebraram nenhum teste: ${mutacoesQueNaoQuebraram}`);
process.exit(mutacoesQueNaoQuebraram === 0 ? 0 : 2);
