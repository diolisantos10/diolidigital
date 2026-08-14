// GET /api/meta/prontidao — POR QUE O POST NÃO SAI, a fila inteira de uma vez.
//
// Irmã de `/api/meta/diagnostico`, e elas respondem perguntas diferentes:
//   • `/diagnostico` → "a CONEXÃO do cliente está de pé?" (app, config_id, contagem)
//   • `/prontidao`   → "este POST vai ao ar, e se não vai, em qual portão ele para?"
//
// SOMENTE LEITURA. Não publica, não agenda, não corrige e não escreve nada —
// nem no banco, nem na Meta. Ver o cabeçalho de
// `lib/agency/esteira/prontidao-de-publicacao.ts` para o porquê inteiro.
//
// SEM SEGREDO: nenhum token, nenhum app secret e nenhum valor de variável de
// ambiente aparece na resposta — só presença, forma e veredito.
//
// Parâmetros:
//   ?clientId=<id>   restringe a um cliente (omitido = todos os agendados)
//   ?meta=1          mede também o que a META concedeu para o perfil
//                    (leitura `debug_token`, UMA chamada; nunca por post)
//
// Por que `?meta=1` é opt-in: um diagnóstico que fala com a Meta a cada abertura
// de tela vira ritmo de máquina por acidente — o padrão que restringiu a conta
// da agência em 03/08/2026.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { conferirProntidao } from "@/lib/agency/esteira/prontidao-de-publicacao";

/** Quem enxerga a fila de portões. Portal do cliente NUNCA — a resposta cita
 *  ids de perfil e o estado interno das travas da casa. */
const PODEM_VER = ["master", "project_manager", "social_staff"] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_VER]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const clientIdCru = url.searchParams.get("clientId");
  const medirNaMeta = url.searchParams.get("meta") === "1";

  const prontidao = await conferirProntidao({
    workspaceId: session.workspaceId,
    ...(clientIdCru === null ? {} : { clientId: clientIdCru }),
    medirNaMeta,
  });

  return NextResponse.json(prontidao);
}
