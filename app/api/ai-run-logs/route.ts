import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const logs = await prisma.aIRunLog.findMany({
    where: {
      workspaceId: session.workspaceId,
      ...(departmentId ? { departmentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}

// ⚠️ NÃO EXISTE MAIS `POST` AQUI, e não deve voltar.
//
// Desde 06/08/2026 `AIRunLog` é o livro-caixa da IA da casa: tokens consumidos e
// custo estimado por chamada. Quem escreve nele é o SERVIDOR, dentro de
// `lib/ai/generate.ts`, no instante da chamada — o único lugar que sabe qual
// provedor atendeu, quantos tokens custou e se deu certo.
//
// Uma rota POST aberta ao navegador deixaria qualquer sessão inventar linhas no
// relatório de gasto. Um livro-caixa que a parte interessada pode escrever não
// prova nada. O POST anterior era, além disso, código morto: nenhum arquivo o
// chamava, e por isso a tabela estava vazia em produção desde sempre.
