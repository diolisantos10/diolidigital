// POST /api/social-posts/calendario — gera o calendário editorial de
// Instagram de UM cliente para UM mês, por IA, como RASCUNHOS (SÓ TEXTO).
//
// Guarda copiada de `publicar-agora/route.ts` (a irmã mais nova da mesma
// família de rotas de esteira): sessão de staff, nunca portal, CSRF e
// rate-limit. A regra de negócio inteira mora em
// `lib/agency/esteira/calendario-editorial.ts` — esta rota só valida forma de
// entrada e traduz o resultado em HTTP.
//
// 27/09/2026 — `postsPorSemana`/`horario` SAÍRAM do corpo desta rota. Decisão
// deste bloco: quem manda na cadência e no horário é o PACOTE DA MARCA
// (`Client.pacoteJson`, lido por `lerPacote`), nunca o corpo da requisição —
// duas fontes de verdade sobre "quantas vezes por semana" divergiriam no
// primeiro cliente que tivesse as duas configuradas diferente. Quem quiser
// mudar a cadência muda o pacote, não esta chamada.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { gerarCalendarioEditorial } from "@/lib/agency/esteira/calendario-editorial";

const PODEM_GERAR = ["master", "project_manager", "social_staff"] as const;

/** Gera conteúdo real por chamada de IA e grava várias linhas — teto baixo de
 *  propósito, do mesmo jeito que `/api/generate-image` protege gasto real. */
const GERACOES_POR_MINUTO = 5;

const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_GERAR]);
  if (error) return error;
  // Sessão de portal nunca gera calendário em nome da agência.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(
    `calendario-editorial:${session.userId}`,
    GERACOES_POR_MINUTO,
    60_000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gerações em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as {
    clientId?: string;
    mes?: string;
  } | null;

  const clientId = corpo?.clientId?.trim();
  const mes = corpo?.mes?.trim();
  if (!clientId || !mes) {
    return NextResponse.json({ error: "clientId e mes são obrigatórios" }, { status: 400 });
  }
  if (!MES_REGEX.test(mes)) {
    return NextResponse.json({ error: "mes precisa estar no formato AAAA-MM" }, { status: 400 });
  }

  const resultado = await gerarCalendarioEditorial({
    workspaceId: session.workspaceId,
    clientId,
    mes,
  });

  if (resultado.ok) {
    return NextResponse.json({
      ok: true,
      criados: resultado.criados,
      jaExistiam: resultado.jaExistiam,
      posts: resultado.posts,
      barradas: resultado.barradas,
      pendentes: resultado.pendentes,
    });
  }

  if (resultado.codigo === "cliente_nao_encontrado") {
    // 404, nunca 403: não confirma que o id existe em outro workspace.
    return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  }
  if (resultado.codigo === "sem_pacote") {
    return NextResponse.json({ error: resultado.motivo }, { status: 422 });
  }
  if (resultado.codigo === "sem_ficha_de_marca") {
    return NextResponse.json({ error: resultado.motivo }, { status: 422 });
  }
  if (resultado.codigo === "ia_falhou") {
    return NextResponse.json({ error: resultado.motivo }, { status: 502 });
  }
  // "mes_invalido" — validação, mesmo tendo passado pelas checagens de forma
  // acima (defesa em profundidade da própria função).
  return NextResponse.json({ error: resultado.motivo }, { status: 400 });
}
