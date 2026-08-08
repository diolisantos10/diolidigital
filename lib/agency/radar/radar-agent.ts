// radar-agent.ts — O AGENTE do Radar Dioli: capta e PROPÕE tendências.
//
// Ele varre cada domínio e propõe mudanças/tendências acionáveis. GOVERNANÇA:
// tudo que o agente propõe entra como "trend" → PENDENTE (nunca oficial, nunca
// auto-ativa). Ou seja, mesmo que a IA erre, NADA chega aos agentes de produção
// sem validação humana. Fontes oficiais (Meta/TikTok/Google) entram por outro
// caminho (addInsight source="official"), não por aqui.
//
// HONESTIDADE: sem fontes automáticas (Fase 3), a "atualidade" vem do que a IA
// conhece — por isso o humano valida. A Fase 3 (Meta/TikTok/Trends ao vivo) é o
// que dá frescor de tempo real; a estrutura de governança já está pronta pra ela.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { addInsight, type InsightDomain } from "@/lib/agency/radar/library";
import { getConfiguredSources, type RadarSource } from "@/lib/agency/radar/sources";
import { fetchFeedItems } from "@/lib/agency/radar/fetcher";

const SCAN_DOMAINS: InsightDomain[] = ["social", "design", "paid-traffic", "analytics", "seo"];
const MAX_PER_DOMAIN = 3;

// ─── O PISO DE LASTRO DO RADAR (05/08/2026) ─────────────────────────────────
//
// Conceito replicado de `lib/agency/execution/leitura-do-cliente.ts`
// (`apenasAncorado`) — replicado, não importado, porque aquele arquivo é de
// outra frente e o corpus aqui é outro (o texto do feed, não as legendas do
// cliente). A regra é a mesma e vale a pena repetir por extenso:
//
//   COBERTURA TOTAL. Um trecho só tem lastro se TODOS os seus tokens de
//   conteúdo aparecerem no texto da fonte. Limiar fracionário não serve: o
//   trecho é publicado INTEIRO, então qualquer fração sem lastro é texto que a
//   fonte nunca escreveu viajando como diretriz oficial da agência. Um token de
//   álibi verdadeiro ("Reels") carregaria a frase inventada inteira.
//
// O que isto NÃO faz: julgar se a diretriz é boa. Só responde "a fonte disse
// isto?". Não disse → o insight entra PENDENTE, e um humano decide.

/** Palavras vazias: não ancoram nada, e exigir lastro delas é ruído. */
const VAZIAS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
  "por","para","pra","com","sem","e","ou","mas","que","se","ao","aos","à","às","the","of","to","and",
  "is","are","for","on","in","seu","sua","seus","suas","este","esta","isso","mais","menos","ja","agora",
]);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lema conservador: cai plural e diminutivo, o resto tem de bater INTEIRO.
 *  Prefixo de N letras não serve — casaria "formato" com "formação". */
function lema(t: string): string {
  let x = t;
  for (const suf of ["inhos", "inhas", "inho", "inha", "oes", "aes", "ais", "eis", "is", "es", "s"]) {
    if (x.length > suf.length + 3 && x.endsWith(suf)) { x = x.slice(0, -suf.length); break; }
  }
  return x;
}

function tokensDeConteudo(s: string): string[] {
  return semAcento(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));
}

/** O vocabulário que a fonte realmente publicou. */
function corpusDaFonte(feedText: string): Set<string> {
  return new Set(tokensDeConteudo(feedText).map(lema));
}

/** Corta onde o trecho termina — inclusive em conjunção, porque o modelo não é
 *  obrigado a pontuar e quem escolhe onde cortar não pode ser ele. */
const SEPARADOR = /[,;.:·•\n]+|\s+(?:com|e|ou|mas|porem|alem\s+de)\s+/gi;

/**
 * TODO trecho de conteúdo do texto tem lastro no corpus da fonte?
 *
 * Fail-closed em dois pontos: corpus vazio → `false` (fonte que não deu texto
 * não atesta nada), e trecho sem token de conteúdo nenhum não conta a favor.
 */
export function temLastroLiteral(texto: string, feedText: string): boolean {
  const corpus = corpusDaFonte(feedText);
  if (corpus.size === 0) return false;
  const trechos = semAcento(texto).split(SEPARADOR).map((t) => t.trim()).filter(Boolean);
  let comConteudo = 0;
  for (const trecho of trechos) {
    const ts = tokensDeConteudo(trecho);
    if (ts.length === 0) continue;
    comConteudo++;
    if (!ts.every((t) => corpus.has(lema(t)))) return false;
  }
  return comConteudo > 0;
}

const DOMAIN_LABEL: Record<InsightDomain, string> = {
  social: "redes sociais (Instagram, TikTok, formatos, algoritmo)",
  design: "design e direção de arte para marketing",
  "paid-traffic": "mídia paga (Meta Ads, Google Ads, formatos, segmentação)",
  analytics: "métricas e mensuração de marketing",
  seo: "SEO e Google (busca, conteúdo)",
  general: "marketing digital em geral",
};

/**
 * O RESULTADO DE UM SCAN, COM A DIFERENÇA ENTRE "NADA" E "NÃO SEI".
 *
 * Era `number`, e `.catch(() => 0)` no chamador achatava três estados num só:
 * scan que rodou e não achou nada, scan cuja IA estava fora do ar, e scan que
 * EXPLODIU. O painel mostrava "0 propostas" e o Radar podia estar morto havia
 * semanas — indistinguível de mercado calmo, enquanto a biblioteca envelhecia e
 * todo mundo produzia em cima de diretriz vencida.
 */
export type EstadoDoScan = "ok" | "ia_indisponivel" | "erro";

export interface ResultadoDoScan {
  estado: EstadoDoScan;
  propostos: number;
  /** Preenchido quando `estado !== "ok"`. É o que sobe para o painel. */
  motivo?: string;
}

export interface RadarScanResult {
  proposed: number;
  perDomain: Record<string, number>;
  /** Por escopo: rodou, a IA faltou, ou quebrou. */
  statusPorEscopo: Record<string, EstadoDoScan>;
  /** Quantos escopos NÃO rodaram. `> 0` significa que "0 propostas" não é
   *  notícia sobre o mercado — é notícia sobre o Radar. */
  falhas: number;
  /** Um por escopo que falhou, para o painel e o log. */
  falhasDetalhe: string[];
  /** Nenhum escopo rodou. Aí "0 propostas" não significa absolutamente nada. */
  cego: boolean;
  skippedNoAi?: boolean;
}

/** Propõe tendências para um domínio (tudo vira PENDENTE). Dedup por tópico. */
async function scanDomain(workspaceId: string, domain: InsightDomain): Promise<ResultadoDoScan> {
  // Dedup: não repropor tópicos que já estão ativos ou pendentes.
  const existing = await prisma.marketInsight.findMany({
    where: { workspaceId, domain, status: { in: ["active", "pending"] } },
    select: { topic: true },
  });
  const seenTopics = new Set(existing.map((e) => e.topic.toLowerCase()));

  // Os tópicos conhecidos ENTRAM NO PROMPT. Eram lidos antes da chamada e usados
  // só para descartar a resposta depois — o modelo não tinha como evitar o que
  // não sabia que já existia, e um scan de 5 domínios que só repetia custava 5
  // chamadas completas para gravar zero. Bounded para não estourar o contexto:
  // os mais recentes bastam, e o descarte pós-resposta continua de pé como rede.
  const conhecidos = [...seenTopics].slice(0, 40);
  const blocoConhecidos = conhecidos.length > 0
    ? `\n\nA agência JÁ TEM estes tópicos (ativos ou na fila) — NÃO os repita, nem com outro slug para a mesma ideia:\n${conhecidos.map((t) => `- ${t}`).join("\n")}\nSe tudo que você tem a dizer já está nessa lista, devolva {"items":[]} — é resposta válida e preferível a repetir.`
    : "";

  const result = await generate({
    system: "Você é o Radar Dioli, o radar de tendências de uma agência de marketing brasileira. Proponha SOMENTE mudanças/tendências ATUAIS e ACIONÁVEIS — nada genérico ou atemporal. Se não tiver certeza que algo é atual, proponha menos. Responda SOMENTE JSON válido.",
    user: `Domínio: ${DOMAIN_LABEL[domain]}.
Liste até ${MAX_PER_DOMAIN} tendências/atualizações que uma agência deve APLICAR AGORA nos clientes. Para cada uma: topic (slug curto e estável, ex.: "ig-reels-curtos"), title (curto), guidance (o que fazer na prática, 1-2 frases).
JSON: {"items":[{"topic":"...","title":"...","guidance":"..."}]}${blocoConhecidos}`,
    maxTokens: 700,
    workspaceId,
    preferredProvider: "claude",
    agentId: "radar-tendencias",
  });
  if (!result.ok) {
    return { estado: "ia_indisponivel", propostos: 0, motivo: `${domain}: IA não respondeu — nenhuma varredura foi feita neste domínio.` };
  }

  const items = Array.isArray((result.data as { items?: unknown }).items) ? (result.data as { items: unknown[] }).items : [];
  let count = 0;
  for (const raw of items.slice(0, MAX_PER_DOMAIN)) {
    const it = raw as Record<string, unknown>;
    const topic = String(it.topic ?? "").trim();
    const title = String(it.title ?? "").trim();
    const guidance = String(it.guidance ?? "").trim();
    if (!topic || !title || !guidance) continue;
    if (seenTopics.has(topic.toLowerCase())) continue; // já existe (ativo/pendente)
    seenTopics.add(topic.toLowerCase());
    await addInsight({ workspaceId, domain, topic, title, guidance, source: "trend", extraction: "modelo", sourceName: "Radar Dioli" });
    count++;
  }
  return { estado: "ok", propostos: count };
}

/**
 * FONTE AO VIVO (Fase 3): extrai insights a partir dos itens reais de um feed.
 *
 * O QUE MUDOU EM 05/08/2026: "fonte oficial" deixou de significar "extração
 * verificada". O `guidance` que entra aqui é escrito por um MODELO lendo o
 * feed, e o único freio era um "NÃO invente" no prompt. Como esse texto vai
 * para o prompt de todos os especialistas ("siga estas diretrizes") E para o do
 * auditor de qualidade (como régua de julgamento), uma alucinação viraria
 * diretriz da agência inteira, auditada contra si mesma, em todos os clientes.
 *
 * Agora o texto passa por `temLastroLiteral` contra o próprio `feedText`:
 *   • fonte oficial + lastro literal → ATIVO na hora (a fonte disse aquilo);
 *   • qualquer outro caso → PENDENTE, à espera de humano.
 *
 * Na prática, guidance parafraseado quase sempre cai em PENDENTE — e está
 * certo: a fila do humano é o preço de não contaminar todos os clientes.
 */
async function scanSource(workspaceId: string, source: RadarSource): Promise<ResultadoDoScan> {
  const items = await fetchFeedItems(source.url);
  if (!items.length) {
    // Feed vazio não é "mercado calmo": é fonte muda. Pode ser URL morta,
    // bloqueio ou formato mudado — e nenhum desses é notícia sobre o mercado.
    return { estado: "erro", propostos: 0, motivo: `${source.name}: feed não devolveu nenhum item — fonte muda ou fora do ar.` };
  }

  const existing = await prisma.marketInsight.findMany({
    where: { workspaceId, domain: source.domain, status: { in: ["active", "pending"] } },
    select: { topic: true },
  });
  const seen = new Set(existing.map((e) => e.topic.toLowerCase()));

  const feedText = items.map((it, i) => `${i + 1}. ${it.title}${it.summary ? ` — ${it.summary}` : ""}`).join("\n");
  const result = await generate({
    system: "Você é o Radar Dioli. Extraia mudanças/atualizações ACIONÁVEIS SOMENTE a partir dos itens fornecidos — NÃO invente nada que não esteja neles. Responda SOMENTE JSON válido.",
    user: `Fonte: ${source.name} (domínio: ${source.domain}). Itens recentes:\n${feedText}\n\nExtraia até 2 atualizações que uma agência deve aplicar já. Para cada: topic (slug estável), title (curto), guidance (o que fazer). Se os itens não trouxerem nada acionável, retorne items vazio.\nJSON: {"items":[{"topic":"...","title":"...","guidance":"..."}]}`,
    maxTokens: 600, workspaceId, preferredProvider: "claude", agentId: "radar-feeds",
  });
  if (!result.ok) {
    return { estado: "ia_indisponivel", propostos: 0, motivo: `${source.name}: IA não respondeu — o feed foi lido mas nada foi extraído.` };
  }

  const extracted = Array.isArray((result.data as { items?: unknown }).items) ? (result.data as { items: unknown[] }).items : [];
  let count = 0;
  for (const raw of extracted.slice(0, 2)) {
    const it = raw as Record<string, unknown>;
    const topic = String(it.topic ?? "").trim();
    const title = String(it.title ?? "").trim();
    const guidance = String(it.guidance ?? "").trim();
    if (!topic || !title || !guidance || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());

    // A PROVA, não a promessa: título E orientação precisam ter lastro no texto
    // que a fonte publicou. Sem prova, o insight é proposta — não diretriz.
    const literal = temLastroLiteral(`${title}. ${guidance}`, feedText);
    if (source.official && !literal) {
      console.warn(`[radar] ${JSON.stringify({
        evento: "oficial_sem_lastro_virou_pendente",
        fonte: source.name, dominio: source.domain, topic,
        trecho: guidance.slice(0, 160),
      })}`);
    }
    await addInsight({
      workspaceId, domain: source.domain, topic, title, guidance,
      source: source.official ? "official" : "trend",
      extraction: literal ? "literal_da_fonte" : "modelo",
      sourceName: source.name, sourceUrl: source.url,
    });
    count++;
  }
  return { estado: "ok", propostos: count };
}

/** Uma exceção vira estado declarado — nunca o zero que se confunde com "nada
 *  no mercado". O `.catch(() => 0)` que estava aqui era esse achatamento. */
async function protegido(escopo: string, fn: () => Promise<ResultadoDoScan>): Promise<ResultadoDoScan> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[radar] ${JSON.stringify({ evento: "scan_quebrou", escopo, erro: String(e).slice(0, 300) })}`);
    return { estado: "erro", propostos: 0, motivo: `${escopo}: varredura quebrou (${String(e).slice(0, 120)}).` };
  }
}

/** Roda o Radar num workspace: propõe tendências por domínio (IA) + puxa fontes ao vivo. */
export async function runRadarScan(workspaceId: string): Promise<RadarScanResult> {
  const perDomain: Record<string, number> = {};
  const statusPorEscopo: Record<string, EstadoDoScan> = {};
  const falhasDetalhe: string[] = [];
  let proposed = 0;
  let escopos = 0;
  let falhas = 0;

  // `escopo` é a unidade de SAÚDE (o que rodou ou não); `dominio` é a unidade de
  // CONTAGEM (onde a proposta entrou). Uma fonte ao vivo tem nome próprio como
  // escopo mas alimenta o domínio dela — separar os dois é o que permite dizer
  // "o Meta Newsroom está fora do ar" em vez de "social: 0".
  const registrar = (escopo: string, dominio: string, r: ResultadoDoScan) => {
    escopos++;
    statusPorEscopo[escopo] = r.estado;
    perDomain[dominio] = (perDomain[dominio] ?? 0) + r.propostos;
    proposed += r.propostos;
    if (r.estado !== "ok") {
      falhas++;
      if (r.motivo) falhasDetalhe.push(r.motivo);
    }
  };

  for (const domain of SCAN_DOMAINS) {
    registrar(domain, domain, await protegido(domain, () => scanDomain(workspaceId, domain)));
  }
  // Fontes ao vivo (se configuradas em RADAR_SOURCES). Desligado por padrão.
  for (const source of getConfiguredSources()) {
    registrar(source.name, source.domain, await protegido(source.name, () => scanSource(workspaceId, source)));
  }

  const cego = escopos > 0 && falhas === escopos;
  if (falhas > 0) {
    console.warn(`[radar] ${JSON.stringify({ evento: "varredura_incompleta", workspaceId, escopos, falhas, cego, falhasDetalhe })}`);
  }

  return { proposed, perDomain, statusPorEscopo, falhas, falhasDetalhe, cego };
}
