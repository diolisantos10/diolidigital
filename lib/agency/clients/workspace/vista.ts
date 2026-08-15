// ═══════════════════════════════════════════════════════════════════════════
//  O VIEW-MODEL DO CLIENT COMMAND CENTER
//
//  Este arquivo descreve o que a TELA DA AGÊNCIA precisa para desenhar. Ele é
//  só isso — e a distinção importa, porque a versão anterior deste porte
//  trazia junto uma fronteira interno×portal própria (`toClientPortalView`,
//  `INTERNAL_ONLY_KEYS`, `assertNoInternalLeak`). Ela foi REMOVIDA de
//  propósito.
//
//  ── POR QUE A FRONTEIRA NÃO MORA AQUI ─────────────────────────────────────
//
//  Porque ela já existe neste sistema, é mais antiga, é mais forte e tem
//  cicatriz. Duplicá-la criaria duas políticas de segurança com o mesmo nome —
//  exatamente o defeito que `lib/auth/posse-de-workspace.ts` foi criado para
//  matar (a conferência de posse vivia copiada em três lugares e as cópias já
//  divergiam). A fronteira canônica do portal do cliente é, hoje:
//
//   • `Deliverable.visibility`      — nasce "interno"; vira "compartilhado" só
//                                     no ato de apresentar (esteira/marcos.ts).
//   • `ApprovalRequest.clientVisible` — o card só existe para o cliente quando
//                                     alguém decidiu que existe.
//   • `app/api/brain/portal-data`   — o ÚNICO montador do pacote do portal:
//                                     `CLIENT_SAFE_DEPARTMENTS` traduz jargão,
//                                     `PADROES_DE_VALOR_INTERNO` barra preço,
//                                     e a posse passa por `validatePortalAccess`
//                                     ou pelo workspace da sessão.
//   • `lib/auth/posse-de-workspace` — estar logado não é ser dono.
//
//  Portanto: **esta tela é interna e só interna**. Ela lê o banco pelo
//  workspace da sessão e não tem rota pública. Se um dia o portal precisar de
//  uma vista derivada daqui, o caminho é `portal-data`, não um segundo seletor.
//
//  ── O QUE SOBROU, E POR QUE É REGRA E NÃO ESTILO ─────────────────────────
//
//  `Metric.value: string | null`. Nulo não é zero: é "não existe fonte ligada".
//  A tela desenha "—" mais o motivo, no mesmo lugar onde desenharia o número.
//  Guardrail 1 da casa — ausência de informação não é informação. Um "0" ali
//  seria a tela afirmando que mediu e deu zero.
// ═══════════════════════════════════════════════════════════════════════════

/** Um número que a tela mostra. `null` = não existe dado conectado. */
export type Metric = {
  label: string;
  /** `null` quando não há fonte de dado ligada. */
  value: string | null;
  /** Nota de apoio. `null` junto com `value` quando não há dado. */
  hint: string | null;
};

export type MetricTone = "" | "ok" | "warn" | "partial" | "off";

export type ClientIdentity = {
  id: string;
  name: string;
  initial: string;
  category: string | null;
  /** AAAA-MM. `null` quando desconhecido. */
  activeSince: string | null;
  isActive: boolean;
  /** Só para a ficha e o modal de edição. */
  website: string | null;
  email: string | null;
  phone: string | null;
};

export type ProjectView = {
  id: string;
  name: string;
  kind: string;
  /** 0–100, ou `null` quando o projeto não tem progresso medido. */
  progress: number | null;
  statusLabel: string;
  /** Quem toca o projeto, em nome de agente. */
  agents: string[];
  deliverableCount: number;
  decisionCount: number;
};

export type RequestView = {
  id: string;
  code: string;
  title: string;
  /** Para onde foi encaminhado — nome público, sem etapa operacional. */
  routedTo: string;
  statusLabel: string;
  when: string;
  priority: "high" | "medium" | "low" | "done";
};

export type DeliverableView = {
  id: string;
  title: string;
  projectName: string | null;
  /** Rótulo do departamento que produziu, quando derivável do tipo. */
  department: string | null;
  statusLabel: string;
  when: string | null;
  /** Versão corrente. Sempre ≥ 1. */
  version: number;
  /** Quantas versões imutáveis existem (`DeliverableVersion`). */
  versionCount: number;
  /**
   * A ENTREGA JÁ FOI APRESENTADA AO CLIENTE?
   * Traduz `Deliverable.visibility` ("interno" | "aguardando_publicacao" |
   * "compartilhado"). Nasce interno de propósito — ver o schema.
   */
  shared: boolean;
  /** Existe corpo para abrir? Sem isto a linha vira botão que abre o vazio. */
  hasContent: boolean;
};

/**
 * MATERIAL DO CLIENTE — o que ELE mandou, não o que a agência produziu.
 *
 * O contrato manda "diferenciar claramente material enviado pelo cliente de
 * entrega produzida pela agência", e a diferença não é de rótulo: é de dono e
 * de efeito. O material do cliente é insumo (`MediaAsset.kind = "inbound"`),
 * destrava produção travada por falta de arquivo e NUNCA passa por aprovação;
 * a entrega é produto (`Deliverable`), tem versão, passa pelo gate e volta com
 * decisão. Misturar as duas listas produz "aprovar o logo que o próprio
 * cliente mandou" — e alguém aprova.
 */
export type ClientMaterialView = {
  id: string;
  fileName: string;
  mimeType: string;
  /** Tamanho legível ("2,4 MB"). `null` quando não registrado. */
  size: string | null;
  /** Em linguagem de gente: "cliente", "Agente de Design". */
  uploadedBy: string;
  when: string | null;
};

/** A decisão que este card espera ou recebeu. Os quatro caminhos do contrato,
 *  mais o estado "ainda ninguém decidiu". O tipo é fechado de propósito: uma
 *  string livre aqui vira `status === "aprovado"` escrito de três jeitos. */
export type ApprovalDecision =
  | "pendente"
  | "aprovado"
  | "ajuste_pedido"
  | "reprovado"
  /** "Tenho uma dúvida" — NÃO é decisão: o card segue pendente e o prazo pausa. */
  | "duvida_aberta";

export type ApprovalView = {
  id: string;
  title: string;
  context: string;
  statusLabel: string;
  decision: ApprovalDecision;
  /** Quem decide. "Cliente" ou "Agência". */
  decidesIt: "Cliente" | "Agência";
  when: string | null;
  /**
   * QUAL PEÇA ESTÁ SENDO DECIDIDA. `null` = o card não aponta para conteúdo
   * nenhum — e nesse caso a tela NÃO desenha botão de decisão, desenha o aviso.
   * Contrato §9: "nunca exibir aprovação sem conteúdo". A regra existe porque
   * já aconteceu aqui, em 14/08: a tela deixou aprovar peça sem mostrar a arte.
   */
  content: { label: string; versionLabel: string | null; deliverableId: string | null } | null;
  /** Nota da revisão, quando houve. */
  note: string | null;
  /** Quantos comentários auditáveis o card carrega. */
  commentCount: number;
};

/** Uma sala de estratégia do cliente (`StrategyRoom`, uma por projeto). */
export type StrategyRoomView = {
  id: string;
  projectId: string;
  projectName: string;
  /** "generating" | "ready" | "failed" — traduzido. */
  statusLabel: string;
  tone: MetricTone;
  /** Resumo executivo, quando a sala terminou de rodar. */
  summary: string | null;
  /** Quantos especialistas debateram. `null` sem análise legível. */
  specialists: number | null;
  when: string | null;
};

/**
 * A ESTRATÉGIA DO CLIENTE.
 *
 * Aba nova: nem o mockup nem o porte de 14/08 a construíram. A fonte real
 * nesta casa são três, e nenhuma delas foi inventada aqui:
 *   · objetivo e público → `Briefing` (goal, audience, keyMessage, successCriteria)
 *   · posicionamento     → `BrandBrain.positioning` via ficha de marca
 *   · salas e debate     → `StrategyRoom.analysisJson`
 * O que não tem tabela — roadmap estratégico e Decision Log — sai VAZIO com o
 * motivo, nunca deduzido do que existe perto.
 */
export type StrategyView = {
  objectives: { label: string; value: string | null; source: string }[];
  positioning: string | null;
  audience: string | null;
  keyMessage: string | null;
  successCriteria: string | null;
  rooms: StrategyRoomView[];
  /** Hipóteses/oportunidades legíveis da análise das salas. */
  hypotheses: { title: string; note: string | null; roomId: string }[];
  /** Riscos e dependências declarados. Vazio quando não há fonte. */
  risks: { title: string; note: string | null }[];
};

export type IntegrationView = {
  glyph: string;
  name: string;
  scopes: string;
  statusLabel: string;
  tone: MetricTone;
  lastSync: string | null;
  /** Quantos agentes consomem essa fonte. `null` sem dado. */
  consumers: string | null;
  /**
   * A agência VÊ; só o cliente conecta, reconecta, altera ou remove
   * (CLAUDE_HANDOFF.md §27). O literal é a trava de tipo: não existe outro
   * valor possível, então nenhuma tela pode renderizar "pode editar" por
   * engano. O carregador nunca lê `accessTokenEncrypted`.
   */
  agencyAccess: "Somente leitura";
};

export type BrandView = {
  /** 0–100 ou `null` sem dado. */
  health: number | null;
  headline: string;
  tagline: string | null;
  /** Módulos do Brand OS com percentual de prontidão, ou `null`. */
  knowledge: { area: string; pct: number | null; state: "confirmed" | "mixed" | "missing" }[];
};

export type ChatMessageView = {
  id: string;
  author: string;
  side: "client" | "pm";
  when: string;
  body: string;
};

/** As áreas que têm faixa de KPI própria. Cada uma pode estar vazia.
 *  As chaves são as MESMAS 12 abas de `CLIENT_WORKSPACE_TABS` — se uma aba
 *  nova nascer sem faixa, o compilador reclama, e é para reclamar. */
export type AreaKey =
  | "overview"
  | "requests"
  | "strategy"
  | "social"
  | "branding"
  | "design"
  | "traffic"
  | "projects"
  | "approvals"
  | "deliveries"
  | "intel"
  | "integrations";

export type AreaMetrics = Record<AreaKey, Metric[]>;

export function emptyAreaMetrics(): AreaMetrics {
  return {
    overview: [], requests: [], strategy: [], social: [], branding: [],
    design: [], traffic: [], projects: [], approvals: [], deliveries: [],
    intel: [], integrations: [],
  };
}

/** O cascateamento entre agentes montado pelo Agente Project Manager.
 *  INTERNO: o handoff separa "solicitação do cliente" de "tarefa operacional
 *  do agente", e esta tela é a única das duas que mostra as duas coisas. */
export type Cascade = { requestId: string; chain: string[] };

export type AgencyClientView = {
  client: ClientIdentity;
  projects: ProjectView[];
  requests: RequestView[];
  deliverables: DeliverableView[];
  /** O que o CLIENTE mandou. Lista separada — nunca concatenada à de cima. */
  clientMaterials: ClientMaterialView[];
  approvals: ApprovalView[];
  integrations: IntegrationView[];
  brand: BrandView;
  strategy: StrategyView;
  chat: ChatMessageView[];
  results: Metric[];
  areaMetrics: AreaMetrics;
  /** Só a agência. Ver o bloco do topo: a trava real está no servidor. */
  internal: { cascade: Cascade[] };
};

export function emptyStrategyView(): StrategyView {
  return {
    objectives: [], positioning: null, audience: null, keyMessage: null,
    successCriteria: null, rooms: [], hypotheses: [], risks: [],
  };
}

/** Vista vazia — o esqueleto honesto quando ainda não há fonte ligada. */
export function emptyAgencyClientView(client: ClientIdentity): AgencyClientView {
  return {
    client,
    projects:        [],
    requests:        [],
    deliverables:    [],
    clientMaterials: [],
    approvals:       [],
    integrations:    [],
    brand:           { health: null, headline: client.name, tagline: null, knowledge: [] },
    strategy:        emptyStrategyView(),
    chat:            [],
    results:         [],
    areaMetrics:     emptyAreaMetrics(),
    internal:        { cascade: [] },
  };
}
