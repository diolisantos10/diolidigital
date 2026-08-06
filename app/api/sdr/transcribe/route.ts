// POST /api/sdr/transcribe
//
// Public endpoint (no auth — called from the public /briefing page).
// Accepts a multipart audio blob and returns a Whisper transcript.
// Uses the OpenAI key from the Integrations UI or OPENAI_API_KEY env.
//
// Security: the OpenAI key stays server-side. Audio is used only within
// the request cycle and never stored.

import { NextRequest, NextResponse } from "next/server";
// O TETO SAIU DA MEMÓRIA DO PROCESSO E FOI PARA O BANCO (raio-x de 05/08/2026).
// `rateLimited` zerava em todo deploy e não atravessava réplica — numa casa em
// que vários agentes publicam por dia, isso devolvia a cota inteira ao atacante
// de graça, numa rota pública que gasta chave de IA PAGA. `limiteExcedido` conta
// no volume, é atômico e é fail-closed: contador fora do ar recusa, não libera.
import { limiteExcedido } from "@/lib/security/limite-no-banco";
import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";
import { codigoDeErroDoProvedor, classificarFalhaDoProvedor } from "@/lib/ai/transcricao";

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
const TIMEOUT_MS = 30_000;

function mimeToExt(mime: string): string {
  if (mime.includes("ogg"))  return "ogg";
  if (mime.includes("mp4"))  return "mp4";
  if (mime.includes("mpeg")) return "mpeg";
  return "webm";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const barrado = await limiteExcedido(req, "sdr-transcribe", 12, 60_000);
  if (barrado) return barrado as NextResponse;

  // Rota PÚBLICA (ver lib/ai/chave-publica.ts). A irmã do portal
  // (`/api/portal/transcricao`) resolve o workspace pelo TOKEN; aqui não há
  // token nenhum, então quem resolve é o servidor — e, na dúvida entre duas
  // agências, não gasta a de ninguém.
  const resolved = await chaveDeRotaPublica("openai");
  if (!resolved) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const audioFile = formData.get("file");
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  // Cap upload size (Whisper's own limit is 25 MB) so a huge blob can't be
  // buffered server-side or run up transcription cost.
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, reason: "file_too_large" }, { status: 413 });
  }

  const mime = audioFile.type || "audio/webm";
  const ext  = mimeToExt(mime);

  const outForm = new FormData();
  outForm.append("file", audioFile, `audio.${ext}`);
  outForm.append("model", "whisper-1");
  outForm.append("language", "pt");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
      body: outForm,
      signal: controller.signal,
    });

    if (!res.ok) {
      // ── 06/08/2026 — POR QUE O CORPO DO ERRO SAIU DAQUI ───────────────────
      // Esta linha logava `res.text()` inteiro. O corpo de erro do provedor
      // pode ecoar trechos do que foi ENVIADO — e o que foi enviado é a fala
      // de quem preencheu o briefing: nome, telefone, faturamento. Isso é PII
      // no log, e log de produção é lido por gente e por ferramenta.
      // O que fica: status + `error.code`/`error.type`, que são enum fechado
      // do provedor. Mesmo diagnóstico, sem a fala de ninguém.
      // `sem_saldo` aparece aqui como 429 + insufficient_quota — ver
      // `classificarFalhaDoProvedor` em lib/ai/transcricao.ts.
      const diag = await codigoDeErroDoProvedor(res);
      console.error(
        `[sdr/transcribe] OpenAI ${res.status}` +
          (diag ? ` · code=${diag.code ?? "-"} type=${diag.type ?? "-"}` : ""),
      );
      return NextResponse.json({
        ok: false,
        reason: "provider_error",
        motivo: classificarFalhaDoProvedor(res.status, diag),
      });
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ ok: false, reason: "empty_transcript" });
    }

    return NextResponse.json({ ok: true, text });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/transcribe] ${reason}`);
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}
