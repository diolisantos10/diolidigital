// RESPOSTA QUE NÃO RESPONDE NÃO PREENCHE CAMPO — a régua da raiz da 6ª rodada.
//
// O defeito medido: o SDR gravou `operacao` com a frase de OBJETIVO do cliente.
// Com o campo cheio, `when: (s) => ... && !s.scope.operacao` passou a devolver
// `false` e a pergunta do HORÁRIO passou por respondida. Três passos adiante o
// piso de verdade barrou a peça por falta de horário de funcionamento.
//
// ── O QUE ESTE ARQUIVO PROVA, E ONDE ────────────────────────────────────────
//   1. `lerBasicosOperacionais` (o leitor novo) recusa a frase de objetivo e
//      aceita cada um dos três fatos — inclusive a recusa declarada;
//   2. `QUESTIONS` / `operacao_basica.parse` (`question-engine.ts`) devolve
//      DELTA VAZIO para a resposta que não responde — a linha exata que era
//      `({ operacao: answer.trim() })`;
//   3. o motor inteiro (`processProspectMessage`) não fecha a pergunta e não
//      enche o campo, e a segunda formulação NOMEIA o que falta.
//
// ── A MUTAÇÃO QUE ESTE ARQUIVO PEGA ────────────────────────────────────────
// Reponha `parse: (answer) => ({ operacao: answer.trim() })` e os testes 2 e 3
// quebram. Troque o leitor por um `answer.length > 0` e o teste 1 quebra.

import { describe, it, expect } from "vitest";
import { lerBasicosOperacionais } from "@/lib/agency/comercial/resposta-que-responde";
import { TODAS_AS_PERGUNTAS } from "@/lib/agency/question-engine";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { ROTEIRO_PADRAO, fatoQueResponde } from "@/lib/agency/cliente-falso/roteiro";
import { emptyScope, type ConvState } from "@/lib/agency/briefing-conversation";

const perguntaDosBasicos = () => {
  const q = TODAS_AS_PERGUNTAS.find((x) => x.id === "operacao_basica");
  if (!q) throw new Error("a pergunta `operacao_basica` sumiu da fila");
  return q;
};

// A frase EXATA da classe que derrubou a produção: um objetivo, não um dado
// operacional. Ela não diz @, não diz horário, não diz bairro.
const FRASE_DE_OBJETIVO = "Quero aumentar as vendas e ter mais presença online";

describe("o leitor: a resposta responde?", () => {
  it("a frase de OBJETIVO não responde nenhuma das três perguntas", () => {
    const r = lerBasicosOperacionais(FRASE_DE_OBJETIVO);
    expect(r.responde).toBe(false);
    expect(r.temHorario).toBe(false);
    expect(r.temEndereco).toBe(false);
    expect(r.faltando).toContain("o horário e os dias de funcionamento");
  });

  it("o HORÁRIO sozinho responde — é o fato cuja falta barrou a peça", () => {
    const r = lerBasicosOperacionais("Abrimos das 18h às 23h");
    expect(r.temHorario).toBe(true);
    expect(r.responde).toBe(true);
  });

  it("o @ sozinho responde", () => {
    expect(lerBasicosOperacionais("@cantinadoporto").responde).toBe(true);
  });

  it("a RECUSA declarada é resposta — a conversa não pode travar aqui", () => {
    for (const fala of ["prefiro não dizer", "não tenho isso ainda", "não sei"]) {
      const r = lerBasicosOperacionais(fala);
      expect(r.ehRecusa, `"${fala}" tinha de ser lido como recusa declarada`).toBe(true);
      expect(r.responde).toBe(true);
    }
  });

  it("o texto vazio não responde e não é recusa", () => {
    expect(lerBasicosOperacionais("   ").responde).toBe(false);
    expect(lerBasicosOperacionais("").ehRecusa).toBe(false);
  });
});

describe("a pergunta: o campo só enche com o que responde", () => {
  const estado = (): ConvState => ({
    messages: [], scope: emptyScope(), answeredQIds: [], isFirstMessage: false,
    estimate: { items: [], subtotal: 0, total: 0, minTotal: 0, maxTotal: 0, confidence: "low" } as never,
    canSubmit: false,
  });

  it("a frase de objetivo devolve DELTA VAZIO — `operacao` não é tocado", () => {
    const delta = perguntaDosBasicos().parse(FRASE_DE_OBJETIVO, estado());
    expect(delta).not.toHaveProperty("operacao");
  });

  it("a resposta com horário grava a frase CRUA do cliente", () => {
    const fala = "@cantinadoporto, de terça a domingo das 18h às 23h";
    const delta = perguntaDosBasicos().parse(fala, estado());
    expect(delta.operacao).toBe(fala);
  });

  it("a pergunta continua PENDENTE quando o campo não encheu", () => {
    const s = estado();
    s.scope.wantsSocialMedia = true;
    expect(perguntaDosBasicos().when(s)).toBe(true);
    const depois = { ...s, scope: { ...s.scope, ...perguntaDosBasicos().parse(FRASE_DE_OBJETIVO, s) } };
    expect(
      perguntaDosBasicos().when(depois),
      "o campo não encheu, então a pergunta tinha de continuar de pé",
    ).toBe(true);
  });
});

describe("o motor: a casa volta a perguntar, uma vez, dizendo o que falta", () => {
  // A conversa é dirigida pelo MESMO roteiro do cliente falso
  // (`cliente-falso/roteiro.ts`), casando a pergunta da casa com o fato que a
  // responde. Roteiro de mão escrito aqui só provaria que eu sei escrever um
  // roteiro: este dirige o motor como o piloto de verdade dirige.
  function ateOsBasicos(): { estado: ProspectConvState; chegou: boolean } {
    let estado = initProspectConvState(ROTEIRO_PADRAO.contatoDaPorta);
    const usados = new Set<string>();
    estado = processProspectMessage(ROTEIRO_PADRAO.aberturaEspontanea, estado);
    for (let i = 0; i < 24; i++) {
      const pergunta = estado.conv.messages[estado.conv.messages.length - 1]!.text;
      if (/@ do seu instagram|hor[áa]rio e dias/i.test(pergunta)) return { estado, chegou: true };
      const fato = fatoQueResponde(pergunta, ROTEIRO_PADRAO, usados);
      if (!fato) { estado = processProspectMessage(ROTEIRO_PADRAO.quandoNaoEntende, estado); continue; }
      usados.add(fato.id);
      estado = processProspectMessage(fato.responde, estado);
    }
    return { estado, chegou: false };
  }

  it("a resposta que não responde não fecha `operacao_basica` e a casa reformula NOMEANDO o que falta", () => {
    const { estado: naPergunta, chegou } = ateOsBasicos();
    expect(chegou, "a conversa não chegou na pergunta dos básicos — o teste perdeu a mira").toBe(true);

    const depois = processProspectMessage(FRASE_DE_OBJETIVO, naPergunta);

    expect(
      depois.conv.scope.operacao,
      "a frase de objetivo NÃO pode virar os básicos operacionais — foi essa a raiz",
    ).toBeUndefined();

    const resposta = depois.conv.messages[depois.conv.messages.length - 1]!.text;
    expect(resposta, "a segunda formulação tem de nomear o horário, que é o que barrou a peça")
      .toMatch(/horário e dias/i);
    expect(resposta, "e nunca repetir a primeira frase palavra por palavra")
      .not.toContain("Falta pouco!");
  });

  it("a segunda resposta com horário FECHA a pergunta — a insistência tem fim", () => {
    const { estado, chegou } = ateOsBasicos();
    expect(chegou).toBe(true);
    let e = processProspectMessage(FRASE_DE_OBJETIVO, estado);
    e = processProspectMessage("abrimos de terça a domingo das 18h às 23h", e);
    expect(e.conv.scope.operacao).toContain("18h");
    expect(e.conv.answeredQIds).toContain("operacao_basica");
  });

  it("duas respostas sem encaixe NÃO viram uma terceira pergunta — e a fala do cliente vira lacuna", () => {
    const { estado, chegou } = ateOsBasicos();
    expect(chegou).toBe(true);
    let e = processProspectMessage(FRASE_DE_OBJETIVO, estado);
    e = processProspectMessage("na verdade meu foco é fidelizar quem já compra", e);
    expect(e.conv.answeredQIds, "depois do limite, a pergunta fecha e a conversa AVANÇA")
      .toContain("operacao_basica");
    const lacuna = (e.conv.scope.lacunasDeEscopo ?? []).find((l) => l.id === "sem_encaixe:operacao_basica");
    expect(lacuna, "a resposta do cliente nunca é descartada em silêncio").toBeTruthy();
    expect(lacuna!.oQueOClienteDisse).toContain("fidelizar");
  });
});
