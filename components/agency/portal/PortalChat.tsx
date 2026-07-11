"use client";

// Client ↔ team conversation panel. The SAME component serves both sides:
//   - Client portal passes { token }            → posts as "client"
//   - Agency view passes  { clientRequestId }    → posts as "team" (session)
// It polls every 8s so a reply shows up without a refresh. Deliberately simple:
// no websockets, no extra deps — efficiency over machinery.

import { useState, useEffect, useRef, useCallback } from "react";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";

interface ChatMessage {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

interface PortalChatProps {
  /** Client side: portal access token. */
  token?: string;
  /** Team side: the request thread id (requires an agency session). */
  clientRequestId?: string;
  /** Optional name shown to the other side when this viewer sends. */
  authorName?: string;
  /** Visual height of the scroll area. */
  height?: number;
  /** Fill the parent (no border/radius) — used inside the floating chat drawer. */
  bare?: boolean;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PortalChat({ token, clientRequestId, authorName, height = 360, bare = false }: PortalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Voice input — record, transcribe (pt-BR), drop the text into the box. Lets
  // the client fire off a message by talking, WhatsApp-style.
  const appendTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? prev.trimEnd() + " " + text : text));
  }, []);
  const { isListening, isTranscribing, isSupported, startListening, stopListening } =
    useSpeechToText({ onTranscript: appendTranscript });

  const query = token
    ? `token=${encodeURIComponent(token)}`
    : `clientRequestId=${encodeURIComponent(clientRequestId ?? "")}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/messages?${query}`);
      if (!res.ok) {
        if (loading) setError("Não foi possível carregar a conversa.");
        return;
      }
      const data = (await res.json()) as { messages?: ChatMessage[] };
      setMessages(data.messages ?? []);
      setError(null);
    } catch {
      if (loading) setError("Não foi possível carregar a conversa.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Initial load + light polling for replies.
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    // Optimistic append.
    const optimistic: ChatMessage = {
      id: "tmp-" + Date.now(),
      authorRole: token ? "client" : "team",
      authorName: authorName ?? "",
      body: text,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, clientRequestId, body: text, authorName }),
      });
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setInput(text);
        setError("Não foi possível enviar. Tente novamente.");
      } else {
        await load();
      }
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(text);
      setError("Não foi possível enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className={`flex flex-col bg-white overflow-hidden ${bare ? "flex-1 min-h-0" : "rounded-[12px] border border-[#E5E5E2]"}`}>
      <div
        className="px-4 py-3 overflow-y-auto space-y-3"
        style={bare ? { flex: 1, minHeight: 0 } : { height }}
      >
        {loading ? (
          <p className="text-[12px] text-[#9B9B95] text-center py-8">Carregando conversa…</p>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[13px] text-[#6B6B65] font-medium">Comece a conversa</p>
            <p className="text-[11px] text-[#9B9B95] mt-1">
              Tire dúvidas, mande referências e fale direto com a equipe por aqui.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
                {!m.mine && m.authorName && (
                  <span className="text-[10px] text-[#9B9B95] mb-0.5 px-1">{m.authorName}</span>
                )}
                <div
                  className={`px-3.5 py-2 rounded-[12px] text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.mine
                      ? "bg-[#1A1A1A] text-white rounded-tr-[4px]"
                      : "bg-[#F0F0ED] text-[#1A1A1A] rounded-tl-[4px]"
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[9px] text-[#C0C0BC] mt-0.5 px-1">{timeLabel(m.createdAt)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="text-[10px] text-[#DC2626] px-4 pb-1">{error}</p>
      )}

      <div className="border-t border-[#F0F0ED] p-2.5 flex items-end gap-2">
        {isSupported && (
          <button
            type="button"
            onClick={isTranscribing ? undefined : (isListening ? stopListening : startListening)}
            disabled={isTranscribing}
            title={isListening ? "Parar gravação" : "Gravar áudio"}
            style={{ touchAction: "manipulation" }}
            className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-colors ${
              isListening ? "bg-[#DC2626] text-white animate-pulse"
              : isTranscribing ? "bg-[#F0F0ED] text-[#9B9B95]"
              : "bg-[#F0F0ED] text-[#6B6B65] hover:bg-[#E5E5E2]"}`}
          >
            {isTranscribing ? (
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[#9B9B95] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-[#9B9B95] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-[#9B9B95] animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3 8a5 5 0 0010 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M8 13v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isListening ? "Gravando… fale agora" : "Escreva ou grave um áudio…"}
          rows={1}
          className="flex-1 px-3 py-2.5 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[10px] outline-none focus:border-[#1A1A1A] focus:bg-white transition-all resize-none leading-relaxed"
          style={{ fontSize: "16px" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          title="Enviar"
          className="w-10 h-10 rounded-full bg-[#12B5AC] hover:bg-[#0E9E96] disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0"
          style={{ touchAction: "manipulation" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14.5 8L2 2.5l2.5 5.5L2 13.5 14.5 8z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
