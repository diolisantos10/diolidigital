// Unit tests for client request normalization (B1 + B3 fixes)
// Verifies: JSON fields parsed as objects/arrays, not raw strings

import { describe, it, expect } from "vitest";
import { normalizeClientRequest } from "@/lib/agency/persistence/client-request-service";
import { parseJson } from "@/lib/agency/db-pipeline-hooks";

// ── normalizeClientRequest ────────────────────────────────────────────────────

describe("normalizeClientRequest", () => {
  function makeRaw(overrides?: Record<string, unknown>) {
    return {
      id: "test-id",
      businessName: "Sushi Cazza",
      segment: "Restaurante / Alimentação",
      services: JSON.stringify(["Gestão de Redes Sociais", "Tráfego Pago"]),
      objectives: JSON.stringify(["Aumentar visibilidade", "Fidelização"]),
      rawContext: "raw text",
      source: "briefing",
      status: "new",
      workspaceId: null,
      clientId: null,
      briefingJson: JSON.stringify({ transcript: [{ id: "1", role: "client", text: "Olá" }] }),
      sdrHandoffJson: JSON.stringify({ negotiationStage: "proposal_ready", qualificationScore: 85 }),
      attachmentsJson: JSON.stringify([{ id: "att1", fileName: "brand.pdf", fileType: "PDF", sizeBytes: 100000 }]),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Parameters<typeof normalizeClientRequest>[0];
  }

  it("parses services from JSON string to string[]", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(result.services).toEqual(["Gestão de Redes Sociais", "Tráfego Pago"]);
    expect(Array.isArray(result.services)).toBe(true);
  });

  it("parses objectives from JSON string to string[]", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(result.objectives).toEqual(["Aumentar visibilidade", "Fidelização"]);
    expect(Array.isArray(result.objectives)).toBe(true);
  });

  it("parses briefingJson from JSON string to object", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(typeof result.briefingJson).toBe("object");
    expect(result.briefingJson).not.toBeNull();
    const transcript = (result.briefingJson as Record<string, unknown>).transcript;
    expect(Array.isArray(transcript)).toBe(true);
    expect((transcript as unknown[])).toHaveLength(1);
  });

  it("parses sdrHandoffJson from JSON string to object", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(typeof result.sdrHandoffJson).toBe("object");
    expect((result.sdrHandoffJson as Record<string, unknown>).negotiationStage).toBe("proposal_ready");
  });

  it("parses attachmentsJson from JSON string to array", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(Array.isArray(result.attachmentsJson)).toBe(true);
    expect(result.attachmentsJson).toHaveLength(1);
    const att = result.attachmentsJson[0] as Record<string, unknown>;
    expect(att.fileName).toBe("brand.pdf");
  });

  it("returns empty arrays for null/empty JSON fields", () => {
    const result = normalizeClientRequest(makeRaw({
      briefingJson: null,
      sdrHandoffJson: null,
      attachmentsJson: "[]",
    }));
    expect(result.briefingJson).toBeNull();
    expect(result.sdrHandoffJson).toBeNull();
    expect(result.attachmentsJson).toEqual([]);
  });

  it("handles malformed JSON gracefully — falls back to empty values", () => {
    const result = normalizeClientRequest(makeRaw({
      services: "not-valid-json",
      objectives: "{broken",
    }));
    expect(result.services).toEqual([]);
    expect(result.objectives).toEqual([]);
  });

  it("preserves scalar fields unchanged", () => {
    const result = normalizeClientRequest(makeRaw());
    expect(result.id).toBe("test-id");
    expect(result.businessName).toBe("Sushi Cazza");
    expect(result.status).toBe("new");
  });
});

// ── parseJson (db-pipeline-hooks) — handles string AND already-parsed values ──

describe("parseJson — handles pre-parsed API responses", () => {
  it("parses JSON string to array", () => {
    expect(parseJson('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("passes through already-parsed array unchanged", () => {
    const arr = ["a", "b"];
    expect(parseJson(arr, [])).toBe(arr);
  });

  it("passes through already-parsed object unchanged", () => {
    const obj = { key: "value" };
    expect(parseJson(obj, null)).toBe(obj);
  });

  it("returns fallback for null", () => {
    expect(parseJson(null, [])).toEqual([]);
  });

  it("returns fallback for undefined", () => {
    expect(parseJson(undefined, [])).toEqual([]);
  });

  it("returns fallback for malformed JSON string", () => {
    expect(parseJson("{broken", [])).toEqual([]);
  });
});
