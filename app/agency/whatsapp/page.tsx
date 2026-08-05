"use client";

// WhatsApp single-inbox — read client conversations and reply, all from inside
// the system using ONE number. Talks to /api/meta/whatsapp/messages.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";

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
  // A tela entrou no menu — e tela do menu precisa dos tres estados (§7). Antes
  // o `catch` engolia a falha em silencio: sem conversas e API fora do ar
  // ficavam com a MESMA cara.
  const [carregando, setCarregando] = useState(true);
  const [erroDeCarga, setErroDeCarga] = useState<ErroHumano | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/meta/whatsapp/messages");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { threads?: Thread[] };
      setThreads(data.threads ?? []);
      setErroDeCarga(null);
    } catch (e) {
      setErroDeCarga(mensagemDeErro(e, "carregar as conversas do WhatsApp"));
    } finally {
      setCarregando(false);
    }
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
      if (!data.ok) { setErr(mensagemDeErro(data.error ?? `HTTP ${res.status}`, "enviar sua mensagem").mensagem); }
      else { setReply(""); await loadMessages(active); await loadThreads(); }
    } catch (e) { setErr(mensagemDeErro(e, "enviar sua mensagem").mensagem); }
    finally { setSending(false); }
  }

  return (
    <>
      <AgencyHeader
        title="WhatsApp"
        eyebrow="Clientes"
        subtitle="Um número só. Leia e responda os clientes sem sair do sistema."
      />

      {erroDeCarga && (
        <div role="alert" className="mb-4 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-4 py-3">
          <p className="text-[13px] text-[#991B1B]">{erroDeCarga.mensagem}</p>
          {erroDeCarga.detalhe && (
            <p className="text-[11px] text-[#991B1B]/70 mt-1 break-words">Detalhe técnico: {erroDeCarga.detalhe}</p>
          )}
          <button
            onClick={() => { setCarregando(true); void loadThreads(); }}
            className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[#991B1B] hover:bg-white/60 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erroDeCarga && threads.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden className="text-[20px]">💬</span>}
          title="Nenhuma conversa ainda"
          description="As mensagens que os clientes mandarem para o número da agência aparecem aqui."
          action={
            <Link
              href="/agency/integrations"
              className="inline-flex h-9 px-4 items-center rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-semibold"
            >
              Conferir a conexão do WhatsApp
            </Link>
          }
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 h-[70vh] min-h-[420px]">
        {/* Threads */}
        <div className={`border border-[var(--border)] rounded-[10px] bg-white overflow-y-auto ${active ? "hidden md:block" : ""}`}>
          {carregando ? (
            <div className="p-3 space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-[8px] bg-[var(--accent)] animate-pulse" />
              ))}
            </div>
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
                      <div className="text-[11px] text-[var(--text-muted)] mt-1 text-right">
                        {new Date(m.at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                        {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {err && <div role="alert" className="px-4 py-2 text-[12px] text-[var(--danger)] bg-[var(--danger-bg)]">{err}</div>}
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
      )}

      <p className="text-[12px] text-[var(--text-muted)] mt-3">
        Respostas livres só valem dentro de 24h após a última mensagem do cliente (regra da Meta). Fora disso, use um template.
      </p>
    </>
  );
}
