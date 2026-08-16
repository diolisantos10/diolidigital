// 🔴 A FILA NÃO ENTOPE — o defeito mais grave que esta frente teve.
//
// Achado G-2 do `seguranca` na PR #166. A primeira versão buscava
// `take: MAX_POR_RODADA` com `status: "new"`, `createdAt asc`, e a RECUSA NÃO
// MUDAVA O STATUS. Os dois leads mais antigos e irrecusáveis (o Sushi Cazza,
// 51 dias sem canal, e outro igual) ocupavam os DOIS lugares de TODA passada,
// para sempre. **Nenhum briefing novo chegava ao motor — inclusive o CityJobs,
// que era o teste de aceite inteiro.**
//
// O aceite anterior passou porque foi rodado contra base ZERADA, com
// exatamente as duas linhas do roteiro. **A metade que faltou foi a do caso
// limpo — "o novo passa mesmo com velhos na frente" — e é sempre essa metade
// que falta.** Este arquivo existe para que ela nunca mais falte.

import { describe, it, expect, vi } from "vitest";
import {
  varrerAPorta, MAX_POR_RODADA, JANELA_DE_CANDIDATOS, resumoDoPacote,
  type DependenciasDaVarredura, type SolicitacaoNaPorta,
} from "@/lib/agency/esteira-assistida/varredura";
import { FLAGS_V2, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

const AGORA = new Date("2026-08-16T12:00:00Z");
const AGENCIA = "ws_dioli";

function lead(over: Partial<SolicitacaoNaPorta> = {}): SolicitacaoNaPorta {
  return {
    id: "req", workspaceId: AGENCIA, clientId: null, businessName: "Negócio",
    rawContext: "quero social media", status: "new",
    createdAt: new Date("2026-08-16T01:00:00Z"),
    temComoFalar: true, porQueNaoDaParaFalar: null,
    ...over,
  };
}

/** Os dois velhos irrecusáveis, exatamente como estão na fila real. */
const VELHOS = [
  lead({ id: "velho1", businessName: "Sushi Cazza", temComoFalar: false, porQueNaoDaParaFalar: "sem canal", createdAt: new Date("2026-06-18T12:00:00Z") }),
  lead({ id: "velho2", businessName: "Beatriz Gimenes", temComoFalar: false, porQueNaoDaParaFalar: "sem canal", createdAt: new Date("2026-07-11T12:00:00Z") }),
];

function montar(fila: SolicitacaoNaPorta[], flags: LinhaDeFlag[] = [{ chave: FLAGS_V2.execucao, escopo: AGENCIA, ligada: true }]) {
  const rodados: string[] = [];
  const deps: DependenciasDaVarredura = {
    // O dublê respeita o `take` que a varredura pedir — é o comportamento do
    // Prisma, e é justamente aí que morava o defeito.
    solicitacoesNaPorta: vi.fn(async (limite: number) => fila.slice(0, limite)),
    resolverCliente: async (s) => ({ id: `cli_${s.id}`, workspaceId: AGENCIA, name: s.businessName }),
    flags: { async buscar(chave, escopos) { return flags.filter((f) => f.chave === chave && escopos.includes(f.escopo)); } },
    recusaRecente: async () => false,
    registrarRecusa: async () => undefined,
    jaFeitos: async () => ({}),
    reservar: async () => true,
    marcarStatus: async () => undefined,
    rodarCiclo: vi.fn(async (p) => {
      rodados.push(p.nomeDoCliente);
      return { ok: true, passos: [{ funcaoId: "pm-orchestrator", departamentoId: "pm", decisao: "executado" as const, custoUsd: 0.01, duracaoMs: 1 }], artefatos: {}, custoTotalUsd: 0.01 };
    }),
    abrirAprovacao: async () => ({ id: "ap" }),
    agora: () => AGORA,
  };
  return { deps, rodados };
}

describe("✅ A METADE QUE FALTOU: o briefing NOVO passa com velhos na frente", () => {
  it("dois recusados velhos + um novo → o NOVO é processado", async () => {
    const novo = lead({ id: "cityjobs", businessName: "CityJobs", createdAt: new Date("2026-08-16T01:12:00Z") });
    const { deps, rodados } = montar([...VELHOS, novo]);
    const r = await varrerAPorta(deps);

    expect(rodados).toContain("CityJobs"); // ⬅️ era exatamente isto que NUNCA acontecia
    expect(r.andaram).toBe(1);
    expect(r.recusadas).toBe(2);
  });

  it("QUARENTA recusados velhos + um novo no fim → o novo ainda passa", async () => {
    const muitos = Array.from({ length: 40 }, (_, i) =>
      lead({ id: `v${i}`, businessName: `Velho ${i}`, temComoFalar: false, porQueNaoDaParaFalar: "sem canal",
             createdAt: new Date(`2026-06-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`) }),
    );
    const novo = lead({ id: "cityjobs", businessName: "CityJobs", createdAt: new Date("2026-08-16T01:12:00Z") });
    const { deps, rodados } = montar([...muitos, novo]);
    await varrerAPorta(deps);
    expect(rodados).toEqual(["CityJobs"]);
  });

  it("a passada EXAMINA muito mais do que GASTA — os dois tetos são diferentes", async () => {
    const { deps } = montar([lead()]);
    await varrerAPorta(deps);
    expect(deps.solicitacoesNaPorta).toHaveBeenCalledWith(JANELA_DE_CANDIDATOS);
    expect(JANELA_DE_CANDIDATOS).toBeGreaterThan(MAX_POR_RODADA * 10);
  });
});

describe("⛔ A OUTRA METADE: o teto de GASTO continua real", () => {
  it("cem briefings bons não viram cem cadeias — para no teto", async () => {
    const bons = Array.from({ length: 100 }, (_, i) => lead({ id: `b${i}`, businessName: `Bom ${i}` }));
    const { deps, rodados } = montar(bons);
    const r = await varrerAPorta(deps);
    expect(rodados).toHaveLength(MAX_POR_RODADA);
    expect(r.andaram).toBe(MAX_POR_RODADA);
  });

  it("recusa NÃO consome cota de gasto — é de graça, então não tira o lugar de ninguém", async () => {
    const bons = Array.from({ length: 5 }, (_, i) => lead({ id: `b${i}`, businessName: `Bom ${i}` }));
    const { deps, rodados } = montar([...VELHOS, ...bons]);
    await varrerAPorta(deps);
    expect(rodados).toHaveLength(MAX_POR_RODADA); // os 2 primeiros BONS, não os velhos
    expect(rodados).toEqual(["Bom 0", "Bom 1"]);
  });
});

describe("🔴 B-1 — o resumo do pacote não carrega DINHEIRO nem ID interno", () => {
  const resumo = resumoDoPacote([
    { departamentoId: "project-management" },
    { departamentoId: "branding" },
    { departamentoId: "branding" },
  ]);

  it("nenhum cifrão, nenhum número com centavos", () => {
    expect(resumo).not.toContain("$");
    expect(resumo).not.toMatch(/\d+[.,]\d{2,}/);
  });

  it("nenhum funcaoId nem correlationId", () => {
    for (const proibido of ["pm-orchestrator", "brand-architect", "assistido:", "porta:", "correlationId"]) {
      expect(resumo).not.toContain(proibido);
    }
  });

  it("e ainda diz o que o leitor precisa saber", () => {
    expect(resumo).toContain("3 etapa");
    expect(resumo).toMatch(/AGÊNCIA/);
  });
});
