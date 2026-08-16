import { describe, it, expect } from "vitest";
import {
  mensagemDoBriefing,
  linkDoBriefing,
  linkDoWhatsApp,
  LIMITE_DO_TEXTO,
  WHATSAPP_DA_DIOLI,
} from "@/lib/agency/comercial/link-do-whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE TESTE EXISTE
//
// Achado do especialista `experiencia` em 16/08/2026: a tela de confirmação do
// briefing abria `wa.me/5511989400692` **sem texto nenhum**. A pessoa acabava de
// contar o negócio inteiro ao SDR — segmento, objetivo, volume, verba — e caía
// no WhatsApp diante de uma caixa VAZIA, tendo de recomeçar do zero.
//
// O agravante é que **a home já mandava contexto** no mesmo botão. Não era falta
// de capacidade: era inconsistência entre duas telas da mesma casa.
//
// As duas metades travadas aqui:
//   (a) com escopo cheio  → a mensagem carrega o que foi dito;
//   (b) com escopo vazio  → não inventa NADA e continua enviável.
// ─────────────────────────────────────────────────────────────────────────────

const CHEIO = {
  nome: "Dioli Santos",
  negocio: "Clínica Bela Face",
  servicos: ["social media", "planejamento de conteúdo"],
  referencia: "req-8842",
};

describe("(a) com o escopo cheio, a conversa já começa começada", () => {
  const msg = mensagemDoBriefing(CHEIO);

  it("leva quem é, o que pediu e a referência do briefing", () => {
    expect(msg).toContain("Dioli Santos");
    expect(msg).toContain("Clínica Bela Face");
    expect(msg).toContain("social media");
    // A referência é o que faz a casa achar o registro sem perguntar de novo —
    // o objetivo inteiro do conserto.
    expect(msg).toContain("req-8842");
  });

  it("o link é do WhatsApp da casa e leva o texto codificado", () => {
    const url = linkDoBriefing(CHEIO);
    expect(url.startsWith(`https://wa.me/${WHATSAPP_DA_DIOLI}?text=`)).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(msg);
  });
});

describe("(b) com o escopo vazio, não inventa nada — e continua enviável", () => {
  it("sem nenhum dado, ainda produz uma mensagem que dá para mandar", () => {
    // Escopo vazio é comportamento normal (a pessoa pode não ter dito nada), não
    // erro a tratar. O botão não pode abrir uma caixa vazia de novo.
    const msg = mensagemDoBriefing({});
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/briefing/i);
  });

  it("campo ausente SOME — nunca vira 'não informado' na boca do cliente", () => {
    // Esta é a lei mais importante do arquivo. A mensagem é enviada EM NOME da
    // pessoa: escrever "Negócio não informado" ali é pôr na boca dela uma frase
    // que ela não disse — e "não informado" é rótulo de tela interna, não de
    // conversa. Pior que mensagem curta é mensagem que mente.
    const msg = mensagemDoBriefing({ nome: "Dioli", negocio: null, servicos: [], referencia: null });
    expect(msg).not.toMatch(/não informado|nao informado|undefined|null|\[object/i);
    expect(msg).toContain("Dioli");
  });

  it("string vazia e espaço em branco contam como ausência", () => {
    const msg = mensagemDoBriefing({ nome: "   ", negocio: "", servicos: ["", "  "], referencia: "" });
    expect(msg).not.toMatch(/undefined|null|:\s*\./);
    expect(msg.length).toBeGreaterThan(0);
  });

  it("sem texto, o link continua sendo um link válido do WhatsApp", () => {
    expect(linkDoWhatsApp(null)).toBe(`https://wa.me/${WHATSAPP_DA_DIOLI}`);
    expect(linkDoWhatsApp("")).toBe(`https://wa.me/${WHATSAPP_DA_DIOLI}`);
  });
});

describe("o tamanho: melhor curta e certa que completa e truncada", () => {
  it("respeita o teto mesmo com um pedido gigante", () => {
    const monstro = {
      ...CHEIO,
      servicos: Array.from({ length: 40 }, (_, i) => `serviço muito bem descrito número ${i}`),
    };
    expect(mensagemDoBriefing(monstro).length).toBeLessThanOrEqual(LIMITE_DO_TEXTO);
  });

  it("NUNCA corta no meio de uma palavra — saem itens inteiros", () => {
    // Truncar é a assinatura de sistema quebrado, e é exatamente o defeito que
    // esta casa passou o dia consertando noutro lugar. Se não cabe, o item
    // inteiro fica de fora; nada de reticências nem de palavra pela metade.
    const monstro = {
      ...CHEIO,
      servicos: Array.from({ length: 40 }, (_, i) => `serviço muito bem descrito número ${i}`),
    };
    const msg = mensagemDoBriefing(monstro);
    expect(msg).not.toMatch(/\.\.\.|…/);
    // A lista ou entra inteira, ou não entra: nunca um pedaço dela.
    if (msg.includes("Pedi:")) {
      for (const s of monstro.servicos) expect(msg).toContain(s);
    }
  });

  it("quando é preciso escolher, a referência ganha da lista de serviços", () => {
    // Repetir o pedido é chato; repetir o briefing INTEIRO porque ninguém acha o
    // registro é o defeito que este arquivo existe para consertar.
    const msg = mensagemDoBriefing({
      ...CHEIO,
      servicos: Array.from({ length: 40 }, (_, i) => `serviço número ${i}`),
    });
    expect(msg).toContain("req-8842");
  });

  it("a URL final fica longe do limite dos navegadores antigos", () => {
    // O texto vai na query string, e em português cada acento vira 6 caracteres
    // (`%C3%A9`). O piso conhecido é ~2.000 para webviews antigos.
    const url = linkDoBriefing({
      nome: "Ação Comunicação Estratégica",
      negocio: "Padaria São João — Confeitaria e Panificação",
      servicos: ["gestão de redes sociais", "produção de conteúdo em vídeo", "tráfego pago"],
      referencia: "req-8842",
    });
    expect(url.length).toBeLessThan(2000);
  });
});
