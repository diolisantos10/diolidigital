// ─── Pricing Margin Intelligence (INTERNAL — never client-facing) ─────────────
//
// SERVER-SIDE / INTERNAL ONLY. This module is the SDR's negotiation brain: it
// knows the internal cost to deliver each service, the margin at every price
// point, and the absolute floor the SDR may discount to without breaching
// profitability.
//
// CRITICAL: none of this data is ever rendered in the public briefing panel.
// The prospect only ever sees the final (possibly discounted) price. Cost basis,
// margin %, and floor price are negotiation levers the SDR reasons with — they
// stay on the server (the /api/sdr/chat route) and in internal agency screens.
//
// The client-facing price ranges live in live-calculator.ts (minPrice/maxPrice).
// This module overlays the hidden economics on top of those ids.
// ─────────────────────────────────────────────────────────────────────────────

import { SOCIAL_PACKAGES, type SocialPackage } from "./live-calculator";

// ── Margin profile ────────────────────────────────────────────────────────────
// For each sellable line, we model:
//   costBasis  — internal monthly cost to deliver (AI + human review + tools + overhead)
//   floorPrice — the lowest the SDR may EVER sell at (protects a healthy margin)
//   targetPrice— the ideal sell price the SDR anchors toward
// The client-facing minPrice/maxPrice sit between floorPrice and targetPrice.

export interface MarginProfile {
  costBasis: number;
  floorPrice: number;
  targetPrice: number;
}

// Social plans — cost basis reflects an AI-native operation (low marginal cost,
// high margin). Floor is ~1.6–1.8× cost so even the deepest discount stays
// comfortably profitable. Target is at/above the client-facing maxPrice.
export const SOCIAL_MARGINS: Record<SocialPackage, MarginProfile> = {
  essencial: { costBasis: 280,  floorPrice: 520,  targetPrice: 900  },
  starter:   { costBasis: 420,  floorPrice: 820,  targetPrice: 1400 },
  growth:    { costBasis: 620,  floorPrice: 1300, targetPrice: 2400 },
  pro:       { costBasis: 980,  floorPrice: 2200, targetPrice: 4000 },
  premium:   { costBasis: 1500, floorPrice: 3600, targetPrice: 6500 },
};

// Add-on departments.
export const ADDON_MARGINS = {
  trafficMgmt:  { costBasis: 220, floorPrice: 450,  targetPrice: 1200 },
  branding:     { costBasis: 480, floorPrice: 1050, targetPrice: 2500 },
  brandingFull: { costBasis: 820, floorPrice: 1750, targetPrice: 4000 },
} as const;

// ── Discount levers ───────────────────────────────────────────────────────────
// Legitimate reasons the SDR may apply a discount. Each has a max percentage.
// They STACK, but the combined discount can never push price below floorPrice.
// The SDR chooses which to offer based on what the prospect commits to.

export type DiscountLeverId =
  | "annual_commitment"
  | "multi_service"
  | "upfront_quarter"
  | "first_in_segment"
  | "founder_referral";

export interface DiscountLever {
  id: DiscountLeverId;
  label: string;
  maxPct: number;          // maximum discount this lever justifies
  requires: string;        // what the prospect must commit to
  internalNote: string;    // guidance for the SDR on when to deploy it
}

export const DISCOUNT_LEVERS: DiscountLever[] = [
  {
    id: "annual_commitment",
    label: "Compromisso anual",
    maxPct: 12,
    requires: "Contrato de 12 meses (em vez de mês a mês)",
    internalNote: "Melhor lever — garante previsibilidade de caixa. Ofereça primeiro quando o cliente hesita no preço mensal.",
  },
  {
    id: "multi_service",
    label: "Pacote multi-serviço",
    maxPct: 10,
    requires: "Contratar 2+ departamentos (ex.: social + tráfego, ou social + branding)",
    internalNote: "Aumenta ticket total mesmo com desconto %. Use para subir o cliente de um serviço só para um pacote.",
  },
  {
    id: "upfront_quarter",
    label: "Pagamento trimestral antecipado",
    maxPct: 7,
    requires: "Pagar 3 meses adiantados",
    internalNote: "Bom para fluxo de caixa. Combine com compromisso anual para clientes confiantes.",
  },
  {
    id: "first_in_segment",
    label: "Case piloto no segmento",
    maxPct: 6,
    requires: "Autorizar uso como case/portfólio no segmento dele",
    internalNote: "Use quando o segmento é novo para a Dioli e o case tem valor estratégico. Não use com cliente que já pediu sigilo.",
  },
  {
    id: "founder_referral",
    label: "Indicação / relacionamento",
    maxPct: 5,
    requires: "Veio por indicação ou traz potencial de novas indicações",
    internalNote: "Lever de relacionamento. Pequeno, mas gera reciprocidade e mais leads.",
  },
];

export function getDiscountLever(id: DiscountLeverId): DiscountLever | undefined {
  return DISCOUNT_LEVERS.find((l) => l.id === id);
}

// ── Margin math ───────────────────────────────────────────────────────────────

export function marginPct(sellPrice: number, costBasis: number): number {
  if (sellPrice <= 0) return 0;
  return Math.round(((sellPrice - costBasis) / sellPrice) * 100);
}

export type MarginHealth = "healthy" | "thin" | "below_floor";

// Classifies a proposed sell price against a profile. "below_floor" means the
// SDR is not authorized to sell here — escalate to a human.
export function classifyMargin(sellPrice: number, profile: MarginProfile): MarginHealth {
  if (sellPrice < profile.floorPrice) return "below_floor";
  const pct = marginPct(sellPrice, profile.costBasis);
  return pct >= 55 ? "healthy" : "thin";
}

// ── Aggregate floor for a full scope ──────────────────────────────────────────
// Given the social package id and which add-ons are active, returns the total
// floor price across the whole deal. The SDR must never quote below this sum.

export interface DealFloor {
  totalCost: number;
  totalFloor: number;
  totalTarget: number;
  lines: { label: string; cost: number; floor: number; target: number }[];
}

export function computeDealFloor(args: {
  socialPackage?: SocialPackage;
  extraReels?: number;
  wantsTraffic?: boolean;
  wantsBranding?: boolean;
  wantsRebrand?: boolean;
}): DealFloor {
  const lines: DealFloor["lines"] = [];
  let totalCost = 0;
  let totalFloor = 0;
  let totalTarget = 0;

  const add = (label: string, p: { costBasis: number; floorPrice: number; targetPrice: number }) => {
    lines.push({ label, cost: p.costBasis, floor: p.floorPrice, target: p.targetPrice });
    totalCost += p.costBasis;
    totalFloor += p.floorPrice;
    totalTarget += p.targetPrice;
  };

  if (args.socialPackage) {
    const pkg = SOCIAL_PACKAGES.find((p) => p.id === args.socialPackage);
    add(pkg?.label ?? "Plano Social", SOCIAL_MARGINS[args.socialPackage]);
  }
  // Extra reels: thin-margin add-on (~R$120 cost each, floor ~R$200).
  if (args.extraReels && args.extraReels > 0) {
    const cost = args.extraReels * 120;
    const floor = args.extraReels * 200;
    const target = args.extraReels * 400;
    lines.push({ label: `Reels extras (${args.extraReels})`, cost, floor, target });
    totalCost += cost; totalFloor += floor; totalTarget += target;
  }
  if (args.wantsTraffic) add("Tráfego Pago — gestão", ADDON_MARGINS.trafficMgmt);
  if (args.wantsBranding) {
    add("Identidade Visual", args.wantsRebrand ? ADDON_MARGINS.brandingFull : ADDON_MARGINS.branding);
  }

  return { totalCost, totalFloor, totalTarget, lines };
}

// ── Discount resolution ───────────────────────────────────────────────────────
// Given a base price (sum of target/list prices) and the levers the prospect
// qualifies for, returns the maximum discount the SDR may grant WITHOUT breaching
// the deal floor. This is the hard guardrail the negotiation operates within.

export interface DiscountDecision {
  appliedPct: number;        // final discount % the SDR may grant
  appliedLevers: DiscountLeverId[];
  finalPrice: number;        // basePrice after discount
  floorPrice: number;        // the floor it was clamped against
  clampedToFloor: boolean;   // true if the requested discount hit the floor
  marginPctAtFinal: number;
}

export function resolveDiscount(args: {
  basePrice: number;         // the price being discounted from (usually target/list)
  costBasis: number;
  floorPrice: number;
  levers: DiscountLeverId[];
}): DiscountDecision {
  const { basePrice, costBasis, floorPrice } = args;

  // Sum the max % of each qualifying lever, capped at a sane 25% ceiling.
  const requestedPct = Math.min(
    25,
    args.levers.reduce((sum, id) => sum + (getDiscountLever(id)?.maxPct ?? 0), 0),
  );

  const priceAtRequested = basePrice * (1 - requestedPct / 100);
  const clampedToFloor = priceAtRequested < floorPrice;
  const finalPrice = Math.max(floorPrice, Math.round(priceAtRequested));
  const appliedPct = basePrice > 0 ? Math.round(((basePrice - finalPrice) / basePrice) * 100) : 0;

  return {
    appliedPct,
    appliedLevers: args.levers,
    finalPrice,
    floorPrice,
    clampedToFloor,
    marginPctAtFinal: marginPct(finalPrice, costBasis),
  };
}
