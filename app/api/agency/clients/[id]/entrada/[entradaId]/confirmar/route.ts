// POST /api/agency/clients/[id]/entrada/[entradaId]/confirmar — resolve o
// "preciso_confirmar" de uma entrada de material (1D-D1, 27/09/2026).
//
// Corpo: { dataAlvo: "AAAA-MM-DD", horarioAlvo?: "HH:MM", formatos?: [...] }.
// `formatos` existe porque "preciso confirmar" também cobre problema de
// FORMATO (pedir "reels" sem vídeo aproveitável) — ver o cabeçalho de
// `lib/agency/esteira/entrada-de-material.ts`.
//
// Guarda igual à rota-mãe (`.../entrada/route.ts`): sessão obrigatória, nunca
// sessão de portal, CSRF na mutação, rate limit, posse do cliente por
// `posse-do-cliente.ts` (404, nunca 403).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { InterpretacaoSchema, encaixarNoCalendario, hojeIsoBrasilia } from "@/lib/agency/esteira/entrada-de-material";

export const dynamic = "force-dynamic";

const PODEM_CONFIRMAR = ["master", "project_manager", "social_staff"] as const;

const ConfirmarSchema = z.object({
  dataAlvo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dataAlvo precisa ser AAAA-MM-DD"),
  horarioAlvo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horarioAlvo precisa ser HH:MM").optional(),
  formatos: z.array(z.enum(["feed_imagem", "carrossel", "reels", "stories"])).min(1).optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; entradaId: string }> },
): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_CONFIRMAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`entrada-de-material-confirmar:${session.userId}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas confirmações em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id, entradaId } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ConfirmarSchema.safeParse(corpo);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    return NextResponse.json(
      { error: `corpo inválido${primeiro?.path?.length ? ` (${primeiro.path.join(".")})` : ""}: ${primeiro?.message ?? "formato incorreto"}` },
      { status: 400 },
    );
  }

  const entrada = await prisma.entradaDeMaterial.findFirst({
    where: { id: entradaId, workspaceId: session.workspaceId, clientId: id },
  });
  if (!entrada) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entrada.status !== "preciso_confirmar") {
    return NextResponse.json(
      { error: `esta entrada está "${entrada.status}" — só é possível confirmar quem está "preciso_confirmar".` },
      { status: 409 },
    );
  }

  let brutaAnterior: unknown = null;
  try {
    brutaAnterior = entrada.interpretacaoJson ? JSON.parse(entrada.interpretacaoJson) : null;
  } catch {
    brutaAnterior = null;
  }
  const anterior = InterpretacaoSchema.safeParse(brutaAnterior);
  if (!anterior.success) {
    return NextResponse.json({ error: "esta entrada não tem uma interpretação anterior válida para confirmar" }, { status: 409 });
  }

  const dataConfirmada = parsed.data.dataAlvo;
  // Dia civil de BRASÍLIA, não o UTC cru — achado da `qualidade` (D5,
  // 28/09/2026): `new Date().toISOString().slice(0,10)` já virou "amanhã" em
  // UTC entre 21h00 e 23h59 de Brasília, e recusava (400 "já passou") quem
  // confirmava "hoje" ainda dentro do dia, em Brasília. Mesma régua que
  // `dataDaFraseDeterministica` já usa (`hojeIsoBrasilia`, reaproveitada
  // aqui — nunca uma segunda cópia da conta de fuso).
  const hojeIso = hojeIsoBrasilia(new Date());
  if (dataConfirmada < hojeIso) {
    return NextResponse.json({ error: `a data confirmada (${dataConfirmada}) já passou — confirme uma data futura.` }, { status: 400 });
  }

  const interpretacaoConfirmada = InterpretacaoSchema.parse({
    ...anterior.data,
    dataAlvo: dataConfirmada,
    horarioAlvo: parsed.data.horarioAlvo ?? anterior.data.horarioAlvo,
    formatos: parsed.data.formatos ?? anterior.data.formatos,
    dataAmbigua: false,
    motivoDaAmbiguidade: null,
  });

  await prisma.entradaDeMaterial.update({
    where: { id: entrada.id },
    data: {
      interpretacaoJson: JSON.stringify(interpretacaoConfirmada),
      status: "interpretada",
      motivo: null,
    },
  });

  const encaixe = await encaixarNoCalendario({
    workspaceId: session.workspaceId, clientId: id, entradaId: entrada.id, agora: new Date(),
  });

  const final = await prisma.entradaDeMaterial.update({
    where: { id: entrada.id },
    data: encaixe.ok
      ? {} // `encaixarNoCalendario` já grava "encaixada" + os ids — não sobrescreve.
      : { status: "recusada", motivo: encaixe.motivo },
  });

  return NextResponse.json({
    entrada: {
      id: final.id, status: final.status, motivo: final.motivo,
      socialPostIds: JSON.parse(final.socialPostIdsJson || "[]"),
    },
  });
}
