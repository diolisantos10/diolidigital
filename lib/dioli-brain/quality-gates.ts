// Dioli Brain — O REGISTRO ÚNICO DOS PORTÕES DA CASA.
//
// ─── ONDA 0 DO P0 (06/08/2026): OS DOIS REGISTROS VIRARAM UM ─────────────────
//
// Até aqui existiam DOIS. Este arquivo, com 31 checagens que **nada** consultava
// (`getBlockingChecks` não tinha um único chamador; o import vinha de uma tela e
// de um teste), e a lista de 8 globais dentro de `quality-canvas.ts:145`, que é
// a que o avaliador realmente roda. Os ids DIVERGIAM:
//
//     este arquivo            o avaliador que roda
//     clear_client_value  →   client_value_clear
//     approval_need_checked → approval_verified
//     evidence_path_defined → evidence_path
//     (não existia)        →  projections_anchored
//
// Registro que ninguém consulta e cujos ids não batem com o do avaliador não é
// portão desligado: é um SEGUNDO DOCUMENTO se passando por código. Duas listas
// divergindo é a mesma doença da cópia de manual espalhada por repositório —
// atualiza-se uma, esquece-se a outra, e em três meses ninguém sabe qual vale.
//
// **A lista canônica passou a ser a do avaliador**, porque era a que rodava.
// Quem estava certo é quem barra alguma coisa; o resto era prosa.
// `quality-canvas.ts` agora DERIVA a dele daqui — não existe mais segunda lista.
//
// ─── A REGRA QUE O TIPO FAZ CUMPRIR ──────────────────────────────────────────
//
// Toda checagem declara EXATAMENTE UMA das duas coisas, e o TypeScript recusa
// quem não declarar nenhuma:
//
//   • `mecanismo` — onde o código que barra realmente roda, com caminho de
//     arquivo. Greppável, e conferido por teste: o arquivo tem que existir.
//   • `lacuna` — motivo, dono e prazo da ausência. Ausência de informação não é
//     informação: uma checagem sem mecanismo precisa DIZER que não tem.
//
// É isto que impede o defeito que a auditoria encontrou nas duas direções ao
// mesmo tempo: `quality_audit_impartial` estava CONSTRUÍDO e declarado
// `autoCheckable: false`; `pm_task_owner`/`pm_deadline` estavam declarados
// `true` e **não tinham leitor**. A flag mentia para os dois lados.
//
// ─── O QUE ESTA ONDA NÃO FAZ (de propósito) ──────────────────────────────────
//
// Não inverte o default. "Departamento sem gate executável = REPROVADO" para
// 8 de 8 departamentos no dia 1 — desliga a agência num commit. A inversão é a
// Onda 1 e entra JUNTO com a escada (sombra → allowlist → wide), nunca antes.

import type { QualityGateCheck } from "./types";

// ── O contrato de declaração ─────────────────────────────────────────────────

/** Onde a checagem REALMENTE barra. `onde` é caminho de arquivo do repositório,
 *  conferido por teste — metadado que aponta para arquivo inexistente envelhece
 *  igual à flag que ele veio substituir. */
export interface MecanismoDoPortao {
  onde: string;
  comoBarra: string;
}

/** A ausência declarada. Sem dono e sem prazo, "vamos fazer depois" é para
 *  sempre — e ninguém consegue nem contar quanto falta. */
export interface LacunaDoPortao {
  motivo: string;
  dono: string;
  /** A onda do P0 que fecha esta lacuna (`docs/projetos/p0-portoes/00-projeto.md`). */
  prazo: string;
}

export type PortaoDaCasa =
  | (QualityGateCheck & { autoCheckable: true;  mecanismo: MecanismoDoPortao; lacuna?: never })
  | (QualityGateCheck & { autoCheckable: false; mecanismo?: never; lacuna: LacunaDoPortao });

// Lacunas repetidas, nomeadas uma vez só — para o dono e o prazo não divergirem
// entre duas linhas que descrevem o mesmo buraco.
const LACUNA_JUIZ: LacunaDoPortao = {
  motivo: "julgamento subjetivo: exige LLM-judge por checagem, que ainda não emite veredito item a item.",
  dono: "qualidade",
  prazo: "Onda 5 do P0",
};
const LACUNA_DETERMINISTICA: LacunaDoPortao = {
  motivo: "é código puro e ainda não foi escrito — não há impedimento técnico, só falta construir.",
  dono: "qualidade",
  prazo: "Onda 4 do P0",
};
const LACUNA_IMPOSSIVEL: LacunaDoPortao = {
  motivo: "como está escrita, exige provar que um conjunto está COMPLETO sem registro contra o qual conferir. Volta decomposta ou não volta.",
  dono: "qualidade",
  prazo: "Onda 6 do P0",
};

// ── As 8 globais — a lista canônica, a que o avaliador roda ──────────────────

export const GLOBAL_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "no_hallucination",
    label: "Sem alucinação",
    description: "Toda afirmação deve ser fundamentada em dados reais do cliente ou contexto conhecido.",
    scope: "global",
    blocking: true,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/agency/execution/piso-de-verdade.ts",
      comoBarra: "confere a peça contra a VerdadeDoCliente lida do banco (telefone, e-mail, valor, prazo, promessa). Reprovou duas vezes, a peça não é publicada.",
    },
  },
  {
    id: "respects_brand",
    label: "Respeita a marca",
    description: "Output está alinhado com o tom, valores e identidade visual do Brand Brain.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "matches_briefing",
    label: "Corresponde ao briefing",
    description: "O entregável atende ao objetivo declarado no briefing do projeto.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "client_value_clear",
    label: "Valor claro para o cliente",
    description: "O cliente consegue entender o que recebeu e por que é relevante para ele.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "risk_checked",
    label: "Riscos verificados",
    description: "Riscos legais, financeiros e reputacionais foram identificados e endereçados.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_IMPOSSIVEL,
  },
  {
    id: "projections_anchored",
    label: "Números projetados com origem declarada",
    description: "Todo número projetado deriva da verba informada pelo cliente ou carrega ressalva de faixa de referência.",
    scope: "global",
    blocking: true,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/dioli-brain/traffic-canvas.ts",
      comoBarra: "`projecoesComOrigemDeclarada` reprova plano de mídia com número sem verba do cliente e sem ressalva de origem.",
    },
  },
  {
    id: "approval_verified",
    label: "Necessidade de aprovação verificada",
    description: "Confirmado se esta entrega precisa de aprovação humana antes de avançar.",
    scope: "global",
    // Não bloqueante: é verdade de governança (o artefato nasce rascunho), não
    // julgamento sobre a peça. Bloquear por ela seria alarme que ninguém lê.
    blocking: false,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/dioli-brain/quality-engine.ts",
      comoBarra: "o artefato nasce `draft`; aprovar e aplicar são transições separadas na governança do Brain.",
    },
  },
  {
    id: "evidence_path",
    label: "Caminho de evidência definido",
    description: "Existe uma métrica ou critério de sucesso que vai confirmar se este trabalho gerou valor.",
    scope: "global",
    blocking: false,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/dioli-brain/quality-engine.ts",
      comoBarra: "confere se há canvas aprovado com métrica de sucesso; sem ele, WARNING — nunca PASS.",
    },
  },
];

export const SDR_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "sdr_budget_respected",
    label: "Budget respeitado",
    description: "A estimativa de escopo está dentro do budget declarado pelo cliente.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
  {
    id: "sdr_objections_handled",
    label: "Objeções endereçadas",
    description: "Todas as objeções levantadas pelo cliente foram respondidas ou registradas.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_IMPOSSIVEL,
  },
  {
    id: "sdr_scope_clear",
    label: "Escopo claro",
    description: "O escopo do projeto está definido sem ambiguidades.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "sdr_no_false_promises",
    label: "Sem promessas falsas",
    description: "Nenhuma promessa de resultado que não pode ser garantida foi feita.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
  {
    id: "sdr_budget_separated",
    label: "Management fee separado do budget de mídia",
    description: "O valor da agência está claramente separado do investimento em mídia.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
];

export const STRATEGY_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "strategy_positioning_coherent",
    label: "Posicionamento coerente",
    description: "O posicionamento proposto é consistente com o Brand Brain e o mercado.",
    scope: "strategy",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "strategy_objective_aligned",
    label: "Objetivo alinhado",
    description: "A estratégia serve diretamente ao objetivo de negócio declarado pelo cliente.",
    scope: "strategy",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "strategy_assumptions_explicit",
    label: "Premissas explícitas",
    description: "Todas as premissas estratégicas estão declaradas — nada fica implícito.",
    scope: "strategy",
    blocking: false,
    autoCheckable: false,
    lacuna: LACUNA_IMPOSSIVEL,
  },
];

export const SOCIAL_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "social_brand_voice",
    label: "Voz da marca respeitada",
    description: "O conteúdo usa o tom e vocabulário definidos no Brand Brain.",
    scope: "social-media",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "social_channel_fit",
    label: "Conteúdo adequado ao canal",
    description: "O formato e tamanho são corretos para o canal de destino.",
    scope: "social-media",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
  {
    id: "social_cta_clear",
    label: "CTA claro",
    description: "Há um chamado à ação claro e adequado ao objetivo da publicação.",
    scope: "social-media",
    blocking: false,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
];

export const DESIGN_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "design_visual_consistency",
    label: "Consistência visual",
    description: "Paleta de cores, tipografia e elementos gráficos seguem o brandbook.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
    // Declarado com todas as letras porque é a armadilha desta linha: esta
    // checagem PREMIA IGUALDADE. Ela teria aprovado as 36 telas idênticas de
    // 06/08 com nota máxima. Falta a irmã dela — `design_dispersao_minima` —,
    // que não está desligada: NÃO EXISTE (Onda 3).
    lacuna: {
      motivo: "premia igualdade e não mede dispersão. As 36 telas idênticas passariam. Falta `design_dispersao_minima`, que ainda não existe.",
      dono: "departamentos",
      prazo: "Onda 3 do P0",
    },
  },
  {
    id: "design_brandbook_respected",
    label: "Brandbook respeitado",
    description: "Nenhuma regra do brandbook foi violada.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "design_no_invented_assets",
    label: "Sem assets inventados",
    description: "Todos os assets usados estão aprovados no Brand Hub do cliente.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
];

export const PAID_TRAFFIC_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "ads_budget_separated",
    label: "Budget separado do fee",
    description: "O investimento em mídia e o fee da agência estão claramente separados.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
  {
    id: "ads_offer_clear",
    label: "Oferta clara",
    description: "A oferta do anúncio é compreensível e honesta.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
  {
    id: "ads_audience_coherent",
    label: "Lógica de público coerente",
    description: "O público-alvo está alinhado com o Brand Brain e o objetivo da campanha.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
];

export const PM_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "pm_task_owner",
    label: "Task com dono definido",
    description: "Toda task tem um responsável claramente designado.",
    scope: "project-management",
    blocking: true,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/agency/tarefas/portao-do-pm.ts",
      comoBarra: "`criarTarefas` é o ponto único de gravação de Task; tarefa sem `agentId` não é gravada e o bloqueio vira ActivityEvent `portao_do_pm_barrou`.",
    },
  },
  {
    id: "pm_deadline",
    label: "Prazo definido",
    description: "Toda task tem um prazo — mesmo que provisório.",
    scope: "project-management",
    blocking: true,
    autoCheckable: true,
    mecanismo: {
      onde: "lib/agency/tarefas/portao-do-pm.ts",
      comoBarra: "exige `dueDate` em YYYY-MM-DD e data de calendário real; o prazo sai do `estimatedDays` do PM, nunca de chute. Sem prazo, a tarefa não é gravada.",
    },
  },
  {
    id: "pm_dependencies",
    label: "Dependências mapeadas",
    description: "As dependências entre tasks e departamentos estão identificadas.",
    scope: "project-management",
    blocking: false,
    autoCheckable: false,
    lacuna: LACUNA_IMPOSSIVEL,
  },
];

export const ANALYTICS_QUALITY_GATE: PortaoDaCasa[] = [
  {
    id: "analytics_metric_source",
    label: "Fonte da métrica declarada",
    description: "Cada métrica cita sua fonte de dados (Google Analytics, Meta, CRM, etc.).",
    scope: "analytics",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_DETERMINISTICA,
  },
  {
    id: "analytics_insight_actionable",
    label: "Insight acionável",
    description: "O insight gera uma recomendação clara de ação.",
    scope: "analytics",
    blocking: false,
    autoCheckable: false,
    lacuna: LACUNA_JUIZ,
  },
];

export const QUALITY_DEPT_GATE: PortaoDaCasa[] = [
  {
    id: "quality_audit_impartial",
    label: "Auditoria imparcial",
    description: "A auditoria usa um modelo/revisor diferente do que gerou o output.",
    scope: "quality",
    blocking: true,
    // ESTAVA CONSTRUÍDO E DECLARADO `false`. A flag mentia para baixo — o que é
    // pior do que parece: fazia a casa contar como buraco algo que já protegia,
    // e esconder o buraco de verdade no meio da contagem.
    autoCheckable: true,
    mecanismo: {
      onde: "lib/agency/execution/quality-auditor.ts",
      comoBarra: "`escolherArbitro` escolhe provedor diferente do autor; se o árbitro acabou sendo o próprio autor, a degradação é assimétrica — reprovação vale, aprovação vira `nao_auditado`.",
    },
  },
  {
    id: "quality_escalation",
    label: "Escalação quando necessário",
    description: "Problemas críticos são escalados — não omitidos.",
    scope: "quality",
    blocking: true,
    autoCheckable: false,
    lacuna: LACUNA_IMPOSSIVEL,
  },
];

export const ALL_QUALITY_GATES: Record<string, PortaoDaCasa[]> = {
  global: GLOBAL_QUALITY_GATE,
  "client-service-sdr": SDR_QUALITY_GATE,
  strategy: STRATEGY_QUALITY_GATE,
  "social-media": SOCIAL_QUALITY_GATE,
  design: DESIGN_QUALITY_GATE,
  "paid-traffic": PAID_TRAFFIC_QUALITY_GATE,
  "project-management": PM_QUALITY_GATE,
  analytics: ANALYTICS_QUALITY_GATE,
  quality: QUALITY_DEPT_GATE,
};

export function getQualityGateForDepartment(departmentId: string): PortaoDaCasa[] {
  return [...GLOBAL_QUALITY_GATE, ...(ALL_QUALITY_GATES[departmentId] ?? [])];
}

export function getBlockingChecks(departmentId: string): PortaoDaCasa[] {
  return getQualityGateForDepartment(departmentId).filter((c) => c.blocking);
}

// ── A ponte para o avaliador que roda ────────────────────────────────────────

/** Os ids das 8 globais, derivados da lista — não redigitados. Redigitar foi
 *  exatamente o que produziu a divergência que esta onda apagou. */
export type GlobalCheckId = (typeof GLOBAL_QUALITY_GATE)[number]["id"];

/**
 * Ids antigos → id canônico. Existe para uma coisa só: um relatório gravado
 * ANTES de 06/08/2026 (`BrainArtifact` de auditoria) tem `clear_client_value`
 * dentro dele, e quem for lê-lo precisa saber que é o mesmo item. Não é para
 * código novo usar — código novo usa o id canônico.
 */
export const IDS_ANTIGOS_DE_PORTAO: Record<string, GlobalCheckId> = {
  clear_client_value: "client_value_clear",
  approval_need_checked: "approval_verified",
  evidence_path_defined: "evidence_path",
};

export function idCanonicoDePortao(id: string): string {
  return IDS_ANTIGOS_DE_PORTAO[id] ?? id;
}

// ── O retrato honesto do P0, derivado do registro ────────────────────────────

/** Quantas barram de verdade, quantas não, e quantas das bloqueantes estão
 *  descobertas. Número escrito à mão em documento envelhece errado — este sai
 *  do código, e é ele que a prosa deve citar. */
export function retratoDosPortoes(): {
  total: number;
  comMecanismo: number;
  comLacuna: number;
  bloqueantesSemMecanismo: number;
} {
  const todas = Object.values(ALL_QUALITY_GATES).flat();
  return {
    total: todas.length,
    comMecanismo: todas.filter((c) => c.autoCheckable).length,
    comLacuna: todas.filter((c) => !c.autoCheckable).length,
    bloqueantesSemMecanismo: todas.filter((c) => c.blocking && !c.autoCheckable).length,
  };
}
