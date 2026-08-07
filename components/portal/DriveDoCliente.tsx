"use client";

// ── Google Drive do cliente — cartão da aba "Conexões" ──────────────────────
//
// Três passos, nesta ordem, e a tela nunca pula nenhum:
//
//   1. Conectar (popup do Google, escopo estreito `drive.file`);
//   2. Escolher os arquivos no seletor do próprio Google;
//   3. Dizer o que é cada arquivo.
//
// O passo 3 é o que a casa mais precisa e o que ninguém lembra de pedir. Sem
// ele, "IMG_2831.jpg" é um arquivo sem história e a produção teria que
// adivinhar — e adivinhar produz peça com a foto errada, que é pior do que peça
// sem foto. Por isso o cartão NUNCA mostra "conectado ✓" enquanto faltar
// declaração: ele mostra "falta dizer o que é".
//
// O seletor é o Google Picker, carregado do domínio do Google. É ele que torna
// o escopo estreito utilizável: o cliente escolhe arquivo por arquivo, e só o
// que ele escolhe fica ao alcance do app.

import { useCallback, useEffect, useRef, useState } from "react";

interface MaterialView {
  id: string;
  nome: string;
  mimeType: string;
  ehPasta: boolean;
  papel: string | null;
  papelSugerido: string | null;
  declarado: boolean;
  importado: boolean;
  erro: string | null;
}

interface PapelView { valor: string; rotulo: string; ajuda: string }

interface EstadoDoDrive {
  conectado: boolean;
  status: string;
  conta: string;
  retrato: { escolhidos: number; faltaDizerOQueE: number; pastas: number; frase: string; utilizavel: boolean };
  papeis: PapelView[];
  seletor: { disponivel: boolean; apiKey: string; appId: string };
  materiais: MaterialView[];
}

const PICKER_SRC = "https://apis.google.com/js/api.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { gapi?: any; google?: any }
}

function carregarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export function DriveDoCliente({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoDoDrive | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const pickerPronto = useRef(false);

  const q = useCallback((base: string) => (token ? `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : base), [token]);

  /** Devolve o estado lido do SERVIDOR, para quem precisa decidir com ele. */
  const carregar = useCallback(async (): Promise<EstadoDoDrive | null> => {
    try {
      const res = await fetch(q("/api/portal/drive"));
      if (!res.ok) { setEstado(null); return null; }
      const novo = (await res.json()) as EstadoDoDrive;
      setEstado(novo);
      return novo;
    } catch {
      setEstado(null);
      return null;
    } finally {
      setCarregando(false);
    }
  }, [q]);

  useEffect(() => { void carregar(); }, [carregar]);

  // O popup do OAuth termina num postMessage — sucesso ou erro, sempre.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; summary?: string; error?: string };
      if (d?.type === "drive_auth_success") {
        // ── QUEM DIZ "CONECTADO" É O SERVIDOR, NÃO O POPUP ──────────────────
        //
        // Em 07/08/2026 o CEO viu, no MESMO cartão e ao mesmo tempo, a faixa
        // verde "Google Drive conectado." e o texto "Drive não conectado." com
        // o botão de conectar. Eram duas fontes de verdade: a faixa vinha do
        // postMessage (a INTENÇÃO do popup) e o cartão vinha do banco (o FATO).
        // O popup estava errado — a tabela nem existia em produção.
        //
        // A causa raiz foi consertada nos dois lugares (migration + porta
        // fechada no callback). Isto aqui é a terceira metade, a que impede a
        // contradição de voltar por outro motivo: a confirmação só aparece
        // depois de o servidor confirmar, e é a palavra DELE que vai na tela.
        void carregar().then((novo) => {
          if (novo?.conectado) {
            setRecado({ ok: true, texto: novo.conta ? `Google Drive de ${novo.conta} conectado.` : "Google Drive conectado." });
          } else {
            setRecado({
              ok: false,
              texto: "O Google autorizou, mas a conexão não apareceu aqui do nosso lado. Avise a equipe — não é problema da sua conta.",
            });
          }
        });
      } else if (d?.type === "drive_auth_error") {
        setRecado({ ok: false, texto: d.error || "Não foi possível conectar o Drive." });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [carregar]);

  function conectar() {
    setRecado(null);
    const janela = window.open(q("/api/portal/drive/conectar"), "drive_oauth", "width=620,height=760,menubar=no,toolbar=no");
    if (!janela) {
      setRecado({ ok: false, texto: "Seu navegador bloqueou a janela de conexão. Libere os pop-ups deste site e tente de novo." });
      return;
    }
    // Janela fechada no meio não avisa ninguém — o mesmo silêncio que quebrou o
    // fluxo da Meta em 05/08/2026. Recarregamos antes de julgar.
    const relogio = setInterval(() => {
      if (!janela.closed) return;
      clearInterval(relogio);
      void carregar().then(() => {
        setRecado((atual) => atual ?? { ok: false, texto: "A janela foi fechada antes de terminar. Nada foi alterado — pode tentar de novo." });
      });
    }, 700);
  }

  async function abrirSeletor() {
    setRecado(null);
    if (!estado?.seletor.disponivel) {
      setRecado({ ok: false, texto: "O seletor de arquivos ainda não está liberado pela agência. Avise a equipe — não é problema da sua conta." });
      return;
    }

    let accessToken = "";
    try {
      const r = await fetch(q("/api/portal/drive/token-do-seletor"));
      const j = await r.json();
      if (!r.ok) { setRecado({ ok: false, texto: j.error ?? "Não consegui abrir o seletor." }); void carregar(); return; }
      accessToken = j.token;
    } catch {
      setRecado({ ok: false, texto: "Não consegui falar com o servidor. Tente de novo." });
      return;
    }

    try {
      await carregarScript(PICKER_SRC);
      if (!pickerPronto.current) {
        await new Promise<void>((resolve) => window.gapi.load("picker", () => resolve()));
        pickerPronto.current = true;
      }
    } catch {
      setRecado({ ok: false, texto: "Não consegui carregar o seletor do Google. Verifique sua internet e tente de novo." });
      return;
    }

    const g = window.google.picker;
    const view = new g.DocsView(g.ViewId.DOCS)
      // O cliente NAVEGA pelas pastas dele — inclusive subpastas. O que ele não
      // pode é ENTREGAR uma pasta: o escopo estreito não documenta acesso ao
      // conteúdo de uma pasta escolhida, e a casa não aposta em comportamento
      // não documentado. Ver o parecer do especialista do Google (07/08/2026).
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const picker = new g.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(estado.seletor.apiKey)
      .setAppId(estado.seletor.appId)
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .setTitle("Escolha o material que a Dioli pode usar")
      .setCallback(async (data: any) => {
        if (data[g.Response.ACTION] !== g.Action.PICKED) return;
        const docs = data[g.Response.DOCUMENTS] ?? [];
        const escolhas = docs.map((d: any) => ({ fileId: d[g.Document.ID], nome: d[g.Document.NAME], mimeType: d[g.Document.MIME_TYPE] }));
        const res = await fetch(q("/api/portal/drive"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ escolhas }),
        });
        const j = await res.json();
        if (!res.ok) { setRecado({ ok: false, texto: j.error ?? "Não consegui guardar sua escolha." }); return; }
        setRecado({ ok: true, texto: j.proximoPasso ?? "Escolha registrada." });
        void carregar();
      })
      .build();
    picker.setVisible(true);
  }

  async function declarar(id: string, papel: string) {
    setSalvando(id);
    setRecado(null);
    try {
      const res = await fetch(q("/api/portal/drive"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, papel }),
      });
      const j = await res.json();
      if (!res.ok) { setRecado({ ok: false, texto: j.error ?? "Não consegui salvar." }); return; }
      if (j.falhas?.length) {
        setRecado({ ok: false, texto: `Não consegui buscar: ${j.falhas.map((f: { nome: string; erro: string }) => `${f.nome} — ${f.erro}`).join(" · ")}` });
      } else if (j.importados > 0) {
        setRecado({ ok: true, texto: `Pronto. ${j.importados} arquivo(s) chegaram à equipe.` });
      }
      await carregar();
    } finally {
      setSalvando(null);
    }
  }

  async function remover(id: string) {
    const res = await fetch(q(`/api/portal/drive?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    const j = await res.json();
    setRecado({ ok: res.ok, texto: j.aviso ?? j.error ?? "" });
    void carregar();
  }

  const expirado = estado?.status === "expired";
  const faltaDeclarar = (estado?.retrato.faltaDizerOQueE ?? 0) > 0;

  return (
    <div className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white text-[13px] font-bold shrink-0" style={{ background: "#1FA463" }}>▲</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">Google Drive</p>
            {estado?.conectado && !expirado && (
              <span
                className="h-5 px-2 rounded-full text-[10px] font-bold flex items-center"
                style={faltaDeclarar ? { background: "#FEF3C7", color: "#9B7B2D" } : { background: "#DCFCE7", color: "#16A34A" }}
              >
                {faltaDeclarar ? "Falta escolher" : "Ativo"}
              </span>
            )}
            {expirado && <span className="h-5 px-2 rounded-full text-[10px] font-bold flex items-center" style={{ background: "#FEE2E2", color: "#DC2626" }}>Expirado</span>}
          </div>

          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-snug">
            Seu logo, suas fotos e seu manual de marca — para as peças ficarem com a
            cara do seu negócio, e não genéricas. <span className="font-semibold">A Dioli só enxerga os arquivos que você escolher.</span>
          </p>

          {carregando ? (
            <p className="mt-3 text-[12px] text-[var(--text-muted)]">Carregando…</p>
          ) : (
            <>
              <p className="mt-2 text-[12px] text-[var(--text-secondary)]">{estado?.retrato.frase}</p>
              {estado?.conta && <p className="text-[11px] text-[var(--text-subtle)] mt-0.5">Conta: {estado.conta}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={conectar}
                  style={{ touchAction: "manipulation" }}
                  className="h-10 px-4 rounded-[9px] bg-[#070A1F] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
                >
                  {estado?.conectado && !expirado ? "Reconectar" : "Conectar Google Drive"}
                </button>
                {estado?.conectado && !expirado && (
                  <button
                    onClick={() => void abrirSeletor()}
                    style={{ touchAction: "manipulation" }}
                    className="h-10 px-4 rounded-[9px] border border-[var(--border)] text-[var(--text-primary)] text-[13px] font-semibold hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    Escolher arquivos
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {recado && (
        <div className={`mt-4 rounded-[12px] border px-4 py-3 text-[12.5px] leading-snug ${recado.ok ? "bg-[#DCFCE7] border-[#86EFAC] text-[#166534]" : "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"}`}>
          {recado.texto}
        </div>
      )}

      {/* A lista — e o passo que ninguém lembra: dizer o que é cada arquivo */}
      {estado && estado.materiais.length > 0 && (
        <div className="mt-4 space-y-2">
          {estado.materiais.map((m) => (
            <div key={m.id} className="rounded-[11px] border border-[var(--border)] px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">{m.nome}</p>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    {m.ehPasta
                      ? "Pasta — abra e escolha os arquivos de dentro"
                      : m.declarado
                        ? `${estado.papeis.find((p) => p.valor === m.papel)?.rotulo ?? m.papel}${m.importado ? " · já com a equipe" : " · buscando…"}`
                        : "Ainda não sabemos o que é este arquivo"}
                  </p>
                  {m.erro && <p className="text-[11px] text-[var(--danger)] mt-0.5">{m.erro}</p>}
                </div>
                <button
                  onClick={() => void remover(m.id)}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0 px-1"
                  aria-label={`Remover ${m.nome}`}
                >
                  Remover
                </button>
              </div>

              {!m.ehPasta && (
                <div className="mt-2">
                  <label className="sr-only" htmlFor={`papel-${m.id}`}>O que é {m.nome}</label>
                  <select
                    id={`papel-${m.id}`}
                    disabled={salvando === m.id}
                    defaultValue={m.papel ?? m.papelSugerido ?? ""}
                    onChange={(e) => { if (e.target.value) void declarar(m.id, e.target.value); }}
                    className="w-full h-10 rounded-[9px] border border-[var(--border)] bg-white px-2.5 text-[12.5px] text-[var(--text-primary)]"
                  >
                    <option value="">O que é este arquivo?</option>
                    {estado.papeis.map((p) => (
                      <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                    ))}
                  </select>
                  {!m.declarado && m.papelSugerido && (
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1">
                      Nosso palpite pelo nome do arquivo: {estado.papeis.find((p) => p.valor === m.papelSugerido)?.rotulo}. Confirme se estiver certo.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {estado && !estado.seletor.disponivel && estado.conectado && (
        <div className="mt-4 bg-[#FFFBEB] border border-[#FCE7A0] rounded-[12px] px-4 py-3">
          <p className="text-[12px] text-[#9B7B2D] leading-snug">
            <span className="font-semibold">O seletor de arquivos ainda não está liberado.</span> Avise a
            agência — não é um problema da sua conta.
          </p>
        </div>
      )}
    </div>
  );
}
