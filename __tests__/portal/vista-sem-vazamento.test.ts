// ── O TESTE QUE TRAVA A FRONTEIRA DO PORTAL ─────────────────────────────────
//
// Regra 4 do despacho de 14/08/2026:
//
//   > O cliente NÃO vê custo interno, margem, prompt, log, tarefa interna nem a
//   > coordenação entre departamentos. Isso não é só esconder na tela: **o dado
//   > não pode sair do servidor**. Monte a vista por allowlist campo a campo e
//   > escreva teste que reprove vazamento apontando o caminho do campo.
//
// É o que este arquivo faz. Ele NÃO confere se a tela esconde: ele envenena os
// registros crus com tudo que é interno e exige que a vista montada saia limpa
// — e, quando não sai, aponta **o caminho exato** (`entregas[0].custoInterno`),
// porque alerta que diz "algo vazou" sem o caso concreto é ruído que ninguém
// investiga (guardrail 6 do CLAUDE.md).
//
// Por que envenenar em vez de listar campos permitidos: o `select` do Prisma
// muda, o schema ganha coluna, alguém acrescenta um `include` por conveniência.
// O teste que passa a mão no objeto INTEIRO é o único que continua valendo
// depois dessas três coisas.

import { describe, expect, it } from "vitest";
import { montarVistaDoCliente, type BrutosDoPortal } from "@/lib/agency/portal/vista-do-cliente";

/** Chaves que jamais podem aparecer na vista, por NOME. */
const NOMES_PROIBIDOS = [
  /custo/i, /cost/i, /margem/i, /margin/i, /lucro/i,
  /prompt/i, /\blog\b/i, /logs/i, /agent/i, /agente/i,
  /interno/i, /internal/i, /tarefa/i, /task/i,
  /token/i, /apikey/i, /secret/i, /senha/i, /password/i,
  /rawcontext/i, /sdrhandoff/i, /proposalpricing/i, /executionerror/i,
  /revisionhistory/i, /content$/i, /coordena/i, /fila/i,
];

/** Valores plantados nos registros crus. Se um deles reaparece, vazou. */
const VALORES_ENVENENADOS = [
  "CUSTO-INTERNO-4821",
  "MARGEM-63-PORCENTO",
  "PROMPT-DO-AGENTE-SECRETO",
  "LOG-DA-EXECUCAO-QUE-FALHOU",
  "TAREFA-INTERNA-DO-DESIGNER",
  "act_9988776655",
  "EAAG-token-da-meta",
  "a-coordenacao-entre-social-e-design",
];

/** Anda no objeto inteiro e devolve o CAMINHO de cada violação encontrada. */
function violacoes(valor: unknown, caminho = "vista"): string[] {
  const achados: string[] = [];

  if (typeof valor === "string") {
    for (const veneno of VALORES_ENVENENADOS) {
      if (valor.includes(veneno)) achados.push(`${caminho} → valor interno vazou: "${veneno}"`);
    }
    return achados;
  }
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => achados.push(...violacoes(v, `${caminho}[${i}]`)));
    return achados;
  }
  if (valor && typeof valor === "object") {
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      const aqui = `${caminho}.${chave}`;
      for (const padrao of NOMES_PROIBIDOS) {
        if (padrao.test(chave)) achados.push(`${aqui} → campo interno exposto (casou ${padrao})`);
      }
      achados.push(...violacoes(v, aqui));
    }
  }
  return achados;
}

/** Registros crus como o banco os entrega — MAIS tudo que nunca pode sair. */
function brutosEnvenenados(): BrutosDoPortal {
  return {
    cliente: {
      id: "cli_1", name: "Foocci", industry: "FoodTech", email: "dono@foocci.com.br",
      phone: "11999998888", website: "https://foocci.com.br", createdAt: new Date("2026-08-01"),
      // ↓ o que o portal jamais pode devolver
      portalToken: "EAAG-token-da-meta",
      custoMensalInterno: "CUSTO-INTERNO-4821",
      margemDoContrato: "MARGEM-63-PORCENTO",
      notasInternas: "a-coordenacao-entre-social-e-design",
    },
    projetos: [
      { id: "prj_1", name: "Campanha de lançamento", agents: '["designer","social"]',
        executionError: "LOG-DA-EXECUCAO-QUE-FALHOU", proposalPricing: "CUSTO-INTERNO-4821" },
    ],
    entregas: [
      {
        id: "dlv_1", name: "Kit de campanha", type: "design", status: "approved",
        revisionStatus: null, version: 3, updatedAt: new Date("2026-08-12"),
        visibility: "compartilhado", projetoNome: "Campanha de lançamento",
        // ↓ tudo isto vem junto do registro e nada pode sair
        content: "PROMPT-DO-AGENTE-SECRETO",
        ownerAgentId: "agent_design_01",
        revisionHistory: '["TAREFA-INTERNA-DO-DESIGNER"]',
        custoDeProducao: "CUSTO-INTERNO-4821",
      },
      {
        // Entrega INTERNA — nem o nome dela pode aparecer.
        id: "dlv_interna", name: "Rascunho interno de precificação", type: "estrategia",
        status: "draft", version: 1, updatedAt: new Date("2026-08-13"),
        visibility: "interno", content: "MARGEM-63-PORCENTO",
      },
    ],
    posts: [
      { id: "post_1", status: "published", visibility: "compartilhado", scenesJson: "TAREFA-INTERNA-DO-DESIGNER" },
      { id: "post_2", status: "scheduled", visibility: "compartilhado" },
      { id: "post_interno", status: "draft", visibility: "interno" },
    ],
    campanhas: [
      {
        id: "cmp_1", name: "Donos de restaurante", objective: "Novos contatos",
        audience: "Donos de restaurante em SP", approvedCapBRL: 900, dailyBudgetBRL: 30, status: "active",
        // ↓ chaves da conta de anúncio e o freio interno
        adAccountId: "act_9988776655", connectionId: "conn_1", externalId: "1203948",
        pausedReason: "LOG-DA-EXECUCAO-QUE-FALHOU", lastError: "LOG-DA-EXECUCAO-QUE-FALHOU",
        custoDaAgencia: "CUSTO-INTERNO-4821",
      },
    ],
    servicos: ["Social Media", "Tráfego Pago"],
    marca: {
      respondidas: 4,
      total: 9,
      perguntas: [{ campo: "voz", pergunta: "Como vocês falam?", rotulo: "Voz" }],
      campos: [
        { rotulo: "Voz", estado: "definido", valor: "PROMPT-DO-AGENTE-SECRETO" },
        { rotulo: "Proibições", estado: "lacuna", valor: "" },
      ],
    },
  };
}

describe("a vista do cliente não deixa dado interno sair do servidor", () => {
  // ── O detector é testado ANTES de testar com ele ──────────────────────────
  // Teste verde por causa de um detector cego é pior que nenhum teste: ele
  // certifica o que não olhou. Guardrail 2 do CLAUDE.md — sem portão =
  // reprovado, e portão que não sabe reprovar não é portão.
  it("o próprio detector pega vazamento, e diz o caminho", () => {
    const achados = violacoes({ entregas: [{ nome: "ok", custoInterno: 480 }] });
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.every((a) => a.startsWith("vista.entregas[0].custoInterno"))).toBe(true);
    // Nada limpo é reprovado por acidente.
    expect(violacoes({ entregas: [{ nome: "Kit de campanha", versao: 3 }] })).toEqual([]);

    const porValor = violacoes({ conta: { observacao: "veio com CUSTO-INTERNO-4821 dentro" } });
    expect(porValor[0]).toContain("vista.conta.observacao");
    expect(porValor[0]).toContain("CUSTO-INTERNO-4821");
  });

  it("não expõe nenhum campo nem valor interno — e diria ONDE, se expusesse", () => {
    const vista = montarVistaDoCliente(brutosEnvenenados());
    const achados = violacoes(vista);
    expect(achados, `Vazamento na vista do portal:\n  ${achados.join("\n  ")}`).toEqual([]);
  });

  it("entrega marcada como INTERNA não sai — nem o nome dela", () => {
    const vista = montarVistaDoCliente(brutosEnvenenados());
    expect(vista.entregas.map((e) => e.id)).toEqual(["dlv_1"]);
    expect(JSON.stringify(vista)).not.toContain("Rascunho interno");
  });

  it("fail-closed: entrega SEM carimbo de visibilidade também não sai", () => {
    // O padrão do Hub é fechado de propósito — o que a rota esquecer de marcar
    // não pode vazar por omissão. Registro antigo, migration incompleta ou
    // `select` que esqueceu a coluna caem todos aqui.
    const brutos = brutosEnvenenados();
    brutos.entregas = [{ id: "dlv_sem_carimbo", name: "Peça sem carimbo", status: "approved", version: 1 }];
    const vista = montarVistaDoCliente(brutos);
    expect(vista.entregas).toEqual([]);
  });

  it("o valor das respostas de marca não trafega — só o rótulo e o estado", () => {
    const vista = montarVistaDoCliente(brutosEnvenenados());
    expect(vista.brandHub.definicoes).toEqual([
      { rotulo: "Voz", definido: true },
      { rotulo: "Proibições", definido: false },
    ]);
  });

  it("a leitura por departamento conta o trabalho, nunca a coordenação entre áreas", () => {
    const vista = montarVistaDoCliente(brutosEnvenenados());
    const chaves = vista.departamentos.map((d) => d.chave);
    expect(chaves).toEqual(["social", "trafego", "branding", "design", "pm"]);
    // Post interno não entra na conta que o cliente lê.
    const social = vista.departamentos.find((d) => d.chave === "social");
    expect(social?.situacao).toBe("1 publicação no ar e 1 programada.");
  });

  it("registro vazio não vira número inventado — vira estado vazio honesto", () => {
    const vista = montarVistaDoCliente({
      cliente: { name: "Bar do Zé" },
      projetos: [], entregas: [], posts: [], campanhas: [], servicos: [], marca: null,
    });
    expect(vista.entregas).toEqual([]);
    expect(vista.campanhas).toEqual([]);
    expect(vista.brandHub.percentual).toBe(0);
    expect(vista.departamentos.find((d) => d.chave === "social")?.ativo).toBe(false);
    expect(vista.departamentos.find((d) => d.chave === "design")?.situacao).toBe("Nenhuma peça entregue ainda.");
    // O símbolo do cabeçalho continua existindo — quadrado em branco é tela quebrada.
    expect(vista.marca.simbolo).toBe("B");
  });
});
