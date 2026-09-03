// Shared auto-scope runner — called both by the manual route and automatically
// on briefing creation. Chains all 6 brain engines synchronously (no external
// API calls) and persists the results as BrainArtifact records.

import { prisma } from "@/lib/db/client";
import { buildClientSnapshot, buildVerdadeDoCliente } from "@/lib/dioli-brain/client-snapshot";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateAnalyticsCanvas } from "@/lib/dioli-brain/analytics-engine";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";

const SCOPE_DEPTS = ["strategy", "social", "design", "traffic", "analytics", "quality"] as const;

// ── A CONDIÇÃO DE CORRIDA MEDIDA EM 03/09/2026 ──────────────────────────────
//
// `app/api/brain/client-requests/route.ts` dispara este runner SEM `await`
// ("fire-and-forget... enquanto o 201 retorna na hora") para que o cliente não
// espere seis motores de IA rodarem. Em paralelo — às vezes no mesmíssimo
// ciclo do relógio, como no percurso do cliente oculto — roda
// `entregarOrcamentosPendentes()`, que já LÊ pedidos em `new`/`lead_incompleto`
// (não depende deste runner ter terminado: o número vem do `briefingJson`, não
// do canvas) e os avança para `proposal_pending` assim que calcula o orçamento.
//
// Como as duas escritas correm sem ordem garantida, se este runner terminar
// DEPOIS da entrega do orçamento, o `update` incondicional que havia aqui
// pisava de volta em `scope_ready` — sobrescrevendo um pedido que já tinha
// proposta escrita e link de aceite no portal. Resultado medido ao vivo: o
// aceite do cliente devolvia 409 ("já foi respondida") para uma proposta que,
// na prática, era a primeira resposta.
//
// O conserto não é ordenar as escritas (isso trocaria uma corrida por uma
// espera desnecessária no caminho crítico do 201) nem alargar a lista que
// decide "o cliente pode aceitar" — é fazer ESTA escrita só valer quando ela
// ainda é a fronteira: se o pedido já andou para um estado que representa uma
// proposta em curso ou uma decisão já tomada, os artefatos (canvases) ainda
// são gravados — o trabalho de IA não se perde — mas o status do pedido fica
// como está, porque ele já é mais recente do que "escopo pronto".
const PRE_SCOPE_STATUSES = ["new", "lead_incompleto", "needs_revision", "scope_ready"] as const;

export async function runAutoScope(
  clientRequestId: string,
  opts: { approvedBy?: string; workspaceId?: string } = {},
): Promise<void> {
  const snapshot = await buildClientSnapshot(clientRequestId);
  if (!snapshot) throw new Error(`ClientRequest not found: ${clientRequestId}`);

  // A VERDADE LIDA PELO SERVIDOR — não montada por quem chama, não vinda do
  // navegador. É ela que faz o `no_hallucination` do gate deixar de ser
  // constante e o budget do tráfego deixar de ser tabela. `null` (banco fora do
  // ar, cliente inexistente) NÃO vira verdade vazia: vira ausência, e ausência
  // deixa a checagem em NÃO VERIFICADO — nunca em aprovado.
  const verdade = await buildVerdadeDoCliente(clientRequestId);

  // A verba que o CLIENTE informou. Mais de uma informada → a maior é o teto
  // que ele autorizou; nenhuma → o motor de tráfego cai na faixa de referência
  // do segmento e DECLARA que é faixa.
  const verbas = verdade?.verbas ?? [];
  const verbaInformadaBRL = verbas.length > 0 ? Math.max(...verbas) : undefined;

  const strategyCanvas = generateStrategyCanvas({
    businessName: snapshot.businessName,
    segment:      snapshot.segment,
    objectives:   snapshot.objectives,
    services:     snapshot.services,
    rawContext:   snapshot.rawContext,
    requestId:    clientRequestId,
    source:       "request",
  });

  const socialCanvas    = generateSocialCanvas({ strategyCanvas, requestId: clientRequestId, source: "request" });
  const designCanvas    = generateDesignCanvas({ socialCanvas, requestId: clientRequestId, source: "request" });
  const trafficCanvas   = generateTrafficCanvas({ strategyCanvas, socialCanvas, designCanvas, verbaInformadaBRL, requestId: clientRequestId, source: "request" });
  const analyticsCanvas = generateAnalyticsCanvas({ strategyCanvas, socialCanvas, designCanvas, trafficCanvas, requestId: clientRequestId, source: "request" });
  const qualityCanvas   = generateQualityCanvas({ strategyCanvas, socialCanvas, designCanvas, trafficCanvas, analyticsCanvas, verdade: verdade ?? undefined, requestId: clientRequestId, source: "request" });

  const artifacts = [
    { dept: "strategy",  canvas: strategyCanvas,  gate: strategyCanvas.qualityGateResult,  flow: strategyCanvas.cognitiveFlowTrace },
    { dept: "social",    canvas: socialCanvas,    gate: socialCanvas.qualityGateResult,    flow: socialCanvas.cognitiveFlowTrace },
    { dept: "design",    canvas: designCanvas,    gate: designCanvas.qualityGateResult,    flow: designCanvas.cognitiveFlowTrace },
    { dept: "traffic",   canvas: trafficCanvas,   gate: trafficCanvas.qualityGateResult,   flow: trafficCanvas.cognitiveFlowTrace },
    { dept: "analytics", canvas: analyticsCanvas, gate: analyticsCanvas.qualityGateResult, flow: analyticsCanvas.cognitiveFlowTrace },
    { dept: "quality",   canvas: qualityCanvas,   gate: qualityCanvas.gateResult,          flow: qualityCanvas.cognitiveFlowTrace },
  ];

  await prisma.brainArtifact.updateMany({
    where: {
      clientRequestId,
      department: { in: [...SCOPE_DEPTS] },
      status: { in: ["draft", "needs_revision"] },
    },
    data: { status: "superseded" },
  });

  await prisma.brainArtifact.createMany({
    data: artifacts.map((a) => ({
      clientRequestId,
      department:        a.dept,
      canvasId:          (a.canvas as { id: string }).id,
      canvasJson:        JSON.stringify(a.canvas),
      qualityGateJson:   JSON.stringify(a.gate),
      cognitiveFlowJson: JSON.stringify(a.flow),
      status:            "draft",
      approvedBy:        opts.approvedBy ?? "system_auto",
    })),
  });

  const avanco = await prisma.clientRequestDb.updateMany({
    where: {
      id: clientRequestId,
      // Só avança para `scope_ready` a partir de onde `scope_ready` É a
      // fronteira de verdade. Se outra escrita concorrente já levou o pedido
      // adiante (proposta entregue, aceite, recusa, projeto em andamento...),
      // esta escrita chegou atrasada e não pode voltar o relógio do pedido.
      status: { in: [...PRE_SCOPE_STATUSES] },
    },
    data: {
      status: "scope_ready",
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    },
  });

  if (avanco.count === 0) {
    // Não é erro: é a corrida documentada acima resolvida a favor de quem
    // chegou primeiro. Os artefatos (BrainArtifact) já foram gravados — só o
    // status do pedido, que outra escrita tornou obsoleto, não regride.
    console.warn(
      `[run-auto-scope] pedido ${clientRequestId} já saiu do estágio de escopo ` +
        "antes deste runner terminar — artefatos gravados, status preservado.",
    );
  }
}
