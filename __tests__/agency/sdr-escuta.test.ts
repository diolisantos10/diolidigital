// AS DUAS REGRAS DE ESCUTA DO SDR — vistas falhando no piloto real (16/08/2026).
//
// ── O QUE ACONTECEU NA TELA ────────────────────────────────────────────────
//
// 1. O CEO falou "City Jobs" por voz, a transcrição entregou "Siri Jobs", e o
//    SDR aceitou e repetiu o nome errado. Nome errado na origem contamina o
//    cliente, o projeto e todo entregável depois.
//
// 2. O cliente disse "tenho um brief pronto aqui, posso mandar pra adiantar?"
//    e o SDR emendou a próxima pergunta do roteiro. O cliente ofereceu a lição
//    de casa e a máquina atropelou — o mesmo defeito que irritou o CEO no dia
//    anterior, quando anexou um PDF e a máquina pediu o que estava no anexo.
//
// ── POR QUE ESTE TESTE É DE TEXTO, E POR QUE ISSO BASTA AQUI ───────────────
//
// O comportamento deste agente É o texto que ele recebe: não há ramificação em
// código para "o cliente ofereceu material". Uma regra que só existe na cabeça
// de quem escreveu o prompt some no primeiro refactor — e some em silêncio,
// que é o pior jeito de sumir. Este teste é a testemunha das duas regras.
//
// Ele não afirma que o agente OBEDECE (isso é o golden set, com conversa real).
// Ele afirma que a instrução EXISTE e continua existindo.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT = readFileSync(join(process.cwd(), "app/api/sdr/chat/route.ts"), "utf8");
const FICHA = readFileSync(
  join(process.cwd(), "agentes/linha/client-service-sdr/conversational-sdr.md"),
  "utf8",
);

describe("SDR — nome próprio vindo de voz é sempre incerto", () => {
  it("o prompt manda confirmar a grafia de nome próprio, não 'o ponto incerto'", () => {
    // A regra ANTIGA existia e falhou justamente por ser permissiva: mandava
    // confirmar "apenas o ponto específico incerto", e o agente julgou que
    // "Siri Jobs" não era incerto. Ele não tem como julgar isso.
    expect(PROMPT).toContain("NOME PRÓPRIO VINDO DE VOZ É SEMPRE INCERTO");
    // As três categorias precisam estar nomeadas: nome de negócio, de pessoa e
    // de cidade são os que a transcrição erra e que ninguém confere de cabeça.
    for (const alvo of ["NEGÓCIO", "PESSOA", "CIDADE"]) {
      expect(PROMPT, `a regra tem de nomear ${alvo}`).toContain(alvo);
    }
  });

  it("o prompt proíbe registrar nome não confirmado, e diz o porquê", () => {
    expect(PROMPT).toContain("NÃO vira registro");
    expect(PROMPT).toContain("contamina");
  });

  it("o prompt não volta a mandar o agente julgar o que é 'estranho'", () => {
    // Se alguém reescrever a regra para depender do faro do agente, ela morre
    // de novo — porque o faro dele sobre nome de negócio alheio não existe.
    expect(PROMPT).toContain("Não espere \"achar estranho\"");
  });

  it("a ficha carrega a mesma regra e o caso real como golden set", () => {
    expect(FICHA).toContain("Siri Jobs");
    expect(FICHA).toContain("City Jobs");
    expect(FICHA).toContain("Nome próprio vindo de voz é sempre incerto");
  });
});

describe("SDR — oferta de material interrompe o roteiro", () => {
  it("o prompt tem a regra, e ela é declarada como prioritária sobre a próxima pergunta", () => {
    expect(PROMPT).toContain("QUANDO O CLIENTE OFERECE MATERIAL");
    expect(PROMPT).toContain("tem prioridade sobre a sua próxima pergunta");
    expect(PROMPT).toContain("INTERROMPE a sondagem");
  });

  it("o prompt diz os quatro passos: aceitar, dizer como, esperar, e só então perguntar o que falta", () => {
    expect(PROMPT).toContain("ACEITE na hora");
    expect(PROMPT).toContain("DIGA COMO");
    expect(PROMPT).toContain("ESPERE o material");
    expect(PROMPT).toContain("pergunte só o que o material NÃO respondeu");
  });

  it("o prompt proíbe perguntar o que está no material recebido, e proíbe fingir que leu", () => {
    expect(PROMPT).toContain("NUNCA pergunte o que está no material");
    expect(PROMPT).toContain("nunca finja que leu");
  });

  it("o prompt informa o caminho REAL de envio — o sistema aceita anexo, e o agente tem de saber disso", () => {
    // A rota de upload aceita PDF, Word, PowerPoint, imagem e texto (20 MB).
    // Agente que não sabe disso manda o cliente "descrever" o que já estava
    // num arquivo pronto.
    expect(PROMPT).toContain("Anexar briefing / materiais");
    expect(PROMPT).toContain("PDF");
  });

  it("a ficha carrega a regra e o caso real como golden set", () => {
    expect(FICHA).toContain("Oferta de material interrompe o roteiro");
    expect(FICHA).toContain("posso mandar pra adiantar");
  });
});

// ── SEGUNDO PILOTO, 16/08/2026 — mais três defeitos, todos de escopo ────────
//
// 1. O cliente disse "dois posts estáticos por dia" e o quadro do pedido ficou
//    em 0 posts. O orçamento saiu calculado sobre um pedido que ninguém fez.
// 2. O cliente entregou o brand book do CityJobs e o orçamento devolveu
//    "Criação de identidade visual" — vender de volta o que ele mandou pronto.
// 3. Ele avisou que o quadro mostrava 0 e ouviu "garanto que o briefing
//    completo chegou para mim aqui". Continuou zerado depois da garantia.
//
// O terceiro é o mais grave dos três em natureza, ainda que o menor em
// dinheiro: é o agente afirmando um estado que ele não tem como observar.

describe("SDR — número declarado vira número no mesmo turno", () => {
  it("o prompt traduz 'N por dia' e proíbe adiar a captura do número", () => {
    expect(PROMPT).toContain('"2 por dia" → 14');
    expect(PROMPT).toContain('"N por dia" → N × 7');
    expect(PROMPT).toContain("no MESMO turno em que ele falou");
  });

  it("o prompt proíbe fechar a sondagem com número declarado fora do scope", () => {
    expect(PROMPT).toContain("NÃO FECHE COM NÚMERO DECLARADO FALTANDO NO SCOPE");
  });

  it("a ficha carrega a regra e o caso real", () => {
    expect(FICHA).toContain("Número que o cliente falou vira número no mesmo turno");
    expect(FICHA).toContain("dois posts estáticos");
  });
});

describe("SDR — serviço que o cliente já tem não é serviço pedido", () => {
  it("o prompt manda marcar hasBrandBook e NÃO marcar requested", () => {
    expect(PROMPT).toContain("SERVIÇO QUE O CLIENTE JÁ TEM NÃO É SERVIÇO PEDIDO");
    expect(PROMPT).toContain("branding.hasBrandBook: true");
    expect(PROMPT).toContain("branding.requested: false");
  });

  it("a ficha registra o caso do brand book devolvido como oferta", () => {
    expect(FICHA).toContain("Serviço que o cliente já tem não é serviço pedido");
    expect(FICHA).toContain("Criação de identidade visual");
  });
});

describe("SDR — o agente não garante o que não consegue verificar", () => {
  it("o prompt trata a divergência apontada pelo cliente, e proíbe a garantia", () => {
    expect(PROMPT).toContain("QUANDO O CLIENTE DIZ QUE O RESUMO AO LADO ESTÁ ERRADO");
    expect(PROMPT).toContain("NÃO garanta que está tudo registrado");
    expect(PROMPT).toContain("garanto que chegou aqui");
  });

  it("o prompt manda reenviar o escopo ACUMULADO — a única coisa ao alcance do agente", () => {
    expect(PROMPT).toContain("Devolva o scope ACUMULADO INTEIRO nesse turno");
  });

  it("a ficha registra a frase real que o agente não podia ter dito", () => {
    expect(FICHA).toContain("O agente não garante o que não pode verificar");
    expect(FICHA).toContain("garanto que o briefing");
  });
});
