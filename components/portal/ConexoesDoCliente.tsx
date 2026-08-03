"use client";

// ── Conexões do cliente — aba "Conexões" do portal ──────────────────────────
// O parceiro conecta o Facebook/Instagram DELE por aqui, autenticado só pelo
// token do portal (modelo de parceria, 03/08/2026). O popup abre
// /api/meta/connect-parceiro?token=…, o callback grava as contas e avisa por
// postMessage — aí a lista recarrega sozinha.

import { useCallback, useEffect, useState } from "react";

interface ConexaoView {
  id: string;
  platform: string;
  name: string;
  status: string;
  connectedAt: string;
}

const PLATFORM_LABEL: Record<string, { label: string; color: string; initials: string }> = {
  facebook:  { label: "Facebook",  color: "#1877F2", initials: "FB" },
  instagram: { label: "Instagram", color: "#E1306C", initials: "IG" },
  whatsapp:  { label: "WhatsApp",  color: "#25D366", initials: "WA" },
};

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  connected: { label: "Conectada", bg: "#DCFCE7", fg: "#16A34A" },
  expired:   { label: "Expirada",  bg: "#FEF3C7", fg: "#9B7B2D" },
  revoked:   { label: "Revogada",  bg: "#FEE2E2", fg: "#DC2626" },
  error:     { label: "Com erro",  bg: "#FEE2E2", fg: "#DC2626" },
};

export function ConexoesDoCliente({ token }: { token: string }) {
  const [conexoes, setConexoes] = useState<ConexaoView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupMsg, setPopupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/portal/conexoes?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setError("Não foi possível carregar suas conexões. Tente novamente em instantes.");
        return;
      }
      const json = await res.json();
      setConexoes(Array.isArray(json.conexoes) ? json.conexoes : []);
    } catch {
      setError("Não foi possível carregar suas conexões. Verifique sua internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // O popup do OAuth termina num postMessage do callback — sucesso ou erro.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; summary?: string; error?: string };
      if (data?.type === "meta_auth_success") {
        setPopupMsg({ ok: true, text: data.summary || "Conta conectada." });
        void load();
      } else if (data?.type === "meta_auth_error") {
        setPopupMsg({ ok: false, text: `A Meta recusou a conexão: ${data.error || "erro desconhecido"}.` });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  function abrirPopup() {
    setPopupMsg(null);
    const url = `/api/meta/connect-parceiro?token=${encodeURIComponent(token)}`;
    window.open(url, "meta_oauth", "width=620,height=760,menubar=no,toolbar=no");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Conexões</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
          Conecte o Facebook e o Instagram do seu negócio para a Dioli publicar e
          trazer seus resultados direto para este portal. Você controla o acesso e
          pode revogar quando quiser.
        </p>
      </div>

      {/* Ação principal */}
      <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-[12px] font-bold shrink-0" style={{ background: "#1877F2" }}>f</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">Facebook / Instagram</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-snug">
              Login seguro direto na Meta — a Dioli nunca vê sua senha.
            </p>
            <button
              onClick={abrirPopup}
              style={{ touchAction: "manipulation" }}
              className="mt-3 h-10 px-4 rounded-[9px] bg-[#070A1F] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Conectar Facebook/Instagram
            </button>
          </div>
        </div>
      </div>

      {/* Resultado do popup (sucesso/erro) */}
      {popupMsg && (
        <div
          className={`rounded-[12px] border px-4 py-3 text-[12.5px] leading-snug ${
            popupMsg.ok
              ? "bg-[#DCFCE7] border-[#86EFAC] text-[#166534]"
              : "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
          }`}
        >
          {popupMsg.text}
        </div>
      )}

      {/* Lista de conexões */}
      {loading ? (
        <div className="bg-white rounded-[14px] border border-[var(--border)] p-6 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">Carregando suas conexões…</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-[14px] border border-[#FCA5A5] p-5">
          <p className="text-[13px] font-semibold text-[#DC2626]">Erro ao carregar</p>
          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{error}</p>
          <button
            onClick={() => { setLoading(true); void load(); }}
            className="mt-3 h-8 px-3.5 rounded-[8px] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-semibold hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      ) : conexoes.length === 0 ? (
        <div className="bg-white rounded-[14px] border border-[var(--border)] p-8 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--bg-elevated)] text-[var(--text-subtle)] text-xl flex items-center justify-center mx-auto mb-3">⇄</div>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Nenhuma conta conectada</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            Conecte o Facebook/Instagram do seu negócio no botão acima para começar.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {conexoes.map((c) => {
            const p = PLATFORM_LABEL[c.platform] ?? { label: c.platform, color: "#6B6B65", initials: c.platform.slice(0, 2).toUpperCase() };
            const s = STATUS_BADGE[c.status] ?? { label: c.status, bg: "#F0EFEB", fg: "#6B6B65" };
            return (
              <div key={c.id} className="bg-white rounded-[12px] border border-[var(--border)] px-4 py-3 flex items-center gap-3 shadow-[0_1px_2px_rgba(7,10,31,0.03)]">
                <span className="w-9 h-9 rounded-[9px] flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: p.color }}>{p.initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{c.name || p.label}</p>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    {p.label} · desde {new Date(c.connectedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="h-6 px-2.5 rounded-full text-[10px] font-bold flex items-center shrink-0" style={{ background: s.bg, color: s.fg }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Aviso honesto — o app pode estar aguardando liberação da Meta */}
      <div className="bg-[#FFFBEB] border border-[#FCE7A0] rounded-[12px] px-4 py-3">
        <p className="text-[12px] text-[#9B7B2D] leading-snug">
          <span className="font-semibold">Se o login da Meta recusar, avise a agência</span> — a
          liberação do app pela Meta pode estar pendente. Não é um problema da sua conta.
        </p>
      </div>
    </div>
  );
}
