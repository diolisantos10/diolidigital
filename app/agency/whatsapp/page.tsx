"use client";

// WhatsApp single-inbox — read client conversations and reply, all from inside
// the system using ONE number. Talks to /api/meta/whatsapp/messages.

import { useCallback, useEffect, useRef, useState } from "react";

interface Thread {
  contactWaId: string;
  contactName: string | null;
  lastBody: string;
  lastDirection: string;
  lastAt: string;
}
interface Message {
  id: string;
  direction: string;
  body: string;
  type: string;
  status: string | null;
  at: string;
}

const ACCENT = "#25D366"; // WhatsApp green

export default function WhatsAppInboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/whatsapp/messages");
      const data = (await res.json()) as { threads?: Thread[] };
      setThreads(data.threads ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadMessages = useCallback(async (contact: string) => {
    try {
      const res = await fetch(`/api/meta/whatsapp/messages?contact=${encodeURIComponent(contact)}`);
      const data = (await res.json()) as { messages?: Message[] };
      setMessages(data.messages ?? []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => {
    if (!active) return;
    void loadMessages(active);
    const t = setInterval(() => void loadMessages(active), 8000);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  async function handleSend() {
    if (!active || !reply.trim()) return;
    setSending(true); setErr(null);
    try {
      const res = await fetch("/api/meta/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactWaId: active, text: reply.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) { setErr(data.error ?? "Falha ao enviar"); }
      else { setReply(""); await loadMessages(active); await loadThreads(); }
    } catch { setErr("Erro de rede"); }
    finally { setSending(false); }
  }

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">WhatsApp — Caixa de Entrada</h1>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Um número só. Converse com os clientes por aqui.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 h-[70vh] min-h-[420px]">
        {/* Threads */}
        <div className={`border border-[var(--border)] rounded-[10px] bg-white overflow-y-auto ${active ? "hidden md:block" : ""}`}>
          {threads.length === 0 ? (
            <div className="p-4 text-[12px] text-[var(--text-muted)]">Nenhuma conversa ainda.</div>
          ) : threads.map((t) => (
            <button
              key={t.contactWaId}
              onClick={() => setActive(t.contactWaId)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--accent)] hover:bg-[var(--bg-elevated)] ${active === t.contactWaId ? "bg-[#F0FDF4]" : ""}`}
            >
              <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{t.contactName || t.contactWaId}</div>
              <div className="text-[11px] text-[var(--text-secondary)] truncate">{t.lastDirection === "out" ? "Você: " : ""}{t.lastBody}</div>
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className={`border border-[var(--border)] rounded-[10px] bg-white flex flex-col ${active ? "" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--text-muted)]">Selecione uma conversa</div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
                <button onClick={() => setActive(null)} className="md:hidden text-[var(--text-secondary)] text-[16px]">←</button>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {threads.find((t) => t.contactWaId === active)?.contactName || active}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[var(--bg-elevated)]">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-[10px] text-[13px] ${
                      m.direction === "out" ? "bg-[#DCF8C6] text-[var(--text-primary)]" : "bg-white border border-[var(--border)] text-[var(--text-primary)]"
                    }`}>
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className="text-[9px] text-[var(--text-muted)] mt-1 text-right">
                        {new Date(m.at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                        {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {err && <div className="px-4 py-1.5 text-[11px] text-[#DC2626] bg-[#FFF5F5]">{err}</div>}
              <div className="p-3 border-t border-[var(--border)] flex items-center gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="Escreva uma resposta…"
                  className="flex-1 border border-[var(--border)] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as string]: `${ACCENT}40` }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 text-white text-[13px] font-semibold rounded-[8px] disabled:opacity-40"
                  style={{ backgroundColor: ACCENT }}
                >
                  {sending ? "…" : "Enviar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] mt-3">
        Respostas livres só valem dentro de 24h após a última mensagem do cliente (regra da Meta). Fora disso, use um template.
      </p>
    </div>
  );
}
