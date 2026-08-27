// GET /api/portal/briefing/proposta — a proposta que o cliente vai ler para decidir.
//
// ═══ POR QUE ESTA ROTA EXISTE ════════════════════════════════════════════════
//
// `POST /api/portal/briefing/aceite` — a porta do "cliente aceitou?" — já
// existia, já estava no ar e já era testada. Medido em 24/08/2026, por busca no
// código inteiro: **nenhuma tela a chamava.** As únicas referências a ela eram
// o teste e o arnês do cliente falso. A casa construiu a fechadura, guardou a
// chave, e não pôs porta na parede.
//
// Esta rota é a metade que faltava: o que o cliente PRECISA VER antes de
// decidir. Nada mais que isso.
//
// ═══ AS TRAVAS, TODAS HERDADAS ══════════════════════════════════════════════
//
//   1. **O dono vem do token** — derivação, nunca comparação (regra da casa de
//      03/08/2026). Não existe parâmetro de id nesta rota: não há o que forjar.
//   2. **Nada interno sai.** O corpo é o MESMO texto que já foi escrito na
//      conversa do portal e mandado por e-mail — em português, sem id, sem
//      custo interno, sem nome de sistema. É `textoDoOrcamento`, a única régua.
//   3. **Só lê.** Nenhuma escrita, nenhuma decisão. Quem decide é o POST.
//   4. **`decidivel` é FATO, não convite.** Ele só é `true` quando o pedido
//      está de fato esperando a decisão. Pedido já decidido devolve o que valeu
//      — e a tela não desenha botão nenhum. Ausência de decisão nunca vira
//      decisão.
//
// ⚠️ Esta rota NÃO é o portal de 11 abas. Aquele exige um `Client`, e aqui o
// `Client` ainda não existe — é justamente o aceite que o faz nascer.

import { avisoDeAgendamentoManual } from "@/lib/agency/esteira/aviso-de-agendamento-manual";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { textoDoOrcamento, estimativaEntregue } from "@/lib/agency/esteira/orcamento-do-briefing";
import { STATUS_ACEITO, ESPERANDO_DECISAO_DA_PROPOSTA } from "@/lib/agency/esteira/caminho-automatico";

export const dynamic = "force-dynamic";

/** Os estados em que a proposta ESTÁ na mesa esperando o cliente.
 *
 *  A lista MUDOU DE ENDEREÇO em 26/08/2026 e continua a mesma: ela agora mora
 *  em `esteira/caminho-automatico.ts`, porque quem ESCREVE a decisão passou a
 *  ler exatamente esta — e era a falta disso que deixava a casa dizer
 *  "decidido" aqui e decidir de novo lá. Ver o comentário na declaração. */
const ESPERANDO_DECISAO = ESPERANDO_DECISAO_DA_PROPOSTA;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  // Mesma gramática do POST irmão: o token do briefing aponta a SOLICITAÇÃO; um
  // token de cliente já existente aponta a solicitação mais recente dele.
  const doToken = acesso.record.clientRequestId ?? null;
  const doCliente = acesso.record.clientId ?? null;
  const pedido = doToken
    ? await prisma.clientRequestDb.findUnique({ where: { id: doToken } })
    : doCliente
      ? await prisma.clientRequestDb.findFirst({ where: { clientId: doCliente }, orderBy: { createdAt: "desc" } })
      : null;
  if (!pedido) return NextResponse.json({ error: "Proposta não encontrada" }, { status: 404 });

  const e = estimativaEntregue(pedido.briefingJson);
  if (!e) {
    // Sem número entregue não há proposta para decidir — e dizer isso é melhor
    // que desenhar uma tela vazia com dois botões.
    return NextResponse.json({
      negocio: pedido.businessName ?? "",
      texto: null,
      decidivel: false,
      status: pedido.status,
      motivo: "a proposta ainda está sendo montada",
    });
  }

  return NextResponse.json({
    negocio: pedido.businessName ?? "",
    // Sem link: quem lê isto JÁ está na página da proposta.
    texto: textoDoOrcamento(pedido.businessName ?? "", e, null, await avisoDeAgendamentoManual()),
    decidivel: ESPERANDO_DECISAO.includes(pedido.status),
    status: pedido.status,
    jaAceito: pedido.status === STATUS_ACEITO,
    jaRecusado: pedido.status === "rejected",
  });
}
