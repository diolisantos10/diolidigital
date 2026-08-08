// Identity capture robustness — reproduces the exact production failures where:
//   1. A bare first name ("Pedro") caused the bot to repeat the same question.
//   2. Only the business was captured, silently dropping the person's name.
//
// ⚠️ O MUNDO ANDOU — leia antes de usar este arquivo como argumento (08/08/2026).
//
// O cabeçalho original dizia que e-mail e WhatsApp seriam capturados "via Google
// sign-in depois que o prospect confirmar o pedido". Isso foi lido como "a casa
// não precisa perguntar contato", e o resultado está medido em produção: três
// interessados — Sushi Cazza (51 dias), Camila Pereira (29) e Beatriz Gimenes
// (28) — com a conversa inteira gravada e NENHUM canal de contato. Quem não
// chega ao login não deixa nada, e a maioria não chega.
//
// O que MUDOU: o contato passou a ser CONDIÇÃO PARA FECHAR o briefing, pedido no
// fim (nome + WhatsApp **ou** e-mail), com saída explícita para quem não quiser
// dar — que grava a conversa como `lead_incompleto`. Ver
// `lib/agency/comercial/contato-do-lead.ts` e
// `__tests__/comercial/gate-de-contato-do-briefing.test.ts`.
//
// O que NÃO mudou, e é o que este arquivo trava: **a conversa do SDR** continua
// sem pedir e sem validar e-mail/telefone. O motivo é o incidente original —
// pedir e-mail no meio da descoberta fazia o bot repetir pergunta, tratar "só
// isso" como e-mail inválido e travar o prospect antes de saber o que ele
// queria. O pedido de contato mora no PASSO DE CONFIRMAÇÃO, não no chat.
// Todo comportamento aqui é rule-based (sem IA) e não pode regredir.

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
