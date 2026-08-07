// Esta rota passou a falar com o MOTOR (`lib/ai/generate`), não com a Anthropic.
//
// Antes ela montava o `fetch` para `api.anthropic.com` na mão, com o provedor
// "claude" escrito no código. Três coisas se perdiam nisso, e nenhuma é
// cosmética:
//
//   1. A CONTA. Toda chamada daqui saía de graça no relatório: sem `AIRunLog`,
//      sem tokens, sem dono. "Quanto custou este cliente" respondia menos do que
//      a verdade, e a diferença crescia sozinha.
//   2. A ESCOLHA DE PROVEDOR POR CLIENTE (`ClientAiProvider`). O cliente fixado
//      no Gemini era atendido pelo Claude assim mesmo — a tela dizia uma coisa e
//      o servidor fazia outra.
//   3. A RESERVA. Claude fora do ar = rota fora do ar, com as outras chaves
//      conectadas paradas do lado.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { generate } from "@/lib/ai/generate";

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

  const r = await generate({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(body),
    maxTokens: MAX_TOKENS,
    workspaceId: session.workspaceId,
    // `preferredProvider` é PREFERÊNCIA, não decreto: a fixação do cliente
    // vence, e as outras chaves entram de reserva se esta falhar.
    preferredProvider: "claude",
    // Sem estes, o gasto entra no relatório sem dono.
    clientId: typeof body.clientId === "string" ? body.clientId : null,
    projectId: typeof body.projectId === "string" ? body.projectId : null,
    departmentId: "strategy",
    agentId: "brand",
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const analysis = validateAnalysis(r.data);
  if (!analysis) {
    return NextResponse.json({ ok: false, error: `Shape inválido na resposta de ${r.provider}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, analysis });
}
