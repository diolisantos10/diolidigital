import Link from "next/link";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F7F6]">
      {/* Demo banner */}
      <div className="bg-[#1A1A1A] text-white px-6 h-8 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <span className="font-medium text-[#F59E0B]">Modo demonstração</span>
          <span className="text-[#9B9B95]">— sem login · ambiente de teste</span>
        </div>
        <div className="flex items-center gap-4 text-[#9B9B95]">
          <Link href="/agency/requests" className="hover:text-white transition-colors">Solicitações</Link>
          <Link href="/agency/departments/project-management" className="hover:text-white transition-colors">Gestão de Projetos</Link>
          <Link href="/agency/projects" className="hover:text-white transition-colors">Projetos</Link>
          <Link href="/agency/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
        </div>
      </div>

      {/* Portal header */}
      <header className="bg-white border-b border-[#E5E5E2] px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-[6px] bg-[#070A1F] flex items-center justify-center">
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
          <span className="text-[#D0D0CC]">·</span>
          <span className="h-5 px-2 rounded-full bg-[#FEF3C7] text-[#D97706] text-[10px] font-semibold">Demo</span>
        </div>
        <span className="text-[11px] text-[#9B9B95]">Cliente Demonstração — ambiente de teste</span>
      </header>

      <main className="max-w-[860px] mx-auto px-8 py-10">
        {children}
      </main>

      {/* Operator footer */}
      <footer className="border-t border-[#E5E5E2] bg-white mt-16">
        <div className="max-w-[860px] mx-auto px-8 py-5 flex items-center justify-between">
          <p className="text-[11px] text-[#C0C0BC]">
            Este é um ambiente de teste — os dados são armazenados localmente e não são enviados para nenhum servidor.
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <Link href="/agency/requests" className="text-[#070A1F] hover:underline font-medium">
              Ver solicitações no painel
            </Link>
            <Link href="/agency/dashboard" className="text-[#9B9B95] hover:text-[#6B6B65] transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
