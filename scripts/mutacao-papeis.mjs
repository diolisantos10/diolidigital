#!/usr/bin/env node
// A MUTAÇÃO DOS PAPÉIS DA CÉLULA.
// Rodar: node scripts/mutacao-papeis.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const P = "lib/agency/celula/papeis.ts";
const ALVOS = ["__tests__/celula/papeis.test.ts"];

const MUTACOES = [
  {
    guarda: "P-M1 · o papel é DADO declarado, nunca inferido do departamento",
    arquivo: P,
    de: "  const p = c.papelDeclaradoNaCelula;\n  if (typeof p !== \"string\") return null;\n  return (RESPONSAVEIS as readonly string[]).includes(p) ? (p as Responsavel) : null;",
    para: "  // MUTAÇÃO: todo membro do departamento vira gerente — e passa a aprovar modelo\n  return \"gerente_de_atendimento\";",
    espera: "membro sem papel declarado passa a aprovar modelo",
  },
  {
    guarda: "P-M2 · papel fora do conjunto fechado não vale",
    arquivo: P,
    de: "  return (RESPONSAVEIS as readonly string[]).includes(p) ? (p as Responsavel) : null;",
    para: "  return p as Responsavel; // MUTAÇÃO: o cast cego — 'ceo' e 'GERENTE' passam",
    espera: "papel 'ceo'/'GERENTE_DE_ATENDIMENTO' passam a valer",
  },
  {
    guarda: "P-M3 · só quem é DO departamento da Célula tem papel nela",
    arquivo: P,
    de: "  if (!c.departamentos.includes(DEPARTAMENTO_DA_CELULA)) return null;",
    para: "  // MUTAÇÃO: alguém do Design declarando o papel vira gerente",
    espera: "impostor do Design passa a aprovar modelo",
  },
  {
    guarda: "P-M4 · o CEO NÃO opera a fila de exceções (ordem literal)",
    arquivo: P,
    de: '  if (a === "operar_fila_de_excecoes" && (c?.autoridade === "master" || c?.autoridade === "director")) {',
    para: "  if (false) { // MUTAÇÃO: autoridade destrava a fila que o CEO mandou não operar",
    espera: "CEO e diretor passam a operar a fila",
  },
  {
    guarda: "P-M5 · direção não aprova a própria fala",
    arquivo: P,
    de: '  if ((a === "aprovar_modelo" || a === "pausar_modelo") && papel !== "gerente_de_atendimento") {',
    para: "  if (false) { // MUTAÇÃO: a direção passa a liberar a mensagem que ela encomendou",
    espera: "CEO e diretor passam a aprovar modelo",
  },
  {
    guarda: "P-M6 · a tabela de permissões (SDR não libera o que vai dizer)",
    arquivo: P,
    de: "  if (!PODE[papel].includes(a)) {",
    para: "  if (false) { // MUTAÇÃO: todo papel pode tudo",
    espera: "o SDR passa a aprovar modelo e autorizar envio",
  },
  {
    guarda: "P-M7 · ação desconhecida é indisponível",
    arquivo: P,
    de: "  if (typeof acao !== \"string\" || !ACOES.includes(acao)) {",
    para: "  if (false) { // MUTAÇÃO: ação inventada deixa de ser barrada",
    espera: "'publicar' e 'APROVAR_MODELO' deixam de ser barrados",
  },
  {
    guarda: "P-M8 · cliente não lê a Célula",
    arquivo: P,
    de: '  return a !== "client";',
    para: "  return true; // MUTAÇÃO: o cliente passa a ler /agency/**",
    espera: "cliente passa a ler a Célula",
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
  "docs/celula-prospeccao/mutacao-papeis.json",
  JSON.stringify({ rodadoEm: new Date().toISOString(), base: baseResumo.placar, mutacoes: relatorio }, null, 2),
);

console.log(`\nGuardas mutadas: ${MUTACOES.length} · que NÃO quebraram nenhum teste: ${mutacoesQueNaoQuebraram}`);
process.exit(mutacoesQueNaoQuebraram === 0 ? 0 : 2);
