"use client";

// ─── AnalistaDeSocial — a semana de TODAS as marcas, num cartão por cliente ──
//
// Consome `GET /api/social/analises` (sem `clientId` → todas as marcas) e
// `POST /api/social/analises/{id}/aplicar|descartar|rodar`. A rota ainda está
// sendo escrita em paralelo (ficha do motor) — até ela existir, o fetch cai no
// estado de ERRO abaixo, que é o comportamento correto e honesto: a tela não
// finge que há uma semana analisada quando não há como confirmar isso.
//
// Payload tratado como rede não confiável (§7.5 do DESIGN.md): todo campo
// opcional tem fallback, nenhum `.map`/`.length` roda sobre algo que não foi
// primeiro conferido como array.

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/agency/ui/EmptyState";
import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";

// ─── O contrato ───────────────────────────────────────────────────────────────

interface Evidencia {
  metrica: string;
  valor: number | null;
  mediaDaMarca: number | null;
}

interface ItemDeAnalise {
  socialPostId: string;
  porque: string;
  evidencia: Evidencia;
}

// O motor (`lib/agency/esteira/analista-semanal.ts`, ficha paralela) grava
// dois FORMATOS de ajuste — `peso_pilar` (evidência: lista de posts) e
// `horario` (evidência: amostras + engajamento médio do acervo, SEM post
// nenhum). O contrato desta ficha descreve uma forma genérica
// `{tipo, descricao, evidencia:{postIds, metrica}}`; a API que ainda vai
// nascer pode tanto achatar o motor nessa forma quanto repassar os campos
// nativos. Este tipo aceita os três, e a renderização (`tituloDoAjuste`/
// `evidenciaDoAjusteTexto`) nunca presume qual chegou — ela lê o que existe e
// nunca `.length` de `undefined`.
interface AjusteProposto {
  tipo: string;
  descricao?: string;
  porque?: string;
  pilar?: string;
  direcao?: "aumentar" | "diminuir";
  diaDaSemana?: number;
  hora?: string;
  evidencia?: {
    postIds?: string[];
    posts?: string[];
    metrica?: string;
    amostras?: number;
    engajamentoMedio?: number;
  };
}

type StatusDaAnalise = "proposta" | "aplicada" | "descartada";

interface AnaliseSemanal {
  id: string;
  clientId: string;
  cliente: string;
  semanaDe: string;
  semanaAte: string;
  status: StatusDaAnalise;
  relatorio: string;
  funcionou: ItemDeAnalise[];
  naoFuncionou: ItemDeAnalise[];
  ajustes: AjusteProposto[];
  dnaPropostoVersao: number | null;
}

// ─── Tradução para gente ──────────────────────────────────────────────────────

const ROTULO_DA_METRICA: Record<string, string> = {
  alcance: "Alcance",
  salvos: "Salvos",
  compartilhamentos: "Compartilhamentos",
  comentarios: "Comentários",
  cliques: "Cliques",
  curtidas: "Curtidas",
  engajamento: "Engajamento",
};

function rotuloDaMetrica(m: string): string {
  if (!m) return "Métrica";
  return ROTULO_DA_METRICA[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
}

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR");
}

// Data-only ISO ("2026-09-22") vira meia-noite LOCAL, não UTC — o mesmo
// ajuste já usado em `EntradaDeMaterial.tsx`. Sem ele, quem está a oeste de
// Greenwich lê o dia anterior.
function formatarDataCurta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** O rótulo do ajuste — nunca o slug cru (`peso_pilar`, `horario`) na tela. */
function tituloDoAjuste(aj: AjusteProposto): string {
  if (aj.tipo === "peso_pilar") {
    const direcao = aj.direcao === "diminuir" ? "diminuir peso" : "aumentar peso";
    return aj.pilar ? `Pilar "${aj.pilar}" · ${direcao}` : capitalizar(direcao);
  }
  if (aj.tipo === "horario") {
    const dia = typeof aj.diaDaSemana === "number" ? DIA_DA_SEMANA[aj.diaDaSemana] : undefined;
    return `Novo horário${dia ? ` · ${dia}` : ""}${aj.hora ? ` às ${aj.hora}` : ""}`;
  }
  return capitalizar(aj.tipo) || "Ajuste";
}

function textoDoAjuste(aj: AjusteProposto): string {
  return aj.descricao || aj.porque || "Sem descrição registrada.";
}

/** A evidência do ajuste tem duas formas reais (posts, ou amostras do
 *  acervo) — mostra a que existir, nunca inventa a que falta. */
function evidenciaDoAjusteTexto(aj: AjusteProposto): string {
  const ev = aj.evidencia ?? {};
  const posts = ev.postIds ?? ev.posts ?? [];
  if (posts.length > 0) {
    const metrica = ev.metrica ? ` · ${rotuloDaMetrica(ev.metrica)}` : "";
    return `Baseado em ${posts.length} ${posts.length === 1 ? "peça" : "peças"}${metrica}`;
  }
  if (typeof ev.amostras === "number") {
    const media = typeof ev.engajamentoMedio === "number" ? ` · engajamento médio ${formatarNumero(ev.engajamentoMedio)}` : "";
    return `Baseado em ${ev.amostras} ${ev.amostras === 1 ? "amostra" : "amostras"} do acervo${media}`;
  }
  return "Sem evidência registrada.";
}

const ROTULO_DO_STATUS: Record<StatusDaAnalise, { texto: string; classe: string }> = {
  proposta: { texto: "Aguardando decisão", classe: "bg-[var(--warning-bg)] text-[var(--warning)]" },
  aplicada: { texto: "Aplicada", classe: "bg-[var(--success-bg)] text-[var(--success)]" },
  descartada: { texto: "Descartada", classe: "bg-[var(--accent)] text-[var(--text-muted)]" },
};

/** Uma marca pode ter mais de uma semana no array (histórico). O CEO quer A
 *  semana de cada marca — a mais recente, uma por cliente, em ordem alfabética
 *  (ordem estável, não a ordem de chegada da API). */
function maisRecentePorCliente(analises: AnaliseSemanal[]): AnaliseSemanal[] {
  const porCliente = new Map<string, AnaliseSemanal>();
  for (const a of analises) {
    const atual = porCliente.get(a.clientId);
    if (!atual || (a.semanaAte ?? "") > (atual.semanaAte ?? "")) {
      porCliente.set(a.clientId, a);
    }
  }
  return [...porCliente.values()].sort((a, b) =>
    (a.cliente ?? "").localeCompare(b.cliente ?? "", "pt-BR"),
  );
}

// ─── A tela ───────────────────────────────────────────────────────────────────

export function AnalistaDeSocial({ ehMaster, clientId }: { ehMaster: boolean; clientId?: string }) {
  const [analises, setAnalises] = useState<AnaliseSemanal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroHumano | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch("/api/social/analises");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { analises?: AnaliseSemanal[] };
      const todas = Array.isArray(json.analises) ? json.analises : [];
      // Dentro da página do cliente (03/10/2026), só as análises DELE.
      setAnalises(clientId ? todas.filter((a) => a.clientId === clientId) : todas);
    } catch (e) {
      setErro(mensagemDeErro(e, "carregar a análise da semana"));
    } finally {
      setCarregando(false);
    }
  }, [clientId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(id: string, acao: "aplicar" | "descartar") {
    setDecidindo(id);
    setErro(null);
    try {
      const res = await fetch(`/api/social/analises/${id}/${acao}`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setAnalises((as) =>
        as.map((a) => (a.id === id ? { ...a, status: acao === "aplicar" ? "aplicada" : "descartada" } : a)),
      );
      setAviso(
        acao === "aplicar"
          ? "Ajuste aplicado — a marca já segue a nova diretriz na próxima semana."
          : "Proposta descartada. A marca continua na diretriz atual.",
      );
    } catch (e) {
      setErro(mensagemDeErro(e, "registrar sua decisão"));
    } finally {
      setDecidindo(null);
    }
  }

  async function rodarAgora() {
    setRodando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/social/analises/rodar", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await carregar();
      setAviso("Análise da semana concluída para todas as marcas.");
    } catch (e) {
      setErro(mensagemDeErro(e, "rodar a análise agora"));
    } finally {
      setRodando(false);
    }
  }

  const cartoes = maisRecentePorCliente(analises);

  return (
    <>
      {aviso && (
        <div role="status" className="mb-4 rounded-[8px] bg-[var(--success-bg)] border border-[#BBF7D0] px-4 py-2.5">
          <p className="text-[13px] text-[var(--success)]">{aviso}</p>
        </div>
      )}

      {erro && (
        <div role="alert" className="mb-4 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-4 py-3">
          <p className="text-[13px] text-[var(--danger)]">{erro.mensagem}</p>
          {erro.detalhe && (
            <p className="text-[11px] text-[var(--danger)]/70 mt-1 break-words">Detalhe técnico: {erro.detalhe}</p>
          )}
          <button
            type="button"
            onClick={() => {
              setCarregando(true);
              void carregar();
            }}
            className="mt-2 h-11 sm:h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[var(--danger)] hover:bg-white/60 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erro && cartoes.length > 0 && ehMaster && (
        <div className="flex items-center justify-end mb-4">
          <BotaoRodar rodando={rodando} onClick={rodarAgora} />
        </div>
      )}

      {carregando ? (
        <ul className="space-y-3 list-none p-0 m-0" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="bg-white rounded-[12px] border border-[var(--border)] p-4 sm:p-5">
              <div className="h-3 w-32 rounded bg-[var(--accent)] animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-[var(--accent)] animate-pulse mt-3" />
              <div className="h-3 w-full rounded bg-[var(--accent)] animate-pulse mt-4" />
              <div className="h-3 w-5/6 rounded bg-[var(--accent)] animate-pulse mt-2" />
            </li>
          ))}
        </ul>
      ) : cartoes.length === 0 && !erro ? (
        <EmptyState
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 6h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          title="Ainda sem semana analisada"
          description="A análise roda toda segunda às 8h. Quando ela rodar, a leitura de cada marca — o que funcionou, o que não, e o ajuste proposto — aparece aqui."
          action={ehMaster ? <BotaoRodar rodando={rodando} onClick={rodarAgora} tamanho="lg" /> : undefined}
        />
      ) : (
        <ul className="space-y-3 list-none p-0 m-0">
          {cartoes.map((a) => (
            <li key={a.id}>
              <CartaoDaMarca
                analise={a}
                ehMaster={ehMaster}
                decidindo={decidindo === a.id}
                onDecidir={(acao) => decidir(a.id, acao)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function BotaoRodar({
  rodando,
  onClick,
  tamanho = "md",
}: {
  rodando: boolean;
  onClick: () => void;
  tamanho?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={rodando}
      className={`h-11 ${tamanho === "md" ? "sm:h-9" : ""} px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-semibold disabled:opacity-50 transition-colors`}
    >
      {rodando ? "Rodando…" : "Rodar agora"}
    </button>
  );
}

function LinhaDeEvidencia({ evidencia }: { evidencia: Evidencia }) {
  const rotulo = rotuloDaMetrica(evidencia.metrica);
  // "não medido" nunca vira 0 — ausência é ausência, não zero.
  if (evidencia.valor === null || evidencia.valor === undefined) {
    return <span className="text-[12px] text-[var(--text-muted)]">{rotulo}: não medido</span>;
  }
  const media = evidencia.mediaDaMarca;
  return (
    <span className="text-[12px] text-[var(--text-muted)]">
      {rotulo}:{" "}
      <b className="text-[var(--text-secondary)] font-semibold">{formatarNumero(evidencia.valor)}</b>
      {media !== null && media !== undefined ? <> · média da marca: {formatarNumero(media)}</> : null}
    </span>
  );
}

function SecaoDeItens({
  titulo,
  tom,
  itens,
}: {
  titulo: string;
  tom: "success" | "danger";
  itens: ItemDeAnalise[];
}) {
  const corTitulo = tom === "success" ? "text-[var(--success)]" : "text-[var(--danger)]";
  const lista = Array.isArray(itens) ? itens : [];
  return (
    <div className="min-w-0">
      <h3 className={`text-[11px] font-semibold uppercase tracking-[0.08em] mb-2 ${corTitulo}`}>{titulo}</h3>
      {lista.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">Nada registrado nesta categoria.</p>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {lista.map((it, i) => (
            <li key={it.socialPostId ?? i} className="rounded-[8px] border border-[var(--border)] px-3 py-2.5">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{it.porque}</p>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 mt-1.5">
                <LinhaDeEvidencia evidencia={it.evidencia ?? { metrica: "", valor: null, mediaDaMarca: null }} />
                <a
                  href="/agency/planner"
                  className="text-[12px] font-medium text-[var(--navy)] hover:underline shrink-0"
                >
                  Ver no Planner →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoDaMarca({
  analise,
  ehMaster,
  decidindo,
  onDecidir,
}: {
  analise: AnaliseSemanal;
  ehMaster: boolean;
  decidindo: boolean;
  onDecidir: (acao: "aplicar" | "descartar") => void;
}) {
  const status = ROTULO_DO_STATUS[analise.status] ?? ROTULO_DO_STATUS.proposta;
  const periodo = `${formatarDataCurta(analise.semanaDe)} a ${formatarDataCurta(analise.semanaAte)}`;
  const ajustes = Array.isArray(analise.ajustes) ? analise.ajustes : [];

  return (
    <article className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug truncate">
            {analise.cliente || "Cliente"}
          </h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Semana de {periodo}</p>
        </div>
        <span className={`inline-flex h-6 px-2.5 items-center rounded-full text-[11px] font-semibold shrink-0 ${status.classe}`}>
          {status.texto}
        </span>
      </div>

      {analise.relatorio ? (
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mt-3">{analise.relatorio}</p>
      ) : null}

      {/* `lg`, não `md`: a 768px a sidebar já reocupa 224px e sobram 544px de
          conteúdo (DESIGN.md §6.3) — menos do que o celular tinha de sobra.
          Duas colunas ali apertaria justamente a linha de evidência. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
        <SecaoDeItens titulo="O que funcionou" tom="success" itens={analise.funcionou} />
        <SecaoDeItens titulo="O que não funcionou" tom="danger" itens={analise.naoFuncionou} />
      </div>

      {ajustes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
            Ajustes propostos para a próxima semana
          </h3>
          <ul className="space-y-2 list-none p-0 m-0">
            {ajustes.map((aj, i) => (
              <li key={i} className="rounded-[8px] bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5">
                <span className="inline-flex h-5 px-2 items-center rounded-full bg-[var(--accent-light)] text-[var(--teal-text)] text-[11px] font-semibold">
                  {tituloDoAjuste(aj)}
                </span>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">{textoDoAjuste(aj)}</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">{evidenciaDoAjusteTexto(aj)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analise.dnaPropostoVersao !== null && analise.dnaPropostoVersao !== undefined && (
        <a
          href={`/agency/clients/${analise.clientId}?tab=social`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--navy)] hover:underline mt-3"
        >
          Ver DNA proposto (versão {analise.dnaPropostoVersao}) na página da marca, aba Social → Acervo →
        </a>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[var(--border)]">
        {analise.status === "proposta" ? (
          ehMaster ? (
            <>
              <button
                type="button"
                onClick={() => onDecidir("aplicar")}
                disabled={decidindo}
                className="h-11 sm:h-9 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
              >
                {decidindo ? "…" : "Aplicar"}
              </button>
              <button
                type="button"
                onClick={() => onDecidir("descartar")}
                disabled={decidindo}
                className="h-11 sm:h-9 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] text-[13px] font-medium disabled:opacity-50 hover:bg-[var(--accent)] transition-colors"
              >
                Descartar
              </button>
            </>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">Aguardando decisão do master.</p>
          )
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            {analise.status === "aplicada" ? "Esta proposta já foi aplicada." : "Esta proposta foi descartada."}
          </p>
        )}
      </div>
    </article>
  );
}
