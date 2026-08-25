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
import { PRODUTOS_CANONICOS, type ProdutoCanonico } from "@/lib/agency/produtos/registro";
import { ATENDIMENTOS, somarDiasUteis } from "@/lib/agency/esteira/triagem";

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
      // ── QUEM PRODUZ ESTE PEDIDO ───────────────────────────────────────────
      //
      // O caminho de sempre é o motor grande, acordado pelo despertador
      // (`executionStatus: "pending"`, a cada 5 min). Ele continua valendo para
      // todo item de balcão — menos um.
      //
      // O item do produto canônico com corrente visual NÃO entra aqui: ele é
      // atendido por `produzirPedido`, a mesma e única porta do pedido avulso e
      // do portal. Deixar os dois ligados produziria a peça DUAS vezes, por dois
      // caminhos diferentes, e o segundo caminho é sempre o que ninguém audita.
      // Ver o bloco "O BALCÃO ENTRA PELA MESMA PORTA", abaixo.
      ...(temCorrenteVisual(serviceId)
        ? {}
        : { executionStatus: "pending", executionRequestedAt: new Date() }),
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

  // ── O BALCÃO ENTRA PELA MESMA PORTA (25/08/2026) ─────────────────────────
  //
  // A ordem da Operação Salvaguarda é literal: "uma função orquestradora deve
  // ser a ÚNICA porta desta corrente — pedido avulso, balcão e portal chamam
  // ela. Não deixe caminho paralelo vivo."
  //
  // O balcão não tinha `ContentRequest`: ele criava projeto e deixava o motor
  // grande produzir um CICLO. Para o produto com corrente visual isso seria uma
  // segunda porta, com fechadura diferente — e a segunda porta é sempre a que
  // fica aberta.
  //
  // Então o pedido de balcão do produto canônico nasce como pedido JÁ TRIADO,
  // com o produto declarado, e atravessa exatamente a mesma corrente do pedido
  // do portal: mesmos freios, mesma conferência de arquivo, mesmo card.
  //
  // ⚠️ NADA muda para os outros itens de balcão: `temCorrenteVisual` é falso
  // para todos eles, e eles seguem pelo motor grande, byte por byte como antes.
  const produto = produtoDoItemDeBalcao(serviceId);
  if (produto) {
    const encaminhado = await encaminharParaACorrenteVisual({
      produto,
      clientRequestId: pedido.id,
      clientId: cliente.id,
      projectId: projeto.id,
      titulo: escopo.nome,
      descricao: escopo.objetivo,
    });
    if (!encaminhado.ok) {
      // O pedido foi PAGO. Não conseguir encaminhar não pode virar silêncio: o
      // projeto existe, o cliente existe, e a falha fica dita para quem lê o
      // resultado do webhook.
      return { ok: false, motivo: `pedido de balcão criado, mas a corrente do produto não iniciou: ${encaminhado.motivo}` };
    }
  }

  return { ok: true, projectId: projeto.id, clientId: cliente.id, jaExistia: false };
}

/** O item de balcão entrega um produto canônico com corrente visual? */
function produtoDoItemDeBalcao(serviceId: string): ProdutoCanonico | null {
  return PRODUTOS_CANONICOS.find((p) => p.itemDeCatalogo === serviceId) ?? null;
}

function temCorrenteVisual(serviceId: string): boolean {
  return produtoDoItemDeBalcao(serviceId) !== null;
}

/**
 * O pedido de balcão vira um `ContentRequest` JÁ TRIADO e entra na porta única.
 *
 * Já triado, e não "novo": a triagem existe para descobrir O QUE o cliente quer
 * a partir de texto livre. Aqui não há o que descobrir — ele **comprou um item
 * de catálogo pelo id**. Mandar isso a um classificador de IA seria pagar para
 * adivinhar um fato que já está na mesa, e adivinhar erraria de vez em quando.
 *
 * Preço e prazo continuam saindo da tabela, e o pagamento continua conferido
 * pelo portão de sempre dentro da corrente (`artes.ts`).
 */
async function encaminharParaACorrenteVisual(e: {
  produto: ProdutoCanonico;
  clientRequestId: string;
  clientId: string;
  projectId: string;
  titulo: string;
  descricao: string;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const atendimento = ATENDIMENTOS.find((a) => a.produtoId === e.produto.id);
  if (!atendimento) return { ok: false, motivo: `nenhum atendimento da carta entrega o produto "${e.produto.id}"` };

  const item = SELF_SERVE_CATALOG.find((s) => s.id === e.produto.itemDeCatalogo);
  if (!item) return { ok: false, motivo: `o item "${e.produto.itemDeCatalogo}" sumiu do catálogo` };

  const prazo = somarDiasUteis(new Date(), item.deliveryDays);

  try {
    // ── A TAREFA PASSA PELO PORTÃO DO PM ─────────────────────────────────────
    //
    // `criarTarefas` é o ponto único (`lib/agency/tarefas/criar-tarefas.ts`), e
    // gravar `prisma.task.create` aqui seria um segundo caminho — a lista de
    // exceções desta casa existe justamente para não crescer. O plano de
    // recuperação manda PRESERVAR o "Project Manager como elo central"; entrar
    // pela porta dele é o que isso significa na prática.
    //
    // O portão exige DONO e PRAZO explícitos, e os dois existem aqui sem
    // invenção: o dono é o especialista que a carta de atendimentos amarra ao
    // produto, e o prazo sai de `deliveryDays` da tabela.
    const { criarTarefas } = await import("@/lib/agency/tarefas/criar-tarefas");
    const criacao = await criarTarefas(e.projectId, [{
      title: e.titulo,
      description: `Compra de balcão: ${e.titulo}.\n\n${e.descricao}`,
      agentId: atendimento.especialistaId,
      status: "pending",
      dueDate: prazo.toISOString().slice(0, 10),
    }]);
    if (criacao.criadas !== 1) {
      const parecer = criacao.veredicto.reprovadas.map((r) => r.parecer).join(" · ");
      return { ok: false, motivo: `o portão do PM não aprovou a tarefa desta compra${parecer ? `: ${parecer}` : ""}` };
    }

    // O id vem de volta por leitura porque `criarTarefas` grava em lote e não
    // devolve ids. Não há ambiguidade: o projeto acabou de nascer nesta função
    // e esta é a sua primeira e única tarefa.
    const tarefa = await prisma.task.findFirst({
      where: { projectId: e.projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!tarefa) return { ok: false, motivo: "a tarefa foi aprovada pelo portão do PM e não foi encontrada depois de gravada" };

    const pedido = await prisma.contentRequest.create({
      data: {
        clientId: e.clientId,
        clientRequestId: e.clientRequestId,
        projectId: e.projectId,
        taskId: tarefa.id,
        title: e.titulo,
        description: e.descricao,
        objective: `Entregar o que o cliente comprou no balcão: ${item.label}.`,
        // JÁ TRIADO: o cliente escolheu o item pelo id, não há classificação a
        // fazer. E o produto viaja com o pedido, que é o ponto inteiro.
        status: "triado",
        produtoId: e.produto.id,
        // Balcão é pago à vista e fechado: não há orçamento na mesa, então o
        // escopo é "ciclo" e a produção não espera aceite nenhum.
        scopeDecision: "ciclo",
        promisedFor: prazo,
        triagedBy: "balcao",
        triagedAt: new Date(),
      },
      select: { id: true },
    });

    // A MESMA porta do portal e do pedido avulso. Import dinâmico para não
    // arrastar o motor de produção (Playwright, motor de imagem) para dentro do
    // webhook de pagamento, que precisa responder rápido.
    const { produzirPedido } = await import("@/lib/agency/esteira/producao-de-pedido");
    void produzirPedido(pedido.id).catch((err: unknown) => {
      // A produção é assíncrona de propósito: o webhook do Mercado Pago tem
      // janela curta, e segurar a resposta dele até a arte ficar pronta faria o
      // provedor reenviar o evento. O pedido fica visível no portal de qualquer
      // forma, e o despertador retoma o que parar.
      console.error("[balcao] a corrente do produto falhou", err);
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : "erro desconhecido" };
  }
}
