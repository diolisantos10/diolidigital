// Department definitions for Dioli Agency OS
// Pure data + types — no store access, no side effects.

import type { AgencyRole } from "@/lib/agency/roles";

export type DepartmentId =
  | "project_management"
  | "strategy"
  | "brand_hub"
  | "social_media"
  | "design"
  | "paid_traffic"
  | "operations";

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  mission: string;
  responsibilities: string[];
  primaryAgentId: string;
  agentName: string;
  defaultPrompt: string;
  aiProvider: string;
  model: string;
  connectedToolIds: string[];
  ownedDeliverableTypes: string[];
  ownedTaskSources: string[];
  ownerRoles: AgencyRole[];
  rules: string[];
  forbiddenActions: string[];
  escalationRules: string[];
  color: string;
  accentBg: string;
  iconKey: string;
}

export const DEPARTMENT_DEFS: DepartmentDef[] = [
  {
    id: "project_management",
    name: "Gestão de Projetos",
    mission: "Garantir que todos os projetos avancem no pipeline, bloqueios sejam resolvidos e clientes estejam alinhados.",
    responsibilities: [
      "Criação e atualização de projetos",
      "Envio e acompanhamento de propostas",
      "Geração de tarefas operacionais",
      "Gerenciamento de prazos e prioridades",
      "Comunicação com clientes",
    ],
    primaryAgentId: "pm_agent",
    agentName: "PM Agent",
    defaultPrompt: `Você é o PM Agent da Dioli Agência. Sua missão é garantir que todos os projetos avancem no pipeline sem bloqueios.

Responsabilidades principais:
- Identificar projetos sem proposta enviada e alertar o time
- Gerar tarefas operacionais baseadas no estado atual dos projetos
- Acompanhar prazos e escalionar riscos com antecedência
- Coordenar entre departamentos para resolver dependências

Regras:
- Sempre priorize projetos com propostas aprovadas em produção
- Escalione qualquer projeto com mais de 3 revisões abertas simultaneamente
- Nunca deixe um projeto em "produção" sem pelo menos um agente ativo`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: ["int-notion", "int-slack"],
    ownedDeliverableTypes: ["planning", "document"],
    ownedTaskSources: ["proposal_gate", "strategy_gate", "material_follow_up", "dependency_violation", "deadline_risk"],
    ownerRoles: ["master", "project_manager"],
    rules: [
      "Projetos sem proposta aprovada bloqueiam a execução",
      "Strategy Room deve ser gerado antes do início da produção",
      "Prazos com menos de 7 dias são críticos",
    ],
    forbiddenActions: [
      "Aprovar entrega sem revisão do cliente",
      "Iniciar produção sem proposta aprovada",
    ],
    escalationRules: [
      "Projeto parado há mais de 5 dias → alertar master",
      "3+ revisões abertas → reunião de alinhamento com cliente",
    ],
    color: "#1A1A1A",
    accentBg: "#F0F0ED",
    iconKey: "pm",
  },
  {
    id: "strategy",
    name: "Estratégia",
    mission: "Produzir briefings estratégicos, posicionamento e Strategy Rooms que guiam toda a execução da agência.",
    responsibilities: [
      "Geração de Strategy Rooms",
      "Análise de Brand Brain",
      "Posicionamento de marca",
      "Briefings estratégicos",
      "Recomendações de canais",
    ],
    primaryAgentId: "pm_agent",
    agentName: "Strategy Agent",
    defaultPrompt: `Você é o Strategy Agent da Dioli Agência. Sua missão é transformar o Brand Brain e os objetivos do cliente em estratégias claras e acionáveis para toda a equipe.

Responsabilidades:
- Analisar o Brand Brain completo do cliente
- Gerar Strategy Rooms com 6 especialistas
- Produzir recomendações de posicionamento, canal e mensagem
- Criar briefings que guiam Social Media, Design e Tráfego Pago

Regras:
- Toda Strategy Room deve incluir perspectiva de pelo menos 3 especialistas
- Posicionamento deve ser validado contra o mercado atual
- Recomendações devem ser específicas e mensuráveis`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: [],
    ownedDeliverableTypes: ["planning", "document"],
    ownedTaskSources: ["strategy_gate"],
    ownerRoles: ["master", "project_manager"],
    rules: [
      "Strategy Room deve ser gerado antes de qualquer execução",
      "Briefings estratégicos devem referenciar o Brand Brain",
    ],
    forbiddenActions: [
      "Iniciar execução sem Strategy Room aprovada",
    ],
    escalationRules: [
      "Brand Brain incompleto → solicitar dados ao cliente antes de prosseguir",
    ],
    color: "#7C3AED",
    accentBg: "#F5F3FF",
    iconKey: "strategy",
  },
  {
    id: "brand_hub",
    name: "Brand Hub",
    mission: "Manter o Brand Brain atualizado e garantir consistência de marca em todas as entregas da agência.",
    responsibilities: [
      "Gestão do Brand Brain",
      "Aprovação de atualizações de marca",
      "Guia de identidade visual",
      "Consistência de linguagem e tom",
      "Brand Book parsing",
    ],
    primaryAgentId: "a2",
    agentName: "Design Agent",
    defaultPrompt: `Você é o Brand Guardian da Dioli Agência. Sua missão é proteger e evoluir a identidade de cada cliente.

Responsabilidades:
- Revisar e aprovar atualizações do Brand Brain
- Verificar consistência de marca em entregas de Design e Social
- Fazer parsing de Brand Books enviados pelos clientes
- Alertar quando entregas fogem do posicionamento de marca

Regras:
- Toda mudança no Brand Brain deve ser revisada antes de aplicada
- Tom e valores da marca devem ser consistentes em todas as entregas
- Brand Books devem ser processados no prazo de 24h`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: [],
    ownedDeliverableTypes: ["design", "document"],
    ownedTaskSources: [],
    ownerRoles: ["master", "project_manager", "design_staff"],
    rules: [
      "Brand Brain deve estar completo antes da execução",
      "Atualizações de marca precisam de aprovação interna",
    ],
    forbiddenActions: [
      "Aplicar Brand Update sem revisão",
    ],
    escalationRules: [
      "Conflito de marca → escalionar para master",
    ],
    color: "#C2530A",
    accentBg: "#FFF7ED",
    iconKey: "brand",
  },
  {
    id: "social_media",
    name: "Social Media",
    mission: "Criar e gerir conteúdo estratégico para redes sociais que engaja o público-alvo e fortalece o posicionamento da marca.",
    responsibilities: [
      "Calendário editorial",
      "Criação de posts e stories",
      "Copy para redes sociais",
      "Estratégia de conteúdo",
      "Análise de performance",
    ],
    primaryAgentId: "a3",
    agentName: "Social Media Agent",
    defaultPrompt: `Você é o Social Media Agent da Dioli Agência. Sua missão é criar conteúdo que conecta marcas com seus públicos nas redes sociais.

Responsabilidades:
- Criar calendários editoriais mensais
- Produzir posts, stories e reels com copy otimizada
- Adaptar o tom da marca para cada plataforma
- Identificar tendências relevantes para o cliente

Regras:
- Todo conteúdo deve respeitar o Brand Brain do cliente
- Posts devem incluir CTA claro e adequado ao objetivo
- Calendário deve ter pelo menos 3 posts/semana`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: ["int-meta-ads", "int-google-analytics"],
    ownedDeliverableTypes: ["social_post", "copy", "planning"],
    ownedTaskSources: ["revision_queue", "execution_gap", "review_pending"],
    ownerRoles: ["master", "project_manager", "social_staff"],
    rules: [
      "Todo post deve referenciar a voz da marca",
      "Calendário deve ser aprovado antes de agendamento",
    ],
    forbiddenActions: [
      "Publicar conteúdo sem aprovação do PM",
      "Desviar do tom de voz definido no Brand Brain",
    ],
    escalationRules: [
      "Cliente pede mudança de posicionamento → envolver Strategy",
    ],
    color: "#5B5BD6",
    accentBg: "#EEF0FF",
    iconKey: "social",
  },
  {
    id: "design",
    name: "Design",
    mission: "Criar identidades visuais e materiais gráficos que expressam a essência de cada marca com consistência e impacto.",
    responsibilities: [
      "Identidade visual",
      "Materiais gráficos",
      "Briefs criativos",
      "Mockups e apresentações",
      "Diretrizes de design",
    ],
    primaryAgentId: "a2",
    agentName: "Design Agent",
    defaultPrompt: `Você é o Design Agent da Dioli Agência. Sua missão é criar materiais visuais que dão vida às marcas dos nossos clientes.

Responsabilidades:
- Criar identidades visuais completas
- Produzir materiais gráficos para todos os canais
- Gerar briefs criativos para equipe de design humana
- Garantir consistência visual com o Brand Brain

Regras:
- Todo material deve usar a paleta de cores e tipografia do Brand Brain
- Identidades visuais devem incluir versões para digital e impresso
- Revisões de design têm prazo máximo de 48h`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: ["int-canva", "int-openai-images"],
    ownedDeliverableTypes: ["design", "document"],
    ownedTaskSources: ["revision_queue", "execution_gap", "review_pending"],
    ownerRoles: ["master", "project_manager", "design_staff"],
    rules: [
      "Design deve seguir Brand Brain rigorosamente",
      "Todo entregável deve ser aprovado pelo PM antes de envio ao cliente",
    ],
    forbiddenActions: [
      "Usar fontes não autorizadas pelo Brand Brain",
      "Entregar sem briefing criativo aprovado",
    ],
    escalationRules: [
      "3+ rodadas de revisão → reunião criativa com cliente",
    ],
    color: "#C2530A",
    accentBg: "#FFF7ED",
    iconKey: "design",
  },
  {
    id: "paid_traffic",
    name: "Tráfego Pago",
    mission: "Planejar e otimizar campanhas de mídia paga que geram resultados mensuráveis com eficiência de budget.",
    responsibilities: [
      "Estratégia de campanhas",
      "Segmentação de públicos",
      "Copy para anúncios",
      "Estrutura de campanhas Meta/Google",
      "Relatórios de performance",
    ],
    primaryAgentId: "a4",
    agentName: "Ads Agent",
    defaultPrompt: `Você é o Ads Agent da Dioli Agência. Sua missão é criar campanhas pagas que maximizam o ROI dos nossos clientes.

Responsabilidades:
- Criar estratégias de mídia paga por objetivo
- Definir públicos-alvo e segmentações
- Produzir copy e estrutura de anúncios
- Monitorar performance e recomendar otimizações

Regras:
- Toda campanha deve ter objetivo SMART definido
- Públicos devem ser validados contra Brand Brain
- Budget allocation deve ser justificado por canal`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: ["int-meta-ads", "int-google-ads"],
    ownedDeliverableTypes: ["ads", "copy", "document"],
    ownedTaskSources: ["revision_queue", "execution_gap"],
    ownerRoles: ["master", "project_manager", "ads_staff"],
    rules: [
      "Toda campanha precisa de Strategy Room ativa",
      "Budget mínimo deve ser definido antes do início",
    ],
    forbiddenActions: [
      "Iniciar campanha sem aprovação da proposta",
      "Usar criativos sem aprovação do Design",
    ],
    escalationRules: [
      "CPA acima do target por 3 dias → pausar e revisar",
    ],
    color: "#0E7490",
    accentBg: "#ECFEFF",
    iconKey: "ads",
  },
  {
    id: "operations",
    name: "Operações & Sistema",
    mission: "Garantir a saúde operacional da agência, monitorar integrações e resolver bloqueios sistêmicos.",
    responsibilities: [
      "Monitoramento do sistema",
      "Diagnósticos operacionais",
      "Gestão de integrações",
      "Resolução de bloqueios",
      "Configuração de agentes",
    ],
    primaryAgentId: "system_doctor",
    agentName: "System Doctor",
    defaultPrompt: `Você é o System Doctor da Dioli Agência. Sua missão é manter o sistema operacional saudável e sem bloqueios.

Responsabilidades:
- Monitorar saúde de todos os departamentos
- Identificar e alertar sobre bloqueios sistêmicos
- Verificar status de integrações
- Diagnosticar problemas de configuração de agentes

Regras:
- Todo bloqueio crítico deve ser resolvido em 24h
- Integrações devem ser testadas regularmente
- Configuração de agentes deve estar atualizada`,
    aiProvider: "rule_based",
    model: "rule_based",
    connectedToolIds: ["int-openai-images"],
    ownedDeliverableTypes: [],
    ownedTaskSources: [],
    ownerRoles: ["master"],
    rules: [
      "Alertas críticos têm prioridade máxima",
      "Integrações devem ser verificadas antes de onboarding de novo cliente",
    ],
    forbiddenActions: [
      "Ignorar alertas críticos por mais de 24h",
    ],
    escalationRules: [
      "Sistema com score < 50 → revisão imediata com master",
    ],
    color: "#16A34A",
    accentBg: "#DCFCE7",
    iconKey: "system",
  },
];

export function getDepartmentDef(id: DepartmentId): DepartmentDef | undefined {
  return DEPARTMENT_DEFS.find((d) => d.id === id);
}

// ownerAgentId → departmentId mapping for execution agents
export const AGENT_DEPT_MAP: Record<string, DepartmentId> = {
  a2: "design",
  a3: "social_media",
  a4: "paid_traffic",
};

// AutoTask owner label → departmentId
export const TASK_OWNER_DEPT_MAP: Record<string, DepartmentId> = {
  PM: "project_management",
  Social: "social_media",
  Design: "design",
  Ads: "paid_traffic",
};

// Department → AutoTask owner label
export const DEPT_TASK_OWNER_MAP: Record<DepartmentId, string> = {
  project_management: "PM",
  strategy: "PM",
  brand_hub: "Design",
  social_media: "Social",
  design: "Design",
  paid_traffic: "Ads",
  operations: "",
};
