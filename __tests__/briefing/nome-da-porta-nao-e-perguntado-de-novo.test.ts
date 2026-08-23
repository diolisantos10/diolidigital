// O nome dado na PORTA não pode ser perguntado outra vez na conversa.
//
// ─── O CASO REAL ───────────────────────────────────────────────────────────
// 23/08/2026, piloto ao vivo. O CEO reiniciou o teste em `/briefing`,
// preencheu o formulário de entrada (`LeadNaPorta`) com nome, e-mail e
// WhatsApp — e a PRIMEIRA fala da consultora foi *"Para começar, qual é o seu
// nome e o nome do seu negócio?"*. O painel da direita ("O QUE VOCÊ ESTÁ
// PEDINDO") marcava **"Nome: aguardando…"**, que é a prova da causa: o contato
// capturado na porta não chegava ao escopo da conversa.
//
// Palavras dele: *"Primeiro erro, já pediu o meu nome novamente, se eu dei meu
// nome na página de entrada."*
//
// ─── POR QUE ESTE TESTE EXISTE ─────────────────────────────────────────────
// A regra "não perguntar o que já foi respondido" já estava escrita no prompt
// do SDR. Ela não falhou por má redação — ela nunca foi alimentada: o dado
// existia (`contatoDaPorta`, em `app/briefing/page.tsx`) e era lido só no envio
// final do briefing. Prompt é aviso, escopo é trava; por isso o conserto está
// na semente do estado, e por isso o teste mira a semente.
//
// A SEGUNDA metade é tão importante quanto a primeira: quem clica em "Prefiro
// não deixar contato agora" entra SEM nome, de propósito — e para essa pessoa a
// pergunta do nome continua sendo a coisa certa a fazer. Consertar um caminho
// quebrando o outro seria trocar de defeito, não fechar um.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { contatoUsavelDaPorta } from "@/components/agency/briefing/PublicBriefingRoom";

const pediuONome = (texto: string) => /qual é o seu nome/i.test(texto);

describe("contato da porta chega à conversa", () => {
  it("com nome na porta: o escopo já nasce com o nome (o painel para de dizer 'aguardando…')", () => {
    const s = initProspectConvState({
      nome: "Dioli Santos",
      email: "diolisantos10@gmail.com",
      whatsapp: "11989400692",
    });
    expect(s.conv.scope.prospectName).toBe("Dioli Santos");
    expect(s.conv.scope.prospectPhone).toBe("11989400692");
    // ⛔ O e-mail NÃO entra no escopo — e é de propósito: o escopo inteiro vai
    // dentro do prompt do modelo (`app/api/sdr/chat/route.ts`, "dados já
    // captados"), e a casa não faz e-mail trafegar pelo caminho do chat. Ele
    // não se perde: o envio final usa o contato da porta.
    expect(s.conv.scope.prospectEmail).toBeUndefined();
  });

  it("com nome na porta: a saudação NÃO pede o nome e cumprimenta pelo primeiro nome", () => {
    const s = initProspectConvState({ nome: "Dioli Santos", email: "d@x.com", whatsapp: "" });
    const saudacao = s.conv.messages[0].text;
    expect(pediuONome(saudacao)).toBe(false);
    expect(saudacao).toContain("Dioli");
    // O que FALTA continua sendo perguntado — a conversa avança, não pula.
    expect(saudacao).toMatch(/nome do seu negócio/i);
  });

  it("sem porta (ou porta pulada): o nome continua sendo perguntado — este caminho existe de propósito", () => {
    for (const entrada of [undefined, null] as const) {
      const s = initProspectConvState(entrada);
      expect(s.conv.scope.prospectName).toBeUndefined();
      expect(pediuONome(s.conv.messages[0].text)).toBe(true);
    }
  });

  it("nome em branco na porta não vale como nome — ausência de informação não é informação", () => {
    const s = initProspectConvState({ nome: "   ", email: "", whatsapp: "" });
    expect(s.conv.scope.prospectName).toBeUndefined();
    expect(pediuONome(s.conv.messages[0].text)).toBe(true);
  });
});

// ─── A SEGUNDA METADE DO MESMO VAZAMENTO ───────────────────────────────────
// Semear o escopo consertava a SAUDAÇÃO e o painel — e o nome morria no turno
// seguinte: o caminho da primeira resposta reconstruía o escopo a partir do
// zero (`mergeScopeDelta(emptyScope(), …)`), o painel voltava a "aguardando…"
// e a consultora perguntava o nome de novo, um turno depois. Para quem está do
// outro lado da tela, isso é o mesmo defeito com um turno de atraso.
describe("o nome da porta sobrevive ao primeiro turno da conversa", () => {
  it("responder o negócio não apaga o nome vindo da porta", () => {
    const inicial = initProspectConvState({ nome: "Dioli Santos", whatsapp: "11989400692" });
    const depois = processProspectMessage("Padaria Aurora", inicial);
    expect(depois.conv.scope.prospectName).toBe("Dioli Santos");
    expect(depois.conv.scope.businessName).toBe("Padaria Aurora");
    expect(depois.conv.messages.at(-1)!.text).not.toMatch(/qual é o seu nome/i);
  });

  it("negócio de nome comprido continua sendo negócio — não vira 'a pessoa'", () => {
    // A regra "3+ palavras sem sinal de negócio = nome de pessoa" existe porque
    // a saudação PADRÃO pede o nome primeiro. Com o nome já dado na porta, a
    // saudação pede o NEGÓCIO — e aplicar a regra aqui apagaria os dois campos.
    const comPorta = processProspectMessage(
      "Padaria Aurora Central",
      initProspectConvState({ nome: "Dioli Santos", whatsapp: "11989400692" }),
    );
    expect(comPorta.conv.scope.prospectName).toBe("Dioli Santos");
    expect(comPorta.conv.scope.businessName).toBe("Padaria Aurora Central");

    // E o caminho de quem pulou a porta segue EXATAMENTE como era: sem nome
    // conhecido, a mesma frase é lida como o nome da pessoa. A regra antiga não
    // foi trocada — foi condicionada ao que a saudação de fato perguntou.
    const semPorta = processProspectMessage("Padaria Aurora Central", initProspectConvState(null));
    expect(semPorta.conv.scope.prospectName).toBe("Padaria Aurora Central");
  });
});

// ─── E O MESMO DEFEITO ESPERAVA NA LINHA DE CHEGADA ────────────────────────
// O passo final da sala pedia *"Falta só uma coisa: para onde mandamos sua
// proposta"* para TODO MUNDO — inclusive para quem tinha digitado nome, e-mail
// e WhatsApp na porta minutos antes. É o mesmo "ninguém prestou atenção" da
// primeira fala, no pior lugar possível: na hora de fechar, depois de a pessoa
// ter contado o negócio inteiro. Quem pulou a porta continua sendo perguntado
// ali, porque para essa pessoa aquela é a única chance de a proposta ter para
// onde ir — pular seria trocar uma grosseria por um prejuízo.
describe("o fecho não repergunta o contato que já foi dado na porta", () => {
  it("nome + um canal: fecha direto com o que a pessoa declarou", () => {
    expect(contatoUsavelDaPorta({ nome: "Dioli Santos", email: "d@x.com", whatsapp: "" }))
      .toEqual({ nome: "Dioli Santos", email: "d@x.com", whatsapp: "" });
    expect(contatoUsavelDaPorta({ nome: "Dioli Santos", email: "", whatsapp: "11989400692" }))
      .toEqual({ nome: "Dioli Santos", email: "", whatsapp: "11989400692" });
  });

  it("porta pulada, ou sem canal, ou sem nome: o passo de contato continua valendo", () => {
    expect(contatoUsavelDaPorta(null)).toBeNull();
    expect(contatoUsavelDaPorta(undefined)).toBeNull();
    // Sem canal não há para onde mandar a proposta — perguntar é o certo.
    expect(contatoUsavelDaPorta({ nome: "Dioli Santos", email: "  ", whatsapp: "" })).toBeNull();
    expect(contatoUsavelDaPorta({ nome: "   ", email: "d@x.com", whatsapp: "" })).toBeNull();
  });
});
