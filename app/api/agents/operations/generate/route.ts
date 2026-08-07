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
    departmentId: "project-management",
    agentId: "operations",
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const assessment = validateAssessment(r.data);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: `Shape inválido na resposta de ${r.provider}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, assessment });
}
