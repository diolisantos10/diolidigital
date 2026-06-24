// ─── useSpeechToText ─────────────────────────────────────────────────────────
// Records audio via MediaRecorder, sends it to /api/sdr/transcribe (Whisper),
// and delivers the Portuguese transcript via onTranscript.
//
// Drop-in replacement for the old Web Speech API hook — same interface.
// Safe to import in server-rendered pages; all browser API access is gated
// inside useEffect / async callbacks.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
  lang?: string; // kept for interface compatibility; Whisper always uses pt
}

export interface UseSpeechToTextReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

function mimeToExt(mime: string): string {
  if (mime.includes("ogg"))  return "ogg";
  if (mime.includes("mp4"))  return "mp4";
  if (mime.includes("mpeg")) return "mpeg";
  return "webm";
}

export function useSpeechToText({
  onTranscript,
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isListening,  setIsListening]  = useState(false);
  const [isSupported,  setIsSupported]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const onTranscriptRef  = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia) {
      setIsSupported(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop(); // triggers onstop → upload → setIsListening(false)
    }
  }, []);

  const startListening = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") return;

    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Permissão de microfone negada. Ative o acesso ao microfone nas configurações do navegador.");
      return;
    }

    chunksRef.current = [];

    // Prefer webm (Chrome, Edge); fall back to browser default (Firefox → ogg)
    const preferWebm = MediaRecorder.isTypeSupported("audio/webm");
    const mr = new MediaRecorder(stream, preferWebm ? { mimeType: "audio/webm" } : {});
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      // Release mic indicator immediately
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      chunksRef.current = [];

      // Skip clips too short to produce a useful transcript
      if (blob.size < 1_000) {
        setIsListening(false);
        return;
      }

      try {
        const ext  = mimeToExt(mr.mimeType || "audio/webm");
        const form = new FormData();
        form.append("file", blob, `audio.${ext}`);

        const res = await fetch("/api/sdr/transcribe", { method: "POST", body: form });
        if (!res.ok) throw new Error("http_error");

        const data = (await res.json()) as { ok?: boolean; text?: string; reason?: string };

        if (data.ok && data.text?.trim()) {
          onTranscriptRef.current(data.text.trim());
        } else if (data.reason === "not_configured") {
          setError("Transcrição por voz não configurada. Adicione a chave OpenAI nas Integrações.");
        } else if (data.reason !== "empty_transcript") {
          setError("Não consegui transcrever o áudio. Tente novamente.");
        }
      } catch {
        setError("Erro ao enviar o áudio. Verifique a conexão e tente novamente.");
      } finally {
        setIsListening(false);
      }
    };

    mr.start();
    setIsListening(true);
  }, []);

  return { isListening, isSupported, error, startListening, stopListening };
}
