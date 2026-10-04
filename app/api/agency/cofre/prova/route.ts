// POST /api/agency/cofre/prova — a PROVA REAL do cofre (CEO, 04/10/2026):
// um texto (modalidade text) e uma imagem (modalidade image), e devolve SÓ
// status, modelo e custo de cada um. Só master: gasta duas chamadas pagas.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { pedirAoCofre } from "@/lib/ai/cofre";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;
  if (session.clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }
  const [texto, imagem] = await Promise.all([
    pedirAoCofre({
      modalidade: "text",
      mensagens: [{ role: "user", content: 'Responda apenas com o JSON {"ok":true}.' }],
      agentId: "prova-do-cofre",
    }),
    pedirAoCofre({
      modalidade: "image",
      mensagens: [{ role: "user", content: "Um círculo azul simples sobre fundo branco." }],
      agentId: "prova-do-cofre",
      tamanho: "square",
      timeoutMs: 90_000,
    }),
  ]);
  const resumo = (r: Awaited<ReturnType<typeof pedirAoCofre>>) =>
    r.ok
      ? { status: "ok", modelo: r.modelo, custo: r.custo }
      : { status: "falhou", codigo: r.falha, http: r.status, motivo: r.erro };
  return NextResponse.json({ texto: resumo(texto), imagem: resumo(imagem) });
}
