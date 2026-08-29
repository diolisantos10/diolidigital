// A SEÇÃO "CONVERSAS QUE PARARAM NA SALA" (`/agency/leads`) — a fila do SDR
// que `GET /api/agency/conversas-sem-pedido` já devolvia e NENHUMA tela
// chamava (29/08/2026). Este teste prova que a segunda fonte chega à TELA,
// não só à função: busca pelo TEXTO renderizado, nunca pelo retorno de uma
// função isolada.
//
// As três garantias da ficha de despacho:
//   1. conversa com `prometidoEm` aparece, e a frase da promessa é lida;
//   2. conversa sem `prometidoEm` aparece SEM o destaque de promessa;
//   3. falha de leitura vira "não medido" na tela — NUNCA lista vazia.
//
// Renderiza `SecaoConversasParadas` DE VERDADE (`renderToStaticMarkup`), com
// cada estado passado por prop — mesmo modelo de
// `__tests__/agency/avisos-de-orcamento/tela.test.tsx` (`AvisosDeOrcamentoView`):
// a aparência mora numa função exportada que só recebe props, nunca chama
// `fetch`, e por isso é testável sem `useEffect`.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SecaoConversasParadas, type ConversaParada, type RespostaConversasParadas } from "@/app/agency/leads/page";

const NOOP = () => {};

function view(resposta: RespostaConversasParadas) {
  return renderToStaticMarkup(<SecaoConversasParadas resposta={resposta} onTentarDeNovo={NOOP} />);
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

const AGORA = new Date("2026-08-29T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * ⚠️ O RENDER ACONTECE DENTRO DO `it`, NUNCA NO CORPO DO `describe`.
 *
 * O corpo de um `describe` roda na COLETA, antes de qualquer `beforeEach` — e
 * portanto antes de `vi.setSystemTime`. Renderizar ali media "há quantos dias"
 * com o relógio REAL da máquina, e o teste passava ou falhava conforme a hora
 * do dia em que a suíte rodasse. Foi assim que este arquivo nasceu vermelho por
 * um dia de diferença: o defeito era do teste, não de `diasDesde` (que trunca,
 * e truncar está certo — "há 2 dias" nunca deve virar "há 3" antes da hora).
 */
const txtDe = (resposta: RespostaConversasParadas) => texto(view(resposta));

const CONVERSA_PROMETIDA: ConversaParada = {
  fio: "sdr:foocci",
  turnos: 5,
  paradaEm: "2026-08-27T12:00:00.000Z", // há 2 dias
  contato: { nome: "Foocci", whatsapp: "5511900000000" },
  escopo: { businessName: "Foocci", segment: "Restaurante", wantsSocialMedia: true },
  proximaAcao: "A casa PROMETEU contato e ainda não cumpriu — responder por WhatsApp é dívida, não sugestão.",
  prometidoEm: "2026-08-26T12:00:00.000Z", // há 3 dias
};

const CONVERSA_SEM_PROMESSA: ConversaParada = {
  fio: "sdr:curioso",
  turnos: 2,
  paradaEm: "2026-08-28T12:00:00.000Z", // há 1 dia
  contato: null,
  escopo: { businessName: "Loja X" },
  proximaAcao: "Sem contato nenhum. O rastro serve para medir quantas conversas morrem na sala, não para retomar esta.",
  prometidoEm: null,
};

const CONVERSA_SO_EMAIL: ConversaParada = {
  fio: "sdr:so-email",
  turnos: 3,
  paradaEm: "2026-08-28T12:00:00.000Z",
  contato: { nome: "Camila", email: "camila@example.com" },
  escopo: { businessName: "Camila Studio" },
  proximaAcao: "Retomar por e-mail.",
  prometidoEm: null,
};

const CONVERSA_OS_DOIS: ConversaParada = {
  fio: "sdr:os-dois",
  turnos: 4,
  paradaEm: "2026-08-28T12:00:00.000Z",
  contato: { nome: "Beatriz", whatsapp: "5511988887777", email: "beatriz@example.com" },
  escopo: { businessName: "Beatriz Co" },
  proximaAcao: "Retomar pelo canal que preferir.",
  prometidoEm: null,
};

describe("⚑ conversa com prometidoEm: o texto da promessa é LIDO pelo usuário", () => {
  const html = () => view({ estado: "ok", total: 1, conversas: [CONVERSA_PROMETIDA] });
  const txt = () => txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_PROMETIDA] });

  it("mostra quem é, o resumo do escopo e a próxima ação pronta da rota", () => {
    expect(txt()).toContain("Foocci");
    expect(txt()).toContain("Restaurante");
    expect(txt()).toContain("redes sociais");
    expect(txt()).toContain("responder por WhatsApp é dívida, não sugestão");
  });

  it("O CANAL QUE A TELA ESCONDIA: o número de WhatsApp aparece como texto puro, não só a palavra 'WhatsApp' do selo", () => {
    expect(txt()).toContain("WhatsApp: 5511900000000");
  });

  it("⛔ não vira link — sem href de mailto: nem de wa.me em nenhum lugar do HTML", () => {
    expect(html()).not.toContain("href=\"mailto:");
    expect(html()).not.toContain("wa.me");
    expect(html()).not.toContain("<a ");
  });

  it("mostra o destaque \"Prometemos contato há N dias\", com N calculado de prometidoEm", () => {
    expect(txt()).toContain("Prometemos contato há 3 dias");
  });

  it("mostra quantos turnos e há quantos dias a conversa parou, derivado de paradaEm", () => {
    expect(txt()).toContain("5 turnos");
    expect(txt()).toContain("parada há 2 dias");
  });

  it("⛔ NUNCA escreve \"vence\" nem \"atrasad\" — venceEm não existe e não se inventa prazo", () => {
    expect(txt().toLowerCase()).not.toContain("vence");
    expect(txt().toLowerCase()).not.toContain("atrasad");
  });

  it("tem a linha honesta sobre o SLA não ratificado no rodapé da seção", () => {
    expect(txt()).toContain("A casa ainda não ratificou em quantas horas responde");
  });
});

describe("uma conversa SEM prometidoEm aparece, mas sem o destaque de promessa", () => {
  const html = () => view({ estado: "ok", total: 1, conversas: [CONVERSA_SEM_PROMESSA] });
  const txt = () => txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_SEM_PROMESSA] });

  it("mostra a conversa (sem contato vem primeiro, em vermelho)", () => {
    expect(txt()).toContain("Sem como falar com esta pessoa");
    expect(txt()).toContain("Loja X");
    expect(txt()).toContain("2 turnos");
    expect(txt()).toContain("parada há 1 dia");
  });

  it("NÃO mostra nenhuma frase de promessa — o destaque não aparece sem prometidoEm", () => {
    expect(txt()).not.toContain("Prometemos contato");
    expect(txt()).not.toContain("⚑");
  });

  it("⛔ sem contato NÃO inventa WhatsApp nem e-mail nenhum", () => {
    expect(txt()).not.toContain("WhatsApp:");
    expect(txt()).not.toContain("E-mail:");
  });
});

describe("O CANAL QUE A TELA ESCONDIA (rodada 4): o valor do contato chega ao JSX, não só a palavra do selo", () => {
  it("cartão só com e-mail mostra o endereço como texto puro", () => {
    const txt = txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_SO_EMAIL] });
    expect(txt).toContain("E-mail: camila@example.com");
    expect(txt).not.toContain("WhatsApp:");
  });

  it("cartão com os dois canais mostra os dois valores", () => {
    const txt = txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_OS_DOIS] });
    expect(txt).toContain("WhatsApp: 5511988887777");
    expect(txt).toContain("E-mail: beatriz@example.com");
  });

  it("⛔ trava contra virar porta de disparo: nenhum href de mailto: nem link de wa.me, em nenhum estado", () => {
    const html = view({ estado: "ok", total: 3, conversas: [CONVERSA_PROMETIDA, CONVERSA_SO_EMAIL, CONVERSA_OS_DOIS] });
    expect(html).not.toContain("href=\"mailto:");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("onclick");
  });
});

describe("O SELO 'N com promessa de contato pendente' agora mora junto do <h2> desta seção", () => {
  it("aparece quando há promessa pendente na lista de baixo", () => {
    const txt = txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_PROMETIDA] });
    expect(txt).toContain("1 com promessa de contato pendente");
  });

  it("não aparece quando nenhuma conversa desta lista tem promessa pendente", () => {
    const txt = txtDe({ estado: "ok", total: 1, conversas: [CONVERSA_SEM_PROMESSA] });
    expect(txt).not.toContain("com promessa de contato pendente");
  });
});

describe("⛔ falha de leitura vira \"não medido\" — NUNCA lista vazia", () => {
  const html = () => view({ estado: "nao_medido", motivo: "o banco não respondeu agora" });
  const txt = () => txtDe({ estado: "nao_medido", motivo: "o banco não respondeu agora" });

  it("mostra a mensagem de falha, com o motivo exato devolvido pela rota", () => {
    expect(txt()).toContain("Não consegui ler esta fila");
    expect(txt()).toContain("o banco não respondeu agora");
  });

  it("tem `role=\"alert\"`", () => {
    expect(html()).toContain('role="alert"');
  });

  it("oferece \"Tentar de novo\"", () => {
    expect(txt()).toContain("Tentar de novo");
  });

  it("NUNCA mostra o texto do EmptyState — falha não é \"nenhuma conversa parada\"", () => {
    expect(txt()).not.toContain("Nenhuma conversa parada");
  });
});

describe("fila vazia de verdade (0 conversas) é o estado normal — EmptyState honesto", () => {
  const html = () => view({ estado: "ok", total: 0, conversas: [] });
  const txt = () => txtDe({ estado: "ok", total: 0, conversas: [] });

  it("mostra o EmptyState, não um alarme", () => {
    expect(txt()).toContain("Nenhuma conversa parada");
    expect(html()).not.toContain('role="alert"');
  });
});
