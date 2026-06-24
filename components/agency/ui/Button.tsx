import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "cyan";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const VARIANTS: Record<string, string> = {
  primary:   "bg-[#070A1F] text-white hover:bg-[#0E1333] active:bg-[#161B3D] shadow-[0_1px_2px_rgba(0,0,0,0.2)]",
  secondary: "bg-white text-[#1A1A1A] border border-[#E5E5E2] hover:bg-[#F5F5F3] hover:border-[#C8C8C4] active:bg-[#EEEEEC] shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  ghost:     "bg-transparent text-[#6B6B65] hover:bg-[#F0F0ED] hover:text-[#1A1A1A] active:bg-[#E8E8E5]",
  danger:    "bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] hover:bg-[#FECACA] active:bg-[#FCA5A5]",
  cyan:      "bg-[#9AF5F0] text-[#070A1F] hover:bg-[#7DEDE7] active:bg-[#60E0DB] shadow-[0_1px_2px_rgba(0,0,0,0.1)]",
};

const SIZES: Record<string, string> = {
  sm: "h-7 px-3 text-[11.5px] rounded-[6px] gap-1",
  md: "h-8 px-3.5 text-[12.5px] rounded-[7px]",
  lg: "h-9 px-4 text-[13px] rounded-[8px]",
};

export default function Button({
  variant = "secondary",
  size = "md",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5 font-semibold
        transition-all duration-[120ms] select-none whitespace-nowrap
        ${VARIANTS[variant]} ${SIZES[size]}
        ${disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
