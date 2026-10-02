// CEO, 01/10/2026: "a aprovação do CEO vale como régua". Marca com ficha
// incompleta publica só peça aprovada pelo CEO (carimbo `ceo:`), e a peça sai
// carimbada `fichaIncompleta`. Sem a aprovação dele, nada publica.
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.hoisted(() =>
  vi.fn(async (): Promise<Array<{ reviewedBy: string | null; reviewedAt: Date | null; sourcePostIdsJson: string }>> => []),
);
vi.mock("@/lib/db/client", () => ({ prisma: { approvalRequest: { findMany } } }));

import { aprovadaPeloCeo } from "@/lib/agency/esteira/aprovacao-da-peca";
import { comFichaIncompleta } from "@/lib/agency/esteira/publicacao";

beforeEach(() => findMany.mockReset());

describe("aprovadaPeloCeo", () => {
  it("carimbo ceo: decidido para ESTA peça → true", async () => {
    findMany.mockResolvedValue([{ reviewedBy: "ceo:u1@2026-10-01", reviewedAt: new Date(), sourcePostIdsJson: '["p1"]' }]);
    expect(await aprovadaPeloCeo("p1", "c1")).toBe(true);
  });

  it("aprovação do cliente ou por regra NÃO vale como régua de ficha incompleta", async () => {
    findMany.mockResolvedValue([
      { reviewedBy: "client:Maria", reviewedAt: new Date(), sourcePostIdsJson: '["p1"]' },
      { reviewedBy: "regra-da-marca:piloto_automatico@2026-10-01", reviewedAt: new Date(), sourcePostIdsJson: '["p1"]' },
    ]);
    expect(await aprovadaPeloCeo("p1", "c1")).toBe(false);
  });

  it("carimbo ceo: de OUTRA peça (id prefixo) não vale", async () => {
    findMany.mockResolvedValue([{ reviewedBy: "ceo:u1@2026-10-01", reviewedAt: new Date(), sourcePostIdsJson: '["p10"]' }]);
    expect(await aprovadaPeloCeo("p1", "c1")).toBe(false);
  });

  it("banco indisponível → false (fail-closed)", async () => {
    // Uma "promessa" que já falhou: `.catch` recebe o erro, como no banco fora do ar.
    findMany.mockImplementation((() => ({ catch: (h: (e: Error) => unknown) => Promise.resolve(h(new Error("down"))) })) as never);
    expect(await aprovadaPeloCeo("p1", "c1")).toBe(false);
  });
});

describe("comFichaIncompleta", () => {
  it("carimba preservando o resto", () => {
    expect(JSON.parse(comFichaIncompleta('{"fase":"final"}')!)).toEqual({ fase: "final", fichaIncompleta: true });
  });
  it("scriptJson que não é objeto fica intacto", () => {
    expect(comFichaIncompleta("não é json")).toBeUndefined();
  });
});
