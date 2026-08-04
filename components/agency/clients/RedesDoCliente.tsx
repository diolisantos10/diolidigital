"use client";

// RedesDoCliente — as métricas reais do Instagram do cliente, na ficha da
// agência. Mesmos números do portal (mesma camada de leitura, mesma
// formatação em lib/agency/portal/resultados) + o que só a equipe precisa:
// a lista dos posts recentes com as métricas de cada um.
//
// Fontes: /api/meta/insights?clientId&posts=1 (conta + métricas por mídia) e
// /api/meta/feed?clientId (legenda/miniatura dos mesmos posts — o insights
// devolve métrica por mediaId, o feed dá o rosto de cada post).

import { useEffect, useState } from "react";
import { GraficoDeAlcance } from "@/components/portal/GraficoDeAlcance";
import {
  formatarNumeroCompacto,
  formatarPeriodo,
  type PontoDeAlcance,
} from "@/lib/agency/portal/resultados";

interface ContaMedida {
  perfil: { seguidores: number | null; totalDePosts: number | null };
  periodo: { desde: string; ate: string };
  totais: {
    alcance: number | null;
    visualizacoes: number | null;
    contasComEngajamento: number | null;
    interacoes: number | null;
  };
  aviso?: string;
}

interface MetricasDoPost {
  mediaId: string;
  tipo: string | null;
  metricas: Record<string, number>;
  erro: string | null;
}

interface PostDoFeed {
  id: string;
  caption: string | null;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string | null;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "sem-conexao" }
  | { fase: "reconectar" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; conta: ContaMedida; serie: PontoDeAlcance[]; posts: MetricasDoPost[]; feed: Map<string, PostDoFeed> };

const NUMEROS: { chave: keyof ContaMedida["totais"]; rotulo: string }[] = [
  { chave: "alcance",              rotulo: "Alcance" },
  { chave: "visualizacoes",        rotulo: "Visualizações" },
  { chave: "contasComEngajamento", rotulo: "Contas engajadas" },
  { chave: "interacoes",           rotulo: "Interações" },
];

// As métricas por post que valem linha na tabela, na ordem de leitura.
const COLUNAS_DO_POST: { chave: string; rotulo: string }[] = [
  { chave: "reach",    rotulo: "alcance" },
  { chave: "views",    rotulo: "views" },
  { chave: "likes",    rotulo: "curtidas" },
  { chave: "comments", rotulo: "coment." },
  { chave: "saved",    rotulo: "salvos" },
];

function dataDoPost(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function RedesDoCliente({ clientId }: { clientId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  // O retry incrementa e o effect re-busca — o estado já nasce "carregando",
  // então o effect nunca seta estado de forma síncrona.
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const [insightsRes, feedRes] = await Promise.all([
          fetch(`/api/meta/insights?clientId=${encodeURIComponent(clientId)}&posts=1`, { cache: "no-store" }),
          fetch(`/api/meta/feed?clientId=${encodeURIComponent(clientId)}&limit=12`, { cache: "no-store" }),
        ]);
        const insights = await insightsRes.json().catch(() => null);
        if (!ativo) return;
        if (!insightsRes.ok || !insights) {
          setEstado({ fase: "erro", mensagem: "Não consegui ler as métricas agora." });
          return;
        }
        if (!insights.ok) {
          if (insights.semConexao) setEstado({ fase: "sem-conexao" });
          else if (insights.precisaReconectar) setEstado({ fase: "reconectar" });
          else setEstado({ fase: "erro", mensagem: insights.error ?? "Não consegui ler as métricas agora." });
          return;
        }
        // O feed é enriquecimento: se falhar, os números da conta ficam de pé.
        const feed = new Map<string, PostDoFeed>();
        const feedJson = feedRes.ok ? await feedRes.json().catch(() => null) : null;
        if (!ativo) return;
        if (feedJson?.ok && Array.isArray(feedJson.feed)) {
          for (const p of feedJson.feed as PostDoFeed[]) feed.set(p.id, p);
        }
        setEstado({
          fase: "ok",
          conta: insights.conta,
          serie: Array.isArray(insights.serie) ? insights.serie : [],
          posts: Array.isArray(insights.posts) ? insights.posts : [],
          feed,
        });
      } catch {
        if (ativo) setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
      }
    })();
    return () => { ativo = false; };
  }, [clientId, tentativa]);

  const tentarDeNovo = () => {
    setEstado({ fase: "carregando" });
    setTentativa((t) => t + 1);
  };

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Redes
          {estado.fase === "ok" && (
            <span className="ml-2 text-[12px] font-normal text-[var(--text-muted)]">
              Instagram · {formatarPeriodo(estado.conta.periodo.desde, estado.conta.periodo.ate)}
            </span>
          )}
        </h2>
        {estado.fase === "ok" && formatarNumeroCompacto(estado.conta.perfil.seguidores) && (
          <span className="text-[12px] text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">{formatarNumeroCompacto(estado.conta.perfil.seguidores)}</b> seguidores
          </span>
        )}
      </div>

      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-[8px] bg-[var(--accent)] animate-pulse" />
            ))}
          </div>
          <div className="h-24 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando métricas…</span>
        </div>
      )}

      {estado.fase === "sem-conexao" && (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Este cliente ainda não conectou o Instagram</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
            A conexão é feita pelo cliente, na seção Conta do portal dele. Assim que autorizar, os números aparecem aqui.
          </p>
        </div>
      )}

      {estado.fase === "reconectar" && (
        <div className="px-5 py-4">
          <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[12.5px] text-[#92400E]">
            <b>Token da Meta vencido.</b> Peça ao cliente para reconectar o Instagram no portal (seção Conta) — sem isso, leitura e publicação ficam paradas.
          </div>
        </div>
      )}

      {estado.fase === "erro" && (
        <div role="alert" className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
          <button
            onClick={tentarDeNovo}
            className="mt-3 h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-4">
          {estado.conta.aviso && (
            <div className="rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2 text-[12px] text-[#92400E]">
              <b>Medição parcial:</b> {estado.conta.aviso}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {NUMEROS.map(({ chave, rotulo }) => {
              const valor = formatarNumeroCompacto(estado.conta.totais[chave]);
              return (
                <div key={chave} className="rounded-[8px] border border-[var(--border)] px-3.5 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{rotulo}</div>
                  {valor != null ? (
                    <div className="mono-num text-[20px] font-bold leading-none text-[var(--text-primary)] mt-1.5">{valor}</div>
                  ) : (
                    <div className="text-[12px] font-medium text-[var(--text-muted)] mt-1.5">não medido</div>
                  )}
                </div>
              );
            })}
          </div>

          <GraficoDeAlcance serie={estado.serie} />

          {estado.posts.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-2">
                Posts recentes ({estado.posts.length})
              </h3>
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {estado.posts.map((p) => {
                  const post = estado.feed.get(p.mediaId);
                  const capa = post?.thumbnail_url ?? post?.media_url ?? null;
                  return (
                    <div key={p.mediaId} className="flex items-start gap-3 py-2.5">
                      {capa ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={capa} alt="" loading="lazy" className="w-10 h-10 rounded-[7px] object-cover border border-[var(--border)] shrink-0" />
                      ) : (
                        <span aria-hidden className="w-10 h-10 rounded-[7px] bg-[var(--accent)] flex items-center justify-center text-[13px] shrink-0">🖼️</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] text-[var(--text-primary)] leading-snug line-clamp-1">
                          {post?.caption || <span className="italic text-[var(--text-muted)]">sem legenda</span>}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {[p.tipo === "REELS" ? "Reels" : p.tipo === "STORY" ? "Story" : "Feed", dataDoPost(post?.timestamp ?? null)].filter(Boolean).join(" · ")}
                        </p>
                        {p.erro ? (
                          <p className="text-[11px] text-[var(--text-muted)] mt-1 italic">métricas indisponíveis para este post</p>
                        ) : (
                          <p className="mono-num text-[11px] text-[var(--text-secondary)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {COLUNAS_DO_POST.filter(({ chave }) => p.metricas[chave] != null).map(({ chave, rotulo }) => (
                              <span key={chave}>
                                <b className="text-[var(--text-primary)]">{formatarNumeroCompacto(p.metricas[chave])}</b> {rotulo}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                      {post?.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[11px] font-medium text-[var(--navy)] hover:underline"
                        >
                          abrir ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
