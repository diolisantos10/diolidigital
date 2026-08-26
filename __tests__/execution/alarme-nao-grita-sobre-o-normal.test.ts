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
const registrarBatida = vi.hoisted(() => vi.fn());
const destravarPacote = vi.hoisted(() => vi.fn());
const pacotesTravados = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));
vi.mock("@/lib/agency/esteira/pacote-travado", () => ({ destravarPacote, pacotesTravados }));
vi.mock("@/lib/agency/esteira/orcamento-do-briefing", () => ({ entregarOrcamentosPendentes }));
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

describe("o alarme dos PREÇOS — o oposto: anormal contínuo grita sempre", () => {
  it("enquanto houver DUAS tabelas de preço vivas, a casa grita — com dono e próxima ação", async () => {
    entregarOrcamentosPendentes.mockResolvedValue(rodada(0, 0));
    await baterORelogio();
    const precos = anotado().falhas.filter((f) => f.perna === "precos");
    expect(
      precos,
      "a esteira cota preços que não existem em /planos; quem decide qual tabela vale é o CEO",
    ).toHaveLength(1);
    expect(precos[0]!.erro).toMatch(/não existem na página pública \/planos/);
    expect(precos[0]!.erro).toMatch(/Dono: o CEO/);
    expect(precos[0]!.erro).toMatch(/Próxima ação:/);
  });
});
