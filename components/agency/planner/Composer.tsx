"use client";

// Composer — onde uma peça é escrita, vestida, datada e liberada.
//
// O que ele passou a fazer (e não fazia):
//   • QUEM VÊ. O campo `visibility` nunca era enviado, e a API derivava
//     "compartilhado" só quando existia solicitação Brain. Cliente direto não
//     tem solicitação: a agência programava o mês inteiro e o cliente abria o
//     portal vazio. Sem campo na tela, não havia nem como corrigir.
//   • OS CINCO ESTADOS do schema (o select oferecia três).
//   • CARROSSEL. `mediaUrlsJson` (as artes) e `scenesJson` (a descrição de cada
//     tela) existiam no modelo e não tinham campo — carrossel só entrava pela
//     esteira.
//   • UPLOAD. Havia "Link da mídia" e nada mais; agora o arquivo sobe por
//     /api/media e vira uma URL protegida do nosso domínio.
//   • PUBLICAÇÃO. `permalink`, `publishedAt` e `lastError` viram bloco de
//     leitura: "Publicado" deixa de ser um estado que alguém marca à mão.

import { useState, useEffect } from "react";
import { CascaDeModal } from "./CascaDeModal";
import { StatusPill } from "./Indicadores";
import {
  NETWORKS, FORMATS, STATUS_ORDEM, STATUS_META, VIDEO_FORMATS, CARROSSEL_FORMATS,
  buildVideoPrompt, type Post, type VideoScript,
} from "./tipos";

/** O que a rota de pacote descreve — os mesmos nomes que sairão dentro do zip. */
interface PacoteDaPeca {
  pacote: string;
  completo: boolean;
  arquivos: { ordem: number; nome: string; url: string; nossa: boolean }[];
}

/** `equipe:ana@dioli.studio` → "à mão, por ana@dioli.studio". */
function comoFoiPublicado(publishedBy: string | null | undefined): string {
  if (!publishedBy) return "";
  if (publishedBy === "esteira") return " · pelo agendamento automático";
  if (publishedBy.startsWith("equipe:")) return ` · à mão, por ${publishedBy.slice(7)}`;
  return ` · por ${publishedBy}`;
}

/** Sobe um arquivo e devolve a URL protegida (/api/media/<id>). */
async function enviarArquivo(file: File, clientId: string | null): Promise<{ url: string } | { erro: string }> {
  const form = new FormData();
  form.append("file", file);
  if (clientId) form.append("clientId", clientId);
  try {
    const res = await fetch("/api/media", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { erro: typeof json.error === "string" ? json.error : "Não consegui enviar o arquivo." };
    return { url: json.arquivo?.url ?? "" };
  } catch {
    return { erro: "Falha de rede ao enviar o arquivo." };
  }
}

export function Composer({
  post, seed, presetDate, clients, onClose, onSaved, onDelete,
}: {
  post: Post | null;
  seed?: { caption?: string; format?: string; pillar?: string } | null;
  presetDate: string | null;
  clients: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  // scheduledFor para o input datetime-local (YYYY-MM-DDTHH:mm), hora local.
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

  const [caption, setCaption] = useState(post?.caption ?? seed?.caption ?? "");
  const [networks, setNetworks] = useState<string[]>(post?.networks ?? []);
  const [format, setFormat] = useState(post?.format ?? seed?.format ?? "feed");
  const [pillar, setPillar] = useState(post?.pillar ?? seed?.pillar ?? "");
  const [mediaUrl, setMediaUrl] = useState(post?.mediaUrl ?? "");
  const [clientId, setClientId] = useState(post?.clientId ?? "");
  const [when, setWhen] = useState(initialWhen);
  const [status, setStatus] = useState(post?.status ?? "scheduled");
  // Peça nova para um cliente nasce VISÍVEL — é o que a equipe quer em 9 de 10
  // casos, e o inverso (nascer oculta em silêncio) foi o defeito.
  const [visibility, setVisibility] = useState(post?.visibility ?? "compartilhado");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [script, setScript] = useState<VideoScript | null>(post?.script ?? null);
  const [scripting, setScripting] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // As telas do carrossel: arte + descrição, alinhadas por índice na tela.
  const [telas, setTelas] = useState<{ arte: string; descricao: string }[]>(() => {
    const artes = post?.telas ?? [];
    const cenas = post?.cenas ?? [];
    const n = Math.max(artes.length, cenas.length);
    return Array.from({ length: n }, (_, i) => ({ arte: artes[i] ?? "", descricao: cenas[i] ?? "" }));
  });

  // ── PUBLICAR À MÃO (14/08/2026) ───────────────────────────────────────────
  // Enquanto o caminho automático espera a Meta, alguém da casa baixa a peça e
  // posta no feed com as próprias mãos. As duas metades desse gesto moram aqui:
  // BAIXAR na ordem certa, e REGISTRAR o que foi publicado.
  const [pacote, setPacote] = useState<PacoteDaPeca | null>(null);
  const [erroPacote, setErroPacote] = useState<string | null>(null);
  const [idExterno, setIdExterno] = useState(post?.externalPostId ?? "");
  const [linkPublicado, setLinkPublicado] = useState(post?.permalink ?? "");
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistro, setErroRegistro] = useState<string | null>(null);

  const postId = post?.id ?? null;
  const temArte = !!(post?.mediaUrl || (post?.telas?.length ?? 0) > 0);
  useEffect(() => {
    if (!postId || !temArte) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/social-posts/${postId}/download?lista=1`);
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) { setErroPacote(typeof json.error === "string" ? json.error : "Não consegui listar as telas."); return; }
        setPacote(json as PacoteDaPeca);
        setErroPacote(null);
      } catch {
        if (vivo) setErroPacote("Falha de rede ao listar as telas.");
      }
    })();
    return () => { vivo = false; };
  }, [postId, temArte]);

  /** Marca a peça como publicada — escrita no NOSSO banco, e só. Nada aqui fala
   *  com a plataforma: o post já foi ao ar pelas mãos de alguém. */
  async function registrarPublicacao() {
    if (!post) return;
    setErroRegistro(null);
    setRegistrando(true);
    try {
      const res = await fetch(`/api/social-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "published",
          externalPostId: idExterno.trim(),
          permalink: linkPublicado.trim() || null,
          publishedAt: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroRegistro(typeof json.error === "string" ? json.error : "Não consegui registrar a publicação.");
        return;
      }
      onSaved();
    } catch {
      setErroRegistro("Falha de rede ao registrar a publicação.");
    } finally {
      setRegistrando(false);
    }
  }

  const ehCarrossel = CARROSSEL_FORMATS.has(format);
  const semCliente = !clientId;
  // Aviso de trabalho invisível: peça de um cliente, pronta para ir ao ar, que
  // o cliente não enxerga. É o defeito silencioso dito com todas as letras.
  const avisoOculto = !semCliente && visibility !== "compartilhado" && status !== "draft";

  async function copyVideoPrompt() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(buildVideoPrompt(script, format, pillar.trim()));
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      setError("Não consegui copiar. Selecione e copie manualmente.");
    }
  }

  async function subirCapa(file: File) {
    setEnviando(true);
    setError(null);
    const r = await enviarArquivo(file, clientId || null);
    setEnviando(false);
    if ("erro" in r) { setError(r.erro); return; }
    setMediaUrl(r.url);
  }

  async function subirTela(i: number, file: File) {
    setEnviando(true);
    setError(null);
    const r = await enviarArquivo(file, clientId || null);
    setEnviando(false);
    if ("erro" in r) { setError(r.erro); return; }
    setTelas((prev) => prev.map((t, j) => (j === i ? { ...t, arte: r.url } : t)));
  }

  async function generateScript() {
    setScripting(true);
    setError(null);
    try {
      const res = await fetch("/api/social-posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "script", clientId: clientId || null, networks, format, pillar: pillar.trim() || null, brief: caption.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ? `IA: ${json.error}` : "Não foi possível gerar o roteiro."); return; }
      if (json.script) setScript(json.script);
      if (json.caption && !caption.trim()) setCaption(json.caption);
    } catch {
      setError("Falha ao gerar roteiro. Tente de novo.");
    } finally {
      setScripting(false);
    }
  }

  async function generateCaption() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/social-posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "caption", clientId: clientId || null, networks, format, pillar: pillar.trim() || null, brief: caption.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error === undefined ? "Não foi possível gerar." : `IA: ${json.error}`);
        return;
      }
      const tags = Array.isArray(json.hashtags) && json.hashtags.length
        ? "\n\n" + json.hashtags.map((h: string) => `#${h}`).join(" ")
        : "";
      setCaption((json.caption ?? "") + tags);
    } catch {
      setError("Falha ao gerar. Tente de novo.");
    } finally {
      setGenerating(false);
    }
  }

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
      script: script ?? null,
      telas: ehCarrossel ? telas.map((t) => t.arte.trim()).filter(Boolean) : [],
      cenas: ehCarrossel ? telas.map((t) => t.descricao.trim()).filter(Boolean) : [],
      scheduledFor: when ? new Date(when).toISOString() : null,
      status,
      // Sem cliente não existe portal onde a peça apareça — a tela não mente
      // sobre isso e manda "interno".
      visibility: clientId ? visibility : "interno",
    };
    try {
      const res = post
        ? await fetch(`/api/social-posts/${post.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          })
        : await fetch("/api/social-posts", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          typeof json.error === "string" && res.status === 400 ? json.error
          : res.status === 403 ? "Você não tem permissão para isso."
          : "Não foi possível salvar.",
        );
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
    <CascaDeModal
      titulo={post ? "Editar post" : "Novo post"}
      descricao={post ? "As mudanças valem assim que você salvar." : undefined}
      onClose={onClose}
      rodape={
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="h-9 rounded-[8px] px-3 text-[12.5px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]"
            >
              Excluir
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[8px] px-4 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 rounded-[8px] px-5 text-[12.5px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            {saving ? "Salvando…" : post ? "Salvar" : "Programar post"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {/* ── Publicação (leitura) ─────────────────────────────────────────── */}
        {post && (post.publishedAt || post.permalink || post.lastError) && (
          <div
            className="rounded-[10px] p-3"
            style={{
              background: post.lastError ? "var(--danger-bg)" : "var(--success-bg)",
              border: `1px solid ${post.lastError ? "var(--danger)" : "var(--success)"}`,
            }}
            role={post.lastError ? "alert" : undefined}
          >
            {post.lastError ? (
              <>
                <p className="text-[12px] font-semibold text-[var(--danger)]">A publicação não completou</p>
                <p className="mt-0.5 text-[12px] text-[var(--danger)]">{post.lastError}</p>
              </>
            ) : (
              <p className="text-[12px] font-semibold text-[var(--success)]">
                Publicado{post.publishedAt ? ` em ${new Date(post.publishedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                {comoFoiPublicado(post.publishedBy)}
              </p>
            )}
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[12px] font-semibold underline"
                style={{ color: post.lastError ? "var(--danger)" : "var(--success)" }}
              >
                Ver publicação na rede ↗
              </a>
            )}
          </div>
        )}

        {/* ── Publicar à mão ───────────────────────────────────────────────── */}
        {/* Duas linhas, dois gestos: BAIXAR na ordem e REGISTRAR o que saiu.
            Existe porque o caminho automático está fechado esperando a Meta — e
            enquanto isso alguém posta com as próprias mãos. */}
        {post && (
          <div className="rounded-[10px] p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">Publicar à mão</p>

            {/* 1. Baixar */}
            {temArte && (
              <div className="mt-2">
                {erroPacote ? (
                  <p className="text-[12px] text-[var(--danger)]">{erroPacote}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/social-posts/${post.id}/download`}
                        className="inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold text-white"
                        style={{ background: "var(--primary)" }}
                      >
                        ↓ Baixar {pacote ? `${pacote.arquivos.length} ` : ""}
                        {pacote && pacote.arquivos.length === 1 ? "arte" : "telas"} (.zip)
                      </a>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Os arquivos saem numerados na ordem de publicação.
                      </span>
                    </div>
                    {pacote && (
                      <ul className="mt-2 space-y-0.5">
                        {pacote.arquivos.map((a) => (
                          <li key={a.ordem} className="text-[11px] text-[var(--text-secondary)]">
                            {a.nossa ? (
                              <a href={a.url} download={a.nome} className="hover:underline">
                                {a.nome} ↓
                              </a>
                            ) : (
                              <span style={{ color: "var(--danger)" }}>
                                {a.ordem}. arte fora desta casa — não entra no pacote
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            {!temArte && (
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                Esta peça ainda não tem arte guardada — não há o que baixar.
              </p>
            )}

            {/* 2. Registrar */}
            {post.status !== "published" && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-semibold text-[#0E5F5A]">
                  Já publiquei — registrar
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    O <strong>ID da publicação</strong> é o que o relatório mensal usa para pedir as métricas
                    à plataforma. Sem ele a peça sai do calendário e nunca aparece na medição.
                  </p>
                  <input
                    value={idExterno}
                    onChange={(e) => setIdExterno(e.target.value)}
                    placeholder="ID da publicação na plataforma"
                    aria-label="ID da publicação na plataforma"
                    className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
                    style={{ border: "1px solid var(--border)" }}
                  />
                  <input
                    value={linkPublicado}
                    onChange={(e) => setLinkPublicado(e.target.value)}
                    placeholder="Link do post (https://…) — opcional"
                    aria-label="Link do post publicado"
                    className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
                    style={{ border: "1px solid var(--border)" }}
                  />
                  {erroRegistro && (
                    <p role="alert" className="rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                      {erroRegistro}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={registrarPublicacao}
                    disabled={registrando || !idExterno.trim()}
                    className="h-8 rounded-[8px] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                    style={{ background: "var(--primary)" }}
                  >
                    {registrando ? "Registrando…" : "Marcar como publicada"}
                  </button>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Fica gravado quem registrou e quando. Isto não posta nada — só anota o que você já postou.
                  </p>
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── Redes ────────────────────────────────────────────────────────── */}
        <Field label="Redes de destino" hint="O mesmo post sai em todas as selecionadas.">
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => {
              const on = networks.includes(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => toggleNetwork(n.id)}
                  aria-pressed={on}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-all"
                  style={on
                    ? { background: n.color, color: "#fff", border: `1px solid ${n.color}` }
                    : { background: "var(--card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : n.color }} />
                  {n.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* ── Legenda ──────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="planner-legenda" className="text-[12px] font-semibold text-[var(--text-primary)]">Legenda</label>
            <button
              type="button"
              onClick={generateCaption}
              disabled={generating}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E5F5A] hover:underline disabled:opacity-50"
              title="A IA escreve a legenda com base no cliente e no que você já digitou"
            >
              {generating ? "Gerando…" : "✨ Gerar com IA"}
            </button>
          </div>
          <textarea
            id="planner-legenda"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            placeholder="Escreva a legenda — ou digite uma ideia curta e toque em ✨ Gerar com IA."
            className="w-full resize-y rounded-[8px] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none"
            style={{ border: "1px solid var(--border)" }}
          />
        </div>

        {/* ── Arte / capa ──────────────────────────────────────────────────── */}
        <Field
          label={ehCarrossel ? "Capa do carrossel" : "Arte da peça"}
          hint={enviando ? "Enviando…" : "Envie o arquivo ou cole um link"}
        >
          <div className="flex items-start gap-3">
            <div
              className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--accent)]"
            >
              {mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="Pré-visualização da arte" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[18px] text-[var(--text-subtle)]" aria-hidden="true">▢</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="inline-flex h-8 cursor-pointer items-center rounded-[8px] px-3 text-[12px] font-semibold text-[var(--text-primary)]"
                  style={{ border: "1px solid var(--border-strong)", background: "var(--card)" }}
                >
                  Enviar arquivo
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirCapa(f); e.target.value = ""; }}
                  />
                </label>
                {mediaUrl && (
                  <button
                    type="button"
                    onClick={() => setMediaUrl("")}
                    className="text-[12px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                  >
                    Remover
                  </button>
                )}
              </div>
              <input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="…ou cole um link (Drive, Figma)"
                aria-label="Link da mídia"
                className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>
          </div>
        </Field>

        {/* ── Telas do carrossel ───────────────────────────────────────────── */}
        {ehCarrossel && (
          <Field
            label="Telas do carrossel"
            hint={`${telas.length} tela${telas.length === 1 ? "" : "s"}`}
          >
            <div className="space-y-2">
              {telas.length === 0 && (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Um carrossel é uma peça com várias telas. Adicione uma tela por imagem — a
                  descrição é o que a IA usa para desenhar cada uma, e não vai para o cliente.
                </p>
              )}
              {telas.map((t, i) => (
                <div key={i} className="flex items-start gap-2 rounded-[10px] p-2" style={{ border: "1px solid var(--border)" }}>
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="h-[48px] w-[48px] shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--accent)]">
                    {t.arte ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.arte} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[var(--text-subtle)]" aria-hidden="true">▢</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      value={t.descricao}
                      onChange={(e) => setTelas((p) => p.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                      placeholder={`Descrição da tela ${i + 1}`}
                      aria-label={`Descrição da tela ${i + 1}`}
                      className="h-8 w-full rounded-[6px] px-2 text-[12.5px] text-[var(--text-primary)] outline-none"
                      style={{ border: "1px solid var(--border)" }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-7 cursor-pointer items-center rounded-[6px] px-2 text-[11px] font-semibold text-[var(--text-primary)]" style={{ border: "1px solid var(--border-strong)" }}>
                        {t.arte ? "Trocar arte" : "Enviar arte"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirTela(i, f); e.target.value = ""; }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setTelas((p) => p.filter((_, j) => j !== i))}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                      >
                        Remover tela
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setTelas((p) => [...p, { arte: "", descricao: "" }])}
                className="h-8 rounded-[8px] px-3 text-[12px] font-semibold text-[var(--text-primary)]"
                style={{ border: "1px dashed var(--border-strong)" }}
              >
                + Adicionar tela
              </button>
            </div>
          </Field>
        )}

        {/* ── Roteiro de vídeo ─────────────────────────────────────────────── */}
        {VIDEO_FORMATS.has(format) && (
          <div className="rounded-[10px] p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px]" aria-hidden="true">🎬</span>
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">Roteiro de vídeo</span>
              </div>
              <button
                type="button"
                onClick={generateScript}
                disabled={scripting}
                className="text-[12px] font-semibold text-[#0E5F5A] hover:underline disabled:opacity-50"
              >
                {scripting ? "Gerando roteiro…" : script ? "Gerar de novo" : "✨ Gerar roteiro com IA"}
              </button>
            </div>
            {!script ? (
              <p className="text-[12px] text-[var(--text-muted)]">
                A IA escreve um roteiro filmável — ganchos, cenas, texto na tela, áudio e CTA — pronto para gravar.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {script.hooks.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ganchos (teste A/B)</p>
                    <ul className="space-y-1">
                      {script.hooks.map((h, i) => (
                        <li key={i} className="flex gap-1.5 text-[12px] text-[var(--text-secondary)]">
                          <span className="text-[#0E5F5A]" aria-hidden="true">›</span>{h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Cenas</p>
                  <div className="space-y-2">
                    {script.scenes.map((s, i) => (
                      <div key={i} className="rounded-[8px] bg-white p-2.5" style={{ border: "1px solid var(--border)" }}>
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--navy)] text-[9px] font-bold text-white">{i + 1}</span>
                          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{s.visual || "Cena"}</span>
                        </div>
                        {s.voiceover && <p className="text-[12px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]" aria-hidden="true">🎙 </span>{s.voiceover}</p>}
                        {s.onScreen && <p className="mt-0.5 text-[12px] text-[#0E5F5A]"><span className="text-[var(--text-muted)]" aria-hidden="true">▦ </span>{s.onScreen}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                {script.audio && <p className="text-[12px] text-[var(--text-secondary)]"><span className="font-semibold">Áudio:</span> {script.audio}</p>}
                {script.cta && <p className="text-[12px] text-[var(--text-secondary)]"><span className="font-semibold">CTA:</span> {script.cta}</p>}

                <div className="rounded-[8px] p-2.5" style={{ background: "var(--navy)" }}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cyan)" }}>Prompt de vídeo (IA)</span>
                    <button
                      type="button"
                      onClick={copyVideoPrompt}
                      className="rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors"
                      style={copiedPrompt
                        ? { background: "var(--success)", color: "#fff" }
                        : { background: "rgba(154,245,240,0.15)", color: "var(--cyan)" }}
                    >
                      {copiedPrompt ? "✓ Copiado" : "Copiar prompt"}
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#8C93AE" }}>
                    Cole no Runway ou Pika para gerar o vídeo. Quando você assinar um deles, a geração automática entra aqui neste mesmo prompt.
                  </p>
                </div>

                <button type="button" onClick={() => setScript(null)} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--danger)]">
                  Remover roteiro
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Metadados ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Formato" htmlFor="planner-formato">
            <select
              id="planner-formato"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            >
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="planner-status" hint={STATUS_META[status]?.ajuda}>
            <select
              id="planner-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            >
              {STATUS_ORDEM.map((s) => <option key={s} value={s}>{STATUS_META[s]!.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="planner-cliente">
            <select
              id="planner-cliente"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            >
              <option value="">Sem cliente</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Data e hora" htmlFor="planner-quando">
            <input
              id="planner-quando"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--card)" }}
            />
          </Field>
        </div>

        <Field label="Pilar / tema" hint="Ex.: Autoridade, Bastidores" htmlFor="planner-pilar">
          <input
            id="planner-pilar"
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            placeholder="Pilar editorial"
            className="h-9 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none"
            style={{ border: "1px solid var(--border)" }}
          />
        </Field>

        {/* ── Quem vê ──────────────────────────────────────────────────────── */}
        <Field label="Quem vê esta peça" hint={semCliente ? "Escolha um cliente para poder compartilhar" : undefined}>
          <div className="inline-flex overflow-hidden rounded-[8px]" style={{ border: "1px solid var(--border)" }}>
            {([
              { id: "compartilhado", label: "O cliente vê no portal" },
              { id: "interno", label: "Só a equipe" },
            ] as const).map((op) => {
              const on = (semCliente ? "interno" : visibility) === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  disabled={semCliente && op.id === "compartilhado"}
                  aria-pressed={on}
                  onClick={() => setVisibility(op.id)}
                  className="h-9 px-3 text-[12px] font-medium transition-colors disabled:opacity-40"
                  style={on
                    ? { background: "var(--primary)", color: "#fff" }
                    : { background: "var(--card)", color: "var(--text-secondary)" }}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
          {avisoOculto && (
            <p className="mt-2 rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--warning-bg)", color: "#92400E" }}>
              Esta peça está <strong>{STATUS_META[status]?.label.toLowerCase()}</strong> e o cliente <strong>não a vê</strong> no
              portal. Para ele, o mês continua vazio.
            </p>
          )}
        </Field>

        {error && (
          <div role="alert" className="rounded-[8px] bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        )}

        {post && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-[var(--text-muted)]">Estado atual:</span>
            <StatusPill status={post.status} sm />
          </div>
        )}
      </div>
    </CascaDeModal>
  );
}

function Field({
  label, hint, children, htmlFor,
}: {
  label: string; hint?: string; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</label>
        {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
