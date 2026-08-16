// GET /api/diretor/pendencias — a pergunta que faltava: "posso encerrar?"
//
// ORDEM DO CEO (15/08/2026): "Eles só podem parar quando não tiver mais nada
// pendente em nenhum projeto [...] e se está parado, 'ah, está parado porque
// eu não vi' — precisa de um dispositivo pra que ele detecte, ele audite
// também." `lib/agency/diretor/pendencias.ts` já julgava certo — testado e
// tudo — mas nada chamava `podeODiretorEncerrar` com dado de verdade (achado
// D-003 do essencial `qualidade`, 16/08/2026): a caixa existia, a seta não.
//
// Esta rota É a seta que falta na ponta de cima: chama o coletor (que vai ao
// banco), entrega o retrato ao veredito e devolve a resposta inteira — a
// frase, as pendências ordenadas com a mais antiga primeiro, e as falhas de
// auditoria. Nunca "ok" sem prova: se uma fonte não respondeu, o veredito diz
// isso, não "limpo".

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { coletarRetratoDasFontes } from "@/lib/agency/diretor/coletor";
import { podeODiretorEncerrar, recortarPorEscopo } from "@/lib/agency/diretor/pendencias";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession();
  if (error) return error;

  // Recorte opcional: ?escopo=dioli-digital. Sem parâmetro, devolve tudo o
  // que este produto enxerga — hoje, sempre o mesmo escopo (ver o cabeçalho
  // de lib/agency/diretor/coletor.ts sobre por que só existe um).
  const escopo = request.nextUrl.searchParams.get("escopo")?.trim();

  const retrato = await coletarRetratoDasFontes();
  const pendencias = escopo ? recortarPorEscopo(retrato.pendencias, escopo) : retrato.pendencias;

  const veredito = podeODiretorEncerrar({ pendencias, falhas: retrato.falhas });

  return NextResponse.json(veredito);
}
