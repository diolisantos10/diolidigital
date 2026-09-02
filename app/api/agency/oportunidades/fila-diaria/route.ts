// ─── A ROTA DA FILA DIÁRIA — expõe `fila-diaria.ts` por HTTP ───────────────
//
// Despacho do PM: a lógica de negócio já existe e já é testada em
// `lib/agency/celula/fila-diaria.ts` (`montarFilaDoDia` e `liberarEmBloco`).
// Esta rota é uma CASCA FINA em cima dela, para uma página (fora deste
// despacho, do especialista `interface`) consumir.
//
// Mesma família de rota da que já existe para o funil individual
// (`app/api/agency/oportunidades/[id]/funil/route.ts`) — mesma forma de
// montar a credencial, copiada literalmente de lá. Não invente uma segunda
// forma: o papel na Célula é DADO DECLARADO (header `x-papel-na-celula`),
// nunca inferido de autoridade.
//
// ── AS GUARDAS, NA ORDEM ──────────────────────────────────────────────────
//   1. SESSÃO — quem não entrou não passa;
//   2. PAPEL  — ler a fila é "ler_a_celula"; liberar é "autorizar_envio".
//
// Não há checagem de POSSE de um recurso único aqui, ao contrário da rota do
// funil: a fila é do workspace inteiro, não de uma oportunidade — o
// `workspaceId` da sessão já é o escopo, e vem SEMPRE da sessão, nunca do
// corpo da requisição (um `workspaceId` no body deixaria qualquer um pedir a
// fila de outro cliente).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { montarFilaDoDia, liberarEmBloco } from "@/lib/agency/celula/fila-diaria";
import { podeNaCelula, type Credencial } from "@/lib/agency/celula/papeis";
import type { Autoridade } from "@/lib/agency/organizacao/autoridade";
import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";

/**
 * A credencial da Célula, montada a partir da sessão.
 *
 * Copiado de `app/api/agency/oportunidades/[id]/funil/route.ts` — mesma
 * função, mesma razão de existir. Ver o comentário lá para o porquê de não
 * derivar o papel do `role` da sessão.
 */
function credencialDe(session: { role: string; workspaceId: string }, req: NextRequest): Credencial {
  const papel = req.headers.get("x-papel-na-celula");
  return {
    autoridade: session.role as Autoridade,
    departamentos: ["client-service-sdr"] as DepartamentoId[],
    papelDeclaradoNaCelula: papel ?? undefined,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const leitura = podeNaCelula(credencialDe(session, request), "ler_a_celula");
  if (!leitura.pode) {
    return NextResponse.json({ error: leitura.motivo }, { status: 403 });
  }

  const fila = await montarFilaDoDia({ workspaceId: session.workspaceId });
  return NextResponse.json(fila);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const c = (corpo ?? {}) as Record<string, unknown>;
  if (!Array.isArray(c.arquivoIds)) {
    return NextResponse.json({ error: "arquivoIds precisa ser uma lista." }, { status: 400 });
  }

  // Liberar em bloco é ESCRITA. Só quem tem papel na Célula.
  const permissao = podeNaCelula(credencialDe(session, request), "autorizar_envio");
  if (!permissao.pode) {
    return NextResponse.json({ error: permissao.motivo }, { status: 403 });
  }

  // `arquivoIds` NÃO é validado aqui além de checar que é lista: quem valida
  // item a item — existência, workspace, integridade do pacote — é
  // `liberarEmBloco`, a fonte única da regra. Repetir a validação na rota
  // criaria duas verdades sobre a mesma coisa, mesma razão pela qual a rota
  // do funil não revalida `avancarFunil`.
  const r = await liberarEmBloco({
    workspaceId: session.workspaceId,
    arquivoIds: c.arquivoIds as string[],
    prontosApresentados: Array.isArray(c.prontosApresentados)
      ? (c.prontosApresentados as string[])
      : undefined,
    credencial: credencialDe(session, request),
    // O autor é da SESSÃO, nunca do corpo: aceitar autor do cliente da API
    // deixaria qualquer um assinar a liberação com o nome de outro.
    autor: session.userId,
  });

  if (!r.ok) {
    const status = r.regra === "sem_permissao" ? 403 : 400;
    return NextResponse.json({ error: r.motivo, regra: r.regra }, { status });
  }
  return NextResponse.json({
    ok: true,
    liberados: r.liberados,
    recusados: r.recusados,
    naoSelecionados: r.naoSelecionados,
  });
}
