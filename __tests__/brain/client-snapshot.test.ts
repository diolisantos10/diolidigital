// Phase B tests — ClientKnowledgeSnapshot built from DB truth.
// Prisma is mocked: we assert the mapping (null→undefined, missingFields, no PII)
// without a live database.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueRequest = vi.fn();
const findUniqueBrand = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    clientRequestDb: { findUnique: (...a: unknown[]) => findUniqueRequest(...a) },
    brandBrain: { findUnique: (...a: unknown[]) => findUniqueBrand(...a) },
  },
}));

import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";

beforeEach(() => {
  findUniqueRequest.mockReset();
  findUniqueBrand.mockReset();
});

describe("buildClientSnapshot", () => {
  it("known id with full BrandBrain → snapshot with mapped fields", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req1",
      clientId: "cli1",
      businessName: "Padaria Aurora",
      segment: "Alimentação",
      services: JSON.stringify(["Social Media", "Tráfego Pago"]),
      objectives: JSON.stringify(["Vender mais"]),
      rawContext: "Padaria de bairro.",
    });
    findUniqueBrand.mockResolvedValue({
      clientId: "cli1",
      tone: "Acolhedor e artesanal",
      positioning: "Padaria artesanal premium do bairro",
      targetAudience: "Moradores locais 25-55",
      typography: "Serifada elegante",
      primaryColor: "#3B2F2F",
      secondaryColor: "#F5E6D3",
    });

    const snap = await buildClientSnapshot("req1");
    expect(snap).not.toBeNull();
    expect(snap!.businessName).toBe("Padaria Aurora");
    expect(snap!.services).toEqual(["Social Media", "Tráfego Pago"]);
    expect(snap!.brandVoice).toBe("Acolhedor e artesanal");
    expect(snap!.positioning).toContain("artesanal");
    expect(snap!.fonts).toBe("Serifada elegante");
    expect(snap!.colors).toBe("#3B2F2F, #F5E6D3");
    // Fields with no DB column are reported missing, never invented.
    expect(snap!.preferredChannels).toBeUndefined();
    expect(snap!.missingFields).toContain("preferredChannels");
    expect(snap!.missingFields).toContain("visualStyle");
    expect(snap!.brandBrainComplete).toBe(false);
  });

  it("missing id → null", async () => {
    findUniqueRequest.mockResolvedValue(null);
    const snap = await buildClientSnapshot("nope");
    expect(snap).toBeNull();
  });

  it("request with no linked client → all brand fields missing, never invented", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req2",
      clientId: null,
      businessName: "Studio X",
      segment: "Design",
      services: "[]",
      objectives: "[]",
      rawContext: "",
    });
    const snap = await buildClientSnapshot("req2");
    expect(snap).not.toBeNull();
    expect(findUniqueBrand).not.toHaveBeenCalled();
    expect(snap!.positioning).toBeUndefined();
    expect(snap!.targetAudience).toBeUndefined();
    expect(snap!.missingFields.length).toBeGreaterThan(0);
    expect(snap!.brandBrainComplete).toBe(false);
  });

  it("empty BrandBrain string fields → undefined + listed in missingFields", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req3",
      clientId: "cli3",
      businessName: "Café Lua",
      segment: "Alimentação",
      services: "[]",
      objectives: "[]",
      rawContext: "",
    });
    findUniqueBrand.mockResolvedValue({
      clientId: "cli3",
      tone: "   ",
      positioning: "",
      targetAudience: null,
      typography: null,
      primaryColor: null,
      secondaryColor: null,
    });
    const snap = await buildClientSnapshot("req3");
    expect(snap!.brandVoice).toBeUndefined();
    expect(snap!.positioning).toBeUndefined();
    expect(snap!.colors).toBeUndefined();
    expect(snap!.missingFields).toContain("brandVoice");
    expect(snap!.missingFields).toContain("positioning");
  });
});
