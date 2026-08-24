// ─── Briefing Conversation V2 types ──────────────────────────────────────────
// Used by the conversational SDR Briefing Room, question engine, and live
// calculator. Pure data — no UI or side effects.
// ─────────────────────────────────────────────────────────────────────────────

import type { AreaDeAtendimento } from "./comercial/onde-o-negocio-vende";
import type { ConfrontoDeVerba, DivergenciaDeVerba } from "./comercial/verba-declarada";
import type { LacunaDeEscopo } from "./comercial/lacuna-de-escopo";

export type { AreaDeAtendimento, ConfrontoDeVerba, DivergenciaDeVerba, LacunaDeEscopo };

// ── Message ───────────────────────────────────────────────────────────────────
export interface ConvMessage {
  id: string;
  role: "assistant" | "client" | "system";
  text: string;
  createdAt: string;
}

// ── Scope sub-types ───────────────────────────────────────────────────────────
export interface SocialScope {
  platforms: string[];
  postsPerWeek?: number;
  storiesPerWeek?: number;
  reelsPerMonth?: number;
  needsCopy?: boolean;
  hasPhotos?: boolean;
  // Deep-probe production fields (drive accuracy of the quote)
  hasVideomaker?: boolean;     // client has someone to shoot/edit video
  needsVideoProduction?: boolean; // Dioli must produce/edit video
  creativesReady?: boolean;    // brand has existing creatives/templates ready
  postingGoal?: string;        // what each post should drive (sales, authority…)
  hasReferences?: boolean;     // client provided visual/brand references
}

export interface TrafficScope {
  platforms: string[];
  monthlyAdBudget?: string;
  /** ONDE o negócio vende. Sem isto a campanha nasce apontada para o Brasil
   *  inteiro, e a verba do padeiro é gasta em quem não alcança a padaria dele.
   *
   *  Opcional no tipo porque briefing antigo não tem o campo — e um tipo que
   *  mentisse sobre isso daria a falsa segurança de que o dado existe. Quem
   *  consome trata a ausência como ausência: ver `oQueFaltaParaSegmentar`. */
  serviceArea?: AreaDeAtendimento;
}

export interface BrandingScope {
  requested: boolean;    // user explicitly asked for branding / logo / identity
  hasBrandBook: boolean; // user HAS a brand book — does NOT imply wanting branding
  wantsRebrand: boolean;
  /** O cliente está criando a marca DO ZERO (não tem nada hoje).
   *
   *  O SDR já calculava isto (`question-engine.ts`, Q9.1) e **jogava fora** — o
   *  valor não tinha onde morar. A consequência era um deadlock: o especialista
   *  de identidade exigia material de marca para produzir, e o cliente que veio
   *  justamente porque não tem marca travava para sempre, sem receber nada.
   *
   *  Também deveria mexer no preço, e hoje não mexe: criar do zero dá mais
   *  trabalho que ajustar, e cai na faixa mais barata. Registrado para o CEO. */
  fromScratch?: boolean;
  deliverables?: string; // what they need: logo, paleta, tipografia, manual…
}

// Engagement type — how the client enters the agency.
//   monthly   = fixed monthly retainer for a defined scope
//   one_off   = single project with a start and end
//   umbrella  = ongoing partnership, indeterminate time, scope evolves
//              (the "guarda-chuva" — client lives under the agency umbrella)
//   unsure    = not yet decided
export type EngagementType = "monthly" | "one_off" | "umbrella" | "unsure";

// ── Negotiation (client-visible: only the final discounted price) ──────────────
export interface NegotiationState {
  discountPct?: number;       // discount the SDR granted
  discountReason?: string;    // client-facing justification (e.g. "compromisso anual")
  appliedLevers?: string[];   // internal lever ids used
}

// ── Main scope ────────────────────────────────────────────────────────────────
export interface BriefingScope {
  businessName?: string;
  segment?: string;
  targetAudience?: string;    // who the client sells to (ideal customer)
  objectives: string[];
  serviceMode?: EngagementType;
  wantsSocialMedia: boolean;
  social?: SocialScope;
  wantsPaidTraffic?: boolean;
  traffic?: TrafficScope;
  /** OPCIONAL, e a correção não é cosmética: o briefing que não fala de
   *  identidade visual simplesmente não traz este bloco. O tipo declarava
   *  obrigatório, o dado real vinha sem, e o `as` no meio do caminho escondia a
   *  diferença — até a proposta quebrar em produção com "Cannot read properties
   *  of undefined". Tipo que mente sobre o dado é pior que tipo ausente: dá a
   *  falsa segurança de que o compilador conferiu. */
  branding?: BrandingScope;
  budgetRange?: string;
  deadline?: string;
  /**
   * OS BÁSICOS OPERACIONAIS — o que a PRODUÇÃO usa para escrever a peça.
   *
   * ── O buraco que este campo fecha (24/08/2026) ────────────────────────────
   * O briefing perguntava tudo que serve para VENDER e nada do que serve para
   * PRODUZIR. A consequência foi medida no piloto: a Qualidade barrou cinco
   * peças seguidas, com o mesmo parecer — CTA prometendo "chame no WhatsApp
   * [PRECISO CONFIRMAR]", reels sem confirmação visual, plano sem horário. O
   * pacote inteiro ficou retido, e o cliente nunca soube.
   *
   * A produção descobria a falta DEPOIS de a peça estar escrita. Agora a casa
   * pergunta antes, uma vez, em bloco — e "não tenho" é resposta válida: o que
   * não pode é a peça ser escrita em cima de um dado que ninguém tem.
   *
   * ⚠️ Texto livre de propósito. Quem interpreta é `extrairVerdadeOperacional`,
   * o MESMO extrator que o piso de verdade usa para conferir a peça depois —
   * uma fonte, os dois lados. Um campo estruturado aqui seria a segunda régua.
   *
   * ⚠️ NÚMERO DE TELEFONE NÃO ENTRA, e não é esquecimento: `semPii` remove
   * qualquer sequência de 8+ dígitos antes de o texto chegar ao modelo. A peça
   * precisa saber que o negócio ATENDE por WhatsApp, não o número dele.
   */
  operacao?: string;
  // Qualification depth
  decisionMaker?: boolean;    // is the person the decision-maker?
  competitors?: string[];     // competitors / references the client admires
  negotiation?: NegotiationState;
  /**
   * O QUE O CLIENTE PEDIU E A CASA NÃO SOUBE ENCAIXAR.
   *
   * Farol 27, 24/08/2026: a cliente abriu pedindo "reposicionamento de marca" e
   * o escopo gravou `branding.requested: false` — não "não sei", `false`, que é
   * a casa AFIRMANDO que ela não pediu. O vocabulário dela não batia com o da
   * casa e o silêncio virou negativa.
   *
   * Aqui mora o meio-termo que faltava: o pedido fica registrado com as
   * palavras do cliente e com a pergunta que precisa ser feita. Enquanto houver
   * lacuna aberta, o orçamento NÃO sai com confiança alta — ver
   * `live-calculator.ts`. Ver `comercial/lacuna-de-escopo.ts`.
   */
  lacunasDeEscopo?: LacunaDeEscopo[];
  // Prospect-only fields (public /briefing flow)
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
}

// ── Live estimate ─────────────────────────────────────────────────────────────
export interface EstimateItem {
  label: string;
  detail: string;
  minPrice: number;
  maxPrice: number;
  unit: string;
}

export type EstimateConfidence = "none" | "low" | "medium" | "high";

export interface LiveEstimate {
  items: EstimateItem[];
  totalMin: number;
  totalMax: number;
  confidence: EstimateConfidence;
  missingForEstimate: string[];
  included: string[];
  notIncluded: string[];
  // Negotiated discount (client-visible). When set, the panel shows the
  // discounted total alongside the original. Margin/floor stay internal.
  discountPct?: number;
  discountReason?: string;
  discountedMin?: number;
  discountedMax?: number;

  /** Preenchido quando a estimativa passa da verba que o cliente DECLAROU.
   *  Viaja gravado junto com o número para que quem entrega o orçamento não
   *  precise refazer a conta — nem possa "esquecer" de olhar. Ver
   *  `comercial/verba-declarada.ts` e o caso CityJobs. */
  confrontoDeVerba?: ConfrontoDeVerba;

  /** As lacunas de escopo ainda ABERTAS no momento do cálculo — o que o cliente
   *  pediu e a casa não confirmou. Viaja com o número porque é ela que explica
   *  por que a confiança não é alta. */
  lacunasAbertas?: LacunaDeEscopo[];

  /** Preenchido quando a verba declarada e a conta divergem por mais de uma
   *  ordem de grandeza — nos DOIS sentidos. Diferença dessa ordem é sinal de
   *  escopo mal entendido, e sinal não pode passar em silêncio. */
  divergenciaDeVerba?: DivergenciaDeVerba;

  /** Quando presente, esta estimativa NÃO VIRA ORÇAMENTO para o cliente: é um
   *  número que não se sustenta, e o texto diz por quê.
   *
   *  Nasceu do CityJobs (16/08/2026): o volume de posts chegou ZERADO no
   *  escopo, atravessou todos os guardiões (que testavam `=== undefined`, e
   *  zero é definido), virou "Plano Essencial" por tabela e saiu como
   *  R$ 1.800–3.400 com `confidence: "high"` e `missingForEstimate: []`.
   *  Confiança máxima num número construído sobre um campo vazio.
   *
   *  Esta casa não deixa estimativa quebrada virar número — o pedido fica
   *  parado e CONTADO, para gente olhar. Mesmo princípio já escrito em
   *  `esteira/orcamento-do-briefing.ts`: valor vem de cálculo, e a IA nunca
   *  inventa. */
  travadaPor?: string;
}

// ── Conversation state ────────────────────────────────────────────────────────
export interface ConvState {
  messages: ConvMessage[];
  scope: BriefingScope;
  answeredQIds: string[];
  /**
   * QUANTAS VEZES CADA PERGUNTA JÁ FOI FEITA — não respondida, FEITA.
   *
   * `answeredQIds` sabia o que a conversa colheu e não sabia o que ela já
   * gastou. Sem esse segundo número não existe como distinguir "pergunta nova"
   * de "sexta insistência", e foi assim que a fila repetiu a mesma frase seis
   * turnos seguidos para a Farol 27 (24/08/2026), engolindo objetivo, público,
   * verba e prazo pelo caminho. Ver `comercial/pergunta-sem-encaixe.ts`.
   *
   * Opcional porque conversa antiga não tem o campo — e ausência aqui é lida
   * como zero, que é a verdade: nada foi contado.
   */
  perguntasFeitas?: Record<string, number>;
  isFirstMessage: boolean;
  estimate: LiveEstimate;
  canSubmit: boolean;
}

// ── Constructors ──────────────────────────────────────────────────────────────
/** O bloco de identidade visual completo, com os padrões da casa.
 *
 *  Ganhou importância quando `branding` virou opcional no escopo: o bloco pode
 *  não existir, mas os três booleanos dele NÃO são opcionais — quem preenche,
 *  preenche inteiro. Use isto como base ao montar um `branding` parcial, em vez
 *  de espalhar `?? false` por aí: cada lugar que inventa o próprio default é um
 *  lugar que um dia vai inventar diferente. */
export function emptyBrandingScope(): BrandingScope {
  return { requested: false, hasBrandBook: false, wantsRebrand: false };
}

export function emptyScope(): BriefingScope {
  return { objectives: [], wantsSocialMedia: false, branding: emptyBrandingScope() };
}

export function emptyEstimate(): LiveEstimate {
  return { items: [], totalMin: 0, totalMax: 0, confidence: "none", missingForEstimate: [], included: [], notIncluded: [] };
}
