"use client";

// Gerar calendário do mês — um cliente, um mês, N posts por semana, e a IA
// preenche o resto (rascunhos que o cliente aprova pelo portal).
//
// Reusa a CascaDeModal (mesmo contrato de foco/ESC dos outros diálogos do
// Planner) em vez de inventar um modal novo — DESIGN.md §4.3.

import { useState } from "react";
import Link from "next/link";
import { CascaDeModal } from "./CascaDeModal";
import EmptyState from "@/components/agency/ui/EmptyState";
import { MONTHS } from "./tipos";

const FRASE_FICHA_DE_MARCA = "preciso confirmar a ficha de marca";
// A NOVA recusa (27/09/2026): o calendário agora lê frequência, formatos, dias
// e horários do PACOTE da marca — sem pacote, não há o que gerar. Mesmo
// tratamento da ficha de marca (orientação, não erro), apontando para onde o
// pacote se define.
const FRASE_PACOTE_DA_MARCA = "preciso do pacote da marca";

interface Barrada { motivo: string }
/** O que ENTROU no calendário, mas precisa de atenção — ex.: "preciso de
 *  vídeo do cliente" para um reel que a IA não pode ilustrar sozinha. Não é
 *  falha (o rascunho existe); é um aviso do que falta para ele sair redondo. */
interface Pendente { motivo: string }
interface Sucesso { texto: string; barradas: Barrada[]; pendentes: Pendente[] }

function opcoesDeMes(): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return out;
}

export function GerarCalendarioModal({
  clients, onClose, onGerado,
}: {
  clients: { id: string; name: string }[];
  onClose: () => void;
  /** Chamado depois de um 200 — quem abriu decide como recarregar a lista. */
  onGerado: () => void | Promise<void>;
}) {
  const meses = opcoesDeMes();
  const [clientId, setClientId] = useState("");
  const [mes, setMes] = useState(meses[1]?.value ?? meses[0]!.value); // próximo mês
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [orientacaoDeMarca, setOrientacaoDeMarca] = useState<string | null>(null);
  // Mesmo tratamento da ficha de marca, aviso separado porque o destino do
  // link é outro (o pacote, não a ficha).
  const [orientacaoDePacote, setOrientacaoDePacote] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<Sucesso | null>(null);

  async function gerar() {
    if (!clientId) { setErro("Escolha um cliente."); return; }
    setErro(null);
    setOrientacaoDeMarca(null);
    setOrientacaoDePacote(null);
    setSucesso(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/social-posts/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "posts por semana" saiu do formulário: quem manda na frequência,
        // nos formatos, nos dias e nos horários agora é o Pacote da marca.
        body: JSON.stringify({ clientId, mes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json.error === "string" ? json.error : "Não foi possível gerar o calendário agora.";
        if (res.status === 422 && msg.includes(FRASE_PACOTE_DA_MARCA)) {
          setOrientacaoDePacote(msg);
        } else if (res.status === 422 && msg.includes(FRASE_FICHA_DE_MARCA)) {
          setOrientacaoDeMarca(msg);
        } else {
          setErro(msg);
        }
        return;
      }
      const criados = typeof json.criados === "number" ? json.criados : 0;
      const jaExistiam = typeof json.jaExistiam === "number" ? json.jaExistiam : 0;
      const barradas: Barrada[] = Array.isArray(json.barradas) ? json.barradas : [];
      const pendentes: Pendente[] = Array.isArray(json.pendentes) ? json.pendentes : [];
      const texto = criados > 0
        ? `${criados} rascunho${criados === 1 ? "" : "s"} criado${criados === 1 ? "" : "s"} — as artes saem sozinhas e o cliente aprova pelo portal.`
        : jaExistiam > 0
          ? "O calendário deste mês já existia."
          : "Nenhum rascunho novo foi criado.";
      setSucesso({ texto, barradas, pendentes });
      await onGerado();
    } catch {
      setErro("Falha de rede ao gerar o calendário. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const clienteEscolhido = clients.find((c) => c.id === clientId)?.name ?? "";

  return (
    <CascaDeModal
      titulo="Gerar calendário do mês"
      descricao="Sai o mês em texto (tema, formato, pilar e rascunho de legenda). A arte e a legenda final saem toda quinta, para a semana seguinte. Quem aprova depende do modo da marca."
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
            <button
              type="button"
              onClick={gerar}
              disabled={carregando || clients.length === 0}
              className="h-11 rounded-[8px] px-5 text-[12.5px] font-semibold text-white disabled:opacity-60 sm:h-9"
              style={{ background: "var(--primary)" }}
            >
              {carregando ? "Gerando…" : "Gerar calendário"}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4 px-5 py-4">
        {clients.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">🗓</span>}
            title="Nenhum cliente cadastrado"
            description="Cadastre um cliente antes de gerar um calendário para ele."
          />
        ) : sucesso ? (
          <div className="space-y-3">
            <div
              className="rounded-[10px] p-3"
              style={{ background: "var(--success-bg)", border: "1px solid var(--success)" }}
            >
              <p role="status" className="text-[13px] font-semibold" style={{ color: "var(--success)" }}>
                {sucesso.texto}
              </p>
            </div>
            {sucesso.barradas.length > 0 && (
              <div
                className="rounded-[10px] p-3"
                style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>
                  {sucesso.barradas.length} {sucesso.barradas.length === 1 ? "post não entrou" : "posts não entraram"} no calendário
                </p>
                <ul className="mt-1.5 space-y-1">
                  {sucesso.barradas.map((b, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--warning)" }}>
                      · {b.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Pendentes: ENTROU no calendário, mas precisa de atenção — ex.:
                reel sem vídeo do cliente. Tom de atenção, não de erro: o
                rascunho existe, só falta algo para ele sair redondo. */}
            {sucesso.pendentes.length > 0 && (
              <div
                className="rounded-[10px] p-3"
                style={{ background: "var(--info-bg)", border: "1px solid var(--info)" }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--info)" }}>
                  {sucesso.pendentes.length} {sucesso.pendentes.length === 1 ? "peça pede atenção" : "peças pedem atenção"}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {sucesso.pendentes.map((p, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--info)" }}>
                      · {p.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <Field label="Cliente" htmlFor="calendario-cliente">
              <select
                id="calendario-cliente"
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setErro(null); setOrientacaoDeMarca(null); setOrientacaoDePacote(null); }}
                disabled={carregando}
                className="h-11 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none disabled:opacity-60 sm:h-9"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              >
                <option value="" disabled>Selecione um cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>

            <Field label="Mês" htmlFor="calendario-mes">
              <select
                id="calendario-mes"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                disabled={carregando}
                className="h-11 w-full rounded-[8px] px-3 text-[13px] text-[var(--text-primary)] outline-none disabled:opacity-60 sm:h-9"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              >
                {meses.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>

            {/* "Posts por semana" saiu daqui (27/09/2026): frequência, formatos,
                dias e horários agora vêm do Pacote da marca de cada cliente —
                dois lugares definindo a mesma coisa é como a deriva começa. */}
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              A frequência, os formatos e os horários vêm do{" "}
              {clientId ? (
                <Link href={`/agency/clients/${clientId}?tab=social`} className="font-semibold underline" style={{ color: "var(--text-secondary)" }}>
                  Pacote da marca
                </Link>
              ) : (
                <b>Pacote da marca</b>
              )}{" "}
              deste cliente, não mais deste formulário.
            </p>

            {carregando && (
              <p role="status" aria-live="polite" className="text-[12px] text-[var(--text-muted)]">
                Gerando o mês {clienteEscolhido ? `de ${clienteEscolhido}` : ""} — a IA pode levar algumas dezenas de segundos.
              </p>
            )}

            {orientacaoDePacote && (
              <div
                role="status"
                className="rounded-[10px] p-3"
                style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>
                  Falta um passo antes de gerar
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--warning)" }}>{orientacaoDePacote}</p>
                {clientId ? (
                  <Link
                    href={`/agency/clients/${clientId}?tab=social`}
                    className="mt-2 inline-flex h-8 items-center rounded-[7px] px-3 text-[12px] font-semibold"
                    style={{ background: "var(--warning)", color: "#fff" }}
                  >
                    Abrir o pacote da marca →
                  </Link>
                ) : (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--warning)" }}>
                    Resolva no pacote da marca do cliente e tente de novo.
                  </p>
                )}
              </div>
            )}

            {orientacaoDeMarca && (
              <div
                role="status"
                className="rounded-[10px] p-3"
                style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}
              >
                <p className="text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>
                  Falta um passo antes de gerar
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--warning)" }}>{orientacaoDeMarca}</p>
                <p className="mt-1 text-[12px]" style={{ color: "var(--warning)" }}>
                  Resolva na ficha de marca do cliente e tente de novo.
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
  label, hint, children, htmlFor,
}: {
  label: string; hint?: string; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</label>
        {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
