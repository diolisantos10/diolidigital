import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

export interface BrandAnalysis {
  healthScore: number;
  healthLabel: string;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  consistencyAlerts: string[];
  toneAssessment: string;
  summary: string;
}

const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você é o Brand Guardian da Dioli Agência. Analise o Brand Brain do cliente e produza um relatório de saúde de marca acionável.

Retorne APENAS JSON válido:
{
  "healthScore": 1 a 10,
  "healthLabel": "Marca forte" | "Em desenvolvimento" | "Precisa atenção",
  "strengths": ["ponto forte 1", "ponto forte 2"],
  "gaps": ["lacuna 1", "lacuna 2"],
  "suggestions": ["sugestão concreta 1", "sugestão 2", "sugestão 3"],
  "consistencyAlerts": ["alerta 1"] ou [],
  "toneAssessment": "avaliação do tom de voz em 1-2 frases",
  "summary": "resumo geral da saúde da marca em 2-3 frases"
}

Seja específico, concreto e orientado a ação. Identifique tanto o que está funcionando quanto o que precisa melhorar.`;

function buildUserMessage(body: Record<string, unknown>): string {
  const bb = body.brandBrain as Record<string, unknown> | null | undefined;
  return `Cliente: ${body.clientName ?? "Desconhecido"}
Setor: ${body.industry ?? "Não especificado"}

Brand Brain:
- Posicionamento: ${bb?.positioning ?? "Não preenchido"}
- Público-alvo: ${bb?.targetAudience ?? "Não preenchido"}
- Tom de voz: ${bb?.toneOfVoice ?? "Não preenchido"}
- Canais preferidos: ${bb?.preferredChannels ?? "Não preenchido"}
- Personalidade da marca: ${bb?.brandPersonality ?? "Não preenchido"}
- Proposta de valor: ${bb?.valueProp ?? "Não preenchido"}
- Principais concorrentes: ${bb?.competitors ?? "Não informado"}
- Identidade visual: ${bb?.visualIdentity ?? "Não preenchido"}
- Guideline de marca: ${bb?.brandGuideline ?? "Não preenchido"}

Gere um relatório completo de saúde de marca para este cliente.`;
}

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

function validateAnalysis(data: unknown): BrandAnalysis | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.healthScore !== "number" ||
    typeof d.healthLabel !== "string" ||
    !Array.isArray(d.strengths) ||
    !Array.isArray(d.gaps) ||
    !Array.isArray(d.suggestions) ||
    !Array.isArray(d.consistencyAlerts) ||
    typeof d.toneAssessment !== "string" ||
    typeof d.summary !== "string"
  ) return null;
  return d as unknown as BrandAnalysis;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const resolved = await resolveProviderKey("claude", session?.workspaceId);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Nenhuma chave Claude conectada. Configure em Integrações." }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: resolved.model ?? "claude-haiku-4-5-20251001",
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(body) }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return NextResponse.json({ ok: false, error: `Claude HTTP ${res.status}` }, { status: 502 });

    const json = (await res.json()) as { content?: { text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return NextResponse.json({ ok: false, error: "Resposta Claude vazia" }, { status: 502 });

    const data = extractJson(text);
    const analysis = validateAnalysis(data);
    if (!analysis) return NextResponse.json({ ok: false, error: "Shape inválido na resposta Claude" }, { status: 502 });

    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude (${reason})` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
