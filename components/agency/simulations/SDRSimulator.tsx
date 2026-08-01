"use client";

import { useState, useRef, useEffect } from "react";
import type { ConvMessage, BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import type { ProspectConvState } from "@/lib/agency/prospect-engine";
import {
  canSubmitProposal, getSubmissionBlockReason, buildHandoffSummary,
  type SDRHandoff, type SDRAgentState,
} from "@/lib/agency/sdr-agent";
import { detectPackage, getPackageDef, SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";

// ── Presets ────────────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  tag: string;
  firstMessage: string;
  scenario?: string[];
}

const PRESETS: Preset[] = [
  {
    id: "restaurante",
    label: "Restaurante Japonês",
    tag: "Restaurante · Objeção de preço",
    firstMessage:
      "Me chamo Marina e tenho um restaurante japonês. Quero social media para Instagram e Facebook para ganhar novos clientes e vender mais. Tenho Brand Book.",
    scenario: [
      "Me chamo Marina e tenho um restaurante japonês. Quero social media para Instagram e Facebook para ganhar novos clientes e vender mais. Tenho Brand Book.",
      "marina@restaurante.com.br",
      "(11) 98765-4321",
      "Mensal",
      "3 posts por semana",
      "Sim, 3 stories por semana também",
      "2 reels por mês",
      "Temos fotos dos pratos",
      "A Dioli faz os textos",
      "Não quero tráfego pago agora",
      "Esse valor está muito acima. Tenho R$ 1.000 para gestão.",
      "Então pode reduzir para o Plano Starter",
    ],
  },
  {
    id: "manicure",
    label: "Estúdio de Manicure",
    tag: "Beleza · Entrada simples",
    firstMessage:
      "Me chamo Ana e tenho um estúdio de manicure e pedicure. Quero posts para Instagram para atrair clientes no bairro.",
  },
  {
    id: "saas",
    label: "Software B2B",
    tag: "Tech · Social + Identidade Visual",
    firstMessage:
      "Me chamo Rafael e tenho um software de gestão para pequenas empresas. Preciso de social media e identidade visual para captar leads B2B.",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// ── Message renderer ───────────────────────────────────────────────────────────

function MsgText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((para, pi) => (
        <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
          {para.split("\n").map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i}>{part.slice(2, -2)}</strong>
                ) : part
              )}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function MessageBubble({ msg }: { msg: ConvMessage }) {
  if (msg.role === "system") {
    return (
      <div className="text-center">
        <span className="inline-block text-[10px] text-[var(--text-muted)] bg-[var(--bg)] px-3 py-1 rounded-full">
          {msg.text}
        </span>
      </div>
    );
  }
  const isAssistant = msg.role === "assistant";
  return (
    <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-[var(--text-primary)] flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="2.5" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
      )}
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-[12px] text-[13px] leading-relaxed ${
          isAssistant
            ? "bg-[var(--bg)] text-[var(--text-primary)] rounded-tl-[4px]"
            : "bg-[var(--text-primary)] text-white rounded-tr-[4px]"
        }`}
      >
        <MsgText text={msg.text} />
      </div>
    </div>
  );
}

// ── Cart panel (scope + estimate) ─────────────────────────────────────────────

const PKG_STYLE: Record<string, { bg: string; text: string }> = {
  starter: { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]" },
  growth:  { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
  pro:     { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
};

function CartPanel({
  scope,
  estimate,
  sdr,
  canSubmit,
  blockReason,
  onSubmit,
  onSendAction,
}: {
  scope: BriefingScope;
  estimate: LiveEstimate;
  sdr: SDRAgentState;
  canSubmit: boolean;
  blockReason: string | null;
  onSubmit: () => void;
  onSendAction: (text: string) => void;
}) {
  let pkgId: string | null = null;
  let pkgLabel: string | null = null;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    const ppm = scope.social.postsPerWeek * 4;
    pkgId = detectPackage(ppm);
    pkgLabel = getPackageDef(detectPackage(ppm)).label;
  }

  const rows: { label: string; value: string; dim?: boolean }[] = [];
  if (scope.serviceMode === "monthly") rows.push({ label: "Modalidade", value: "Gestão mensal" });
  if (scope.serviceMode === "one_off") rows.push({ label: "Modalidade", value: "Projeto pontual" });
  if (scope.wantsSocialMedia) {
    rows.push({ label: "Serviço", value: "Social Media" });
    if (scope.social?.platforms.length)
      rows.push({ label: "Canais", value: scope.social.platforms.join(", ") });
    if (scope.social?.postsPerWeek !== undefined)
      rows.push({ label: "Posts", value: `${scope.social.postsPerWeek * 4}/mês` });
    if (scope.social?.storiesPerWeek !== undefined)
      rows.push({ label: "Stories", value: scope.social.storiesPerWeek > 0 ? `${scope.social.storiesPerWeek * 4}/mês` : "Não incluído", dim: scope.social.storiesPerWeek === 0 });
    if (scope.social?.reelsPerMonth !== undefined)
      rows.push({ label: "Reels", value: scope.social.reelsPerMonth > 0 ? `${scope.social.reelsPerMonth}/mês` : "Não incluído", dim: scope.social.reelsPerMonth === 0 });
  }
  if (scope.wantsPaidTraffic) rows.push({ label: "Serviço", value: "Tráfego Pago" });
  if (scope.branding?.requested) rows.push({ label: "Serviço", value: "Identidade Visual" });
  if (scope.branding?.hasBrandBook) rows.push({ label: "Brand Book", value: "Disponível" });

  const QUICK_ACTIONS = [
    { label: "Plano Starter", text: "Quero começar com um plano mais simples e barato", show: scope.wantsSocialMedia && (scope.social?.postsPerWeek ?? 0) * 4 > 8 },
    { label: "Tirar reels",   text: "Pode tirar os reels por enquanto",                 show: scope.wantsSocialMedia && (scope.social?.reelsPerMonth ?? 0) > 0 },
    { label: "Adicionar reels", text: "Quero adicionar 2 reels por mês",                show: scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined && (scope.social?.reelsPerMonth ?? -1) <= 0 },
    { label: "Sem tráfego",   text: "Pode tirar o tráfego pago",                        show: !!scope.wantsPaidTraffic },
    { label: "Menos posts",   text: "Quero reduzir a quantidade de posts",              show: scope.wantsSocialMedia && (scope.social?.postsPerWeek ?? 0) > 2 },
  ].filter((a) => a.show);

  const CONFIDENCE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
    none:   { bg: "", text: "", label: "" },
    low:    { bg: "bg-[var(--warning-bg)]", text: "text-[var(--warning)]", label: "Estimativa inicial" },
    medium: { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]", label: "Estimativa aprox." },
    high:   { bg: "bg-[var(--success-bg)]", text: "text-[var(--success)]", label: "Confiável" },
  };
  const conf = CONFIDENCE_STYLE[estimate.confidence];

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[var(--border)]">
        <div className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.05em]">
          {canSubmit ? "Proposta pronta" : "Proposta em construção"}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Simulada — nenhum dado salvo</p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Package badge */}
        {pkgLabel && pkgId && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Plano</span>
            <span className={`h-5 px-2.5 rounded-full text-[10px] font-semibold ${PKG_STYLE[pkgId]?.bg ?? ""} ${PKG_STYLE[pkgId]?.text ?? ""}`}>
              {pkgLabel}
            </span>
          </div>
        )}

        {/* Scope rows */}
        {rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-[var(--text-muted)] shrink-0 w-[68px]">{r.label}</span>
                <span className={r.dim ? "text-[var(--text-subtle)]" : "text-[var(--text-primary)] font-medium"}>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Estimate */}
        {estimate.totalMin > 0 && (
          <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Estimativa</span>
              {estimate.confidence !== "none" && (
                <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${conf.bg} ${conf.text}`}>
                  {conf.label}
                </span>
              )}
            </div>
            {estimate.items.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-[var(--text-muted)] flex-1">{item.label}</span>
                <span className="text-[var(--text-secondary)] shrink-0">
                  {fmtBRL(item.minPrice)}–{fmtBRL(item.maxPrice)}
                  <span className="text-[var(--text-subtle)]">/{item.unit}</span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)]">
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">Total</span>
              <span className="text-[13px] font-bold text-[var(--text-primary)]">
                {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
              </span>
            </div>
          </div>
        )}

        {/* SDR indicators */}
        {sdr.budgetSignal.fitStatus === "fits" && sdr.budgetSignal.amount && (
          <div className="bg-[var(--success-bg)] border border-[#86EFAC] rounded-[8px] px-3 py-2">
            <p className="text-[10px] font-semibold text-[#166534]">Orçamento confirmado</p>
            <p className="text-[9px] text-[#15803D] mt-0.5">R$ {sdr.budgetSignal.amount.toLocaleString("pt-BR")} — dentro da estimativa.</p>
          </div>
        )}
        {(sdr.budgetSignal.fitStatus === "above_budget" || sdr.budgetSignal.fitStatus === "below_recommended") && (
          <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[8px] px-3 py-2">
            <p className="text-[10px] font-semibold text-[var(--warning)]">Orçamento abaixo da estimativa</p>
            {sdr.budgetSignal.amount && (
              <p className="text-[9px] text-[#92400E] mt-0.5">R$ {sdr.budgetSignal.amount.toLocaleString("pt-BR")} mencionado</p>
            )}
          </div>
        )}
        {sdr.objection.active && (
          <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[8px] px-3 py-2">
            <p className="text-[10px] font-semibold text-[var(--warning)]">Ponto em aberto</p>
            <p className="text-[9px] text-[#92400E] mt-0.5">Continue a conversa para resolver antes de enviar.</p>
          </div>
        )}

        {/* Quick actions */}
        {QUICK_ACTIONS.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1.5">Ajustar escopo</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => onSendAction(qa.text)}
                  className="h-6 px-2.5 rounded-[5px] border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] font-medium transition-colors"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit button */}
        {canSubmit ? (
          <button
            onClick={onSubmit}
            className="w-full h-10 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[12px] font-semibold transition-colors"
          >
            Finalizar simulação →
          </button>
        ) : (
          <button disabled className="w-full h-10 rounded-[8px] bg-[var(--accent)] text-[var(--text-subtle)] text-[12px] cursor-not-allowed">
            {blockReason ?? "Continue a conversa para enviar"}
          </button>
        )}

        {/* Empty plan reference */}
        {!scope.wantsSocialMedia && !scope.wantsPaidTraffic && !scope.branding?.requested && (
          <div className="border-t border-[var(--border)] pt-3">
            <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Planos Social Media</div>
            {SOCIAL_PACKAGES.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between py-0.5 text-[10px]">
                <span className={`font-semibold ${PKG_STYLE[pkg.id]?.text ?? "text-[var(--text-secondary)]"}`}>{pkg.label}</span>
                <span className="text-[var(--text-muted)]">R$ {pkg.minPrice.toLocaleString("pt-BR")}–{pkg.maxPrice.toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Debug panel ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  discovery:          "Descoberta",
  qualification:      "Qualificação",
  pricing:            "Precificação",
  objection_handling: "Tratando objeção",
  scope_adjustment:   "Ajuste de escopo",
  proposal_ready:     "Proposta pronta",
};

function DebugPanel({
  state,
  canSubmit,
  blockReason,
}: {
  state: ProspectConvState;
  canSubmit: boolean;
  blockReason: string | null;
}) {
  const { conv, sdr } = state;
  const scope = conv.scope;
  const estimate = conv.estimate;

  let pkgLabel: string | null = null;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    pkgLabel = getPackageDef(detectPackage(scope.social.postsPerWeek * 4)).label;
  }

  function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
    return (
      <div className="flex items-start gap-2 py-[2px]">
        <span className="text-[var(--text-secondary)] shrink-0 w-[68px]">{label}</span>
        <span className={valueClass ?? "text-[var(--text-muted)]"}>{value}</span>
      </div>
    );
  }

  return (
    <div className="bg-[var(--text-primary)] rounded-[12px] border border-[var(--text-primary)] overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--text-primary)] shrink-0">
        <div className="text-[10px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em]">
          ✦ Debug — Estado do Agente
        </div>
      </div>

      <div className="px-4 py-3 space-y-4 overflow-y-auto flex-1 text-[11px]">

        {/* Phase */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Fase</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="h-5 px-2 rounded-[3px] bg-[var(--navy)]/20 text-[var(--navy)] text-[9px] font-semibold flex items-center">
              {STAGE_LABELS[sdr.negotiationStage] ?? sdr.negotiationStage}
            </span>
            {sdr.isRestaurant && (
              <span className="h-5 px-2 rounded-[3px] bg-[var(--warning)]/20 text-[var(--warning)] text-[9px] font-semibold flex items-center">
                Restaurante
              </span>
            )}
            <span className="h-5 px-2 rounded-[3px] bg-[var(--text-primary)] text-[var(--text-secondary)] text-[9px] font-semibold flex items-center">
              Score {sdr.qualificationScore}/10
            </span>
          </div>
        </section>

        {/* Identity */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Identidade</div>
          <Row label="Nome"     value={scope.prospectName  ?? "—"} valueClass={scope.prospectName  ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} />
          <Row label="Negócio"  value={scope.businessName  ?? "—"} valueClass={scope.businessName  ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} />
          <Row label="Segmento" value={scope.segment       ?? "—"} valueClass={scope.segment       ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} />
          <Row label="E-mail"   value={scope.prospectEmail ?? "—"} valueClass={scope.prospectEmail ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} />
          <Row label="WhatsApp" value={scope.prospectPhone ?? "—"} valueClass={scope.prospectPhone ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"} />
        </section>

        {/* Answered QIDs */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">
            Perguntas respondidas ({conv.answeredQIds.length})
          </div>
          {conv.answeredQIds.length === 0 ? (
            <span className="text-[var(--text-primary)]">nenhuma</span>
          ) : (
            <div className="space-y-0.5">
              {conv.answeredQIds.map((id) => (
                <div key={id} className="flex items-center gap-1.5">
                  <span className="text-[var(--success)] text-[9px]">✓</span>
                  <span className="text-[var(--text-secondary)] font-mono text-[10px]">{id}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Budget */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Budget</div>
          <Row
            label="Valor"
            value={sdr.budgetSignal.amount ? fmtBRL(sdr.budgetSignal.amount) : "—"}
            valueClass={sdr.budgetSignal.amount ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}
          />
          <Row
            label="Status"
            value={sdr.budgetSignal.fitStatus}
            valueClass={
              sdr.budgetSignal.fitStatus === "fits"    ? "text-[var(--success)]" :
              sdr.budgetSignal.fitStatus === "unknown" ? "text-[var(--text-primary)]" :
              "text-[var(--warning)]"
            }
          />
        </section>

        {/* Objection */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Objeção</div>
          <Row
            label="Ativa"
            value={sdr.objection.active ? "Sim" : "Não"}
            valueClass={sdr.objection.active ? "text-[var(--danger)]" : "text-[var(--success)]"}
          />
          {sdr.objection.types.length > 0 && (
            <div className="flex items-start gap-2 py-[2px]">
              <span className="text-[var(--text-secondary)] w-[68px] shrink-0">Tipos</span>
              <div className="flex flex-wrap gap-1 flex-1">
                {sdr.objection.types.map((t) => (
                  <span key={t} className="text-[8px] bg-[var(--danger)]/20 text-[var(--danger)] px-1.5 py-0.5 rounded-[3px]">{t}</span>
                ))}
              </div>
            </div>
          )}
          {sdr.objection.resolvedAt && (
            <Row label="Resolvida" value="Sim" valueClass="text-[var(--success)]" />
          )}
        </section>

        {/* Estimate */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Estimativa</div>
          {pkgLabel && <Row label="Plano" value={pkgLabel} />}
          <Row
            label="Total"
            value={estimate.totalMin > 0 ? `${fmtBRL(estimate.totalMin)} – ${fmtBRL(estimate.totalMax)}` : "—"}
            valueClass={estimate.totalMin > 0 ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}
          />
          <Row
            label="Confiança"
            value={estimate.confidence}
            valueClass={
              estimate.confidence === "high"   ? "text-[var(--success)]" :
              estimate.confidence === "medium" ? "text-[var(--navy)]" :
              estimate.confidence === "low"    ? "text-[var(--warning)]" :
              "text-[var(--text-primary)]"
            }
          />
          {estimate.missingForEstimate.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {estimate.missingForEstimate.map((m) => (
                <div key={m} className="flex items-start gap-1.5">
                  <span className="text-[var(--warning)] shrink-0">·</span>
                  <span className="text-[var(--warning)] text-[10px]">{m}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* canSubmit */}
        <section>
          <div className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-1.5">Envio</div>
          <div className="flex items-center gap-2">
            <span className={`h-4 px-2 rounded-[3px] text-[9px] font-bold ${canSubmit ? "bg-[var(--success)]/20 text-[var(--success)]" : "bg-[var(--danger)]/20 text-[var(--danger)]"}`}>
              {canSubmit ? "canSubmit: true" : "canSubmit: false"}
            </span>
          </div>
          {blockReason && (
            <p className="text-[10px] text-[var(--warning)] mt-1 leading-relaxed">{blockReason}</p>
          )}
        </section>

      </div>
    </div>
  );
}

// ── Simulation result ──────────────────────────────────────────────────────────

function SimulationResult({ handoff, onReset }: { handoff: SDRHandoff; onReset: () => void }) {
  return (
    <div className="mt-4 bg-white border border-[var(--border)] rounded-[12px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-5 px-2.5 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-[10px] font-semibold inline-flex items-center mb-1.5">
            Simulação concluída — nenhum dado foi salvo
          </div>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Prévia do Handoff para o PM</p>
        </div>
        <button
          onClick={onReset}
          className="h-8 px-4 rounded-[7px] border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Nova simulação
        </button>
      </div>

      <div className="bg-[var(--accent-light)] border border-[var(--cyan)] rounded-[10px] px-4 py-4 space-y-3">
        <div className="text-[9px] font-semibold text-[var(--navy)] uppercase tracking-[0.06em]">✦ SDR Handoff</div>

        {[
          { title: "Diagnóstico",   value: handoff.diagnosis },
          { title: "Escopo final",  value: handoff.finalScopeDescription },
          { title: "Budget",        value: handoff.budgetFit },
        ].map(({ title, value }) => (
          <div key={title}>
            <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">{title}</p>
            <p className="text-[12px] text-[#1E3A8A] leading-relaxed">{value}</p>
          </div>
        ))}

        {handoff.objectionsHandled.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Objeções tratadas</p>
            {handoff.objectionsHandled.map((o, i) => <p key={i} className="text-[12px] text-[#1E3A8A]">• {o}</p>)}
          </div>
        )}

        {handoff.tradeoffsAccepted.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Concessões aceitas</p>
            {handoff.tradeoffsAccepted.map((t, i) => <p key={i} className="text-[12px] text-[#1E3A8A]">• {t}</p>)}
          </div>
        )}

        {handoff.unresolvedRisks.length > 0 && (
          <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[6px] px-3 py-2.5">
            <p className="text-[10px] font-semibold text-[var(--warning)] mb-0.5">Riscos não resolvidos</p>
            {handoff.unresolvedRisks.map((r, i) => <p key={i} className="text-[12px] text-[#92400E]">• {r}</p>)}
          </div>
        )}

        <div className="bg-[#E9EFFF] rounded-[6px] px-3 py-2.5">
          <p className="text-[10px] font-semibold text-[#1E3A8A] mb-0.5">Ação recomendada para o PM</p>
          <p className="text-[12px] text-[#1E3A8A] leading-relaxed">{handoff.recommendedPMAction}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main simulator component ───────────────────────────────────────────────────

export function SDRSimulator() {
  const [state,         setState]       = useState<ProspectConvState>(() => initProspectConvState());
  const [inputText,     setInputText]   = useState("");
  const [simulationDone, setSimDone]   = useState(false);
  const [handoff,        setHandoff]   = useState<SDRHandoff | null>(null);
  const [activePreset,   setPreset]    = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  const conv = state.conv;
  const sdr  = state.sdr;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv.messages]);

  const canSubmit   = canSubmitProposal(conv, sdr);
  const blockReason = getSubmissionBlockReason(conv, sdr);

  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    setState((prev) => processProspectMessage(text, prev));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleReset() {
    setState(initProspectConvState());
    setSimDone(false);
    setHandoff(null);
    setPreset(null);
    setInputText("");
  }

  function handleSimulationSubmit() {
    setHandoff(buildHandoffSummary(conv, sdr));
    setSimDone(true);
  }

  function loadPreset(preset: Preset) {
    const fresh = initProspectConvState();
    setState(processProspectMessage(preset.firstMessage, fresh));
    setPreset(preset.id);
    setSimDone(false);
    setHandoff(null);
    setInputText("");
  }

  function autoRunScenario(preset: Preset) {
    if (!preset.scenario) return;
    let current = initProspectConvState();
    for (const msg of preset.scenario) {
      current = processProspectMessage(msg, current);
    }
    setState(current);
    setPreset(preset.id);
    setSimDone(false);
    setHandoff(null);
    setInputText("");
  }

  function sendAction(text: string) {
    setState((prev) => processProspectMessage(text, prev));
  }

  return (
    <div>
      {/* ── Preset bar ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Cenários:</span>
        {PRESETS.map((preset) => (
          <div key={preset.id} className="flex items-center gap-1">
            <button
              onClick={() => loadPreset(preset)}
              className={`h-7 px-3 rounded-l-[6px] border text-[11px] font-medium transition-colors ${
                activePreset === preset.id
                  ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              title={preset.tag}
            >
              {preset.label}
            </button>
            {preset.scenario && (
              <button
                onClick={() => autoRunScenario(preset)}
                className="h-7 px-2.5 rounded-r-[6px] border border-l-0 border-[var(--border)] bg-white text-[10px] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--navy)] transition-colors"
                title={`Auto-run: ${preset.scenario.length} mensagens`}
              >
                ▶ Auto
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleReset}
          className="h-7 px-3 rounded-[6px] border border-[var(--border)] bg-white text-[11px] text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] transition-colors ml-auto"
        >
          Resetar
        </button>
      </div>

      {/* ── Main 3-column grid ── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 260px 290px" }}>

        {/* ── Chat ── */}
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Simulador</div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)] mt-0.5">SDR Agent — Briefing Room</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-5 px-2.5 rounded-full bg-[#E9EFFF] text-[var(--navy)] text-[9px] font-semibold">
                ✦ Interno
              </span>
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
              <span className="text-[11px] text-[var(--text-muted)]">Simulando</span>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3 overflow-y-auto min-h-[360px] max-h-[520px]">
            {conv.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {!simulationDone && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={conv.isFirstMessage ? "Diga seu nome e negócio para começar…" : "Digite sua resposta…"}
                  rows={2}
                  className="flex-1 px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all resize-none leading-relaxed placeholder:text-[var(--text-subtle)]"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="w-[52px] rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0"
                  aria-label="Enviar"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M12.5 7L1.5 1.5L4 7L1.5 12.5L12.5 7Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-[var(--text-subtle)] mt-2">Enter para enviar · Shift+Enter nova linha</p>
            </div>
          )}

          {simulationDone && (
            <div className="border-t border-[var(--border)] px-4 py-3 text-center">
              <p className="text-[11px] text-[var(--text-muted)]">Simulação encerrada. Clique em <strong>Nova simulação</strong> para recomeçar.</p>
            </div>
          )}
        </div>

        {/* ── Cart ── */}
        <div className="sticky top-6">
          <CartPanel
            scope={conv.scope}
            estimate={conv.estimate}
            sdr={sdr}
            canSubmit={canSubmit && !simulationDone}
            blockReason={simulationDone ? null : blockReason}
            onSubmit={handleSimulationSubmit}
            onSendAction={sendAction}
          />
        </div>

        {/* ── Debug ── */}
        <div className="sticky top-6" style={{ maxHeight: "calc(100vh - 5rem)" }}>
          <DebugPanel state={state} canSubmit={canSubmit} blockReason={blockReason} />
        </div>

      </div>

      {/* ── Simulation result ── */}
      {simulationDone && handoff && (
        <SimulationResult handoff={handoff} onReset={handleReset} />
      )}
    </div>
  );
}
