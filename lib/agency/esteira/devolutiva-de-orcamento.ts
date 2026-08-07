// DEVOLVER O ORÇAMENTO COM APONTAMENTOS — a terceira saída que faltava.
//
// ── A HISTÓRIA QUE PRODUZIU ESTE ARQUIVO (CEO, 06/08/2026) ───────────────────
//
// "eu não aprovei os carrosséis, mandei uma devolutiva do que tem que ser
// feito, e estou esperando até agora."
//
// O cartão de orçamento do portal tinha DUAS saídas: aceitar e recusar. A
// terceira — a que mais acontece na vida real — não existia: *aceito, mas
// ajuste o prazo* · *o escopo está maior do que pedi* · *o preço não fecha*.
// Sem lugar para isso, a devolutiva dele foi para uma conversa, e o pedido
// ficou DOIS DIAS parado sem dono.
//
// ── O ERRO QUE ESTE ARQUIVO EXISTE PARA NÃO COMETER ──────────────────────────
//
// Gravar o texto do cliente e não acionar ninguém **reproduz exatamente o
// problema**: um campo a mais no banco, e o trabalho continua esperando alguém
// lembrar. Apontamento que não vira tarefa com dono e prazo é o mesmo silêncio
// com outra roupa. Por isso a devolutiva passa por `criarTarefas` — o portão do
// PM, que RECUSA tarefa sem dono e sem prazo — e não por um `task.create` solto.
//
// ── DE ONDE SAEM DONO E PRAZO (nunca inventados) ─────────────────────────────
//
//   • dono  → o `agentId` da tarefa que a triagem já criou para este pedido.
//     É o especialista que orçou; é ele que revê. Sem tarefa anterior não há
//     dono derivável — e aí a casa PARA e pergunta, em vez de sortear alguém.
//   • prazo → `somarDiasUteis(hoje, PRAZO_DE_REVISAO_EM_DIAS_UTEIS)`. Este é um
//     compromisso declarado DA AGÊNCIA sobre o próprio tempo de resposta, da
//     mesma natureza que o `deliveryDays` do catálogo — não é uma data
//     adivinhada sobre o cliente.
//
// ── IMUTABILIDADE (a promessa que a tela já faz) ─────────────────────────────
//
// "Decisão registrada é imutável: muda-se de ideia criando uma nova rodada,
// nunca reescrevendo a anterior." A devolutiva NÃO reescreve o orçamento: o
// preço anterior fica onde está, o pedido sai da fila de decisão do cliente
// (`quoteStatus: "ajuste_solicitado"`) e volta para a agência revisar. Quando a
// agência propuser outro preço, isso é uma RODADA NOVA que o cliente decide de
// novo.

import { prisma } from "@/lib/db/client";
import { criarTarefas } from "@/lib/agency/tarefas/criar-tarefas";
import { somarDiasUteis } from "@/lib/agency/esteira/triagem";

/** O compromisso da agência com o próprio tempo de resposta a um apontamento.
 *  Está aqui, com nome, para ser discutível — e não escondido num `+ 2` no
 *  meio de uma linha. */
export const PRAZO_DE_REVISAO_EM_DIAS_UTEIS = 2;

/** O estado do orçamento devolvido. Não é "aceito" nem "recusado": é a bola de
 *  volta com a agência. `orcamentoEsperandoDecisao` (no portal) já para de
 *  cobrar o cliente quando `quoteStatus` sai de "pendente" — então o card deixa
 *  de dizer "aguardando você", que seria mentira. */
export const AJUSTE_SOLICITADO = "ajuste_solicitado";

function comoDataDeTarefa(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ResultadoDaDevolutiva {
  ok: boolean;
  /** Virou trabalho de verdade? `false` com `ok: true` significa que a
   *  devolutiva foi registrada e ESCALADA para gente — nunca "sumiu". */
  tarefaCriada: boolean;
  motivo?: string;
}

/**
 * O cliente devolveu o orçamento com apontamentos.
 *
 * Só é chamada depois de a rota conferir posse e estado; aqui mora o EFEITO.
 */
export async function devolverOrcamentoComApontamentos(input: {
  pedidoId: string;
  clientId: string;
  apontamento: string;
}): Promise<ResultadoDaDevolutiva> {
  const apontamento = input.apontamento.trim();
  // Trava de fundo de poço: devolver sem dizer o quê é o mesmo silêncio que
  // esta função existe para matar. A rota já barra antes; esta linha garante
  // que nenhum chamador futuro consiga contornar.
  if (!apontamento) {
    return { ok: false, tarefaCriada: false, motivo: "apontamento vazio" };
  }

  const pedido = await prisma.contentRequest.findFirst({
    where: { id: input.pedidoId, clientId: input.clientId },
    select: {
      id: true, title: true, description: true, quotedPrice: true,
      projectId: true, taskId: true, clientId: true,
    },
  });
  if (!pedido) return { ok: false, tarefaCriada: false, motivo: "pedido não encontrado" };

  // Escrita CONDICIONAL: o estado entra no WHERE. Dois toques no celular não
  // podem produzir duas devolutivas nem atropelar um aceite que chegou antes.
  const gravou = await prisma.contentRequest.updateMany({
    where: { id: pedido.id, clientId: input.clientId, quoteStatus: "pendente" },
    data: { quoteStatus: AJUSTE_SOLICITADO },
  });
  if (gravou.count === 0) {
    return { ok: false, tarefaCriada: false, motivo: "este orçamento já foi decidido" };
  }

  // O REGISTRO, nas palavras do cliente. É o que a agência lê e é o que fica no
  // histórico do card — a devolutiva dele não vira resumo de ninguém.
  await prisma.portalMessage.create({
    data: {
      clientId: input.clientId,
      authorRole: "client",
      authorName: "Cliente",
      body:
        `Sobre o orçamento de "${pedido.title}"` +
        (pedido.quotedPrice ? ` (R$ ${pedido.quotedPrice})` : "") +
        `: devolvi com apontamentos.\n\n${apontamento}`,
    },
  }).catch(() => { /* o registro é aviso; a devolutiva já está gravada */ });

  // ── E AGORA VIRA TRABALHO, OU ESCALA. Nunca some. ─────────────────────────
  const tarefaAnterior = pedido.taskId
    ? await prisma.task.findUnique({ where: { id: pedido.taskId }, select: { agentId: true } })
    : null;
  const dono = tarefaAnterior?.agentId ?? null;
  const prazo = comoDataDeTarefa(somarDiasUteis(new Date(), PRAZO_DE_REVISAO_EM_DIAS_UTEIS));

  if (pedido.projectId && dono) {
    const r = await criarTarefas(pedido.projectId, [
      {
        title: `Revisar orçamento: ${pedido.title}`,
        description:
          `O CLIENTE DEVOLVEU O ORÇAMENTO COM APONTAMENTOS.\n\n` +
          `O que ele escreveu, na íntegra:\n${apontamento}\n\n` +
          `Pedido original: ${pedido.description}\n` +
          (pedido.quotedPrice ? `Orçamento devolvido: R$ ${pedido.quotedPrice}\n` : "") +
          `Rever prazo, escopo ou preço e reapresentar. O orçamento anterior NÃO é reescrito: ` +
          `a nova proposta é uma rodada nova, que o cliente decide de novo.`,
        agentId: dono,
        status: "pending",
        dueDate: prazo,
      },
    ]);
    if (r.criadas > 0) return { ok: true, tarefaCriada: true };
  }

  // Fail-closed e RUIDOSO: sem projeto ou sem dono derivável, a casa não sorteia
  // responsável nem inventa data — ela para e chama gente. O pedido volta para
  // `precisa_decisao`, que é o estado que a caixa de entrada da agência já
  // mostra, e o motivo aparece para os dois lados.
  await prisma.contentRequest.update({
    where: { id: pedido.id },
    data: {
      status: "precisa_decisao",
      declineReason:
        `O cliente devolveu o orçamento com apontamentos e não foi possível abrir a revisão ` +
        `automaticamente (${!pedido.projectId ? "pedido sem projeto" : "pedido sem dono definido"}). ` +
        `Alguém precisa assumir a revisão. O que ele escreveu: ${apontamento}`.slice(0, 900),
    },
  }).catch(() => { /* best-effort */ });

  const projeto = pedido.projectId
    ? await prisma.project.findUnique({
        where: { id: pedido.projectId },
        select: { workspaceId: true },
      }).catch(() => null)
    : null;
  if (projeto) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId: pedido.projectId,
        clientId: pedido.clientId,
        type: "orcamento_devolvido_sem_dono",
        message:
          `Orçamento de "${pedido.title}" devolvido com apontamentos pelo cliente, e a revisão NÃO ` +
          `foi aberta automaticamente (sem dono derivável). Precisa de gente.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort */ });
  }

  return { ok: true, tarefaCriada: false, motivo: "escalado para a agência" };
}
