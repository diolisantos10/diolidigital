// analises-rodar-rota.test.ts — a porta de `/api/social/analises/rodar`
// (F2-F1, S8 — revisão de segurança, 28/09/2026).
//
// O achado: `clientId` AUSENTE roda "todas as marcas do workspace" — a rota
// chamava `rodarAnaliseSemanal` sem `limite`, e o motor (`analista-semanal.ts`)
// só tem teto quando alguém PASSA `limite` (o despertador passa `1`; esta
// rota não passava nada = sem teto nenhum). Uma chamada manual processaria N
// marcas na Meta + N chamadas de IA, sequenciais, sem pausa, numa única
// requisição — a mesma classe de rajada que restringiu a conta de anúncios
// da agência em 03/08/2026.
//
// Este teste NÃO re-prova o motor (`__tests__/esteira/analista-semanal.test.ts`
// já trava que `limite` é respeitado por `rodarAnaliseSemanal`); ele prova que
// a ROTA decide o `limite` certo: nenhum quando `clientId` vem no corpo (só
// uma marca é tocada de qualquer jeito), e o teto nomeado
// (`LIMITE_DE_MARCAS_SEM_CLIENTE`) quando `clientId` está ausente.
//
// Guarda também confirmada aqui (mesmo molde de `aplicar`/`descartar`): só
// master, portal recusado, CSRF, rate limit, `semanaDe` inválida → 400.
//
// Mocks TIPADOS (regra do CLAUDE.md — mock sem assinatura infere `never`).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireSession = vi.hoisted(() => vi.fn());
const clienteOuNulo = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const deveBloquearMutacaoCrossSite = vi.hoisted(() => vi.fn());
const rodarAnaliseSemanal = vi.hoisted(() =>
  vi.fn(async (..._args: any[]): Promise<{ analisadas: any[]; puladas: any[]; falhas: any[] }> => ({
    analisadas: [], puladas: [], falhas: [],
  })),
);

vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/esteira/posse-do-cliente", () => ({ clienteOuNulo }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/security/navegacao-cross-site", () => ({ deveBloquearMutacaoCrossSite }));
// Mock TOTAL do módulo (nunca `importActual`) — o real puxa `@/lib/db/client`,
// `@/lib/ai/generate` e a leitura da Meta, a mesma árvore pesada que
// `limite-de-refacoes-rota.test.ts` já evita pelo mesmo motivo. `semanaDaData`
// é reproduzida aqui só o suficiente para a rota distinguir formato
// válido/inválido — este teste não é sobre a MATEMÁTICA da semana (isso já
// está travado em `analista-semanal.test.ts`), é sobre o que a ROTA decide
// mandar para o motor.
vi.mock("@/lib/agency/esteira/analista-semanal", () => ({
  rodarAnaliseSemanal,
  semanaDaData: (s: string): { de: Date; ate: Date } | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return { de: new Date(`${s}T03:00:00.000Z`), ate: new Date(`${s}T03:00:00.000Z`) };
  },
}));

import { POST, LIMITE_DE_MARCAS_SEM_CLIENTE } from "@/app/api/social/analises/rodar/route";

function req(body?: unknown): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/social/analises/rodar", {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { workspaceId: "ws1", userId: "u1", role: "master" }, error: null });
  clienteOuNulo.mockResolvedValue({ id: "cli1" });
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  deveBloquearMutacaoCrossSite.mockReturnValue(false);
});

describe("o teto quando clientId está ausente — caso plantado", () => {
  it("sem clientId: chama o motor com o limite nomeado (nunca 'todas de uma vez')", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(rodarAnaliseSemanal).toHaveBeenCalledTimes(1);
    const args = rodarAnaliseSemanal.mock.calls[0]![0];
    expect(args.limite).toBe(LIMITE_DE_MARCAS_SEM_CLIENTE);
    expect(LIMITE_DE_MARCAS_SEM_CLIENTE).toBeGreaterThan(0);
  });

  it("corpo vazio (sem JSON nenhum): mesmo teto — clientId ausente é o caso normal, não erro", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(rodarAnaliseSemanal.mock.calls[0]![0].limite).toBe(LIMITE_DE_MARCAS_SEM_CLIENTE);
  });
});

describe("com clientId — caso limpo: sem teto, a trava não inventa problema onde só uma marca é tocada", () => {
  it("clientId presente: limite é undefined (só aquela marca, sem risco de rajada)", async () => {
    const res = await POST(req({ clientId: "cli1" }));
    expect(res.status).toBe(200);
    expect(clienteOuNulo).toHaveBeenCalledWith("cli1", expect.objectContaining({ workspaceId: "ws1" }));
    const args = rodarAnaliseSemanal.mock.calls[0]![0];
    expect(args.clientId).toBe("cli1");
    expect(args.limite).toBeUndefined();
  });

  it("clientId de outro workspace (clienteOuNulo nega): 404, motor nunca chamado", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await POST(req({ clientId: "cli-de-outro-workspace" }));
    expect(res.status).toBe(404);
    expect(rodarAnaliseSemanal).not.toHaveBeenCalled();
  });
});

describe("guarda de sempre — sem regressão", () => {
  it("sessão de portal (clientId na sessão): 403, nunca chega ao motor", async () => {
    requireSession.mockResolvedValue({
      session: { workspaceId: "ws1", userId: "u1", role: "master", clientId: "cli-portal" },
      error: null,
    });
    const res = await POST(req({}));
    expect(res.status).toBe(403);
    expect(rodarAnaliseSemanal).not.toHaveBeenCalled();
  });

  it("origem cross-site: 403, nunca chega ao motor", async () => {
    deveBloquearMutacaoCrossSite.mockReturnValue(true);
    const res = await POST(req({}));
    expect(res.status).toBe(403);
    expect(rodarAnaliseSemanal).not.toHaveBeenCalled();
  });

  it("rate limit da rota estourado: 429 com Retry-After, nunca chega ao motor", async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfter: 42 });
    const res = await POST(req({}));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(rodarAnaliseSemanal).not.toHaveBeenCalled();
  });

  it("semanaDe fora do formato AAAA-MM-DD: 400, nunca chega ao motor", async () => {
    const res = await POST(req({ semanaDe: "22 de setembro" }));
    expect(res.status).toBe(400);
    expect(rodarAnaliseSemanal).not.toHaveBeenCalled();
  });
});
