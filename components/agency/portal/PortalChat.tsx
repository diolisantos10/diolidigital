"use client";

// Client ↔ team conversation panel. The SAME component serves both sides:
//   - Client portal passes { token }            → posts as "client"
//   - Agency view passes  { clientRequestId }    → posts as "team" (session)
// It polls every 8s so a reply shows up without a refresh. Deliberately simple:
// no websockets, no extra deps — efficiency over machinery.

import { useState, useEffect, useRef, useCallback } from "react";

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
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function PortalChat({ token, clientRequestId, authorName, height = 360 }: PortalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col rounded-[12px] border border-[#E5E5E2] bg-white overflow-hidden">
      <div
        className="px-4 py-3 overflow-y-auto space-y-3"
        style={{ height }}
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

      <div className="border-t border-[#F0F0ED] p-2.5 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva uma mensagem…"
          rows={1}
          className="flex-1 px-3 py-2 bg-[#F7F7F6] border border-[#E5E5E2] rounded-[8px] outline-none focus:border-[#1A1A1A] focus:bg-white transition-all resize-none leading-relaxed"
          style={{ fontSize: "16px" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="px-4 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors shrink-0"
          style={{ touchAction: "manipulation" }}
        >
          {sending ? "…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
