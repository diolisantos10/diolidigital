import { describe, it, expect } from "vitest";

import { lerFase, trilhaMarcada, posicaoNaTrilha, TRILHA, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";

const VAZIO: RetratoDoProjeto = {
  propostaAceita: false,
  tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 },
  entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
  pedidosAbertos: 0,
};

function retrato(over: Partial<RetratoDoProjeto>): RetratoDoProjeto {
  return { ...VAZIO, ...over };
}

describe("a esteira anda na ordem certa", () => {
  it("projeto novo começa na sondagem", () => {
    expect(lerFase(VAZIO).fase).toBe("sondagem");
  });

  it("proposta enviada espera o cliente", () => {
    const f = lerFase(retrato({ statusDaSolicitacao: "quoted" }));
    expect(f.fase).toBe("orcamento");
    expect(f.responsavel).toBe("cliente");
    expect(f.semaforo).toBe("esperando");
  });

  it("aceitou → o PM desenha", () => {
    const f = lerFase(retrato({ propostaAceita: true }));
    expect(f.fase).toBe("desenho");
    expect(f.responsavel).toBe("pm");
  });

  it("desenhado → a direção vai para o cliente ANTES de produzir", () => {
    const f = lerFase(retrato({ propostaAceita: true, tarefas: { total: 4, entregues: 0, produzindo: 0, bloqueadas: 0 } }));
    expect(f.fase).toBe("direcao");
    expect(f.responsavel).toBe("cliente");
  });

  it("direção aprovada libera a produção", () => {
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-01", execucao: "running",
      tarefas: { total: 4, entregues: 1, produzindo: 2, bloqueadas: 0 },
    }));
    expect(f.fase).toBe("producao");
    expect(f.responsavel).toBe("agentes");
  });

  it("tudo entregue → revisão interna, e é o PM quem apresenta", () => {
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-01", execucao: "done",
      tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 4, emRevisao: 4, comRessalva: 0, aprovados: 0 },
    }));
    expect(f.fase).toBe("revisao_interna");
    expect(f.responsavel).toBe("pm");
  });

  it("apresentado → a bola é do cliente", () => {
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-01", apresentadoEm: "2026-08-10",
      tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
    }));
    expect(f.fase).toBe("aprovacao_cliente");
    expect(f.paraCliente.oQueEsperamosDeVoce).toMatch(/aprove/i);
  });

  it("aprovado → implementação", () => {
    const f = lerFase(retrato({
      propostaAceita: true, apresentadoEm: "2026-08-10", aprovadoPeloClienteEm: "2026-08-12",
      tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
    }));
    expect(f.fase).toBe("implementacao");
  });

  it("ciclo aberto ganha de tudo — é a rotina vitalícia", () => {
    const f = lerFase(retrato({ propostaAceita: true, aprovadoPeloClienteEm: "2026-08-12", cicloAberto: true }));
    expect(f.fase).toBe("ciclo");
  });
});

describe("o que trava aparece como travado", () => {
  it("pedido de material sem resposta trava e aponta o cliente", () => {
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-01", execucao: "running", pedidosAbertos: 2,
      tarefas: { total: 4, entregues: 1, produzindo: 1, bloqueadas: 2 },
    }));
    expect(f.fase).toBe("aguardando_cliente");
    expect(f.semaforo).toBe("travado");
    expect(f.responsavel).toBe("cliente");
    expect(f.paraCliente.oQueEsperamosDeVoce).toContain("2");
  });

  it("ressalva da qualidade trava a revisão interna", () => {
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-01", execucao: "done",
      tarefas: { total: 2, entregues: 2, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 2, emRevisao: 2, comRessalva: 1, aprovados: 0 },
    }));
    expect(f.semaforo).toBe("travado");
    expect(f.responsavel).toBe("qualidade");
  });

  it("execução com falha aparece travada para a equipe, sem assustar o cliente", () => {
    const f = lerFase(retrato({ propostaAceita: true, direcaoAprovadaEm: "2026-08-01", execucao: "failed" }));
    expect(f.semaforo).toBe("travado");
    expect(f.paraEquipe.agora).toMatch(/falhou/i);
    expect(f.paraCliente.agora).not.toMatch(/falh|erro/i);
  });
});

describe("as duas linguagens", () => {
  it("toda fase fala com a equipe E com o cliente", () => {
    const casos: RetratoDoProjeto[] = [
      VAZIO,
      retrato({ statusDaSolicitacao: "quoted" }),
      retrato({ statusDaSolicitacao: "negotiating" }),
      retrato({ propostaAceita: true }),
      retrato({ propostaAceita: true, tarefas: { total: 3, entregues: 0, produzindo: 0, bloqueadas: 0 } }),
      retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 3, entregues: 1, produzindo: 1, bloqueadas: 0 } }),
      retrato({ propostaAceita: true, direcaoAprovadaEm: "x", pedidosAbertos: 1 }),
      retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "done", tarefas: { total: 2, entregues: 2, produzindo: 0, bloqueadas: 0 }, entregaveis: { total: 2, emRevisao: 2, comRessalva: 0, aprovados: 0 } }),
      retrato({ propostaAceita: true, apresentadoEm: "x" }),
      retrato({ propostaAceita: true, aprovadoPeloClienteEm: "x" }),
      retrato({ cicloAberto: true }),
    ];
    for (const c of casos) {
      const f = lerFase(c);
      expect(f.paraEquipe.titulo.length).toBeGreaterThan(3);
      expect(f.paraEquipe.agora.length).toBeGreaterThan(15);
      expect(f.paraEquipe.proximoPasso.length).toBeGreaterThan(10);
      expect(f.paraCliente.titulo.length).toBeGreaterThan(3);
      expect(f.paraCliente.agora.length).toBeGreaterThan(15);
    }
  });

  it("o texto do cliente não usa jargão do sistema", () => {
    const proibido = /entregável|deliverable|canvas|briefingJson|executionStatus|agentId|departamento|API|endpoint/i;
    const casos = [
      VAZIO,
      retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 3, entregues: 1, produzindo: 1, bloqueadas: 0 } }),
      retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "done", tarefas: { total: 2, entregues: 2, produzindo: 0, bloqueadas: 0 }, entregaveis: { total: 2, emRevisao: 2, comRessalva: 0, aprovados: 0 } }),
    ];
    for (const c of casos) {
      const f = lerFase(c);
      expect(f.paraCliente.titulo).not.toMatch(proibido);
      expect(f.paraCliente.agora).not.toMatch(proibido);
      expect(f.paraCliente.oQueEsperamosDeVoce).not.toMatch(proibido);
    }
  });

  it("só pede algo ao cliente quando a bola é dele", () => {
    const daAgencia = lerFase(retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 3, entregues: 1, produzindo: 1, bloqueadas: 0 } }));
    expect(daAgencia.responsavel).not.toBe("cliente");
    expect(daAgencia.paraCliente.oQueEsperamosDeVoce).toBe("");

    const doCliente = lerFase(retrato({ propostaAceita: true, apresentadoEm: "x" }));
    expect(doCliente.responsavel).toBe("cliente");
    expect(doCliente.paraCliente.oQueEsperamosDeVoce.length).toBeGreaterThan(10);
  });
});

describe("a trilha desenhada", () => {
  it("marca passado, presente e futuro", () => {
    const t = trilhaMarcada("producao");
    expect(t.find((x) => x.fase === "desenho")?.estado).toBe("feito");
    expect(t.find((x) => x.fase === "producao")?.estado).toBe("atual");
    expect(t.find((x) => x.fase === "implementacao")?.estado).toBe("futuro");
  });

  it("exatamente uma etapa é a atual", () => {
    expect(trilhaMarcada("direcao").filter((x) => x.estado === "atual")).toHaveLength(1);
  });

  it("fases fora da trilha herdam a posição da etapa equivalente", () => {
    expect(posicaoNaTrilha("negociacao")).toBe(posicaoNaTrilha("orcamento"));
    expect(posicaoNaTrilha("aguardando_cliente")).toBe(posicaoNaTrilha("producao"));
  });

  it("o progresso cresce ao longo da esteira", () => {
    const inicio = lerFase(VAZIO).progresso;
    const meio   = lerFase(retrato({ propostaAceita: true, direcaoAprovadaEm: "x", execucao: "running", tarefas: { total: 2, entregues: 0, produzindo: 1, bloqueadas: 0 } })).progresso;
    const fim    = lerFase(retrato({ propostaAceita: true, aprovadoPeloClienteEm: "x" })).progresso;
    expect(inicio).toBeLessThan(meio);
    expect(meio).toBeLessThan(fim);
  });

  it("toda etapa da trilha tem nome curto nas duas linguagens", () => {
    for (const t of TRILHA) {
      expect(t.curto.length).toBeGreaterThan(2);
      expect(t.curtoCliente.length).toBeGreaterThan(2);
    }
  });
});

describe("a esteira não diz ao cliente que está publicando quando não está", () => {
  // Até 02/08/2026 todo cliente com ciclo aberto lia "Seu conteúdo está no ar" —
  // inclusive quem nunca conectou uma rede. Mentira por construção, e o cliente
  // não tinha como saber.
  const emCiclo = { propostaAceita: true, aprovadoPeloClienteEm: "2026-08-12", cicloAberto: true };

  it("sem rede conectada, o ciclo cobra a conexão em vez de fingir publicação", () => {
    const f = lerFase(retrato({ ...emCiclo, redesConectadas: false, postsPublicados: 0 }));
    expect(f.fase).toBe("ciclo");
    expect(f.responsavel).toBe("cliente");
    expect(f.paraCliente.agora).not.toMatch(/no ar/i);
    expect(f.paraCliente.oQueEsperamosDeVoce).toMatch(/Instagram/);
  });

  it("rede conectada mas nada publicado ainda → diz agendado, não 'no ar'", () => {
    const f = lerFase(retrato({ ...emCiclo, redesConectadas: true, postsPublicados: 0, postsAgendados: 8 }));
    expect(f.semaforo).toBe("andando");
    expect(f.paraCliente.agora).toMatch(/agendad/i);
    expect(f.paraCliente.agora).not.toMatch(/está no ar/i);
  });

  it("com post publicado, aí sim 'no ar' — e a equipe vê o número", () => {
    const f = lerFase(retrato({ ...emCiclo, redesConectadas: true, postsPublicados: 3, postsAgendados: 5 }));
    expect(f.paraCliente.agora).toMatch(/no ar/i);
    expect(f.paraEquipe.agora).toContain("3 post(s) no ar");
  });

  it("aprovado sem rede conectada: o último passo é do cliente, e ele é avisado", () => {
    const f = lerFase(retrato({ propostaAceita: true, aprovadoPeloClienteEm: "2026-08-12", redesConectadas: false }));
    expect(f.fase).toBe("implementacao");
    expect(f.responsavel).toBe("cliente");
    expect(f.paraCliente.oQueEsperamosDeVoce).toMatch(/Conecte/);
  });
});
