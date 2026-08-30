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
import type { Autoridade } from "@/lib/agency/organizacao/autoridade";
import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";

/**
 * A credencial da Célula, montada a partir da sessão.
 *
 * O papel na Célula é DADO DECLARADO — vem do cabeçalho de papel operacional,
 * não do `role` da sessão. Derivar "gerente" de `role: master` faria o CEO
 * aprovar a própria fala, que é justamente o que `papeis.ts` impede.
 */
function credencialDe(session: { role: string; workspaceId: string }, req: NextRequest): Credencial {
  const papel = req.headers.get("x-papel-na-celula");
  return {
    autoridade: session.role as Autoridade,
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

  const { id } = await ctx.params;
  if (!(await oportunidadeDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });
  }

  const leitura = podeNaCelula(credencialDe(session, request), "ler_a_celula");
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

  const { id } = await ctx.params;
  if (!(await oportunidadeDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });
  }

  // Avançar o funil é ESCRITA. Só quem tem papel na Célula.
  const permissao = podeNaCelula(credencialDe(session, request), "autorizar_envio");
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
