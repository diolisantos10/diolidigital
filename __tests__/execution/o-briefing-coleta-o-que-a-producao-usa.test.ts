// O BRIEFING TEM DE COLETAR O QUE A PRODUÇÃO USA.
//
// ── O buraco que estes testes trancam (24/08/2026) ─────────────────────────
//
// No piloto de ponta a ponta, a Qualidade barrou CINCO peças seguidas com o
// mesmo parecer, e o pacote inteiro ficou retido sem o cliente saber:
//
//   "CTAs prometem 'confirmar canais' e deixam 'PRECISO CONFIRMAR' sem
//    resolver — peça depende de informação não fornecida e não pode ir ao
//    cliente sem preenchimento dos dados atestados (WhatsApp e Instagram)."
//
// A Qualidade estava certa. O defeito era o briefing perguntar tudo que serve
// para VENDER e nada do que serve para PRODUZIR — e a produção descobrir a
// falta DEPOIS de a peça estar escrita.
//
// A lista NÃO é palpite: são os fatos que a Qualidade cobrou, e os mesmos que o
// piso confere na peça pronta. O que ela não cobrou não entrou.

import { describe, it, expect } from "vitest";
import { getNextQuestion, initConvState, inferAnsweredQIds, remainingRequiredQuestions } from "@/lib/agency/question-engine";
import type { ConvState } from "@/lib/agency/briefing-conversation";
import { ctxBlock, type Ctx } from "@/lib/agency/execution/especialistas";
import { verdadeEmLinhas, classesSemInformacaoLegiveis, extrairVerdadeOperacional } from "@/lib/agency/execution/piso-de-verdade";

/** Um estado de conversa DE VERDADE, com os padrões da casa — montar um
 *  objeto à mão aqui esconderia campos que o motor de perguntas usa. */
/** O escopo de um briefing quase fechado: tudo que vem ANTES já respondido.
 *  Sem isto, o motor devolve uma pergunta anterior — e o teste mediria a ordem
 *  da fila, não a pergunta que ele quer conferir. */
const QUASE_FECHADO = {
  prospectName: "Marina", businessName: "Cantina da Prova", segment: "Restaurante",
  targetAudience: "famílias do bairro", objectives: ["vender mais no almoço"],
  competitors: ["Bráz"], wantsSocialMedia: true, wantsPaidTraffic: false,
  branding: { requested: false, hasBrandBook: false, wantsRebrand: false },
  social: { platforms: ["Instagram"], postsPerWeek: 14, storiesPerWeek: 5, reelsPerMonth: 0,
            hasPhotos: true, needsCopy: true },
  serviceMode: "monthly", budgetRange: "pacote", decisionMaker: true,
};

function estado(scope: Record<string, unknown>): ConvState {
  const base = initConvState();
  const s: ConvState = { ...base, scope: { ...base.scope, ...(scope as object) } };
  // `answeredQIds` derivado do escopo, como o motor faz — senão a pergunta já
  // respondida voltaria a aparecer e o teste mediria outra coisa.
  return { ...s, answeredQIds: inferAnsweredQIds(s.scope) };
}

describe("a casa PERGUNTA os básicos que a produção usa", () => {
  it("pergunta o @ do Instagram, o horário e a área — em UM bloco", () => {
    const q = getNextQuestion(estado(QUASE_FECHADO));
    expect(q?.id).toBe("operacao_basica");
    const texto = q!.text(estado(QUASE_FECHADO));
    expect(texto).toMatch(/Instagram/i);
    expect(texto).toMatch(/hor[áa]rio/i);
    expect(texto).toMatch(/bairros|cidades/i);
  });

  it("NÃO pede e-mail nem o NÚMERO do WhatsApp", () => {
    // Regra do CEO, e o motivo é técnico: o escopo inteiro é serializado para
    // dentro do prompt do modelo, e `semPii` apaga sequências longas de dígitos
    // logo em seguida. A peça precisa saber que o negócio ATENDE por WhatsApp.
    const texto = getNextQuestion(estado(QUASE_FECHADO))!.text(estado(QUASE_FECHADO));
    expect(texto).not.toMatch(/e-?mail/i);
    expect(texto).not.toMatch(/n[úu]mero do whats|seu whatsapp é|qual o whats/i);
  });

  it("NÃO trava o briefing: respondida uma vez, a conversa segue", () => {
    // "Não tenho" é resposta válida — o que não pode é a produção descobrir a
    // falta depois. Qualquer texto fecha a pergunta.
    const q = getNextQuestion(estado(QUASE_FECHADO))!;
    const delta = q.parse("não tenho Instagram, e não temos horário fixo", estado(QUASE_FECHADO));
    expect(delta.operacao).toBeTruthy();
    // Com o campo preenchido, a pergunta não volta.
    const depois = getNextQuestion(estado({ ...QUASE_FECHADO, operacao: delta.operacao }));
    expect(depois?.id).not.toBe("operacao_basica");
  });

  it("NÃO TRAVA O PORTÃO DE ENVIO — perder o lead custa mais que peça retida", () => {
    // A ordem foi explícita: "nada disso pode travar o briefing". Com ela
    // obrigatória, o portão parava de abrir e o visitante ficava sem botão por
    // não ter dito o horário do restaurante. A peça a casa reescreve; o
    // prospect que desistiu não volta.
    const pendentes = remainingRequiredQuestions(estado(QUASE_FECHADO)).map((q) => q.id);
    expect(pendentes).not.toContain("operacao_basica");
  });

  it("não pergunta a quem não vai ter peça de social", () => {
    // Prospect real desiste de formulário longo, e isso custa mais que peça
    // retida. Quem não contratou social não responde o que não será usado.
    const q = getNextQuestion(estado({ ...QUASE_FECHADO, wantsSocialMedia: false, wantsPaidTraffic: true }));
    expect(q?.id).not.toBe("operacao_basica");
  });
});

describe("o que o cliente respondeu CHEGA a quem produz", () => {
  const resposta =
    "Nosso Instagram é @cantinadaprova. Abrimos de terça a domingo, das 11h30 às 15h "
    + "e das 18h30 às 23h. Atendemos Pinheiros e Vila Madalena, e sim, atendemos por WhatsApp.";

  it("o extrator lê horário, área e canal das palavras do cliente", () => {
    const op = extrairVerdadeOperacional(resposta, "Cantina da Prova");
    const linhas = verdadeEmLinhas(op).join(" | ").toLowerCase();
    expect(linhas, `nada extraído de: ${resposta}`).not.toBe("");
    // O fato que a Qualidade cobrou tem de estar atestado, não em branco.
    const faltando = classesSemInformacaoLegiveis(op).join(" | ").toLowerCase();
    expect(faltando).not.toMatch(/hor[áa]rio/);
  });

  it("com os fatos coletados, o pedido ao especialista os CARREGA", () => {
    const op = extrairVerdadeOperacional(resposta, "Cantina da Prova");
    const c: Ctx = {
      businessName: "Cantina da Prova", segment: "restaurante", targetAudience: "famílias",
      tone: "", services: [], objectives: [], strategyHeadline: "", hasBrandAssets: false,
      hasRawMaterial: true, criandoIdentidade: false, materiaisEntregues: [],
      verdadeAtestada: { linhas: verdadeEmLinhas(op), semInformacao: classesSemInformacaoLegiveis(op) },
    };
    const bloco = ctxBlock(c);
    expect(bloco).toContain("O QUE O CLIENTE ATESTOU");
  });

  it("SEM os fatos, o pedido DIZ o que falta — o modelo não descobre sozinho", () => {
    // É a metade que faltava: sem esta lista, o especialista escrevia a peça e
    // carimbava a lacuna dentro dela ("chame no WhatsApp [PRECISO CONFIRMAR]").
    const op = extrairVerdadeOperacional("", "Cantina da Prova");
    const c: Ctx = {
      businessName: "Cantina da Prova", segment: "restaurante", targetAudience: "famílias",
      tone: "", services: [], objectives: [], strategyHeadline: "", hasBrandAssets: false,
      hasRawMaterial: true, criandoIdentidade: false, materiaisEntregues: [],
      verdadeAtestada: { linhas: verdadeEmLinhas(op), semInformacao: classesSemInformacaoLegiveis(op) },
    };
    const bloco = ctxBlock(c);
    expect(bloco).toContain("O QUE O CLIENTE NUNCA CONTOU");
    expect(bloco).toMatch(/hor[áa]rio/i);
    // E manda escrever a peça que funciona sem o dado, em vez de furá-la.
    expect(bloco).toMatch(/NÃO CONSTRUA A PEÇA EM CIMA DO QUE FALTA/);
  });
});
