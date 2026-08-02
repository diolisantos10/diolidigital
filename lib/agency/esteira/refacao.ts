// refacao.ts — O CLIENTE PEDIU MUDANÇA. É a hora mais perigosa da relação.
//
// O buraco: o portal tinha os três botões — aprovar, pedir revisão, reprovar —
// e SÓ o de proposta fazia alguma coisa. Quando a aprovação era de uma ENTREGA,
// o clique do cliente gravava um status no banco e acabava ali. Nada era
// refeito, ninguém era avisado, e do lado dele a tela dizia "revisão
// solicitada" para sempre. É a pior forma de falhar que existe: o cliente
// acredita que pediu, a agência não sabe que foi pedido, e o silêncio é lido
// como descaso.
//
// O que este arquivo garante: pedido de mudança do cliente é refeito na hora,
// COM AS PALAVRAS DELE na mão do especialista, e o cliente é avisado do que
// mudou. Sem gente no meio.
//
// O teto existe pelo motivo oposto do da Qualidade. Lá, o teto protege o
// dinheiro de IA. Aqui, o teto protege a RELAÇÃO: se o cliente pediu a mesma
// peça três vezes, o problema não é a peça — é um desentendimento sobre o que
// ele quer, e mais uma rodada de IA só aumenta a frustração dele. Na terceira,
// vira gente.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";

/** Quantas vezes a máquina refaz por pedido do CLIENTE antes de virar gente. */
export const MAX_REFACOES_DO_CLIENTE = 2;

export interface RefacaoFeita {
  /** Entregas efetivamente refeitas, pelo nome. */
  refeitas: string[];
  /** Virou assunto de gente — e por quê. */
  escalado: boolean;
  motivo?: string;
  avisouCliente: boolean;
}

/**
 * Refaz o que o cliente pediu para mudar.
 *
 * `department` vem da `ApprovalRequest`: é a casa que produziu a peça. Refaz as
 * entregas daquele departamento no ciclo corrente — não o pacote inteiro. O
 * cliente que reclamou do texto do social não quer o logo dele redesenhado.
 */
export async function refazerPorPedidoDoCliente(input: {
  clientRequestId: string;
  department: string;
  comentario?: string;
}): Promise<RefacaoFeita> {
  const saida: RefacaoFeita = { refeitas: [], escalado: false, avisouCliente: false };

  const projeto = await prisma.project.findFirst({
    where: { clientRequestId: input.clientRequestId },
    select: {
      id: true, workspaceId: true, clientId: true, clientRequestId: true,
      client: { select: { name: true, phone: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!projeto) return { ...saida, escalado: true, motivo: "projeto não encontrado" };

  const req = await prisma.clientRequestDb.findUnique({
    where: { id: input.clientRequestId },
    select: { businessName: true },
  }).catch(() => null);
  const negocio = req?.businessName ?? projeto.client?.name ?? "o cliente";

  // Um pedido sem palavras é o caso mais comum e o mais perigoso: refazer no
  // escuro produz outra peça igualmente errada e queima uma das tentativas.
  // Perguntar é mais rápido e mais barato do que adivinhar.
  const comentario = input.comentario?.trim();
  if (!comentario) {
    const avisou = await escreverNoPortal(input.clientRequestId,
      "Recebi seu pedido de ajuste! Só me conta em uma frase o que você quer diferente — assim eu refaço já certo, sem te fazer pedir de novo. 💛");
    return { ...saida, escalado: false, avisouCliente: avisou, motivo: "pedido sem descrição — perguntei ao cliente" };
  }

  const cicloAtual = await prisma.cycle.findFirst({
    where: { projectId: projeto.id, status: { in: ["aberto", "entregue"] } },
    orderBy: { reference: "desc" },
    select: { id: true },
  }).catch(() => null);

  // Quais especialistas moram no departamento que o cliente apontou.
  const idsDoDepartamento = TODOS_OS_ESPECIALISTAS
    .filter((e) => e.departamentoId === input.department)
    .map((e) => e.id);

  const alvos = await prisma.deliverable.findMany({
    where: {
      projectId: projeto.id,
      ...(cicloAtual ? { cycleId: cicloAtual.id } : {}),
      ...(idsDoDepartamento.length > 0 ? { ownerAgentId: { in: idsDoDepartamento } } : {}),
    },
    select: { id: true, name: true, content: true, ownerAgentId: true, version: true, clientFeedback: true },
  });

  if (alvos.length === 0) {
    // Sem saber que peça mexer, a máquina não deve chutar — mas o cliente NÃO
    // pode ficar no silêncio, que era exatamente o bug.
    await escalar(projeto, negocio, `pedido de mudança do cliente sem entrega correspondente (departamento "${input.department}")`, comentario);
    const avisou = await escreverNoPortal(input.clientRequestId,
      "Recebi seu pedido de ajuste e já passei para a equipe olhar. Te retorno em breve com a mudança feita. 💛");
    return { ...saida, escalado: true, motivo: "sem entrega correspondente", avisouCliente: avisou };
  }

  const verdade: VerdadeDoCliente = {
    businessName: negocio,
    telefones: [projeto.client?.phone].filter((v): v is string => !!v),
    emails: [projeto.client?.email].filter((v): v is string => !!v),
    servicos: [], valores: [],
  };

  for (const entrega of alvos) {
    if (entrega.version > MAX_REFACOES_DO_CLIENTE) {
      saida.escalado = true;
      saida.motivo = `"${entrega.name}" já foi refeita ${entrega.version - 1}x a pedido do cliente`;
      continue;
    }

    const esp = TODOS_OS_ESPECIALISTAS.find((e) => e.id === entrega.ownerAgentId);
    const r = await generate({
      system:
        `Você é o especialista de ${esp?.label ?? "produção"} de uma agência de marketing brasileira. ` +
        "O CLIENTE — não a Qualidade, o cliente que paga — pediu mudança na sua entrega. " +
        "O pedido dele é a instrução final: atenda o que ele pediu, sem discutir e sem defender a versão anterior. " +
        "Mude o que ele apontou e preserve o resto — refazer do zero o que ele não reclamou faz o cliente sentir que perdeu o que já tinha aprovado. " +
        "Responda SOMENTE com JSON válido, no mesmo formato.",
      user: [
        `NEGÓCIO: ${negocio}`,
        `ENTREGA ATUAL — "${entrega.name}":`,
        entrega.content ?? "",
        "",
        `O QUE O CLIENTE PEDIU, com as palavras dele: "${comentario}"`,
        entrega.clientFeedback ? `\nELE JÁ TINHA PEDIDO ANTES: "${entrega.clientFeedback}" — não repita o erro anterior.` : "",
        "",
        'Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>" — nunca invente para preencher.',
        'Responda JSON: {"title":"...","summary":"1 frase","items":[{"headline":"...","note":"...","caption":"...","visual":"...","direction":"...","audience":"...","cta":"..."}]}',
      ].join("\n"),
      maxTokens: 1800,
      workspaceId: projeto.workspaceId,
      preferredProvider: esp?.provedor ?? "claude",
    });

    if (!r.ok) {
      // IA fora do ar não gasta tentativa — o problema não é a peça.
      saida.escalado = true;
      saida.motivo = "não consegui refazer agora (provedor de IA indisponível)";
      continue;
    }

    const dados = r.data as Record<string, unknown>;
    const corpo = renderizar(dados);
    if (corpo.length < 60) {
      saida.escalado = true;
      saida.motivo = "a refação saiu vazia";
      continue;
    }

    // O piso vale igual: peça refeita a pedido do cliente vai direto ao cliente.
    const piso = conferirPisoDeVerdade(corpo, verdade);
    if (!piso.aprovado) {
      saida.escalado = true;
      saida.motivo = `a refação inventou dado: ${resumirViolacoes(piso.violacoes)}`;
      continue;
    }

    await prisma.deliverable.update({
      where: { id: entrega.id },
      data: {
        name: typeof dados.title === "string" && dados.title.trim() ? dados.title : entrega.name,
        content: corpo,
        version: { increment: 1 },
        revisionStatus: "quality_ok",
        clientFeedback: comentario.slice(0, 500),
        lastFeedback: `Refeita a pedido do cliente: ${comentario}`.slice(0, 500),
      },
    });
    saida.refeitas.push(entrega.name);
  }

  if (saida.refeitas.length > 0) {
    // A aprovação volta a ficar pendente: a peça mudou, e o "sim" anterior não
    // vale para uma versão que o cliente ainda não viu.
    await prisma.approvalRequest.updateMany({
      where: { clientRequestId: input.clientRequestId, department: input.department },
      data: { status: "pending", clientVisible: true, reviewedAt: null, reviewedBy: null },
    }).catch(() => { /* best-effort */ });

    saida.avisouCliente = await escreverNoPortal(input.clientRequestId, [
      "Refiz o que você pediu! ✏️",
      "",
      ...saida.refeitas.map((n) => `• ${n}`),
      "",
      `Ajustei com base no que você falou: "${comentario.slice(0, 200)}"`,
      "Dá uma olhada na aba de aprovações e me diz se ficou como você queria.",
    ].join("\n"));
  }

  if (saida.escalado) {
    await escalar(projeto, negocio, saida.motivo ?? "refação não concluída", comentario);
    if (saida.refeitas.length === 0) {
      saida.avisouCliente = await escreverNoPortal(input.clientRequestId,
        "Recebi seu pedido e já estou olhando com atenção. Te retorno em breve com o ajuste. 💛");
    }
  }

  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

async function escreverNoPortal(clientRequestId: string, corpo: string): Promise<boolean> {
  try {
    await prisma.portalMessage.create({
      data: { clientRequestId, authorRole: "team", authorName: "Gerente de projeto", body: corpo, readByTeam: true },
    });
    return true;
  } catch {
    return false;
  }
}

async function escalar(
  projeto: { id: string; workspaceId: string; clientId: string | null },
  negocio: string,
  motivo: string,
  comentario: string,
): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      workspaceId: projeto.workspaceId,
      projectId: projeto.id,
      clientId: projeto.clientId,
      type: "refacao_escalada",
      message: `${negocio} pediu mudança e a máquina não resolveu: ${motivo}. O que ele pediu: "${comentario}"`.slice(0, 900),
    },
  }).catch(() => { /* best-effort */ });
}

/** Mesmo formato de texto do motor — o cliente não pode receber duas aparências
 *  diferentes da mesma peça só porque uma foi refeita. */
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
