import type { ClientRequest, BriefingAnalysis, ProposalLineItem } from "./client-requests";

// ── Pricing rules ─────────────────────────────────────────────────────────────

interface PriceRule {
  service: string;
  description: string;
  unit: string;
  minPrice: number;
  maxPrice: number;
  match: (services: string[]) => boolean;
}

const PRICE_RULES: PriceRule[] = [
  {
    service: "Social Media",
    description: "Gestão mensal de redes sociais",
    unit: "mês",
    minPrice: 2500,
    maxPrice: 4500,
    match: (s) => s.some((x) => /social/i.test(x)),
  },
  {
    service: "Identidade Visual",
    description: "Criação de identidade visual e branding",
    unit: "pacote",
    minPrice: 3000,
    maxPrice: 6000,
    match: (s) => s.some((x) => /design|branding|identidade/i.test(x)),
  },
  {
    service: "Tráfego Pago",
    description: "Setup e gestão mensal de campanhas",
    unit: "mês",
    minPrice: 2000,
    maxPrice: 4500,
    match: (s) => s.some((x) => /tráfego|pago|ads/i.test(x)),
  },
  {
    service: "Landing Page",
    description: "Criação de landing page responsiva",
    unit: "página",
    minPrice: 3500,
    maxPrice: 6000,
    match: (s) => s.some((x) => /landing/i.test(x)),
  },
  {
    service: "Website",
    description: "Desenvolvimento de website institucional",
    unit: "projeto",
    minPrice: 5000,
    maxPrice: 10000,
    match: (s) => s.some((x) => /website|site(?!s)/i.test(x)),
  },
  {
    service: "Apresentação",
    description: "Criação de apresentação comercial",
    unit: "projeto",
    minPrice: 1500,
    maxPrice: 3000,
    match: (s) => s.some((x) => /apresentação/i.test(x)),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateTimeline(services: string[], urgency?: string): string {
  const u = urgency?.toLowerCase() ?? "";
  if (u.includes("urgente") || u.includes("hoje")) return "7–14 dias úteis";
  if (u.includes("esta semana"))    return "14–21 dias úteis";
  if (u.includes("próxima semana")) return "21–30 dias úteis";
  if (services.length > 2) return "45–60 dias úteis";
  if (services.length > 1) return "30–45 dias úteis";
  return "21–30 dias úteis";
}

function buildDeliverables(services: string[]): string[] {
  const out: string[] = [];
  if (services.some((s) => /social/i.test(s))) {
    out.push("8 posts para feed (carrossel ou imagem estática)");
    out.push("16 Stories semanais");
    out.push("Calendário editorial mensal");
    out.push("Relatório de performance mensal");
  }
  if (services.some((s) => /design|branding|identidade/i.test(s))) {
    out.push("Logotipo (3 variações)");
    out.push("Manual de identidade visual (brand guide)");
    out.push("Paleta de cores e tipografia");
    out.push("Templates editáveis para redes sociais");
  }
  if (services.some((s) => /tráfego|pago|ads/i.test(s))) {
    out.push("Estrutura de campanhas (Meta Ads / Google Ads)");
    out.push("3–5 criativos de anúncio");
    out.push("Segmentações e públicos configurados");
    out.push("Relatório semanal de performance");
  }
  if (services.some((s) => /landing/i.test(s))) {
    out.push("Landing page responsiva (mobile + desktop)");
    out.push("Formulário de captura configurado");
    out.push("Revisão pós-lançamento (7 dias)");
  }
  if (services.some((s) => /website|site(?!s)/i.test(s))) {
    out.push("Website responsivo (até 5 páginas)");
    out.push("Integração com redes sociais");
    out.push("SEO on-page básico");
  }
  if (services.some((s) => /apresentação/i.test(s))) {
    out.push("Apresentação comercial (até 20 slides)");
    out.push("Versão editável em PowerPoint/Figma");
  }
  if (out.length === 0) {
    out.push("Escopo a ser definido após reunião de alinhamento");
  }
  return out;
}

function buildDiagnosedNeeds(req: ClientRequest): string[] {
  const { services, objectives, channels } = req.extractedSummary;
  const needs: string[] = [];
  if (services.some((s) => /social/i.test(s)))
    needs.push("Presença digital estruturada e consistente nas redes sociais");
  if (services.some((s) => /design|branding|identidade/i.test(s)))
    needs.push("Identidade visual profissional para fortalecer a marca");
  if (services.some((s) => /tráfego|pago|ads/i.test(s)))
    needs.push("Aquisição paga de clientes via campanhas de performance");
  if (objectives.some((o) => /venda|cliente|nova/i.test(o)))
    needs.push("Estratégia de crescimento e aquisição de novos clientes");
  if (objectives.some((o) => /autoridade|visibilidade/i.test(o)))
    needs.push("Posicionamento de marca e construção de autoridade no segmento");
  if (channels.some((c) => /instagram|facebook/i.test(c)))
    needs.push("Gestão profissional das redes sociais com foco em engajamento e conversão");
  if (needs.length === 0)
    needs.push("Comunicação digital estratégica alinhada aos objetivos do negócio");
  return needs;
}

function buildExecutiveSummary(req: ClientRequest, clientName: string): string {
  const { services, channels, objectives } = req.extractedSummary;
  const svc = services.length > 0 ? services.join(", ") : "serviços digitais";
  const obj = objectives.length > 0
    ? objectives.map((o) => o.replace(/^[A-Z]/, (c) => c.toLowerCase())).join(" e ")
    : "fortalecer a presença digital";
  const ch = channels.length > 0 ? ` com foco em ${channels.slice(0, 2).join(" e ")}` : "";
  return `${clientName} busca contratar ${svc}${ch} com o objetivo de ${obj}. Com base no briefing recebido, identificamos oportunidades claras de atuação que justificam o escopo proposto abaixo.`;
}

function buildClientGoal(req: ClientRequest): string {
  const { objectives, services } = req.extractedSummary;
  if (objectives.length > 0) return objectives.join(", ");
  if (services.length > 0)  return `Contratar ${services.join(", ")} para crescimento digital`;
  return "Estruturar presença digital e gerar resultado para o negócio";
}

function buildNextQuestions(req: ClientRequest): string[] {
  const { missingInfo, services, channels } = req.extractedSummary;
  const qs: string[] = [];
  if (missingInfo.includes("Prazo de entrega"))
    qs.push("Qual é o prazo ideal para início do projeto?");
  if (missingInfo.includes("Orçamento"))
    qs.push("Qual é a faixa de investimento mensal disponível para o projeto?");
  if (missingInfo.includes("Público-alvo"))
    qs.push("Qual é o perfil do público-alvo (faixa etária, localização, interesses)?");
  if (missingInfo.includes("Referências visuais ou de comunicação"))
    qs.push("Você tem referências de marcas ou comunicação visual que admira?");
  if (missingInfo.includes("Materiais de marca"))
    qs.push("Você possui logo, manual de marca ou materiais visuais existentes?");
  if (services.some((s) => /tráfego|pago/i.test(s)))
    qs.push("Você já possui conta no Meta Ads ou Google Ads configurada?");
  if (channels.some((c) => /instagram|facebook/i.test(c)))
    qs.push("Quem será responsável pela aprovação dos conteúdos publicados?");
  if (qs.length === 0)
    qs.push("Podemos agendar uma reunião de alinhamento para detalhar o escopo?");
  return qs;
}

function buildProposalDraft(
  req: ClientRequest,
  clientName: string,
  lineItems: ProposalLineItem[],
  timeline: string,
  priceRange: { min: number; max: number },
  deliverables: string[],
): string {
  const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
  const { services } = req.extractedSummary;
  const scope = services.length > 1 ? "marketing digital integrado" : (services[0] ?? "marketing digital");
  const dlv = deliverables.map((d) => `  • ${d}`).join("\n");
  const items = lineItems
    .map((l) => `  • ${l.service} — ${l.description}: ${fmt(l.minPrice)}–${fmt(l.maxPrice)}/${l.unit}`)
    .join("\n");

  return `PROPOSTA COMERCIAL — ${clientName.toUpperCase()}
Data: ${new Date().toLocaleDateString("pt-BR")}
Válida por: 15 dias

────────────────────────────────────────
SOBRE O PROJETO

Com base no briefing recebido, a Dioli propõe uma estratégia de ${scope} \
para ${clientName}, com foco em resultados mensuráveis e construção de \
presença digital consistente.

────────────────────────────────────────
ENTREGÁVEIS

${dlv}

────────────────────────────────────────
INVESTIMENTO

${items}

  Faixa total estimada: ${fmt(priceRange.min)} – ${fmt(priceRange.max)}
  *Valores finais sujeitos a detalhamento de escopo.

────────────────────────────────────────
PRAZO DE EXECUÇÃO

  ${timeline} após aprovação e recebimento dos materiais.

────────────────────────────────────────
PRÓXIMOS PASSOS

  1. Aprovação da proposta pelo cliente
  2. Assinatura de contrato
  3. Onboarding e coleta de materiais
  4. Início da execução

────────────────────────────────────────
A Dioli acompanha seu projeto de perto, com comunicação clara e relatórios \
regulares. Ficamos à disposição para ajustes e alinhamentos.
`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function processBriefing(req: ClientRequest, clientName = "Cliente"): BriefingAnalysis {
  const { suggestedDepartments, missingInfo, services } = req.extractedSummary;

  const lineItems: ProposalLineItem[] = PRICE_RULES
    .filter((rule) => rule.match(services))
    .map(({ service, description, unit, minPrice, maxPrice }) => ({
      service, description, unit, minPrice, maxPrice,
    }));

  if (lineItems.length === 0) {
    lineItems.push({
      service: "Marketing Digital",
      description: "Estratégia e execução (escopo a detalhar)",
      unit: "projeto",
      minPrice: 2000,
      maxPrice: 5000,
    });
  }

  const priceRange = {
    min: lineItems.reduce((acc, l) => acc + l.minPrice, 0),
    max: lineItems.reduce((acc, l) => acc + l.maxPrice, 0),
  };

  const timeline    = estimateTimeline(services, req.extractedSummary.urgency);
  const deliverables = buildDeliverables(services);

  return {
    processedAt:        new Date().toISOString(),
    executiveSummary:   buildExecutiveSummary(req, clientName),
    clientGoal:         buildClientGoal(req),
    diagnosedNeeds:     buildDiagnosedNeeds(req),
    recommendedServices: services.length > 0 ? services : ["Marketing Digital"],
    suggestedDeliverables: deliverables,
    departments:        suggestedDepartments,
    missingInfo,
    estimatedTimeline:  timeline,
    priceRange,
    lineItems,
    proposalDraft:      buildProposalDraft(req, clientName, lineItems, timeline, priceRange, deliverables),
    nextQuestions:      buildNextQuestions(req),
  };
}
