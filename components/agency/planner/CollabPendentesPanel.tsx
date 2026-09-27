"use client";

// CollabPendentesPanel — os convites de COLABORAÇÃO (1C-C1) que a Meta ainda
// não confirmou. A Graph API não tem endpoint para ACEITAR um convite — só o
// painel do Instagram faz isso — então este painel é a visibilidade que falta:
// quem opera vê qual post, qual cliente e quais contas seguem com o convite
// pendente, para ir cutucar o colaborador fora da API.
//
// Fonte: GET /api/social-posts/collab-pendentes (qualquer papel de agência) e
// POST /api/social-posts/{id}/collab/conferir (só master — reconferir gasta
// uma chamada de rede à Meta).

import { useCallback, useEffect, useState } from "react";
import { CascaDeModal } from "./CascaDeModal";
import EmptyState from "@/components/agency/ui/EmptyState";

interface ConviteDeColaborador {
  username: string;
  invite_status: string;
}

interface PostComConvite {
  postId: string;
  clientId: string | null;
  cliente: string | null;
  permalink: string | null;
  publicadoEm: string | null;
  contas: ConviteDeColaborador[];
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; posts: PostComConvite[] };

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** As contas ainda pendentes deste post — a mesma régua de `convitePendente`
 *  (`lib/integrations/meta/collab.ts`), espelhada aqui: o painel só precisa
 *  saber "pendente ou não", nunca o restante do enum da Meta. */
function pendente(c: ConviteDeColaborador): boolean {
  return c.invite_status?.toLowerCase() === "pending";
}

export function CollabPendentesPanel({ ehMaster, onClose }: { ehMaster: boolean; onClose: () => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [conferindo, setConferindo] = useState<Set<string>>(new Set());
  const [erroPorPost, setErroPorPost] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch("/api/social-posts/collab-pendentes", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar os convites agora." }); return; }
      setEstado({ fase: "ok", posts: Array.isArray(j.posts) ? j.posts : [] });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function conferirDeNovo(postId: string) {
    setConferindo((s) => new Set(s).add(postId));
    setErroPorPost((e) => { const n = { ...e }; delete n[postId]; return n; });
    try {
      const r = await fetch(`/api/social-posts/${postId}/collab/conferir`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        setErroPorPost((e) => ({ ...e, [postId]: typeof j.error === "string" ? j.error : "Não consegui reconferir agora." }));
        return;
      }
      // A fonte de verdade é o servidor: refaz a lista inteira para refletir
      // convites aceitos (o post some sozinho quando não sobra pendência).
      await carregar();
    } catch {
      setErroPorPost((e) => ({ ...e, [postId]: "Falha de rede ao reconferir. Tente de novo." }));
    } finally {
      setConferindo((s) => { const n = new Set(s); n.delete(postId); return n; });
    }
  }

  const posts = estado.fase === "ok" ? estado.posts : [];

  return (
    <CascaDeModal
      titulo="Convites de collab pendentes"
      descricao="Contas que ainda não aceitaram a colaboração no Instagram."
      onClose={onClose}
      largura="640px"
    >
      <div className="px-5 py-4">
        {estado.fase === "carregando" && (
          <div role="status" aria-live="polite" className="space-y-2">
            <span className="sr-only">Carregando os convites pendentes…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[12px] bg-[var(--accent)]" />
            ))}
          </div>
        )}

        {estado.fase === "erro" && (
          <div role="alert" className="py-8 text-center">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
            <button
              onClick={() => void carregar()}
              className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {estado.fase === "ok" && posts.length === 0 && (
          <EmptyState
            icon={<span aria-hidden="true">🤝</span>}
            title="Nenhum convite pendente"
            description="Quando uma peça sair com colaboradores marcados, os convites ainda esperando aceite aparecem aqui."
          />
        )}

        {estado.fase === "ok" && posts.length > 0 && (
          <ul className="space-y-2.5">
            {posts.map((p) => {
              const pendentes = p.contas.filter(pendente);
              return (
                <li key={p.postId} className="rounded-[12px] border border-[var(--border)] px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {p.cliente ?? "Sem cliente"}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                        Publicado em {dataCurta(p.publicadoEm)}
                        {p.permalink && (
                          <>
                            {" · "}
                            <a
                              href={p.permalink}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[var(--info)] hover:underline"
                            >
                              Ver post ↗
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    {ehMaster && (
                      <button
                        type="button"
                        onClick={() => void conferirDeNovo(p.postId)}
                        disabled={conferindo.has(p.postId)}
                        className="h-11 sm:h-9 shrink-0 rounded-[8px] px-3 text-[12px] font-semibold text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
                        style={{ touchAction: "manipulation" }}
                      >
                        {conferindo.has(p.postId) ? "Conferindo…" : "Conferir de novo"}
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(pendentes.length > 0 ? pendentes : p.contas).map((c, i) => (
                      <span
                        key={`${c.username}-${i}`}
                        className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium"
                        style={pendente(c)
                          ? { background: "var(--warning-bg)", color: "var(--warning)" }
                          : { background: "var(--success-bg)", color: "var(--success)" }}
                      >
                        @{c.username}
                        <span aria-hidden>·</span>
                        {c.invite_status}
                      </span>
                    ))}
                  </div>

                  {erroPorPost[p.postId] && (
                    <p role="alert" className="text-[12px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2 mt-2">
                      {erroPorPost[p.postId]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CascaDeModal>
  );
}
