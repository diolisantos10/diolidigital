// O formulário de lead na porta do briefing.
//
// Ordem do CEO em 16/08, depois de esperar a noite inteira por um orçamento que
// nunca chegou: *"quando entra na página de briefing, implementa um formulário
// de lead simples — nome, e-mail e telefone, pronto."*
//
// A causa que ele estava cansado de perseguir: a casa não sabia como falar com
// ele. O SDR havia parado de pedir e-mail, e a porta de entrada classifica quem
// chega sem contato como `lead_incompleto` — estado em que o pedido some da
// vista de todo mundo.
//
// Este teste guarda as duas metades da decisão: o formulário aparece ANTES da
// conversa, e ainda assim é possível entrar sem deixar contato. As duas
// importam — a segunda é a que impede perder o briefing inteiro por causa de um
// telefone.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const PAGINA = ler("app/briefing/page.tsx");
const PORTA  = ler("components/agency/briefing/LeadNaPorta.tsx");

describe("a porta vem antes da conversa", () => {
  it("a página mostra o formulário antes da sala de briefing", () => {
    // O `if (!entrou)` tem de vir ANTES do return que monta a PublicBriefingRoom;
    // invertido, o visitante cairia direto na conversa e a porta viraria enfeite.
    const guarda = PAGINA.indexOf("if (!entrou)");
    const sala   = PAGINA.indexOf("<PublicBriefingRoom");
    expect(guarda).toBeGreaterThan(-1);
    expect(sala).toBeGreaterThan(guarda);
  });

  it("pede as três coisas que o CEO mandou pedir", () => {
    expect(PORTA).toMatch(/Seu nome/);
    expect(PORTA).toMatch(/E-mail/);
    expect(PORTA).toMatch(/WhatsApp/);
  });
});

describe("um canal basta, e nome é obrigatório", () => {
  it("exige nome E pelo menos um canal", () => {
    // Exigir os dois canais encheria o formulário sem aumentar a capacidade de
    // responder: um canal já resolve.
    expect(PORTA).toMatch(/nome\.trim\(\)\.length\s*>=\s*2\s*&&\s*temCanal/);
    expect(PORTA).toMatch(/EMAIL_OK\.test\(.*\)\s*\|\|\s*whatsappOk/);
  });

  it("valida formato de e-mail e de WhatsApp — campo preenchido com lixo não é canal", () => {
    expect(PORTA).toMatch(/EMAIL_OK\s*=/);
    expect(PORTA).toMatch(/d\.length\s*>=\s*10/);
  });
});

describe("dá para entrar sem deixar contato — e a consequência é dita na hora", () => {
  it("o caminho de pular continua existindo", () => {
    expect(PORTA).toContain("Prefiro não deixar contato agora");
    expect(PORTA).toMatch(/aoEntrar\(null\)/);
  });

  it("avisa que sem contato a resposta só aparece no portal", () => {
    // Prometer retorno a quem não deixou endereço é a mentira mais fácil desta
    // tela — e a que faz a pessoa esperar por um aviso que nunca vem.
    expect(PORTA).toMatch(/só aparece aqui no portal|não temos como te avisar/i);
  });
});

describe("o contato da porta chega ao pedido", () => {
  it("o contato declarado na porta tem precedência sobre o da conversa", () => {
    // Capturar e não enviar seria a mesma seta faltando de sempre.
    expect(PAGINA).toMatch(/const contato = contatoDaPorta \?\? data\.contato/);
    expect(PAGINA).toMatch(/contato,/);
  });

  it("nome, e-mail e telefone da porta preenchem o cadastro do prospect", () => {
    expect(PAGINA).toMatch(/prospectName: contatoDaPorta\?\.nome/);
    expect(PAGINA).toMatch(/prospectEmail: contatoDaPorta\?\.email/);
    expect(PAGINA).toMatch(/prospectPhone: contatoDaPorta\?\.whatsapp/);
  });
});
