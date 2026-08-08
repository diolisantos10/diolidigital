"use client";

// AprovacoesDoCliente — o coração do portal (Hub, Fase 2: "se só uma coisa
// funcionar bem, é esta").
//
// ── UM ÚNICO LUGAR PARA DECIDIR (CEO, 07/08/2026) ───────────────────────────
// "Projeto pra aprovar em uma tela, é projeto pra aprovar em outra tela… está
// uma confusão." Estava mesmo: o ORÇAMENTO de um pedido tinha os botões
// "Aprovar e fazer / Agora não" dentro de Projetos E dentro do Início, enquanto
// Aprovações mostrava só as entregas. Três telas, decisões diferentes, nenhuma
// completa — e o cliente sem saber se já tinha decidido.
//
// Agora TUDO que espera decisão do cliente entra aqui: entregas (ApprovalRequest)
// e orçamentos (Pedido com preço na mesa). Projetos e Início só MOSTRAM o
// estado e trazem o cliente para cá. A mesma decisão nunca existe em duas telas.
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
import { emReais, type PedidoDoCliente } from "./SolicitarAlgo";

/** O prefixo que separa um card de orçamento de um card de entrega dentro do
 *  mesmo `abertaId` — é o que permite ao deep-link `?aprovacao=` apontar para
 *  qualquer uma das duas decisões sem inventar um segundo parâmetro. */
export const PREFIXO_ORCAMENTO = "orc:";
export const idDeOrcamento = (pedidoId: string) => `${PREFIXO_ORCAMENTO}${pedidoId}`;
export const ehIdDeOrcamento = (id: string | null) => !!id?.startsWith(PREFIXO_ORCAMENTO);
export const pedidoDoId = (id: string) => id.slice(PREFIXO_ORCAMENTO.length);

/** Um pedido com preço na mesa e sem resposta do cliente. É esta função — e só
 *  ela — que define "orçamento esperando decisão" em TODAS as telas: contagem
 *  do cabeçalho, selo da navegação, linha do Início e lista de Aprovações. Uma
 *  regra só, para as contagens nunca discordarem entre si. */
export function orcamentoEsperandoDecisao(p: PedidoDoCliente): boolean {
  return typeof p.preco === "number" && p.preco > 0 && (p.orcamento ?? "pendente") === "pendente";
}

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
  /** O card NÃO tem corpo: nem texto, nem peça. Quem decide isto é o SERVIDOR
   *  (`portal-data`), nunca esta tela — ver o comentário do campo lá. Card sem
   *  corpo não recebe botão de decisão: ninguém aprova o que não pode ver. */
  semConteudo?: boolean;
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

/** As TRÊS saídas do cartão de orçamento. `ajustar` é a terceira, aberta em
 *  07/08/2026: devolver a proposta com apontamentos (prazo, escopo ou preço)
 *  sem aceitar nem recusar — a bola volta para a agência revisar. */
export type DecisaoDeOrcamento = "aceito" | "recusado" | "ajustar";

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

/**
 * O SUBTÍTULO da linha — e a razão de ele existir é um defeito que o CEO viu.
 *
 * Em produção os cards apareciam como "Estratégia" em cima de "Estratégia" e
 * "Analytics" em cima de "Analytics": o título caía no `ap.department` (porque
 * o card não tinha corpo, logo não tinha primeira linha) e o subtítulo JÁ era o
 * departamento. Duas vezes a mesma palavra, e nenhuma delas diz o que aquilo é.
 *
 * Aqui a regra é derivar, nunca inventar: quando o título já É o nome do
 * departamento, o subtítulo passa a dizer o que a LINHA é ("Entrega da Dioli"),
 * que é um fato, e não um resumo do conteúdo que a tela não tem.
 */
function contextoDaLinha(ap: AprovacaoDoPortal, titulo: string): string {
  return titulo === ap.department ? "Entrega da Dioli" : ap.department;
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
            <span className="truncate text-[12px] text-[var(--text-muted)]">{peca.pillar}</span>
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
          <span className="text-[13px] leading-relaxed text-[var(--text-muted)]">arte em produção</span>
        </div>
      )}

      <div className="space-y-2 px-3.5 py-3">
        {data && (
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">
            📅 Programado para {data}
          </p>
        )}
        {peca.caption ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">{peca.caption}</p>
        ) : (
          <p className="text-[13px] italic text-[var(--text-muted)]">Legenda em produção.</p>
        )}
      </div>
    </article>
  );
}

function Badge({ status, questionOpen, semConteudo }: { status: string; questionOpen: boolean; semConteudo?: boolean }) {
  // Sem corpo não é "aguardando sua decisão" — a bola está com a AGÊNCIA. O
  // selo antigo cobrava do cliente uma decisão que ele não tinha como tomar.
  if (status === "pending" && semConteudo) {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0 bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
        <span className="w-1.5 h-1.5 rounded-full bg-current" /> Em produção na Dioli
      </span>
    );
  }
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

/** A miniatura da 1ª peça — e o que acontece quando ela NÃO carrega.
 *
 *  O `<img>` cru deixava o ícone quebrado do navegador na lista (o que o CEO
 *  viu na tela): mídia expirada, token trocado ou arquivo removido viravam um
 *  retângulo com um "x". Fallback explícito: cai no mesmo bloco neutro do card
 *  sem mídia, que é honesto — "não há prévia", nunca "algo quebrou". */
function Miniatura({ ap, token }: { ap: AprovacaoDoPortal; token: string }) {
  const capa = ap.pecas.find((p) => p.capa)?.capa ?? null;
  const url = urlDeMidiaDoPortal(capa, token);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [url]);
  if (!url || falhou) {
    return (
      <span
        aria-hidden
        className="shrink-0 w-11 h-11 rounded-[9px] bg-[var(--accent)] border border-[var(--border)] flex items-center justify-center text-[var(--text-subtle)]"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M4.5 2.5h7l4 4v11a1 1 0 01-1 1h-10a1 1 0 01-1-1v-14a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M11.5 2.5v4h4M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFalhou(true)}
      className="shrink-0 w-11 h-11 rounded-[9px] object-cover border border-[var(--border)] bg-[var(--accent)]"
    />
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

  // ⚠️ Card SEM CORPO não pede decisão (CEO, 07/08/2026).
  //
  // Ele abriu duas aprovações em produção e as duas tinham título, subtítulo e
  // três botões — e nada mais. Estava sendo convidado a aprovar o que não podia
  // ver. Num piloto 100% IA, isso é a assinatura do cliente num trabalho que
  // ninguém conferiu.
  //
  // A verdade vem do servidor (`semConteudo`), não de uma contagem feita aqui:
  // se esta tela deduzisse "vazio" por conta própria, uma falha de LEITURA
  // viraria um FATO sobre o cliente — a lição do Drive, 07/08.
  const semCorpo = ap.semConteudo === true;
  const pendente = ap.status === "pending" && !semCorpo;
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
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ touchAction: "manipulation" }}>
        ‹ Aprovações
      </button>

      <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[var(--text-primary)] leading-snug">{tituloDaPeca(ap)}</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1 flex items-center gap-2 flex-wrap">
              {/* Mesma regra da lista: sem `contextoDaLinha` o detalhe repetia
                  "Estratégia" embaixo de "Estratégia" — o defeito que o CEO viu
                  estava nas DUAS telas, e consertar só a lista deixaria metade. */}
              {contextoDaLinha(ap, tituloDaPeca(ap))}
              <TagVersao n={ap.version} />
            </p>
          </div>
          <Badge status={ap.status} questionOpen={ap.questionOpen} semConteudo={semCorpo} />
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

        {/* O estado honesto: o material ainda não subiu, e por isso NÃO há o
            que decidir. Nenhum botão de decisão aparece — nem "Aprovar", nem
            "Solicitar ajustes", nem "Tenho uma dúvida". A falta é da agência e
            a frase diz isso com todas as letras: o cliente não é culpado por um
            card que a casa publicou sem corpo. */}
        {semCorpo && ap.status === "pending" && (
          <div className="mt-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border)] p-4">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <span aria-hidden>⏳</span> O material ainda não subiu
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-[62ch]">
              Esta entrega está em produção na Dioli e ainda não tem conteúdo para você ver.
              Enquanto ela não chegar aqui, <b>não há nada para você decidir</b> — e nós não vamos
              pedir sua aprovação sem te mostrar o trabalho. Você recebe um aviso assim que estiver pronta.
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-2">
              Não é problema seu nem falta de ação sua — é a agência que ainda não publicou o material.
            </p>
          </div>
        )}

        {pendente && prazo && (
          <div className={`mt-3 rounded-[10px] px-3.5 py-2.5 text-[13px] ${vencida ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
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
          <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] px-3.5 py-2.5 text-[13px]">
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
            <label htmlFor="texto-decisao" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">
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
              <p role="alert" className="text-[13px] font-semibold text-[var(--danger)] mt-1.5">{erroLocal ?? erro}</p>
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
          <p role="alert" className="text-[13px] font-semibold text-[var(--danger)] mt-3">{erro}</p>
        )}

        {/* `!pendente` sozinho pegava o card SEM CORPO junto — e ele anunciava
            "Decisão registrada" em verde para uma decisão que nunca houve. Card
            vazio não é decidido: é uma entrega que ainda não chegou. */}
        {!pendente && !semCorpo && (
          <div className="mt-4 rounded-[10px] bg-[#DCFCE7] text-[#166534] px-3.5 py-2.5 text-[13px]">
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
                    className={`shrink-0 w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center ${c.authorRole === "client" ? "bg-[var(--accent)] text-[var(--text-secondary)]" : "bg-[#070A1F] text-[#9AF5F0]"}`}
                  >
                    {c.authorRole === "client" ? "VC" : "DD"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {c.authorRole === "client" ? "Você" : c.authorName || "Dioli Digital"}
                      <span className="font-normal text-[var(--text-muted)]"> · {dataCurta(c.createdAt)}{KIND_LABEL[c.kind] ?? ""}</span>
                    </p>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{c.body}</p>
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

// ── Detalhe do ORÇAMENTO — a segunda espécie de decisão ──────────────────────
// Mesma anatomia do card de entrega: título, o que está sendo decidido, o que
// acontece depois e os botões. O que muda é o conteúdo (um preço), não a forma
// — o cliente não deve precisar aprender duas telas para decidir duas coisas.

function DetalheDoOrcamento({
  pedido,
  enviando,
  erro,
  onDecidir,
  onVoltar,
}: {
  pedido: PedidoDoCliente;
  enviando: boolean;
  erro: string | null;
  onDecidir: (decisao: DecisaoDeOrcamento, apontamento?: string) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const pendente = orcamentoEsperandoDecisao(pedido);
  // A terceira saída, aberta em modo — mesmo padrão do card de entrega, para o
  // cliente não precisar aprender duas interações para a mesma coisa.
  const [ajustando, setAjustando] = useState(false);
  const [apontamento, setApontamento] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  async function enviarApontamento() {
    // Espelho do 400 do backend. Devolver sem dizer o quê é o mesmo silêncio
    // que a terceira saída existe para matar.
    if (!apontamento.trim()) {
      setErroLocal("Escreva o que precisa mudar — prazo, escopo ou preço.");
      return;
    }
    setErroLocal(null);
    const ok = await onDecidir("ajustar", apontamento.trim());
    if (ok) {
      setAjustando(false);
      setApontamento("");
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ touchAction: "manipulation" }}>
        ‹ Aprovações
      </button>

      <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[var(--text-primary)] leading-snug">{pedido.titulo}</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              Orçamento · pedido em {dataCurta(pedido.criadoEm)}
              {pedido.para ? ` · para ${dataCurta(pedido.para)}` : ""}
            </p>
          </div>
          <BadgeDoOrcamento pedido={pedido} />
        </div>

        {pedido.descricao && (
          <div className="mt-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border)] p-4">
            <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">O que você pediu</h3>
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{pedido.descricao}</p>
          </div>
        )}

        {typeof pedido.preco === "number" && pedido.preco > 0 ? (
          <div className="mt-4 rounded-[12px] border border-[var(--border-strong)] bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Proposta da Dioli</div>
            <div className="text-[28px] font-bold text-[var(--text-primary)] leading-tight mt-1 mono-num">{emReais(pedido.preco)}</div>
            {pedido.precoNota && (
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">{pedido.precoNota}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3.5 py-3">
            <p className="text-[13px] text-[var(--text-secondary)]">
              <b>Ainda não há preço nesta proposta.</b> A equipe está montando o orçamento — assim que chegar, ele aparece aqui e você decide.
            </p>
          </div>
        )}

        {pedido.motivo && (
          <p className="mt-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">{pedido.motivo}</p>
        )}

        {pendente ? (
          ajustando ? (
            /* A TERCEIRA SAÍDA, aberta. Campo obrigatório: vazio não envia. */
            <div className="mt-4">
              <label htmlFor="apontamento-orcamento" className="block text-[13px] font-semibold text-[var(--text-primary)]">
                O que precisa mudar nesta proposta?
              </label>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 mb-2 leading-relaxed">
                Prazo, escopo ou preço — escreva com suas palavras. Isto volta para a equipe revisar a proposta.
              </p>
              <textarea
                id="apontamento-orcamento"
                value={apontamento}
                onChange={(e) => { setApontamento(e.target.value); if (erroLocal) setErroLocal(null); }}
                rows={4}
                autoFocus
                placeholder="Ex.: o valor está acima do que posso agora; consegue fechar só os 2 primeiros carrosséis?"
                className="w-full rounded-[10px] border border-[var(--border-strong)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] leading-relaxed outline-none focus:border-[var(--text-primary)] transition-colors"
              />
              {erroLocal && <p role="alert" className="text-[13px] font-semibold text-[var(--danger)] mt-1.5">{erroLocal}</p>}
              <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                <button
                  disabled={enviando || !apontamento.trim()}
                  onClick={() => void enviarApontamento()}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-[#070A1F] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {enviando ? "Enviando…" : "Enviar apontamentos"}
                </button>
                <button
                  disabled={enviando}
                  onClick={() => { setAjustando(false); setErroLocal(null); }}
                  style={{ touchAction: "manipulation" }}
                  className="sm:w-[130px] h-11 rounded-[10px] text-[14px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  disabled={enviando}
                  onClick={() => void onDecidir("aceito")}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-[#070A1F] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {enviando ? "Registrando…" : "Aprovar e fazer"}
                </button>
                <button
                  disabled={enviando}
                  onClick={() => { setAjustando(true); setErroLocal(null); }}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                >
                  Devolver com apontamentos
                </button>
                <button
                  disabled={enviando}
                  onClick={() => void onDecidir("recusado")}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 h-11 rounded-[10px] text-[14px] font-semibold bg-white border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                >
                  Agora não
                </button>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed">
                Aprovar coloca este trabalho na fila da equipe.{" "}
                <b>Devolver com apontamentos</b>{" "}manda a proposta de volta para a equipe rever prazo,
                escopo ou preço — nada é cobrado e você decide de novo quando ela voltar.{" "}
                &quot;Agora não&quot; só arquiva a proposta.
              </p>
            </>
          )
        ) : (
          <div className="mt-4 rounded-[10px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3.5 py-2.5 text-[13px] text-[var(--text-secondary)]">
            {pedido.orcamento === "aceito"
              ? <><b>Você aprovou este orçamento.</b> O trabalho já está na fila da equipe — o andamento aparece em Projetos.</>
              : pedido.orcamento === "recusado"
                ? <><b>Você recusou este orçamento.</b> Nada foi cobrado. Se mudar de ideia, é só pedir de novo.</>
                : pedido.orcamento === "ajuste_solicitado"
                  ? <><b>Você devolveu esta proposta com apontamentos.</b> A equipe está revendo prazo, escopo ou preço. Quando a nova proposta chegar, ela volta para cá como uma decisão nova — a anterior fica registrada.</>
                  : <><b>Este pedido ainda está com a equipe.</b> Estado atual: {pedido.statusLegivel}. Quando houver preço, ele volta para cá como decisão sua.</>}
          </div>
        )}

        {erro && <p role="alert" className="text-[13px] font-semibold text-[var(--danger)] mt-3">{erro}</p>}
      </div>
    </div>
  );
}

function BadgeDoOrcamento({ pedido }: { pedido: PedidoDoCliente }) {
  const s = orcamentoEsperandoDecisao(pedido)
    ? { rotulo: "Aguardando sua decisão", cor: "var(--warning)", fundo: "var(--warning-bg)" }
    : pedido.orcamento === "aceito"
      ? { rotulo: "Aprovado por você", cor: "var(--success)", fundo: "var(--success-bg)" }
      : pedido.orcamento === "recusado"
        ? { rotulo: "Recusado por você", cor: "var(--text-secondary)", fundo: "var(--accent)" }
        : pedido.orcamento === "ajuste_solicitado"
          // Devolvido com apontamentos: a bola está com a AGÊNCIA. O selo diz
          // isso — não pode parecer decisão pendente do cliente.
          ? { rotulo: "Devolvido para revisão", cor: "var(--info)", fundo: "var(--info-bg)" }
          : { rotulo: pedido.statusLegivel, cor: "var(--info)", fundo: "var(--info-bg)" };
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0" style={{ background: s.fundo, color: s.cor }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> {s.rotulo}
    </span>
  );
}

// ── Lista + decisões registradas ─────────────────────────────────────────────

/** A decisão que vem da ESTEIRA (confirmar o caminho · aprovar o pacote
 *  inteiro). Ela morava dentro do painel de andamento, que aparece no Início e
 *  em Projetos — dois botões para uma decisão, nenhum deles em Aprovações.
 *  Agora ela é um card daqui, com o mesmo peso dos outros. */
export interface DecisaoDaEsteira {
  titulo: string;
  descricao: string;
  rotulo: string;
  decidir: () => Promise<boolean>;
}

export function AprovacoesDoCliente({
  aprovacoes,
  orcamentos = [],
  decisaoDaEsteira = null,
  token,
  abertaId,
  onAbrir,
  enviando,
  erro,
  onDecidir,
  onDecidirOrcamento,
}: {
  aprovacoes: AprovacaoDoPortal[];
  /** A decisão de andamento do projeto — quando existe, é a mais importante da
   *  tela e vem primeiro. `null` quando a bola está com a agência. */
  decisaoDaEsteira?: DecisaoDaEsteira | null;
  /** Os pedidos do cliente — os que têm preço na mesa entram como decisão aqui,
   *  e SÓ aqui. Projetos passou a mostrá-los sem botão. */
  orcamentos?: PedidoDoCliente[];
  /** Token de mídia — vazio em modo cookie (A4): a URL sai limpa do DOM. */
  token: string;
  abertaId: string | null;
  onAbrir: (id: string | null) => void;
  enviando: boolean;
  erro: string | null;
  onDecidir: (id: string, acao: AcaoDeAprovacao, comentario?: string) => Promise<boolean>;
  onDecidirOrcamento?: (pedidoId: string, decisao: DecisaoDeOrcamento, apontamento?: string) => Promise<boolean>;
}) {
  const orcamentoAberto = ehIdDeOrcamento(abertaId)
    ? orcamentos.find((p) => p.id === pedidoDoId(abertaId!)) ?? null
    : null;
  if (orcamentoAberto) {
    return (
      <DetalheDoOrcamento
        pedido={orcamentoAberto}
        enviando={enviando}
        erro={erro}
        onDecidir={async (d, apontamento) => (await onDecidirOrcamento?.(orcamentoAberto.id, d, apontamento)) ?? false}
        onVoltar={() => onAbrir(null)}
      />
    );
  }

  const aberta = abertaId && !ehIdDeOrcamento(abertaId) ? aprovacoes.find((a) => a.id === abertaId) : null;
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

  // "Aguardando você" só pode conter o que o cliente CONSEGUE decidir. Card sem
  // corpo sai desta lista e vai para a de baixo, "Em produção na Dioli" — ele
  // continua visível (esconder seria fingir que não existe), mas parado de
  // cobrar uma decisão impossível.
  const pendentes = aprovacoes.filter((a) => a.status === "pending" && a.semConteudo !== true);
  const emProducao = aprovacoes.filter((a) => a.status === "pending" && a.semConteudo === true);
  const decididas = aprovacoes.filter((a) => a.status !== "pending");
  const orcamentosPendentes = orcamentos.filter(orcamentoEsperandoDecisao);
  const orcamentosDecididos = orcamentos.filter(
    (p) => p.orcamento === "aceito" || p.orcamento === "recusado" || p.orcamento === "ajuste_solicitado",
  );
  const totalAguardando = pendentes.length + orcamentosPendentes.length + (decisaoDaEsteira ? 1 : 0);
  const totalDecidido = decididas.length + orcamentosDecididos.length;

  const linhaDeOrcamento = (p: PedidoDoCliente) => (
    <button
      key={p.id}
      onClick={() => onAbrir(idDeOrcamento(p.id))}
      style={{ touchAction: "manipulation" }}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
    >
      <span aria-hidden className="shrink-0 w-11 h-11 rounded-[9px] bg-[var(--accent-light)] border border-[var(--border)] flex items-center justify-center text-[15px]">💬</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[var(--text-primary)] leading-snug">{p.titulo}</span>
        <span className="block text-[12px] text-[var(--text-secondary)] mt-0.5">
          Orçamento
          {typeof p.preco === "number" && p.preco > 0 ? ` · ${emReais(p.preco)}` : ""}
          {` · pedido em ${dataCurta(p.criadoEm)}`}
        </span>
        <span className="mt-1.5 block sm:hidden"><BadgeDoOrcamento pedido={p} /></span>
      </span>
      <span className="hidden sm:block self-center"><BadgeDoOrcamento pedido={p} /></span>
      <span aria-hidden className="self-center text-[var(--text-subtle)]">›</span>
    </button>
  );

  const linha = (ap: AprovacaoDoPortal) => {
    const titulo = tituloDaPeca(ap);
    // Rótulo repetido é ruído: quando o card não tem nome próprio, o título JÁ
    // é o nome do departamento ("Analytics" em cima de "Analytics", que foi o
    // que o CEO viu). Nesse caso o subtítulo diz o que a linha realmente é.
    const contexto = contextoDaLinha(ap, titulo);
    const semCorpo = ap.semConteudo === true;
    // Uma linha de metadados montada como TEXTO, não como caixas com `gap`:
    // com gap + "·" escrito no início de cada pedaço o separador ganhava dois
    // espaços de um lado só ("Social Media  · prazo 10/08").
    const meta: string[] = [];
    if (ap.pecas.length > 0) meta.push(`${ap.pecas.length} ${ap.pecas.length === 1 ? "peça" : "peças"}`);
    // Card sem corpo não anuncia prazo nem "aguardando você": não há decisão a
    // tomar, e cobrar decisão sobre o nada foi exatamente o defeito.
    if (semCorpo && ap.status === "pending") {
      meta.push("material ainda não subiu");
    } else if (ap.status === "pending") {
      meta.push(ap.questionOpen
        ? "prazo pausado"
        : dataCurta(ap.expiresAt)
          ? `prazo ${dataCurta(ap.expiresAt)}`
          : "sem prazo — decida quando puder");
    } else if (dataCurta(ap.reviewedAt)) {
      meta.push(`decidido em ${dataCurta(ap.reviewedAt)}`);
    }
    return (
      <button
        key={ap.id}
        onClick={() => onAbrir(ap.id)}
        style={{ touchAction: "manipulation" }}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
      >
        <Miniatura ap={ap} token={token} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[var(--text-primary)] leading-snug">{titulo}</span>
          <span className="text-[12px] text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span>{contexto}{meta.length > 0 ? ` · ${meta.join(" · ")}` : ""}</span>
            <TagVersao n={ap.version} />
          </span>
          {/* No celular o selo desce para baixo do texto — ao lado ele esmaga o
              título até virar reticência. */}
          <span className="mt-1.5 block sm:hidden"><Badge status={ap.status} questionOpen={ap.questionOpen} semConteudo={semCorpo} /></span>
        </span>
        <span className="hidden sm:block self-center"><Badge status={ap.status} questionOpen={ap.questionOpen} semConteudo={semCorpo} /></span>
        <span aria-hidden className="self-center text-[var(--text-subtle)]">›</span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Aprovações</h2>
        <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
          O único lugar onde você decide: entregas e orçamentos, juntos — e o registro do que já foi decidido.
        </p>
      </div>

      <section>
        <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Aguardando você ({totalAguardando})</h3>
        {totalAguardando === 0 ? (
          <div className="bg-white rounded-[14px] border border-[var(--border)] p-7 text-center">
            <div aria-hidden className="w-10 h-10 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-lg flex items-center justify-center mx-auto mb-2.5">✓</div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">Nada esperando sua decisão</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[42ch] mx-auto leading-relaxed">
              Toda entrega e todo orçamento que precisar de um &quot;sim&quot; seu chega aqui — e você recebe um aviso.
              Enquanto isso, o andamento do trabalho fica em <b>Projetos</b>.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {decisaoDaEsteira && (
              <div className="rounded-[14px] border border-[var(--border-strong)] bg-white p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <h4 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug">{decisaoDaEsteira.titulo}</h4>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-[62ch]">{decisaoDaEsteira.descricao}</p>
                <button
                  disabled={enviando}
                  onClick={() => void decisaoDaEsteira.decidir()}
                  style={{ touchAction: "manipulation" }}
                  className="mt-3.5 h-11 px-5 rounded-[10px] text-[14px] font-semibold bg-[#070A1F] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {enviando ? "Registrando…" : decisaoDaEsteira.rotulo}
                </button>
                {erro && <p role="alert" className="text-[13px] font-semibold text-[var(--danger)] mt-2">{erro}</p>}
              </div>
            )}
            {(orcamentosPendentes.length > 0 || pendentes.length > 0) && (
              <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                {orcamentosPendentes.map(linhaDeOrcamento)}
                {pendentes.map(linha)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* O que a agência ainda não entregou. Fica VISÍVEL — sumir com o card
          seria o cliente perder de vista um trabalho que existe — mas fora da
          fila de decisão, porque não há o que decidir aqui. */}
      {emProducao.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">
            Em produção na Dioli ({emProducao.length})
          </h3>
          <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
            {emProducao.map(linha)}
          </div>
          <p className="text-[12px] text-[var(--text-muted)] mt-2 px-1 leading-relaxed">
            Estas entregas ainda não têm material para você ver — por isso não pedimos decisão sobre elas.
            Assim que ficarem prontas, elas sobem para <b>Aguardando você</b> e você recebe um aviso.
          </p>
        </section>
      )}

      {totalDecidido > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Decididas por você ({totalDecidido})</h3>
          <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
            {orcamentosDecididos.map(linhaDeOrcamento)}
            {decididas.map(linha)}
          </div>
          <p className="text-[12px] text-[var(--text-muted)] mt-2 px-1">
            Decisão registrada é imutável: muda-se de ideia criando uma nova rodada, nunca reescrevendo a anterior.
          </p>
        </section>
      )}
    </div>
  );
}
