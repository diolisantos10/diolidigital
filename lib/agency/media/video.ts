// video.ts — O MATERIAL BRUTO DO CLIENTE VIRA REEL.
//
// O buraco do raio-X de 02/08/2026, e era o maior do Social: a dona do salão
// manda 3 vídeos por semana do celular, e **ninguém edita nada**. A agência
// devolvia o ROTEIRO — "grave assim, corte assado" — e o vídeo dela ficava
// parado no armazenamento. Era o serviço que ela mais precisava e o único que
// a casa não fazia.
//
// ── O QUE ESTE ARQUIVO FAZ, E O QUE NÃO FAZ ────────────────────────────────
//
// FAZ: corta na duração de reel, enquadra em 9:16 sem distorcer, normaliza o
// áudio (vídeo de celular vem baixo ou estourado) e tira a capa.
//
// NÃO FAZ: queimar texto no vídeo. Mesma razão da arte gerada — texto dentro
// do pixel escapa do piso de verdade, que lê texto e não enxerga imagem. Preço
// e promessa vão na legenda, onde podem ser conferidos.
//
// ── POR QUE NÃO DISTORCER É UMA REGRA E NÃO UM DETALHE ─────────────────────
//
// O caminho fácil (`scale=1080:1920`) estica a imagem: rosto largo, produto
// deformado. O caminho certo é `scale` que cobre + `crop` que centraliza. O
// cliente não sabe dizer "isso está com aspect ratio errado", mas sabe dizer
// "ficou estranho" — e devolve a peça.

// ── DE ONDE VEM O ffmpeg EM PRODUÇÃO ───────────────────────────────────────
// De `railpack.json` → `deploy.aptPackages`. Este projeto é construído pelo
// RAILPACK, não pelo Nixpacks: um `nixpacks.toml` é ignorado sem nenhum aviso
// no log, e foi assim que a primeira tentativa falhou em 02/08/2026 — o build
// passou, o app subiu, e o editor teria devolvido "ffmpeg não disponível" para
// todo cliente, em silêncio. `scripts/start.sh` agora imprime a presença dele
// em todo boot, e `/api/capacidades` responde a mesma coisa por HTTP.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** Teto de duração do reel. 90s é o limite do Instagram para o feed de reels
 *  em muitas contas; ficar abaixo evita a recusa silenciosa da Meta. */
export const MAX_SEGUNDOS_REEL = 90;
/** Abaixo disto não é um reel, é um clipe perdido. */
export const MIN_SEGUNDOS_REEL = 3;
/** ffmpeg pendurado seguraria o relógio da agência inteira. */
const TIMEOUT_MS = 4 * 60_000;

export interface VideoEditado {
  ok: boolean;
  /** O mp4 pronto para publicar. */
  bytes?: Buffer;
  /** A capa, em JPG. A Meta aceita `cover_url` e o portal precisa de miniatura. */
  capa?: Buffer;
  duracaoSegundos?: number;
  erro?: string;
}

/**
 * Roda um binário e devolve saída. Nunca lança por código de saída — quem chama
 * decide o que fazer com a falha, e uma exceção aqui derrubaria a rodada.
 */
function rodar(bin: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", encerrado = false;
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      encerrado = true;
      p.kill("SIGKILL");
      resolve({ ok: false, stdout, stderr: "tempo esgotado" });
    }, TIMEOUT_MS);

    p.stdout.on("data", (d) => { stdout += String(d); });
    p.stderr.on("data", (d) => { stderr += String(d).slice(0, 4000); });
    p.on("error", (e) => {
      if (encerrado) return;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: e.message });
    });
    p.on("close", (code) => {
      if (encerrado) return;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

/** ffmpeg existe neste ambiente? Sem ele, o editor devolve erro legível em vez
 *  de "command not found" no log do servidor. */
export async function ffmpegDisponivel(): Promise<boolean> {
  return (await rodar("ffmpeg", ["-version"])).ok;
}

/** Duração real do arquivo, em segundos. `null` quando não dá para ler — e aí
 *  o vídeo não é editado, porque cortar às cegas produz peça truncada. */
export async function duracaoDe(caminho: string): Promise<number | null> {
  const r = await rodar("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", caminho,
  ]);
  if (!r.ok) return null;
  const n = Number(String(r.stdout).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Os argumentos do corte. Separado da execução de propósito: é a parte que
 * precisa estar certa, e é a única testável sem processar um vídeo de verdade.
 */
export function argumentosDeEdicao(input: {
  entrada: string; saida: string; duracao: number; inicioSegundos?: number;
}): string[] {
  const dura = Math.min(input.duracao, MAX_SEGUNDOS_REEL);
  return [
    "-y",
    "-ss", String(Math.max(0, input.inicioSegundos ?? 0)),
    "-i", input.entrada,
    "-t", String(dura),
    // COBRIR e recortar — nunca esticar. `increase` garante que a imagem cobre
    // os 1080x1920; o `crop` tira o excesso pelo centro. Trocar por
    // `scale=1080:1920` deformaria rosto e produto.
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    // Áudio de celular vem baixo ou estourado. -16 LUFS é o alvo de redes
    // sociais; sem isto metade dos reels sai inaudível e a outra metade estoura.
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    // O leitor do Instagram precisa do índice no começo do arquivo.
    "-movflags", "+faststart",
    input.saida,
  ];
}

/**
 * Edita o vídeo bruto do cliente e devolve o reel pronto.
 *
 * Conservador por construção: material que não dá para ler, curto demais ou que
 * o ffmpeg recusa NÃO vira peça. Publicar um vídeo truncado no perfil do
 * cliente é pior do que não publicar.
 */
export async function editarParaReel(bruto: Buffer, opts: { inicioSegundos?: number } = {}): Promise<VideoEditado> {
  if (!(await ffmpegDisponivel())) {
    return { ok: false, erro: "ffmpeg não está disponível neste ambiente" };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "dioli-video-"));
  try {
    const entrada = path.join(dir, "bruto");
    const saida = path.join(dir, "reel.mp4");
    const capa = path.join(dir, "capa.jpg");
    await writeFile(entrada, bruto);

    const duracao = await duracaoDe(entrada);
    if (duracao === null) return { ok: false, erro: "não consegui ler esse arquivo de vídeo" };
    if (duracao < MIN_SEGUNDOS_REEL) {
      return { ok: false, erro: `o vídeo tem ${duracao.toFixed(1)}s — curto demais para virar reel` };
    }

    const corte = await rodar("ffmpeg", argumentosDeEdicao({ entrada, saida, duracao, inicioSegundos: opts.inicioSegundos }));
    if (!corte.ok) {
      return { ok: false, erro: `não consegui editar esse vídeo: ${ultimaLinha(corte.stderr)}` };
    }

    // A capa sai do segundo 1, não do zero: o primeiro quadro de vídeo de
    // celular é quase sempre preto ou tremido.
    await rodar("ffmpeg", ["-y", "-ss", "1", "-i", saida, "-frames:v", "1", "-q:v", "3", capa]);

    const bytes = await readFile(saida);
    const thumb = await readFile(capa).catch(() => null);
    return {
      ok: true, bytes,
      ...(thumb ? { capa: thumb } : {}),
      duracaoSegundos: Math.min(duracao, MAX_SEGUNDOS_REEL),
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro ao editar o vídeo" };
  } finally {
    // O temporário vive no mesmo disco do banco. Não limpar aqui encheria o
    // volume em poucos dias de operação.
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}

function ultimaLinha(s: string): string {
  const linhas = s.trim().split("\n").filter(Boolean);
  return (linhas[linhas.length - 1] ?? "erro desconhecido").slice(0, 200);
}
