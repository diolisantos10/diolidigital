// ─── Agency Role Model ────────────────────────────────────────────────────────
//
// Defines the five internal roles and one portal role (client).
// No real auth — roles are simulated via a store selector ("Visualizar como")
// in the sidebar. This is a testing/preview tool for V1.
//
// "client" is always the portal-only role — it never appears in the
// internal role selector.
// ─────────────────────────────────────────────────────────────────────────────

export type AgencyRole =
  | "master"
  | "project_manager"
  | "social_staff"
  | "design_staff"
  | "ads_staff";

export const AGENCY_ROLE_OPTIONS: { id: AgencyRole; label: string; description: string }[] = [
  { id: "master",          label: "Master",          description: "Acesso total — todas as seções e ações." },
  { id: "project_manager", label: "Project Manager", description: "Operações de projeto e Brand Hub." },
  { id: "social_staff",    label: "Social",          description: "Social Media Agent + entregas próprias." },
  { id: "design_staff",    label: "Design",          description: "Design Agent + entregas próprias." },
  { id: "ads_staff",       label: "Ads",             description: "Ads Agent + entregas próprias." },
];

// ─── Nav allowlist ────────────────────────────────────────────────────────────
// "all" = every nav href is visible. An array = only those hrefs are visible
// (prefix-matched — /agency/deliverables matches /agency/deliverables/*).

export const ROLE_NAV_ALLOWLIST: Record<AgencyRole, string[] | "all"> = {
  master:          "all",
  project_manager: "all",
  social_staff:    ["/agency/dashboard", "/agency/social-media-agent", "/agency/deliverables", "/agency/settings"],
  design_staff:    ["/agency/dashboard", "/agency/design-agent",       "/agency/deliverables", "/agency/settings"],
  ads_staff:       ["/agency/dashboard", "/agency/ads-agent",          "/agency/deliverables", "/agency/settings"],
};

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
  project_manager: {
    canEditBrandHub:       true,
    canApplyBrandUpdate:   true,
    canViewStrategicNotes: true,
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
    canViewAllClients:     false,
    canResetStore:         false,
    agentFilter:           ["a3"],
  },
  design_staff: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    canViewAllClients:     false,
    canResetStore:         false,
    agentFilter:           ["a2"],
  },
  ads_staff: {
    canEditBrandHub:       false,
    canApplyBrandUpdate:   false,
    canViewStrategicNotes: false,
    canViewDiagnostics:    false,
    canViewAllClients:     false,
    canResetStore:         false,
    agentFilter:           ["a4"],
  },
};

export function getRolePermissions(role: AgencyRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
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
