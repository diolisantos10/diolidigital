import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  deliverable: { findFirst: vi.fn() },
  brandBrain: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { colherIdentidadeDaEntrega } from "@/lib/agency/execution/colher-identidade";

const ENTREGA = `Uma identidade quente, artesanal, que lembra forno de tijolo.

**1. Paleta**
- Paleta: #8B4513 · #F5DEB3
- Tipografia: Playfair Display para títulos, Inter para textos
- Assinatura: O pão de todo dia`;

beforeEach(() => {
  vi.clearAllMocks();
  db.deliverable.findFirst.mockResolvedValue({ content: ENTREGA });
  db.brandBrain.findUnique.mockResolvedValue(null);
  db.brandBrain.create.mockResolvedValue({});
  db.brandBrain.update.mockResolvedValue({});
});

describe("a marca que a agência criou vira a marca que ela usa", () => {
  it("colhe cor, tipografia e assinatura da entrega de identidade", async () => {
    const r = await colherIdentidadeDaEntrega("p1", "c1");
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.primaryColor).toBe("#8B4513");
    expect(dados.secondaryColor).toBe("#F5DEB3");
    expect(dados.typography).toMatch(/Playfair/);
    expect(dados.tagline).toBe("O pão de todo dia");
    expect(r.camposPreenchidos).toContain("primaryColor");
  });

  it("prefere hex a nome de cor — 'azul petróleo' não reproduz a mesma cor duas vezes", async () => {
    db.deliverable.findFirst.mockResolvedValue({
      content: "- Paleta: azul petróleo e areia\n- Tipografia: Inter",
    });
    await colherIdentidadeDaEntrega("p1", "c1");
    expect(db.brandBrain.create.mock.calls[0]![0].data.primaryColor).toBe("azul petróleo");
  });

  it("NÃO sobrescreve o que já existe — ajuste da agência vale mais que proposta do modelo", async () => {
    db.brandBrain.findUnique.mockResolvedValue({ primaryColor: "#000000", typography: null });
    await colherIdentidadeDaEntrega("p1", "c1");
    const dados = db.brandBrain.update.mock.calls[0]![0].data;
    expect(dados.primaryColor).toBeUndefined();
    expect(dados.typography).toMatch(/Playfair/);
  });

  it("projeto sem entrega de identidade não é erro — só não há o que colher", async () => {
    db.deliverable.findFirst.mockResolvedValue(null);
    const r = await colherIdentidadeDaEntrega("p1", "c1");
    expect(r.encontrouEntrega).toBe(false);
    expect(db.brandBrain.create).not.toHaveBeenCalled();
  });

  it("lê também o formato **Campo:** — o motor produz os dois", async () => {
    db.deliverable.findFirst.mockResolvedValue({ content: "**Tipografia:** Lora e Inter" });
    await colherIdentidadeDaEntrega("p1", "c1");
    expect(db.brandBrain.create.mock.calls[0]![0].data.typography).toBe("Lora e Inter");
  });

  it("sem cliente não grava nada", async () => {
    await colherIdentidadeDaEntrega("p1", null);
    expect(db.brandBrain.create).not.toHaveBeenCalled();
  });
});
