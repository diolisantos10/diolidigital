// AS DUAS SURDEZES DO SDR — a mesma família, medida no cliente oculto (6ª rodada).
//
//   (a) a MESMA pergunta de faixa de investimento saiu TRÊS vezes;
//   (b) o cliente escreveu o e-mail dele na conversa e a casa não fez nada.
//
// ── (a) POR QUE A VERBA VOLTAVA ─────────────────────────────────────────────
// `detectNegotiation` roda ANTES da pergunta da vez. "Tá caro, meu teto é
// R$ 2.000" casa como objeção — e quando casa, `currentQ.parse` NUNCA roda:
// `budgetRange` fica vazio, `when` continua verdadeiro, e a pergunta volta.
// Enquanto isso `parseBudgetAmount` já tinha lido R$ 2.000 do mesmo texto. A
// casa tinha o dado e perguntava assim mesmo.
//
// ── (b) POR QUE O E-MAIL SUMIA ──────────────────────────────────────────────
// O SDR é PROIBIDO de PEDIR e-mail (regra do CEO) e continua sendo. Mas
// proibição de pedir não é licença para ignorar o que foi oferecido: quem
// pulou a porta e escreveu o e-mail na conversa entregava o briefing sem canal
// nenhum. O endereço NÃO entra no `scope` (ele viaja para dentro do prompt do
// modelo) — mora em `sdr.contatoOferecido`.
//
// ── A MUTAÇÃO QUE ESTE ARQUIVO PEGA ────────────────────────────────────────
// Apague o bloco que fecha `budget_range` a partir de `parsedBudget` e o
// primeiro grupo quebra. Apague `contatoOferecido` (ou mande o e-mail para o
// `scope`, que é o erro tentador) e o segundo quebra nos dois sentidos.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { emailNoTexto } from "@/lib/agency/comercial/contato-do-lead";
import { lacunaDeRespostaSemEncaixe } from "@/lib/agency/comercial/pergunta-sem-encaixe";

const abrir = () => initProspectConvState({ nome: "Marina", email: "", whatsapp: "" });

describe("a verba lida não é perguntada de novo", () => {
  it("a frase que é objeção E resposta fecha `budget_range` — o número não se perde na negociação", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    // A frase exata da classe: objeção com o teto dentro.
    e = processProspectMessage("Tá caro. Meu teto é R$ 2.000 por mês.", e);

    expect(
      e.conv.scope.budgetRange,
      "`parseBudgetAmount` leu o número no mesmo texto — a pergunta não pode continuar de pé",
    ).toBeTruthy();
    expect(e.conv.answeredQIds).toContain("budget_range");
    expect(e.sdr.budgetSignal.amount).toBe(2000);
  });

  it("a faixa de investimento não é perguntada TRÊS vezes na mesma conversa", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    for (const fala of [
      "Tá caro pra mim, o teto é R$ 2.000 por mês.",
      "Continua caro.",
      "Ainda acho caro.",
      "Quero começar menor.",
    ]) e = processProspectMessage(fala, e);

    const vezes = e.conv.perguntasFeitas?.budget_range ?? 0;
    expect(
      vezes,
      `a pergunta da verba saiu ${vezes} vezes; duas é o limite da casa (LIMITE_DE_INSISTENCIA)`,
    ).toBeLessThanOrEqual(2);
  });

  it("quem NUNCA disse número continua sendo perguntado — nada foi afrouxado", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    e = processProspectMessage("Ainda não pensei em valor.", e);
    expect(e.conv.scope.budgetRange).toBeFalsy();
  });
});

describe("o e-mail oferecido na conversa não cai no chão", () => {
  it("o leitor acha o endereço NO MEIO da frase — não só a frase inteira sendo um e-mail", () => {
    expect(emailNoTexto("pode mandar pro contato@cantina.invalid que eu vejo")).toBe("contato@cantina.invalid");
    expect(emailNoTexto("meu e-mail é marina@cantina.invalid.")).toBe("marina@cantina.invalid");
    expect(emailNoTexto("R$ 2.000 por mês, 3 posts por semana")).toBeNull();
  });

  it("o motor GUARDA o e-mail e AVISA que guardou — as duas coisas, ou nenhuma", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    e = processProspectMessage("Pode mandar tudo pro marina@cantina.invalid, tá?", e);

    expect(
      e.sdr.contatoOferecido?.email,
      "ele deu o contato de graça; guardar é o mínimo",
    ).toBe("marina@cantina.invalid");
    expect(
      e.conv.messages[e.conv.messages.length - 1]!.text,
      "guardar calado seria PII escondida — a casa tem de dizer que anotou",
    ).toMatch(/anotei o seu e-mail/i);
  });

  it("⛔ o endereço NUNCA entra no `scope` — o escopo inteiro vai para dentro do prompt do modelo", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    e = processProspectMessage("Pode mandar tudo pro marina@cantina.invalid, tá?", e);

    expect(e.conv.scope.prospectEmail).toBeUndefined();
    const escopoSerializado = JSON.stringify(e.conv.scope);
    expect(
      escopoSerializado,
      "e-mail dentro do scope é e-mail dentro do prompt — a doutrina da casa proíbe",
    ).not.toContain("marina@cantina.invalid");
  });

  it("a frase de aviso não repete o endereço — PII reescrita a cada turno vira histórico", () => {
    let e = abrir();
    e = processProspectMessage("Somos a Cantina da Prova, um restaurante em Pinheiros.", e);
    e = processProspectMessage("Pode mandar tudo pro marina@cantina.invalid, tá?", e);
    const aviso = e.conv.messages[e.conv.messages.length - 1]!.text;
    expect(aviso.split("\n")[0]).not.toContain("@cantina.invalid");
  });
});

describe("⛔ a lacuna era um cano de PII — achado pela própria régua acima", () => {
  it("a fala guardada como lacuna vai SEM o e-mail — a lacuna mora dentro do scope", () => {
    // `acrescentarRespostaSemEncaixe` guarda a fala CRUA do cliente, e a lacuna
    // mora em `BriefingScope.lacunasDeEscopo` — que é serializado para dentro
    // do prompt do modelo. A casa apagava `prospectEmail` de tudo o que voltava
    // do modelo e mandava o mesmo endereço para lá pela porta dos fundos,
    // escrito por ela mesma.
    //
    // O conserto não é parar de registrar (descartar a fala é o defeito que
    // aquele módulo existe para matar): é registrar sem o endereço.
    const l = lacunaDeRespostaSemEncaixe(
      "detect_service",
      "não sei, me manda no marina@cantina.invalid que eu penso",
      "qual serviço ele quer",
    );
    expect(l.oQueOClienteDisse).not.toContain("marina@cantina.invalid");
    expect(l.oQueOClienteDisse, "a FRASE fica — quem lê a lacuna precisa dela").toContain("me manda no");
    expect(l.oQueOClienteDisse).toContain("[e-mail do cliente]");
    expect(l.precisaConfirmar).not.toContain("marina@cantina.invalid");
  });

  it("fala sem e-mail continua entrando palavra por palavra", () => {
    const l = lacunaDeRespostaSemEncaixe("detect_service", "quero um clube de assinatura", "qual serviço");
    expect(l.oQueOClienteDisse).toBe("quero um clube de assinatura");
  });
});
