// DERIVAÇÃO — o mapa do Marco 1 vira código testado; desconhecido vira null,
// nunca chute.

import { describe, it, expect } from "vitest";
import {
  derivarDeOportunidade,
  derivarDeClientRequest,
  derivarDeBriefing,
  derivarDeSocialPost,
  derivarDeTask,
  derivarDeApprovalRequest,
  derivarDeCycle,
  derivarDeDeliverable,
} from "@/lib/agency/estados-v2/derivar";
import { ESTADOS_V2 } from "@/lib/agency/catalogo-v2/catalogo";

describe("derivação legado → canônico", () => {
  it("oportunidade: nova→intake, encerrada→closed", () => {
    expect(derivarDeOportunidade({ status: "nova" })).toBe("intake");
    expect(derivarDeOportunidade({ status: "encerrada" })).toBe("closed");
  });

  it("social post: draft→production, scheduled→implementation, published→measurement", () => {
    expect(derivarDeSocialPost({ status: "draft" })).toBe("production");
    expect(derivarDeSocialPost({ status: "scheduled" })).toBe("implementation");
    expect(derivarDeSocialPost({ status: "published" })).toBe("measurement");
  });

  it("tarefa bloqueada por material vence o status — bloqueio não finge atividade", () => {
    expect(derivarDeTask({ status: "in_progress", bloqueadaPorMaterial: true })).toBe("blocked_materials");
    expect(derivarDeTask({ status: "in_progress" })).toBe("production");
  });

  it("aprovação do cliente: pending→client_approval, revisão preserva versões", () => {
    expect(derivarDeApprovalRequest({ status: "pending" })).toBe("client_approval");
    expect(derivarDeApprovalRequest({ status: "request_revision" })).toBe("revision");
    expect(derivarDeApprovalRequest({ status: "approved" })).toBe("implementation");
  });

  it("briefing: lacuna aberta segura em briefing_incomplete", () => {
    expect(derivarDeBriefing({ status: "analyzed", lacunasAbertas: 2 })).toBe("briefing_incomplete");
    expect(derivarDeBriefing({ status: "analyzed", lacunasAbertas: 0 })).toBe("briefing_ready");
  });

  it("ciclo: aberto→measurement, fechado→cycle_closed", () => {
    expect(derivarDeCycle({ status: "aberto" })).toBe("measurement");
    expect(derivarDeCycle({ status: "fechado" })).toBe("cycle_closed");
  });

  it("TODO valor derivado pertence aos 20 estados canônicos", () => {
    const derivados = [
      derivarDeOportunidade({ status: "nova" }),
      derivarDeClientRequest({ status: "new" }),
      derivarDeBriefing({ status: "pending_analysis" }),
      derivarDeSocialPost({ status: "scheduled" }),
      derivarDeTask({ status: "pending" }),
      derivarDeApprovalRequest({ status: "approved" }),
      derivarDeCycle({ status: "fechado" }),
      derivarDeDeliverable({ status: "draft" }),
    ];
    for (const d of derivados) {
      expect(d).not.toBeNull();
      expect(ESTADOS_V2).toContain(d!);
    }
  });

  it("status desconhecido devolve null — não sei não vira estado", () => {
    expect(derivarDeOportunidade({ status: "widee" })).toBeNull();
    expect(derivarDeSocialPost({ status: "" })).toBeNull();
    expect(derivarDeTask({ status: "qualquer" })).toBeNull();
  });
});
