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
//    · `BrandHub`            → o Brand Hub de 13 campos, com envio de Brand
//                              Book, análise de texto e fila de sugestões.
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
import { useDbBrandHub } from "@/lib/hooks/useDbBrandHub";
import { useDbActivityEvents } from "@/lib/hooks/useDbActivityEvents";
import { useDbBrandUpdates } from "@/lib/hooks/useDbBrandUpdates";
import Button from "@/components/agency/ui/Button";
import Modal from "@/components/agency/ui/Modal";
import { getRolePermissions, BRAND_FIELD_LABELS } from "@/lib/agency/roles";
import { parseBrandBook, type ParsedBrandField } from "@/lib/agency/brand-parser";
import { ClientStatus, type BrandBrain } from "@/lib/agency/mock-data";

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

const EMPTY_BRAIN: BrandBrain = {
  businessSummary: "", positioning: "", targetAudience: "", toneOfVoice: "",
  visualStyle: "", brandRules: "", productsToHighlight: "", thingsToAvoid: "",
  preferredChannels: "", strategicNotes: "",
  colors: "", fonts: "", references: "",
};

const BRAIN_FIELDS: { key: keyof BrandBrain; label: string; placeholder: string; internal?: boolean }[] = [
  { key: "businessSummary",     label: "Resumo do Negócio",       placeholder: "O que o negócio é, o que vende, por que existe" },
  { key: "positioning",         label: "Posicionamento",          placeholder: "Posição no mercado e proposta de valor única" },
  { key: "targetAudience",      label: "Público-Alvo",            placeholder: "Com quem a marca está falando" },
  { key: "toneOfVoice",         label: "Tom de Voz",              placeholder: "Como a marca se comunica" },
  { key: "visualStyle",         label: "Estilo Visual",           placeholder: "Direção visual, estética e referências de design" },
  { key: "colors",              label: "Cores da Marca",          placeholder: "Paleta de cores com códigos hex — ex.: Preto #111111, Laranja #E85D04" },
  { key: "fonts",               label: "Tipografia",              placeholder: "Fontes para títulos, corpo e dados — ex.: Inter Bold (títulos)" },
  { key: "references",          label: "Referências e Assets",    placeholder: "Referências visuais, localização de arquivos, links de brand book" },
  { key: "brandRules",          label: "Regras de Marca",         placeholder: "Inegociáveis — sempre seguir" },
  { key: "productsToHighlight", label: "Produtos em Destaque",    placeholder: "Produtos / serviços principais para destacar no conteúdo" },
  { key: "thingsToAvoid",       label: "O que Evitar",            placeholder: "Palavras, tons, referências para nunca usar" },
  { key: "preferredChannels",   label: "Canais Preferenciais",    placeholder: "Canais com melhor desempenho para esta marca" },
  { key: "strategicNotes",      label: "Notas Estratégicas",      placeholder: "Contexto interno da agência, histórico, ressalvas", internal: true },
];

// ─── Brand Hub ──────────────────────────────────────────────────────────────

export function BrandHub({ clientId }: { clientId: string }) {
  const { clients, currentRole } = useAgencyStore();
  const client = clients.find((c) => c.id === clientId);
  const { brandBrain: dbBrandBrain, update: updateBrandBrainDb } = useDbBrandHub(clientId);
  const {
    brandUpdates, add: addBrandUpdate, apply: applyBrandUpdate,
    applyAllPending: applyAllPendingBrandUpdates, dismiss: dismissBrandUpdate,
  } = useDbBrandUpdates({ clientId });

  const [brainEditing, setBrainEditing] = useState(false);
  const [brainDraft, setBrainDraft] = useState<BrandBrain | null>(null);
  const [brainSaved, setBrainSaved] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [parserOpen, setParserOpen] = useState(false);
  const [parserText, setParserText] = useState("");
  const [parserResults, setParserResults] = useState<ParsedBrandField[]>([]);
  const [parserQueued, setParserQueued] = useState(false);

  const perms = getRolePermissions(currentRole);
  const clientBrandUpdates = brandUpdates.filter((u) => u.clientId === clientId);
  const activeBrainDraft: BrandBrain = brainDraft ?? dbBrandBrain ?? client?.brandBrain ?? EMPTY_BRAIN;
  const preenchidos = BRAIN_FIELDS.filter(({ key }) => ((client?.brandBrain?.[key] ?? "") as string).trim()).length;

  const handleSaveBrain = async () => {
    await updateBrandBrainDb(clientId, activeBrainDraft);
    setBrainEditing(false);
    setBrainSaved(true);
    setTimeout(() => setBrainSaved(false), 3000);
  };

  const handleBrandBookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addBrandUpdate({
      clientId, field: "brand_book", suggestedValue: file.name,
      source: "upload", status: "pending", fileName: file.name,
      note: "Brand Book enviado para análise.",
    });
    setUploadMsg(`"${file.name}" recebido. Análise automática de Brand Book será adicionada na próxima etapa.`);
    setTimeout(() => setUploadMsg(null), 5000);
    e.target.value = "";
  };

  const handleParserFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setParserText((ev.target?.result as string) ?? ""); setParserResults([]); setParserQueued(false); };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleParse = () => {
    setParserResults(parseBrandBook(parserText));
    setParserQueued(false);
  };

  const handleQueueAll = () => {
    const brain = client?.brandBrain as Record<string, string> | undefined;
    for (const r of parserResults) {
      addBrandUpdate({
        clientId, field: r.field, suggestedValue: r.value,
        currentValue: brain?.[r.field] ?? "",
        source: "parsed", status: "pending",
        note: "Extraído automaticamente do Brand Book",
      });
    }
    setParserQueued(true);
  };

  const handleQueueOne = (r: ParsedBrandField) => {
    const brain = client?.brandBrain as Record<string, string> | undefined;
    addBrandUpdate({
      clientId, field: r.field, suggestedValue: r.value,
      currentValue: brain?.[r.field] ?? "",
      source: "parsed", status: "pending",
      note: "Extraído automaticamente do Brand Book",
    });
    setParserResults((prev) => prev.filter((x) => x.field !== r.field));
  };

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Brand Hub</h2>
          {/* A régua é sobre 13 campos e ela CONTA o que está preenchido —
              antes vinha de `agentCtx.brandBrainReadiness`, que media outra
              coisa e mostrava um denominador que ninguém sabia explicar. */}
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            preenchidos >= 12 ? "bg-[var(--success-bg)] text-[var(--success)]"
            : preenchidos >= 7 ? "bg-[var(--warning-bg)] text-[var(--warning)]"
            : "bg-[var(--accent)] text-[var(--text-muted)]"
          }`}>
            {preenchidos}/{BRAIN_FIELDS.length}
          </span>
          {brainSaved && <span className="text-[11px] text-[var(--success)] font-medium">✓ Salvo</span>}
          {clientBrandUpdates.filter((u) => u.status === "pending").length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">
              {clientBrandUpdates.filter((u) => u.status === "pending").length} pendente(s)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".pdf,.zip,.ai,.sketch,.fig,.png,.jpg" className="hidden" onChange={handleBrandBookUpload} />
            <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors cursor-pointer">
              ↑ Enviar Brand Book
            </span>
          </label>
          {perms.canEditBrandHub && (
            brainEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setBrainDraft(null); setBrainEditing(false); }}>Cancelar</Button>
                <Button variant="primary" size="sm" onClick={handleSaveBrain}>Salvar</Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => { setBrainDraft(client?.brandBrain ?? EMPTY_BRAIN); setBrainEditing(true); }}>Editar</Button>
            )
          )}
        </div>
      </div>

      {uploadMsg && (
        <div className="px-5 py-3 bg-[var(--success-bg)] border-b border-[var(--success-bg)] text-[12px] text-[var(--success)] font-medium">
          ✓ {uploadMsg}
        </div>
      )}

      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        {!parserOpen ? (
          <button onClick={() => setParserOpen(true)} className="text-[12px] font-medium text-[var(--navy)] hover:underline">
            ✦ Analisar Brand Book (texto)
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">Analisar Brand Book</span>
              <button
                onClick={() => { setParserOpen(false); setParserText(""); setParserResults([]); setParserQueued(false); }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                Fechar
              </button>
            </div>
            <textarea
              value={parserText}
              onChange={(e) => { setParserText(e.target.value); setParserResults([]); setParserQueued(false); }}
              placeholder="Cole o texto do Brand Book aqui..."
              rows={5}
              className="w-full px-3 py-2 text-[12px] bg-white border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] resize-y"
            />
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input type="file" accept=".txt" className="hidden" onChange={handleParserFileLoad} />
                <span className="inline-flex items-center h-7 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors cursor-pointer">
                  Carregar .txt
                </span>
              </label>
              <button
                onClick={handleParse}
                disabled={!parserText.trim()}
                className="h-7 px-3 rounded-[6px] bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-40 text-white text-[11px] font-medium transition-colors"
              >
                Analisar Brand Book
              </button>
            </div>

            {parserText.trim() && parserResults.length === 0 && !parserQueued && (
              <p className="text-[12px] text-[var(--text-muted)]">
                Clique em &ldquo;Analisar Brand Book&rdquo; para extrair informações do texto colado.
              </p>
            )}

            {parserResults.length > 0 && (
              <div className="border border-[var(--border)] rounded-[8px] overflow-hidden">
                <div className="px-3 py-2.5 bg-[var(--accent)] flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    {parserQueued ? `✓ ${parserResults.length} sugestões criadas` : `${parserResults.length} sugestões encontradas`}
                  </span>
                  {!parserQueued && (
                    <button onClick={handleQueueAll} className="h-6 px-2.5 rounded-[5px] bg-[var(--text-primary)] text-white text-[10px] font-medium">
                      Aplicar ao Brand Hub ({parserResults.length})
                    </button>
                  )}
                </div>
                {!parserQueued ? (
                  <div className="divide-y divide-[var(--border)] max-h-[280px] overflow-y-auto">
                    {parserResults.map((r) => (
                      <div key={r.field} className="px-3 py-2.5 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] mb-0.5">
                            {BRAND_FIELD_LABELS[r.field] ?? r.field}
                          </div>
                          <p className="text-[12px] text-[var(--text-primary)] leading-relaxed line-clamp-2">{r.value}</p>
                        </div>
                        <button
                          onClick={() => handleQueueOne(r)}
                          className="shrink-0 h-6 px-2 rounded-[5px] border border-[var(--border)] text-[10px] text-[var(--text-secondary)] hover:bg-[var(--accent)] transition-colors"
                        >
                          + Criar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-[12px] text-[var(--success)]">
                    Revise as sugestões em Atualizações Pendentes abaixo.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="divide-y divide-[var(--border)]">
        {BRAIN_FIELDS.map(({ key, label, placeholder, internal }) => {
          const value = (client?.brandBrain?.[key] ?? "") as string;
          const draftValue = (activeBrainDraft[key] ?? "") as string;
          if (internal && !perms.canViewStrategicNotes) return null;
          return (
            <div key={key} className="px-5 py-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">{label}</div>
                {internal && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded-[3px] bg-[var(--accent)] text-[var(--text-muted)]">Interno</span>
                )}
              </div>
              {brainEditing && perms.canEditBrandHub ? (
                <textarea
                  value={draftValue}
                  onChange={(e) => setBrainDraft({ ...activeBrainDraft, [key]: e.target.value })}
                  placeholder={placeholder}
                  rows={2}
                  className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
                />
              ) : value ? (
                <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{value}</p>
              ) : (
                <p className="text-[12px] text-[var(--text-subtle)] italic">{placeholder}</p>
              )}
            </div>
          );
        })}
      </div>

      {clientBrandUpdates.length > 0 && (
        <div className="border-t border-[var(--border)]">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Atualizações Pendentes</div>
            <div className="flex items-center gap-2">
              {perms.canApplyBrandUpdate && clientBrandUpdates.filter((u) => u.status === "pending" && u.field !== "brand_book" && u.field !== "general").length > 1 && (
                <button
                  onClick={() => applyAllPendingBrandUpdates(clientId)}
                  className="h-6 px-2.5 rounded-[5px] text-[10px] font-medium bg-[var(--text-primary)] text-white"
                >
                  Aplicar tudo
                </button>
              )}
              <span className="text-[10px] text-[var(--text-muted)]">
                {clientBrandUpdates.filter((u) => u.status === "pending").length} aguardando revisão
              </span>
            </div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {clientBrandUpdates.slice(0, 8).map((upd) => {
              const srcLabel = upd.source === "client" ? "Portal do cliente" : upd.source === "upload" ? "Upload" : upd.source === "parsed" ? "Análise Automática" : "Manual";
              const srcColor = upd.source === "client" ? "bg-[var(--accent-light)] text-[var(--navy)]" : upd.source === "upload" ? "bg-[var(--warning-bg)] text-[var(--warning)]" : upd.source === "parsed" ? "bg-[#F0FDF4] text-[var(--success)]" : "bg-[var(--accent)] text-[var(--text-secondary)]";
              const statusColor = upd.status === "applied" ? "text-[var(--success)]" : upd.status === "reviewed" ? "text-[var(--navy)]" : "text-[var(--warning)]";
              return (
                <div key={upd.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">{BRAND_FIELD_LABELS[upd.field] ?? upd.field}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] ${srcColor}`}>{srcLabel}</span>
                      {upd.fileName && <span className="text-[11px] text-[var(--text-muted)]">{upd.fileName}</span>}
                    </div>
                    <span className={`text-[11px] font-semibold shrink-0 ${statusColor}`}>
                      {upd.status === "applied" ? "Aplicado" : upd.status === "reviewed" ? "Revisado" : "Pendente"}
                    </span>
                  </div>
                  {upd.source !== "upload" && (
                    <p className="text-[12px] text-[var(--text-secondary)] mb-2 leading-relaxed">{upd.suggestedValue}</p>
                  )}
                  {upd.status === "pending" && perms.canApplyBrandUpdate && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => applyBrandUpdate(upd.id)} className="h-6 px-2.5 rounded-[5px] text-[11px] font-medium bg-[var(--text-primary)] text-white">
                        Aplicar ao Brand Hub
                      </button>
                      <button onClick={() => dismissBrandUpdate(upd.id)} className="h-6 px-2.5 rounded-[5px] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]">
                        Ignorar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
