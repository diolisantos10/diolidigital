// Department Operating Model V1
// Pure data — no store access, no side effects.
// Defines the operational scope, inputs, outputs, quality checklist,
// and handoff map for each core execution department.

import type { DepartmentId } from "@/lib/agency/departments";

export interface OperatingModelInput {
  label: string;
  required: boolean;
  source: string;
  description: string;
}

export interface OperatingModelOutput {
  label: string;
  type: string;
  description: string;
  handoffTarget?: string;
}

export interface HandoffMap {
  fromDeptId: DepartmentId;
  toDeptId: DepartmentId;
  what: string[];
  trigger: string;
}

export interface QualityCheckItem {
  item: string;
  category: "input" | "output" | "process";
}

export interface DepartmentOperatingModel {
  departmentId: DepartmentId;
  startTrigger: string;
  completionCriteria: string[];
  inputs: OperatingModelInput[];
  outputs: OperatingModelOutput[];
  qualityChecklist: QualityCheckItem[];
  handoffsOut: HandoffMap[];
}

export const OPERATING_MODELS: DepartmentOperatingModel[] = [
  {
    departmentId: "strategy",
    startTrigger: "Proposta aprovada pelo cliente + Brand Hub preenchido",
    completionCriteria: [
      "Strategy Room gerado com pelo menos 3 especialistas",
      "Posicionamento validado contra mercado atual",
      "Canais recomendados com justificativa",
      "Departamentos acionados identificados",
      "Escopo de proposta definido e revisado com PM",
    ],
    inputs: [
      {
        label: "Briefing do cliente",
        required: true,
        source: "Cliente / PM",
        description: "Objetivos, prazo, expectativas e contexto completo do projeto",
      },
      {
        label: "Brand Hub completo",
        required: true,
        source: "Brand Hub",
        description: "Tom de voz, valores, público-alvo, posicionamento, identidade visual",
      },
      {
        label: "Objetivo de negócio",
        required: true,
        source: "Cliente / PM",
        description: "Meta SMART: lançamento, crescimento, awareness ou conversão com prazo",
      },
      {
        label: "Materiais disponíveis",
        required: false,
        source: "Cliente",
        description: "Logos, fotos, brand book, referências visuais e concorrentes",
      },
    ],
    outputs: [
      {
        label: "Diagnóstico estratégico",
        type: "document",
        description: "Análise da situação atual: marca, mercado, oportunidades e riscos",
        handoffTarget: "Todos os departamentos",
      },
      {
        label: "Direção da campanha / projeto",
        type: "document",
        description: "Mensagem principal, abordagem criativa e tom de execução aprovado",
      },
      {
        label: "Recomendação de posicionamento",
        type: "document",
        description: "Como a marca deve se posicionar para atingir o objetivo definido",
      },
      {
        label: "Recomendação de canais",
        type: "planning",
        description: "Quais canais usar e por quê (Social, Tráfego Pago, Orgânico, etc.)",
      },
      {
        label: "Departamentos recomendados",
        type: "planning",
        description: "Quais departamentos acionar e em que ordem de execução",
        handoffTarget: "PM",
      },
      {
        label: "Escopo da proposta",
        type: "document",
        description: "Input para proposta comercial: serviços, entregas e prazo estimado",
        handoffTarget: "PM",
      },
    ],
    qualityChecklist: [
      { item: "Briefing do cliente recebido e revisado antes de iniciar", category: "input" },
      { item: "Brand Hub com tom de voz e público-alvo preenchidos", category: "input" },
      { item: "Objetivo de negócio específico e mensurável (não genérico)", category: "input" },
      { item: "Strategy Room gerado com múltiplos especialistas", category: "process" },
      { item: "Diagnóstico estratégico não contradiz Brand Brain", category: "output" },
      { item: "Canais recomendados justificados por público-alvo", category: "output" },
      { item: "Escopo revisado com PM antes de entrega ao cliente", category: "output" },
    ],
    handoffsOut: [
      {
        fromDeptId: "strategy",
        toDeptId: "social-media",
        what: ["Diagnóstico estratégico", "Direção de conteúdo", "Tom e canais aprovados"],
        trigger: "Strategy Room aprovado internamente",
      },
      {
        fromDeptId: "strategy",
        toDeptId: "design",
        what: ["Diagnóstico estratégico", "Direção criativa", "Referências de posicionamento visual"],
        trigger: "Strategy Room aprovado + Brand Hub revisado",
      },
      {
        fromDeptId: "strategy",
        toDeptId: "paid-traffic",
        what: ["Objetivo de campanha", "Público-alvo validado", "Canais recomendados"],
        trigger: "Strategy Room aprovado + objetivo de campanha definido",
      },
    ],
  },

  {
    departmentId: "social-media",
    startTrigger: "Strategy Room aprovado + Brand Hub disponível + escopo do projeto definido",
    completionCriteria: [
      "Calendário editorial com mínimo 3 posts/semana",
      "Cada post com copy, CTA e briefing de design",
      "Formatos definidos por plataforma",
      "Todos os posts validados contra Brand Brain",
      "Handoff de design enviado ao Departamento de Design",
    ],
    inputs: [
      {
        label: "Output de Estratégia (Strategy Room)",
        required: true,
        source: "Estratégia",
        description: "Diagnóstico, direção de conteúdo, tom, canais aprovados",
      },
      {
        label: "Brand Hub completo",
        required: true,
        source: "Brand Hub",
        description: "Tom de voz, valores, identidade visual, regras de marca",
      },
      {
        label: "Escopo do projeto aprovado",
        required: true,
        source: "PM",
        description: "Quais serviços foram aprovados, prazo, formatos incluídos",
      },
      {
        label: "Referências do cliente",
        required: false,
        source: "Cliente",
        description: "Posts anteriores, referências de concorrentes, preferências",
      },
    ],
    outputs: [
      {
        label: "Estratégia de conteúdo",
        type: "planning",
        description: "Pilares de conteúdo, temas por plataforma, frequência semanal",
        handoffTarget: "PM / Cliente",
      },
      {
        label: "Calendário editorial",
        type: "planning",
        description: "Calendário mensal com datas, temas e formatos por plataforma",
        handoffTarget: "PM / Cliente",
      },
      {
        label: "Conceitos de posts",
        type: "social_post",
        description: "Textos, copies, hashtags e CTAs para cada post planejado",
        handoffTarget: "Design",
      },
      {
        label: "Legendas (captions)",
        type: "copy",
        description: "Copy final aprovada para posts, stories e reels",
      },
      {
        label: "Handoff para Design",
        type: "document",
        description: "Briefing visual por peça: dimensões, texto sobreposto, referências",
        handoffTarget: "Design",
      },
    ],
    qualityChecklist: [
      { item: "Strategy Room lida antes de iniciar o calendário", category: "input" },
      { item: "Brand Hub consultado para cada copy produzida", category: "input" },
      { item: "Todas as copies no tom de voz correto da marca", category: "output" },
      { item: "Cada post tem objetivo claro (awareness, engajamento, conversão)", category: "output" },
      { item: "CTA presente em todos os posts", category: "output" },
      { item: "Calendário com cobertura mínima de 3 posts/semana", category: "output" },
      { item: "Briefing de design enviado antes da data de publicação", category: "process" },
    ],
    handoffsOut: [
      {
        fromDeptId: "social-media",
        toDeptId: "design",
        what: ["Conceitos de posts", "Briefing visual por peça", "Calendário com datas de entrega"],
        trigger: "Calendário editorial aprovado internamente",
      },
    ],
  },

  {
    departmentId: "design",
    startTrigger: "Brand Hub disponível + briefing criativo recebido (de Social Media ou Strategy)",
    completionCriteria: [
      "Direção criativa aprovada antes da execução",
      "Todos os assets respeitam paleta e tipografia do Brand Brain",
      "Briefing criativo revisado por PM",
      "Versões digital e impresso disponíveis quando aplicável",
      "Entregáveis aprovados pelo PM antes do envio ao cliente",
    ],
    inputs: [
      {
        label: "Brand Hub completo",
        required: true,
        source: "Brand Hub",
        description: "Paleta de cores, tipografia, estilo visual, regras de identidade",
      },
      {
        label: "Briefing de Social Media",
        required: false,
        source: "Social Media",
        description: "Calendário editorial, conceitos de posts, dimensões e formatos",
      },
      {
        label: "Direção estratégica",
        required: true,
        source: "Estratégia",
        description: "Posicionamento visual, referências aprovadas, direção criativa",
      },
      {
        label: "Assets do cliente",
        required: false,
        source: "Cliente",
        description: "Logos originais, fotos, brand book, referências visuais aprovadas",
      },
    ],
    outputs: [
      {
        label: "Direção criativa",
        type: "document",
        description: "Mood board, referências, paleta aprovada, tipografia escolhida",
      },
      {
        label: "Briefs criativos",
        type: "document",
        description: "Especificação detalhada por peça: dimensões, textos, elementos obrigatórios",
      },
      {
        label: "Plano de assets visuais",
        type: "planning",
        description: "Lista de todas as peças com prioridade e prazo",
      },
      {
        label: "Prompts de imagem (para IA)",
        type: "document",
        description: "Prompts otimizados para DALL-E ou Midjourney por tipo de asset",
      },
      {
        label: "Templates e especificações",
        type: "design",
        description: "Templates reutilizáveis para posts, stories e banners",
        handoffTarget: "Social Media / Cliente",
      },
      {
        label: "Entregáveis de design",
        type: "design",
        description: "Arquivos finais aprovados (Figma, PNG, PDF) prontos para uso",
        handoffTarget: "Tráfego Pago / Cliente",
      },
    ],
    qualityChecklist: [
      { item: "Brand Hub consultado antes de qualquer execução visual", category: "input" },
      { item: "Briefing criativo aprovado antes de começar produção", category: "process" },
      { item: "Paleta de cores e tipografia em conformidade com Brand Brain", category: "output" },
      { item: "Todas as peças revisadas por PM antes de entrega ao cliente", category: "process" },
      { item: "Fontes e imagens licenciadas ou originais (sem violação)", category: "output" },
      { item: "Versões de alta resolução disponíveis quando solicitado", category: "output" },
      { item: "Nenhuma peça produzida sem briefing criativo aprovado", category: "process" },
    ],
    handoffsOut: [
      {
        fromDeptId: "design",
        toDeptId: "paid-traffic",
        what: ["Criativos aprovados para anúncios", "Especificações por plataforma (Meta, Google)", "Variações de copy visual"],
        trigger: "Criativos aprovados pelo PM + prontos para veiculação",
      },
    ],
  },

  {
    departmentId: "paid-traffic",
    startTrigger: "Strategy Room aprovado + objetivo de campanha definido + criativos disponíveis",
    completionCriteria: [
      "Estrutura de campanha documentada (campanha, conjunto, anúncio)",
      "Público-alvo validado contra Brand Brain",
      "Budget allocation justificado por canal",
      "Criativos aprovados pelo Design antes de usar",
      "Plano de otimização com KPIs e critérios de pausa",
    ],
    inputs: [
      {
        label: "Output de Estratégia (Strategy Room)",
        required: true,
        source: "Estratégia",
        description: "Objetivo de campanha, público-alvo validado, canais recomendados",
      },
      {
        label: "Brand Hub completo",
        required: true,
        source: "Brand Hub",
        description: "Valores da marca, posicionamento, tom aprovado para anúncios",
      },
      {
        label: "Assets de Social / Design",
        required: true,
        source: "Social Media / Design",
        description: "Criativos aprovados para uso em anúncios (formatos Meta/Google)",
      },
      {
        label: "Objetivo da campanha (SMART)",
        required: true,
        source: "Cliente / PM",
        description: "Meta mensurável: CPA target, ROAS, leads, conversões por período",
      },
      {
        label: "Budget disponível",
        required: true,
        source: "Cliente / PM",
        description: "Orçamento total e distribuição sugerida por canal e período",
      },
    ],
    outputs: [
      {
        label: "Estrutura de campanha",
        type: "planning",
        description: "Arquitetura completa: campanha → conjuntos de anúncios → anúncios",
        handoffTarget: "PM / Cliente",
      },
      {
        label: "Estratégia de público",
        type: "document",
        description: "Públicos frios, mornos e quentes; lookalikes; exclusões",
      },
      {
        label: "Ângulos de copy para anúncios",
        type: "copy",
        description: "3–5 variações de headline e copy principal para testes A/B",
      },
      {
        label: "Requisitos de criativos",
        type: "document",
        description: "Especificações técnicas e conceituais dos assets necessários",
        handoffTarget: "Design",
      },
      {
        label: "Recomendação de budget",
        type: "document",
        description: "Alocação por canal, por público e por fase de funil",
      },
      {
        label: "Plano de otimização",
        type: "planning",
        description: "KPIs, frequência de revisão, critérios de pausa e escalonamento",
        handoffTarget: "PM",
      },
    ],
    qualityChecklist: [
      { item: "Strategy Room lida antes de definir objetivos de campanha", category: "input" },
      { item: "Budget mínimo definido antes do início das campanhas", category: "input" },
      { item: "Criativos aprovados pelo Design antes de usar em anúncios", category: "input" },
      { item: "Público-alvo validado contra Brand Brain e Strategy", category: "output" },
      { item: "Objetivo da campanha é SMART (mensurável e com prazo)", category: "output" },
      { item: "Plano de otimização com critério claro de pausa", category: "output" },
      { item: "Nenhuma campanha iniciada sem proposta aprovada", category: "process" },
    ],
    handoffsOut: [
      {
        fromDeptId: "paid-traffic",
        toDeptId: "project-management",
        what: ["Estrutura de campanha", "Plano de otimização", "KPIs e metas por período"],
        trigger: "Campanha configurada e pronta para ativação pelo cliente",
      },
    ],
  },
];

export function getOperatingModel(departmentId: string): DepartmentOperatingModel | undefined {
  return OPERATING_MODELS.find((m) => m.departmentId === departmentId);
}

// All handoffs flattened — includes both outgoing (from each dept) and incoming (to each dept).
export const ALL_HANDOFFS: HandoffMap[] = OPERATING_MODELS.flatMap((m) => m.handoffsOut);
