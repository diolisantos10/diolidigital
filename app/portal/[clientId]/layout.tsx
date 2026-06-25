import Link from "next/link";

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F6]">
      {/* Portal header */}
      <header className="bg-[#070A1F] px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-[6px] bg-white/10 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white"/>
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-white">Dioli Digital Studio</span>
          <span className="text-white/30">·</span>
          <span className="text-[12px] text-white/60">Portal do Cliente</span>
        </div>
      </header>
      <main className="max-w-[860px] mx-auto px-8 py-10">
        {children}
      </main>
      <footer className="border-t border-[#E5E5E2] bg-white mt-16">
        <div className="max-w-[860px] mx-auto px-8 py-5">
          <p className="text-[11px] text-[#C0C0BC]">Dioli Digital Studio · Portal do Cliente</p>
        </div>
      </footer>
    </div>
  );
}
