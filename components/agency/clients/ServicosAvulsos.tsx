"use client";

// SERVIÇOS AVULSOS — o caminho curto (raio-x de 03/10, aplicado em 04/10/2026).
// Pedido → entregue → cobrado → fechado, um botão por passo, na aba
// "Projetos e entregas" do cliente. A cobrança é registrada, não disparada:
// nada é cobrado automaticamente.

import { useCallback, useEffect, useState } from "react";

interface Servico {
  id: string;
  titulo: string;
  descricao: string | null;
  valorCentavos: number;
  estado: "pedido" | "entregue" | "cobrado" | "fechado";
  createdAt: string;
}

const PASSO: Record<Servico["estado"], { acao: "entregar" | "cobrar" | "fechar"; rotulo: string } | null> = {
  pedido: { acao: "entregar", rotulo: "Marcar entregue" },
  entregue: { acao: "cobrar", rotulo: "Registrar cobrança" },
  cobrado: { acao: "fechar", rotulo: "Recebido — fechar" },
  fechado: null,
};

const ROTULO_DO_ESTADO: Record<Servico["estado"], string> = {
  pedido: "Pedido",
  entregue: "Entregue",
  cobrado: "Cobrado",
  fechado: "Fechado",
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ServicosAvulsos({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [lista, setLista] = useState<Servico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const ler = useCallback(() => {
    fetch(`/api/agency/clients/${clientId}/avulsos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { servicos: Servico[] }) => setLista(d.servicos))
      .catch(() => setErro("Não deu para ler os serviços avulsos agora."));
  }, [clientId]);
  useEffect(() => { ler(); }, [ler]);

  async function criar() {
    setOcupado("novo");
    setErro(null);
    const r = await fetch(`/api/agency/clients/${clientId}/avulsos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, valor }),
    }).catch(() => null);
    setOcupado(null);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      setErro(j?.error ?? "Não deu para registrar o pedido.");
      return;
    }
    setTitulo(""); setValor(""); setAbrindo(false);
    ler();
  }

  async function avancar(s: Servico) {
    const passo = PASSO[s.estado];
    if (!passo) return;
    setOcupado(s.id);
    setErro(null);
    const r = await fetch(`/api/agency/avulsos/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: passo.acao }),
    }).catch(() => null);
    setOcupado(null);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      setErro(j?.error ?? "Não deu para avançar agora.");
      return;
    }
    ler();
  }

  return (
    <section id="servicos-avulsos" className="rounded-[12px] border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Serviços avulsos</h2>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Pedido, entrega, cobrança única e fecha — sem projeto. Nada é cobrado automaticamente.
          </p>
        </div>
        {podeEditar && !abrindo && (
          <button type="button" onClick={() => setAbrindo(true)} style={{ touchAction: "manipulation" }}
            className="h-11 px-4 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-semibold">
            Novo pedido
          </button>
        )}
      </div>

      {abrindo && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que é (ex.: logo do delivery)"
            className="h-11 px-3 text-[13px] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--navy)]" />
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" inputMode="decimal"
            className="h-11 px-3 text-[13px] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--navy)]" />
          <div className="flex gap-2">
            <button type="button" onClick={() => void criar()} disabled={ocupado === "novo"}
              className="h-11 px-4 rounded-[8px] bg-[var(--navy)] text-white text-[13px] font-semibold disabled:opacity-60 flex-1">
              {ocupado === "novo" ? "Salvando…" : "Registrar"}
            </button>
            <button type="button" onClick={() => setAbrindo(false)}
              className="h-11 px-4 rounded-[8px] border border-[var(--border)] text-[13px] text-[var(--text-secondary)]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-3 text-[12px] text-[var(--danger)]">{erro}</p>}
      {!lista && !erro && <p className="mt-3 text-[12px] text-[var(--text-muted)]">Lendo…</p>}
      {lista && lista.length === 0 && (
        <p className="mt-3 text-[12px] text-[var(--text-secondary)]">Nenhum serviço avulso para este cliente.</p>
      )}
      {lista && lista.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lista.map((s) => {
            const passo = PASSO[s.estado];
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--bg)] px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <span className="block text-[13px] font-medium text-[var(--text-primary)]">{s.titulo}</span>
                  <span className="block text-[12px] text-[var(--text-secondary)]">
                    {reais(s.valorCentavos)} · {ROTULO_DO_ESTADO[s.estado]}
                  </span>
                </span>
                {podeEditar && passo && (
                  <button type="button" onClick={() => void avancar(s)} disabled={ocupado === s.id}
                    style={{ touchAction: "manipulation" }}
                    className="h-11 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)] disabled:opacity-60">
                    {ocupado === s.id ? "Salvando…" : passo.rotulo}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
