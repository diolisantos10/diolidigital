// O E-MAIL COM A CARA DA CASA — 27/08/2026.
//
// O primeiro e-mail real da casa chegou à caixa do CEO assinado "DIOLI STUDIO",
// texto puro, sem logo, e terminando com o WhatsApp escrito como número solto
// no meio de um parágrafo. As ordens dele, e as travas que cada uma virou:
//
//   1. "a nossa empresa é Dioli Digital"        → o nome velho não sai daqui;
//   2. "tem que ser um link com um botão"       → botão de verdade, e `wa.me`;
//   3. "precisa de logo (…) cara de empresa"    → logo por URL absoluta pública;
//   4. e o e-mail tem de continuar legível com TODA imagem bloqueada.
//
// ⚠️ ESTES TESTES MEDEM A SAÍDA, não o repositório. A lição é de 26/08: um
// teste que varre arquivos mede a árvore em que roda e reprova por um comentário
// que ninguém lê. Aqui o que se mede é o HTML que chega ao cliente.

import { describe, it, expect } from "vitest";
import { briefingConfirmationEmail, orcamentoProntoEmail } from "@/lib/email/templates";
import {
  NOME_DA_EMPRESA, NOME_APOSENTADO, WHATSAPP_DIGITOS, WHATSAPP_LEGIVEL, LOGO_BRANCO_URL,
} from "@/lib/marca";

/** As duas mensagens que a casa manda hoje. Toda regra abaixo vale para AS DUAS
 *  — é o que impede o conserto de sobreviver só na que alguém abriu. */
const MENSAGENS = [
  ["confirmação de briefing", briefingConfirmationEmail({
    prospectName: "NOME TESTE", businessName: "Padaria do Teste",
    services: ["Gestão de redes sociais"],
  })],
  ["orçamento pronto", orcamentoProntoEmail({
    prospectName: "NOME TESTE", businessName: "Padaria do Teste",
    portalLink: "https://www.diolidigital.com.br/portal/access/abc",
    verbaEstourada: true,
  })],
] as const;

describe.each(MENSAGENS)("%s", (_nome, { subject, html }) => {
  it("assina com o nome certo da empresa, e nunca com o aposentado", () => {
    expect(html).toContain(NOME_DA_EMPRESA);
    expect(html).not.toContain(NOME_APOSENTADO);
    expect(subject).not.toContain(NOME_APOSENTADO);
  });

  it("o WhatsApp é um LINK clicável, não um número solto", () => {
    expect(html).toContain(`https://wa.me/${WHATSAPP_DIGITOS}`);
  });

  it("o botão é técnica de e-mail: <a> com fundo e padding, nunca <button>", () => {
    // `<button>` não é clicável em cliente de e-mail nenhum. Se alguém
    // "modernizar" o molde, este teste é quem avisa.
    expect(html).not.toContain("<button");
    expect(html).not.toContain("onclick");
    const botao = html.match(/<a href="https:\/\/wa\.me\/[^"]+"[^>]*style="([^"]*)"/);
    expect(botao, "o link do WhatsApp precisa existir com estilo inline").not.toBeNull();
    expect(botao![1]).toContain("display:inline-block");
    expect(botao![1]).toContain("padding:");
  });

  it("o número continua legível em texto — quem bloqueia estilo não perde o contato", () => {
    expect(html).toContain(WHATSAPP_LEGIVEL);
  });

  it("o logo vem por URL ABSOLUTA e pública — caminho relativo não existe em e-mail", () => {
    expect(html).toContain(LOGO_BRANCO_URL);
    expect(LOGO_BRANCO_URL.startsWith("https://")).toBe(true);
    // Nada de logo atrás de sessão: apareceria quebrado para 100% dos leitores.
    expect(LOGO_BRANCO_URL).not.toContain("/api/media/");
  });

  it("com TODA imagem bloqueada, o e-mail ainda diz de quem é", () => {
    // O `alt` é o plano A, não decoração: Gmail e Outlook bloqueiam imagem por
    // padrão em remetente novo.
    expect(html).toMatch(new RegExp(`alt="${NOME_DA_EMPRESA}"`));
    // E o nome aparece TAMBÉM fora de qualquer atributo de imagem.
    const semImagens = html.replace(/<img[^>]*>/g, "");
    expect(semImagens).toContain(NOME_DA_EMPRESA);
  });

  it("layout em tabela e largura de e-mail — não flex, não grid", () => {
    expect(html).toContain("<table");
    expect(html).toContain("max-width:600px");
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
  });

  it("todo estilo é inline — folha no <head> é removida por vários clientes", () => {
    expect(html).not.toContain("<style");
  });

  it("nenhuma direção interna vai ao ar", () => {
    // A mesma lei da legenda. O cliente lê o que é dele, nunca a conversa da casa.
    for (const proibido of [
      "Post destacando", "Peça que comunica", "Briefing:", "Orientação da equipe",
    ]) {
      expect(html).not.toContain(proibido);
    }
  });

  it("não estampa preço — o valor mora no portal, junto de quem responde por ele", () => {
    // Ordem do CEO em 27/08/2026. Vale para TODOS os e-mails da casa, não só
    // para o do orçamento: por isso esta trava roda sobre as duas mensagens.
    expect(html).not.toMatch(/R\$/);
    expect(subject).not.toMatch(/R\$/);
    // Só o texto VISÍVEL: dentro dos atributos moram o telefone do WhatsApp e
    // o nome do arquivo do logo (…-512.png), que são números legítimos.
    const visivel = html.replace(/<[^>]*>/g, " ");
    expect(visivel).not.toMatch(/\b\d{1,3}\.\d{3}\b/);  // 1.800, 3.400…
    expect(visivel).not.toMatch(/\b(290|490|790)\b/);    // a tabela fechada
    expect(visivel).not.toMatch(/por mês|mensal/i);
  });

  it("não promete prazo — ordem do CEO de 16/08/2026", () => {
    expect(html).not.toMatch(/em (1|um) dia|até amanhã|em 24 ?h/i);
  });
});

describe("o molde é um só", () => {
  it("as duas mensagens compartilham cabeçalho, botão e rodapé", () => {
    const [, a] = MENSAGENS[0];
    const [, b] = MENSAGENS[1];
    for (const comum of [LOGO_BRANCO_URL, `https://wa.me/${WHATSAPP_DIGITOS}`, NOME_DA_EMPRESA]) {
      expect(a.html).toContain(comum);
      expect(b.html).toContain(comum);
    }
  });

  it("o link do WhatsApp é DERIVADO dos dígitos — texto e href não divergem", () => {
    // O clássico: consertaram o texto e esqueceram o href. Os dois nascem da
    // mesma constante, então não há como um andar sem o outro.
    expect(`https://wa.me/${WHATSAPP_DIGITOS}`).toBe("https://wa.me/5511989400692");
    expect(WHATSAPP_LEGIVEL.replace(/\D/g, "")).toBe(WHATSAPP_DIGITOS.slice(2));
  });
});

describe("o nome da empresa tem uma fonte só", () => {
  it("o e-mail nunca escreve o nome à mão", async () => {
    // A trava contra a reintrodução: os templates não podem conter o nome como
    // literal — ele tem de vir de `lib/marca.ts`. Escopo deliberadamente
    // ESTREITO (o módulo de e-mail), porque teste que varre o repositório
    // inteiro mede a árvore em que roda, não a régua.
    const { readFileSync } = await import("node:fs");
    for (const arquivo of ["lib/email/templates.ts", "lib/email/molde.ts"]) {
      const fonte = readFileSync(arquivo, "utf8");
      const semComentarios = fonte
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(semComentarios, `${arquivo} escreveu o nome à mão`).not.toContain(NOME_DA_EMPRESA);
      expect(semComentarios, `${arquivo} tem o nome aposentado`).not.toContain(NOME_APOSENTADO);
    }
  });
});
