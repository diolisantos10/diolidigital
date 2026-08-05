// POST /api/generate-image
// Official Dioli design endpoint — generates a visual asset via the GPT image
// engine (gpt-image-1 → dall-e-3 fallback). Used by the platform's design tools
// and client deliverables. Keeps the legacy `{ url }` response contract.

// ⚠️ ESTA ROTA GASTA DINHEIRO DE VERDADE, POR CHAMADA.
// Cada imagem custa ~US$0,17–0,25 na chave da agência. Até 05/08/2026 ela era
// PÚBLICA: `getSession()` era chamado só para escolher a chave, e sessão
// ausente não bloqueava nada. A única defesa era 10/min por IP, num balde em
// memória que todo deploy zera. A conta: 10/min × 1440 min = 14.400 imagens por
// dia POR IP, ~US$2.500–3.500/dia, e rotação de IP multiplica.
//
// Agora exige sessão de AGÊNCIA. Sessão de portal (com `clientId`) não entra:
// o cliente não decide gastar a chave da agência. Não há chamador público — o
// único consumidor é a tela `/agency/design-agent`, que é autenticada.
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getSession, isAgencyRole } from "@/lib/auth/session";
import { generateDesign, type DesignSize, type DesignQuality } from "@/lib/ai/design-engine";

/**
 * Teto por USUÁRIO, e a chave do balde é SÓ o `userId`.
 *
 * ⚠️ Não misture o IP na chave. A primeira versão deste conserto usava
 * `userId:ip` e o próprio teste derrubou: trocando de IP, o mesmo usuário
 * ganhava um balde novo a cada requisição e o teto virava enfeite — a mesma
 * falha que o balde por IP sozinho já tinha. Com sessão obrigatória, a
 * identidade que interessa é a do usuário, e essa ele não troca de graça.
 */
const POR_USUARIO_POR_MINUTO = 10;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`generate-image:${session.userId}`, POR_USUARIO_POR_MINUTO, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas gerações em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    size?: DesignSize;
    quality?: DesignQuality;
  };

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const result = await generateDesign({
    prompt: body.prompt,
    size: body.size,
    quality: body.quality,
    workspaceId: session.workspaceId,
  });

  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: result.error ?? "Falha ao gerar imagem." }, { status });
  }

  return NextResponse.json({
    url: result.url,
    model: result.model,
    revisedPrompt: result.revisedPrompt,
  });
}
