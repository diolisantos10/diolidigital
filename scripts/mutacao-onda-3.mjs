#!/usr/bin/env node
// A MUTAÇÃO DA ONDA 3 — despacho D2 (agente: `seguranca`). Afrouxa cada
// guarda do catálogo de propósito, exige VERMELHO no teste esperado, e
// restaura o arquivo (byte a byte, sha256 antes × depois) mesmo se algo
// estourar. Mesma disciplina de `scripts/mutacao-onda-1.mjs` — leia aquele
// script antes de mexer neste.
//
// Rodar:  node scripts/mutacao-onda-3.mjs [catalogo] [saida]
//   catalogo — default: docs/celula-prospeccao/mutacao-onda-3-catalogo.json
//   saida    — default: docs/celula-prospeccao/mutacao-onda-3.json
//
// ── ⚠️ POR QUE A LINHA DE BASE NÃO RODA A SUÍTE INTEIRA ────────────────────
// Há 3 testes VERMELHOS de OUTRA frente que escreve em paralelo neste mesmo
// worktree (`__tests__/celula/trava-de-conversa.test.ts`,
// `__tests__/celula/trava-de-promessa.test.ts` — ver
// `docs/celula-prospeccao/despachos/ONDA-3-COMUM.md`). Rodar `npx vitest run`
// sem alvo abortaria a linha de base por um defeito que não é desta onda. Os
// 10 arquivos de teste de "mensagens" (`biblioteca-de-mensagens`,
// `objecoes`, `perguntas-por-servico`, `frases-genericas`,
// `anti-generico`, `entrada-hostil`, `fronteira-de-palavra-acentuada`,
// `os-22-textos-do-ceo`, `placeholder-de-colchete`, `proxima-mensagem`,
// `acompanhamento-unico`) também ficam de fora — pertencem a uma segunda
// frente paralela que este despacho foi proibido de tocar.
//
// A ficha D2 fala em "os 10 arquivos de teste da Onda 3". Contando só os
// arquivos que pertencem de fato às três frentes que produziram esta onda —
// A (arbitragens do funil), B/B2 (ponte de arquivos) e C (fila de exceções)
// — chegamos a 12, não 10 (a lista abaixo cita a frente de cada um). Isto
// está registrado aqui, não escondido: se a ficha quis dizer um subconjunto
// de 10, esta lista de linha de base é MAIS ampla, não mais estreita — não
// deixa nenhuma guarda do catálogo sem verificação prévia de "verde".
const ALVOS_DA_LINHA_DE_BASE = [
  "__tests__/celula/funil.test.ts", // A
  "__tests__/celula/ponte-destinatario.test.ts", // B
  "__tests__/celula/ponte-endereco-interno.test.ts", // B
  "__tests__/celula/ponte-quarentena.test.ts", // B
  "__tests__/celula/ponte-quarentena-sem-byte-cru.test.ts", // B2
  "__tests__/celula/ponte-versoes.test.ts", // B
  "__tests__/celula/ponte-caminho-interno-derivado.test.ts", // B2
  "__tests__/celula/ponte-retencao.test.ts", // B2
  "__tests__/celula/ponte-download.test.ts", // B2
  "__tests__/celula/excecoes-fila.test.ts", // C
  "__tests__/celula/excecoes-interrompe-automacao.test.ts", // C
  "__tests__/celula/excecoes-vencida-grita.test.ts", // C
];

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const CATALOGO_PADRAO = "docs/celula-prospeccao/mutacao-onda-3-catalogo.json";
const SAIDA_PADRAO = "docs/celula-prospeccao/mutacao-onda-3.json";

const caminhoCatalogo = process.argv[2] ?? CATALOGO_PADRAO;
const caminhoSaida = process.argv[3] ?? SAIDA_PADRAO;

/** @type {Array<{guarda: string, arquivo: string, teste: string, de: string, para: string, espera: string}>} */
const MUTACOES = JSON.parse(readFileSync(caminhoCatalogo, "utf-8"));

function sha256De(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

function rodarVitest(alvos) {
  try {
    const saida = execSync(`npx vitest run ${alvos} 2>&1`, {
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

// ── A LINHA DE BASE: verde antes de qualquer mutação ────────────────────────
console.log("── LINHA DE BASE (só os arquivos de teste da Onda 3, ver comentário no topo) ──");
const base = rodarVitest(ALVOS_DA_LINHA_DE_BASE.join(" "));
const baseResumo = resumo(base.saida);
console.log(`base: ${base.vermelho ? "VERMELHO ⛔" : "VERDE ✅"} — ${baseResumo.placar}`);
if (base.vermelho) {
  console.error("A linha de base já está vermelha. Mutação sobre suíte vermelha não prova nada. Abortando.");
  console.error(baseResumo.falhas.join("\n"));
  process.exit(1);
}

const relatorio = [];
let problemas = 0;

for (const m of MUTACOES) {
  const original = readFileSync(m.arquivo, "utf-8");
  const ocorrencias = original.split(m.de).length - 1;

  if (ocorrencias !== 1) {
    console.error(
      `⛔ ${m.guarda}: o trecho-alvo aparece ${ocorrencias}x em ${m.arquivo} (esperado exatamente 1x). Guarda ABORTADA, script segue para a próxima.`,
    );
    relatorio.push({
      guarda: m.guarda,
      arquivo: m.arquivo,
      teste: m.teste,
      estado: "ALVO_NAO_ENCONTRADO",
      porqueCaiu: [],
      contagem: ocorrencias,
      restaurado: true,
    });
    problemas++;
    continue;
  }

  const hashOriginal = sha256De(m.arquivo);
  const mutado = original.replace(m.de, m.para);
  // `replace` sem `assert` não é conserto, é esperança: confere o ARQUIVO.
  if (mutado === original || !mutado.includes(m.para)) {
    throw new Error(`${m.guarda}: a substituição não alterou ${m.arquivo} como esperado.`);
  }
  writeFileSync(m.arquivo, mutado);
  const conferidoNoDisco = readFileSync(m.arquivo, "utf-8");
  if (!conferidoNoDisco.includes(m.para)) {
    writeFileSync(m.arquivo, original);
    throw new Error(`${m.guarda}: o disco não recebeu a mutação em ${m.arquivo} — restaurado antes de abortar.`);
  }

  let resultado;
  let restaurado = true;
  try {
    resultado = rodarVitest(m.teste);
  } finally {
    // Restaura SEMPRE, inclusive se `rodarVitest` estourar de um jeito que
    // `execSync` não captura (ex.: sinal). Confere byte a byte via sha256.
    writeFileSync(m.arquivo, original);
    const depois = readFileSync(m.arquivo, "utf-8");
    const hashDepois = sha256De(m.arquivo);
    restaurado = depois === original && hashDepois === hashOriginal;
    if (!restaurado) {
      throw new Error(
        `${m.guarda}: RESTAURAÇÃO FALHOU em ${m.arquivo} (sha256 antes ${hashOriginal} × depois ${hashDepois}). PARE E CONFIRA O ARQUIVO À MÃO.`,
      );
    }
  }

  const res = resumo(resultado.saida);
  const estado = resultado.vermelho ? "VERMELHO_COMO_ESPERADO" : "CONTINUOU_VERDE_A_GUARDA_E_DECORATIVA";
  console.log(`${resultado.vermelho ? "✅" : "⛔"} ${estado} — ${m.guarda} — ${res.placar}`);
  if (!resultado.vermelho) problemas++;

  relatorio.push({
    guarda: m.guarda,
    arquivo: m.arquivo,
    teste: m.teste,
    estado,
    porqueCaiu: res.falhas,
    contagem: ocorrencias,
    restaurado,
  });
}

writeFileSync(
  caminhoSaida,
  JSON.stringify(
    {
      rodadoEm: new Date().toISOString(),
      catalogo: caminhoCatalogo,
      alvosDaLinhaDeBase: ALVOS_DA_LINHA_DE_BASE,
      base: baseResumo.placar,
      mutacoes: relatorio,
    },
    null,
    2,
  ),
);

console.log(
  `\nGuardas no catálogo: ${MUTACOES.length} · com problema (seguiu verde, ou alvo não encontrado): ${problemas}`,
);
// Guarda que continua verde é gravada com todas as letras, nunca escondida —
// e faz o script sair não-zero, para o portão do CI recusar também.
process.exit(problemas === 0 ? 0 : 2);
