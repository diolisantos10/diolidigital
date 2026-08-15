// FICHA PARA TODA FUNÇÃO — validação ESTRUTURAL, não busca de palavras.
//
// Exigência do CEO (revisão do PR #146): o teste valida o esquema da
// especificação operacional de cada uma das 62 fichas — campos presentes,
// tipos certos, valores dentro do vocabulário, golden set com os três tipos
// obrigatórios. Ficha que não parseia, reprova. Desde o piloto assistido
// (15/08/2026), o estado ligada/desligada é conferido contra a ALLOWLIST da
// decisão do CEO — nem uma função a mais, nem uma a menos.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEPARTAMENTOS_V2, FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

const RAIZ = path.join(process.cwd(), "agentes/linha");
const AUTONOMIAS = new Set(["A", "B", "C"]); // D não existe nesta casa: "executa e só escala exceção" é exatamente o que o desenho veta hoje
const TIPOS_DE_CASO = new Set(["normal", "recusa", "escalada"]);

// As ÚNICAS funções autorizadas a estar ligadas — decisão registrada do CEO
// (15/08/2026, piloto assistido): a cadeia mínima solicitação → PM → branding
// → social → design. Função fora desta lista com `ativa: true` reprova o CI;
// ampliar a lista é decisão do dono, nunca efeito de deploy.
export const LIGADAS_PELO_CEO = new Set([
  "pm-orchestrator",
  "brand-architect",
  "social-strategist",
  "editorial-planner",
  "copywriter",
  "graphic-designer",
]);

interface SpecOperacional {
  funcao: string;
  departamento: string;
  ativa: boolean;
  entradas_obrigatorias: string[];
  saida: { formato: string; esquema: string };
  ferramentas_permitidas: string[];
  ferramentas_proibidas: string[];
  dados_acessiveis: string[];
  dados_proibidos: string[];
  handoff: { recebe_de: string; entrega_para: string };
  sla_horas: number;
  timeout_min: number;
  retentativas: number;
  metrica_sucesso: string;
  golden_set: Array<{ tipo: string; entrada: string; aceitavel: string; inaceitavel: string }>;
  modelo: { recomendado: string; fallback: string };
  teto_custo_usd_execucao: number;
  autonomia: string;
  gatilhos_humanos: string[];
}

function specDaFicha(depId: string, funcaoId: string): SpecOperacional {
  const caminho = path.join(RAIZ, depId, `${funcaoId}.md`);
  expect(fs.existsSync(caminho), `função sem ficha: ${depId}/${funcaoId}`).toBe(true);
  const conteudo = fs.readFileSync(caminho, "utf8");
  const bloco = conteudo.match(/```json\n([\s\S]*?)\n```/);
  expect(bloco, `${funcaoId}: ficha sem bloco de especificação legível por máquina`).not.toBeNull();
  return JSON.parse(bloco![1]!) as SpecOperacional;
}

function listaPreenchida(valor: unknown, rotulo: string) {
  expect(Array.isArray(valor), rotulo).toBe(true);
  expect((valor as unknown[]).length, `${rotulo}: vazia`).toBeGreaterThan(0);
  for (const item of valor as unknown[]) {
    expect(typeof item, `${rotulo}: item não-texto`).toBe("string");
    expect((item as string).trim().length, `${rotulo}: item vazio`).toBeGreaterThan(3);
  }
}

describe("fichas da linha — especificação operacional das 62, validada campo a campo", () => {
  it("toda função do catálogo tem spec parseável, no departamento certo e no estado DECIDIDO pelo dono", () => {
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      expect(spec.funcao, f.id).toBe(f.id);
      expect(spec.departamento, f.id).toBe(f.departamentoId);
      expect(
        spec.ativa,
        LIGADAS_PELO_CEO.has(f.id)
          ? `${f.id}: faz parte da cadeia do piloto assistido e deveria estar ligada`
          : `${f.id}: só a cadeia do piloto assistido pode estar ligada — ligar é decisão registrada do dono`,
      ).toBe(LIGADAS_PELO_CEO.has(f.id));
    }
  });

  it("entradas, saída, ferramentas, dados e handoff — presentes e não-vazios em todas", () => {
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      listaPreenchida(spec.entradas_obrigatorias, `${f.id}: entradas_obrigatorias`);
      expect(spec.saida?.formato?.trim().length, `${f.id}: saida.formato`).toBeGreaterThan(2);
      expect(spec.saida?.esquema?.trim().length, `${f.id}: saida.esquema`).toBeGreaterThan(10);
      listaPreenchida(spec.ferramentas_permitidas, `${f.id}: ferramentas_permitidas`);
      listaPreenchida(spec.ferramentas_proibidas, `${f.id}: ferramentas_proibidas`);
      listaPreenchida(spec.dados_acessiveis, `${f.id}: dados_acessiveis`);
      listaPreenchida(spec.dados_proibidos, `${f.id}: dados_proibidos`);
      expect(spec.handoff?.recebe_de?.trim().length, `${f.id}: handoff.recebe_de`).toBeGreaterThan(2);
      expect(spec.handoff?.entrega_para?.trim().length, `${f.id}: handoff.entrega_para`).toBeGreaterThan(2);
    }
  });

  it("SLA, timeout, retentativas e teto de custo — números sãos em todas", () => {
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      expect(spec.sla_horas, `${f.id}: sla_horas`).toBeGreaterThan(0);
      expect(spec.sla_horas, `${f.id}: sla_horas absurdo`).toBeLessThanOrEqual(24 * 14);
      expect(spec.timeout_min, `${f.id}: timeout_min`).toBeGreaterThan(0);
      expect(spec.timeout_min, `${f.id}: timeout absurdo`).toBeLessThanOrEqual(120);
      expect(spec.retentativas, `${f.id}: retentativas`).toBeGreaterThanOrEqual(0);
      expect(spec.retentativas, `${f.id}: retentativas absurdas`).toBeLessThanOrEqual(5);
      expect(spec.teto_custo_usd_execucao, `${f.id}: teto de custo obrigatório`).toBeGreaterThan(0);
      expect(spec.teto_custo_usd_execucao, `${f.id}: teto acima do sancionado`).toBeLessThanOrEqual(1);
    }
  });

  it("métrica, modelo com fallback, autonomia e gatilhos humanos — em todas", () => {
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      expect(spec.metrica_sucesso?.trim().length, `${f.id}: metrica_sucesso`).toBeGreaterThan(10);
      expect(spec.modelo?.recomendado, `${f.id}: modelo.recomendado`).toContain("provider-registry");
      expect(spec.modelo?.fallback, `${f.id}: fallback tem que degradar, nunca derrubar`).toContain("rule-based");
      expect(AUTONOMIAS.has(spec.autonomia), `${f.id}: autonomia "${spec.autonomia}" fora de A|B|C`).toBe(true);
      listaPreenchida(spec.gatilhos_humanos, `${f.id}: gatilhos_humanos`);
    }
  });

  it("golden set — mínimo 3 casos cobrindo normal, recusa e escalada, completos", () => {
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      expect(spec.golden_set?.length ?? 0, `${f.id}: golden_set`).toBeGreaterThanOrEqual(3);
      const tipos = new Set(spec.golden_set.map((c) => c.tipo));
      for (const obrigatorio of TIPOS_DE_CASO) {
        expect(tipos.has(obrigatorio), `${f.id}: golden_set sem caso "${obrigatorio}"`).toBe(true);
      }
      for (const caso of spec.golden_set) {
        expect(TIPOS_DE_CASO.has(caso.tipo), `${f.id}: tipo de caso desconhecido "${caso.tipo}"`).toBe(true);
        expect(caso.entrada?.trim().length, `${f.id}/${caso.tipo}: entrada`).toBeGreaterThan(10);
        expect(caso.aceitavel?.trim().length, `${f.id}/${caso.tipo}: aceitavel`).toBeGreaterThan(10);
        expect(caso.inaceitavel?.trim().length, `${f.id}/${caso.tipo}: inaceitavel`).toBeGreaterThan(10);
      }
    }
  });

  it("handoffs referenciam funções reais, departamentos, cliente ou humanos — nada aponta pro vazio", () => {
    const alvosValidos = new Set<string>([
      ...FUNCOES_V2.map((f) => f.id),
      ...DEPARTAMENTOS_V2.map((d) => d.id),
    ]);
    const textosValidos = /cliente|humano|ceo|dono|diretoria|gp|pm|portal|plataforma|direção|direcao|estratégia|estrategia|briefing|fila|cadeia|monitoramento|fontes|relógio|relogio|cofre|varredura|volume|banco|canal|leitura|registro|busca|funil|aceite|bloqueio|encerramento|todas|produção|producao|internal_review|client_approval|direction_pending|measurement|especialista|apresentação|apresentacao|alerta|central|comercial|social|calendário|calendario|metrica|Analytics|campanha|catalogado|ciclo|dados|sistemas/i;
    for (const f of FUNCOES_V2) {
      const spec = specDaFicha(f.departamentoId, f.id);
      for (const alvo of [spec.handoff.recebe_de, spec.handoff.entrega_para]) {
        const conhecido =
          alvosValidos.has(alvo) ||
          [...alvosValidos].some((v) => alvo.includes(v)) ||
          textosValidos.test(alvo);
        expect(conhecido, `${f.id}: handoff aponta para o desconhecido "${alvo}"`).toBe(true);
      }
    }
  });

  it("não existe ficha órfã e todo departamento tem a ficha de blocos comuns", () => {
    const idsDoCatalogo = new Set(FUNCOES_V2.map((f) => `${f.departamentoId}/${f.id}`));
    for (const dep of fs.readdirSync(RAIZ)) {
      const depDir = path.join(RAIZ, dep);
      if (!fs.statSync(depDir).isDirectory()) continue;
      for (const arquivo of fs.readdirSync(depDir)) {
        if (arquivo === "_departamento.md" || !arquivo.endsWith(".md")) continue;
        const id = `${dep}/${arquivo.replace(/\.md$/, "")}`;
        expect(idsDoCatalogo.has(id), `ficha órfã: ${id}`).toBe(true);
      }
    }
    for (const d of DEPARTAMENTOS_V2) {
      expect(fs.existsSync(path.join(RAIZ, d.id, "_departamento.md")), `sem _departamento.md: ${d.id}`).toBe(true);
    }
  });
});
