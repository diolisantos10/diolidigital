"use client";

// DnaDaMarca — o que o acervo ENSINA sobre esta marca: paleta, tipografia,
// estilos de layout, tom de voz, pilares, melhores horários e o top 10. Cada
// traço aponta "de onde veio" (os posts do Acervo que o sustentam) sempre que
// o contrato carrega essa proveniência — nunca inventamos uma origem que a
// rota não devolveu.
//
// Fonte: GET/PUT /api/agency/clients/{id}/dna, POST .../dna/gerar (master),
// POST .../dna/vigente (master). As miniaturas de origem cruzam com
// GET .../acervo (melhor esforço: se essa leitura falhar, o traço continua
// visível, só sem a miniatura — nunca um "erro" bloqueando o DNA inteiro).

import { useCallback, useEffect, useState } from "react";
import { formatarNumeroCompacto } from "@/lib/agency/portal/resultados";

interface EstiloDeLayout { nome: string; descricao: string; posts: string[] }
interface PilarDna { nome: string; posts: string[] }
interface HorarioDna { diaDaSemana: number | string; hora: number | string; engajamentoMedio: number; amostras: number }
interface Top10Item { acervoPostId: string; engajamento: number; permalink: string | null }

interface ConteudoDna {
  paleta: string[] | "preciso confirmar";
  tipografia: unknown;
  estilosDeLayout: EstiloDeLayout[];
  tomDeVoz: unknown;
  pilares: PilarDna[];
  melhoresHorarios: HorarioDna[];
  top10: Top10Item[];
  observacoes?: string;
}

/** O rascunho de edição SEMPRE trabalha com paleta como array — a literal
 *  "preciso confirmar" só existe na LEITURA. `abrirEdicao` normaliza na
 *  entrada; `salvar` devolve a união ao montar o corpo do PUT. Sem este tipo
 *  à parte, `draft.paleta.map(...)` não compila (string não tem `.map`). */
interface ConteudoDnaDraft extends Omit<ConteudoDna, "paleta"> { paleta: string[] }

interface Vigente { versao: number; conteudo: ConteudoDna }
interface VersaoHistorico { versao: number; status: string; geradoPor: string; createdAt: string }

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "vazio" }
  | { fase: "ok"; vigente: Vigente | null; versoes: VersaoHistorico[] };

interface AcervoMini { thumbUrl: string | null; permalink: string | null }

const PRECISA_CONFIRMAR = "preciso confirmar";
const DIAS_CURTOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function ehPrecisaConfirmar(v: unknown): v is typeof PRECISA_CONFIRMAR {
  return v === PRECISA_CONFIRMAR;
}

function rotuloDia(d: number | string): string {
  if (typeof d === "number") return DIAS_CURTOS[d] ?? `dia ${d}`;
  const n = Number(d);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return DIAS_CURTOS[n];
  return d || "dia não identificado";
}

function rotuloHora(h: number | string): string {
  if (typeof h === "number") return `${h}h`;
  const m = /^(\d{1,2})/.exec(h.trim());
  return m ? `${Number(m[1])}h` : h || "—";
}

function fraseHorario(h: HorarioDna): string {
  const amostra = h.amostras === 1 ? "1 post" : `${h.amostras} posts`;
  const engaj = formatarNumeroCompacto(h.engajamentoMedio) ?? String(h.engajamentoMedio);
  return `${rotuloDia(h.diaDaSemana)}, ${rotuloHora(h.hora)} — ${engaj} interações em média, ${amostra}`;
}

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Chip de proveniência — miniatura quando o Acervo devolveu a mídia (§7.8:
 *  nunca ícone quebrado), texto cru quando a leitura do Acervo não deu certo. */
function PostDeOrigem({ id, acervoMapa }: { id: string; acervoMapa: Map<string, AcervoMini> | null }) {
  const info = acervoMapa?.get(id);
  const conteudo = info?.thumbUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={info.thumbUrl} alt="" loading="lazy" className="w-8 h-8 rounded-[6px] object-cover border border-[var(--border)]" />
  ) : (
    <span className="w-8 h-8 rounded-[6px] bg-[var(--accent)] flex items-center justify-center text-[12px] text-[var(--text-subtle)]">
      post
    </span>
  );
  return info?.permalink ? (
    <a href={info.permalink} target="_blank" rel="noreferrer" title="Abrir post de origem" className="shrink-0">
      {conteudo}
    </a>
  ) : (
    <span className="shrink-0" title={acervoMapa ? "Post não encontrado no acervo" : "Detalhe do post indisponível"}>
      {conteudo}
    </span>
  );
}

function DeOndeVeio({ ids, acervoMapa }: { ids: string[]; acervoMapa: Map<string, AcervoMini> | null }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      <span className="text-[12px] uppercase tracking-[0.05em] text-[var(--text-muted)] mr-0.5">de onde veio</span>
      {ids.map((id) => <PostDeOrigem key={id} id={id} acervoMapa={acervoMapa} />)}
    </div>
  );
}

export default function DnaDaMarca({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [acervoMapa, setAcervoMapa] = useState<Map<string, AcervoMini> | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState<ConteudoDnaDraft | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [promovendo, setPromovendo] = useState<number | null>(null);
  const [erroPromover, setErroPromover] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/dna`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar o DNA agora." }); return; }
      const vigente: Vigente | null = j.vigente ?? null;
      const versoes: VersaoHistorico[] = Array.isArray(j.versoes) ? j.versoes : [];
      if (!vigente && versoes.length === 0) { setEstado({ fase: "vazio" }); return; }
      setEstado({ fase: "ok", vigente, versoes });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  // Melhor esforço: as miniaturas de origem vêm do Acervo. Se esta leitura
  // falhar, o DNA continua de pé — só sem miniatura, nunca em erro por causa
  // de uma leitura auxiliar.
  const buscarAcervo = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/acervo`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.posts)) return;
      const mapa = new Map<string, AcervoMini>();
      for (const p of j.posts) mapa.set(p.id, { thumbUrl: p.thumbUrl ?? null, permalink: p.permalink ?? null });
      setAcervoMapa(mapa);
    } catch {
      // silencioso — melhor esforço.
    }
  }, [clientId]);

  useEffect(() => { void buscar(); void buscarAcervo(); }, [buscar, buscarAcervo, tentativa]);

  async function gerar() {
    setGerando(true);
    setErroGerar(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/dna/gerar`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErroGerar(j.motivo || "Não consegui gerar o DNA agora."); return; }
      await buscar();
    } catch {
      setErroGerar("Falha de rede ao gerar. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  function abrirEdicao(conteudo: ConteudoDna) {
    const paletaAtual = conteudo.paleta;
    setDraft({
      ...conteudo,
      paleta: ehPrecisaConfirmar(paletaAtual) ? [] : [...paletaAtual],
      estilosDeLayout: conteudo.estilosDeLayout.map((e) => ({ ...e })),
      pilares: conteudo.pilares.map((p) => ({ ...p })),
    });
    setErroSalvar(null);
    setEditando(true);
  }

  async function salvar() {
    if (!draft) return;
    setSalvando(true);
    setErroSalvar(null);
    try {
      const paletaFinal = draft.paleta.length === 0 ? PRECISA_CONFIRMAR : draft.paleta;
      const corpo: ConteudoDna = {
        ...draft,
        paleta: paletaFinal,
        estilosDeLayout: draft.estilosDeLayout.filter((e) => e.nome.trim() !== ""),
        pilares: draft.pilares.filter((p) => p.nome.trim() !== ""),
      };
      const r = await fetch(`/api/agency/clients/${clientId}/dna`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conteudo: corpo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErroSalvar(j.error || j.motivo || "Não consegui salvar agora."); return; }
      setAviso(`Salvo — versão ${j.versao} criada.`);
      setEditando(false);
      setDraft(null);
      await buscar();
      setTimeout(() => setAviso(null), 5000);
    } catch {
      setErroSalvar("Falha de rede ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function tornarVigente(versao: number) {
    setPromovendo(versao);
    setErroPromover(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/dna/vigente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versao }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErroPromover(j.error || j.motivo || "Não consegui tornar esta versão vigente."); return; }
      await buscar();
    } catch {
      setErroPromover("Falha de rede. Tente de novo.");
    } finally {
      setPromovendo(null);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">DNA da marca</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">O que o acervo ensina — paleta, tom, pilares e horários.</p>
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-[12px] text-[var(--success)] font-medium">✓ {aviso}</span>}
          {podeEditar && estado.fase === "ok" && !editando && (
            <>
              <button
                onClick={() => void gerar()}
                disabled={gerando}
                className="h-11 sm:h-8 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors disabled:opacity-60"
              >
                {gerando ? "Gerando…" : "Gerar DNA do acervo"}
              </button>
              {estado.vigente && (
                <button
                  onClick={() => abrirEdicao(estado.vigente!.conteudo)}
                  className="h-11 sm:h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  Editar
                </button>
              )}
            </>
          )}
          {!podeEditar && (
            <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]" title="Só quem é master gera e edita o DNA">
              Leitura
            </span>
          )}
        </div>
      </div>

      {erroGerar && (
        <p role="alert" className="mx-5 mt-3 text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroGerar}</p>
      )}

      {/* ── Carregando ─────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-3">
          <div className="h-24 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <div className="h-24 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando o DNA da marca…</span>
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

      {/* ── Vazio — nunca gerado ───────────────────────────────────────── */}
      {estado.fase === "vazio" && (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">DNA ainda não gerado</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
            Importe o acervo primeiro — o DNA é a leitura dele.
          </p>
          {podeEditar ? (
            <button
              onClick={() => void gerar()}
              disabled={gerando}
              className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {gerando ? "Gerando…" : "Gerar DNA do acervo"}
            </button>
          ) : (
            <p className="text-[12px] text-[var(--text-subtle)] mt-2 italic">Só quem é master gera o DNA.</p>
          )}
        </div>
      )}

      {/* ── Leitura / edição ───────────────────────────────────────────── */}
      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-4">
          {!estado.vigente && (
            <p className="text-[13px] text-[var(--warning)] bg-[var(--warning-bg)] rounded-[8px] px-3 py-2">
              Nenhuma versão vigente ainda — escolha uma abaixo, em Histórico, e torne vigente.
            </p>
          )}

          {editando && draft ? (
            <EdicaoDeDna
              draft={draft}
              setDraft={setDraft}
              erroSalvar={erroSalvar}
              salvando={salvando}
              onCancelar={() => { setEditando(false); setDraft(null); setErroSalvar(null); }}
              onSalvar={() => void salvar()}
            />
          ) : estado.vigente ? (
            <LeituraDeDna conteudo={estado.vigente.conteudo} acervoMapa={acervoMapa} />
          ) : null}

          {/* ── Histórico — nunca apaga ──────────────────────────────── */}
          <div className="pt-2 border-t border-[var(--border)]">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-2">
              Histórico de versões
            </h3>
            {erroPromover && (
              <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2 mb-2">{erroPromover}</p>
            )}
            {estado.versoes.length === 0 ? (
              <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma versão registrada.</p>
            ) : (
              <ul className="space-y-1.5">
                {estado.versoes.map((v) => {
                  const ehVigente = estado.vigente?.versao === v.versao;
                  return (
                    <li key={v.versao} className="flex items-center justify-between gap-2 flex-wrap text-[13px] rounded-[8px] border border-[var(--border)] px-3 py-2">
                      <span className="text-[var(--text-primary)]">
                        <b>Versão {v.versao}</b>
                        <span className="text-[var(--text-muted)]"> · {v.status} · por {v.geradoPor} · {dataCurta(v.createdAt)}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {ehVigente && (
                          <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--success-bg)] text-[var(--success)]">Vigente</span>
                        )}
                        {!ehVigente && podeEditar && (
                          <button
                            onClick={() => void tornarVigente(v.versao)}
                            disabled={promovendo === v.versao}
                            className="h-11 sm:h-8 px-2.5 rounded-[6px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-60"
                          >
                            {promovendo === v.versao ? "Aplicando…" : "Tornar vigente"}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEITURA
// ═══════════════════════════════════════════════════════════════════════════

function TraitBox({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">{titulo}</h3>
      {children}
    </div>
  );
}

function AvisoPrecisaConfirmar() {
  return (
    <p className="text-[13px] text-[var(--warning)] bg-[var(--warning-bg)] rounded-[8px] px-3 py-2 inline-block">
      Precisa confirmar
    </p>
  );
}

function ValorGenerico({ v }: { v: unknown }) {
  if (ehPrecisaConfirmar(v)) return <AvisoPrecisaConfirmar />;
  if (typeof v === "string") return <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{v}</p>;
  if (v == null) return <p className="text-[12px] text-[var(--text-subtle)] italic">não informado</p>;
  return <pre className="text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>;
}

function LeituraDeDna({ conteudo, acervoMapa }: { conteudo: ConteudoDna; acervoMapa: Map<string, AcervoMini> | null }) {
  return (
    <div className="space-y-4">
      <TraitBox titulo="Paleta">
        {ehPrecisaConfirmar(conteudo.paleta) ? (
          <AvisoPrecisaConfirmar />
        ) : conteudo.paleta.length === 0 ? (
          <p className="text-[12px] text-[var(--text-subtle)] italic">nenhuma cor definida</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {conteudo.paleta.map((cor, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)]">
                <span className="w-4 h-4 rounded-full border border-[var(--border)]" style={{ background: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cor) ? cor : "var(--accent)" }} />
                {cor}
              </span>
            ))}
          </div>
        )}
      </TraitBox>

      <TraitBox titulo="Tipografia"><ValorGenerico v={conteudo.tipografia} /></TraitBox>
      <TraitBox titulo="Tom de voz"><ValorGenerico v={conteudo.tomDeVoz} /></TraitBox>

      <TraitBox titulo="Estilos de layout">
        {conteudo.estilosDeLayout.length === 0 ? (
          <p className="text-[12px] text-[var(--text-subtle)] italic">nenhum estilo identificado</p>
        ) : (
          <div className="space-y-2.5">
            {conteudo.estilosDeLayout.map((e, i) => (
              <div key={i} className="rounded-[8px] border border-[var(--border)] px-3 py-2.5">
                <b className="text-[13px] text-[var(--text-primary)]">{e.nome}</b>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{e.descricao}</p>
                <DeOndeVeio ids={e.posts} acervoMapa={acervoMapa} />
              </div>
            ))}
          </div>
        )}
      </TraitBox>

      <TraitBox titulo="Pilares de conteúdo">
        {conteudo.pilares.length === 0 ? (
          <p className="text-[12px] text-[var(--text-subtle)] italic">nenhum pilar identificado</p>
        ) : (
          <div className="space-y-2.5">
            {conteudo.pilares.map((p, i) => (
              <div key={i} className="rounded-[8px] border border-[var(--border)] px-3 py-2.5">
                <b className="text-[13px] text-[var(--text-primary)]">{p.nome}</b>
                <DeOndeVeio ids={p.posts} acervoMapa={acervoMapa} />
              </div>
            ))}
          </div>
        )}
      </TraitBox>

      <TraitBox titulo="Melhores horários">
        {conteudo.melhoresHorarios.length === 0 ? (
          <p className="text-[12px] text-[var(--text-subtle)] italic">sem amostra suficiente</p>
        ) : (
          <ul className="space-y-1">
            {conteudo.melhoresHorarios.map((h, i) => (
              <li key={i} className="text-[13px] text-[var(--text-primary)] mono-num">{fraseHorario(h)}</li>
            ))}
          </ul>
        )}
      </TraitBox>

      <TraitBox titulo="Top 10">
        {conteudo.top10.length === 0 ? (
          <p className="text-[12px] text-[var(--text-subtle)] italic">sem posts suficientes para um ranking</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {conteudo.top10.map((t, i) => {
              const info = acervoMapa?.get(t.acervoPostId);
              const img = info?.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.thumbUrl} alt="" loading="lazy" className="w-full aspect-square object-cover rounded-[8px] border border-[var(--border)]" />
              ) : (
                <div className="w-full aspect-square rounded-[8px] bg-[var(--accent)] flex items-center justify-center text-[12px] text-[var(--text-subtle)]">post</div>
              );
              const rotulo = `#${i + 1} · ${formatarNumeroCompacto(t.engajamento) ?? t.engajamento} de engajamento`;
              const conteudoDoCard = (
                <>
                  {img}
                  <span className="absolute top-1 left-1 h-5 min-w-5 px-1 inline-flex items-center justify-center rounded-full bg-black/60 text-white text-[12px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="block text-[12px] text-[var(--text-muted)] mt-0.5 mono-num text-center">
                    {formatarNumeroCompacto(t.engajamento) ?? t.engajamento}
                  </span>
                </>
              );
              // Elemento clicável precisa ser <a>/<button> só quando existe
              // destino real (DESIGN.md §4.3) — sem permalink, é apresentação.
              return t.permalink ? (
                <a key={t.acervoPostId} href={t.permalink} target="_blank" rel="noreferrer" className="relative block" aria-label={rotulo}>
                  {conteudoDoCard}
                </a>
              ) : (
                <div key={t.acervoPostId} className="relative block" aria-label={rotulo}>
                  {conteudoDoCard}
                </div>
              );
            })}
          </div>
        )}
      </TraitBox>

      {conteudo.observacoes && (
        <TraitBox titulo="Observações">
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{conteudo.observacoes}</p>
        </TraitBox>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  EDIÇÃO — campos de texto e listas. `posts`/`melhoresHorarios`/`top10` são
//  calculados, não autorados: ficam visíveis e travados, nunca editáveis aqui.
// ═══════════════════════════════════════════════════════════════════════════

function EdicaoDeDna({
  draft, setDraft, erroSalvar, salvando, onCancelar, onSalvar,
}: {
  draft: ConteudoDnaDraft;
  setDraft: (d: ConteudoDnaDraft) => void;
  erroSalvar: string | null;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const [corNova, setCorNova] = useState("#");

  function adicionarCor() {
    const c = corNova.trim();
    if (!c) return;
    setDraft({ ...draft, paleta: [...draft.paleta, c] });
    setCorNova("#");
  }
  function removerCor(i: number) {
    setDraft({ ...draft, paleta: draft.paleta.filter((_, x) => x !== i) });
  }

  function adicionarEstilo() {
    setDraft({ ...draft, estilosDeLayout: [...draft.estilosDeLayout, { nome: "", descricao: "", posts: [] }] });
  }
  function atualizarEstilo(i: number, patch: Partial<EstiloDeLayout>) {
    setDraft({ ...draft, estilosDeLayout: draft.estilosDeLayout.map((e, x) => (x === i ? { ...e, ...patch } : e)) });
  }
  function removerEstilo(i: number) {
    setDraft({ ...draft, estilosDeLayout: draft.estilosDeLayout.filter((_, x) => x !== i) });
  }

  function adicionarPilar() {
    setDraft({ ...draft, pilares: [...draft.pilares, { nome: "", posts: [] }] });
  }
  function atualizarPilar(i: number, nome: string) {
    setDraft({ ...draft, pilares: draft.pilares.map((p, x) => (x === i ? { ...p, nome } : p)) });
  }
  function removerPilar(i: number) {
    setDraft({ ...draft, pilares: draft.pilares.filter((_, x) => x !== i) });
  }

  const tipografiaEditavel = typeof draft.tipografia === "string" || draft.tipografia == null || ehPrecisaConfirmar(draft.tipografia);
  const tomDeVozEditavel = typeof draft.tomDeVoz === "string" || draft.tomDeVoz == null || ehPrecisaConfirmar(draft.tomDeVoz);

  return (
    <div className="space-y-4">
      <TraitBox titulo="Paleta">
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.paleta.map((cor, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-1 rounded-full border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)]">
              <span className="w-4 h-4 rounded-full border border-[var(--border)] ml-1" style={{ background: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cor) ? cor : "var(--accent)" }} />
              {cor}
              <button type="button" onClick={() => removerCor(i)} aria-label={`Remover ${cor}`} className="w-6 h-6 rounded-full hover:bg-[var(--accent)] text-[var(--text-muted)]">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Nova cor da paleta (hex)"
            value={corNova}
            onChange={(e) => setCorNova(e.target.value)}
            placeholder="#0057FF"
            className="h-11 sm:h-9 w-32 px-2.5 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
          />
          <button type="button" onClick={adicionarCor} className="h-11 sm:h-9 px-3 rounded-[7px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
            + Adicionar cor
          </button>
        </div>
        {draft.paleta.length === 0 && (
          <p className="text-[12px] text-[var(--text-subtle)] mt-1.5 italic">Sem nenhuma cor, ao salvar volta para &quot;precisa confirmar&quot;.</p>
        )}
      </TraitBox>

      <TraitBox titulo="Tipografia">
        {tipografiaEditavel ? (
          <textarea
            aria-label="Tipografia"
            value={ehPrecisaConfirmar(draft.tipografia) || draft.tipografia == null ? "" : String(draft.tipografia)}
            onChange={(e) => setDraft({ ...draft, tipografia: e.target.value })}
            placeholder="Ex.: Sora para títulos, Inter para corpo"
            rows={2}
            className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y"
          />
        ) : (
          <p className="text-[12px] text-[var(--text-subtle)] italic">Formato não editável por este formulário.</p>
        )}
      </TraitBox>

      <TraitBox titulo="Tom de voz">
        {tomDeVozEditavel ? (
          <textarea
            aria-label="Tom de voz"
            value={ehPrecisaConfirmar(draft.tomDeVoz) || draft.tomDeVoz == null ? "" : String(draft.tomDeVoz)}
            onChange={(e) => setDraft({ ...draft, tomDeVoz: e.target.value })}
            placeholder="Ex.: direto, acolhedor, sem jargão"
            rows={2}
            className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y"
          />
        ) : (
          <p className="text-[12px] text-[var(--text-subtle)] italic">Formato não editável por este formulário.</p>
        )}
      </TraitBox>

      <TraitBox titulo="Estilos de layout">
        <div className="space-y-2.5">
          {draft.estilosDeLayout.map((e, i) => (
            <div key={i} className="rounded-[8px] border border-[var(--border)] px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  aria-label="Nome do estilo"
                  value={e.nome}
                  onChange={(ev) => atualizarEstilo(i, { nome: ev.target.value })}
                  placeholder="Nome do estilo"
                  className="flex-1 h-11 sm:h-8 px-2.5 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[6px] outline-none focus:border-[var(--navy)] focus:bg-white"
                />
                <button type="button" onClick={() => removerEstilo(i)} aria-label="Remover estilo" className="h-11 w-11 sm:h-8 sm:w-8 shrink-0 rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--accent)]">×</button>
              </div>
              <textarea
                aria-label="Descrição do estilo"
                value={e.descricao}
                onChange={(ev) => atualizarEstilo(i, { descricao: ev.target.value })}
                placeholder="Descrição"
                rows={2}
                className="w-full px-2.5 py-1.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[6px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y"
              />
              {e.posts.length > 0 && <p className="text-[12px] text-[var(--text-subtle)] italic">proveniência calculada, não editável ({e.posts.length} post{e.posts.length === 1 ? "" : "s"})</p>}
            </div>
          ))}
        </div>
        <button type="button" onClick={adicionarEstilo} className="mt-2 h-11 sm:h-8 px-3 rounded-[7px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
          + Adicionar estilo
        </button>
      </TraitBox>

      <TraitBox titulo="Pilares de conteúdo">
        <div className="space-y-2">
          {draft.pilares.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label="Nome do pilar"
                value={p.nome}
                onChange={(ev) => atualizarPilar(i, ev.target.value)}
                placeholder="Nome do pilar"
                className="flex-1 h-11 sm:h-9 px-2.5 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
              {p.posts.length > 0 && <span className="text-[12px] text-[var(--text-subtle)] shrink-0">{p.posts.length} post{p.posts.length === 1 ? "" : "s"}</span>}
              <button type="button" onClick={() => removerPilar(i)} aria-label="Remover pilar" className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] text-[var(--text-muted)] hover:bg-[var(--accent)]">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={adicionarPilar} className="mt-2 h-11 sm:h-8 px-3 rounded-[7px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
          + Adicionar pilar
        </button>
      </TraitBox>

      <TraitBox titulo="Melhores horários">
        <p className="text-[12px] text-[var(--text-subtle)] italic">Calculado a partir do acervo — não editável aqui.</p>
      </TraitBox>
      <TraitBox titulo="Top 10">
        <p className="text-[12px] text-[var(--text-subtle)] italic">Calculado a partir do acervo — não editável aqui.</p>
      </TraitBox>

      <TraitBox titulo="Observações">
        <textarea
          aria-label="Observações"
          value={draft.observacoes ?? ""}
          onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y"
        />
      </TraitBox>

      {erroSalvar && (
        <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroSalvar}</p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
        <button
          onClick={onSalvar}
          disabled={salvando}
          className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-semibold bg-[var(--navy)] text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {salvando ? "Salvando…" : "Salvar (cria nova versão)"}
        </button>
        <button
          onClick={onCancelar}
          disabled={salvando}
          className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
