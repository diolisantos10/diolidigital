"use client";

// RefacoesDoMes — QUANTAS refações esta marca já usou no mês, e quantas
// restam. Vive ao lado de `ModoDeAprovacao` (mesma aba, Social Media): é a
// mesma decisão de negócio vista de outro ângulo — depois de quinta 10h a
// semana seguinte trava (ver o texto do modo MENSAL/SEMANAL), e mudança
// depois da trava vira refação, que tem teto por mês.
//
// Fonte: GET/PUT /api/agency/clients/{id}/refacoes. Só master escreve o
// limite; os demais papéis veem o mesmo bloco em modo leitura (DESIGN.md §7:
// nunca esconder o controle, desabilitar com o motivo).

import { useCallback, useEffect, useState } from "react";

interface UltimaRefacao {
  socialPostId: string;
  motivo: string;
  origem: string;
  contaNoLimite: boolean;
  criadoEm: string;
}

interface Leitura {
  limiteRefacoesMes: number | null;
  padrao: number;
  mes: string;
  usadasNoMes: number;
  restantes: number;
  ultimas: UltimaRefacao[];
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; dados: Leitura };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-10" → "outubro de 2026". Formato inesperado: devolve o que veio, sem
 *  quebrar a tela por causa de uma string de data. */
function mesPorExtenso(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  const ano = m[1]!;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MESES[idx]} de ${ano}` : mes;
}

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const ORIGEM_LABEL: Record<string, string> = {
  cliente_portal: "Pedido do cliente",
  equipe: "Equipe",
};

export default function RefacoesDoMes({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [personalizar, setPersonalizar] = useState(false);
  const [valor, setValor] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/refacoes`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar as refações do mês agora." }); return; }
      const dados: Leitura = {
        limiteRefacoesMes: typeof j.limiteRefacoesMes === "number" ? j.limiteRefacoesMes : null,
        padrao: typeof j.padrao === "number" ? j.padrao : 4,
        mes: typeof j.mes === "string" ? j.mes : "",
        usadasNoMes: typeof j.usadasNoMes === "number" ? j.usadasNoMes : 0,
        restantes: typeof j.restantes === "number" ? j.restantes : 0,
        ultimas: Array.isArray(j.ultimas) ? j.ultimas : [],
      };
      setEstado({ fase: "ok", dados });
      setPersonalizar(dados.limiteRefacoesMes !== null);
      setValor(dados.limiteRefacoesMes ?? dados.padrao);
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  async function salvar() {
    setSalvando(true);
    setErroSalvar(null);
    setSalvo(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/refacoes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limiteRefacoesMes: personalizar ? valor : null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErroSalvar(typeof j.error === "string" ? j.error : "Não consegui salvar o limite agora.");
        return;
      }
      setSalvo("Limite atualizado.");
      await buscar();
      setTimeout(() => setSalvo(null), 5000);
    } catch {
      setErroSalvar("Falha de rede ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Refações do mês</h2>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed max-w-[62ch]">
          Depois de quinta 10h a semana seguinte fica travada: mudança vira refação e conta aqui.
          Estourou o limite, a equipe fala com o cliente — nada é cobrado sozinho.
        </p>
      </div>

      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-2">
          <div className="h-12 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <div className="h-9 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando as refações do mês…</span>
        </div>
      )}

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

      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Refações</div>
            <div className="text-[18px] font-bold leading-snug text-[var(--text-primary)] mt-1.5">
              usadas <span className="mono-num">{estado.dados.usadasNoMes}</span> de{" "}
              <span className="mono-num">{estado.dados.limiteRefacoesMes ?? estado.dados.padrao}</span>{" "}
              {estado.dados.mes ? `em ${mesPorExtenso(estado.dados.mes)}` : "este mês"}
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">
              {estado.dados.restantes > 0
                ? `${estado.dados.restantes} restante${estado.dados.restantes === 1 ? "" : "s"} neste mês.`
                : "Limite do mês estourado — a equipe fala com o cliente antes de qualquer refação nova."}
            </p>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Últimas refações</h3>
            {estado.dados.ultimas.length === 0 ? (
              <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma refação registrada ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {estado.dados.ultimas.map((u, i) => (
                  <li key={`${u.socialPostId}-${i}`} className="rounded-[8px] border border-[var(--border)] px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                        {ORIGEM_LABEL[u.origem] ?? u.origem}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {u.contaNoLimite ? (
                          <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Conta no limite</span>
                        ) : (
                          <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]">Não contou</span>
                        )}
                        <span className="mono-num text-[12px] text-[var(--text-muted)]">{dataCurta(u.criadoEm)}</span>
                      </span>
                    </div>
                    {u.motivo && (
                      <p className="text-[12.5px] text-[var(--text-primary)] mt-1 leading-relaxed line-clamp-2">{u.motivo}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {podeEditar ? (
            <div className="pt-1 border-t border-[var(--border)]">
              <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={personalizar}
                  onChange={(e) => {
                    setPersonalizar(e.target.checked);
                    if (!e.target.checked) setValor(estado.dados.padrao);
                    setErroSalvar(null);
                  }}
                  className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                />
                <span>Personalizar o limite deste cliente</span>
              </label>

              {personalizar ? (
                <div className="mt-2">
                  <label htmlFor="refacoes-limite" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                    Limite de refações por mês
                  </label>
                  <input
                    id="refacoes-limite"
                    type="number"
                    min={0}
                    max={50}
                    value={valor}
                    onChange={(e) => setValor(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                    disabled={salvando}
                    className="w-full sm:w-32 h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white disabled:opacity-60"
                  />
                </div>
              ) : (
                <p className="text-[12px] text-[var(--text-muted)] mt-1">
                  padrão da casa: {estado.dados.padrao}
                </p>
              )}

              {erroSalvar && (
                <p role="alert" className="text-[12.5px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2 mt-2">{erroSalvar}</p>
              )}
              {salvo && (
                <p role="status" className="text-[12.5px] text-[var(--success)] bg-[var(--success-bg)] rounded-[8px] px-3 py-2 mt-2">{salvo}</p>
              )}

              <button
                onClick={() => void salvar()}
                disabled={salvando}
                className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-semibold transition-colors bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
              >
                {salvando ? "Salvando…" : "Salvar limite"}
              </button>
            </div>
          ) : (
            estado.dados.limiteRefacoesMes === null && (
              <p className="text-[12px] text-[var(--text-subtle)] italic pt-1 border-t border-[var(--border)]">
                padrão da casa: {estado.dados.padrao} — só quem é master personaliza.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
