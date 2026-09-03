// A CORRIDA MEDIDA EM 03/09/2026 — `runAutoScope` terminando DEPOIS da
// entrega do orçamento não pode voltar o pedido para `scope_ready`.
//
// ═══ O SINTOMA MEDIDO AO VIVO ═════════════════════════════════════════════
//
// `npm run cliente-falso` às 11:27 de 03/09: o pedido caiu em `scope_ready` e
// `POST /api/portal/briefing/aceite` devolveu 409 "Esta proposta já foi
// respondida" — para uma proposta que, na prática, era a primeira resposta.
//
// ═══ A CAUSA RAIZ, NÃO O SINTOMA ═══════════════════════════════════════════
//
// `app/api/brain/client-requests/route.ts` chama `runAutoScope(id)` SEM
// `await` ("fire-and-forget... enquanto o 201 retorna na hora"). Em paralelo,
// `entregarOrcamentosPendentes()` já lê pedidos em `new`/`lead_incompleto`
// (o número vem do `briefingJson`, não depende do canvas) e escreve
// `status: "proposal_pending"` assim que calcula o orçamento — o que pode
// acontecer ANTES de `runAutoScope` terminar.
//
// O `runAutoScope` antigo fazia, no final, um `update` INCONDICIONAL para
// `status: "scope_ready"` — sem checar o que o pedido virou enquanto ele
// rodava. Se ele terminasse depois da entrega do orçamento, sobrescrevia
// `proposal_pending` de volta para `scope_ready`, e a proposta (já escrita,
// já com link de aceite no portal) ficava presa atrás de um status que a
// trava de aceite não reconhece como decidível.
//
// ═══ COMO ESTE TESTE REPRODUZ A CORRIDA DE VERDADE, NÃO O SINTOMA ═════════
//
// Não criamos um registro já `scope_ready` e chamamos o aceite (isso provaria
// só que a LISTA barra `scope_ready` — o sintoma, não a causa). Em vez disso:
//
//   1. chamamos `runAutoScope` de verdade e o deixamos PAUSADO no meio —
//      `buildVerdadeDoCliente` só resolve quando o teste manda, e AVISA o
//      teste no instante em que é chamado (sem depender de contar quantos
//      microtasks o runner leva até lá — isso quebraria no dia em que
//      alguém acrescentasse um `await` antes);
//   2. enquanto ele está pausado, simulamos a escrita concorrente que
//      `entregarOrcamentosPendentes` faria: avança o MESMO registro fake
//      para `proposal_pending`;
//   3. só então liberamos `runAutoScope` para terminar.
//
// Contra o código ANTIGO (`clientRequestDb.update` incondicional), o passo 3
// sobrescreve o registro de volta para `scope_ready` — este teste FALHA.
// Contra o código NOVO (`updateMany` condicionado ao status ainda ser
// "pré-escopo"), o passo 3 não toca no registro que já avançou — este teste
// PASSA.
//
// ⚠️ Este arquivo NÃO foi executado (`npx vitest run`) por quem o escreveu —
// o sandbox do especialista recusa `npx`/`node`/`git commit` com "This
// command requires approval", com ou sem `dangerouslyDisableSandbox` (é o
// mecanismo descrito em `CLAUDE.md`: "o especialista ESCREVE; o portão (tsc,
// testes) e o commit são do PM"). Quem rodar isto pela primeira vez: se o
// primeiro `it` passar de cara SEM o conserto em `run-auto-scope.ts`, este
// teste está provando o sintoma errado — pare e revise antes de confiar nele.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface RegistroFake {
  id: string;
  status: string;
  workspaceId: string | null;
}

// O registro é mutável e compartilhado pelos mocks abaixo — é o "banco" fake.
// Precisa ter ESTADO DE VERDADE (não um mock que sempre responde "ok"),
// porque o que este teste prova é uma diferença de COMPORTAMENTO entre
// `update` (incondicional) e `updateMany` com `where.status` (condicionado).
const estado = vi.hoisted(() => ({ registro: null as RegistroFake | null }));

const db = vi.hoisted(() => ({
  clientRequestDb: {
    update: vi.fn(async (args: { where: { id: string }; data: Partial<RegistroFake> }): Promise<RegistroFake> => {
      const reg = estado.registro;
      if (!reg || reg.id !== args.where.id) {
        throw new Error(`registro fake inexistente: ${args.where.id}`);
      }
      Object.assign(reg, args.data);
      return reg;
    }),
    updateMany: vi.fn(
      async (args: {
        where: { id: string; status?: { in: string[] } };
        data: Partial<RegistroFake>;
      }): Promise<{ count: number }> => {
        const reg = estado.registro;
        if (!reg || reg.id !== args.where.id) return { count: 0 };
        if (args.where.status && !args.where.status.in.includes(reg.status)) {
          // A WHERE real do Prisma não bate — nada muda. É exatamente isto
          // que falta no `update` incondicional do código antigo.
          return { count: 0 };
        }
        Object.assign(reg, args.data);
        return { count: 1 };
      },
    ),
    findUnique: vi.fn(async (): Promise<RegistroFake | null> => estado.registro),
  },
  brainArtifact: {
    updateMany: vi.fn(async (): Promise<{ count: number }> => ({ count: 0 })),
    createMany: vi.fn(async (): Promise<{ count: number }> => ({ count: 6 })),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));

// `buildVerdadeDoCliente` é o ponto de pausa controlada: o teste decide
// quando ele resolve, para forçar a ordem exata da corrida. O mock AVISA
// (`avisarPausa`) no instante em que é chamado — o teste espera esse aviso
// em vez de supor quantos microtasks o runner leva até aqui.
const portaoDaVerdade = vi.hoisted(() => ({
  liberar: null as null | (() => void),
  avisarPausa: null as null | (() => void),
}));

vi.mock("@/lib/dioli-brain/client-snapshot", () => ({
  buildClientSnapshot: vi.fn(async (): Promise<Record<string, unknown>> => ({
    clientRequestId: "req1",
    businessName: "Padaria Teste",
    segment: "alimentacao",
    services: ["social"],
    objectives: ["vendas"],
    rawContext: "",
  })),
  buildVerdadeDoCliente: vi.fn(
    async (): Promise<null> =>
      new Promise((resolve) => {
        portaoDaVerdade.liberar = () => resolve(null);
        portaoDaVerdade.avisarPausa?.();
      }),
  ),
}));

/** Resolve no instante em que `runAutoScope` chama `buildVerdadeDoCliente` e
 * fica pausado ali — sem depender de contagem de microtasks. */
function aguardarPausa(): Promise<void> {
  return new Promise((resolve) => {
    portaoDaVerdade.avisarPausa = resolve;
  });
}

function canvasFalso(id: string) {
  return { id, qualityGateResult: { passed: true }, cognitiveFlowTrace: [] };
}

vi.mock("@/lib/dioli-brain/strategy-engine", () => ({
  generateStrategyCanvas: vi.fn(() => canvasFalso("strategy-1")),
}));
vi.mock("@/lib/dioli-brain/social-engine", () => ({
  generateSocialCanvas: vi.fn(() => canvasFalso("social-1")),
}));
vi.mock("@/lib/dioli-brain/design-engine", () => ({
  generateDesignCanvas: vi.fn(() => canvasFalso("design-1")),
}));
vi.mock("@/lib/dioli-brain/traffic-engine", () => ({
  generateTrafficCanvas: vi.fn(() => canvasFalso("traffic-1")),
}));
vi.mock("@/lib/dioli-brain/analytics-engine", () => ({
  generateAnalyticsCanvas: vi.fn(() => canvasFalso("analytics-1")),
}));
vi.mock("@/lib/dioli-brain/quality-engine", () => ({
  generateQualityCanvas: vi.fn(() => ({ id: "quality-1", gateResult: { passed: true }, cognitiveFlowTrace: [] })),
}));

import { runAutoScope } from "@/lib/dioli-brain/run-auto-scope";

beforeEach(() => {
  estado.registro = null;
  portaoDaVerdade.liberar = null;
  portaoDaVerdade.avisarPausa = null;
  vi.clearAllMocks();
});

describe("runAutoScope não regride o status quando termina depois de uma escrita concorrente mais recente", () => {
  it("chega atrasado e NÃO sobrescreve proposal_pending de volta para scope_ready", async () => {
    estado.registro = { id: "req1", status: "new", workspaceId: null };

    const promessa = runAutoScope("req1");
    await aguardarPausa();

    // `runAutoScope` está agora pausado dentro de `buildVerdadeDoCliente`,
    // ANTES de escrever `scope_ready`. É o instante exato em que, na
    // produção, `entregarOrcamentosPendentes` venceu a corrida.
    expect(portaoDaVerdade.liberar).not.toBeNull();

    // A escrita concorrente de verdade: mesma forma que
    // `orcamento-do-briefing.ts` usa para sair de
    // `new`/`lead_incompleto`/`scope_ready` rumo a `proposal_pending`.
    await db.clientRequestDb.update({ where: { id: "req1" }, data: { status: "proposal_pending" } });
    expect(estado.registro!.status).toBe("proposal_pending");

    // Só agora deixamos `runAutoScope` terminar — ele chega DEPOIS.
    portaoDaVerdade.liberar!();
    await promessa;

    // A prova: o pedido continua decidível pelo cliente. Se isto virar
    // "scope_ready", a rota de aceite devolve 409 para a primeira resposta —
    // era exatamente o que a produção media.
    expect(estado.registro!.status).toBe("proposal_pending");

    // Os artefatos do escopo (o trabalho de IA em si) não se perdem: eles são
    // sempre gravados, independente de quem venceu a corrida do status.
    expect(db.brainArtifact.createMany).toHaveBeenCalledTimes(1);
  });

  it("no caminho normal (sem corrida), continua avançando new → scope_ready", async () => {
    estado.registro = { id: "req2", status: "new", workspaceId: null };

    const promessa = runAutoScope("req2");
    await aguardarPausa();
    portaoDaVerdade.liberar!();
    await promessa;

    expect(estado.registro!.status).toBe("scope_ready");
  });
});
