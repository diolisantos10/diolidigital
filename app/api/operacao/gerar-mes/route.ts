// POST /api/operacao/gerar-mes — gera o CALENDÁRIO DO MÊS de um cliente pela
// rotina (CEO, 04/10/2026: "fechar tudo que não depende dele").
//
// Mesma função da tela (`gerarCalendarioEditorial`): com IA se houver; sem
// IA, o plano B (stories de combo e de foto real, de modelo fixo). Só cria
// RASCUNHO ("draft"), agendado e esperando a aprovação da primeira semana —
// NUNCA publica nada.
//
// Autenticação: `Authorization: Bearer <CRON_SECRET>`, como as rotinas. NÃO é
// relógio: não mora em `app/api/cron` e não tem agendamento — só roda quando
// alguém dispara (workflow "Gerar mês do cliente").
// Corpo: { "mes": "AAAA-MM", "clientId": "…" } ou { "mes": …, "cliente": "<nome exato>" }.
// A resposta traz só CONTAGENS e motivos — nenhuma legenda, nenhum dado de cliente.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { gerarCalendarioEditorial } from "@/lib/agency/esteira/calendario-editorial";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function contar(lista: Array<{ motivo: string }>): Record<string, number> {
  const c: Record<string, number> = {};
  for (const i of lista) c[i.motivo] = (c[i.motivo] ?? 0) + 1;
  return c;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, segredo)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as { mes?: string; clientId?: string; cliente?: string } | null;
  const mes = corpo?.mes?.trim() ?? "";
  if (!MES.test(mes)) return NextResponse.json({ error: "mes precisa ser AAAA-MM" }, { status: 400 });

  const porId = corpo?.clientId?.trim();
  const porNome = corpo?.cliente?.trim();
  if (!porId && !porNome) return NextResponse.json({ error: "informe clientId ou cliente" }, { status: 400 });
  const candidatos = await prisma.client.findMany({
    where: porId ? { id: porId } : { name: porNome },
    select: { id: true, workspaceId: true },
    take: 2,
  });
  if (candidatos.length === 0) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  // Nome repetido não se adivinha: devolve conflito e pede o id.
  if (candidatos.length > 1) return NextResponse.json({ error: "mais de um cliente com esse nome — use clientId" }, { status: 409 });
  const cliente = candidatos[0]!;

  const r = await gerarCalendarioEditorial({ workspaceId: cliente.workspaceId, clientId: cliente.id, mes });
  if (!r.ok) return NextResponse.json({ ok: false, codigo: r.codigo, motivo: r.motivo }, { status: 422 });
  return NextResponse.json({
    ok: true,
    clientId: cliente.id,
    mes,
    criados: r.criados,
    jaExistiam: r.jaExistiam,
    pendentes: contar(r.pendentes),
    barradas: contar(r.barradas),
  });
}
