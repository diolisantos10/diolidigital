"use client";

// MaterialDeMarca — o que a casa consegue PÔR NUMA PEÇA deste cliente.
//
// ── POR QUE ESTA TELA EXISTE (08/08/2026) ──────────────────────────────────
//
// A agência não tinha onde ver — nem onde consertar — a coisa que mais quebra
// entregável: o cliente não mandou logo, ou mandou e a casa não sabe que é logo.
// O operador via "Materiais Pendentes: 1" e não tinha o que fazer com aquilo.
//
// Aqui ele faz duas coisas que antes eram impossíveis:
//   1. VÊ o que a peça enxerga de verdade (a mesma função que `artes.ts` chama,
//      não uma segunda leitura que diverge);
//   2. SOBE material pelo cliente, declarando o papel — o mesmo `POST /api/media`
//      com `papel` que o portal usa. Uma implementação, não duas.
//
// E vê os ÓRFÃOS: arquivos que o cliente já mandou e que nunca chegaram numa
// peça. Cada um traz um PALPITE de papel pelo nome — marcado como palpite. O
// operador confirma ou corrige; a casa não decide sozinha o que é "IMG_2831.jpg",
// porque peça com a foto errada é pior que peça sem foto.

import { useEffect, useState, useRef, useCallback } from "react";
import { PAPEIS, PAPEIS_VALIDOS, sugerirPapel, type Papel } from "@/lib/integrations/google/escolha-de-material";

interface Material {
  papel: Papel;
  mediaAssetId: string;
  url: string;
  nome: string;
  mimeType: string;
}

interface Orfao {
  mediaAssetId: string;
  nome: string;
  tamanhoBytes: number;
  recebidoEm: string;
  enviadoPor: string;
  papelSugerido: Papel | null;
  rotuloSugerido: string | null;
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MaterialDeMarca({ clientId }: { clientId: string }) {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fila, setFila] = useState<Array<{ arquivo: File; papel: Papel | "" }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/agency/material-de-marca?clientId=${encodeURIComponent(clientId)}`);
      const json = await res.json();
      if (!res.ok) {
        // "Não consegui ler" e "não há material" são fatos opostos. O segundo
        // faria o operador concluir que o cliente não mandou nada.
        setErro(json.error ?? "Não consegui ler o material deste cliente.");
        return;
      }
      setErro(null);
      setMateriais(json.materiais ?? []);
      setOrfaos(json.orfaos ?? []);
    } catch {
      setErro("Não consegui ler o material deste cliente.");
    } finally {
      setCarregando(false);
    }
  }, [clientId]);

  useEffect(() => { void carregar(); }, [carregar]);

  function escolher(lista: FileList | File[]) {
    const novos = Array.from(lista).map((arquivo) => ({
      arquivo,
      papel: (sugerirPapel(arquivo.name, arquivo.type) ?? "") as Papel | "",
    }));
    if (novos.length === 0) return;
    setFila((a) => [...a, ...novos]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const faltaDizer = fila.filter((f) => !f.papel).length;

  async function enviar() {
    if (fila.length === 0) return;
    // TRAVA, não aviso — o `disabled` do botão é aparência.
    if (faltaDizer > 0) {
      setErro(`Falta dizer o que ${faltaDizer === 1 ? "é 1 arquivo" : `são ${faltaDizer} arquivos`}.`);
      return;
    }
    setErro(null);
    setEnviando(true);
    for (const item of fila) {
      const form = new FormData();
      form.append("file", item.arquivo);
      form.append("clientId", clientId);
      form.append("papel", item.papel);
      try {
        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setErro(json.error ?? "Não consegui enviar o arquivo."); continue; }
        if (json.materialDeMarca?.registrado === false) {
          setErro(json.materialDeMarca.motivo ?? "O arquivo subiu, mas não virou material de marca.");
        }
      } catch {
        setErro("Falha de rede ao enviar o arquivo.");
      }
    }
    setFila([]);
    setEnviando(false);
    await carregar();
  }

  const temLogo = materiais.some((m) => m.papel === "logo");

  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-white p-5">
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Material de marca</h2>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
        O que a produção consegue colocar dentro de uma peça deste cliente. O que não estiver aqui,
        a peça não usa.
      </p>

      {erro && (
        <p className="mt-3 rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] leading-snug text-[#B91C1C]">{erro}</p>
      )}

      {carregando ? (
        <p className="mt-4 text-[12px] text-[var(--text-muted)]">Lendo…</p>
      ) : (
        <>
          {/* ── SEM LOGO É O ALARME QUE IMPORTA ─────────────────────────── */}
          {!temLogo && (
            <p className="mt-3 rounded-[8px] bg-[#FFFBEB] px-3 py-2 text-[12px] leading-snug text-[#92400E]">
              <strong>Sem logo.</strong> Enquanto não houver um arquivo de logo aqui, toda peça deste cliente
              sai com o nome dele escrito em fonte comum.
            </p>
          )}

          {materiais.length === 0 ? (
            <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
              Nenhum material utilizável. A peça sai sem logo e sem foto real.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {materiais.map((m) => (
                <li
                  key={m.mediaAssetId}
                  className="flex items-center justify-between gap-3 rounded-[8px] bg-[#F7F7F6] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{m.nome}</span>
                  <span className="shrink-0 text-[12px] font-medium text-[var(--text-secondary)]">
                    {PAPEIS[m.papel].rotulo}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ── OS ÓRFÃOS ───────────────────────────────────────────────── */}
          {orfaos.length > 0 && (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                {orfaos.length} {orfaos.length === 1 ? "arquivo recebido que a peça não vê" : "arquivos recebidos que a peça não vê"}
              </h3>
              <p className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
                Chegaram pelo portal e ninguém disse o que são. Para usar, envie de novo dizendo o papel —
                a casa não adivinha, porque peça com a foto errada é pior que peça sem foto.
              </p>
              <ul className="mt-2 space-y-1.5">
                {orfaos.map((o) => (
                  <li
                    key={o.mediaAssetId}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--border)] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{o.nome}</span>
                    <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{tamanho(o.tamanhoBytes)}</span>
                    <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                      {o.rotuloSugerido ? `talvez: ${o.rotuloSugerido}` : "sem palpite"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── SUBIR PELO CLIENTE ──────────────────────────────────────── */}
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-11 w-full rounded-[8px] border border-dashed border-[var(--border)] px-4 text-[13px] font-medium text-[var(--text-secondary)] hover:border-[#12B5AC] hover:text-[var(--text-primary)]"
            >
              Subir material por este cliente
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,application/pdf,.docx,.pptx,.txt,.csv"
              onChange={(e) => { if (e.target.files) escolher(e.target.files); }}
            />

            {fila.length > 0 && (
              <ul className="mt-3 space-y-2">
                {fila.map((item, i) => (
                  <li key={`${item.arquivo.name}-${i}`} className="rounded-[10px] border border-[var(--border)] bg-[#F7F7F6] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
                        {item.arquivo.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFila((a) => a.filter((_, j) => j !== i))}
                        aria-label={`Tirar ${item.arquivo.name} da lista`}
                        className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-white"
                      >
                        Tirar
                      </button>
                    </div>
                    <select
                      value={item.papel}
                      aria-label={`O que é ${item.arquivo.name}?`}
                      onChange={(e) => setFila((a) => a.map((f, j) => (j === i ? { ...f, papel: e.target.value as Papel | "" } : f)))}
                      className={`mt-2 h-11 w-full rounded-[8px] border bg-white px-3 text-[13px] text-[var(--text-primary)] ${
                        item.papel ? "border-[var(--border)]" : "border-[#F0A202]"
                      }`}
                    >
                      <option value="">Escolha o que é este arquivo…</option>
                      {PAPEIS_VALIDOS.map((p) => (
                        <option key={p} value={p}>{PAPEIS[p].rotulo}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}

            {fila.length > 0 && (
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={enviando}
                className="mt-3 h-11 w-full rounded-[8px] bg-[#12B5AC] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {enviando ? "Enviando…" : `Enviar ${fila.length} ${fila.length === 1 ? "arquivo" : "arquivos"}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
