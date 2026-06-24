import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;           // small label above the title
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;        // right-side buttons/links
  className?: string;
}

// Shared page header used across all /agency/* pages.
// Provides consistent typography and spacing so every screen
// starts from the same visual baseline.
export function PageHeader({ eyebrow, title, subtitle, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-7 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9B9B95] mb-1.5">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] tracking-[-0.025em] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-[#6B6B65] mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}
