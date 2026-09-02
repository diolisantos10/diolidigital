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
// forma: o papel na Célula é DADO DECLARADO, mas vem do BANCO
// (`User.papelNaCelula`, atribuído só por quem tem autoridade `master` — ver
// `lib/agency/celula/papel-do-usuario.ts`), nunca inferido de autoridade e,
// desde 02/09/2026, nunca mais de um header — um header é forjável por
// qualquer chamador, e era exatamente esse o furo.
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
import { buscarPapelNaCelula } from "@/lib/agency/celula/papel-do-usuario";
import { autoridadeDoPapel, ehPapelDaAgencia, type AgencyRole } from "@/lib/agency/roles";
import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";

/**
 * `ehPapelDaAgencia` ANTES de qualquer coisa que chame `credencialDe`.
 *
 * Achado ao corrigir `app/api/agency/celula/papeis/route.ts` em 02/09/2026:
 * `session.role` é TIPADO como `AgencyRole`, mas `getSession()` não confere
 * a FORMA do payload em runtime — uma sessão `role: "client"` (JWT válido de
 * conta de portal) chega aqui com esse valor de verdade. `/api/**` fica FORA
 * do `proxy.ts` (`PUBLIC_PATHS` inclui `"/api/"`), então esta rota é quem
 * tem que recusar. Sem este guarda, `autoridadeDoPapel("client")` EXPLODE
 * (`"client"` não existe em `PERFIL_DO_PAPEL`) em vez de recusar — um 500
 * em vez de um 403 limpo.
 */
function recusaSeNaoForPapelDaAgencia(role: string): NextResponse | null {
  if (!ehPapelDaAgencia(role)) {
    return NextResponse.json({ error: "cliente não acessa `/agency/**`." }, { status: 403 });
  }
  return null;
}

/**
 * A credencial da Célula, montada a partir da sessão.
 *
 * Copiado de `app/api/agency/oportunidades/[id]/funil/route.ts` — mesma
 * função, mesma razão de existir. O papel vem do BANCO
 * (`buscarPapelNaCelula`, que lê `User.papelNaCelula`) — nunca de um header:
 * um header é forjável por qualquer chamador, e não há fallback para ele
 * aqui de propósito. Reintroduzir "se não tiver no banco, tenta o header"
 * reabriria o mesmo furo.
 *
 * `autoridade` vem de `autoridadeDoPapel(session.role)`, NUNCA de um cast
 * direto. Achado do `experiencia` em 02/09/2026: `session.role` é
 * `AgencyRole` (vocabulário em português — "diretor", "executivo_comercial"…)
 * e `Autoridade` é outro vocabulário (`"director"`, `"department_member"`…).
 * Um `as Autoridade` produzia, para qualquer conta que não fosse "master" (as
 * duas grafias colidem por acidente), um valor que não batia com NENHUMA
 * chave de `Autoridade` — as travas incondicionais de `papeis.ts` que
 * comparam `c?.autoridade === "director"` nunca disparavam para essas
 * contas. `autoridadeDoPapel` é o conversor certo, já usado em
 * `app/api/agency/celula/papeis/route.ts`.
 */
async function credencialDe(session: { userId: string; role: AgencyRole; workspaceId: string }): Promise<Credencial> {
  const papel = await buscarPapelNaCelula(session.userId);
  return {
    autoridade: autoridadeDoPapel(session.role),
    departamentos: ["client-service-sdr"] as DepartamentoId[],
    papelDeclaradoNaCelula: papel ?? undefined,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const recusa = recusaSeNaoForPapelDaAgencia(session.role);
  if (recusa) return recusa;

  const leitura = podeNaCelula(await credencialDe(session), "ler_a_celula");
  if (!leitura.pode) {
    return NextResponse.json({ error: leitura.motivo }, { status: 403 });
  }

  const fila = await montarFilaDoDia({ workspaceId: session.workspaceId });
  return NextResponse.json(fila);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const recusa = recusaSeNaoForPapelDaAgencia(session.role);
  if (recusa) return recusa;

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
  const credencial = await credencialDe(session);
  const permissao = podeNaCelula(credencial, "autorizar_envio");
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
    credencial,
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
