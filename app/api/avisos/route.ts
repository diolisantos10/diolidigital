// /api/avisos — a fila de avisos que precisa de mão humana.
//
// GET   → o que o cliente ainda não sabe, com o texto pronto para copiar.
// PATCH → "eu mandei" ou "não precisa mais".
//
// Esta fila é o que impede o pior cenário da agência: o projeto parado
// esperando um cliente que nunca soube que precisava fazer algo. Enquanto o
// canal automático não estiver configurado (o WhatsApp da Meta exige template
// aprovado fora da janela de 24h), é por aqui que o aviso sai.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { filaDeAvisos, marcarComoEnviado, dispensar } from "@/lib/agency/esteira/avisos";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const avisos = await filaDeAvisos(session.workspaceId);
  return NextResponse.json({ ok: true, total: avisos.length, avisos });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  let body: { id?: string; acao?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  if (!body.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const quem = session.email ?? session.userId ?? "equipe";

  if (body.acao === "enviei") {
    const ok = await marcarComoEnviado(body.id, quem);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (body.acao === "dispensar") {
    const ok = await dispensar(body.id, quem);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }

  return NextResponse.json({ error: "ação inválida — use 'enviei' ou 'dispensar'" }, { status: 400 });
}
