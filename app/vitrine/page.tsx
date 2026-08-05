"use client";

import { useState } from "react";
import { DioliLogo } from "@/components/brand/DioliLogo";
import {
  SELF_SERVE_CATALOG,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  brlFixed,
  type MicroService,
  type SelfServeCategory,
} from "@/lib/agency/self-serve-catalog";
import type { OrderBody } from "@/app/api/self-serve/order/route";

// ── Order Modal ──────────────────────────────────────────────────────────────

function OrderModal({
  service,
  onClose,
}: {
  service: MicroService;
  onClose: () => void;
}) {
  const cat = CATEGORY_COLOR[service.category];
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ checkoutUrl?: string; whatsappUrl?: string; method?: string } | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const isValid = form.name.trim() && form.email.includes("@") && form.phone.trim().length >= 8;

  async function handleSubmit() {
    if (!isValid || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/self-serve/order", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          note: form.note.trim() || undefined,
        } satisfies OrderBody),
      });
      const data = (await res.json()) as {
        ok: boolean;
        checkoutUrl?: string;
        whatsappUrl?: string;
        method?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrMsg(data.error ?? "Erro ao processar pedido. Tente novamente.");
        setStatus("error");
        return;
      }
      setResult({ checkoutUrl: data.checkoutUrl, whatsappUrl: data.whatsappUrl, method: data.method });
      setStatus("done");
      // If Mercado Pago: redirect immediately.
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setErrMsg("Erro de rede. Verifique sua conexão e tente novamente.");
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[16px] border border-[var(--border)] shadow-[0_16px_50px_rgba(0,0,0,0.18)] w-full max-w-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div className="flex items-start justify-between">
            <div>
              <span className={`inline-flex h-5 px-2 rounded-full text-[10px] font-semibold ${cat.bg} ${cat.text} mb-1.5`}>
                {CATEGORY_LABEL[service.category]}
              </span>
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">{service.label}</h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{service.description}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text-primary)] transition-colors shrink-0 ml-3 text-[18px] leading-none"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[22px] font-bold text-[#070A1F]">{brlFixed(service.price)}</span>
            <span className="text-[13px] text-[var(--text-muted)]">· entrega em {service.deliveryDays} dias úteis</span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {status === "done" && result?.method === "whatsapp" ? (
            <div className="space-y-4">
              <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-[10px] px-4 py-4">
                <p className="text-[13px] font-semibold text-[#15803D]">Pedido recebido! ✓</p>
                <p className="text-[12px] text-[#166534] mt-1 leading-relaxed">
                  Clique no botão abaixo para nos enviar seu pedido via WhatsApp. Nossa equipe vai confirmar em até 2h úteis e enviar os dados de pagamento (Pix).
                </p>
              </div>
              <a
                href={result.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.11 1.516 5.844L.037 24l6.334-1.658A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.374l-.36-.214-3.757.984 1.003-3.653-.234-.374A9.818 9.818 0 1112 21.818z"/>
                </svg>
                Enviar pedido pelo WhatsApp
              </a>
            </div>
          ) : status === "done" && result?.method === "mercadopago" ? (
            <div className="bg-[#E6FBFA] border border-[#9AF5F0] rounded-[10px] px-4 py-4 text-center">
              <p className="text-[13px] font-semibold text-[#070A1F]">Redirecionando para o checkout…</p>
            </div>
          ) : (
            <>
              <p className="text-[12px] text-[var(--text-secondary)]">Preencha seus dados para continuar. Entraremos em contato com a confirmação do pedido.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Nome completo *</label>
                  <input
                    type="text"
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Maria Santos"
                    className="w-full h-10 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[#070A1F] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="maria@empresa.com"
                    className="w-full h-10 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[#070A1F] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">WhatsApp *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="w-full h-10 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[#070A1F] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Observação (opcional)</label>
                  <textarea
                    value={form.note}
                    onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Conte um pouco sobre o seu negócio ou o que precisa comunicar…"
                    rows={3}
                    className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] outline-none focus:border-[#070A1F] focus:bg-white transition-colors resize-none leading-relaxed"
                  />
                </div>
              </div>

              {status === "error" && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] px-3 py-2.5 text-[12px] text-[var(--danger)]">
                  {errMsg}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!isValid || status === "loading"}
                className="w-full h-11 rounded-[10px] bg-[#070A1F] hover:bg-[#0D1230] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] font-semibold transition-colors"
              >
                {status === "loading" ? "Processando…" : `Contratar — ${brlFixed(service.price)}`}
              </button>
              <p className="text-[10px] text-center text-[var(--text-subtle)]">
                Ao continuar, você concorda com nossos termos. Pagamento via Pix ou cartão após confirmação.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onOrder,
}: {
  service: MicroService;
  onOrder: (s: MicroService) => void;
}) {
  const cat = CATEGORY_COLOR[service.category];
  return (
    <div className="bg-white rounded-[14px] border border-[var(--border)] hover:border-[var(--text-muted)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className={`inline-flex h-5 px-2 rounded-full text-[10px] font-semibold items-center ${cat.bg} ${cat.text}`}>
            {CATEGORY_LABEL[service.category]}
          </span>
          {service.popular && (
            <span className="h-5 px-2 rounded-full bg-[#070A1F] text-[#9AF5F0] text-[10px] font-semibold flex items-center">
              Popular
            </span>
          )}
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">{service.label}</h3>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4">{service.description}</p>
        <ul className="space-y-1.5">
          {service.deliverables.map((d) => (
            <li key={d} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className={`w-1.5 h-1.5 rounded-full ${cat.dot} shrink-0 mt-1`} />
              {d}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-5 pb-5 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <span className="text-[20px] font-bold text-[#070A1F]">{brlFixed(service.price)}</span>
          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">{service.deliveryDays}d úteis</span>
        </div>
        <button
          onClick={() => onOrder(service)}
          className="h-9 px-5 rounded-[8px] bg-[#070A1F] hover:bg-[#0D1230] text-white text-[13px] font-semibold transition-colors shrink-0"
        >
          Contratar
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const CATEGORIES: SelfServeCategory[] = ["social", "video", "design", "traffic"];

export default function VitrinePage() {
  const [catFilter, setCatFilter]   = useState<SelfServeCategory | "all">("all");
  const [selected, setSelected]     = useState<MicroService | null>(null);

  const displayed = catFilter === "all"
    ? SELF_SERVE_CATALOG
    : SELF_SERVE_CATALOG.filter((s) => s.category === catFilter);

  return (
    <>
      {/* Nav */}
      <header className="bg-[#070A1F] border-b border-white/[0.06] h-14 flex items-center px-6 shrink-0">
        <DioliLogo variant="full" tone="light" markSize={20} className="text-[13px] flex-1" />
        <a
          href="/briefing"
          className="h-8 px-4 rounded-[7px] border border-white/20 text-white text-[12px] font-medium hover:bg-white/10 transition-colors"
        >
          Briefing completo →
        </a>
      </header>

      {/* Hero */}
      <div className="bg-[#070A1F] text-white px-6 pt-10 pb-12 text-center">
        <h1 className="text-[28px] md:text-[34px] font-bold leading-tight max-w-[540px] mx-auto">
          Serviços digitais com entrega rápida
        </h1>
        <p className="text-[14px] text-[var(--text-on-dark)] mt-3 max-w-[420px] mx-auto leading-relaxed">
          Compre avulso, sem contratos longos. Design, social media, vídeo e tráfego pago — feito pela Dioli, entregue rápido.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="sticky top-0 z-10 bg-[var(--bg)] border-b border-[var(--border)] px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setCatFilter("all")}
          className={`h-8 px-4 rounded-full text-[12px] font-semibold shrink-0 transition-colors ${
            catFilter === "all"
              ? "bg-[#070A1F] text-white"
              : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
          }`}
        >
          Todos
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`h-8 px-4 rounded-full text-[12px] font-semibold shrink-0 transition-colors ${
              catFilter === cat
                ? "bg-[#070A1F] text-white"
                : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <main className="flex-1 px-6 py-8 max-w-[1100px] mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayed.map((s) => (
            <ServiceCard key={s.id} service={s} onOrder={setSelected} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-6 py-6 text-center">
        <p className="text-[11px] text-[var(--text-subtle)]">
          Dioli Digital · Agência Digital com IA ·{" "}
          <a href="/briefing" className="underline hover:text-[var(--text-secondary)] transition-colors">
            Precisa de algo maior? Faça um briefing completo →
          </a>
        </p>
      </footer>

      {/* Order modal */}
      {selected && (
        <OrderModal service={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
