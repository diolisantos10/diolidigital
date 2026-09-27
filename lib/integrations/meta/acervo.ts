// acervo.ts — O ACERVO DO INSTAGRAM DA MARCA, TRAZIDO PARA DENTRO DE CASA.
// SERVER-ONLY. Ficha 1B-B1 (27/09/2026).
//
// ─── O QUE ISTO RESOLVE ──────────────────────────────────────────────────────
//
// A produção nova de uma marca começava do zero, sem saber o que a marca JÁ
// FAZ — estilo, formato, o que engaja. `leitura.ts` já sabia LER o feed e as
// métricas, mas de forma efêmera (cache de 10 min, para o dashboard). Este
// módulo faz a leitura de UMA VEZ SÓ, grava os posts no banco e baixa a mídia
// para o volume — porque o link da Meta EXPIRA, e uma referência de arte que
// some no dia seguinte não é referência.
//
// ─── PARECER `meta` (M1, PODE COM AJUSTE) — o que este arquivo respeita ─────
//
//   • `GET /{ig-user-id}/media`, `fields` com field expansion
//     (`children{media_url,media_type}` — NUNCA `/children` à parte),
//     `limit=25`, paginação por `paging.next`, até 100 posts;
//   • insights: 1 chamada por mídia (`media_product_type` já veio no feed —
//     nunca a chamada extra que `lerMetricasDosPosts` faz para descobrir o
//     tipo), NUNCA `impressions`, conjunto vazio = "não medido" (nunca zero);
//   • erro POR MÍDIA não derruba o lote — falha vira `falhasDeMidia` e a
//     importação segue;
//   • marcas SEQUENCIAIS, nunca em paralelo (`despertador.ts` importa no
//     máximo uma por tique);
//   • ritmo: tudo passa por `graphGet` (que já aplica `ritmo.ts`), e a reserva
//     extra do TETO POR CONEXÃO POR HORA de `leitura.ts` (mesma constante,
//     nunca duplicada) é feita ANTES de paginar.
//
// ─── IDEMPOTÊNCIA — a exigência do CEO virou campo, não convenção ───────────
//
// `Client.acervoImportadoEm`: nulo = nunca importado; preenchido = só
// reimporta com `forcar: true`. Post a post, `AcervoPost` é upsert por
// `(clientId, igMediaId)` — nunca duplica. Post que JÁ EXISTE na tabela não
// refaz insight nem download nesta passada: são chamadas de rede e MB de
// mídia que o cliente já tem gravados, e refazer todo `forcar` gastaria de
// novo o custo inteiro de ~104 chamadas contra o teto de 200/h da conexão.

import "server-only";

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { prisma } from "@/lib/db/client";
import { graphGet, GraphApiError } from "./graph";
import { TIPO_DE_RITMO_DA_CASA } from "./ritmo";
import { reservarNaJanelaDoBanco } from "./ritmo-no-banco";
import { conexaoDoCliente, marcarConexaoExpirada } from "./connections";
import {
  CAMPOS_DO_FEED, TAMANHO_DA_PAGINA, TETO_DE_CHAMADAS_POR_HORA,
  normalizarPost, metricasParaTipo, type PostDoFeed, type RespostaDeInsights,
} from "./leitura";
import { confereUrlExternaSegura } from "@/lib/security/url-externa-segura";
import { guardarArquivo, MIMES_ACEITOS, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";
import { duracaoDe, codecDe } from "@/lib/agency/media/video";

// ─── O contrato ──────────────────────────────────────────────────────────────

export interface FalhaDeMidia {
  igMediaId: string;
  motivo: string;
}

export type ResultadoDaImportacao =
  | {
      ok: true;
      /** Posts NOVOS gravados nesta passada. */
      importados: number;
      /** Posts que já existiam (upsert virou no-op — não refeito por custo). */
      jaExistiam: number;
      /** Dos importados, quantos ficaram com `insightsJson: null`. */
      semInsights: number;
      /** Arquivos de mídia baixados com sucesso para o volume. */
      midiasBaixadas: number;
      falhasDeMidia: FalhaDeMidia[];
    }
  | {
      ok: false;
      motivo: string;
      codigo: "ja_importado" | "sem_conexao" | "teto_da_meta" | "erro_da_meta";
    };

/** Teto de posts por importação. 100 é o pedido do CEO; nunca mais. */
export const LIMITE_PADRAO_DO_ACERVO = 100;

// ─── Download da mídia (o link da Meta expira) ──────────────────────────────

interface BytesBaixados {
  bytes: Buffer;
  mimeType: string;
}

/** Adivinha o MIME por extensão quando o `content-type` da resposta não bate
 *  com nenhum MIME aceito — a CDN da Meta normalmente acerta, mas "nunca
 *  confie sozinho" é a régua desta casa para tudo que vem de fora. */
function mimePorExtensao(url: string): string | null {
  const semQuery = url.split("?")[0] ?? url;
  const ext = semQuery.split(".").pop()?.toLowerCase();
  const porExtensao: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  };
  return ext ? porExtensao[ext] ?? null : null;
}

/**
 * Baixa uma URL de mídia da Meta e devolve os bytes prontos para
 * `guardarArquivo`. Nunca lança — falha vira `{ ok: false, motivo }`, e quem
 * chama trata como falha POR MÍDIA (parecer M1: erro numa mídia não derruba
 * o lote).
 */
async function baixarBytes(url: string): Promise<{ ok: true; dados: BytesBaixados } | { ok: false; motivo: string }> {
  const veredito = await confereUrlExternaSegura(url);
  if (!veredito.ok) return { ok: false, motivo: veredito.motivo };

  let res: Response;
  try {
    // `redirect: "manual"` — mesma trava de SSRF de `midia-de-story.ts`: um
    // host público que redireciona para um destino interno não é seguido às
    // cegas.
    res = await fetch(url, { redirect: "manual" });
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "erro de rede ao baixar a mídia" };
  }
  if (!res.ok) return { ok: false, motivo: `a Meta respondeu ${res.status} ao buscar a mídia` };

  // Teto de tamanho ANTES de carregar o corpo inteiro em memória — mesma
  // trava de `drive-conta-de-servico.ts`. Achado de segurança, S4/27/09/2026:
  // a versão anterior só conferia o teto DEPOIS de `res.arrayBuffer()` (dentro
  // de `guardarArquivo`), ou seja, bufferizava a mídia inteira antes de saber
  // se ela cabia — um `content-length` mentiroso ou ausente ainda cai no
  // segundo teto, abaixo, depois de ler os bytes.
  const declarado = Number(res.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_POR_ARQUIVO) {
    return { ok: false, motivo: "a mídia é maior que o teto aceito" };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "não consegui ler os bytes da mídia" };
  }
  if (bytes.length === 0) return { ok: false, motivo: "a mídia chegou vazia" };
  if (bytes.length > MAX_BYTES_POR_ARQUIVO) {
    return { ok: false, motivo: "a mídia é maior que o teto aceito" };
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() || "";
  const mimeType = contentType in MIMES_ACEITOS ? contentType : mimePorExtensao(url) ?? contentType;
  if (!mimeType || !(mimeType in MIMES_ACEITOS)) {
    return { ok: false, motivo: `formato "${mimeType || "desconhecido"}" não é aceito pela casa` };
  }
  return { ok: true, dados: { bytes, mimeType } };
}

function nomeDoArquivo(url: string, mimeType: string): string {
  const ext = MIMES_ACEITOS[mimeType] ?? "bin";
  const semQuery = url.split("?")[0] ?? url;
  const base = semQuery.split("/").pop()?.slice(0, 60) || "acervo";
  return base.includes(".") ? base : `${base}.${ext}`;
}

interface MidiaGuardada {
  assetId: string;
  duracaoS: number | null;
  codec: string | null;
}

/**
 * Baixa e guarda UMA mídia do acervo no volume. Para vídeo, mede
 * duração/codec por `ffprobe` quando o binário está disponível — sem medir,
 * os dois ficam `null` (nunca inventados; é a mesma régua de
 * `midia-de-story.ts`/`video.ts`).
 */
async function baixarEGuardar(
  url: string,
  workspaceId: string,
  clientId: string,
): Promise<{ ok: true; midia: MidiaGuardada } | { ok: false; motivo: string }> {
  const baixado = await baixarBytes(url);
  if (!baixado.ok) return baixado;
  const { bytes, mimeType } = baixado.dados;

  let duracaoS: number | null = null;
  let codec: string | null = null;
  if (mimeType.startsWith("video/")) {
    const medidas = await medirVideo(bytes);
    duracaoS = medidas.duracaoS;
    codec = medidas.codec;
  }

  const guardado = await guardarArquivo({
    bytes,
    fileName: nomeDoArquivo(url, mimeType),
    mimeType,
    workspaceId,
    clientId,
    kind: "acervo",
    uploadedBy: "acervo do Instagram",
    duracaoS,
    codec,
  });
  if (!guardado.ok) return { ok: false, motivo: guardado.motivo };
  return { ok: true, midia: { assetId: guardado.arquivo.id, duracaoS, codec } };
}

/** `ffprobe` precisa de um CAMINHO, não de bytes em memória — escreve num
 *  temporário do próprio disco (mesmo diretório de sempre, `tmpdir()`) e
 *  limpa depois, sempre, mesmo em falha. Nunca lança: sem `ffprobe`
 *  disponível, os dois campos voltam `null` (ausência de informação não é
 *  informação). */
async function medirVideo(bytes: Buffer): Promise<{ duracaoS: number | null; codec: string | null }> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "dioli-acervo-"));
    const arquivo = path.join(dir, "video");
    await writeFile(arquivo, bytes);
    const [duracaoS, codec] = await Promise.all([duracaoDe(arquivo), codecDe(arquivo)]);
    return { duracaoS, codec };
  } catch {
    return { duracaoS: null, codec: null };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}

// ─── Erro fatal (para a passada inteira) vs. falha por-mídia (tolerada) ─────

async function comoErroFatal(
  e: unknown,
  connectionId: string,
): Promise<{ ok: false; motivo: string; codigo: "teto_da_meta" | "erro_da_meta" }> {
  if (e instanceof GraphApiError) {
    const code = e.detail?.code;
    if (e.detail?.type === TIPO_DE_RITMO_DA_CASA) {
      return { ok: false, motivo: e.detail.message ?? "a Meta limitou nosso ritmo — tente daqui a pouco", codigo: "teto_da_meta" };
    }
    if (code === 190 || code === 102) {
      await marcarConexaoExpirada(connectionId);
      return { ok: false, motivo: "o acesso ao Instagram venceu — é preciso reconectar a conta", codigo: "erro_da_meta" };
    }
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      return { ok: false, motivo: "a Meta limitou nosso ritmo de leitura — tente de novo em alguns minutos", codigo: "teto_da_meta" };
    }
    return { ok: false, motivo: `a Meta respondeu com erro: ${e.detail?.message ?? e.message}`, codigo: "erro_da_meta" };
  }
  if (e instanceof Error && e.name === "AbortError") {
    return { ok: false, motivo: "a Meta demorou demais para responder — tente de novo", codigo: "erro_da_meta" };
  }
  return { ok: false, motivo: e instanceof Error ? e.message : "erro desconhecido ao falar com a Meta", codigo: "erro_da_meta" };
}

/** `true` quando o erro é de TOKEN morto — precisa parar a passada inteira
 *  (os próximos N posts falhariam igual); qualquer outro erro de insight é
 *  tolerado por-mídia (parecer M1). */
function ehErroDeTokenMorto(e: unknown): boolean {
  if (!(e instanceof GraphApiError)) return false;
  const code = e.detail?.code;
  return code === 190 || code === 102;
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof GraphApiError) return e.detail?.message ?? e.message;
  return e instanceof Error ? e.message : "erro desconhecido";
}

// ─── A paginação ─────────────────────────────────────────────────────────────

async function paginarMedia(
  igUserId: string,
  token: string,
  limite: number,
): Promise<{ ok: true; posts: PostDoFeed[] } | { ok: false; erro: unknown }> {
  const posts: PostDoFeed[] = [];
  try {
    let proxima: string | null = `${igUserId}/media`;
    let primeira = true;
    while (proxima && posts.length < limite) {
      const pagina: { data?: Record<string, unknown>[]; paging?: { next?: string } } = await graphGet<{
        data?: Record<string, unknown>[];
        paging?: { next?: string };
      }>(
        proxima,
        token,
        primeira ? { fields: CAMPOS_DO_FEED, limit: Math.min(TAMANHO_DA_PAGINA, limite) } : {},
      );
      for (const bruto of pagina.data ?? []) {
        if (posts.length >= limite) break;
        posts.push(normalizarPost(bruto));
      }
      proxima = posts.length < limite ? pagina.paging?.next ?? null : null;
      primeira = false;
    }
  } catch (erro) {
    return { ok: false, erro };
  }
  return { ok: true, posts };
}

// ─── A função principal ──────────────────────────────────────────────────────

export async function importarAcervo(a: {
  workspaceId: string;
  clientId: string;
  forcar?: boolean;
  limite?: number;
}): Promise<ResultadoDaImportacao> {
  const limite = Math.min(LIMITE_PADRAO_DO_ACERVO, Math.max(1, a.limite ?? LIMITE_PADRAO_DO_ACERVO));

  const cliente = await prisma.client.findFirst({
    where: { id: a.clientId, workspaceId: a.workspaceId },
    select: { id: true, acervoImportadoEm: true },
  });
  if (!cliente) {
    return { ok: false, motivo: "cliente não encontrado neste workspace", codigo: "sem_conexao" };
  }
  if (cliente.acervoImportadoEm && !a.forcar) {
    return {
      ok: false,
      motivo: "o acervo deste cliente já foi importado — use forcar para reimportar",
      codigo: "ja_importado",
    };
  }

  const conexao = await conexaoDoCliente(a.workspaceId, a.clientId, "instagram");
  if (!conexao) {
    return { ok: false, motivo: "o cliente ainda não conectou o Instagram", codigo: "sem_conexao" };
  }
  if (conexao.status !== "connected" || !conexao.token) {
    return { ok: false, motivo: "a conexão com o Instagram precisa ser refeita — reconecte a conta", codigo: "sem_conexao" };
  }

  const igUserId = (conexao.metaJson.igUserId as string | undefined) ?? conexao.externalId;
  const token = conexao.token;

  // Reserva ANTES de chamar: paginação (ceil(limite/25)) + até `limite`
  // chamadas de insights (1 por mídia — o `media_product_type` já veio no
  // feed, nunca uma segunda chamada por post). É um TETO superior: posts que
  // já existem (pulados abaixo) custam menos que isto na prática.
  const custoEstimado = Math.ceil(limite / TAMANHO_DA_PAGINA) + limite;
  const reserva = await reservarNaJanelaDoBanco(`conexao:${conexao.id}`, custoEstimado, TETO_DE_CHAMADAS_POR_HORA);
  if (!reserva.ok) {
    return { ok: false, motivo: reserva.frase, codigo: "teto_da_meta" };
  }

  const pagina = await paginarMedia(igUserId, token, limite);
  if (!pagina.ok) return comoErroFatal(pagina.erro, conexao.id);
  const posts = pagina.posts;

  // Quem já existe não é reprocessado: nem insight, nem download. Upsert
  // continua correto (o post existente não muda), e o custo de rede não é
  // gasto duas vezes contra o teto de 200/h da conexão.
  const existentes = await prisma.acervoPost.findMany({
    where: { clientId: a.clientId, igMediaId: { in: posts.map((p) => p.id) } },
    select: { igMediaId: true },
  });
  const jaExistemIds = new Set(existentes.map((e) => e.igMediaId));

  let importados = 0;
  let jaExistiam = 0;
  let semInsights = 0;
  let midiasBaixadas = 0;
  const falhasDeMidia: FalhaDeMidia[] = [];

  for (const post of posts) {
    if (jaExistemIds.has(post.id)) {
      jaExistiam++;
      continue;
    }

    // ── 1. Insights: 1 chamada, tipo já veio do feed ──────────────────────
    let insightsJson: string | null = null;
    try {
      const r = await graphGet<RespostaDeInsights>(`${post.id}/insights`, token, {
        metric: metricasParaTipo(post.media_product_type),
      });
      const metricas: Record<string, number> = {};
      for (const m of r.data ?? []) {
        const v = m.total_value?.value ?? m.values?.[0]?.value;
        if (typeof v === "number") metricas[m.name] = v;
      }
      // Conjunto vazio = "não medido", NUNCA zero (parecer M1, item 3).
      insightsJson = Object.keys(metricas).length > 0 ? JSON.stringify(metricas) : null;
    } catch (e) {
      if (ehErroDeTokenMorto(e)) return comoErroFatal(e, conexao.id);
      // Erro POR MÍDIA não derruba o lote — vira `falhasDeMidia` e o post
      // segue sendo gravado, com `insightsJson: null` ("não medido").
      falhasDeMidia.push({ igMediaId: post.id, motivo: `insights: ${mensagemDeErro(e)}` });
      insightsJson = null;
    }

    // ── 2. Download da mídia (o link da Meta expira) ──────────────────────
    let mediaAssetId: string | null = null;
    let thumbnailAssetId: string | null = null;
    let telasJson = "[]";
    let duracaoS: number | null = null;
    let codec: string | null = null;

    if (post.media_type === "CAROUSEL_ALBUM") {
      const telas: string[] = [];
      for (const filho of post.children) {
        if (!filho.media_url) continue;
        const r = await baixarEGuardar(filho.media_url, a.workspaceId, a.clientId);
        if (r.ok) {
          telas.push(r.midia.assetId);
          midiasBaixadas++;
        } else {
          falhasDeMidia.push({ igMediaId: post.id, motivo: `tela do carrossel: ${r.motivo}` });
        }
      }
      telasJson = JSON.stringify(telas);
    } else {
      if (post.media_url) {
        const r = await baixarEGuardar(post.media_url, a.workspaceId, a.clientId);
        if (r.ok) {
          mediaAssetId = r.midia.assetId;
          duracaoS = r.midia.duracaoS;
          codec = r.midia.codec;
          midiasBaixadas++;
        } else {
          falhasDeMidia.push({ igMediaId: post.id, motivo: `mídia: ${r.motivo}` });
        }
      }
      if (post.thumbnail_url) {
        const r = await baixarEGuardar(post.thumbnail_url, a.workspaceId, a.clientId);
        if (r.ok) {
          thumbnailAssetId = r.midia.assetId;
          midiasBaixadas++;
        } else {
          falhasDeMidia.push({ igMediaId: post.id, motivo: `capa: ${r.motivo}` });
        }
      }
    }

    await prisma.acervoPost.upsert({
      where: { clientId_igMediaId: { clientId: a.clientId, igMediaId: post.id } },
      create: {
        workspaceId: a.workspaceId,
        clientId: a.clientId,
        conexaoId: conexao.id,
        igMediaId: post.id,
        mediaType: post.media_type,
        mediaProductType: post.media_product_type,
        caption: post.caption ?? "",
        permalink: post.permalink,
        publicadoEm: post.timestamp ? new Date(post.timestamp) : new Date(),
        likeCount: post.like_count,
        commentsCount: post.comments_count,
        insightsJson,
        mediaAssetId,
        telasJson,
        thumbnailAssetId,
        duracaoS,
        codec,
      },
      // Não deveria acontecer (já filtramos `jaExistemIds` acima), mas o
      // `update` existe para a corrida entre duas passadas concorrentes não
      // lançar — upsert é upsert.
      update: {
        caption: post.caption ?? "",
        permalink: post.permalink,
        likeCount: post.like_count,
        commentsCount: post.comments_count,
        insightsJson,
      },
    });

    importados++;
    if (insightsJson === null) semInsights++;
  }

  await prisma.client.update({
    where: { id: a.clientId },
    data: { acervoImportadoEm: new Date() },
  });

  await prisma.activityEvent.create({
    data: {
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      type: "acervo_importado",
      message: `acervo do Instagram importado: ${importados} novo(s), ${jaExistiam} já existiam, ${semInsights} sem métricas, ${midiasBaixadas} mídia(s) baixada(s)${falhasDeMidia.length > 0 ? `, ${falhasDeMidia.length} falha(s)` : ""}.`,
    },
  }).catch(() => { /* best-effort: perder o registro de atividade não derruba a importação */ });

  return { ok: true, importados, jaExistiam, semInsights, midiasBaixadas, falhasDeMidia };
}

// ─── marcarReferencia ────────────────────────────────────────────────────────

/**
 * Marca (ou desmarca) um post do acervo como REFERÊNCIA de estilo para a
 * produção nova — é o que a tela de acervo (B4) grava. `familiaLayout` é
 * livre (ex.: "radar", "servico"); `undefined` não toca no campo, `null`
 * limpa — a mesma distinção que o resto da casa usa para "não mandou" vs.
 * "mandou vazio".
 */
export async function marcarReferencia(a: {
  workspaceId: string;
  clientId: string;
  acervoPostId: string;
  referencia: boolean;
  familiaLayout?: string | null;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const post = await prisma.acervoPost.findFirst({
    where: { id: a.acervoPostId, clientId: a.clientId, workspaceId: a.workspaceId },
    select: { id: true },
  });
  if (!post) {
    return { ok: false, motivo: "post do acervo não encontrado neste cliente" };
  }

  await prisma.acervoPost.update({
    where: { id: a.acervoPostId },
    data: {
      referencia: a.referencia,
      ...(a.familiaLayout !== undefined ? { familiaLayout: a.familiaLayout } : {}),
    },
  });
  return { ok: true };
}
