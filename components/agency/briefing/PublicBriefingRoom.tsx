"use client";

import { NOME_DA_EMPRESA } from "@/lib/marca";
import { useState, useRef, useEffect, useCallback } from "react";
import type { ConvState, ConvMessage, BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import { initProspectConvState, processProspectMessage, type ProspectConvState, type ContatoInicial } from "@/lib/agency/prospect-engine";
import { canSubmitProposal, getSubmissionBlockReason, buildHandoffSummary } from "@/lib/agency/sdr-agent";
import { detectPackage, getPackageDef, computeEstimate } from "@/lib/agency/live-calculator";
import { montarAvisoDeAnexo } from "@/lib/agency/anexo-nao-e-resposta";
import { semMarcacao } from "@/lib/agency/texto-sem-marcacao";
import { unirLacunas, type LacunaDeEscopo } from "@/lib/agency/comercial/lacuna-de-escopo";
import { escopoComRetratacao, canalFoiRetratado, CAMPO_DO_CANAL } from "@/lib/agency/comercial/retratacao";
import { MaterialsLinkField } from "@/components/agency/briefing/FileUploadZone";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { useReservaDeBarra } from "@/components/agency/layout/useReservaDeBarra";
import type { RequestAttachment, ExtractedRequestSummary } from "@/lib/agency/client-requests";
import type { SDRHandoff } from "@/lib/agency/sdr-agent";
import { precoDoItemEmTexto } from "@/lib/agency/comercial/preco-do-item";
import { linhaDeVolume, linhaDeVideo, linhaDeModalidade, type LinhaDeEscopo } from "@/lib/agency/comercial/escopo-na-voz-da-casa";

// ── Public types ───────────────────────────────────────────────────────────────

export interface PublicBriefingRoomSubmitData {
  conversationTranscript: ConvMessage[];
  v2Scope: BriefingScope;
  v2Estimate: LiveEstimate;
  attachments: RequestAttachment[];
  extractedSummary: ExtractedRequestSummary;
  rawText: string;
  title: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  businessName: string;
  segment: string;
  sdrHandoff?: SDRHandoff;
  /**
   * O que a pessoa DECLAROU como forma de falar com ela — e `null` quando ela
   * escolheu não declarar nada.
   *
   * `null` não é erro nem descarte: o briefing sobe do mesmo jeito e vira
   * **lead incompleto**, com a conversa inteira gravada. O que ele não vira é
   * proposta. Ver `lib/agency/comercial/contato-do-lead.ts`.
   */
  contato: { nome: string; email: string; whatsapp: string } | null;
}

interface PublicBriefingRoomProps {
  onSubmit: (data: PublicBriefingRoomSubmitData) => void;
  /**
   * O que a pessoa declarou na porta (`LeadNaPorta`), antes de a sala abrir.
   *
   * 23/08/2026 — o piloto ao vivo do CEO: ele deu nome, e-mail e WhatsApp na
   * porta e a primeira fala da consultora pediu o nome de novo, com o painel da
   * direita marcando "Nome: aguardando…". A porta capturava e não entregava.
   * Esta prop é a entrega. `null`/ausente é o caminho de quem escolheu não
   * deixar contato — nesse caso a sala funciona exatamente como antes.
   */
  contatoDaPorta?: ContatoInicial;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function buildRawText(messages: ConvMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `[${m.role === "assistant" ? "Dioli" : "Prospect"}] ${m.text}`)
    .join("\n\n");
}

export function buildExtractedSummary(scope: BriefingScope): ExtractedRequestSummary {
  const services: string[] = [];
  const depts: string[] = [];
  if (scope.wantsSocialMedia)   { services.push("Social Media"); depts.push("social-media", "design"); }
  if (scope.wantsPaidTraffic)   { services.push("Tráfego Pago"); depts.push("paid-traffic"); }
  if (scope.branding?.requested) { services.push("Identidade Visual"); depts.push("brand-hub"); }

  const s = scope.social;
  const quantities: string[] = [];
  if (s?.postsPerWeek !== undefined && s.postsPerWeek > 0) quantities.push(`${s.postsPerWeek * 4} posts/mês`);
  if (s?.storiesPerWeek !== undefined && s.storiesPerWeek > 0) quantities.push(`${s.storiesPerWeek * 4} stories/mês`);
  if (s?.reelsPerMonth !== undefined && s.reelsPerMonth > 0) quantities.push(`${s.reelsPerMonth} reels/mês`);

  // missingInfo — declara ausência em vez de escondê-la. O caso Diego (16/08)
  // é a prova do que acontece quando o campo some da tela em silêncio: ele
  // leu "0 posts" e achou que era bug do sistema, porque nada na tela dizia
  // "ainda não perguntamos isso". Aqui a régua é estrutural (o campo do
  // BriefingScope está vazio), não regex sobre texto livre como no extrator
  // v1 (`briefing-extractor.ts`) — os dois pipelines são propositalmente
  // diferentes e não convergem neste bloco.
  const missingInfo: string[] = [];
  if (quantities.length === 0) missingInfo.push("Quantidade de peças/posts");
  if (!scope.budgetRange) missingInfo.push("Orçamento");
  if (!scope.deadline) missingInfo.push("Prazo de entrega");
  if (!scope.targetAudience) missingInfo.push("Público-alvo");

  return {
    clientName:           scope.businessName,
    segment:              scope.segment,
    services,
    channels:             s?.platforms ?? [],
    objectives:           scope.objectives,
    quantities,
    urgency:              scope.deadline ?? undefined,
    suggestedDepartments: [...new Set(depts)],
    missingInfo,
  };
}

function buildTitle(scope: BriefingScope): string {
  const biz = scope.businessName ?? "Prospect";
  const services: string[] = [];
  if (scope.wantsSocialMedia) {
    const postsPerMonth = (scope.social?.postsPerWeek ?? 0) * 4;
    if (postsPerMonth > 0) {
      const pkg = getPackageDef(detectPackage(postsPerMonth));
      services.push(pkg.label);
    } else {
      services.push("Social Media");
    }
  }
  if (scope.wantsPaidTraffic)   services.push("Tráfego Pago");
  if (scope.branding?.requested) services.push("Identidade Visual");
  const serviceStr = services.length > 0 ? ` — ${services.join(", ")}` : "";
  return `Orçamento — ${biz}${serviceStr}`;
}

// ── Message text renderer ──────────────────────────────────────────────────────

function MsgText({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={pi > 0 ? "mt-2" : undefined}>
          {para.split("\n").map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i}>{part.slice(2, -2)}</strong>
                ) : (
                  part
                )
              )}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

// `data-testid` nos dois balões e no container de mensagens (ver comentário
// completo em `mensagens-container`, logo abaixo, e no `<textarea>`): são o
// jeito de MEDIR "a fala fica visível", não de raciocinar sobre o layout.
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
    <div
      data-testid={isAssistant ? "balao-do-agente" : "balao-do-visitante"}
      className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
    >
      {isAssistant && (
        <div className="w-6 h-6 rounded-full bg-[var(--text-primary)] flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <circle cx="4" cy="4" r="2.5" fill="white" fillOpacity="0.9"/>
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

// ── Package badge ─────────────────────────────────────────────────────────────

const PKG_STYLE: Record<string, { bg: string; text: string }> = {
  essencial: { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]" },
  starter:   { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]" },
  growth:    { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
  pro:       { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
  premium:   { bg: "bg-[var(--navy)]", text: "text-white" },
};

// ── Scope section ─────────────────────────────────────────────────────────────

/** EXPORTADA para que o teste alcance o HTML que o cliente lê de verdade, e
 *  não só as funções que o alimentam. A pergunta obrigatória desta casa é "o
 *  teste alcança o código que responde ao cliente?" — provar `linhaDeVolume`
 *  isolada deixaria passar exatamente a falha que originou este trabalho: a
 *  função certa que tela nenhuma chamava. */
export function ScopeSection({ scope }: { scope: BriefingScope }) {
  let pkgLabel: string | null = null;
  let pkgStyle: { bg: string; text: string } | null = null;

  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    const postsPerMonth = scope.social.postsPerWeek * 4;
    const pkgId = detectPackage(postsPerMonth);
    const pkg   = getPackageDef(pkgId);
    pkgLabel = pkg.label;
    pkgStyle = PKG_STYLE[pkgId];
  }

  const rows: LinhaDeEscopo[] = [];

  // A modalidade passa pela voz da casa: "projeto pontual" com peças/MÊS são
  // duas afirmações que cobram diferente, e a tela não pode fazer as duas.
  rows.push(linhaDeModalidade(scope));

  if (scope.wantsSocialMedia) {
    rows.push({ label: "Serviço", value: "Social Media" });
    if (scope.social?.platforms.length)
      rows.push({ label: "Canais", value: scope.social.platforms.join(", ") });
    // O volume sai no DEGRAU que a casa vende (12 · 20 · 36), com o número que
    // o cliente pediu ao lado. 28 não existe na tabela, e mostrar 28 como se
    // fosse o contratado é o caminho mais curto para um preço inventado.
    if (scope.social?.postsPerWeek !== undefined)
      rows.push(linhaDeVolume("Posts", scope.social.postsPerWeek * 4));
    if (scope.social?.storiesPerWeek !== undefined)
      rows.push(linhaDeVolume("Stories", scope.social.storiesPerWeek * 4));
    if (scope.social?.reelsPerMonth !== undefined)
      rows.push(linhaDeVolume("Reels", scope.social.reelsPerMonth));
    // Vídeo não tem produtor. A tela dizia "Produção pela Dioli" a quem pedia,
    // e "A definir" a quem não pedia — um sim e um talvez, os dois falsos.
    const video = linhaDeVideo(scope.social);
    if (video) rows.push(video);
    if (scope.social?.hasPhotos !== undefined)
      rows.push({ label: "Fotos", value: scope.social.hasPhotos ? "Disponíveis" : "Sem produção", dim: !scope.social.hasPhotos });
    if (scope.social?.creativesReady !== undefined)
      rows.push({ label: "Criativos", value: scope.social.creativesReady ? "Prontos" : "Criar do zero", dim: !scope.social.creativesReady });
    if (scope.social?.needsCopy !== undefined)
      rows.push({ label: "Copy", value: scope.social.needsCopy ? "Pela Dioli" : "Pelo cliente" });
  }

  if (scope.wantsPaidTraffic) {
    rows.push({ label: "Serviço", value: "Tráfego Pago" });
    if (scope.traffic?.monthlyAdBudget)
      rows.push({ label: "Verba ads", value: scope.traffic.monthlyAdBudget });
  }

  if (scope.branding?.requested)
    rows.push({ label: "Serviço", value: "Identidade Visual" });
  if (scope.branding?.hasBrandBook)
    rows.push({ label: "Brand Book", value: "Disponível — como referência" });
  if (scope.objectives.length)
    rows.push({ label: "Objetivos", value: scope.objectives.join(", ") });
  if (scope.budgetRange)
    rows.push({ label: "Orçamento", value: scope.budgetRange });
  if (scope.deadline)
    rows.push({ label: "Prazo", value: scope.deadline });

  return (
    <div className="space-y-2">
      {pkgLabel && pkgStyle && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Plano</span>
          <span className={`h-5 px-2.5 rounded-full text-[10px] font-semibold ${pkgStyle.bg} ${pkgStyle.text}`}>
            {pkgLabel}
          </span>
        </div>
      )}
      {/* `semMarcacao` na BORDA, não na origem: quem preenche estes campos é o
          SDR (um modelo), e modelo escreve `**` por hábito. Este painel não tem
          conversor de markdown como o balão de chat — em 16/08/2026 o asterisco
          chegou cru na tela, no print do CEO. Limpar aqui protege todo campo,
          venha de onde vier. */}
      {/* `detalhe` NÃO é decoração. É onde a casa explica o que corrigiu no
          pedido — o degrau que cobre 28, o vídeo que não temos, a modalidade
          que trocou. Corrigir sem dizer por quê é o cliente descobrir na
          fatura; por isso `alerta` destaca em vez de apagar. */}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <span className="text-[var(--text-muted)] shrink-0 w-[68px]">{r.label}</span>
          <span className="min-w-0">
            <span className={r.dim ? "text-[var(--text-subtle)]" : r.alerta ? "text-[var(--warning)] font-semibold" : "text-[var(--text-primary)] font-medium"}>
              {semMarcacao(r.value)}
            </span>
            {r.detalhe ? (
              <span className="block text-[10px] leading-[1.45] text-[var(--text-muted)] mt-0.5">{semMarcacao(r.detalhe)}</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Estimate section ──────────────────────────────────────────────────────────
//
// ⚠️ DESLIGADA DE PROPÓSITO — nenhum caller neste arquivo. Antes de apagar,
// leia isto até o fim: quem já quase religou por achar isto esquecimento foi
// ver menos da metade da história.
//
// 1. Desde `155aefbb` (26/06/2026), mensagem literal: "Removes all price
//    display from the confirmation panel — estimate is generated only after
//    Google login." A tela foi redesenhada para NÃO mostrar preço no painel
//    de confirmação; este componente é o que sobrou de antes do redesign.
// 2. É a MESMA regra do guarda `PRICE_LEAK` em `app/api/sdr/chat/route.ts`
//    (~linha 687) — o SDR nunca cota preço em texto na conversa. Este
//    componente cotaria preço na tela, mid-conversa, antes da hora. Uma
//    regra, dois lugares.
// 3. Para onde o prospect REALMENTE recebe o preço:
//    `lib/agency/esteira/orcamento-do-briefing.ts`, acionado pelo relógio
//    (`lib/agency/despertador.ts`), lendo a MESMA estimativa que este
//    formulário já calcula e grava no submit (`v2Estimate`, ~linha 1414,
//    via `computeEstimate()` ~linha 1287) — escreve no portal e dispara
//    e-mail (`entregarOrcamentosPendentes`). O prospect não fica sem preço;
//    ele recebe depois, por canal único e controlado, revisado antes de
//    chegar.
// 4. Doutrina registrada em `docs/decisoes.md` (~1402-1409): "antes de
//    existir número, nenhum valor; depois, exatamente a faixa derivada que
//    já está no portal, formatada por um formatador só."
//
// O problema nunca foi o DADO — o cálculo está certo, e `031831c6` (16/08)
// já fechou o caso de "zero virando orçamento" na trava de `orcamento-do-
// briefing.ts`. O problema é o MOMENTO: mid-conversa, pré-contato, sem
// revisão. Religar isto reabre exatamente o que `155aefbb` fechou.
//
// `ProposalCard` (~616) e `EmailFallbackForm` (~485) estão desligados pela
// mesma razão — remissão a este bloco, não repetição.

const CONFIDENCE_CFG = {
  none:   { label: "",                     bg: "",               text: "" },
  low:    { label: "Estimativa inicial",   bg: "bg-[var(--warning-bg)]",  text: "text-[var(--warning)]" },
  medium: { label: "Estimativa aprox.",    bg: "bg-[var(--accent-light)]",  text: "text-[var(--navy)]" },
  high:   { label: "Estimativa confiável", bg: "bg-[var(--success-bg)]",  text: "text-[var(--success)]" },
};

function EstimateSection({ estimate }: { estimate: LiveEstimate }) {
  const cfg = CONFIDENCE_CFG[estimate.confidence];
  return (
    <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Estimativa mensal</span>
        {estimate.confidence !== "none" && (
          <span className={`h-4 px-1.5 rounded-[3px] text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
        )}
      </div>
      {estimate.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <span className="text-[var(--text-muted)] flex-1 leading-relaxed">{item.label}</span>
          <span className="text-[var(--text-secondary)] shrink-0 text-right">
            {precoDoItemEmTexto(item, fmtBRL)}
            {item.minPrice !== null && <span className="text-[var(--text-subtle)]">/{item.unit}</span>}
          </span>
        </div>
      ))}
      {estimate.discountPct && estimate.discountedMin !== undefined ? (
        <>
          <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-muted)]">Subtotal</span>
            <span className="text-[11px] text-[var(--text-muted)] line-through">
              {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--success)]">
              Desconto {estimate.discountPct}%{estimate.discountReason ? ` · ${estimate.discountReason}` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">Total com desconto</span>
            <span className="text-[13px] font-bold text-[var(--success)]">
              {fmtBRL(estimate.discountedMin)} – {fmtBRL(estimate.discountedMax ?? estimate.discountedMin)}
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)]">
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Total</span>
          <span className="text-[13px] font-bold text-[var(--text-primary)]">
            {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Quick action buttons ───────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  text: string;
  show: (scope: BriefingScope) => boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Plano Starter",
    text: "Quero começar com um plano mais simples e barato",
    show: (s) => s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) * 4 > 8,
  },
  {
    label: "Tirar reels",
    text: "Pode tirar os reels por enquanto",
    show: (s) => s.wantsSocialMedia && (s.social?.reelsPerMonth ?? 0) > 0,
  },
  {
    label: "Adicionar reels",
    text: "Quero adicionar 2 reels por mês",
    show: (s) => s.wantsSocialMedia && s.social?.postsPerWeek !== undefined && (s.social?.reelsPerMonth === 0 || s.social?.reelsPerMonth === undefined),
  },
  {
    label: "Sem tráfego pago",
    text: "Pode tirar o tráfego pago",
    show: (s) => !!s.wantsPaidTraffic,
  },
  {
    label: "Incluir tráfego pago",
    text: "Quero incluir tráfego pago",
    show: (s) => s.wantsSocialMedia && s.wantsPaidTraffic === false && s.social?.postsPerWeek !== undefined,
  },
  {
    label: "Menos posts",
    text: "Quero reduzir a quantidade de posts",
    show: (s) => s.wantsSocialMedia && (s.social?.postsPerWeek ?? 0) > 2,
  },
];

// ── Proposal card ─────────────────────────────────────────────────────────────

// ── Google sign-in button ─────────────────────────────────────────────────────

interface GoogleAuthResult { email: string; name: string; picture: string }

function GoogleSignInButton({
  onSuccess,
  onFallback,
  loading,
}: {
  onSuccess: (result: GoogleAuthResult) => void;
  onFallback: () => void;
  loading: boolean;
}) {
  const [state, setState] = useState<"idle" | "opening" | "waiting" | "error">("idle");
  const [errorCode, setErrorCode] = useState("");

  function handleClick() {
    if (loading || state !== "idle") return;
    setState("opening");

    const popup = window.open(
      "/api/auth/google",
      "google_auth_popup",
      "width=520,height=660,scrollbars=yes,resizable=yes,toolbar=no,menubar=no",
    );

    if (!popup) {
      // Popup blocked — fall back to email input
      setState("idle");
      onFallback();
      return;
    }

    setState("waiting");

    const openedPopup = popup;

    function onMessage(evt: MessageEvent) {
      // Only accept messages from our own origin
      if (evt.origin !== window.location.origin) return;
      const data = evt.data as Record<string, string> | undefined;
      if (!data) return;

      window.removeEventListener("message", onMessage);
      openedPopup.close();

      if (data.type === "google_auth_success" && data.email) {
        setState("idle");
        onSuccess({ email: data.email, name: data.name ?? "", picture: data.picture ?? "" });
      } else {
        setErrorCode(typeof data.error === "string" ? data.error : "desconhecido");
        setState("error");
      }
    }

    window.addEventListener("message", onMessage);

    // Detect popup closed without completing auth (user closed manually)
    const poll = setInterval(() => {
      if (openedPopup.closed) {
        clearInterval(poll);
        window.removeEventListener("message", onMessage);
        setState("idle");
      }
    }, 800);
  }

  if (state === "waiting" || state === "opening") {
    return (
      <button disabled className="w-full h-11 rounded-[8px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] text-[13px] font-medium flex items-center justify-center gap-2 cursor-not-allowed">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        style={{ touchAction: "manipulation" }}
        className="w-full h-11 rounded-[8px] bg-white border border-[var(--border)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[13px] font-semibold transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
      >
        {/* Google "G" logo */}
        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {/* Rótulo curto de propósito: a 375px o texto antigo ("…para ver a
            proposta") quebrava em duas linhas dentro do botão e desalinhava o
            logo. E ele prometia o que não é mais verdade — a proposta chega
            pelo canal informado, não na tela seguinte. */}
        Continuar com Google
      </button>
      {state === "error" && (
        <p className="text-[10px] text-[var(--danger)] text-center">
          Erro ao autenticar com Google{errorCode ? ` (${errorCode})` : ""}. Use o formulário abaixo.
        </p>
      )}
    </div>
  );
}

// ── Email fallback (used inside ProposalCard) ─────────────────────────────────
//
// ⚠️ DESLIGADO DE PROPÓSITO — órfão POR TABELA: só é chamado de dentro de
// `ProposalCard` (~linha 616 abaixo), que por sua vez não tem caller neste
// arquivo. Motivo e histórico completos no comentário de `EstimateSection`
// (~linha 271) — não repetido aqui.
//
// A tela viva NÃO ficou sem formulário de contato: quem está no ar é
// `FormularioDeContato` (~linha 1704), outro componente, sem relação com
// este. Não confunda os dois nem "restaure" este achando que o de contato
// sumiu.

function EmailFallbackForm({ onSubmit, loading }: { onSubmit: (email: string) => void; loading: boolean }) {
  const [email, setEmail] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  return (
    <div className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu@email.com"
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] transition-colors"
        style={{ fontSize: "16px" }}
      />
      <button
        onClick={() => valid && onSubmit(email)}
        disabled={!valid || loading}
        style={{ touchAction: "manipulation" }}
        className="w-full h-11 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
      >
        {loading ? "Enviando…" : "Enviar proposta para análise →"}
      </button>
    </div>
  );
}

// ── Formulário de contato ─────────────────────────────────────────────────────
//
// Nome + PELO MENOS UM canal. O WhatsApp entra na frente do e-mail, e a ordem
// não é estética: é por onde o cliente brasileiro responde. O formulário
// anterior aceitava **só** e-mail — e o e-mail que o Google devolve é a caixa
// que a pessoa não abre.
//
// O momento do pedido é o FIM da conversa, com a proposta na tela, e isso é
// escolha declarada: pedir contato na primeira mensagem cobra antes de entregar
// e espanta quem só está olhando; pedir depois de a pessoa já ter contado o
// negócio inteiro é a hora em que o pedido é natural — ela investiu, quer o
// resultado, e o contato é o que faz o resultado chegar até ela.

const RE_EMAIL_UI = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digitos = (v: string) => v.replace(/\D/g, "");
const zapValido = (v: string) => digitos(v).length >= 10 && digitos(v).length <= 13;

function FormularioDeContato({
  onSubmit,
  onSemContato,
  loading,
}: {
  onSubmit: (contato: { nome: string; email: string; whatsapp: string }) => void;
  onSemContato: () => void;
  loading: boolean;
}) {
  const [nome, setNome]         = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail]       = useState("");

  const zapOk   = zapValido(whatsapp);
  const emailOk = RE_EMAIL_UI.test(email);
  const temCanal = zapOk || emailOk;
  const nomeOk  = nome.trim().length >= 2;
  const valido  = nomeOk && temCanal;

  // O motivo do bloqueio é ESCRITO. Botão apagado sem dizer o porquê é o mesmo
  // que não ter botão — a pessoa não descobre o que falta e fecha a aba.
  const oQueFalta = !nomeOk
    ? "Escreva seu nome."
    : !temCanal
    ? "Preencha o WhatsApp ou o e-mail — precisamos de pelo menos um."
    : null;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Seu nome"
        autoComplete="name"
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] transition-colors"
        style={{ fontSize: "16px" }}
      />
      <input
        type="tel"
        inputMode="tel"
        value={whatsapp}
        onChange={(e) => setWhatsapp(e.target.value)}
        placeholder="WhatsApp com DDD"
        autoComplete="tel"
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] transition-colors"
        style={{ fontSize: "16px" }}
      />
      <input
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu@email.com"
        autoComplete="email"
        className="w-full px-3 py-2.5 border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] transition-colors"
        style={{ fontSize: "16px" }}
      />
      <button
        onClick={() => valido && onSubmit({ nome: nome.trim(), email: emailOk ? email.trim() : "", whatsapp: zapOk ? whatsapp.trim() : "" })}
        disabled={!valido || loading}
        style={{ touchAction: "manipulation" }}
        className="w-full h-11 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
      >
        {loading ? "Enviando…" : "Receber minha proposta →"}
      </button>
      {oQueFalta && (
        <p className="text-[12px] text-[var(--text-muted)] text-center leading-relaxed">{oQueFalta}</p>
      )}

      {/* A saída honesta. Sem ela, quem não quer dar contato fecha a aba e a
          conversa inteira — a melhor matéria-prima que esta agência recebe —
          desaparece sem deixar registro. Com ela, o briefing fica gravado e
          aparece na fila com o motivo. O que ela NÃO faz é gerar proposta. */}
      <button
        onClick={() => !loading && onSemContato()}
        disabled={loading}
        style={{ touchAction: "manipulation" }}
        className="w-full h-9 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline underline-offset-2 transition-colors disabled:opacity-40"
      >
        Prefiro não deixar contato agora
      </button>
    </div>
  );
}

// ── Proposal card ─────────────────────────────────────────────────────────────
//
// ⚠️ DESLIGADO DE PROPÓSITO — sem caller neste arquivo (a chamada que existe é
// em `BriefingRoomV2.tsx`, outro componente). Motivo e histórico completos no
// comentário de `EstimateSection` (~linha 271) — não repetido aqui.

function ProposalCard({
  scope,
  estimate,
  onGoogleSuccess,
  onEmailSubmit,
  submitting,
}: {
  scope: BriefingScope;
  estimate: LiveEstimate;
  onGoogleSuccess: (result: GoogleAuthResult) => void;
  onEmailSubmit: (email: string) => void;
  submitting: boolean;
}) {
  const [useFallback, setUseFallback] = useState(false);

  // ── DUAS QUANTIDADES NA MESMA TELA (25/08/2026) ──────────────────────────
  //
  // Esta linha mostrava `pkg.description` — a cadência da TABELA, ex. "5 posts
  // + 7 stories/semana + 4 reels/mês" — logo acima de `estimate.included`, que
  // desde o conserto do case Farol 27 traz o que a casa REALMENTE entrega,
  // derivado do briefing e cortado pelo contrato de quantidade.
  //
  // Ou seja: a mesma tela dizia 5 posts em cima e 3 posts embaixo. Verdade
  // escrita em dois lugares já está errada em um deles — e aqui as duas
  // estavam à vista uma da outra, para o cliente ler.
  //
  // Fica só o NOME do plano. A quantidade tem um dono só, e é a estimativa.
  let pkgDesc: string | null = null;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    const ppm = scope.social.postsPerWeek * 4;
    pkgDesc = getPackageDef(detectPackage(ppm)).label;
  }

  const timeline = scope.serviceMode === "one_off" ? "A definir por escopo" : "Início imediato após aprovação";
  const incl = estimate.included.slice(0, 6);
  const excl = estimate.notIncluded.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Banner */}
      <div className="bg-[var(--success-bg)] border border-[#86EFAC] rounded-[8px] px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[#166534]">Proposta inicial pronta para revisão</p>
        <p className="text-[10px] text-[var(--success)] mt-0.5">
          Revise o escopo abaixo e envie para análise da Dioli.
        </p>
      </div>

      {/* Plano recomendado */}
      {pkgDesc && (
        <div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Plano recomendado</div>
          <p className="text-[11px] text-[var(--text-primary)] font-medium">{pkgDesc}</p>
        </div>
      )}

      {/* Investimento */}
      {estimate.totalMin > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Investimento estimado</div>
          {estimate.discountPct && estimate.discountedMin !== undefined ? (
            <>
              <p className="text-[11px] text-[var(--text-muted)] line-through">
                {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}/mês
              </p>
              <p className="text-[14px] font-bold text-[var(--success)]">
                {fmtBRL(estimate.discountedMin)} – {fmtBRL(estimate.discountedMax ?? estimate.discountedMin)}
                <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">/mês</span>
              </p>
              <p className="text-[9px] text-[var(--success)] mt-0.5">
                {estimate.discountPct}% de desconto{estimate.discountReason ? ` · ${estimate.discountReason}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-[var(--text-primary)]">
                {fmtBRL(estimate.totalMin)} – {fmtBRL(estimate.totalMax)}
                <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">/mês</span>
              </p>
              <p className="text-[9px] text-[var(--text-subtle)] mt-0.5">*Sujeito a detalhamento no escopo final</p>
            </>
          )}
        </div>
      )}

      {/* Prazo */}
      <div>
        <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Prazo de início</div>
        <p className="text-[11px] text-[var(--text-primary)]">{scope.deadline ?? timeline}</p>
      </div>

      {/* Incluso */}
      {incl.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">O que está incluso</div>
          {incl.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[var(--text-primary)] py-0.5">
              <span className="text-[var(--success)] shrink-0 font-bold">✓</span>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Não incluso */}
      {excl.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Não incluso</div>
          {excl.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-[var(--text-muted)] py-0.5">
              <span className="shrink-0">–</span>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Próximos passos */}
      <div className="bg-[var(--bg)] rounded-[8px] px-3 py-2.5">
        <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1">Próximos passos</div>
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Após o envio, nossa equipe revisa o escopo, prepara uma proposta formal e entra em contato em até 24h úteis.
        </p>
      </div>

      {/* CTA — Google sign-in or email fallback */}
      {useFallback ? (
        <EmailFallbackForm onSubmit={onEmailSubmit} loading={submitting} />
      ) : (
        <GoogleSignInButton
          onSuccess={onGoogleSuccess}
          onFallback={() => setUseFallback(true)}
          loading={submitting}
        />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

// ── Claude SDR integration ─────────────────────────────────────────────────────
// The conversational brain. Calls /api/sdr/chat for a natural reply + scope
// patch. Devolve `SdrOutcome` — o MOTIVO de qualquer falha, nunca só um
// `null` — para o chamador cair no motor de regras (Lei 2) e, quando o
// motivo for de rede (barrado/quebrado), avisar a pessoa. O patch de scope
// só PREENCHE lacunas do scope do motor de regras — nunca sobrescreve dado
// confirmado, para a estimativa ao vivo ficar estável.

// ⚠️ 16/08, terceiro beco: `fetchSdrReply` e `fetchUpload` achatavam TRÊS
// fatos opostos no mesmo `null` — "recusado por limite" (429), "sistema fora
// do ar" (503) e "sem novidade da IA" (200, nada usável). Achatado em `null`,
// o chamador não consegue avisar a pessoa do motivo certo, e o "aviso" que
// existia era zero: a próxima pergunta do roteiro (motor de regras) aparecia
// no lugar, cronologicamente coerente, como se fosse a SDR respondendo — a
// pessoa não vê uma falha, ela ACREDITA numa resposta normal. Pior que tela
// em branco: tela em branco a pessoa questiona, esta ela não questiona.
// A trava: `SdrOutcome`/`UploadOutcome` abaixo devolvem o MOTIVO, nunca só
// um booleano/null. Ver `avisoParaResultadoSdr` e `causaDaFalhaDeUpload` —
// são os únicos dois lugares que traduzem motivo em texto, para não haver
// dois textos divergentes para o mesmo fato em pontos diferentes da tela.
export type SdrOutcome =
  /** Passou pela rede e pelo parser: `reply` pode ainda ser `null` — é o caso
   *  já existente de fala barrada por CORTE (truncado/malformado) com
   *  `scope` resgatável (ver `MOTIVOS_COM_ESCOPO_APROVEITAVEL`). Isso não é
   *  erro de rede; o motor de regras sempre soube responder aqui. */
  | { kind: "resposta"; reply: string | null; scope: Record<string, unknown> }
  /** HTTP 429 — `limite-no-banco.ts` recusou porque a PESSOA está mandando
   *  rápido demais. Não é falha do sistema; é ritmo dela. */
  | { kind: "barrado" }
  /** HTTP 503, erro de rede (fetch lançou), ou corpo ilegível — o SISTEMA
   *  que falhou, não o ritmo dela. Fato oposto ao anterior: nunca cabe na
   *  mesma frase. */
  | { kind: "quebrado" }
  /** 200 mas nada aproveitável (sem fala usável, sem scope resgatável) — o
   *  silêncio de sempre (Lei 2, motor de regras responde). NÃO é erro: não
   *  gera aviso nenhum na tela. */
  | { kind: "sem_novidade" };

// Textos prontos — não reescrever. Decisão do `experiencia` (16/08): sem
// código de erro na tela, sem contagem de `Retry-After` (pode vir um número
// grande e assustador para quem caiu no balde compartilhado por culpa de
// outra pessoa na mesma rede — "aguarde alguns segundos" resolve a ansiedade
// sem mentir).
export const TEXTO_AVISO_BARRADO =
  "Você está mandando mensagens rápido demais. Espere alguns segundos e continue — sua conversa não foi perdida.";
export const TEXTO_AVISO_QUEBRADO =
  "Não conseguimos falar com a consultora agora. Continue digitando — sua mensagem foi salva, e você pode tentar de novo em instantes.";

export interface AvisoDeConversa {
  tipo: "barrado" | "quebrado";
  texto: string;
}

/** A ÚNICA função que traduz `SdrOutcome` em aviso visível. Pura e exportada
 *  de propósito: é o que prova, em teste, que o estado de aviso É produzido —
 *  não só que `fetchSdrReply` devolveu um `kind` diferente por baixo do pano. */
export function avisoParaResultadoSdr(outcome: SdrOutcome): AvisoDeConversa | null {
  if (outcome.kind === "barrado")  return { tipo: "barrado",  texto: TEXTO_AVISO_BARRADO };
  if (outcome.kind === "quebrado") return { tipo: "quebrado", texto: TEXTO_AVISO_QUEBRADO };
  return null;
}

// An uploaded briefing file and its processing status.
interface UploadItem {
  id: string;
  attachment: RequestAttachment;
  status: "uploading" | "done" | "error";
  /** Causa em português, só quando `status === "error"` — a doença idêntica
   *  à de `fetchSdrReply`: um selo "Falhou" igual para 429/503/formato ruim
   *  não diz se a pessoa espera 5s ou troca de arquivo. */
  motivo?: string;
}

interface UploadResult {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  mimeType: string;
  extractedText: string;
}

export type UploadOutcome =
  | { kind: "concluido"; result: UploadResult }
  | { kind: "barrado" }   // 429 — freio próprio do upload (12/60s, ver route.ts)
  | { kind: "quebrado" }  // 503, erro de rede, ou corpo ilegível
  | { kind: "rejeitado"; motivo: string }; // 400 — too_large, bad_request etc.

/** Espelha `avisoParaResultadoSdr`: única tradutora de motivo → texto para o
 *  item de upload. `rejeitado` chega com o `reason` cru do servidor (ex.:
 *  `"too_large"`) — a tradução para português mora só aqui. */
export function causaDaFalhaDeUpload(outcome: UploadOutcome): string | null {
  switch (outcome.kind) {
    case "barrado":
      return "Muitas mensagens em pouco tempo — espere alguns segundos e envie de novo.";
    case "quebrado":
      return "Não conseguimos ler o arquivo agora — tente de novo em instantes.";
    case "rejeitado":
      return outcome.motivo === "too_large"
        ? "Arquivo muito grande (máx. 20 MB) — envie um arquivo menor."
        : "Não conseguimos ler este arquivo — tente outro formato.";
    default:
      return null;
  }
}

async function fetchUpload(file: File): Promise<UploadOutcome> {
  let res: Response;
  try {
    const form = new FormData();
    form.append("file", file);
    res = await fetch("/api/sdr/upload", { method: "POST", body: form });
  } catch {
    return { kind: "quebrado" };
  }

  if (!res.ok) {
    if (res.status === 429) return { kind: "barrado" };
    if (res.status === 503) return { kind: "quebrado" };
    try {
      const body = (await res.json()) as { reason?: unknown };
      return { kind: "rejeitado", motivo: typeof body.reason === "string" ? body.reason : "desconhecido" };
    } catch {
      return { kind: "rejeitado", motivo: "desconhecido" };
    }
  }

  try {
    const data = (await res.json()) as { ok?: boolean } & Partial<UploadResult>;
    if (!data.ok) return { kind: "rejeitado", motivo: "desconhecido" };
    return {
      kind: "concluido",
      result: {
        fileName:      data.fileName ?? file.name,
        fileType:      data.fileType ?? "FILE",
        sizeBytes:     data.sizeBytes ?? file.size,
        mimeType:      data.mimeType ?? file.type,
        extractedText: data.extractedText ?? "",
      },
    };
  } catch {
    return { kind: "quebrado" };
  }
}

// Motivos de `ok:false` cujo `scope` é SEGURO aproveitar: o pacote só não
// chegou inteiro por corte de tamanho ou formato quebrado — o escopo que veio
// é bom e incompleto, não suspeito. `email_hallucination` e `price_leak` NÃO
// entram aqui: ali o modelo estava comprovadamente fora do roteiro (inventou
// e-mail ou vazou preço) no MESMO turno que produziu aquele `scope`, e não há
// como provar que o campo recuperado não é parte do mesmo desvio. Corte é bom
// e incompleto; guarda é suspeito — são fatos opostos, não cabem no mesmo balde.
//
// A lista é ALLOWLIST, não denylist, de propósito: um motivo que ninguém
// previu ainda cai fora por omissão (fail-closed), nunca dentro por omissão.
// Isso importa porque hoje `app/api/sdr/chat/route.ts` MANDA `scope` também
// junto de `email_hallucination`/`price_leak` (o guarda barra a FALA, não o
// dado) — não há mais "ausência do campo" te protegendo por acidente. A
// decisão de descartar esses dois mora só aqui, na allowlist.
//
// ⚠️ OS NOMES MUDARAM NO MERGE DE 16/08 ("Reconcilia TRÊS consertos
// paralelos", `5d806a60`). Antes a rota emitia `parse_error_truncado` /
// `parse_error_formato`; hoje emite `truncado` / `malformado` (ver
// `app/api/sdr/chat/route.ts:580` e `:607`). Esta allowlist ficou apontando
// para os nomes mortos por algumas horas — fail-closed segurou (nada vazou),
// mas o resgate do dia (R$ 500/mês, 2 posts/dia) teria ficado DESLIGADO em
// produção, em silêncio, porque nenhum teste comparava os dois lados. É por
// isso que existe `__tests__/esteira/allowlist-bate-com-o-servidor.test.ts`:
// ele exercita a rota de verdade e confere o `reason` real contra esta
// constante, para que renomear de novo quebre um teste em vez de desligar o
// resgate sem ninguém notar.
// Exportada (16/08, segunda rodada) para que
// `__tests__/esteira/allowlist-bate-com-o-servidor.test.ts` a importe em vez
// de repetir os nomes como string literal — é a trava contra a allowlist
// divergir do servidor de novo, em silêncio, na próxima vez que alguém
// renomear um `reason`.
export const MOTIVOS_COM_ESCOPO_APROVEITAVEL: ReadonlySet<string> = new Set([
  "truncado",
  "malformado",
]);

// Exportada para teste direto (16/08): o contrato "scope sobrevive quando a
// fala não sobrevive" é lógica, não prosa de prompt — e lógica se testa
// chamando a função, não lendo o arquivo como texto.
export async function fetchSdrReply(
  priorMessages: ConvMessage[],
  currentMessage: string,
  scope: BriefingScope,
  // O fio da conversa. Sem ele, cada turno vira uma conversa órfã no registro e
  // ninguém consegue ler a história de ponta a ponta — que é o motivo de o
  // registro existir. O servidor prefixa e higieniza; aqui é só o carimbo.
  sessionId: string,
): Promise<SdrOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/sdr/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: priorMessages.map((m) => ({ role: m.role, text: m.text })),
        currentMessage,
        scope,
        sessionId,
      }),
    });
  } catch {
    // Rede fora do ar antes de qualquer resposta HTTP — mesma família do 503:
    // o sistema falhou, não o ritmo da pessoa.
    return { kind: "quebrado" };
  }

  if (!res.ok) {
    // 429 = balde estourado (`limite-no-banco.ts`, motivo "estourou"): ritmo
    // dela. Qualquer outro status (503 = contador indisponível, ou algo
    // inesperado) é "quebrado": o sistema que falhou. Os dois são fatos
    // opostos e não cabem na mesma frase (ver `avisoParaResultadoSdr`).
    return res.status === 429 ? { kind: "barrado" } : { kind: "quebrado" };
  }

  let data: { ok?: boolean; reply?: unknown; scope?: unknown; reason?: unknown };
  try {
    data = (await res.json()) as { ok?: boolean; reply?: unknown; scope?: unknown; reason?: unknown };
  } catch {
    return { kind: "quebrado" };
  }

  // O contrato mudou em 16/08 (caso do R$ 500 / 2 posts por dia): `ok: false`
  // deixou de significar "nada aproveitável". Quando a fala é barrada por
  // CORTE — pacote truncado, formato quebrado —, o servidor ainda pode
  // devolver o `scope` que sobreviveu, e ele é bom e incompleto: aproveita-se.
  // Jogar fora a resposta inteira só porque `ok` é false jogaria fora de novo
  // o dado que este conserto existe para salvar: o número que o cliente falou
  // uma vez, ninguém recupera.
  //
  // Mas ORDEM DO DIRETOR, 16/08: "não afrouxe nada" — `email_hallucination` e
  // `price_leak` continuam descartando o pacote INTEIRO, porque ali o escopo
  // não é incompleto, é SUSPEITO: o modelo estava comprovadamente fora do
  // roteiro (inventou e-mail ou vazou preço) no mesmo turno em que produziu
  // aquele `scope`. Corte e guarda são fatos opostos; só o motivo (`reason`,
  // que o servidor já manda) distingue um do outro — por isso o aproveitamento
  // do `scope` passa pela allowlist abaixo, não por "veio `scope`, aproveita".
  // `reply` só é aceito quando `ok: true`.
  const replyUsavel =
    data.ok === true && typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
  const motivoAprovaEscopo =
    data.ok === true || (typeof data.reason === "string" && MOTIVOS_COM_ESCOPO_APROVEITAVEL.has(data.reason));
  const scopeRecuperado =
    motivoAprovaEscopo && data.scope && typeof data.scope === "object" ? (data.scope as Record<string, unknown>) : {};

  // Nem fala nem scope: não há nada aqui que valha a pena carregar — cai no
  // fallback inteiro do motor de regras, como sempre foi. Isto NÃO é erro
  // (o servidor respondeu 200): "sem novidade da IA", nenhum aviso na tela.
  if (replyUsavel === null && Object.keys(scopeRecuperado).length === 0) return { kind: "sem_novidade" };

  return { kind: "resposta", reply: replyUsavel, scope: scopeRecuperado };
}

function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Gap-fill merge: only writes fields the rule-based scope hasn't already set.
// Exportada pelo mesmo motivo que `fetchSdrReply`: é aqui que o scope
// recuperado de uma fala barrada realmente entra no pedido do cliente.
export function mergeScopeGaps(base: BriefingScope, patch: Record<string, unknown>): BriefingScope {
  if (!patch || typeof patch !== "object") return base;
  const out: BriefingScope = { ...base };

  // ── A RETRATAÇÃO ATRAVESSA O GAP-FILL PORQUE ELA SÓ CRESCE ───────────────
  //
  // Este merge é gap-fill DECLARADO: por construção ele não apaga nada. Foi
  // por aqui que o telefone retratado voltou em produção (8ª volta) — o
  // servidor tinha ouvido "esquece o WhatsApp" e mandado o patch sem o campo,
  // e "campo ausente" aqui significa "preserva o que já havia".
  //
  // A marca (`canaisRetratados`) é a única forma que atravessa: ela é positiva
  // e cumulativa. O apagamento acontece DEPOIS do merge, uma vez, lendo a
  // marca — e não vira uma segunda regra de deleção espalhada pelos campos.
  // Ver `lib/agency/comercial/retratacao.ts`.

  const fillStr = (key: "prospectName" | "businessName" | "segment" | "targetAudience" | "prospectPhone" | "budgetRange" | "deadline") => {
    if (!out[key] && typeof patch[key] === "string" && (patch[key] as string).trim()) {
      out[key] = (patch[key] as string).trim();
    }
  };
  fillStr("prospectName"); fillStr("businessName"); fillStr("segment"); fillStr("targetAudience");
  fillStr("prospectPhone"); fillStr("budgetRange"); fillStr("deadline");

  if (!out.prospectEmail && typeof patch.prospectEmail === "string"
      && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.prospectEmail)) {
    out.prospectEmail = patch.prospectEmail.trim();
  }

  // Infer service intent from the data Claude returns: if it sent a social/
  // traffic/branding sub-object with real content, the prospect clearly wants
  // that service even if the boolean flag wasn't set explicitly. This is what
  // lets the live estimate compute reliably from the conversation.
  const ps0 = patch.social  as Record<string, unknown> | undefined;
  const pt0 = patch.traffic as Record<string, unknown> | undefined;
  const pb0 = patch.branding as Record<string, unknown> | undefined;
  const socialImplied =
    patch.wantsSocialMedia === true ||
    (!!ps0 && typeof ps0 === "object" &&
      (asNum(ps0.postsPerWeek) !== undefined ||
       (Array.isArray(ps0.platforms) && ps0.platforms.length > 0) ||
       asNum(ps0.reelsPerMonth) !== undefined ||
       asNum(ps0.storiesPerWeek) !== undefined));
  const trafficImplied =
    patch.wantsPaidTraffic === true ||
    (!!pt0 && typeof pt0 === "object" && typeof pt0.monthlyAdBudget === "string" && pt0.monthlyAdBudget.trim().length > 0);

  if (!out.wantsSocialMedia && (socialImplied || patch.wantsSocialMedia === false)) {
    out.wantsSocialMedia = socialImplied;
  }
  if (out.wantsPaidTraffic === undefined && (trafficImplied || patch.wantsPaidTraffic === false)) {
    out.wantsPaidTraffic = trafficImplied;
  }
  // serviceMode: allow the SDR to UPGRADE the engagement (e.g. one_off → umbrella)
  // since classification sharpens as the conversation deepens.
  if (typeof patch.serviceMode === "string"
      && ["monthly", "one_off", "umbrella", "unsure"].includes(patch.serviceMode)) {
    if (out.serviceMode === undefined || out.serviceMode === "unsure") {
      out.serviceMode = patch.serviceMode as BriefingScope["serviceMode"];
    }
  }

  // decisionMaker — gap-fill once known.
  if (out.decisionMaker === undefined && typeof patch.decisionMaker === "boolean") {
    out.decisionMaker = patch.decisionMaker;
  }

  // competitors — accumulate.
  if (Array.isArray(patch.competitors) && patch.competitors.length) {
    const merged = new Set([
      ...(out.competitors ?? []),
      ...patch.competitors.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()),
    ]);
    out.competitors = [...merged].slice(0, 6);
  }

  // negotiation — the SDR OWNS this (server enforces the margin floor), so the
  // patch is authoritative when present. Never invented client-side.
  const pn = patch.negotiation as Record<string, unknown> | undefined;
  if (pn && typeof pn === "object" && typeof pn.discountPct === "number" && pn.discountPct > 0) {
    out.negotiation = {
      discountPct: pn.discountPct,
      discountReason: typeof pn.discountReason === "string" ? pn.discountReason : undefined,
      appliedLevers: Array.isArray(pn.appliedLevers)
        ? pn.appliedLevers.filter((x): x is string => typeof x === "string")
        : undefined,
    };
  }

  // ── AS LACUNAS ATRAVESSAM (24/08/2026) ──────────────────────────────────
  // Quando o servidor para de repetir a pergunta pela terceira vez, a instrução
  // gêmea é registrar a resposta CRUA do cliente como lacuna e avançar (ver
  // `lib/agency/comercial/pergunta-repetida.ts`). Essa lacuna chega no `scope`
  // do turno e precisa chegar ao pedido: é ela que segura a confiança do
  // orçamento lá embaixo e que faz alguém perguntar depois, fora do caminho
  // crítico do cliente. Sem esta ligação o freio calaria a pergunta e perderia
  // o que o cliente disse — trocando um defeito por outro pior.
  if (Array.isArray(patch.lacunasDeEscopo) && patch.lacunasDeEscopo.length) {
    out.lacunasDeEscopo = unirLacunas(
      out.lacunasDeEscopo,
      patch.lacunasDeEscopo as LacunaDeEscopo[],
    );
  }

  if (Array.isArray(patch.objectives) && patch.objectives.length) {
    const merged = new Set([
      ...(out.objectives ?? []),
      ...patch.objectives.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()),
    ]);
    out.objectives = [...merged].slice(0, 6);
  }

  const pb = pb0;
  if (pb && typeof pb === "object") {
    out.branding = {
      requested:    out.branding?.requested    || pb.requested === true,
      hasBrandBook: out.branding?.hasBrandBook || pb.hasBrandBook === true,
      wantsRebrand: out.branding?.wantsRebrand || pb.wantsRebrand === true,
      deliverables: out.branding?.deliverables ?? (typeof pb.deliverables === "string" ? pb.deliverables.trim() : undefined),
    };
  }

  const ps = ps0;
  if (ps && typeof ps === "object" && (out.wantsSocialMedia || socialImplied)) {
    const cur = out.social ?? { platforms: [] };
    const bool = (v: unknown, fallback: boolean | undefined) =>
      typeof v === "boolean" ? v : fallback;
    out.social = {
      platforms:     cur.platforms?.length ? cur.platforms
                       : Array.isArray(ps.platforms) ? (ps.platforms as unknown[]).filter((x): x is string => typeof x === "string") : [],
      postsPerWeek:  cur.postsPerWeek  ?? asNum(ps.postsPerWeek),
      storiesPerWeek: cur.storiesPerWeek ?? asNum(ps.storiesPerWeek),
      reelsPerMonth: cur.reelsPerMonth ?? asNum(ps.reelsPerMonth),
      needsCopy:     cur.needsCopy     ?? (typeof ps.needsCopy === "boolean" ? ps.needsCopy : undefined),
      hasPhotos:     cur.hasPhotos     ?? (typeof ps.hasPhotos === "boolean" ? ps.hasPhotos : undefined),
      hasVideomaker:        cur.hasVideomaker        ?? bool(ps.hasVideomaker, undefined),
      needsVideoProduction: cur.needsVideoProduction ?? bool(ps.needsVideoProduction, undefined),
      creativesReady:       cur.creativesReady       ?? bool(ps.creativesReady, undefined),
      hasReferences:        cur.hasReferences        ?? bool(ps.hasReferences, undefined),
      postingGoal:   cur.postingGoal ?? (typeof ps.postingGoal === "string" ? ps.postingGoal : undefined),
    };
  }

  const pt = pt0;
  if (pt && typeof pt === "object" && (out.wantsPaidTraffic || trafficImplied)) {
    const cur = out.traffic ?? { platforms: [] };
    out.traffic = {
      platforms:       cur.platforms?.length ? cur.platforms
                         : Array.isArray(pt.platforms) ? (pt.platforms as unknown[]).filter((x): x is string => typeof x === "string") : [],
      monthlyAdBudget: cur.monthlyAdBudget ?? (typeof pt.monthlyAdBudget === "string" ? pt.monthlyAdBudget : undefined),
    };
  }

  const saida = out as unknown as Record<string, unknown>;
  const retratado = escopoComRetratacao({ ...saida, ...patch }, "");
  const marcas = retratado.canaisRetratados;
  if (Array.isArray(marcas) && marcas.length > 0) {
    saida.canaisRetratados = marcas;
    for (const canal of marcas) {
      const campo = CAMPO_DO_CANAL[canal as "whatsapp" | "email"];
      if (campo) delete saida[campo];
    }
    if (typeof retratado.preferredChannel === "string") {
      saida.preferredChannel = retratado.preferredChannel;
    }
  }

  return out;
}

// ── Briefing file upload zone ──────────────────────────────────────────────────
// Compact drag-and-drop uploader for the public briefing. Accepts the briefing
// itself (Word, PDF), plus references (images, slides). Uploading + read status
// is shown per file; the SDR reads extractable documents automatically.

const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.md";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BriefingFileUpload({
  items,
  onPick,
  onRemove,
}: {
  items: UploadItem[];
  onPick: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(Array.from(e.dataTransfer.files)); }}
        className={`border-2 border-dashed rounded-[10px] px-4 py-5 text-center cursor-pointer transition-all select-none ${
          dragOver ? "border-[var(--navy)] bg-[var(--accent-light)]" : "border-[var(--border)] bg-white hover:border-[var(--text-muted)] hover:bg-[var(--bg)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          onChange={(e) => { onPick(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          className="hidden"
          aria-label="Selecionar arquivos do briefing"
        />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={`mx-auto mb-1.5 ${dragOver ? "text-[var(--navy)]" : "text-[var(--text-muted)]"}`}>
          <path d="M21 15V19A2 2 0 0119 21H5A2 2 0 013 19V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className={`text-[12px] font-medium ${dragOver ? "text-[var(--navy)]" : "text-[var(--text-primary)]"}`}>
          {dragOver ? "Solte aqui" : "Arraste ou clique para enviar"}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
          Briefing em Word/PDF, fotos, cardápio, referências. A Dioli lê o documento automaticamente.
        </p>
        <p className="text-[9px] text-[var(--text-subtle)] mt-0.5">PDF, DOC, DOCX, PPT, PNG, JPG, SVG, TXT · máx. 20 MB</p>
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2.5 bg-white border border-[var(--border)] rounded-[8px] px-2.5 py-2">
              <div className="w-7 h-7 rounded-[6px] bg-[var(--accent)] flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold text-[var(--text-secondary)] leading-none">{it.attachment.fileType}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{it.attachment.fileName}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{fmtBytes(it.attachment.sizeBytes)}</p>
                {/* Uma linha de causa junto do item — mesma doença de
                    `fetchSdrReply`, mesmo remédio: "Falhou" sozinho não diz
                    se a pessoa espera 5s (429/503) ou troca de arquivo
                    (rejeitado). `role="alert"` porque é a mesma família de
                    aviso do `micError`/`avisoConversa`. */}
                {it.status === "error" && it.motivo && (
                  <p role="alert" className="text-[10px] text-[var(--danger)] mt-0.5">{it.motivo}</p>
                )}
              </div>
              {it.status === "uploading" && (
                <span className="h-4 px-1.5 rounded-[3px] bg-[var(--warning-bg)] text-[9px] font-semibold text-[var(--warning)] shrink-0 whitespace-nowrap">
                  Lendo…
                </span>
              )}
              {it.status === "done" && (
                <span className="h-4 px-1.5 rounded-[3px] bg-[var(--success-bg)] text-[9px] font-semibold text-[var(--success)] shrink-0 whitespace-nowrap">
                  Anexado
                </span>
              )}
              {it.status === "error" && (
                <span className="h-4 px-1.5 rounded-[3px] bg-[#FEE2E2] text-[9px] font-semibold text-[var(--danger)] shrink-0 whitespace-nowrap">
                  Falhou
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(it.id); }}
                aria-label={`Remover ${it.attachment.fileName}`}
                className="text-[var(--text-subtle)] hover:text-[var(--danger)] transition-colors shrink-0 text-[16px] leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Gera o `tempClientId` da sala — o mesmo valor que vira `sessionId` mandado
 * para `/api/sdr/chat` e chave do freio por sessão (`limite-no-banco.ts`).
 *
 * Extraída como função própria (em vez de literal dentro do `useState`) para
 * ser testável sem montar o componente inteiro — ver
 * `__tests__/briefing/session-id-nao-e-previsivel.test.ts`, que prova as duas
 * metades do achado 1 do `seguranca` (16/08/2026): que o valor não é mais
 * adivinhável a partir do relógio, e que ele sobrevive à higienização de
 * `fioDaConversa` sem virar `"sem-sessao"`.
 */
export function gerarTempClientId(): string {
  return `prospect-${Date.now()}-${crypto.randomUUID()}`;
}

/**
 * O contato da porta serve para FECHAR o briefing sem perguntar de novo?
 *
 * Só serve com nome E pelo menos um canal — que é exatamente a regra que a
 * própria porta aplica (`LeadNaPorta`: nome obrigatório, e-mail OU WhatsApp).
 * Sem canal não há para onde mandar a proposta, e aí a pergunta do fecho é a
 * última chance de existir um endereço: pular ali seria trocar uma grosseria
 * (perguntar duas vezes) por um prejuízo (briefing sem retorno possível).
 *
 * Devolve `null` quando a porta foi pulada ou veio incompleta — e `null` aqui
 * significa "siga pelo passo de contato", nunca "descarte o briefing".
 *
 * Função pura e exportada de propósito: a decisão é regra de negócio e se prova
 * chamando, sem montar a sala inteira.
 */
export function contatoUsavelDaPorta(
  daPorta: ContatoInicial | undefined,
): { nome: string; email: string; whatsapp: string } | null {
  const nome = daPorta?.nome?.trim();
  if (!nome) return null;
  const email = daPorta?.email?.trim() ?? "";
  const whatsapp = daPorta?.whatsapp?.trim() ?? "";
  if (!email && !whatsapp) return null;
  return { nome, email, whatsapp };
}

export function PublicBriefingRoom({ onSubmit, contatoDaPorta }: PublicBriefingRoomProps) {
  // O contato da porta entra na semente do estado — antes do primeiro turno,
  // não depois. Se entrasse por `useEffect`, a saudação já teria sido escrita
  // pedindo o nome e a correção chegaria tarde demais para a pessoa que leu.
  const [state,          setState]          = useState<ProspectConvState>(() => initProspectConvState(contatoDaPorta));
  const [inputText,      setInputText]      = useState("");
  const [showMaterials,  setShowMaterials]  = useState(false);
  const [linkAtts,       setLinkAtts]       = useState<RequestAttachment[]>([]);
  const [fileItems,      setFileItems]      = useState<UploadItem[]>([]);
  const [aiThinking,     setAiThinking]     = useState(false);
  // Terceiro beco sem saída em silêncio (16/08): barrado (429) e quebrado
  // (503/rede) viravam `null` e a próxima pergunta do roteiro — motor de
  // regras — parecia resposta normal da SDR. `avisoConversa` é o estado que
  // prova que a falha É comunicada; `enviarEsfriando` estende o mesmo
  // `disabled` que `aiThinking` já usa, por alguns segundos após um 429, para
  // a pessoa compor a próxima frase sem martelar o botão — a conversa NÃO
  // morre, só espera.
  const [avisoConversa,  setAvisoConversa]  = useState<AvisoDeConversa | null>(null);
  const [enviarEsfriando, setEnviarEsfriando] = useState(false);
  const esfriamentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Combined attachment list (uploaded files first, then shared links).
  const attachments: RequestAttachment[] = [
    ...fileItems.filter((f) => f.status !== "error").map((f) => f.attachment),
    ...linkAtts,
  ];
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // Internal temp ID for link association — e é o `sessionId` que vai para
  // `/api/sdr/chat` e vira a chave do freio por sessão (`limite-no-banco.ts`).
  // Geração em `gerarTempClientId` (comentário lá explica o porquê do
  // `crypto.randomUUID()`). `useState(gerarTempClientId)` — não `useMemo`,
  // não literal solto — garante que o valor nasce UMA vez por montagem do
  // componente e não muda a cada render: se mudasse, o freio por sessão
  // nunca acumularia contagem e o registro da conversa (`PortalMessage`)
  // fragmentaria em vários fios.
  const [tempClientId] = useState(gerarTempClientId);

  const conv = state.conv;
  const sdr  = state.sdr;

  // Latest committed state, readable inside async turns without stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv.messages, aiThinking]);

  // "Alguns segundos" (item 5 da ficha): tempo para compor a próxima frase
  // enquanto o balde (60/30min) ainda não liberou, sem travar o textarea
  // inteiro. Limpa o timer anterior a cada novo 429 — nunca dois timers
  // correndo, nunca o botão liberando cedo demais por um timer velho.
  const ESFRIAMENTO_MS = 6000;
  const iniciarEsfriamentoDeEnvio = useCallback(() => {
    setEnviarEsfriando(true);
    if (esfriamentoRef.current) clearTimeout(esfriamentoRef.current);
    esfriamentoRef.current = setTimeout(() => setEnviarEsfriando(false), ESFRIAMENTO_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (esfriamentoRef.current) clearTimeout(esfriamentoRef.current);
    };
  }, []);

  // Append transcribed text to input (never auto-submits; user reviews before sending)
  const handleTranscript = useCallback((text: string) => {
    setInputText((prev) => (prev ? prev.trimEnd() + " " + text : text));
  }, []);

  const {
    isListening,
    isTranscribing,
    isSupported,
    error: micError,
    modo: micModo,
    segundos: micSegundos,
    mensagemIndisponivel: micIndisponivel,
    startListening,
    stopListening,
  } = useSpeechToText({ onTranscript: handleTranscript });

  // ── AI extraction (async, fire-and-forget) ────────────────────────────────
  // Sends the conversation + new message to the server; Claude Haiku extracts
  // structured fields the rule-based regex may have missed. Only fills empty
  // scope fields — never overwrites confirmed data. Failure is silent (Lei 2:
  // rule-based is the universal fallback).
  const fireAiExtract = useCallback(
    async (userText: string, messages: typeof conv.messages) => {
      try {
        const res = await fetch("/api/brain/briefing-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, text: m.text })),
            currentMessage: userText,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; extracted?: Record<string, unknown> };
        if (!data.ok || !data.extracted) return;
        const ex = data.extracted;

        setState((prev) => {
          const scope = prev.conv.scope;
          let changed = false;
          const patch: Partial<typeof scope> = {};

          if (!scope.prospectName && typeof ex.prospectName === "string" && ex.prospectName.trim()) {
            patch.prospectName = ex.prospectName.trim();
            changed = true;
          }
          if (!scope.businessName && typeof ex.businessName === "string" && ex.businessName.trim()) {
            patch.businessName = ex.businessName.trim();
            changed = true;
          }
          if (
            !scope.prospectEmail &&
            typeof ex.prospectEmail === "string" &&
            /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ex.prospectEmail)
          ) {
            patch.prospectEmail = ex.prospectEmail.trim();
            changed = true;
          }
          if (
            !scope.prospectPhone &&
            typeof ex.prospectPhone === "string" &&
            ex.prospectPhone.replace(/\D/g, "").length >= 8
          ) {
            patch.prospectPhone = ex.prospectPhone.trim();
            changed = true;
          }
          if (!scope.segment && typeof ex.segment === "string" && ex.segment.trim()) {
            patch.segment = ex.segment.trim();
            changed = true;
          }

          if (!changed) return prev;

          const newScope = { ...scope, ...patch };

          // Recompute which identity questions are now satisfied so the engine
          // skips them on the next turn — only adds to the set, never removes.
          const newAnswered = new Set(prev.conv.answeredQIds);
          if (newScope.prospectName && newScope.businessName) newAnswered.add("prospect_name_biz");
          if (newScope.prospectEmail)  newAnswered.add("prospect_email");
          if (newScope.prospectPhone)  newAnswered.add("prospect_phone");

          return {
            ...prev,
            conv: { ...prev.conv, scope: newScope, answeredQIds: [...newAnswered] },
          };
        });
      } catch {
        // Silent — rule-based result stays
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Runs one conversational turn. Claude (the SDR brain) generates the reply
  // and a scope patch; the rule-based engine runs underneath for state tracking
  // and as the universal fallback (Lei 2) if Claude is unavailable.
  const runTurn = useCallback(
    // `text` is what the prospect sees in their bubble. `sdrText` (optional) is
    // what Claude actually reads — used to feed an uploaded briefing's extracted
    // content to the SDR without dumping the whole document into the chat.
    async (text: string, sdrText?: string) => {
      const prevState = stateRef.current;
      const priorMessages = prevState.conv.messages;
      const fileNames = attachmentsRef.current.map((a) => a.fileName);

      // Rule-based baseline: authoritative state machine (sdr, scope, flow).
      const ruleResult = processProspectMessage(text, prevState, fileNames);
      const ruleMessages = ruleResult.conv.messages;
      const userVisible = ruleMessages.slice(0, -1); // prior + user msg, no reply yet
      const ruleAssistant = ruleMessages[ruleMessages.length - 1];

      // Show the user's message immediately with a typing indicator.
      setState({ ...ruleResult, conv: { ...ruleResult.conv, messages: userVisible } });
      setAiThinking(true);

      const outcome = await fetchSdrReply(priorMessages, sdrText ?? text, ruleResult.conv.scope, tempClientId);
      setAiThinking(false);

      if (outcome.kind === "resposta") {
        // Turno saudável — se havia aviso de uma tentativa anterior, ele sai
        // da tela agora. Não deixar preso depois que o freio libera: a
        // pessoa desiste antes de descobrir que já pode mandar de novo.
        setAvisoConversa(null);

        // O scope aplica o gap-fill mesmo quando a fala foi barrada por CORTE
        // — é a metade que sobrevive quando a outra não sobrevive (caso do
        // R$ 500 / 2 posts por dia, 16/08). Sem fala usável, quem responde ao
        // visitante é o motor de regras — nunca uma frase cortada no meio.
        const mergedScope = mergeScopeGaps(ruleResult.conv.scope, outcome.scope);
        const estimate = computeEstimate(mergedScope);
        const assistantMsg: ConvMessage = outcome.reply
          ? { ...ruleAssistant, text: outcome.reply }
          : ruleAssistant;
        const newConv: ConvState = {
          ...ruleResult.conv,
          scope: mergedScope,
          estimate,
          messages: [...userVisible, assistantMsg],
        };
        setState({
          conv: { ...newConv, canSubmit: canSubmitProposal(newConv, ruleResult.sdr) },
          sdr: ruleResult.sdr,
        });
      } else {
        // Fallback: rule-based reply + the lighter extraction pass — igual a
        // sempre, para os três motivos (barrado, quebrado, sem_novidade).
        // `fireAiExtract` não muda: seu silêncio é fallback de segundo plano,
        // correto, e não é aqui que o defeito mora.
        setState(ruleResult);
        void fireAiExtract(text, priorMessages);

        // `avisoParaResultadoSdr` devolve `null` para "sem_novidade" (não é
        // erro, servidor respondeu 200) — o aviso, se havia, some junto.
        // Um aviso só; se o motivo mudou (barrado → quebrado), o texto troca
        // em vez de empilhar.
        setAvisoConversa(avisoParaResultadoSdr(outcome));
        if (outcome.kind === "barrado") iniciarEsfriamentoDeEnvio();
      }
    },
    [fireAiExtract, tempClientId, iniciarEsfriamentoDeEnvio],
  );

  // ── File upload (briefing documents) ──────────────────────────────────────
  // Uploads each picked file, extracts its text server-side, and — when text is
  // found — feeds the briefing to Claude so it reads the document and continues
  // the conversation. The file is always listed as an attachment.
  const uid = () => "up" + Math.random().toString(36).slice(2, 10);

  const handleFilesPicked = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const id = uid();
        const optimistic: RequestAttachment = {
          id,
          clientId: tempClientId,
          fileName: file.name,
          fileType: (file.name.split(".").pop()?.toUpperCase() ?? "FILE"),
          mimeType: file.type,
          sizeBytes: file.size,
          source: "briefing_room",
          createdAt: new Date().toISOString(),
          storageStatus: "local_only",
        };
        setFileItems((prev) => [...prev, { id, attachment: optimistic, status: "uploading" }]);

        const outcome = await fetchUpload(file);

        if (outcome.kind !== "concluido") {
          // Mesma doença de `fetchSdrReply`, mesmo remédio: 429, 503 e "tipo
          // não suportado" viravam o mesmo selo "Falhou", sem dizer se a
          // pessoa espera 5 segundos ou troca de arquivo. `causaDaFalhaDeUpload`
          // é a única tradutora — uma linha de causa junto do item.
          const motivo = causaDaFalhaDeUpload(outcome) ?? undefined;
          setFileItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", motivo } : it)));
          continue;
        }

        const result = outcome.result;
        setFileItems((prev) =>
          prev.map((it) =>
            it.id === id
              ? {
                  ...it,
                  status: "done",
                  attachment: { ...it.attachment, fileType: result.fileType, mimeType: result.mimeType },
                }
              : it,
          ),
        );

        // If we extracted briefing content, let the SDR read it.
        if (result.extractedText.trim()) {
          const visible = montarAvisoDeAnexo(result.fileName);
          const sdrText =
            `O cliente anexou um arquivo de briefing chamado "${result.fileName}". ` +
            `Leia o conteúdo abaixo, extraia tudo que for relevante (negócio, segmento, serviços, ` +
            `objetivos, quantidades, prazos, contato) para o scope e dê continuidade à conversa de ` +
            `forma natural, confirmando os pontos principais que entendeu.\n\n` +
            `--- CONTEÚDO DO BRIEFING ---\n${result.extractedText}`;
          void runTurn(visible, sdrText);
        }
      }
    },
    [tempClientId, runTurn],
  );

  const removeFileItem = useCallback((id: string) => {
    setFileItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  function handleSend() {
    const text = inputText.trim();
    if (!text || aiThinking || enviarEsfriando) return;
    setInputText("");
    void runTurn(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function sendAction(text: string) {
    if (aiThinking || enviarEsfriando) return;
    void runTurn(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const [submitting, setSubmitting] = useState(false);

  // Submit único — Google, formulário, ou "prefiro não deixar contato agora".
  //
  // ⚠️ O caminho SEM contato passa por aqui do mesmo jeito, e é isso que importa:
  // a conversa sobe, grava e aparece na fila. Quem decide se vira proposta é o
  // SERVIDOR (`POST /api/brain/client-requests`), não esta tela — esta rota é
  // pública e um POST direto passa por cima de qualquer `disabled` de botão.
  function handleSubmitWithContact(contato: { nome: string; email: string; whatsapp: string } | null) {
    if (submitting) return;
    setSubmitting(true);
    const scope = conv.scope;
    const mergedScope: BriefingScope = {
      ...scope,
      // ── O E-MAIL QUE ELE DEU NA CONVERSA É O ÚLTIMO RECURSO (6ª rodada) ──
      //
      // Ordem, e ela é intencional: a PORTA primeiro (declaração explícita num
      // campo de contato), o escopo depois, e por último o que ele escreveu no
      // meio da conversa. Palpite nunca passa na frente de declaração.
      //
      // Sem esta terceira parcela, quem pulava a porta e escreveu o e-mail na
      // conversa entregava o briefing SEM canal nenhum: o dado existia, o
      // consumidor existia, e não havia ligação entre os dois — a "seta
      // faltando" que esta casa já conhece (D-003). Medido no cliente oculto.
      //
      // ⛔ Ele vem de `sdr.contatoOferecido`, NUNCA do `scope`: e-mail não
      // trafega pelo caminho do modelo. Ver `SDRAgentState.contatoOferecido`.
      prospectEmail: contato?.email || scope.prospectEmail || sdr.contatoOferecido?.email,
      // ── O QUE ELE DESDISSE NA CONVERSA VENCE O QUE ELE DEIXOU NA PORTA ────
      //
      // Aqui era o SEGUNDO cano do número retratado (8ª volta): a porta vem
      // primeiro nesta linha — e ela é ANTERIOR à retratação. O cliente deixou
      // o WhatsApp ao entrar, disse "esquece o WhatsApp" dez turnos depois, e
      // este `||` devolvia o número da porta na hora do envio.
      //
      // Declaração mais NOVA manda sobre declaração mais VELHA. A porta continua
      // ganhando de palpite; ela não ganha de retratação.
      prospectPhone: canalFoiRetratado(scope, "whatsapp")
        ? undefined
        : contato?.whatsapp || scope.prospectPhone,
      prospectName:  scope.prospectName ?? contato?.nome ?? "",
    };
    const rawText = buildRawText(conv.messages);
    onSubmit({
      conversationTranscript: conv.messages,
      v2Scope:          mergedScope,
      v2Estimate:       conv.estimate,
      attachments,
      extractedSummary: buildExtractedSummary(mergedScope),
      rawText,
      title:            buildTitle(mergedScope),
      prospectName:     mergedScope.prospectName ?? "",
      prospectEmail:    mergedScope.prospectEmail ?? "",
      prospectPhone:    mergedScope.prospectPhone ?? "",
      businessName:     mergedScope.businessName ?? "",
      segment:          mergedScope.segment ?? "",
      sdrHandoff:       buildHandoffSummary(conv, sdr),
      // E o `contato` bruto vai pelo mesmo crivo: ele é gravado como
      // `briefingJson.contato` e é DELE que a solicitação tira `contato.whatsapp`
      // — o terceiro lugar onde o número retratado reapareceu.
      contato: contato && canalFoiRetratado(scope, "whatsapp")
        ? { ...contato, whatsapp: "" }
        : contato,
    });
  }

  const [confirmStep, setConfirmStep] = useState<"pending" | "confirmed">("pending");

  // ── O MESMO DEFEITO ESTAVA ESPERANDO NA LINHA DE CHEGADA ───────────────────
  //
  // 23/08/2026: o passo final pede *"Falta só uma coisa: para onde mandamos sua
  // proposta"* — para TODO MUNDO, inclusive para quem digitou nome, e-mail e
  // WhatsApp na porta cinco minutos antes. É o mesmo "ninguém prestou atenção"
  // que o CEO viu na primeira fala, só que no pior lugar possível: na hora de
  // fechar, depois de a pessoa ter contado o negócio inteiro.
  //
  // Com contato declarado na porta não há o que perguntar — o dado já está aqui
  // e `app/briefing/page.tsx` já o trata como o que manda no envio. O botão
  // então ENVIA, em vez de abrir um formulário para recolher o que já se tem.
  //
  // Quem pulou a porta (`null`) segue pelo passo de contato como sempre: para
  // essa pessoa a pergunta é a única chance de a proposta ter para onde ir.
  const contatoJaDeclarado = contatoUsavelDaPorta(contatoDaPorta);

  function confirmarOrcamento() {
    if (contatoJaDeclarado) {
      handleSubmitWithContact(contatoJaDeclarado);
      return;
    }
    setConfirmStep("confirmed");
  }
  const panelRef = useRef<HTMLDivElement>(null);
  const { casca: cascaDaAcao, barra: barraDaAcao } = useReservaDeBarra<HTMLDivElement, HTMLDivElement>();

  const scope    = conv.scope;
  const estimate = conv.estimate;
  const hasScope = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding?.requested;
  const canSubmit    = canSubmitProposal(conv, sdr);
  const blockReason  = getSubmissionBlockReason(conv, sdr);

  const visibleActions = QUICK_ACTIONS.filter((qa) => qa.show(scope));

  // A barra fixa de conversão cobre o FIM do conteúdo se ninguém reservar o
  // espaço — é a §6.1 do DESIGN.md, que nasceu no portal, foi levada ao painel
  // e tinha deixado o briefing público de fora. Aqui acontece exatamente no
  // "quero meu orçamento": a primeira impressão da agência.
  // `.acao-shell` declara as medidas, `.acao-reserva` reserva no fluxo e
  // `.acao-barra` ancora a barra acima da safe-area do iOS. A altura real é
  // MEDIDA (useReservaDeBarra), não digitada.
  const barraDeConversaoVisivel = canSubmit && confirmStep === "pending";

  return (
    <div ref={cascaDaAcao} className={barraDeConversaoVisivel ? "acao-shell" : undefined}>
    <div className={`grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start ${barraDeConversaoVisivel ? "acao-reserva lg:pb-0" : ""}`}>

      {/* ── Left: Chat ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col">

        {/* Chat header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Consultora de Orçamento</div>
            <div className="text-[14px] font-semibold text-[var(--text-primary)] mt-0.5">Conversa com a {NOME_DA_EMPRESA}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
            <span className="text-[11px] text-[var(--text-muted)]">Online</span>
          </div>
        </div>

        {/* Messages
            Em 16/08/2026 o CEO relatou que na tela do SDR não enxergava o que
            o agente estava falando. A primeira rodada declarou "não
            reproduzi" CONTANDO BALÕES NO DOM — e contar não é ver. A segunda
            mediu a fração do balão dentro da viewport (`scripts/repro-fala-
            fora-da-vista.mjs`) e mostrou 100% visível em 6 turnos reais e em
            viewport encolhida a 380px: o relato NÃO se reproduziu por aqui,
            com o mecanismo original (`scrollIntoView` + este sentinela,
            abaixo). O conserto cogitado nessa rodada foi revertido. Estes
            `data-testid` (aqui, no `MessageBubble` e no `<textarea>` de
            resposta) existem para que a PRÓXIMA suspeita seja MEDIDA em
            minutos, em vez de virar mais uma rodada de raciocínio sobre o
            código — foi o raciocínio, e não a medição, que quase fez esta
            casa trocar o `scrollIntoView` por um conserto de defeito
            inexistente. */}
        <div data-testid="mensagens-container" className="px-5 py-4 space-y-3 overflow-y-auto min-h-[320px] max-h-[480px]">
          {conv.messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {aiThinking && (
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[var(--text-primary)] flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <div className="flex items-center gap-1 px-3 py-2.5 rounded-[12px] bg-[var(--accent)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Materials panel (toggled): file upload + cloud links */}
        {showMaterials && (
          <div className="px-5 pb-3 border-t border-[var(--border)] pt-3 space-y-4">
            {/* File upload */}
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-2">Enviar arquivo do briefing</div>
              <BriefingFileUpload items={fileItems} onPick={handleFilesPicked} onRemove={removeFileItem} />
            </div>
            {/* Cloud links */}
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-primary)] mb-2">Ou compartilhar por link</div>
              <MaterialsLinkField clientId={tempClientId} onChange={setLinkAtts} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          {/* ── Faixa acima do campo: barrado/quebrado, NUNCA em balão de conversa ──
              Mesmo lugar e padrão do aviso do microfone abaixo (`role="alert"`,
              texto em `--danger`) — reuso, não invenção. Fica DENTRO do
              container do input, que continua visível quando a área de
              mensagens rola e some (teclado aberto, 375px). Um balão de
              conversa pareceria fala da SDR — é exatamente essa confusão de
              autoria que fazia o prospect acreditar que estava tudo bem
              enquanto a IA tinha sido cortada (16/08). */}
          {avisoConversa && (
            <p role="alert" className="text-[12px] text-[var(--danger)] mb-2">
              {avisoConversa.texto}
            </p>
          )}
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              data-testid="textarea-resposta"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                conv.isFirstMessage
                  ? conv.scope.prospectName
                    // Quem já se identificou na porta não é convidado a repetir
                    // o nome nem no espaço reservado do campo de digitação.
                    ? "Diga o nome do seu negócio para começar…"
                    : "Diga seu nome e o nome do seu negócio para começar…"
                  : "Digite sua resposta…"
              }
              rows={2}
              className="flex-1 px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all resize-none leading-relaxed placeholder:text-[var(--text-subtle)]"
              style={{ fontSize: "16px", touchAction: "manipulation" }}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || aiThinking || enviarEsfriando}
              className="w-[52px] rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shrink-0"
              style={{ touchAction: "manipulation" }}
              aria-label="Enviar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.5 7L1.5 1.5L4 7L1.5 12.5L12.5 7Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          {/* `flex-wrap` + `whitespace-nowrap`: a 375px os dois botões não cabem
              lado a lado, e sem isto o rótulo quebra DENTRO do botão — duas
              linhas de texto num alvo de toque, que é o desenho de algo
              apertado. Melhor empilhar botões inteiros. */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* ── Microfone: repouso / OUVINDO / transcrevendo ────────────────
                06/08/2026: além de trocar o motor (nativo primeiro, ver
                `useSpeechToText`), o estado ATIVO ficou legível. Antes ele era
                um selo de 24px com texto de 10px em rosa claro — abaixo do piso
                de 12px da §3 do DESIGN.md e de qualquer alvo de toque decente.
                "Está ouvindo?" é a única pergunta que o cliente faz enquanto
                fala; a resposta agora é vermelho cheio e a palavra inteira. */}
            {isSupported ? (
              isTranscribing ? (
                <button
                  type="button"
                  disabled
                  className="h-8 px-3 rounded-[7px] text-[12px] font-medium border bg-[var(--accent)] border-[var(--border)] text-[var(--text-muted)] flex items-center gap-1.5 cursor-not-allowed"
                  style={{ touchAction: "manipulation" }}
                  title="Transcrevendo áudio…"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="ml-0.5">Transcrevendo…</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  aria-pressed={isListening}
                  className={`h-8 px-3 rounded-[7px] text-[12px] font-semibold border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isListening
                      ? "bg-[var(--danger)] border-[var(--danger)] text-white"
                      : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                  }`}
                  style={{ touchAction: "manipulation" }}
                  title={isListening ? "Parar" : "Falar em vez de digitar"}
                >
                  {isListening ? (
                    <>
                      <span aria-hidden className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      {/* ── O rótulo diz o que ESTE caminho faz ───────────────
                          "Ouvindo" promete texto ao vivo — e ao vivo só existe
                          no reconhecimento nativo. No Chrome do iPhone (que é
                          WebKit, e portanto sem nativo) o texto só chega depois
                          de parar: chamar isso de "Ouvindo" põe o prospect
                          esperando algo que não vem, na tela de conversão da
                          agência. O relógio existe porque há corte automático
                          em 3 minutos — número que aparece antes de acontecer. */}
                      <span>
                        {micModo === "envio" ? "Gravando" : "Ouvindo"}
                        <span className="hidden sm:inline">
                          {micModo === "envio" ? " · toque para transcrever" : " · toque para parar"}
                        </span>
                        {" · "}
                        {`${Math.floor(micSegundos / 60)}:${String(micSegundos % 60).padStart(2, "0")}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden>
                        <rect x="2.5" y="0.5" width="4" height="6" rx="2" stroke="currentColor" strokeWidth="1.1"/>
                        <path d="M0.5 6C0.5 8.21 2.29 10 4.5 10C6.71 10 8.5 8.21 8.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                        <line x1="4.5" y1="10" x2="4.5" y2="11.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                      </svg>
                      Falar
                    </>
                  )}
                </button>
              )
            ) : (
              <span className="text-[12px] text-[var(--text-muted)]">{micIndisponivel}</span>
            )}
            {/* Materials button (file upload + links) */}
            <button
              type="button"
              onClick={() => setShowMaterials((v) => !v)}
              aria-pressed={showMaterials}
              style={{ touchAction: "manipulation" }}
              className={`h-8 px-3 rounded-[7px] text-[12px] font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                showMaterials
                  ? "bg-[var(--accent-light)] border-[var(--border-strong)] text-[var(--navy)]"
                  : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19A2 2 0 0119 21H5A2 2 0 013 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {attachments.length > 0
                ? `${attachments.length} anexo${attachments.length !== 1 ? "s" : ""}`
                : <span>Anexar<span className="hidden sm:inline">{" briefing / materiais"}</span></span>}
            </button>
            <span className="text-[12px] text-[var(--text-muted)] ml-auto hidden sm:block">
              Enter para enviar · Shift+Enter nova linha
            </span>
          </div>
          {/* ── A falha do microfone diz a CAUSA, não um chute ─────────────────
              Esta linha era uma frase fixa: "Verifique a permissão do
              navegador" — dita igual para permissão negada, conta do provedor
              sem crédito, rede caída e áudio recusado. Três dos quatro casos
              mandavam o prospect mexer onde não era. A camada
              (`lib/ai/transcricao.ts`) já devolve a frase certa para cada
              causa; aqui a gente só mostra. */}
          {micError && (
            <p role="alert" className="text-[12px] text-[var(--danger)] mt-1.5">{micError}</p>
          )}
        </div>
      </div>

      {/* ── Right: Request panel ──────────────────────────────────────────────── */}
      <div ref={panelRef} className="lg:sticky lg:top-6 scroll-mt-4">
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3.5 border-b border-[var(--border)]">
            <div className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.05em]">
              {canSubmit && confirmStep === "confirmed"
                ? "Quase lá!"
                : canSubmit
                ? "Confirme seu pedido"
                : "O que você está pedindo"}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {canSubmit && confirmStep === "confirmed"
                ? "Onde você quer receber a proposta?"
                : canSubmit
                ? "É isso mesmo que você precisa?"
                : "Atualizado conforme a conversa avança"}
            </p>
          </div>

          {/* Body */}
          {!hasScope ? (
            /* ── Empty state ── */
            <div className="px-4 py-4">
              {[
                { label: "Nome",    value: scope.prospectName },
                { label: "Negócio", value: scope.businessName },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="text-[var(--text-muted)] w-16 shrink-0">{row.label}</span>
                  {row.value
                    ? <span className="text-[var(--text-primary)] font-medium">{row.value}</span>
                    : <span className="text-[var(--border-strong)]">aguardando…</span>}
                </div>
              ))}
              <p className="text-[10px] text-[var(--text-subtle)] mt-3 leading-relaxed">
                O que você precisar vai aparecer aqui conforme a conversa avança.
              </p>
            </div>
          ) : confirmStep === "confirmed" ? (
            /* ── Auth step: Google or e-mail ── */
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                Falta só uma coisa: <strong className="text-[var(--text-primary)]">para onde mandamos sua
                proposta</strong>. Sem isso não conseguimos voltar para você.
              </p>
              <GoogleSignInButton
                onSuccess={(r) => handleSubmitWithContact({ nome: r.name, email: r.email, whatsapp: "" })}
                onFallback={() => {}}
                loading={submitting}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-[var(--accent)]" />
                <span className="text-[12px] text-[var(--text-subtle)]">ou</span>
                <div className="flex-1 h-px bg-[var(--accent)]" />
              </div>
              <FormularioDeContato
                onSubmit={(c) => handleSubmitWithContact(c)}
                onSemContato={() => handleSubmitWithContact(null)}
                loading={submitting}
              />
            </div>
          ) : (
            /* ── Scope list (building or confirming) ── */
            <div className="px-4 py-4 space-y-4">
              <ScopeSection scope={scope} />

              {/* Quick-adjust chips — only while still building */}
              {!canSubmit && visibleActions.length > 0 && (
                <div>
                  <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1.5">Ajustar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleActions.map((qa) => (
                      <button
                        key={qa.label}
                        onClick={() => sendAction(qa.text)}
                        className="h-6 px-2.5 rounded-[5px] border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] font-medium transition-colors"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm CTA — appears when canSubmit */}
              {canSubmit && (
                <button
                  onClick={confirmarOrcamento}
                  disabled={submitting}
                  style={{ touchAction: "manipulation" }}
                  className="w-full h-11 rounded-[8px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[13px] font-semibold transition-colors"
                >
                  Sim, quero meu orçamento →
                </button>
              )}
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 pb-3 border-t border-[var(--border)] pt-3">
              <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-1.5">Materiais</div>
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] py-0.5">
                  <span className="w-1 h-1 rounded-full bg-[var(--navy)] shrink-0" />
                  <span className="truncate">{a.fileName}</span>
                </div>
              ))}
            </div>
          )}

          {/* "Keep talking" hint while scope is incomplete */}
          {!canSubmit && hasScope && (
            <div className="px-4 pb-4 pt-0">
              <p className="text-[10px] text-[var(--text-subtle)] leading-relaxed">
                {blockReason ?? "Continue a conversa — o botão aparece quando tivermos tudo."}
              </p>
            </div>
          )}
        </div>

      </div>

      </div>

      {/* Mobile sticky confirm — on phones the summary panel sits BELOW the chat,
          so surface the CTA in a fixed bar that's always reachable with a thumb. */}
      {barraDeConversaoVisivel && (
        <div
          ref={barraDaAcao}
          className="acao-barra lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-[var(--border)] px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
        >
          <button
            onClick={() => {
              confirmarOrcamento();
              // A rolagem só faz sentido quando ainda há um passo a mostrar no
              // painel; com o contato já declarado, o envio acontece aqui mesmo.
              if (!contatoJaDeclarado) {
                setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
              }
            }}
            disabled={submitting}
            style={{ touchAction: "manipulation" }}
            className="w-full h-12 rounded-[10px] bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white text-[14px] font-semibold transition-colors"
          >
            Sim, quero meu orçamento →
          </button>
        </div>
      )}
    </div>
  );
}
