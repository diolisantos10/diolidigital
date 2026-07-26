// ─── Self-Serve Micro-Service Catalog ─────────────────────────────────────────
// Small, fixed-price services sold directly to clients via the public vitrine
// (/vitrine). These are the entry-point offers: low commitment, fast delivery,
// designed to convert one-off buyers into monthly plan clients.
//
// Pricing is fixed (not min–max) because the buyer pays at checkout.
// ─────────────────────────────────────────────────────────────────────────────

export type SelfServeCategory = "social" | "video" | "design" | "traffic";

export interface MicroService {
  id: string;
  label: string;
  description: string;
  deliverables: string[];  // bullet list shown on the card
  price: number;           // BRL, fixed
  deliveryDays: number;    // business days
  category: SelfServeCategory;
  popular?: boolean;
}

export const SELF_SERVE_CATALOG: MicroService[] = [
  // ── Social Media ────────────────────────────────────────────────────────
  {
    id: "pack-4-stories",
    label: "Pack 4 Stories",
    description: "Quatro stories personalizados com design e copy prontos para publicar.",
    deliverables: ["4 stories 1080×1920", "Copy e hashtags", "Arquivo final (PNG/MP4)", "Entrega em 2 dias úteis"],
    price: 150,
    deliveryDays: 2,
    category: "social",
  },
  {
    id: "pack-8-stories",
    label: "Pack 8 Stories",
    description: "Oito stories — uma semana cheia de conteúdo com sequência estratégica.",
    deliverables: ["8 stories 1080×1920", "Copy e sequência narrativa", "Arquivo final (PNG/MP4)", "Entrega em 3 dias úteis"],
    price: 270,
    deliveryDays: 3,
    category: "social",
    popular: true,
  },
  {
    id: "pack-4-posts",
    label: "4 Posts Feed",
    description: "Quatro posts para feed com design exclusivo e texto otimizado.",
    deliverables: ["4 artes 1080×1080", "Copy e legenda completa", "Arquivo final (PNG)", "Entrega em 3 dias úteis"],
    price: 220,
    deliveryDays: 3,
    category: "social",
  },
  {
    id: "pack-8-posts",
    label: "8 Posts Feed",
    description: "Oito posts — quinzena completa de conteúdo estratégico.",
    deliverables: ["8 artes 1080×1080", "Copy e legenda completa", "Calendário de publicação", "Entrega em 5 dias úteis"],
    price: 400,
    deliveryDays: 5,
    category: "social",
  },

  // ── Video / Reels ────────────────────────────────────────────────────────
  {
    id: "1-reel",
    label: "1 Reel",
    description: "Um reel com roteiro, edição, música e legendas animadas.",
    deliverables: ["Roteiro e copy", "Edição completa", "Legendas animadas", "Entrega em 4 dias úteis"],
    price: 350,
    deliveryDays: 4,
    category: "video",
    popular: true,
  },
  {
    id: "pack-2-reels",
    label: "Pack 2 Reels",
    description: "Dois reels com roteiro, edição e identidade visual consistente.",
    deliverables: ["2 roteiros e copy", "2 vídeos editados", "Legendas animadas", "Entrega em 6 dias úteis"],
    price: 620,
    deliveryDays: 6,
    category: "video",
  },

  // ── Design ───────────────────────────────────────────────────────────────
  {
    id: "banner-digital",
    label: "Banner Digital",
    description: "Banner para anúncio, capa de perfil ou materiais de divulgação.",
    deliverables: ["1 banner no formato solicitado", "Até 2 revisões", "Arquivo em PNG e PDF", "Entrega em 1 dia útil"],
    price: 120,
    deliveryDays: 1,
    category: "design",
  },
  {
    id: "identidade-basica",
    label: "Identidade Básica",
    description: "Logo + paleta de cores + tipografia — a base visual do seu negócio.",
    deliverables: ["Logotipo (2 variações)", "Paleta de cores", "Tipografia definida", "Entrega em 5 dias úteis"],
    price: 480,
    deliveryDays: 5,
    category: "design",
  },

  // ── Tráfego Pago ─────────────────────────────────────────────────────────
  {
    id: "setup-meta-ads",
    label: "Setup Meta Ads",
    description: "Criação e configuração da sua primeira campanha no Meta (Facebook/Instagram).",
    deliverables: ["Estrutura de campanha", "Públicos e segmentação", "Copy dos anúncios", "Entrega em 3 dias úteis"],
    price: 380,
    deliveryDays: 3,
    category: "traffic",
  },
];

export const CATEGORY_LABEL: Record<SelfServeCategory, string> = {
  social: "Redes Sociais",
  video: "Vídeo & Reels",
  design: "Design",
  traffic: "Tráfego Pago",
};

export const CATEGORY_COLOR: Record<SelfServeCategory, { bg: string; text: string; dot: string }> = {
  social:  { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", dot: "bg-[#9AF5F0]" },
  video:   { bg: "bg-[#E9EFFF]", text: "text-[#1E3A8A]", dot: "bg-[#8B5CF6]" },
  design:  { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", dot: "bg-[#F59E0B]" },
  traffic: { bg: "bg-[#DCFCE7]", text: "text-[#166534]", dot: "bg-[#16A34A]" },
};

export function brlFixed(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
