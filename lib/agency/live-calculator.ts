// ─── Live Pricing Calculator V2 ───────────────────────────────────────────────
// Social Media is the flagship department: 5 isolated plans with a detailed
// feature matrix (posts, stories, reels, copy/design/calendar, reports,
// community). Paid traffic and visual identity are SEPARATE departments,
// priced as add-ons that stack on top of the social plan.
//
// Architecture note: each department is treated like its own business with its
// own catalogue — see lib/agency/service-catalog.ts. This file owns the social
// plans + the estimate math the briefing room renders in real time.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence } from "./briefing-conversation";

// ── Social Media Plans ────────────────────────────────────────────────────────

export type SocialPackage = "essencial" | "starter" | "growth" | "pro" | "premium";

export type ReportLevel = "none" | "basic" | "advanced";
export type CommunityLevel = "none" | "basic" | "full";

// ─── ⛔ ESTA TABELA NÃO NOMEIA PLANO, E ISSO É TRAVA — 16/08/2026 ─────────────
//
// Ela nomeava. `label: "Plano Starter"`, `"Plano Growth"`, `"Plano Pro"`,
// `"Plano Premium"`, `"Plano Essencial"` — cinco planos que **não existem** em
// `lib/agency/planos.ts` nem em `docs/precos.md` (o catálogo é Pulso, Ritmo,
// Presença, Conteúdo e Crescimento).
//
// E não era só nome interno. Medido por `qualidade` em 16/08, com o caminho de
// render provado ponta a ponta:
//
//   live-calculator:61  label: "Plano Starter"
//     → PublicBriefingRoom:181  pkgLabel = pkg.label
//     → PublicBriefingRoom:247  <span>Plano</span> <span>{pkgLabel}</span>
//     → ScopeSection montado em :1750, na tela pública do prospect
//
// Disparava para **qualquer prospect com 15 a 24 posts/mês**. E viajava para o
// registro: `buildTitle` empurrava o mesmo rótulo para o `title`, e
// "Orçamento — <negócio> — Plano Starter" chegava à caixa da equipe e ao portal.
//
// O incidente original desta rodada inteira, vivo, num widget que ninguém tinha
// olhado — porque o portão da rodada anterior grepava `QUICK_ACTIONS`, que é
// onde alguém já tinha olhado. **Portão que vigia onde você olhou não é portão.**
//
// A regra que fica: `label` aqui descreve **CADÊNCIA**, não produto. Quem nomeia
// produto é `planos.ts`, e só ele. O portão que impede a volta roda sobre o que
// RENDERIZA e o que PERSISTE:
// `__tests__/comercial/o-plano-fantasma-nao-chega-na-tela.test.ts`.
export interface PackageDef {
  id: SocialPackage;
  /** A CADÊNCIA, em linguagem de cliente. **Nunca um nome de plano** — ver o
   *  bloco acima. `nomesDePlanoForaDoCatalogo` reprova qualquer invenção. */
  label: string;
  postsPerWeek: number;    // primary cadence shown to clients
  storiesPerWeek: number;
  postsPerMonth: number;   // = postsPerWeek * 4 (derived, kept for legacy reads)
  storiesPerMonth: number; // = storiesPerWeek * 4
  reelsPerMonth: number;   // reels included in the plan
  copy: boolean;           // copywriting (textos) included
  design: boolean;         // custom design / artes
  calendar: boolean;       // editorial calendar / strategy
  reports: ReportLevel;    // monthly metrics report
  community: CommunityLevel; // comment / DM management
  minPrice: number;
  maxPrice: number;
  description: string;
}

// Agency-grade volume (per week), startup-friendly pricing. Cadence is weekly
// because that's how a real operation runs — not a handful of posts a month.
export const SOCIAL_PACKAGES: PackageDef[] = [
  {
    id: "essencial",
    label: "3 posts/semana",
    postsPerWeek: 3,
    storiesPerWeek: 5,
    postsPerMonth: 12,
    storiesPerMonth: 20,
    reelsPerMonth: 2,
    copy: true,
    design: true,
    calendar: false,
    reports: "none",
    community: "none",
    minPrice: 600,
    maxPrice: 900,
    description: "3 posts + 5 stories/semana + 2 reels/mês — presença consistente",
  },
  {
    id: "starter",
    label: "5 posts/semana",
    postsPerWeek: 5,
    storiesPerWeek: 7,
    postsPerMonth: 20,
    storiesPerMonth: 28,
    reelsPerMonth: 4,
    copy: true,
    design: true,
    calendar: true,
    reports: "basic",
    community: "none",
    minPrice: 900,
    maxPrice: 1400,
    description: "5 posts + 7 stories/semana + 4 reels/mês — ritmo profissional",
  },
  {
    id: "growth",
    label: "7 posts/semana",
    postsPerWeek: 7,
    storiesPerWeek: 10,
    postsPerMonth: 28,
    storiesPerMonth: 40,
    reelsPerMonth: 6,
    copy: true,
    design: true,
    calendar: true,
    reports: "basic",
    community: "basic",
    minPrice: 1500,
    maxPrice: 2400,
    description: "1 post/dia + 10 stories/semana + 6 reels/mês — ritmo constante",
  },
  {
    id: "pro",
    label: "10 posts/semana",
    postsPerWeek: 10,
    storiesPerWeek: 14,
    postsPerMonth: 40,
    storiesPerMonth: 56,
    reelsPerMonth: 10,
    copy: true,
    design: true,
    calendar: true,
    reports: "advanced",
    community: "full",
    minPrice: 2500,
    maxPrice: 4000,
    description: "10 posts + 14 stories/semana + 10 reels/mês — presença forte",
  },
  {
    id: "premium",
    label: "15 posts/semana",
    postsPerWeek: 15,
    storiesPerWeek: 21,
    postsPerMonth: 60,
    storiesPerMonth: 84,
    reelsPerMonth: 16,
    copy: true,
    design: true,
    calendar: true,
    reports: "advanced",
    community: "full",
    minPrice: 4000,
    maxPrice: 6500,
    description: "15 posts + 21 stories/semana + 16 reels/mês — operação de marca completa",
  },
];

// Receives posts-per-MONTH (scope stores postsPerWeek; estimate passes *4).
export function detectPackage(postsPerMonth: number): SocialPackage {
  if (postsPerMonth <= 14) return "essencial"; // ~3/semana
  if (postsPerMonth <= 24) return "starter";   // ~5/semana
  if (postsPerMonth <= 34) return "growth";    // ~7/semana
  if (postsPerMonth <= 50) return "pro";       // ~10/semana
  return "premium";                             // 15+/semana
}

export function getPackageDef(id: SocialPackage): PackageDef {
  return SOCIAL_PACKAGES.find((p) => p.id === id)!;
}

// Human-readable labels for the matrix levels.
export const REPORT_LABEL: Record<ReportLevel, string> = {
  none: "—",
  basic: "Mensal",
  advanced: "Avançado",
};
export const COMMUNITY_LABEL: Record<CommunityLevel, string> = {
  none: "—",
  basic: "Básica",
  full: "Completa",
};

// ── Add-on prices (separate departments) ──────────────────────────────────────

const P = {
  reel:         { min:  150, max:  400 }, // extra reel beyond the plan
  trafficMgmt:  { min:  500, max: 1200 }, // paid-traffic management fee
  branding:     { min: 1200, max: 2500 }, // visual identity
  brandingFull: { min: 2000, max: 4000 }, // full brand book / rebrand
};

// ── Main export ───────────────────────────────────────────────────────────────

export function computeEstimate(scope: BriefingScope): LiveEstimate {
  const items: EstimateItem[] = [];
  const included: string[]    = [];
  const notIncluded: string[] = [];
  const missing: string[]     = [];
  let totalMin = 0;
  let totalMax = 0;

  // ── Social Media (flagship department) ──────────────────────────────────────
  if (scope.wantsSocialMedia) {
    const s = scope.social;

    if (s?.postsPerWeek === undefined) {
      missing.push("Frequência de posts por semana");
    } else {
      const postsPerMonth = s.postsPerWeek * 4;
      const pkgId = detectPackage(postsPerMonth);
      const pkg   = getPackageDef(pkgId);

      items.push({
        label:    pkg.label,
        detail:   `${pkg.postsPerWeek} posts + ${pkg.storiesPerWeek} stories/semana${pkg.reelsPerMonth > 0 ? ` · ${pkg.reelsPerMonth} reels/mês` : ""}`,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
        unit:     "mês",
      });
      totalMin += pkg.minPrice;
      totalMax += pkg.maxPrice;

      included.push(`${pkg.postsPerWeek} posts/semana (${pkg.postsPerMonth}/mês)`);
      included.push(`${pkg.storiesPerWeek} stories/semana`);
      if (pkg.reelsPerMonth > 0) included.push(`${pkg.reelsPerMonth} reels/mês (edição)`);
      if (pkg.copy)     included.push("Copywriting (textos)");
      if (pkg.design)   included.push("Design personalizado das artes");
      if (pkg.calendar) included.push("Calendário editorial e estratégia");
      if (pkg.reports !== "none")
        included.push(pkg.reports === "advanced" ? "Relatório mensal avançado" : "Relatório mensal de métricas");
      if (pkg.community !== "none")
        included.push(pkg.community === "full" ? "Gestão de comunidade completa" : "Gestão de comunidade (básica)");

      // Client-side overrides
      if (s.needsCopy === false) notIncluded.push("Copy — fornecida pelo cliente");
      if (s.hasPhotos === false) notIncluded.push("Produção fotográfica (orçar separado)");

      // Extra reels beyond what the plan includes → add-on
      if (s.reelsPerMonth !== undefined && s.reelsPerMonth > pkg.reelsPerMonth) {
        const extra = s.reelsPerMonth - pkg.reelsPerMonth;
        const rMin  = extra * P.reel.min;
        const rMax  = extra * P.reel.max;
        items.push({
          label:    `Reels extras (${extra}/mês)`,
          detail:   "Além do incluso no plano",
          minPrice: rMin,
          maxPrice: rMax,
          unit:     "mês",
        });
        totalMin += rMin;
        totalMax += rMax;
        included.push(`${s.reelsPerMonth} reels/mês no total`);
      }
    }
  }

  // ── Paid Traffic (separate department) ──────────────────────────────────────
  if (scope.wantsPaidTraffic) {
    if (!scope.traffic?.monthlyAdBudget) {
      missing.push("Verba mensal de anúncios");
    } else {
      items.push({
        label:    "Tráfego Pago — gestão",
        detail:   "Setup + gerenciamento mensal",
        minPrice: P.trafficMgmt.min,
        maxPrice: P.trafficMgmt.max,
        unit:     "mês",
      });
      totalMin += P.trafficMgmt.min;
      totalMax += P.trafficMgmt.max;
      included.push("Criação e gestão de campanhas pagas");
      included.push("Otimização e relatórios mensais");
      notIncluded.push(`Verba de mídia: ${scope.traffic.monthlyAdBudget} (pago direto ao Google/Meta)`);
    }
  }

  // ── Visual Identity (separate department) — only if requested ───────────────
  // `branding` é opcional no escopo: um briefing que não fala de identidade
  // visual simplesmente não traz o bloco. Sem o `?.`, a proposta INTEIRA
  // quebrava com "Cannot read properties of undefined" — e o briefing sem
  // branding é o caso comum, não a exceção. Encontrado ao rodar o primeiro
  // projeto de verdade em produção, não em teste.
  if (scope.branding?.requested) {
    const bp = scope.branding.wantsRebrand ? P.brandingFull : P.branding;
    items.push({
      label:    "Identidade Visual",
      detail:   scope.branding.wantsRebrand ? "Rebranding completo" : "Criação de identidade visual",
      minPrice: bp.min,
      maxPrice: bp.max,
      unit:     "projeto",
    });
    totalMin += bp.min;
    totalMax += bp.max;
    included.push("Identidade visual completa");
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence: EstimateConfidence = "none";
  if (totalMin > 0) {
    if (missing.length === 0)     confidence = "high";
    else if (missing.length <= 2) confidence = "medium";
    else                           confidence = "low";
  }

  // ── Negotiated discount (client-visible final price) ────────────────────────
  // The SDR grants the discount %; the floor/margin guardrail is enforced
  // server-side (pricing-margins.ts) before the % ever reaches the scope.
  const neg = scope.negotiation;
  let discountPct: number | undefined;
  let discountReason: string | undefined;
  let discountedMin: number | undefined;
  let discountedMax: number | undefined;
  if (neg?.discountPct && neg.discountPct > 0 && totalMin > 0) {
    discountPct = Math.min(40, Math.round(neg.discountPct));
    discountReason = neg.discountReason;
    discountedMin = Math.round(totalMin * (1 - discountPct / 100));
    discountedMax = Math.round(totalMax * (1 - discountPct / 100));
  }

  return {
    items, totalMin, totalMax, confidence,
    missingForEstimate: missing, included, notIncluded,
    discountPct, discountReason, discountedMin, discountedMax,
  };
}
