"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useAgencyStore } from "@/store/agency-store";
import { AGENCY_ROLE_OPTIONS, isNavAllowed, type AgencyRole } from "@/lib/agency/roles";
import { generateAllAutoTasks } from "@/lib/agency/orchestration/auto-tasks";
import { DEPARTMENT_DEFS } from "@/lib/agency/departments";
import { DioliLogo } from "@/components/brand/DioliLogo";

const ROLE_LABEL: Record<string, string> = {
  master:          "Master",
  project_manager: "Project Manager",
  social_staff:    "Social",
  design_staff:    "Design",
  client:          "Cliente",
};

// Maps each department's iconKey to a sidebar icon component.
const DEPT_ICON_BY_KEY: Record<string, (p: { size?: number; className?: string }) => React.ReactElement> = {
  pm: UserCogIcon,
  strategy: CpuIcon,
  brand: SwatchIcon,
  social: SocialIcon,
  design: DesignIcon,
  ads: AdsIcon,
  system: SettingsIcon,
};

interface UserInfo {
  name: string;
  role: string;
  workspaceId: string;
}

interface AgencySidebarProps {
  userInfo?: UserInfo | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function usePendingCount() {
  const { projects, deliverables, brandUpdates, materialRequests } = useAgencyStore();
  const sentProposals = projects.filter((p) => p.proposal?.status === "sent").length;
  const inReviewDelivs = deliverables.filter((d) => d.status === "in_review").length;
  const pendingBrand = brandUpdates.filter((u) => u.status === "pending").length;
  const pendingMats = materialRequests.filter((r) => r.status === "pending").length;
  return sentProposals + inReviewDelivs + pendingBrand + pendingMats;
}

function useNewRequestsCount() {
  const { clientRequests } = useAgencyStore();
  return (clientRequests ?? []).filter((r) => r.status === "new").length;
}

function useTaskBadgeCount() {
  const { tasks, projects, clients, deliverables, materialRequests, strategyRooms } = useAgencyStore();
  const autoTasks = generateAllAutoTasks({ projects, clients, deliverables, tasks, materialRequests, strategyRooms });
  const criticalHigh = autoTasks.filter((t) => t.priority === "critical" || t.priority === "high").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  return criticalHigh + blocked;
}

export default function AgencySidebar({ userInfo, mobileOpen = false, onMobileClose }: AgencySidebarProps) {
  const path = usePathname();
  const { t } = useTranslation();
  const { currentRole, setCurrentRole } = useAgencyStore();
  const pendingCount = usePendingCount();
  const taskBadgeCount = useTaskBadgeCount();
  const newRequestsCount = useNewRequestsCount();

  const NAV = [
    {
      group: null,
      items: [
        { label: t.nav.home, href: "/agency/dashboard", icon: HomeIcon },
        { label: "Painel Maestro", href: "/agency/maestro", icon: BrainIcon },
        { label: "Aprovações", href: "/agency/approvals", icon: BellIcon, badge: pendingCount },
        { label: "Solicitações", href: "/agency/requests", icon: FileTextIcon, badge: newRequestsCount },
        { label: "Vitrine (Self-Serve)", href: "/vitrine", icon: ShopIcon },
      ],
    },
    {
      group: t.nav.group.work,
      items: [
        { label: t.nav.projects, href: "/agency/projects", icon: FolderIcon },
        { label: t.nav.pipeline, href: "/agency/pipeline", icon: ColumnsIcon },
        { label: t.nav.tasks, href: "/agency/tasks", icon: CheckIcon, badge: taskBadgeCount },
      ],
    },
    {
      group: t.nav.group.clients,
      items: [
        { label: t.nav.clients, href: "/agency/clients", icon: BuildingIcon },
        { label: "Planos & Preços", href: "/agency/catalog", icon: TagIcon },
        { label: t.nav.brandAssets, href: "/agency/brand-assets", icon: SwatchIcon },
      ],
    },
    {
      group: "Departamentos",
      items: [
        { label: "Visão Geral", href: "/agency/departments", icon: DepartmentsIcon },
        ...DEPARTMENT_DEFS.map((d) => ({
          label: d.name,
          href: `/agency/departments/${d.id}`,
          icon: DEPT_ICON_BY_KEY[d.iconKey] ?? DepartmentsIcon,
        })),
        { label: "Nova Linha de Produção", href: "/agency/production/new", icon: PlusCircleIcon },
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
      group: "Agentes IA",
      items: [
        { label: "PM Agent", href: "/agency/pm-agent", icon: UserCogIcon },
        { label: "Estratégia", href: "/agency/strategy-agent", icon: CompassIcon },
        { label: "Brand Hub", href: "/agency/brand-hub-agent", icon: SwatchIcon },
        { label: "Social Media", href: "/agency/social-media-agent", icon: SocialIcon },
        { label: "Design", href: "/agency/design-agent", icon: DesignIcon },
        { label: "Tráfego Pago", href: "/agency/ads-agent", icon: AdsIcon },
        { label: "Operações", href: "/agency/operations-agent", icon: SettingsIcon },
      ],
    },
    {
      group: "Inteligência",
      items: [
        { label: "Dioli Brain", href: "/agency/brain", icon: BrainIcon },
        { label: "Estratégia (Brain)", href: "/agency/strategy", icon: CompassIcon },
        { label: "Social (Brain)", href: "/agency/social", icon: SocialIcon },
        { label: "Design (Brain)", href: "/agency/design", icon: DesignIcon },
        { label: "Tráfego (Brain)", href: "/agency/traffic", icon: AdsIcon },
        { label: "Analytics (Brain)", href: "/agency/analytics", icon: AnalyticsIcon },
        { label: "Quality (Brain)", href: "/agency/quality", icon: QualityIcon },
      ],
    },
    {
      group: t.nav.group.system,
      items: [
        { label: "Ferramentas & Integrações", href: "/agency/integrations", icon: IntegrationsIcon },
        { label: t.nav.settings, href: "/agency/settings", icon: SettingsIcon },
        { label: "Laboratório",  href: "/agency/simulations", icon: FlaskIcon  },
      ],
    },
  ];

  // Dev assertion: every nav href must be a root-relative /agency/ path.
  // Catches misconfigurations (absolute URLs, typos, empty strings) at dev time.
  if (process.env.NODE_ENV === "development") {
    const bad = NAV.flatMap((s) => s.items).filter(
      (item) => !item.href.startsWith("/agency/") || item.href.includes("://")
    );
    if (bad.length > 0) {
      // eslint-disable-next-line no-console
      console.error("[Sidebar] Invalid nav hrefs:", bad.map((i) => `${i.label} → "${i.href}"`));
    }
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 left-0 w-[224px] flex flex-col z-40 overflow-y-auto",
          "transition-transform duration-200",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ background: "linear-gradient(180deg, #0B0F2A 0%, #070A1F 40%, #050817 100%)" }}
      >
      {/* ── Logo ─────────────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="h-[52px] flex items-center px-5 border-b border-white/[0.05]">
          <DioliLogo variant="full" tone="light" markSize={22} className="text-[13px]" />
        </div>

        {/* User card */}
        {userInfo ? (
          <div className="mx-3 mt-3 mb-1 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
               style={{ background: "rgba(154,245,240,0.06)", border: "1px solid rgba(154,245,240,0.10)" }}>
            <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                 style={{ background: "rgba(154,245,240,0.15)", color: "#9AF5F0" }}>
              {userInfo.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-white truncate leading-tight">{userInfo.name}</div>
              <div className="text-[10px] leading-tight mt-0.5" style={{ color: "rgba(154,245,240,0.5)" }}>
                {ROLE_LABEL[userInfo.role] ?? userInfo.role}
              </div>
            </div>
            <a
              href="/auth/signout"
              className="shrink-0 transition-colors"
              style={{ color: "rgba(255,255,255,0.25)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
              title="Sair da conta"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        ) : null}
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV.map((section, i) => {
          const visibleItems = section.items.filter((item) => isNavAllowed(currentRole, item.href));
          if (visibleItems.length === 0) return null;
          return (
            <div key={i} className={i > 0 ? "mt-5" : ""}>
              {section.group && (
                <div className="px-2 pt-1 pb-1.5 mb-0.5">
                  <span className="text-[9.5px] font-semibold tracking-[0.1em] uppercase"
                        style={{ color: "rgba(255,255,255,0.22)" }}>
                    {section.group}
                  </span>
                </div>
              )}
              {visibleItems.map((item) => {
                const active = path === item.href || (item.href !== "/agency/dashboard" && path.startsWith(item.href));
                const badge = (item as { badge?: number }).badge;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-2.5 px-2.5 py-[6px] rounded-[7px] text-[12.5px] font-medium relative transition-all duration-100"
                    style={active ? {
                      background: "rgba(154,245,240,0.10)",
                      color: "#FFFFFF",
                    } : {
                      color: "rgba(255,255,255,0.4)",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[20px] rounded-r-full"
                        style={{ background: "#9AF5F0", boxShadow: "0 0 6px rgba(154,245,240,0.6)" }}
                      />
                    )}
                    <item.icon
                      size={14}
                      className="shrink-0 transition-colors"
                      // @ts-expect-error style override
                      style={{ color: active ? "#9AF5F0" : undefined }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge != null && badge > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[17px] px-1 rounded-full text-[10px] font-bold leading-none"
                            style={{ background: "#D97706", color: "#fff" }}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Bottom: role switcher ─────────────────────────────────────────────── */}
      <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] mb-1.5 px-1"
             style={{ color: "rgba(255,255,255,0.22)" }}>
          Visualizar como
        </div>
        <select
          value={currentRole}
          onChange={(e) => setCurrentRole(e.target.value as AgencyRole)}
          className="w-full text-[11px] rounded-[6px] px-2 py-1.5 outline-none cursor-pointer transition-colors"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {AGENCY_ROLE_OPTIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </div>
    </aside>
    </>
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
function BellIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 2a4 4 0 00-4 4v3l-1 2h10l-1-2V6a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M6.5 12.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
function TagIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2.5 2.5h4.7a1 1 0 01.7.3l5.8 5.8a1 1 0 010 1.4l-3.9 3.9a1 1 0 01-1.4 0L2.6 8.1a1 1 0 01-.3-.7V2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <circle cx="5.2" cy="5.2" r="1" fill="currentColor"/>
    </svg>
  );
}
function ShopIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M1.5 2h13l-1.5 5H3L1.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M3 7v6h10V7" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M6 13v-3h4v3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
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
function IntegrationsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 4h4M4 6v4M12 6v4M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
function DepartmentsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M11.5 9v6M9 11.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function PlusCircleIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
function CompassIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 5.5L9 9l-3.5 1.5L7 7l3.5-1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function QualityIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 2L9.8 6.2 14.5 6.9l-3.25 3.15.77 4.46L8 12.3 3.98 14.5l.77-4.46L1.5 6.9l4.7-.7L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}
function AnalyticsIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 13l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="2" cy="13" r="1" fill="currentColor"/>
      <circle cx="5" cy="9" r="1" fill="currentColor"/>
      <circle cx="8" cy="11" r="1" fill="currentColor"/>
      <circle cx="11" cy="6" r="1" fill="currentColor"/>
      <circle cx="14" cy="9" r="1" fill="currentColor"/>
    </svg>
  );
}
function BrainIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M8 2C5.24 2 3 4.24 3 7c0 1.1.36 2.12.96 2.94C3.36 10.32 3 11.12 3 12c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2 0-.88-.36-1.68-.96-2.06C12.64 9.12 13 8.1 13 7c0-2.76-2.24-5-5-5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M6 7h4M7 9.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}
