// GET /api/brain/departamentos — o placar dos 6 departamentos, do banco.
// Bloco F (CEO, 04/10/2026). Ver `lib/dioli-brain/placar-dos-departamentos.ts`.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { placarDosDepartamentos, JANELA_DIAS } from "@/lib/dioli-brain/placar-dos-departamentos";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ janelaDias: JANELA_DIAS, departamentos: await placarDosDepartamentos(session.workspaceId) });
}
