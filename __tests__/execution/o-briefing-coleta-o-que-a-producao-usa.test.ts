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
import { getNextQuestion, initConvState, inferAnsweredQIds, remainingRequiredQuestions, TODAS_AS_PERGUNTAS, QIDS_OPCIONAIS } from "@/lib/agency/question-engine";
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

  it("é perguntada ANTES da verba — senão vira fala de despedida", () => {
    // O defeito medido ao vivo em 24/08/2026, e é o MESMO que tirou
    // `budget_range` de opcional em 23/08: pergunta opcional colocada depois da
    // última obrigatória é feita quando o portão JÁ abriu — o cliente tem o
    // botão de enviar na mão, a conversa acaba, e o campo chega nulo à produção.
    //
    // Com a verba ainda pendente, o portão continua fechado e a pergunta é
    // respondida de verdade. Se alguém reordenar a fila, isto fica vermelho.
    const semVerbaNemOperacao = { ...QUASE_FECHADO };
    delete (semVerbaNemOperacao as Record<string, unknown>).budgetRange;
    expect(getNextQuestion(estado(semVerbaNemOperacao))?.id).toBe("operacao_basica");
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


// ═══════════════════════════════════════════════════════════════════════════
// REGRA DE CLASSE: PERGUNTA NOVA ENTRA ANTES DA ÚLTIMA OBRIGATÓRIA
// ═══════════════════════════════════════════════════════════════════════════
//
// Esta trava não é sobre `operacao_basica`. É sobre a PRÓXIMA pergunta que
// alguém acrescentar.
//
// A casa já caiu neste buraco duas vezes, com um dia de intervalo:
//   • 23/08/2026 — `budget_range` era opcional e vinha depois da última
//     obrigatória. Virava a fala de despedida, ninguém respondia, e a casa
//     mandou R$ 4.500–7.700/mês a um cliente de R$ 500.
//   • 24/08/2026 — `operacao_basica` nasceu no mesmo lugar. Medido ao vivo:
//     a casa perguntou, a conversa acabou, `operacao` chegou NULA à produção.
//
// Na segunda vez a lição já estava escrita — num comentário ao lado de
// `OPTIONAL_QIDS`. Comentário só ensina quem já está lendo aquele trecho, e
// quem acrescenta pergunta não está lendo ali: está mexendo na lista de
// perguntas. Por isso a lição vira TESTE, no caminho de quem vai tropeçar.
//
// A regra: **o portão de envio abre quando a última pergunta OBRIGATÓRIA é
// respondida.** Tudo que estiver depois dela na fila é perguntado com o botão
// de enviar já na mão do cliente — e não é respondido.
describe("REGRA DE CLASSE: nenhuma pergunta opcional pode ficar depois da última obrigatória", () => {
  it("toda pergunta opcional vem ANTES da última obrigatória da fila", () => {
    const ids = TODAS_AS_PERGUNTAS.map((q) => q.id);
    const opcionais = ids.filter((id) => QIDS_OPCIONAIS.has(id));
    const obrigatorias = ids.filter((id) => !QIDS_OPCIONAIS.has(id));
    const ultimaObrigatoria = ids.lastIndexOf(obrigatorias[obrigatorias.length - 1]!);

    const depoisDoPortao = opcionais.filter((id) => ids.indexOf(id) > ultimaObrigatoria);

    // `deadline` é a exceção HISTÓRICA e declarada: começar em julho ou agosto
    // não muda o preço que o cliente lê, e travar o envio por isso seria perder
    // o lead por nada. Ela é a única que a casa aceita perder.
    expect(
      depoisDoPortao.filter((id) => id !== "deadline"),
      "pergunta opcional depois da última obrigatória: ela vai ser feita com o "
        + "portão JÁ aberto, o cliente com o botão de enviar na mão, e NINGUÉM vai "
        + "responder. Mova-a para antes da última obrigatória — ou torne-a "
        + "obrigatória, se a resposta for indispensável. Já aconteceu duas vezes "
        + "(budget_range em 23/08, operacao_basica em 24/08).",
    ).toEqual([]);
  });
});
