"use client";

// PacoteDaMarca — O QUE SE PRODUZ para este cliente.
//
// Decisão do CEO (27/09/2026): cada marca tem um MODO DE APROVAÇÃO (ver
// ModoDeAprovacao.tsx, ao lado) e um PACOTE — a frequência, os formatos, os
// dias, os horários e os pilares de conteúdo. Sem pacote, o calendário não é
// gerado: "Gerar calendário do mês" (Planner) recusa com 422 até este formulário
// ser preenchido — é por isso que o estado VAZIO daqui não é decoração, é a
// causa raiz de uma recusa que a pessoa vê em outra tela.
//
// Fonte: GET/PUT /api/agency/clients/{id}/pacote. Só master escreve — os
// demais papéis veem o mesmo formulário em modo leitura (DESIGN.md §7: nunca
// esconder o controle, desabilitar com o motivo).

import { useCallback, useEffect, useState } from "react";

interface Pilar { nome: string; peso: number }

interface Pacote {
  postsPorDia: number;
  postsPorSemana: number;
  formatos: string[];
  /** 0=domingo … 6=sábado. */
  dias: number[];
  /** "HH:MM", fuso de Brasília. */
  horarios: string[];
  pilares: Pilar[];
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  /** `motivo` vem de `lerPacote` (a rota) quando existe pacoteJson gravado mas
   *  inválido — mais informativo que "sem pacote" sozinho. Ausente quando o
   *  cliente simplesmente nunca teve pacote definido. */
  | { fase: "vazio"; motivo?: string | null }
  | { fase: "ok"; pacote: Pacote };

const FORMATOS_PACOTE: { id: string; label: string; nota?: string }[] = [
  { id: "feed_imagem", label: "Feed imagem" },
  { id: "carrossel", label: "Carrossel" },
  { id: "reels", label: "Reels", nota: "Reels só com vídeo enviado pelo cliente" },
  { id: "stories", label: "Stories" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// A recusa PADRÃO de `lerPacote` (marca que nunca teve pacote definido) cita os
// campos do contrato em parênteses — vocabulário de rota, não de tela. O CEO lê
// "Sem pacote — o calendário não é gerado até o pacote ser definido." e mais
// nada; só mostramos o `motivo` cru quando ele NÃO é esta recusa padrão (ex.:
// pacote gravado corrompido / JSON inválido — aí o detalhe técnico ajuda).
const MOTIVO_AUSENCIA_PADRAO = "ainda não tem pacote definido";

// O contrato (`PacoteDaMarcaSchema`, lib/agency/esteira/pacote-da-marca.ts)
// exige AO MENOS UM pilar — pacote sem pilar nenhum é 400. O padrão nasce com
// um pilar de propósito: começar de um array vazio empurraria todo cliente
// novo direto para o erro de validação no primeiro "Salvar".
const PACOTE_PADRAO: Pacote = {
  postsPorDia: 1,
  postsPorSemana: 3,
  formatos: ["feed_imagem"],
  dias: [1, 3, 5],
  horarios: ["09:00"],
  pilares: [{ nome: "Geral", peso: 1 }],
};

function ordenarHorarios(horarios: string[]): string[] {
  return [...horarios].sort();
}

/**
 * A MESMA régua do `PacoteDaMarcaSchema`, espelhada aqui para o erro aparecer
 * ANTES do round-trip ao servidor — nunca em vez dele: o servidor continua
 * sendo quem decide de verdade (`erroSalvar` cobre o 400 dele também).
 */
function validarDraft(d: Pacote): string | null {
  if (d.formatos.length === 0) return "Escolha pelo menos um formato.";
  if (d.dias.length === 0) return "Escolha pelo menos um dia da semana.";
  if (d.horarios.length === 0) return "Adicione pelo menos um horário.";
  if (d.pilares.length === 0) return "Adicione pelo menos um pilar de conteúdo.";
  if (d.pilares.some((p) => !p.nome.trim())) return "Todo pilar precisa de um nome.";
  if (d.postsPorSemana > d.postsPorDia * d.dias.length) {
    return "Posts por semana não pode ser maior que posts por dia × número de dias escolhidos.";
  }
  return null;
}

export default function PacoteDaMarca({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState<Pacote>(PACOTE_PADRAO);
  const [novoHorario, setNovoHorario] = useState("09:00");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/pacote`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar o pacote agora." }); return; }
      if (!j.pacote) { setEstado({ fase: "vazio", motivo: typeof j.motivo === "string" ? j.motivo : null }); return; }
      setEstado({ fase: "ok", pacote: j.pacote as Pacote });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  function abrirEdicao() {
    setDraft(estado.fase === "ok" ? estado.pacote : PACOTE_PADRAO);
    setErroSalvar(null);
    setEditando(true);
  }

  async function salvar() {
    const problema = validarDraft(draft);
    if (problema) { setErroSalvar(problema); return; }
    setSalvando(true);
    setErroSalvar(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/pacote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErroSalvar(typeof j.error === "string" ? j.error : "Não consegui salvar o pacote agora.");
        return;
      }
      setEstado({ fase: "ok", pacote: j.pacote as Pacote });
      setEditando(false);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch {
      setErroSalvar("Falha de rede ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function alternarFormato(id: string) {
    setDraft((d) => ({
      ...d,
      formatos: d.formatos.includes(id) ? d.formatos.filter((f) => f !== id) : [...d.formatos, id],
    }));
  }
  function alternarDia(i: number) {
    setDraft((d) => ({
      ...d,
      dias: d.dias.includes(i) ? d.dias.filter((x) => x !== i) : [...d.dias, i].sort(),
    }));
  }
  function adicionarHorario() {
    if (!novoHorario || draft.horarios.includes(novoHorario)) return;
    setDraft((d) => ({ ...d, horarios: ordenarHorarios([...d.horarios, novoHorario]) }));
  }
  function removerHorario(h: string) {
    setDraft((d) => ({ ...d, horarios: d.horarios.filter((x) => x !== h) }));
  }
  function adicionarPilar() {
    setDraft((d) => ({ ...d, pilares: [...d.pilares, { nome: "", peso: 1 }] }));
  }
  function atualizarPilar(i: number, campo: keyof Pilar, valor: string | number) {
    setDraft((d) => ({ ...d, pilares: d.pilares.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)) }));
  }
  function removerPilar(i: number) {
    setDraft((d) => ({ ...d, pilares: d.pilares.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Pacote da marca</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">O que se produz para este cliente — frequência, formatos, dias e horários.</p>
        </div>
        <div className="flex items-center gap-2">
          {salvo && <span className="text-[12px] text-[var(--success)] font-medium">✓ Salvo</span>}
          {podeEditar && estado.fase === "ok" && !editando && (
            <button
              onClick={abrirEdicao}
              className="h-11 sm:h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
            >
              Editar
            </button>
          )}
          {!podeEditar && (
            <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]" title="Só quem é master edita o pacote">
              Leitura
            </span>
          )}
        </div>
      </div>

      {/* ── Carregando ─────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-[8px] bg-[var(--accent)] animate-pulse" />
            ))}
          </div>
          <span className="sr-only">Carregando o pacote da marca…</span>
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

      {/* ── Vazio — a causa raiz da recusa no Planner ─────────────────────
          "Sem pacote — o calendário não é gerado até o pacote ser definido."
          Contrato exato: nomear a consequência, não só a ausência (§7.2). */}
      {estado.fase === "vazio" && !editando && (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Sem pacote</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
            O calendário não é gerado até o pacote ser definido.
          </p>
          {estado.motivo && !estado.motivo.includes(MOTIVO_AUSENCIA_PADRAO) && (
            <p className="text-[12px] text-[var(--text-subtle)] mt-1.5 max-w-[46ch] mx-auto italic">{estado.motivo}</p>
          )}
          {podeEditar ? (
            <button
              onClick={abrirEdicao}
              className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
            >
              Definir pacote
            </button>
          ) : (
            <p className="text-[12px] text-[var(--text-subtle)] mt-2 italic">Só quem é master pode definir.</p>
          )}
        </div>
      )}

      {/* ── Leitura (existe pacote, não editando) ─────────────────────────── */}
      {estado.fase === "ok" && !editando && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metrica rotulo="Posts por dia" valor={String(estado.pacote.postsPorDia)} />
            <Metrica rotulo="Posts por semana" valor={String(estado.pacote.postsPorSemana)} />
            <Metrica rotulo="Formatos" valor={String(estado.pacote.formatos.length)} />
            <Metrica rotulo="Horários" valor={String(estado.pacote.horarios.length)} />
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Formatos</h3>
            <div className="flex flex-wrap gap-1.5">
              {estado.pacote.formatos.length === 0 ? (
                <span className="text-[12px] text-[var(--text-subtle)] italic">nenhum formato escolhido</span>
              ) : (
                estado.pacote.formatos.map((f) => (
                  <span key={f} className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                    {FORMATOS_PACOTE.find((x) => x.id === f)?.label ?? f}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Dias da semana</h3>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d, i) => (
                <span
                  key={d}
                  className={`inline-flex h-6 w-9 items-center justify-center rounded-[6px] text-[12px] font-semibold ${
                    estado.pacote.dias.includes(i) ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--text-subtle)] border border-[var(--border)]"
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Horários (Brasília)</h3>
            <div className="flex flex-wrap gap-1.5">
              {estado.pacote.horarios.length === 0 ? (
                <span className="text-[12px] text-[var(--text-subtle)] italic">nenhum horário definido</span>
              ) : (
                estado.pacote.horarios.map((h) => (
                  <span key={h} className="mono-num inline-flex h-6 items-center rounded-[6px] px-2 text-[12px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                    {h}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Pilares de conteúdo</h3>
            {estado.pacote.pilares.length === 0 ? (
              <p className="text-[12px] text-[var(--text-subtle)] italic">nenhum pilar definido</p>
            ) : (
              <ul className="space-y-1">
                {estado.pacote.pilares.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-[12.5px] text-[var(--text-primary)]">
                    <span>{p.nome || <em className="text-[var(--text-subtle)]">sem nome</em>}</span>
                    <span className="text-[var(--text-muted)]">peso {p.peso}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Formulário (definir ou editar) — só master chega aqui ─────────── */}
      {editando && podeEditar && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero
              id="pacote-posts-dia"
              label="Posts por dia"
              min={1}
              max={5}
              valor={draft.postsPorDia}
              onChange={(n) => setDraft((d) => ({ ...d, postsPorDia: n }))}
            />
            <CampoNumero
              id="pacote-posts-semana"
              label="Posts por semana"
              min={1}
              max={21}
              valor={draft.postsPorSemana}
              onChange={(n) => setDraft((d) => ({ ...d, postsPorSemana: n }))}
            />
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Formatos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FORMATOS_PACOTE.map((f) => (
                <label key={f.id} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.formatos.includes(f.id)}
                    onChange={() => alternarFormato(f.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--navy)]"
                  />
                  <span>
                    {f.label}
                    {f.nota && <span className="block text-[12px] text-[var(--text-muted)]">{f.nota}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Dias da semana</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana em que este cliente publica">
              {DIAS_SEMANA.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={draft.dias.includes(i)}
                  onClick={() => alternarDia(i)}
                  className={`h-11 sm:h-9 min-w-[44px] px-2 rounded-[6px] text-[12px] font-semibold transition-colors ${
                    draft.dias.includes(i) ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--accent)]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Horários (Brasília)</h3>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.horarios.map((h) => (
                // A "×" é o único alvo abaixo de 44px deste formulário, DE
                // PROPÓSITO documentado: aumentar um remover-chip até 44px
                // dentro de uma lista compacta de horários trocaria densidade
                // por espaço vazio — mesma concessão que Linear/Attio fazem em
                // chip removível. O botão principal (Salvar) continua ≥44px.
                <span key={h} className="mono-num inline-flex h-9 sm:h-8 items-center gap-1 rounded-[6px] pl-2.5 pr-1 text-[13px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                  {h}
                  <button
                    type="button"
                    onClick={() => removerHorario(h)}
                    aria-label={`Remover horário ${h}`}
                    className="h-8 w-8 sm:h-6 sm:w-6 rounded-full flex items-center justify-center hover:bg-[var(--border)] text-[var(--text-muted)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="pacote-novo-horario" className="sr-only">Novo horário</label>
              <input
                id="pacote-novo-horario"
                type="time"
                value={novoHorario}
                onChange={(e) => setNovoHorario(e.target.value)}
                className="h-11 sm:h-9 rounded-[7px] px-2.5 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
              <button
                type="button"
                onClick={adicionarHorario}
                className="h-11 sm:h-9 px-3 rounded-[7px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
              >
                + Adicionar
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Pilares de conteúdo</h3>
              <button
                type="button"
                onClick={adicionarPilar}
                className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
              >
                + Pilar
              </button>
            </div>
            {draft.pilares.length === 0 ? (
              // Pelo menos um pilar é OBRIGATÓRIO (o servidor recusa com 400
              // sem nenhum) — não é "opcional", é estado inválido de trânsito
              // enquanto quem edita monta a lista.
              <p className="text-[12px]" style={{ color: "var(--warning)" }}>
                Pelo menos um pilar é obrigatório — use &quot;+ Pilar&quot; acima.
              </p>
            ) : (
              <div className="space-y-2">
                {draft.pilares.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`pacote-pilar-nome-${i}`}>Nome do pilar</label>
                    <input
                      id={`pacote-pilar-nome-${i}`}
                      value={p.nome}
                      onChange={(e) => atualizarPilar(i, "nome", e.target.value)}
                      placeholder="Ex.: Bastidores"
                      className="flex-1 min-w-0 h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                    <label className="sr-only" htmlFor={`pacote-pilar-peso-${i}`}>Peso do pilar</label>
                    <input
                      id={`pacote-pilar-peso-${i}`}
                      type="number"
                      min={1}
                      value={p.peso}
                      onChange={(e) => atualizarPilar(i, "peso", Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 h-11 sm:h-9 px-2 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removerPilar(i)}
                      aria-label={`Remover pilar ${p.nome || i + 1}`}
                      className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] flex items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erroSalvar && (
            <p role="alert" className="text-[12.5px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroSalvar}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-semibold transition-colors bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              onClick={() => { setEditando(false); setErroSalvar(null); }}
              disabled={salvando}
              className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] px-3.5 py-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{rotulo}</div>
      <div className="mono-num text-[20px] font-bold leading-none text-[var(--text-primary)] mt-1.5">{valor}</div>
    </div>
  );
}

function CampoNumero({
  id, label, valor, onChange, min, max,
}: { id: string; label: string; valor: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
      />
    </div>
  );
}
