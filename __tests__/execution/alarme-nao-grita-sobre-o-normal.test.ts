// ALARME QUE GRITA SOBRE O NORMAL ENSINA A IGNORAR ALARME.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE FOI MEDIDO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// *"2 briefing(s) sem orçamento calculado — aguardando gente"* disparou **76
// vezes em 24h**. Para um comportamento CORRETO: dois briefings chegaram sem o
// dado que fecha a conta, a casa se recusou a inventar número, avisou o cliente
// do que falta, e ficou esperando gente. Nada estava quebrado.
//
// O custo não é a linha. É que a notícia REAL do dia seguinte chega na mesma
// caixa e recebe o desprezo já treinado.
//
// ── A REGRA QUE ESTE ARQUIVO PRENDE ────────────────────────────────────────
// **Alarme é sobre a TRANSIÇÃO; estado de pé é sobre o pulso.**
//   • `faltaAvisada` é a transição: `avisarQueFaltaInformacao` carimba
//     `faltaAvisadaEm` no `briefingJson` e nunca avisa duas vezes. Um briefing,
//     um alarme, para sempre — e a marca é a que já existia, não uma segunda
//     contagem de "já gritei" que divergiria da primeira;
//   • `semOrcamento` continua sendo dito toda rodada, por `estadoDe`, que é o
//     canal que esta casa já tinha para fato que é estado e não quebra.
//
// ⚠️ E o oposto continua valendo: a PORTA DE RESET denuncia a cada batida de
// propósito, porque lá o estado de pé é ANORMAL. A diferença é a natureza do
// estado, não a duração dele.
//
// ── A MUTAÇÃO QUE ESTE ARQUIVO PEGA ────────────────────────────────────────
// Reponha `if (r.semOrcamento > 0) quebrou("orcamento", …)` e o primeiro teste
// quebra. Troque `estadoDe` por nada e o segundo quebra.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { findMany: vi.fn(), update: vi.fn() } }));
const runProjectExecution = vi.hoisted(() => vi.fn());
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());
const entregarOrcamentosPendentes = vi.hoisted(() => vi.fn());
const responderMensagensDeClientes = vi.hoisted(() => vi.fn());
const registrarBatida = vi.hoisted(() => vi.fn());
const destravarPacote = vi.hoisted(() => vi.fn());
const pacotesTravados = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));
vi.mock("@/lib/agency/esteira/pacote-travado", () => ({ destravarPacote, pacotesTravados }));
vi.mock("@/lib/agency/esteira/orcamento-do-briefing", () => ({ entregarOrcamentosPendentes }));
vi.mock("@/lib/agency/esteira/pm-responde", () => ({ responderMensagensDeClientes }));
vi.mock("@/lib/agency/pulso", () => ({ registrarBatida }));

import { baterORelogio } from "@/lib/agency/despertador";

/** O estado da fila que a rodada devolve. Os DOIS briefings parados são o
 *  cenário medido; `faltaAvisada` é quantos foram avisados NESTA rodada. */
const rodada = (semOrcamento: number, faltaAvisada: number) => ({
  entregues: 0, avisados: 0, semCanal: 0, semOrcamento, faltaAvisada,
  avisosQueFalharam: [] as string[], falhas: [] as string[],
});

function anotado(): { falhas: Array<{ perna: string; erro: string }>; estados: Array<{ perna: string; texto: string }> } {
  const arg = registrarBatida.mock.calls.at(-1)?.[0] as
    { falhas?: Array<{ perna: string; erro: string }>; estados?: Array<{ perna: string; texto: string }> } | undefined;
  return { falhas: arg?.falhas ?? [], estados: arg?.estados ?? [] };
}

const alarmesDeOrcamento = () => anotado().falhas.filter((f) => f.perna === "orcamento");

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([]);
  db.project.update.mockResolvedValue({});
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: [], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
  pacotesTravados.mockResolvedValue([]);
  destravarPacote.mockResolvedValue({ projectId: "p1", corrigidas: [], persistentes: [], escalado: false });
  registrarBatida.mockResolvedValue(undefined);
  responderMensagensDeClientes.mockResolvedValue({ respondidas: 0, semIA: 0, novasSemIA: 0, falhas: [] });
});

describe("o alarme do orçamento", () => {
  it("🔴 dois briefings parados há dias NÃO alarmam — eles já foram avisados, e isso é o normal", async () => {
    // É a rodada 2 a 288 do dia: `faltaAvisada = 0` porque a marca já está no
    // `briefingJson` dos dois. Era ESTA a rodada que gritava, 76 vezes em 24h.
    entregarOrcamentosPendentes.mockResolvedValue(rodada(2, 0));
    await baterORelogio();
    expect(
      alarmesDeOrcamento(),
      "estado de pé e correto não é notícia — e alarme sobre o normal ensina a ignorar alarme",
    ).toEqual([]);
  });

  it("mas o estado NÃO some: ele continua dito toda rodada, no pulso", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(2, 0));
    await baterORelogio();
    const estado = anotado().estados.find((e) => e.perna === "orcamento");
    expect(estado, "calar o alarme não pode virar calar o fato").toBeTruthy();
    expect(estado!.texto).toContain("2 briefing(s) parados");
  });

  it("o briefing NOVO que entra no buraco alarma — uma vez, que é a transição", async () => {
    // É a primeira rodada em que ele aparece: `avisarQueFaltaInformacao`
    // carimbou `faltaAvisadaEm` agora, e nunca mais devolverá `true` para ele.
    entregarOrcamentosPendentes.mockResolvedValue(rodada(3, 1));
    await baterORelogio();
    const alarmes = alarmesDeOrcamento();
    expect(alarmes).toHaveLength(1);
    expect(alarmes[0]!.erro).toMatch(/1 briefing\(s\) NOVO\(s\) sem orçamento calculado/);
  });

  it("a falha de VERDADE continua alarmando — nada foi silenciado por atacado", async () => {
    entregarOrcamentosPendentes.mockResolvedValue({
      ...rodada(2, 0),
      avisosQueFalharam: ["cr9: o e-mail voltou"],
      falhas: ["cr7: transação falhou"],
    });
    await baterORelogio();
    const erros = alarmesDeOrcamento().map((f) => f.erro);
    expect(erros).toContain("cr9: o e-mail voltou");
    expect(erros).toContain("cr7: transação falhou");
  });
});

describe("o alarme dos PREÇOS — ele existe, e agora fica CALADO", () => {
  // ⚠️ ESTE TESTE MUDOU DE SINAL EM 26/08/2026, e a mudança é a notícia.
  //
  // Ele exigia que a casa gritasse a cada batida — e gritava com razão: a
  // esteira cotava 590/990/1790, preços que não existiam em `/planos`. O
  // alarme era o certo a fazer enquanto a decisão fosse do CEO.
  //
  // A decisão foi tomada (tabela única, `planos.ts`) e o conserto não foi
  // "concordar os números": `SOCIAL_PACKAGES` passou a ser DERIVADO da vitrine.
  // Não há mais dois números para divergir, então o alarme não tem mais o que
  // dizer — e **alarme calado por ausência de defeito é o desfecho certo**, ao
  // contrário de alarme calado por alguém tê-lo desligado.
  //
  // A trava de verdade mudou de lugar, como a ordem do CEO mandou: é código,
  // em `__tests__/comercial/a-tabela-e-uma-so.test.ts`, provada por mutação.
  // Este teste guarda a outra metade: que a PERNA continua no relógio, pronta
  // para gritar se alguém reintroduzir uma tabela paralela.
  it("com UMA tabela só, o alarme de preços não dispara", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(0, 0));
    await baterORelogio();
    const precos = anotado().falhas.filter((f) => f.perna === "precos");
    expect(
      precos,
      "nada divergiu, e mesmo assim o alarme de preço disparou — ou a perna quebrou, ou voltou uma segunda tabela",
    ).toHaveLength(0);
  });

  it("e a perna CONTINUA no relógio — a régua dela ainda pega a divergência", async () => {
    // A prova de que o silêncio acima é ausência de defeito, e não perna morta:
    // a mesma pergunta, feita sobre uma tabela inventada, ainda acusa.
    const { SOCIAL_PACKAGES } = await import("@/lib/agency/live-calculator");
    const { PLANOS } = await import("@/lib/agency/planos");
    const daVitrine = new Set(PLANOS.map((p) => p.preco));
    const inventada = [...SOCIAL_PACKAGES, { label: "Plano Fantasma", minPrice: 4990, maxPrice: 4990 }];
    const fora = inventada.filter((p) => !daVitrine.has(p.minPrice) || !daVitrine.has(p.maxPrice));
    expect(fora.map((p) => p.label)).toEqual(["Plano Fantasma"]);
  });
});

describe("a MESMA doença noutra perna: o PM (medida na mesma volta)", () => {
  // `/api/pulso` de 26/08/2026: *"5 mensagem(ns) sem resposta automática —
  // aguardando gente"* × **57 em 24h**. O despacho não tinha nomeado esta
  // perna; a jornada de cliente oculto a encontrou ao lado da outra. Mesma
  // causa, mesma regra: a mensagem fica `readByTeam: false` até uma pessoa
  // abrir a tela, e o relógio recontava a fila a cada 5 minutos.
  it("🔴 a fila parada NÃO alarma toda rodada", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(0, 0));
    responderMensagensDeClientes.mockResolvedValue({ respondidas: 0, semIA: 5, novasSemIA: 0, falhas: [] });
    await baterORelogio();
    expect(anotado().falhas.filter((f) => f.perna === "pm-responde")).toEqual([]);
  });

  it("mas o estado continua dito, no pulso", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(0, 0));
    responderMensagensDeClientes.mockResolvedValue({ respondidas: 0, semIA: 5, novasSemIA: 0, falhas: [] });
    await baterORelogio();
    const e = anotado().estados.find((x) => x.perna === "pm-responde");
    expect(e).toBeTruthy();
    expect(e!.texto).toContain("5 mensagem(ns) na fila");
  });

  it("a mensagem NOVA alarma — é a transição, e é ela que alguém precisa ver", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(0, 0));
    responderMensagensDeClientes.mockResolvedValue({ respondidas: 0, semIA: 5, novasSemIA: 2, falhas: [] });
    await baterORelogio();
    const a = anotado().falhas.filter((f) => f.perna === "pm-responde");
    expect(a).toHaveLength(1);
    expect(a[0]!.erro).toMatch(/2 mensagem\(ns\) NOVA\(s\)/);
  });
});
