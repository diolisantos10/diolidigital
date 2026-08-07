// GET /api/pulso — "a agência está trabalhando?", em uma resposta.
//
// ── Por que existe ──────────────────────────────────────────────────────────
// `/api/health` responde se o PROCESSO está de pé. Não é a mesma pergunta.
// Um servidor perfeitamente vivo com o relógio da agência parado responde
// `status: ok` e não produz nada a noite inteira — foi essa a diferença que
// ninguém conseguia enxergar de fora até 06/08/2026.
//
// Aqui responde-se a pergunta do CEO: bateu? moveu? quebrou?
//
// PROTEGIDA: as mensagens de falha carregam texto de erro de produção, que pode
// citar peça e motivo. Isso não vai para a internet aberta. Aceita sessão da
// agência (é o painel que consome) ou o `CRON_SECRET` (é o monitor de fora).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { segredoConfere } from "@/lib/security/crypto";
import { lerPulso, ATRASO_QUE_ALARMA_MIN } from "@/lib/agency/pulso";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  const porSegredo = !!cronSecret && segredoConfere(token, cronSecret);
  if (!porSegredo && !(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pulso = await lerPulso();
  return NextResponse.json({
    ...pulso,
    atrasoQueAlarmaMin: ATRASO_QUE_ALARMA_MIN,
    // A frase pronta, para quem lê sem interpretar número: é ela que o painel
    // mostra e é ela que responde a pergunta de manhã.
    frase:
      pulso.haMinutos === null
        ? "🔴 O relógio da agência NUNCA bateu nesta instância — nada foi produzido sozinho."
        : pulso.ok
          ? `A agência está trabalhando — última batida há ${pulso.haMinutos} min.`
          : `🔴 O relógio da agência está PARADO há ${pulso.haMinutos} min (o normal é 5).`,
  });
}
