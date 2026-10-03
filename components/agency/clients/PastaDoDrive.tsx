"use client";

// PastaDoDrive — o link da pasta do Google Drive do cliente, a autorização
// escrita para a Dioli ler o material, e a conferência das cinco subpastas
// que a estrutura exige. Sem material de referência (a subpasta que faltar),
// a peça é produzida sem prova nenhuma do que o cliente já tem pronto.
//
// Fonte: GET/PUT /api/agency/clients/{id}/drive (PUT é master), POST
// .../drive/conferir, POST .../drive/importar.

import { useCallback, useEffect, useState } from "react";
import { OrientacaoDasPastas } from "@/components/marca/OrientacaoDasPastas";

interface ContaDeServico { configurada: boolean; email?: string }

interface DriveConfig {
  pastaDriveUrl: string | null;
  autorizacaoDriveTexto: string | null;
  autorizacaoDriveEm: string | null;
  driveSincronizadoEm: string | null;
  contaDeServico: ContaDeServico;
}

interface Subpasta { nome: string; encontrada: boolean; arquivos: number }

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; dados: DriveConfig };

type EstadoConferir =
  | { fase: "inicial" }
  | { fase: "conferindo" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; subpastas: Subpasta[]; emailDaConta?: string };

function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const AVISO_CONTA_NAO_CONFIGURADA = "A conta de serviço do Drive ainda não foi configurada pela Dioli";

/** Texto fixo da plataforma (não é redação livre da tela) — com o e-mail da
 *  conta de serviço interpolado. Sem conta configurada, cai no aviso curto
 *  acima: não há e-mail nenhum para pedir ao cliente que compartilhe com ele. */
function avisoOnboarding(conta: ContaDeServico | null): string {
  if (!conta || !conta.configurada) return AVISO_CONTA_NAO_CONFIGURADA;
  const email = conta.email ?? "—";
  return `Compartilhe a pasta RAIZ da marca (não cada subpasta separadamente) com o e-mail da conta de serviço: ${email}. Dê permissão de Leitor. Compartilhando a RAIZ, as subpastas de dentro (Brand book, Logos, Fotos de produto, Fotos de ambiente, Referências, Entrada de material, Prontos para postar) ficam acessíveis junto — não restrinja o compartilhamento pasta por pasta, ou a equipe vai enxergar só parte do material.`;
}

export default function PastaDoDrive({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [editando, setEditando] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [autorizacaoDraft, setAutorizacaoDraft] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const [conferir, setConferir] = useState<EstadoConferir>({ fase: "inicial" });
  const [importando, setImportando] = useState<Set<string>>(new Set());
  const [resultadoImportar, setResultadoImportar] = useState<Record<string, { ok: boolean; mensagem: string }>>({});

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/drive`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar a pasta do Drive agora." }); return; }
      const dados: DriveConfig = {
        pastaDriveUrl: j.pastaDriveUrl ?? null,
        autorizacaoDriveTexto: j.autorizacaoDriveTexto ?? null,
        autorizacaoDriveEm: j.autorizacaoDriveEm ?? null,
        driveSincronizadoEm: j.driveSincronizadoEm ?? null,
        contaDeServico: j.contaDeServico ?? { configurada: false },
      };
      setEstado({ fase: "ok", dados });
      setUrlDraft(dados.pastaDriveUrl ?? "");
      setAutorizacaoDraft(dados.autorizacaoDriveTexto ?? "");
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  function abrirEdicao() {
    if (estado.fase === "ok") {
      setUrlDraft(estado.dados.pastaDriveUrl ?? "");
      setAutorizacaoDraft(estado.dados.autorizacaoDriveTexto ?? "");
    }
    setErroSalvar(null);
    setEditando(true);
  }

  async function salvar() {
    if (!urlDraft.trim()) { setErroSalvar("Informe o link da pasta."); return; }
    if (!autorizacaoDraft.trim()) { setErroSalvar("A autorização escrita do cliente é obrigatória."); return; }
    setSalvando(true);
    setErroSalvar(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/drive`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastaDriveUrl: urlDraft.trim(), autorizacaoDriveTexto: autorizacaoDraft.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) { setErroSalvar(j.error || j.motivo || "Não consegui salvar agora."); return; }
      setSalvo(true);
      setEditando(false);
      await buscar();
      setTimeout(() => setSalvo(false), 5000);
    } catch {
      setErroSalvar("Falha de rede ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function conferirPasta() {
    setConferir({ fase: "conferindo" });
    setResultadoImportar({});
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/drive/conferir`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setConferir({ fase: "erro", mensagem: j.motivo || "Não consegui conferir a pasta agora." }); return; }
      setConferir({ fase: "ok", subpastas: Array.isArray(j.subpastas) ? j.subpastas : [], emailDaConta: j.emailDaConta });
    } catch {
      setConferir({ fase: "erro", mensagem: "Falha de rede ao conferir. Tente de novo." });
    }
  }

  async function importarSubpasta(nome: string) {
    setImportando((s) => new Set(s).add(nome));
    setResultadoImportar((r) => { const { [nome]: _omit, ...resto } = r; return resto; });
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/drive/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subpasta: nome }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        setResultadoImportar((res) => ({ ...res, [nome]: { ok: false, mensagem: j.motivo || j.error || "Não consegui importar esta subpasta." } }));
        return;
      }
      const n = typeof j.importados === "number" ? j.importados : null;
      setResultadoImportar((res) => ({ ...res, [nome]: { ok: true, mensagem: n != null ? `${n} arquivo${n === 1 ? "" : "s"} importado${n === 1 ? "" : "s"}.` : "Importado." } }));
    } catch {
      setResultadoImportar((res) => ({ ...res, [nome]: { ok: false, mensagem: "Falha de rede ao importar." } }));
    } finally {
      setImportando((s) => { const n2 = new Set(s); n2.delete(nome); return n2; });
    }
  }

  const faltantes = conferir.fase === "ok" ? conferir.subpastas.filter((s) => !s.encontrada).map((s) => s.nome) : [];

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Pasta do Drive</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Material de referência do cliente — Brand book, logos, fotos e mais.</p>
          <OrientacaoDasPastas />
        </div>
        <div className="flex items-center gap-2">
          {salvo && <span className="text-[12px] text-[var(--success)] font-medium">✓ Salvo</span>}
          {podeEditar && estado.fase === "ok" && estado.dados.pastaDriveUrl && !editando && (
            <button
              onClick={abrirEdicao}
              className="h-11 sm:h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
            >
              Editar
            </button>
          )}
          {!podeEditar && (
            <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]" title="Só quem é master edita a pasta do Drive">
              Leitura
            </span>
          )}
        </div>
      </div>

      {/* ── Carregando ─────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-2">
          <div className="h-9 rounded-[8px] bg-[var(--accent)] animate-pulse mt-3" />
          <div className="h-16 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando a pasta do Drive…</span>
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

      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-4">
          {/* Conta de serviço + aviso de onboarding — texto fixo da plataforma */}
          {estado.dados.contaDeServico.configurada ? (
            <p className="text-[12px] text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[8px] px-3 py-2 leading-relaxed">
              {avisoOnboarding(estado.dados.contaDeServico)}
            </p>
          ) : (
            <p role="alert" className="text-[12px] font-medium text-[var(--warning)] bg-[var(--warning-bg)] rounded-[8px] px-3 py-2">
              {avisoOnboarding(estado.dados.contaDeServico)}
            </p>
          )}

          {/* ── Vazio — pasta nunca configurada ────────────────────────── */}
          {!estado.dados.pastaDriveUrl && !editando && (
            <div className="text-center py-6">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Ainda não há pasta do Drive configurada</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
                Sem a pasta e a autorização escrita do cliente, a agência não lê nenhum material dele.
              </p>
              {podeEditar ? (
                <button
                  onClick={abrirEdicao}
                  className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  Configurar pasta do Drive
                </button>
              ) : (
                <p className="text-[12px] text-[var(--text-subtle)] mt-2 italic">Só quem é master configura.</p>
              )}
            </div>
          )}

          {/* ── Formulário (configurar ou editar) ──────────────────────── */}
          {editando && (
            <div className="space-y-3 rounded-[10px] border border-[var(--border)] px-3.5 py-3">
              <div>
                <label htmlFor="drive-url" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Link da pasta (raiz)</label>
                <input
                  id="drive-url"
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="drive-autorizacao" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Autorização escrita do cliente
                </label>
                <textarea
                  id="drive-autorizacao"
                  value={autorizacaoDraft}
                  onChange={(e) => setAutorizacaoDraft(e.target.value)}
                  rows={3}
                  placeholder='Ex.: "Autorizo a Dioli a acessar e usar o material desta pasta." — cole a mensagem exata do cliente.'
                  className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y"
                />
              </div>
              {erroSalvar && (
                <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroSalvar}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void salvar()}
                  disabled={salvando}
                  className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-semibold bg-[var(--navy)] text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                <button
                  onClick={() => { setEditando(false); setErroSalvar(null); }}
                  disabled={salvando}
                  className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Leitura — pasta já configurada ──────────────────────────── */}
          {!editando && estado.dados.pastaDriveUrl && (
            <div className="space-y-3">
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 space-y-2">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Pasta</div>
                  <a href={estado.dados.pastaDriveUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-[var(--navy)] hover:underline break-all">
                    {estado.dados.pastaDriveUrl}
                  </a>
                </div>
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Autorização do cliente</div>
                  {estado.dados.autorizacaoDriveTexto ? (
                    <>
                      <p className="text-[13px] text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap">{estado.dados.autorizacaoDriveTexto}</p>
                      {dataCurta(estado.dados.autorizacaoDriveEm) && (
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Gravado em {dataCurta(estado.dados.autorizacaoDriveEm)}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-[var(--danger)] mt-0.5">Sem autorização escrita registrada.</p>
                  )}
                </div>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {dataCurta(estado.dados.driveSincronizadoEm) ? `Última sincronização: ${dataCurta(estado.dados.driveSincronizadoEm)}` : "Nunca sincronizado."}
                </p>
              </div>

              {/* ── Conferir subpastas ────────────────────────────────── */}
              <div className="space-y-2">
                <button
                  onClick={() => void conferirPasta()}
                  disabled={conferir.fase === "conferindo"}
                  className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[13px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-60"
                >
                  {conferir.fase === "conferindo" ? "Conferindo…" : "Conferir pasta"}
                </button>

                {conferir.fase === "erro" && (
                  <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{conferir.mensagem}</p>
                )}

                {conferir.fase === "ok" && (
                  <div className="space-y-2">
                    {conferir.emailDaConta && (
                      <p className="text-[12px] text-[var(--text-muted)]">Verificado com {conferir.emailDaConta}</p>
                    )}
                    {faltantes.length > 0 && (
                      <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">
                        Falta material de referência: {faltantes.join(", ")}
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {conferir.subpastas.map((s) => (
                        <li key={s.nome} className="flex items-center justify-between gap-2 flex-wrap rounded-[8px] border border-[var(--border)] px-3 py-2">
                          <span className="flex items-center gap-2 text-[13px]">
                            <span aria-hidden className={s.encontrada ? "text-[var(--success)]" : "text-[var(--danger)]"}>
                              {s.encontrada ? "✓" : "✗"}
                            </span>
                            <b className="text-[var(--text-primary)]">{s.nome}</b>
                            <span className="text-[var(--text-muted)]">
                              {s.encontrada ? `${s.arquivos} arquivo${s.arquivos === 1 ? "" : "s"}` : "não encontrada"}
                            </span>
                          </span>
                          {s.encontrada && s.arquivos > 0 && (
                            <button
                              onClick={() => void importarSubpasta(s.nome)}
                              disabled={importando.has(s.nome)}
                              className="h-11 sm:h-8 px-2.5 rounded-[6px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-60 shrink-0"
                            >
                              {importando.has(s.nome) ? "Importando…" : "Importar"}
                            </button>
                          )}
                          {resultadoImportar[s.nome] && (
                            <p role={resultadoImportar[s.nome].ok ? "status" : "alert"} className={`w-full text-[12px] ${resultadoImportar[s.nome].ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                              {resultadoImportar[s.nome].mensagem}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {/* Cliente leigo joga tudo na pasta principal, sem subpasta
                        (test drive de Branding, 03/10/2026): esses arquivos
                        também entram, com o tipo tirado do nome. */}
                    <div className="flex items-center justify-between gap-2 flex-wrap rounded-[8px] border border-dashed border-[var(--border)] px-3 py-2">
                      <span className="text-[13px] text-[var(--text-secondary)]">
                        Arquivos soltos na pasta principal (fora das subpastas)
                      </span>
                      <button
                        onClick={() => void importarSubpasta("Arquivos soltos")}
                        disabled={importando.has("Arquivos soltos")}
                        className="h-11 sm:h-8 px-2.5 rounded-[6px] text-[12px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-60 shrink-0"
                      >
                        {importando.has("Arquivos soltos") ? "Importando…" : "Importar soltos"}
                      </button>
                      {resultadoImportar["Arquivos soltos"] && (
                        <p role={resultadoImportar["Arquivos soltos"].ok ? "status" : "alert"} className={`w-full text-[12px] ${resultadoImportar["Arquivos soltos"].ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                          {resultadoImportar["Arquivos soltos"].mensagem}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
