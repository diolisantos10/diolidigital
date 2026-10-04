// GET /api/agency/clients/[id]/marca/o-que-a-producao-le — CONFERÊNCIA EM
// PRODUÇÃO (CEO, 04/10/2026): "dizer se a legenda e a arte já recebem os
// valores da ficha". Devolve EXATAMENTE o que a produção lê desta marca, pelas
// mesmas funções que a produção chama — nada recalculado aqui:
//   • `legenda`: o contrato de marca (`contratoDeMarca`) que calendário,
//     semana e legenda recebem, com o que não coube (`cortado`);
//   • `arte`: a linha da ficha que entra no prompt da imagem (`lerMarca`).
// Só leitura, equipe da agência. Notas internas nunca entram em nenhum dos dois.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { lerMarca } from "@/lib/agency/execution/artes";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff", "design_staff"]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [contrato, marca] = await Promise.all([contratoDeMarca(id), lerMarca(id)]);
  return NextResponse.json({
    legenda: {
      texto: contrato.texto,
      recebeAFicha: contrato.texto.includes("A MARCA, PELA FICHA"),
      cortado: contrato.cortado,
      lacunas: contrato.lacunas,
      naoConstituida: contrato.naoConstituida,
    },
    arte: {
      fichaDaImagem: marca.fichaDaImagem ?? "",
      cores: marca.cores,
      tom: marca.tom,
    },
  });
}
