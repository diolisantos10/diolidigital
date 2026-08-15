// LEITURA DUPLA — divergência vira dado; conjunto vazio não é aprovação.

import { describe, it, expect } from "vitest";
import { reconciliar } from "@/lib/agency/estados-v2/leitura-dupla";

describe("reconciliar", () => {
  it("zero divergência num conjunto real = promovível", () => {
    const r = reconciliar("SocialPost", [
      { id: "a", gravado: "production", derivado: "production" },
      { id: "b", gravado: "measurement", derivado: "measurement" },
    ]);
    expect(r.veredito).toBe("promovivel");
    expect(r.divergentes).toBe(0);
  });

  it("UMA divergência já derruba a promoção, com amostra nomeada", () => {
    const r = reconciliar("SocialPost", [
      { id: "a", gravado: "production", derivado: "production" },
      { id: "b", gravado: "production", derivado: "implementation" },
    ]);
    expect(r.veredito).toBe("nao_promovivel");
    expect(r.amostra).toEqual([{ id: "b", gravado: "production", derivado: "implementation" }]);
  });

  it("ausência conta como divergência — backfill que não passou e mapa que não existe", () => {
    const r = reconciliar("Task", [
      { id: "a", gravado: null, derivado: "production" }, // backfill não passou
      { id: "b", gravado: "production", derivado: null }, // sem mapa
    ]);
    expect(r.divergentes).toBe(2);
  });

  it("conjunto VAZIO não é promovível — não medir não é passar", () => {
    expect(reconciliar("Cycle", []).veredito).toBe("nao_promovivel");
  });

  it("a amostra tem teto; a contagem não", () => {
    const comparacoes = Array.from({ length: 100 }, (_, i) => ({
      id: `x${i}`, gravado: "production", derivado: "internal_review",
    }));
    const r = reconciliar("Task", comparacoes, 20);
    expect(r.divergentes).toBe(100);
    expect(r.amostra).toHaveLength(20);
  });
});
