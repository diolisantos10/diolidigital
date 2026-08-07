// A SALA DOS AGENTES — a rota de leitura.
//
// Responde "quem trabalha neste projeto, quem está sendo usado e quem não está"
// (doutrina 20 do `dioli-brain-kit`). Só leitura: nada aqui escreve.
//
// Só MASTER, pelo mesmo motivo de `gasto-de-ia`: a sala soma custo de IA e
// custo é informação comercial da casa.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { montarSalaDosAgentes } from "@/lib/agency/sala-dos-agentes";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;

  return NextResponse.json(await montarSalaDosAgentes(session.workspaceId));
}
