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
import { PLANOS } from "./planos";
import { PRECO_DE_TABELA_USD } from "@/lib/ai/precos";

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

// ── O CUSTO MEDIDO, E O QUE AINDA NÃO É MEDIÇÃO (25/08/2026) ────────────────
//
// `costBasis` era um número redondo herdado, sem procedência. A medição do
// ciclo de 32 peças deu o custo REAL de IA da casa: **~R$ 1,30 por peça** entre
// texto e imagem — R$ 16 no Essencial, R$ 26 no Crescimento, R$ 42 no Completo.
// É esse número que dissolveu a dívida da vitrine: 32 peças custam ~R$ 45
// contra um plano de R$ 1.790. O limite de 12 peças/mês nunca foi de dinheiro.
//
// ⚠️ O que está aqui é o custo de IA MEDIDO mais uma folga declarada para
// ferramenta e revisão. **Hora de gente NÃO está medida nesta casa** e por isso
// não está somada — somar um número que ninguém mediu faria a margem parecer
// pior ou melhor por invenção, e as duas mentem. Quando houver medição de hora,
// ela entra aqui com procedência, como esta entrou.
//
// `floorPrice` é ~70% do preço de tabela: é piso COMERCIAL (o quanto a casa
// aceita descontar), não piso de custo — a distância entre os dois é o que
// torna o desconto possível sem virar prejuízo.
// ── ⚠️ DERIVADO DA TABELA ÚNICA (26/08/2026) ────────────────────────────────
//
// `targetPrice` era digitado aqui: 590 · 990 · 1790 — a MESMA segunda tabela de
// `live-calculator`, numa terceira cópia. Margem calculada contra um preço que
// a casa não cobra não mede margem nenhuma.
//
// Agora o preço-alvo é o preço da vitrine, e o `costBasis` é a conta de IA de
// verdade: `PRECO_DE_TABELA_USD.quadrada` (US$ 0,167 por peça) × as peças do
// plano, convertido pela taxa declarada abaixo — não mais um número redondo
// sem procedência.
//
// ⚠️ E CONTINUA VALENDO o que o cabeçalho já dizia: **hora de gente NÃO está
// medida nesta casa** e não está somada. É o custo real do Presença e do
// Conteúdo, e ele é dívida declarada, não número omitido.

/** A taxa usada para trazer o custo de IA (cobrado em USD) para a moeda da
 *  tabela. Declarada como constante para a conta poder ser refeita por quem
 *  ler — número de câmbio escondido dentro de uma multiplicação é palpite. */
export const USD_EM_REAIS = 5.6;

/** O custo de IA de imagem de um plano, no mês cheio, em reais. */
function custoDeIaDoPlano(pecasPorMes: number): number {
  return Math.round(pecasPorMes * PRECO_DE_TABELA_USD.quadrada * USD_EM_REAIS);
}

export const SOCIAL_MARGINS: Record<SocialPackage, MarginProfile> = Object.fromEntries(
  PLANOS.filter((p) => p.pecasPorMes > 0).map((p) => [
    p.id,
    {
      costBasis: custoDeIaDoPlano(p.pecasPorMes),
      // Piso COMERCIAL: ~70% do preço de tabela, como sempre foi. É o quanto a
      // casa aceita descontar — não é piso de custo, e a distância entre os
      // dois é o que torna o desconto possível sem virar prejuízo.
      floorPrice: Math.round(p.preco * 0.7),
      targetPrice: p.preco,
    },
  ]),
) as Record<SocialPackage, MarginProfile>;

// ── OS ADICIONAIS SAÍRAM DAQUI JUNTO COM O PREÇO DELES ──────────────────────
//
// `ADDON_MARGINS` guardava alvo de R$ 1.200 (tráfego), R$ 2.500 e R$ 4.000
// (identidade) — os mesmos quatro preços que a esteira parou de cotar, porque
// a vitrine não os promete. Margem sobre preço que a casa não cobra é conta
// sobre ficção. Quando esses projetos ganharem preço de tabela, a margem deles
// nasce derivada, como a dos planos.

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
  // ── OS TRÊS ADICIONAIS SAÍRAM DA CONTA (26/08/2026) ───────────────────────
  //
  // Reel, tráfego pago e identidade visual somavam margem aqui sobre preços
  // (R$ 400/reel, R$ 1.200, R$ 2.500/4.000) que a vitrine não pratica e que a
  // esteira parou de cotar. Reel a casa nem produz.
  //
  // O que sobra é o que a casa VENDE: os planos. Uma margem a menos, e ela era
  // sobre ficção — margem inventada é pior que margem faltando, porque decide
  // desconto de verdade em cima de um número que não existe.

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
