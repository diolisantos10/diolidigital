import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocka só o builder do snapshot (que usa prisma); a lógica de plano do PM
// (proposeProjectRuleBased) roda de verdade — é ela que define a ordem.
const buildClientSnapshot = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dioli-brain/client-snapshot", () => ({ buildClientSnapshot }));

import { planProduction } from "@/lib/agency/execution/pm-conductor";

const RUNNABLE = ["social-media", "design", "paid-traffic", "analytics"];

function snap(services: string[], missingFields: string[] = []) {
  return { businessName: "Loja X", services, objectives: ["vender mais"], missingFields };
}

beforeEach(() => vi.clearAllMocks());

describe("PM conductor — o PM rege a ordem da produção", () => {
  it("ordena por dependência: estratégia primeiro (fora dos runnable), depois produtores na ordem do PM", async () => {
    buildClientSnapshot.mockResolvedValue(snap(["social", "design", "tráfego"]));
    const plan = await planProduction("cr1", RUNNABLE);
    // strategy fica de fora (não é runnable no motor); a ORDEM segue o plano do PM:
    // produtores primeiro, analytics por último (dependência).
    expect(plan.orderedDepartments).toEqual(["social-media", "design", "paid-traffic", "analytics"]);
    expect(plan.goal).toBeTruthy();
    expect(plan.pmMode).toBe("rule_based");
  });

  it("só tráfego pedido → só tráfego entra (PM não infla o escopo)", async () => {
    buildClientSnapshot.mockResolvedValue(snap(["tráfego pago"]));
    const plan = await planProduction("cr1", RUNNABLE);
    // tráfego pedido + analytics (que o PM sempre inclui, por último).
    expect(plan.orderedDepartments).toEqual(["paid-traffic", "analytics"]);
  });

  it("sem serviço claro → cai em social (regra de fallback do PM)", async () => {
    buildClientSnapshot.mockResolvedValue(snap([]));
    const plan = await planProduction("cr1", RUNNABLE);
    expect(plan.orderedDepartments).toContain("social-media");
  });

  it("Brand Brain incompleto vira aviso do PM", async () => {
    buildClientSnapshot.mockResolvedValue(snap(["social"], ["primaryColor", "tone"]));
    const plan = await planProduction("cr1", RUNNABLE);
    expect(plan.warnings.join(" ")).toMatch(/brand brain/i);
  });

  it("snapshot indisponível → plano vazio, não quebra", async () => {
    buildClientSnapshot.mockResolvedValue(null);
    const plan = await planProduction("cr1", RUNNABLE);
    expect(plan.orderedDepartments).toEqual([]);
  });
});
