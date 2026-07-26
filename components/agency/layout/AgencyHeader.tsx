"use client";

interface AgencyHeaderProps {
  title: string;
  eyebrow?: string;        // small uppercase label above the title
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "light" | "dark"; // "dark" for pages with a dark background
}

export default function AgencyHeader({ title, eyebrow, subtitle, actions, meta, tone = "light" }: AgencyHeaderProps) {
  const isDark = tone === "dark";
  const titleColor    = isDark ? "text-white" : "text-[var(--text-primary)]";
  const subtitleColor = isDark ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]";
  const eyebrowColor  = isDark ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]";

  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <p className={`text-[11px] font-semibold uppercase tracking-[0.1em] mb-1.5 ${eyebrowColor}`}>
            {eyebrow}
          </p>
        )}
        <h1 className={`text-[22px] font-semibold tracking-[-0.025em] leading-tight ${titleColor}`}>
          {title}
        </h1>
        {subtitle && (
          <p className={`text-[13px] mt-1 leading-relaxed ${subtitleColor}`}>{subtitle}</p>
        )}
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0 pt-0.5">{actions}</div>}
    </div>
  );
}
