// A CADEIA DE COMANDO — derivada do manifesto, nunca escrita à mão.
//
// ── A ORDEM DO CEO (25/08/2026), na íntegra do que importa aqui ─────────────
//
//   "O PM não foi extinto: foi promovido. Ele virou o GERENTE GERAL da
//    agência. Ele manda nos gerentes, nunca nos agentes deles. Cada
//    departamento é um mundo fechado que sobe pelo seu gerente."
//
// ── POR QUE ISTO PRECISOU VIRAR CÓDIGO ──────────────────────────────────────
//
// A reforma de 16/08/2026 criou os 12 gerentes e a ficha `gerente-geral`, e o
// teste `__tests__/v2/quadro-de-hierarquia.test.ts` passou a reprovar ficha
// que não desenhasse a cadeia. Mas o quadro estava em MARKDOWN. Medido em
// 25/08/2026: `gerente-geral` tinha ZERO chamadores em `app/` e `lib/` — o
// catálogo tinha o cargo e o caminho de execução não passava por ele. Era
// hierarquia declarada, não hierarquia imposta: exatamente o guardrail 4 desta
// casa ("prompt é aviso; código é trava") sendo violado por omissão.
//
// Este módulo é a trava. Ele não inventa nenhuma hierarquia: LÊ o manifesto,
// onde o gerente de cada departamento é, por construção, o PRIMEIRO agente da
// lista — a mesma regra que o teste de quadro de hierarquia já usava. Uma
// fonte só; departamento novo entra no manifesto e a cadeia cresce sozinha.

import manifesto from "@/docs/arquitetura-operacional-v2/architecture.manifest.json";
import { funcaoV2, departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

/** O topo da operação. Reporta ao Diretor; manda nos 12 gerentes. */
export const GERENTE_GERAL = "gerente-geral";

/** departamentoId canônico → funcaoId do gerente. O primeiro do manifesto. */
const GERENTE_POR_DEPARTAMENTO: ReadonlyMap<string, string> = new Map(
  manifesto.departments.map((d) => [d.id, d.agents[0]!] as const),
);

/** funcaoId do gerente → departamentoId que ele responde. */
const DEPARTAMENTO_POR_GERENTE: ReadonlyMap<string, string> = new Map(
  [...GERENTE_POR_DEPARTAMENTO].map(([dep, ger]) => [ger, dep] as const),
);

/** Os 12 gerentes de departamento (o Gerente Geral é um deles, no PM). */
export const GERENTES: readonly string[] = [...GERENTE_POR_DEPARTAMENTO.values()];

/** Quem manda neste departamento. `undefined` = departamento desconhecido. */
export function gerenteDe(departamentoId: string): string | undefined {
  return GERENTE_POR_DEPARTAMENTO.get(departamentoId);
}

/** Este cargo é gerente de algum departamento? */
export function ehGerente(funcaoId: string): boolean {
  return DEPARTAMENTO_POR_GERENTE.has(funcaoId);
}

/** De que departamento este gerente responde. */
export function departamentoDoGerente(funcaoId: string): string | undefined {
  return DEPARTAMENTO_POR_GERENTE.get(funcaoId);
}

/**
 * Este cargo é agente de LINHA — isto é, existe no catálogo e não é gerente?
 *
 * Função inexistente devolve `false` aqui de propósito: "não é agente de
 * linha" e "não existe" são fatos diferentes, e quem chama trata os dois
 * separado. Ausência de informação não é informação.
 */
export function ehAgenteDeLinha(funcaoId: string): boolean {
  return Boolean(funcaoV2(funcaoId)) && !ehGerente(funcaoId);
}

export function existeDepartamentoCanonico(id: string): boolean {
  return Boolean(departamentoV2(id));
}
