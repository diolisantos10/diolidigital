// /api/sdr/transcribe — o CAMINHO 2 do ditado no briefing público.
//
// Rota pública (sem login — chamada de `/briefing`). Recebe um blob de áudio e
// devolve o texto. É a REDE, não a rua principal: desde 06/08/2026 o navegador
// tenta primeiro o reconhecimento NATIVO (`lib/ai/ditado-nativo.ts`), que é
// grátis e nem manda o áudio para cá. Só quem não tem nativo chega aqui.
//
// Provedor é substituível (openai · groq · gemini) — ver
// `lib/ai/transcricao-servidor.ts`. GET responde se algum existe.
//
// Segurança: a chave nunca sai do servidor. O áudio vive só dentro do ciclo da
// requisição — não vai para disco, banco nem log; o texto nunca é logado.

import { NextRequest, NextResponse } from "next/server";
// O TETO SAIU DA MEMÓRIA DO PROCESSO E FOI PARA O BANCO (raio-x de 05/08/2026).
// `rateLimited` zerava em todo deploy e não atravessava réplica — numa casa em
// que vários agentes publicam por dia, isso devolvia a cota inteira ao atacante
// de graça, numa rota pública que gasta chave de IA PAGA. `limiteExcedido` conta
// no volume, é atômico e é fail-closed: contador fora do ar recusa, não libera.
import { limiteExcedido } from "@/lib/security/limite-no-banco";
import { transcreverPelaCasa, ditadoPorEnvioDisponivel } from "@/lib/ai/transcricao-servidor";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * GET — "existe transcrição por envio nesta casa?"
 *
 * Só um booleano, e ele existe para a tela NÃO FINGIR: o briefing público é a
 * primeira impressão da agência, e um microfone que grava meio minuto para
 * depois dizer "não configurado" é pior que microfone nenhum. Em 06/08/2026 o
 * caminho principal virou o reconhecimento NATIVO do navegador (grátis, sem
 * chave) — este GET só é perguntado por quem não tem nativo.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const barrado = await limiteExcedido(req, "sdr-transcribe-status", 60, 60_000);
  if (barrado) return barrado as NextResponse;
  const disponivel = await ditadoPorEnvioDisponivel({ tipo: "publico" });
  return NextResponse.json({ ok: true, disponivel });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const barrado = await limiteExcedido(req, "sdr-transcribe", 12, 60_000);
  if (barrado) return barrado as NextResponse;

  // "Existe para onde mandar?" vem ANTES de ler o corpo, por dois motivos: não
  // se bufferiza megabyte de áudio para descobrir no fim que não havia provedor
  // nenhum; e a ordem "teto → chave" é a que o teste de rotas pagas trava —
  // barrado pelo teto NUNCA chega a resolver chave.
  if (!(await ditadoPorEnvioDisponivel({ tipo: "publico" }))) {
    return NextResponse.json({ ok: false, reason: "not_configured", motivo: "sem_chave" });
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
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ ok: false, reason: "file_too_large" }, { status: 413 });
  }

  // ── 06/08/2026 — O PROVEDOR SAIU DAQUI ──────────────────────────────────────
  // Esta rota falava direto com `api.openai.com`. Com a conta sem crédito, o
  // microfone do briefing público — a PRIMEIRA IMPRESSÃO da agência — morria
  // junto. Agora quem escolhe é `transcreverPelaCasa`, que tenta em cadeia os
  // provedores configurados (openai · groq · gemini) resolvidos por
  // `chaveDeRotaPublica` (rota pública nunca gasta a chave de um inquilino
  // escolhido por acaso). Nenhum configurado = `sem_chave`, e a tela diz isso.
  //
  // O log continua sem PII: quem loga é a camada, com status + enum do
  // provedor, nunca `error.message` nem o corpo.
  const { resultado, provedor } = await transcreverPelaCasa({
    arquivo: audioFile,
    escopo: { tipo: "publico" },
  });

  if (resultado.ok) return NextResponse.json({ ok: true, text: resultado.texto });

  if (resultado.motivo === "sem_chave") {
    return NextResponse.json({ ok: false, reason: "not_configured", motivo: "sem_chave" });
  }
  if (resultado.motivo === "sem_texto") {
    return NextResponse.json({ ok: false, reason: "empty_transcript", motivo: "sem_texto" });
  }

  console.error(`[sdr/transcribe] ${provedor ?? "-"} → ${resultado.motivo}`);
  return NextResponse.json({
    ok: false,
    reason: "provider_error",
    motivo: resultado.motivo,
    // A frase já vem em português da camada — a tela não precisa reinventar.
    mensagem: resultado.mensagem,
  });
}
