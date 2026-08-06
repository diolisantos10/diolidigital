// POST /api/cron/recompra — a régua de recompra roda sozinha (diária).
//
// Mesmo padrão do `/api/cron/radar`: Bearer <CRON_SECRET>, varredura limitada,
// nunca lança para fora. O gatilho é de TEMPO e mora no banco — não existe
// lista em memória e não existe "alguém lembra".
//
// ⚠️ O QUE ESTA ROTA NÃO FAZ: mandar mensagem por WhatsApp. Ela produz
// RASCUNHO na fila da equipe (`GET /api/avisos`) e escreve na conversa do
// portal. O porquê está por extenso em `lib/agency/esteira/recompra.ts` §3 —
// opt-in não registrável e ausência de template aprovado. Ligar o disparo
// automático exige parecer do especialista `meta`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { rodarReguaDeRecompra } from "@/lib/agency/esteira/recompra";
import { segredoConfere } from "@/lib/security/crypto";

const MAX_WORKSPACES = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron não configurado — defina CRON_SECRET" }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await prisma.agencyWorkspace.findMany({ take: MAX_WORKSPACES, select: { id: true } });

  const resultados: Array<{ workspaceId: string; avaliados: number; registrados: number; repetidos: number }> = [];
  // As linhas com o MOTIVO de quem não recebeu toque. Vão na resposta de
  // propósito: "não fiz nada" sem explicação é como a régua vira caixa-preta.
  const parados: Array<{ clientId: string; motivo: string }> = [];

  for (const ws of workspaces) {
    const r = await rodarReguaDeRecompra(ws.id).catch(() => null);
    if (!r) {
      resultados.push({ workspaceId: ws.id, avaliados: 0, registrados: 0, repetidos: 0 });
      continue;
    }
    resultados.push({ workspaceId: ws.id, avaliados: r.avaliados, registrados: r.registrados, repetidos: r.repetidos });
    for (const l of r.linhas) {
      if (l.marco === null) parados.push({ clientId: l.clientId, motivo: l.motivo });
    }
  }

  const registrados = resultados.reduce((s, r) => s + r.registrados, 0);
  const repetidos = resultados.reduce((s, r) => s + r.repetidos, 0);

  return NextResponse.json({
    ok: true,
    registrados,
    // Quantos toques a passada reconheceu como JÁ FEITOS. Num segundo disparo
    // do cron no mesmo dia, este número é igual ao `registrados` do primeiro e
    // `registrados` é zero — é assim que se enxerga a idempotência funcionando.
    repetidos,
    parados,
    resultados,
    aviso:
      "Toques entram como RASCUNHO pendente em /api/avisos. Nada foi enviado por WhatsApp: " +
      "sem opt-in registrado e sem template aprovado, o disparo automático depende de parecer do especialista `meta`.",
  });
}
