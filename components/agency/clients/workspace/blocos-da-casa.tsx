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
  const { clients, updateClient } = useAgencyStore();
  const client = clients.find((c) => c.id === clientId);
  const [form, setForm] = useState({
    name: client?.name ?? "",
    industry: client?.industry ?? "",
    website: client?.website ?? "",
    status: (client?.status ?? "active") as ClientStatus,
    description: client?.description ?? "",
    centroCustoId: client?.centroCustoId ?? "",
  });

  if (!client) return null;

  return (
    <Modal open={open} onClose={onClose} title="Editar Cliente">
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Nome</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Setor</label>
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="prospect">Prospect</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Site</label>
          <input
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Descrição</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Centro de custo (Control Room)</label>
          <input
            value={form.centroCustoId}
            onChange={(e) => setForm({ ...form, centroCustoId: e.target.value })}
            placeholder="O id que a Control Room deu a este cliente"
            className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            É para onde vai o gasto de IA deste cliente. Vazio: cai no centro de custo da agência.
          </p>
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => { updateClient(clientId, form); onClose(); }}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
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
