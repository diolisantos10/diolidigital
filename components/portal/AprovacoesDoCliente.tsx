"use client";

// AprovacoesDoCliente — o coração do portal (Hub, Fase 2: "se só uma coisa
// funcionar bem, é esta").
//
// Lista + detalhe com os TRÊS caminhos da spec (2.1):
//   A. Aprovar — decisão registrada, efeitos de esteira no backend;
//   B. Solicitar ajustes — comentário OBRIGATÓRIO (o backend devolve 400 sem
//      ele; a UI trava antes: botão desabilitado até haver texto);
//   C. Tenho uma dúvida — NÃO decide nada: o card continua pendente, a dúvida
//      fica presa a ele e o prazo PAUSA ("prazo pausado" visível — o relógio
//      não corre contra o cliente enquanto a bola está com a agência).
//
// A versão (v1/v2) aparece quando existe vínculo com DeliverableVersion — o
// "aprovei a v2" que a Fase 1 apontou como não-registrável.

import { useCallback, useEffect, useState } from "react";
import { CarrosselDeTelas, rotuloDeFormatoDaPeca, type PecaAberta } from "@/components/portal/DetalheDaPeca";
import { urlDeMidiaDoPortal } from "@/lib/agency/portal/midia";
import { juntarTranscricao } from "@/lib/ai/transcricao";
import { BotaoDeDitado } from "./Ditado";

export interface AprovacaoDoPortal {
  id: string;
  department: string;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  version: number | null;
  questionOpen: boolean;
  expiresAt: string | null;
  /** As peças ESTRUTURADAS do card (imagem + legenda + telas do carrossel).
   *  Vazio = card antigo, só texto — o reviewNote continua sendo o corpo. */
  pecas: PecaAberta[];
  comments: Array<{
    id: string;
    authorName: string;
    authorRole: string;
    kind: string;
    body: string;
    createdAt: string;
  }>;
}

export type AcaoDeAprovacao = "approve" | "request_revision" | "question";

const STATUS_APROVACAO: Record<string, { rotulo: string; cor: string; fundo: string }> = {
  pending:            { rotulo: "Aguardando sua decisão", cor: "#9B7B2D", fundo: "#FEF3C7" },
  approved:           { rotulo: "Aprovado por você",      cor: "#16A34A", fundo: "#DCFCE7" },
  revision_requested: { rotulo: "Ajustes solicitados",    cor: "#2563EB", fundo: "#EFF6FF" },
  rejected:           { rotulo: "Recusado por você",      cor: "#DC2626", fundo: "#FEF2F2" },
};

const KIND_LABEL: Record<string, string> = {
  question: " · dúvida",
  answer:   " · resposta da agência",
  revision: " · pedido de ajuste",
};

function tituloDaPeca(ap: AprovacaoDoPortal): string {
  // O reviewNote nasce como "Nome da entrega\n\nconteúdo" quando há versão
  // vinculada — a primeira linha é o nome que o cliente reconhece.
  const primeiraLinha = ap.reviewNote?.split("\n")[0]?.trim();
  if (primeiraLinha && primeiraLinha.length <= 90) return primeiraLinha;
  return ap.department;
}

function corpoDaPeca(ap: AprovacaoDoPortal): string | null {
  if (!ap.reviewNote) return null;
  const partes = ap.reviewNote.split("\n");
  const semTitulo = partes.slice(1).join("\n").trim();
  return semTitulo || ap.reviewNote;
}

/** O reviewNote chega com negrito em markdown (**assim**) — o cliente não pode
 *  ver asterisco cru. Só negrito: qualquer outra marca passa como texto. */
function ComNegrito({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*([^*]+)\*\*/g);
  return (
    <>
      {partes.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function dataProposta(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

// ── A peça como o cliente vai vê-la no ar (planner da Meta) ──────────────────
// Imagem grande + carrossel navegável + legenda completa + data proposta. O
// cliente aprova O QUE VAI SER PUBLICADO — não um texto descrevendo.

function PecaDoCard({ peca, indice, total, token }: { peca: PecaAberta; indice: number; total: number; token: string }) {
  const telas = peca.telas.length > 0 ? peca.telas : peca.capa ? [peca.capa] : [];
  const data = dataProposta(peca.scheduledFor);
  return (
    <article className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-[6px] bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] shrink-0">
            {rotuloDeFormatoDaPeca(peca.format)}
          </span>
          {peca.pillar && (
            <span className="truncate text-[11.5px] text-[var(--text-muted)]">{peca.pillar}</span>
          )}
        </div>
        {total > 1 && (
          <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
            Peça {indice + 1} de {total}
          </span>
        )}
      </div>

      {telas.length > 0 ? (
        <CarrosselDeTelas telas={telas} token={token} alt={rotuloDeFormatoDaPeca(peca.format)} />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-[var(--accent)] px-6 text-center">
          <span className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">arte em produção</span>
        </div>
      )}

      <div className="space-y-2 px-3.5 py-3">
        {data && (
          <p className="text-[11.5px] font-medium text-[var(--text-secondary)]">
            📅 Programado para {data}
          </p>
        )}
        {peca.caption ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">{peca.caption}</p>
        ) : (
          <p className="text-[12.5px] italic text-[var(--text-muted)]">Legenda em produção.</p>
        )}
      </div>
    </article>
  );
}

function Badge({ status, questionOpen }: { status: string; questionOpen: boolean }) {
  if (status === "pending" && questionOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0 bg-[#E6FBFA] text-[#0E7490]">
        <span className="w-1.5 h-1.5 rounded-full bg-current" /> Dúvida aberta
      </span>
    );
  }
  const s = STATUS_APROVACAO[status] ?? STATUS_APROVACAO.pending;
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0" style={{ background: s.fundo, color: s.cor }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> {s.rotulo}
    </span>
  );
}

function TagVersao({ n }: { n: number | null }) {
  if (n == null) return null;
  return (
    <span className="inline-flex items-center h-5 px-1.5 rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)] text-[11px] font-mono shrink-0">
      v{n}
    </span>
  );
}

// ── Detalhe: um card, três caminhos ──────────────────────────────────────────

function DetalheDaAprovacao({
  ap,
  token,
  enviando,
  erro,
  onDecidir,
  onVoltar,
}: {
  ap: AprovacaoDoPortal;
  token: string;
  enviando: boolean;
  erro: string | null;
  onDecidir: (acao: AcaoDeAprovacao, comentario?: string) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const [modo, setModo] = useState<"ajuste" | "duvida" | null>(null);
  const [texto, setTexto] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const pendente = ap.status === "pending";
  const temPecas = ap.pecas.length > 0;
  // Com peças estruturadas, o reviewNote não renderiza: ele é o RESUMO em texto
  // das mesmas legendas — mostrá-lo duplicaria tudo que a peça já mostra.
  const corpo = temPecas ? null : corpoDaPeca(ap);
  const prazo = dataCurta(ap.expiresAt);
  const vencida = pendente && !ap.questionOpen && ap.expiresAt != null && new Date(ap.expiresAt) < new Date();

  async function enviar() {
    // Trava de UI espelhando o 400 do backend: ajuste/dúvida sem texto não sai.
    if (!texto.trim()) {
      setErroLocal(
        modo === "ajuste"
          ? "Escreva o que precisa mudar — é este comentário que orienta a nova versão."
          : "Escreva a dúvida antes de enviar.",
      );
      return;
    }
    setErroLocal(null);
    const ok = await onDecidir(modo === "ajuste" ? "request_revision" : "question", texto.trim());
    if (ok) {
      setModo(null);
      setTexto("");
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ touchAction: "manipulation" }}>
        ‹ Aprovações
      </button>

      <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[var(--text-primary)] leading-snug">{tituloDaPeca(ap)}</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1 flex items-center gap-2 flex-wrap">
              {ap.department}
              <TagVersao n={ap.version} />
            </p>
          </div>
          <Badge status={ap.status} questionOpen={ap.questionOpen} />
        </div>

        {temPecas && (
          // Largura de post, não de página: em tablet/desktop a peça capada em
          // ~480px é o tamanho em que o cliente a verá no feed — imagem maior
          // que isso vira banner e distorce o julgamento.
          <div className="mt-4 space-y-3 sm:max-w-[480px]">
            {ap.pecas.map((p, i) => (
              <PecaDoCard key={p.id} peca={p} indice={i} total={ap.pecas.length} token={token} />
            ))}
          </div>
        )}

        {corpo && (
          <div className="mt-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border)] p-4">
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap"><ComNegrito texto={corpo} /></p>
          </div>
        )}

        {pendente && prazo && (
          <div className={`mt-3 rounded-[10px] px-3.5 py-2.5 text-[12.5px] ${vencida ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
            {ap.questionOpen ? (
              <><s>Prazo: {prazo}</s> — pausado enquanto a dúvida está com a agência.</>
            ) : vencida ? (
              <><b>O prazo venceu em {prazo}</b> — a entrega está aguardando você. Nada é aprovado sem a sua decisão.</>
            ) : (
              <><b>Prazo: {prazo}.</b> Enquanto você não decide, a próxima etapa fica em espera.</>
            )}
          </div>
        )}

        {/* Caminho C aberto: dúvida presa ao card, prazo pausado */}
        {pendente && ap.questionOpen && (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] px-3.5 py-2.5 text-[12.5px]">
            <span aria-hidden>⏸</span>
            <span><b>Dúvida aberta — aguardando resposta da agência.</b> O prazo desta aprovação está <b>pausado</b>. A resposta chega aqui, neste card.</span>
          </div>
        )}

        {/* Os três caminhos — mesmo peso visual (spec 2.1, caminho C item 1) */}
        {pendente && modo === null && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              disabled={enviando}
              onClick={() => void onDecidir("approve")}
              style={{ touchAction: "manipulation" }}
              className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-[#070A1F] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Aprovar"}
            </button>
            <button
              disabled={enviando}
              onClick={() => { setModo("ajuste"); setErroLocal(null); }}
              style={{ touchAction: "manipulation" }}
              className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              Solicitar ajustes
            </button>
            <button
              disabled={enviando}
              onClick={() => { setModo("duvida"); setErroLocal(null); }}
              style={{ touchAction: "manipulation" }}
              className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              Tenho uma dúvida
            </button>
          </div>
        )}

        {pendente && modo !== null && (
          <div className="mt-4">
            <label htmlFor="texto-decisao" className="block text-[12.5px] font-semibold text-[var(--text-primary)] mb-1.5">
              {modo === "ajuste" ? "Descreva o ajuste" : "Escreva sua dúvida"}
            </label>
            <textarea
              id="texto-decisao"
              value={texto}
              onChange={(e) => { setTexto(e.target.value); if (erroLocal) setErroLocal(null); }}
              placeholder={modo === "ajuste"
                ? "O que precisa mudar? Seja específico — a equipe refaz a partir disto."
                : "Qual é a sua dúvida sobre esta peça?"}
              rows={3}
              autoFocus
              className="w-full px-3 py-2.5 text-[13px] bg-white border border-[var(--border-strong)] rounded-[10px] outline-none focus:border-[#070A1F] resize-y"
              style={{ fontSize: "16px" }}
            />

            {/* Ditado: preenche o campo acima. O envio continua sendo o botão
                de baixo — falar nunca dispara a decisão. */}
            <BotaoDeDitado
              token={token}
              desabilitado={enviando}
              onTexto={(t) => {
                setTexto((atual) => juntarTranscricao(atual, t));
                setErroLocal(null);
              }}
            />

            <p className="text-[12px] text-[var(--text-muted)] mt-1.5">
              {modo === "ajuste"
                ? "O comentário é obrigatório: é ele que orienta a nova versão. A versão atual fica preservada."
                : "A dúvida fica presa a este card e não muda sua decisão. O prazo pausa até a agência responder."}
            </p>
            {(erroLocal || erro) && (
              <p role="alert" className="text-[12.5px] font-semibold text-[var(--danger)] mt-1.5">{erroLocal ?? erro}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                disabled={enviando || !texto.trim()}
                onClick={() => void enviar()}
                style={{ touchAction: "manipulation" }}
                className="h-10 px-4 rounded-[10px] text-[13px] font-semibold bg-[#070A1F] text-white disabled:opacity-45 transition-opacity"
              >
                {enviando ? "Enviando…" : modo === "ajuste" ? "Enviar pedido de ajuste" : "Enviar dúvida"}
              </button>
              <button
                disabled={enviando}
                onClick={() => { setModo(null); setTexto(""); setErroLocal(null); }}
                style={{ touchAction: "manipulation" }}
                className="h-10 px-4 rounded-[10px] text-[13px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {pendente && modo === null && erro && (
          <p role="alert" className="text-[12.5px] font-semibold text-[var(--danger)] mt-3">{erro}</p>
        )}

        {!pendente && (
          <div className="mt-4 rounded-[10px] bg-[#DCFCE7] text-[#166534] px-3.5 py-2.5 text-[12.5px]">
            <b>Decisão registrada{ap.reviewedAt ? ` em ${dataCurta(ap.reviewedAt)}` : ""}.</b>{" "}
            Registro imutável: os dois lados param de rediscutir o que já foi decidido.
          </div>
        )}

        {/* Histórico preso ao card — dúvidas, ajustes e respostas */}
        {ap.comments.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Histórico deste card</h3>
            <div className="space-y-0">
              {ap.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5 py-2.5 border-t border-[var(--border)] first:border-t-0">
                  <span
                    aria-hidden
                    className={`shrink-0 w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center ${c.authorRole === "client" ? "bg-[var(--accent)] text-[var(--text-secondary)]" : "bg-[#070A1F] text-[#9AF5F0]"}`}
                  >
                    {c.authorRole === "client" ? "VC" : "DD"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {c.authorRole === "client" ? "Você" : c.authorName || "Dioli Digital"}
                      <span className="font-normal text-[var(--text-muted)]"> · {dataCurta(c.createdAt)}{KIND_LABEL[c.kind] ?? ""}</span>
                    </p>
                    <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lista + decisões registradas ─────────────────────────────────────────────

export function AprovacoesDoCliente({
  aprovacoes,
  token,
  abertaId,
  onAbrir,
  enviando,
  erro,
  onDecidir,
}: {
  aprovacoes: AprovacaoDoPortal[];
  /** Token de mídia — vazio em modo cookie (A4): a URL sai limpa do DOM. */
  token: string;
  abertaId: string | null;
  onAbrir: (id: string | null) => void;
  enviando: boolean;
  erro: string | null;
  onDecidir: (id: string, acao: AcaoDeAprovacao, comentario?: string) => Promise<boolean>;
}) {
  const aberta = abertaId ? aprovacoes.find((a) => a.id === abertaId) : null;
  if (aberta) {
    return (
      <DetalheDaAprovacao
        ap={aberta}
        token={token}
        enviando={enviando}
        erro={erro}
        onDecidir={(acao, comentario) => onDecidir(aberta.id, acao, comentario)}
        onVoltar={() => onAbrir(null)}
      />
    );
  }

  const pendentes = aprovacoes.filter((a) => a.status === "pending");
  const decididas = aprovacoes.filter((a) => a.status !== "pending");

  // A miniatura REAL da 1ª peça — a lista já mostra o que o cliente vai
  // aprovar. Sem mídia, o ícone de sempre.
  const miniatura = (ap: AprovacaoDoPortal) => {
    const capa = ap.pecas.find((p) => p.capa)?.capa ?? null;
    const url = urlDeMidiaDoPortal(capa, token);
    if (!url) {
      return <span aria-hidden className="shrink-0 w-11 h-11 rounded-[9px] bg-[var(--accent)] flex items-center justify-center text-[15px]">🖼️</span>;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" loading="lazy" className="shrink-0 w-11 h-11 rounded-[9px] object-cover border border-[var(--border)]" />
    );
  };

  const linha = (ap: AprovacaoDoPortal) => (
    <button
      key={ap.id}
      onClick={() => onAbrir(ap.id)}
      style={{ touchAction: "manipulation" }}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
    >
      {miniatura(ap)}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-[var(--text-primary)] leading-snug">{tituloDaPeca(ap)}</span>
        <span className="text-[12px] text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5 flex-wrap">
          {ap.department}
          <TagVersao n={ap.version} />
          {ap.pecas.length > 0 && (
            <span>· {ap.pecas.length} {ap.pecas.length === 1 ? "peça" : "peças"}</span>
          )}
          {ap.status === "pending" && (ap.questionOpen
            ? <span>· prazo pausado</span>
            : dataCurta(ap.expiresAt) && <span>· prazo {dataCurta(ap.expiresAt)}</span>)}
        </span>
        {/* No celular o selo desce para baixo do texto — ao lado ele esmaga o
            título até virar reticência. */}
        <span className="mt-1.5 block sm:hidden"><Badge status={ap.status} questionOpen={ap.questionOpen} /></span>
      </span>
      <span className="hidden sm:block self-center"><Badge status={ap.status} questionOpen={ap.questionOpen} /></span>
      <span aria-hidden className="self-center text-[var(--text-subtle)]">›</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Aprovações</h2>
        <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">Tudo que espera sua decisão — e o registro do que você já decidiu.</p>
      </div>

      <section>
        <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Aguardando você ({pendentes.length})</h3>
        {pendentes.length === 0 ? (
          <div className="bg-white rounded-[14px] border border-[var(--border)] p-7 text-center">
            <div aria-hidden className="w-10 h-10 rounded-full bg-[#DCFCE7] text-[var(--success)] text-lg flex items-center justify-center mx-auto mb-2.5">✓</div>
            <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">Nenhuma aprovação pendente</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Quando algo precisar da sua decisão, aparece aqui.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
            {pendentes.map(linha)}
          </div>
        )}
      </section>

      {decididas.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Decididas por você</h3>
          <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
            {decididas.map(linha)}
          </div>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-2 px-1">
            Decisão registrada é imutável: muda-se de ideia criando uma nova rodada, nunca reescrevendo a anterior.
          </p>
        </section>
      )}
    </div>
  );
}
