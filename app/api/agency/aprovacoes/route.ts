// GET /api/agency/aprovacoes — o que espera decisão, contado do BANCO.
//
// Bloco B (CEO, 04/10/2026). O contador "Aprovações" do menu lia a cópia do
// navegador (`useAgencyStore`) e não contava a semana que espera o Diego — o
// número que mais importa para ele no celular. Agora: uma leitura, do banco,
// e as semanas do CEO só para o master (é o único que pode aprová-las).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { semanasParaOCeoAprovar } from "@/lib/agency/aprovacoes/semanas-do-ceo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ws = session.workspaceId;
  const doProjeto = { project: { workspaceId: ws } };
  const [propostas, entregas, marca, materiais, semanas] = await Promise.all([
    prisma.project.count({ where: { workspaceId: ws, proposalStatus: "sent" } }),
    prisma.deliverable.count({ where: { ...doProjeto, status: "in_review" } }),
    prisma.brandUpdate.count({ where: { client: { workspaceId: ws }, status: "pending" } }),
    prisma.materialRequest.count({ where: { ...doProjeto, status: "pending" } }),
    session.role === "master" ? semanasParaOCeoAprovar(ws) : Promise.resolve([]),
  ]).catch(() => [0, 0, 0, 0, []] as const);

  return NextResponse.json({
    total: propostas + entregas + marca + materiais + semanas.length,
    propostas, entregas, marca, materiais,
    semanas,
  });
}
