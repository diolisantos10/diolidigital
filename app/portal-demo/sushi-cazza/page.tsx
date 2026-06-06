"use client";

import Link from "next/link";
import { useAgencyStore } from "@/store/agency-store";
import { DEMO_CLIENT, DEMO_CLIENT_ID } from "@/lib/agency/demo-client";
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE } from "@/lib/agency/client-requests";

export default function DemoClientPage() {
  const { clientRequests } = useAgencyStore();
  const myRequests = (clientRequests ?? []).filter((r) => r.clientId === DEMO_CLIENT_ID);

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[#1A1A1A]">Olá, {DEMO_CLIENT.name}</h1>
            <p className="text-[13px] text-[#9B9B95] mt-0.5">{DEMO_CLIENT.industry}</p>
          </div>
          <Link
            href="/portal-demo/sushi-cazza/briefing"
            className="h-8 px-4 rounded-[8px] bg-[#1A1A1A] hover:bg-[#111111] text-white text-[12px] font-medium transition-colors inline-flex items-center"
          >
            + Nova solicitação
          </Link>
        </div>
        <p className="text-[13px] text-[#6B6B65] mt-3 max-w-lg leading-relaxed">
          Revise os materiais abaixo, acompanhe suas solicitações e envie feedback direto para a equipe.
        </p>
      </div>

      {/* Minhas Solicitações */}
      {myRequests.length > 0 ? (
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
              const style = REQUEST_STATUS_STYLE[req.status];
              const isInProgress = req.status === "in_progress";
              const isProposal   = req.status === "proposal_pending" || req.status === "under_review";
              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-[10px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden ${
                    isInProgress ? "border-[#BBF7D0]" : "border-[#E5E5E2]"
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
                        <p className="text-[11px] text-[#C0C0BC] mt-1">
                          Enviada em {new Date(req.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      {req.status === "new" && (
                        <span className="w-2 h-2 rounded-full bg-[#5B5BD6] shrink-0 mt-1.5" />
                      )}
                    </div>
                  </div>
                  {(isInProgress || isProposal) && (
                    <div className={`px-5 py-2.5 flex items-center gap-2 border-t ${
                      isInProgress
                        ? "bg-[#F0FDF4] border-[#BBF7D0]"
                        : "bg-[#EEF0FF] border-[#C7C7F5]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isInProgress ? "bg-[#16A34A]" : "bg-[#5B5BD6]"}`} />
                      <p className={`text-[12px] font-medium ${isInProgress ? "text-[#16A34A]" : "text-[#5B5BD6]"}`}>
                        {isInProgress
                          ? "Nossa equipe está estruturando o seu projeto. Em breve entraremos em contato."
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
            Clique em "+ Nova solicitação" para testar o fluxo de briefing.
          </p>
          <Link
            href="/portal-demo/sushi-cazza/briefing"
            className="inline-flex items-center h-9 px-5 rounded-[8px] bg-[#5B5BD6] hover:bg-[#4A4AB5] text-white text-[13px] font-medium transition-colors"
          >
            Enviar primeira solicitação →
          </Link>
        </div>
      )}

      {/* No projects placeholder */}
      <div className="bg-white rounded-[10px] border border-dashed border-[#E5E5E2] px-6 py-8 text-center">
        <p className="text-[13px] text-[#9B9B95]">
          Os projetos aparecerão aqui assim que forem criados pela equipe.
        </p>
      </div>
    </>
  );
}
