// CADA AGENTE SABE QUEM É E PARA ONDE VAI.
//
// As 69 fichas da V2 carregam `handoff.recebe_de`, `handoff.entrega_para`,
// `sla_horas`, `autonomia`, `gatilhos_humanos` e as listas de proibições. O
// motor lia tudo e DECIDIA com isso — mas o prompt mandava ao modelo só
// função, departamento, métrica, formato e para quem entrega.
//
// Por que isso não é detalhe de prompt: a trava dos gatilhos humanos no
// executor só dispara com `gatilhosDetectados` vindos do chamador. Um agente
// que não sabe quais são os gatilhos nunca declara nenhum — e a decisão que
// devia subir é executada por conta própria, em silêncio.

import { describe, it, expect } from "vitest";
import { fichaComoPrompt } from "@/lib/agency/esteira-assistida/adaptador-de-ia";
import { executarFuncao } from "@/lib/agency/execucao-v2/executor";
import type { SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

const FICHA: SpecOperacional = {
  funcao: "brand-architect",
  departamento: "branding",
  ativa: true,
  entradas_obrigatorias: ["briefing"],
  saida: { formato: "json", esquema: "{plataforma}" },
  ferramentas_permitidas: ["leitura"],
  ferramentas_proibidas: ["publicar_meta", "enviar_email"],
  dados_acessiveis: ["briefing"],
  dados_proibidos: ["dados bancários do cliente"],
  handoff: { recebe_de: "pm-orchestrator", entrega_para: "social-strategist" },
  sla_horas: 8,
  timeout_min: 5,
  retentativas: 1,
  metrica_sucesso: "plataforma de marca aprovada",
  golden_set: [],
  modelo: { recomendado: "a", fallback: "b" },
  teto_custo_usd_execucao: 0.5,
  autonomia: "C",
  gatilhos_humanos: ["promessa comercial ao cliente", "verba de mídia"],
};

describe("a ficha inteira chega ao agente EM EXECUÇÃO", () => {
  const prompt = fichaComoPrompt(FICHA);

  it("ele sabe QUEM É e de quem RECEBE — não só para quem entrega", () => {
    expect(prompt).toContain("brand-architect");
    expect(prompt).toContain("branding");
    expect(prompt).toContain("pm-orchestrator");   // recebe_de: era o que faltava
    expect(prompt).toContain("social-strategist"); // entrega_para
  });

  it("🔑 ele sabe QUANDO CHAMAR UM HUMANO — sem isso a trava do motor nunca dispara", () => {
    expect(prompt).toContain("promessa comercial ao cliente");
    expect(prompt).toContain("verba de mídia");
    expect(prompt).toMatch(/CHAME UM HUMANO/);
  });

  it("ele sabe o prazo, a autonomia e o que é proibido tocar", () => {
    expect(prompt).toContain("8 h");
    expect(prompt).toMatch(/Autonomia C/);
    expect(prompt).toContain("publicar_meta");
    expect(prompt).toContain("dados bancários do cliente");
  });

  it("a lei da casa viaja junto: ausência de informação não é informação", () => {
    expect(prompt).toMatch(/preciso confirmar/i);
    expect(prompt).toMatch(/nunca invente/i);
  });

  it("ficha sem gatilho e sem proibição não inventa linha vazia no prompt", () => {
    const limpo = fichaComoPrompt({ ...FICHA, gatilhos_humanos: [], ferramentas_proibidas: [], dados_proibidos: [] });
    expect(limpo).not.toMatch(/CHAME UM HUMANO/);
    expect(limpo).not.toMatch(/PROIBIDAS/);
    expect(limpo).toContain("pm-orchestrator"); // o resto continua lá
  });
});

describe("⛔ FUNÇÃO SEM FICHA CONTINUA NÃO RODANDO — fail-closed", () => {
  const perfil = { autoridade: "director", departamentos: [] } as PerfilOrganizacional;

  it("sem spec legível, não executa, não gasta, e a recusa fica registrada", async () => {
    const recusas: string[] = [];
    const r = await executarFuncao(
      "funcao-que-nao-existe",
      perfil,
      {
        modo: "producao", entradas: {}, ferramentasPrevistas: [],
        custoPrevistoUsd: 0, correlationId: "c1", escopos: ["ws"],
      },
      { ator: "ia" },
      {
        specDe: () => ({ ok: false, motivo: 'função "funcao-que-nao-existe" sem ficha — sem ficha não se executa' }),
        flagLigada: async () => true,
        gravarExecucao: async () => { throw new Error("não devia gravar execução"); },
        gravarRecusa: async (rec) => { recusas.push(rec.motivo); },
        realizar: async () => { throw new Error("não devia chamar IA"); },
        agora: () => new Date("2026-08-16T12:00:00Z"),
      },
    );
    expect(r.decisao).toBe("recusado");
    expect(recusas).toHaveLength(1);
    expect(recusas[0]).toMatch(/sem ficha/);
  });
});
