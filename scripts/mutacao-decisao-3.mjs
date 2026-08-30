#!/usr/bin/env node
// A MUTAÇÃO DA DECISÃO 3 DO CEO — a saída do canal.
//
// O Diretor Geral chamou a decisão 3 de "a mais perigosa da lista", e o motivo
// é estrutural: ela ABRE uma porta que estava fechada. Antes desta ordem, nada
// saía do 99Freelas, e um bug só podia errar para o lado seguro. Agora existe
// um caminho legítimo para fora, e todo caminho legítimo é um caminho que um
// defeito pode percorrer.
//
// Por isso cada guarda aqui é afrouxada de propósito, uma a uma, e tem de
// deixar um teste VERMELHO. Guarda que ninguém quebrou é guarda suposta.
//
// Rodar: node scripts/mutacao-decisao-3.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SAIDA = "lib/agency/celula/saida-do-canal.ts";
const ALVOS = ["__tests__/celula/saida-do-canal.test.ts"];

const MUTACOES = [
  {
    guarda: "D3-M1 · contratação e pagamento NUNCA saem (a ausência de ramo)",
    arquivo: SAIDA,
    de: 'const NUNCA_SAEM: readonly EscopoDeSaida[] = ["contratacao", "pagamento"];',
    para: "const NUNCA_SAEM: readonly EscopoDeSaida[] = []; // MUTAÇÃO: consentimento passa a destravar pagamento",
    espera: "pagamento/contratação deixam de ser barrados — a trava que protege contra banimento",
  },
  {
    guarda: "D3-M2 · o piso: antes da garantia, nada sai",
    arquivo: SAIDA,
    de: 'if (garantiaDeclarada(pedido.garantia) !== "confirmada") {',
    para: "if (false) { // MUTAÇÃO: a garantia deixa de ser exigida",
    espera: "contato liberado ANTES da garantia de pagamento",
  },
  {
    guarda: "D3-M3 · garantia ilegível não vira confirmada",
    arquivo: SAIDA,
    de: 'return valor === "confirmada" ? "confirmada" : "nao_confirmada";',
    para: 'return (valor as Garantia) ?? "confirmada"; // MUTAÇÃO: lixo vira garantia boa',
    espera: "garantia 'sim'/'CONFIRMADA'/true passam a liberar",
  },
  {
    guarda: "D3-M4 · sem registro, comporta-se como antes da garantia",
    arquivo: SAIDA,
    de: "  if (c === null || c === undefined) {",
    para: "  if (false) { // MUTAÇÃO: consentimento ausente deixa de bloquear",
    espera: "garantia confirmada libera SEM consentimento nenhum",
  },
  {
    guarda: "D3-M5 · o consentimento é DADO — origem tem de ser declaração do cliente",
    arquivo: SAIDA,
    de: '  if (c.origem !== "declaracao_do_cliente") {',
    para: "  if (false) { // MUTAÇÃO: consentimento inferido da conversa passa a valer",
    espera: "origem 'inferido_da_conversa' passa — a inferência que a ordem proíbe",
  },
  {
    guarda: "D3-M6 · registro sem as palavras do cliente é registro sem prova",
    arquivo: SAIDA,
    de: '  if (typeof c.palavrasDoCliente !== "string" || c.palavrasDoCliente.trim() === "") {',
    para: "  if (false) { // MUTAÇÃO: consentimento sem prova passa",
    espera: "consentimento com palavras vazias passa a liberar",
  },
  {
    guarda: "D3-M7 · registro sem autor não se audita",
    arquivo: SAIDA,
    de: '  if (typeof c.registradoPor !== "string" || c.registradoPor.trim() === "") {',
    para: "  if (false) { // MUTAÇÃO: registro anônimo passa",
    espera: "consentimento sem autor passa a liberar",
  },
  {
    guarda: "D3-M8 · data de registro tem de ser data",
    arquivo: SAIDA,
    de: "  if (!(c.registradoEm instanceof Date) || Number.isNaN(c.registradoEm.getTime())) {",
    para: "  if (false) { // MUTAÇÃO: data inválida passa",
    espera: "consentimento com data inválida passa a liberar",
  },
  {
    guarda: "D3-M9 · consentimento é POR ITEM, não 'para tudo'",
    arquivo: SAIDA,
    de: "  if (c.escopo !== escopo) {",
    para: "  if (false) { // MUTAÇÃO: consentir em briefing vira consentir em tudo",
    espera: "consentimento de briefing_externo libera troca de contato",
  },
  {
    guarda: "D3-M10 · escopo ilegível bloqueia, nunca vira default",
    arquivo: SAIDA,
    de: "  return typeof valor === \"string\" && ESCOPOS.includes(valor) ? (valor as EscopoDeSaida) : null;",
    para: "  return (valor as EscopoDeSaida) ?? null; // MUTAÇÃO: o cast cego que a casa proíbe",
    espera: "escopo 'DADO_DE_CONTATO'/' dado_de_contato' passam como válidos",
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
