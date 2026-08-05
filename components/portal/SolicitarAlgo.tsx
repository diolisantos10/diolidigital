"use client";

// SOLICITAR ALGO — a porta do cliente para dentro da agência.
//
// ── O que mudou, e por quê (CEO, 05/08/2026) ───────────────────────────────
// A primeira versão chamava "Pedir conteúdo novo", ficava no rodapé de uma aba
// interna e o atalho do Início NAVEGAVA para outra tela. O CEO olhou e disse
// três coisas, todas certas:
//
//   1. "não pode limitar a peça" — ele quer pedir um serviço, um orçamento,
//      qualquer coisa. Quem lê "peça nova" e precisa de um vídeo não clica.
//   2. "está muito escondido... precisa estar super destacado" — é AQUI que a
//      agência vende. Porta de venda no rodapé é porta fechada.
//   3. "tem que abrir em segundo plano e não abrir uma página" — trocar de tela
//      faz o cliente perder o que estava olhando, e desistir no meio.
//
// ── E a quarta, que é a que dá dinheiro ────────────────────────────────────
// "a devolutiva já tem que vir com o preço". O pedido não termina em "recebido":
// termina em orçamento, e o cliente aceita ou recusa no portal — sem trocar de
// canal, sem esperar alguém lembrar de mandar preço no WhatsApp.
//
// ── E o microfone ──────────────────────────────────────────────────────────
// "não tem o microfone de novo, eu não gosto de digitar." Ditar preenche o
// campo; o texto continua editável e o envio continua sendo um clique dele.

import { useCallback, useEffect, useState } from "react";
import { EnvioDeMaterial } from "./EnvioDeMaterial";
import { BotaoDeDitado } from "./Ditado";

export interface PedidoDoCliente {
  id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  para: string | null;
  status: string;
  statusLegivel: string;
  motivo: string | null;
  criadoEm: string;
  /** O orçamento da agência, quando já respondido. Em reais. */
  preco?: number | null;
  /** O que o preço cobre, em uma frase. */
  precoNota?: string | null;
  /** Decisão do cliente sobre o orçamento. */
  orcamento?: "pendente" | "aceito" | "recusado" | null;
}

/** Atalhos de objetivo — um toque em vez de uma redação. Deliberadamente largos:
 *  o cliente que precisa de um vídeo ou de um cardápio tem que se ver aqui. */
const OBJETIVOS = [
  "Vender mais",
  "Divulgar uma novidade",
  "Data comemorativa",
  "Um serviço novo",
  "Só um orçamento",
];

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function emReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

// ── O formulário, dentro de uma folha que abre por cima ─────────────────────

export function SolicitarAlgo({
  token,
  aberto,
  aoFechar,
  aoEnviar,
}: {
  token: string;
  aberto: boolean;
  aoFechar: () => void;
  /** Avisa quem abriu que o pedido entrou — para atualizar a lista. */
  aoEnviar?: (recado: string) => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [para, setPara] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [pergunta, setPergunta] = useState<{ campo: string; texto: string } | null>(null);

  // Esc fecha, e o fundo para de rolar enquanto a folha está aberta — sem isso,
  // no celular, o dedo rola a página de trás e o formulário "foge".
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, aoFechar]);

  const enviar = useCallback(async () => {
    if (enviando) return;
    setEnviando(true);
    setPergunta(null);
    try {
      const res = await fetch("/api/portal/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), descricao, objetivo, para, anexos }),
      });
      const j = await res.json().catch(() => ({} as Record<string, string>));
      if (res.status === 422 && j.pergunta) {
        // O sistema PERGUNTA — não devolve "campo obrigatório". E leva o cliente
        // até a pergunta: num formulário rolado, resposta que ele não vê é o
        // mesmo que erro silencioso.
        const campo = j.campo ?? "descricao";
        setPergunta({ campo, texto: j.pergunta });
        requestAnimationFrame(() => {
          const alvo = document.getElementById(`pedido-${campo}`);
          alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
          (alvo as HTMLElement | null)?.focus?.();
        });
        return;
      }
      if (!res.ok) {
        setPergunta({ campo: "geral", texto: j.error ?? "Não consegui registrar agora. Tente de novo." });
        return;
      }
      setDescricao(""); setObjetivo(""); setPara(""); setAnexos([]);
      aoEnviar?.(j.recado ?? "Recebemos. A equipe avalia e volta com prazo e preço por aqui.");
      aoFechar();
    } catch {
      setPergunta({ campo: "geral", texto: "A conexão caiu. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }, [enviando, token, descricao, objetivo, para, anexos, aoEnviar, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="solicitar-titulo"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <button
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-[rgba(7,10,31,0.45)] backdrop-blur-[2px]"
      />

      {/* Folha: sobe de baixo no celular, centraliza no desktop. */}
      <div className="relative w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-white rounded-t-[20px] sm:rounded-[18px] shadow-[0_-8px_40px_rgba(7,10,31,0.18)] sm:shadow-[0_20px_60px_rgba(7,10,31,0.28)]">
        {/* pegador visual do bottom sheet */}
        <div aria-hidden className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>

        <div className="sticky top-0 z-10 bg-white px-5 pt-3 pb-3 border-b border-[var(--border)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="solicitar-titulo" className="text-[17px] font-bold text-[var(--text-primary)]">
              O que você precisa?
            </h2>
            <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">
              Peça, serviço novo, orçamento — o que for. A equipe responde aqui com prazo e preço.
            </p>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            style={{ touchAction: "manipulation" }}
            className="shrink-0 h-9 w-9 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* 1 · O que */}
          <div>
            <label htmlFor="pedido-descricao" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              Me conta o que você quer
            </label>
            <textarea
              id="pedido-descricao"
              value={descricao}
              onChange={(e) => { setDescricao(e.target.value); if (pergunta?.campo === "descricao") setPergunta(null); }}
              rows={4}
              placeholder="Ex.: um vídeo para o Dia das Mães · um cardápio novo · mais posts esse mês · quero orçamento de um site"
              className={`mt-1.5 w-full px-3 py-2.5 bg-[var(--bg)] border rounded-[10px] outline-none focus:bg-white transition-all resize-none leading-relaxed ${
                pergunta?.campo === "descricao" ? "border-[#F59E0B]" : "border-[var(--border)] focus:border-[var(--text-primary)]"
              }`}
              style={{ fontSize: "16px" }}
            />
            {/* Falar em vez de digitar. O texto cai no campo acima e ele revisa. */}
            <BotaoDeDitado
              token={token}
              desabilitado={enviando}
              rotulo="Falar em vez de digitar"
              onTexto={(t) => {
                setDescricao((atual) => (atual.trim() ? `${atual.trim()} ${t}` : t));
                if (pergunta?.campo === "descricao") setPergunta(null);
              }}
            />
            {pergunta?.campo === "descricao" && (
              <p className="mt-1 text-[12px] text-[#9B7B2D]">{pergunta.texto}</p>
            )}
          </div>

          {/* 2 · Para quê */}
          <div>
            <label htmlFor="pedido-objetivo" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              Para quê?
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OBJETIVOS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setObjetivo(o); if (pergunta?.campo === "objetivo") setPergunta(null); }}
                  style={{ touchAction: "manipulation" }}
                  className={`h-9 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
                    objetivo === o ? "bg-[#070A1F] text-white" : "bg-[#F0EFEB] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            <input
              id="pedido-objetivo"
              value={objetivo}
              onChange={(e) => { setObjetivo(e.target.value); if (pergunta?.campo === "objetivo") setPergunta(null); }}
              placeholder="ou escreva com suas palavras"
              className={`mt-2 w-full px-3 py-2.5 bg-[var(--bg)] border rounded-[10px] outline-none focus:bg-white transition-all ${
                pergunta?.campo === "objetivo" ? "border-[#F59E0B]" : "border-[var(--border)] focus:border-[var(--text-primary)]"
              }`}
              style={{ fontSize: "16px" }}
            />
            {pergunta?.campo === "objetivo" && (
              <p className="mt-1 text-[12px] text-[#9B7B2D]">{pergunta.texto}</p>
            )}
          </div>

          {/* 3 · Para quando (opcional) */}
          <div>
            <label htmlFor="pedido-para" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              Para quando? <span className="font-normal text-[var(--text-muted)]">(se tiver uma data)</span>
            </label>
            <input
              id="pedido-para"
              type="date"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all"
              style={{ fontSize: "16px" }}
            />
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
              Sem data também vale — a equipe combina o prazo com você.
            </p>
          </div>

          <details className="rounded-[10px] border border-[var(--border)]">
            <summary className="cursor-pointer px-3.5 py-3 text-[12.5px] font-semibold text-[var(--text-secondary)]">
              Quer mandar uma foto ou vídeo junto? {anexos.length > 0 && `(${anexos.length})`}
            </summary>
            <div className="px-3 pb-3">
              <EnvioDeMaterial token={token} aoEnviar={(a) => setAnexos((atual) => [...atual, a.url])} />
            </div>
          </details>

          {pergunta?.campo === "geral" && (
            <p role="alert" className="rounded-[10px] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#B91C1C]">
              {pergunta.texto}
            </p>
          )}
        </div>

        {/* Rodapé colado: no celular, o botão de enviar não pode depender de rolar. */}
        <div className="sticky bottom-0 bg-white border-t border-[var(--border)] px-5 py-3.5 flex gap-2">
          <button
            onClick={() => void enviar()}
            disabled={enviando}
            style={{ touchAction: "manipulation" }}
            className="flex-1 h-12 rounded-[10px] bg-[#12B5AC] hover:bg-[#0E9E96] disabled:opacity-40 text-white text-[14px] font-semibold transition-colors"
          >
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>
          <button
            onClick={aoFechar}
            className="h-12 px-4 text-[13.5px] text-[var(--text-muted)]"
            style={{ touchAction: "manipulation" }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── A lista dos pedidos, com o ORÇAMENTO quando já veio ─────────────────────

export function MeusPedidos({
  token,
  pedidos,
  aoDecidir,
}: {
  token: string;
  pedidos: PedidoDoCliente[];
  aoDecidir?: () => void;
}) {
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(id: string, decisao: "aceito" | "recusado") {
    if (decidindo) return;
    setDecidindo(id);
    setErro(null);
    try {
      const res = await fetch("/api/portal/pedidos/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), pedidoId: id, decisao }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as Record<string, string>));
        setErro(j.error ?? "Não consegui registrar sua resposta. Tente de novo.");
        return;
      }
      aoDecidir?.();
    } catch {
      setErro("A conexão caiu. Tente de novo.");
    } finally {
      setDecidindo(null);
    }
  }

  if (pedidos.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-2">
        Seus pedidos
      </h4>
      {erro && (
        <p role="alert" className="mb-2 rounded-[10px] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#B91C1C]">{erro}</p>
      )}
      <ul className="space-y-2">
        {pedidos.map((p) => {
          const temOrcamento = typeof p.preco === "number" && p.preco > 0;
          const pendente = temOrcamento && (p.orcamento ?? "pendente") === "pendente";
          return (
            <li key={p.id} className="rounded-[10px] bg-[var(--bg-elevated)] px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-[13px] font-medium text-[var(--text-primary)] leading-snug">{p.titulo}</p>
                <span className={`shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold flex items-center ${
                  p.orcamento === "aceito" ? "bg-[#DCFCE7] text-[var(--success)]"
                  : p.orcamento === "recusado" ? "bg-[#F3F4F6] text-[#6B7280]"
                  : p.status === "triado" ? "bg-[#DCFCE7] text-[var(--success)]"
                  : p.status === "recusado" ? "bg-[#F3F4F6] text-[#6B7280]"
                  : "bg-[#FEF3C7] text-[#9B7B2D]"
                }`}>
                  {p.orcamento === "aceito" ? "Aprovado por você"
                    : p.orcamento === "recusado" ? "Recusado por você"
                    : pendente ? "Orçamento na mesa" : p.statusLegivel}
                </span>
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)] mt-1">
                Pedido em {dataCurta(p.criadoEm)}{p.para ? ` · para ${dataCurta(p.para)}` : ""}
              </p>
              {p.motivo && <p className="text-[12px] text-[var(--text-secondary)] mt-1">{p.motivo}</p>}

              {/* A DEVOLUTIVA COM PREÇO. É aqui que a agência vende — e por isso
                  o número aparece grande, com o que ele cobre logo abaixo. */}
              {temOrcamento && (
                <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-white px-3.5 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Orçamento</span>
                    <span className="text-[20px] font-bold text-[var(--text-primary)] leading-none">{emReais(p.preco!)}</span>
                  </div>
                  {p.precoNota && (
                    <p className="text-[12.5px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">{p.precoNota}</p>
                  )}
                  {pendente && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void decidir(p.id, "aceito")}
                        disabled={decidindo === p.id}
                        style={{ touchAction: "manipulation" }}
                        className="h-11 px-4 rounded-[10px] bg-[#12B5AC] hover:bg-[#0E9E96] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
                      >
                        {decidindo === p.id ? "Registrando…" : "Aprovar e fazer"}
                      </button>
                      <button
                        onClick={() => void decidir(p.id, "recusado")}
                        disabled={decidindo === p.id}
                        style={{ touchAction: "manipulation" }}
                        className="h-11 px-4 rounded-[10px] border border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        Agora não
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
