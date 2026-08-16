// ─── Service Catalog ──────────────────────────────────────────────────────────
// Each department of the agency is treated like its own business, with its own
// catalogue of plans and prices. This is the single source of truth for what
// each department sells and for how much — consumed by the briefing room, the
// proposal builder, and (future) a per-department catalogue management page.
//
// Today: Social Media ships as the flagship, with 5 isolated plans (a detailed
// feature matrix). Paid Traffic and Visual Identity are separate departments
// sold as add-ons. Other departments can be added here without touching the
// pricing math.
// ─────────────────────────────────────────────────────────────────────────────

import { SOCIAL_PACKAGES, type PackageDef } from "./live-calculator";
// Terceiro lugar onde a faixa dos adicionais estava digitada. Agora deriva.
import { adicionalPorId } from "./adicionais";

/** A faixa de um adicional nos nomes que este catálogo usa. */
function faixaDoAdicional(id: string): { minPrice: number; maxPrice: number } {
  const a = adicionalPorId(id);
  if (!a) throw new Error(`service-catalog.ts: adicional "${id}" não existe em adicionais.ts.`);
  return { minPrice: a.precoDe, maxPrice: a.precoAte };
}

export type DepartmentId = "social" | "traffic" | "branding";

export type PricingModel = "monthly_plan" | "monthly_addon" | "project";

export interface CatalogAddon {
  id: string;
  label: string;
  detail: string;
  minPrice: number;
  maxPrice: number;
  unit: string; // "mês" | "projeto"
}

export interface DepartmentCatalog {
  id: DepartmentId;
  name: string;
  tagline: string;
  pricingModel: PricingModel;
  // Social uses tiered plans; traffic/branding use add-on offerings.
  plans?: PackageDef[];
  addons?: CatalogAddon[];
}

export const DEPARTMENT_CATALOG: DepartmentCatalog[] = [
  {
    id: "social",
    name: "Social Media",
    tagline: "Gestão de redes sociais — o motor da presença digital da marca.",
    pricingModel: "monthly_plan",
    plans: SOCIAL_PACKAGES,
  },
  {
    id: "traffic",
    name: "Tráfego Pago",
    tagline: "Campanhas de anúncios no Meta e Google — performance e aquisição.",
    pricingModel: "monthly_addon",
    addons: [
      {
        id: "traffic-mgmt",
        label: "Gestão de Tráfego Pago",
        detail: "Setup, criação e gerenciamento mensal de campanhas (verba de mídia à parte)",
        ...faixaDoAdicional("trafficMgmt"),
        unit: "mês",
      },
    ],
  },
  {
    id: "branding",
    name: "Identidade Visual",
    tagline: "Branding e identidade — a base visual de toda a comunicação.",
    pricingModel: "project",
    addons: [
      {
        id: "branding-basic",
        label: "Identidade Visual",
        detail: "Logo, paleta, tipografia e aplicações essenciais",
        ...faixaDoAdicional("branding"),
        unit: "projeto",
      },
      {
        id: "branding-full",
        label: "Rebranding Completo",
        detail: "Brand book completo, reposicionamento e sistema visual",
        ...faixaDoAdicional("brandingFull"),
        unit: "projeto",
      },
    ],
  },
];

export function getDepartmentCatalog(id: DepartmentId): DepartmentCatalog | undefined {
  return DEPARTMENT_CATALOG.find((d) => d.id === id);
}
