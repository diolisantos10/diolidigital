// Identity capture robustness — reproduces the exact production failure where:
//   1. A bare first name ("Pedro") caused the bot to repeat the same question.
//   2. Only the business was captured, silently dropping the person's name.
//   3. A non-email answer ("Meu nome é Pedro") was stored in the e-mail field.
// All three are rule-based (no AI) and must never regress.

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
    // With name + business known, it should now ask for the e-mail.
    expect(lastAssistantText(s2)).toMatch(/e-?mail/i);
  });

  it("rejects a non-email answer in the e-mail step instead of storing it", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    const s3 = processProspectMessage("Meu nome é Pedro", s2); // not an e-mail
    expect(scopeOf(s3).prospectEmail).toBeUndefined();
    expect(lastAssistantText(s3)).toMatch(/n[ãa]o parece v[áa]lido|formato/i);
  });

  it("accepts a valid e-mail and advances to the phone step", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    const s3 = processProspectMessage("pedro@sushicazza.com.br", s2);
    expect(scopeOf(s3).prospectEmail).toBe("pedro@sushicazza.com.br");
    expect(lastAssistantText(s3)).toMatch(/whatsapp/i);
  });

  it("rejects an invalid phone and accepts a valid one", () => {
    const s0 = initProspectConvState();
    const s1 = processProspectMessage("Pedro", s0);
    const s2 = processProspectMessage("Restaurante Sushi Cazza", s1);
    const s3 = processProspectMessage("pedro@sushicazza.com.br", s2);
    const s4 = processProspectMessage("não sei", s3);          // invalid phone
    expect(scopeOf(s4).prospectPhone).toBeUndefined();
    const s5 = processProspectMessage("(11) 91234-5678", s4);  // valid
    expect(scopeOf(s5).prospectPhone).toMatch(/91234/);
  });
});
