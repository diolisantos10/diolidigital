"use client";

// ── Conexões do cliente — aba "Conexões" do portal ──────────────────────────
// O parceiro conecta o Facebook/Instagram DELE por aqui, autenticado só pelo
// token do portal (modelo de parceria, 03/08/2026). O popup abre
// /api/meta/connect-parceiro?token=…, o callback grava as contas e avisa por
// postMessage — aí a lista recarrega sozinha.

import { useCallback, useEffect, useState } from "react";

interface AtivoView {
  tipo: "ad_account" | "page" | "instagram" | "whatsapp";
  externalId: string;
  nome: string;
  autorizado: boolean;
}

const TIPO_LABEL: Record<string, string> = {
  page: "Página do Facebook",
  instagram: "Instagram",
  ad_account: "Conta de anúncios",
  whatsapp: "WhatsApp",
};

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
  const [ativos, setAtivos] = useState<AtivoView[]>([]);
  const [semConexao, setSemConexao] = useState(true);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [lacunas, setLacunas] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setError(null);
      // A4: sem token na mão (URL limpa), o cookie httpOnly autentica sozinho.
      const res = await fetch(token ? `/api/portal/conexoes?token=${encodeURIComponent(token)}` : "/api/portal/conexoes");
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

  // ── A ESCOLHA DO CLIENTE (06/08/2026) ───────────────────────────────────
  // O que a Meta ALCANÇA não é o que a Dioli PODE LER. Esta lista mostra o
  // primeiro conjunto e deixa o dono do negócio marcar o segundo. Enquanto ele
  // não marcar, a agência não lê nada — e a tela diz isso.
  const carregarAtivos = useCallback(async () => {
    try {
      const res = await fetch(token ? `/api/portal/meta-ativos?token=${encodeURIComponent(token)}` : "/api/portal/meta-ativos");
      if (!res.ok) return;
      const json = await res.json();
      const lista: AtivoView[] = Array.isArray(json.ativos) ? json.ativos : [];
      setAtivos(lista);
      setSemConexao(Boolean(json.semConexao));
      setLacunas(Array.isArray(json.lacunas) ? json.lacunas : []);
      setMarcados(new Set(lista.filter((a) => a.autorizado).map((a) => `${a.tipo}:${a.externalId}`)));
    } catch { /* a seção some; a lista de conexões continua de pé */ }
  }, [token]);

  useEffect(() => { void load(); void carregarAtivos(); }, [load, carregarAtivos]);

  async function salvarEscolha() {
    setSalvando(true);
    try {
      const escolhidos = ativos.filter((a) => marcados.has(`${a.tipo}:${a.externalId}`));
      const q = token ? `?token=${encodeURIComponent(token)}` : "";
      await fetch(`/api/portal/meta-ativos${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativos: escolhidos.map((a) => ({ tipo: a.tipo, externalId: a.externalId })) }),
      });
      // Revogar o que foi desmarcado: desmarcar tem que APAGAR a conexão, não
      // só sumir com o visto.
      for (const a of ativos) {
        if (a.autorizado && !marcados.has(`${a.tipo}:${a.externalId}`)) {
          await fetch(`/api/portal/meta-ativos${q ? q + "&" : "?"}tipo=${a.tipo}&externalId=${encodeURIComponent(a.externalId)}`, { method: "DELETE" });
        }
      }
      setPopupMsg({ ok: true, text: "Pronto. A Dioli passa a acessar só o que você marcou." });
      await carregarAtivos();
      await load();
    } finally {
      setSalvando(false);
    }
  }

  // O popup do OAuth termina num postMessage do callback — sucesso ou erro.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; summary?: string; error?: string };
      if (data?.type === "meta_auth_success") {
        setPopupMsg({ ok: true, text: data.summary || "Conta conectada." });
        void load();
        void carregarAtivos();
      } else if (data?.type === "meta_auth_escolher") {
        // Não é sucesso: o acesso existe e NADA foi liberado ainda.
        setPopupMsg({ ok: false, text: data.summary || "Escolha abaixo quais contas a Dioli pode acessar." });
        void carregarAtivos();
      } else if (data?.type === "meta_auth_error") {
        setPopupMsg({ ok: false, text: `A Meta recusou a conexão: ${data.error || "erro desconhecido"}.` });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load, carregarAtivos]);

  function abrirPopup() {
    setPopupMsg(null);
    // Em modo cookie (A4) o navegador não conhece o token — a ponte
    // /api/portal/conectar-meta lê o cookie e repassa ao fluxo OAuth existente.
    const url = token
      ? `/api/meta/connect-parceiro?token=${encodeURIComponent(token)}`
      : "/api/portal/conectar-meta";
    const janela = window.open(url, "meta_oauth", "width=620,height=760,menubar=no,toolbar=no");

    // O NAVEGADOR BLOQUEOU O POPUP. Sem isto, o clique não fazia nada e a tela
    // ficava igual — indistinguível de "o sistema não funciona".
    if (!janela) {
      setPopupMsg({
        ok: false,
        text: "Seu navegador bloqueou a janela de conexão. Libere os pop-ups deste site e tente de novo.",
      });
      return;
    }

    // A JANELA FECHADA NO MEIO NÃO AVISA NINGUÉM. Fechar o popup (ou desistir
    // na tela da Meta) não dispara postMessage nenhum, e a aba ficava esperando
    // para sempre. Silêncio de fluxo interrompido é indistinguível de silêncio
    // de sistema quebrado — e foi o que o CEO viu ao testar em 05/08/2026.
    const relogio = setInterval(() => {
      if (!janela.closed) return;
      clearInterval(relogio);
      // Recarrega antes de julgar: se a conexão entrou, a lista prova, e aí não
      // existe erro nenhum para mostrar.
      void load().then(() => {
        setPopupMsg((atual) =>
          atual ?? {
            ok: false,
            text: "A janela foi fechada antes de terminar. Nada foi alterado na sua conta — pode tentar de novo.",
          },
        );
      });
    }, 700);
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

      {/* ── O QUE A DIOLI PODE ACESSAR — a escolha é do cliente ────────────── */}
      {!semConexao && (
        <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            O que a Dioli pode acessar
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)] leading-snug">
            Seu login na Meta alcança tudo o que você administra. Marque abaixo
            só o que é do seu negócio — a Dioli não acessa nada que você não
            marcar, e você pode desmarcar quando quiser.
          </p>

          {ativos.length === 0 ? (
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">
              Nenhuma conta encontrada neste acesso.
            </p>
          ) : (
            <>
              {marcados.size === 0 && (
                <div className="mt-3 rounded-[10px] border border-[#FCE7A0] bg-[#FFFBEB] px-3 py-2">
                  <p className="text-[12px] font-semibold text-[#9B7B2D]">
                    Falta autorizar quais contas.
                  </p>
                  <p className="text-[11.5px] text-[#9B7B2D] leading-snug">
                    Enquanto nada estiver marcado, a Dioli não lê nenhuma conta sua.
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {ativos.map((a) => {
                  const chave = `${a.tipo}:${a.externalId}`;
                  const on = marcados.has(chave);
                  return (
                    <label
                      key={chave}
                      className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2.5 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const proximo = new Set(marcados);
                          if (on) proximo.delete(chave); else proximo.add(chave);
                          setMarcados(proximo);
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#070A1F]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-[var(--text-primary)] truncate">
                          {a.nome}
                        </span>
                        <span className="block text-[11px] text-[var(--text-subtle)]">
                          {TIPO_LABEL[a.tipo] ?? a.tipo} · {a.externalId}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={() => void salvarEscolha()}
                disabled={salvando}
                style={{ touchAction: "manipulation" }}
                className="mt-3 h-10 w-full sm:w-auto px-4 rounded-[9px] bg-[#070A1F] text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {salvando ? "Salvando…" : "Salvar o que a Dioli pode acessar"}
              </button>
            </>
          )}

          {lacunas.length > 0 && (
            <ul className="mt-3 space-y-1">
              {lacunas.map((l, i) => (
                <li key={i} className="text-[11.5px] text-[var(--text-muted)] leading-snug">• {l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Lista de conexões */}
      {loading ? (
        <div className="bg-white rounded-[14px] border border-[var(--border)] p-6 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">Carregando suas conexões…</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-[14px] border border-[#FCA5A5] p-5">
          <p className="text-[13px] font-semibold text-[var(--danger)]">Erro ao carregar</p>
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
