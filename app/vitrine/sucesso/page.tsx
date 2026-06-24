"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DioliLogo } from "@/components/brand/DioliLogo";

function SuccessContent() {
  const params  = useSearchParams();
  const pending = params.get("pending") === "1";

  return (
    <div className="min-h-screen bg-[#070A1F] flex flex-col items-center justify-center px-4 text-center">
      <DioliLogo variant="full" tone="light" markSize={28} className="text-[15px] mb-10" />
      <div className="bg-white rounded-[16px] border border-[#E5E5E2] shadow-[0_16px_50px_rgba(0,0,0,0.18)] max-w-[420px] w-full px-8 py-10">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-[28px] mx-auto mb-5 ${pending ? "bg-[#FEF3C7]" : "bg-[#DCFCE7]"}`}>
          {pending ? "⏳" : "✓"}
        </div>
        <h1 className="text-[20px] font-bold text-[#1A1A1A] mb-2">
          {pending ? "Pagamento em processamento" : "Pedido confirmado!"}
        </h1>
        <p className="text-[13px] text-[#6B6B65] leading-relaxed mb-6">
          {pending
            ? "Seu pagamento está sendo processado. Assim que confirmado, nossa equipe entrará em contato pelo WhatsApp."
            : "Recebemos seu pedido. Nossa equipe vai entrar em contato pelo WhatsApp em até 2h úteis para iniciar a produção."}
        </p>
        <a
          href="/vitrine"
          className="block w-full h-11 rounded-[10px] bg-[#070A1F] hover:bg-[#0D1230] text-white text-[14px] font-semibold transition-colors flex items-center justify-center"
        >
          Ver mais serviços
        </a>
      </div>
    </div>
  );
}

export default function SucessoPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
