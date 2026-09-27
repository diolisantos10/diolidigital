// midia-de-story.ts — A MÍDIA DE STORY, DO JEITO QUE A META EXIGE. SERVER-ONLY.
//
// ─── O QUE ESTE MÓDULO FAZ, E O QUE ELE NÃO FAZ (27/09/2026) ────────────────
//
// Story tem regras PRÓPRIAS que feed e reel não têm: imagem tem de ser
// EXATAMENTE 9:16 (1080×1920), sempre JPEG, sempre ≤ 8 MB; vídeo precisa de
// MP4/MOV, H264/HEVC, entre 3 e 60 segundos, ≤ 100 MB
// (docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md). Uma
// imagem 4:5 (o formato de feed desta casa) mandada direto para um contêiner
// de STORIES sai esticada ou cortada no celular do cliente — a Meta aceita o
// contêiner e a peça sai errada, o pior tipo de falha porque não avisa.
//
// Este arquivo tem DUAS metades:
//   • `prepararImagemDeStory` — PRODUZ a imagem certa a partir de qualquer
//     imagem de entrada (mesmo espírito de `lib/agency/media/para-jpeg.ts`,
//     mas aqui HÁ redimensionamento: a moldura é fixa, o conteúdo não pode
//     ser cortado nem distorcido, e por isso entra CENTRALIZADO sobre um
//     fundo — nunca esticado para preencher o quadro);
//   • `conferirVideoDeStory` — só CONFERE (o vídeo não é reprocessado aqui:
//     recodificar vídeo é caro e fora do escopo desta ficha); e
//   • `conferirImagemDeStory` + `metadadosDaMidiaDeStory` — o par que permite
//     a `client.ts` recusar uma mídia de story ANTES de criar o contêiner,
//     usando só os metadados que a casa já tem (mimeType/sizeBytes do
//     `MediaAsset`, ou o cabeçalho HTTP de uma URL externa).
//
// ─── CONTRATO FIXO — W11 IMPORTA ─────────────────────────────────────────────
//
// `prepararImagemDeStory` e `conferirVideoDeStory` têm assinatura FECHADA
// (ficha W10). Mudar o formato do retorno quebra `publicacao.ts` (W11) sem
// aviso de tipo, porque o import é por nome — TypeScript não avisa import de
// função que ainda existe com contrato diferente do esperado seria pego pelo
// `tsc`, mas o RISCO aqui é semântico: mudar o SIGNIFICADO de um campo sem
// mudar o nome dele.
//
// ─── POR QUE DOIS CAMINHOS DE CONVERSÃO, E POR QUE NENHUM ADIVINHA ──────────
//
// Mesma razão de `para-jpeg.ts`: `sharp` é transitivo (vem de carona no
// `next`), não é dependência declarada. O caminho de reserva é o rasterizador
// da própria casa (`design/renderizar.ts`, Playwright), que já é obrigatório
// em produção. Sem NENHUM dos dois, a porta fecha e diz qual metade falta —
// nunca entrega a peça pela metade.

import { prisma } from "@/lib/db/client";
import { renderizarHtml } from "@/lib/agency/design/renderizar";
import { medidasDaImagem } from "@/lib/agency/media/para-jpeg";
import { MIME_DE_IMAGEM_ACEITO, MIMES_DE_VIDEO_ACEITOS } from "./formato-de-midia";

// ─── A MOLDURA DE STORY ──────────────────────────────────────────────────────

/** A largura fixa do quadro de story. Regra de plataforma, não escolha da casa. */
export const LARGURA_DA_STORY = 1080;
/** A altura fixa do quadro de story — 9:16 exato. */
export const ALTURA_DA_STORY = 1920;
/** O teto de peso de uma IMAGEM de story. */
export const TAMANHO_MAXIMO_DA_IMAGEM_BYTES = 8 * 1024 * 1024;
/** O teto de peso de um VÍDEO de story. */
export const TAMANHO_MAXIMO_DO_VIDEO_BYTES = 100 * 1024 * 1024;
/** Duração mínima/máxima de um vídeo de story, em segundos. */
export const DURACAO_MINIMA_DO_VIDEO_S = 3;
export const DURACAO_MAXIMA_DO_VIDEO_S = 60;

/** A qualidade inicial do JPEG. Mesmo número de `para-jpeg.ts` e de
 *  `design/renderizar.ts` — uma tela de story ao lado de uma tela de feed,
 *  na mesma peça, tem de sair com o mesmo grão. Só desce daqui quando o
 *  arquivo não cabe nos 8 MB — o que é raro num quadro fotográfico comum. */
const QUALIDADE_INICIAL_DO_JPEG = 92;
/** Abaixo disto a compressão já degrada visivelmente uma foto — desistir é
 *  mais honesto que entregar uma peça ilegível. */
const QUALIDADE_MINIMA_DO_JPEG = 40;
const PASSO_DE_QUALIDADE = 8;

// ─── prepararImagemDeStory ───────────────────────────────────────────────────

export type ResultadoDoPreparoDeStory =
  | { ok: true; buffer: Buffer; mime: "image/jpeg"; largura: number; altura: number; bytes: number }
  | { ok: false; motivo: string };

/**
 * Converte QUALQUER imagem de entrada para o quadro de story: JPEG,
 * 1080×1920, ≤ 8 MB.
 *
 * Imagem de proporção diferente de 9:16 entra CENTRALIZADA sobre um fundo
 * branco — nunca esticada, nunca cortada. Distorcer ou cortar é mexer no
 * CONTEÚDO da peça que já foi aprovada pelo cliente (mesma preocupação de
 * `para-jpeg.ts`); só a MOLDURA muda.
 *
 * Reduz a qualidade em passos até caber em 8 MB. Não coube nem no piso de
 * qualidade → `ok: false` com o motivo, nunca uma peça cortada pela metade.
 *
 * Nunca lança.
 */
export async function prepararImagemDeStory(
  entrada: Buffer,
  mime: string,
): Promise<ResultadoDoPreparoDeStory> {
  if (!entrada || entrada.length === 0) {
    return { ok: false, motivo: "o arquivo chegou vazio — não há o que preparar para story." };
  }

  const porSharp = await comSharp(entrada);
  if (porSharp.ok) return porSharp;

  const porRasterizador = await comRasterizador(entrada, mime);
  if (porRasterizador.ok) return porRasterizador;

  // A recusa nomeia as DUAS metades que faltaram — "não consegui preparar"
  // sem dizer qual ferramenta falhou manda quem for consertar procurar no
  // lugar errado (foi o que custou dias em 08/08, ver `para-jpeg.ts`).
  return {
    ok: false,
    motivo:
      `não consegui preparar esta imagem para o quadro de story (9:16, ${LARGURA_DA_STORY}×${ALTURA_DA_STORY}) ` +
      `por nenhum dos dois caminhos. sharp: ${porSharp.motivo} · rasterizador: ${porRasterizador.motivo}`,
  };
}

/** O caminho barato: `sharp`. Ausência é esperada (é dependência transitiva)
 *  e não é erro — é o outro caminho assumindo. */
async function comSharp(entrada: Buffer): Promise<ResultadoDoPreparoDeStory> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { ok: false, motivo: "sharp não está instalado neste ambiente (é transitivo, vem do next)" };
  }
  try {
    let qualidade = QUALIDADE_INICIAL_DO_JPEG;
    for (;;) {
      const buffer = await sharp(entrada)
        // `fit: "contain"` é a centralização sem distorcer: a imagem inteira
        // entra dentro do quadro, escalada para caber, e o resto do quadro
        // vira fundo — nunca recorte, nunca esticamento.
        .resize(LARGURA_DA_STORY, ALTURA_DA_STORY, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: qualidade, chromaSubsampling: "4:4:4" })
        .toBuffer();

      if (buffer.length <= TAMANHO_MAXIMO_DA_IMAGEM_BYTES) {
        return {
          ok: true,
          buffer,
          mime: MIME_DE_IMAGEM_ACEITO as "image/jpeg",
          largura: LARGURA_DA_STORY,
          altura: ALTURA_DA_STORY,
          bytes: buffer.length,
        };
      }
      if (qualidade <= QUALIDADE_MINIMA_DO_JPEG) {
        return {
          ok: false,
          motivo:
            `mesmo reduzindo a qualidade até ${qualidade}, a imagem ficou com ` +
            `${(buffer.length / 1024 / 1024).toFixed(1)} MB — acima do teto de 8 MB da Meta para stories.`,
        };
      }
      qualidade -= PASSO_DE_QUALIDADE;
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 160) : "falhou ao converter com sharp" };
  }
}

/**
 * O caminho de reserva: o rasterizador da casa (Playwright), mesmo motor de
 * `design/renderizar.ts`. Sem controle de qualidade (a saída dele é fixa em
 * 92) — por isso, se o arquivo não couber nos 8 MB por este caminho, a
 * recusa diz exatamente isso, em vez de fingir que tentou reduzir.
 */
async function comRasterizador(entrada: Buffer, mime: string): Promise<ResultadoDoPreparoDeStory> {
  // Confere que É uma imagem de verdade antes de confiar numa tag <img>: um
  // arquivo corrompido carregado como `<img>` renderiza em branco, e um
  // quadro branco 1080×1920 PASSARIA por esta função como se fosse a peça —
  // o pior tipo de falha, porque não avisa (mesma guarda de `para-jpeg.ts`).
  if (!medidasDaImagem(entrada)) {
    return {
      ok: false,
      motivo: "não sei ler este formato de imagem sem sharp — o rasterizador não teria como confirmar que é uma imagem de verdade",
    };
  }

  const tipo = mime && mime.startsWith("image/") ? mime : "application/octet-stream";
  const fonte = `data:${tipo};base64,${entrada.toString("base64")}`;
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;width:${LARGURA_DA_STORY}px;height:${ALTURA_DA_STORY}px;background:#fff;overflow:hidden}` +
    `.quadro{width:100%;height:100%;display:flex;align-items:center;justify-content:center}` +
    `img{max-width:100%;max-height:100%;display:block}</style></head>` +
    `<body><div class="quadro"><img src="${fonte}"></div></body></html>`;

  const r = await renderizarHtml({
    html,
    largura: LARGURA_DA_STORY,
    altura: ALTURA_DA_STORY,
    // Nenhum texto nesta página — só reembala a imagem dentro da moldura.
    textosEsperados: [],
  });
  if (!r.ok) return { ok: false, motivo: `${r.motivo} — ${r.erro.slice(0, 160)}` };
  if (r.bytes.length > TAMANHO_MAXIMO_DA_IMAGEM_BYTES) {
    return {
      ok: false,
      motivo:
        `o rasterizador (sharp indisponível neste ambiente) produziu ` +
        `${(r.bytes.length / 1024 / 1024).toFixed(1)} MB, acima do teto de 8 MB — este caminho não reduz qualidade.`,
    };
  }
  return {
    ok: true,
    buffer: r.bytes,
    mime: MIME_DE_IMAGEM_ACEITO as "image/jpeg",
    largura: LARGURA_DA_STORY,
    altura: ALTURA_DA_STORY,
    bytes: r.bytes.length,
  };
}

// ─── conferirVideoDeStory ────────────────────────────────────────────────────

/** Os codecs de vídeo que a Meta aceita em story, normalizados (sem pontos
 *  nem hífens) para aceitar "H.264", "h264", "H264" etc. como a mesma coisa. */
const CODECS_ACEITOS = new Set(["h264", "hevc", "h265"]);

function normalizarCodec(codec: string): string {
  return codec.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * O vídeo pode ir a um story? Só CONFERE — não recodifica (recodificar vídeo
 * é caro e fica fora do escopo desta ficha).
 *
 * Fail-closed em cada metade que a casa não souber: codec ausente/desconhecido
 * e duração ausente recusam com motivo próprio, nunca "provavelmente serve" —
 * é a mesma régua de `formato-de-midia.ts` ("ausência de informação não é
 * informação").
 */
export function conferirVideoDeStory(
  v: { mime: string; codec?: string | null; duracaoS: number | null; bytes: number },
): { ok: true } | { ok: false; motivo: string } {
  if (!MIMES_DE_VIDEO_ACEITOS.has(v.mime)) {
    return {
      ok: false,
      motivo: `a Meta só aceita vídeo MP4 ou MOV em story, e este arquivo veio como "${v.mime || "desconhecido"}"`,
    };
  }
  if (!v.codec) {
    return { ok: false, motivo: "não consegui conferir o codec" };
  }
  if (!CODECS_ACEITOS.has(normalizarCodec(v.codec))) {
    return {
      ok: false,
      motivo: `o codec "${v.codec}" não é H264 nem HEVC, que é o que a Meta aceita em story`,
    };
  }
  if (v.duracaoS === null) {
    return { ok: false, motivo: "não consegui confirmar a duração do vídeo" };
  }
  if (v.duracaoS < DURACAO_MINIMA_DO_VIDEO_S || v.duracaoS > DURACAO_MAXIMA_DO_VIDEO_S) {
    return {
      ok: false,
      motivo:
        `story em vídeo precisa durar entre ${DURACAO_MINIMA_DO_VIDEO_S} e ${DURACAO_MAXIMA_DO_VIDEO_S} segundos, ` +
        `e este tem ${v.duracaoS}s`,
    };
  }
  if (v.bytes > TAMANHO_MAXIMO_DO_VIDEO_BYTES) {
    return {
      ok: false,
      motivo:
        `o vídeo tem ${(v.bytes / 1024 / 1024).toFixed(1)} MB — acima do teto de ` +
        `${TAMANHO_MAXIMO_DO_VIDEO_BYTES / 1024 / 1024} MB da Meta para stories`,
    };
  }
  return { ok: true };
}

// ─── conferirImagemDeStory + metadadosDaMidiaDeStory ────────────────────────
//
// A imagem de story JÁ TEM de sair de `prepararImagemDeStory` como JPEG
// 1080×1920 ≤ 8 MB — essa é a garantia de CONSTRUÇÃO. O que falta é uma
// segunda porta, em `client.ts`, bem antes de criar o contêiner: confirmar
// que O QUE ESTÁ PRESTES A SER ENVIADO ainda bate com essa garantia. Como o
// `MediaAsset` não guarda largura/altura (só `mimeType` e `sizeBytes`), a
// conferência aqui é o que os metadados DISPONÍVEIS permitem: formato e
// peso. A proporção 9:16 continua sendo responsabilidade de quem gerou o
// arquivo (`prepararImagemDeStory`) — não há como reconferi-la sem decodificar
// a imagem inteira de novo, e "confira pelos metadados disponíveis" foi a
// instrução explícita da ficha.

export interface MetadadosDaMidia {
  /** `null` = não sei, nunca "genérico" ou "provavelmente jpeg". */
  mime: string | null;
  /** `null` = não sei o tamanho. */
  bytes: number | null;
}

function extrairIdDeMediaAsset(url: string): string | null {
  const m = /\/api\/media\/([^/?]+)/.exec(url);
  return m ? m[1]! : null;
}

/**
 * O que sabemos sobre o arquivo que está prestes a ir à Meta como story, sem
 * baixar o conteúdo inteiro. Duas fontes, nesta ordem:
 *
 *   1. link da própria casa (`/api/media/<id>`) — lê o registro do
 *      `MediaAsset` direto do banco, sem chamada de rede;
 *   2. qualquer outra URL (Drive, CDN do cliente) — HEAD, que é o único jeito
 *      de saber algo de um link que não é nosso.
 *
 * Nunca lança. Falhou das duas formas → os dois campos voltam `null`, e quem
 * chama (`client.ts`) trata isso como recusa, não como aprovação por omissão.
 */
export async function metadadosDaMidiaDeStory(url: string): Promise<MetadadosDaMidia> {
  const idInterno = extrairIdDeMediaAsset(url);
  if (idInterno) {
    try {
      const registro = await prisma.mediaAsset.findUnique({ where: { id: idInterno } });
      if (registro) return { mime: registro.mimeType, bytes: registro.sizeBytes };
    } catch {
      // Banco indisponível ou tabela ausente no mock de teste: cai para o
      // HEAD abaixo, que é o outro caminho legítimo — nunca lança daqui.
    }
  }
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return { mime: null, bytes: null };
    const mimeBruto = res.headers.get("content-type");
    const tamanhoBruto = res.headers.get("content-length");
    const bytes = tamanhoBruto ? Number(tamanhoBruto) : NaN;
    return {
      mime: mimeBruto ? mimeBruto.split(";")[0]!.trim() : null,
      bytes: Number.isFinite(bytes) ? bytes : null,
    };
  } catch {
    return { mime: null, bytes: null };
  }
}

/**
 * A imagem pode ir a um story, pelo que os metadados disponíveis dizem?
 * Ver o comentário do bloco acima para o porquê de não reconferir 9:16 aqui.
 */
export function conferirImagemDeStory(
  m: MetadadosDaMidia,
): { ok: true } | { ok: false; motivo: string } {
  if (m.mime === null) {
    return { ok: false, motivo: "não consegui confirmar o formato da imagem antes de publicar" };
  }
  if (m.mime !== MIME_DE_IMAGEM_ACEITO) {
    return { ok: false, motivo: `a Meta só aceita JPEG em story, e este arquivo é "${m.mime}"` };
  }
  if (m.bytes === null) {
    return { ok: false, motivo: "não consegui confirmar o tamanho da imagem antes de publicar" };
  }
  if (m.bytes > TAMANHO_MAXIMO_DA_IMAGEM_BYTES) {
    return {
      ok: false,
      motivo:
        `a imagem tem ${(m.bytes / 1024 / 1024).toFixed(1)} MB — acima do teto de ` +
        `${TAMANHO_MAXIMO_DA_IMAGEM_BYTES / 1024 / 1024} MB da Meta para stories`,
    };
  }
  return { ok: true };
}
