"use client";

// /agency/leads — QUEM ME PROCUROU E AINDA NÃO TEVE RESPOSTA.
//
// A tela nasce de um achado de 08/08/2026: três interessados entraram pelo
// briefing público — Sushi Cazza (51 dias), Camila Pereira (29) e Beatriz
// Gimenes (28) — com a conversa inteira gravada e NENHUM canal de contato. Não
// havia alarme e não havia tela: a caixa de entrada de `/agency/requests` lia o
// store do navegador, então quem abrisse noutro computador via zero.
//
// A UMA COISA que se vem fazer aqui: **decidir se aborda.** Por isso cada cartão
// responde, nesta ordem, as três perguntas que precedem a decisão:
//   1. dá para falar com ele?  (e, quando não dá, isso vem PRIMEIRO e em vermelho)
//   2. o que ele quer, nas palavras dele?
//   3. quanto vale, pela tabela da casa — e o que ainda não dá para saber.
//
// A tela NÃO aborda ninguém, não envia mensagem e não escreve nada. O dossiê é
// determinístico (`lib/agency/comercial/dossie-do-lead.ts`): nenhuma linha aqui
// é escrita por IA sobre um cliente que ninguém conferiu.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import type { DossieDoLead } from "@/lib/agency/comercial/dossie-do-lead";

type Resposta =
  | { estado: "carregando" }
  | { estado: "ok"; leads: DossieDoLead[]; semContato: number }
  /** "não consegui olhar" tem tela própria. Lista vazia por falha de leitura é
   *  exatamente como esta fila ficou invisível por sete semanas. */
  | { estado: "nao_medido"; motivo: string };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function LeadsPage() {
  const [r, setR] = useState<Resposta>({ estado: "carregando" });
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setR({ estado: "carregando" });
    try {
      const resp = await fetch("/api/agency/leads");
      const body = await resp.json();
      if (!resp.ok || body?.medido !== true) {
        setR({ estado: "nao_medido", motivo: body?.motivo ?? "a lista de interessados não pôde ser lida agora" });
        return;
      }
      setR({ estado: "ok", leads: body.leads ?? [], semContato: body.semContato ?? 0 });
    } catch {
      setR({ estado: "nao_medido", motivo: "não consegui falar com o servidor — esta lista não é zero, é desconhecida" });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="max-w-[900px]">
      <AgencyHeader
        eyebrow="Comercial"
        title="Quem procurou a Dioli"
        subtitle="Briefings que chegaram pela porta pública e ainda não viraram cliente. O mais antigo em cima."
        meta={
          r.estado === "ok" && r.semContato > 0 ? (
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[6px] bg-[var(--danger-bg)] text-[var(--danger)] text-[12px] font-semibold">
              {r.semContato} sem forma de contato
            </span>
          ) : undefined
        }
      />

      {r.estado === "carregando" && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[112px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse" />
          ))}
        </div>
      )}

      {r.estado === "nao_medido" && (
        <div className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-5 py-4">
          <p className="text-[13px] font-semibold text-[var(--danger)]">Não consegui ler a fila</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{r.motivo}</p>
          <button
            onClick={() => void carregar()}
            className="mt-3 h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {r.estado === "ok" && r.leads.length === 0 && (
        <EmptyState
          title="Ninguém esperando"
          description="Todo briefing que chegou já virou proposta ou cliente. Quando alguém preencher o briefing público, ele aparece aqui."
        />
      )}

      {r.estado === "ok" && r.leads.length > 0 && (
        <div className="space-y-3">
          {r.leads.map((l) => (
            <Cartao
              key={l.id}
              lead={l}
              aberto={aberto === l.id}
              onToggle={() => setAberto(aberto === l.id ? null : l.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Cartao({ lead, aberto, onToggle }: { lead: DossieDoLead; aberto: boolean; onToggle: () => void }) {
  const semContato = !lead.contato.temComoFalar;

  return (
    <div className={`rounded-[12px] border bg-white overflow-hidden ${semContato ? "border-[var(--danger)]" : "border-[var(--border)]"}`}>
      <button
        onClick={onToggle}
        style={{ touchAction: "manipulation" }}
        className="w-full text-left px-4 sm:px-5 py-4 hover:bg-[var(--bg)] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{lead.negocio}</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              {lead.segmento ?? "segmento não informado"} · parado há {lead.diasParado} dia{lead.diasParado === 1 ? "" : "s"}
            </p>
          </div>
          <span className="text-[12px] text-[var(--text-muted)] shrink-0 pt-1">{aberto ? "fechar" : "abrir"}</span>
        </div>

        {/* ESTE CONTATO JÁ ESCREVEU ANTES (16/08/2026). Pergunta do CEO: "cinco
            briefings do mesmo e-mail, o que acontece?". Acontecia que apareciam
            cinco cartões idênticos e nada dizia que eram a mesma pessoa. O
            carimbo NÃO afirma que é pedido repetido — pode ser um segundo
            projeto legítimo. Ele diz o fato e deixa a leitura para quem abre. */}
        {lead.repeticao && (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[6px] bg-[var(--warning-bg)] text-[var(--warning)] text-[12px] font-semibold">
              {lead.repeticao.ordem}º briefing deste mesmo contato (de {lead.repeticao.vezes})
            </span>
          </div>
        )}

        {/* A pergunta que decide tudo vem primeiro, e o "não" é vermelho. */}
        <div className="mt-3">
          {semContato ? (
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[6px] bg-[var(--danger-bg)] text-[var(--danger)] text-[12px] font-semibold">
              Sem como falar com esta pessoa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[6px] bg-[var(--success-bg)] text-[var(--success)] text-[12px] font-semibold">
              {lead.contato.canais.map((c) => (c.tipo === "whatsapp" ? "WhatsApp" : "E-mail")).join(" · ")}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[16px] font-semibold text-[var(--text-primary)]">
            {lead.faixa ? `${brl(lead.faixa.minimo)} – ${brl(lead.faixa.maximo)}` : "faixa a definir"}
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">
            {lead.fonteDaFaixa === "escopo_declarado"
              ? "pela tabela da casa, sobre o escopo declarado"
              : lead.fonteDaFaixa === "catalogo_sem_cadencia"
              ? "banda do catálogo — volume não declarado"
              : "a tabela da casa não cobre o que foi pedido"}
          </span>
        </div>
      </button>

      {aberto && (
        <div className="border-t border-[var(--border)] px-4 sm:px-5 py-4 space-y-5">
          <Bloco titulo="Como falar">
            {semContato ? (
              <>
                <p className="text-[13px] text-[var(--danger)] font-medium leading-relaxed">
                  Não há contato gravado: {lead.contato.motivo}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Nada foi deduzido do texto da conversa. O que aparece abaixo são pistas que a pessoa
                  mencionou — <strong>não são contato confirmado</strong>, e quem decide se aborda por
                  ali é você.
                </p>
                {lead.pistas.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {lead.pistas.map((p, i) => (
                      <li key={i} className="text-[13px] text-[var(--text-primary)]">
                        <span className="text-[var(--text-muted)]">{p.tipo} (pista):</span> {p.valor}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)] mt-2.5">Nenhuma pista no texto do briefing.</p>
                )}
              </>
            ) : (
              <ul className="space-y-1">
                {lead.contato.nome && (
                  <li className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">nome:</span> {lead.contato.nome}
                  </li>
                )}
                {lead.contato.canais.map((c) => (
                  <li key={c.tipo} className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">{c.tipo === "whatsapp" ? "WhatsApp" : "e-mail"}:</span> {c.valor}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          {lead.repeticao && (
            <Bloco titulo="Este contato já escreveu antes">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                São <strong>{lead.repeticao.vezes} briefings</strong> do mesmo contato, e este é o{" "}
                <strong>{lead.repeticao.ordem}º</strong>. O primeiro chegou em{" "}
                {new Date(lead.repeticao.primeiroEm).toLocaleDateString("pt-BR")}.
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                <strong>Nenhum deles foi juntado nem descartado</strong> — cada briefing está inteiro,
                com o texto que a pessoa escreveu. Pode ser o mesmo pedido reenviado, ou um{" "}
                <strong>segundo projeto</strong> que ela quer contratar: quem lê os dois decide, não o
                sistema.
              </p>
              <ul className="mt-2.5 space-y-1">
                {lead.repeticao.irmaos.map((id) => (
                  <li key={id} className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">outro briefing:</span>{" "}
                    <code className="text-[12px]">{id}</code>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {lead.servicosPedidos.length > 0 && (
            <Bloco titulo="O que ele pediu">
              <div className="flex flex-wrap gap-1.5">
                {lead.servicosPedidos.map((s, i) => (
                  <span key={i} className="h-6 px-2.5 inline-flex items-center rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)] text-[12px]">
                    {s}
                  </span>
                ))}
              </div>
            </Bloco>
          )}

          {lead.oQueEleContou.length > 0 && (
            <Bloco titulo="Nas palavras dele">
              <ul className="space-y-1.5">
                {lead.oQueEleContou.map((f, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
                    {f}
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          <Bloco titulo="Escopo e faixa, pela tabela da casa">
            {lead.escopo.length > 0 ? (
              <div className="space-y-2">
                {/* A 375px, título e preço lado a lado brigam pela mesma
                    largura: o nome do plano quebra em três linhas e o preço
                    fica espremido no canto, longe do item que ele precifica.
                    No celular a linha EMPILHA — preço embaixo do que ele
                    precifica —, e só a partir de `sm` vira duas colunas. */}
                {lead.escopo.map((l, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{l.item}</p>
                      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{l.detalhe}</p>
                    </div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)] shrink-0 tabular-nums">
                      {brl(l.minimo)}–{brl(l.maximo)}
                      <span className="text-[12px] font-normal text-[var(--text-muted)]">/{l.unidade}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-[12px] text-[var(--text-muted)] mt-3 leading-relaxed">{lead.notaDaFaixa}</p>
          </Bloco>

          {lead.precisoConfirmar.length > 0 && (
            <Bloco titulo="Preciso confirmar">
              <ul className="space-y-1">
                {lead.precisoConfirmar.map((p, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed">• {p}</li>
                ))}
              </ul>
            </Bloco>
          )}
        </div>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">{titulo}</p>
      {children}
    </div>
  );
}
