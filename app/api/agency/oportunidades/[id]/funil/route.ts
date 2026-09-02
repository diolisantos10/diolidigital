// ─── A ROTA DO FUNIL — o primeiro ponto em que `app/` toca a Célula ────────
//
// Item obrigatório do CEO: "tela e rotas operacionais". Até 30/08/2026 **nada
// em `app/` importava a Célula**: `avancarFunil` não tinha um único chamador
// fora de teste. Um motor sem porta de entrada é código que ninguém executa —
// e esta casa já teve uma capacidade inteira nesse estado (`publicarNoGoogle`,
// que está declarada como ausente exatamente por isso).
//
// Evolui o Radar que já existe em `/agency/oportunidades`, e não abre sistema
// paralelo: mesma família de rota, mesma guarda de sessão, mesmo escopo de
// workspace.
//
// ── AS TRÊS GUARDAS, E A ORDEM DELAS É DELIBERADA ─────────────────────────
//   1. SESSÃO   — quem não entrou não passa;
//   2. POSSE    — o `id` vem da URL, e id de outro workspace é 404, nunca 403.
//                 403 confirmaria que o recurso existe, o que já é um vazamento;
//   3. PAPEL    — avançar o funil é ação da Célula e passa por `podeNaCelula`.
//
// A posse vem ANTES do papel de propósito: perguntar "você pode?" sobre um
// recurso que não é seu já entrega que ele existe.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { estadoDoFunil, trilhaDoFunil, avancarFunil } from "@/lib/agency/celula/trilha";
import { podeNaCelula, type Credencial } from "@/lib/agency/celula/papeis";
import { buscarPapelNaCelula } from "@/lib/agency/celula/papel-do-usuario";
import { autoridadeDoPapel, ehPapelDaAgencia, type AgencyRole } from "@/lib/agency/roles";
import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";

/**
 * `ehPapelDaAgencia` ANTES de qualquer coisa que chame `credencialDe`.
 *
 * Mesma correção de `app/api/agency/oportunidades/fila-diaria/route.ts` —
 * ver o comentário lá para o porquê: `/api/**` fica fora do `proxy.ts`, e
 * `autoridadeDoPapel("client")` explode em vez de recusar.
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
 * O papel na Célula é DADO DECLARADO — vem do BANCO (`User.papelNaCelula`,
 * lido por `buscarPapelNaCelula`), atribuído só por quem tem autoridade
 * `master` (ver `app/api/agency/celula/papeis/route.ts`), não do `role` da
 * sessão. Derivar "gerente" de `role: master` faria o CEO aprovar a própria
 * fala, que é justamente o que `papeis.ts` impede. Até 02/09/2026 este dado
 * vinha de um header HTTP (`x-papel-na-celula`) que qualquer chamador podia
 * forjar — não há fallback para ele aqui de propósito.
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
    // Enquanto a lotação por departamento não vier do banco, quem é da casa é
    // tratado como do departamento da Célula para efeito de LEITURA — e o papel
    // declarado continua sendo o que decide ESCRITA. Sem o papel, `papeis.ts`
    // devolve `null` e toda ação de escrita é barrada.
    departamentos: ["client-service-sdr"] as DepartamentoId[],
    papelDeclaradoNaCelula: papel ?? undefined,
  };
}

/** Confere posse ANTES de qualquer coisa. `null` = não é deste workspace. */
async function oportunidadeDoWorkspace(id: string, workspaceId: string) {
  return prisma.oportunidade.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const recusa = recusaSeNaoForPapelDaAgencia(session.role);
  if (recusa) return recusa;

  const { id } = await ctx.params;
  if (!(await oportunidadeDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });
  }

  const leitura = podeNaCelula(await credencialDe(session), "ler_a_celula");
  if (!leitura.pode) {
    return NextResponse.json({ error: leitura.motivo }, { status: 403 });
  }

  const [estado, trilha] = await Promise.all([estadoDoFunil(id), trilhaDoFunil(id)]);
  return NextResponse.json({ oportunidadeId: id, estado, trilha });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const recusa = recusaSeNaoForPapelDaAgencia(session.role);
  if (recusa) return recusa;

  const { id } = await ctx.params;
  if (!(await oportunidadeDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });
  }

  // Avançar o funil é ESCRITA. Só quem tem papel na Célula.
  const permissao = podeNaCelula(await credencialDe(session), "autorizar_envio");
  if (!permissao.pode) {
    return NextResponse.json({ error: permissao.motivo }, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const c = (corpo ?? {}) as Record<string, unknown>;

  // `para`, `origem` e `justificativa` NÃO são validados aqui: quem valida é
  // `avancarFunil`, que é a fonte única da regra. Repetir a validação na rota
  // criaria duas verdades sobre a mesma coisa, e um dia elas divergiriam.
  const r = await avancarFunil({
    workspaceId: session.workspaceId,
    oportunidadeId: id,
    para: c.para,
    // O autor é da SESSÃO, nunca do corpo: aceitar autor do cliente da API
    // deixaria qualquer um assinar a trilha com o nome de outro.
    autor: session.userId,
    origem: c.origem,
    justificativa: c.justificativa,
  });

  if (!r.ok) {
    return NextResponse.json({ error: r.motivo, codigo: r.codigo }, { status: 422 });
  }
  return NextResponse.json({ ok: true, de: r.de, para: r.para });
}
