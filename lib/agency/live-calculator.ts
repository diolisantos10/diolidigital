// ─── A CALCULADORA DO BRIEFING — ela NÃO tem mais preço próprio ───────────────
//
// 🔴 O QUE ESTE ARQUIVO ERA ATÉ 16/08/2026, E POR QUE ERA O PIOR DOS TRÊS
//
// `SOCIAL_PACKAGES` declarava CINCO PLANOS QUE NÃO EXISTEM na casa — Essencial,
// Starter, Growth, Pro, Premium — com FAIXAS de preço próprias (R$ 600–900,
// R$ 900–1.400, R$ 1.500–2.400, R$ 2.500–4.000, R$ 4.000–6.500). E não era um
// resto de código morto: `computeEstimate` é chamado por
// `components/agency/briefing/PublicBriefingRoom.tsx`, o briefing **público**.
//
// Ou seja: `/planos` dizia "Crescimento, R$ 2.590" e, na mesma casa, no mesmo
// dia, o prospect que preenchia o briefing recebia "Plano Growth — R$ 1.500 a
// R$ 2.400". Duas tabelas, dois preços, e o cliente sempre acha o menor.
//
// **A tabela foi ELIMINADA, não sincronizada.** Sincronizar deixa as duas de pé
// e elas divergem de novo no primeiro dia de pressa. Agora os pacotes são
// DERIVADOS de `lib/agency/planos.ts`: mesmos nomes, mesmos ids, mesmo preço,
// e a cadência lida do escopo oficial (`pecasPorMes`).
//
// ─── DUAS CONSEQUÊNCIAS QUE PRECISAM ESTAR ESCRITAS ──────────────────────────
//
// 1. **Não existe mais faixa de preço de plano.** `minPrice === maxPrice === o
//    preço do plano`. O preço da casa é um número, não uma banda de negociação
//    — a banda é o `piso`, é interna, e mora em `comercial/negociacao.ts`.
// 2. **Stories e reels não são mais dimensionados aqui.** Eles não existem como
//    unidade nos planos oficiais (o escopo fala em PEÇAS por mês, e stories
//    entram a partir do Conteúdo, em sequências). Inventar "5 stories/semana"
//    para casar com a interface antiga seria preencher escopo por inferência —
//    exatamente o que a casa proíbe. Os campos viraram `null` e a interface
//    passa a mostrar o escopo oficial do plano.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence, SocialScope } from "./briefing-conversation";
import { PLANOS_PUBLICOS, planoPorId, precoEmReais, type PlanoId } from "./planos";
import { faixaDoAdicional } from "./adicionais";
import { confrontoDeVerba } from "./comercial/verba-declarada";

// ── Social Media Plans ────────────────────────────────────────────────────────

/** O id do plano é o id da fonte única. Não há um segundo vocabulário. */
export type SocialPackage = PlanoId;

export type ReportLevel = "none" | "basic" | "advanced";
export type CommunityLevel = "none" | "basic" | "full";

export interface PackageDef {
  id: SocialPackage;
  label: string;
  /** Peças por mês, do escopo oficial. `null` = o plano não declara cadência. */
  pecasPorMes: number | null;
  /** `null` = a unidade não existe no escopo oficial deste plano. NUNCA 0 por
   *  omissão: "não está escrito" e "está escrito que é zero" são fatos
   *  diferentes, e é o segundo que a interface tem direito de exibir. */
  postsPerMonth: number | null;
  storiesPerMonth: number | null;
  reelsPerMonth: number | null;
  copy: boolean;           // copywriting (textos) included
  design: boolean;         // custom design / artes
  calendar: boolean;       // editorial calendar / strategy
  reports: ReportLevel;    // monthly metrics report
  community: CommunityLevel; // comment / DM management
  /** Preço do plano. `min === max` de propósito: o preço da casa é um número. */
  minPrice: number;
  maxPrice: number;
  description: string;
}

// ── A DERIVAÇÃO ───────────────────────────────────────────────────────────────
//
// A escada oficial é CUMULATIVA e diz isso com todas as letras: o Ritmo inclui
// "Tudo do Pulso", o Presença "Tudo do Ritmo", e assim por diante. Por isso a
// matriz de recursos é lida sobre o escopo ACUMULADO, não sobre a linha isolada
// — senão o Ritmo apareceria sem relatório mensal, que ele herda do Pulso.
//
// Cada recurso é ancorado numa FRASE LITERAL do escopo oficial. Se alguém
// reescrever o escopo em `planos.ts`, o recurso muda junto — e há teste que
// reprova âncora que deixou de existir, para a matriz não virar tudo `false`
// em silêncio. Recurso deduzido por posição na escada seria palpite; recurso
// lido do texto do contrato é derivação.

const ESCADA = [...PLANOS_PUBLICOS].sort((a, b) => a.preco - b.preco);

/** Todo o escopo do degrau e dos degraus abaixo dele, em minúsculas. */
function escopoAcumulado(indice: number): string {
  return ESCADA.slice(0, indice + 1)
    .flatMap((p) => p.inclui)
    .join(" · ")
    .toLowerCase();
}

/** As âncoras. Exportadas porque o teste as confere contra `planos.ts`. */
export const ANCORAS_DE_ESCOPO = {
  copy: "legenda",
  design: "arte pronta",
  calendar: "calendário",
  reportsBasic: "relatório mensal",
  reportsAdvanced: "plano de medição",
  communityBasic: "gestão de avaliações",
  communityFull: "atendimento humano",
} as const;

export const SOCIAL_PACKAGES: PackageDef[] = ESCADA.map((plano, i) => {
  const escopo = escopoAcumulado(i);
  const tem = (frase: string) => escopo.includes(frase);

  return {
    id: plano.id,
    label: `Plano ${plano.nome}`,
    pecasPorMes: plano.pecasPorMes,
    // Peça É post no vocabulário do escopo oficial ("8 peças por mês —
    // carrossel de até 6 telas ou post único").
    postsPerMonth: plano.pecasPorMes,
    // Não dimensionados no escopo oficial: ver o cabeçalho do arquivo.
    storiesPerMonth: null,
    reelsPerMonth: null,
    copy: tem(ANCORAS_DE_ESCOPO.copy),
    design: tem(ANCORAS_DE_ESCOPO.design),
    calendar: tem(ANCORAS_DE_ESCOPO.calendar),
    reports: tem(ANCORAS_DE_ESCOPO.reportsAdvanced)
      ? "advanced"
      : tem(ANCORAS_DE_ESCOPO.reportsBasic)
        ? "basic"
        : "none",
    community: tem(ANCORAS_DE_ESCOPO.communityFull)
      ? "full"
      : tem(ANCORAS_DE_ESCOPO.communityBasic)
        ? "basic"
        : "none",
    minPrice: plano.preco,
    maxPrice: plano.preco,
    description: plano.salto,
  };
});

// A tabela paralela que ficava aqui foi APAGADA neste ponto. Se você está
// pensando em recriar um catálogo de plano neste arquivo: não. O portão
// `__tests__/comercial/preco-uma-fonte-so.test.ts` reprova a build.

/**
 * COMO UMA FAIXA SE ESCREVE NA TELA — e por que isto passou a ser preciso.
 *
 * Quando o preço do plano virou UM número (`minPrice === maxPrice`, ver o
 * cabeçalho deste arquivo), toda tela que desenhava `min–max` passou a mostrar
 * **"R$ 790 – R$ 790"**. Ninguém digitou isso: é o desenho antigo, de faixa,
 * recebendo um dado que deixou de ser faixa. O número está certo e a forma
 * está errada — e "de R$ 790 a R$ 790" é a frase de quem não sabe o próprio
 * preço, escrita no cabeçalho da tabela que o SDR abre na frente do cliente.
 *
 * Isto é FORMATAÇÃO, não preço: nada aqui decide, arredonda ou compara valor.
 * Quando os dois lados são iguais, sai um número só; quando são diferentes —
 * os adicionais (tráfego, identidade) ainda são faixa de verdade — sai a
 * faixa, com travessão, como sempre foi.
 *
 * O formatador entra por parâmetro de propósito: cada superfície já tem o seu
 * (`precoEmReais`, `fmtBRL`, `brl`), e unificar os cinco é outra frente. Trocar
 * o formatador aqui mudaria a aparência de telas que ninguém pediu para mexer.
 */
export function faixaDePreco(min: number, max: number, fmt: (n: number) => string): string {
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
}

/**
 * Recebe peças por MÊS e devolve o degrau oficial que as cobre.
 *
 * Os cortes NÃO são mais números escritos à mão (14 / 24 / 34 / 50): são a
 * própria cadência dos planos. Devolve o PRIMEIRO degrau cuja cadência atende o
 * pedido; se nenhum atende (o cliente quer mais peças do que o topo entrega),
 * devolve o topo — que é o que a casa consegue vender, e o excedente vira peça
 * extra (`PECA_EXTRA`), não um plano inventado.
 *
 * Quem pedir 0 peça cai no Pulso, e isso é correto: o Pulso é o degrau que não
 * produz peça nenhuma.
 */
export function detectPackage(pecasPorMes: number): SocialPackage {
  const comCadencia = SOCIAL_PACKAGES.filter((p) => p.pecasPorMes !== null);
  if (comCadencia.length === 0) {
    // Falha alto. Uma lista vazia aqui faria o briefing cotar `undefined`.
    throw new Error(
      "live-calculator: nenhum plano público declara `pecasPorMes` em lib/agency/planos.ts — " +
        "sem cadência não há como escolher degrau.",
    );
  }
  const pedido = typeof pecasPorMes === "number" && Number.isFinite(pecasPorMes) ? pecasPorMes : 0;
  const cobre = comCadencia.find((p) => (p.pecasPorMes as number) >= pedido);
  return (cobre ?? comCadencia[comCadencia.length - 1]).id;
}

export function getPackageDef(id: SocialPackage): PackageDef {
  const achou = SOCIAL_PACKAGES.find((p) => p.id === id);
  if (!achou) {
    // O `!` que estava aqui devolvia `undefined` tipado como `PackageDef`, e o
    // primeiro acesso a `.minPrice` estourava dentro do briefing público.
    throw new Error(`live-calculator: plano "${id}" não é um plano público da casa.`);
  }
  return achou;
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

// ── Add-on prices ─────────────────────────────────────────────────────────────
// 🔴 Estas quatro faixas eram DIGITADAS aqui e o `maxPrice` de cada uma era,
// número por número, o `targetPrice` de `pricing-margins.ts`. A primeira rodada
// do conserto de preço não viu — ela varria preço de PLANO. Agora as duas
// derivam de `lib/agency/adicionais.ts`.
const P = {
  reel:         faixaDoAdicional("reel"),
  trafficMgmt:  faixaDoAdicional("trafficMgmt"),
  branding:     faixaDoAdicional("branding"),
  brandingFull: faixaDoAdicional("brandingFull"),
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
function volumeDeclarado(s: SocialScope | undefined): number | null {
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
      const pecasPorMes = postsPerWeek * 4;
      const pkgId = detectPackage(pecasPorMes);
      const pkg   = getPackageDef(pkgId);
      const plano = planoPorId(pkgId)!;

      items.push({
        label:    pkg.label,
        detail:   plano.salto,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
        unit:     "mês",
      });
      totalMin += pkg.minPrice;
      totalMax += pkg.maxPrice;

      // O ESCOPO OFICIAL, palavra por palavra. Antes, esta lista era montada de
      // frases próprias ("Copywriting (textos)", "Gestão de comunidade
      // completa") que não existiam em contrato nenhum — o prospect lia uma
      // promessa que a ficha do plano não fazia.
      included.push(...plano.inclui);
      notIncluded.push(...plano.naoInclui);

      // Client-side overrides
      if (s?.needsCopy === false) notIncluded.push("Copy — fornecida pelo cliente");
      if (s?.hasPhotos === false) notIncluded.push("Produção fotográfica (orçar separado)");

      // Peça além do contratado. O excedente é o número da tabela oficial
      // (R$ 180/peça), não uma faixa — e vídeo/reel continua FORA de todo plano.
      if (plano.pecasPorMes !== null && pecasPorMes > plano.pecasPorMes && plano.pecaExtra !== null) {
        const extra = pecasPorMes - plano.pecasPorMes;
        const valor = extra * plano.pecaExtra;
        items.push({
          label:    `Peças excedentes (${extra}/mês)`,
          detail:   `Além das ${plano.pecasPorMes} do plano, a ${precoEmReais(plano.pecaExtra)} cada`,
          minPrice: valor,
          maxPrice: valor,
          unit:     "mês",
        });
        totalMin += valor;
        totalMax += valor;
      }

      // Reel pedido no briefing NUNCA entra na conta do plano: vídeo está em
      // `FORA_DE_TODO_PLANO` por decisão do CEO. Dizer o preço aqui seria
      // recriar a cotação de vídeo que a tabela oficial tirou da mensalidade.
      if (s?.reelsPerMonth !== undefined && s.reelsPerMonth > 0) {
        notIncluded.push(
          `Gravação e edição de vídeo (${s.reelsPerMonth} reels/mês pedidos) — sempre orçado à parte`,
        );
        missing.push("Orçamento de vídeo (fora de todo plano)");
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

  return {
    items, totalMin, totalMax, confidence,
    missingForEstimate: missing, included, notIncluded,
    discountPct, discountReason, discountedMin, discountedMax,
    confrontoDeVerba: confronto ?? undefined,
    travadaPor,
  };
}
