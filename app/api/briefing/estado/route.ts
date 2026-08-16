// GET /api/briefing/estado?id=<clientRequestId>  — PÚBLICA, somente leitura.
//
// A tela de confirmação do briefing precisa dizer o que está acontecendo AGORA,
// e para isso precisa perguntar ao servidor. `GET /api/brain/client-requests`
// não serve: ela exige sessão de agência e devolve a conversa crua do prospect,
// o `sdrHandoffJson` e o contato. Abrir aquilo ao público para pintar uma barra
// de progresso seria trocar um defeito de texto por um vazamento.
//
// ─── O QUE ESTA ROTA DEVOLVE, E O QUE ELA NUNCA DEVOLVE ──────────────────────
//
// Devolve: o ESTADO (um de cinco rótulos), a contagem de canvases e as frases
// já montadas. Só isso.
//
// **Nunca** devolve: nome do negócio, contato, transcript, escopo, valor,
// segmento, `workspaceId` — nada que descreva o cliente. Quem tiver o id de
// outra pessoa aprende que um briefing existe e em que ponto ele está, e nada
// mais. Há teste que reprova a volta de qualquer um desses campos.
//
// O id é um cuid de 25 caracteres: não se adivinha por força bruta. Ainda assim
// a rota é limitada por IP — é pública, dispara consulta ao banco, e rota
// pública sem teto é a porta que a casa já deixou aberta antes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { rateLimited } from "@/lib/security/rate-limit";
import { lerEstadoDoBriefing, aindaMuda, type FatosDoBriefing } from "@/lib/agency/briefing/estado-do-briefing";
import { lerFalhaDeEscopo } from "@/lib/agency/briefing/falha-de-escopo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = rateLimited(request, "briefing-estado", 60, 60_000);
  if (limited) return limited as NextResponse;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  try {
    const registro = await prisma.clientRequestDb.findUnique({
      // `select` explícito, nunca o registro inteiro: é o que garante que um
      // campo novo no schema não passe a vazar por esta rota sem ninguém notar.
      where: { id },
      select: { status: true, createdAt: true, briefingJson: true },
    });

    if (!registro) {
      return NextResponse.json({ error: "Briefing não encontrado" }, { status: 404 });
    }

    const canvases = await prisma.brainArtifact.count({
      where: { clientRequestId: id, status: { in: ["draft", "approved"] } },
    });

    const fatos: FatosDoBriefing = {
      status: registro.status,
      criadoEm: registro.createdAt,
      agora: new Date(),
      canvases,
      falha: lerFalhaDeEscopo(registro.briefingJson),
    };

    const estado = lerEstadoDoBriefing(fatos);

    return NextResponse.json(
      {
        estado: estado.id,
        titulo: estado.titulo,
        detalhe: estado.detalhe,
        passos: estado.passos,
        chamaOWhatsApp: estado.chamaOWhatsApp,
        canvases,
        totalDeCanvases: 6,
        aindaMuda: aindaMuda(estado.id),
      },
      // Estado que muda não pode ser cacheado por intermediário nenhum: uma
      // resposta guardada faria a tela jurar "montando" depois de pronto.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[briefing/estado] erro de leitura", e);
    // O 503 é deliberado, e a tela o traduz. Devolver 200 com um estado
    // inventado seria repetir, em JSON, exatamente o defeito que esta frente
    // veio consertar: falar do mundo sem ter olhado para ele.
    return NextResponse.json({ error: "Não conseguimos ler o estado agora" }, { status: 503 });
  }
}
