#!/usr/bin/env node
// A MUTAÇÃO DA DECISÃO 5 DO CEO — o catálogo ofertável.
//
// A régua do Diretor Geral: "a decisão 5 exige mecanismo, não lista escrita:
// o catálogo do que é ofertável tem que ser DERIVADO da capacidade real, e
// serviço sem capacidade não pode nem ser montado em proposta."
//
// Mutação aqui prova as duas metades disso: que as guardas existem, e que a
// derivação é real — D5-M1 afrouxa a CAPACIDADE (arquivo compartilhado da
// casa), não o catálogo, e mesmo assim o catálogo tem de mudar de resposta.
// Se ele não mudasse, seria lista escrita com passos extras.
//
// Rodar: node scripts/mutacao-decisao-5.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const CAP = "lib/agency/capacidade-de-producao.ts";
const CAT = "lib/agency/celula/catalogo-ofertavel.ts";
const ALVOS = ["__tests__/celula/catalogo-ofertavel.test.ts"];

const MUTACOES = [
  {
    guarda: "D5-M1 · capacidade desconhecida/ausente é INDISPONÍVEL (fail closed)",
    arquivo: CAP,
    de: "  return Boolean(c && c.ponto !== null);",
    para: "  return true; // MUTAÇÃO: tudo vira disponível — site e branding passam a ser vendáveis",
    espera: "site e branding deixam de ser recusados",
  },
  {
    guarda: "D5-M2 · oferta que não declara capacidade não é vendável",
    arquivo: CAP,
    de: "  if (exigidas.length === 0) {",
    para: "  if (false) { // MUTAÇÃO: oferta sem declaração passa a valer",
    espera: "oferta vazia deixa de ser barrada",
  },
  {
    guarda: "D5-M3 · promessa POR ESCRITO conta, além do que a oferta declarou",
    arquivo: CAP,
    de: "  const doTexto = capacidadesExigidasPeloTexto(...oferta.textos);\n  return [...new Set([...oferta.requer, ...doTexto])];",
    para: "  return [...new Set(oferta.requer)]; // MUTAÇÃO: o texto da proposta deixa de ser conferido",
    espera: "prometer site no texto deixa de exigir a capacidade de site",
  },
  {
    guarda: "D5-M4 · serviço desconhecido é indisponível, nunca 'deve ser novo'",
    arquivo: CAT,
    de: "  if (!servico) {",
    para: "  if (false) { // MUTAÇÃO: serviço inexistente deixa de ser barrado",
    espera: "'consultoria-de-tarot' deixa de ser recusado",
  },
  {
    guarda: "D5-M5 · o freio de decisão supervisionada",
    arquivo: CAT,
    de: "  if (servico.exigeDecisaoSupervisionada && opcoes.modoAutomatico) {",
    para: "  if (false) { // MUTAÇÃO: o que exige humano passa a sair sozinho no automático",
    espera: "edição de vídeo passa a sair no modo automático",
  },
  {
    guarda: "D5-M6 · o item de proposta só NASCE conferido",
    arquivo: CAT,
    de: "  const r = avaliarServico(id, opcoes);\n  if (!r.ofertavel) return { ok: false, motivo: r.motivo, regra: r.regra };",
    para: "  const r = avaliarServico(id, opcoes); // MUTAÇÃO: monta o item mesmo sem capacidade\n  if (!r.ofertavel && false) return { ok: false, motivo: r.motivo, regra: r.regra };",
    espera: "site e branding passam a poder ser MONTADOS em proposta",
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
  "docs/celula-prospeccao/mutacao-decisao-5.json",
  JSON.stringify({ rodadoEm: new Date().toISOString(), base: baseResumo.placar, mutacoes: relatorio }, null, 2),
);

console.log(`\nGuardas mutadas: ${MUTACOES.length} · que NÃO quebraram nenhum teste: ${mutacoesQueNaoQuebraram}`);
process.exit(mutacoesQueNaoQuebraram === 0 ? 0 : 2);
