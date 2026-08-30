// POST /api/portal/pedidos/responder — A PORTA. O cliente responde a pergunta.
//
// ─── O QUE ESTA ROTA É ───────────────────────────────────────────────────────
//
// A saída de `precisa_decisao` pelo lado do CLIENTE. Até 25/08/2026 ela não
// existia: a única saída daquele estado no repositório inteiro era
// `app/api/messages/pedidos/route.ts` — a triagem manual, por sessão da
// agência, numa tela que o cliente não alcança. A casa perguntava e o cliente
// não tinha onde responder.
//
// ─── O DONO VEM DO TOKEN. SEMPRE. ────────────────────────────────────────────
//
// Não existe `clientId` de corpo nem de query aqui. `resolvePortalClient`
// deriva o cliente do token do portal, e o `where` da busca é montado com o que
// ELE devolveu — a mesma regra de `/api/portal/materiais`. Responder a pergunta
// de outro cliente muda o ESCOPO e o PREÇO do pedido dele; derivar em vez de
// comparar é o que torna isso impossível, e não um `if` que alguém pode pular.
//
// ─── E O QUE ELA NÃO FAZ ─────────────────────────────────────────────────────
//
// Não decide preço, não cria escopo, não liga departamento nenhum. Ela grava a
// resposta e devolve o pedido à TRIAGEM, que é quem tem a tabela. A escada de
// exposição, o pagamento antes da produção e as travas de quantidade continuam
// inteiros — esta porta é a resposta do cliente ENTRANDO, não uma saída de
// agente para o cliente.

import { NextRequest, NextResponse } from "next/server";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { responderPergunta } from "@/lib/agency/esteira/porta-da-pergunta";
import { STATUS_PARA_O_CLIENTE } from "../route";

export const dynamic = "force-dynamic";
// A triagem roda dentro desta requisição: a resposta que o cliente lê tem de ser
// a devolutiva de verdade (o que vai ser feito, por quanto), não um "recebemos".
export const maxDuration = 300;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = tokenDoPortal(req, texto(corpo.token) || null);
  if (!token) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const pedidoId = texto(corpo.pedidoId);
  if (!pedidoId) return NextResponse.json({ error: "pedidoId é obrigatório" }, { status: 400 });

  // O número chega como texto do formulário. "três" NÃO vira 3 aqui: a leitura
  // por extenso é do texto do PEDIDO, não da resposta a uma pergunta que mostra
  // um campo numérico. Aqui, o que não for número é 422 com a pergunta de volta.
  let numero: number | null = null;
  if (corpo.numero != null && corpo.numero !== "") {
    const n = Number(corpo.numero);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "Preciso de um número. Quantas peças são?" }, { status: 422 });
    }
    numero = n;
  }

  const r = await responderPergunta({
    clientId: dono.clientId,
    pedidoId,
    opcaoId: texto(corpo.opcaoId) || null,
    numero,
  });

  if (!r.ok) {
    return NextResponse.json(
      {
        error: r.erro,
        // A pergunta volta JUNTO do erro. Sem isso, um 422 deixaria o cliente
        // com a mensagem "não reconheci" e nenhum botão — a pergunta sem porta
        // outra vez, dentro do conserto da pergunta sem porta.
        ...(r.pergunta
          ? {
              pergunta: {
                texto: r.pergunta.pergunta,
                aceitaNumero: r.pergunta.aceitaNumero === true,
                opcoes: r.pergunta.opcoes.map((o) => ({ id: o.id, rotulo: o.rotulo })),
              },
            }
          : {}),
      },
      { status: r.codigo },
    );
  }

  return NextResponse.json({
    ok: true,
    status: r.status,
    statusLegivel: STATUS_PARA_O_CLIENTE[r.status] ?? "Recebido",
    recado: r.recado,
  });
}
