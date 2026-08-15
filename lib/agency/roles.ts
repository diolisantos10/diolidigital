// ─── Agency Role Model ────────────────────────────────────────────────────────
//
// O papel é o que vem no JWT da sessão (`lib/auth/session.ts`) e no campo
// `User.role` do banco. Ele NÃO é mais a régua de permissão — é a chave que
// traduz uma pessoa (ou um agente) para os dois eixos que decidem tudo:
// AUTORIDADE × DEPARTAMENTO, em `lib/agency/organizacao/`.
//
// ── O que mudou, e por quê ──────────────────────────────────────────────────
//
// `ROLE_NAV_ALLOWLIST` era uma tabela de URLs escrita à mão, papel por papel.
// Ela tinha dois defeitos que só apareciam com o tempo:
//   1. tela nova nascia invisível para quase todo mundo, porque acrescentar a
//      URL em seis listas é fácil de esquecer e não quebra teste nenhum;
//   2. ela filtrava só o MENU. A URL digitada na barra de endereço entrava.
// Hoje ela é DERIVADA do inventário de páginas, e as três camadas (menu,
// página e API) leem a mesma regra. Ver `organizacao/paginas.ts`.
//
// "client" é o papel do portal e NUNCA aparece no seletor interno — ele nem
// chega a existir como `AgencyRole`, o que é a razão de `isAgencyRole()`
// (derivado de `ROLE_PERMISSIONS`) recusar o login de um usuário-cliente na
// área da agência.
// ─────────────────────────────────────────────────────────────────────────────

import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";
import type { Autoridade, PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { eDirecao } from "@/lib/agency/organizacao/autoridade";
import { rotasVisiveis } from "@/lib/agency/organizacao/paginas";

export type AgencyRole =
  | "master"
  | "diretor"
  | "project_manager"
  | "executivo_comercial"
  | "social_staff"
  | "design_staff"
  | "ads_staff";

export const AGENCY_ROLE_OPTIONS: { id: AgencyRole; label: string; description: string }[] = [
  { id: "master",              label: "Master",          description: "Acesso total — todas as seções e ações." },
  { id: "diretor",             label: "Diretor",         description: "Direção da agência — todas as telas, atuais e novas." },
  { id: "project_manager",     label: "Project Manager", description: "Visão transversal: distribui, conecta e cobra entrega." },
  { id: "executivo_comercial", label: "Atendimento",     description: "Porta da frente: solicitação, qualificação e onboarding." },
  { id: "social_staff",        label: "Social Media",    description: "Opera Social Media; consulta as demais áreas." },
  { id: "design_staff",        label: "Design",          description: "Opera Design e Branding; consulta as demais áreas." },
  { id: "ads_staff",           label: "Tráfego Pago",    description: "Opera Tráfego Pago; consulta as demais áreas." },
];

// ─── Papel → os dois eixos ────────────────────────────────────────────────────
//
// ⚠️ É A ÚNICA TABELA QUE UM PAPEL NOVO PRECISA TOCAR.
//
// `Record<AgencyRole, …>` faz o TypeScript reprovar papel novo sem perfil —
// que é exatamente o buraco que entregou JWT de master a `executivo_comercial`
// quando ele existia em `roles.ts` e faltava na lista copiada de `session.ts`.
//
// `departamentos` = onde o papel ESCREVE. Ler é global para todo perfil
// interno e não se declara aqui.

export const PERFIL_DO_PAPEL: Record<AgencyRole, PerfilOrganizacional> = {
  master:  { autoridade: "master",   departamentos: [] },
  diretor: { autoridade: "director", departamentos: [] },
  // O PM coordena a casa inteira, e responde tecnicamente por Gestão de
  // Projetos, Estratégia e Branding — que é exatamente o que `ownerRoles`
  // dizia nas definições de departamento antes desta consolidação.
  project_manager:     { autoridade: "project_manager", departamentos: ["project-management", "strategy", "brand-hub"] },
  executivo_comercial: { autoridade: "department_member", departamentos: ["client-service-sdr"] },
  social_staff:        { autoridade: "department_member", departamentos: ["social-media"] },
  // Design responde também pelo Brand Hub desde que ele nasceu. Tirar
  // "brand-hub" daqui removeria acesso que existe hoje.
  design_staff:        { autoridade: "department_member", departamentos: ["design", "brand-hub"] },
  ads_staff:           { autoridade: "department_member", departamentos: ["paid-traffic"] },
};

export function perfilDoPapel(role: AgencyRole): PerfilOrganizacional {
  return PERFIL_DO_PAPEL[role];
}

export function autoridadeDoPapel(role: AgencyRole): Autoridade {
  return PERFIL_DO_PAPEL[role].autoridade;
}

/**
 * Os papéis que respondem por um departamento.
 *
 * Substitui os `ownerRoles` escritos à mão em `departments.ts` — sete arrays
 * que precisavam ser editados juntos a cada papel novo, e que já divergiam.
 */
export function donosDoDepartamento(dept: DepartamentoId): AgencyRole[] {
  return (Object.keys(PERFIL_DO_PAPEL) as AgencyRole[]).filter((role) => {
    const perfil = PERFIL_DO_PAPEL[role];
    // Gestão responde por tudo: master e diretor por autoridade, o PM porque é
    // ele quem cobra a entrega de qualquer área.
    if (eDirecao(perfil.autoridade) || perfil.autoridade === "project_manager") return true;
    return perfil.departamentos.includes(dept);
  });
}

// ─── Nav allowlist ────────────────────────────────────────────────────────────
// "all" = every nav href is visible. An array = only those hrefs are visible
// (prefix-matched — /agency/deliverables matches /agency/deliverables/*).
//
// DERIVADA. Não edite este objeto: para mudar o que um papel vê, mude o perfil
// acima ou o inventário em `organizacao/paginas.ts`.

// ── CONFLITO RESOLVIDO PELO DIRETOR EM 15/08/2026 ──────────────────────────
//
// Dois blocos da mesma madrugada mexeram nesta constante sem se ver:
//
//   • o Dashboard Interno do Cliente ACRESCENTOU `/agency/clients` às três
//     listas de departamento à mão, para cumprir a exigência do contrato de
//     que todo departamento consulte o contexto produzido pelos outros;
//   • a Central de Trabalho APAGOU as listas à mão e passou a DERIVAR tudo de
//     `PERFIL_DO_PAPEL` + `organizacao/paginas.ts`, para cumprir a exigência do
//     contrato de que exista uma fonte canônica e nenhuma contagem fixa.
//
// Ficou a versão derivada — é a estruturalmente certa e é a que o contrato
// pede. **Mas ela só vale se o direito que o outro bloco acrescentou continuar
// existindo depois da derivação**, e isso eu não presumi: conferi.
// `/agency/clients` está declarada `acesso: "todos_internos"`
// (`organizacao/paginas.ts:110`), então os três departamentos continuam
// alcançando a página do cliente. O direito sobreviveu à troca de mecanismo.
//
// Se tivesse ficado de fora, o merge teria apagado uma exigência de contrato
// em silêncio, sem conflito visível e com a suíte verde — que é exatamente o
// defeito que esta casa passou a noite inteira caçando.
export const ROLE_NAV_ALLOWLIST: Record<AgencyRole, string[] | "all"> = Object.fromEntries(
  (Object.keys(PERFIL_DO_PAPEL) as AgencyRole[]).map((role) => {
    const perfil = PERFIL_DO_PAPEL[role];
    // Master e Diretor alcançam rota que ainda nem foi registrada — "all" é
    // literal, não atalho.
    return [role, eDirecao(perfil.autoridade) ? "all" : rotasVisiveis(perfil)];
  }),
) as Record<AgencyRole, string[] | "all">;

export function isNavAllowed(role: AgencyRole, href: string): boolean {
  const list = ROLE_NAV_ALLOWLIST[role];
  if (list === "all") return true;
  return list.some((allowed) => href === allowed || href.startsWith(allowed + "/") || href.startsWith(allowed + "?"));
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export interface RolePermissions {
  canEditBrandHub: boolean;
  canApplyBrandUpdate: boolean;
  canViewStrategicNotes: boolean;
  canViewDiagnostics: boolean;
  canViewAllClients: boolean;
  canResetStore: boolean;
  agentFilter: string[] | "all";  // which agent IDs this role can act on
}

export const ROLE_PERMISSIONS: Record<AgencyRole, RolePermissions> = {
  master: {
    canEditBrandHub:       true,
    canApplyBrandUpdate:   true,
    canViewStrategicNotes: true,
    canViewDiagnostics:    true,
    canViewAllClients:     true,
    canResetStore:         true,
    agentFilter:           "all",
  },
  // Direção. O contrato do CEO é explícito: "acesso completo a todas as rotas
  // atuais e futuras em /agency/**". Mesma amplitude do master.
  diretor: {
    canEditBrandHub:       true,
    canApplyBrandUpdate:   true,
    canViewStrategicNotes: true,
    canViewDiagnostics:    true,
    canViewAllClients:     true,
    canResetStore:         true,
    agentFilter:           "all",
  },
  project_manager: {
    canEditBrandHub:       true,
    canApplyBrandUpdate:   true,
    canViewStrategicNotes: true,
    canViewDiagnostics:    false,
    canViewAllClients:     true,
    canResetStore:         false,
    agentFilter:           "all",
  },
  executivo_comercial: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    canViewAllClients:     true,
    canResetStore:         false,
    agentFilter:           "all",
  },
  social_staff: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    // ⚠️ Era `false`. O CEO decidiu em 14/08/2026 que TODOS os departamentos
    // enxergam TODOS os clientes — a edição é que fica presa à área. Ver
    // `podeVerTodosOsClientes()` em organizacao/autoridade.ts, que é a régua.
    canViewAllClients:     true,
    canResetStore:         false,
    agentFilter:           ["a3"],
  },
  design_staff: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    // ⚠️ Era `false`. O CEO decidiu em 14/08/2026 que TODOS os departamentos
    // enxergam TODOS os clientes — a edição é que fica presa à área. Ver
    // `podeVerTodosOsClientes()` em organizacao/autoridade.ts, que é a régua.
    canViewAllClients:     true,
    canResetStore:         false,
    agentFilter:           ["a2"],
  },
  ads_staff: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    // ⚠️ Era `false`. O CEO decidiu em 14/08/2026 que TODOS os departamentos
    // enxergam TODOS os clientes — a edição é que fica presa à área. Ver
    // `podeVerTodosOsClientes()` em organizacao/autoridade.ts, que é a régua.
    canViewAllClients:     true,
    canResetStore:         false,
    agentFilter:           ["a4"],
  },
};

export function getRolePermissions(role: AgencyRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

/**
 * O texto é um papel conhecido da agência?
 *
 * Versão PURA — sem `next/headers`, sem `server-only` — para que componentes de
 * cliente possam validar o papel que veio da sessão antes de usá-lo como chave.
 * `isAgencyRole()` em `lib/auth/session.ts` delega para cá: uma lista só.
 *
 * Derivar de `ROLE_PERMISSIONS` (que o TypeScript obriga a ter uma entrada por
 * `AgencyRole`) é o que impede um papel novo de nascer "desconhecido" — o bug
 * que já entregou JWT de master a `executivo_comercial`.
 */
export function ehPapelDaAgencia(role: string): role is AgencyRole {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

// ─── Portal-safe brand fields ─────────────────────────────────────────────────
// Subset of BrandBrain fields that clients can view and suggest updates to.
// strategicNotes is always internal-only.

export const PORTAL_SAFE_BRAND_FIELDS = [
  "businessSummary",
  "positioning",
  "targetAudience",
  "toneOfVoice",
  "visualStyle",
  "colors",
  "fonts",
  "productsToHighlight",
  "preferredChannels",
  "references",
] as const;

export type PortalSafeBrandField = typeof PORTAL_SAFE_BRAND_FIELDS[number];

export const BRAND_FIELD_LABELS: Record<string, string> = {
  businessSummary:     "Resumo do Negócio",
  positioning:         "Posicionamento",
  targetAudience:      "Público-Alvo",
  toneOfVoice:         "Tom de Voz",
  visualStyle:         "Estilo Visual",
  colors:              "Cores da Marca",
  fonts:               "Tipografia",
  productsToHighlight: "Produtos em Destaque",
  preferredChannels:   "Canais Preferenciais",
  references:          "Referências e Assets",
  brandRules:          "Regras de Marca",
  thingsToAvoid:       "O que Evitar",
  strategicNotes:      "Notas Estratégicas",
};
