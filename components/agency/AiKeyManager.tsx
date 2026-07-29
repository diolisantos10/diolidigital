"use client";

// AiKeyManager — the "paste your key, test, done" interface.
// Designed for non-technical operators: no code, no terminal. Click the link
// to get a key, paste it, hit "Salvar e testar", and the dot turns green.

import { useEffect, useState } from "react";

type Provider = "claude" | "openai" | "gemini";

interface ProviderStatus {
  provider: Provider;
  configured: boolean;
  hint: string | null;
  model: string | null;
  lastTestStatus: string;
  lastTestMessage: string | null;
  lastTestAt: string | null;
}

interface ProviderMeta {
  name: string;
  tagline: string;
  emoji: string;
  keyUrl: string;
  keyHelp: string;
  models: string[];
  accent: string;
}

const META: Record<Provider, ProviderMeta> = {
  claude: {
    name: "Claude",
    tagline: "Anthropic · texto e raciocínio",
    emoji: "🟣",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHelp: "console.anthropic.com → API Keys → Create Key",
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
    accent: "#070A1F",
  },
  openai: {
    name: "OpenAI",
    tagline: "GPT e DALL·E · texto e imagem",
    emoji: "🟢",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHelp: "platform.openai.com → API keys → Create new secret key",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "dall-e-3"],
    accent: "#0E7490",
  },
  gemini: {
    name: "Google Gemini",
    tagline: "Google · texto, imagem e vídeo",
    emoji: "🔵",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyHelp: "aistudio.google.com → Get API key → Create API key",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
    accent: "#2563EB",
  },
};

const ORDER: Provider[] = ["claude", "openai", "gemini"];

export default function AiKeyManager() {
  const [statuses, setStatuses] = useState<Record<Provider, ProviderStatus> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/ai-keys");
      const data = (await res.json()) as { providers: ProviderStatus[] };
      const map = {} as Record<Provider, ProviderStatus>;
      for (const p of data.providers) map[p.provider] = p;
      setStatuses(map);
    } catch {
      setStatuses(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="bg-white border border-[var(--border)] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Conectar Inteligências Artificiais</h2>
          <span className="text-[10px] bg-[var(--success-bg)] text-[var(--success)] px-2 py-0.5 rounded font-bold">CHAVES REAIS · CRIPTOGRAFADAS</span>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          Cole a chave de cada IA, clique em testar, e pronto. As chaves são guardadas com segurança (criptografadas) e usadas pelos agentes.
        </p>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {ORDER.map((provider) => (
          <ProviderRow
            key={provider}
            provider={provider}
            status={statuses?.[provider] ?? null}
            loading={loading}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderRow({
  provider,
  status,
  loading,
  onChanged,
}: {
  provider: Provider;
  status: ProviderStatus | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const meta = META[provider];
  const configured = status?.configured ?? false;
  const tested = status?.lastTestStatus === "pass";

  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(status?.model ?? meta.models[0]);
  const [busy, setBusy] = useState<"" | "saving" | "testing" | "removing">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (status?.model) setModel(status.model);
  }, [status?.model]);

  const showInput = editing || !configured;

  async function handleSaveAndTest() {
    if (keyInput.trim().length < 8) {
      setMsg({ ok: false, text: "Cole uma chave válida." });
      return;
    }
    setBusy("saving");
    setMsg(null);
    try {
      const saveRes = await fetch("/api/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyInput.trim(), model }),
      });
      if (!saveRes.ok) {
        const e = (await saveRes.json()) as { error?: string };
        setMsg({ ok: false, text: e.error ?? "Erro ao salvar." });
        setBusy("");
        return;
      }
      setBusy("testing");
      const testRes = await fetch("/api/ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const testData = (await testRes.json()) as { ok: boolean; message: string };
      setMsg({ ok: testData.ok, text: testData.message });
      setKeyInput("");
      setEditing(false);
      onChanged();
    } catch {
      setMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setBusy("");
    }
  }

  async function handleTest() {
    setBusy("testing");
    setMsg(null);
    try {
      const res = await fetch("/api/ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setMsg({ ok: data.ok, text: data.message });
      onChanged();
    } catch {
      setMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setBusy("");
    }
  }

  async function handleRemove() {
    if (!confirm(`Remover a chave de ${meta.name}?`)) return;
    setBusy("removing");
    try {
      await fetch("/api/ai-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      setMsg(null);
      setEditing(false);
      onChanged();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        {/* Status dot + identity */}
        <div className="flex items-center gap-2.5 w-[210px] shrink-0">
          <span className="text-[18px]">{meta.emoji}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{meta.name}</span>
              <StatusDot loading={loading} configured={configured} tested={tested} />
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{meta.tagline}</div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-[12px] text-[var(--text-muted)]">Carregando…</div>
          ) : showInput ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[var(--text-secondary)]">Chave de API</label>
                <a
                  href={meta.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: meta.accent }}
                >
                  Pegar minha chave →
                </a>
              </div>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Cole a chave aqui (ex.: sk-…)"
                className="w-full border border-[var(--border)] rounded-[7px] px-3 py-2 text-[13px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2"
                style={{ ["--tw-ring-color" as string]: `${meta.accent}40` }}
              />
              <p className="text-[10px] text-[var(--text-muted)]">Onde encontrar: {meta.keyHelp}</p>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="border border-[var(--border)] rounded-[7px] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] bg-white focus:outline-none"
                >
                  {meta.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={handleSaveAndTest}
                  disabled={busy !== ""}
                  className="px-3.5 py-1.5 text-white text-[12px] font-semibold rounded-[7px] transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: meta.accent }}
                >
                  {busy === "saving" ? "Salvando…" : busy === "testing" ? "Testando…" : "Salvar e testar"}
                </button>
                {configured && (
                  <button
                    onClick={() => { setEditing(false); setKeyInput(""); setMsg(null); }}
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
                <span className="font-medium text-[var(--text-primary)]">Chave conectada:</span>{" "}
                <span className="font-mono">{status?.hint}</span>
                {status?.model && <span className="text-[var(--text-muted)]"> · {status.model}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleTest}
                  disabled={busy !== ""}
                  className="px-3 py-1.5 text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] rounded-[7px] hover:bg-[var(--accent)] disabled:opacity-50"
                >
                  {busy === "testing" ? "Testando…" : "⚡ Testar"}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Trocar chave
                </button>
                <button
                  onClick={handleRemove}
                  disabled={busy !== ""}
                  className="px-2.5 py-1.5 text-[12px] font-medium text-[var(--danger)] hover:bg-[#FEE2E2] rounded-[7px] disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
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
      </div>
    </div>
  );
}

function StatusDot({ loading, configured, tested }: { loading: boolean; configured: boolean; tested: boolean }) {
  if (loading) return <span className="w-2 h-2 rounded-full bg-[var(--border-strong)]" />;
  if (configured && tested) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--success-bg)] text-[var(--success)]">
        ● Conectado
      </span>
    );
  }
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--warning-bg)] text-[var(--warning)]">
        ● Chave salva
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--accent)] text-[var(--text-muted)]">
      ○ Não conectado
    </span>
  );
}
