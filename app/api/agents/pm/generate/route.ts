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
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

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

  // FAIXA 1 do CSRF: gasta a chave de IA da agência a cada chamada.
  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
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
    agentId: "pm",
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const assessment = validateAssessment(r.data);
  if (!assessment) {
    return NextResponse.json({ ok: false, error: `Shape inválido na resposta de ${r.provider}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, assessment });
}
