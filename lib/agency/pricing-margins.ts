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
// 🔴 O QUARTO CATÁLOGO PARALELO — eliminado em 16/08/2026
//
// `SOCIAL_MARGINS` tinha `floorPrice` e `targetPrice` DIGITADOS por plano, para
// os cinco planos-fantasma do `live-calculator`. Eram preço de plano escrito
// num quarto arquivo — e, pior, um SEGUNDO PISO: a casa tinha o piso de
// `comercial/negociacao.ts` (Ritmo 229, Presença 690, Conteúdo 1.190,
// Crescimento 2.190) e o piso daqui (520, 820, 1.300, 2.200, 3.600) ao mesmo
// tempo, e os dois discordavam. Dois pisos é o mesmo que nenhum: o SDR usa o
// que estiver mais perto da mão.
//
// Agora `floorPrice` e `targetPrice` DERIVAM de `lib/agency/planos.ts`. Só o
// `costBasis` mora aqui — custo não é preço, e o custo é o único dado desta
// casa que ninguém mediu.
//
// 🔴 **CORREÇÃO DA 2ª RODADA — a frase acima já foi falsa neste arquivo.** Ela
// dizia "o catálogo paralelo foi eliminado" enquanto `ADDON_MARGINS` continuava
// com preço digitado, e o `targetPrice` de cada adicional era, número por
// número, o `maxPrice` da tabela de `live-calculator.ts`. Havia ainda uma
// TERCEIRA cópia do reel dentro de `computeDealFloor`, com piso R$ 200 contra o
// mínimo de R$ 150 do briefing — a casa discordando de si mesma. Tudo isso
// deriva agora de `lib/agency/adicionais.ts`.
//
// A lição está no comentário, não só no código: **comentário que promete mais
// do que o mecanismo entrega é a mentira mais cara desta casa**, porque quem lê
// depois confia nele em vez de conferir.
// ─────────────────────────────────────────────────────────────────────────────

import { SOCIAL_PACKAGES, type SocialPackage } from "./live-calculator";
import { PLANOS_PUBLICOS } from "./planos";
import { ADICIONAIS, adicionalPorId } from "./adicionais";

// ── Margin profile ────────────────────────────────────────────────────────────
// For each sellable line, we model:
//   costBasis  — internal monthly cost to deliver (AI + human review + tools + overhead)
//   floorPrice — the lowest the SDR may EVER sell at (protects a healthy margin)
//   targetPrice— the ideal sell price the SDR anchors toward
// The client-facing minPrice/maxPrice sit between floorPrice and targetPrice.

export interface MarginProfile {
  /**
   * 🔴 `null` = NUNCA FOI MEDIDO, e é assim que os seis nascem hoje.
   *
   * Os cinco números que estavam aqui (280, 420, 620, 980, 1.500) eram o custo
   * de cinco planos que **não existem**. Trazê-los para os planos oficiais
   * "pela faixa de preço parecida" seria inventar a economia da casa — e é
   * sobre esse número que o SDR decide dar desconto.
   *
   * `docs/precos.md` tem o custo de IA por plano (≈ R$ 4 a R$ 52/mês), que é
   * medido e é REAL — mas é só a parte de IA. Falta a hora humana por conta,
   * que é justamente o que `lib/agency/medicao/custo-de-atendimento.ts` passou
   * a levantar. Enquanto ela não existir, este campo é `null` e a margem não é
   * afirmada. Melhor "não sei" do que um percentual convincente e errado.
   */
  costBasis: number | null;
  /** O menor valor autorizado. Vem do `piso` da fonte única. */
  floorPrice: number;
  /** O preço de tabela. Vem do `preco` da fonte única. */
  targetPrice: number;
}

/**
 * Derivado, nunca digitado. Plano sem `piso` declarado (Pulso) e plano
 * `interno` (Performance) **não aparecem aqui** — sem piso não há autorização
 * de desconto, e é `podeFechar` em `comercial/negociacao.ts` que dá o recado.
 */
export const SOCIAL_MARGINS: Partial<Record<SocialPackage, MarginProfile>> = (() => {
  const saida: Partial<Record<SocialPackage, MarginProfile>> = {};
  for (const p of PLANOS_PUBLICOS) {
    if (p.piso === null) continue;
    saida[p.id] = { costBasis: null, floorPrice: p.piso, targetPrice: p.preco };
  }
  return saida;
})();

/**
 * Adicionais — DERIVADOS de `lib/agency/adicionais.ts`.
 *
 * 🔴 Eram digitados aqui, e o `targetPrice` de cada um era, número por número,
 * o `maxPrice` da tabela de `live-calculator.ts`. A primeira rodada do conserto
 * declarou o catálogo paralelo "eliminado" olhando só para preço de PLANO — e
 * este ficou de pé. A afirmação estava errada; está corrigida.
 *
 * Adicional sem piso decidido **não ganha perfil**: sem piso não há autorização
 * de desconto, e um perfil ausente é recusa explícita, não silêncio.
 */
export const ADDON_MARGINS: Partial<Record<string, MarginProfile>> = (() => {
  const saida: Partial<Record<string, MarginProfile>> = {};
  for (const a of ADICIONAIS) {
    if (a.piso === null) continue;
    saida[a.id] = { costBasis: a.custoBase, floorPrice: a.piso, targetPrice: a.precoAte };
  }
  return saida;
})();

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

/**
 * Margem em %. **`null` quando o custo não foi medido** — não 100%, não 0%.
 * Um `costBasis` ausente tratado como zero devolveria "margem de 100%", que é a
 * mentira mais perigosa que este módulo poderia contar ao SDR.
 */
export function marginPct(sellPrice: number, costBasis: number | null): number | null {
  if (costBasis === null) return null;
  if (sellPrice <= 0) return 0;
  return Math.round(((sellPrice - costBasis) / sellPrice) * 100);
}

/** `nao_medida` não é um estado de erro: é o estado real da casa hoje. */
export type MarginHealth = "healthy" | "thin" | "below_floor" | "nao_medida";

/**
 * Classifica um preço proposto. `below_floor` = o SDR não pode vender aqui.
 *
 * Ordem importa: o PISO é checado antes do custo. O piso é decisão registrada e
 * vale mesmo sem custo medido — deixar de barrar uma venda abaixo do piso por
 * falta de custo seria trocar uma trava que existe por uma que falta.
 */
export function classifyMargin(sellPrice: number, profile: MarginProfile): MarginHealth {
  if (sellPrice < profile.floorPrice) return "below_floor";
  const pct = marginPct(sellPrice, profile.costBasis);
  if (pct === null) return "nao_medida";
  return pct >= 55 ? "healthy" : "thin";
}

// ── Aggregate floor for a full scope ──────────────────────────────────────────
// Given the social package id and which add-ons are active, returns the total
// floor price across the whole deal. The SDR must never quote below this sum.

export interface DealFloor {
  /** `null` quando qualquer linha do negócio tem custo não medido. Somar só as
   *  linhas conhecidas devolveria um custo total menor que o real, com cara de
   *  total. */
  totalCost: number | null;
  totalFloor: number;
  totalTarget: number;
  lines: { label: string; cost: number | null; floor: number; target: number }[];
  /** As linhas que não puderam entrar, com o motivo. Nunca somem em silêncio. */
  semAutorizacao: string[];
}

export function computeDealFloor(args: {
  socialPackage?: SocialPackage;
  extraReels?: number;
  wantsTraffic?: boolean;
  wantsBranding?: boolean;
  wantsRebrand?: boolean;
}): DealFloor {
  const lines: DealFloor["lines"] = [];
  const semAutorizacao: string[] = [];
  let totalCost: number | null = 0;
  let totalFloor = 0;
  let totalTarget = 0;

  const add = (label: string, p: { costBasis: number | null; floorPrice: number; targetPrice: number }) => {
    lines.push({ label, cost: p.costBasis, floor: p.floorPrice, target: p.targetPrice });
    if (p.costBasis === null) totalCost = null;
    else if (totalCost !== null) totalCost += p.costBasis;
    totalFloor += p.floorPrice;
    totalTarget += p.targetPrice;
  };

  if (args.socialPackage) {
    const perfil = SOCIAL_MARGINS[args.socialPackage];
    if (!perfil) {
      // Fail-closed e RUIDOSO. Sem perfil não há piso — e um negócio montado
      // sem a linha do plano sairia com piso menor que o real, que é o jeito
      // silencioso de vender abaixo do chão.
      semAutorizacao.push(
        `"${args.socialPackage}" não tem piso autorizado (plano interno ou piso não declarado em planos.ts). ` +
          `Este negócio NÃO pode ser fechado pelo SDR — escale.`,
      );
    } else {
      const pkg = SOCIAL_PACKAGES.find((p) => p.id === args.socialPackage);
      add(pkg?.label ?? "Plano Social", perfil);
    }
  }
  // 🔴 O reel era a TERCEIRA cópia da economia do adicional, e trazia uma
  // contradição viva: piso R$ 200 aqui, mínimo de tabela R$ 150 no briefing —
  // o piso ACIMA do menor valor cotável. Nenhum dos dois tem procedência.
  // Agora o reel tem `piso: null` na fonte e este bloco é fail-closed.
  if (args.extraReels && args.extraReels > 0) {
    const reel = adicionalPorId("reel");
    const perfil = reel && reel.piso !== null ? ADDON_MARGINS[reel.id] : undefined;
    if (!perfil) {
      semAutorizacao.push(
        `Reel avulso não tem piso decidido (${reel?.contradicao ?? "adicional ausente"}). ` +
          `Não cabe em fechamento automático — orce à parte.`,
      );
    } else {
      const n = args.extraReels;
      lines.push({
        label: `Reels extras (${n})`,
        cost: perfil.costBasis === null ? null : perfil.costBasis * n,
        floor: perfil.floorPrice * n,
        target: perfil.targetPrice * n,
      });
      if (perfil.costBasis === null) totalCost = null;
      else if (totalCost !== null) totalCost += perfil.costBasis * n;
      totalFloor += perfil.floorPrice * n;
      totalTarget += perfil.targetPrice * n;
    }
  }
  const adicionar = (id: string, rotulo: string) => {
    const perfil = ADDON_MARGINS[id];
    if (!perfil) {
      semAutorizacao.push(`"${rotulo}" não tem piso decidido em adicionais.ts — escale.`);
      return;
    }
    add(rotulo, perfil);
  };
  if (args.wantsTraffic) adicionar("trafficMgmt", "Tráfego Pago — gestão");
  if (args.wantsBranding) {
    adicionar(args.wantsRebrand ? "brandingFull" : "branding", "Identidade Visual");
  }

  return { totalCost, totalFloor, totalTarget, lines, semAutorizacao };
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
  /** `null` quando o custo não foi medido — ver `MarginProfile.costBasis`. */
  marginPctAtFinal: number | null;
}

export function resolveDiscount(args: {
  basePrice: number;         // the price being discounted from (usually target/list)
  costBasis: number | null;
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
