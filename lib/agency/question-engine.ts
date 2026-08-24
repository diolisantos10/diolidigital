// ─── Conversational question engine ──────────────────────────────────────────
// Defines questions for the Briefing Room V2 SDR flow.
// Asks one question at a time, in order, skipping already-answered questions.
// IMPORTANT: Brand Book upload/mention sets hasBrandBook — NOT requestedBranding.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConvState, ConvMessage, BriefingScope, SocialScope } from "./briefing-conversation";
import { emptyBrandingScope, emptyScope, emptyEstimate } from "./briefing-conversation";
import { computeEstimate } from "./live-calculator";
import {
  ehAvisoDeAnexo, ehOfertaDeDocumento, recadoDeRecebimento, RETOMADA_DA_PERGUNTA,
} from "./anexo-nao-e-resposta";
import { lerAreaDeAtendimento } from "./comercial/onde-o-negocio-vende";
import { NUMERO_POR_EXTENSO, normalizar as normalizarSemAcento } from "./esteira/leitura-do-pedido";

// ── Text helpers ──────────────────────────────────────────────────────────────

export function isYes(t: string): boolean {
  return /\b(sim|yes|quero|gostaria|preciso|ok|claro|com certeza|tá|pode|pode ser|seria bom|acho que sim|têm|tenho|temos|já|certo)\b/i.test(t);
}

export function isNo(t: string): boolean {
  return /\b(não|nao|no\b|nunca|ainda não|por ora não|dispenso|sem\b|nenhum|zero)\b/i.test(t);
}

const TERMO_DE_ANUNCIO = /tr[áa]fego|an[úu]nci\w*|\bads?\b|impulsion/i;

/**
 * O cliente RECUSOU anúncio nesta frase?
 *
 * Nasceu de "Anúncios não, agora não." ser lido como um SIM porque continha a
 * palavra "anúncios" (23/08/2026). Exige a negativa colada ao assunto — ou uma
 * negativa seca, quando o cliente só responde "não" à pergunta — para que um
 * "quero anúncios, mas sem reels" continue sendo um sim.
 */
export function recusaAnuncio(texto: string): boolean {
  const perto =
    /\b(n[ãa]o|nenhum\w*|zero|sem)\b[^.!?]{0,24}(tr[áa]fego|an[úu]nci|\bads?\b|impulsion)/i.test(texto) ||
    /(tr[áa]fego|an[úu]nci\w*|\bads?\b|impulsion)[^.!?]{0,24}\b(n[ãa]o|nenhum\w*|zero)\b/i.test(texto);
  if (perto) return true;
  return isNo(texto) && !isYes(texto) && !TERMO_DE_ANUNCIO.test(texto);
}

function extractNumber(t: string): number | undefined {
  const m = t.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

/**
 * O NÚMERO POR EXTENSO ("dois", "quatorze"...), reaproveitando o vocabulário
 * de `leitura-do-pedido.ts` — não uma quarta lista da mesma coisa nesta casa.
 *
 * ⚠️ De propósito NÃO entra dentro de `extractNumber`/`volumeNaUnidade`: essa
 * dupla, para texto por extenso, precisa continuar devolvendo ausência — é o
 * comportamento travado por regressão em
 * `__tests__/esteira/o-quadro-nunca-mostra-zero.test.ts` (bloco "na unidade
 * crua"). Quem PRECISA do número por extenso usa a porta de baixo,
 * `volumeNaUnidadeComExtenso` / `frequenciaSemanalComExtenso`.
 */
function extractNumberPorExtenso(t: string): number | undefined {
  // Reaproveita a mesma função de `leitura-do-pedido.ts` que tira acento —
  // "três" e "tres" têm de cair na mesma chave do dicionário.
  const normalizado = normalizarSemAcento(t);
  const re = new RegExp(`\\b(${Object.keys(NUMERO_POR_EXTENSO).join("|")})\\b`);
  const m = normalizado.match(re);
  return m ? NUMERO_POR_EXTENSO[m[1] as keyof typeof NUMERO_POR_EXTENSO] : undefined;
}

/**
 * O NÚMERO NA UNIDADE QUE A PESSOA USOU, convertido para POR SEMANA.
 *
 * ─── O INCIDENTE (16/08/2026) ─────────────────────────────────────────────
 *
 * A queixa do CEO que abriu o dia: ele declarou **"2 posts por dia"**, o painel
 * mostrou **"0 posts/mês"** e a casa devolveu **3 posts por semana**. O dia
 * inteiro isso foi tratado como consequência de um pacote truncado.
 *
 * **Não era só isso.** Medido turno a turno: a pergunta é *"quantas postagens
 * por semana?"*, e o parse fazia `extractNumber(answer)` — que lê **o número e
 * ignora a unidade**. "2 posts por dia" virava `postsPerWeek: 2`.
 *
 * Sete vezes MENOS do que a pessoa pediu, em silêncio, num campo que define
 * quanto ela paga e quanto recebe. E ninguém percebe: 2 é um número plausível
 * para a pergunta feita, então nada denuncia — a mesma doença do dia, "parece
 * respondido, não está".
 *
 * ─── POR QUE CONVERTER, E NÃO REPERGUNTAR ─────────────────────────────────
 *
 * Porque a pessoa RESPONDEU, e respondeu com clareza: ela disse o número E a
 * unidade. Repergunta aqui seria a casa fingindo que não entendeu português
 * para não ter de fazer uma conta. O que não se pode é **assumir** a unidade da
 * pergunta quando a resposta traz outra.
 *
 * Sem unidade declarada, vale a da pergunta (semana) — aí sim a pessoa está
 * respondendo no ritmo que lhe foi perguntado, e supor o contrário seria
 * inventar. Ausência de unidade é diferente de unidade contrária.
 */
export type UnidadeDeVolume = "semana" | "mes";

/** Quantas vezes por SEMANA cada unidade acontece. */
const POR_SEMANA: Record<string, number> = { dia: 7, semana: 1, quinzena: 0.5, mes: 0.25 };

/** A unidade que a RESPOSTA declarou — `null` quando ela não declarou nenhuma. */
function unidadeDaResposta(t: string): keyof typeof POR_SEMANA | null {
  if (/\b(por|ao|todo|cada|a\s*cada)\s*dia\b|\bdi[áa]ri[ao]s?\b|\bdiariamente\b/.test(t)) return "dia";
  if (/\b(por|ao|na|cada|a\s*cada)\s*semana\b|\bsemana(l|is)\b|\bsemanalmente\b/.test(t)) return "semana";
  if (/\bquinzena(l|is)?\b|\ba\s*cada\s*(duas|2)\s*semanas\b/.test(t)) return "quinzena";
  if (/\b(por|ao|no|cada|a\s*cada)\s*m[êe]s\b|\bmensa(l|is)\b|\bmensalmente\b/.test(t)) return "mes";
  return null;
}

/** O núcleo da conversão, já com o número em mãos — dígito ou por extenso, não
 *  importa mais daqui pra frente. Compartilhado pelas duas portas de entrada
 *  abaixo (`volumeNaUnidade` e `volumeNaUnidadeComExtenso`) para a conta nunca
 *  divergir entre elas. */
function converterParaUnidade(n: number, texto: string, destino: UnidadeDeVolume): number {
  const unidade = unidadeDaResposta(texto.toLowerCase());
  // Sem unidade declarada, vale a da PERGUNTA. Ausência de unidade é diferente
  // de unidade contrária: quem responde "5" a "quantas por semana?" está
  // respondendo por semana, e supor o contrário seria inventar o pedido.
  if (unidade === null) return n;

  const porSemana = n * POR_SEMANA[unidade];
  const convertido = destino === "semana" ? porSemana : porSemana * 4;
  return Math.max(1, Math.ceil(convertido));
}

/**
 * O NÚMERO QUE A PESSOA DISSE, NA UNIDADE QUE O CAMPO GUARDA.
 *
 * ⚠️ **A UNIDADE DE DESTINO É PARÂMETRO, e isso é a trava — não um detalhe.**
 *
 * A primeira versão desta função convertia sempre para "por semana", porque as
 * duas perguntas consertadas guardavam `postsPerWeek`/`storiesPerWeek`. Aí a
 * varredura do motor achou **seis** lugares que leem número com unidade, e dois
 * deles guardam `reelsPerMonth` — **por mês**. Aplicar a conversão semanal neles
 * produziria o ERRO INVERSO, com a cara de conserto.
 *
 * Três consertos manuais viram um quarto defeito no dia em que alguém adicionar
 * a quarta pergunta. Com a unidade de destino no parâmetro, quem escreve a
 * pergunta é obrigado a dizer em que unidade ela guarda — e o encontro entre a
 * unidade da pergunta e a da resposta acontece **num lugar só**.
 *
 * Arredondamento sempre para CIMA: 10 posts/mês são 2,5/semana, e entregar 2
 * seria devolver menos do que foi contratado. **Na dúvida, a favor de quem
 * paga.**
 */
export function volumeNaUnidade(texto: string, destino: UnidadeDeVolume): number | undefined {
  const n = extractNumber(texto);
  if (n === undefined) return undefined;
  return converterParaUnidade(n, texto, destino);
}

/** Atalho para o destino mais comum. Mantido porque é o nome que o incidente do
 *  CEO batizou e que os testes daquele dia usam. */
export function frequenciaSemanal(texto: string): number | undefined {
  return volumeNaUnidade(texto, "semana");
}

/**
 * MESMA conversão de `volumeNaUnidade`, mas também lê o número quando ele vem
 * POR EXTENSO ("dois posts por dia"), não só em dígito.
 *
 * ─── O INCIDENTE (16/08/2026, Diego, City Jobs) ───────────────────────────
 *
 * A primeira fala de Diego foi "dois posts estáticos por dia" — sem dígito
 * algum. `volumeNaUnidade`/`frequenciaSemanal` (função acima) devolviam
 * ausência para ela, o que É o comportamento certo NAQUELE nível: uma função
 * que não entende a palavra deve dizer "não sei", nunca chutar. O defeito
 * real morava um andar acima, em quem lia essa ausência e a trocava por um
 * palpite plausível (`?? 3`) — ver `posts_per_week`/`stories`/`reels` em
 * `QUESTIONS` abaixo, e o relato do incidente no cabeçalho do arquivo de
 * teste `__tests__/esteira/o-quadro-nunca-mostra-zero.test.ts`.
 *
 * Esta função é a peça que faltava para quem PRECISA do número de verdade,
 * não um substituto de `volumeNaUnidade` — por isso é uma porta nova, e não
 * uma mudança na porta antiga.
 */
export function volumeNaUnidadeComExtenso(texto: string, destino: UnidadeDeVolume): number | undefined {
  const n = extractNumber(texto) ?? extractNumberPorExtenso(texto);
  if (n === undefined) return undefined;
  return converterParaUnidade(n, texto, destino);
}

export function frequenciaSemanalComExtenso(texto: string): number | undefined {
  return volumeNaUnidadeComExtenso(texto, "semana");
}

export function detectPlatforms(t: string): string[] {
  const p: string[] = [];
  if (/instagram/i.test(t)) p.push("Instagram");
  if (/facebook/i.test(t)) p.push("Facebook");
  if (/tiktok|tik\s*tok/i.test(t)) p.push("TikTok");
  if (/linkedin/i.test(t)) p.push("LinkedIn");
  if (/youtube/i.test(t)) p.push("YouTube");
  if (/google/i.test(t)) p.push("Google Ads");
  if (/meta\s*ads/i.test(t) && !p.includes("Facebook")) p.push("Meta Ads");
  return p;
}

function detectObjectives(t: string): string[] {
  const o: string[] = [];
  if (/vend|convert|compra/i.test(t))                     o.push("Aumentar vendas");
  if (/autoridade|visibilidade|posicion/i.test(t))         o.push("Autoridade / visibilidade");
  if (/novo.{0,6}client|captar|lead/i.test(t))             o.push("Novos clientes");
  if (/lançamento|lançar/i.test(t))                        o.push("Lançamento");
  if (/engajamento|engajar|seguidores/i.test(t))           o.push("Engajamento");
  return o;
}

// Branding is only requested when user explicitly says these words.
// Having a Brand Book does NOT count as requesting branding.
function detectBrandingRequest(t: string): boolean {
  return /\b(rebrand|reposicion|identidade\s*visual|criar.{0,10}logo|logo\s*(nova|do\s*zero)|marca\s*(do\s*zero|nova|redesign|completa)|criar\s*marca|criar\s*identidade|design\s*de\s*marca|identidade\s*de\s*marca)\b/i.test(t);
}

function detectHasBrandBook(t: string): boolean {
  return /\b(tenho\s*(um\s*)?brand\s*(book|guide)|tenho\s*(um\s*)?manual\s*de\s*marca|tenho\s*(uma\s*)?identidade\s*visual|já\s*tem?\s*(um\s*)?brand|temos\s*(um\s*)?brand)\b/i.test(t);
}

// ── Initial message parser ────────────────────────────────────────────────────

export function parseInitialMessage(text: string): Partial<BriefingScope> {
  const wantsSocialMedia = /\b(social\s*media|redes\s*sociais|instagram|facebook|tiktok|linkedin|posts?|stories|feed)\b/i.test(text);
  const wantsPaidTraffic = /\b(tráfego\s*pago|trafego\s*pago|anúncio|anuncio|ads\b|meta\s*ads|google\s*ads|campanha\s*paga|impulsionar)\b/i.test(text);
  const requestedBranding = detectBrandingRequest(text);
  const hasBrandBook      = detectHasBrandBook(text);

  let serviceMode: BriefingScope["serviceMode"] | undefined;
  if (/\b(mensal|mensalment|por\s*m[eê]s|m[eê]s\s*a\s*m[eê]s)\b/i.test(text)) serviceMode = "monthly";
  else if (/\b(pontual|avulso|uma\s*vez|projeto\s*[úu]nico)\b/i.test(text)) serviceMode = "one_off";

  let segment: string | undefined;
  if (/restaurante|sushi|pizz|hamburgue|fast\s*food|caf[eé]\b|bar\b/i.test(text)) segment = "Restaurante / Alimentação";
  else if (/e-?commerce|loja\s*online|loja\s*virtual/i.test(text)) segment = "E-commerce";
  else if (/cl[íi]nica|m[eé]dico|sa[úu]de|odonto/i.test(text)) segment = "Saúde";
  else if (/advocaci|advogado|jur[íi]dico/i.test(text)) segment = "Jurídico";
  else if (/moda|roupa|vestu[áa]rio/i.test(text)) segment = "Moda";
  else if (/academia|fitness|crossfit/i.test(text)) segment = "Fitness";

  let businessName: string | undefined;
  // "chamado X" / "chamada X"
  const nameMatch = text.match(/chamad[ao]\s+([A-ZÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (nameMatch) businessName = nameMatch[1].trim();
  // "sou/trabalho/venho da/do [Name]" — no /i so capture group requires uppercase
  if (!businessName) {
    const m = text.match(/\b(?:sou|estou|trabalho|venho)\s+(?:da|do|de|na|no)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})(?:\s*[,.!?]|\s+e\s|$)/);
    if (m) businessName = m[1].trim();
  }
  // "para o/a [Name]" — no /i so capture group requires uppercase
  if (!businessName) {
    const m = text.match(/\bpara\s+(?:o|a)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})(?:\s*[,.!?]|\s+e\s|$)/);
    if (m) businessName = m[1].trim();
  }
  // Multi-word TitleCase at sentence start — "Marca Exemplo, quero…" or standalone
  if (!businessName) {
    const m = text.match(/^([A-ZÀ-ÿ][a-zÀ-ÿ]{1,}(?:\s+[A-ZÀ-ÿ][a-zÀ-ÿ]{1,})+)(?:\s*[,.]|\s+[a-z]|$)/);
    if (m) businessName = m[1].trim();
  }

  const platforms = wantsSocialMedia ? detectPlatforms(text) : [];

  return {
    businessName,
    segment,
    objectives: detectObjectives(text),
    serviceMode,
    wantsSocialMedia,
    ...(wantsSocialMedia ? { social: { platforms } } : {}),
    ...(wantsPaidTraffic ? { wantsPaidTraffic: true } : {}),
    branding: {
      requested: requestedBranding,
      hasBrandBook,
      wantsRebrand: /rebrand|reposicion/i.test(text),
    },
  };
}

// Which question IDs can be skipped because the scope already has that data?
export function inferAnsweredQIds(scope: BriefingScope): string[] {
  const a: string[] = [];
  if (scope.wantsSocialMedia || scope.wantsPaidTraffic !== undefined || scope.branding?.requested)
    a.push("detect_service");
  if (scope.objectives.length)                      a.push("main_objective");
  if (scope.targetAudience)                         a.push("target_audience");
  if (scope.serviceMode !== undefined)              a.push("service_mode");
  if (scope.social?.platforms.length)               a.push("social_platforms");
  if (scope.social?.postsPerWeek !== undefined)     a.push("posts_per_week");
  if (scope.social?.storiesPerWeek !== undefined)   a.push("stories");
  if (scope.social?.reelsPerMonth !== undefined)    a.push("reels");
  if (scope.social?.hasVideomaker !== undefined)    a.push("social_video");
  if (scope.social?.hasPhotos !== undefined)        a.push("has_photos");
  if (scope.social?.needsCopy !== undefined)        a.push("needs_copy");
  if (scope.wantsPaidTraffic !== undefined)         a.push("wants_traffic");
  if (scope.traffic?.platforms.length)              a.push("traffic_platforms");
  if (scope.traffic?.monthlyAdBudget)               a.push("ad_budget");
  if (scope.traffic?.serviceArea)                   a.push("service_area");
  if (scope.branding?.deliverables)                  a.push("branding_deliverables");
  if (scope.competitors?.length)                    a.push("competitors_refs");
  if (scope.budgetRange)                            a.push("budget_range");
  if (scope.operacao)                               a.push("operacao_basica");
  if (scope.deadline)                               a.push("deadline");
  return a;
}

// ── Question definitions ──────────────────────────────────────────────────────

export interface QuestionDef {
  id: string;
  when: (s: ConvState) => boolean;
  text: (s: ConvState) => string;
  parse: (answer: string, s: ConvState) => Partial<BriefingScope>;
}

const social = (s: ConvState): SocialScope => s.scope.social ?? { platforms: [] };

/**
 * A FILA DE PERGUNTAS DO BRIEFING.
 *
 * ⚠️ **ORDEM É ARMADILHA NESTA CASA.** O portão de envio abre quando a última
 * pergunta OBRIGATÓRIA é respondida — tudo que vier depois dela é perguntado
 * com o botão de enviar já na mão do cliente, e não é respondido. Aconteceu
 * duas vezes: `budget_range` (23/08/2026, custou R$ 4.500–7.700 cotados a um
 * cliente de R$ 500) e `operacao_basica` (24/08/2026, chegou nula à produção).
 *
 * Pergunta nova entra ANTES da última obrigatória. Há teste que reprova quem
 * acrescentar no fim — `o-briefing-coleta-o-que-a-producao-usa.test.ts`.
 */
const QUESTIONS: QuestionDef[] = [
  // Q0 — detect service (if nothing was understood from initial message)
  {
    id: "detect_service",
    when: (s) => !s.scope.wantsSocialMedia && s.scope.wantsPaidTraffic === undefined && !s.scope.branding?.requested,
    text: () => "Pode me contar mais? Você está buscando gestão de redes sociais, tráfego pago, criação de identidade visual — ou uma combinação?",
    parse: (answer) => {
      // "os 3", "todos", "as três", "tudo", "uma combinação" → the client wants
      // ALL three services just offered. Without this, a short "Os 3" captured
      // nothing and the request silently had no service.
      const all = /\b(os\s*(3|tr[êe]s)|as\s*tr[êe]s|todos|todas|tudo|todo\s+os|uma?\s*combina|combina[çc])\b/i.test(answer);
      const wantsSocialMedia  = all || /social|instagram|facebook|redes|posts/i.test(answer);
      const wantsPaidTraffic  = all || /tráfego|anúncio|ads|pago|impulsion/i.test(answer);
      const requestedBranding = all || detectBrandingRequest(answer);
      return {
        wantsSocialMedia,
        ...(wantsPaidTraffic ? { wantsPaidTraffic: true } : {}),
        branding: { requested: requestedBranding, hasBrandBook: false, wantsRebrand: false },
        ...(wantsSocialMedia ? { social: { platforms: detectPlatforms(answer) } } : {}),
      };
    },
  },

  // Q0.1 — UNIVERSAL: main objective (the agency needs to know what success is)
  {
    id: "main_objective",
    when: (s) => s.scope.objectives.length === 0,
    text: () => "Qual é o **principal objetivo** que você quer alcançar com esse trabalho? (ex: mais vendas, mais clientes, autoridade, engajamento)",
    parse: (answer) => {
      const detected = detectObjectives(answer);
      return { objectives: detected.length ? detected : [answer.trim().slice(0, 90)] };
    },
  },

  // Q0.2 — UNIVERSAL: target audience (who we're speaking to)
  {
    id: "target_audience",
    when: (s) => !s.scope.targetAudience,
    text: () => "Quem é o seu **público-alvo** — o cliente ideal que você quer atingir? (idade, perfil, região, o que buscam)",
    parse: (answer) => ({ targetAudience: answer.trim() }),
  },

  // Q1 — monthly vs one-off
  {
    id: "service_mode",
    when: (s) => (s.scope.wantsSocialMedia || !!s.scope.wantsPaidTraffic) && !s.scope.serviceMode,
    text: () => "Você imagina esse trabalho como um **contrato mensal** (gestão contínua) ou uma **campanha pontual** (projeto com prazo definido)?",
    parse: (answer) => {
      if (/mensal|recorrent|contínuo|m[eê]s\s*a\s*m[eê]s/i.test(answer)) return { serviceMode: "monthly" };
      if (/pontual|avulso|[úu]nica|uma\s*vez|projeto\s*[úu]nico/i.test(answer))  return { serviceMode: "one_off" };
      return { serviceMode: "unsure" };
    },
  },

  // Q2 — social platforms
  {
    id: "social_platforms",
    when: (s) => s.scope.wantsSocialMedia && !s.scope.social?.platforms.length,
    text: () => "Quais canais você quer trabalhar? Instagram, Facebook, TikTok, LinkedIn — ou alguma combinação?",
    parse: (answer, s) => {
      const plat = detectPlatforms(answer);
      return { social: { ...social(s), platforms: plat.length ? plat : ["Instagram"] } };
    },
  },

  // Q3 — posts per week
  {
    id: "posts_per_week",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.postsPerWeek === undefined,
    text: () => "Quantas postagens por semana você imagina para o feed? (3 por semana é um ritmo consistente para começar)",
    // `frequenciaSemanalComExtenso`, e não `extractNumber`: "2 posts por dia"
    // (ou "dois posts por dia", por extenso) são 14 por semana, não 2. Ver o
    // incidente no cabeçalho da função — foi assim que a casa devolveu
    // 3/semana a quem pediu 2/dia.
    //
    // SEM `?? 3`: ausência de informação não é informação. Quando a conversão
    // falha, o campo fica `undefined` — ausência declarada, que trava a
    // estimativa em `live-calculator.ts` (`volumeDeclarado`/`travadaPor`) — e
    // NUNCA um palpite plausível como "3", que parece resposta de verdade e
    // ninguém questiona de novo. Incidente de 16/08 (Diego, City Jobs):
    // "dois posts estáticos por dia" virava silenciosamente 3/semana.
    parse: (answer, s) => ({ social: { ...social(s), postsPerWeek: frequenciaSemanalComExtenso(answer) } }),
  },

  // Q4 — stories
  {
    id: "stories",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.storiesPerWeek === undefined,
    text: () => "Vai querer stories também? Se sim, quantas publicações por semana?",
    // Mesma unidade, mesmo defeito, mesmo conserto: "3 stories por dia" são 21
    // por semana, e "três stories por dia" também — por extenso ou dígito.
    // (`reels` pergunta POR MÊS e por isso NÃO entra aqui — a conversão dele é
    // outra, e aplicar esta faria o erro inverso.)
    //
    // SEM `?? 3`: mesma trava da pergunta anterior — quando não dá para ler o
    // número, o campo fica ausente, nunca um palpite disfarçado de resposta.
    parse: (answer, s) => ({ social: { ...social(s), storiesPerWeek: isNo(answer) ? 0 : frequenciaSemanalComExtenso(answer) } }),
  },

  // Q5 — reels
  {
    id: "reels",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.reelsPerMonth === undefined,
    text: () => "Vai precisar de reels ou vídeos? Se sim, quantos por mês? (Roteiro e edição inclusos — filmagem não é incluída por padrão)",
    // Destino "mes": este campo é `reelsPerMonth`. "2 reels por semana" são 8
    // por mês — e a conversão semanal daria 2, o erro inverso com cara de
    // conserto. `volumeNaUnidadeComExtenso` também lê "dois reels por mês".
    //
    // SEM `?? 4`: mesma trava das duas perguntas acima — ausência declarada,
    // nunca um palpite.
    parse: (answer, s) => ({ social: { ...social(s), reelsPerMonth: isNo(answer) ? 0 : volumeNaUnidadeComExtenso(answer, "mes") } }),
  },

  // Q5.1 — video production (only when reels/videos are in scope)
  {
    id: "social_video",
    when: (s) => s.scope.wantsSocialMedia && (s.scope.social?.reelsPerMonth ?? 0) > 0 && s.scope.social?.hasVideomaker === undefined,
    text: () => "Para os vídeos/reels: vocês têm alguém para **gravar e editar**, ou a Dioli cuida da produção do vídeo?",
    parse: (answer, s) => {
      const dioli = /dioli|voc[êe]s|produç|produz|precis|não tenho|nao tenho|sem\b/i.test(answer);
      const own   = /temos|tenho|pr[óo]prio|n[óo]s|equipe|videomaker|j[áa] tem/i.test(answer) && !dioli;
      return { social: { ...social(s), hasVideomaker: own, needsVideoProduction: !own } };
    },
  },

  // Q6 — has photos
  {
    id: "has_photos",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.hasPhotos === undefined,
    text: (s) => {
      const seg = s.scope.segment?.split("/")[0]?.trim().toLowerCase() ?? "negócio";
      return `Vocês já têm fotos e vídeos do ${seg} disponíveis, ou vai precisar de produção fotográfica?`;
    },
    parse: (answer, s) => ({ social: { ...social(s), hasPhotos: isYes(answer) || /tem|tenho|temos|dispon[íi]v|própri/i.test(answer) } }),
  },

  // Q7 — needs copy
  {
    id: "needs_copy",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.needsCopy === undefined,
    text: () => "A Dioli vai criar os textos (copy) das postagens, ou você vai fornecer o conteúdo?",
    parse: (answer, s) => {
      const dioli = /dioli|voc[êe]s?\s*(criam|fazem)|precisamos|criar|copyw/i.test(answer) || isYes(answer);
      return { social: { ...social(s), needsCopy: dioli } };
    },
  },

  // Q8 — paid traffic
  //
  // ─── "ANÚNCIOS NÃO" CONTINHA A PALAVRA "ANÚNCIOS" ──────────────────────────
  //
  // 23/08/2026, cliente falso. À pergunta acima o cliente respondeu **"Anúncios
  // não, agora não."** — e o `parse` antigo procurava a palavra "anúncio" no
  // texto, achava, e gravava `wantsPaidTraffic: true`. A casa então perguntou a
  // plataforma dos anúncios, ouviu *"Nenhuma — eu disse que não quero anúncios
  // agora"*, e perguntou a VERBA dos anúncios logo em seguida.
  //
  // Duas perguntas depois de um "não" claro. Para quem lê, isso não é um bug de
  // parser: é a casa insistindo em vender o que ele acabou de recusar — e ainda
  // enche o escopo de campos de tráfego que ele nunca pediu.
  //
  // A negação ganha da palavra-chave, e não o contrário. O reconhecimento é
  // estreito: exige a negativa PERTO do assunto (ou uma negativa seca, sem
  // nenhum termo de anúncio), justamente para não derrubar um "sim, quero
  // anúncios, mas sem reels".
  {
    id: "wants_traffic",
    when: (s) => s.scope.wantsPaidTraffic === undefined,
    text: () => "Quer incluir **tráfego pago** (anúncios no Instagram, Facebook ou Google) neste projeto?",
    parse: (answer) => ({ wantsPaidTraffic: recusaAnuncio(answer) ? false : (isYes(answer) || /tráfego|anúncio|ads|impulsion/i.test(answer)) }),
  },

  // Q8.1 — traffic platforms (only if traffic wanted)
  {
    id: "traffic_platforms",
    when: (s) => !!s.scope.wantsPaidTraffic && !s.scope.traffic?.platforms.length,
    text: () => "Os anúncios seriam em qual plataforma: **Meta (Instagram/Facebook)**, **Google**, ou ambos?",
    parse: (answer, s) => {
      const plat = detectPlatforms(answer);
      return { traffic: { ...(s.scope.traffic ?? { platforms: [] }), platforms: plat.length ? plat : ["Meta Ads"] } };
    },
  },

  // Q9 — ad budget (only if traffic wanted)
  {
    id: "ad_budget",
    when: (s) => !!s.scope.wantsPaidTraffic && !s.scope.traffic?.monthlyAdBudget,
    text: () => "Qual é a verba mensal disponível para os anúncios? (Esse valor vai direto para o Google/Meta — é separado da gestão)",
    parse: (answer, s) => ({ traffic: { ...(s.scope.traffic ?? { platforms: [] }), monthlyAdBudget: answer.trim() } }),
  },

  // Q9.2 — ONDE O NEGÓCIO VENDE (only if traffic wanted)
  //
  // Sem esta pergunta a campanha nasce com `cidade: null`, e `null` virava
  // "Brasil inteiro" sem uma palavra. Para o padeiro que quer anunciar no bairro
  // dele, isso é a verba do mês gasta em quem não alcança a padaria.
  //
  // A pergunta oferece as DUAS saídas em voz alta — cidade ou Brasil inteiro —
  // porque quem vende online de verdade precisa poder dizer isso, e o silêncio
  // não pode ser lido como nenhuma das duas.
  {
    id: "service_area",
    when: (s) => !!s.scope.wantsPaidTraffic && !s.scope.traffic?.serviceArea,
    text: () => "Onde estão os clientes que você quer alcançar? Me diga a **cidade** (e o raio, se souber — ex: \"São Paulo, uns 10 km\"). Se você vende para o **Brasil inteiro**, pode dizer também.",
    parse: (answer, s) => ({
      traffic: {
        ...(s.scope.traffic ?? { platforms: [] }),
        serviceArea: lerAreaDeAtendimento(answer),
      },
    }),
  },

  // Q9.1 — BRANDING: is there a current identity? (only if branding requested)
  {
    id: "branding_current",
    when: (s) => !!s.scope.branding?.requested,
    text: () => "Sobre a identidade visual: você **já tem logo/identidade** hoje, ou vamos criar **do zero**?",
    parse: (answer, s) => {
      const t = answer.toLowerCase();
      const fromScratch = /do zero|zero|não tenho|nao tenho|nenhum|criar|nova\b|nao\b|não\b/.test(t) && !/tenho|temos|j[áa]/.test(t);
      const rebrand     = /rebrand|reposicion|renovar|atualizar|refazer|modernizar|melhorar/.test(t);
      return { branding: { ...{ ...emptyBrandingScope(), ...s.scope.branding }, hasBrandBook: !fromScratch && /tenho|temos|j[áa]|possu|atual|existe/.test(t), wantsRebrand: rebrand, fromScratch } };
    },
  },

  // Q9.2 — BRANDING: what deliverables (only if branding requested)
  {
    id: "branding_deliverables",
    when: (s) => !!s.scope.branding?.requested && !s.scope.branding?.deliverables,
    text: () => "O que você precisa na identidade: **logo, paleta de cores, tipografia, manual de marca completo**? Pode listar o que tiver em mente.",
    parse: (answer, s) => ({ branding: { ...{ ...emptyBrandingScope(), ...s.scope.branding }, deliverables: answer.trim() } }),
  },

  // Q9.3 — UNIVERSAL: competitors / references
  {
    id: "competitors_refs",
    when: (s) => (s.scope.competitors?.length ?? 0) === 0,
    text: () => "Tem **concorrentes ou referências** (marcas, perfis) que você admira ou quer usar de inspiração?",
    parse: (answer) => {
      if (isNo(answer)) return { competitors: [] };
      const refs = answer.split(/,|\se\s|;|\/| - /).map((x) => x.trim()).filter((x) => x.length > 1).slice(0, 6);
      return { competitors: refs.length ? refs : [answer.trim().slice(0, 60)] };
    },
  },

  // ── Q9.5 — OS BÁSICOS QUE A PRODUÇÃO USA ──────────────────────────────────
  //
  // ── Por que esta pergunta existe (24/08/2026) ────────────────────────────
  // O briefing perguntava tudo que serve para VENDER e nada do que serve para
  // PRODUZIR. No piloto de ponta a ponta a Qualidade barrou CINCO peças com o
  // mesmo parecer: "CTAs prometem 'confirmar canais' e deixam PRECISO
  // CONFIRMAR sem resolver — peça depende de informação não fornecida". O
  // pacote fechou, ficou retido, e o cliente nunca soube.
  //
  // A lista NÃO é palpite: são os fatos que a Qualidade cobrou, e os mesmos que
  // o piso de verdade confere na peça pronta (`classesSemInformacao`). O que
  // ela não cobrou não entrou — pagamento, oferta e prazo continuam fora,
  // porque nenhuma peça foi barrada por eles.
  //
  // ── AS TRÊS REGRAS QUE ESTA PERGUNTA RESPEITA ────────────────────────────
  //
  //  1. **Um bloco, uma vez.** Três perguntas soltas virariam interrogatório, e
  //     prospect real desiste de formulário longo — isso custa mais que peça
  //     retida.
  //  2. **Não trava o briefing.** "Não tenho" e "prefiro não dizer" são
  //     respostas válidas: a pergunta se fecha e a conversa segue. O que não
  //     pode é a produção descobrir a falta depois.
  //  3. **Só para quem vai ter peça de social.** Quem só contratou tráfego não
  //     precisa responder o que não vai ser usado.
  //  4. **Vem ANTES da verba, e isso é posição, não gosto.** Ela é opcional (não
  //     trava o portão), e o portão abre assim que a última pergunta OBRIGATÓRIA
  //     é respondida. Colocada depois da verba, ela era feita como fala de
  //     despedida e o cliente já tinha o botão de enviar na mão — medido ao vivo
  //     em 24/08/2026: a casa perguntou, a conversa acabou, e `operacao` chegou
  //     nula à produção. É o MESMO defeito que tirou `budget_range` de opcional
  //     em 23/08, descrito no comentário de `OPTIONAL_QIDS` — e eu entrei nele
  //     de novo por outra porta. Antes da verba, ela é perguntada e respondida
  //     com o portão ainda fechado; a verba segue logo atrás, sem ir para o fim.
  //
  // ⛔ NÃO PEDE E-MAIL (regra do CEO) e NÃO PEDE O NÚMERO do WhatsApp — só se o
  // negócio ATENDE por lá. O escopo inteiro é serializado para dentro do prompt
  // do modelo, e `semPii` já remove sequências longas de dígitos: pedir número
  // seria pedir o que a casa apaga em seguida.
  {
    id: "operacao_basica",
    when: (s) => s.scope.wantsSocialMedia === true && !s.scope.operacao,
    text: () => [
      "Falta pouco! Três coisas rápidas — são as que a equipe usa na hora de escrever os posts:",
      "",
      "1. Qual o **@ do seu Instagram**?",
      "2. **Horário e dias** que vocês funcionam?",
      "3. Vocês atendem **que bairros ou cidades** — e atendem por WhatsApp?",
      "",
      "Se não tiver alguma delas, é só dizer que a gente segue. 🙂",
    ].join("\n"),
    parse: (answer) => ({ operacao: answer.trim() }),
  },

  // Q10 — budget range
  {
    id: "budget_range",
    when: (s) => !s.scope.budgetRange,
    text: () => "Para fecharmos o escopo: qual faixa de orçamento mensal você tem em mente para a gestão? (sem contar a verba de anúncios)",
    parse: (answer) => ({ budgetRange: answer.trim() }),
  },

  // Q11 — deadline
  {
    id: "deadline",
    when: (s) => !s.scope.deadline,
    text: () => "E para quando você quer começar?",
    parse: (answer) => ({ deadline: answer.trim() }),
  },
];

// ── Scope merge ───────────────────────────────────────────────────────────────

export function mergeScopeDelta(base: BriefingScope, delta: Partial<BriefingScope>): BriefingScope {
  return {
    ...base,
    ...delta,
    objectives: delta.objectives !== undefined
      ? [...new Set([...base.objectives, ...delta.objectives])]
      : base.objectives,
    branding: delta.branding
      ? { ...base.branding, ...delta.branding }
      : base.branding,
    social: delta.social !== undefined
      ? { ...(base.social ?? { platforms: [] }), ...delta.social }
      : base.social,
    traffic: delta.traffic !== undefined
      ? { ...(base.traffic ?? { platforms: [] }), ...delta.traffic }
      : base.traffic,
  };
}

// ── Acknowledgment builder ────────────────────────────────────────────────────

export function buildAcknowledgment(scope: BriefingScope): string {
  const parts: string[] = [];
  if (scope.businessName) parts.push(`Perfeito, ${scope.businessName}!`);
  else parts.push("Entendido!");

  const svcs: string[] = [];
  if (scope.wantsSocialMedia) {
    const plat = scope.social?.platforms ?? [];
    svcs.push(`social media${plat.length ? " para " + plat.join(" e ") : ""}`);
  }
  if (scope.wantsPaidTraffic) svcs.push("tráfego pago");
  if (scope.branding?.requested) svcs.push("identidade visual");
  if (svcs.length) parts.push(`Vejo que você quer ${svcs.join(" e ")}.`);

  if (scope.objectives.length) {
    parts.push(`Objetivos: ${scope.objectives.join(", ").toLowerCase()}.`);
  }

  // Critical: brand book presence ≠ branding service request
  if (scope.branding?.hasBrandBook && !scope.branding?.requested) {
    parts.push("Vi que você já tem um Brand Book — ótimo! Vou usá-lo como referência para o projeto. Não vou incluir criação de identidade visual no escopo por padrão.");
  }

  return parts.join(" ");
}

// ── Negotiation detection ─────────────────────────────────────────────────────
// Recognises scope-modification intents so the SDR can adjust the cart live.
// Only fires on explicit signals — does not intercept normal question answers.

interface NegotiationResult {
  scopeDelta: Partial<BriefingScope>;
  replyText: string;
}

export function detectNegotiation(text: string, state: ConvState): NegotiationResult | null {
  const s   = state.scope;
  const soc = s.social ?? { platforms: [] };
  const t   = text.toLowerCase();

  // ── Price objection ─────────────────────────────────────────────────────
  if (/tá caro|ta caro|muito caro|caro demais|ficou caro|tô achando caro|achei caro/.test(t)) {
    const posts = soc.postsPerWeek ? soc.postsPerWeek * 4 : null;
    if (s.wantsSocialMedia && posts && posts > 8) {
      return {
        scopeDelta: { social: { ...soc, postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 }, wantsPaidTraffic: false },
        replyText:
          "Entendido! Posso ajustar para o **Plano Starter** — 8 posts + 8 stories/mês, sem reels e sem tráfego, faixa de **R$ 1.200–1.800/mês**.\n\nIso serve como ponto de partida. Quando o negócio crescer, a gente escala.",
      };
    }
    return {
      scopeDelta: {},
      replyText: "Claro! Podemos ajustar. O que você prefere reduzir — posts, stories, reels — ou deixar o tráfego pago para depois?",
    };
  }

  // ── Request cheaper/smaller plan ────────────────────────────────────────
  if (/quero começar menor|comecar menor|plano mais barato|mais barato|o starter|plano starter\b|starter\b|plano menor|menor plano|mais simples|mais enxuto|começar pequeno/.test(t)) {
    return {
      scopeDelta: {
        social: { ...soc, postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 },
        wantsPaidTraffic: false,
      },
      replyText:
        "Feito! Ajustei para o **Plano Starter** — 8 posts + 8 stories/mês, sem reels e sem tráfego pago. Faixa de **R$ 1.200–1.800/mês**.\n\nQuando quiser escalar, é só dizer.",
    };
  }

  // ── Remove reels ─────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia &&
    /sem reels?|tira reels?|não quero reels?|nao quero reels?|deixa reels? pra depois|reels? por enquanto não|reels? depois|sem os reels?|cancela reels?|tira os reels?/.test(t)
  ) {
    return {
      scopeDelta: { social: { ...soc, reelsPerMonth: 0 } },
      replyText: "Feito! Removi os reels do escopo. Você pode adicionar quando estiver pronto para produção de vídeo.",
    };
  }

  // ── Add reels ────────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia &&
    /quero reels?|adicionar reels?|adiciona reels?|inclui reels?|coloca reels?|incluir reels?/.test(t)
  ) {
    // Mesmo campo, mesma unidade de destino que a pergunta `reels`. A negociação
    // ("quero reels") é outra porta para o MESMO campo — deixar uma porta sem a
    // conversão é deixar o defeito escolher por onde entrar.
    const n = volumeNaUnidade(text, "mes") ?? 2;
    return {
      scopeDelta: { social: { ...soc, reelsPerMonth: n } },
      replyText: `Ótimo! Adicionei ${n} reel${n !== 1 ? "s" : ""}/mês — roteiro + edição a partir de material do cliente. Filmagem não está incluída por padrão.`,
    };
  }

  // ── Remove paid traffic ──────────────────────────────────────────────────
  if (
    /sem tráfego|sem trafego|tira tráfego|tira trafego|não quero tráfego|nao quero trafego|deixa tráfego|deixa trafego|tráfego depois|trafego depois|sem anúncio|sem anuncio/.test(t)
  ) {
    return {
      scopeDelta: { wantsPaidTraffic: false },
      replyText: "Entendido! Deixei o tráfego pago de fora por agora. É uma boa estratégia começar com orgânico e adicionar mídia paga quando tiver mais tração.",
    };
  }

  // ── Add paid traffic ─────────────────────────────────────────────────────
  if (
    /quero tráfego|quero trafego|inclui tráfego|inclui trafego|adicionar tráfego|adiciona tráfego|adiciona trafego|incluir tráfego|com tráfego|com trafego/.test(t)
  ) {
    return {
      scopeDelta: { wantsPaidTraffic: true },
      replyText: "Ótimo! Adicionei tráfego pago ao escopo. Qual é a verba mensal disponível para anúncios? (Esse valor vai direto ao Meta/Google — separado da taxa de gestão.)",
    };
  }

  // ── Increase posts ───────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia && soc.postsPerWeek !== undefined &&
    /mais posts?|aumentar posts?|aumenta posts?|sobe posts?|mais postagens?/.test(t)
  ) {
    // "quero mais posts, 2 por dia" são 14/semana — não 2.
    const n = volumeNaUnidade(text, "semana") ?? soc.postsPerWeek + 1;
    return {
      scopeDelta: { social: { ...soc, postsPerWeek: n } },
      replyText: `Feito! Ajustei para ${n} posts por semana (${n * 4}/mês).`,
    };
  }

  // ── Reduce posts ─────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia && soc.postsPerWeek !== undefined &&
    /menos posts?|diminuir posts?|diminui posts?|reduzir posts?|reduz posts?/.test(t)
  ) {
    const n = volumeNaUnidade(text, "semana") ?? Math.max(2, soc.postsPerWeek - 1);
    return {
      scopeDelta: { social: { ...soc, postsPerWeek: n } },
      replyText: `Feito! Ajustei para ${n} posts por semana (${n * 4}/mês).`,
    };
  }

  return null;
}



export function getNextQuestion(state: ConvState): QuestionDef | null {
  for (const q of QUESTIONS) {
    if (!state.answeredQIds.includes(q.id) && q.when(state)) return q;
  }
  return null;
}

// Perguntas que a entrevista faz mas que NÃO travam o envio.
//
// ─── POR QUE `budget_range` SAIU DAQUI EM 23/08/2026 ─────────────────────────
//
// Enquanto a verba era opcional, o portão de envio abria assim que a última
// pergunta substantiva era respondida — e a pergunta da verba, que vinha depois
// dela na fila, virava a fala de despedida: ninguém nunca a respondia, porque o
// cliente já tinha o botão de enviar na mão.
//
// O resultado medido: escopo sem `budgetRange`, `confrontoDeVerba` devolvendo
// `null` por falta de teto, e R$ 4.500–7.700/mês entregues, calados, a um
// cliente que tinha R$ 500/mês. O mesmo estrago de 16/08 (CityJobs), por outra
// porta.
//
// A casa não manda preço a quem nunca foi perguntado quanto pode gastar. E não
// há risco de a conversa emperrar aqui: `budget_range` fecha com QUALQUER
// resposta (`parse` guarda a frase do cliente), então uma volta de pergunta
// basta — inclusive quando a resposta é "prefiro não dizer", que também é uma
// declaração e vale mais que o silêncio.
//
// `deadline` continua opcional: começar em julho ou em agosto não muda o preço
// que o cliente vai ler, e travar o envio por isso seria perder o lead por nada.
// ─── `operacao_basica` É OPCIONAL, E ISSO É REQUISITO (24/08/2026) ──────────
//
// A ordem do Diretor Geral ao autorizá-la foi explícita: **"nada disso pode
// travar o briefing"**. Um teste desta casa pegou exatamente isso na primeira
// tentativa — com ela obrigatória, o portão de envio parou de abrir e o
// visitante ficaria sem botão por não ter dito o horário do restaurante.
//
// Perder o lead custa mais do que peça retida: a peça a casa reescreve, o
// prospect que desistiu não volta. Ela é PERGUNTADA sempre, e responder "não
// tenho" fecha a pergunta como qualquer outra resposta — o que ela nunca faz é
// impedir o briefing de virar pedido.
//
// ⚠️ Não confundir com `budget_range`, que saiu daqui em 23/08 e por motivo
// oposto: sem verba a casa MANDA PREÇO ERRADO, que é dano ativo. Sem os
// básicos operacionais a casa produz uma peça mais fraca e a Qualidade a
// segura — dano contido, e do lado de dentro.
const OPTIONAL_QIDS = new Set(["deadline", "operacao_basica"]);

/** A fila inteira, para quem precisa CONFERIR a ordem (teste da regra de
 *  classe). Somente leitura: mexer aqui é mexer no briefing. */
export const TODAS_AS_PERGUNTAS: readonly QuestionDef[] = QUESTIONS;

/** Quais ids não travam o envio. Exportado pelo mesmo motivo acima. */
export const QIDS_OPCIONAIS: ReadonlySet<string> = OPTIONAL_QIDS;

// The still-pending questions that MUST be answered before a lead is complete.
// Empty ⇒ the substantive protocol is fully covered.
export function remainingRequiredQuestions(state: ConvState): QuestionDef[] {
  return QUESTIONS.filter(
    (q) => !OPTIONAL_QIDS.has(q.id) && !state.answeredQIds.includes(q.id) && q.when(state),
  );
}

export function processClientMessage(text: string, state: ConvState): ConvState {
  const clientMsg: ConvMessage = {
    id: `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "client",
    text,
    createdAt: new Date().toISOString(),
  };
  const withClient = { ...state, messages: [...state.messages, clientMsg] };

  let newScope: BriefingScope;
  let newAnswered: string[];
  let negotiationReply: string | null = null;

  // Mesma trava do `prospect-engine`: o recado automático de anexo não é
  // resposta e não pode encostar em campo de escopo (16/08/2026 — o nome de um
  // PDF ocupou o campo Orçamento na tela do CEO). A regra vive nos DOIS motores
  // porque a sala V2 tem upload próprio; deixar só um protegido é deixar o
  // defeito escolher a porta. Ver `anexo-nao-e-resposta.ts`.
  const avisoDeAnexo = ehAvisoDeAnexo(text);
  // A oferta do documento entra na MESMA trava do recado do anexo: 23/08/2026,
  // "Posso te mandar nosso briefing em PDF, ajuda?" virou o `targetAudience` do
  // pedido. Deixar só um motor protegido é deixar o defeito escolher a porta.
  const ofertaDeDocumento = ehOfertaDeDocumento(text);
  const mensagemSemResposta = avisoDeAnexo || ofertaDeDocumento;

  if (mensagemSemResposta) {
    newScope    = state.scope;
    newAnswered = state.answeredQIds;
  } else if (state.isFirstMessage) {
    const delta = parseInitialMessage(text);
    newScope    = mergeScopeDelta(emptyScope(), delta);
    newAnswered = inferAnsweredQIds(newScope);
  } else {
    // Check negotiation intent before answering the current question
    const negotiation = detectNegotiation(text, state);
    if (negotiation) {
      newScope        = mergeScopeDelta(state.scope, negotiation.scopeDelta);
      newAnswered     = [...new Set([...state.answeredQIds, ...inferAnsweredQIds(newScope)])];
      negotiationReply = negotiation.replyText;
    } else {
      const currentQ = getNextQuestion(state);
      if (currentQ) {
        const delta = currentQ.parse(text, state);
        newScope    = mergeScopeDelta(state.scope, delta);
        newAnswered = [...new Set([...state.answeredQIds, currentQ.id, ...inferAnsweredQIds(newScope)])];
      } else {
        newScope    = state.scope;
        newAnswered = state.answeredQIds;
      }
    }
  }

  const mid: ConvState = {
    ...withClient,
    scope: newScope,
    answeredQIds: newAnswered,
    // Anexo não consome a primeira fala — quem se apresenta é a mensagem que a
    // pessoa ainda vai digitar.
    isFirstMessage: mensagemSemResposta ? state.isFirstMessage : false,
    estimate: state.estimate,
    canSubmit: false,
  };
  const estimate = computeEstimate(newScope);
  const nextQ    = getNextQuestion(mid);
  const allDone  = nextQ === null;

  let replyText: string;
  if (state.isFirstMessage) {
    const ack = buildAcknowledgment(newScope);
    replyText = nextQ
      ? `${ack}\n\n${nextQ.text(mid)}`
      : `${ack}\n\nTenho as informações principais! Revise o resumo do seu pedido e envie quando estiver pronto.`;
  } else if (negotiationReply) {
    replyText = nextQ && !allDone
      ? `${negotiationReply}\n\n${nextQ.text(mid)}`
      : negotiationReply;
  } else if (nextQ) {
    replyText = nextQ.text(mid);
  } else {
    replyText = "Ótimo! Tenho tudo que preciso. Revise o resumo do seu pedido e clique em **\"Enviar solicitação\"** quando estiver pronto.";
  }

  // Arquivo que chega tem de ser acusado antes de a pergunta voltar — senão a
  // pergunta repetida diz ao cliente que ninguém leu o que ele mandou. Mesmo
  // texto do outro motor, de propósito: duas salas dizendo coisas diferentes
  // sobre o mesmo evento é como esta casa já se contradisse antes.
  const recado = recadoDeRecebimento(text);
  if (recado) {
    replyText = nextQ
      ? `${recado}\n\n${RETOMADA_DA_PERGUNTA}\n\n${replyText}`
      : `${recado}\n\n${replyText}`;
  }

  const assistantMsg: ConvMessage = {
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "assistant",
    text: replyText,
    createdAt: new Date().toISOString(),
  };

  return {
    ...mid,
    messages: [...mid.messages, assistantMsg],
    estimate,
    // Only when the full protocol is exhausted — no early close on a talkative
    // client who happened to answer a handful of questions.
    canSubmit: allDone,
  };
}

export function initConvState(): ConvState {
  const welcome: ConvMessage = {
    id: "welcome",
    role: "assistant",
    text: "Olá! Sou sua consultora de briefing na Dioli.\n\nVou te ajudar a montar o escopo do projeto passo a passo — com estimativa de preço e prazo atualizando em tempo real.\n\n**Pode começar: o que você está precisando?**",
    createdAt: new Date().toISOString(),
  };
  return { messages: [welcome], scope: emptyScope(), answeredQIds: [], isFirstMessage: true, estimate: emptyEstimate(), canSubmit: false };
}
