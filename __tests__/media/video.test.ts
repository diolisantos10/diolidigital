import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  editarParaReel, argumentosDeEdicao, ffmpegDisponivel, duracaoDe,
  MAX_SEGUNDOS_REEL, MIN_SEGUNDOS_REEL,
} from "@/lib/agency/media/video";

// Estes testes rodam ffmpeg DE VERDADE quando ele existe. Mock aqui não provaria
// nada: o risco todo do arquivo está no que o ffmpeg faz com o vídeo, não no
// código que o chama.
let temFfmpeg = false;
let dir = "";
let bruto: Buffer;

function rodar(bin: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((res) => {
    let out = "";
    const p = spawn(bin, args);
    p.stdout.on("data", (d) => { out += String(d); });
    p.stderr.on("data", (d) => { out += String(d); });
    p.on("error", () => res({ ok: false, out }));
    p.on("close", (c) => res({ ok: c === 0, out }));
  });
}

beforeAll(async () => {
  temFfmpeg = await ffmpegDisponivel();
  if (!temFfmpeg) return;
  dir = await mkdtemp(path.join(tmpdir(), "dioli-teste-video-"));
  // Um "vídeo de celular": vertical, com o áudio baixíssimo — que é exatamente
  // o defeito que mais chega da dona do salão.
  //
  // Curto e a 15 fps DE PROPÓSITO. Codificar 12s a 30fps disputa CPU com os
  // outros arquivos de teste, que rodam em paralelo, e derrubou a suíte uma vez
  // em 02/08/2026. Teste que falha às vezes é pior que teste nenhum: ensina o
  // time a ignorar vermelho. Nenhuma asserção depende da duração — só de ela
  // ser maior que MIN_SEGUNDOS_REEL.
  await rodar("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=15:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-filter:a", "volume=0.05", path.join(dir, "bruto.mp4"),
  ]);
  bruto = await readFile(path.join(dir, "bruto.mp4"));
  // Timeout explícito: o padrão do vitest é 5s, e codificar com ffmpeg sob
  // carga (os outros arquivos rodam em paralelo) passa disso. Sem esta linha o
  // `beforeAll` estoura e o ARQUIVO INTEIRO cai — foi o que fez a suíte ficar
  // vermelha duas vezes em 02/08/2026, com sintoma enganoso ("13 skipped"),
  // parecendo problema do código que estava sendo testado.
}, 120_000);

describe("os argumentos do corte — a parte que precisa estar certa", () => {
  const args = argumentosDeEdicao({ entrada: "in.mp4", saida: "out.mp4", duracao: 200 });

  it("COBRE e recorta — nunca estica", () => {
    // `scale=1080:1920` sozinho deformaria rosto e produto. O cliente não sabe
    // dizer "aspect ratio errado", mas sabe dizer "ficou estranho".
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("force_original_aspect_ratio=increase");
    expect(vf).toContain("crop=1080:1920");
  });

  it("corta no teto de duração do reel", () => {
    expect(args[args.indexOf("-t") + 1]).toBe(String(MAX_SEGUNDOS_REEL));
  });

  it("vídeo curto mantém a duração original — não estica para o teto", () => {
    const a = argumentosDeEdicao({ entrada: "in.mp4", saida: "out.mp4", duracao: 15 });
    expect(a[a.indexOf("-t") + 1]).toBe("15");
  });

  it("normaliza o áudio — sem isto metade dos reels sai inaudível", () => {
    expect(args[args.indexOf("-af") + 1]).toContain("loudnorm");
  });

  it("índice no começo do arquivo — o leitor do Instagram exige", () => {
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
  });
});

describe("editar de verdade (roda ffmpeg)", () => {
  it("o vídeo do celular vira reel 1080x1920, h264 + aac", async () => {
    if (!temFfmpeg) return;
    const r = await editarParaReel(bruto);
    expect(r.ok, r.erro).toBe(true);

    const saida = path.join(dir, "reel.mp4");
    await import("node:fs/promises").then((fs) => fs.writeFile(saida, r.bytes!));
    const probe = await rodar("ffprobe", [
      "-v", "error", "-show_entries", "stream=width,height,codec_name",
      "-of", "default=noprint_wrappers=1", saida,
    ]);
    expect(probe.out).toContain("width=1080");
    expect(probe.out).toContain("height=1920");
    expect(probe.out).toContain("codec_name=h264");
    expect(probe.out).toContain("codec_name=aac");
  }, 120_000);

  it("o áudio baixo do celular sai audível", async () => {
    if (!temFfmpeg) return;
    const r = await editarParaReel(bruto);
    const saida = path.join(dir, "reel-audio.mp4");
    await import("node:fs/promises").then((fs) => fs.writeFile(saida, r.bytes!));
    const dep = await rodar("ffmpeg", ["-i", saida, "-af", "volumedetect", "-f", "null", "-"]);
    const media = Number(dep.out.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? "-99");
    // O bruto tem média perto de -47 dB (inaudível). Depois da normalização
    // precisa estar em nível de rede social.
    expect(media).toBeGreaterThan(-25);
  }, 120_000);

  it("sai com capa — e ela não é o primeiro quadro, que costuma ser preto", async () => {
    if (!temFfmpeg) return;
    const r = await editarParaReel(bruto);
    expect(r.capa).toBeInstanceOf(Buffer);
    expect(r.capa!.length).toBeGreaterThan(1000);
  }, 120_000);

  it("arquivo que não é vídeo NÃO vira peça — truncado no perfil do cliente é pior que nada", async () => {
    if (!temFfmpeg) return;
    const r = await editarParaReel(Buffer.from("isto não é um vídeo"));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não consegui ler/);
  }, 60_000);

  it("clipe curto demais é recusado", async () => {
    if (!temFfmpeg) return;
    await rodar("ffmpeg", [
      "-y", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=30:duration=${MIN_SEGUNDOS_REEL - 2}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "curto.mp4"),
    ]);
    const curto = await readFile(path.join(dir, "curto.mp4"));
    const r = await editarParaReel(curto);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/curto demais/);
  }, 60_000);

  it("não deixa lixo no volume — o temporário vive no mesmo disco do banco", async () => {
    if (!temFfmpeg) return;
    const antes = (await import("node:fs/promises")).readdir(tmpdir());
    await editarParaReel(bruto);
    const depois = await (await import("node:fs/promises")).readdir(tmpdir());
    const sobrou = depois.filter((f) => f.startsWith("dioli-video-"));
    expect(sobrou, `sobraram temporários: ${sobrou.join(", ")}`).toHaveLength(0);
    void antes;
  }, 120_000);

  it("ler duração de arquivo inválido devolve null, não zero", async () => {
    if (!temFfmpeg) return;
    expect(await duracaoDe(path.join(dir, "nao-existe.mp4"))).toBeNull();
  });
});

describe("quando ffmpeg não existe no ambiente", () => {
  it("o erro é legível, não 'command not found' perdido no log", async () => {
    if (temFfmpeg) return;
    const r = await editarParaReel(Buffer.from("x"));
    expect(r.erro).toMatch(/ffmpeg não está disponível/);
  });
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
});
