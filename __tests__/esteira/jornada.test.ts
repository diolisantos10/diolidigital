import { describe, it, expect } from "vitest";

import { lerFase, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";

// A jornada inteira de um cliente, do primeiro contato até a rotina mensal.
//
// Este teste existe para provar a coisa que estava quebrada: que a esteira ANDA.
// Os testes de unidade garantem cada peça; este garante que, ligadas, elas levam
// o projeto do começo ao fim sem buraco no meio — sem etapa que não sabe para
// onde ir, sem estado em que ninguém tem a bola.

function passo(over: Partial<RetratoDoProjeto>): RetratoDoProjeto {
  return {
    propostaAceita: false,
    tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 },
    entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
    pedidosAbertos: 0,
    ...over,
  };
}

describe("a jornada completa — a Padaria do João", () => {
  it("caminha do primeiro contato até a rotina mensal, sem buraco", () => {
    const jornada: { quando: string; retrato: RetratoDoProjeto; fase: string; dono: string }[] = [
      {
        quando: "o João preenche o briefing no site",
        retrato: passo({}),
        fase: "sondagem", dono: "sdr",
      },
      {
        quando: "a agência manda o orçamento",
        retrato: passo({ statusDaSolicitacao: "quoted" }),
        fase: "orcamento", dono: "cliente",
      },
      {
        quando: "o João acha caro e pede ajuste",
        retrato: passo({ statusDaSolicitacao: "negotiating" }),
        fase: "negociacao", dono: "sdr",
      },
      {
        quando: "o João aceita",
        retrato: passo({ propostaAceita: true }),
        fase: "desenho", dono: "pm",
      },
      {
        quando: "o PM desenha as entregas e manda a direção",
        retrato: passo({ propostaAceita: true, tarefas: { total: 4, entregues: 0, produzindo: 0, bloqueadas: 0 } }),
        fase: "direcao", dono: "cliente",
      },
      {
        quando: "o João aprova a direção e a produção dispara",
        retrato: passo({
          propostaAceita: true, direcaoAprovadaEm: "2026-08-02", execucao: "running",
          tarefas: { total: 4, entregues: 0, produzindo: 2, bloqueadas: 0 },
        }),
        fase: "producao", dono: "agentes",
      },
      {
        quando: "o design trava porque falta o logo",
        retrato: passo({
          propostaAceita: true, direcaoAprovadaEm: "2026-08-02", execucao: "running", pedidosAbertos: 1,
          tarefas: { total: 4, entregues: 2, produzindo: 1, bloqueadas: 1 },
        }),
        fase: "aguardando_cliente", dono: "cliente",
      },
      {
        quando: "o logo chega e a produção termina",
        retrato: passo({
          propostaAceita: true, direcaoAprovadaEm: "2026-08-02", execucao: "done",
          tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
          entregaveis: { total: 4, emRevisao: 4, comRessalva: 0, aprovados: 0 },
        }),
        fase: "revisao_interna", dono: "pm",
      },
      {
        quando: "o PM apresenta tudo de uma vez",
        retrato: passo({
          propostaAceita: true, direcaoAprovadaEm: "2026-08-02", apresentadoEm: "2026-08-14",
          tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
          entregaveis: { total: 4, emRevisao: 4, comRessalva: 0, aprovados: 0 },
        }),
        fase: "aprovacao_cliente", dono: "cliente",
      },
      {
        quando: "o João aprova tudo",
        retrato: passo({
          propostaAceita: true, apresentadoEm: "2026-08-14", aprovadoPeloClienteEm: "2026-08-15",
          tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
        }),
        fase: "implementacao", dono: "agentes",
      },
      {
        quando: "abre o ciclo de agosto e a rotina começa",
        retrato: passo({ propostaAceita: true, aprovadoPeloClienteEm: "2026-08-15", cicloAberto: true }),
        fase: "ciclo", dono: "agentes",
      },
    ];

    for (const etapa of jornada) {
      const f = lerFase(etapa.retrato);
      expect(f.fase, `falhou em: ${etapa.quando}`).toBe(etapa.fase);
      expect(f.responsavel, `dono errado em: ${etapa.quando}`).toBe(etapa.dono);
      // Em NENHUM ponto da jornada o projeto pode ficar sem explicação.
      expect(f.paraEquipe.agora.length, `sem leitura da equipe em: ${etapa.quando}`).toBeGreaterThan(15);
      expect(f.paraCliente.agora.length, `sem leitura do cliente em: ${etapa.quando}`).toBeGreaterThan(15);
    }
  });

  it("o progresso nunca anda para trás ao longo da jornada", () => {
    const marcos = [
      passo({}),
      passo({ statusDaSolicitacao: "quoted" }),
      passo({ propostaAceita: true }),
      passo({ propostaAceita: true, tarefas: { total: 2, entregues: 0, produzindo: 0, bloqueadas: 0 } }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 2, entregues: 0, produzindo: 1, bloqueadas: 0 } }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "done", tarefas: { total: 2, entregues: 2, produzindo: 0, bloqueadas: 0 }, entregaveis: { total: 2, emRevisao: 2, comRessalva: 0, aprovados: 0 } }),
      passo({ propostaAceita: true, apresentadoEm: "x", tarefas: { total: 2, entregues: 2, produzindo: 0, bloqueadas: 0 } }),
      passo({ propostaAceita: true, aprovadoPeloClienteEm: "x" }),
    ];
    const progressos = marcos.map((m) => lerFase(m).progresso);
    for (let i = 1; i < progressos.length; i++) {
      expect(progressos[i]!, `regrediu no passo ${i}`).toBeGreaterThanOrEqual(progressos[i - 1]!);
    }
  });

  it("em toda etapa dá para dizer de quem é a vez — nunca fica sem dono", () => {
    const todos = [
      passo({}),
      passo({ statusDaSolicitacao: "quoted" }),
      passo({ statusDaSolicitacao: "negotiating" }),
      passo({ propostaAceita: true }),
      passo({ propostaAceita: true, tarefas: { total: 1, entregues: 0, produzindo: 0, bloqueadas: 0 } }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 1, entregues: 0, produzindo: 1, bloqueadas: 0 } }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", pedidosAbertos: 1 }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "failed" }),
      passo({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "done", tarefas: { total: 1, entregues: 1, produzindo: 0, bloqueadas: 0 }, entregaveis: { total: 1, emRevisao: 1, comRessalva: 1, aprovados: 0 } }),
      passo({ propostaAceita: true, apresentadoEm: "x" }),
      passo({ propostaAceita: true, aprovadoPeloClienteEm: "x" }),
      passo({ cicloAberto: true }),
    ];
    const donos = new Set(todos.map((t) => lerFase(t).responsavel));
    for (const t of todos) {
      expect(["sdr", "pm", "agentes", "cliente", "qualidade"]).toContain(lerFase(t).responsavel);
    }
    // E os cinco papéis são realmente usados — se um nunca aparece, é papel morto.
    expect(donos.size).toBe(5);
  });
});
