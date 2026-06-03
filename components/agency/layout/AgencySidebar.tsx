"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

export default function AgencySidebar() {
  const path = usePathname();
  const { t } = useTranslation();

  const NAV = [
    {
      group: null,
      items: [{ label: t.nav.home, href: "/agency/dashboard", icon: HomeIcon }],
    },
    {
      group: t.nav.group.work,
      items: [
        { label: t.nav.projects, href: "/agency/projects", icon: FolderIcon },
        { label: t.nav.pipeline, href: "/agency/pipeline", icon: ColumnsIcon },
        { label: t.nav.tasks, href: "/agency/tasks", icon: CheckIcon },
      ],
    },
    {
      group: t.nav.group.clients,
      items: [
        { label: t.nav.clients, href: "/agency/clients", icon: BuildingIcon },
        { label: t.nav.brandAssets, href: "/agency/brand-assets", icon: SwatchIcon },
      ],
    },
    {
      group: t.nav.group.intelligence,
      items: [
        { label: t.nav.orchestrator, href: "/agency/orchestrator", icon: CpuIcon },
        { label: t.nav.agents, href: "/agency/agents", icon: UserCogIcon },
      ],
    },
    {
      group: t.nav.group.agents,
      items: [
        { label: t.nav.socialMedia, href: "/agency/social-media-agent", icon: SocialIcon },
        { label: t.nav.designAgent, href: "/agency/design-agent", icon: DesignIcon },
        { label: t.nav.adsAgent, href: "/agency/ads-agent", icon: AdsIcon },
      ],
    },
    {
      group: t.nav.group.library,
      items: [
        { label: t.nav.deliverables, href: "/agency/deliverables", icon: BoxIcon },
        { label: t.nav.briefings, href: "/agency/briefings", icon: FileTextIcon },
      ],
    },
    {
      group: t.nav.group.system,
      items: [
        { label: t.nav.settings, href: "/agency/settings", icon: SettingsIcon },
        { label: "Test Agent",   href: "/agency/test-agent", icon: FlaskIcon  },
      ],
    },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-[220px] flex flex-col bg-[#111111] z-40 overflow-y-auto">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-[5px] bg-[#5B5BD6] flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2h3v3H2V2zm5 0h3v3H7V2zm-5 5h3v3H2V7zm5 0h3v3H7V7z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white">Dioli OS</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((section, i) => (
          <div key={i} className={i > 0 ? "mt-5" : ""}>
            {section.group && (
              <div className="px-2 py-1.5 mb-1">
                <span className="text-[10px] font-semibold tracking-[0.08em] text-[#4A4A44] uppercase">
                  {section.group}
                </span>
              </div>
            )}
            {section.items.map((item) => {
              const active = path === item.href || (item.href !== "/agency/dashboard" && path.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group flex items-center gap-2.5 px-2 py-[7px] rounded-[6px] text-[13px] font-medium relative
                    transition-all duration-100
                    ${active
                      ? "bg-white/[0.08] text-white"
                      : "text-[#6B6B65] hover:bg-white/[0.04] hover:text-[#C0C0BA]"
                    }
                  `}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-[#5B5BD6] rounded-r-full" />
                  )}
                  <item.icon
                    size={15}
                    className={active ? "text-white" : "text-[#4A4A44] group-hover:text-[#8A8A84]"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#5B5BD6]/20 flex items-center justify-center text-[11px] font-semibold text-[#5B5BD6]">
            D
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-[#C0C0BA] truncate">Dioli Agency</div>
            <div className="text-[10px] text-[#4A4A44]">Internal OS</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Inline SVG Icons ──────────────────────────────────────────────────────────

function HomeIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H9.5v-4h-3v4H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function FolderIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 4a1 1 0 011-1h3.586a1 1 0 01.707.293L8.414 4.4A1 1 0 009.121 4.7H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function ColumnsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="3" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6.5" y="3" width="3" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="10" y="3" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function CheckIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function BuildingIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 14V4a1 1 0 011-1h8a1 1 0 011 1v10M1 14h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="6" y="9" width="2" height="5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="5" y="5.5" width="2" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="5.5" width="2" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}
function SwatchIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="5" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="11" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="10.5" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function CpuIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 4V2m4 2V2M6 14v-2m4 2v-2M4 6H2m2 4H2m12-4h-2m2 4h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function UserCogIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 13c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="12.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M12.5 9V8m0 6v-1m1.73-2.73l.7-.7M10.07 13.43l-.7.7M14.5 11h1M9.5 11H8.5m1.93-2.27l-.7-.7m4.24 4.24l.7.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}
function BoxIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M14 5.5l-6 3.5-6-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M2 5.5l6-3.5 6 3.5V11a1 1 0 01-.5.866L8 14 2.5 11.866A1 1 0 012 11V5.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 9v5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function FileTextIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6.5L9.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function DesignIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.5 10.5l1.5-3 2 2 1.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function SocialIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}
function AdsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2.5 13V8M6.5 13V4M10.5 13V9.5M14 13V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function SettingsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 2v1.5M8 12.5V14m4.95-1.05l-1.06-1.06M4.11 4.11L3.05 3.05M14 8h-1.5M3.5 8H2m9.9 4.95l-1.06-1.06M4.11 11.89l-1.06 1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function FlaskIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M6 2v5L3 12a1 1 0 00.9 1.5h8.2A1 1 0 0013 12l-3-5V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5.5 2h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
