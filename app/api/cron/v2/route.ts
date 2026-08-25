// POST /api/cron/v2 — a porta HTTP da batida da V2.
//
// A batida em si mora em `lib/agency/v2-recovery/batida-da-v2.ts`, e o motivo
// está escrito lá: esta rota **nunca teve um chamador** desde o Marco 6, e o
// outbox — que é quem entrega o aviso de atraso ao cliente — ficava mudo por
// causa disso. Quem bate de verdade hoje é o despertador. Esta rota continua
// existindo porque é o lugar certo para um agendador externo (GitHub Actions,
// Railway cron) quando o CEO ligar um; ela não é a única perna, e por isso
// deixou de ser um ponto único de falha.
//
// Mesmo padrão dos outros crons: Authorization: Bearer <CRON_SECRET>.

import { NextRequest, NextResponse } from "next/server";
import { baterORelogioDaV2 } from "@/lib/agency/v2-recovery/batida-da-v2";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await baterORelogioDaV2(new Date());
  return NextResponse.json(resultado);
}
