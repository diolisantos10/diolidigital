export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F6]">
      <header className="bg-white border-b border-[#E5E5E2] px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-[6px] bg-[#5B5BD6] flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white"/>
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-[#1A1A1A]">Dioli Studio</span>
          <span className="text-[#D0D0CC]">·</span>
          <span className="text-[12px] text-[#9B9B95]">Portal do Cliente</span>
        </div>
        <span className="text-[11px] text-[#9B9B95]">Revise e aprove os entregáveis do projeto</span>
      </header>
      <main className="max-w-[860px] mx-auto px-8 py-10">
        {children}
      </main>
    </div>
  );
}
