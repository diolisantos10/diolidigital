"use client";

// MetaConnectManager — connect Instagram / Facebook / WhatsApp via the "Dioli
// Digital" Meta app. Two steps for a non-technical operator:
//   1. Paste the App ID + App Secret (from developers.facebook.com), save.
//   2. Click "Conectar conta Meta" → a popup opens Facebook Login → the
//      connected Pages / Instagram accounts appear below.
// Mirrors components/agency/AiKeyManager.tsx.

import { useCallback, useEffect, useState } from "react";

interface ConfigStatus {
  configured: boolean;
  source: "ui" | "env" | null;
  appId: string | null;
  secretHint: string | null;
  lastConfiguredAt: string | null;
}

interface Connection {
  id: string;
  platform: "instagram" | "facebook" | "whatsapp";
  name: string;
  externalId: string;
  status: string;
  tokenHint: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

const PLATFORM_META: Record<Connection["platform"], { emoji: string; label: string }> = {
  instagram: { emoji: "📸", label: "Instagram" },
  facebook: { emoji: "📘", label: "Facebook" },
  whatsapp: { emoji: "💬", label: "WhatsApp" },
};

const ACCENT = "#1877F2"; // Meta blue

export default function MetaConnectManager() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cfgRes, connRes] = await Promise.all([
        fetch("/api/meta/config"),
        fetch("/api/meta/connections"),
      ]);
      setConfig((await cfgRes.json()) as ConfigStatus);
      const connData = (await connRes.json()) as { connections?: Connection[] };
      setConnections(connData.connections ?? []);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white border border-[var(--border)] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Meta — Instagram · Facebook · WhatsApp</h2>
          <span className="text-[10px] bg-[var(--success-bg)] text-[var(--success)] px-2 py-0.5 rounded font-bold">TOKENS CRIPTOGRAFADOS</span>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          Conecte as contas da agência e dos clientes. As credenciais e tokens são guardados com segurança (criptografados) e usados para publicar e ler métricas.
        </p>
      </div>

      <div className="px-5 py-4 space-y-5">
        <AppCredentialsRow config={config} loading={loading} onChanged={load} />
        <ConnectionsSection
          config={config}
          connections={connections}
          loading={loading}
          onChanged={load}
        />
      </div>
    </div>
  );
}

function AppCredentialsRow({
  config,
  loading,
  onChanged,
}: {
  config: ConfigStatus | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const configured = config?.configured ?? false;
  const [editing, setEditing] = useState(false);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const showInput = editing || !configured;

  async function handleSave() {
    if (!/^\d{6,}$/.test(appId.trim())) {
      setMsg({ ok: false, text: "App ID deve ser numérico." });
      return;
    }
    if (appSecret.trim().length < 16) {
      setMsg({ ok: false, text: "App Secret muito curto." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/meta/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appId.trim(), appSecret: appSecret.trim() }),
      });
      if (!res.ok) {
        const e = (await res.json()) as { error?: string };
        setMsg({ ok: false, text: e.error ?? "Erro ao salvar." });
      } else {
        setMsg({ ok: true, text: "Credenciais salvas com segurança." });
        setAppId("");
        setAppSecret("");
        setEditing(false);
        onChanged();
      }
    } catch {
      setMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--border)] rounded-[8px] p-4 bg-[#FAFAFB]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">1. App &ldquo;Dioli Digital&rdquo; (App ID + App Secret)</div>
        {!loading && configured && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--success-bg)] text-[var(--success)]">
            ● Configurado{config?.source === "env" ? " (ambiente)" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-[12px] text-[var(--text-muted)]">Carregando…</div>
      ) : showInput ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Credenciais do app</label>
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium hover:underline"
              style={{ color: ACCENT }}
            >
              Abrir painel Meta →
            </a>
          </div>
          <input
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID (ex.: 1824373765214116)"
            className="w-full border border-[var(--border)] rounded-[7px] px-3 py-2 text-[13px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: `${ACCENT}40` }}
          />
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="App Secret (Configurações → Básico → Mostrar)"
            className="w-full border border-[var(--border)] rounded-[7px] px-3 py-2 text-[13px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: `${ACCENT}40` }}
          />
          <p className="text-[10px] text-[var(--text-muted)]">
            Onde encontrar: developers.facebook.com → app &ldquo;Dioli Digital&rdquo; → Configurações → Básico.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-3.5 py-1.5 text-white text-[12px] font-semibold rounded-[7px] transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {busy ? "Salvando…" : "Salvar credenciais"}
            </button>
            {configured && (
              <button
                onClick={() => { setEditing(false); setAppId(""); setAppSecret(""); setMsg(null); }}
                className="px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">App ID:</span>{" "}
            <span className="font-mono">{config?.appId}</span>
            {config?.secretHint && <span className="text-[var(--text-muted)]"> · secret {config.secretHint}</span>}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
          >
            Trocar
          </button>
        </div>
      )}

      {msg && (
        <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-[6px] ${
          msg.ok ? "bg-[#F0FDF4] text-[var(--success)]" : "bg-[#FFF5F5] text-[var(--danger)]"
        }`}>
          {msg.ok ? "✓ " : "✗ "}{msg.text}
        </div>
      )}
    </div>
  );
}

function ConnectionsSection({
  config,
  connections,
  loading,
  onChanged,
}: {
  config: ConfigStatus | null;
  connections: Connection[];
  loading: boolean;
  onChanged: () => void;
}) {
  const canConnect = config?.configured ?? false;
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const openConnectPopup = useCallback(() => {
    setMsg(null);
    setConnecting(true);
    const w = 600, h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      "/api/meta/connect",
      "meta_oauth",
      `width=${w},height=${h},left=${left},top=${top}`,
    );

    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; summary?: string; error?: string };
      if (data?.type === "meta_auth_success") {
        setMsg({ ok: true, text: data.summary ?? "Conta conectada." });
        setConnecting(false);
        window.removeEventListener("message", onMessage);
        onChanged();
      } else if (data?.type === "meta_auth_error") {
        setMsg({ ok: false, text: data.error ?? "Falha ao conectar." });
        setConnecting(false);
        window.removeEventListener("message", onMessage);
      }
    }
    window.addEventListener("message", onMessage);

    // Safety: if the popup is closed without a message, reset the state.
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        setConnecting(false);
        window.removeEventListener("message", onMessage);
      }
    }, 800);
  }, [onChanged]);

  async function handleDisconnect(id: string, name: string) {
    if (!confirm(`Desconectar ${name}?`)) return;
    await fetch("/api/meta/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    });
    onChanged();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">2. Contas conectadas</div>
        <button
          onClick={openConnectPopup}
          disabled={!canConnect || connecting}
          className="px-3.5 py-1.5 text-white text-[12px] font-semibold rounded-[7px] transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
          title={canConnect ? "" : "Salve o App ID e App Secret primeiro"}
        >
          {connecting ? "Conectando…" : "＋ Conectar conta Meta"}
        </button>
      </div>

      {!canConnect && (
        <p className="text-[11px] text-[var(--warning)]">⚠ Salve o App ID e o App Secret acima para poder conectar contas.</p>
      )}

      {loading ? (
        <div className="text-[12px] text-[var(--text-muted)]">Carregando…</div>
      ) : connections.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">Nenhuma conta conectada ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {connections.map((c) => {
            const pm = PLATFORM_META[c.platform];
            return (
              <div key={c.id} className="flex items-center gap-3 border border-[var(--border)] rounded-[7px] px-3 py-2">
                <span className="text-[16px]">{pm.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {c.name} <span className="text-[10px] text-[var(--text-muted)]">· {pm.label}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">id {c.externalId}</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--success-bg)] text-[var(--success)]">● {c.status}</span>
                <button
                  onClick={() => handleDisconnect(c.id, c.name)}
                  className="text-[11px] font-medium text-[var(--danger)] hover:bg-[#FEE2E2] px-2 py-1 rounded-[6px]"
                >
                  Desconectar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {msg && (
        <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-[6px] ${
          msg.ok ? "bg-[#F0FDF4] text-[var(--success)]" : "bg-[#FFF5F5] text-[var(--danger)]"
        }`}>
          {msg.ok ? "✓ " : "✗ "}{msg.text}
        </div>
      )}
    </div>
  );
}
