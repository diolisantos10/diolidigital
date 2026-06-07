"use client";

import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { DEMO_CLIENT, DEMO_CLIENT_ID } from "@/lib/agency/demo-client";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE, type ClientRequestStatus } from "@/lib/agency/client-requests";

type Color = "indigo" | "amber" | "green" | "red";

const STATUS_CFG: Record<ClientRequestStatus, {
  title: string; message: string; nextStep: string; estimate: string;
  currentStep: number; color: Color;
}> = {
  new:              { title: "Solicitação recebida",     message: "Recebemos seu briefing. Nossa equipe está analisando para estruturar o escopo.",    nextStep: "Análise pela equipe Dioli",         estimate: "Retorno em até 24 horas úteis", currentStep: 1, color: "indigo" },
  under_review:     { title: "Em análise pela equipe",   message: "Nossa equipe está analisando seu briefing em detalhes para propor o escopo ideal.", nextStep: "Estruturação do escopo e orçamento", estimate: "Retorno em até 24 horas úteis", currentStep: 1, color: "indigo" },
  proposal_pending: { title: "Proposta em preparação",   message: "Estamos estruturando sua proposta com base no briefing enviado. Em breve você receberá os detalhes.",  nextStep: "Proposta para sua aprovação",       estimate: "Em breve",                     currentStep: 2, color: "amber"  },
  waiting_client:   { title: "Aguardando sua aprovação", message: "Há uma proposta aguardando a sua revisão e aprovação.",                             nextStep: "Revise e aprove no painel abaixo",  estimate: "Ação necessária",               currentStep: 3, color: "amber"  },
  in_progress:      { title: "Projeto em andamento",     message: "A equipe está trabalhando no seu projeto. As entregas aparecerão aqui em breve.",   nextStep: "Aguardar entrega dos materiais",    estimate: "Conforme prazo acordado",       currentStep: 4, color: "green"  },
  completed:        { title: "Concluído",                message: "Sua solicitação foi concluída com sucesso.",                                         nextStep: "Envie uma nova solicitação",        estimate: "",                              currentStep: 4, color: "green"  },
  rejected:         { title: "Solicitação encerrada",    message: "Esta solicitação não avançou. Entre em contato para entender os próximos passos.",   nextStep: "Entre em contato com a equipe",    estimate: "",                              currentStep: -1, color: "red"   },
};

const COLORS: Record<Color, { bg: string; border: string; title: string; text: string; dot: string; bar: string }> = {
  indigo: { bg: "bg-[#EEF0FF]", border: "border-[#C7C7F5]", title: "text-[#5B5BD6]", text: "text-[#4B4B9F]", dot: "bg-[#5B5BD6]", bar: "bg-[#5B5BD6]" },
  amber:  { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", title: "text-[#D97706]", text: "text-[#92400E]", dot: "bg-[#F59E0B]", bar: "bg-[#F59E0B]" },
  green:  { bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]", title: "text-[#16A34A]", text: "text-[#15803D]", dot: "bg-[#16A34A]", bar: "bg-[#16A34A]" },
  red:    { bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", title: "text-[#DC2626]", text: "text-[#B91C1C]", dot: "bg-[#DC2626]", bar: "bg-[#DC2626]" },
};

const TIMELINE_STEPS = ["Briefing enviado", "Em análise", "Escopo / proposta", "Aprovação", "Projeto iniciado"];

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DemoClientPage() {
  const { clientRequests } = useAgencyStore();
  const myRequests = (clientRequests ?? []).filter((r) => r.clientId === DEMO_CLIENT_ID);
  const latest = myRequests[0] ?? null;
  const hasRequests = myRequests.length > 0;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[#9B9B95] uppercase tracking-[0.06em] mb-1">
              Dashboard da Marca
            </p>
            <h1 className="text-[24px] font-semibold text-[#1A1A1A]">Olá, {DEMO_CLIENT.name}</h1>
            <p className="text-[13px] text-[#6B6B65] mt-2 max-w-lg leading-relaxed">
              Acompanhe suas solicitações, materiais enviados e os próximos passos com a equipe.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {hasRequests && latest && ["new","under_review","proposal_pending"].includes(latest.status) && (
              <Link
                href="/portal-demo/sushi-cazza/briefing"
                className="h-8 px-4 rounded-[8px] border border-[#E5E5E2] text-[#1A1A1A] hover:bg-[#F7F7F6] text-[12px] font-medium transition-colors inline-flex items-center"
              >
                Complementar briefing
              </Link>
            )}
            <Link
              href="/portal-demo/sushi-cazza/briefing"
              className="h-8 px-4 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors inline-flex items-center"
            >
              + Nova solicitação
            </Link>
          </div>
        </div>
      </div>

      {/* Status card */}
      {latest && (() => {
        const s = STATUS_CFG[latest.status];
        if (!s) return null;
        const c = COLORS[s.color];
        return (
          <div className={`mb-6 rounded-[12px] border p-5 ${c.bg} ${c.border}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                  <span className={`text-[13px] font-semibold ${c.title}`}>{s.title}</span>
                </div>
                <p className={`text-[13px] leading-relaxed ${c.text} max-w-lg`}>{s.message}</p>
              </div>
              {s.estimate && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em]">Prazo estimado</p>
                  <p className={`text-[12px] font-medium mt-0.5 ${c.title}`}>{s.estimate}</p>
                </div>
              )}
            </div>
            {s.nextStep && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] text-[#9B9B95] font-medium">Próxima etapa:</span>
                <span className={`text-[11px] font-semibold ${c.title}`}>{s.nextStep}</span>
              </div>
            )}
            {s.currentStep >= 0 && (
              <div className="flex items-center overflow-x-auto">
                {TIMELINE_STEPS.map((step, i) => {
                  const done   = i < s.currentStep;
                  const active = i === s.currentStep;
                  return (
                    <div key={step} className="flex items-center gap-0 flex-1 min-w-0">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 ${
                          done || active
                            ? `${c.bar} border-transparent text-white`
                            : "bg-white border-[#D0D0CC] text-[#C0C0BC]"
                        }`}>
                          {done ? "✓" : i + 1}
                        </div>
                        <p className={`text-[9px] font-medium mt-1 text-center w-[68px] leading-tight ${
                          done || active ? c.title : "text-[#C0C0BC]"
                        }`}>{step}</p>
                      </div>
                      {i < TIMELINE_STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mt-[-12px] mx-1 ${done ? c.bar : "bg-[#E5E5E2]"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Brand materials card */}
      {latest && (latest.attachments.length > 0 || latest.missingInfo.length > 0) && (
        <div className="mb-6 bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#F0F0ED] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#1A1A1A]">Materiais da marca</span>
            <Link
              href="/portal-demo/sushi-cazza/briefing"
              className="h-6 px-3 rounded-[5px] border border-[#E5E5E2] text-[#6B6B65] hover:text-[#1A1A1A] hover:border-[#9B9B95] text-[10px] font-medium transition-colors inline-flex items-center"
            >
              + Enviar complemento
            </Link>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
                Enviados ({latest.attachments.length})
              </p>
              {latest.attachments.length === 0 ? (
                <p className="text-[12px] text-[#C0C0BC]">Nenhum arquivo enviado ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {latest.attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-[4px] bg-[#DCFCE7] flex items-center justify-center shrink-0">
                        <span className="text-[7px] font-bold text-[#16A34A]">{att.fileType}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#1A1A1A] truncate">{att.fileName}</p>
                        <p className="text-[9px] text-[#9B9B95]">{formatBytes(att.sizeBytes)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#9B9B95] uppercase tracking-[0.05em] mb-2">
                Pode complementar
              </p>
              {latest.missingInfo.length === 0 ? (
                <p className="text-[12px] text-[#16A34A] font-medium">Briefing completo ✓</p>
              ) : (
                <ul className="space-y-1">
                  {latest.missingInfo.slice(0, 5).map((m) => (
                    <li key={m} className="flex items-center gap-1.5 text-[11px] text-[#6B6B65]">
                      <span className="w-1 h-1 rounded-full bg-[#D0D0CC] shrink-0" />{m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Requests section */}
      {hasRequests ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Minhas solicitações</h2>
            <Link
              href="/portal-demo/sushi-cazza/briefing"
              className="text-[12px] text-[#5B5BD6] hover:underline font-medium"
            >
              + Nova solicitação
            </Link>
          </div>
          <div className="space-y-2.5">
            {myRequests.map((req) => {
              const style      = REQUEST_STATUS_STYLE[req.status];
              const isNew      = req.status === "new";
              const isInProgress = req.status === "in_progress";
              const isProposal   = req.status === "proposal_pending" || req.status === "under_review";
              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden ${
                    isInProgress ? "border-[#BBF7D0]" : isNew ? "border-[#C7C7F5]" : "border-[#E5E5E2]"
                  }`}
                >
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{req.title}</span>
                          <span className={`h-5 px-2 rounded-full text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
                            {REQUEST_STATUS_LABEL[req.status]}
                          </span>
                        </div>
                        {req.extractedSummary.services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {req.extractedSummary.services.map((s, i, arr) => (
                              <span key={s} className="text-[11px] text-[#9B9B95]">
                                {s}{i < arr.length - 1 ? " · " : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {req.attachments.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] text-[#9B9B95]">
                              📎 {req.attachments.length} material{req.attachments.length !== 1 ? "is" : ""} enviado{req.attachments.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                        <p className="text-[11px] text-[#C0C0BC] mt-1">
                          Enviada em {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  </div>
                  {(isNew || isInProgress || isProposal) && (
                    <div className={`px-5 py-2.5 flex items-center gap-2 border-t ${
                      isInProgress
                        ? "bg-[#F0FDF4] border-[#BBF7D0]"
                        : isNew
                        ? "bg-[#EEF0FF] border-[#C7C7F5]"
                        : "bg-[#FFFBEB] border-[#FDE68A]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isInProgress ? "bg-[#16A34A]" : isNew ? "bg-[#5B5BD6]" : "bg-[#F59E0B]"
                      }`} />
                      <p className={`text-[12px] font-medium ${
                        isInProgress ? "text-[#16A34A]" : isNew ? "text-[#5B5BD6]" : "text-[#D97706]"
                      }`}>
                        {isInProgress
                          ? "Nossa equipe está estruturando o seu projeto. Em breve entraremos em contato."
                          : isNew
                          ? "Recebemos seu briefing. Nossa equipe vai analisar e entrar em contato."
                          : "Sua solicitação está sendo analisada. Retornaremos com os próximos passos."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-8 bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-8 py-14 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">Nenhuma solicitação enviada ainda</p>
          <p className="text-[13px] text-[#9B9B95] mt-1.5 mb-5">
            Clique em &quot;+ Nova solicitação&quot; para testar o fluxo de briefing.
          </p>
          <Link
            href="/portal-demo/sushi-cazza/briefing"
            className="inline-flex items-center h-9 px-5 rounded-[8px] bg-[#5B5BD6] hover:bg-[#4A4AB5] text-white text-[13px] font-medium transition-colors"
          >
            Enviar primeira solicitação →
          </Link>
        </div>
      )}

      {/* Projects empty state */}
      <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-6 py-10 text-center">
        <p className="text-[13px] font-medium text-[#1A1A1A] mb-1">Seus projetos aparecerão aqui</p>
        <p className="text-[12px] text-[#9B9B95] max-w-sm mx-auto leading-relaxed">
          Após a aprovação do escopo, a equipe Dioli abrirá o projeto e você acompanhará tudo por aqui.
        </p>
      </div>
    </>
  );
}
