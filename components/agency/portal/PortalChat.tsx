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
  /** Team side: when set, shows an "✨ Sugerir mensagem" button that drafts a
   *  reply with AI, biased by this situation hint (e.g. "escopo aprovado"). */
  suggestContext?: string;
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

// Render message text with clickable links (attachments arrive as shared URLs).
function LinkifiedBody({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer"
             className={`underline break-all ${mine ? "text-[var(--cyan)]" : "text-[#12B5AC]"}`}>
            {p.length > 42 ? p.slice(0, 42) + "…" : p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function PortalChat({ token, clientRequestId, suggestContext, authorName, height = 360, bare = false }: PortalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Team side only: draft a message with AI, drop it in the box for review.
  const isTeam = !token && !!clientRequestId;
  async function suggestMessage() {
    if (suggesting || !clientRequestId) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/messages/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId, context: suggestContext ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ? `IA: ${data.error}` : "Não foi possível sugerir a mensagem.");
        return;
      }
      if (data.message) setInput(data.message);
    } catch {
      setError("Falha ao sugerir. Tente de novo.");
    } finally {
      setSuggesting(false);
    }
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!url) return;
    const withProto = /^https?:\/\//.test(url) ? url : `https://${url}`;
    setInput((prev) => (prev ? prev.trimEnd() + " " + withProto : withProto));
    setLinkDraft("");
    setAttachOpen(false);
  }

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
    <div className={`flex flex-col bg-white overflow-hidden ${bare ? "flex-1 min-h-0" : "rounded-[12px] border border-[var(--border)]"}`}>
      <div
        className="px-4 py-3 overflow-y-auto space-y-3"
        style={bare ? { flex: 1, minHeight: 0 } : { height }}
      >
        {loading ? (
          <p className="text-[12px] text-[var(--text-muted)] text-center py-8">Carregando conversa…</p>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[13px] text-[var(--text-secondary)] font-medium">Comece a conversa</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Tire dúvidas, mande referências e fale direto com a equipe por aqui.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
                {!m.mine && m.authorName && (
                  <span className="text-[10px] text-[var(--text-muted)] mb-0.5 px-1">{m.authorName}</span>
                )}
                <div
                  className={`px-3.5 py-2 rounded-[12px] text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.mine
                      ? "bg-[var(--text-primary)] text-white rounded-tr-[4px]"
                      : "bg-[var(--accent)] text-[var(--text-primary)] rounded-tl-[4px]"
                  }`}
                >
                  <LinkifiedBody text={m.body} mine={m.mine} />
                </div>
                <span className="text-[9px] text-[var(--text-subtle)] mt-0.5 px-1">{timeLabel(m.createdAt)}</span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="text-[10px] text-[var(--danger)] px-4 pb-1">{error}</p>
      )}

      {/* Attach a link (Drive, WeTransfer, image URL…) — reliable without file storage */}
      {attachOpen && (
        <div className="border-t border-[var(--border)] px-2.5 pt-2.5 flex gap-2 items-center">
          <input
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            placeholder="Cole um link (Drive, WeTransfer, imagem…)"
            autoFocus
            className="flex-1 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] text-[13px]"
            style={{ fontSize: "16px" }}
          />
          <button onClick={addLink} disabled={!linkDraft.trim()} className="h-9 px-3 rounded-[8px] bg-[#12B5AC] disabled:opacity-40 text-white text-[12px] font-semibold shrink-0">Anexar</button>
          <button onClick={() => { setAttachOpen(false); setLinkDraft(""); }} className="h-9 px-2 text-[var(--text-muted)] text-[12px] shrink-0">✕</button>
        </div>
      )}

      {/* Team side: AI drafts the message; PM reviews, tweaks and sends. */}
      {isTeam && (
        <div className="border-t border-[var(--border)] px-2.5 pt-2 -mb-1 flex items-center">
          <button
            type="button"
            onClick={suggestMessage}
            disabled={suggesting}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "#E6FBFA", color: "#0E7C75" }}
            title="A IA escreve a mensagem pra você — é só revisar e enviar"
          >
            {suggesting ? "Escrevendo…" : "✨ Sugerir mensagem"}
          </button>
        </div>
      )}

      <div className="border-t border-[var(--border)] p-2.5 flex items-end gap-2">
        <button
          type="button"
          onClick={() => setAttachOpen((v) => !v)}
          title="Anexar link / material"
          style={{ touchAction: "manipulation" }}
          className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-colors ${attachOpen ? "bg-[var(--accent-light)] text-[#0E9E96]" : "bg-[var(--accent)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path d="M13 7l-5.5 5.5a2 2 0 002.83 2.83L16 9.66a3.5 3.5 0 00-4.95-4.95L5.4 10.3a5 5 0 007.07 7.07L17 12.83" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {isSupported && (
          <button
            type="button"
            onClick={isTranscribing ? undefined : (isListening ? stopListening : startListening)}
            disabled={isTranscribing}
            title={isListening ? "Parar gravação" : "Gravar áudio"}
            style={{ touchAction: "manipulation" }}
            className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-colors ${
              isListening ? "bg-[var(--danger)] text-white animate-pulse"
              : isTranscribing ? "bg-[var(--accent)] text-[var(--text-muted)]"
              : "bg-[var(--accent)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}
          >
            {isTranscribing ? (
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
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
          className="flex-1 px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all resize-none leading-relaxed"
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
