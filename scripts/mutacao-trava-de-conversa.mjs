#!/usr/bin/env node
// A MUTAÇÃO DA TRAVA DE CONVERSA COM FECHADURA.
//
// A primeira mutação é a que justifica o teste inteiro: ela troca a reserva
// atômica pela implementação ERRADA — "ler, verificar, gravar" — que é a que
// qualquer um escreveria e que passa num teste sequencial. Se o teste de
// concorrência não ficar vermelho com ela, o teste não estava provando nada.
//
// Rodar: node scripts/mutacao-trava-de-conversa.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const P = "lib/agency/celula/mensagens/porta-da-conversa-no-banco.ts";
const ALVOS = ["__tests__/celula/trava-de-conversa-no-banco.test.ts"];

const MUTACOES = [
  {
    guarda: "TC-M1 · a reserva é ATÔMICA (não 'ler, verificar, gravar')",
    arquivo: P,
    de: "      try {\n        await db.travaDaConversaDaCelula.create({\n          data: { conversaId, agente, expiraEm: limite },\n        });\n        return true;\n      } catch {",
    para:
      "      // MUTAÇÃO: a implementação que qualquer um escreveria — lê, vê que está\n" +
      "      // livre, e só então grava. Entre as duas coisas cabe o outro agente inteiro.\n" +
      "      {\n" +
      "        const existente = await db.travaDaConversaDaCelula.findUnique({ where: { conversaId } });\n" +
      "        if (!existente) {\n" +
      "          await db.travaDaConversaDaCelula.upsert({\n" +
      "            where: { conversaId },\n" +
      "            create: { conversaId, agente, expiraEm: limite },\n" +
      "            update: { agente, expiraEm: limite },\n" +
      "          });\n" +
      "          return true;\n" +
      "        }\n" +
      "      }\n" +
      "      if (false) {",
    espera: "os 10 agentes simultâneos deixam de ter UM só vencedor",
  },
  {
    guarda: "TC-M2 · só se toma trava VENCIDA (a condição está no WHERE)",
    arquivo: P,
    de: "        where: { conversaId, expiraEm: { lt: agora() } },",
    para: "        where: { conversaId }, // MUTAÇÃO: toma a trava mesmo viva",
    espera: "bruno passa a roubar a trava viva de ana",
  },
  {
    guarda: "TC-M3 · liberar só solta o que é seu",
    arquivo: P,
    de: '      await db.travaDaConversaDaCelula.deleteMany({ where: { conversaId, agente } });',
    para: "      await db.travaDaConversaDaCelula.deleteMany({ where: { conversaId } }); // MUTAÇÃO: qualquer um libera a trava de qualquer um",
    espera: "bruno passa a destravar a conversa de ana",
  },
  {
    guarda: "TC-M4 · renovar é só do dono",
    arquivo: P,
    de: "        where: { conversaId, agente },\n        data: { expiraEm: limite },",
    para: "        where: { conversaId }, // MUTAÇÃO: renova a trava de outro agente\n        data: { agente, expiraEm: limite },",
    espera: "bruno passa a assumir a trava viva de ana pela via da renovação",
  },
  {
    guarda: "TC-M5 · prazo ilegível é recusado (trava sem prazo é trava eterna)",
    arquivo: P,
    de: "      if (Number.isNaN(limite.getTime())) return false;",
    para: "      // MUTAÇÃO: aceita prazo ilegível",
    espera: "expiraEm 'nao-e-data' passa a criar trava",
  },
  {
    guarda: "TC-M6 · estado corrompido vira null, nunca remendo com defaults",
    arquivo: P,
    de: "  if (perguntas === null || modelos === null) return null;\n  if (typeof o.etapa !== \"string\" || o.etapa === \"\") return null;",
    para:
      "  // MUTAÇÃO: remenda o estado ilegível com defaults — e aí o motor decide\n" +
      "  // 'esta pergunta ainda não foi feita' sobre um histórico que não foi lido\n" +
      "  const perguntasR = perguntas ?? [];\n" +
      "  const modelosR = modelos ?? [];\n" +
      "  return {\n" +
      "    conversaId,\n" +
      "    ultimaRecebida: null,\n" +
      "    ultimaEnviada: null,\n" +
      "    agenteResponsavel: null,\n" +
      '    etapa: typeof o.etapa === "string" && o.etapa !== "" ? o.etapa : "encontrada",\n' +
      "    perguntasJaFeitas: perguntasR,\n" +
      "    respostasRecebidas: {},\n" +
      "    arquivos: [],\n" +
      "    proximaAcao: null,\n" +
      "    modelosJaUsados: modelosR,\n" +
      "  };",
    espera: "estado corrompido passa a virar estado válido vazio",
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
  "docs/celula-prospeccao/mutacao-trava-de-conversa.json",
  JSON.stringify({ rodadoEm: new Date().toISOString(), base: baseResumo.placar, mutacoes: relatorio }, null, 2),
);

console.log(`\nGuardas mutadas: ${MUTACOES.length} · que NÃO quebraram nenhum teste: ${mutacoesQueNaoQuebraram}`);
process.exit(mutacoesQueNaoQuebraram === 0 ? 0 : 2);
