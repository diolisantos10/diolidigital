"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ConvState, ConvMessage, BriefingScope, LiveEstimate } from "@/lib/agency/briefing-conversation";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { canSubmitProposal, getSubmissionBlockReason, buildHandoffSummary } from "@/lib/agency/sdr-agent";
import { detectPackage, getPackageDef, computeEstimate } from "@/lib/agency/live-calculator";
import { respostaHonestaDePreco, falaSegura, resumoDoCorte } from "@/lib/agency/comercial/resposta-de-preco";
import { ACOES_DE_ESCOPO } from "@/lib/agency/comercial/acoes-do-escopo";
import { MaterialsLinkField } from "@/components/agency/briefing/FileUploadZone";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { useReservaDeBarra } from "@/components/agency/layout/useReservaDeBarra";
import type { RequestAttachment, ExtractedRequestSummary } from "@/lib/agency/client-requests";
import type { SDRHandoff } from "@/lib/agency/sdr-agent";

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
}

function buildRawText(messages: ConvMessage[]): string {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => `[${m.role === "assistant" ? "Dioli" : "Prospect"}] ${m.text}`)
    .join("\n\n");
}

function buildExtractedSummary(scope: BriefingScope): ExtractedRequestSummary {
  const services: string[] = [];
  const depts: string[] = [];
  if (scope.wantsSocialMedia)   { services.push("Social Media"); depts.push("social-media", "design"); }
  if (scope.wantsPaidTraffic)   { services.push("Tráfego Pago"); depts.push("paid-traffic"); }
  if (scope.branding?.requested) { services.push("Identidade Visual"); depts.push("brand-hub"); }

  const s = scope.social;
  const quantities: string[] = [];
  if (s?.postsPerWeek !== undefined) quantities.push(`${s.postsPerWeek * 4} posts/mês`);
  if (s?.storiesPerWeek !== undefined && s.storiesPerWeek > 0) quantities.push(`${s.storiesPerWeek * 4} stories/mês`);
  if (s?.reelsPerMonth !== undefined && s.reelsPerMonth > 0) quantities.push(`${s.reelsPerMonth} reels/mês`);

  return {
    clientName:           scope.businessName,
    segment:              scope.segment,
    services,
    channels:             s?.platforms ?? [],
    objectives:           scope.objectives,
    quantities,
    urgency:              scope.deadline ?? undefined,
    suggestedDepartments: [...new Set(depts)],
    missingInfo:          [],
  };
}

// Exportado para o PORTÃO DE PERSISTÊNCIA: é este `title` que vai para
// `ClientRequestDb`, para a caixa de entrada da equipe e para o portal.
export function buildTitle(scope: BriefingScope): string {
  const biz = scope.businessName ?? "Prospect";
  const services: string[] = [];
  if (scope.wantsSocialMedia) {
    const postsPerMonth = (scope.social?.postsPerWeek ?? 0) * 4;
    if (postsPerMonth > 0) {
      // ⚠️ ISTO PERSISTE. O `title` vai para `ClientRequestDb`, para a caixa de
      // entrada da equipe e para o portal — e até 16/08/2026 ele saía como
      // "Orçamento — <negócio> — Plano Starter", carimbando um plano que não
      // existe no registro do pedido. O rótulo é CADÊNCIA; o serviço é dito por
      // extenso, que é a informação que a equipe precisa ler.
      const pkg = getPackageDef(detectPackage(postsPerMonth));
      services.push(`Social Media — ${pkg.label}`);
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

// Exportado para o PORTÃO DE RENDER do aviso de corte (B4): o teste monta esta
// bolha com uma mensagem `system` e confere que o texto SAI no HTML. Provar
// que a nota entra no array não prova que a pessoa a lê.
export function MessageBubble({ msg }: { msg: ConvMessage }) {
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

// ── Selo de CADÊNCIA (era "Plano", e o nome era o defeito) ────────────────────
//
// 16/08/2026: este selo dizia **"Plano · Plano Starter"** — nome de produto que
// o catálogo desta casa não tem, desenhado na tela de qualquer prospect com 15
// a 24 posts/mês. O rótulo vem de `live-calculator`, que descreve CADÊNCIA, não
// produto; quem nomeia produto é `lib/agency/planos.ts`. O selo passa a dizer o
// que ele realmente mede.

const PKG_STYLE: Record<string, { bg: string; text: string }> = {
  essencial: { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]" },
  starter:   { bg: "bg-[var(--accent)]", text: "text-[var(--text-secondary)]" },
  growth:    { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
  pro:       { bg: "bg-[var(--accent-light)]", text: "text-[var(--navy)]" },
  premium:   { bg: "bg-[var(--navy)]", text: "text-white" },
};

// ── Scope section ─────────────────────────────────────────────────────────────

// Exportado para o PORTÃO DE RENDER: `o-plano-fantasma-nao-chega-na-tela.test.ts`
// monta esta seção com `renderToStaticMarkup` e varre o HTML de verdade. Portão
// que lê o código-fonte protege a grafia de hoje; este lê o que a pessoa vê.
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

  const rows: { label: string; value: string; dim?: boolean }[] = [];

  if (scope.serviceMode === "monthly")  rows.push({ label: "Modalidade", value: "Gestão mensal" });
  if (scope.serviceMode === "one_off")  rows.push({ label: "Modalidade", value: "Projeto pontual" });
  if (scope.serviceMode === "umbrella") rows.push({ label: "Modalidade", value: "Parceria contínua (guarda-chuva)" });

  if (scope.wantsSocialMedia) {
    rows.push({ label: "Serviço", value: "Social Media" });
    if (scope.social?.platforms.length)
      rows.push({ label: "Canais", value: scope.social.platforms.join(", ") });
    if (scope.social?.postsPerWeek !== undefined)
      rows.push({ label: "Posts", value: `${scope.social.postsPerWeek * 4}/mês` });
    if (scope.social?.storiesPerWeek !== undefined)
      rows.push({
        label: "Stories",
        value: scope.social.storiesPerWeek > 0 ? `${scope.social.storiesPerWeek * 4}/mês` : "Não incluído",
        dim: scope.social.storiesPerWeek === 0,
      });
    if (scope.social?.reelsPerMonth !== undefined)
      rows.push({
        label: "Reels",
        value: scope.social.reelsPerMonth > 0 ? `${scope.social.reelsPerMonth}/mês (edição)` : "Não incluído",
        dim: scope.social.reelsPerMonth === 0,
      });
    if (scope.social?.hasVideomaker !== undefined || scope.social?.needsVideoProduction !== undefined) {
      const v = scope.social?.needsVideoProduction
        ? "Produção pela Dioli"
        : scope.social?.hasVideomaker
        ? "Videomaker próprio"
        : "A definir";
      rows.push({ label: "Vídeo", value: v, dim: v === "A definir" });
    }
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
          <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Cadência</span>
          <span className={`h-5 px-2.5 rounded-full text-[10px] font-semibold ${pkgStyle.bg} ${pkgStyle.text}`}>
            {pkgLabel}
          </span>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <span className="text-[var(--text-muted)] shrink-0 w-[68px]">{r.label}</span>
          <span className={r.dim ? "text-[var(--text-subtle)]" : "text-[var(--text-primary)] font-medium"}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

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

// ── Main component ─────────────────────────────────────────────────────────────

// ── Claude SDR integration ─────────────────────────────────────────────────────
// The conversational brain. Calls /api/sdr/chat for a natural reply + scope
// patch. Returns null on any failure so the caller falls back to the rule-based
// engine (Lei 2). The patch only FILLS gaps in the rule-based scope — it never
// overwrites confirmed data, so the live estimate machinery stays stable.

interface SdrReply { reply: string; scope: Record<string, unknown> }

// ── 16/08/2026 — O MOTIVO DA RECUSA DEIXA DE SER DESCARTADO ────────────────────
//
// `fetchSdrReply` devolvia `null` para TODA falha: timeout, chave ausente, JSON
// quebrado e — o caso que apareceu no piloto do CEO — `price_leak`, a trava que
// impede o SDR de cotar preço na conversa.
//
// Os quatro casos são diferentes para o cliente. Nos três primeiros o motor de
// regras é a resposta certa: a máquina caiu e a conversa segue. No `price_leak`
// NÃO É: a pessoa perguntou quanto custa e recebeu a próxima pergunta do roteiro
// sobre reels. Do lado dela isso não parece uma regra comercial — parece um robô
// que travou e mudou de assunto.
//
// A trava continua intacta (ela é o que impede a agência de prometer preço
// errado). O que mudou é só o que se DIZ quando ela dispara.
//
// ── 16/08/2026, SEGUNDA PASSADA — o falso positivo e a mutação silenciosa ─────
//
// `qualidade` executou a trava contra falas reais e achou dois defeitos NESTE
// ramo. Nenhum dos dois se conserta afrouxando a trava; os dois se consertam
// aqui, no que vem DEPOIS dela:
//
//   • FALSO POSITIVO — "Anotei: seu orçamento de R$ 800 por mês. Me conta
//     quantos posts você quer?" dispara a trava. É o SDR ecoando o número que o
//     próprio cliente acabou de informar, e quem informou o orçamento passou a
//     ouvir "quem fecha número aqui é a nossa equipe". Agora o servidor devolve
//     `eco` (só um booleano — não viaja texto nenhum) e o eco segue a conversa.
//   • MUTAÇÃO SILENCIOSA — quando o motor de regras CORTA o escopo ("tá caro" →
//     posts para 2, tráfego pago desligado), a fala honesta ocupava o lugar da
//     única frase que avisava do corte. Agora, escopo que encolheu manda o motor
//     falar: é a fala dele que descreve o corte.
//
// E as três saídas passam por `falaSegura` — o portão de runtime que impede
// qualquer fala com preço fora do catálogo de virar bolha na tela.
type FalhaDoSdr = { motivo: string | null; eco?: boolean };


// An uploaded briefing file and its processing status.
interface UploadItem {
  id: string;
  attachment: RequestAttachment;
  status: "uploading" | "done" | "error";
}

interface UploadResult {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  mimeType: string;
  extractedText: string;
}

async function fetchUpload(file: File): Promise<UploadResult | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/sdr/upload", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean } & Partial<UploadResult>;
    if (!data.ok) return null;
    return {
      fileName:      data.fileName ?? file.name,
      fileType:      data.fileType ?? "FILE",
      sizeBytes:     data.sizeBytes ?? file.size,
      mimeType:      data.mimeType ?? file.type,
      extractedText: data.extractedText ?? "",
    };
  } catch {
    return null;
  }
}

async function fetchSdrReply(
  priorMessages: ConvMessage[],
  currentMessage: string,
  scope: BriefingScope,
): Promise<SdrReply | FalhaDoSdr> {
  try {
    const res = await fetch("/api/sdr/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: priorMessages.map((m) => ({ role: m.role, text: m.text })),
        currentMessage,
        scope,
      }),
    });
    if (!res.ok) return { motivo: null };
    const data = (await res.json()) as { ok?: boolean; reply?: unknown; scope?: unknown; reason?: unknown; eco?: unknown };
    if (!data.ok || typeof data.reply !== "string" || !data.reply.trim()) {
      return { motivo: typeof data.reason === "string" ? data.reason : null, eco: data.eco === true };
    }
    return {
      reply: data.reply.trim(),
      scope: data.scope && typeof data.scope === "object" ? (data.scope as Record<string, unknown>) : {},
    };
  } catch {
    return { motivo: null };
  }
}

function ehResposta(r: SdrReply | FalhaDoSdr): r is SdrReply {
  return typeof (r as SdrReply).reply === "string";
}

function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Gap-fill merge: only writes fields the rule-based scope hasn't already set.
function mergeScopeGaps(base: BriefingScope, patch: Record<string, unknown>): BriefingScope {
  if (!patch || typeof patch !== "object") return base;
  const out: BriefingScope = { ...base };

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

export function PublicBriefingRoom({ onSubmit }: PublicBriefingRoomProps) {
  const [state,          setState]          = useState<ProspectConvState>(() => initProspectConvState());
  const [inputText,      setInputText]      = useState("");
  const [showMaterials,  setShowMaterials]  = useState(false);
  const [linkAtts,       setLinkAtts]       = useState<RequestAttachment[]>([]);
  const [fileItems,      setFileItems]      = useState<UploadItem[]>([]);
  const [aiThinking,     setAiThinking]     = useState(false);

  // Combined attachment list (uploaded files first, then shared links).
  const attachments: RequestAttachment[] = [
    ...fileItems.filter((f) => f.status !== "error").map((f) => f.attachment),
    ...linkAtts,
  ];
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // Internal temp ID for link association
  const [tempClientId] = useState(() => "prospect-" + Date.now());

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

      const resultado = await fetchSdrReply(priorMessages, sdrText ?? text, ruleResult.conv.scope);
      setAiThinking(false);

      // ── B4, FECHADO NO CAMINHO PRINCIPAL (16/08/2026, terceira passada) ─────
      //
      // A rodada anterior fechou B4 só dentro do ramo `price_leak` — o ramo raro.
      // `escopoEncolheu` tinha UM call site, ali dentro. No caminho NORMAL (o
      // modelo responde) o front mantinha `ruleResult.conv.scope` **já cortado**,
      // mostrava a fala do modelo e descartava `ruleAssistant.text`, que era a
      // única frase que descrevia o corte.
      //
      // Medido: o prospect clica em "Começar menor" → `detectNegotiation` corta
      // posts para 2, stories para 2, reels para 0 e desliga o tráfego pago → o
      // modelo responde sem citar preço → o painel cai de 20 para 8 posts/mês
      // **sem uma palavra na tela**.
      //
      // A justificativa da rodada anterior para não desfazer o corte era FALSA e
      // isto ficou registrado: `prospect-engine.ts` roda `detectNegotiation` e
      // `currentQ.parse` em ramos `if/else` — quando a negociação casa, a
      // extração não roda. Não havia extração a perder.
      //
      // A escolha aqui é AVISAR, não desfazer: quem clicou em "Começar menor"
      // PEDIU o corte, e desfazê-lo tornaria o botão decorativo. O defeito nunca
      // foi o corte — foi o silêncio. Esta nota é determinística (sai da
      // comparação antes/depois), não cita preço nem nome de plano, e entra em
      // TODOS os caminhos, inclusive quando quem fala é o modelo.
      const corte = resumoDoCorte(prevState.conv.scope, ruleResult.conv.scope);
      const notaDoCorte: ConvMessage[] = corte
        ? [{
            id: `corte-${ruleAssistant.id}`,
            role: "system" as const,
            text: corte,
            createdAt: new Date().toISOString(),
          }]
        : [];

      if (!ehResposta(resultado) && resultado.motivo === "price_leak") {
        // ── A TRAVA DE PREÇO DISPAROU — e a resposta depende de POR QUÊ ────────
        //
        // O estado do motor de regras continua valendo sempre (é ele que sabe em
        // que ponto da sondagem a conversa está). O que se decide aqui é só qual
        // fala ocupa o lugar da que a trava recusou:
        //
        //   • ECO — o número da fala recusada era o que o próprio cliente já
        //     tinha informado (verba de anúncio, faixa escolhida). Quem acabou
        //     de dizer quanto tem não pode ouvir "quem fecha número é a equipe":
        //     a conversa segue, com a fala do motor.
        //   • ESCOPO ENCOLHEU — o motor cortou posts/stories/reels/tráfego neste
        //     turno. A fala DELE é a única que descreve o corte; calá-la deixaria
        //     o escopo menor sem uma palavra na tela (era o defeito B4).
        //   • O RESTO — o cliente perguntou o preço e o motor não tinha nada a
        //     dizer sobre isso. Aí sim, a fala honesta.
        //
        // A trava não foi tocada em nenhum dos três: o turno do modelo continua
        // descartado, e o texto dele nunca chega ao navegador.
        const honesta = respostaHonestaDePreco(ruleResult.conv.scope.prospectName);
        const segueAConversa = resultado.eco === true || corte !== null;
        const escolhida = segueAConversa ? ruleAssistant.text : honesta.texto;
        // O PORTÃO DE RUNTIME: a fala do motor é escrita à mão e pode voltar a
        // citar preço sem lastro (foi o que aconteceu com o "Plano Starter
        // R$ 1.200"). `falaSegura` recusa e devolve a fala honesta.
        const aprovada = falaSegura(escolhida, ruleResult.conv.scope.prospectName);
        const conv: ConvState = {
          ...ruleResult.conv,
          messages: [...userVisible, ...notaDoCorte, { ...ruleAssistant, text: aprovada.texto }],
        };
        setState({
          conv: { ...conv, canSubmit: canSubmitProposal(conv, ruleResult.sdr) },
          sdr: ruleResult.sdr,
        });
        void fireAiExtract(text, priorMessages);
        return;
      }

      if (ehResposta(resultado)) {
        const claude = resultado;
        const mergedScope = mergeScopeGaps(ruleResult.conv.scope, claude.scope);
        const estimate = computeEstimate(mergedScope);
        // ⚠️ A fala do MODELO não passa por `falaSegura`, e é escolha declarada.
        // Ela já atravessou uma trava MAIS estreita no servidor: lá, qualquer
        // "R$ <número>" derruba o turno, com uma única exceção (a pergunta da
        // faixa). Rodar o portão do catálogo por cima dela criaria uma
        // contradição de réguas — a régua de faixas cita limites que o catálogo
        // de planos não conhece, e o cliente perderia a pergunta da faixa, que é
        // a terceira pergunta por decisão do CEO (05/08). Portão sobre fala já
        // travada é redundância que quebra o caso legítimo.
        const assistantMsg: ConvMessage = { ...ruleAssistant, text: claude.reply };
        const newConv: ConvState = {
          ...ruleResult.conv,
          scope: mergedScope,
          estimate,
          messages: [...userVisible, ...notaDoCorte, assistantMsg],
        };
        setState({
          conv: { ...newConv, canSubmit: canSubmitProposal(newConv, ruleResult.sdr) },
          sdr: ruleResult.sdr,
        });
      } else {
        // Fallback: rule-based reply + the lighter extraction pass.
        //
        // Aqui NÃO há trava nenhuma no caminho — a fala é escrita à mão em
        // `sdr-agent.ts` / `question-engine.ts` e vai direto para a tela do
        // prospect. É o caminho por onde o "Plano Starter (R$ 1.200–1.800/mês)"
        // chegou ao cliente por meses. `falaSegura` é o portão que faltava.
        const aprovada = falaSegura(ruleAssistant.text, ruleResult.conv.scope.prospectName);
        setState({
          ...ruleResult,
          conv: {
            ...ruleResult.conv,
            messages: [...userVisible, ...notaDoCorte, { ...ruleAssistant, text: aprovada.texto }],
          },
        });
        void fireAiExtract(text, priorMessages);
      }
    },
    [fireAiExtract],
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

        const result = await fetchUpload(file);

        if (!result) {
          setFileItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error" } : it)));
          continue;
        }

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
          const visible = `📎 Enviei meu briefing: **${result.fileName}**`;
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
    if (!text || aiThinking) return;
    setInputText("");
    void runTurn(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function sendAction(text: string) {
    if (aiThinking) return;
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
      prospectEmail: contato?.email || scope.prospectEmail,
      prospectPhone: contato?.whatsapp || scope.prospectPhone,
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
      contato,
    });
  }

  const [confirmStep, setConfirmStep] = useState<"pending" | "confirmed">("pending");
  const panelRef = useRef<HTMLDivElement>(null);
  const { casca: cascaDaAcao, barra: barraDaAcao } = useReservaDeBarra<HTMLDivElement, HTMLDivElement>();

  const scope    = conv.scope;
  const estimate = conv.estimate;
  const hasScope = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding?.requested;
  const canSubmit    = canSubmitProposal(conv, sdr);
  const blockReason  = getSubmissionBlockReason(conv, sdr);

  const visibleActions = ACOES_DE_ESCOPO.filter((qa) => qa.show(scope));

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
            <div className="text-[14px] font-semibold text-[var(--text-primary)] mt-0.5">Conversa com a Dioli Studio</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
            <span className="text-[11px] text-[var(--text-muted)]">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto min-h-[320px] max-h-[480px]">
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
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                conv.isFirstMessage
                  ? "Diga seu nome e o nome do seu negócio para começar…"
                  : "Digite sua resposta…"
              }
              rows={2}
              className="flex-1 px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] focus:bg-white transition-all resize-none leading-relaxed placeholder:text-[var(--text-subtle)]"
              style={{ fontSize: "16px", touchAction: "manipulation" }}
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || aiThinking}
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
                  onClick={() => setConfirmStep("confirmed")}
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
              setConfirmStep("confirmed");
              setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
            }}
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
