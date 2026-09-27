"use client";

// Aprovar semana (CEO) — a tela interna do modo de aprovação APROVACAO_CEO.
//
// Decisão do CEO (27/09/2026): a marca que nasce (e a que ainda está em
// APROVACAO_CEO) tem a semana aprovada por ele mesmo, aqui — não pelo cliente,
// não em silêncio. O ato é o mesmo desenho de "Gerar calendário do mês": uma
// escolha, uma contagem do que vai entrar, uma confirmação explícita, e só
// então a chamada que grava.
//
// Fonte: POST /api/social-posts/aprovacao-ceo {clientId, de, ate} →
// 200 {ok, aprovados, agendados} | 409/400/404 {error}.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CascaDeModal } from "./CascaDeModal";
import EmptyState from "@/components/agency/ui/EmptyState";
import { keyOf, type Post } from "./tipos";

/** Segunda-feira da semana QUE CONTÉM `d`, à meia-noite local. */
function segundaDaSemana(d: Date): Date {
  const dia = d.getDay(); // 0=dom … 6=sáb
  const deslocamento = dia === 0 ? -6 : 1 - dia;
  const seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() + deslocamento);
  seg.setHours(0, 0, 0, 0);
  return seg;
}

/** A semana seguinte à atual — o padrão que a ficha pede ("a próxima"). */
function proximaSemana(): { de: Date; ate: Date } {
  const segAtual = segundaDaSemana(new Date());
  const de = new Date(segAtual.getFullYear(), segAtual.getMonth(), segAtual.getDate() + 7);
  const ate = new Date(de.getFullYear(), de.getMonth(), de.getDate() + 6);
  return { de, ate };
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface EstadoDoModo {
  fase: "carregando" | "ok" | "erro" | "nenhum";
  modoEmVigor?: string;
}

export function AprovarSemanaCeoModal({
  clients, posts, onClose, onAprovado,
}: {
  clients: { id: string; name: string }[];
  /** As peças já carregadas no Planner — usadas só para a CONTAGEM local
   *  (peças previstas na janela). A verdade de quantas foram de fato
   *  aprovadas vem da resposta do servidor, nunca desta conta. */
  posts: Post[];
  onClose: () => void;
  onAprovado: () => void | Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [semana, setSemana] = useState(() => proximaSemana());
  const [modo, setModo] = useState<EstadoDoModo>({ fase: "nenhum" });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [sucesso, setSucesso] = useState<{ aprovados: number; agendados: number; motivo: string | null } | null>(null);

  const de = keyOf(semana.de);
  const ate = keyOf(semana.ate);

  // ── A checagem honesta: esta marca está mesmo em APROVACAO_CEO? ───────────
  // Reusa o contrato de modo-aprovacao (a mesma rota da página da marca) em vez
  // de inventar uma segunda fonte de verdade. Falha de rede aqui NÃO bloqueia —
  // quem decide de verdade é o 409 do POST; isto é só um aviso adiantado.
  useEffect(() => {
    if (!clientId) { setModo({ fase: "nenhum" }); return; }
    let ativo = true;
    setModo({ fase: "carregando" });
    void (async () => {
      try {
        const r = await fetch(`/api/agency/clients/${clientId}/modo-aprovacao`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!ativo) return;
        // Falha de LEITURA (rede/500) não é o mesmo estado que "confirmado,
        // dentro do modo" — sem isso a tela mostrava a mesma linha de sucesso
        // para as duas coisas (achado da `experiencia`, 27/09/2026). O 409 do
        // POST continua sendo quem trava de verdade; isto só evita a falsa
        // sensação de "conferido".
        if (!r.ok || !j) { setModo({ fase: "erro" }); return; }
        setModo({ fase: "ok", modoEmVigor: j.modoEmVigor ?? j.modoAprovacao });
      } catch {
        if (ativo) setModo({ fase: "erro" });
      }
    })();
    return () => { ativo = false; };
  }, [clientId]);

  const foraDoModo = modo.fase === "ok" && modo.modoEmVigor !== "APROVACAO_CEO";

  const pecasNaJanela = useMemo(() => {
    if (!clientId) return [];
    return posts.filter((p) => {
      if (p.clientId !== clientId || !p.scheduledFor) return false;
      const k = keyOf(new Date(p.scheduledFor));
      return k >= de && k <= ate;
    });
  }, [posts, clientId, de, ate]);

  function mudarSemana(dir: -1 | 1) {
    setSemana((s) => ({
      de: new Date(s.de.getFullYear(), s.de.getMonth(), s.de.getDate() + dir * 7),
      ate: new Date(s.ate.getFullYear(), s.ate.getMonth(), s.ate.getDate() + dir * 7),
    }));
    setConfirmando(false);
    setErro(null);
  }

  async function aprovar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/social-posts/aprovacao-ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, de, ate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(typeof json.error === "string" ? json.error : "Não consegui aprovar esta semana agora.");
        setConfirmando(false);
        return;
      }
      setSucesso({
        aprovados: typeof json.aprovados === "number" ? json.aprovados : 0,
        agendados: typeof json.agendados === "number" ? json.agendados : 0,
        // "0 aprovados" sem contexto lê como falha muda. Quando o servidor
        // manda o motivo (ex.: "nenhuma peça pronta neste intervalo"), ele
        // vale mais que o número sozinho.
        motivo: typeof json.motivo === "string" ? json.motivo : null,
      });
      await onAprovado();
    } catch {
      setErro("Falha de rede ao aprovar. Tente de novo.");
      setConfirmando(false);
    } finally {
      setCarregando(false);
    }
  }

  const clienteEscolhido = clients.find((c) => c.id === clientId)?.name ?? "";

  return (
    <CascaDeModal
      titulo="Aprovar semana (CEO)"
      descricao="Para marcas em modo Aprovação do CEO — a decisão que, nas outras marcas, é do cliente."
      onClose={onClose}
      rodape={
        sucesso ? (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-[8px] px-5 text-[12.5px] font-semibold text-white sm:h-9"
              style={{ background: "var(--primary)" }}
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={carregando}
              className="h-11 rounded-[8px] px-4 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-50 sm:h-9"
            >
              Cancelar
            </button>
            <div className="flex-1" />
            {!confirmando ? (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={!clientId || carregando || foraDoModo}
                className="h-11 rounded-[8px] px-5 text-[12.5px] font-semibold text-white disabled:opacity-40 sm:h-9"
                style={{ background: "var(--primary)" }}
              >
                Revisar e aprovar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void aprovar()}
                disabled={carregando}
                className="h-11 rounded-[8px] px-5 text-[12.5px] font-semibold text-white disabled:opacity-60 sm:h-9"
                style={{ background: "var(--primary)" }}
              >
                {carregando ? "Aprovando…" : "Sim, aprovar esta semana"}
              </button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-4 px-5 py-4">
        {clients.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">✓</span>}
            title="Nenhum cliente cadastrado"
            description="Cadastre um cliente antes de aprovar uma semana para ele."
          />
        ) : sucesso ? (
          <div
            className="rounded-[10px] p-3"
            style={{ background: "var(--success-bg)", border: "1px solid var(--success)" }}
          >
            <p role="status" className="text-[13px] font-semibold" style={{ color: "var(--success)" }}>
              {sucesso.aprovados} {sucesso.aprovados === 1 ? "peça aprovada" : "peças aprovadas"}
              {sucesso.agendados > 0 ? ` · ${sucesso.agendados} ${sucesso.agendados === 1 ? "agendada" : "agendadas"}` : ""}.
            </p>
            {sucesso.aprovados === 0 && sucesso.motivo ? (
              // "0 aprovados" sozinho lê como falha muda — o motivo do
              // servidor (ex.: "nenhuma peça pronta para aprovação neste
              // intervalo") é o que explica por que não há nada a aprovar.
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--success)" }}>{sucesso.motivo}</p>
            ) : (
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--success)" }}>
                A semana de {dataCurta(semana.de)} a {dataCurta(semana.ate)} de {clienteEscolhido} está aprovada.
              </p>
            )}
          </div>
        ) : (
          <>
            <Field label="Marca" htmlFor="aprovacao-ceo-cliente">
              <select
                id="aprovacao-ceo-cliente"
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setErro(null); setConfirmando(false); }}
                disabled={carregando}
                className="h-11 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none disabled:opacity-60 sm:h-9"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              >
                <option value="" disabled>Selecione uma marca</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>

            <Field label="Semana" htmlFor="aprovacao-ceo-semana">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => mudarSemana(-1)}
                  disabled={carregando}
                  aria-label="Semana anterior"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-50 sm:h-9 sm:w-9"
                  style={{ border: "1px solid var(--border)" }}
                >‹</button>
                <span
                  id="aprovacao-ceo-semana"
                  className="flex h-11 flex-1 items-center justify-center rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] sm:h-9"
                  style={{ border: "1px solid var(--border)", background: "var(--card)" }}
                >
                  {dataCurta(semana.de)} a {dataCurta(semana.ate)} (seg–dom)
                </span>
                <button
                  type="button"
                  onClick={() => mudarSemana(1)}
                  disabled={carregando}
                  aria-label="Próxima semana"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-50 sm:h-9 sm:w-9"
                  style={{ border: "1px solid var(--border)" }}
                >›</button>
              </div>
            </Field>

            {clientId && (
              <div
                className="rounded-[10px] p-3 text-[12.5px]"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                {modo.fase === "carregando" ? (
                  <span className="text-[var(--text-muted)]">Conferindo o modo de aprovação desta marca…</span>
                ) : modo.fase === "erro" ? (
                  // Terceiro estado: nem "confirmado" nem "fora do modo" — a
                  // LEITURA falhou. Nunca reaproveitar o texto de sucesso aqui
                  // (o servidor ainda confere de verdade no POST).
                  <span className="text-[var(--text-muted)]">
                    Não consegui confirmar o modo desta marca agora — a aprovação ainda vai conferir na hora de gravar.
                  </span>
                ) : foraDoModo ? (
                  <div style={{ color: "var(--warning)" }}>
                    <p>
                      <b>Esta marca não está em modo Aprovação do CEO</b> agora ({modo.modoEmVigor}). Não há o que aprovar aqui.
                    </p>
                    <Link
                      href={`/agency/clients/${clientId}?tab=social`}
                      className="mt-2 inline-flex h-8 items-center rounded-[7px] px-3 text-[12px] font-semibold"
                      style={{ background: "var(--warning)", color: "#fff" }}
                    >
                      Abrir modo de aprovação da marca →
                    </Link>
                  </div>
                ) : (
                  <span className="text-[var(--text-secondary)]">
                    <b className="text-[var(--text-primary)]">{pecasNaJanela.length}</b>{" "}
                    {pecasNaJanela.length === 1 ? "peça prevista" : "peças previstas"} nesta janela, do que já está no calendário.
                  </span>
                )}
              </div>
            )}

            {confirmando && !foraDoModo && (
              <div
                className="rounded-[10px] p-3"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
              >
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                  Confirma aprovar a semana de {dataCurta(semana.de)} a {dataCurta(semana.ate)} para {clienteEscolhido}?
                </p>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Isto libera a publicação das peças agendadas nesta janela — a mesma decisão que, no modo Semanal, seria do cliente.
                </p>
              </div>
            )}

            {erro && (
              <div role="alert" className="rounded-[8px] px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                {erro}
              </div>
            )}
          </>
        )}
      </div>
    </CascaDeModal>
  );
}

function Field({
  label, children, htmlFor,
}: {
  label: string; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold text-[var(--text-primary)]">{label}</label>
      {children}
    </div>
  );
}
