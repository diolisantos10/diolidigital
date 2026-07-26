import { DioliLogo } from "@/components/brand/DioliLogo";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="bg-white border-b border-[var(--border)] px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DioliLogo variant="full" tone="dark" markSize={18} className="text-[12px]" />
          <span className="text-[var(--text-subtle)] select-none">·</span>
          <span className="text-[12px] text-[var(--text-muted)] font-medium">Portal do Cliente</span>
        </div>
        <span className="text-[11px] text-[var(--text-subtle)]">Revise e aprove os entregáveis do projeto</span>
      </header>
      <main className="max-w-[860px] mx-auto px-6 md:px-8 py-10">
        {children}
      </main>
    </div>
  );
}
