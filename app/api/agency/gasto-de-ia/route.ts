// QUANTO A AGÊNCIA GASTOU COM IA — a rota que dá o primeiro número real.
//
// É o LEITOR do `AIRunLog` instrumentado. Sem ela, as colunas de token e custo
// seriam exatamente o defeito que vieram consertar: estado gravado que ninguém
// lê.
//
// Só MASTER: o relatório soma por cliente e é informação comercial da casa.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { relatorioDeGasto } from "@/lib/ai/relatorio-de-gasto";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;

  const bruto = Number(new URL(request.url).searchParams.get("dias"));
  // Teto de 365: a consulta varre o log inteiro da janela, e o log cresce para
  // sempre num SQLite em volume. Janela sem teto é varredura sem teto.
  const dias = Number.isFinite(bruto) && bruto > 0 ? Math.min(Math.floor(bruto), 365) : 30;

  return NextResponse.json(await relatorioDeGasto(session.workspaceId, dias));
}
