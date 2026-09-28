// GET/PUT /api/agency/clients/[id]/drive — A PASTA DA MARCA NO GOOGLE DRIVE.
//
// GET → o link cadastrado, a autorização escrita do cliente (texto + data), a
//       última sincronização, e se a conta de serviço da casa está configurada
//       (e-mail — NUNCA a chave).
// PUT → só "master" grava. Exige o texto de autorização junto do link: sem
//       autorização escrita não existe consentimento registrado, e
//       `autorizacaoDriveEm` é gravado com a hora desta chamada.
//
// Guarda igual a `/api/agency/clients/[id]/pacote/route.ts`: sessão
// obrigatória, nunca sessão de portal, CSRF na mutação, rate limit, e a posse
// do cliente vem de `posse-do-cliente.ts` — 404, nunca 403, para cliente de
// outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { credencialDaContaDeServico, idDaPasta } from "@/lib/integrations/google/drive-conta-de-servico";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  // Sessão de portal nunca lê a tela administrativa do Drive.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cliente = await prisma.client.findUnique({
    where: { id },
    select: {
      pastaDriveUrl: true,
      autorizacaoDriveTexto: true,
      autorizacaoDriveEm: true,
      driveSincronizadoEm: true,
    },
  });

  const cred = credencialDaContaDeServico();

  return NextResponse.json({
    pastaDriveUrl: cliente?.pastaDriveUrl ?? null,
    autorizacaoDriveTexto: cliente?.autorizacaoDriveTexto ?? null,
    autorizacaoDriveEm: cliente?.autorizacaoDriveEm ?? null,
    driveSincronizadoEm: cliente?.driveSincronizadoEm ?? null,
    contaDeServico: cred.ok
      ? { configurada: true, email: cred.email }
      : { configurada: false },
  });
}

const PODEM_GRAVAR_DRIVE = ["master"] as const;

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GRAVAR_DRIVE]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`drive-da-marca:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gravações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const pastaDriveUrl = typeof (corpo as Record<string, unknown>).pastaDriveUrl === "string"
    ? ((corpo as Record<string, unknown>).pastaDriveUrl as string).trim()
    : "";
  const autorizacaoDriveTexto = typeof (corpo as Record<string, unknown>).autorizacaoDriveTexto === "string"
    ? ((corpo as Record<string, unknown>).autorizacaoDriveTexto as string).trim()
    : "";

  if (!pastaDriveUrl) {
    return NextResponse.json({ error: "o link da pasta do Drive é obrigatório" }, { status: 400 });
  }
  if (!idDaPasta(pastaDriveUrl)) {
    return NextResponse.json({ error: "o link da pasta do Drive não parece válido" }, { status: 400 });
  }
  if (!autorizacaoDriveTexto) {
    return NextResponse.json(
      { error: "o texto de autorização do cliente é obrigatório — sem ele não há consentimento registrado" },
      { status: 400 },
    );
  }

  await prisma.client.update({
    where: { id },
    data: {
      pastaDriveUrl,
      autorizacaoDriveTexto,
      autorizacaoDriveEm: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
