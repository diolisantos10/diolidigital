// ─── useSpeechToText ─────────────────────────────────────────────────────────
// O microfone do BRIEFING PÚBLICO e do chat do portal. Mesma interface de
// sempre (`isListening` · `isTranscribing` · `isSupported` · `error` ·
// `startListening` · `stopListening`) — três telas dependem dela e nenhuma
// precisou mudar.
//
// ─── 06/08/2026 · O QUE MUDOU POR DENTRO ────────────────────────────────────
// Este hook já foi Web Speech, virou MediaRecorder + Whisper, e hoje é os DOIS,
// nesta ordem:
//   1. NATIVO (`lib/ai/ditado-nativo.ts`) — `SpeechRecognition` do navegador.
//      Grátis, sem chave, texto durante a fala, e o áudio NEM CHEGA ao nosso
//      servidor: a rota paga não é chamada.
//   2. ENVIO (`/api/sdr/transcribe`) — grava e manda transcrever, com provedor
//      substituível. Só para quem não tem o caminho 1.
//
// O motivo é de negócio, não de gosto: a conta do provedor ficou sem crédito e
// o microfone morreu no briefing público — a PRIMEIRA IMPRESSÃO da agência —
// para todo mundo ao mesmo tempo. Um campo de texto não pode depender de saldo.
//
// `isSupported` continua sendo DETECTADO (começa `false` e sobe no efeito, para
// não divergir do render do servidor) e agora ele também CAI: se a casa não tem
// provedor nenhum e o navegador não tem nativo, o microfone não é oferecido —
// botão que não faz nada é pior que botão ausente.
//
// PII: o texto reconhecido é fala de quem preencheu o briefing. Nunca é logado.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import {
  suportaDitadoNativo,
  assinarDitadoNativo,
  iniciarDitadoNativo,
  type SessaoDeDitadoNativo,
} from "@/lib/ai/ditado-nativo";
import { falhaDeTranscricao } from "@/lib/ai/transcricao";

interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export interface UseSpeechToTextReturn {
  isListening: boolean;
  isTranscribing: boolean;
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
  lang = "pt-BR",
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isListening,    setIsListening]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Os dois caminhos, detectados separadamente.
  const [temNativo,   setTemNativo]   = useState(false);
  const [podeGravar,  setPodeGravar]  = useState(false);
  /** null = ainda não perguntamos ao servidor. */
  const [temProvedor, setTemProvedor] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const sessaoRef        = useRef<SessaoDeDitadoNativo | null>(null);
  const onTranscriptRef  = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Detecção só no cliente (o servidor renderiza sem microfone), e o nativo
  // pode ser REBAIXADO em runtime — por isso a assinatura.
  useEffect(() => {
    const ler = () => setTemNativo(suportaDitadoNativo());
    ler();
    setPodeGravar(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    return assinarDitadoNativo(ler);
  }, []);

  // Só quem NÃO tem nativo pergunta ao servidor se o caminho 2 existe. Quem tem
  // nativo não toca no servidor nem para perguntar.
  useEffect(() => {
    if (temNativo || !podeGravar || temProvedor !== null) return;
    let vivo = true;
    void fetch("/api/sdr/transcribe")
      .then((r) => r.json() as Promise<{ disponivel?: boolean }>)
      .then((d) => { if (vivo) setTemProvedor(!!d?.disponivel); })
      // Sem resposta, assumimos que existe: o teste real é gravar. Esconder o
      // microfone por causa de um GET que falhou seria tirar o que funciona.
      .catch(() => { if (vivo) setTemProvedor(true); });
    return () => { vivo = false; };
  }, [temNativo, podeGravar, temProvedor]);

  const isSupported = temNativo || (podeGravar && temProvedor !== false);

  useEffect(() => () => {
    sessaoRef.current?.cancelar();
    sessaoRef.current = null;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.onstop = null;
      try { mr.stop(); } catch { /* já parado */ }
      mr.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const stopListening = useCallback(() => {
    if (sessaoRef.current) { sessaoRef.current.parar(); return; }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop(); // triggers onstop → upload → setIsListening(false)
    }
  }, []);

  // ─── Caminho 2: gravar e enviar ────────────────────────────────────────────
  const gravarEEnviar = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(falhaDeTranscricao("sem_permissao").mensagem);
      return;
    }

    chunksRef.current = [];
    const preferWebm = MediaRecorder.isTypeSupported("audio/webm");
    const mr = new MediaRecorder(stream, preferWebm ? { mimeType: "audio/webm" } : {});
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      setIsListening(false);
      stream.getTracks().forEach((t) => t.stop()); // apaga a luz do microfone

      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      chunksRef.current = [];
      mediaRecorderRef.current = null;
      if (blob.size < 1_000) return; // clique acidental

      setIsTranscribing(true);
      try {
        const form = new FormData();
        form.append("file", blob, `audio.${mimeToExt(mr.mimeType || "audio/webm")}`);

        const res  = await fetch("/api/sdr/transcribe", { method: "POST", body: form });
        const data = (await res.json()) as {
          ok?: boolean; text?: string; reason?: string; mensagem?: string;
        };

        if (data.ok && data.text?.trim()) {
          onTranscriptRef.current(data.text.trim());
        } else if (data.reason === "not_configured") {
          // A casa não tem provedor nenhum: o caminho 2 não existe. Some o
          // microfone em vez de oferecer de novo o que já falhou.
          setTemProvedor(false);
          setError(falhaDeTranscricao("sem_chave").mensagem);
        } else if (data.reason !== "empty_transcript") {
          // A frase vem pronta da camada — ela distingue chave recusada, conta
          // sem saldo, ritmo, áudio recusado e provedor fora do ar. Reescrever
          // aqui seria voltar a ter uma palavra só para cinco consertos.
          setError(data.mensagem ?? falhaDeTranscricao("provedor_indisponivel").mensagem);
        }
      } catch {
        setError(falhaDeTranscricao("rede").mensagem);
      } finally {
        setIsTranscribing(false);
      }
    };

    mr.start();
    setIsListening(true);
  }, []);

  const startListening = useCallback(() => {
    if (sessaoRef.current || mediaRecorderRef.current?.state === "recording") return;
    setError(null);

    // ─── Caminho 1: nativo ───────────────────────────────────────────────────
    if (suportaDitadoNativo()) {
      const sessao = iniciarDitadoNativo({
        idioma: lang,
        onFinal: (t) => onTranscriptRef.current(t),
        onFim: () => { sessaoRef.current = null; setIsListening(false); },
        onFalha: (motivo) => setError(falhaDeTranscricao(motivo).mensagem),
      });
      if (sessao) {
        sessaoRef.current = sessao;
        setIsListening(true);
        return;
      }
      // O nativo se rebaixou na largada — cai para o envio nesta mesma ação.
      setTemNativo(false);
    }

    if (!podeGravar) {
      setError(falhaDeTranscricao("sem_suporte").mensagem);
      return;
    }
    void gravarEEnviar();
  }, [lang, podeGravar, gravarEEnviar]);

  return { isListening, isTranscribing, isSupported, error, startListening, stopListening };
}
