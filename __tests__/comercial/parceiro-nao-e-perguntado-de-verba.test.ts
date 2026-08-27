// PARCEIRO NÃO PAGA — E POR ISSO NÃO É PERGUNTADO QUANTO PODE PAGAR.
//
// ═══ O DEFEITO, MEDIDO EM PRODUÇÃO (27/08/2026, 13:43) ══════════════════════
//
// O interlocutor do primeiro cliente real escreveu:
//
//   "somos um SaaS de CRM que vende para restaurantes, queremos Instagram"
//
// E o SDR respondeu perguntando **quanto ele pretende investir por mês**. A
// conversa parou nessa pergunta. Nenhum pedido nasceu, nenhum orçamento foi
// enviado — e a pergunta do CEO ("por que o orçamento não chegou no e-mail?")
// tem exatamente essa resposta.
//
// Esse cliente entra por PARCERIA e **não paga nada**. `budget_range` é
// obrigatória desde 23/08 porque *sem verba a casa MANDA PREÇO ERRADO* — motivo
// que não existe para quem nunca vai receber preço. A casa exigia de um
// parceiro o único dado que a parceria torna irrelevante, e por ser obrigatório
// esse dado travava o nascimento do pedido.
//
// ═══ O QUE ESTE ARQUIVO PROVA — OS DOIS LADOS ═══════════════════════════════
//
//   1. Parceiro declarado: a verba NÃO é perguntada e o pedido nasce sem ela.
//   2. Cliente PAGANTE: continua barrado sem a verba. Nada afrouxou.
//   3. A parceria não pode ser ADIVINHADA: dizer "somos parceiros de vocês" na
//      conversa não dispensa ninguém — o fato é declarado ou não existe.
//   4. Parceria VENCIDA é igual a parceria nenhuma.
//   5. O parceiro continua sendo perguntado o que ele quer ALCANÇAR.
import { describe, it, expect } from "vitest";

import { remainingRequiredQuestions, dispensadoDeVerba } from "@/lib/agency/question-engine";
import { parceriaVale } from "@/lib/agency/comercial/parceria-declarada";
import { canSubmitProposal, getSubmissionBlockReason } from "@/lib/agency/sdr-agent";
import { emptyEstimate, type ConvState, type BriefingScope } from "@/lib/agency/briefing-conversation";
import { emptySdrState } from "@/lib/agency/sdr-agent";

const DAQUI_A_UM_MES = new Date(Date.now() + 30 * 24 * 3600_000);
const MES_PASSADO = new Date(Date.now() - 30 * 24 * 3600_000);

/** O escopo do caso real: SaaS de CRM que vende para restaurante e quer
 *  Instagram. Tudo respondido MENOS a verba — que é onde a conversa parou. */
function escopoDoCasoReal(): BriefingScope {
  return {
    prospectName: "Marcos",
    businessName: "NOME TESTE",
    segment: "SaaS de CRM para restaurantes",
    targetAudience: "donos de restaurante",
    objectives: ["mais clientes"],
    serviceMode: "monthly",
    wantsSocialMedia: true,
    social: { platforms: ["instagram"], postsPerWeek: 3, storiesPerWeek: 3, reelsPerMonth: 4, needsCopy: true, hasPhotos: false },
    branding: { requested: false, hasBrandBook: false, wantsRebrand: false },

    operacao: "atende comercial 9h-18h",
    marca: "sem manual",
    // ⚠️ `budgetRange` AUSENTE de propósito. É o dado que a conversa de 13:43
    // nunca colheu, e é o pedágio que travava o pedido.
  };
}

/** Todas as perguntas dadas por respondidas, menos a verba. */
const RESPONDIDAS = [
  "detect_service", "main_objective", "target_audience", "service_mode",
  "social_platforms", "posts_per_week", "stories", "reels", "social_video",
  "has_photos", "needs_copy", "wants_traffic", "service_area",
  "branding_current", "competitors_refs", "operacao_basica", "marca_basica",
  "deadline",
];

function conversa(parceria: ConvState["parceriaDeclarada"]): ConvState {
  return {
    messages: [],
    scope: escopoDoCasoReal(),
    answeredQIds: [...RESPONDIDAS],
    parceriaDeclarada: parceria,
    isFirstMessage: false,
    estimate: emptyEstimate(),
    canSubmit: false,
  };
}

const PARCEIRO = { autorizadaPor: "Dioli Santos", validaAte: DAQUI_A_UM_MES };

describe("a régua da parceria: declarada, e ainda válida", () => {
  it("parceria ausente NÃO vale — e ausência de informação não é informação", () => {
    expect(parceriaVale(null)).toBe(false);
    expect(parceriaVale(undefined)).toBe(false);
  });

  it("parceria VENCIDA não vale — parceria eterna é esquecimento", () => {
    expect(parceriaVale({ autorizadaPor: "Dioli Santos", validaAte: MES_PASSADO })).toBe(false);
    expect(parceriaVale(PARCEIRO)).toBe(true);
  });
});

describe("1. o parceiro: o pedido nasce SEM a pergunta da verba", () => {
  it("a verba não está entre as perguntas que faltam", () => {
    const faltam = remainingRequiredQuestions(conversa(PARCEIRO)).map((q) => q.id);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Tire o `&& !dispensadoDeVerba(s)` do `when` de `budget_range` e esta
    // linha fica VERMELHA: a pergunta volta à fila e o parceiro volta a ser
    // barrado — a conversa de 13:43, de novo.
    expect(faltam).not.toContain("budget_range");
    expect(faltam).toEqual([]);
  });

  it("o PORTÃO DE ENVIO abre: o pedido nasce, o orçamento pode sair", () => {
    const v = conversa(PARCEIRO);
    expect(canSubmitProposal(v, emptySdrState())).toBe(true);
    expect(getSubmissionBlockReason(v, emptySdrState())).toBeNull();
  });

  it("dispensadoDeVerba é UMA régua só — a pergunta e o portão não podem divergir", () => {
    // Se a pergunta parasse de ser feita mas o portão continuasse exigindo a
    // resposta, a conversa travaria sem NINGUÉM nunca perguntar nada. É a pior
    // versão possível deste defeito, e é por isso que a régua é uma função só.
    const v = conversa(PARCEIRO);
    expect(dispensadoDeVerba(v)).toBe(true);
    expect(remainingRequiredQuestions(v)).toEqual([]);
    expect(canSubmitProposal(v, emptySdrState())).toBe(true);
  });
});

describe("2. o PAGANTE continua barrado sem a verba — nada afrouxou", () => {
  it("sem parceria declarada, a verba volta a ser obrigatória", () => {
    const faltam = remainingRequiredQuestions(conversa(null)).map((q) => q.id);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Faça `dispensadoDeVerba` devolver `true` sempre (o afrouxamento fácil) e
    // esta linha fica VERMELHA. É ela que impede o conserto do parceiro de
    // virar porta aberta para quem paga — e é a verba que escolhe o degrau.
    expect(faltam).toContain("budget_range");
  });

  it("o portão de envio do pagante CONTINUA FECHADO sem a verba", () => {
    const v = conversa(null);
    expect(dispensadoDeVerba(v)).toBe(false);
    expect(canSubmitProposal(v, emptySdrState())).toBe(false);
    expect(getSubmissionBlockReason(v, emptySdrState())).not.toBeNull();
  });

  it("o pagante que RESPONDE a verba passa — a pergunta continua fechando normal", () => {
    const v = conversa(null);
    v.scope.budgetRange = "uns R$ 2.000 por mês";
    expect(remainingRequiredQuestions(v)).toEqual([]);
    expect(canSubmitProposal(v, emptySdrState())).toBe(true);
  });
});

describe("3. a parceria NÃO se adivinha — é declarada ou não existe", () => {
  it("dizer 'somos parceiros de vocês' na conversa NÃO dispensa ninguém", () => {
    // ⚠️ A PROVA MAIS IMPORTANTE DO ARQUIVO. Se a parceria pudesse ser lida do
    // texto, a maior porta desta casa teria a chave mais fraca que ela tem:
    // qualquer visitante digitaria a frase e deixaria de ser perguntado sobre
    // verba — e a régua que existe para não mandar preço errado cairia junto.
    const v = conversa(null);
    v.scope.segment = "somos parceiros de vocês, parceria, isento, não pagamos nada";
    v.scope.objectives = ["parceria com a agência", "isenção total"];
    expect(dispensadoDeVerba(v)).toBe(false);
    expect(remainingRequiredQuestions(v).map((q) => q.id)).toContain("budget_range");
    expect(canSubmitProposal(v, emptySdrState())).toBe(false);
  });

  it("parceria VENCIDA volta a ser perguntada — vencida é igual a inexistente", () => {
    const v = conversa({ autorizadaPor: "Dioli Santos", validaAte: MES_PASSADO });
    expect(dispensadoDeVerba(v)).toBe(false);
    expect(remainingRequiredQuestions(v).map((q) => q.id)).toContain("budget_range");
  });
});

describe("4. a pergunta que sobra é ÚTIL ao parceiro", () => {
  it("o parceiro continua sendo perguntado O QUE QUER ALCANÇAR", () => {
    // O que sai é a pergunta sobre o bolso de quem não tem bolso nesta relação.
    // O objetivo — o que serve para PRODUZIR — continua obrigatório para todos.
    const semObjetivo = conversa(PARCEIRO);
    semObjetivo.answeredQIds = RESPONDIDAS.filter((id) => id !== "main_objective");
    semObjetivo.scope.objectives = [];
    const faltam = remainingRequiredQuestions(semObjetivo).map((q) => q.id);
    expect(faltam).toContain("main_objective");
    expect(faltam).not.toContain("budget_range");
  });
});
