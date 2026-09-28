// midia.ts — A MÍDIA QUE O CITY JOBS MANDA, VALIDADA ANTES DE QUALQUER
// CHAMADA À META. SERVER-ONLY.
//
// Contrato: docs/integracoes/cityjobs-contrato.md, §5. A ordem da ficha é
// clara: "o MESMO conferidor de story/feed (lib/integrations/meta/
// midia-de-story.ts, formato-de-midia.ts)" — nunca uma segunda régua de
// formato. Este arquivo não reimplementa "o que é um JPEG aceitável", ele
// BAIXA a mídia com segurança e chama os conferidores que já existem.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO ────────────────────────────────
//
// Ele NÃO converte/redimensiona a peça (mesmo para `story`). O contrato §11
// é explícito — "Não edita a arte (...) nunca reidenta, corta ou redesenha" —
// e o §5 descreve a spec de story como REQUISITO DE ENTRADA (JPEG, 9:16,
// ≤8MB), não como algo que a Dioli produz a partir de qualquer imagem. Por
// isso a peça é aceita ou recusada como chegou; `prepararImagemDeStory`
// (usado noutro lugar da casa para stories DERIVADOS de conteúdo próprio)
// não entra aqui.
//
// A proporção 9:16 de uma imagem de story NÃO é reconferida aqui pelo mesmo
// motivo já declarado em `midia-de-story.ts`: os metadados disponíveis
// (mime, tamanho) não incluem dimensão. É uma lacuna já existente e
// assumida no resto da casa — citada, não escondida.

import { confereUrlExternaSegura } from "@/lib/security/url-externa-segura";
import { guardarArquivo, type ResultadoDeGuardar } from "@/lib/agency/media/armazenamento";
import {
  conferirFormatoDeMidia,
  motivoDeFormato,
  MIME_DE_IMAGEM_ACEITO,
  MIMES_DE_VIDEO_ACEITOS,
} from "@/lib/integrations/meta/formato-de-midia";
import {
  TAMANHO_MAXIMO_DA_IMAGEM_BYTES,
  TAMANHO_MAXIMO_DO_VIDEO_BYTES,
  DURACAO_MINIMA_DO_VIDEO_S,
  DURACAO_MAXIMA_DO_VIDEO_S,
  conferirVideoDeStory,
} from "@/lib/integrations/meta/midia-de-story";
import type { FormatoDoPost } from "@/lib/integracoes/cityjobs/regras";

/** A allowlist de domínios de onde a Dioli aceita buscar mídia do City Jobs —
 *  contrato §4 ("Domínios permitidos são declarados e cadastrados previamente
 *  pela Dioli"). Env: lista separada por vírgula, ex.:
 *  `cdn.cityjobs.example.com,assets.cityjobs.com.br`. */
export function dominiosPermitidosDeEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.CITYJOBS_DOMINIOS_DE_MIDIA ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * O host da URL está na allowlist? Aceita subdomínio do domínio cadastrado
 * (`cdn.x.com` cadastrado cobre `foo.cdn.x.com`), nunca o contrário — um
 * domínio cadastrado não autoriza um domínio-PAI mais largo.
 */
export function dominioPermitido(urlBruta: string, permitidos: readonly string[]): boolean {
  if (permitidos.length === 0) return false;
  let host: string;
  try {
    host = new URL(urlBruta).hostname.toLowerCase();
  } catch {
    return false;
  }
  return permitidos.some((d) => host === d || host.endsWith(`.${d}`));
}

// ── TIMEOUT DE REDE (seguranca, gap — J4, 28/09/2026) ───────────────────────
//
// As duas chamadas de rede desta função (HEAD e GET) não tinham nenhum
// timeout — uma origem que nunca responde (lenta, ou presa de propósito)
// prenderia a requisição de `POST /posts` inteira, e por extensão o processo
// que a atende, indefinidamente. Mesma régua de `webhook.ts`
// (`TIMEOUT_DO_WEBHOOK_MS`): um número generoso, mas finito.
/** O HEAD só lê um cabeçalho — não deveria nunca demorar como o download. */
const TIMEOUT_DO_HEAD_MS = 10_000;
/** O GET baixa até o maior caso aceito (100 MB de vídeo de story, §5/§9) —
 *  generoso o bastante para uma rede lenta legítima, finito o bastante para
 *  nunca prender a requisição para sempre. */
const TIMEOUT_DO_DOWNLOAD_MS = 30_000;

/** O teto de tamanho por (formato, ehVideo) — os números do contrato §5.
 *  Feed/carrossel não têm número FIXADO no contrato (§12, item 2, pendência
 *  declarada) — reusa o teto de IMAGEM de story como valor de trabalho, pelo
 *  mesmo motivo que o resto da ficha cita: "o MESMO conferidor de
 *  story/feed". Isto é uma DECISÃO desta ficha, registrada aqui e no relato
 *  final — não um número do contrato. */
export function tetoDeBytes(formato: FormatoDoPost, ehVideo: boolean): number {
  if (formato === "story" && ehVideo) return TAMANHO_MAXIMO_DO_VIDEO_BYTES;
  return TAMANHO_MAXIMO_DA_IMAGEM_BYTES;
}

export type VereditoDeMidia =
  | { ok: true; mediaAssetId: string; mime: string; bytes: number }
  | { ok: false; codigo: "campo_invalido"; campo: string; motivo: string }
  | { ok: false; codigo: "midia_fora_de_spec"; motivo: string };

/**
 * Baixa UMA mídia (URL) do City Jobs, valida contra a spec do formato e
 * guarda no armazenamento da casa (`kind: "inbound"` — é conteúdo que uma
 * fonte externa mandou, mesma categoria de um upload do cliente pelo portal).
 *
 * Nunca lança. Nunca chama a Meta — toda recusa acontece antes disso.
 */
export async function baixarEValidarMidiaExterna(a: {
  url: string;
  formato: FormatoDoPost;
  workspaceId: string;
  clientId: string;
  dominiosPermitidos: readonly string[];
}): Promise<VereditoDeMidia> {
  if (!dominioPermitido(a.url, a.dominiosPermitidos)) {
    return {
      ok: false,
      codigo: "campo_invalido",
      campo: "midia.url",
      motivo: `o domínio de "${a.url}" não está na lista de domínios de mídia autorizados (CITYJOBS_DOMINIOS_DE_MIDIA)`,
    };
  }

  const seguranca = await confereUrlExternaSegura(a.url);
  if (!seguranca.ok) {
    return { ok: false, codigo: "campo_invalido", campo: "midia.url", motivo: seguranca.motivo };
  }

  // Teto de tamanho ANTES de bufferizar (contrato: "teto de tamanho ANTES
  // de bufferizar") — o HEAD confere o `content-length` DECLARADO antes de
  // qualquer GET. Um teto genérico e generoso (o maior caso aceito, vídeo de
  // story) segura o pior caso ANTES de sabermos o formato exato; o teto FINO
  // (por formato) é conferido de novo depois, com o `content-type` real.
  let head: Response;
  try {
    head = await fetch(a.url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_DO_HEAD_MS),
    });
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError"
      ? `sem resposta em ${TIMEOUT_DO_HEAD_MS / 1000}s — timeout`
      : e instanceof Error ? e.message : "erro de rede";
    return {
      ok: false,
      codigo: "midia_fora_de_spec",
      motivo: `não consegui alcançar a URL da mídia: ${motivo}`,
    };
  }
  const declarado = Number(head.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAXIMO_DO_VIDEO_BYTES) {
    return {
      ok: false,
      codigo: "midia_fora_de_spec",
      motivo: `a mídia declara ${(declarado / 1024 / 1024).toFixed(1)} MB — acima de qualquer teto aceito por esta casa`,
    };
  }

  let res: Response;
  try {
    res = await fetch(a.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_DO_DOWNLOAD_MS),
    });
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError"
      ? `sem resposta em ${TIMEOUT_DO_DOWNLOAD_MS / 1000}s — timeout`
      : e instanceof Error ? e.message : "erro de rede";
    return {
      ok: false,
      codigo: "midia_fora_de_spec",
      motivo: `não consegui baixar a mídia: ${motivo}`,
    };
  }
  if (!res.ok) {
    return { ok: false, codigo: "midia_fora_de_spec", motivo: `a origem respondeu ${res.status} ao buscar a mídia` };
  }

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() || null;
  const ehVideo = contentType?.startsWith("video/") ?? false;
  const teto = tetoDeBytes(a.formato, ehVideo);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      codigo: "midia_fora_de_spec",
      motivo: `não consegui ler os bytes da mídia: ${e instanceof Error ? e.message : "erro"}`,
    };
  }
  if (bytes.length === 0) {
    return { ok: false, codigo: "midia_fora_de_spec", motivo: "a mídia chegou vazia" };
  }
  if (bytes.length > teto) {
    return {
      ok: false,
      codigo: "midia_fora_de_spec",
      motivo: `a mídia tem ${(bytes.length / 1024 / 1024).toFixed(1)} MB — acima do teto de ${(teto / 1024 / 1024).toFixed(0)} MB para ${a.formato}${ehVideo ? " (vídeo)" : ""}`,
    };
  }

  // O MESMO conferidor que o resto da esteira usa — nunca uma segunda régua.
  const formatoOk = conferirFormatoDeMidia([{ id: "midia-recebida-do-city-jobs", mime: contentType }], ehVideo);
  if (!formatoOk.aceita) {
    return { ok: false, codigo: "midia_fora_de_spec", motivo: formatoOk.motivo };
  }

  if (a.formato === "story" && ehVideo) {
    const medidas = await medirVideo(bytes);
    const veredito = conferirVideoDeStory({
      mime: (contentType as string),
      codec: medidas.codec,
      duracaoS: medidas.duracaoS,
      bytes: bytes.length,
    });
    if (!veredito.ok) {
      return { ok: false, codigo: "midia_fora_de_spec", motivo: veredito.motivo };
    }
  }

  const guardado: ResultadoDeGuardar = await guardarArquivo({
    bytes,
    fileName: nomeDoArquivo(a.url, contentType ?? MIME_DE_IMAGEM_ACEITO),
    mimeType: contentType ?? MIME_DE_IMAGEM_ACEITO,
    workspaceId: a.workspaceId,
    clientId: a.clientId,
    kind: "inbound",
    uploadedBy: "cityjobs",
  });
  if (!guardado.ok) {
    return { ok: false, codigo: "midia_fora_de_spec", motivo: guardado.motivo };
  }

  return { ok: true, mediaAssetId: guardado.arquivo.id, mime: contentType ?? "", bytes: bytes.length };
}

function nomeDoArquivo(url: string, mime: string): string {
  const ext = mime === MIME_DE_IMAGEM_ACEITO ? "jpg" : MIMES_DE_VIDEO_ACEITOS.has(mime) ? "mp4" : "bin";
  const semQuery = url.split("?")[0] ?? url;
  const base = semQuery.split("/").pop()?.slice(0, 60) || "cityjobs";
  return base.includes(".") ? base : `${base}.${ext}`;
}

/** Duração/codec por `ffprobe`, quando o binário está disponível — mesma
 *  técnica de `lib/integrations/meta/acervo.ts` (`medirVideo`), com o mesmo
 *  fail-soft: sem `ffprobe`, os dois campos voltam `null` (nunca inventados),
 *  e `conferirVideoDeStory` recusa por "não consegui confirmar" em vez de
 *  aprovar por omissão. */
async function medirVideo(bytes: Buffer): Promise<{ duracaoS: number | null; codec: string | null }> {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { duracaoDe, codecDe } = await import("@/lib/agency/media/video");

  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "cityjobs-video-"));
    const arquivo = path.join(dir, "midia.mp4");
    await writeFile(arquivo, bytes);
    const [duracaoS, codec] = await Promise.all([duracaoDe(arquivo), codecDe(arquivo)]);
    return { duracaoS, codec };
  } catch {
    return { duracaoS: null, codec: null };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Reexportado para quem monta a mensagem de erro no envelope da rota — a
// mesma frase de duas metades que `formato-de-midia.ts` já usa.
export { motivoDeFormato };
export { DURACAO_MINIMA_DO_VIDEO_S, DURACAO_MAXIMA_DO_VIDEO_S };
