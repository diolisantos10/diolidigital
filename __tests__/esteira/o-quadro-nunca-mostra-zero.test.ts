// O QUADRO NUNCA MOSTRA ZERO — nem um número plausível-e-errado no lugar.
//
// ─── O CASO REAL (Diego, City Jobs, 16/08/2026) ─────────────────────────────
//
// Diego descreveu no SDR "dois posts estáticos por dia" e, mais adiante,
// "14 posts por semana". O quadro do escopo, ao lado da própria conversa,
// mostrou "0 posts por mês" o tempo todo. A frase dele, com todas as letras:
//
//   "tá certinho aqui o resumo eu vi aqui ao lado só tá dizendo que são 0
//    posts por mês não sei se é algum problema do sistema de vocês ou não"
//
// E, mais tarde na mesma conversa:
//
//   "ali no quadro ainda continua zero post mas tudo bem"
//
// O SDR respondeu "pode ser alguma coisa no sistema mesmo" — a agência
// admitindo o defeito para o próprio cliente, ao vivo.
//
// ─── O QUE JÁ FOI MEDIDO E CONSERTADO HOJE (não repetir aqui) ───────────────
//
// Três rodadas de conserto já mexeram nesta família de defeito em 16/08:
//   • 78df6c6 — "2 posts por dia" virando "2 por semana" (ignorava a unidade)
//   • 96440ea — a unidade da PERGUNTA encontrando a da RESPOSTA, em SEIS portas
//   • a18df6e — o SDR: número cortado no meio que parece um número certo
//   • lib/agency/live-calculator.ts:183-187 (`volumeDeclarado`) — zero,
//     negativo, NaN ou fora de tipo agora travam a estimativa
//     (`travadaPor`) em vez de virar "Plano Essencial" com confiança alta.
//
// Todas as formas DIGITAIS ("2 por dia", "14 por semana", "14 semanais")
// já convertem certo, de ponta a ponta, pelo caminho real
// (question-engine → prospect-engine → live-calculator). Este arquivo confere
// isso como REGRESSÃO — não como novidade.
//
// ─── O QUE ESTA RODADA DE MEDIÇÃO ENCONTROU DE NOVO ─────────────────────────
//
// A primeira fala de Diego não usava dígito — usava a PALAVRA "dois". E
// `extractNumber` (question-engine.ts:23-26) só lê `\b(\d+)\b`: dígito, nunca
// palavra. Para "dois posts estáticos por dia":
//
//   extractNumber()   → undefined (nenhum dígito no texto)
//   volumeNaUnidade()  → undefined (não há número para converter)
//   frequenciaSemanal() → undefined
//
// E a pergunta `posts_per_week` (question-engine.ts:312) faz
// `frequenciaSemanal(answer) ?? 3` — quando a conversão falha, ela não deixa
// o campo em aberto: ela GRAVA 3, um número plausível para a pergunta feita
// ("quantas por semana?"), como se a pessoa tivesse respondido isso. Não é
// mais "0 posts/mês" — é pior, porque 3 parece um número respondido de
// verdade, e ninguém pergunta de novo. Mesma doença do dia ("parece
// respondido, não está"), forma nova.
//
// O mesmo buraco existe em `stories` (linha 323, `?? 3`) e em `reels`
// (linha 333, `?? 4`) — não testado aqui em detalhe porque o caso real de
// Diego é sobre posts, mas fica registrado para quem for consertar.
//
// A peça que falta NÃO precisa ser inventada: o vocabulário de número por
// extenso já existe na casa, em DOIS lugares —
// `lib/agency/esteira/leitura-do-pedido.ts:52` (`NUMERO_POR_EXTENSO`, "um" a
// "doze") e `lib/agency/design/trava-de-texto.ts:265` (lista mais rica, até
// "mil"). Nenhum dos dois está conectado a `extractNumber` em
// `question-engine.ts`. Consertar aqui é ligar um fio, não construir um
// motor novo — e por isso este arquivo NÃO cria um terceiro módulo de
// leitura de número.

import { describe, it, expect } from "vitest";
import { frequenciaSemanal, volumeNaUnidade } from "@/lib/agency/question-engine";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { computeEstimate } from "@/lib/agency/live-calculator";

// O roteiro de identidade + serviço que precede a pergunta de volume no
// caminho real (o mesmo formato que já levou "2 posts por dia" ao escopo em
// `__tests__/esteira/o-volume-declarado-na-unidade-da-pessoa.test.ts`). Só a
// fala de volume (índice 6) muda entre os cenários abaixo.
function roteiroComFalaDeVolume(falaDeVolume: string): string[] {
  return [
    "Meu nome é Diego Santos e meu negócio se chama City Jobs.",
    "Somos de recrutamento e vagas de emprego.",
    "Quero social media: gestão de redes sociais no Instagram.",
    "Objetivo é atrair mais candidatos e empresas.",
    "Público: profissionais em busca de vaga, região metropolitana.",
    "Quero que vocês criem e publiquem tudo.",
    falaDeVolume,
    "Sim, quero stories.",
    "Não quero reels.",
    "Não tenho fotos, preciso que vocês produzam.",
    "Sim, preciso que escrevam os textos.",
    "Não quero tráfego pago agora.",
  ];
}

function rodarRoteiro(falas: string[]): ProspectConvState {
  let estado = initProspectConvState();
  for (const fala of falas) estado = processProspectMessage(fala, estado);
  return estado;
}

describe("o volume nunca chega em zero — as formas que já convertem certo (regressão)", () => {
  it("dígito + 'por dia': '2 posts por dia' chega a 14/semana, nunca 0 nem 2", () => {
    const estado = rodarRoteiro(roteiroComFalaDeVolume("2 posts por dia."));
    expect(estado.conv.scope.social?.postsPerWeek).toBe(14);
  });

  it("a segunda fala literal do Diego, direto: '14 posts por semana' chega a 14/semana", () => {
    const estado = rodarRoteiro(roteiroComFalaDeVolume("14 posts por semana."));
    expect(estado.conv.scope.social?.postsPerWeek).toBe(14);
  });

  it("variação real de fala: '14 posts semanais' (adjetivo, não preposição) também chega a 14", () => {
    expect(frequenciaSemanal("14 posts semanais")).toBe(14);
    const estado = rodarRoteiro(roteiroComFalaDeVolume("14 posts semanais."));
    expect(estado.conv.scope.social?.postsPerWeek).toBe(14);
  });

  it("o quadro nunca mostra zero para nenhuma dessas falas — a estimativa fecha, não trava", () => {
    for (const fala of ["2 posts por dia.", "14 posts por semana.", "14 posts semanais."]) {
      const estado = rodarRoteiro(roteiroComFalaDeVolume(fala));
      const est = computeEstimate(estado.conv.scope);
      expect(est.travadaPor, `travou para "${fala}"`).toBeUndefined();
      expect(est.totalMin, `total zerado para "${fala}"`).toBeGreaterThan(0);
    }
  });
});

describe("🔴 GAP MEDIDO NESTA RODADA — a PRIMEIRA fala literal do Diego, por extenso", () => {
  // "dois posts estáticos por dia" é a fala real, palavra por palavra, do
  // incidente de 16/08. Ela nunca chegou digitada com o dígito "2".

  it("na unidade crua: volumeNaUnidade não lê 'dois' — hoje devolve ausência, não 14", () => {
    // Isto é o sintoma correto de HOJE, não o comportamento desejado: sem
    // suporte a extenso, a função devolve ausência (undefined), que é o
    // certo a fazer NA FUNÇÃO. O defeito mora um andar acima — em quem lê
    // essa ausência e a troca por um palpite (ver próximo `it`).
    expect(volumeNaUnidade("dois posts estáticos por dia", "semana")).toBeUndefined();
  });

  it("ponta a ponta: a fala do Diego deveria chegar em 14/semana, ou ficar em aberto — NUNCA um número plausível e errado", () => {
    const estado = rodarRoteiro(roteiroComFalaDeVolume("dois posts estáticos por dia."));
    const gravado = estado.conv.scope.social?.postsPerWeek;

    // O comportamento correto: OU o número chega íntegro (14 — dois por dia,
    // sete dias por semana), OU o campo permanece indefinido (ausência
    // declarada, que trava a estimativa em vez de cotar errado). O que não
    // pode acontecer é o que acontece hoje: o campo vem preenchido com "3",
    // o default de quem não tinha o que responder — parece um dado real e
    // não é. Ver question-engine.ts:312 (`frequenciaSemanal(answer) ?? 3`).
    const chegouIntegro = gravado === 14;
    const ficouEmAberto = gravado === undefined;
    expect(
      chegouIntegro || ficouEmAberto,
      `o quadro gravou postsPerWeek=${gravado} para "dois posts estáticos por dia" — ` +
        `não é 14 (íntegro) nem ausência (aberto): é um palpite de 3 que parece dado`,
    ).toBe(true);
  });

  it("a estimativa nunca deve cotar como se a pessoa tivesse pedido 3/semana quando disse 'dois por dia'", () => {
    const estado = rodarRoteiro(roteiroComFalaDeVolume("dois posts estáticos por dia."));
    const est = computeEstimate(estado.conv.scope);

    // Preço de "2 posts por dia" (dígito, já consertado) é o piso do que "dois
    // posts por dia" (extenso) deveria custar, nunca menos — a pessoa pediu a
    // MESMA coisa nas duas formas de escrever o número.
    const estadoDigito = rodarRoteiro(roteiroComFalaDeVolume("2 posts por dia."));
    const estDigito = computeEstimate(estadoDigito.conv.scope);

    // Ou a estimativa travou pedindo confirmação (não cotou errado), ou ela
    // cotou pelo menos o mesmo preço do caso digital equivalente.
    const travouCerto = est.travadaPor !== undefined;
    const cotouCerto = est.totalMin >= estDigito.totalMin;
    expect(
      travouCerto || cotouCerto,
      `estimativa para "dois posts estáticos por dia" saiu ${JSON.stringify({
        totalMin: est.totalMin,
        totalMax: est.totalMax,
        travadaPor: est.travadaPor,
      })}, mais barata que a de "2 posts por dia" (${estDigito.totalMin}) sem travar — ` +
        `é a mesma subcotação silenciosa do incidente do CEO, só que sem mostrar zero`,
    ).toBe(true);
  });
});

describe("o mesmo buraco existia em MAIS DOIS lugares — stories e reels (não só posts)", () => {
  // O cabeçalho deste arquivo já registrava: o mesmo `?? <default>` silencioso
  // vivia em TRÊS perguntas — posts_per_week (`?? 3`), stories (`?? 3`) e reels
  // (`?? 4`). Consertar só a de posts e deixar as outras duas intocadas seria
  // resolver 1/3 do incidente e chamar de pronto. Os números escolhidos abaixo
  // (21 e 6) são DE PROPÓSITO diferentes dos antigos defaults (3 e 4) — se o
  // conserto não estivesse ligado de verdade, o teste passaria por acidente.

  function roteiroComFalaDeStories(falaDeStories: string): string[] {
    return [
      "Meu nome é Diego Santos e meu negócio se chama City Jobs.",
      "Somos de recrutamento e vagas de emprego.",
      "Quero social media: gestão de redes sociais no Instagram.",
      "Objetivo é atrair mais candidatos e empresas.",
      "Público: profissionais em busca de vaga, região metropolitana.",
      "Quero que vocês criem e publiquem tudo.",
      "2 posts por dia.",
      falaDeStories,
      "Não quero reels.",
      "Não tenho fotos, preciso que vocês produzam.",
      "Sim, preciso que escrevam os textos.",
      "Não quero tráfego pago agora.",
    ];
  }

  function roteiroComFalaDeReels(falaDeReels: string): string[] {
    return [
      "Meu nome é Diego Santos e meu negócio se chama City Jobs.",
      "Somos de recrutamento e vagas de emprego.",
      "Quero social media: gestão de redes sociais no Instagram.",
      "Objetivo é atrair mais candidatos e empresas.",
      "Público: profissionais em busca de vaga, região metropolitana.",
      "Quero que vocês criem e publiquem tudo.",
      "2 posts por dia.",
      "Sim, quero stories.",
      falaDeReels,
      "Não tenho fotos, preciso que vocês produzam.",
      "Sim, preciso que escrevam os textos.",
      "Não quero tráfego pago agora.",
    ];
  }

  it("stories por extenso: 'três stories por dia' chega a 21/semana — não ao palpite de 3", () => {
    const estado = rodarRoteiro(roteiroComFalaDeStories("três stories por dia."));
    expect(estado.conv.scope.social?.storiesPerWeek).toBe(21);
  });

  it("reels por extenso: 'seis reels por mês' chega a 6/mês — não ao palpite de 4", () => {
    const estado = rodarRoteiro(roteiroComFalaDeReels("quero seis reels por mês."));
    expect(estado.conv.scope.social?.reelsPerMonth).toBe(6);
  });
});
