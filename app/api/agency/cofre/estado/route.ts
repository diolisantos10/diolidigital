// GET /api/agency/cofre/estado — em que pé está o pareamento com o cofre.
// NUNCA devolve o segredo; só o estado e o começo do HASH (para o Diego
// reconhecer o pedido do Dioli na tela do cofre).

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { resumoDoPareamento } from "@/lib/ai/pareamento-do-cofre";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff", "design_staff"]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await resumoDoPareamento();
  const frase =
    r.estado === "aprovado" ? "IA da Control Room ligada."
    : r.estado === "pendente" ? "Aguardando aprovação no cofre."
    : "Pedido de pareamento ainda não feito.";
  return NextResponse.json({ ...r, frase });
}
