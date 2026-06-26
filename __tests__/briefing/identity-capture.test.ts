// Identity capture robustness — reproduces the exact production failures where:
//   1. A bare first name ("Pedro") caused the bot to repeat the same question.
//   2. Only the business was captured, silently dropping the person's name.
//
// E-mail and WhatsApp are NO LONGER collected in the conversation — they are
// captured via Google sign-in after the prospect confirms their request. These
// tests guard that the SDR (a) still captures name + business, and (b) NEVER
// asks for e-mail/phone or mistakes a business reply for an e-mail input.
// All behaviour here is rule-based (no AI) and must never regress.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";

type State = ReturnType<typeof initProspectConvState>;

function lastAssistantText(state: State): string {
  const msgs = state.conv.messages.filter((m) => m.role === "assistant");
  return msgs[msgs.length - 1]?.text ?? "";
}
const scopeOf = (s: State) => s.conv.scope;

describe("identity capture — bare name and validation", () => {
  it("captures a bare first name on the first message and does NOT repeat the question", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    expect(scopeOf(s1).prospectName).toBe("Pedro");
    // Must move on to ask for the business, not repeat the combined question.
    expect(lastAssistantText(s1)).toMatch(/nome do seu neg[óo]cio/i);
    expect(lastAssistantText(s1)).toContain("Pedro");
  });

  it("does not lose the person's name when only the business is given first", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);              // name
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1); // business
    expect(scopeOf(s2).prospectName).toBe("Pedro");
    expect(scopeOf(s2).businessName).toContain("Sushi Cazza");
  });

  it("moves to discovery after name + business — never asks for e-mail", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    // With name + business known, the next step is discovery (what they need),
    // NOT an e-mail request. E-mail is collected via Google after confirmation.
    expect(lastAssistantText(s2)).not.toMatch(/e-?mail/i);
    expect(lastAssistantText(s2)).not.toMatch(/whatsapp/i);
  });

  it("never stores an e-mail/phone from the conversation and never asks for them", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    // Even if the prospect volunteers an e-mail, the SDR ignores it — Google owns it.
    const s3 = processProspectMessage("pedro@sushicazza.com.br", s2);
    expect(scopeOf(s3).prospectEmail).toBeUndefined();
    expect(scopeOf(s3).prospectPhone).toBeUndefined();
    // And it must never validate / ask about e-mail format.
    expect(lastAssistantText(s3)).not.toMatch(/n[ãa]o parece v[áa]lido|formato.*@|nome@dom[íi]nio/i);
  });

  it("does not mistake a short non-email reply for an e-mail input", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    const s3 = processProspectMessage("só isso", s2); // the reply that used to break it
    expect(scopeOf(s3).prospectEmail).toBeUndefined();
    expect(lastAssistantText(s3)).not.toMatch(/e-?mail/i);
  });
});
