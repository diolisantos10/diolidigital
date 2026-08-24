// AS PEÇAS, LEGÍVEIS POR QUEM NÃO ABRE BANCO NEM TERMINAL.
//
// ═══ O ACHADO QUE ORIGINOU ESTE ARQUIVO (24/08/2026) ═════════════════════════
//
// O CEO pediu para VER as peças que o piloto produz. A casa tem dois lugares
// onde peça é legível — o portal do cliente (`/portal/access/<token>`, 11 abas)
// e a tela da agência (`/agency/deliverables`) —, e **nenhum dos dois serve
// para o piloto**: a bateria roda contra um SQLite descartável que morre no fim
// da rodada, e o servidor de teste escuta só em 127.0.0.1 do runner.
//
// Ou seja: a agência produzia peça e não havia onde mostrá-la ao dono. E uma
// casa que não consegue mostrar a peça ao dono está a um passo de não conseguir
// mostrá-la ao cliente.
//
// Este módulo é a ponte mais curta que resolve isso sem abrir porta nenhuma
// para o mundo: as peças viram um arquivo de texto que viaja no artefato da
// rodada, na linguagem do dono do negócio — sem id, sem nome de tabela, sem
// JSON. Quem quiser o rastro técnico continua tendo o `placar.json`.

import { prisma } from "@/lib/db/client";

/** O corpo da peça é JSON do especialista; aqui ele vira texto de gente. */
function corpoLegivel(content: string | null): string[] {
  if (!content?.trim()) return ["_(sem corpo gravado)_"];
  let dados: unknown;
  try {
    dados = JSON.parse(content);
  } catch {
    // Não era JSON: é texto, e texto já é legível.
    return [content.trim()];
  }
  const l: string[] = [];
  const o = (dados ?? {}) as Record<string, unknown>;
  const itens = Array.isArray(o.items) ? o.items : [];
  if (typeof o.summary === "string" && o.summary.trim()) l.push(`_${o.summary.trim()}_`, "");

  if (itens.length === 0) return l.length ? l : ["_(a peça não trouxe itens)_"];

  itens.forEach((it, i) => {
    const item = (it ?? {}) as Record<string, unknown>;
    const txt = (k: string): string => (typeof item[k] === "string" ? (item[k] as string).trim() : "");
    const formato = txt("format");
    l.push(`**${i + 1}. ${txt("headline") || "(sem título)"}**${formato ? ` — ${formato}` : ""}`);
    if (txt("pillar")) l.push(`Assunto: ${txt("pillar")}`);
    if (txt("caption")) l.push("", txt("caption"));
    if (txt("note")) l.push("", txt("note"));
    if (txt("cenas")) l.push("", `Telas: ${txt("cenas")}`);
    if (txt("visual")) l.push("", `_Foto sugerida: ${txt("visual")}_`);
    l.push("");
  });
  return l;
}

/**
 * As peças do projeto, prontas para alguém ler.
 *
 * Diz também o que a casa NÃO entregou: entrega sem corpo aparece como tal, em
 * vez de sumir da lista. Sumir faria o documento parecer completo.
 */
export async function pecasEmTexto(projectId: string, nomeDoCliente: string): Promise<string> {
  const entregas = await prisma.deliverable.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: { name: true, type: true, content: true, revisionStatus: true, visibility: true, lastFeedback: true },
  }).catch(() => []);

  const l: string[] = [];
  l.push(`# As peças produzidas para ${nomeDoCliente}`);
  l.push("");
  l.push("> Cliente **fictício**, de teste. Nada aqui foi publicado em lugar nenhum,");
  l.push("> e nenhuma mensagem saiu para pessoa de verdade.");
  l.push("");

  if (entregas.length === 0) {
    l.push("**Nenhuma peça foi produzida nesta rodada.**");
    return l.join("\n");
  }

  l.push(`${entregas.length} entrega(s):`);
  l.push("");
  for (const e of entregas) {
    l.push(`---`, "", `## ${e.name}`);
    const revisada = e.revisionStatus === "quality_ok";
    l.push("", revisada ? "_Revisada pela Qualidade._" : `_Revisão: ${e.revisionStatus ?? "não auditada"}._`);
    // ── O PARECER DA QUALIDADE, QUANDO ELA BARROU ──────────────────────────
    // `apresentar()` recusa o pacote inteiro enquanto houver peça em
    // `quality_flag`, e sem o parecer aqui a única forma de saber POR QUÊ é
    // abrir o banco. Foi o que travou o piloto em 24/08/2026 — e ler o motivo
    // é a diferença entre consertar o produtor e adivinhar.
    if (e.revisionStatus === "quality_flag" && e.lastFeedback?.trim()) {
      l.push("", `> ⚠️ **A Qualidade barrou:** ${e.lastFeedback.trim()}`);
    }
    // O cliente só vê o que foi compartilhado — dizer isso evita a leitura
    // errada de que tudo que está aqui chegou a ele.
    l.push(e.visibility === "compartilhado" ? "_Chegou ao cliente._" : `_Não chegou ao cliente (${e.visibility})._`);
    l.push("");
    l.push(...corpoLegivel(e.content));
  }
  return l.join("\n");
}
