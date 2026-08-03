// /api/backup — o estado das cópias, e o botão de fazer uma agora.
//
// GET  → quantas cópias existem, quando foi a última, e a LIMITAÇÃO por escrito.
// POST → força uma cópia agora (antes de uma migration arriscada, por exemplo).
//
// Backup que ninguém olha é backup que ninguém descobre que parou. Esta rota
// existe para o painel poder mostrar "última cópia há 3h" — e para a ausência
// dela virar alarme, não silêncio.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { fazerBackup, estadoDoBackup } from "@/lib/agency/backup";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error } = await requireSession(["master"]);
  if (error) return error;

  const e = await estadoDoBackup();
  return NextResponse.json({
    ...e,
    // O número que importa no painel: passou de 26h sem cópia, alguma coisa
    // está errada (o relógio faz uma por dia).
    atrasado: e.horasDesdeOUltimo === null || e.horasDesdeOUltimo > 26,
  });
}

export async function POST(): Promise<NextResponse> {
  const { error } = await requireSession(["master"]);
  if (error) return error;

  const r = await fazerBackup();
  return r.ok
    ? NextResponse.json(r)
    : NextResponse.json({ error: r.erro }, { status: 500 });
}
