// pacote-travado.ts — o que a agência faz quando ELA MESMA reprova o próprio trabalho.
//
// Descoberto rodando o primeiro projeto de verdade em produção (01/08/2026): a
// Qualidade barrou 2 de 6 entregas, o pacote NÃO foi apresentado — o freio
// funcionou — e aí o projeto **ficou parado para sempre**. O motor é idempotente:
// re-rodar pula quem já produziu, então a entrega reprovada nunca era refeita.
// Nenhuma tela mostrava o bloqueio. Vivo no papel, morto na prática.
//
// Decisão do CEO em 01/08/2026: **refaz sozinha até 2 tentativas, depois chama.**
// É a definição de automático que serve — resolve o caso comum sem gente e só
// escala o caso raro. As outras duas saídas foram recusadas com motivo:
// chamar direto põe o CEO no caminho de todo projeto (com 5 clientes, é ele
// olhando pacote todo dia); apresentar com ressalva anula o único freio da casa.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";

/** Quantas vezes o especialista refaz antes de o pacote virar problema do CEO.
 *  Duas: se o modelo errou duas vezes COM a crítica na mão, a terceira
 *  dificilmente resolve — passa a ser dinheiro de IA queimado. */
export const MAX_TENTATIVAS_DE_REFAZER = 2;

export interface ResultadoDoDestravamento {
  projectId: string;
  /** Entregas que foram refeitas e passaram nesta rodada. */
  corrigidas: string[];
  /** Entregas que continuam reprovadas depois do teto de tentativas. */
  persistentes: string[];
  /** O pacote virou problema do CEO nesta rodada? */
  escalado: boolean;
}

/**
 * Tenta destravar UM pacote barrado pela Qualidade.
 *
 * Refaz cada entrega reprovada com o parecer da Qualidade em mãos. Se todas
 * passarem, quem apresenta é o fluxo normal — este módulo não apresenta nada,
 * só devolve as peças ao estado "boa". Se alguma resistir ao teto de tentativas,
 * o pacote é escalado: vira evento no banco, para aparecer no painel.
 */
export async function destravarPacote(projectId: string): Promise<ResultadoDoDestravamento> {
  const saida: ResultadoDoDestravamento = { projectId, corrigidas: [], persistentes: [], escalado: false };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true },
  });
  if (!projeto || projeto.presentedAt) return saida; // já apresentado: nada a destravar

  const reprovadas = await prisma.deliverable.findMany({
    where: { projectId, revisionStatus: "quality_flag" },
    select: { id: true, name: true, content: true, ownerAgentId: true, lastFeedback: true, version: true },
  });
  if (reprovadas.length === 0) return saida;

  const req = projeto.clientRequestId
    ? await prisma.clientRequestDb.findUnique({ where: { id: projeto.clientRequestId }, select: { businessName: true } })
    : null;
  const negocio = req?.businessName ?? "o cliente";

  for (const entrega of reprovadas) {
    // `version` conta quantas versões desta peça já existiram. Usar o campo que
    // já é gravado evita inventar um contador paralelo que um dia diverge.
    if (entrega.version > MAX_TENTATIVAS_DE_REFAZER) {
      saida.persistentes.push(entrega.name);
      continue;
    }

    const esp = TODOS_OS_ESPECIALISTAS.find((e) => e.id === entrega.ownerAgentId);
    const quemFez = esp ? `${esp.departamentoLabel} · ${esp.label}` : entrega.name;

    const refeito = await generate({
      system: `Você é o especialista de ${esp?.label ?? "produção"} de uma agência de marketing brasileira. A Qualidade REPROVOU sua entrega. Refaça inteira, corrigindo exatamente o que foi apontado — não defenda a versão anterior, não repita o mesmo erro. Mantenha o mesmo formato. Responda SOMENTE com JSON válido.`,
      user: [
        `NEGÓCIO: ${negocio}`,
        `ENTREGA REPROVADA — "${entrega.name}":`,
        entrega.content ?? "",
        "",
        `O QUE A QUALIDADE APONTOU: ${entrega.lastFeedback ?? "qualidade insuficiente"}`,
        "",
        'Refaça corrigindo exatamente esses pontos. Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>" — nunca invente para preencher.',
        'Responda JSON: {"title":"...","summary":"1 frase","items":[{"headline":"...","note":"...","caption":"...","visual":"...","direction":"...","audience":"...","cta":"..."}]}',
      ].join("\n"),
      maxTokens: 1800,
      workspaceId: projeto.workspaceId,
      preferredProvider: esp?.provedor ?? "claude",
    });

    if (!refeito.ok) {
      // IA fora do ar não é reprovação: a peça fica como está e a próxima
      // passada do despertador tenta de novo. Contar isto como tentativa
      // gastaria o teto por um problema que não é do modelo nem da peça.
      saida.persistentes.push(entrega.name);
      continue;
    }

    const dados = refeito.data as Record<string, unknown>;
    const novoTexto = typeof dados.summary === "string" ? String(dados.summary) : "";
    const itens = Array.isArray(dados.items) ? dados.items : [];
    if (itens.length === 0 && novoTexto.length < 40) {
      saida.persistentes.push(entrega.name);
      continue;
    }

    await prisma.deliverable.update({
      where: { id: entrega.id },
      data: {
        name: typeof dados.title === "string" && dados.title.trim() ? dados.title : entrega.name,
        content: renderizar(dados),
        version: { increment: 1 },
        // Volta para "boa" — a próxima auditoria decide de novo. Marcar como
        // aprovada aqui seria a produção se auto-absolvendo.
        revisionStatus: "quality_ok",
        lastFeedback: `Refeita após reprovação da Qualidade: ${entrega.lastFeedback ?? ""}`.slice(0, 500),
      },
    });
    saida.corrigidas.push(quemFez);
  }

  // Sobrou algo que resistiu ao teto? O pacote deixa de ser problema da máquina
  // e passa a ser decisão do Diretor. Sem este registro, o travamento seria
  // invisível — que foi exatamente o buraco encontrado no primeiro projeto.
  if (saida.persistentes.length > 0) {
    saida.escalado = true;
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId,
        clientId: projeto.clientId,
        type: "pacote_travado_escalado",
        message: `${negocio}: ${saida.persistentes.length} entrega(s) seguem reprovadas após ${MAX_TENTATIVAS_DE_REFAZER} tentativas — ${saida.persistentes.join("; ")}. Precisa de decisão.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort: o registro não pode derrubar o destravamento */ });
  }

  return saida;
}

/** Mesmo formato de texto que o motor usa — o cliente não pode receber duas
 *  aparências diferentes da mesma peça só porque uma foi refeita. */
function renderizar(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const linhas: string[] = [];
  if (typeof data.summary === "string") linhas.push(data.summary, "");
  items.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const head = (it.headline ?? it.angle ?? it.direction ?? `Item ${i + 1}`) as string;
    linhas.push(`**${i + 1}. ${head}**`);
    for (const [k, label] of [["format", "Formato"], ["caption", "Legenda"], ["visual", "Visual"], ["direction", "Direção"], ["palette", "Paleta"], ["cta", "CTA"], ["audience", "Público"], ["note", "Obs"]] as const) {
      if (typeof it[k] === "string" && (it[k] as string).trim()) linhas.push(`- ${label}: ${it[k]}`);
    }
    linhas.push("");
  });
  return linhas.join("\n").trim();
}

/** Os pacotes que estão travados agora — o que o painel do Diretor precisa ver. */
export async function pacotesTravados(workspaceId?: string) {
  const projetos = await prisma.project.findMany({
    where: {
      presentedAt: null,
      executionStatus: "done",
      ...(workspaceId ? { workspaceId } : {}),
      deliverables: { some: { revisionStatus: "quality_flag" } },
    },
    select: {
      id: true, name: true, clientId: true, updatedAt: true,
      deliverables: {
        where: { revisionStatus: "quality_flag" },
        select: { id: true, name: true, lastFeedback: true, version: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  return projetos.map((p) => ({
    projectId: p.id,
    projeto: p.name,
    clientId: p.clientId,
    desde: p.updatedAt,
    reprovadas: p.deliverables,
    /** Já esgotou as tentativas? Então está esperando gente, não a máquina. */
    esperandoDecisao: p.deliverables.some((d) => d.version > MAX_TENTATIVAS_DE_REFAZER),
  }));
}
