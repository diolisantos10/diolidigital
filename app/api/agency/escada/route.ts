// A escada de exposição, para a tela.
//
// GET  → em que degrau está cada departamento e QUANTO FALTA, em número, para
//        subir. "Falta evidência" sem o número é ruído que ninguém investiga.
// POST → subir (exige o número) ou descer (imediato, sem pergunta).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  estadoDaEscada, subirDegrau, descerDegrau, liberarCliente,
} from "@/lib/agency/escada/registro";
import { ROTULO_DO_DEGRAU, JANELA_DE_EVIDENCIA_DIAS, CRITERIO } from "@/lib/agency/escada/degraus";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const degraus = await estadoDaEscada(session.workspaceId);
  return NextResponse.json({
    janelaDias: JANELA_DE_EVIDENCIA_DIAS,
    criterio: CRITERIO,
    rotulos: ROTULO_DO_DEGRAU,
    departamentos: degraus.map((d) => ({
      departmentId: d.departmentId,
      degrau: d.degrau,
      rotulo: ROTULO_DO_DEGRAU[d.degrau],
      clientesLiberados: d.clientesLiberados.length,
      motivo: d.motivo,
      decididoPor: d.decididoPor,
      atualizadoEm: d.atualizadoEm,
      // O que falta para subir — a razão de esta rota existir.
      proximoDegrau: d.subida?.alvo ?? null,
      podeSubir: d.subida?.pode ?? false,
      faltam: d.subida?.faltam ?? [],
      contagem: d.subida?.contagem ?? null,
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body.departmentId === "string" ? body.departmentId : "";
  if (!departmentId) return NextResponse.json({ error: "departmentId obrigatório" }, { status: 400 });
  const quem = `usuario:${session.userId ?? "desconhecido"}`;

  if (body.acao === "subir") {
    const r = await subirDegrau({ workspaceId: session.workspaceId, departmentId, quem });
    // 409 e não 400: o pedido está bem formado — o que falta é EVIDÊNCIA, e a
    // resposta carrega exatamente quanto.
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  }
  if (body.acao === "descer") {
    const r = await descerDegrau({
      workspaceId: session.workspaceId, departmentId, quem,
      para: body.para, motivo: typeof body.motivo === "string" ? body.motivo : "sem motivo declarado",
    });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (body.acao === "liberar_cliente" && typeof body.clientId === "string") {
    const r = await liberarCliente({ workspaceId: session.workspaceId, departmentId, clientId: body.clientId, quem });
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  }
  // A decisão do dono já é aplicada sozinha pelo relógio da agência a cada
  // rodada — esta ação existe só para NÃO ESPERAR os 5 minutos. Ela não recebe
  // parâmetro nenhum de propósito: o que vale é o que está declarado em
  // `DECISOES_DO_DONO`, versionado. Um endpoint que aceitasse departamento e
  // cliente por corpo de requisição seria a porta dos fundos da escada.
  if (body.acao === "aplicar_decisoes_do_dono") {
    const { aplicarDecisoesDoDono } = await import("@/lib/agency/escada/decisoes-do-dono");
    const r = await aplicarDecisoesDoDono(session.workspaceId);
    return NextResponse.json(r, { status: 200 });
  }
  return NextResponse.json(
    { error: "acao inválida (subir | descer | liberar_cliente | aplicar_decisoes_do_dono)" },
    { status: 400 },
  );
}
