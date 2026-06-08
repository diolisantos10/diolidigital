import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Orçamento — Dioli Studio",
  description: "Monte sua proposta personalizada com a Dioli Studio",
};

export default function BriefingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F6]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E2]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[6px] bg-[#1A1A1A] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="3.5" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-[#1A1A1A] tracking-tight">Dioli Studio</span>
          </div>
          <span className="text-[12px] text-[#9B9B95]">Orçamento digital</span>
        </div>
      </header>
      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
