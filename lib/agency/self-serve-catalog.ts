// ─── Self-Serve Micro-Service Catalog ─────────────────────────────────────────
// Small, fixed-price services sold directly to clients via the public vitrine
// (/vitrine). These are the entry-point offers: low commitment, fast delivery,
// designed to convert one-off buyers into monthly plan clients.
//
// Pricing is fixed (not min–max) because the buyer pays at checkout.
// ─────────────────────────────────────────────────────────────────────────────

import { PLANOS } from "./planos";

export type SelfServeCategory = "social" | "video" | "design" | "traffic" | "balcao";

export interface MicroService {
  id: string;
  label: string;
  description: string;
  deliverables: string[];  // bullet list shown on the card
  price: number;           // BRL, fixed
  deliveryDays: number;    // business days
  category: SelfServeCategory;
  popular?: boolean;

  // Piso de negociação. Existe porque desconto sem chão vira leilão: cada
  // pedido puxa um pouco mais para baixo até a linha inteira dar prejuízo.
  // Abaixo do piso a resposta NÃO é "aprovo por menos" — é cortar ESCOPO
  // (menos telas, sem legenda, prazo maior). Margem não é moeda de troca.
  // Só o comercial vê este número; a vitrine pública nunca o exibe.
  precoMinimo?: number;

  // Prazo que o número sozinho não conta. Um pacote mensal não tem "30d úteis":
  // ele tem um ciclo. Sem este campo a interface teria que escrever prazo na
  // mão — e prazo, como preço, mora em um lugar só.
  deliveryLabel?: string;
}

// O único número de PLANO que este arquivo usa vem da fonte única. Ver o
// comentário em `balcao-pacote-mes`.
const RITMO = PLANOS.find((p) => p.id === "ritmo")!;

export const SELF_SERVE_CATALOG: MicroService[] = [
  // ── Balcão ───────────────────────────────────────────────────────────────
  // Decisão do CEO em 05/08/2026: a Dioli é empresa de serviços digitais PARA
  // TODAS AS PESSOAS. Quem chega com R$ 60 e quer um carrossel sai com produto,
  // não com uma recusa educada. O balcão só é lucrativo sob três condições, e
  // as três valem juntas ou nenhuma vale:
  //   1. produção 100% por máquina — zero hora humana no item;
  //   2. pagamento ANTES da produção — nada entra na fila sem estar pago;
  //   3. escopo fechado — o que está no `deliverables` é tudo que sai.
  // Por isso o balcão vem primeiro na lista: é a porta de entrada, e porta de
  // entrada escondida atrás de um reel de R$ 620 não é porta.
  //
  // ⚠️ Junta conhecida: hoje o pedido pago só vira `status: "in_progress"` no
  // `ClientRequestDb` (app/api/self-serve/webhook/route.ts). Nada aciona agente
  // nem cria Deliverable — é a quebra do pipeline registrada no BACKLOG.md.
  // Enquanto isso não fechar, todo item de balcão vendido depende de alguém
  // empurrar a produção à mão, o que mata a premissa (1).
  {
    id: "balcao-post-feed",
    label: "Post para feed",
    description: "Uma arte para o feed com legenda pronta para publicar.",
    deliverables: [
      "1 arte 1080×1350 (feed vertical)",
      "Legenda pronta, no tom da marca",
      "Arquivo PNG no portal do cliente",
      "Escopo fechado: sem rodada de revisão",
    ],
    price: 79,
    precoMinimo: 49,
    deliveryDays: 2,
    category: "balcao",
  },
  {
    id: "balcao-carrossel-5",
    label: "Carrossel até 5 telas",
    description: "Sequência de até cinco telas com capa e legenda.",
    deliverables: [
      "Capa + até 4 telas de miolo (1080×1350)",
      "Sequência com começo, meio e fim",
      "Legenda pronta, no tom da marca",
      "Arquivos PNG numerados na ordem de publicação",
    ],
    price: 129,
    precoMinimo: 79,
    deliveryDays: 2,
    category: "balcao",
    popular: true,
  },
  {
    id: "balcao-4-stories",
    label: "4 stories",
    description: "Quatro stories verticais com margem protegida.",
    deliverables: [
      "4 stories 1080×1920",
      "Margem protegida: nada de texto cortado por barra ou botão",
      "Texto de cada tela",
      "Arquivos PNG no portal do cliente",
    ],
    price: 99,
    precoMinimo: 59,
    deliveryDays: 2,
    category: "balcao",
  },
  {
    id: "balcao-legenda",
    label: "Legenda / copy avulsa",
    description: "Só o texto — para quem já tem a arte e trava na escrita.",
    deliverables: [
      "1 legenda no tom da marca",
      "Chamada para ação e hashtags",
      "Texto pronto para copiar e colar",
      "Não inclui arte",
    ],
    price: 39,
    precoMinimo: 29,
    deliveryDays: 1,
    category: "balcao",
  },
  {
    id: "balcao-auditoria-perfil",
    label: "Auditoria de perfil",
    description: "Relatório do que está travando o seu Instagram hoje.",
    deliverables: [
      "Leitura de bio, destaques e das últimas publicações",
      "Lista do que corrigir, em ordem de prioridade",
      "O que fazer primeiro na semana seguinte",
      "Relatório em PDF no portal do cliente",
    ],
    price: 149,
    precoMinimo: 99,
    deliveryDays: 3,
    category: "balcao",
  },
  {
    id: "balcao-pacote-mes",
    label: "Pacote mês — 8 peças",
    description: "Um mês de conteúdo: pauta, oito peças e calendário.",
    deliverables: [
      "Pauta do mês enviada antes da produção",
      "8 peças (posts e/ou carrosséis)",
      "Calendário com a data de cada publicação",
      "Aprovação peça a peça no portal do cliente",
    ],
    // 🔴 ESTE ITEM É O PLANO RITMO COM OUTRO NOME, e o preço prova: R$ 297 e
    // piso R$ 229 eram os números do Ritmo, digitados aqui de novo. A duplicata
    // foi eliminada — os dois valores agora DERIVAM de `lib/agency/planos.ts`.
    //
    // ⚠️ A SOBREPOSIÇÃO COMERCIAL CONTINUA DE PÉ E É DECISÃO DO CEO: o Ritmo
    // cobra R$ 297/mês + R$ 390 de implantação + 3 meses de permanência; este
    // item entrega as mesmas 8 peças por R$ 297, sem implantação e sem
    // permanência, na vitrine pública. Quem comparar as duas telas compra esta.
    // Nenhum produto foi removido aqui — remover oferta é decisão de negócio.
    price: RITMO.preco,
    precoMinimo: RITMO.piso ?? undefined,
    deliveryDays: 30,
    deliveryLabel: "mensal",
    category: "balcao",
    popular: true,
  },

  // ── Social Media ────────────────────────────────────────────────────────
  // ⚠️ Sobreposição real com o balcão: `pack-4-stories` (R$ 150) entrega quase
  // a mesma coisa que `balcao-4-stories` (R$ 99). A diferença precisa ser de
  // ESCOPO declarado, não de tabela — enquanto ninguém decidir qual é qual, a
  // vitrine mostra dois preços para o mesmo produto. Decisão pendente do CEO.
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
  balcao: "Balcão",
  social: "Redes Sociais",
  video: "Vídeo & Reels",
  design: "Design",
  traffic: "Tráfego Pago",
};

export const CATEGORY_COLOR: Record<SelfServeCategory, { bg: string; text: string; dot: string }> = {
  // Balcão ganha cor própria porque é linha de produto, não desconto de outra:
  // se herdasse o ciano de "social", pareceria a mesma coisa mais barata.
  balcao:  { bg: "bg-[#FCE7F3]", text: "text-[#9D174D]", dot: "bg-[#EC4899]" },
  social:  { bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", dot: "bg-[#9AF5F0]" },
  video:   { bg: "bg-[#E9EFFF]", text: "text-[#1E3A8A]", dot: "bg-[#8B5CF6]" },
  design:  { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", dot: "bg-[#F59E0B]" },
  traffic: { bg: "bg-[#DCFCE7]", text: "text-[#166534]", dot: "bg-[#16A34A]" },
};

export function brlFixed(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Piso de negociação do balcão ─────────────────────────────────────────────
// Derivado do próprio catálogo, nunca redigitado: número de preço escrito em
// dois lugares vira duas verdades no dia em que alguém corrige só um.
//
// Como se usa: `PISO_BALCAO["balcao-carrossel-5"]` é o MENOR valor que o
// comercial pode fechar. Chegou aí e o cliente ainda pede desconto? Tira item
// do escopo. Se nem assim fecha, a resposta é não — e o caso sobe, não desce.
export const PISO_BALCAO: Record<string, number> = Object.fromEntries(
  SELF_SERVE_CATALOG
    .filter((s) => s.category === "balcao" && typeof s.precoMinimo === "number")
    .map((s) => [s.id, s.precoMinimo as number]),
);

// `true` quando o valor cabe no piso. Existe para que a regra seja um teste
// executável e não um parágrafo de manual — aviso em prosa ninguém roda.
export function dentroDoPiso(serviceId: string, valor: number): boolean {
  const piso = PISO_BALCAO[serviceId];
  if (piso === undefined) return false;   // item sem piso declarado não se negocia
  return valor >= piso;
}

// Prazo em uma linha só. A vitrine não formata prazo por conta própria pelo
// mesmo motivo que não formata preço: o catálogo é a fonte.
export function prazoCurto(s: MicroService): string {
  return s.deliveryLabel ?? `${s.deliveryDays}d úteis`;
}

export function prazoLongo(s: MicroService): string {
  return s.deliveryLabel ? `entrega ${s.deliveryLabel}` : `entrega em ${s.deliveryDays} dias úteis`;
}
