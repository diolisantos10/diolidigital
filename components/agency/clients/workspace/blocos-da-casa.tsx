"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  OS BLOCOS QUE JÁ EXISTIAM NA PÁGINA DO CLIENTE — preservados inteiros.
//
//  Este arquivo é a metade menos glamourosa do porte e a mais importante: ele
//  guarda o que a página anterior (`app/agency/clients/[id]/page.tsx`, 1.126
//  linhas, em produção com cliente real) fazia e que o layout novo não podia
//  perder. Cada bloco aqui saiu de lá com o MESMO comportamento e as MESMAS
//  chamadas de API — só mudou de arquivo e de aba.
//
//    · (o `BrandHub` saiu em 04/10/2026: virou a ficha única,
//       `components/agency/clients/FichaUnicaDeMarca.tsx`, que lê e grava
//       todos os campos e herdou a fila de sugestões pendentes.)
//    · `AtividadeDoCliente`  → a linha do tempo (`useDbActivityEvents`).
//    · `EditarClienteModal`  → o formulário de edição do cadastro.
//    · `LinkDoPortalModal`   → o gerador do link seguro do portal.
//
//  ⚠️ ELES NÃO USAM A FOLHA `dioli.css`. São Tailwind, como o resto deste
//  sistema, e por isso vivem dentro de `.ccNativo` — um contêiner que existe
//  só para deixar claro, ao ler o DOM, onde acaba a referência portada e onde
//  começa a casa. Misturar as duas linguagens sem marca é como o drift começa.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useAgencyStore } from "@/store/agency-store";
import { useDbActivityEvents } from "@/lib/hooks/useDbActivityEvents";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import { ClientStatus } from "@/lib/agency/mock-data";

const ACTIVITY_ICONS: Record<string, string> = {
  project_created: "◆",
  project_stage_changed: "→",
  task_updated: "✓",
  deliverable_updated: "◎",
  client_created: "★",
  briefing_created: "◈",
  orchestrator_approved: "⚡",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ─── Atividade ──────────────────────────────────────────────────────────────

export function AtividadeDoCliente({ clientId }: { clientId: string }) {
  const { events } = useDbActivityEvents({ clientId, limit: 10 });
  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Atividade</h2>
      </div>
      {events.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--text-muted)]">Nenhuma atividade registrada ainda.</div>
      ) : (
        <div className="px-5 py-4">
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-[var(--accent)]" />
            <div className="space-y-4">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 relative">
                  <div className="w-[15px] h-[15px] rounded-full bg-[var(--accent-light)] border-2 border-[var(--navy)] shrink-0 mt-0.5 z-10 flex items-center justify-center">
                    <span className="text-[7px] text-[var(--navy)]">{ACTIVITY_ICONS[event.type] ?? "·"}</span>
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="text-[13px] text-[var(--text-primary)] leading-snug">{event.message}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{timeAgo(event.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editar cliente ─────────────────────────────────────────────────────────

export function EditarClienteModal({
  clientId, open, onClose,
}: {
  clientId: string;
  open: boolean;
  onClose: () => void;
}) {
  // Do BANCO (04/10/2026): lia a cópia do navegador e, com ela vazia, o
  // modal simplesmente não abria. Agora lê GET /api/clients/[id] e grava PUT.
  const { updateClient } = useAgencyStore();
  const [form, setForm] = useState<FormDoCadastro | null>(null);
  const [faixa, setFaixa] = useState<"normal" | "parceiro">("normal");
  const [equipe, setEquipe] = useState<{ id: string; name: string; role: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch(`/api/clients/${clientId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agency/equipe", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([c, e]) => {
      if (!c) { setErro("Não deu para ler o cadastro agora."); return; }
      setErro(null);
      setForm({
        name: c.name ?? "", industry: c.industry ?? "", website: c.website ?? "",
        status: (c.status ?? "active") as ClientStatus, description: c.descricao ?? "",
        centroCustoId: c.centroCustoId ?? "", tipo: c.tipo ?? "cliente",
        responsavelUserId: c.responsavelUserId ?? "", meta: c.meta ?? "",
      });
      setFaixa(c.faixaDePreco === "parceiro" ? "parceiro" : "normal");
      setEquipe(Array.isArray(e?.equipe) ? e.equipe : []);
    }).catch(() => setErro("Não deu para ler o cadastro agora."));
  }, [open, clientId]);

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    const r = await fetch(`/api/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, responsavelUserId: form.responsavelUserId || null, meta: form.meta || null }),
    }).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      setErro(j?.error ?? "Não deu para salvar agora.");
      return;
    }
    // Mantém a cópia antiga em dia para as telas que ainda a leem.
    updateClient(clientId, { name: form.name, industry: form.industry, website: form.website, status: form.status, description: form.description });
    onClose();
    window.location.reload();
  }

  const campo = "w-full h-11 sm:h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white";
  const rotulo = "block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5";

  return (
    <Modal open={open} onClose={onClose} title="Editar Cliente">
      {!form ? (
        <p className="text-[12px] text-[var(--text-secondary)]">{erro ?? "Lendo o cadastro…"}</p>
      ) : (
      <div className="space-y-4">
        <div>
          <label className={rotulo}>Nome</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={campo} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={rotulo}>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={campo}>
              <option value="cliente">Cliente</option>
              <option value="projeto_interno">Projeto interno</option>
            </select>
          </div>
          <div>
            <label className={rotulo}>Faixa de preço</label>
            <div className="h-11 sm:h-8 px-3 flex items-center text-[13px] rounded-[7px] border border-[var(--border)] bg-[var(--bg)]">
              {faixa === "parceiro" ? "Parceiro" : "Normal"}
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Vem da parceria registrada; não se escolhe aqui.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={rotulo}>Responsável pela conta</label>
            <select value={form.responsavelUserId} onChange={(e) => setForm({ ...form, responsavelUserId: e.target.value })} className={campo}>
              <option value="">Sem responsável</option>
              {equipe.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })} className={campo}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="prospect">Prospect</option>
            </select>
          </div>
        </div>
        <div>
          <label className={rotulo}>Meta da conta</label>
          <input value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} placeholder="Ex.: 20 pedidos pelo Instagram por mês" className={campo} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={rotulo}>Setor</label>
            <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Site</label>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={campo} />
          </div>
        </div>
        <div>
          <label className={rotulo}>Descrição</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
            className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none" />
        </div>
        <div>
          <label className={rotulo}>Centro de custo (Control Room)</label>
          <input value={form.centroCustoId} onChange={(e) => setForm({ ...form, centroCustoId: e.target.value })}
            placeholder="O id que a Control Room deu a este cliente" className={campo} />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            É para onde vai o gasto de IA deste cliente. Vazio: cai no centro de custo da agência.
          </p>
        </div>
        {erro && <p className="text-[12px] text-[var(--danger)]">{erro}</p>}
        <div className="flex justify-end gap-2.5 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </div>
      )}
    </Modal>
  );
}

interface FormDoCadastro {
  name: string; industry: string; website: string; status: ClientStatus; description: string;
  centroCustoId: string; tipo: string; responsavelUserId: string; meta: string;
}

// ─── Link do portal ─────────────────────────────────────────────────────────
//
// O link seguro por token (`PortalAccess`), que substituiu o `/portal/client/[id]`
// legado — aquele era desprotegido e servido pelo store. Portado tal e qual.

export function LinkDoPortalModal({
  clientId, clientName, open, onClose,
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setGerando(true);
    setErro(null);
    setCopiado(false);
    try {
      const res = await fetch("/api/brain/portal-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `Falha HTTP ${res.status}`);
      }
      const j = await res.json();
      setLink(`${window.location.origin}${j.url}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar link.");
    } finally {
      setGerando(false);
    }
  }

  // O link nasce quando o modal abre — não durante a renderização. Chamar
  // `fetch` no corpo do componente dispara uma vez por render e, em modo
  // estrito, duas de saída: viraria token novo a cada repintura.
  useEffect(() => {
    if (open && !link && !gerando && !erro) void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Link do portal do cliente">
      <div className="space-y-4">
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          Link seguro de uso único por cliente — validade de 30 dias, revogável.
          Compartilhe apenas com {clientName}.
        </p>
        {gerando && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--navy)] border-t-transparent animate-spin" />
            Gerando link…
          </div>
        )}
        {erro && (
          <div className="space-y-2">
            <p className="text-[12px] text-[var(--danger)]">{erro}</p>
            <Button variant="secondary" onClick={() => void gerar()}>Tentar de novo</Button>
          </div>
        )}
        {link && !gerando && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-3 py-2 text-[12px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none font-mono"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => {
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  });
                }}
              >
                {copiado ? "Copiado ✓" : "Copiar"}
              </Button>
            </div>
            <Button variant="ghost" onClick={() => void gerar()}>Gerar novo link</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
