// SDR discovery protocol — guards that the interview is COMPLETE before it
// closes. A quieter client (short answers) must be asked every applicable
// question; the submission gate stays shut until the substantive protocol is
// exhausted. Prevents the old failures: no branding questions at all, no
// audience/objective/competitor discovery, and closing after a handful of
// answers ("posts: indefinido", talkative-client early close).

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { canSubmitProposal } from "@/lib/agency/sdr-agent";

type State = ProspectConvState;
const canSubmit = (s: State) => canSubmitProposal(s.conv, s.sdr);
const transcript = (s: State) =>
  s.conv.messages.filter((m) => m.role === "assistant").map((m) => m.text).join("\n").toLowerCase();

// Drive the conversation with generic short answers until the gate opens or we
// hit the turn cap. Returns the final state + how many turns it took.
function driveToCompletion(s0: State, answers: string[], maxTurns = 30): { state: State; turns: number } {
  let s = s0;
  let i = 0;
  for (; i < maxTurns; i++) {
    if (canSubmit(s)) break;
    const ans = answers[Math.min(i, answers.length - 1)];
    s = processProspectMessage(ans, s);
  }
  return { state: s, turns: i };
}

describe("SDR discovery protocol — complete before closing", () => {
  it("asks the universal discovery (objective, audience, competitors), not just service specs", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Pedro", s);
    s = processProspectMessage("Restaurante Foocci", s);
    s = processProspectMessage("Quero gestão de redes sociais", s);

    // Keep answering short until it stops asking.
    const { state } = driveToCompletion(s, ["Instagram", "3", "mais vendas", "público jovem da região", "sim", "não", "concorrente Sushi Rival", "mensal", "em breve"]);
    const t = transcript(state);

    expect(t).toMatch(/objetivo/);         // main objective was asked
    expect(t).toMatch(/p[úu]blico/);       // target audience was asked
    expect(t).toMatch(/concorrent|refer[êe]ncia/); // competitors/references asked
  });

  it("keeps the submit gate CLOSED until the full protocol is covered", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Ana", s);
    s = processProspectMessage("Loja Bella", s);
    s = processProspectMessage("Redes sociais", s);

    // Right after choosing a service, the interview is far from complete.
    expect(canSubmit(s)).toBe(false);

    // A couple of answers is not enough either.
    s = processProspectMessage("Instagram", s);
    s = processProspectMessage("3 por semana", s);
    expect(canSubmit(s)).toBe(false);

    // Only after the whole protocol is answered does the gate open.
    const { state, turns } = driveToCompletion(s, ["sim", "3", "mais clientes", "mulheres 25-40", "não", "concorrente X"]);
    expect(canSubmit(state)).toBe(true);
    // A quiet client genuinely gets asked many questions (not closed early).
    expect(turns).toBeGreaterThan(2);
  });

  it("has a branding question protocol (previously there were ZERO)", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Carlos", s);
    s = processProspectMessage("Cafeteria Aroma", s);
    s = processProspectMessage("Preciso criar a identidade visual do zero", s);

    const { state } = driveToCompletion(s, ["do zero", "logo e paleta e manual", "mais autoridade", "público adulto", "não"]);
    const t = transcript(state);

    // Branding-specific discovery must appear.
    expect(t).toMatch(/identidade|logo/);
    expect(t).toMatch(/paleta|tipografia|manual|do zero/);
    expect(state.conv.scope.branding.requested).toBe(true);
  });
});

describe("SDR intake fixes — Os 3 and Negócio≠Nome", () => {
  it("'Os 3' after name+business captures all three services", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Beatriz", s);
    s = processProspectMessage("Estúdio Bella", s);
    s = processProspectMessage("Os 3", s);        // wants social + traffic + branding
    const sc = s.conv.scope;
    expect(sc.wantsSocialMedia).toBe(true);
    expect(sc.wantsPaidTraffic).toBe(true);
    expect(sc.branding.requested).toBe(true);
  });

  it("a bare multi-word person name never becomes the business name", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Beatriz Souza Gimenes", s);   // person's full name
    expect(s.conv.scope.prospectName).toBe("Beatriz Souza Gimenes");
    expect(s.conv.scope.businessName).not.toBe("Beatriz Souza Gimenes");
  });
});
