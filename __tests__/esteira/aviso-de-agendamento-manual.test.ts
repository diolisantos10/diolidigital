// A CASA DIZ QUE O AUTOMÁTICO AINDA NÃO EXISTE — 27/08/2026.
//
// Ordem do CEO: *"você vai avisar o cliente que por enquanto isso ainda não
// está disponível e que os agendamentos serão feitos de forma manual."*
//
// Guardrail 5 (nunca vender como pronto o que está em piloto) + a doutrina que
// já custou caro nesta casa: *coluna gravada não é cliente informado*.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const meta = vi.hoisted(() => ({ freioSolto: vi.fn() }));
vi.mock("@/lib/integrations/meta/trava-de-publicacao", () => meta);

const { avisoDeAgendamentoManual, publicacaoAutomaticaDisponivel, AVISO_DE_AGENDAMENTO_MANUAL } =
  await import("@/lib/agency/esteira/aviso-de-agendamento-manual");
const { textoDoOrcamento } = await import("@/lib/agency/esteira/orcamento-do-briefing");
const { montarVistaDoCliente } = await import("@/lib/agency/portal/vista-do-cliente");

beforeEach(() => meta.freioSolto.mockReset());
afterEach(() => vi.restoreAllMocks());

const ESTIMATIVA = { totalMin: 490, totalMax: 490, postsPerMonth: 20 } as never;

describe("o aviso existe enquanto o automático não existe", () => {
  it("com o canal PARADO, o aviso aparece", async () => {
    meta.freioSolto.mockResolvedValue(false);
    expect(await publicacaoAutomaticaDisponivel()).toBe(false);
    expect(await avisoDeAgendamentoManual()).toBe(AVISO_DE_AGENDAMENTO_MANUAL);
  });

  // ══════════════════════════════════════════════════════════════════════
  // A INSTRUÇÃO GÊMEA: quando a Meta liberar, o aviso SOME SOZINHO.
  // Texto fóssil dizendo que não temos algo que passamos a ter é mentira
  // com a data invertida — e ninguém se lembra de apagar texto que não dá erro.
  // ══════════════════════════════════════════════════════════════════════
  it("com o canal LIBERADO, o aviso desaparece sem ninguém tocar em nada", async () => {
    meta.freioSolto.mockResolvedValue(true);
    expect(await avisoDeAgendamentoManual()).toBeNull();
  });

  it("o aviso é derivado do canal, não de constante ligada à mão", async () => {
    // A prova de que não há um `AVISO_LIGADO = true` escondido: a MESMA função
    // devolve coisas diferentes quando só o estado do canal muda.
    meta.freioSolto.mockResolvedValue(false);
    const parado = await avisoDeAgendamentoManual();
    meta.freioSolto.mockResolvedValue(true);
    const liberado = await avisoDeAgendamentoManual();
    expect(parado).not.toBe(liberado);
    expect(meta.freioSolto).toHaveBeenCalledTimes(2);
  });
});

describe("o texto do aviso", () => {
  it("diz a verdade: o automático não está disponível e o agendamento é manual", () => {
    expect(AVISO_DE_AGENDAMENTO_MANUAL).toMatch(/não está\s+disponível/i);
    expect(AVISO_DE_AGENDAMENTO_MANUAL).toMatch(/manual/i);
  });

  it("diz QUEM faz — o cliente não fica sem o post, fica sem o automático", () => {
    expect(AVISO_DE_AGENDAMENTO_MANUAL).toMatch(/nossa equipe/i);
    expect(AVISO_DE_AGENDAMENTO_MANUAL).toMatch(/vai ao ar/i);
  });

  it("⛔ NÃO promete data — a liberação depende da Meta, que não é nossa", () => {
    expect(AVISO_DE_AGENDAMENTO_MANUAL).not.toMatch(/amanhã|hoje|semana|\bdias?\b|\d{1,2}\/\d{1,2}/i);
  });

  it("⛔ NÃO carrega direção interna nem jargão da casa", () => {
    for (const interno of [
      "App Review", "acesso avançado", "freio", "PUBLICACAO_ORGANICA",
      "token", "webhook", "Graph", "piloto",
    ]) {
      expect(AVISO_DE_AGENDAMENTO_MANUAL.toLowerCase()).not.toContain(interno.toLowerCase());
    }
  });
});

describe("o aviso aparece ONDE O CLIENTE OLHA", () => {
  it("na PROPOSTA, e ANTES do convite a aceitar", () => {
    const texto = textoDoOrcamento("Foocci", ESTIMATIVA, "https://portal/x", AVISO_DE_AGENDAMENTO_MANUAL);
    expect(texto).toContain(AVISO_DE_AGENDAMENTO_MANUAL);
    // Quem aceita tem de saber o que está comprando: o aviso vem antes do link.
    expect(texto.indexOf(AVISO_DE_AGENDAMENTO_MANUAL)).toBeLessThan(texto.indexOf("https://portal/x"));
  });

  it("some da proposta quando o canal está liberado", () => {
    const texto = textoDoOrcamento("Foocci", ESTIMATIVA, "https://portal/x", null);
    expect(texto).not.toContain("publicação automática");
  });

  it("no PORTAL, junto do resto que o cliente lê", () => {
    const vista = montarVistaDoCliente({
      cliente: { name: "Foocci" }, projetos: [], entregas: [], posts: [], campanhas: [],
      servicos: [], marca: null, avisoDeAgendamento: AVISO_DE_AGENDAMENTO_MANUAL,
    });
    expect(vista.avisoDeAgendamento).toBe(AVISO_DE_AGENDAMENTO_MANUAL);
  });

  it("some do portal quando o canal está liberado", () => {
    const vista = montarVistaDoCliente({
      cliente: { name: "Foocci" }, projetos: [], entregas: [], posts: [], campanhas: [],
      servicos: [], marca: null, avisoDeAgendamento: null,
    });
    expect(vista.avisoDeAgendamento).toBeNull();
  });

  it("a vista NÃO inventa aviso quando quem chama não passou o campo", () => {
    // Um default com texto aqui faria a vista mentir no dia em que o canal já
    // estivesse liberado e o chamador simplesmente não tivesse passado o campo.
    const vista = montarVistaDoCliente({
      cliente: { name: "Foocci" }, projetos: [], entregas: [], posts: [], campanhas: [],
      servicos: [], marca: null,
    });
    expect(vista.avisoDeAgendamento).toBeNull();
  });
});
