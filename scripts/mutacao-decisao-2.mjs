#!/usr/bin/env node
// A MUTAÇÃO DA DECISÃO 2 — o perfil de navegador isolado.
//
// Esta é a peça que destrava o bloqueio do `seguranca`, e por isso é a que
// mais precisa da mutação: uma trava de isolamento que ninguém quebrou é
// exatamente o parágrafo de especificação que ele recusou aceitar.
//
// Rodar: node scripts/mutacao-decisao-2.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const NAV = "lib/agency/celula/navegador-isolado.ts";
const ALVOS = ["__tests__/celula/navegador-isolado.test.ts"];

const MUTACOES = [
  {
    guarda: "D2-M1 · comparação por host exato/subdomínio, nunca `includes`",
    arquivo: NAV,
    de: "    if (partes.host === p.host || partes.host.endsWith(`.${p.host}`)) {",
    para: "    if (partes.host.includes(p.host)) { // MUTAÇÃO: o defeito clássico de allowlist",
    espera: "99freelas.com.br.evil.com passa a ser alcançável",
  },
  {
    guarda: "D2-M2 · só https (file: alcança o disco, http: entrega a sessão)",
    arquivo: NAV,
    de: '  if (partes.esquema !== "https:") {',
    para: "  if (false) { // MUTAÇÃO: file: e http: passam a ser aceitos",
    espera: "file:///etc/passwd deixa de ser barrado",
  },
  {
    guarda: "D2-M3 · a lista é de PERMISSÃO — o que não foi declarado é negado",
    arquivo: NAV,
    de: "  return {\n    alcancavel: false,\n    regra: \"fora_da_lista_de_permissao\",",
    para: "  return { alcancavel: true, host: partes.host, porque: \"canal\" }; // MUTAÇÃO: vira lista de proibição — tudo que não foi negado passa\n  return {\n    alcancavel: false,\n    regra: \"fora_da_lista_de_permissao\",",
    espera: "Gmail, banco e redes sociais passam a ser alcançáveis",
  },
  {
    guarda: "D2-M4 · URL ilegível é negada, nunca consertada",
    arquivo: NAV,
    de: "  if (partes === null) {",
    para: "  if (false) { // MUTAÇÃO: entrada ilegível deixa de ser negada",
    espera: "'', null e javascript: deixam de ser barrados",
  },
  {
    guarda: "D2-M5 · área operacional da Dioli é fail closed quando não declarada",
    arquivo: NAV,
    de: '  if (bruto === "") return null;',
    para: '  if (bruto === "") return "dioli.studio"; // MUTAÇÃO: default silencioso onde deveria haver ausência',
    espera: "a Dioli passa a ser alcançável sem ninguém ter declarado",
  },
  {
    guarda: "D2-M6 · configuração malformada não vira permissão",
    arquivo: NAV,
    de: "  if (!/^[a-z0-9.-]+\\.[a-z]{2,}$/.test(bruto)) return null;",
    para: "  // MUTAÇÃO: aceita qualquer coisa como domínio operacional",
    espera: "'*', 'localhost' e uma URL inteira passam a valer como domínio",
  },
  {
    guarda: "D2-M7 · o diretório do perfil nunca é o do navegador pessoal",
    arquivo: NAV,
    de: "    if (normalizado.includes(s)) {",
    para: "    if (false) { // MUTAÇÃO: o perfil do Chrome do CEO passa a ser aceito",
    espera: "o perfil com Gmail e banco passa a ser aceito como isolado",
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
