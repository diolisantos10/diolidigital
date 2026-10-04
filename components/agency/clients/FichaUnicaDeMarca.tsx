"use client";

// ─── A FICHA DE MARCA ÚNICA (04/10/2026) ──────────────────────────────────────
//
// Substitui os dois blocos que não conversavam (Ficha de Marca + Brand Hub).
// Uma fonte da verdade: o mesmo registro que calendário, legenda, arte e
// analista leem.
//
// O que um leigo precisa, e não tinha:
//   • os campos EXISTEM no documento desde o primeiro desenho — nada depende
//     de clicar em "Preencher" campo a campo nem de animação;
//   • link direto: `/agency/clients/<ID>?tab=branding&ficha=editar` rola até
//     aqui e foca o primeiro campo;
//   • um botão Salvar para tudo, e a tela RELÊ do servidor e diz se algum
//     campo não voltou — nenhum campo mostrado é descartado em silêncio.
//
// Os 9 campos de régua (propósito, voz, proibições…) vêm PRIMEIRO, no
// componente deles: têm regras de duas metades e escritor próprio.

import { useCallback, useEffect, useRef, useState } from "react";
import { FichaDeMarca } from "@/components/agency/clients/FichaDeMarca";
import { DO_BRAND_HUB } from "@/lib/agency/esteira/ficha-unica-campos";

interface Campo { chave: string; rotulo: string; ajuda: string }
interface Leitura { estado: string; frase: string; arquivo?: string }
/** Sugestão pendente que o antigo Brand Hub guardava (`BrandUpdate`). */
interface Sugestao { id: string; field: string; suggestedValue: string; source: string; fileName?: string | null }

const LONGOS = new Set(["resumo", "manifesto", "produtos", "concorrentes", "paleta", "regras", "evitar", "notasInternas", "publico", "proposta"]);

export function FichaUnicaDeMarca({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // As sugestões pendentes do antigo Brand Hub não somem com ele: "Usar"
  // põe o valor no campo; ao salvar, a sugestão vira "aplicada".
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [usadas, setUsadas] = useState<string[]>([]);
  const [iaLigada, setIaLigada] = useState(false);
  const [relendo, setRelendo] = useState(false);
  const [recadoDaReleitura, setRecadoDaReleitura] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/agency/clients/${clientId}/ficha-unica`, { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { campos?: Campo[]; ficha?: Record<string, string>; leituraDoBrandBook?: Leitura | null; iaDaControlRoomLigada?: boolean; error?: string };
    if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
    setCampos(j.campos ?? []);
    setValores(j.ficha ?? {});
    setLeitura(j.leituraDoBrandBook ?? null);
    setIaLigada(j.iaDaControlRoomLigada === true);
    return j.ficha ?? {};
  }, [clientId]);

  useEffect(() => {
    fetch(`/api/brand-updates?clientId=${encodeURIComponent(clientId)}&status=pending`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Sugestao[]) => setSugestoes(Array.isArray(lista) ? lista.filter((u) => DO_BRAND_HUB[u.field]) : []))
      .catch(() => setSugestoes([]));
  }, [clientId]);

  function usar(u: Sugestao) {
    const chave = DO_BRAND_HUB[u.field];
    if (!chave) return;
    setValores((v) => ({ ...v, [chave]: u.suggestedValue }));
    setUsadas((x) => (x.includes(u.id) ? x : [...x, u.id]));
  }

  async function ignorar(u: Sugestao) {
    setSugestoes((x) => x.filter((y) => y.id !== u.id));
    await fetch(`/api/brand-updates/${u.id}`, { method: "DELETE" }).catch(() => undefined);
  }

  useEffect(() => {
    carregar()
      .catch(() => setAviso({ ok: false, texto: "Não consegui ler a ficha deste cliente." }))
      .finally(() => setCarregando(false));
  }, [carregar]);

  // Link direto: ?ficha=editar rola até a ficha e foca o primeiro campo.
  useEffect(() => {
    if (carregando) return;
    if (new URLSearchParams(window.location.search).get("ficha") !== "editar") return;
    // Para nos CAMPOS editáveis (não no topo da régua): quem abre o link
    // quer escrever, e o cursor precisa estar à vista.
    const campos = document.getElementById("ficha-de-marca-campos") ?? raiz.current;
    campos?.scrollIntoView({ block: "start" });
    campos?.querySelector<HTMLTextAreaElement>("textarea[data-ficha-unica]")?.focus({ preventScroll: true });
  }, [carregando]);

  // RELER os brand books já guardados (04/10/2026): os que chegaram antes da
  // IA ficaram esperando. Ninguém precisa reenviar arquivo.
  async function reler() {
    setRelendo(true);
    setRecadoDaReleitura(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/marca/reler-brand-books`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { relidos?: string[]; pulados?: { arquivo: string; motivo: string }[]; error?: string };
      if (!r.ok) {
        setRecadoDaReleitura(j.error ?? `Não consegui reler (erro ${r.status}).`);
        return;
      }
      const relidos = j.relidos ?? [];
      const pulados = (j.pulados ?? []).map((p) => `${p.arquivo}: ${p.motivo}`);
      setRecadoDaReleitura(
        [
          relidos.length ? `Relendo ${relidos.length === 1 ? "1 brand book" : `${relidos.length} brand books`}: ${relidos.join(", ")}. Leva até 90 s cada.` : "Nenhum brand book precisava ser relido.",
          ...pulados,
        ].join(" · "),
      );
      await carregar().catch(() => undefined);
    } catch {
      setRecadoDaReleitura("Não consegui reler: falha de rede.");
    } finally {
      setRelendo(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    const enviado = { ...valores };
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/ficha-unica`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ficha: enviado }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setAviso({ ok: false, texto: `Não salvou: ${j.error ?? `erro ${r.status}`}` });
        return;
      }
      // Sugestões usadas viram "aplicadas" só DEPOIS de gravadas.
      await Promise.all(
        usadas.map((id) =>
          fetch(`/api/brand-updates/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "applied" }),
          }).catch(() => undefined),
        ),
      );
      setSugestoes((x) => x.filter((u) => !usadas.includes(u.id)));
      setUsadas([]);
      // CONFERÊNCIA: relê do servidor e compara campo a campo.
      const voltou = await carregar();
      const faltou = campos.filter((c) => (enviado[c.chave] ?? "").trim() && (voltou[c.chave] ?? "").trim() !== (enviado[c.chave] ?? "").trim());
      setAviso(
        faltou.length === 0
          ? { ok: true, texto: "Salvo — todos os campos conferidos." }
          : { ok: false, texto: `Salvo, mas não voltou igual: ${faltou.map((c) => c.rotulo).join(", ")}. Avise a equipe técnica.` },
      );
    } catch {
      setAviso({ ok: false, texto: "Não salvou: falha de rede. Tente de novo." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div ref={raiz} id="ficha-de-marca" className="space-y-4 scroll-mt-20">
      {/* A RÉGUA PRIMEIRO (doutrina de 15/08): os nove campos que permitem
          julgar vêm antes do texto livre — invertido, quem preenche escreve o
          texto bonito e acha que já respondeu. */}
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Regras que as peças obedecem</h3>
        <FichaDeMarca clientId={clientId} />
      </div>

      <section id="ficha-de-marca-campos" className="scroll-mt-20 overflow-hidden rounded-[12px] border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Ficha da marca</h2>
            <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              Tudo opcional, texto livre. É daqui que calendário, legenda, arte e analista leem.
            </p>
          </div>
          {podeEditar && (
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || carregando}
              className="h-9 rounded-[8px] bg-[var(--text-primary)] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar ficha"}
            </button>
          )}
        </header>

        {aviso && (
          <p role="status" className={`border-b border-[var(--border)] px-5 py-2 text-[12px] ${aviso.ok ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
            {aviso.texto}
          </p>
        )}

        {(leitura || (podeEditar && iaLigada)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-2 text-[12px]">
            {leitura ? (
              <p className={leitura.estado === "erro" ? "text-[var(--warning)]" : "text-[var(--text-secondary)]"}>
                <strong>Leitura do brand book{leitura.arquivo ? ` (${leitura.arquivo})` : ""}:</strong> {leitura.frase}
              </p>
            ) : <span />}
            {podeEditar && iaLigada && (
              <button
                type="button"
                onClick={() => void reler()}
                disabled={relendo}
                className="h-9 rounded-[6px] border border-[var(--border)] px-3 font-medium text-[var(--text-primary)] disabled:opacity-50"
              >
                {relendo ? "Relendo…" : "Reler brand books guardados"}
              </button>
            )}
            {recadoDaReleitura && <p role="status" className="w-full text-[var(--text-secondary)]">{recadoDaReleitura}</p>}
          </div>
        )}

        {podeEditar && sugestoes.length > 0 && (
          <div className="border-b border-[var(--border)] px-5 py-3">
            <p className="mb-2 text-[12px] font-semibold text-[var(--text-primary)]">
              {sugestoes.length === 1 ? "1 sugestão pendente" : `${sugestoes.length} sugestões pendentes`}
            </p>
            <ul className="space-y-2">
              {sugestoes.map((u) => {
                const campo = campos.find((c) => c.chave === DO_BRAND_HUB[u.field]);
                const usada = usadas.includes(u.id);
                return (
                  <li key={u.id} className="flex flex-wrap items-start justify-between gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">{campo?.rotulo ?? u.field}:</strong> {u.suggestedValue}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => usar(u)} disabled={usada} className="h-8 rounded-[6px] border border-[var(--border)] px-3 font-medium disabled:opacity-50">
                        {usada ? "No campo — falta salvar" : "Usar"}
                      </button>
                      {!usada && (
                        <button type="button" onClick={() => void ignorar(u)} className="h-8 rounded-[6px] px-3 text-[var(--text-muted)]">
                          Ignorar
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {carregando ? (
          <p className="px-5 py-4 text-[12px] text-[var(--text-muted)]">Carregando a ficha…</p>
        ) : (
          <div className="grid max-w-[760px] gap-4 px-5 py-4">
            {campos.map((c) => (
              <label key={c.chave} className="flex flex-col gap-1">
                <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{c.rotulo}</span>
                <textarea
                  data-ficha-unica=""
                  name={c.chave}
                  value={valores[c.chave] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
                  readOnly={!podeEditar}
                  rows={LONGOS.has(c.chave) ? 3 : 2}
                  placeholder={c.ajuda}
                  className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
                />
              </label>
            ))}
            {/* O Salvar também no FIM: são 17 campos, e no celular o do topo
                fica a várias telas de distância de quem acabou de escrever. */}
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void salvar()}
                  disabled={salvando}
                  className="h-11 rounded-[8px] bg-[var(--text-primary)] px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {salvando ? "Salvando…" : "Salvar ficha"}
                </button>
                {aviso && <span role="status" className={`text-[12px] ${aviso.ok ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>{aviso.texto}</span>}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
