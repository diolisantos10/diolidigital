"use client";

// Acervo — o histórico de posts do Instagram deste cliente, importado da Meta.
// É a matéria-prima do DNA da marca (ver DnaDaMarca.tsx, ao lado): sem acervo
// importado, não há "de onde veio" para nenhum traço.
//
// Fonte: GET/POST /api/agency/clients/{id}/acervo(/importar), PATCH
// /acervo/{postId}. Importar e marcar/reclassificar são ações de master; os
// demais papéis veem a grade em modo leitura (mesma régua de PacoteDaMarca:
// nunca esconder o dado, só o controle de escrita).

import { useCallback, useEffect, useState } from "react";
import { formatarNumeroCompacto } from "@/lib/agency/portal/resultados";

interface PostAcervo {
  id: string;
  igMediaId: string;
  mediaType: string;
  caption: string | null;
  permalink: string | null;
  publicadoEm: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  alcance: number | null;
  thumbUrl: string | null;
  referencia: boolean;
  familiaLayout: string | null;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "vazio" }
  | { fase: "ok"; acervoImportadoEm: string; posts: PostAcervo[] };

type ResultadoImportacao =
  | { tipo: "sucesso"; resumo: string }
  | { tipo: "erro"; mensagem: string; codigo?: string };

// Famílias comuns — sugestão, não lista fechada: o schema aceita qualquer
// string, então "Outra…" sempre existe como saída para o que não está aqui.
const FAMILIAS_PRESET = ["radar", "serviço", "promocional", "institucional", "depoimento"];
const OUTRA = "__outra__";

function rotuloTipo(mediaType: string): "Carrossel" | "Reels" | "Foto" {
  const m = (mediaType || "").toUpperCase();
  if (m.includes("CAROUSEL")) return "Carrossel";
  if (m.includes("REEL") || m.includes("VIDEO")) return "Reels";
  return "Foto";
}

/** "não medido" nunca é 0 — guardrail 1 da casa (ausência não é informação). */
function formatarMetrica(v: number | null): string {
  if (v == null) return "não medido";
  return formatarNumeroCompacto(v) ?? String(v);
}

function dataCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function mensagemDaRecusa(codigo: string | undefined, motivo: string | undefined): string {
  switch (codigo) {
    case "ja_importado":
      return "O acervo deste cliente já foi importado.";
    case "sem_conexao":
      return "Este cliente ainda não conectou o Instagram — conecte pelo portal da marca (seção Conta) antes de importar.";
    case "teto_da_meta":
      return "Chegamos ao limite de pedidos à Meta agora. Tente novamente daqui a uma hora.";
    case "erro_da_meta":
      return motivo || "A Meta recusou o pedido de importação agora. Tente novamente mais tarde.";
    default:
      return motivo || "Não consegui importar o acervo agora.";
  }
}

export default function Acervo({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  // Miniatura que falhou ao carregar (§7.8) — nunca o ícone quebrado do navegador.
  const [thumbsQuebradas, setThumbsQuebradas] = useState<Set<string>>(new Set());
  // Erro por card, ao salvar referência/família — some quando o próximo salvamento funciona.
  const [errosPorPost, setErrosPorPost] = useState<Record<string, string | undefined>>({});
  const [familiaCustomAberta, setFamiliaCustomAberta] = useState<Set<string>>(new Set());

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/acervo`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar o acervo agora." }); return; }
      if (!j.acervoImportadoEm) { setEstado({ fase: "vazio" }); return; }
      setEstado({
        fase: "ok",
        acervoImportadoEm: j.acervoImportadoEm,
        posts: Array.isArray(j.posts) ? j.posts : [],
      });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  async function importar(forcar = false) {
    setImportando(true);
    setResultado(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/acervo/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forcar }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setResultado({ tipo: "erro", mensagem: mensagemDaRecusa(j.codigo, j.motivo), codigo: j.codigo });
        return;
      }
      const partes = [
        `${j.importados ?? 0} importado${(j.importados ?? 0) === 1 ? "" : "s"}`,
        `${j.jaExistiam ?? 0} já exist${(j.jaExistiam ?? 0) === 1 ? "ia" : "iam"}`,
        `${j.semInsights ?? 0} sem insights`,
        `${j.midiasBaixadas ?? 0} mídia${(j.midiasBaixadas ?? 0) === 1 ? "" : "s"} baixada${(j.midiasBaixadas ?? 0) === 1 ? "" : "s"}`,
      ];
      if ((j.falhasDeMidia ?? 0) > 0) partes.push(`${j.falhasDeMidia} falha${j.falhasDeMidia === 1 ? "" : "s"} de mídia`);
      setResultado({ tipo: "sucesso", resumo: partes.join(" · ") });
      await buscar();
    } catch {
      setResultado({ tipo: "erro", mensagem: "Falha de rede ao importar. Tente de novo." });
    } finally {
      setImportando(false);
    }
  }

  async function atualizarPost(post: PostAcervo, patch: Partial<Pick<PostAcervo, "referencia" | "familiaLayout">>) {
    if (estado.fase !== "ok") return;
    const anterior = post;
    const proximo: PostAcervo = { ...post, ...patch };
    // Otimista: a tela já reflete a decisão antes da resposta do servidor.
    setEstado({ ...estado, posts: estado.posts.map((p) => (p.id === post.id ? proximo : p)) });
    setErrosPorPost((e) => ({ ...e, [post.id]: undefined }));
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/acervo/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia: proximo.referencia, familiaLayout: proximo.familiaLayout }),
      });
      if (!r.ok) throw new Error();
    } catch {
      // Rollback — a tela nunca mostra uma decisão que o servidor recusou.
      setEstado((atual) => atual.fase === "ok"
        ? { ...atual, posts: atual.posts.map((p) => (p.id === post.id ? anterior : p)) }
        : atual);
      setErrosPorPost((e) => ({ ...e, [post.id]: "Não consegui salvar. Tente de novo." }));
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Acervo</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            O histórico de posts do Instagram — matéria-prima do DNA da marca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeEditar ? (
            <button
              onClick={() => void importar(false)}
              disabled={importando}
              className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[13px] font-semibold transition-colors bg-[var(--navy)] text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {importando ? "Importando…" : "Importar acervo do Instagram"}
            </button>
          ) : (
            <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]" title="Só quem é master importa o acervo">
              Leitura
            </span>
          )}
        </div>
      </div>

      {resultado && (
        <div className="px-5 pt-3">
          {resultado.tipo === "sucesso" ? (
            <p role="status" className="text-[13px] text-[var(--success)] bg-[var(--success-bg)] rounded-[8px] px-3 py-2">
              {resultado.resumo}
            </p>
          ) : (
            <div role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <span>{resultado.mensagem}</span>
              {resultado.codigo === "ja_importado" && podeEditar && (
                <button
                  onClick={() => void importar(true)}
                  disabled={importando}
                  className="h-11 sm:h-8 px-3 rounded-[6px] text-[12px] font-medium border border-[var(--danger)] text-[var(--danger)] hover:bg-white transition-colors shrink-0"
                >
                  Reimportar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Carregando ─────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aspect-square rounded-[10px] bg-[var(--accent)] animate-pulse" />
            ))}
          </div>
          <span className="sr-only">Carregando o acervo…</span>
        </div>
      )}

      {/* ── Erro ───────────────────────────────────────────────────────── */}
      {estado.fase === "erro" && (
        <div role="alert" className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
          <button
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* ── Vazio — nunca importado ────────────────────────────────────── */}
      {estado.fase === "vazio" && (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Acervo ainda não importado</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
            Sem acervo, não há matéria-prima para o DNA da marca. A importação lê o Instagram já conectado por este cliente.
          </p>
          {!podeEditar && (
            <p className="text-[12px] text-[var(--text-subtle)] mt-2 italic">Só quem é master importa o acervo.</p>
          )}
        </div>
      )}

      {/* ── Grade ──────────────────────────────────────────────────────── */}
      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-[var(--text-muted)]">
            Importado em {dataCurta(estado.acervoImportadoEm)} · {estado.posts.length} post{estado.posts.length === 1 ? "" : "s"}
          </p>

          {estado.posts.length === 0 ? (
            <p className="text-[13px] text-[var(--text-subtle)] italic py-4 text-center">
              A Meta não devolveu nenhum post para este período.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {estado.posts.map((post) => {
                const quebrada = thumbsQuebradas.has(post.id);
                const modoCustom = familiaCustomAberta.has(post.id) ||
                  (!!post.familiaLayout && !FAMILIAS_PRESET.includes(post.familiaLayout));
                return (
                  <div key={post.id} className="rounded-[10px] border border-[var(--border)] overflow-hidden bg-white">
                    <div className="relative aspect-square bg-[var(--accent)]">
                      {post.thumbUrl && !quebrada ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.thumbUrl}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => setThumbsQuebradas((s) => new Set(s).add(post.id))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[12px] text-[var(--text-subtle)]">
                          sem prévia
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 h-6 inline-flex items-center rounded-full px-2 text-[12px] font-semibold bg-black/60 text-white backdrop-blur-sm">
                        {rotuloTipo(post.mediaType)}
                      </span>
                      {podeEditar ? (
                        <button
                          type="button"
                          onClick={() => void atualizarPost(post, { referencia: !post.referencia })}
                          aria-pressed={post.referencia}
                          aria-label={post.referencia ? "Desmarcar referência" : "Marcar como referência"}
                          title={post.referencia ? "Referência — clique para desmarcar" : "Marcar como referência"}
                          className={`absolute top-1 right-1 h-11 w-11 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-[14px] transition-colors ${
                            post.referencia
                              ? "bg-[var(--warning)] text-white"
                              : "bg-black/50 text-white hover:bg-black/70"
                          }`}
                        >
                          {post.referencia ? "★" : "☆"}
                        </button>
                      ) : post.referencia ? (
                        <span aria-label="Referência" title="Referência" className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center text-[14px] bg-[var(--warning)] text-white">
                          ★
                        </span>
                      ) : null}
                    </div>

                    <div className="p-2 space-y-1.5">
                      <p className="text-[12px] text-[var(--text-muted)]">{dataCurta(post.publicadoEm) || "sem data"}</p>
                      {post.caption && (
                        <p className="text-[12px] text-[var(--text-secondary)] leading-snug line-clamp-1">{post.caption}</p>
                      )}
                      <p className="mono-num text-[12px] text-[var(--text-secondary)] flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{formatarMetrica(post.likeCount)} curtidas</span>
                        <span>{formatarMetrica(post.commentsCount)} coment.</span>
                        <span>{formatarMetrica(post.alcance)} alcance</span>
                      </p>

                      {podeEditar ? (
                        <>
                          {modoCustom ? (
                            <input
                              type="text"
                              aria-label="Nome da família de layout"
                              defaultValue={post.familiaLayout ?? ""}
                              placeholder="Nome da família"
                              onBlur={(e) => void atualizarPost(post, { familiaLayout: e.target.value.trim() || null })}
                              className="w-full h-11 sm:h-9 px-2 text-[16px] sm:text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[6px] outline-none focus:border-[var(--navy)] focus:bg-white"
                            />
                          ) : (
                            <select
                              aria-label="Família de layout"
                              value={post.familiaLayout ?? ""}
                              onChange={(e) => {
                                if (e.target.value === OUTRA) {
                                  setFamiliaCustomAberta((s) => new Set(s).add(post.id));
                                  return;
                                }
                                void atualizarPost(post, { familiaLayout: e.target.value || null });
                              }}
                              className="w-full h-11 sm:h-9 px-2 text-[16px] sm:text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[6px] outline-none focus:border-[var(--navy)] focus:bg-white"
                            >
                              <option value="">Livre (sem família)</option>
                              {FAMILIAS_PRESET.map((f) => <option key={f} value={f}>{f}</option>)}
                              <option value={OUTRA}>Outra…</option>
                            </select>
                          )}
                        </>
                      ) : (
                        <p className="text-[12px] text-[var(--text-muted)]">
                          Família: {post.familiaLayout || <em className="text-[var(--text-subtle)]">livre</em>}
                        </p>
                      )}

                      {errosPorPost[post.id] && (
                        <p role="alert" className="text-[12px] text-[var(--danger)]">{errosPorPost[post.id]}</p>
                      )}

                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[12px] font-medium text-[var(--navy)] hover:underline"
                        >
                          abrir no Instagram ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
