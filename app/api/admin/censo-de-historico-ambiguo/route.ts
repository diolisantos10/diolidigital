// GET /api/admin/censo-de-historico-ambiguo — QUANTO A CERCA ESCONDE.
//
// ── Por que esta rota existe (15/08/2026) ───────────────────────────────────
// A cerca de dono da conversa do portal esconde as mensagens LEGADAS (sem
// `clientId` escrito) que estão presas a uma solicitação que já foi de outro
// cliente. É a escolha declarada: entre esconder histórico ambíguo e mostrar a
// conversa de outro, esconde-se.
//
// O `qualidade` barrou o merge com a pergunta certa: **um P0 cujo custo
// declarado é "esconder histórico" não se mescla sem o número.** E o número não
// dá para tirar do lado de fora: o banco de produção mora num volume dentro do
// contêiner. É o mesmo motivo (e o mesmo padrão de duas portas) do censo de
// `/api/agency/material-de-marca?censo=1`.
//
// **SOMENTE LEITURA.** Não migra, não carimba, não apaga. Só GET.
// A mesma conta roda offline em `scripts/censo-de-historico-ambiguo.mts`.

import { NextRequest, NextResponse } from "next/server";
import { censoDeHistoricoAmbiguo } from "@/lib/agency/portal/solicitacao-que-mudou-de-dono";
import { requireSession } from "@/lib/auth/api-guard";
import { segredoConfere } from "@/lib/security/crypto";

/** Segredo ausente do ambiente → NÃO abre. Rota que se abre sozinha quando a
 *  variável some não tem trava nenhuma. */
function segredoDeCronConfere(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  return segredoConfere(token, cronSecret);
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!segredoDeCronConfere(request)) {
    const { error } = await requireSession(["master"]);
    if (error) return error;
  }

  try {
    // Fonte ÚNICA, a mesma da cerca — o censo não pode medir uma coisa e a
    // trava outra. Ver `lib/agency/portal/solicitacao-que-mudou-de-dono.ts`.
    const censo = await censoDeHistoricoAmbiguo();
    return NextResponse.json({
      ...censo,
      leiaAssim: {
        numeroPrincipal: "semDonoEscrito",
        oQueEle:
          "As mensagens que NÃO têm dono escrito. É o universo de risco: toda linha anterior"
          + " ao carimbo cai aqui. `mensagensOcultadasPelaCerca` é o CUSTO da trava, não o risco.",
        cuidado:
          "0 em `mensagensOcultadasPelaCerca` NÃO significa 'não há contaminação' —"
          + " significa que não há evidência de troca de dono nas solicitações de hoje.",
      },
    });
  } catch (e) {
    // Falha de leitura NÃO vira zero: "não consegui contar" e "não há nenhuma"
    // são fatos opostos, e o segundo liberaria o merge por engano.
    console.error("[censo-historico] falhei ao contar", e);
    return NextResponse.json({ error: "não consegui contar", medido: false }, { status: 503 });
  }
}
