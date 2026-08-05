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

  if (pedido.status !== "novo") {
    return NextResponse.json(
      { error: `Este pedido já foi triado (${pedido.status}).`, status: pedido.status },
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
        triagedBy: session.name ?? "Equipe",
        triagedAt: new Date(),
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

    return NextResponse.json({
      ok: true,
      status: "triado",
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
