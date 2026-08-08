"use client";

// ─── A CAIXA DE ENTRADA DA AGÊNCIA, NA TELA ──────────────────────────────────
//
// A terceira porta do Radar tem uma tela por três motivos, e nenhum é enfeite:
//
//   1. **É onde a senha entra.** Ligar precisa ser colar e clicar, não abrir o
//      Railway.
//   2. **É onde a porta FECHADA diz que está fechada.** Sem credencial a rotina
//      não roda — e uma rotina que não roda sem avisar é uma porta que parece
//      ligada por semanas sem ter lido um e-mail.
//   3. **É onde o CEO lê o que está entregando.** A senha de aplicativo abre a
//      CAIXA INTEIRA. Isso está escrito aqui, acima do campo, em vez de num
//      documento que ninguém abre.
//
// ⚠️ Nenhum caminho desta tela recebe a senha de volta do servidor. O que volta
// é a DICA (`keyHint`, três caracteres e os quatro últimos) — e há teste que
// reprova a rota que devolver mais que isso.

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/agency/ui/Button";

const ROTA = "/api/agency/oportunidades/caixa";

interface Estado {
  configurada: boolean;
  origem: "ambiente" | "cofre" | null;
  usuario: string | null;
  dicaDaSenha: string | null;
  host: string;
  porta: number;
  pasta: string;
  remetentes: string[];
  marcarComoLido: boolean;
  janelaDias: number;
  ultimoTeste: { status: string; em: string | null; mensagem: string | null };
  motivo: string | null;
  avisoDeAlcance: string;
  revogacao: { noGoogle: string; oQueCortaDeVerdade: string; atencao?: string };
  historico: LinhaDoHistorico[] | null;
  historicoMedido: boolean;
  resumo: Record<string, number> | null;
  resumoMedido: boolean;
}

interface LinhaDoHistorico {
  id: string;
  remetente: string;
  assunto: string | null;
  processadoEm: string;
  resultado: string;
  motivo: string | null;
  oportunidadeId: string | null;
}

interface Teste {
  conectou: boolean;
  mensagem: string;
  caixa?: string;
  origem?: string;
  alertasNaCaixa?: number | null;
  contagemMedida?: boolean | null;
  contagemMotivo?: string | null;
}

const ROTULO_DO_RESULTADO: Record<string, string> = {
  oportunidade: "virou oportunidade",
  duplicada: "já estava na fila",
  ignorada: "ignorada",
  falha: "falhou",
};

export default function CaixaDeEntradaDaAgencia({ aoIngerir }: { aoIngerir?: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [falhouAoLer, setFalhouAoLer] = useState(false);
  const [aberto, setAberto] = useState(false);

  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [remetentes, setRemetentes] = useState("");
  const [marcar, setMarcar] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<Teste | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(ROTA, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Estado;
      setEstado(j);
      setFalhouAoLer(false);
      setUsuario((u) => u || j.usuario || "");
      setRemetentes((r) => r || j.remetentes.join(", "));
      setMarcar(j.marcarComoLido);
    } catch {
      // Falha de LEITURA não vira "não está configurada": isso transformaria um
      // problema nosso num fato sobre a configuração dele.
      setEstado(null);
      setFalhouAoLer(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setTeste(null);
    try {
      const res = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha, remetentes, marcarComoLido: marcar }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      // A senha sai da memória da tela no instante em que foi guardada.
      setSenha("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui guardar.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setErro(null);
    try {
      const res = await fetch(`${ROTA}/testar?contar=1`, { method: "POST" });
      const j = (await res.json()) as Teste & { error?: string };
      if (j.error) throw new Error(j.error);
      setTeste(j);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui testar.");
    } finally {
      setTestando(false);
    }
  }

  async function apagar() {
    setErro(null);
    try {
      const res = await fetch(ROTA, { method: "DELETE" });
      const j = (await res.json()) as { aviso?: string; error?: string };
      if (j.error) throw new Error(j.error);
      setTeste(null);
      setErro(j.aviso ?? null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui apagar.");
    }
  }

  if (falhouAoLer) {
    return (
      <section role="alert" className="mb-4 rounded-[12px] border border-[#FCA5A5] bg-[var(--danger-bg)] px-4 py-3">
        <p className="text-[13px] text-[var(--danger)]">
          Não consegui ler o estado da caixa de entrada. <strong>Isto não quer dizer que ela está desligada</strong> —
          quer dizer que não sei.
        </p>
      </section>
    );
  }

  if (!estado) return null;

  const ligada = estado.configurada;

  return (
    <section className="mb-4 rounded-[12px] border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <button
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Caixa de entrada da agência
        </span>
        {ligada ? (
          <span className="text-[13px] font-semibold text-[var(--success)]">
            lendo {estado.usuario} a cada 5 min
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-[var(--warning)]">porta fechada — falta configurar</span>
        )}
        {ligada && estado.origem === "ambiente" && (
          <span className="text-[12px] text-[var(--text-muted)]">senha vinda do Railway</span>
        )}
        <span className="ml-auto text-[12px] text-[var(--text-muted)]">{aberto ? "fechar" : "abrir"}</span>
      </button>

      {/* O motivo da porta fechada aparece SEMPRE, aberto ou não. Porta fechada
          silenciosa é o defeito que esta frente existe para não repetir. */}
      {!ligada && estado.motivo && (
        <p className="px-4 pb-3 -mt-1 text-[12px] text-[var(--text-secondary)] leading-relaxed max-w-[80ch]">
          {estado.motivo}
        </p>
      )}

      {aberto && (
        <div className="border-t border-[var(--border)] px-4 py-4 grid gap-4">
          {/* ── O QUE ELE ESTÁ ENTREGANDO ─────────────────────────────────── */}
          <div className="rounded-[8px] border border-[#FDE68A] bg-[var(--warning-bg)] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--warning)]">O que esta senha alcança</p>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-[80ch]">
              {estado.avisoDeAlcance}
            </p>
          </div>

          {/* ── O QUE A ROTINA FAZ COM A CAIXA ────────────────────────────── */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">O que a rotina faz com a caixa</p>
            <ul className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed grid gap-0.5">
              <li>Lê a {estado.pasta} de {estado.host}:{estado.porta} pelos últimos {estado.janelaDias} dias.</li>
              <li>Só as mensagens destes remetentes: <strong>{estado.remetentes.join(", ")}</strong>.</li>
              <li>
                <strong>Não apaga, não move, não arquiva, não responde e não envia nada.</strong> O alerta original é a
                prova de que a oportunidade existiu.
              </li>
              <li>
                {estado.marcarComoLido
                  ? "Marca a mensagem como lida depois de processá-la."
                  : "Não marca nada como lido — a caixa fica exatamente como estava."}
              </li>
            </ul>
          </div>

          {/* ── O FORMULÁRIO ──────────────────────────────────────────────── */}
          <div className="grid gap-3">
            <div>
              <label htmlFor="caixa-usuario" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Endereço da caixa
              </label>
              <input
                id="caixa-usuario"
                type="email"
                autoComplete="off"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="agenciadioli@gmail.com"
                className="w-full h-9 px-3 text-[16px] md:text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="caixa-senha" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Senha de aplicativo do Google
                {estado.dicaDaSenha && (
                  <span className="ml-2 text-[var(--text-muted)] font-normal">
                    guardada: {estado.dicaDaSenha} — colar de novo substitui
                  </span>
                )}
              </label>
              <input
                id="caixa-senha"
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="abcd efgh ijkl mnop"
                className="w-full h-9 px-3 text-[16px] md:text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
              <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed max-w-[80ch]">
                São 16 letras, em 4 grupos de 4 — os espaços podem vir junto, a casa os tira. Não é a senha da sua
                conta: essa é recusada aqui de propósito. Gere em{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-[var(--navy)]"
                >
                  myaccount.google.com/apppasswords
                </a>{" "}
                (exige verificação em duas etapas ativa).
              </p>
            </div>

            <div>
              <label htmlFor="caixa-remetentes" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                Remetentes que entram
              </label>
              <input
                id="caixa-remetentes"
                value={remetentes}
                onChange={(e) => setRemetentes(e.target.value)}
                placeholder="@99freelas.com.br"
                className="w-full h-9 px-3 text-[16px] md:text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
              <p className="text-[12px] text-[var(--warning)] mt-1 leading-relaxed max-w-[80ch]">
                ⚠️ O endereço exato de onde o 99Freelas manda os alertas <strong>não foi confirmado</strong> por
                ninguém aqui. O padrão é o domínio inteiro, que é o que dá para afirmar. Abra um alerta de verdade,
                veja o remetente e, se quiser apertar o filtro, troque aqui.
              </p>
            </div>

            <label className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
              <input type="checkbox" checked={marcar} onChange={(e) => setMarcar(e.target.checked)} className="mt-1" />
              <span>
                Marcar como lida depois de processar.{" "}
                <span className="text-[var(--text-muted)]">
                  Deixe desligado se você mesmo lê essa caixa — marcada como lida, a mensagem some do seu não-lidos.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void salvar()} disabled={salvando || !usuario || !senha}>
                {salvando ? "Guardando…" : "Guardar senha"}
              </Button>
              <Button variant="secondary" onClick={() => void testar()} disabled={testando || !ligada}>
                {testando ? "Testando…" : "Testar conexão"}
              </Button>
              {ligada && (
                <button
                  onClick={() => void apagar()}
                  className="h-9 px-3 rounded-[7px] border border-[#FCA5A5] text-[13px] font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                >
                  Apagar credencial
                </button>
              )}
            </div>

            <p className="text-[12px] text-[var(--text-subtle)] leading-relaxed max-w-[80ch]">
              <strong>Para revogar de verdade:</strong> {estado.revogacao.oQueCortaDeVerdade}{" "}
              {estado.revogacao.atencao && (
                <span className="text-[var(--warning)]">{estado.revogacao.atencao}</span>
              )}
            </p>
          </div>

          {erro && (
            <div role="alert" className="rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-3 py-2.5">
              <p className="text-[13px] text-[var(--danger)]">{erro}</p>
            </div>
          )}

          {teste && (
            <div
              role="status"
              className={`rounded-[8px] border px-3 py-2.5 ${
                teste.conectou ? "border-[#BBF7D0] bg-[var(--success-bg)]" : "border-[#FCA5A5] bg-[var(--danger-bg)]"
              }`}
            >
              <p className={`text-[13px] ${teste.conectou ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {teste.conectou ? "Conectou." : "Não conectou."} {teste.mensagem}
              </p>
              {teste.conectou && (
                <p className="text-[13px] text-[var(--text-primary)] mt-1.5">
                  {teste.contagemMedida && typeof teste.alertasNaCaixa === "number" ? (
                    <>
                      <strong className="mono-num">{teste.alertasNaCaixa}</strong> alerta(s) desses remetentes já
                      existem nesta caixa — a caixa inteira, sem janela de data.
                    </>
                  ) : (
                    // "Não consegui contar" NUNCA vira zero: o segundo mataria
                    // o canal por engano.
                    <span className="text-[var(--warning)]">
                      Conectou, mas não consegui contar quantos alertas há na caixa. Isso <strong>não</strong> quer
                      dizer que não há nenhum. {teste.contagemMotivo}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* ── O QUE A ROTINA JÁ LEU ─────────────────────────────────────── */}
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2">
              O que a rotina já leu
            </p>
            {!estado.historicoMedido ? (
              <p className="text-[13px] text-[var(--danger)]">
                Não consegui ler o histórico. Isto não quer dizer que nada foi lido — quer dizer que não sei.
              </p>
            ) : !estado.historico || estado.historico.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Nenhuma mensagem processada ainda.{" "}
                {ligada
                  ? "A próxima batida do relógio é em até 5 minutos."
                  : "A rotina não roda enquanto a porta estiver fechada."}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {estado.historico.map((l) => (
                  <li key={l.id} className="text-[12px] leading-relaxed border-b border-[var(--border)] pb-1.5">
                    <span className="text-[var(--text-primary)] font-medium">{l.assunto ?? "(sem assunto)"}</span>{" "}
                    <span className="text-[var(--text-muted)]">· {l.remetente}</span>{" "}
                    <span
                      className={
                        l.resultado === "oportunidade"
                          ? "text-[var(--success)]"
                          : l.resultado === "falha"
                            ? "text-[var(--danger)]"
                            : "text-[var(--text-muted)]"
                      }
                    >
                      · {ROTULO_DO_RESULTADO[l.resultado] ?? l.resultado}
                    </span>
                    {l.motivo && <span className="block text-[var(--text-subtle)]">{l.motivo}</span>}
                  </li>
                ))}
              </ul>
            )}
            {estado.resumoMedido && estado.resumo && Object.keys(estado.resumo).length > 0 && (
              <p className="text-[12px] text-[var(--text-muted)] mt-2">
                Desde o começo:{" "}
                {Object.entries(estado.resumo)
                  .map(([k, v]) => `${v} ${ROTULO_DO_RESULTADO[k] ?? k}`)
                  .join(" · ")}
              </p>
            )}
          </div>

          {aoIngerir && (
            <div>
              <Button variant="secondary" onClick={aoIngerir}>
                Recarregar a fila
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
