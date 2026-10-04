// GET/POST /api/agency/clients/[id]/avulsos — serviços avulsos do cliente.
// Ver `lib/agency/servico-avulso.ts`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { criarAvulso, centavosDe } from "@/lib/agency/servico-avulso";

export const dynamic = "force-dynamic";
const PODEM_CRIAR = ["master", "project_manager"];

async function doWorkspace(id: string, workspaceId: string) {
  return prisma.client.findFirst({ where: { id, workspaceId }, select: { id: true } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await doWorkspace(id, session.workspaceId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const servicos = await prisma.servicoAvulso.findMany({
    where: { clientId: id, workspaceId: session.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ servicos });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId || !PODEM_CRIAR.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await doWorkspace(id, session.workspaceId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { titulo?: unknown; descricao?: unknown; valor?: unknown };
  const titulo = typeof corpo.titulo === "string" ? corpo.titulo.trim() : "";
  if (!titulo) return NextResponse.json({ error: "Diga o que é o serviço." }, { status: 400 });
  const valorCentavos = centavosDe(corpo.valor);
  if (!valorCentavos) return NextResponse.json({ error: "Informe o valor (maior que zero)." }, { status: 400 });
  const servico = await criarAvulso({
    workspaceId: session.workspaceId, clientId: id, titulo,
    descricao: typeof corpo.descricao === "string" ? corpo.descricao : null,
    valorCentavos, criadoPor: session.userId,
  });
  return NextResponse.json({ servico }, { status: 201 });
}
