// POST /api/portal/pedidos/orcamento — o cliente decide o orçamento.
//
// A outra metade do pedido do CEO ("a devolutiva já tem que vir com o preço"):
// se o preço aparece no portal, a decisão tem de acontecer no portal também.
// Orçamento que só pode ser aceito no WhatsApp é orçamento que espera alguém
// lembrar de cobrar resposta.
//
// TRÊS TRAVAS:
//   1. O dono vem SEMPRE do token (derivação, nunca comparação — regra da casa
//      de 03/08/2026). O `pedidoId` do corpo é conferido contra o cliente do
//      token; id de outro cliente responde 404, nunca 403 (403 confirmaria que
//      aquele id existe).
//   2. Só decide quem tem orçamento na mesa: sem `quotedPrice`, não há o que
//      aceitar — e aceitar o nada criaria compromisso sem valor combinado.
//   3. A decisão é UMA. Já decidido responde 409 com o que valeu, em vez de
//      sobrescrever em silêncio: cliente que clica duas vezes no 4G não pode
//      trocar "recusei" por "aceitei" sem saber.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";

const DECISOES = ["aceito", "recusado"] as const;
type Decisao = (typeof DECISOES)[number];

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

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

  const pedidoId = texto(corpo.pedidoId);
  const decisao = texto(corpo.decisao) as Decisao;
  if (!pedidoId) return NextResponse.json({ error: "pedidoId é obrigatório" }, { status: 400 });
  if (!DECISOES.includes(decisao)) {
    return NextResponse.json({ error: "decisao deve ser 'aceito' ou 'recusado'" }, { status: 400 });
  }

  // O `clientId` do token entra no WHERE — estar com um token válido não faz
  // de ninguém dono de um id qualquer.
  const pedido = await prisma.contentRequest.findFirst({
    where: { id: pedidoId, clientId: dono.clientId },
    select: { id: true, title: true, quotedPrice: true, quoteStatus: true },
  });
  if (!pedido) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!pedido.quotedPrice) {
    return NextResponse.json(
      { error: "Este pedido ainda não tem orçamento — a equipe está avaliando." },
      { status: 409 },
    );
  }
  if (pedido.quoteStatus && pedido.quoteStatus !== "pendente") {
    return NextResponse.json(
      { error: `Este orçamento já foi ${pedido.quoteStatus}.`, orcamento: pedido.quoteStatus },
      { status: 409 },
    );
  }

  // Escrita condicional: o estado entra no WHERE, não só no corpo. Dois cliques
  // simultâneos no celular não podem gravar duas decisões diferentes.
  const gravou = await prisma.contentRequest.updateMany({
    where: { id: pedido.id, clientId: dono.clientId, quoteStatus: "pendente" },
    data: { quoteStatus: decisao, quoteDecidedAt: new Date() },
  });
  if (gravou.count === 0) {
    return NextResponse.json({ error: "Este orçamento acabou de ser decidido." }, { status: 409 });
  }

  // A agência precisa SABER. Sem este recado, um "aprovar e fazer" ficaria só
  // como coluna no banco — que é a forma exata do beco sem saída de 04/08.
  try {
    await prisma.portalMessage.create({
      data: {
        clientId: dono.clientId,
        authorRole: "client",
        authorName: "Cliente",
        body:
          decisao === "aceito"
            ? `Aprovei o orçamento de "${pedido.title}" (R$ ${pedido.quotedPrice}). Pode fazer.`
            : `Sobre o orçamento de "${pedido.title}" (R$ ${pedido.quotedPrice}): agora não.`,
      },
    });
  } catch {
    // A decisão já está gravada — o recado é aviso, não a verdade. Falhar aqui
    // não pode desfazer o que o cliente decidiu.
  }

  // ── "PODE FAZER" TEM DE FAZER ALGUMA COISA ────────────────────────────────
  //
  // Até 06/08/2026 o aceite virava uma coluna no banco e uma frase na conversa
  // ("Aprovei o orçamento. Pode fazer.") — e nada produzia. Era o mesmo beco do
  // status "novo", uma etapa adiante: o cliente aprovou, pagou com a palavra
  // dele, e o trabalho continuou esperando alguém olhar.
  //
  // Este é o GATILHO DE APROVAÇÃO previsto no fluxo: escopo extra não é
  // produzido antes daqui, e é produzido imediatamente depois.
  let produziu = false;
  if (decisao === "aceito") {
    const { produzirPedido } = await import("@/lib/agency/esteira/producao-de-pedido");
    const r = await produzirPedido(pedido.id).catch((e: unknown) => {
      console.error("[portal/pedidos/orcamento] a produção falhou", e);
      return null;
    });
    produziu = r?.ok === true;
  }

  return NextResponse.json({ ok: true, orcamento: decisao, produziu });
}
