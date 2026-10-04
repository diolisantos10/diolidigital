import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { fichaDoBrandHub, gravarFichaUnica } from "@/lib/agency/esteira/ficha-unica";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const client = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
    include: { brandBrain: true },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(client.brandBrain ?? null);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const client = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Antes: mapeava 6 dos 13 campos e DESCARTAVA o resto (resumo, estilo
  // visual, referências, produtos, o que evitar, canais, notas), e só aceitava
  // cores separadas por "·". Agora passa pela ficha única: nenhum campo
  // enviado se perde, e a paleta aceita vírgula, ponto e vírgula, linha ou "·".
  await gravarFichaUnica(id, fichaDoBrandHub(body));
  const brain = await prisma.brandBrain.findUnique({ where: { clientId: id } });

  return NextResponse.json(brain);
}
