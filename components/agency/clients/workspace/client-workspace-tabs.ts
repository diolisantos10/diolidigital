// ═══════════════════════════════════════════════════════════════════════════
//  CLIENT_WORKSPACE_TABS — a lista canônica das 12 abas do cliente.
//
//  UMA constante, quatro consumidores: a navegação, o deep-link, a permissão e
//  o teste. É de propósito: a versão anterior deste painel tinha a ordem das
//  abas escrita no componente e a lista de módulos escrita no documento, e as
//  duas divergiram — o mockup nunca criou "Estratégia", "Aprovações" nem
//  "Entregas", e o porte de 14/08 criou onze abas numa ordem própria. Enquanto
//  a lista morar em dois lugares, alguém vai entregar onze de novo.
//
//  ⚠️ A ORDEM É PARTE DO CONTRATO, não preferência. Ela sobe do relacionamento
//  (Visão Geral, Solicitações, Estratégia) para as áreas que produzem (Social,
//  Branding, Design, Tráfego), depois para o que atravessa todas elas
//  (Projetos, Aprovações, Entregas) e fecha nas duas de leitura (Inteligência,
//  Integrações). Mudar a ordem quebra o teste, e é para quebrar.
//
//  `Ficha do cliente` e `Chat do cliente` NÃO estão aqui: são ações do
//  cabeçalho. Se um dia virarem aba, a decisão vem antes do código.
// ═══════════════════════════════════════════════════════════════════════════

/** As áreas de escrita da agência. Uma aba pertence a UMA área; a permissão de
 *  escrita é por área, não por aba (ver `permissoes.ts`). */
export type ClientWorkspaceArea =
  | "relacionamento"
  | "estrategia"
  | "social"
  | "branding"
  | "design"
  | "trafego"
  | "operacao"
  /** Ninguém escreve pelo painel interno. Só o cliente, pelo portal dele. */
  | "somente-leitura";

export type ClientWorkspaceTabId =
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

export type ClientWorkspaceTab = {
  id: ClientWorkspaceTabId;
  /** O rótulo da trilha de abas. É o que o teste compara. */
  label: string;
  /** De quem é a escrita nesta aba. */
  area: ClientWorkspaceArea;
};

export const CLIENT_WORKSPACE_TABS: readonly ClientWorkspaceTab[] = [
  { id: "overview",     label: "Visão Geral",   area: "relacionamento" },
  { id: "requests",     label: "Solicitações",  area: "relacionamento" },
  { id: "strategy",     label: "Estratégia",    area: "estrategia" },
  { id: "social",       label: "Social Media",  area: "social" },
  { id: "branding",     label: "Branding",      area: "branding" },
  { id: "design",       label: "Design",        area: "design" },
  { id: "traffic",      label: "Tráfego Pago",  area: "trafego" },
  { id: "projects",     label: "Projetos",      area: "operacao" },
  { id: "approvals",    label: "Aprovações",    area: "operacao" },
  { id: "deliveries",   label: "Entregas",      area: "operacao" },
  { id: "intel",        label: "Inteligência",  area: "estrategia" },
  { id: "integrations", label: "Integrações",   area: "somente-leitura" },
] as const;

export const CLIENT_WORKSPACE_TAB_IDS: readonly ClientWorkspaceTabId[] =
  CLIENT_WORKSPACE_TABS.map((t) => t.id);

export const DEFAULT_CLIENT_WORKSPACE_TAB: ClientWorkspaceTabId = "overview";

/** O nome do parâmetro de deep-link. Um lugar só — a URL é contrato público:
 *  ela é colada em ticket, em mensagem de WhatsApp e em e-mail para o time. */
export const CLIENT_WORKSPACE_TAB_PARAM = "tab";

export function ehAbaDoCliente(valor: unknown): valor is ClientWorkspaceTabId {
  return typeof valor === "string" && CLIENT_WORKSPACE_TAB_IDS.includes(valor as ClientWorkspaceTabId);
}

/**
 * Lê a aba de um `?tab=`.
 *
 * Aba desconhecida CAI NA PADRÃO em vez de dar erro — e isso é decisão, não
 * preguiça: o link errado vem quase sempre de um link antigo (aba renomeada,
 * URL truncada por cliente de e-mail). Levar a pessoa para a Visão Geral é
 * melhor do que uma tela de erro para um problema que ela não causou.
 */
export function abaDaQuery(valor: string | null | undefined): ClientWorkspaceTabId {
  return ehAbaDoCliente(valor) ? valor : DEFAULT_CLIENT_WORKSPACE_TAB;
}

export function rotuloDaAba(id: ClientWorkspaceTabId): string {
  return CLIENT_WORKSPACE_TABS.find((t) => t.id === id)?.label ?? id;
}

export function areaDaAba(id: ClientWorkspaceTabId): ClientWorkspaceArea {
  return CLIENT_WORKSPACE_TABS.find((t) => t.id === id)?.area ?? "somente-leitura";
}
