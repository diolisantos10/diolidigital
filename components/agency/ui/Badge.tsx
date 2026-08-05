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
  default: "bg-[var(--accent)] text-[var(--text-secondary)]",
  // Client status
  active: "bg-[var(--success-bg)] text-[var(--success)]",
  inactive: "bg-[var(--accent)] text-[var(--text-muted)]",
  prospect: "bg-[var(--accent-light)] text-[var(--navy)]",
  // Priority
  high: "bg-[#FEE2E2] text-[var(--danger)]",
  medium: "bg-[var(--warning-bg)] text-[var(--warning)]",
  low: "bg-[var(--accent)] text-[var(--text-secondary)]",
  // Pipeline stages
  briefing: "bg-[var(--accent)] text-[var(--text-secondary)]",
  proposal_sent: "bg-[var(--accent-light)] text-[var(--navy)]",
  diagnosis: "bg-[var(--accent-light)] text-[var(--navy)]",
  planning: "bg-[#E6EEFF] text-[#1E40AF]",
  production: "bg-[var(--warning-bg)] text-[var(--warning)]",
  review: "bg-[#E6EEFF] text-[#0057FF]",
  delivery: "bg-[var(--success-bg)] text-[var(--success)]",
  ongoing: "bg-[#F0FDF4] text-[#15803D]",
  completed: "bg-[var(--accent)] text-[var(--text-muted)]",
  // Task status
  pending: "bg-[var(--accent)] text-[var(--text-secondary)]",
  in_progress: "bg-[var(--accent-light)] text-[var(--navy)]",
  done: "bg-[var(--success-bg)] text-[var(--success)]",
  blocked: "bg-[#FEE2E2] text-[var(--danger)]",
  // Deliverable status
  draft: "bg-[var(--accent)] text-[var(--text-secondary)]",
  in_review: "bg-[var(--warning-bg)] text-[var(--warning)]",
  approved: "bg-[var(--success-bg)] text-[var(--success)]",
  delivered: "bg-[var(--accent-light)] text-[var(--navy)]",
  // Briefing status
  pending_analysis: "bg-[var(--warning-bg)] text-[var(--warning)]",
  analyzed: "bg-[var(--accent-light)] text-[var(--navy)]",
  // Agent
  available: "bg-[var(--accent)] text-[var(--text-secondary)]",
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
  // Variante sem rótulo cadastrado aparecia crua para o usuário —
  // "Revision_requested", "Client_review". Chave de banco não é português:
  // no mínimo, troque o underscore por espaço antes de mostrar.
  const label =
    children ??
    LABELS[variant] ??
    variant.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  // Escala da §3: nada de tamanhos fracionários.
  const sizeClass = size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center rounded-[6px] font-semibold tracking-[0.01em] ${sizeClass} ${style} ${className}`}>
      {label}
    </span>
  );
}
