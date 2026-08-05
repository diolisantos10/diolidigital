"use client";

// ─── Cartão de uma oportunidade ──────────────────────────────────────────────
//
// O produto desta tela NÃO é o cadastro: é o botão de copiar. O envio acontece
// pela mão do operador, dentro da plataforma (99Freelas, Workana…), porque
// automatizar envio nessas plataformas é conta banida. Então o cartão tem uma
// obrigação acima de qualquer outra: colocar a PROPOSTA PRONTA a um clique de
// distância, com retorno visível de que foi copiada.
//
// Fechado, o cartão responde "vale a pena?" (nota + serviço + valor + o porquê).
// Aberto, responde "o que eu mando?" (texto original de um lado, proposta do
// outro). São duas perguntas diferentes e por isso são dois níveis.
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState } from "react";
import {
  faixaDaNota,
  rotuloDaPlataforma,
  type Oportunidade,
  type StatusDaOportunidade,
} from "./contratoDeOportunidade";

const ROTULO_DO_STATUS: Record<StatusDaOportunidade, string> = {
  nova: "Para decidir",
  aprovada: "Aprovada",
  recusada: "Recusada",
  enviada: "Enviada",
};

const ESTILO_DO_STATUS: Record<StatusDaOportunidade, string> = {
  nova: "bg-[var(--accent)] text-[var(--text-secondary)]",
  aprovada: "bg-[var(--success-bg)] text-[var(--success)]",
  recusada: "bg-[var(--accent)] text-[var(--text-muted)]",
  enviada: "bg-[var(--info-bg)] text-[var(--info)]",
};

interface Props {
  oportunidade: Oportunidade;
  aberta: boolean;
  onAlternar: () => void;
  onDecidir: (status: StatusDaOportunidade) => void;
  /** Trava os botões enquanto o PATCH está no ar. */
  decidindo: boolean;
}

export default function CartaoDeOportunidade({
  oportunidade: o,
  aberta,
  onAlternar,
  onDecidir,
  decidindo,
}: Props) {
  const painelId = useId();
  // `copiado` guarda QUAL botão copiou, para o "Copiado ✓" aparecer no botão
  // que a pessoa apertou — feedback no lugar errado é feedback que não fecha o
  // ciclo.
  const [copiado, setCopiado] = useState<"painel" | "aprovar" | null>(null);
  const [falhouAoCopiar, setFalhouAoCopiar] = useState(false);
  const faixa = faixaDaNota(o.nota);
  const temProposta = Boolean(o.proposta);

  async function copiarProposta(origem: "painel" | "aprovar"): Promise<boolean> {
    if (!o.proposta) return false;
    try {
      await navigator.clipboard.writeText(o.proposta);
      setFalhouAoCopiar(false);
      setCopiado(origem);
      setTimeout(() => setCopiado((c) => (c === origem ? null : c)), 2200);
      return true;
    } catch {
      // Clipboard bloqueado (contexto inseguro, permissão negada). Silenciar
      // aqui seria pior: a pessoa colaria o conteúdo anterior da área de
      // transferência na proposta do cliente.
      setFalhouAoCopiar(true);
      return false;
    }
  }

  return (
    <li className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* ── Cabeçalho clicável: a linha inteira abre, não um ícone de 16px ──── */}
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        aria-controls={painelId}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-[var(--bg)] transition-colors"
      >
        {/* Trilho da nota — o critério de ordenação da fila fica visível */}
        <span
          className={`shrink-0 w-[46px] sm:w-[54px] rounded-[10px] border py-2 flex flex-col items-center justify-center ${faixa.classe}`}
        >
          <span className="sr-only">
            Nota {o.nota === null ? "não calculada" : `${o.nota} de 100`} — {faixa.rotulo}
          </span>
          <span aria-hidden className="mono-num text-[18px] sm:text-[20px] font-semibold leading-none">
            {o.nota === null ? "—" : o.nota}
          </span>
          <span aria-hidden className="text-[12px] font-medium leading-none mt-1">
            {faixa.rotulo}
          </span>
        </span>

        <span className="min-w-0 flex-1 block">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex h-5 px-2 items-center rounded-full bg-[var(--accent)] text-[12px] font-semibold text-[var(--text-secondary)]">
              {rotuloDaPlataforma(o.plataforma)}
            </span>
            {o.status !== "nova" && (
              <span
                className={`inline-flex h-5 px-2 items-center rounded-full text-[12px] font-semibold ${ESTILO_DO_STATUS[o.status]}`}
              >
                {ROTULO_DO_STATUS[o.status]}
              </span>
            )}
            {o.criadaEm && (
              <span className="text-[12px] text-[var(--text-muted)]">
                {new Date(o.criadaEm).toLocaleDateString("pt-BR")}
              </span>
            )}
          </span>

          <span className="block text-[15px] font-semibold text-[var(--text-primary)] mt-1.5 leading-snug">
            {o.titulo}
          </span>

          {/* O raciocínio é o resumo do PORQUÊ da nota, não o relatório — por
              isso é cortado. Uma linha só a partir de `lg`, onde a linha é
              larga o bastante para caber uma frase; no celular, uma linha
              seriam ~30 caracteres, ou seja, meia frase e nenhum sentido. */}
          <span className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2 lg:line-clamp-1">
            {o.raciocinio ?? "Sem raciocínio registrado para esta nota."}
          </span>

          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2">
            <span className="text-[12px] text-[var(--text-muted)]">
              Serviço:{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {o.servicoSugerido ?? "a definir"}
              </span>
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              Valor sugerido:{" "}
              <span className="mono-num text-[var(--text-primary)] font-medium">
                {o.valorSugerido ?? "a definir"}
              </span>
            </span>
            {/* O orçamento do anúncio só aparece quando o anunciante declarou —
                e com nome próprio, para nunca ser lido como a nossa sugestão. */}
            {o.orcamentoInformado && (
              <span className="text-[12px] text-[var(--text-muted)]">
                Orçamento do anúncio:{" "}
                <span className="mono-num text-[var(--text-secondary)] font-medium">{o.orcamentoInformado}</span>
              </span>
            )}
          </span>
        </span>

        <span aria-hidden className="shrink-0 pl-1 pt-1 text-[var(--text-muted)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={`transition-transform duration-[140ms] ${aberta ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {aberta && (
        <div id={painelId} className="border-t border-[var(--border)]">
          {/* Duas colunas só a partir de `lg`: com a sidebar de 224px, um tablet
              de 768px tem 544px de conteúdo — menos que o celular tinha de sobra
              (mesma aritmética da §6.3 do DESIGN.md). */}
          <div className="grid gap-4 lg:grid-cols-2 p-4">
            <section className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-2 min-h-[32px]">
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  O projeto, como chegou
                </h4>
                {o.url && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-medium text-[var(--text-secondary)] underline shrink-0"
                  >
                    abrir na plataforma
                  </a>
                )}
              </div>
              {(o.categoria || o.prazoInformado) && (
                <p className="text-[12px] text-[var(--text-muted)] mb-2">
                  {[o.categoria, o.prazoInformado && `prazo: ${o.prazoInformado}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {/* A caixa rola. Sem a borda esfumaçada embaixo, texto cortado no
                  meio de uma frase parece defeito, não continuação — e no
                  celular ninguém descobre que dá para rolar ali dentro. */}
              <div className="relative">
                <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5 font-sans text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {/* O texto CRU do anúncio não sai da API de propósito: costuma
                      trazer contato de terceiro (PII que não pedimos). Aqui vem a
                      descrição extraída — e, quando nem ela veio, o cartão diz
                      isso em vez de mostrar uma caixa vazia. */}
                  {o.textoOriginal || "O anúncio não trouxe descrição. Abra o link na plataforma para ler o original."}
                </pre>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-px bottom-px h-6 rounded-b-[8px] bg-gradient-to-t from-[var(--bg)] to-transparent"
                />
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2 min-h-[32px]">
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Proposta pronta
                </h4>
                <button
                  type="button"
                  onClick={() => void copiarProposta("painel")}
                  disabled={!temProposta}
                  className="shrink-0 h-8 px-3 rounded-[7px] border border-[var(--border-strong)] bg-white text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {copiado === "painel" ? "Copiado ✓" : "Copiar"}
                </button>
              </div>
              <div className="relative">
                <pre
                  className={`max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words rounded-[8px] px-3 py-2.5 font-sans text-[13px] leading-relaxed border ${
                    temProposta
                      ? "bg-[var(--accent-light)] border-[#BFEFEC] text-[var(--text-primary)]"
                      : "bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  {o.proposta ??
                    "A proposta ainda não foi gerada. Analise a oportunidade de novo para produzi-la."}
                </pre>
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-px bottom-px h-6 rounded-b-[8px] bg-gradient-to-t to-transparent ${
                    temProposta ? "from-[var(--accent-light)]" : "from-[var(--bg)]"
                  }`}
                />
              </div>
            </section>
          </div>

          {falhouAoCopiar && (
            <p role="alert" className="px-4 pb-2 text-[12px] text-[var(--danger)]">
              O navegador bloqueou a cópia automática. Selecione o texto da proposta e copie com Ctrl+C.
            </p>
          )}

          {/* ── As três decisões ──────────────────────────────────────────────
              "Aprovar e copiar" é uma ação só porque, na vida real, aprovar e
              colar na plataforma são o mesmo gesto. Separar em dois cliques é
              onde a proposta aprovada fica sem ser enviada. */}
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">
            {/* Sem proposta gerada ainda, o botão NÃO trava: ele vira "Aprovar".
                Travar a aprovação por falta de um texto que o motor ainda não
                escreve deixaria a fila inteira sem decisão possível. */}
            <button
              type="button"
              onClick={async () => {
                if (temProposta) await copiarProposta("aprovar");
                onDecidir("aprovada");
              }}
              disabled={decidindo || o.status === "aprovada"}
              className="h-9 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-semibold hover:bg-[#0E1333] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {copiado === "aprovar" ? "Copiado ✓" : temProposta ? "Aprovar e copiar" : "Aprovar"}
            </button>
            <button
              type="button"
              onClick={() => onDecidir("enviada")}
              disabled={decidindo || o.status === "enviada"}
              className="h-9 px-4 rounded-[7px] border border-[var(--border-strong)] bg-white text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Marcar como enviada
            </button>
            <button
              type="button"
              onClick={() => onDecidir("recusada")}
              disabled={decidindo || o.status === "recusada"}
              className="h-9 px-4 rounded-[7px] border border-[var(--border)] text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Recusar
            </button>
            {decidindo && (
              <span role="status" className="text-[12px] text-[var(--text-muted)]">
                salvando…
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
