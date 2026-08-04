// leitura-do-cliente.ts — A AGÊNCIA OLHA O INSTAGRAM REAL DO CLIENTE ANTES DE PRODUZIR.
//
// Pedido literal do CEO (04/08/2026): "Antes de fazer qualquer coisa, você
// precisa entender quem é o cliente. Você precisa ler a rede social, ver os
// posts que estão lá, antes de fazer os carrosséis." Até aqui a esteira produzia
// sem nunca abrir o perfil do cliente — as peças novas não conversavam com as
// que já estavam publicadas.
//
// O que este arquivo faz, e o que ele se recusa a fazer:
//
//   • SÍNTESE, não despejo. O feed cru são dezenas de legendas; o que o
//     especialista precisa é "o que se repete, o que engaja, o que não existe
//     lá". A síntese cabe em ~1.500 caracteres e entra no contexto de TODOS.
//   • Metade determinística, metade IA — e a IA presa ao dado. Formato,
//     cadência, hashtag e engajamento saem de CÓDIGO (número não se pede a
//     modelo). Tema, tom e estilo saem de UMA chamada de IA que só enxerga as
//     legendas reais e é instruída a dizer "não identificável" quando elas não
//     sustentam a conclusão.
//   • Vazio é vazio (regra de ouro do kit). Sem conexão ou sem feed, o bloco
//     diz "feed não lido: <motivo>" e PROÍBE inferir o estilo do nada — o mesmo
//     padrão do resultadoDoCicloAnterior. A produção NUNCA trava por falta de
//     feed: degrada declarando.
//   • Persistência leve com TTL, sem model novo. A síntese vira um
//     BrainArtifact (department "leitura-do-cliente") — é o que a rodada de
//     ARTES lê a cada 5 minutos. O despertador NUNCA fala com a Graph: quem
//     fala é a execução do projeto, uma vez, dentro do TTL.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import {
  lerFeedDoCliente, lerMetricasDosPosts,
  type PostDoFeed, type MetricasDoPost,
} from "@/lib/integrations/meta/leitura";

// ─── Contrato ───────────────────────────────────────────────────────────────

export interface SinteseDoFeed {
  /** O feed foi lido de verdade? false = o texto é a degradação declarada. */
  lida: boolean;
  /** O bloco pronto para o contexto dos especialistas. SEMPRE preenchido. */
  texto: string;
  /** Frase curta do estilo visual observado — é o que o gerador de arte usa.
   *  Vazio quando o feed não foi lido ou o estilo não é identificável. */
  estiloVisual: string;
}

/** 24h: o feed de um negócio local não muda de estilo entre duas produções, e
 *  cada leitura fresca custa chamadas contadas no rate limit BUC da Meta. */
export const TTL_DA_SINTESE_MS = 24 * 60 * 60_000;
/** Teto do bloco no contexto — síntese, não despejo. */
export const MAX_CARACTERES_DA_SINTESE = 1500;
/** O "department" do BrainArtifact que guarda a síntese. Não é uma casa de
 *  produção: é a memória de leitura. */
export const DEPARTAMENTO_DA_LEITURA = "leitura-do-cliente";
const CANVAS_ID = "feed-instagram";
/** Quantos posts (os de maior engajamento aparente) ganham métricas reais.
 *  Cada um custa até 2 GETs — ver LIMITE_DE_POSTS_COM_METRICAS na leitura. */
const POSTS_COM_METRICAS = 10;
/** Quantas legendas a IA de síntese enxerga. Mais que isso é ruído caro. */
const LEGENDAS_PARA_A_IA = 15;

const ROTULO = "FEED REAL DO CLIENTE (Instagram";

// ─── A degradação declarada (regra de ouro: ausência não é informação) ──────

function degradacao(motivo: string): SinteseDoFeed {
  return {
    lida: false,
    estiloVisual: "",
    texto: `${ROTULO}): feed não lido: ${motivo}. PROIBIDO descrever, citar ou imitar o estilo atual do perfil do cliente — ninguém o viu. Trabalhe somente com o briefing e a direção estratégica, e não afirme nada sobre o que ele já publica.`,
  };
}

// ─── Persistência leve (BrainArtifact, sem model novo) ──────────────────────

interface SintesePersistida {
  sintese: SinteseDoFeed;
  criadaEm: Date;
}

async function sintesePersistida(clientRequestId: string | null): Promise<SintesePersistida | null> {
  if (!clientRequestId) return null;
  const art = await prisma.brainArtifact.findFirst({
    where: { clientRequestId, department: DEPARTAMENTO_DA_LEITURA },
    orderBy: { createdAt: "desc" },
    select: { canvasJson: true, createdAt: true },
  }).catch(() => null);
  if (!art) return null;
  try {
    const c = JSON.parse(art.canvasJson) as Record<string, unknown>;
    if (typeof c.texto !== "string" || !c.texto) return null;
    return {
      criadaEm: art.createdAt,
      sintese: {
        lida: c.lida === true,
        texto: c.texto,
        estiloVisual: typeof c.estiloVisual === "string" ? c.estiloVisual : "",
      },
    };
  } catch {
    return null;
  }
}

function fresca(p: SintesePersistida): boolean {
  return Date.now() - p.criadaEm.getTime() < TTL_DA_SINTESE_MS;
}

async function persistir(clientRequestId: string | null, s: SinteseDoFeed): Promise<void> {
  if (!clientRequestId) return;
  await prisma.brainArtifact.create({
    data: {
      clientRequestId,
      department: DEPARTAMENTO_DA_LEITURA,
      canvasId: CANVAS_ID,
      canvasJson: JSON.stringify({ lida: s.lida, texto: s.texto, estiloVisual: s.estiloVisual, geradoEm: new Date().toISOString() }),
      status: "approved",
      approvedBy: "leitura-automatica",
    },
  }).catch(() => { /* best-effort: perder a persistência não pode derrubar a produção */ });
}

// ─── A parte determinística: número sai de código, não de modelo ────────────

function rotuloDeFormato(p: PostDoFeed): string {
  if (p.media_product_type === "REELS") return "reels";
  if (p.media_type === "CAROUSEL_ALBUM") return "carrossel";
  if (p.media_type === "VIDEO") return "vídeo";
  return "imagem";
}

function linhaDeFormatos(posts: PostDoFeed[]): string {
  const contagem = new Map<string, number>();
  for (const p of posts) contagem.set(rotuloDeFormato(p), (contagem.get(rotuloDeFormato(p)) ?? 0) + 1);
  const partes = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${Math.round((n / posts.length) * 100)}% ${f}`);
  return `- Formatos publicados: ${partes.join(", ")}`;
}

function linhaDeCadencia(posts: PostDoFeed[]): string | null {
  const datas = posts.map((p) => Date.parse(p.timestamp ?? "")).filter(Number.isFinite).sort();
  if (datas.length < 2) return null;
  const dias = (datas[datas.length - 1]! - datas[0]!) / 86_400_000;
  if (dias < 7) return null;
  const porSemana = posts.length / (dias / 7);
  return `- Cadência: ~${porSemana.toFixed(1)} posts/semana`;
}

function engajamentoDoPost(p: PostDoFeed, metricas: Map<string, Record<string, number>>): number | null {
  const m = metricas.get(p.id);
  if (m && typeof m.total_interactions === "number") return m.total_interactions;
  if (p.like_count === null && p.comments_count === null) return null;
  return (p.like_count ?? 0) + (p.comments_count ?? 0);
}

function linhaDeEngajamento(posts: PostDoFeed[], metricas: Map<string, Record<string, number>>): string | null {
  const porFormato = new Map<string, { soma: number; n: number }>();
  for (const p of posts) {
    const e = engajamentoDoPost(p, metricas);
    if (e === null) continue;
    const f = rotuloDeFormato(p);
    const acc = porFormato.get(f) ?? { soma: 0, n: 0 };
    acc.soma += e; acc.n += 1;
    porFormato.set(f, acc);
  }
  if (porFormato.size === 0) return null;
  const [melhor, dados] = [...porFormato.entries()].sort((a, b) => b[1].soma / b[1].n - a[1].soma / a[1].n)[0]!;
  return `- O que mais engaja: ${melhor} (média de ${Math.round(dados.soma / dados.n)} interações por post)`;
}

function linhaDeHashtags(posts: PostDoFeed[]): string | null {
  const contagem = new Map<string, number>();
  for (const p of posts) {
    for (const h of p.caption?.match(/#[\p{L}\p{N}_]+/gu) ?? []) {
      const tag = h.toLowerCase();
      contagem.set(tag, (contagem.get(tag) ?? 0) + 1);
    }
  }
  const top = [...contagem.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length === 0) return null;
  return `- Hashtags frequentes: ${top.map(([t]) => t).join(" ")}`;
}

// ─── A parte qualitativa: UMA chamada de IA, presa às legendas reais ────────

interface Qualitativa {
  temas: string;
  tom: string;
  estiloVisual: string;
  ausencias: string;
}

async function analisarLegendas(
  posts: PostDoFeed[],
  metricas: Map<string, Record<string, number>>,
  workspaceId: string,
): Promise<Qualitativa | null> {
  const linhas = posts.slice(0, LEGENDAS_PARA_A_IA).map((p) => {
    const e = engajamentoDoPost(p, metricas);
    const legenda = (p.caption ?? "(sem legenda)").replace(/\s+/g, " ").slice(0, 200);
    return `${rotuloDeFormato(p)} · ${p.timestamp?.slice(0, 10) ?? "?"} · ${e === null ? "engajamento não visível" : `${e} interações`} · "${legenda}"`;
  });

  const r = await generate({
    system: `Você é o analista de LEITURA DE CLIENTE da Dioli Digital. Você recebe posts REAIS do Instagram de um cliente e descreve o que ESTÁ lá — nunca o que você imagina. Se as legendas e os formatos não permitirem concluir algo, escreva "não identificável pelas legendas". Não invente cores, cenários nem elementos visuais que as legendas não citam. Responda SOMENTE JSON válido.`,
    user: `POSTS REAIS DO CLIENTE (formato · data · engajamento · legenda):
${linhas.join("\n")}

Responda JSON: {"temas": ["2 a 4 temas recorrentes"], "tom": "o tom das legendas em 1 frase", "estiloVisual": "1 a 2 frases do estilo visual EVIDENCIADO pelos formatos e pelo que as legendas descrevem das imagens", "ausencias": ["2 a 3 coisas que NÃO aparecem neste feed"]}`,
    maxTokens: 600,
    workspaceId,
    preferredProvider: "claude",
  });
  if (!r.ok) return null;
  const d = r.data as Record<string, unknown>;
  const lista = (v: unknown): string =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").join("; ") : "";
  return {
    temas: lista(d.temas),
    tom: typeof d.tom === "string" ? d.tom : "",
    estiloVisual: typeof d.estiloVisual === "string" ? d.estiloVisual : "",
    ausencias: lista(d.ausencias),
  };
}

// ─── A leitura de ponta a ponta ─────────────────────────────────────────────

/**
 * A síntese do feed real do cliente, pronta para o contexto dos especialistas.
 *
 * NUNCA lança e NUNCA bloqueia a produção: sem conexão, sem feed ou com a Meta
 * fora do ar, devolve a degradação declarada. Com síntese persistida dentro do
 * TTL, devolve a persistida sem tocar a Graph.
 */
export async function sinteseDoFeedDoCliente(
  workspaceId: string,
  clientId: string,
  clientRequestId: string | null,
): Promise<SinteseDoFeed> {
  try {
    const guardada = await sintesePersistida(clientRequestId);
    if (guardada && fresca(guardada)) return guardada.sintese;

    const feed = await lerFeedDoCliente(workspaceId, clientId);
    if (!feed.ok) return degradacao(feed.error);

    if (feed.posts.length === 0) {
      const s: SinteseDoFeed = {
        lida: true,
        estiloVisual: "",
        texto: `${ROTULO}, lido em ${new Date().toISOString().slice(0, 10)}): a conta está conectada e NÃO tem nenhum post publicado. Não existe estilo anterior a seguir — a direção visual e de tom vem do briefing e da estratégia, e isto deve ser dito com clareza, não inventado.`,
      };
      await persistir(clientRequestId, s);
      return s;
    }

    // Métricas reais dos posts de maior engajamento aparente — tolerante a
    // falha: sem métricas, os números públicos (likes/comentários) sustentam.
    const topIds = [...feed.posts]
      .sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0)))
      .slice(0, POSTS_COM_METRICAS)
      .map((p) => p.id);
    const metricas = new Map<string, Record<string, number>>();
    const rm = await lerMetricasDosPosts(workspaceId, clientId, topIds).catch(() => null);
    if (rm && rm.ok) {
      for (const m of rm.posts as MetricasDoPost[]) if (!m.erro) metricas.set(m.mediaId, m.metricas);
    }

    const qual = await analisarLegendas(feed.posts, metricas, workspaceId);

    const linhas = [
      `${ROTULO}, ${feed.posts.length} posts lidos em ${new Date().toISOString().slice(0, 10)}):`,
      linhaDeFormatos(feed.posts),
      linhaDeCadencia(feed.posts),
      linhaDeEngajamento(feed.posts, metricas),
      linhaDeHashtags(feed.posts),
      qual?.temas ? `- Temas recorrentes: ${qual.temas}` : null,
      qual?.tom ? `- Tom das legendas: ${qual.tom}` : null,
      qual?.estiloVisual ? `- Estilo visual observado: ${qual.estiloVisual}` : null,
      qual?.ausencias ? `- Não aparece no feed: ${qual.ausencias}` : null,
      qual
        ? "As peças novas devem CONVERSAR com este feed — mesma família de tom e de formato — sem copiá-lo."
        : "- Análise qualitativa indisponível nesta leitura: use SOMENTE os números acima e não afirme tom ou tema que não está medido.",
    ].filter(Boolean) as string[];

    const estiloVisual = qual?.estiloVisual && !/não identificável/i.test(qual.estiloVisual)
      ? qual.estiloVisual.slice(0, 300)
      : "";

    const s: SinteseDoFeed = {
      lida: true,
      estiloVisual,
      texto: linhas.join("\n").slice(0, MAX_CARACTERES_DA_SINTESE),
    };
    await persistir(clientRequestId, s);
    return s;
  } catch (e) {
    return degradacao(e instanceof Error ? e.message : "erro inesperado ao ler o feed");
  }
}

/**
 * O estilo visual da síntese JÁ PERSISTIDA — o caminho das ARTES.
 *
 * NUNCA fala com a Graph: `produzirArtesPendentes` roda a cada 5 minutos pelo
 * despertador, e cada rodada batendo na Meta seria rajada no rate limit BUC.
 * Sem síntese fresca no banco, devolve vazio — e vazio é vazio: o prompt da
 * arte simplesmente não menciona o feed.
 */
export async function estiloVisualPersistido(clientRequestId: string | null): Promise<string> {
  const guardada = await sintesePersistida(clientRequestId);
  if (!guardada || !fresca(guardada) || !guardada.sintese.lida) return "";
  return guardada.sintese.estiloVisual;
}
