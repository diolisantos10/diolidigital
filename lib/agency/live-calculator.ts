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

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence, SocialScope } from "./briefing-conversation";
import { confrontoDeVerba, divergenciaDeVerba } from "./comercial/verba-declarada";
import { quantidadeQueCabe, lerCanais } from "./contrato-de-quantidade";
import { lacunasAbertas } from "./comercial/lacuna-de-escopo";

// ── Social Media Plans ────────────────────────────────────────────────────────

export type SocialPackage = "essencial" | "starter" | "growth" | "pro" | "premium";

export type ReportLevel = "none" | "basic" | "advanced";
export type CommunityLevel = "none" | "basic" | "full";

export interface PackageDef {
  id: SocialPackage;
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
    label: "Plano Essencial",
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
    label: "Plano Starter",
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
    label: "Plano Growth",
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
    label: "Plano Pro",
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
    label: "Plano Premium",
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

// ── O volume declarado — zero não é resposta, zero é campo faltando ───────────
//
// CityJobs, 16/08/2026, piloto ao vivo. O cliente pediu **2 posts estáticos por
// dia** (~60/mês) e o SDR repetiu de volta que tinha entendido. O painel de
// escopo, porém, mostrava **"0 posts/mês"** durante a conversa inteira. O CEO
// viu e avisou na hora — *"só tá dizendo que são 0 posts por mês, não sei se é
// algum problema"* — e a conversa seguiu em frente.
//
// O que aconteceu com esse zero: NADA o barrou. Todo guardião deste sistema
// testava `postsPerWeek === undefined`, e `0` é definido. Então `0 * 4 = 0`
// entrou em `detectPackage(0)`, que devolve "essencial" porque `0 <= 14`, e a
// casa cotou um Plano Essencial de 3 posts/semana para quem tinha pedido 14 —
// R$ 1.800 a R$ 3.400, com `missingForEstimate: []` e `confidence: "high"`.
// Confiança máxima sobre um campo vazio.
//
// A lição não é sobre posts: é que **falso-por-omissão passa em teste de
// `undefined`**. Volume zero, negativo, NaN ou fora de tipo são todos a mesma
// coisa — o dado não chegou. Quem preenche o buraco por inferência inventa o
// pedido do cliente, e nesta casa não há revisor humano depois disto.
//
// EXPORTADA (laudo do `qualidade`, 16/08/2026): o mesmo zero que passou pelo
// preço também passava pelo gate de qualificação do SDR e pelo dossiê do lead
// — `sdr-agent.ts` testava `postsPerWeek !== undefined`, a mesma cópia da
// regra errada que existia aqui antes deste comentário. É esta função, e só
// ela, que decide "isto é um volume declarado utilizável?" em toda a casa —
// nenhum outro lugar reimplementa a checagem.
export function volumeDeclarado(s: SocialScope | undefined): number | null {
  const v = s?.postsPerWeek;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeEstimate(scope: BriefingScope): LiveEstimate {
  const items: EstimateItem[] = [];
  const included: string[]    = [];
  const notIncluded: string[] = [];
  const missing: string[]     = [];
  let totalMin = 0;
  let totalMax = 0;
  let travadaPor: string | undefined;

  // ── Social Media (flagship department) ──────────────────────────────────────
  if (scope.wantsSocialMedia) {
    const s = scope.social;
    const postsPerWeek = volumeDeclarado(s);

    if (postsPerWeek === null) {
      missing.push("Frequência de posts por semana");
      // O volume é o campo que ESCOLHE o plano — sem ele não existe estimativa
      // de social media, existe chute com aparência de conta. Travar aqui é o
      // que impede o zero do CityJobs de virar preço outra vez.
      travadaPor =
        "O volume de posts não chegou no pedido, e é ele que define o plano. " +
        "Sem esse número não montamos preço — preferimos perguntar a você a chutar.";
    } else {
      const postsPerMonth = postsPerWeek * 4;
      const pkgId = detectPackage(postsPerMonth);
      const pkg   = getPackageDef(pkgId);

      // ═══ A PROPOSTA NASCE DO BRIEFING ════════════════════════════════════
      //
      // ── O DEFEITO, MEDIDO EM PRODUÇÃO (case Farol 27, 25/08/2026) ────────
      //
      // Este bloco lia o volume do cliente, escolhia o plano — e daí em diante
      // escrevia a proposta com os números da TABELA, jogando fora o que ele
      // tinha acabado de pedir. A cliente pediu 4 posts/semana, ZERO stories e
      // 6 reels/mês; a proposta prometeu "5 posts + 7 stories/semana · 4
      // reels/mês", que é o `Plano Starter` recitado de cor.
      //
      // Três danos, todos medidos:
      //   1. A proposta CONTRADIZ o briefing que a cliente acabou de dar. Ela
      //      pediu 0 stories e leu 7 — é a prova, na primeira página, de que
      //      ninguém escutou.
      //   2. Os 6 reels que ela pediu como BASE viraram "Reels extras (2/mês)"
      //      cobrados por fora, porque o "extra" era medido contra a tabela e
      //      não contra o pedido dela.
      //   3. O contrato da produção admite no máximo 3 stories
      //      (`contrato-de-quantidade.ts`). A proposta prometia 7. O
      //      especialista obedecia à proposta, o contrato recusava, três
      //      tentativas, `blocked`. Impasse por construção.
      //
      // ── A REGRA QUE ESTE BLOCO PASSA A SEGUIR ────────────────────────────
      //
      // O plano continua escolhendo o PREÇO — faixa por volume é dele. As
      // QUANTIDADES passam a vir do briefing, cortadas pelos tetos lidos da
      // FONTE ÚNICA (`contrato-de-quantidade.ts`, o mesmo objeto que a produção
      // confere). A proposta ficou incapaz de prometer o que a casa recusa.
      //
      // E quando o pedido passa do que a casa faz, isso vira CONVERSA agora, na
      // proposta, e não um `blocked` silencioso três etapas depois: a recusa sai
      // por escrito com a instrução gêmea — o que não cabe E o que cabe.
      const posts   = quantidadeQueCabe("feed",  postsPerWeek);
      const stories = quantidadeQueCabe("story", s?.storiesPerWeek);
      const reels   = Math.max(0, Math.floor(s?.reelsPerMonth ?? 0));

      const cadencia = [
        `${posts.oferecido} posts/semana`,
        stories.oferecido > 0 ? `${stories.oferecido} stories/semana` : null,
        reels > 0 ? `${reels} reels/mês` : null,
      ].filter(Boolean).join(" · ");

      items.push({
        label:    pkg.label,
        detail:   cadencia,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
        unit:     "mês",
      });
      totalMin += pkg.minPrice;
      totalMax += pkg.maxPrice;

      included.push(`${posts.oferecido} posts/semana (${posts.oferecido * 4}/mês)`);

      // Stories: ZERO PEDIDO É ZERO OFERECIDO, e dito com todas as letras. O
      // silêncio aqui seria lido como "esqueceram" — e a produção precisa saber
      // que o formato está fora, senão ela o cobra de volta.
      if (stories.oferecido > 0) included.push(`${stories.oferecido} stories/semana`);
      else notIncluded.push("Stories — você pediu que não entrassem, e não entraram");

      // Os reels que ele pediu são ESCOPO, nunca "extra". O extra media contra
      // a tabela; agora não há contra o que medir: o pedido dele é a base.
      if (reels > 0) included.push(`${reels} reels/mês (edição)`);

      if (pkg.copy)     included.push("Copywriting (textos)");
      if (pkg.design)   included.push("Design personalizado das artes");
      if (pkg.calendar) included.push("Calendário editorial e estratégia");
      if (pkg.reports !== "none")
        included.push(pkg.reports === "advanced" ? "Relatório mensal avançado" : "Relatório mensal de métricas");
      if (pkg.community !== "none")
        included.push(pkg.community === "full" ? "Gestão de comunidade completa" : "Gestão de comunidade (básica)");

      // A recusa, VISÍVEL e com o que cabe no lugar. Falha fechada não é falha
      // muda: o cliente decide sabendo, antes de assinar.
      for (const q of [posts, stories]) if (q.recusa) notIncluded.push(q.recusa.frase);

      // Client-side overrides
      if (s?.needsCopy === false) notIncluded.push("Copy — fornecida pelo cliente");
      if (s?.hasPhotos === false) notIncluded.push("Produção fotográfica (orçar separado)");

      // ── OS CANAIS PEDIDOS SÃO OS CANAIS PROPOSTOS ────────────────────────
      // O canal que a casa não atende é DITO, nunca trocado em silêncio. Quem
      // decide o que existe é o registro de guardiões da mídia — a mesma régua
      // que barra a verba na hora de criar campanha.
      const canais = lerCanais(s?.platforms);
      const atendidos = canais.filter((c) => c.atendido);
      if (atendidos.length > 0) {
        included.push(`Publicação em ${atendidos.map((c) => c.comoOClientePediu).join(" e ")}`);
      }
      for (const c of canais) if (!c.atendido && c.frase) notIncluded.push(c.frase);
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
      // ── "GOOGLE/META" ERA TEXTO FIXO NO CÓDIGO (25/08/2026) ────────────
      // A cliente do Farol 27 pediu **Meta e TikTok** e leu que a verba dela
      // iria para o **Google**. Um canal que ela não pediu, inventado por uma
      // string; e o que ela pediu, apagado. Para quem lê, é a prova de que a
      // proposta não foi escrita para ela.
      //
      // Agora os canais saem do que ELA escreveu, e os que a casa não atende
      // aparecem por escrito — trocar em silêncio seria a mesma mentira, só
      // que descoberta depois de ela pagar.
      const canaisDeMidia = lerCanais(scope.traffic.platforms);
      const atendidos = canaisDeMidia.filter((c) => c.atendido);
      const destino = atendidos.length > 0
        ? atendidos.map((c) => c.comoOClientePediu).join(" e ")
        : "a plataforma de anúncios";
      notIncluded.push(`Verba de mídia: ${scope.traffic.monthlyAdBudget} (pago direto a ${destino})`);
      for (const c of canaisDeMidia) if (!c.atendido && c.frase) notIncluded.push(c.frase);
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
  // Estimativa travada é "none" e ponto. No CityJobs a conta saiu `high` porque
  // a lista de faltantes estava vazia — e estava vazia porque o zero passou
  // pelo guardião. Confiança calculada só sobre o que ALGUÉM LEMBROU de contar
  // como faltante é confiança que mente exatamente quando mais custa.
  let confidence: EstimateConfidence = "none";
  if (totalMin > 0 && !travadaPor) {
    if (missing.length === 0)     confidence = "high";
    else if (missing.length <= 2) confidence = "medium";
    else                           confidence = "low";
  }

  // ── TETO DE CONFIANÇA: ESCOPO INCOMPLETO NÃO SAI COM NÚMERO FIRME ─────────
  //
  // Farol 27, 24/08/2026. A cliente pediu reposicionamento de marca e um clube
  // de assinatura, declarou R$ 8.000 de honorários, e a casa devolveu
  // R$ 500–1.200/mês com `confidence: "high"`. Nada disso estava na lista de
  // `missing` — a marca tinha sido gravada como `false` (a casa afirmando que
  // ela não pediu) e o clube nunca teve onde morar. `missing` vazio, confiança
  // máxima, escopo errado.
  //
  // A lição do CityJobs escrita acima ("confiança calculada só sobre o que
  // ALGUÉM LEMBROU de contar como faltante") repetiu-se por outra porta: lá o
  // buraco era um zero, aqui é um pedido que não entrou na lista. Por isso o
  // teto NÃO é mais uma quarta regra dentro do mesmo `if` — é um limite
  // aplicado DEPOIS, sobre qualquer confiança que a conta acima tenha produzido.
  //
  // Duas coisas rebaixam, e as duas dizem a mesma coisa: "isto aqui não é o
  // escopo do cliente, é o que a casa conseguiu entender dele".
  const lacunas = lacunasAbertas(scope);
  const divergencia = divergenciaDeVerba(scope.budgetRange, totalMin);

  // "low" e não "medium": uma lacuna aberta é um SERVIÇO possivelmente inteiro
  // fora da conta, não um campo de detalhe faltando. Estimativa fraca, e o
  // painel/proposta leem `lacunasAbertas` para dizer POR QUÊ.
  if ((lacunas.length > 0 || divergencia) && (confidence === "high" || confidence === "medium")) {
    confidence = "low";
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

  // ── A verba que o cliente DECLAROU ──────────────────────────────────────────
  // Confrontado aqui, junto do cálculo, e não na hora de escrever o texto: o
  // confronto viaja gravado com o número (`briefingJson.estimate`), então quem
  // entrega o orçamento não refaz a conta nem pode deixar de olhar. No CityJobs
  // a faixa estava capturada e guardada — o que faltou foi alguém CONFRONTAR.
  //
  // Compara contra o valor que o cliente realmente pagaria: se houve desconto
  // negociado, é o preço com desconto que precisa caber na verba dele.
  const confronto = confrontoDeVerba(scope.budgetRange, discountedMin ?? totalMin);

  // ── O QUE O CLIENTE VEIO BUSCAR, CITADO PELO NOME ───────────────────────
  //
  // Farol 27, 25/08/2026: o projeto inteiro existia para lançar o **Clube
  // Farol 27**, e a proposta não mencionava o clube uma única vez. Isso não é
  // estética — é a peça comercial falhando no essencial: quem lê procura o
  // próprio objetivo na primeira página e, não achando, entende que comprou
  // um pacote de prateleira. Proposta que não cita o motivo não fecha venda.
  //
  // Sai daqui, junto do número, para viajar gravado em `briefingJson.estimate`
  // — quem escreve o texto não tem como esquecer o que não precisa lembrar.
  const objetivos = (scope.objectives ?? [])
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim())
    .slice(0, 3);

  // Um canal pedido nas DUAS frentes (social e tráfego) gera a mesma recusa
  // duas vezes. Repetir a frase não a torna mais verdadeira — torna o texto
  // desleixado, e desleixo numa proposta é o cliente lendo que ninguém releu.
  const notIncluidoSemRepetir = [...new Set(notIncluded)];

  return {
    objetivos: objetivos.length > 0 ? objetivos : undefined,
    items, totalMin, totalMax, confidence,
    missingForEstimate: missing, included, notIncluded: notIncluidoSemRepetir,
    discountPct, discountReason, discountedMin, discountedMax,
    confrontoDeVerba: confronto ?? undefined,
    lacunasAbertas: lacunas.length > 0 ? lacunas : undefined,
    divergenciaDeVerba: divergencia ?? undefined,
    travadaPor,
  };
}
