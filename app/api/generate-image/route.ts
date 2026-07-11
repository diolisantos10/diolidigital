// POST /api/generate-image
// Official Dioli design endpoint — generates a visual asset via the GPT image
// engine (gpt-image-1 → dall-e-3 fallback). Used by the platform's design tools
// and client deliverables. Keeps the legacy `{ url }` response contract.

import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/security/rate-limit";
import { getSession } from "@/lib/auth/session";
import { generateDesign, type DesignSize, type DesignQuality } from "@/lib/ai/design-engine";

export async function POST(request: NextRequest) {
  const _limited = rateLimited(request, "generate-image", 10, 60_000);
  if (_limited) return _limited;

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    size?: DesignSize;
    quality?: DesignQuality;
  };

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  // Workspace-scope the key when a session exists; public callers fall back to
  // the first configured key / env var.
  const session = await getSession();

  const result = await generateDesign({
    prompt: body.prompt,
    size: body.size,
    quality: body.quality,
    workspaceId: session?.workspaceId,
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
