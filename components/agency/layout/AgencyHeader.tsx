"use client";

interface AgencyHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export default function AgencyHeader({ title, subtitle, actions, meta }: AgencyHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1A1A1A] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] text-[#6B6B65] mt-1 leading-snug">{subtitle}</p>
        )}
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2.5 ml-6 shrink-0">{actions}</div>}
    </div>
  );
}
