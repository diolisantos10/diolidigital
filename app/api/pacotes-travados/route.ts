// GET /api/pacotes-travados
//
// Os pacotes que a Qualidade barrou e que a máquina não conseguiu destravar
// sozinha. É a lista curta que o Diretor precisa ver — e a razão de ela existir:
// no primeiro projeto real, a Qualidade reprovou 2 de 6 entregas, o pacote não
// foi ao cliente (correto) e **nenhuma tela mostrava isso**. O projeto ficava
// vivo no papel e parado na prática.
//
// `esperandoDecisao` separa as duas naturezas, e a distinção é o ponto:
//   • false → a agência ainda está refazendo sozinha. Não é problema de gente.
//   • true  → esgotou as tentativas. Agora é decisão do Diretor.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { pacotesTravados } from "@/lib/agency/esteira/pacote-travado";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const travados = await pacotesTravados(session?.workspaceId);

  return NextResponse.json({
    total: travados.length,
    /** O número que importa no painel: quantos esperam VOCÊ. */
    aguardandoDecisao: travados.filter((p) => p.esperandoDecisao).length,
    pacotes: travados,
  });
}
