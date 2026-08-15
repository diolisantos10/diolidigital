// A ESTEIRA ASSISTIDA EM ENSAIO — a cadeia inteira, as travas do piloto e
// os aperfeiçoamentos da regra 8, provados antes de qualquer cliente real.
//
// Ordem do CEO (15/08/2026): allowlist por cliente, jamais global; cadeia
// solicitação → PM → branding → social → design; aprovação humana no fim.
// Aqui a cadeia roda com dublês (sem IA, sem banco) e cada trava é
// exercitada dos dois lados: o caso limpo passa, o caso plantado barra.

import { describe, it, expect } from "vitest";
import { CADEIA_ASSISTIDA, cadeiaConhecida, executarCicloAssistido, type DependenciasDoCiclo } from "@/lib/agency/esteira-assistida/cadeia";
import { rascunhoRuleBased } from "@/lib/agency/esteira-assistida/adaptador-de-ia";
import { virarChaveDoPiloto, type ArmazemDeChave } from "@/lib/agency/esteira-assistida/piloto";
import { specDaFuncao } from "@/lib/agency/catalogo-v2/specs";
import { executarFuncao, saidaEstruturalmenteValida, type DependenciasDoExecutor, type RegistroDeRecusa } from "@/lib/agency/execucao-v2/executor";
import type { RegistroDeExecucao } from "@/lib/agency/execucao-v2/registro";
import type { ArmazemDeHandoffs, LinhaDeHandoff } from "@/lib/agency/handoff-v2/handoff";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";

const CLIENTE = "cliente-cityjobs-sintetico";
const relogio = { agora: new Date("2026-08-15T21:00:00Z") };

function handoffsEmMemoria(): ArmazemDeHandoffs & { linhas: LinhaDeHandoff[] } {
  const linhas: LinhaDeHandoff[] = [];
  return {
    linhas,
    async criar(linha) {
      const id = `h-${linhas.length + 1}`;
      linhas.push({ ...linha, id } as LinhaDeHandoff);
      return { id };
    },
    async buscar(id) {
      return linhas.find((l) => l.id === id) ?? null;
    },
    async aceitar(id, responsavelRecebe, em) {
      const linha = linhas.find((l) => l.id === id)!;
      linha.status = "aceito";
      linha.responsavelRecebe = responsavelRecebe;
      linha.aceitoEm = em;
    },
  };
}

function depsDoCiclo(opcoes?: {
  flags?: Array<{ escopo: string; ligada: boolean }>;
  gravadas?: RegistroDeExecucao[];
  recusas?: RegistroDeRecusa[];
  falharFuncao?: string;
}): DependenciasDoCiclo & { handoffs: ReturnType<typeof handoffsEmMemoria> } {
  const flags = opcoes?.flags ?? [{ escopo: CLIENTE, ligada: true }];
  const handoffs = handoffsEmMemoria();
  return {
    executor: {
      async flagLigada(_chave, escopos) {
        for (const escopo of escopos) {
          const linha = flags.find((f) => f.escopo === escopo);
          if (linha) return linha.ligada;
        }
        return false;
      },
      async gravarExecucao(registro) {
        opcoes?.gravadas?.push(registro);
      },
      async gravarRecusa(recusa) {
        opcoes?.recusas?.push(recusa);
      },
      async realizar(spec, contexto) {
        if (spec.funcao === opcoes?.falharFuncao) throw new Error("falha plantada do provedor");
        return rascunhoRuleBased(spec, contexto, "ensaio com dublê");
      },
      agora: () => relogio.agora,
    },
    handoffs,
    perfil: PERFIL_DO_PAPEL.master,
    agora: () => relogio.agora,
  };
}

const PEDIDO = {
  clienteId: CLIENTE,
  solicitacao: "[SINTÉTICO] Lançamento do City Jobs: precisamos de estratégia e conteúdo de social media para a primeira semana.",
  nomeDoCliente: "City Jobs",
  correlationId: "assistido:ensaio:1",
};

describe("esteira assistida — a cadeia mínima do piloto", () => {
  it("a cadeia declarada existe no catálogo e são exatamente as 6 fichas ligadas", () => {
    expect(cadeiaConhecida()).toBe(true);
    for (const id of CADEIA_ASSISTIDA) {
      const spec = specDaFuncao(id);
      expect(spec.ok && spec.spec.ativa, `${id}: precisa estar ligada na ficha`).toBe(true);
    }
  });

  it("ciclo completo: 6 passos executados, handoffs criados E aceitos, custo somado, registro por cliente", async () => {
    const gravadas: RegistroDeExecucao[] = [];
    const deps = depsDoCiclo({ gravadas });
    const resultado = await executarCicloAssistido(PEDIDO, deps);
    expect(resultado.ok).toBe(true);
    expect(resultado.passos.map((p) => p.funcaoId)).toEqual([...CADEIA_ASSISTIDA]);
    expect(resultado.passos.every((p) => p.decisao === "executado")).toBe(true);
    expect(Object.keys(resultado.artefatos).length).toBe(6);
    // Handoffs: um por troca de departamento (PM→branding→social e social→design; dentro do social não há)
    expect(deps.handoffs.linhas.length).toBe(3);
    expect(deps.handoffs.linhas.every((h) => h.status === "aceito")).toBe(true);
    // Registro da regra 6: cliente + entradas em toda execução
    expect(gravadas.length).toBe(6);
    for (const g of gravadas) {
      expect(g.clienteId).toBe(CLIENTE);
      expect(Object.keys(g.entradas ?? {}).length).toBeGreaterThan(0);
      expect(g.correlationId).toBe(PEDIDO.correlationId);
    }
  });

  it("sem a flag no escopo do cliente, a cadeia PARA no primeiro passo — e a recusa fica auditada", async () => {
    const recusas: RegistroDeRecusa[] = [];
    const deps = depsDoCiclo({ flags: [{ escopo: "outro-cliente", ligada: true }], recusas });
    const resultado = await executarCicloAssistido(PEDIDO, deps);
    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.funcaoId).toBe("pm-orchestrator");
    expect(resultado.parouEm?.motivo).toContain("v2_execucao");
    expect(recusas.length).toBe(1);
    expect(recusas[0]!.clienteId).toBe(CLIENTE);
  });

  it("falha técnica persistente num passo escala e para a cadeia — não atropela", async () => {
    const deps = depsDoCiclo({ falharFuncao: "copywriter" });
    const resultado = await executarCicloAssistido(PEDIDO, deps);
    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.funcaoId).toBe("copywriter");
    expect(resultado.parouEm?.decisao).toBe("escalado");
    expect(resultado.parouEm?.motivo).toContain("falha técnica");
    // Os passos anteriores ficaram executados e handoff até o social aconteceu
    expect(resultado.passos.filter((p) => p.decisao === "executado").length).toBe(4);
  });
});

describe("a chave do piloto — allowlist por cliente, jamais global", () => {
  function armazem(): ArmazemDeChave & { viradas: string[] } {
    const viradas: string[] = [];
    return {
      viradas,
      async gravar(chave, escopo, ligada) {
        viradas.push(`${chave}:${escopo}:${ligada}`);
      },
    };
  }

  it("vira para um clientId específico com motivo e decisor", async () => {
    const a = armazem();
    const r = await virarChaveDoPiloto(
      { escopo: CLIENTE, motivo: "piloto City Jobs", decididoPor: "ceo", ligar: true },
      a,
    );
    expect(r.ok).toBe(true);
    expect(a.viradas).toEqual([`v2_execucao:${CLIENTE}:true`]);
  });

  it('recusa "global" e "*" em código — regra 3 da ativação', async () => {
    const a = armazem();
    for (const escopo of ["global", "GLOBAL", "*", " "]) {
      const r = await virarChaveDoPiloto({ escopo, motivo: "x longa", decididoPor: "y", ligar: true }, a);
      expect(r.ok, escopo).toBe(false);
    }
    expect(a.viradas.length).toBe(0);
  });

  it("recusa virada sem motivo ou sem decisor", async () => {
    const a = armazem();
    expect((await virarChaveDoPiloto({ escopo: CLIENTE, motivo: " ", decididoPor: "y", ligar: true }, a)).ok).toBe(false);
    expect((await virarChaveDoPiloto({ escopo: CLIENTE, motivo: "ok", decididoPor: "", ligar: true }, a)).ok).toBe(false);
  });
});

describe("aperfeiçoamentos da regra 8 no executor", () => {
  function depsBase(sobre?: Partial<DependenciasDoExecutor>): DependenciasDoExecutor {
    return {
      flagLigada: async () => true,
      gravarExecucao: async () => {},
      realizar: async (spec, ctx) => rascunhoRuleBased(spec, ctx, "ensaio"),
      agora: () => relogio.agora,
      ...sobre,
    };
  }
  const contexto = (funcaoId: string) => {
    const spec = specDaFuncao(funcaoId);
    if (!spec.ok) throw new Error(spec.motivo);
    const entradas: Record<string, string> = {};
    for (const nome of spec.spec.entradas_obrigatorias) entradas[nome] = `[SINTÉTICO] conteúdo de ${nome}`;
    return {
      modo: "homologacao" as const,
      sintetico: true,
      entradas,
      ferramentasPrevistas: [spec.spec.ferramentas_permitidas[0]!],
      custoPrevistoUsd: 0.01,
      correlationId: "regra8:ensaio",
      escopos: [CLIENTE],
      clienteId: CLIENTE,
    };
  };

  it("timeout interrompível: trabalho que trava é abortado e, esgotadas as tentativas, escala", async () => {
    let abortos = 0;
    const deps = depsBase({
      timeoutMs: () => 30,
      realizar: (_spec, _ctx, sinal) =>
        new Promise((_resolve, reject) => {
          sinal?.addEventListener("abort", () => {
            abortos++;
            reject(new Error("abortado pelo sinal"));
          });
        }),
    });
    const r = await executarFuncao("copywriter", PERFIL_DO_PAPEL.master, contexto("copywriter"), { ator: "ia", modelo: "m", versaoModelo: "1" }, deps);
    expect(r.decisao).toBe("escalado");
    if (r.decisao === "escalado") expect(r.pacote.motivo).toContain("falha técnica");
    expect(abortos).toBeGreaterThan(0);
  });

  it("retentativas da ficha: falha transitória se recupera sem escalar", async () => {
    let chamadas = 0;
    const deps = depsBase({
      realizar: async (spec, ctx) => {
        chamadas++;
        if (chamadas === 1) throw new Error("falha transitória");
        return rascunhoRuleBased(spec, ctx, "recuperado");
      },
    });
    const r = await executarFuncao("copywriter", PERFIL_DO_PAPEL.master, contexto("copywriter"), { ator: "ia", modelo: "m", versaoModelo: "1" }, deps);
    expect(r.decisao).toBe("executado");
    expect(chamadas).toBe(2);
  });

  it("validação estrutural: saída vazia não passa; JSON exigido tem que parsear", () => {
    const spec = specDaFuncao("copywriter");
    expect(spec.ok).toBe(true);
    if (!spec.ok) return;
    expect(saidaEstruturalmenteValida(spec.spec, "").ok).toBe(false);
    expect(saidaEstruturalmenteValida(spec.spec, "curta").ok).toBe(false);
    const comJson = { ...spec.spec, saida: { formato: "JSON", esquema: spec.spec.saida.esquema } };
    expect(saidaEstruturalmenteValida(comJson, "isto não é json mas é longo o bastante").ok).toBe(false);
    expect(saidaEstruturalmenteValida(comJson, JSON.stringify({ ok: true, corpo: "longo o bastante aqui" })).ok).toBe(true);
  });

  it("saída estruturalmente inválida consome tentativas e termina escalada — não sobe lixo na esteira", async () => {
    const deps = depsBase({ realizar: async () => ({ saida: "", custoUsd: 0 }) });
    const r = await executarFuncao("copywriter", PERFIL_DO_PAPEL.master, contexto("copywriter"), { ator: "ia", modelo: "m", versaoModelo: "1" }, deps);
    expect(r.decisao).toBe("escalado");
    if (r.decisao === "escalado") expect(r.pacote.motivo).toContain("vazia");
  });
});
