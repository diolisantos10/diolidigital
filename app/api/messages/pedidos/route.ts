// /api/messages/pedidos — o lado da AGÊNCIA do pedido de conteúdo.
//
//   GET  → a fila de pedidos do workspace (a segunda aba da caixa de entrada)
//   POST → a TRIAGEM: o pedido vira `Task` e entra na esteira, ou é recusado
//          com motivo.
//
// ── Por que a triagem é de gente, e não automática ──────────────────────────
// Aceitar um pedido é decidir ESCOPO — se entra no ciclo já contratado ou se
// vira trabalho a combinar. Isso é preço e prazo, e preço e prazo não se
// inventam. Por isso `scopeDecision` nasce nulo no banco e esta rota EXIGE a
// escolha: não existe caminho que crie tarefa sem alguém ter decidido.
//
// ── Nenhum estado prende trabalho para sempre ───────────────────────────────
// Três travas, nesta ordem:
//   1. tarefa sem PRAZO não é criada (422) — tarefa sem data é vazamento;
//   2. tarefa sem DEPARTAMENTO não é criada — sem `agentId` o motor nunca a
//      move, e ela ficaria "na fila" eternamente;
//   3. recusar EXIGE motivo — o pedido não pode simplesmente sumir da fila.
//
// Depois da triagem, a esteira já está pronta: Task → departamento →
// Deliverable → SocialPost → ApprovalRequest → portal. Esta rota constrói o
// primeiro elo e para aí, de propósito.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { conversaDoCliente } from "@/app/api/messages/conversa";

/** Para onde um pedido do cliente pode ser roteado. Só os departamentos que
 *  produzem PEÇA para o cliente — mandar um pedido de conteúdo para Operações
 *  seria criar uma tarefa que ninguém executa. */
export const DESTINOS = [
  { departamento: "social-media", agentId: "a3", label: "Social Media" },
  { departamento: "design",       agentId: "a2", label: "Design" },
  { departamento: "paid-traffic", agentId: "a4", label: "Tráfego Pago" },
] as const;

export type Decisao = "ciclo" | "extra" | "recusar";

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "2026-08-20" → o formato que `Task.dueDate` (String) já usa no resto da casa. */
function comoDataDeTarefa(iso: string): string {
  return iso.slice(0, 10);
}

// ── GET: a fila ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const status = new URL(request.url).searchParams.get("status");

  try {
    const clientes = await prisma.client.findMany({
      where: { workspaceId: session.workspaceId },
      select: { id: true, name: true },
    });
    if (clientes.length === 0) return NextResponse.json({ pedidos: [] });
    const nomePorCliente = new Map(clientes.map((c) => [c.id, c.name]));

    const pedidos = await prisma.contentRequest.findMany({
      where: {
        clientId: { in: clientes.map((c) => c.id) },
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({
      pedidos: pedidos.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        cliente: nomePorCliente.get(p.clientId) ?? "Cliente",
        titulo: p.title,
        descricao: p.description,
        objetivo: p.objective,
        para: p.desiredFor ? p.desiredFor.toISOString() : null,
        anexos: (() => { try { const v = JSON.parse(p.attachmentsJson); return Array.isArray(v) ? v : []; } catch { return []; } })(),
        status: p.status,
        escopo: p.scopeDecision,
        taskId: p.taskId,
        projectId: p.projectId,
        triadoPor: p.triagedBy,
        triadoEm: p.triagedAt ? p.triagedAt.toISOString() : null,
        motivo: p.declineReason,
        criadoEm: p.createdAt.toISOString(),
      })),
      destinos: DESTINOS,
    });
  } catch (e) {
    console.error("[messages/pedidos] GET error", e);
    return NextResponse.json({ error: "Não consegui carregar a fila de pedidos" }, { status: 503 });
  }
}

// ── POST: a triagem ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Quem decide escopo é quem responde pelo contrato.
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pedidoId = texto(corpo.pedidoId);
  const decisao = texto(corpo.decisao) as Decisao;
  if (!pedidoId) return NextResponse.json({ error: "pedidoId obrigatório" }, { status: 400 });
  if (!["ciclo", "extra", "recusar"].includes(decisao)) {
    return NextResponse.json(
      { error: "decisao obrigatória: 'ciclo' (entra no ciclo corrente), 'extra' (escopo a combinar) ou 'recusar'" },
      { status: 400 },
    );
  }

  const pedido = await prisma.contentRequest.findUnique({ where: { id: pedidoId } });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Estar logado não é ser dono.
  const dono = await prisma.client.findFirst({
    where: { id: pedido.clientId, workspaceId: session.workspaceId },
    select: { id: true, name: true },
  });
  if (!dono) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // A TRIAGEM MANUAL É A SAÍDA DO `precisa_decisao`.
  //
  // Desde 06/08/2026 quem tria primeiro é a máquina (`lib/agency/esteira/triagem.ts`).
  // Esta rota deixou de ser o caminho normal e passou a ser o caminho do que a
  // máquina PAROU — e por isso `precisa_decisao` tem de entrar aqui. Se só
  // "novo" fosse aceito, o fail-closed levaria o pedido para um limbo sem botão:
  // visível, com motivo, e sem ninguém podendo destravá-lo. Trocaríamos um balde
  // por outro, com o agravante de parecer resolvido.
  if (pedido.status !== "novo" && pedido.status !== "precisa_decisao") {
    return NextResponse.json(
      { error: `Este pedido já está em "${pedido.status}" — não dá para triar de novo.`, status: pedido.status },
      { status: 409 },
    );
  }

  // ── Recusar: sai da fila, mas com motivo e com aviso ao cliente ───────────
  if (decisao === "recusar") {
    const motivo = texto(corpo.motivo);
    if (motivo.length < 5) {
      return NextResponse.json(
        { error: "motivo obrigatório — o cliente precisa saber por que não vamos seguir" },
        { status: 422 },
      );
    }
    await prisma.contentRequest.update({
      where: { id: pedido.id },
      data: { status: "recusado", declineReason: motivo, triagedBy: session.name ?? "Equipe", triagedAt: new Date() },
    });
    await avisarCliente(pedido.clientId, session.name ?? "Equipe Dioli",
      `Sobre o seu pedido "${pedido.title}": ${motivo}`);
    return NextResponse.json({ ok: true, status: "recusado" });
  }

  // ── ESCOPO EXTRA EXIGE PREÇO. Fail-closed, e de propósito ────────────────
  //
  // Pedido do CEO em 05/08/2026: "a devolutiva já tem que vir com o preço".
  // Não é preferência de fluxo — é onde a agência vende. Aceitar como escopo
  // adicional sem número é empurrar a conversa comercial para depois da peça
  // pronta, que é exatamente quando ela fica difícil: o cliente já viu o
  // trabalho e qualquer preço soa como cobrança de surpresa.
  //
  // Por isso "extra" sem `preco` NÃO grava. E o preço vem com uma frase do que
  // ele cobre: número solto sempre parece caro.
  let orcamento: { preco: number; nota: string } | null = null;
  if (decisao === "extra") {
    const preco = Number(corpo.preco);
    const nota = texto(corpo.precoNota);
    if (!Number.isFinite(preco) || preco <= 0) {
      return NextResponse.json(
        { error: "preco obrigatório (em reais) — escopo extra sem preço vira discussão depois, com a peça já feita" },
        { status: 422 },
      );
    }
    if (nota.length < 5) {
      return NextResponse.json(
        { error: "precoNota obrigatória — diga em uma frase o que o preço cobre; número solto sempre parece caro" },
        { status: 422 },
      );
    }
    orcamento = { preco: Math.round(preco), nota };
  }

  // ── Aceitar: precisa de descrição, projeto, departamento e prazo ─────────
  // Belt and braces: a rota do portal já barra pedido mudo, mas quem cria
  // tarefa é AQUI — e tarefa muda não pode nascer por nenhum caminho.
  if (pedido.description.trim().length === 0) {
    return NextResponse.json(
      { error: "Este pedido está sem descrição. Pergunte ao cliente antes de virar tarefa." },
      { status: 409 },
    );
  }

  const destino = DESTINOS.find((d) => d.departamento === texto(corpo.departamento));
  if (!destino) {
    return NextResponse.json(
      { error: `departamento obrigatório: ${DESTINOS.map((d) => d.departamento).join(" | ")}`, destinos: DESTINOS },
      { status: 422 },
    );
  }

  // O projeto que recebe. Nunca inventado: sem projeto aberto, o pedido fica na
  // fila e a resposta diz exatamente o que fazer.
  const projeto = texto(corpo.projectId)
    ? await prisma.project.findFirst({
        where: { id: texto(corpo.projectId), clientId: pedido.clientId },
        select: { id: true, name: true },
      })
    : await prisma.project.findFirst({
        where: { clientId: pedido.clientId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true },
      });
  if (!projeto) {
    return NextResponse.json(
      {
        error: "sem_projeto",
        mensagem: `${dono.name} não tem projeto aberto. Abra o projeto (ou escolha um) antes de transformar o pedido em tarefa — tarefa sem projeto não é executada por ninguém.`,
      },
      { status: 409 },
    );
  }

  // Prazo: do PM, ou a data que o cliente pediu. Sem nenhuma das duas, não
  // criamos a tarefa — "em execução" sem prazo nem dono é vazamento.
  const prazoBruto = texto(corpo.prazo) || (pedido.desiredFor ? pedido.desiredFor.toISOString() : "");
  if (!prazoBruto) {
    return NextResponse.json(
      {
        error: "faltou_prazo",
        campo: "prazo",
        mensagem: "O cliente não disse para quando. Defina a data de entrega — tarefa sem prazo trava calada.",
      },
      { status: 422 },
    );
  }
  const prazo = comoDataDeTarefa(prazoBruto);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) {
    return NextResponse.json({ error: "faltou_prazo", campo: "prazo", mensagem: "Data inválida. Use AAAA-MM-DD." }, { status: 422 });
  }

  const escopoLegivel = decisao === "ciclo" ? "no ciclo corrente" : "como escopo adicional a combinar";

  try {
    const tarefa = await prisma.task.create({
      data: {
        projectId: projeto.id,
        title: pedido.title,
        // A descrição carrega o pedido INTEIRO, nas palavras do cliente. É a
        // verdade ancorada do especialista: o que ele quer e para quê.
        description:
          `Pedido do cliente (${dono.name}).\n\n` +
          `O que ele quer: ${pedido.description}\n` +
          `Para qual objetivo: ${pedido.objective}\n` +
          (pedido.desiredFor ? `Data pedida pelo cliente: ${comoDataDeTarefa(pedido.desiredFor.toISOString())}\n` : "") +
          `Escopo: ${escopoLegivel}.`,
        agentId: destino.agentId,
        status: "pending",
        dueDate: prazo,
      },
      select: { id: true },
    });

    await prisma.contentRequest.update({
      where: { id: pedido.id },
      data: {
        status: "triado",
        scopeDecision: decisao,
        projectId: projeto.id,
        taskId: tarefa.id,
        // O PRAZO PROMETIDO em coluna própria. Antes ele existia só como
        // `Task.dueDate` e como frase na mensagem — nada que o portal do cliente
        // pudesse mostrar de volta.
        promisedFor: new Date(`${prazo}T12:00:00`),
        // Triado é triado: o motivo do `precisa_decisao` sai junto, senão a tela
        // continuaria mostrando a pergunta de um pedido já resolvido.
        declineReason: null,
        triagedBy: session.name ?? "Equipe",
        triagedAt: new Date(),
        // O orçamento só existe no caminho "extra" — no ciclo, a peça já está
        // paga pela mensalidade e mostrar preço ao cliente seria cobrar duas
        // vezes pelo mesmo contrato.
        ...(orcamento ? { quotedPrice: orcamento.preco, quoteNote: orcamento.nota, quoteStatus: "pendente" } : {}),
      },
    });

    // Rastro no projeto: de onde veio este trabalho.
    await prisma.timelineEvent.create({
      data: {
        projectId: projeto.id,
        type: "content_request",
        label: `Pedido do cliente aceito ${escopoLegivel}`,
        dept: destino.departamento,
        detail: pedido.title,
      },
    }).catch(() => { /* rastro é visibilidade: não derruba a triagem */ });

    // O cliente fica sabendo — pelo mesmo canal em que ele pediu.
    await avisarCliente(
      pedido.clientId,
      session.name ?? "Equipe Dioli",
      decisao === "ciclo"
        ? `Recebemos seu pedido "${pedido.title}" e ele entrou na produção deste ciclo, com entrega prevista para ${prazo.split("-").reverse().join("/")}. Assim que a peça ficar pronta ela aparece aqui para você aprovar.`
        : `Recebemos seu pedido "${pedido.title}". Ele vai além do que está contratado neste ciclo, então vamos te mandar a proposta desse trabalho extra antes de começar. Nada é produzido nem cobrado sem a sua aprovação.`,
    );

    // ── A TAREFA ACIONA O AGENTE ─────────────────────────────────────────────
    // Este era o ponto exato da quebra do pipeline: a triagem criava a `Task` e
    // parava aí "de propósito" — e nada nunca movia a tarefa. No ciclo (já pago
    // pela mensalidade) a produção começa agora; no escopo extra ela espera o
    // cliente aceitar o orçamento, e quem dispara então é `/orcamento`.
    let produziu = false;
    if (decisao === "ciclo") {
      const { produzirPedido } = await import("@/lib/agency/esteira/producao-de-pedido");
      const r = await produzirPedido(pedido.id).catch((e: unknown) => {
        console.error("[messages/pedidos] a produção falhou", e);
        return null;
      });
      produziu = r?.ok === true;
    }

    return NextResponse.json({
      ok: true,
      status: produziu ? "entregue" : "triado",
      produziu,
      escopo: decisao,
      taskId: tarefa.id,
      projectId: projeto.id,
      projeto: projeto.name,
      departamento: destino.label,
      prazo,
    });
  } catch (e) {
    console.error("[messages/pedidos] POST error", e);
    return NextResponse.json({ error: "Não consegui registrar a triagem agora" }, { status: 503 });
  }
}

// ── PATCH: consertar uma triagem que já saiu errada ─────────────────────────
//
// ── Por que esta rota existe (06/08/2026) ──────────────────────────────────
// A triagem automática orçou "1 Reel — R$ 350" para um pedido cujo entregável
// era o ROTEIRO — e o roteiro já estava pronto. O CEO viu o orçamento errado no
// portal do celular e **não havia como tirá-lo dali**: `triado` não volta para
// `novo`, e o POST acima recusa pedido já triado (409). O único caminho era
// "recusar", que apaga o pedido legítimo do cliente junto com o erro.
//
// Duas ações, e as duas escrevem no lugar onde o cliente enxerga:
//   • `cancelar_orcamento` — o número sai da frente dele, com o motivo em
//     português. Exige motivo: orçamento que some sem explicação é pior do que
//     orçamento errado, porque o cliente fica sem saber o que vale.
//   • `entregar` — a peça produzida FORA da máquina (por um especialista, em
//     documento) vira entrega visível no portal. Sem isto, trabalho concluído
//     mora no repositório, que é um lugar onde o cliente não entra — e a
//     agência continua orçando o que já entregou.
//
// O que esta rota NÃO faz: inventar preço (ela só apaga), publicar em
// plataforma nenhuma e mexer em pedido de outro workspace.
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pedidoId = texto(corpo.pedidoId);
  const acao = texto(corpo.acao);
  if (!pedidoId) return NextResponse.json({ error: "pedidoId obrigatório" }, { status: 400 });
  if (acao !== "cancelar_orcamento" && acao !== "entregar") {
    return NextResponse.json({ error: "acao obrigatória: 'cancelar_orcamento' ou 'entregar'" }, { status: 400 });
  }

  const pedido = await prisma.contentRequest.findUnique({ where: { id: pedidoId } });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Estar logado não é ser dono — a mesma regra do POST.
  const dono = await prisma.client.findFirst({
    where: { id: pedido.clientId, workspaceId: session.workspaceId },
    select: { id: true, name: true },
  });
  if (!dono) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  const motivo = texto(corpo.motivo);
  if (motivo.length < 10) {
    return NextResponse.json(
      { error: "motivo obrigatório — o cliente precisa saber por que o valor mudou ou de onde veio a entrega" },
      { status: 422 },
    );
  }

  // ── Cancelar o orçamento ─────────────────────────────────────────────────
  if (acao === "cancelar_orcamento") {
    if (pedido.quotedPrice === null) {
      return NextResponse.json({ error: "Este pedido não tem orçamento na mesa." }, { status: 409 });
    }
    await prisma.contentRequest.update({
      where: { id: pedido.id },
      data: {
        // O número sai — e sai INTEIRO. Deixar `quoteNote` seria a frase de um
        // preço que não existe mais.
        quotedPrice: null, quoteNote: null, quoteStatus: null,
        // Volta a ser trabalho de gente, com o motivo visível dos dois lados.
        // Nunca "novo": "novo" é o balde de onde esta esteira saiu.
        status: pedido.status === "entregue" ? "entregue" : "precisa_decisao",
        declineReason: motivo.slice(0, 600),
        triagedBy: session.name ?? "Equipe",
        triagedAt: new Date(),
      },
    });
    await avisarCliente(pedido.clientId, session.name ?? "Equipe Dioli",
      `Sobre o seu pedido "${pedido.title}": ${motivo}`);
    return NextResponse.json({ ok: true, status: pedido.status === "entregue" ? "entregue" : "precisa_decisao", orcamento: null });
  }

  // ── Entregar uma peça produzida fora da máquina ──────────────────────────
  const titulo = texto(corpo.titulo);
  const conteudo = typeof corpo.conteudo === "string" ? corpo.conteudo.trim() : "";
  if (titulo.length < 3 || conteudo.length < 200) {
    return NextResponse.json(
      { error: "titulo e conteudo obrigatórios — entrega vazia no portal é pior que entrega nenhuma (mínimo de 200 caracteres de conteúdo)" },
      { status: 422 },
    );
  }
  if (pedido.deliverableId) {
    return NextResponse.json({ error: "Este pedido já tem entrega ligada.", deliverableId: pedido.deliverableId }, { status: 409 });
  }

  const projeto = pedido.projectId
    ? await prisma.project.findFirst({ where: { id: pedido.projectId, clientId: pedido.clientId }, select: { id: true } })
    : await prisma.project.findFirst({ where: { clientId: pedido.clientId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!projeto) {
    return NextResponse.json({ error: "sem_projeto", mensagem: `${dono.name} não tem projeto — a entrega precisa de onde morar.` }, { status: 409 });
  }

  // O dono da peça é o especialista que a tarefa já apontava. Sem tarefa, fica
  // nulo: inventar um autor é assinar trabalho no nome de quem não fez.
  const tarefa = pedido.taskId
    ? await prisma.task.findUnique({ where: { id: pedido.taskId }, select: { id: true, agentId: true } })
    : null;

  try {
    const entregavel = await prisma.deliverable.create({
      data: {
        projectId: projeto.id,
        name: titulo.slice(0, 200),
        type: "content",
        status: "in_review",
        content: conteudo.slice(0, 200_000),
        ownerAgentId: tarefa?.agentId ?? null,
        // O cliente PEDIU esta peça — segurar em "interno" seria recriar o
        // problema que estamos consertando: trabalho pronto que ele não vê.
        visibility: "compartilhado",
      },
      select: { id: true },
    });

    const { createApprovalRequest } = await import("@/lib/agency/persistence/approval-service");
    const card = await createApprovalRequest({
      clientId: pedido.clientId,
      department: `pedido:${pedido.id}`,
      requestedBy: session.name ?? "Equipe Dioli",
      clientVisible: true,
      reviewNote: `${titulo}\n\n${conteudo}`.slice(0, 200_000),
    });

    await prisma.contentRequest.update({
      where: { id: pedido.id },
      data: {
        status: "entregue",
        deliverableId: entregavel.id,
        declineReason: null,
        // Trabalho ENTREGUE não fica com orçamento pendente na tela do cliente.
        // Era exatamente esta a cena que o CEO viu: a agência cobrando por algo
        // que já tinha feito.
        ...(pedido.quoteStatus === "aceito" ? {} : { quotedPrice: null, quoteNote: null, quoteStatus: null }),
        triagedBy: session.name ?? "Equipe",
        triagedAt: new Date(),
      },
    });

    if (pedido.taskId) {
      await prisma.task.update({
        where: { id: pedido.taskId },
        data: { status: "done", deliverableId: entregavel.id },
      }).catch(() => { /* a tarefa é rastro; não desfaz a entrega */ });
    }

    await prisma.timelineEvent.create({
      data: { projectId: projeto.id, type: "deliverable", label: `Pedido do cliente entregue: ${titulo}`, dept: "social-media", detail: pedido.title },
    }).catch(() => { /* rastro */ });

    await avisarCliente(pedido.clientId, session.name ?? "Equipe Dioli",
      `Sobre o seu pedido "${pedido.title}": ${motivo} Está na sua aba de aprovações.`);

    return NextResponse.json({ ok: true, status: "entregue", deliverableId: entregavel.id, approvalRequestId: card.id });
  } catch (e) {
    console.error("[messages/pedidos] PATCH error", e);
    return NextResponse.json({ error: "Não consegui registrar a entrega agora" }, { status: 503 });
  }
}

/** Escreve na conversa do cliente pelo canal que ele já usa. Best-effort: o
 *  aviso é comunicação, e comunicação não pode derrubar a triagem. */
async function avisarCliente(clientId: string, autor: string, corpo: string): Promise<void> {
  try {
    const conversa = await conversaDoCliente(clientId);
    await prisma.portalMessage.create({
      data: {
        clientId: conversa.ancora.clientId,
        clientRequestId: conversa.ancora.clientRequestId,
        authorRole: "team",
        authorName: autor,
        body: corpo,
        readByTeam: true,
        readByClient: false,
      },
    });
  } catch (e) {
    console.warn("[messages/pedidos] não consegui avisar o cliente:", e instanceof Error ? e.message : e);
  }
}
