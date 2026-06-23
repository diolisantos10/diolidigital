import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const VARIANTS = {
  primary: "bg-[#070A1F] text-white hover:bg-[#4A4AC5] active:bg-[#3939B4]",
  secondary: "bg-white text-[#1A1A1A] border border-[#E5E5E2] hover:bg-[#F7F7F6] active:bg-[#EEEEEC]",
  ghost: "bg-transparent text-[#6B6B65] hover:bg-[#F0F0ED] hover:text-[#1A1A1A] active:bg-[#E8E8E5]",
  danger: "bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FECACA] active:bg-[#FCA5A5]",
};
const SIZES = {
  sm: "h-7 px-3 text-[12px] rounded-[6px]",
  md: "h-8 px-3.5 text-[13px] rounded-[7px]",
  lg: "h-9 px-4 text-[13px] rounded-[7px]",
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
        inline-flex items-center justify-center gap-1.5 font-medium
        transition-all duration-100 select-none whitespace-nowrap
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
