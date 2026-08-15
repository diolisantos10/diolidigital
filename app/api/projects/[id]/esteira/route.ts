// /api/projects/[id]/esteira — o estado do projeto e os marcos que o fazem andar.
//
// GET  → em que etapa está, quem tem a bola, o que trava. É o que alimenta a
//        faixa de status da tela do projeto (e, pela rota do portal, a do cliente).
//
// POST → registra um marco: direção aprovada, pacote apresentado, pacote
//        aprovado, ou "produzir agora" (o botão manual).
//
// Os marcos ficam aqui e não espalhados pelas telas de propósito: antes, "o
// projeto andou" era efeito colateral de várias rotas, cada uma mexendo num
// pedaço — uma esquecia de avisar o cliente, outra esquecia de ligar o motor.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { statusDoProjeto } from "@/lib/agency/esteira/retrato";
import { aprovarDirecao, apresentar, aprovarPacote } from "@/lib/agency/esteira/marcos";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";

export const maxDuration = 300;

type Params = { id: string };

const MARCOS = ["aprovar_direcao", "apresentar", "aprovar_pacote", "produzir"] as const;
type Marco = (typeof MARCOS)[number];

/** O projeto é do workspace de quem está pedindo? */
async function ehDoWorkspace(projectId: string, workspaceId: string): Promise<boolean> {
  const p = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  return p !== null;
}

export async function GET(request: NextRequest, context: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  if (!(await ehDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const status = await statusDoProjeto(id);
  if (!status) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;
  const { id } = await context.params;

  if (!(await ehDoWorkspace(id, session.workspaceId))) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  let body: { marco?: string; mesmoComRessalva?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const marco = body.marco as Marco | undefined;
  if (!marco || !MARCOS.includes(marco)) {
    return NextResponse.json({ error: `marco inválido — use um de: ${MARCOS.join(", ")}` }, { status: 400 });
  }

  try {
    if (marco === "aprovar_direcao") {
      const r = await aprovarDirecao(id);
      return NextResponse.json({ ...r, status: await statusDoProjeto(id) }, { status: r.ok ? 200 : 409 });
    }

    if (marco === "apresentar") {
      const r = await apresentar(id, { mesmoComRessalva: body.mesmoComRessalva === true });
      return NextResponse.json({ ...r, status: await statusDoProjeto(id) }, { status: r.ok ? 200 : 409 });
    }

    if (marco === "aprovar_pacote") {
      // ── A AGÊNCIA NÃO SE DISFARÇA DE CLIENTE (15/08/2026) ────────────────
      // Esta é rota de SESSÃO: quem aperta aqui é alguém da casa. Até hoje o
      // marco gravava `reviewedBy: "cliente"` também por este caminho, e a
      // mesma string saía do portal do cliente — duas autorias com um nome só.
      // Aqui o carimbo diz `equipe:<email>`, que é a verdade, e ele
      // deliberadamente NÃO libera publicação: levar a peça ao perfil do
      // cliente continua exigindo o clique dele, no card dele.
      const r = await aprovarPacote(id, { tipo: "equipe", email: session.email });
      return NextResponse.json({ ...r, status: await statusDoProjeto(id) }, { status: r.ok ? 200 : 409 });
    }

    // "produzir" — o botão manual. O motor é idempotente: departamento já
    // produzido é pulado, então apertar duas vezes não duplica nada.
    const execucao = await runProjectExecution(id);
    return NextResponse.json({ ok: execucao.ok, execucao, status: await statusDoProjeto(id) });
  } catch (e) {
    console.error("[esteira] marco falhou", e);
    return NextResponse.json({ error: "Não consegui registrar o marco" }, { status: 500 });
  }
}
