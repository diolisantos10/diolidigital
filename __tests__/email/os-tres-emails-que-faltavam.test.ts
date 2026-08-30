// OS TRÊS E-MAILS QUE FALTAVAM — medidos pela porta, não pela boa intenção.
//
// A casa tinha DOIS e-mails (confirmação de briefing e orçamento). Faltavam os
// três momentos em que o cliente mais precisa de notícia:
//
//   1. a PEÇA ficou pronta e ninguém batia na porta dele;
//   2. o ATRASO era contado para a casa, não para o cliente
//      ("coluna gravada não é cliente informado", escrito em `batida-da-v2.ts`
//      logo acima do código que gravava a coluna e parava ali);
//   3. o LINK DO PORTAL nunca chegava — por isso uma travessia inteira precisou
//      cunhar link à mão.
//
// ── COMO ELES SÃO PROVADOS ─────────────────────────────────────────────────
// Não por "parece certo": cada um passa por `motivoParaNaoEnviar`, que é a
// TRAVA REAL da porta de e-mail. Ela recusa o que não veio do molde, o que
// estampa valor e o que usa o nome aposentado. Se o teste medisse só o texto,
// provaria a minha opinião; medindo a trava, prova a regra da casa.
//
// ⚠️ NENHUM E-MAIL É ENVIADO AQUI. O único endereço real autorizado é o do CEO,
// e ele já recebeu um hoje. Prova-se pelo HTML montado e pelo gatilho.

import { describe, it, expect } from "vitest";
import { pecaProntaEmail, avisoDeAtrasoEmail, linkDoPortalEmail } from "@/lib/email/templates";
import { motivoParaNaoEnviar, textoVisivelDoEmail } from "@/lib/email/trava-do-molde";
import { NOME_DA_EMPRESA, NOME_APOSENTADO, LOGO_BRANCO_URL } from "@/lib/marca";

const LINK = "https://www.diolidigital.com.br/portal/access/tok_abc123";
const ALVO = { prospectName: "Marcos", businessName: "Foocci", portalLink: LINK };

/** Os três, montados — é esta lista que as travas de classe varrem. */
const TODOS = () => [
  { nome: "peça pronta", email: pecaProntaEmail({ ...ALVO, quantasPecas: 12 }) },
  { nome: "aviso de atraso", email: avisoDeAtrasoEmail({ ...ALVO, oQueAtrasou: "o pacote de dezembro" }) },
  { nome: "link do portal", email: linkDoPortalEmail(ALVO)! },
];

describe("a PORTA aceita os três — é ela que decide, não eu", () => {
  for (const { nome, email } of TODOS()) {
    it(`"${nome}" passa por motivoParaNaoEnviar`, () => {
      expect(motivoParaNaoEnviar(email.html, email.subject)).toBeNull();
    });
  }
});

describe("todos saem pelo MOLDE — nenhum escreve o próprio HTML", () => {
  for (const { nome, email } of TODOS()) {
    it(`"${nome}": cabeçalho com logo, rodapé assinado, e nada do nome velho`, () => {
      expect(email.html).toContain(LOGO_BRANCO_URL);
      expect(email.html).toContain(NOME_DA_EMPRESA);
      expect(email.html).not.toContain(NOME_APOSENTADO);
      // Se um template escrevesse o próprio documento, nasceria fora do molde.
      expect(email.html.match(/<!DOCTYPE html>/gi)?.length).toBe(1);
    });

    it(`"${nome}": tem prévia de caixa de entrada ESCRITA`, () => {
      // Sem preheader, o cliente de e-mail entrega o `alt` do logo como prévia.
      const preheader = email.html.match(/mso-hide:all">([\s\S]*?)<\/div>/)?.[1] ?? "";
      const semEmpurrador = preheader.replace(/(&#847;|&zwnj;|&nbsp;)/g, "").trim();
      expect(semEmpurrador.length).toBeGreaterThan(10);
      expect(semEmpurrador).not.toContain(NOME_DA_EMPRESA);
    });

    it(`"${nome}": legível com TODA imagem bloqueada`, () => {
      // Gmail e Outlook abrem assim. O texto visível tem de dizer a mensagem
      // inteira sozinho — imagem é enfeite, nunca portadora do recado.
      const semImagens = email.html.replace(/<img[^>]*>/gi, "");
      const visivel = textoVisivelDoEmail(semImagens);
      expect(visivel.length).toBeGreaterThan(120);
      expect(visivel).toContain(NOME_DA_EMPRESA);
    });

    it(`"${nome}": o botão é <a>, nunca <button>`, () => {
      // `<button>` não é clicável em cliente de e-mail nenhum.
      expect(email.html).not.toMatch(/<button/i);
      expect(email.html).toMatch(/<a[^>]+href="https:\/\/www\.diolidigital\.com\.br/);
    });
  }
});

describe("NENHUM deles estampa valor — o e-mail é convite, não proposta", () => {
  for (const { nome, email } of TODOS()) {
    it(`"${nome}": sem preço no corpo nem no assunto`, () => {
      const visivel = textoVisivelDoEmail(email.html);
      expect(visivel).not.toMatch(/R\$/);
      expect(visivel).not.toMatch(/\breais\b/i);
      expect(email.subject).not.toMatch(/R\$|\breais\b/i);
    });
  }

  it("a trava PEGA um preço enfiado no corpo — a régua não é decorativa", () => {
    const comPreco = pecaProntaEmail({ ...ALVO, avisoDePublicacaoManual: "Fica por R$ 790 no mês." });
    expect(motivoParaNaoEnviar(comPreco.html, comPreco.subject)).toMatch(/valor_no_corpo/);
  });
});

describe("nada de direção interna no que vai ao ar", () => {
  const JARGAO = [
    "quality_flag", "quality_ok", "quality_nao_auditado", "presentedAt", "clientRequestId",
    "workspaceId", "allowlist", "shadow", "App Review", "acesso avançado", "deliverable",
    "mesmoComRessalva", "prisma", "escada de exposição",
  ];
  for (const { nome, email } of TODOS()) {
    it(`"${nome}": sem jargão da casa`, () => {
      const visivel = textoVisivelDoEmail(email.html).toLowerCase();
      for (const j of JARGAO) expect(visivel, `vazou "${j}"`).not.toContain(j.toLowerCase());
    });
  }
});

describe("peça pronta — o mais importante dos três", () => {
  it("chama o cliente para as QUATRO decisões que ele tem", () => {
    const v = textoVisivelDoEmail(pecaProntaEmail({ ...ALVO, quantasPecas: 12 }).html).toLowerCase();
    for (const acao of ["aprovar", "ajuste", "recusar", "cancelar"]) {
      expect(v, `não oferece "${acao}"`).toContain(acao);
    }
  });

  it("o aviso da publicação manual entra QUANDO existe, e não promete data", () => {
    const com = pecaProntaEmail({
      ...ALVO,
      avisoDePublicacaoManual: "A publicação ainda é feita à mão pela nossa equipe.",
    });
    const v = textoVisivelDoEmail(com.html);
    expect(v).toContain("à mão");
    expect(v).not.toMatch(/\bem \d+ dias\b|\baté \d{1,2}\/\d{1,2}\b|\bpróxima semana\b/i);
  });

  it("sem o aviso, ele simplesmente NÃO aparece — nada de texto fóssil", () => {
    const sem = pecaProntaEmail({ ...ALVO, quantasPecas: 12, avisoDePublicacaoManual: null });
    expect(textoVisivelDoEmail(sem.html)).not.toContain("à mão");
  });

  it("sem link não nasce botão — botão que não leva a lugar nenhum é pior que ausência", () => {
    const sem = pecaProntaEmail({ prospectName: "Marcos", quantasPecas: 3 });
    expect(sem.html).not.toContain("Ver o meu material");
  });

  it("o plural acompanha a quantidade real", () => {
    expect(textoVisivelDoEmail(pecaProntaEmail({ ...ALVO, quantasPecas: 1 }).html)).toContain("A sua peça");
    expect(textoVisivelDoEmail(pecaProntaEmail({ ...ALVO, quantasPecas: 12 }).html)).toContain("As suas 12 peças");
  });
});

describe("aviso de atraso — reconhece sem prometer data nova", () => {
  const email = avisoDeAtrasoEmail({ ...ALVO, oQueAtrasou: "o pacote de dezembro" });

  it("diz o que atrasou, com as palavras do cliente", () => {
    expect(textoVisivelDoEmail(email.html)).toContain("o pacote de dezembro");
  });

  it("NÃO promete data nova — a segunda promessa quebrada esperando para acontecer", () => {
    const v = textoVisivelDoEmail(email.html);
    expect(v).not.toMatch(/\bem \d+ dias?\b|\baté \d{1,2}\/\d{1,2}\b|\bamanhã\b|\bpróxima semana\b|\bna segunda\b/i);
  });

  it("não culpa ninguém nem explica a cozinha — o cliente recebe o fato e o próximo passo", () => {
    const v = textoVisivelDoEmail(email.html).toLowerCase();
    for (const desculpa of ["provedor", "servidor", "bug", "fila", "crédito", "saldo", "api"]) {
      expect(v, `vazou "${desculpa}"`).not.toContain(desculpa);
    }
  });
});

describe("link do portal — sem link, o e-mail NÃO existe", () => {
  it("devolve null quando não há link", () => {
    expect(linkDoPortalEmail({ prospectName: "Marcos", businessName: "Foocci" })).toBeNull();
  });

  it("com link, o botão aponta para o portal daquele cliente", () => {
    expect(linkDoPortalEmail(ALVO)!.html).toContain(LINK);
  });
});
