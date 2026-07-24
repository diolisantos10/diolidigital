// POST /api/agents/design/generate
// Calls Claude to generate enhanced visual briefs for each post/design request.
// Returns VisualBrief[] shape expected by the design-agent page.

import { NextRequest, NextResponse } from "next/server";
import { claudeModel } from "@/lib/ai/claude-provider";
import { requireSession } from "@/lib/auth/api-guard";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

interface ParsedPost {
  postId: number;
  title: string;
  format: string;
  contentObjective: string;
  keyCopy: string;
  cta: string;
  creativeDirection: string;
  imagePrompt: string;
  designNotes: string;
}

interface BrandBrain {
  visualStyle?: string;
  toneOfVoice?: string;
  brandRules?: string;
  thingsToAvoid?: string;
  targetAudience?: string;
  positioning?: string;
}

export async function POST(req: NextRequest) {
  // SEGURANÇA: exige sessão — antes, anônimo queimava a chave Claude da agência.
  const guard = await requireSession();
  if (guard.error) return guard.error;
  const resolved = await resolveProviderKey("claude", guard.session.workspaceId);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma chave Claude configurada. Adicione em Integrações → IAs dos Agentes." },
      { status: 503 },
    );
  }

  const body = await req.json() as { posts: ParsedPost[]; brandName: string; brandBrain?: BrandBrain };
  const { posts, brandName, brandBrain } = body;

  if (!posts || posts.length === 0) {
    return NextResponse.json({ ok: false, error: "Nenhum post enviado" }, { status: 400 });
  }

  const brandCtx = brandBrain
    ? `Visual: ${brandBrain.visualStyle || "não definido"}. Tom: ${brandBrain.toneOfVoice || "não definido"}. Público: ${brandBrain.targetAudience || "não definido"}. Regras: ${brandBrain.brandRules || "não definido"}. Evitar: ${brandBrain.thingsToAvoid || "não definido"}.`
    : "Brand Brain não disponível — usar boas práticas gerais de design.";

  const postsJson = posts.map((p) => ({
    postId: p.postId,
    title: p.title,
    format: p.format,
    objective: p.contentObjective,
    keyCopy: p.keyCopy,
    cta: p.cta,
    creativeDirection: p.creativeDirection,
    imagePrompt: p.imagePrompt,
  }));

  const systemPrompt = `Você é o Design Agent da Dioli Agência Digital. Você cria visual briefs detalhados e prontos para o designer executar.
Você responde APENAS com JSON válido. Nenhum texto fora do JSON.
Todo conteúdo em PORTUGUÊS BRASILEIRO, exceto prompts de imagem que devem ser em INGLÊS.`;

  const userPrompt = `Crie visual briefs completos para cada post abaixo.

MARCA: ${brandName}
BRAND BRAIN: ${brandCtx}

POSTS:
${JSON.stringify(postsJson, null, 2)}

Responda com JSON no formato exato:

{
  "briefs": [
    {
      "postId": 1,
      "title": "título do post",
      "format": "formato (Carrossel/Reels/Feed único/Stories)",
      "visualConcept": "Parágrafo descritivo e criativo do conceito visual. Deve ser específico para a marca ${brandName} e o objetivo do post. Mínimo 3 frases.",
      "enhancedPrompt": "Detailed image generation prompt in English. Very specific: style, lighting, composition, colors, mood, technical specs. Include brand aesthetic. Production-ready quality. No watermarks.",
      "layoutStructure": [
        "Instrução detalhada para slide/frame 1",
        "Instrução detalhada para slide/frame 2",
        "Instrução detalhada para slide/frame 3 (se aplicável)"
      ],
      "designInstructions": {
        "typography": "especificações de tipografia: fontes, tamanhos, pesos, espaçamento",
        "spacing": "espaçamentos, margens, padding, grid",
        "composition": "proporção, regra dos terços, zona segura, alinhamentos",
        "visualHierarchy": "ordem de leitura: 1º o quê, 2º o quê, 3º o quê. Como guiar o olhar."
      },
      "styleConsistency": "Notas de consistência de marca: como este material deve se conectar com a identidade visual da ${brandName}. O que validar antes de aprovar."
    }
  ]
}

GERE um brief para cada post (postId ${posts.map((p) => p.postId).join(", ")}).
Adapte cada brief profundamente ao formato, objetivo e copy de cada post específico.`;

  const apiKey = resolved.apiKey;
  const model = resolved.model ?? claudeModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Claude HTTP ${res.status}` }, { status: 500 });
    }

    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return NextResponse.json({ ok: false, error: "Resposta Claude vazia" }, { status: 500 });

    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = stripped.indexOf("{");
    const end   = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ ok: false, error: "JSON não encontrado" }, { status: 500 });
    }

    const parsed = JSON.parse(stripped.slice(start, end + 1)) as { briefs: unknown[] };
    return NextResponse.json({ ok: true, briefs: parsed.briefs, model });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : String(err);
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude: ${reason}` }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
