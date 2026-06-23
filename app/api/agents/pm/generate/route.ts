import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

export interface PmAssessment {
  healthScore: number;
  healthLabel: string;
  summary: string;
  topPriorities: string[];
  blockers: string[];
  risks: string[];
  weeklyPlan: { day: string; task: string; owner: string }[];
  recommendation: string;
}

const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você é o PM Agent da Dioli Agência Digital. Analise o estado do projeto e produza um assessment de gestão de projetos claro e acionável.

Retorne APENAS JSON válido com esta estrutura:
{
  "healthScore": número de 1 a 10,
  "healthLabel": "Saudável" | "Em risco" | "Crítico",
  "summary": "resumo do projeto em 2-3 frases",
  "topPriorities": ["ação prioritária 1", "ação 2", "ação 3"],
  "blockers": ["bloqueio atual 1"] ou [],
  "risks": ["risco 1", "risco 2"],
  "weeklyPlan": [
    {"day": "Segunda", "task": "descrição da tarefa", "owner": "PM/Social/Design/Ads"},
    {"day": "Terça", "task": "...", "owner": "..."},
    {"day": "Quarta", "task": "...", "owner": "..."},
    {"day": "Quinta", "task": "...", "owner": "..."},
    {"day": "Sexta", "task": "...", "owner": "..."}
  ],
  "recommendation": "uma recomendação clara e acionável para a semana"
}

Seja objetivo, prático e foque em ações que movem o projeto para frente.`;

function buildUserMessage(body: Record<string, unknown>): string {
  return `Projeto: ${body.projectName ?? "Sem nome"}
Cliente: ${body.clientName ?? "Desconhecido"}
Objetivo: ${body.goal ?? "Não especificado"}
Estágio: ${body.stage ?? "briefing"}
Prazo: ${body.deadline ?? "Não definido"}
Status da proposta: ${body.proposalStatus ?? "draft"}
Número de entregas: ${body.deliverableCount ?? 0}
Agentes atribuídos: ${body.agentCount ?? 0}
${body.notes ? `Notas: ${body.notes}` : ""}

Gere um assessment completo de gestão de projetos para este projeto.`;
}

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

function validateAssessment(data: unknown): PmAssessment | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.healthScore !== "number" ||
    typeof d.healthLabel !== "string" ||
    typeof d.summary !== "string" ||
    !Array.isArray(d.topPriorities) ||
    !Array.isArray(d.blockers) ||
    !Array.isArray(d.risks) ||
    !Array.isArray(d.weeklyPlan) ||
    typeof d.recommendation !== "string"
  ) return null;
  return d as unknown as PmAssessment;
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
    const assessment = validateAssessment(data);
    if (!assessment) return NextResponse.json({ ok: false, error: "Shape inválido na resposta Claude" }, { status: 502 });

    return NextResponse.json({ ok: true, assessment });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "erro de rede";
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude (${reason})` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
