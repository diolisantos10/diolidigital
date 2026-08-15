// pacote-da-peca.ts — A PEÇA INTEIRA, NA ORDEM, NUM ARQUIVO SÓ.
//
// ── Por que isto existe (14/08/2026) ─────────────────────────────────────────
//
// O caminho automático está fechado esperando a Meta, e o CEO vai publicar o
// primeiro carrossel do CityJobs à mão. Para isso ele precisava salvar 6 telas
// uma a uma por `/api/media/<id>` — que serve `inline`, sem nome e sem ordem —
// e depois lembrar de cabeça em que sequência elas entram.
//
// **A ordem é o que não se recupera.** Legenda errada se edita depois de
// publicado; tela 4 antes da tela 2 num carrossel só se conserta apagando o
// post. Por isso a ordem viaja NO NOME DO ARQUIVO (`01-…`, `02-…`) e não numa
// instrução ao lado: quem posta arrasta os arquivos de uma pasta, e o
// explorador de arquivos ordena por nome.
//
// ── O que este módulo NÃO faz ────────────────────────────────────────────────
//
// Não decide dono, não lê banco e não fala com plataforma nenhuma. Ele é a
// régua de nome e o empacotador — a posse é da rota, que a deriva do mesmo
// jeito que `app/api/media/[id]` (ver o cabeçalho de lá).

import AdmZip from "adm-zip";
import { MIMES_ACEITOS } from "@/lib/agency/media/armazenamento";

/** Teto do pacote inteiro. Um carrossel de fotos vive na casa dos poucos MB;
 *  este número existe para que uma peça com vídeo pesado não vire um buffer de
 *  centenas de MB na memória do servidor. Estourou, a rota recusa e diz. */
export const MAX_BYTES_DO_PACOTE = 100 * 1024 * 1024;

/** A extensão do arquivo a partir do MIME guardado. Lista fechada, e é a MESMA
 *  de `armazenamento.ts` — um segundo mapa aqui diria `.jpeg` onde o upload
 *  gravou `.jpg` no primeiro dia em que alguém acrescentasse um formato lá. */
export function extensaoDoMime(mime: string | null | undefined): string {
  return MIMES_ACEITOS[(mime ?? "").toLowerCase()] ?? "bin";
}

/**
 * Um apelido curto, sem acento e sem espaço, para batizar os arquivos.
 *
 * Sai só `[a-z0-9-]` de propósito: este texto vai para dentro de um cabeçalho
 * `Content-Disposition` e para dentro de um nome de entrada de zip. Aspas,
 * quebra de linha ou emoji vindos de uma legenda seriam texto de terceiro
 * dentro de um cabeçalho HTTP — que é como se injeta cabeçalho.
 */
export function apelido(bruto: string | null | undefined, teto = 40): string {
  const limpo = (bruto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, teto)
    .replace(/-+$/g, "");
  return limpo || "peca";
}

/** `2026-08-15` a partir da data marcada — ou de hoje, quando não há data. */
export function diaDoNome(quando: Date | null | undefined): string {
  const d = quando && !isNaN(quando.getTime()) ? quando : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Uma tela da peça, já na posição em que ela entra na publicação. */
export interface TelaDaPeca {
  /** 1, 2, 3… — a posição no carrossel. É o que vira `01-`, `02-`, `03-`. */
  ordem: number;
  /** O id do `MediaAsset`, quando a arte mora nesta casa. */
  mediaId: string | null;
  /** O que estava guardado no post (útil para dizer o que ficou de fora). */
  origem: string;
}

/**
 * As telas da peça NA ORDEM DE PUBLICAÇÃO.
 *
 * A ordem é a mesma que `esteira/publicacao.ts` manda para a Meta: carrossel lê
 * `mediaUrlsJson`; qualquer outro formato é a peça única de `mediaUrl`. Ler
 * daqui outra ordem faria o pacote do CEO divergir do que a máquina publicaria
 * — duas verdades sobre a mesma peça.
 *
 * Carrossel sem telas guardadas cai na capa: é peça de uma imagem só até que
 * alguém prove o contrário, e devolver lista vazia esconderia a arte que existe.
 */
export function telasDaPeca(post: {
  format: string;
  mediaUrl: string | null;
  mediaUrlsJson: string | null;
}): TelaDaPeca[] {
  const ehCarrossel = post.format === "carousel" || post.format === "carrossel";
  let brutas: string[] = [];
  if (ehCarrossel) {
    try {
      const v = JSON.parse(post.mediaUrlsJson ?? "[]");
      if (Array.isArray(v)) brutas = v.filter((x): x is string => typeof x === "string" && !!x.trim());
    } catch {
      brutas = [];
    }
  }
  if (brutas.length === 0 && post.mediaUrl) brutas = [post.mediaUrl];

  return brutas.map((origem, i) => ({
    ordem: i + 1,
    mediaId: idDaMidia(origem),
    origem,
  }));
}

/** `/api/media/<id>?…` → `<id>`. Link externo (Drive, CDN) devolve null: ele
 *  não é nosso e não temos os bytes dele para empacotar. */
export function idDaMidia(url: string): string | null {
  if (!url.startsWith("/api/media/")) return null;
  const id = url.split("/api/media/")[1]?.split("?")[0]?.split("/")[0] ?? "";
  return id || null;
}

/** `01-cityjobs-vaga-de-motorista.jpg` — ordem primeiro, sempre com dois
 *  dígitos, porque `10` antes de `2` é exatamente o erro que este nome evita. */
export function nomeDaTela(ordem: number, apelidoDaPeca: string, extensao: string): string {
  return `${String(ordem).padStart(2, "0")}-${apelidoDaPeca}.${extensao}`;
}

/** `cityjobs-vaga-de-motorista-2026-08-15.zip`. */
export function nomeDoPacote(apelidoDaPeca: string, dia: string): string {
  return `${apelidoDaPeca}-${dia}.zip`;
}

/**
 * O zip, sem compressão.
 *
 * JPEG e PNG já estão comprimidos: comprimir de novo gastaria CPU para ganhar
 * quase nada. O zip aqui é um CONTÊINER — ele existe para levar seis arquivos
 * com os nomes certos numa pasta só, não para economizar byte.
 *
 * `adm-zip` já é dependência declarada desta casa (`app/api/sdr/upload`,
 * `app/api/brain/analyze-brand-book`). Nada foi instalado para isto.
 */
export function montarPacote(arquivos: Array<{ nome: string; bytes: Buffer }>): Buffer {
  const zip = new AdmZip();
  for (const a of arquivos) zip.addFile(a.nome, a.bytes);
  return zip.toBuffer();
}
