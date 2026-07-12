"use client";

// Planner — the agency's universal post scheduler + editorial calendar.
// One place to plan a piece of content, tag every network it should go out on,
// and see the whole month at a glance. Backed by /api/social-posts (SocialPost).
//
// Publishing to the actual networks is a later phase (needs each platform's
// OAuth); today this is the source of truth for WHAT goes out WHEN and WHERE,
// and it feeds the client portal's Social tab read-only.

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";

// ─── Network + format metadata ───────────────────────────────────────────────
// Every network the Planner can target. Colour is the brand accent used for
// chips and toggles so a glance at the calendar tells you the mix.
const NETWORKS: { id: string; label: string; short: string; color: string }[] = [
  { id: "instagram", label: "Instagram", short: "IG", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  short: "FB", color: "#1877F2" },
  { id: "tiktok",    label: "TikTok",    short: "TT", color: "#111111" },
  { id: "linkedin",  label: "LinkedIn",  short: "IN", color: "#0A66C2" },
  { id: "youtube",   label: "YouTube",   short: "YT", color: "#FF0000" },
  { id: "pinterest", label: "Pinterest", short: "PT", color: "#E60023" },
  { id: "twitter",   label: "X / Twitter", short: "X", color: "#000000" },
  { id: "threads",   label: "Threads",   short: "TH", color: "#111111" },
  { id: "whatsapp",  label: "WhatsApp",  short: "WA", color: "#25D366" },
  { id: "gbp",       label: "Google Business", short: "GB", color: "#4285F4" },
];
const NETWORK_MAP = Object.fromEntries(NETWORKS.map((n) => [n.id, n]));

const FORMATS: { id: string; label: string }[] = [
  { id: "feed",     label: "Feed" },
  { id: "reel",     label: "Reel" },
  { id: "story",    label: "Story" },
  { id: "carousel", label: "Carrossel" },
  { id: "video",    label: "Vídeo" },
];

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft:     { label: "Rascunho",  bg: "#F0F0ED", fg: "#6B6B65" },
  scheduled: { label: "Agendado",  bg: "#DBEAFE", fg: "#1D4ED8" },
  published: { label: "Publicado", bg: "#DCFCE7", fg: "#16A34A" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Post {
  id: string;
  clientId: string | null;
  clientRequestId: string | null;
  caption: string;
  networks: string[];
  format: string;
  pillar: string | null;
  mediaUrl: string | null;
  scheduledFor: string | null;
  status: string;
}

// Local-date key (YYYY-MM-DD) from an ISO string, in the viewer's timezone.
function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function keyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PlannerPage() {
  const { clients } = useAgencyStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [clientFilter, setClientFilter] = useState("all");
  const [editing, setEditing] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [presetDate, setPresetDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social-posts");
      if (res.ok) {
        const data = await res.json();
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      }
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientName = useCallback(
    (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "Cliente" : "Sem cliente"),
    [clients],
  );

  const visiblePosts = useMemo(
    () => posts.filter((p) => clientFilter === "all" || p.clientId === clientFilter),
    [posts, clientFilter],
  );

  // Group posts by local day key for the calendar.
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of visiblePosts) {
      const k = dayKey(p.scheduledFor);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return map;
  }, [visiblePosts]);

  // Build the 6-week grid for the current month.
  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay()); // back up to Sunday
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, i * 7 + 7));
    return rows;
  }, [cursor]);

  const todayKey = keyOf(new Date());

  function openNew(dateKey?: string) {
    setEditing(null);
    setPresetDate(dateKey ?? null);
    setComposerOpen(true);
  }
  function openEdit(p: Post) {
    setEditing(p);
    setPresetDate(null);
    setComposerOpen(true);
  }

  async function handleSaved() {
    setComposerOpen(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/social-posts/${id}`, { method: "DELETE" });
  }

  const upcoming = useMemo(
    () =>
      [...visiblePosts]
        .filter((p) => p.scheduledFor)
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")),
    [visiblePosts],
  );

  return (
    <>
      <AgencyHeader
        eyebrow="Conteúdo"
        title="Planner"
        subtitle="Programe um post uma vez e distribua para todas as redes. Calendário editorial de toda a agência."
        actions={
          <button
            onClick={() => openNew()}
            className="h-9 px-4 rounded-[8px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#0B0F2A" }}
          >
            + Novo post
          </button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="flex items-center rounded-[8px] overflow-hidden" style={{ border: "1px solid #E7E7E2" }}>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="h-9 w-9 flex items-center justify-center text-[#6B6B65] hover:bg-[#F7F7F4]"
            aria-label="Mês anterior"
          >‹</button>
          <button
            onClick={() => {
              const n = new Date();
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
            }}
            className="h-9 px-3 text-[12px] font-medium text-[#6B6B65] border-x hover:bg-[#F7F7F4]"
            style={{ borderColor: "#E7E7E2" }}
          >Hoje</button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="h-9 w-9 flex items-center justify-center text-[#6B6B65] hover:bg-[#F7F7F4]"
            aria-label="Próximo mês"
          >›</button>
        </div>
        <div className="text-[15px] font-semibold text-[#1A1A1A] min-w-[150px]">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </div>

        <div className="flex-1" />

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-9 px-3 rounded-[8px] text-[12.5px] text-[#1A1A1A] outline-none"
          style={{ border: "1px solid #E7E7E2", background: "#fff" }}
        >
          <option value="all">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex items-center rounded-[8px] overflow-hidden" style={{ border: "1px solid #E7E7E2" }}>
          {(["calendar", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="h-9 px-3 text-[12px] font-medium transition-colors"
              style={view === v
                ? { background: "#0B0F2A", color: "#fff" }
                : { background: "#fff", color: "#6B6B65" }}
            >
              {v === "calendar" ? "Calendário" : "Lista"}
            </button>
          ))}
        </div>
      </div>

      {loading && posts.length === 0 ? (
        <div className="text-[13px] text-[#9B9B95] py-16 text-center">Carregando planner…</div>
      ) : view === "calendar" ? (
        <div className="rounded-[12px] overflow-hidden" style={{ border: "1px solid #E7E7E2" }}>
          {/* Weekday header */}
          <div className="grid grid-cols-7" style={{ background: "#F7F7F4", borderBottom: "1px solid #E7E7E2" }}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#9B9B95]">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7" style={{ borderBottom: ri < 5 ? "1px solid #EFEFEA" : "none" }}>
              {row.map((date, ci) => {
                const k = keyOf(date);
                const inMonth = date.getMonth() === cursor.getMonth();
                const dayPosts = byDay.get(k) ?? [];
                const isToday = k === todayKey;
                return (
                  <div
                    key={ci}
                    className="min-h-[104px] p-1.5 group relative"
                    style={{
                      borderRight: ci < 6 ? "1px solid #EFEFEA" : "none",
                      background: inMonth ? "#fff" : "#FBFBF9",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full"
                        style={isToday
                          ? { background: "#0B0F2A", color: "#fff" }
                          : { color: inMonth ? "#6B6B65" : "#C7C7C0" }}
                      >
                        {date.getDate()}
                      </span>
                      <button
                        onClick={() => openNew(k)}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#9B9B95] hover:bg-[#F0F0ED] transition-opacity"
                        aria-label="Adicionar post neste dia"
                      >+</button>
                    </div>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 3).map((p) => (
                        <PostChip key={p.id} post={p} onClick={() => openEdit(p)} />
                      ))}
                      {dayPosts.length > 3 && (
                        <div className="text-[10px] text-[#9B9B95] px-1">+{dayPosts.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        // List view
        <div className="rounded-[12px] overflow-hidden" style={{ border: "1px solid #E7E7E2" }}>
          {upcoming.length === 0 ? (
            <div className="py-12">
              <EmptyState
                title="Nenhum post programado"
                description="Crie seu primeiro post e distribua para todas as redes de uma vez."
              />
            </div>
          ) : (
            upcoming.map((p, i) => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FBFBF9] transition-colors"
                style={{ borderTop: i > 0 ? "1px solid #EFEFEA" : "none" }}
              >
                <div className="w-[52px] shrink-0 text-center">
                  <div className="text-[16px] font-bold text-[#1A1A1A] leading-none">
                    {p.scheduledFor ? new Date(p.scheduledFor).getDate() : "—"}
                  </div>
                  <div className="text-[10px] uppercase text-[#9B9B95] mt-0.5">
                    {p.scheduledFor ? MONTHS[new Date(p.scheduledFor).getMonth()].slice(0, 3) : ""}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[#1A1A1A] truncate">
                    {p.caption || <span className="text-[#9B9B95] italic">Sem legenda</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-[#9B9B95]">{clientName(p.clientId)}</span>
                    <span className="text-[#D7D7D2]">·</span>
                    <span className="text-[11px] text-[#9B9B95] capitalize">{p.format}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.networks.map((n) => <NetworkDot key={n} id={n} />)}
                </div>
                <StatusPill status={p.status} />
              </button>
            ))
          )}
        </div>
      )}

      {composerOpen && (
        <Composer
          key={editing?.id ?? "new"}
          post={editing}
          presetDate={presetDate}
          clients={clients}
          onClose={() => setComposerOpen(false)}
          onSaved={handleSaved}
          onDelete={editing ? () => { handleDelete(editing.id); setComposerOpen(false); } : undefined}
        />
      )}
    </>
  );
}

// ─── Calendar chip ────────────────────────────────────────────────────────────
function PostChip({ post, onClick }: { post: Post; onClick: () => void }) {
  const st = STATUS_META[post.status] ?? STATUS_META.draft;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-1 px-1.5 py-1 rounded-[5px] text-left hover:brightness-95 transition-all"
      style={{ background: st.bg }}
    >
      <div className="flex items-center gap-0.5 shrink-0">
        {post.networks.slice(0, 3).map((n) => <NetworkDot key={n} id={n} sm />)}
      </div>
      <span className="text-[10px] font-medium truncate" style={{ color: st.fg }}>
        {post.caption || "Sem legenda"}
      </span>
    </button>
  );
}

function NetworkDot({ id, sm }: { id: string; sm?: boolean }) {
  const n = NETWORK_MAP[id];
  const size = sm ? 8 : 14;
  if (!n) return null;
  return sm ? (
    <span className="rounded-full shrink-0" style={{ width: size, height: size, background: n.color }} title={n.label} />
  ) : (
    <span
      className="rounded-full shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: n.color, fontSize: 7 }}
      title={n.label}
    >
      {n.short.slice(0, 2)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const st = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className="shrink-0 inline-flex items-center h-[20px] px-2 rounded-full text-[10px] font-semibold"
          style={{ background: st.bg, color: st.fg }}>
      {st.label}
    </span>
  );
}

// ─── Composer modal ───────────────────────────────────────────────────────────
function Composer({
  post, presetDate, clients, onClose, onSaved, onDelete,
}: {
  post: Post | null;
  presetDate: string | null;
  clients: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  // scheduledFor for the datetime-local input (YYYY-MM-DDTHH:mm) in local time.
  const initialWhen = (() => {
    if (post?.scheduledFor) {
      const d = new Date(post.scheduledFor);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    if (presetDate) return `${presetDate}T09:00`;
    return "";
  })();

  const [caption, setCaption] = useState(post?.caption ?? "");
  const [networks, setNetworks] = useState<string[]>(post?.networks ?? []);
  const [format, setFormat] = useState(post?.format ?? "feed");
  const [pillar, setPillar] = useState(post?.pillar ?? "");
  const [mediaUrl, setMediaUrl] = useState(post?.mediaUrl ?? "");
  const [clientId, setClientId] = useState(post?.clientId ?? "");
  const [when, setWhen] = useState(initialWhen);
  const [status, setStatus] = useState(post?.status ?? "scheduled");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleNetwork(id: string) {
    setNetworks((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  }

  async function save() {
    setError(null);
    if (networks.length === 0) { setError("Escolha ao menos uma rede."); return; }
    setSaving(true);
    const payload = {
      caption,
      networks,
      format,
      pillar: pillar.trim() || null,
      mediaUrl: mediaUrl.trim() || null,
      clientId: clientId || null,
      scheduledFor: when ? new Date(when).toISOString() : null,
      status,
    };
    try {
      const res = post
        ? await fetch(`/api/social-posts/${post.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/social-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        setError(res.status === 403 ? "Você não tem permissão para isso." : "Não foi possível salvar.");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Falha de rede. Tente de novo.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-[16px] sm:rounded-[16px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-5 py-4 flex items-center justify-between z-10" style={{ borderBottom: "1px solid #EFEFEA" }}>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A]">{post ? "Editar post" : "Novo post"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-[#9B9B95] hover:bg-[#F0F0ED]">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Networks */}
          <Field label="Redes de destino" hint="O mesmo post sai em todas as selecionadas.">
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => {
                const on = networks.includes(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => toggleNetwork(n.id)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-all"
                    style={on
                      ? { background: n.color, color: "#fff", borderColor: n.color }
                      : { background: "#fff", color: "#6B6B65", border: "1px solid #E7E7E2" }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: on ? "#fff" : n.color }} />
                    {n.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Legenda">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Escreva a legenda do post…"
              className="w-full rounded-[8px] px-3 py-2 text-[13px] text-[#1A1A1A] outline-none resize-y"
              style={{ border: "1px solid #E7E7E2" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Formato">
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none" style={{ border: "1px solid #E7E7E2", background: "#fff" }}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none" style={{ border: "1px solid #E7E7E2", background: "#fff" }}>
                <option value="draft">Rascunho</option>
                <option value="scheduled">Agendado</option>
                <option value="published">Publicado</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none" style={{ border: "1px solid #E7E7E2", background: "#fff" }}>
                <option value="">Sem cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Data e hora">
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none"
                style={{ border: "1px solid #E7E7E2", background: "#fff" }}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pilar / tema" hint="Ex.: Autoridade, Bastidores">
              <input
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                placeholder="Pilar editorial"
                className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none"
                style={{ border: "1px solid #E7E7E2" }}
              />
            </Field>
            <Field label="Link da mídia" hint="Drive, Figma, arquivo…">
              <input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://…"
                className="w-full h-9 px-3 rounded-[8px] text-[13px] text-[#1A1A1A] outline-none"
                style={{ border: "1px solid #E7E7E2" }}
              />
            </Field>
          </div>

          {error && <div className="text-[12px] text-[#DC2626] bg-[#FEF2F2] rounded-[8px] px-3 py-2">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-white px-5 py-3.5 flex items-center gap-2" style={{ borderTop: "1px solid #EFEFEA" }}>
          {onDelete && (
            <button onClick={onDelete} className="h-9 px-3 rounded-[8px] text-[12.5px] font-medium text-[#DC2626] hover:bg-[#FEF2F2]">
              Excluir
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 rounded-[8px] text-[12.5px] font-medium text-[#6B6B65] hover:bg-[#F0F0ED]">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-5 rounded-[8px] text-[12.5px] font-semibold text-white disabled:opacity-60"
            style={{ background: "#0B0F2A" }}
          >
            {saving ? "Salvando…" : post ? "Salvar" : "Programar post"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[12px] font-semibold text-[#1A1A1A]">{label}</label>
        {hint && <span className="text-[10.5px] text-[#9B9B95]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
