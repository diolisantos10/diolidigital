"use client";

// PedirConteudo — o cliente pede uma peça nova.
//
// ── Por que esta tela existe ────────────────────────────────────────────────
// A esteira inteira era agência → cliente. Nenhum modelo tinha o cliente como
// origem: quem quisesse pedir conteúdo escrevia no chat — que ninguém lia. O
// CEO tentou pedir conteúdo pelo portal e não achou onde.
//
// ── O desenho: curto de propósito ───────────────────────────────────────────
// Três campos e um deles é opcional. O cliente do salão não preenche
// formulário: se a tela pedir briefing, ele desiste e manda áudio no WhatsApp.
//   1. O que você quer      (obrigatório)
//   2. Para quê             (obrigatório, com atalhos de um toque)
//   3. Para quando          (opcional — obrigar a chutar data cria prazo falso)
// Anexo é opcional e reusa o envio de material que o portal já tem.
//
// ── Vazio é vazio ──────────────────────────────────────────────────────────
// Pedido sem descrição não vira tarefa muda: o servidor devolve a PERGUNTA que
// falta e ela aparece aqui, no campo certo, em vez de um "erro" genérico.

import { useCallback, useEffect, useState } from "react";
import { EnvioDeMaterial } from "./EnvioDeMaterial";

interface PedidoDoCliente {
  id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  para: string | null;
  status: string;
  statusLegivel: string;
  motivo: string | null;
  criadoEm: string;
}

/** Atalhos de objetivo — um toque em vez de uma redação. O texto que vai para
 *  o especialista continua sendo uma frase legível, não um código. */
const OBJETIVOS = [
  "Vender mais",
  "Divulgar uma novidade",
  "Data comemorativa",
  "Aparecer mais nas redes",
];

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function PedirConteudo({ token }: { token: string }) {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";

  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [para, setPara] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [pergunta, setPergunta] = useState<{ campo: string; texto: string } | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDoCliente[]>([]);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/pedidos${q}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setPedidos(Array.isArray(j.pedidos) ? j.pedidos : []);
    } catch { /* a tela de pedir continua funcionando sem a lista */ }
  }, [q]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setPergunta(null);
    try {
      const res = await fetch("/api/portal/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), descricao, objetivo, para, anexos }),
      });
      const j = await res.json().catch(() => ({} as Record<string, string>));
      if (res.status === 422 && j.pergunta) {
        // O sistema PERGUNTA — não devolve "campo obrigatório". E leva o
        // cliente até a pergunta: num formulário rolado, resposta que ele não
        // vê é o mesmo que erro silencioso.
        const campo = j.campo ?? "descricao";
        setPergunta({ campo, texto: j.pergunta });
        requestAnimationFrame(() => {
          const alvo = document.getElementById(`pedido-${campo}`);
          alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
          (alvo as HTMLElement | null)?.focus?.();
        });
        return;
      }
      if (!res.ok) {
        setPergunta({ campo: "geral", texto: j.error ?? "Não consegui registrar agora. Tente de novo." });
        return;
      }
      setRecado(j.recado ?? "Recebemos. A equipe avalia e te responde por aqui.");
      setDescricao(""); setObjetivo(""); setPara(""); setAnexos([]);
      setAberto(false);
      void carregar();
    } catch {
      setPergunta({ campo: "geral", texto: "A conexão caiu. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Pedir conteúdo novo</h3>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-snug">
            Quer uma peça fora do que já está no plano? Peça aqui — a equipe recebe e te responde.
          </p>
        </div>
        {!aberto && (
          <button
            onClick={() => { setAberto(true); setRecado(null); }}
            style={{ touchAction: "manipulation" }}
            className="shrink-0 h-9 px-4 rounded-[10px] bg-[#12B5AC] hover:bg-[#0E9E96] text-white text-[12.5px] font-semibold transition-colors"
          >
            Fazer um pedido
          </button>
        )}
      </div>

      {recado && !aberto && (
        <p className="mt-3 rounded-[10px] bg-[#ECFDF5] px-3.5 py-2.5 text-[12.5px] text-[#047857]">✓ {recado}</p>
      )}

      {aberto && (
        <div className="mt-4 space-y-4">
          {/* 1 · O que */}
          <div>
            <label htmlFor="pedido-descricao" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              O que você quer?
            </label>
            <textarea
              id="pedido-descricao"
              value={descricao}
              onChange={(e) => { setDescricao(e.target.value); if (pergunta?.campo === "descricao") setPergunta(null); }}
              rows={3}
              placeholder="Ex.: um reels mostrando o corte degradê que a gente faz"
              className={`mt-1.5 w-full px-3 py-2.5 bg-[var(--bg)] border rounded-[10px] outline-none focus:bg-white transition-all resize-none leading-relaxed ${
                pergunta?.campo === "descricao" ? "border-[#F59E0B]" : "border-[var(--border)] focus:border-[var(--text-primary)]"
              }`}
              style={{ fontSize: "16px" }}
            />
            {pergunta?.campo === "descricao" && (
              <p className="mt-1 text-[12px] text-[#9B7B2D]">{pergunta.texto}</p>
            )}
          </div>

          {/* 2 · Para quê */}
          <div>
            <label htmlFor="pedido-objetivo" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              Para quê?
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OBJETIVOS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setObjetivo(o); if (pergunta?.campo === "objetivo") setPergunta(null); }}
                  style={{ touchAction: "manipulation" }}
                  className={`h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                    objetivo === o ? "bg-[#070A1F] text-white" : "bg-[#F0EFEB] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            <input
              id="pedido-objetivo"
              value={objetivo}
              onChange={(e) => { setObjetivo(e.target.value); if (pergunta?.campo === "objetivo") setPergunta(null); }}
              placeholder="ou escreva com suas palavras"
              className={`mt-2 w-full px-3 py-2.5 bg-[var(--bg)] border rounded-[10px] outline-none focus:bg-white transition-all ${
                pergunta?.campo === "objetivo" ? "border-[#F59E0B]" : "border-[var(--border)] focus:border-[var(--text-primary)]"
              }`}
              style={{ fontSize: "16px" }}
            />
            {pergunta?.campo === "objetivo" && (
              <p className="mt-1 text-[12px] text-[#9B7B2D]">{pergunta.texto}</p>
            )}
          </div>

          {/* 3 · Para quando (opcional) */}
          <div>
            <label htmlFor="pedido-para" className="block text-[12.5px] font-semibold text-[var(--text-primary)]">
              Para quando? <span className="font-normal text-[var(--text-muted)]">(se tiver uma data)</span>
            </label>
            <input
              id="pedido-para"
              type="date"
              value={para}
              onChange={(e) => setPara(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all"
              style={{ fontSize: "16px" }}
            />
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
              Sem data também vale — a equipe combina o prazo com você.
            </p>
          </div>

          {/* Anexo opcional — reusa o envio que o portal já tem */}
          <details className="rounded-[10px] border border-[var(--border)]">
            <summary className="cursor-pointer px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
              Quer mandar uma foto ou vídeo junto? {anexos.length > 0 && `(${anexos.length})`}
            </summary>
            <div className="px-3 pb-3">
              <EnvioDeMaterial token={token} aoEnviar={(a) => setAnexos((atual) => [...atual, a.url])} />
            </div>
          </details>

          {pergunta?.campo === "geral" && (
            <p className="rounded-[10px] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#B91C1C]">{pergunta.texto}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={enviar}
              disabled={enviando}
              style={{ touchAction: "manipulation" }}
              className="h-10 px-5 rounded-[10px] bg-[#12B5AC] hover:bg-[#0E9E96] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
            >
              {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
            <button
              onClick={() => { setAberto(false); setPergunta(null); }}
              className="h-10 px-3 text-[13px] text-[var(--text-muted)]"
              style={{ touchAction: "manipulation" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pedidos.length > 0 && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-2">
            Seus pedidos
          </h4>
          <ul className="space-y-2">
            {pedidos.map((p) => (
              <li key={p.id} className="rounded-[10px] bg-[var(--bg-elevated)] px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-[var(--text-primary)] leading-snug">{p.titulo}</p>
                  <span className={`shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold flex items-center ${
                    p.status === "triado" ? "bg-[#DCFCE7] text-[#16A34A]"
                    : p.status === "recusado" ? "bg-[#F3F4F6] text-[#6B7280]"
                    : "bg-[#FEF3C7] text-[#9B7B2D]"
                  }`}>
                    {p.statusLegivel}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-muted)] mt-1">
                  Pedido em {dataCurta(p.criadoEm)}{p.para ? ` · para ${dataCurta(p.para)}` : ""}
                </p>
                {p.motivo && <p className="text-[12px] text-[var(--text-secondary)] mt-1">{p.motivo}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
