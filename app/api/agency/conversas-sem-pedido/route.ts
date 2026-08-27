// GET /api/agency/conversas-sem-pedido — AS CONVERSAS QUE PARARAM ANTES DE
// VIRAR PEDIDO, com dono e próxima ação.
//
// ─── POR QUE ESTA ROTA EXISTE NO MESMO COMMIT DO CONSERTO ───────────────────
//
// `lib/agency/comercial/conversa-sem-pedido.ts` passa a GUARDAR o escopo de
// toda conversa do SDR. Guardar sem porta de leitura seria a **sétima** trava
// sem fechadura desta casa — e a lição já custou caro: em 27/08/2026 mediu-se
// que a porta da isenção de parceria estava escrita, testada, provada por
// mutação e **404 na internet**, porque 14 commits nunca saíram de um disco.
// Antes disso, três outras: a isenção sem criador, o canal de e-mail que o tipo
// prometia e ninguém implementava, e os consertos de escopo que nenhuma tela
// chamava.
//
// **A pergunta obrigatória é "quem CHAMA isto?", e ela se responde ANTES de dar
// o conserto por fechado.** Um rastro que nenhuma tela e nenhuma rota alcançam
// é exatamente o defeito que este conserto existe para matar: dado gravado onde
// ninguém olha. É por isso que o módulo e a porta nascem juntos.
//
// ─── O QUE ELA NÃO FAZ ──────────────────────────────────────────────────────
//
//   • **Não cria pedido.** Ela LÊ. Transformar uma conversa parada em briefing
//     é fabricar o que o cliente não enviou — e o cliente 001 é a prova de que
//     essa tentação existe. Quem retoma é gente, pelo canal declarado.
//   • **Não devolve a conversa inteira.** O texto dos turnos já vive em
//     `PortalMessage`, no fio, e tem leitor próprio. Aqui vai o ESCOPO — o que
//     a pessoa contou sobre o negócio dela — porque é isso que se perdia.
//   • **Não promete retomada.** `proximaAcaoDoRastro` deriva a ação do que o
//     rastro TEM: sem canal declarado, ela diz que não há como retomar. Frase
//     constante mentiria para metade da lista.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { conversasSemPedido, proximaAcaoDoRastro } from "@/lib/agency/comercial/conversa-sem-pedido";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const bruto = Number(new URL(request.url).searchParams.get("limite"));
  const limite = Number.isFinite(bruto) && bruto > 0 ? Math.min(Math.floor(bruto), 200) : 50;

  try {
    const rastros = await conversasSemPedido(session.workspaceId, limite);
    return NextResponse.json({
      total: rastros.length,
      conversas: rastros.map((r) => ({
        fio: r.fio,
        turnos: r.turnos,
        paradaEm: r.paradaEm.toISOString(),
        contato: r.contato,
        escopo: r.escopo,
        // O dono é sempre o mesmo e é dito em voz alta: conversa parada na sala
        // é trabalho de quem atende, não da esteira. A esteira não retoma
        // conversa — ela não tem como, e fingir que tem é a promessa falsa que
        // esta casa mais pagou.
        dono: "Atendimento",
        proximaAcao: proximaAcaoDoRastro(r),
      })),
    });
  } catch (e) {
    console.error("[conversas-sem-pedido] leitura falhou", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
