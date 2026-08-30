#!/usr/bin/env node
// A MUTAÇÃO DA ONDA 1 — afrouxa cada guarda de propósito e prova que o teste
// FICA VERMELHO pelo motivo certo. Guarda sem mutação rodada é promessa
// escrita, e promessa escrita já falhou nesta casa seis vezes em dois dias.
//
// Rodar: node scripts/mutacao-onda-1.mjs
// Ele restaura os arquivos ao fim de CADA mutação, inclusive se algo estourar.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const FUNIL = "lib/agency/celula/funil.ts";
const TRILHA = "lib/agency/celula/trilha.ts";
const ALVOS = [
  "__tests__/celula/funil.test.ts",
  "__tests__/celula/trilha-sobrevive-ao-reinicio.test.ts",
  "__tests__/celula/trilha-e-append-only.test.ts",
];

/** As mutações. Cada uma: nome da guarda, arquivo, o trecho exato a trocar,
 *  o troco, e o que se ESPERA ver quebrar. */
const MUTACOES = [
  {
    guarda: "M1 · a tabela de pares (par não listado é rejeitado)",
    arquivo: FUNIL,
    de: 'return CONJUNTO_DE_PARES.has(`${de}→${para}`);',
    para: "return true; // MUTAÇÃO: tabela desligada, tudo vira transição legal",
    espera: "funil.test.ts — par não permitido passa a ser aceito",
  },
  {
    guarda: "M2 · leitura fail-closed de estado (nunca `as Estado`)",
    arquivo: FUNIL,
    de: "return typeof valor === \"string\" && CONJUNTO_DE_ESTADOS.has(valor) ? (valor as Estado) : null;",
    para: "return (valor as Estado) ?? null; // MUTAÇÃO: o cast cego que a casa proíbe",
    espera: "funil.test.ts — grafia errada/espaço/maiúscula deixa de virar null",
  },
  {
    guarda: "M3 · fail closed do estado ausente (sem linha = 'encontrada')",
    arquivo: FUNIL,
    de: "return estadoDeclarado(valor) ?? ESTADO_INICIAL;",
    para: 'return estadoDeclarado(valor) ?? "contratada"; // MUTAÇÃO: ausência vira "pode avançar"',
    espera: "funil.test.ts e trilha-sobrevive — ausência de informação vira informação",
  },
  {
    guarda: "M4 · justificativa obrigatória (é trava, não campo opcional)",
    arquivo: FUNIL,
    de: 'return typeof valor === "string" && valor.trim().length >= 3;',
    para: "return true; // MUTAÇÃO: transição sem justificativa passa",
    espera: "funil.test.ts e trilha-sobrevive — transição sem justificativa é gravada",
  },
  {
    guarda: "M5 · origem fechada nas 4 (sem default silencioso)",
    arquivo: FUNIL,
    de: 'return typeof valor === "string" && CONJUNTO_DE_ORIGENS.has(valor) ? (valor as OrigemDaTransicao) : null;',
    para: 'return "sistema"; // MUTAÇÃO: o default silencioso — origem inválida vira "o sistema fez"',
    espera: "funil.test.ts — origem fora das 4 deixa de ser rejeitada",
  },
  {
    guarda: "M6 · autor identificado obrigatório",
    arquivo: FUNIL,
    de: 'return typeof valor === "string" && valor.trim().length > 0;',
    para: "return true; // MUTAÇÃO: transição anônima passa",
    espera: "funil.test.ts — autor vazio deixa de ser rejeitado",
  },
  {
    guarda: "M7 · rejeição NÃO grava nada (nem linha, nem trilha)",
    arquivo: TRILHA,
    de: "    if (!veredicto.ok) {\n      return { ok: false, codigo: veredicto.codigo, motivo: veredicto.motivo };\n    }",
    para:
      "    if (!veredicto.ok) {\n" +
      "      // MUTAÇÃO: grava a trilha ANTES de respeitar o veredicto\n" +
      "      await tx.transicaoDoFunil.create({\n" +
      "        data: {\n" +
      "          workspaceId,\n" +
      "          oportunidadeId,\n" +
      "          estadoAnterior: de,\n" +
      '          estadoNovo: String(entrada.para ?? "?"),\n' +
      '          autor: String(entrada.autor ?? "?"),\n' +
      '          origem: String(entrada.origem ?? "?"),\n' +
      '          justificativa: String(entrada.justificativa ?? "?"),\n' +
      "          criadoEm: new Date(),\n" +
      "        },\n" +
      "      });\n" +
      "      return { ok: false, codigo: veredicto.codigo, motivo: veredicto.motivo };\n" +
      "    }",
    espera: "trilha-sobrevive — a rejeição passa a deixar rastro no banco",
  },
  {
    guarda: "M8 · a trilha é append-only (nenhum update/delete/upsert)",
    arquivo: TRILHA,
    de: "    // A LINHA — o estado ATUAL",
    para:
      "    // MUTAÇÃO: a escrita mutante que a varredura tem de pegar\n" +
      "    await tx.transicaoDoFunil.updateMany({\n" +
      "      where: { oportunidadeId },\n" +
      '      data: { justificativa: "reescrita" },\n' +
      "    });\n\n" +
      "    // A LINHA — o estado ATUAL",
    espera: "trilha-e-append-only — a varredura estática acha o método mutante",
  },
  {
    guarda: "M9 · persistência: o estado vem do BANCO, não da memória",
    arquivo: TRILHA,
    de: "  return estadoAtualOuInicial(linha?.estado);",
    para: "  return estadoAtualOuInicial(undefined); // MUTAÇÃO: ignora o banco",
    espera: "trilha-sobrevive — o estado deixa de sobreviver ao reinício",
  },
  {
    // Acrescentada em 30/08 depois que a inspeção do PM achou o cast cru e o
    // `plataforma` consertou: conserto sem mutação rodada é a mesma promessa
    // escrita que a mutação existe para não aceitar.
    guarda: "M10 · leitura de origem do banco não é cast cego",
    arquivo: TRILHA,
    de: "    origem: origemDeclarada(linha.origem),",
    // O `??` da primeira versão desta mutação NÃO disparava para uma string
    // inválida como `'xpto'` (só para null/undefined) — o `qualidade` pegou a
    // imprecisão na narrativa. A mutação certa é o cast cego puro: ele deixa
    // `'xpto'` passar direto como se fosse origem válida.
    para: "    origem: linha.origem as OrigemDaTransicao, // MUTAÇÃO: o cast cego — origem ilegível passa como se fosse válida",
    espera: "trilha-e-append-only — origem corrompida ('xpto') vaza como se fosse origem válida, em vez de virar null",
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
