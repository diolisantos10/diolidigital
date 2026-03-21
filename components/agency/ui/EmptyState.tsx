import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[#F0F0ED] flex items-center justify-center mb-4 text-[#9B9B95]">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium text-[#1A1A1A]">{title}</p>
      {description && (
        <p className="text-[13px] text-[#9B9B95] mt-1.5 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
