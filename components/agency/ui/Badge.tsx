import { ReactNode } from "react";

type Variant =
  | "default"
  | "active"
  | "inactive"
  | "prospect"
  | "high"
  | "medium"
  | "low"
  | "briefing"
  | "proposal_sent"
  | "diagnosis"
  | "planning"
  | "production"
  | "review"
  | "delivery"
  | "ongoing"
  | "completed"
  | "pending"
  | "in_progress"
  | "done"
  | "blocked"
  | "draft"
  | "in_review"
  | "approved"
  | "delivered"
  | "pending_analysis"
  | "analyzed"
  | "available";

const STYLES: Record<Variant, string> = {
  default: "bg-[#F0F0ED] text-[#6B6B65]",
  // Client status
  active: "bg-[#DCFCE7] text-[#16A34A]",
  inactive: "bg-[#F0F0ED] text-[#9B9B95]",
  prospect: "bg-[#E6FBFA] text-[#070A1F]",
  // Priority
  high: "bg-[#FEE2E2] text-[#DC2626]",
  medium: "bg-[#FEF3C7] text-[#D97706]",
  low: "bg-[#F0F0ED] text-[#6B6B65]",
  // Pipeline stages
  briefing: "bg-[#F0F0ED] text-[#6B6B65]",
  proposal_sent: "bg-[#E6FBFA] text-[#070A1F]",
  diagnosis: "bg-[#E6FBFA] text-[#070A1F]",
  planning: "bg-[#E0E7FF] text-[#4338CA]",
  production: "bg-[#FEF3C7] text-[#D97706]",
  review: "bg-[#FFE4E6] text-[#E11D48]",
  delivery: "bg-[#DCFCE7] text-[#16A34A]",
  ongoing: "bg-[#F0FDF4] text-[#15803D]",
  completed: "bg-[#F0F0ED] text-[#9B9B95]",
  // Task status
  pending: "bg-[#F0F0ED] text-[#6B6B65]",
  in_progress: "bg-[#E6FBFA] text-[#070A1F]",
  done: "bg-[#DCFCE7] text-[#16A34A]",
  blocked: "bg-[#FEE2E2] text-[#DC2626]",
  // Deliverable status
  draft: "bg-[#F0F0ED] text-[#6B6B65]",
  in_review: "bg-[#FEF3C7] text-[#D97706]",
  approved: "bg-[#DCFCE7] text-[#16A34A]",
  delivered: "bg-[#E6FBFA] text-[#070A1F]",
  // Briefing status
  pending_analysis: "bg-[#FEF3C7] text-[#D97706]",
  analyzed: "bg-[#E6FBFA] text-[#070A1F]",
  // Agent
  available: "bg-[#F0F0ED] text-[#6B6B65]",
};

const LABELS: Partial<Record<Variant, string>> = {
  // Client status
  active: "Ativo",
  inactive: "Inativo",
  prospect: "Prospect",
  // Priority
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  // Pipeline stages
  briefing: "Briefing",
  proposal_sent: "Proposta Enviada",
  diagnosis: "Diagnóstico",
  planning: "Planejamento",
  production: "Produção",
  review: "Revisão",
  delivery: "Entrega",
  ongoing: "Em Andamento",
  completed: "Concluído",
  // Task status
  pending: "Pendente",
  in_progress: "Em Andamento",
  done: "Concluída",
  blocked: "Bloqueada",
  // Deliverable status
  draft: "Rascunho",
  in_review: "Em Revisão",
  approved: "Aprovado",
  delivered: "Entregue",
  // Briefing status
  pending_analysis: "Aguardando",
  analyzed: "Analisado",
  // Agent
  available: "Disponível",
};

interface BadgeProps {
  variant: Variant;
  children?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export default function Badge({ variant, children, className = "", size = "sm" }: BadgeProps) {
  const style = STYLES[variant] ?? STYLES.default;
  const label = children ?? LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  const sizeClass = size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center rounded-[5px] font-medium ${sizeClass} ${style} ${className}`}>
      {label}
    </span>
  );
}
