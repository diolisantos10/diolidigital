// O BALCÃO PRODUZ SOZINHO — o elo que faltava entre pagar e receber.
//
// A linha de balcão (post R$ 79, carrossel R$ 129, copy R$ 39) só é lucrativa
// com ZERO hora humana: num item de R$ 79, uma única intervenção de gente come a
// margem do mês inteiro. Até 05/08/2026 o pagamento aprovado apenas carimbava
// `status: "in_progress"` no pedido — e alguém tinha de empurrar tudo à mão.
// Vender assim é vender prejuízo com cara de crescimento.
//
// O QUE ESTE MÓDULO FAZ, e por que assim:
//   1. Acha ou cria o CLIENTE pelo e-mail do comprador — a pessoa que gastou
//      R$ 39 entra na carteira igual à que assina R$ 2.590. É esse cadastro que
//      transforma compra avulsa em cliente que volta.
//   2. Abre um PROJETO com o escopo do item comprado.
//   3. Marca o projeto para EXECUÇÃO e deixa a esteira que já existe produzir
//      (o despertador pega projetos `pending` a cada 5 minutos). Nenhum motor
//      novo nasce aqui: o balcão entra na mesma linha de produção do resto.
//   4. Garante o ACESSO AO PORTAL, para a pessoa aprovar e baixar a peça.
//
// IDEMPOTENTE de propósito: gateway de pagamento reenvia webhook. Rodar duas
// vezes para o mesmo pedido não pode gerar dois projetos — e a trava é o
// `projectId` já gravado no pedido, não uma variável em memória.

import { prisma } from "@/lib/db/client";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";

export type ResultadoDeProducao =
  | { ok: true; projectId: string; clientId: string; jaExistia: boolean }
  | { ok: false; motivo: string };

/** Só o que a máquina entrega sozinha entra por aqui. Item fora desta lista
 *  segue o caminho antigo (alguém da agência assume) — porque prometer
 *  automação para o que não é automático é a mesma falha que "sem gate". */
function ehDeBalcao(serviceId: string): boolean {
  return serviceId.startsWith("balcao-");
}

/** O escopo vira texto de projeto: é o que o motor de produção lê para saber o
 *  que fazer. Sai do catálogo, nunca escrito de novo aqui. */
function escopoDoItem(serviceId: string): { nome: string; objetivo: string } | null {
  const item = SELF_SERVE_CATALOG.find((s) => s.id === serviceId);
  if (!item) return null;
  return {
    nome: item.label,
    objetivo: `${item.description}\n\nEntregáveis contratados:\n${item.deliverables.map((d) => `- ${d}`).join("\n")}`,
  };
}

/** O pedido guarda contato e item dentro de `briefingJson` — não há coluna para
 *  isso, e criar uma só para o balcão seria migrar o banco inteiro por um campo.
 *  Ler daqui é o mesmo caminho que a esteira já usa. */
function dadosDoPedido(briefingJson: string | null): {
  serviceId: string; email: string; nome: string; telefone: string | null;
} {
  try {
    const b = JSON.parse(briefingJson ?? "{}") as Record<string, unknown>;
    return {
      serviceId: typeof b.serviceId === "string" ? b.serviceId : "",
      email: typeof b.prospectEmail === "string" ? b.prospectEmail : "",
      nome: typeof b.prospectName === "string" ? b.prospectName : "",
      telefone: typeof b.prospectPhone === "string" ? b.prospectPhone : null,
    };
  } catch {
    return { serviceId: "", email: "", nome: "", telefone: null };
  }
}

export async function produzirPedidoDeBalcao(clientRequestId: string): Promise<ResultadoDeProducao> {
  const pedido = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!pedido) return { ok: false, motivo: "pedido não encontrado" };

  const dados = dadosDoPedido(pedido.briefingJson);
  const serviceId = dados.serviceId;
  if (!ehDeBalcao(serviceId)) return { ok: false, motivo: "não é item de balcão" };

  const escopo = escopoDoItem(serviceId);
  if (!escopo) return { ok: false, motivo: "item fora do catálogo" };

  // Já produzido: devolve o que existe. Webhook repetido é caso normal, não erro
  // — e a trava é o projeto JÁ LIGADO a este pedido, no banco, nunca memória.
  const jaFeito = await prisma.project.findFirst({
    where: { clientRequestId: pedido.id },
    select: { id: true, clientId: true },
  });
  if (jaFeito) return { ok: true, projectId: jaFeito.id, clientId: jaFeito.clientId, jaExistia: true };

  // O workspace: o do pedido quando existe; senão o único da base. Com dois
  // workspaces e pedido órfão, adivinhar seria vazar — então não produz.
  let workspaceId = pedido.workspaceId;
  if (!workspaceId) {
    const todos = await prisma.agencyWorkspace.findMany({ select: { id: true }, take: 2 });
    if (todos.length !== 1) return { ok: false, motivo: "workspace ambíguo — pedido precisa de dono" };
    workspaceId = todos[0]!.id;
  }

  // ── 1. O CLIENTE. Quem comprou uma vez entra na carteira. ────────────────
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim() || pedido.businessName || "Cliente do balcão";
  let cliente = email
    ? await prisma.client.findFirst({ where: { workspaceId, email }, select: { id: true } })
    : null;
  if (!cliente) {
    cliente = await prisma.client.create({
      data: {
        workspaceId,
        name: nome,
        email: email || null,
        phone: dados.telefone,
      },
      select: { id: true },
    });
  }

  // ── 2. O PROJETO, com o escopo comprado ──────────────────────────────────
  const projeto = await prisma.project.create({
    data: {
      workspaceId,
      clientId: cliente.id,
      clientRequestId: pedido.id,
      name: escopo.nome,
      goal: escopo.objetivo,
      type: "balcao",
      stage: "producao",
      // Pagou, então a direção já está aprovada: não existe rodada de conceito
      // num item de R$ 79 — o que existe é a peça, e ela sai agora.
      directionApprovedAt: new Date(),
      // O despertador (a cada 5 min) pega daqui e produz. Zero hora humana.
      executionStatus: "pending",
      executionRequestedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.clientRequestDb.update({
    where: { id: pedido.id },
    data: { clientId: cliente.id, status: "in_progress" },
  });

  // ── 3. O ACESSO AO PORTAL. Sem isso a peça fica pronta e ninguém vê. ─────
  const jaTemAcesso = await prisma.portalAccess.findFirst({
    where: { clientId: cliente.id, revokedAt: null },
    select: { id: true },
  });
  if (!jaTemAcesso) {
    await prisma.portalAccess.create({
      data: { clientId: cliente.id, clientRequestId: pedido.id },
    }).catch(() => {
      // Perder o link não pode desfazer a compra — o time gera depois pelo painel.
    });
  }

  return { ok: true, projectId: projeto.id, clientId: cliente.id, jaExistia: false };
}
