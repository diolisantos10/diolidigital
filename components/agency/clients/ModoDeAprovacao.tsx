"use client";

// ModoDeAprovacao — QUEM aprova o conteúdo desta marca, e como.
//
// Decisão do CEO (27/09/2026): toda marca nasce em APROVACAO_CEO (o CEO
// aprova cada semana, na tela interna do Planner) e pode migrar para
// PILOTO_AUTOMATICO, SEMANAL ou MENSAL. A troca só vale do PRÓXIMO CICLO, e só
// depois da primeira semana ter sido aprovada pelo CEO — por isso o formulário
// aqui pode receber um 409 ("só depois da primeira semana aprovada") mesmo
// quando o pedido está bem formado: não é erro do operador, é a regra do
// contrato, e o texto do servidor é mostrado tal como ele escreveu.
//
// Fonte: GET/PUT /api/agency/clients/{id}/modo-aprovacao. Só master escreve.

import { useCallback, useEffect, useState } from "react";

type Modo = "APROVACAO_CEO" | "PILOTO_AUTOMATICO" | "SEMANAL" | "MENSAL";

const MODOS: { id: Modo; label: string; descricao: string }[] = [
  { id: "APROVACAO_CEO", label: "Aprovação do CEO", descricao: "O CEO aprova cada semana na tela interna." },
  { id: "PILOTO_AUTOMATICO", label: "Piloto automático", descricao: "A casa gera e publica; o cliente não aprova." },
  { id: "SEMANAL", label: "Semanal", descricao: "Toda quinta sai a semana seguinte; o cliente aprova até sexta 18h; sem resposta, publica." },
  { id: "MENSAL", label: "Mensal", descricao: "O mês inteiro sai no dia 25, com arte; aprovado, trava; mudança vira refação." },
];

function rotuloDoModo(m: string | null | undefined): string {
  return MODOS.find((x) => x.id === m)?.label ?? m ?? "—";
}
function descricaoDoModo(m: string | null | undefined): string {
  return MODOS.find((x) => x.id === m)?.descricao ?? "";
}
function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface Leitura {
  modoAprovacao: Modo;
  modoPendente: Modo | null;
  modoPendenteVigenteEm: string | null;
  primeiraSemanaAprovadaEm: string | null;
  modoEmVigor: Modo;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; dados: Leitura };

export default function ModoDeAprovacao({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [escolha, setEscolha] = useState<Modo>("APROVACAO_CEO");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/modo-aprovacao`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar o modo de aprovação agora." }); return; }
      const dados: Leitura = {
        modoAprovacao: j.modoAprovacao ?? "APROVACAO_CEO",
        modoPendente: j.modoPendente ?? null,
        modoPendenteVigenteEm: j.modoPendenteVigenteEm ?? null,
        primeiraSemanaAprovadaEm: j.primeiraSemanaAprovadaEm ?? null,
        modoEmVigor: j.modoEmVigor ?? j.modoAprovacao ?? "APROVACAO_CEO",
      };
      setEstado({ fase: "ok", dados });
      setEscolha(dados.modoPendente ?? dados.modoAprovacao);
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
      const r = await fetch(`/api/agency/clients/${clientId}/modo-aprovacao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novoModo: escolha }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        // O 409 é PREVISTO pelo contrato ("só depois da primeira semana
        // aprovada") — não é um erro genérico, é a regra falando. O texto do
        // servidor aparece tal como ele escreveu, legível, sem jargão de HTTP.
        setErroSalvar(typeof j.error === "string" ? j.error : "Não consegui trocar o modo agora.");
        return;
      }
      const vigenteEm = dataCurta(j.vigenteEm);
      setSalvo(vigenteEm ? `Troca agendada — vale a partir de ${vigenteEm}.` : "Troca registrada.");
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
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Modo de aprovação</h2>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Quem aprova o conteúdo desta marca, e como.</p>
      </div>

      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-2">
          <div className="h-12 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <div className="h-9 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando o modo de aprovação…</span>
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
            <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Em vigor agora</div>
            <div className="text-[15px] font-semibold text-[var(--text-primary)] mt-0.5">{rotuloDoModo(estado.dados.modoEmVigor)}</div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">{descricaoDoModo(estado.dados.modoEmVigor)}</p>
            {estado.dados.modoPendente && estado.dados.modoPendente !== estado.dados.modoEmVigor && (
              <p className="text-[12px] text-[var(--info)] mt-2 font-medium">
                Muda para {rotuloDoModo(estado.dados.modoPendente)}
                {dataCurta(estado.dados.modoPendenteVigenteEm) ? ` a partir de ${dataCurta(estado.dados.modoPendenteVigenteEm)}` : " no próximo ciclo"}.
              </p>
            )}
            {!estado.dados.primeiraSemanaAprovadaEm && (
              <p className="text-[12px] text-[var(--text-subtle)] mt-2">
                Ainda sem primeira semana aprovada pelo CEO — troca de modo só vale depois dela.
              </p>
            )}
          </div>

          {podeEditar ? (
            <div>
              <label htmlFor="modo-aprovacao-select" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Trocar modo (vale do próximo ciclo)
              </label>
              <select
                id="modo-aprovacao-select"
                value={escolha}
                onChange={(e) => { setEscolha(e.target.value as Modo); setErroSalvar(null); }}
                disabled={salvando}
                className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white disabled:opacity-60"
              >
                {MODOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <p className="text-[12px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                {descricaoDoModo(escolha)}
              </p>

              {erroSalvar && (
                <p role="alert" className="text-[12.5px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2 mt-2">{erroSalvar}</p>
              )}
              {salvo && (
                <p role="status" className="text-[12.5px] text-[var(--success)] bg-[var(--success-bg)] rounded-[8px] px-3 py-2 mt-2">{salvo}</p>
              )}

              <button
                onClick={() => void salvar()}
                disabled={salvando || escolha === (estado.dados.modoPendente ?? estado.dados.modoAprovacao)}
                className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-semibold transition-colors bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
              >
                {salvando ? "Salvando…" : "Salvar troca de modo"}
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-subtle)] italic">Só quem é master troca o modo de aprovação.</p>
          )}
        </div>
      )}
    </div>
  );
}
