// ─── useSpeechToText ─────────────────────────────────────────────────────────
// Client-only hook. Wraps the browser Web Speech API (SpeechRecognition /
// webkitSpeechRecognition). Safe to import in server-rendered pages — all
// window access is gated inside useEffect so SSR never crashes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";

// Minimal local interface — avoids needing SpeechRecognition in lib.dom
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent {
  readonly error: string;
}
interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionConstructor {
  new(): ISpeechRecognition;
}
type WindowWithSpeech = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface UseSpeechToTextOptions {
  onTranscript: (text: string) => void;
  lang?: string;
}

export interface UseSpeechToTextReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useSpeechToText({
  onTranscript,
  lang = "pt-BR",
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Keep onTranscript stable without adding it to the effect deps.
  // This prevents recreating the recognition object on every render.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as WindowWithSpeech;
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SR) return;

    setIsSupported(true);

    const recognition = new SR();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) {
        onTranscriptRef.current(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Permissão de microfone negada. Ative o acesso ao microfone nas configurações do navegador.");
      } else if (event.error !== "no-speech") {
        setError("Erro no reconhecimento de voz. Tente novamente.");
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, [lang]);

  const startListening = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    setError(null);
    try {
      r.start();
      setIsListening(true);
    } catch {
      // start() throws DOMException if already started — ignore
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    // onend fires and sets isListening to false
  }, []);

  return { isListening, isSupported, error, startListening, stopListening };
}
