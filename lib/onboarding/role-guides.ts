// ─── Role Getting-Started Guides ──────────────────────────────────────────────
//
// Per-role "por onde começo" guide — a high-level walkthrough of what the role
// does, where to start and what to approve. Distinct from GuidedTour (which
// spotlights elements on a single page): a RoleGuide is a self-contained,
// always-available overview that opens automatically on a role's first visit
// and is re-openable from the sidebar at any time.
//
// Only the Project Manager guide is authored in depth for now. Other roles get
// a short stub so the button always works; fill them in as each role matures.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgencyRole } from "@/lib/agency/roles";

export interface RoleGuideStep {
  /** Short emoji/glyph shown in the step marker. */
  icon: string;
  title: string;
  /** 1–3 sentence explanation in plain Portuguese. */
  body: string;
  /** Optional deep link to the relevant screen. */
  href?: string;
  /** Label for the deep-link button (defaults to "Abrir"). */
  cta?: string;
}

export interface RoleGuide {
  /** Persisted as role_guide_seen_[role]. */
  role: AgencyRole;
  title: string;
  /** One-line framing of the role's mission. */
  mission: string;
  steps: RoleGuideStep[];
}

const PROJECT_MANAGER_GUIDE: RoleGuide = {
  role: "project_manager",
  title: "Guia do Project Manager",
  mission:
    "Você é o maestro da operação. Seu trabalho não é apertar botão em cada agente — é revisar o que o Dioli Brain já desenhou, dizer sim ou não, e garantir que o cliente receba um trabalho impecável.",
  steps: [
    {
      icon: "①",
      title: "Onde você começa: o Dashboard",
      body: "O Dashboard é sua visão geral do dia — projetos ativos, o que está pendente e o que precisa da sua atenção. Sempre que entrar, comece por aqui para saber onde focar.",
      href: "/agency/dashboard",
      cta: "Abrir Dashboard",
    },
    {
      icon: "②",
      title: "Briefings chegam sozinhos",
      body: "Quando o SDR fecha um briefing, ele aparece em Solicitações e o Dioli Brain já lê tudo e desenha o projeto inteiro automaticamente — estratégia, social, design, tráfego, analytics e qualidade. Você não precisa iniciar nada à mão.",
      href: "/agency/requests",
      cta: "Ver Solicitações",
    },
    {
      icon: "③",
      title: "Revisar o escopo desenhado",
      body: "Quando um briefing fica com status \"Escopo pronto\", clique em \"Ver escopo\". Lá estão as 6 seções já preenchidas. Você aprova tudo de uma vez OU marca seções específicas para refazer, deixando uma nota do que mudar. Nada vai pro cliente sem o seu sim.",
      href: "/agency/requests",
      cta: "Revisar escopos",
    },
    {
      icon: "④",
      title: "Aprovou → projeto criado",
      body: "Ao aprovar o escopo, o projeto e todas as tarefas são criados automaticamente e distribuídos para os departamentos. Se você pediu revisão, o briefing volta para \"Revisão pendente\" e o Brain redesenha as seções marcadas.",
      href: "/agency/projects",
      cta: "Ver Projetos",
    },
    {
      icon: "⑤",
      title: "Acompanhar a produção",
      body: "Use Projetos para o detalhe de cada cliente, o Pipeline para ver tudo por etapa e Tarefas para o que está em andamento, bloqueado ou atrasado. É aqui que você acompanha o trabalho dos departamentos sem precisar entrar em cada agente.",
      href: "/agency/pipeline",
      cta: "Abrir Pipeline",
    },
    {
      icon: "⑥",
      title: "Aprovar as entregas",
      body: "Em Aprovações ficam as entregas dos departamentos, atualizações de Brand Hub e pedidos de material aguardando seu aval. Esse é o filtro de qualidade antes de qualquer coisa chegar ao cliente.",
      href: "/agency/approvals",
      cta: "Ver Aprovações",
    },
    {
      icon: "⑦",
      title: "Brand Hub: a fonte da verdade",
      body: "O Brand Hub guarda posicionamento, tom de voz, público e regras de cada cliente. Os agentes usam isso para produzir no tom certo. Mantenha-o atualizado — é o que garante consistência em tudo.",
      href: "/agency/clients",
      cta: "Ver Clientes",
    },
    {
      icon: "✓",
      title: "Resumindo o seu ritmo",
      body: "1) Dashboard para ver o dia. 2) Solicitações → revisar escopos prontos. 3) Aprovações → liberar entregas. 4) Pipeline para acompanhar. O Brain faz o trabalho pesado; você decide e garante a qualidade.",
    },
  ],
};

function stub(role: AgencyRole, title: string, mission: string): RoleGuide {
  return {
    role,
    title,
    mission,
    steps: [
      {
        icon: "①",
        title: "Seu ponto de partida",
        body: "Comece pelo Dashboard para ver o que precisa da sua atenção hoje.",
        href: "/agency/dashboard",
        cta: "Abrir Dashboard",
      },
      {
        icon: "②",
        title: "Suas entregas e aprovações",
        body: "Acompanhe suas tarefas em Entregas e veja o que está aguardando aval em Aprovações.",
        href: "/agency/approvals",
        cta: "Ver Aprovações",
      },
    ],
  };
}

export const ROLE_GUIDES: Record<AgencyRole, RoleGuide> = {
  master:          { ...PROJECT_MANAGER_GUIDE, role: "master", title: "Guia do Master", mission: "Acesso total à operação. O fluxo do Project Manager abaixo é o seu núcleo de trabalho — você também controla configurações, integrações e reset de dados." },
  project_manager: PROJECT_MANAGER_GUIDE,
  social_staff:    stub("social_staff", "Guia do Social", "Você produz e entrega o conteúdo de social media dos clientes."),
  design_staff:    stub("design_staff", "Guia do Design", "Você produz e entrega as peças de design dos clientes."),
  ads_staff:       stub("ads_staff", "Guia de Ads", "Você cuida das campanhas de tráfego pago dos clientes."),
};

export function getRoleGuide(role: AgencyRole): RoleGuide {
  return ROLE_GUIDES[role] ?? PROJECT_MANAGER_GUIDE;
}
