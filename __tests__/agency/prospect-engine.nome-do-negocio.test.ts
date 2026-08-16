// O E-MAIL DO PROSPECT VIRANDO O NOME DO NEGÓCIO — achado em produção em
// 16/08/2026, na mesma leva de incidentes do SDR (ver `sdr-escuta.test.ts`).
//
// ── O QUE ACONTECIA ─────────────────────────────────────────────────────────
//
// A pergunta de identidade do SDR ("qual é o seu nome e o nome do seu
// negócio?") tentava casar a resposta contra padrões de nome/negócio
// (`parseProspectNameBiz`). Quando a resposta não casava NADA — o que
// acontece sempre que a pessoa cola um e-mail, porque a regex de nome exige
// só letras — o código antigo gravava a resposta CRUA inteira como
// `businessName` (ou `prospectName`, se o negócio já era conhecido).
//
// Um e-mail digitado por engano na pergunta errada virava o "nome do
// negócio" gravado no `scope`, e dali descia a esteira inteira: painel de
// quem bateu na porta (`quem-bateu-na-porta.ts`), dossiê do lead
// (`dossie-do-lead.ts`), cadastro do cliente, peça, proposta — "Olá,
// maria@gmail.com" para um prospect pagante.
//
// A LEI que rege esta casa, escrita em `comercial/contato-do-lead.ts`:
// **ausência de informação não é informação.** Um canal de contato (e-mail,
// @arroba, telefone) nunca é identidade — nem nome, nem negócio. Nome/negócio
// desconhecido tem de FICAR desconhecido, nunca ser inferido de outro campo.
//
// ── O QUE ESTE TESTE PROVA, NAS DUAS METADES ────────────────────────────────
//
//  ⛔ metade 1: o problema plantado (e-mail respondendo a pergunta de nome do
//     negócio) é barrado — o `scope.businessName` NUNCA vira o e-mail.
//  ✅ metade 2: o caso limpo (nome de negócio de verdade) continua intacto —
//     a correção não pode fazer negócio de verdade parar de ser reconhecido.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";

describe("Prospect engine — o e-mail do prospect nunca vira nome do negócio", () => {
  it("⛔ e-mail respondendo à pergunta de identidade não vira businessName nem prospectName", () => {
    let state = initProspectConvState();

    // 1ª mensagem: pede social media, mas não diz nome nem negócio — a
    // pergunta de identidade fica pendente e é feita em seguida.
    state = processProspectMessage("Quero um orçamento de social media", state);
    expect(state.conv.scope.businessName).toBeUndefined();

    // 2ª mensagem: a pessoa responde só com um e-mail (ex.: confundiu com o
    // pedido de contato, ou colou por engano).
    state = processProspectMessage("maria@gmail.com", state);

    expect(state.conv.scope.businessName).not.toBe("maria@gmail.com");
    expect(state.conv.scope.businessName).toBeUndefined();
    expect(state.conv.scope.prospectName).not.toBe("maria@gmail.com");
  });

  it("⛔ o mesmo vale quando o negócio já é conhecido e só falta o nome da pessoa", () => {
    let state = initProspectConvState();
    state = processProspectMessage(
      "Quero social media, meu negócio é chamado Sushi Cazza",
      state,
    );
    expect(state.conv.scope.businessName).toBe("Sushi Cazza");

    // Falta só o nome da pessoa — se ela responder um e-mail, ele não pode
    // virar o "nome" dela.
    state = processProspectMessage("contato@sushicazza.com", state);
    expect(state.conv.scope.prospectName).not.toBe("contato@sushicazza.com");
    expect(state.conv.scope.prospectName).toBeUndefined();
  });

  it("✅ nome de negócio de verdade continua sendo reconhecido normalmente", () => {
    let state = initProspectConvState();
    state = processProspectMessage("Quero um orçamento de social media", state);
    state = processProspectMessage(
      "Sou a Maria, meu negócio é a Sushi Cazza",
      state,
    );

    expect(state.conv.scope.businessName).toBe("Sushi Cazza");
    expect(state.conv.scope.prospectName).toBe("Maria");
  });

  it("✅ outro nome de negócio real (Beauty Clinic) também passa intacto", () => {
    let state = initProspectConvState();
    state = processProspectMessage("Preciso de tráfego pago", state);
    state = processProspectMessage(
      "Meu nome é Beatriz, minha clínica é chamada Beauty Clinic",
      state,
    );

    expect(state.conv.scope.businessName).toBe("Beauty Clinic");
    expect(state.conv.scope.prospectName).toBe("Beatriz");
  });
});
