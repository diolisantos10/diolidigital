"use client";

// Planner — o calendário editorial da agência: uma peça planejada uma vez,
// marcada para todas as redes em que deve sair, e o mês inteiro num olhar.
// Fonte: /api/social-posts (SocialPost). Alimenta o portal do cliente.
//
// ── O QUE ESTA TELA APRENDEU (05/08/2026) ────────────────────────────────────
// 1. TRABALHO INVISÍVEL É O PIOR DEFEITO. Post criado aqui para cliente direto
//    nascia "interno" e o cliente não via nada — sem erro, sem aviso. Agora a
//    visibilidade é campo, é sinal no chip e é aviso no topo do mês.
// 2. NADA DE CONTEÚDO SEM CAMINHO. "+N mais" era uma <div> inerte: da quarta
//    peça do dia em diante não havia como chegar nela. Hoje abre o painel do dia.
// 3. ROTA CONSTRUÍDA SEM BOTÃO NÃO EXISTE. /api/social-posts/aprovacao montava
//    o card de aprovação do cliente e nenhum componente a chamava.

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAgencyStore } from "@/store/agency-store";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import { useReservaDeBarra } from "@/components/agency/layout/useReservaDeBarra";
import { Composer } from "@/components/agency/planner/Composer";
import { IdeasPanel, type Idea } from "@/components/agency/planner/IdeasPanel";
import { PainelDoDia } from "@/components/agency/planner/PainelDoDia";
import { PostChip } from "@/components/agency/planner/PostChip";
import { LinhaDePeca } from "@/components/agency/planner/LinhaDePeca";
import {
  MONTHS, WEEKDAYS, STATUS_ORDEM, STATUS_META, metaDoStatus,
  dayKey, keyOf, trocarODia, type Post,
} from "@/components/agency/planner/tipos";

export default function PlannerPage() {
  const { clients } = useAgencyStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [seed, setSeed] = useState<{ caption?: string; format?: string; pillar?: string } | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [diaAlvo, setDiaAlvo] = useState<string | null>(null);

  // A barra de seleção é fixa no rodapé: quem reserva o espaço é o layout desta
  // tela, medindo a altura real da barra (DESIGN.md §6.1/§6.2).
  const { casca, barra } = useReservaDeBarra<HTMLDivElement, HTMLDivElement>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social-posts");
      if (!res.ok) { setErro("Não consegui carregar o calendário agora."); return; }
      const data = await res.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setErro(null);
    } catch {
      setErro("Não consegui falar com o servidor. Verifique a conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // No celular a grade de 7 colunas vira 7 tirinhas de 45px — nenhuma legenda
  // cabe. A vista de lista é a que serve para planejar no telefone; o calendário
  // continua a um toque de distância.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setView("list");
  }, []);

  const clientName = useCallback(
    (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "Cliente" : "Sem cliente"),
    [clients],
  );

  const visiblePosts = useMemo(
    () => posts.filter((p) =>
      (clientFilter === "all" || p.clientId === clientFilter) &&
      (statusFilter === "all" || p.status === statusFilter)),
    [posts, clientFilter, statusFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of visiblePosts) {
      const k = dayKey(p.scheduledFor);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
    }
    return map;
  }, [visiblePosts]);

  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, i * 7 + 7));
    return rows;
  }, [cursor]);

  const todayKey = keyOf(new Date());

  // As peças DO MÊS que está na tela — é sobre elas que o resumo fala.
  const doMes = useMemo(
    () => visiblePosts.filter((p) => {
      if (!p.scheduledFor) return false;
      const d = new Date(p.scheduledFor);
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    }),
    [visiblePosts, cursor],
  );

  const resumo = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const p of doMes) contagem[p.status] = (contagem[p.status] ?? 0) + 1;
    return contagem;
  }, [doMes]);

  // O alerta que fecha o defeito silencioso: peça de um cliente, pronta para ir
  // ao ar, que o cliente não enxerga no portal.
  const invisiveis = useMemo(
    () => doMes.filter((p) => p.clientId && p.visibility !== "compartilhado" && p.status !== "draft"),
    [doMes],
  );

  function openNew(dateKey?: string) {
    setEditing(null);
    setSeed(null);
    setPresetDate(dateKey ?? null);
    setComposerOpen(true);
  }
  function openEdit(p: Post) {
    setEditing(p);
    setSeed(null);
    setPresetDate(null);
    setComposerOpen(true);
  }
  function abrirPorId(id: string) {
    const p = posts.find((x) => x.id === id);
    if (p) openEdit(p);
  }
  function openFromIdea(idea: Idea) {
    setEditing(null);
    setPresetDate(null);
    setSeed({
      caption: idea.angle ? `${idea.title}\n\n${idea.angle}` : idea.title,
      format: idea.format,
      pillar: idea.pillar,
    });
    setIdeasOpen(false);
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

  // ── Arrastar para reagendar ────────────────────────────────────────────────
  // Melhoria de mouse: o caminho acessível (teclado / celular) continua sendo
  // abrir a peça e trocar a data — por isso a hora é preservada aqui também.
  async function reagendar(id: string, novoDia: string) {
    const alvo = posts.find((p) => p.id === id);
    if (!alvo) return;
    const antes = alvo.scheduledFor;
    const novo = trocarODia(antes, novoDia);
    if (antes === novo) return;
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, scheduledFor: novo } : p)));
    try {
      const res = await fetch(`/api/social-posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: novo }),
      });
      if (!res.ok) throw new Error();
      setAviso({ tipo: "ok", texto: `Peça movida para ${new Date(novo).toLocaleDateString("pt-BR")}.` });
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, scheduledFor: antes } : p)));
      setAviso({ tipo: "erro", texto: "Não consegui mover a peça. A data voltou ao que era." });
    }
  }

  // ── Ações em lote ──────────────────────────────────────────────────────────
  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }
  function sairDaSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
    setAviso(null);
  }

  async function compartilharSelecionados() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setTrabalhando(true);
    setAviso(null);
    const falhas: string[] = [];
    for (const id of ids) {
      const res = await fetch(`/api/social-posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "compartilhado" }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const json = res ? await res.json().catch(() => ({})) : {};
        falhas.push(typeof json.error === "string" ? json.error : "erro de rede");
      }
    }
    setTrabalhando(false);
    await load();
    setAviso(falhas.length === 0
      ? { tipo: "ok", texto: `${ids.length} peça(s) agora aparecem no portal do cliente.` }
      : { tipo: "erro", texto: `${falhas.length} de ${ids.length} não foram compartilhadas: ${falhas[0]}` });
  }

  async function pedirAprovacao() {
    const ids = [...selecionados];
    if (ids.length === 0) return;
    setTrabalhando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/social-posts/aprovacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAviso({ tipo: "erro", texto: typeof json.error === "string" ? json.error : "Não consegui abrir a aprovação." });
        return;
      }
      setAviso({ tipo: "ok", texto: `Aprovação aberta: "${json.titulo}". O cliente já vê o card no portal.` });
      setSelecionados(new Set());
      await load();
    } catch {
      setAviso({ tipo: "erro", texto: "Falha de rede ao abrir a aprovação." });
    } finally {
      setTrabalhando(false);
    }
  }

  const upcoming = useMemo(
    () =>
      [...visiblePosts]
        .filter((p) => p.scheduledFor)
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")),
    [visiblePosts],
  );

  const barraVisivel = modoSelecao;

  return (
    <div ref={casca} className={barraVisivel ? "acao-shell" : undefined}>
      <div className={barraVisivel ? "acao-reserva" : undefined}>
        <AgencyHeader
          eyebrow="Conteúdo"
          title="Planner"
          subtitle="Programe um post uma vez e distribua para todas as redes. Calendário editorial de toda a agência."
          actions={
            <button
              onClick={() => openNew()}
              className="h-9 rounded-[8px] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              + Novo post
            </button>
          }
        />

        {/* ── Barra de navegação e filtros ───────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-[8px]" style={{ border: "1px solid var(--border)" }}>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--accent)]"
              aria-label="Mês anterior"
            >‹</button>
            <button
              onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}
              className="h-9 border-x px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >Hoje</button>
            <button
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--accent)]"
              aria-label="Próximo mês"
            >›</button>
          </div>
          <h2 className="min-w-[140px] text-[16px] font-semibold text-[var(--text-primary)]">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>

          <div className="flex-1" />

          <button
            onClick={() => setIdeasOpen(true)}
            className="h-9 rounded-[8px] px-3 text-[12.5px] font-semibold transition-colors"
            style={{ background: "var(--accent-light)", color: "#0E5F5A", border: "1px solid #C7EFEC" }}
          >
            ✨ Ideias
          </button>

          <button
            onClick={() => (modoSelecao ? sairDaSelecao() : setModoSelecao(true))}
            aria-pressed={modoSelecao}
            className="h-9 rounded-[8px] px-3 text-[12.5px] font-semibold transition-colors"
            style={modoSelecao
              ? { background: "var(--primary)", color: "#fff", border: "1px solid var(--primary)" }
              : { background: "var(--card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            {modoSelecao ? "Sair da seleção" : "Selecionar"}
          </button>

          <label className="sr-only" htmlFor="planner-filtro-cliente">Filtrar por cliente</label>
          <select
            id="planner-filtro-cliente"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="h-9 rounded-[8px] px-3 text-[12.5px] text-[var(--text-primary)] outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--card)" }}
          >
            <option value="all">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label className="sr-only" htmlFor="planner-filtro-status">Filtrar por estado</label>
          <select
            id="planner-filtro-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-[8px] px-3 text-[12.5px] text-[var(--text-primary)] outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--card)" }}
          >
            <option value="all">Todos os estados</option>
            {STATUS_ORDEM.map((s) => <option key={s} value={s}>{STATUS_META[s]!.label}</option>)}
          </select>

          <div className="flex items-center overflow-hidden rounded-[8px]" style={{ border: "1px solid var(--border)" }}>
            {(["calendar", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="h-9 px-3 text-[12px] font-medium transition-colors"
                style={view === v
                  ? { background: "var(--primary)", color: "#fff" }
                  : { background: "var(--card)", color: "var(--text-secondary)" }}
              >
                {v === "calendar" ? "Calendário" : "Lista"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Resumo do mês ──────────────────────────────────────────────── */}
        {!loading && !erro && doMes.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {doMes.length} {doMes.length === 1 ? "peça" : "peças"} em {MONTHS[cursor.getMonth()].toLowerCase()}
            </span>
            <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_ORDEM.filter((s) => resumo[s]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                  aria-pressed={statusFilter === s}
                  className="inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
                  style={{
                    background: metaDoStatus(s).bg,
                    color: metaDoStatus(s).fg,
                    boxShadow: statusFilter === s ? "0 0 0 2px var(--navy)" : undefined,
                  }}
                >
                  <span aria-hidden="true">{metaDoStatus(s).glifo}</span>
                  {resumo[s]} {metaDoStatus(s).label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── O alerta do trabalho invisível ─────────────────────────────── */}
        {invisiveis.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] px-3.5 py-3"
            style={{ background: "var(--warning-bg)", border: "1px solid #FDE68A" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "#92400E" }}>
                {invisiveis.length === 1
                  ? "1 peça deste mês não aparece para o cliente"
                  : `${invisiveis.length} peças deste mês não aparecem para o cliente`}
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: "#B45309" }}>
                Elas estão programadas, mas marcadas como internas — no portal dele o mês continua vazio.
              </p>
            </div>
            <button
              onClick={() => {
                setModoSelecao(true);
                setSelecionados(new Set(invisiveis.map((p) => p.id)));
                setAviso(null);
              }}
              className="h-8 shrink-0 rounded-[8px] px-3 text-[12px] font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Selecionar e resolver
            </button>
          </div>
        )}

        {/* ── Erro ───────────────────────────────────────────────────────── */}
        {erro && (
          <div role="alert" className="rounded-[12px] px-4 py-8 text-center" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{erro}</p>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">O calendário não foi perdido — só não consegui buscá-lo agora.</p>
            <button
              onClick={() => void load()}
              className="mt-3 h-9 rounded-[8px] px-4 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {/* ── Carregando ─────────────────────────────────────────────────── */}
        {!erro && loading && posts.length === 0 && (
          <div role="status" aria-live="polite" className="rounded-[12px] p-3" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <span className="sr-only">Carregando o calendário…</span>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 21 }).map((_, i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-[8px] bg-[var(--accent)]" />
              ))}
            </div>
          </div>
        )}

        {/* ── Vazio ──────────────────────────────────────────────────────── */}
        {!erro && !loading && posts.length === 0 && (
          <div className="rounded-[12px] py-12" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <EmptyState
              icon={<span aria-hidden="true">🗓</span>}
              title="Nenhum post no calendário"
              description="Crie a primeira peça e distribua para todas as redes de uma vez — ou peça ideias à IA."
              action={
                <button
                  onClick={() => openNew()}
                  className="h-9 rounded-[8px] px-4 text-[12.5px] font-semibold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  + Novo post
                </button>
              }
            />
          </div>
        )}

        {/* ── Calendário ─────────────────────────────────────────────────── */}
        {!erro && !loading && posts.length > 0 && view === "calendar" && (
          <div className="overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="grid grid-cols-7" style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] sm:px-3 sm:text-left">
                  <span className="sm:hidden">{d.slice(0, 1)}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>
            {weeks.map((row, ri) => (
              <div key={ri} className="grid grid-cols-7" style={{ borderBottom: ri < 5 ? "1px solid var(--border)" : "none" }}>
                {row.map((date, ci) => {
                  const k = keyOf(date);
                  const inMonth = date.getMonth() === cursor.getMonth();
                  const dayPosts = byDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  const alvo = diaAlvo === k && !!arrastando;
                  return (
                    <div
                      key={ci}
                      className="group relative min-h-[76px] p-1 lg:min-h-[112px] lg:p-1.5"
                      onDragOver={(e) => { if (arrastando) { e.preventDefault(); setDiaAlvo(k); } }}
                      onDragLeave={() => setDiaAlvo((atual) => (atual === k ? null : atual))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain") || arrastando;
                        setDiaAlvo(null);
                        setArrastando(null);
                        if (id) void reagendar(id, k);
                      }}
                      style={{
                        borderRight: ci < 6 ? "1px solid var(--border)" : "none",
                        background: alvo ? "var(--accent-light)" : inMonth ? "var(--card)" : "var(--bg)",
                        outline: alvo ? "2px dashed var(--navy)" : undefined,
                        outlineOffset: "-2px",
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <button
                          onClick={() => setDiaAberto(k)}
                          aria-label={`Ver ${date.getDate()} de ${MONTHS[date.getMonth()]}${dayPosts.length ? ` — ${dayPosts.length} peça(s)` : ""}`}
                          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold hover:bg-[var(--accent)]"
                          style={isToday
                            ? { background: "var(--primary)", color: "#fff" }
                            : { color: inMonth ? "var(--text-secondary)" : "var(--text-subtle)" }}
                        >
                          {date.getDate()}
                        </button>
                        <button
                          onClick={() => openNew(k)}
                          className="hidden h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--accent)] focus-visible:opacity-100 group-hover:opacity-100 lg:flex"
                          aria-label={`Adicionar post em ${date.getDate()} de ${MONTHS[date.getMonth()]}`}
                        >+</button>
                      </div>

                      {/* Célula larga (lg+): os chips com miniatura e legenda.
                          Abaixo disso a coluna tem ~77px — chip ali não mostra
                          legenda nenhuma, que era o "Planner pobre" no tablet. */}
                      <div className="hidden space-y-1 lg:block">
                        {dayPosts.slice(0, 3).map((p) => (
                          <PostChip
                            key={p.id}
                            post={p}
                            modoSelecao={modoSelecao}
                            selecionado={selecionados.has(p.id)}
                            onClick={() => (modoSelecao ? alternarSelecao(p.id) : openEdit(p))}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", p.id);
                              e.dataTransfer.effectAllowed = "move";
                              setArrastando(p.id);
                            }}
                            onDragEnd={() => { setArrastando(null); setDiaAlvo(null); }}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <button
                            onClick={() => setDiaAberto(k)}
                            className="w-full rounded-[6px] px-1 py-0.5 text-left text-[11px] font-semibold text-[var(--info)] hover:bg-[var(--accent)] hover:underline"
                          >
                            Ver mais {dayPosts.length - 3} ›
                          </button>
                        )}
                      </div>

                      {/* Célula estreita (celular e tablet): resumo tocável do
                          dia — miniaturas + um ponto por estado. O conteúdo
                          inteiro está a um toque, no painel do dia. */}
                      {dayPosts.length > 0 && (
                        <button
                          onClick={() => setDiaAberto(k)}
                          aria-label={`Ver as ${dayPosts.length} peça(s) de ${date.getDate()} de ${MONTHS[date.getMonth()]}`}
                          className="flex w-full flex-col items-start gap-1 rounded-[6px] p-1 hover:bg-[var(--accent)] lg:hidden"
                        >
                          <span className="flex -space-x-1">
                            {dayPosts.slice(0, 3).map((p) => (
                              <span
                                key={p.id}
                                className="h-5 w-5 overflow-hidden rounded-[4px] border border-white bg-[var(--accent)]"
                              >
                                {p.mediaUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.mediaUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                                ) : null}
                              </span>
                            ))}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="flex gap-0.5">
                              {dayPosts.slice(0, 4).map((p) => (
                                <span
                                  key={p.id}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: metaDoStatus(p.status).fg }}
                                />
                              ))}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                              {dayPosts.length}
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── Lista ──────────────────────────────────────────────────────── */}
        {!erro && !loading && posts.length > 0 && view === "list" && (
          <div className="overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            {upcoming.length === 0 ? (
              <div className="py-12">
                <EmptyState
                  title="Nenhuma peça neste filtro"
                  description="Troque o cliente ou o estado no filtro acima para ver o resto do calendário."
                />
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {upcoming.map((p) => (
                  <LinhaDePeca
                    key={p.id}
                    post={p}
                    comData
                    subtitulo={clientName(p.clientId)}
                    modoSelecao={modoSelecao}
                    selecionado={selecionados.has(p.id)}
                    onClick={() => (modoSelecao ? alternarSelecao(p.id) : openEdit(p))}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Barra de seleção (fixa) ──────────────────────────────────────── */}
      {barraVisivel && (
        <div
          ref={barra}
          className="acao-barra fixed bottom-0 left-0 right-0 z-40 md:left-[224px]"
          style={{ background: "var(--card)", borderTop: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center md:px-8">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                {selecionados.size === 0 ? "Toque nas peças para selecionar" : `${selecionados.size} selecionada(s)`}
              </span>
              <div className="flex-1" />
              <button
                onClick={sairDaSelecao}
                className="h-8 rounded-[8px] px-2 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] sm:hidden"
              >
                Cancelar
              </button>
            </div>
            <div className="hidden flex-1 sm:block" />
            <div className="flex items-center gap-2">
              <button
                onClick={compartilharSelecionados}
                disabled={selecionados.size === 0 || trabalhando}
                className="h-9 flex-1 rounded-[8px] px-3 text-[12.5px] font-semibold text-[var(--text-primary)] disabled:opacity-40 sm:flex-none"
                style={{ border: "1px solid var(--border-strong)", background: "var(--card)" }}
              >
                Mostrar ao cliente
              </button>
              <button
                onClick={pedirAprovacao}
                disabled={selecionados.size === 0 || trabalhando}
                className="h-9 flex-1 rounded-[8px] px-3 text-[12.5px] font-semibold text-white disabled:opacity-40 sm:flex-none"
                style={{ background: "var(--primary)" }}
              >
                {trabalhando ? "Enviando…" : "Pedir aprovação"}
              </button>
              <button
                onClick={sairDaSelecao}
                className="hidden h-9 rounded-[8px] px-3 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] sm:block"
              >
                Cancelar
              </button>
            </div>
            {aviso && (
              <p
                role={aviso.tipo === "erro" ? "alert" : "status"}
                className="w-full rounded-[8px] px-3 py-2 text-[12px]"
                style={aviso.tipo === "erro"
                  ? { background: "var(--danger-bg)", color: "var(--danger)" }
                  : { background: "var(--success-bg)", color: "var(--success)" }}
              >
                {aviso.texto}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Aviso fora do modo seleção (arrastar) ────────────────────────── */}
      {!barraVisivel && aviso && (
        <div
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-[10px] px-4 py-2.5 text-[12.5px] font-medium shadow-[var(--shadow-lg)]"
          style={aviso.tipo === "erro"
            ? { background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }
            : { background: "var(--card)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          onClick={() => setAviso(null)}
        >
          {aviso.texto}
        </div>
      )}

      {composerOpen && (
        <Composer
          key={editing?.id ?? (seed ? "seed" : "new")}
          post={editing}
          seed={seed}
          presetDate={presetDate}
          clients={clients}
          onClose={() => setComposerOpen(false)}
          onSaved={handleSaved}
          onDelete={editing ? () => { void handleDelete(editing.id); setComposerOpen(false); } : undefined}
        />
      )}

      {diaAberto && (
        <PainelDoDia
          dia={diaAberto}
          posts={byDay.get(diaAberto) ?? []}
          nomeDoCliente={clientName}
          modoSelecao={modoSelecao}
          selecionados={selecionados}
          onSelecionar={alternarSelecao}
          onAbrir={(id) => { setDiaAberto(null); abrirPorId(id); }}
          onNovo={() => { const d = diaAberto; setDiaAberto(null); openNew(d); }}
          onClose={() => setDiaAberto(null)}
        />
      )}

      {ideasOpen && (
        <IdeasPanel
          clientId={clientFilter === "all" ? null : clientFilter}
          clientName={clientFilter === "all" ? "todos os clientes" : clientName(clientFilter)}
          onClose={() => setIdeasOpen(false)}
          onPick={openFromIdea}
        />
      )}
    </div>
  );
}
