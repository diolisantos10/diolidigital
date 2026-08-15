// A trava de SERVIDOR do workspace do cliente.
//
// Guardrail 4 da casa: "prompt é aviso; código é trava". O botão desabilitado
// da tela é aviso — quem manda um POST direto nunca viu o botão. Esta função é
// a trava, e ela consulta o MESMO mapa que a tela consultou (`permissoes.ts`).
// Duas listas de papel, uma na tela e outra na rota, divergem em duas semanas.

import { NextResponse } from "next/server";
import type { AgencyRole } from "@/lib/agency/roles";
import type { ClientWorkspaceArea } from "@/components/agency/clients/workspace/client-workspace-tabs";
import { MOTIVO_SEM_ESCRITA, podeEscreverNaArea } from "./permissoes";

/** Devolve `null` quando pode. Devolve o 403 pronto quando não pode. */
export function exigirEscritaNaArea(
  role: AgencyRole,
  area: ClientWorkspaceArea,
): NextResponse | null {
  if (podeEscreverNaArea(role, area)) return null;
  // O 403 carrega o motivo em português (guardrail 6: o alerta carrega a
  // própria evidência). Quem recebe isto num log precisa saber de quem é a
  // área, não só que foi barrado.
  return NextResponse.json(
    { error: "Forbidden", area, reason: MOTIVO_SEM_ESCRITA[area] },
    { status: 403 },
  );
}

/** Integração NUNCA se altera por rota interna — nem com papel Master. Existe
 *  como função própria porque `exigirEscritaNaArea(role, "somente-leitura")`
 *  já barraria, mas o nome desta diz o que está sendo protegido. */
export function recusarAlteracaoDeIntegracao(): NextResponse {
  return NextResponse.json(
    {
      error: "Forbidden",
      area: "somente-leitura",
      reason: MOTIVO_SEM_ESCRITA["somente-leitura"],
    },
    { status: 403 },
  );
}
