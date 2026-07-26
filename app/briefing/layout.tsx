import type { Metadata } from "next";
import { DioliLogo } from "@/components/brand/DioliLogo";

export const metadata: Metadata = {
  title: "Briefing — Dioli Digital",
  description: "Conta como podemos ajudar o seu negócio. Nossa IA analisa e prepara uma proposta sob medida.",
};

export default function BriefingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="bg-[#070A1F] border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <DioliLogo variant="full" tone="light" markSize={20} className="text-[13px]" />
          <span className="text-[11px] text-[var(--text-secondary)]">Briefing gratuito · sem compromisso</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
