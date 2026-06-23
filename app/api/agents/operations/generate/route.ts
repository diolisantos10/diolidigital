import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

export interface OperationsAlert {
  area: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface OperationsAssessment {
  healthScore: number;
  healthLabel: string;
  summary: string;
  bottlenecks: string[];
  systemAlerts: OperationsAlert[];
  actionItems: string[];
  capacityNote: string;
  recommendation: string;
}

const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Você é o System Doctor (Agente de Operações) da Dioli Agência Digital. Sua missão é avaliar a SAÚDE OPERACIONAL da agência inteira — não um projeto isolado — e produzir um diagnóstico claro e acionável: gargalos, alertas de sistema, capacidade e próximos passos.

Retorne APENAS JSON válido com esta estrutura:
{
  "healthScore": número de 1 a 10,
  "healthLabel": "Saudável" | "Em risco" | "Crítico",
  "summary": "diagnóstico operacional da agência em 2-3 frases",
  "bottlenecks": ["gargalo operacional 1", "gargalo 2"],
  "systemAlerts": [
    {"area": "ex: Aprovações, Integrações, IA, Pipeline", "severity": "info" | "warning" | "critical", "message": "descrição do alerta"}
  ],
  "actionItems": ["ação operacional recomendada 1", "ação 2", "ação 3"],
  "capacityNote": "observação sobre capacidade do time/agentes frente à carga atual",
  "recommendation": "uma recomendação operacional clara e priorizada"
}

Regras:
- Foque em fluxo de trabalho, throughput e bloqueios sistêmicos — não em conteúdo criativo.
- Se não houver nenhuma IA conectada, isso é um alerta crítico (os agentes rodam em modo regras, sem raciocínio real).
- Aprovações ou solicitações acumuladas são gargalos.
- Projetos atrasados ou tarefas bloqueadas elevam o risco operacional.
- Seja objetivo e priorize ações que destravam a operação.`;

function buildUserMessage(body: Record<string, unknown>): string {
  return `Estado operacional atual da agência:
Clientes ativos: ${body.clientCount ?? 0}
Projetos totais: ${body.projectCount ?? 0}
Projetos em produção: ${body.activeProjectCount ?? 0}
Projetos atrasados: ${body.overdueProjects ?? 0}
Entregas em revisão (aguardando aprovação): ${body.deliverablesInReview ?? 0}
Aprovações pendentes: ${body.pendingApprovals ?? 0}
Solicitações de cliente sem tratamento: ${body.pendingRequests ?? 0}
Tarefas bloqueadas: ${body.blockedTasks ?? 0}
Provedores de IA conectados: ${body.aiConnected ? "Sim" : "Nenhum (agentes em modo regras)"}
Integrações conectadas: ${body.integrationsConnected ?? 0}

Gere um diagnóstico operacional completo da agência.`;
}

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

function validateAssessment(data: unknown): OperationsAssessment | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.healthScore !== "number" ||
    typeof d.healthLabel !== "string" ||
    typeof d.summary !== "string" ||
    !Array.isArray(d.bottlenecks) ||
    !Array.isArray(d.systemAlerts) ||
    !Array.isArray(d.actionItems) ||
    typeof d.capacityNote !== "string" ||
    typeof d.recommendation !== "string"
  ) return null;
  return d as unknown as OperationsAssessment;
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
