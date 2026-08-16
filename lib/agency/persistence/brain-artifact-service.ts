import { prisma } from "@/lib/db/client";

export type Department =
  | "strategy"
  | "social"
  | "design"
  | "traffic"
  | "analytics"
  | "quality";

export interface CreateBrainArtifactInput {
  clientRequestId: string;
  department: Department;
  canvasId: string;
  canvas: object;
  qualityGate?: object;
  cognitiveFlow?: object;
  version?: number;
  approvedBy?: string;
}

export async function createBrainArtifact(input: CreateBrainArtifactInput) {
  // Supersede any previous artifact for the same request+department
  await prisma.brainArtifact.updateMany({
    where: {
      clientRequestId: input.clientRequestId,
      department:      input.department,
      status:          "approved",
    },
    data: { status: "superseded" },
  });

  // ── O CARIMBO NASCE AQUI (16/08/2026, rodada 8) ───────────────────────────
  // Este é o escritor REAL de artefato da casa, e ele nunca gravou `clientId`.
  // Com a cerca do filho exigindo carimbo, `pipeline` e `departments` do
  // portal ficavam VAZIOS para sempre — não era dívida de acervo, era
  // permanente. Mesma medicina das mensagens e das aprovações: o dono é
  // derivado do banco no instante da escrita e congelado na linha.
  const donoDaSolicitacao = await prisma.clientRequestDb
    .findUnique({ where: { id: input.clientRequestId }, select: { clientId: true } })
    .catch(() => null);

  return prisma.brainArtifact.create({
    data: {
      clientRequestId:   input.clientRequestId,
      clientId:          donoDaSolicitacao?.clientId ?? null,
      department:        input.department,
      canvasId:          input.canvasId,
      canvasJson:        JSON.stringify(input.canvas),
      qualityGateJson:   input.qualityGate   ? JSON.stringify(input.qualityGate)   : null,
      cognitiveFlowJson: input.cognitiveFlow ? JSON.stringify(input.cognitiveFlow) : null,
      version:           input.version ?? 1,
      status:            "approved",
      approvedBy:        input.approvedBy ?? "internal",
    },
  });
}

export async function getArtifactsForRequest(clientRequestId: string) {
  return prisma.brainArtifact.findMany({
    where: { clientRequestId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getLatestArtifact(clientRequestId: string, department: Department) {
  return prisma.brainArtifact.findFirst({
    where: { clientRequestId, department, status: "approved" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Lê o canvas guardado. Devolve `null` quando o texto não é JSON válido.
 *
 * ⚠️ Isto era um `JSON.parse` nu. Uma linha truncada, um artefato gravado por
 * uma versão antiga ou um caractere estranho vindo de uma resposta de IA
 * derrubavam quem chamasse — com o erro aparecendo longe da causa, dentro do
 * motor de produção. O resto da casa já trata isso com try/catch; aqui era
 * inconsistência, não desconhecimento.
 *
 * O chamador precisa decidir o que fazer com `null` — e essa é a intenção:
 * artefato ilegível é ausência de informação, e ausência de informação NÃO é
 * informação. Nunca preencher por inferência.
 */
export function parseArtifactCanvas<T = unknown>(artifact: { canvasJson: string }): T | null {
  try {
    return JSON.parse(artifact.canvasJson) as T;
  } catch {
    return null;
  }
}
