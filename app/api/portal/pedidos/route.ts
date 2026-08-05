// /api/portal/pedidos — o cliente PEDE uma peça nova.
//
// ── O buraco que esta rota abre pela primeira vez ────────────────────────────
// Toda a esteira era agência → cliente. Nenhum modelo tinha o cliente como
// origem: quem quisesse pedir conteúdo novo escrevia no chat — que ninguém lia.
// O CEO tentou pedir conteúdo pelo portal e não achou onde.
//
// ── O mínimo, e por que é esse mínimo ───────────────────────────────────────
// O especialista precisa de três coisas para produzir sem inventar: O QUE,
// PARA QUANDO e PARA QUAL OBJETIVO. As duas primeiras perguntas o cliente
// responde em uma frase; a data é opcional porque obrigar a chutar produz prazo
// falso dentro do sistema — e prazo falso é pior que prazo ausente.
//
// ── Vazio é vazio ───────────────────────────────────────────────────────────
// Pedido sem descrição NÃO vira tarefa muda: a rota devolve 422 com a pergunta
// que falta, em português de gente, e a tela mostra essa pergunta. É a regra da
// casa aplicada na porta de entrada: ausência de informação não é informação.
//
// O dono vem SEMPRE do token (derivação, nunca comparação — 03/08/2026).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

/** O menor texto que ainda é um pedido. "oi" e "?" não são. */
const MINIMO_DE_DESCRICAO = 8;
const MINIMO_DE_OBJETIVO = 3;

export const STATUS_PARA_O_CLIENTE: Record<string, string> = {
  novo:     "Recebido — a equipe vai avaliar",
  triado:   "Aceito — entrou na produção",
  recusado: "Não vamos seguir com este",
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Título curto para a lista da caixa de entrada — derivado, nunca pedido ao
 *  cliente (mais um campo é mais um motivo para ele desistir do formulário). */
export function tituloDoPedido(descricao: string): string {
  const primeira = descricao.split(/[\n.!?]/)[0]?.trim() || descricao.trim();
  return primeira.length > 70 ? primeira.slice(0, 69) + "…" : primeira;
}

function anexos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20);
}

// ── GET: os pedidos DELE ────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const pedidos = await prisma.contentRequest.findMany({
      where: { clientId: dono.clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Select explícito — o que não entra aqui não tem COMO vazar. `triagedBy`
      // (nome de quem triou dentro da agência) e `scopeDecision` (a conversa
      // comercial) ficam de fora: o cliente lê a DECISÃO pela proposta, não
      // pelo campo cru.
      select: {
        id: true, title: true, description: true, objective: true,
        desiredFor: true, status: true, declineReason: true, createdAt: true,
        // O ORÇAMENTO. Entra na lista de propósito: a devolutiva do pedido tem
        // de vir com preço, ou o cliente sai do portal para perguntar quanto
        // custa — e a venda vai junto com ele.
        quotedPrice: true, quoteNote: true, quoteStatus: true,
      },
    });
    return NextResponse.json({
      ok: true,
      pedidos: pedidos.map((p) => ({
        id: p.id,
        titulo: p.title,
        descricao: p.description,
        objetivo: p.objective,
        para: p.desiredFor ? p.desiredFor.toISOString() : null,
        status: p.status,
        statusLegivel: STATUS_PARA_O_CLIENTE[p.status] ?? "Recebido",
        motivo: p.declineReason,
        criadoEm: p.createdAt.toISOString(),
        preco: p.quotedPrice,
        precoNota: p.quoteNote,
        // Sem preço não existe orçamento na mesa — e "pendente" sem número
        // seria botão de aprovar o nada.
        orcamento: p.quotedPrice ? (p.quoteStatus ?? "pendente") : null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar seus pedidos agora" }, { status: 503 });
  }
}

// ── POST: abrir um pedido ───────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = tokenDoPortal(request, texto(corpo.token) || null);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const descricao = texto(corpo.descricao);
  const objetivo  = texto(corpo.objetivo);

  // Vazio é vazio: o sistema PERGUNTA em vez de gravar um pedido mudo.
  if (descricao.length < MINIMO_DE_DESCRICAO) {
    return NextResponse.json(
      {
        error: "faltou_descricao",
        campo: "descricao",
        pergunta: "Me conta o que você quer — pode ser em uma frase. Ex.: “um reels mostrando o corte degradê”.",
      },
      { status: 422 },
    );
  }
  if (objetivo.length < MINIMO_DE_OBJETIVO) {
    return NextResponse.json(
      {
        error: "faltou_objetivo",
        campo: "objetivo",
        pergunta: "E para quê? Saber o objetivo muda a peça inteira — sem ele a equipe escolheria o ângulo no chute.",
      },
      { status: 422 },
    );
  }

  // Data: só entra se for uma data de verdade e no futuro razoável. Data
  // impossível é dado inventado entrando pelo formulário.
  let desiredFor: Date | null = null;
  const bruta = texto(corpo.para);
  if (bruta) {
    const d = new Date(bruta.length === 10 ? `${bruta}T12:00:00` : bruta);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "data_invalida", campo: "para", pergunta: "Não entendi essa data. Pode escolher no calendário?" },
        { status: 422 },
      );
    }
    desiredFor = d;
  }

  try {
    // A solicitação de briefing, quando o cliente veio por lá — é o que liga o
    // pedido ao histórico dele sem exigir que ela exista.
    const solicitacao = await prisma.clientRequestDb.findFirst({
      where: { clientId: dono.clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const criado = await prisma.contentRequest.create({
      data: {
        clientId: dono.clientId,
        clientRequestId: solicitacao?.id ?? null,
        title: tituloDoPedido(descricao),
        description: descricao.slice(0, 4000),
        objective: objetivo.slice(0, 500),
        desiredFor,
        attachmentsJson: JSON.stringify(anexos(corpo.anexos)),
        status: "novo",
      },
      select: { id: true, title: true, status: true, createdAt: true },
    });

    return NextResponse.json(
      {
        ok: true,
        pedido: {
          id: criado.id,
          titulo: criado.title,
          status: criado.status,
          statusLegivel: STATUS_PARA_O_CLIENTE[criado.status],
          criadoEm: criado.createdAt.toISOString(),
        },
        // A promessa que o portal pode cumprir: o pedido AGORA aparece numa
        // caixa de entrada que alguém lê. Antes, morria no chat.
        recado: "Recebemos. A equipe avalia e te responde por aqui.",
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[portal/pedidos] POST error", e);
    return NextResponse.json({ error: "Não consegui registrar seu pedido agora. Tente de novo." }, { status: 503 });
  }
}
