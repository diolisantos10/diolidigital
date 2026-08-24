import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { canSubmitProposal, getSubmissionBlockReason } from "@/lib/agency/sdr-agent";

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL ARREBENTADO NO ÚLTIMO PASSO — 16/08/2026, piloto ao vivo
//
// Percurso medido no Playwright, 8 turnos, escopo aparentemente completo. O SDR
// respondeu:
//
//     "Perfeito! Tenho todas as informações que preciso.
//      Confira o resumo do seu pedido e confirme."
//
// E **não havia o que confirmar**: o CTA de envio é travado por `canSubmit`, e
// `canSubmitProposal` continuava FALSO. A pessoa fez o briefing inteiro, leu uma
// ordem para confirmar, não teve botão, e saiu sem virar pedido.
//
// DUAS CABEÇAS RESPONDENDO À MESMA PERGUNTA — "a entrevista acabou?" — e
// discordando. A fala dizia sim; o portão dizia não.
//
// ── A CAUSA RAIZ, que a medição turno a turno revelou ────────────────────────
//
// Não era `remainingRequiredQuestions` (estava VAZIA desde o turno 6). Era o
// escopo: `wantsSocialMedia` continuava `false` depois de a pessoa ter dito que
// queria social media.
//
// Porque à pergunta "gestão de redes, tráfego ou identidade?" ela respondeu
// **"Somos de estética."** — que não nomeia serviço — e a pergunta foi marcada
// como RESPONDIDA assim mesmo ("perguntada = respondida"). No turno seguinte ela
// disse "quero social media", mas a pergunta da vez já era outra e a frase virou
// OBJETIVO. O serviço nunca foi gravado.
//
// ── O CONSERTO, e o que NÃO foi feito ────────────────────────────────────────
//
// O portão NÃO foi afrouxado. Afrouxar destravaria a tela trocando um funil
// quebrado por um PEDIDO INCOMPLETO chegando ao cliente — pior e mais caro.
//
// Duas travas, as duas pelo lado de quem estava errado:
//   1. `detect_service` só se fecha quando colhe serviço (a mesma regra que as
//      perguntas de identidade já tinham). Ausência de informação não é
//      informação.
//   2. A fala se subordina ao portão: com o portão fechado, o SDR NÃO anuncia o
//      fim — ele diz o que falta.
// ─────────────────────────────────────────────────────────────────────────────

const ANUNCIO_DE_FIM = /Tenho todas as informações que preciso/i;

/** Roda um roteiro e devolve o estado + a última fala do SDR. */
function conversar(falas: string[]) {
  let estado = initProspectConvState();
  const ditas: string[] = [];
  for (const fala of falas) {
    estado = processProspectMessage(fala, estado) as typeof estado;
    const msgs = (estado as unknown as { conv: { messages: { text: string }[] } }).conv.messages;
    ditas.push(msgs[msgs.length - 1]?.text ?? "");
  }
  const conv = (estado as unknown as { conv: never }).conv;
  const sdr = (estado as unknown as { sdr: never }).sdr;
  return {
    conv,
    sdr,
    ultimaFala: ditas[ditas.length - 1] ?? "",
    todasAsFalas: ditas,
    portaoAbre: canSubmitProposal(conv, sdr),
    bloqueio: getSubmissionBlockReason(conv, sdr),
  };
}

/** O percurso real do piloto, completo até o protocolo fechar. */
const PERCURSO_COMPLETO = [
  "Meu nome é Dioli Santos e meu negócio se chama Clínica Bela Face.",
  "Somos de estética.",
  "Quero social media: gestão de redes sociais no Instagram.",
  "Objetivo é atrair mais clientes novos.",
  "Público: mulheres de 25 a 45 anos em São Paulo.",
  "Quero que vocês criem e publiquem tudo.",
  "5 posts por semana.",
  "Sim, quero stories.",
  "Sim, quero reels.",
  "Não tenho fotos, preciso que vocês produzam.",
  "Sim, preciso que escrevam os textos.",
  "Não quero tráfego pago agora.",
  "Gosto do perfil da concorrente Clinica Derma.",
  // Os básicos operacionais (24/08/2026): a casa passou a perguntá-los ANTES
  // da verba, com o portão ainda fechado — pergunta opcional feita depois da
  // última obrigatória vira fala de despedida e ninguém responde. É o mesmo
  // defeito descrito logo abaixo, por outra porta.
  "Nosso Instagram é @clinicabelaface, atendemos de segunda a sábado das 9h às 19h, em São Paulo.",
  // Os básicos de MARCA (24/08/2026), mesma natureza e mesma posição: cor e
  // tipografia, tom, exemplo e quem aprova. O lastro de cada item está em
  // `esteira/causas-de-refacao.ts`, com arquivo e data da medição.
  "Nossas cores são rosa e branco, o logo está em PDF. Nunca fale de preço. Gosto do feed da Clinica Derma. Quem aprova sou eu.",
  "Budget de R$ 500 por mês.",
  // ── A RESPOSTA DA VERBA ENTROU EM 23/08/2026 ─────────────────────────────
  // Até aqui o percurso terminava com a pergunta da verba NO AR, sem resposta,
  // e o portão abria assim mesmo — `budget_range` era opcional. Era esse
  // afrouxamento que deixava a casa mandar R$ 4.500–7.700/mês a um cliente de
  // R$ 500/mês sem uma palavra sobre a diferença (cliente falso, 23/08).
  //
  // Com a verba travando o portão, um briefing que não responde quanto o
  // cliente pode investir NÃO está completo — e este percurso, que se chama
  // "completo", precisa responder. O teste não foi afrouxado: ele passou a
  // exigir do roteiro o que a casa agora exige do cliente.
  "Na gestão, uns R$ 500 por mês.",
];

describe("metade 1 — escopo completo: o portão abre e a fala combina", () => {
  const r = conversar(PERCURSO_COMPLETO);

  it("o portão ABRE — o briefing vira pedido enviável", () => {
    // Esta é a linha que separa "conversou" de "virou cliente". Antes do
    // conserto, este mesmo percurso terminava com o portão fechado.
    expect(r.portaoAbre).toBe(true);
    expect(r.bloqueio).toBeNull();
  });

  it("o serviço que a pessoa pediu chegou ao escopo", () => {
    // O campo que o portão exige, e que se perdia silenciosamente.
    expect((r.conv as unknown as { scope: { wantsSocialMedia?: boolean } }).scope.wantsSocialMedia).toBe(true);
  });

  it("nenhum anúncio de fim aconteceu enquanto o portão esteve fechado", () => {
    // A trava central: em NENHUM turno o SDR pode ter dito "tenho tudo" antes de
    // o portão abrir. Basta uma vez para o visitante ficar sem botão.
    let estado = initProspectConvState();
    for (const fala of PERCURSO_COMPLETO) {
      estado = processProspectMessage(fala, estado) as typeof estado;
      const conv = (estado as unknown as { conv: never }).conv;
      const sdr = (estado as unknown as { sdr: never }).sdr;
      const msgs = (conv as unknown as { messages: { text: string }[] }).messages;
      const disse = msgs[msgs.length - 1]?.text ?? "";
      if (ANUNCIO_DE_FIM.test(disse)) {
        expect(canSubmitProposal(conv, sdr), `anunciou fim em "${fala}" com o portão fechado`).toBe(true);
      }
    }
  });
});

describe("metade 2 — escopo incompleto: não anuncia fim, e diz o que falta", () => {
  // O caso exato do piloto: "Somos de estética" não nomeia serviço nenhum.
  const r = conversar([
    "Meu nome é Dioli Santos e meu negócio se chama Clínica Bela Face.",
    "Somos de estética.",
    "Objetivo é atrair mais clientes novos.",
  ]);

  it("o portão continua fechado — o pedido está mesmo incompleto", () => {
    // O portão NÃO foi afrouxado para destravar a tela: pedido sem serviço
    // declarado não pode virar proposta.
    expect(r.portaoAbre).toBe(false);
    expect(r.bloqueio).not.toBeNull();
  });

  it("o SDR NÃO anuncia que terminou", () => {
    for (const fala of r.todasAsFalas) expect(fala).not.toMatch(ANUNCIO_DE_FIM);
  });

  it("a pergunta do serviço volta em vez de sumir como respondida", () => {
    // "Somos de estética" não fecha `detect_service`. Repetir a pergunta é
    // barato; perder o lead no último passo, não.
    expect(r.todasAsFalas.join("\n")).toMatch(/redes sociais|tráfego|identidade visual/i);
  });

  it("beco sem saída em silêncio é o pior estado de uma tela", () => {
    // `getSubmissionBlockReason` já escrevia frase de gente — ela só não chegava
    // a ninguém. A pessoa precisa poder LER o que falta.
    expect(r.bloqueio).toMatch(/conte o que você precisa|ainda tenho algumas perguntas|me diga/i);
  });
});
