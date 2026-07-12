// POST /api/social-posts/generate
//
// The Planner's AI copilot. Two modes:
//   - "caption": write one publish-ready caption for a specific post (given the
//     networks, format and pillar), grounded in the client's business context.
//   - "ideas":   propose a batch of post ideas to fill the editorial calendar.
//
// Reasoning goes through the unified, key-aware generate() helper, so whichever
// provider the agency connected in Integrações powers it. Everything is grounded
// in the client's real Brain data (segment, audience, objectives, brand voice).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { generate } from "@/lib/ai/generate";

const NETWORK_LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn",
  youtube: "YouTube", pinterest: "Pinterest", twitter: "X (Twitter)", threads: "Threads",
  whatsapp: "WhatsApp", gbp: "Google Business",
};
const FORMAT_LABELS: Record<string, string> = {
  feed: "post de feed", reel: "reel (vídeo curto vertical)", story: "story",
  carousel: "carrossel", video: "vídeo",
};

interface ClientContext {
  businessName: string;
  segment: string;
  targetAudience: string;
  tone: string;
  services: string[];
  objectives: string[];
}

async function loadClientContext(clientId: string | null, workspaceId: string): Promise<ClientContext | null> {
  if (!clientId) return null;
  try {
    const [client, request] = await Promise.all([
      prisma.client.findFirst({ where: { id: clientId, workspaceId }, include: { brandBrain: true } }),
      prisma.clientRequestDb.findFirst({
        where: { clientId }, orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!client && !request) return null;

    let scope: Record<string, unknown> = {};
    try { scope = JSON.parse(request?.briefingJson ?? "{}")?.scope ?? {}; } catch { /* ignore */ }
    const brand = client?.brandBrain ?? null;
    const services = (() => { try { return JSON.parse(request?.services ?? "[]"); } catch { return []; } })();
    const objectives = (() => { try { return JSON.parse(request?.objectives ?? "[]"); } catch { return []; } })();

    const str = (...vals: unknown[]) => vals.find((v) => typeof v === "string" && v.trim())?.toString().trim() ?? "";

    return {
      businessName: str(request?.businessName, client?.name, "o cliente"),
      segment:      str(request?.segment, scope.segment, client?.industry),
      targetAudience: str(scope.targetAudience, brand?.targetAudience),
      tone:         str(brand?.tone),
      services:     Array.isArray(services) ? services.filter((s): s is string => typeof s === "string") : [],
      objectives:   Array.isArray(objectives) ? objectives.filter((o): o is string => typeof o === "string") : [],
    };
  } catch {
    return null;
  }
}

function contextBlock(ctx: ClientContext | null): string {
  if (!ctx) return "Cliente: negócio genérico (sem contexto específico). Escreva de forma versátil e profissional.";
  const lines = [
    `Negócio: ${ctx.businessName}`,
    ctx.segment && `Segmento: ${ctx.segment}`,
    ctx.targetAudience && `Público-alvo: ${ctx.targetAudience}`,
    ctx.tone && `Tom de voz da marca: ${ctx.tone}`,
    ctx.services.length && `Serviços contratados: ${ctx.services.join(", ")}`,
    ctx.objectives.length && `Objetivos: ${ctx.objectives.join(", ")}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const mode = body.mode === "ideas" ? "ideas" : body.mode === "script" ? "script" : "caption";
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  const networks = Array.isArray(body.networks)
    ? (body.networks as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const format = typeof body.format === "string" ? body.format : "feed";
  const pillar = typeof body.pillar === "string" ? body.pillar.trim() : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const count = mode === "ideas" ? Math.min(Math.max(Number(body.count) || 6, 3), 12) : 1;

  const ctx = await loadClientContext(clientId, session.workspaceId);

  const netNames = networks.map((n) => NETWORK_LABELS[n] ?? n);
  const fmtName = FORMAT_LABELS[format] ?? format;

  const system = `Você é o Copiloto de Conteúdo da Dioli Digital — uma diretora de social media sênior no Brasil.
Você escreve conteúdo real, específico e de alto nível, adaptado ao segmento e ao público do cliente.
Escreva SEMPRE em português do Brasil. Nunca use clichês vazios nem promessas irreais.
Responda SEMPRE e SOMENTE com um JSON válido, sem texto fora do JSON, sem markdown.`;

  let user: string;
  if (mode === "script") {
    user = `Escreva um ROTEIRO completo de vídeo curto (${fmtName}) pronto para gravar.

CONTEXTO DO CLIENTE
${contextBlock(ctx)}

ESPECIFICAÇÃO
${netNames.length ? `Redes: ${netNames.join(", ")}` : "Redes: multiplataforma"}
Formato: ${fmtName}
${pillar ? `Pilar/tema: ${pillar}` : ""}
${brief ? `Orientação da equipe: ${brief}` : ""}

REGRAS
- Duração alvo: 15 a 40 segundos.
- Comece com um gancho visual forte nos primeiros 2 segundos.
- Divida em cenas curtas e filmáveis (o que aparece na tela + o que é falado + texto na tela).
- Sugira um áudio/trilha e uma legenda pronta para o post.
- Ofereça 3 variações de gancho para teste.

Responda EXATAMENTE neste formato JSON:
{"hooks": ["gancho 1", "gancho 2", "gancho 3"], "scenes": [{"visual": "o que aparece", "voiceover": "narração/fala", "onScreen": "texto na tela"}], "audio": "sugestão de trilha/áudio", "cta": "chamada final", "caption": "legenda pronta para publicar"}`;
  } else if (mode === "caption") {
    user = `Escreva UMA legenda pronta para publicar.

CONTEXTO DO CLIENTE
${contextBlock(ctx)}

ESPECIFICAÇÃO DO POST
${netNames.length ? `Redes de destino: ${netNames.join(", ")} (a legenda deve funcionar em todas)` : "Redes: multiplataforma"}
Formato: ${fmtName}
${pillar ? `Pilar/tema editorial: ${pillar}` : ""}
${brief ? `Orientação da equipe: ${brief}` : ""}

REGRAS
- Escreva um gancho forte na primeira linha.
- Corpo com valor real (não genérico), coerente com o segmento e o público.
- Termine com uma chamada para ação natural.
- Sugira de 5 a 12 hashtags relevantes (sem exageros, sem hashtags proibidas).

Responda EXATAMENTE neste formato JSON:
{"caption": "texto completo da legenda com quebras de linha", "hashtags": ["semhashtag1", "semhashtag2"]}
(as hashtags devem vir SEM o símbolo #)`;
  } else {
    user = `Proponha ${count} ideias de conteúdo para o calendário editorial.

CONTEXTO DO CLIENTE
${contextBlock(ctx)}

${netNames.length ? `Redes onde o cliente publica: ${netNames.join(", ")}` : ""}
${brief ? `Direcionamento da equipe: ${brief}` : ""}

REGRAS
- Ideias variadas em pilares (autoridade, bastidores, prova social, educacional, oferta, etc.).
- Cada ideia específica ao negócio e ao público — nada genérico.
- Sugira o formato ideal (feed, reel, story, carousel ou video) para cada uma.

Responda EXATAMENTE neste formato JSON:
{"ideas": [{"title": "título curto e claro", "angle": "1 frase explicando o ângulo/gancho", "format": "feed|reel|story|carousel|video", "pillar": "nome do pilar"}]}`;
  }

  const result = await generate({
    system, user,
    maxTokens: mode === "caption" ? 900 : 2048,
    workspaceId: session.workspaceId,
    preferredProvider: "claude",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  const data = result.data as Record<string, unknown>;

  if (mode === "script") {
    const arrStr = (v: unknown) => Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const scenes = Array.isArray(data.scenes)
      ? (data.scenes as unknown[])
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .map((s) => ({
            visual:    typeof s.visual === "string" ? s.visual : "",
            voiceover: typeof s.voiceover === "string" ? s.voiceover : "",
            onScreen:  typeof s.onScreen === "string" ? s.onScreen : "",
          }))
          .filter((s) => s.visual || s.voiceover || s.onScreen)
      : [];
    if (scenes.length === 0) return NextResponse.json({ error: "Roteiro vazio" }, { status: 502 });
    return NextResponse.json({
      script: {
        hooks: arrStr(data.hooks),
        scenes,
        audio: typeof data.audio === "string" ? data.audio : "",
        cta:   typeof data.cta === "string" ? data.cta : "",
      },
      caption: typeof data.caption === "string" ? data.caption : "",
    });
  }

  if (mode === "caption") {
    const caption = typeof data.caption === "string" ? data.caption : "";
    const hashtags = Array.isArray(data.hashtags)
      ? (data.hashtags as unknown[]).filter((x): x is string => typeof x === "string").map((h) => h.replace(/^#/, "")) : [];
    if (!caption) return NextResponse.json({ error: "Resposta vazia da IA" }, { status: 502 });
    return NextResponse.json({ caption, hashtags });
  }

  const ideas = Array.isArray(data.ideas)
    ? (data.ideas as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((i) => ({
          title:  typeof i.title === "string" ? i.title : "",
          angle:  typeof i.angle === "string" ? i.angle : "",
          format: typeof i.format === "string" ? i.format : "feed",
          pillar: typeof i.pillar === "string" ? i.pillar : "",
        }))
        .filter((i) => i.title)
    : [];
  if (ideas.length === 0) return NextResponse.json({ error: "Nenhuma ideia gerada" }, { status: 502 });
  return NextResponse.json({ ideas });
}
