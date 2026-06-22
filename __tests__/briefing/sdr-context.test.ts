// SDR Context Awareness — validates that the briefing bot does NOT ask for
// information the user already provided (business name, segment) and uses
// the "Entendi que estamos falando de X" confirmation pattern when partial
// context is already known.
//
// Scenario under test: Sushi Cazza brand-book upload + business name mention.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastAssistantText(state: ReturnType<typeof initProspectConvState>): string {
  const msgs = state.conv.messages.filter((m) => m.role === "assistant");
  return msgs[msgs.length - 1]?.text ?? "";
}

function scopeOf(state: ReturnType<typeof initProspectConvState>) {
  return state.conv.scope;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SDR context awareness — Sushi Cazza scenario", () => {
  it("detects business name via 'chamado X' and does NOT re-ask for it", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "Olá, tenho um restaurante chamado Sushi Cazza e quero gestão de redes sociais",
      s0,
    );
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    // Next reply must NOT ask "qual é o seu nome e o nome do seu negócio?" from scratch
    expect(lastAssistantText(s1)).not.toContain("nome do seu negócio");
    // It should ask for the person's name (since that's still missing)
    expect(lastAssistantText(s1)).toContain("Sushi Cazza");
  });

  it("detects business name via 'sou da [Name]'", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "Oi, sou da Sushi Cazza e preciso de redes sociais",
      s0,
    );
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    expect(lastAssistantText(s1)).not.toContain("nome do seu negócio");
    expect(lastAssistantText(s1)).toContain("Sushi Cazza");
  });

  it("detects business name from multi-word TitleCase at start of message", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Sushi Cazza, quero gestão de redes sociais", s0);
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    expect(lastAssistantText(s1)).not.toContain("nome do seu negócio");
  });

  it("detects business name from standalone TitleCase proper noun", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Sushi Cazza", s0);
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
  });

  it("uses attachment file name as weak signal when text has no business name", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "quero gestão de redes sociais para o restaurante",
      s0,
      ["sushi_cazza_brand_book.pdf"],
    );
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    expect(lastAssistantText(s1)).not.toContain("nome do seu negócio");
  });

  it("file name hint is NOT used when text already provides the business name", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "Oi, sou da Hanamasa e preciso de social media",
      s0,
      ["sushi_cazza_brand_book.pdf"],
    );
    // Text-detected name takes priority over file hint
    expect(scopeOf(s1).businessName).toBe("Hanamasa");
  });

  it("confirmation pattern: when businessName known but prospectName missing", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "Olá, tenho um restaurante chamado Sushi Cazza e quero redes sociais",
      s0,
    );
    // businessName set, prospectName not yet set → question fires
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    expect(scopeOf(s1).prospectName).toBeUndefined();
    // The reply should use the confirmation pattern
    const reply = lastAssistantText(s1);
    expect(reply).toMatch(/entendi.*sushi cazza/i);
    expect(reply).toContain("nome");
  });

  it("when user answers confirmed-biz question with their name only, scope updates correctly", () => {
    const s0 = initProspectConvState();
    // First message: business name detected
    const s1 = processProspectMessage(
      "Oi, tenho um sushi bar chamado Sushi Cazza",
      s0,
    );
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");

    // Second message: user answers with their name
    const s2 = processProspectMessage("Me chamo João Ferreira", s1);
    expect(scopeOf(s2).prospectName).toBe("João Ferreira");
    expect(scopeOf(s2).businessName).toBe("Sushi Cazza"); // unchanged
  });

  it("'Sushi Cazza' is not stored as prospectName when businessName is already set", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Sushi Cazza, preciso de social media", s0);
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");
    // "Sushi Cazza" must NOT be stored as the prospect's personal name
    expect(scopeOf(s1).prospectName).not.toBe("Sushi Cazza");
  });

  it("segment 'Restaurante/Alimentação' detected from 'sushi' keyword", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage(
      "Tenho um sushi bar chamado Sushi Cazza",
      s0,
    );
    expect(scopeOf(s1).segment).toBe("Restaurante / Alimentação");
  });

  it("does not re-ask businessName if already present in scope on non-first turn", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Sushi Cazza, redes sociais mensais", s0);
    expect(scopeOf(s1).businessName).toBe("Sushi Cazza");

    // Simulate a follow-up message — SDR should NOT ask for businessName again
    const s2 = processProspectMessage("Instagram e Facebook", s1);
    const lastReply = lastAssistantText(s2);
    expect(lastReply).not.toContain("nome do seu negócio");
  });
});
