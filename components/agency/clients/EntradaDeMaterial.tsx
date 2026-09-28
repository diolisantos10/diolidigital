"use client";

// EntradaDeMaterial (1D-D3) — a porta de entrada de material bruto (foto ou
// vídeo) que a equipe sobe por este cliente, com uma frase obrigatória
// dizendo o que é e quando deveria ir ("lançamento do combo X, postar sexta
// 18h"). O motor de Social interpreta a frase e cada entrada pousa numa
// destas cinco fases — carimbada pelo SERVIDOR, nunca escolhida pela tela:
//
//   recebida → interpretada → preciso_confirmar (data ambígua)
//                            → encaixada (virou peça no Planner)
//                            → recusada
//
// Mora na sub-aba "Acervo" do Social Media, ao lado do Acervo importado da
// Meta: aquele é o que já foi PUBLICADO, este é matéria-prima ainda não
// processada. Uma pasta do Drive chamada "Entrada de material" alimenta o
// mesmo fluxo (ver PastaDoDrive.tsx) — a origem aparece na lista, nunca
// escondida.
//
// Fonte: POST /api/agency/clients/{id}/entrada (multipart: arquivos[] +
// frase), GET /api/agency/clients/{id}/entrada, POST
// /api/agency/clients/{id}/entrada/{entradaId}/confirmar.
//
// No celular o botão de escolher arquivo é um <input type="file"> comum —
// isso já abre o seletor nativo (câmera OU galeria) em iOS e Android. Não
// usar o atributo `capture`: ele pula a galeria e força a câmera, e a
// "rua principal" daqui é tanto foto nova quanto material já pronto no
// aparelho (ver DESIGN.md §6.5 sobre o Chrome do iPhone).

import { useCallback, useEffect, useRef, useState } from "react";

type StatusEntrada = "recebida" | "interpretada" | "preciso_confirmar" | "encaixada" | "recusada";

interface Interpretacao {
  intencao: string | null;
  resumo: string | null;
  dataAlvo: string | null;
  horarioAlvo: string | null;
  dataAmbigua: boolean;
  motivoDaAmbiguidade: string | null;
  formatos: string[] | null;
  quantidade: number | null;
}

interface Entrada {
  id: string;
  origem: "upload" | "drive";
  frase: string;
  status: StatusEntrada;
  motivo: string | null;
  interpretacao: Interpretacao | null;
  socialPostIds: string[];
  criadaEm: string;
  miniaturas?: string[];
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; entradas: Entrada[] };

const FORMATOS_OPCOES = [
  { valor: "feed", rotulo: "Feed" },
  { valor: "story", rotulo: "Story" },
  { valor: "reels", rotulo: "Reels" },
  { valor: "carrossel", rotulo: "Carrossel" },
] as const;

/** Um rótulo por conceito (DESIGN.md §4.3) — a cor do selo E a frase do
 *  status vêm sempre daqui, nunca escritas de novo num canto da tela. */
const TOM_DO_STATUS: Record<StatusEntrada, { texto: string; bg: string; rotulo: string }> = {
  recebida:          { texto: "var(--info)",    bg: "var(--info-bg)",    rotulo: "Recebida" },
  interpretada:      { texto: "var(--info)",    bg: "var(--info-bg)",    rotulo: "Interpretada" },
  preciso_confirmar: { texto: "var(--warning)", bg: "var(--warning-bg)", rotulo: "Preciso confirmar" },
  encaixada:         { texto: "var(--success)", bg: "var(--success-bg)", rotulo: "Encaixada" },
  recusada:          { texto: "var(--danger)",  bg: "var(--danger-bg)",  rotulo: "Recusada" },
};

function diaCurto(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "";
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const dataNum = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${semana} ${dataNum}`;
}

function horarioCurto(h: string | null | undefined): string {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  if (!hh) return "";
  return mm && mm !== "00" ? `${Number(hh)}h${mm}` : `${Number(hh)}h`;
}

function dataHoraCurta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** A frase que a pessoa lê — não o código do status. Nunca inventa data:
 *  se o servidor não mandou `dataAlvo`, a frase não afirma uma. */
function fraseDoStatus(e: Pick<Entrada, "status" | "motivo" | "interpretacao">): string {
  switch (e.status) {
    case "recebida":
      return "Recebido — a IA está lendo agora.";
    case "interpretada":
      return e.interpretacao?.resumo
        ? `Entendido: ${e.interpretacao.resumo} — organizando no calendário.`
        : "Entendido — organizando no calendário.";
    case "preciso_confirmar":
      return `Preciso confirmar: ${e.interpretacao?.motivoDaAmbiguidade || "a data e o horário não ficaram claros."}`;
    case "encaixada": {
      if (!e.interpretacao?.dataAlvo) return "Encaixada no calendário.";
      const dia = diaCurto(e.interpretacao.dataAlvo);
      const hora = horarioCurto(e.interpretacao.horarioAlvo);
      return `Encaixada em ${dia}${hora ? " " + hora : ""}`;
    }
    case "recusada":
      return e.motivo ? `Não deu para encaixar: ${e.motivo}` : "Não deu para encaixar este material.";
    default:
      return "";
  }
}

/** Upload com progresso REAL (evento `xhr.upload.onprogress`) — nunca uma
 *  barra de `setTimeout` desacoplada da chamada, que é a dívida I-14 do
 *  DESIGN.md. `fetch` não expõe progresso de envio; por isso `XMLHttpRequest`
 *  aqui, e só aqui. */
function enviarComProgresso(
  url: string,
  form: FormData,
  aoProgredir: (pct: number) => void,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) aoProgredir(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(xhr.responseText); } catch { /* resposta não era JSON */ }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}

function FormularioDeConfirmacao({
  clientId,
  entradaId,
  onFechar,
  onConfirmado,
}: {
  clientId: string;
  entradaId: string;
  onFechar: () => void;
  onConfirmado: () => void;
}) {
  const [dataAlvo, setDataAlvo] = useState("");
  const [horarioAlvo, setHorarioAlvo] = useState("");
  const [formatos, setFormatos] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternarFormato(v: string) {
    setFormatos((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  }

  async function confirmar() {
    if (!dataAlvo) { setErro("Escolha a data."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/entrada/${entradaId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataAlvo,
          horarioAlvo: horarioAlvo || undefined,
          formatos: formatos.size > 0 ? Array.from(formatos) : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) { setErro(j.motivo || j.error || "Não consegui confirmar agora."); return; }
      onConfirmado();
    } catch {
      setErro("Falha de rede ao confirmar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label htmlFor={`data-${entradaId}`} className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
            Data
          </label>
          <input
            id={`data-${entradaId}`}
            type="date"
            value={dataAlvo}
            onChange={(e) => setDataAlvo(e.target.value)}
            className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)]"
          />
        </div>
        <div>
          <label htmlFor={`hora-${entradaId}`} className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
            Horário (opcional)
          </label>
          <input
            id={`hora-${entradaId}`}
            type="time"
            value={horarioAlvo}
            onChange={(e) => setHorarioAlvo(e.target.value)}
            className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)]"
          />
        </div>
      </div>

      <div>
        <span className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Formato (opcional)</span>
        <div className="flex flex-wrap gap-1.5">
          {FORMATOS_OPCOES.map((f) => {
            const marcado = formatos.has(f.valor);
            return (
              <label
                key={f.valor}
                className={`inline-flex items-center gap-1.5 h-11 sm:h-8 px-3 rounded-full border text-[12px] font-medium cursor-pointer transition-colors ${
                  marcado
                    ? "border-[var(--navy)] bg-[var(--accent-light)] text-[var(--navy)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternarFormato(f.valor)}
                  aria-label={f.rotulo}
                  className="h-4 w-4"
                />
                {f.rotulo}
              </label>
            );
          })}
        </div>
      </div>

      {erro && (
        <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erro}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando}
          className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-semibold bg-[var(--navy)] text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {salvando ? "Confirmando…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          disabled={salvando}
          className="h-11 sm:h-9 px-4 rounded-[7px] text-[13px] font-medium border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function EntradaDeMaterial({
  clientId,
  podeEnviar,
  motivoSemPermissao,
}: {
  clientId: string;
  podeEnviar: boolean;
  /** Só existe quando `podeEnviar` é falso — vira `title` do selo "Leitura". */
  motivoSemPermissao?: string;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const [frase, setFrase] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [sucessoEnvio, setSucessoEnvio] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [thumbsQuebradas, setThumbsQuebradas] = useState<Set<string>>(new Set());

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/entrada`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar as entradas agora." }); return; }
      setEstado({ fase: "ok", entradas: Array.isArray(j.entradas) ? j.entradas : [] });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  // Enquanto existir entrada ainda em leitura pela IA, confere de novo sozinho
  // — sem isso, "Recebido — a IA está lendo agora" fica escrito para sempre
  // até alguém trocar de aba e voltar.
  useEffect(() => {
    if (estado.fase !== "ok") return;
    const emAndamento = estado.entradas.some((e) => e.status === "recebida" || e.status === "interpretada");
    if (!emAndamento) return;
    const id = setInterval(() => { void buscar(); }, 5000);
    return () => clearInterval(id);
  }, [estado, buscar]);

  function escolherArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setArquivos((atual) => [...atual, ...Array.from(lista)]);
    setErroEnvio(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removerArquivo(i: number) {
    setArquivos((atual) => atual.filter((_, j) => j !== i));
  }

  async function enviar() {
    if (arquivos.length === 0) { setErroEnvio("Escolha ao menos uma foto ou vídeo."); return; }
    if (!frase.trim()) { setErroEnvio("Escreva a frase — ela é obrigatória (ex.: \"lançamento do combo X, postar sexta 18h\")."); return; }
    setErroEnvio(null);
    setSucessoEnvio(null);
    setEnviando(true);
    setProgresso(0);
    const form = new FormData();
    for (const a of arquivos) form.append("arquivos[]", a);
    form.append("frase", frase.trim());
    try {
      const { status, json } = await enviarComProgresso(`/api/agency/clients/${clientId}/entrada`, form, setProgresso);
      if (status < 200 || status >= 300 || json.ok === false) {
        setErroEnvio((json.motivo as string) || "Não consegui enviar o material agora.");
        return;
      }
      const entrada = json.entrada as Partial<Entrada> | undefined;
      if (entrada && entrada.status) {
        setSucessoEnvio(fraseDoStatus({ status: entrada.status, motivo: entrada.motivo ?? null, interpretacao: entrada.interpretacao ?? null }));
      } else {
        setSucessoEnvio("Enviado — a IA está lendo agora.");
      }
      setArquivos([]);
      setFrase("");
      await buscar();
    } catch {
      setErroEnvio("Falha de rede ao enviar. Tente de novo.");
    } finally {
      setEnviando(false);
      setProgresso(0);
    }
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Entrada de material</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            Envie foto ou vídeo com uma frase dizendo o que é — a IA lê e encaixa no calendário.
          </p>
        </div>
        {!podeEnviar && (
          <span
            className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]"
            title={motivoSemPermissao}
          >
            Leitura
          </span>
        )}
      </div>

      {/* ── Envio ──────────────────────────────────────────────────────── */}
      {podeEnviar && (
        <div className="px-5 py-4 border-b border-[var(--border)] space-y-3">
          <div>
            <label htmlFor="entrada-frase" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              O que é este material? <span className="text-[var(--danger)]">*</span>
            </label>
            <textarea
              id="entrada-frase"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              rows={2}
              placeholder='Ex.: "lançamento do combo X, postar sexta 18h"'
              disabled={enviando}
              className="w-full px-3 py-2 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y disabled:opacity-60"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={enviando}
              className="h-11 w-full rounded-[8px] border border-dashed border-[var(--border)] px-4 text-[13px] font-medium text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-60"
            >
              Escolher fotos ou vídeos
            </button>
            {/* Sem `capture`: o seletor nativo já oferece câmera E galeria —
                `capture` pularia a galeria e forçaria a câmera (DESIGN.md §6.5). */}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => escolherArquivos(e.target.files)}
              aria-label="Escolher fotos ou vídeos para enviar"
            />
          </div>

          {arquivos.length > 0 && (
            <ul className="space-y-1.5">
              {arquivos.map((a, i) => (
                <li
                  key={`${a.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => removerArquivo(i)}
                    disabled={enviando}
                    aria-label={`Tirar ${a.name} da lista`}
                    className="shrink-0 h-11 sm:h-7 px-2 rounded-[6px] text-[12px] text-[var(--text-muted)] hover:bg-white disabled:opacity-60"
                  >
                    Tirar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {enviando && (
            <div className="space-y-1">
              <div
                role="progressbar"
                aria-label="Progresso do envio"
                aria-valuenow={progresso}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full rounded-full bg-[var(--accent)] overflow-hidden"
              >
                <div className="h-full bg-[var(--navy)] transition-[width]" style={{ width: `${progresso}%` }} />
              </div>
              <span role="status" aria-live="polite" className="text-[12px] text-[var(--text-muted)]">
                Enviando… {progresso}%
              </span>
            </div>
          )}

          {erroEnvio && (
            <p role="alert" className="text-[13px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroEnvio}</p>
          )}
          {sucessoEnvio && (
            <p role="status" className="text-[13px] text-[var(--success)] bg-[var(--success-bg)] rounded-[8px] px-3 py-2">{sucessoEnvio}</p>
          )}

          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || arquivos.length === 0 || !frase.trim()}
            className="h-11 w-full rounded-[8px] bg-[var(--navy)] text-white px-4 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {enviando
              ? "Enviando…"
              : arquivos.length > 0
                ? `Enviar ${arquivos.length} ${arquivos.length === 1 ? "arquivo" : "arquivos"}`
                : "Enviar"}
          </button>
        </div>
      )}

      {/* ── Lista de entradas ─────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {estado.fase === "carregando" && (
          <div role="status" aria-live="polite" className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 rounded-[10px] bg-[var(--accent)] animate-pulse" />
            ))}
            <span className="sr-only">Carregando as entradas…</span>
          </div>
        )}

        {estado.fase === "erro" && (
          <div role="alert" className="text-center py-6">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
            <button
              onClick={() => setTentativa((t) => t + 1)}
              className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {estado.fase === "ok" && estado.entradas.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">Nenhum material enviado ainda</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
              {podeEnviar
                ? "Envie a primeira foto ou vídeo acima, com uma frase dizendo o que é."
                : "Quando a equipe enviar o primeiro material, ele aparece aqui."}
            </p>
          </div>
        )}

        {estado.fase === "ok" && estado.entradas.length > 0 && (
          <ul className="space-y-2.5">
            {estado.entradas.map((e) => {
              const tom = TOM_DO_STATUS[e.status];
              const quebrada = thumbsQuebradas.has(e.id);
              const miniatura = e.miniaturas?.[0];
              const metaExtra =
                e.interpretacao && (e.interpretacao.quantidade || (e.interpretacao.formatos?.length ?? 0) > 0)
                  ? [
                      e.interpretacao.quantidade
                        ? `${e.interpretacao.quantidade} peça${e.interpretacao.quantidade === 1 ? "" : "s"}`
                        : null,
                      e.interpretacao.formatos?.length ? e.interpretacao.formatos.join(", ") : null,
                    ].filter(Boolean).join(" · ")
                  : null;

              return (
                <li key={e.id} className="rounded-[10px] border border-[var(--border)] bg-white p-3 sm:p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-14 w-14 shrink-0 rounded-[8px] bg-[var(--accent)] overflow-hidden flex items-center justify-center">
                        {miniatura && !quebrada ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={miniatura}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={() => setThumbsQuebradas((s) => new Set(s).add(e.id))}
                          />
                        ) : (
                          <span className="text-[12px] leading-tight text-[var(--text-subtle)] text-center px-1">sem prévia</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] text-[var(--text-primary)] leading-snug line-clamp-2">“{e.frase}”</p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                          {e.origem === "drive" ? "Veio da pasta Entrada de material" : "Enviado pela equipe"}
                          {" · "}
                          {dataHoraCurta(e.criadaEm)}
                        </p>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: tom.texto, background: tom.bg }}
                    >
                      {tom.rotulo}
                    </span>
                  </div>

                  <p className="text-[13px] font-medium" style={{ color: tom.texto }}>
                    {fraseDoStatus(e)}
                  </p>

                  {metaExtra && <p className="text-[12px] text-[var(--text-muted)]">{metaExtra}</p>}

                  {e.status === "preciso_confirmar" && (
                    confirmando === e.id ? (
                      <FormularioDeConfirmacao
                        clientId={clientId}
                        entradaId={e.id}
                        onFechar={() => setConfirmando(null)}
                        onConfirmado={() => { setConfirmando(null); void buscar(); }}
                      />
                    ) : podeEnviar ? (
                      <button
                        type="button"
                        onClick={() => setConfirmando(e.id)}
                        className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[12px] font-semibold border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning-bg)] transition-colors"
                      >
                        Confirmar data e horário
                      </button>
                    ) : null
                  )}

                  {e.status === "encaixada" && e.socialPostIds.length > 0 && (
                    <a
                      href="/agency/planner"
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--navy)] hover:underline"
                    >
                      Ver {e.socialPostIds.length > 1 ? `as ${e.socialPostIds.length} peças` : "a peça"} no Planner →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
