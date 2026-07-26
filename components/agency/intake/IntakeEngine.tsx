"use client";

import { useState } from "react";
import type { Client } from "@/lib/agency/mock-data";
import Button from "@/components/agency/ui/Button";
import { useAgencyStore } from "@/store/agency-store";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientLevel = "beginner" | "intermediate" | "advanced";
type IntakeMode = "guided" | "free_brief" | "existing_brief";
type IntakePhase = "client" | "project";
type LevelText = string | Record<ClientLevel, string>;

interface IntakeQuestion {
  id: string;
  internalLabel: string;
  question: LevelText;
  hint?: LevelText;
  placeholder: LevelText;
  type: "text" | "textarea" | "multiselect";
  options?: string[] | Record<ClientLevel, string[]>;
  required: boolean;
  weight: number;
}

interface IntakeBlock {
  id: string;
  title: string;
  description: string;
  questions: IntakeQuestion[];
}

type IntakeAnswers = Record<string, string | string[]>;

export interface IntakeSummary {
  clientId: string;
  clientContext: string;
  projectObjective: string;
  servicesRequested: string[];
  missingInformation: string[];
  recommendedNextQuestions: string[];
  readinessScore: number;
  readinessLabel: "Não Pronto" | "Parcialmente Pronto" | "Pronto";
}

export interface IntakePrefill {
  clientId: string;
  services: string[];
  businessDescription: string;
  objective: string;
  targetAudience: string;
  channels: string[];
  deadline: string;
  notes: string;
}

// ─── Level-text resolver ──────────────────────────────────────────────────────

function resolve(text: LevelText, level: ClientLevel): string {
  return typeof text === "string" ? text : text[level];
}

function resolveOptions(opts: string[] | Record<ClientLevel, string[]>, level: ClientLevel): string[] {
  return Array.isArray(opts) ? opts : opts[level];
}

// ─── CLIENT PROFILE blocks — stored once per client ──────────────────────────
// These fields describe who the client is, not what they want to do right now.

const CLIENT_PROFILE_BLOCKS: IntakeBlock[] = [
  {
    id: "business",
    title: "Sua empresa",
    description: "Vamos começar por quem você é e o que faz.",
    questions: [
      {
        id: "business_name",
        internalLabel: "Nome e segmento da empresa",
        question: {
          beginner: "Qual é o nome da sua empresa e o que você vende ou oferece?",
          intermediate: "Qual é o nome da empresa e o segmento?",
          advanced: "Nome da empresa e segmento.",
        },
        hint: {
          beginner: "Só o básico — a gente constrói a partir daqui.",
          intermediate: "Inclua o setor se ajudar (ex.: alimentação, SaaS, moda).",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Sushikasa — somos um restaurante japonês em São Paulo",
          intermediate: "ex.: Sushikasa — rede de restaurantes japoneses premium",
          advanced: "ex.: Sushikasa / Alimentação / 5 unidades",
        },
        type: "text",
        required: true,
        weight: 8,
      },
      {
        id: "business_description",
        internalLabel: "Descrição da empresa",
        question: {
          beginner: "Conte um pouco sobre a sua empresa — o que você faz, quem você atende e há quanto tempo está no mercado.",
          intermediate: "Descreva brevemente o que a empresa faz, seu posicionamento no mercado e o porte.",
          advanced: "Descrição da empresa: produto/serviço, posicionamento, escala, maturidade.",
        },
        hint: {
          beginner: "Não precisa ser formal — descreva como você faria para um novo cliente.",
          intermediate: "2 a 3 frases já bastam.",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Estamos abertos há 3 anos e servimos comida japonesa premium em São Paulo. As pessoas vêm para ocasiões especiais — a experiência é o nosso diferencial.",
          intermediate: "ex.: 5 restaurantes premium em São Paulo, focados em profissionais de alta renda. Expansão para o Rio no 3º trimestre.",
          advanced: "ex.: Marca de alimentação premium com 5 unidades, Série A, crescimento de 40% ao ano, foco em B2C.",
        },
        type: "textarea",
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "brand",
    title: "Sua marca",
    description: "Como a sua marca se apresenta e como ela se comunica?",
    questions: [
      {
        id: "brand_tone",
        internalLabel: "Tom de voz da marca",
        question: {
          beginner: "Como você quer que a sua marca seja percebida pelos clientes? Mais séria, divertida, elegante, acessível ou ousada?",
          intermediate: "Como você descreveria a personalidade e o tom de comunicação da sua marca?",
          advanced: "Tom de voz da marca e diretrizes de comunicação.",
        },
        hint: {
          beginner: "Isso nos ajuda a escrever e criar em um estilo que combine naturalmente com o seu negócio.",
          intermediate: "Pense em adjetivos: refinada, descontraída, ousada, confiável, acolhedora, etc.",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Elegante, mas acolhedora — queremos que as pessoas se sintam bem-vindas e especiais, não que estão sendo vendidas",
          intermediate: "ex.: Refinada, premium, minimalista — nunca exagerada ou informal",
          advanced: "ex.: Sofisticada, culturalmente atenta, minimalista; evita linguagem corporativa ou promocional",
        },
        type: "text",
        required: false,
        weight: 5,
      },
      {
        id: "brand_existing",
        internalLabel: "Materiais de marca existentes",
        question: {
          beginner: "Você já tem um logo ou algum material visual? O que você tem?",
          intermediate: "Quais materiais de marca você já tem prontos?",
          advanced: "Materiais de marca existentes (logo, identidade visual, manual, fotografia).",
        },
        hint: {
          beginner: "Pense: um arquivo de logo, fotos profissionais, cores que são da marca, qualquer coisa que um designer tenha entregue.",
          intermediate: "ex.: Logo, manual de marca, paleta de cores, banco de fotos.",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Sim — temos um logo e fotos profissionais da campanha do ano passado",
          intermediate: "ex.: Manual de marca completo, logo em SVG, fotografia profissional",
          advanced: "ex.: Sistema de marca completo: logo, manual, paleta, banco de fotos",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "audience",
    title: "Com quem você fala",
    description: "Conte pra gente sobre as pessoas que você quer alcançar.",
    questions: [
      {
        id: "audience",
        internalLabel: "Público-alvo",
        question: {
          beginner: "Quem costuma comprar de você ou usar o seu serviço? Descreva essa pessoa com as suas palavras.",
          intermediate: "Descreva o seu público-alvo: idade, profissão, estilo de vida e o que valoriza.",
          advanced: "Perfil do público-alvo: dados demográficos, psicográficos, comportamento nas plataformas, segmentação.",
        },
        hint: {
          beginner: "Pense: qual a idade, no que trabalham, com o que se importam, como te encontraram?",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Na maioria casais e profissionais na faixa dos 30 e 40 anos em busca de uma noite especial — costumam nos encontrar pelo Instagram ou por indicação de um amigo",
          intermediate: "ex.: Profissionais urbanos de 30 a 45 anos, alto poder aquisitivo, valorizam experiências. Ativos no Instagram e no LinkedIn.",
          advanced: "ex.: Diretores de RH em empresas de 50 a 500 pessoas, B2B, foco em LinkedIn, tomadores de decisão em People Ops.",
        },
        type: "textarea",
        required: true,
        weight: 15,
      },
    ],
  },
  {
    id: "current_marketing",
    title: "O que você faz hoje",
    description: "Ajude a gente a entender a sua situação atual de marketing.",
    questions: [
      {
        id: "current_channels",
        internalLabel: "Canais atuais",
        question: {
          beginner: "Você já posta ou anuncia em algum lugar? Onde?",
          intermediate: "Em quais canais de marketing você está ativo hoje?",
          advanced: "Canais ativos atuais e desempenho aproximado.",
        },
        hint: {
          beginner: "Por exemplo: Instagram, Google, panfletos, email, boca a boca — tudo conta.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Postamos no Instagram de vez em quando e aparecemos no Google Maps",
          intermediate: "ex.: Instagram, newsletter por email, Google Ads ocasional",
          advanced: "ex.: Meta (orgânico + pago), Google Ads, CRM de email (Mailchimp, lista de 12 mil)",
        },
        type: "text",
        required: false,
        weight: 4,
      },
      {
        id: "what_works",
        internalLabel: "O que está funcionando",
        question: {
          beginner: "O que tem funcionado bem para conquistar clientes até agora?",
          intermediate: "O que está funcionando bem no seu marketing atual?",
          advanced: "Táticas, canais ou criativos de alto desempenho.",
        },
        hint: {
          beginner: "Até as coisas pequenas contam — um post que bombou de reações, uma promoção que lotou o lugar, o boca a boca.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Nossas fotos de comida no Instagram geram muitas mensagens perguntando o endereço",
          intermediate: "ex.: O orgânico no Instagram é forte, a taxa de abertura de email é de 40%",
          advanced: "ex.: ROAS de prospecção no Meta 3,8x, email com 42% de abertura, LinkedIn orgânico forte para leads",
        },
        type: "text",
        required: false,
        weight: 3,
      },
      {
        id: "what_fails",
        internalLabel: "O que não está funcionando",
        question: {
          beginner: "Alguma coisa que você tentou NÃO funcionou — ou pareceu dinheiro jogado fora?",
          intermediate: "O que não funcionou ou não trouxe resultados?",
          advanced: "Canais de baixo desempenho, investimento desperdiçado ou táticas que falharam.",
        },
        hint: {
          beginner: "Isso ajuda a gente a não repetir os mesmos erros.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Tentamos anunciar no Facebook uma vez, mas não tivemos resultado nenhum e gastamos bastante",
          intermediate: "ex.: Google Ads — sem estratégia clara, orçamento desperdiçado no último trimestre",
          advanced: "ex.: Google Search com ROAS <1,5x, collabs com influenciadores sem ROI mensurável",
        },
        type: "text",
        required: false,
        weight: 3,
      },
    ],
  },
  {
    id: "assets",
    title: "O que você já tem",
    description: "Vamos ver quais materiais já estão prontos para usar.",
    questions: [
      {
        id: "available_assets",
        internalLabel: "Materiais disponíveis",
        question: {
          beginner: "O que você já tem que a gente poderia usar? Selecione tudo o que se aplica.",
          intermediate: "Quais materiais de marca ou conteúdo você já tem disponíveis?",
          advanced: "Materiais disponíveis (selecione tudo o que se aplica).",
        },
        hint: {
          beginner: "Vamos usar o que você tem e avisar o que ainda precisa ser criado.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: {
          beginner: [
            "Logo e identidade visual",
            "Fotos profissionais",
            "Vídeos",
            "Textos ou roteiros",
            "Catálogo de produtos ou cardápio",
            "Depoimentos ou avaliações de clientes",
            "Nada ainda — começamos do zero",
          ],
          intermediate: [
            "Logo + manual de marca",
            "Fotografia",
            "Conteúdo em vídeo",
            "Copy / documento de tom de voz",
            "Catálogo de produtos",
            "Depoimentos / avaliações",
            "Análise da concorrência",
            "Nada ainda",
          ],
          advanced: [
            "Logo + manual de marca",
            "Fotografia",
            "Conteúdo em vídeo",
            "Copy / documento de tom de voz",
            "Catálogo de produtos",
            "Depoimentos / avaliações",
            "Análise da concorrência",
            "Relatórios de campanhas anteriores / dados de desempenho",
            "Nada ainda",
          ],
        },
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "restrictions",
    title: "Regras e restrições da marca",
    description: "Qualquer coisa que a gente nunca deve fazer, dizer ou mostrar para este cliente.",
    questions: [
      {
        id: "restrictions",
        internalLabel: "Restrições e limitações",
        question: {
          beginner: "Tem algo que você definitivamente não quer — uma palavra, uma cor, um concorrente que nunca deve ser citado?",
          intermediate: "Existem restrições, regras de marca ou coisas a evitar?",
          advanced: "Restrições, requisitos de compliance, limitações de marca ou impedimentos internos.",
        },
        hint: {
          beginner: "Por exemplo: uma cor que não tem a ver com você, um tom insistente demais, um concorrente que você nunca quer que a gente cite.",
          intermediate: "Inclua requisitos de compliance se for relevante (ex.: LGPD, GDPR).",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Por favor, não usem vermelho — não combina com a gente. E nunca citem [nome do concorrente].",
          intermediate: "ex.: Evitar referências diretas a concorrentes. Precisa estar em conformidade com a LGPD. Sem tom agressivo.",
          advanced: "ex.: Em conformidade com a LGPD. Sem menção à marca X. Jurídico: evitar promessas específicas de desempenho.",
        },
        type: "textarea",
        required: false,
        weight: 3,
      },
    ],
  },
];

// ─── PROJECT BRIEF blocks — captured fresh for each project ──────────────────
// These fields describe what the client wants to do right now.

const PROJECT_BRIEF_BLOCKS: IntakeBlock[] = [
  {
    id: "objective",
    title: "O que você quer alcançar",
    description: "O que este projeto deve, de fato, trazer para o negócio?",
    questions: [
      {
        id: "objective",
        internalLabel: "Objetivo principal do projeto",
        question: {
          beginner: "O que você quer que este projeto alcance? Mais pedidos, mais gente te encontrando, mais mensagens, mais seguidores?",
          intermediate: "Qual é o objetivo principal deste projeto?",
          advanced: "Objetivo principal e meta da campanha.",
        },
        hint: {
          beginner: "Não existe resposta errada — a gente só quer entender o que é sucesso para você.",
          intermediate: "Seja específico — um resultado concreto ajuda mais do que uma direção genérica.",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Quero que mais gente saiba que a gente existe e venha experimentar",
          intermediate: "ex.: Gerar 300 leads qualificados de diretores de RH em 6 semanas",
          advanced: "ex.: 300 MQLs em 6 semanas, CPL < €15, canal: LinkedIn + Google Ads",
        },
        type: "textarea",
        required: true,
        weight: 25,
      },
      {
        id: "success_criteria",
        internalLabel: "Critérios de sucesso / KPIs",
        question: {
          beginner: "Como você vai saber se deu certo? Tem algum número que você espera atingir?",
          intermediate: "Como é o sucesso para você? Há números ou métricas específicas que você quer atingir?",
          advanced: "Critérios de sucesso e KPIs (ROAS, CPL, taxa de engajamento, metas de crescimento).",
        },
        hint: {
          beginner: "Por exemplo: 50 novas reservas por mês, o dobro de seguidores no Instagram, 20% mais visitas no site.",
          intermediate: "Mesmo metas aproximadas ajudam a gente a priorizar.",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Adoraria dobrar o número de reservas online em 3 meses",
          intermediate: "ex.: 200 novos seguidores/mês, 5% de engajamento, 50 formulários preenchidos por mês",
          advanced: "ex.: ROAS 4x, CPL < €12, 5% de conversão na landing page",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
  {
    id: "services",
    title: "Que tipo de ajuda você precisa",
    description: "Que tipo de trabalho este projeto exige?",
    questions: [
      {
        id: "services",
        internalLabel: "Serviços necessários",
        question: {
          beginner: "Que tipo de ajuda você está buscando? Selecione tudo o que fizer sentido.",
          intermediate: "Quais serviços são necessários para este projeto?",
          advanced: "Selecione todos os serviços necessários.",
        },
        hint: {
          beginner: "Não tem certeza do que cada coisa significa? Escolha o que parecer mais próximo — a gente ajuda com o resto.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: {
          beginner: [
            "Mais visibilidade nas redes sociais",
            "Anúncios pagos para atrair mais clientes",
            "Aparecer melhor no Google",
            "Um novo logo ou identidade visual",
            "Conteúdo e textos",
            "Email marketing",
            "Entender o que está funcionando (analytics)",
          ],
          intermediate: [
            "Gestão de Redes Sociais",
            "Anúncios Pagos",
            "SEO",
            "Branding e Identidade",
            "Produção de Conteúdo",
            "Email Marketing",
            "Análise e Relatórios",
          ],
          advanced: [
            "Redes Sociais",
            "Anúncios Pagos",
            "SEO",
            "Branding",
            "Produção de Conteúdo",
            "Email Marketing",
            "Analytics",
          ],
        },
        required: true,
        weight: 10,
      },
    ],
  },
  {
    id: "budget_timeline",
    title: "Orçamento e Prazo",
    description: "Ajude a gente a dimensionar o que é realista para este projeto.",
    questions: [
      {
        id: "budget",
        internalLabel: "Faixa de orçamento",
        question: {
          beginner: "Mais ou menos quanto você pensa em investir por mês? Escolha a faixa mais próxima.",
          intermediate: "Qual é o orçamento mensal aproximado para este projeto?",
          advanced: "Faixa de orçamento (fee mensal ou projeto total).",
        },
        hint: {
          beginner: "Isso ajuda a gente a recomendar o que é realmente possível com o seu investimento.",
          intermediate: "",
          advanced: "",
        },
        type: "multiselect",
        placeholder: "",
        options: [
          "Menos de €1.000",
          "€1.000 – €3.000",
          "€3.000 – €7.000",
          "€7.000 – €15.000",
          "€15.000+",
          "Ainda não definido",
        ],
        required: false,
        weight: 5,
      },
      {
        id: "deadline",
        internalLabel: "Prazo ou data de lançamento",
        question: {
          beginner: "Existe uma data específica em que tudo precisa estar pronto?",
          intermediate: "Há uma data de lançamento ou um prazo final?",
          advanced: "Prazo final ou data de lançamento.",
        },
        hint: {
          beginner: "Por exemplo: antes de um lançamento de produto, uma data sazonal ou um mês que você tem em mente.",
          intermediate: "",
          advanced: "",
        },
        placeholder: {
          beginner: "ex.: Vamos lançar um novo cardápio em julho — tudo precisa estar pronto até o fim de junho",
          intermediate: "ex.: Fim de junho, lançamento no 3º trimestre, daqui a 6 semanas",
          advanced: "ex.: prazo final 2025-06-30 / janela de 6 semanas",
        },
        type: "text",
        required: false,
        weight: 5,
      },
    ],
  },
];

// Combined for scoring — order doesn't matter for computeIntakeSummary
const ALL_INTAKE_BLOCKS: IntakeBlock[] = [...CLIENT_PROFILE_BLOCKS, ...PROJECT_BRIEF_BLOCKS];

// ─── Scoring + summary ────────────────────────────────────────────────────────

function computeIntakeSummary(answers: IntakeAnswers, clientId: string): IntakeSummary {
  const allQuestions = ALL_INTAKE_BLOCKS.flatMap((b) => b.questions);
  let score = 0;
  const missingRequired: string[] = [];

  for (const q of allQuestions) {
    const answer = answers[q.id];
    const filled = Array.isArray(answer)
      ? answer.length > 0
      : typeof answer === "string" && answer.trim().length > 3;
    if (filled) {
      score += q.weight;
    } else if (q.required) {
      missingRequired.push(q.internalLabel);
    }
  }

  const servicesRaw = answers["services"];
  const servicesRequested: string[] = Array.isArray(servicesRaw) ? servicesRaw : [];

  const businessName = typeof answers["business_name"] === "string" ? answers["business_name"] : "";
  const businessDesc = typeof answers["business_description"] === "string" ? answers["business_description"] : "";
  const clientContext = [businessName, businessDesc].filter(Boolean).join(" — ");
  const projectObjective = typeof answers["objective"] === "string" ? answers["objective"] : "";

  const recommendedNextQuestions: string[] = [];
  if (!answers["success_criteria"]) recommendedNextQuestions.push("Como o sucesso será medido? (métricas-alvo / KPIs)");
  if (!answers["current_channels"]) recommendedNextQuestions.push("Em quais canais o cliente está ativo hoje?");
  if (!(answers["budget"] as string[] | undefined)?.length) recommendedNextQuestions.push("Qual é o orçamento aproximado?");
  if (!answers["deadline"]) recommendedNextQuestions.push("Há um prazo ou data de lançamento?");
  if (!answers["brand_tone"]) recommendedNextQuestions.push("Como a marca deve se comunicar? (tom de voz)");

  const readinessLabel: IntakeSummary["readinessLabel"] =
    score >= 70 ? "Pronto" : score >= 40 ? "Parcialmente Pronto" : "Não Pronto";

  return {
    clientId,
    clientContext,
    projectObjective,
    servicesRequested,
    missingInformation: missingRequired,
    recommendedNextQuestions,
    readinessScore: Math.min(score, 100),
    readinessLabel,
  };
}

// ─── Intake → orchestrator prefill ───────────────────────────────────────────

const SERVICE_ID_MAP: Record<string, string> = {
  "Redes Sociais": "social_media",
  "Anúncios Pagos": "ads",
  "SEO": "seo",
  "Branding": "branding",
  "Produção de Conteúdo": "content",
  "Email Marketing": "content",
  "Analytics": "content",
  "Gestão de Redes Sociais": "social_media",
  "Branding e Identidade": "branding",
  "Análise e Relatórios": "content",
  "Mais visibilidade nas redes sociais": "social_media",
  "Anúncios pagos para atrair mais clientes": "ads",
  "Aparecer melhor no Google": "seo",
  "Um novo logo ou identidade visual": "branding",
  "Conteúdo e textos": "content",
  "Entender o que está funcionando (analytics)": "content",
};

export function intakeToPrefill(answers: IntakeAnswers, clientId: string): IntakePrefill {
  const servicesRaw = (answers["services"] as string[] | undefined) ?? [];
  const services = servicesRaw
    .map((s) => SERVICE_ID_MAP[s] ?? s)
    .filter((v, i, a) => a.indexOf(v) === i);

  const businessDescription = [
    typeof answers["business_name"] === "string" ? answers["business_name"] : "",
    typeof answers["business_description"] === "string" ? answers["business_description"] : "",
  ]
    .filter(Boolean)
    .join(". ");

  const channelsRaw = typeof answers["current_channels"] === "string" ? answers["current_channels"] : "";
  const channels = channelsRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

  const assetsRaw = (answers["available_assets"] as string[] | undefined) ?? [];
  const notes = [
    answers["brand_tone"] ? `Tone: ${answers["brand_tone"]}` : "",
    answers["restrictions"] ? `Restrictions: ${answers["restrictions"]}` : "",
    answers["what_fails"] ? `Currently failing: ${answers["what_fails"]}` : "",
    assetsRaw.length ? `Assets available: ${assetsRaw.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const deadlineText = typeof answers["deadline"] === "string" ? answers["deadline"].toLowerCase() : "";
  let deadline = "";
  const year = new Date().getFullYear();
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05",
    june: "06", july: "07", august: "08", september: "09", october: "10",
    november: "11", december: "12", jan: "01", feb: "02", mar: "03",
    apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10",
    nov: "11", dec: "12",
  };
  const mMatch = deadlineText.match(/(?:end\s+of\s+|by\s+|in\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)/);
  if (mMatch) deadline = `${year}-${MONTHS[mMatch[1]]}-28`;
  const wMatch = deadlineText.match(/(\d+)\s*weeks?/);
  const moMatch = deadlineText.match(/(\d+)\s*months?/);
  if (!deadline && wMatch) deadline = new Date(Date.now() + parseInt(wMatch[1]) * 7 * 86400000).toISOString().slice(0, 10);
  else if (!deadline && moMatch) { const d = new Date(); d.setMonth(d.getMonth() + parseInt(moMatch[1])); deadline = d.toISOString().slice(0, 10); }

  return {
    clientId,
    services,
    businessDescription,
    objective: typeof answers["objective"] === "string" ? answers["objective"] : "",
    targetAudience: typeof answers["audience"] === "string" ? answers["audience"] : "",
    channels,
    deadline,
    notes,
  };
}

// ─── Free text → answers ──────────────────────────────────────────────────────

function parseTextToAnswers(text: string): IntakeAnswers {
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const parsed: IntakeAnswers = {};

  const objectiveSentence = sentences.find((s) =>
    /(?:goal|objective|aim|purpose)\s+(?:is\s+)?to\b/i.test(s) ||
    /\bwe\s+(?:want|need|are\s+looking)\s+to\b/i.test(s) ||
    /\bto\s+(?:increase|grow|generate|drive|boost|launch|build|establish|improve|scale|expand)\b/i.test(s)
  );
  parsed["objective"] = objectiveSentence ?? text.slice(0, 200);

  const audienceSentence = sentences.find((s) =>
    /target\s+audience|our\s+audience|targeting\s+|audience\s+is|aimed\s+at\b|\b\d{2}\s*(?:to|-)\s*\d{2}\b|millennials|gen\s*[zZ]\b|b2b\b|b2c\b/i.test(s)
  );
  if (audienceSentence) parsed["audience"] = audienceSentence;

  const bizSentence = sentences.find((s) =>
    /\bis\s+an?\b|\bthey(?:'re| are)\s+an?\b|\bit'?s\s+an?\b|\bcompany\b|\bstartup\b|\bplatform\b/i.test(s) &&
    !/we\s+(?:need|want)|looking\s+to\b|increase\b|generate\b/i.test(s)
  );
  if (bizSentence) parsed["business_description"] = bizSentence;

  const services: string[] = [];
  if (/social\s+media|instagram|tiktok|facebook(?!\s+ads?)/i.test(lower)) services.push("Redes Sociais");
  if (/\bads?\b|paid\s+media|advertising|google\s+ads|meta\s+ads/i.test(lower)) services.push("Anúncios Pagos");
  if (/\bseo\b|search\s+engine\s+optim/i.test(lower)) services.push("SEO");
  if (/\bbranding\b|\bbrand\s+identity|\blogo\b/i.test(lower)) services.push("Branding");
  if (/content\s+strateg|content\s+plan|blog\s+posts?|copywriting/i.test(lower)) services.push("Produção de Conteúdo");
  if (/email\s+(?:marketing|campaign|newsletter)/i.test(lower)) services.push("Email Marketing");
  if (services.length) parsed["services"] = services;

  const channelParts: string[] = [];
  if (/instagram/i.test(text)) channelParts.push("Instagram");
  if (/linkedin/i.test(text)) channelParts.push("LinkedIn");
  if (/\btiktok\b/i.test(text)) channelParts.push("TikTok");
  if (/\bgoogle\b/i.test(text)) channelParts.push("Google");
  if (/facebook/i.test(text)) channelParts.push("Facebook");
  if (/\bemail\b/i.test(text)) channelParts.push("Email");
  if (channelParts.length) parsed["current_channels"] = channelParts.join(", ");

  const wMatch = lower.match(/(\d+)\s*weeks?/);
  const mMatch = lower.match(/(\d+)\s*months?/);
  const endMatch = lower.match(/end\s+of\s+([a-z]+)/);
  if (wMatch) parsed["deadline"] = `${wMatch[1]} weeks`;
  else if (mMatch) parsed["deadline"] = `${mMatch[1]} months`;
  else if (endMatch) parsed["deadline"] = `End of ${endMatch[1]}`;

  return parsed;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IntakeEngineProps {
  clients: Client[];
  onComplete: (summary: IntakeSummary, prefill: IntakePrefill) => void;
}

export default function IntakeEngine({ clients, onComplete }: IntakeEngineProps) {
  const { updateClient } = useAgencyStore();

  const [clientLevel, setClientLevel] = useState<ClientLevel | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("guided");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [intakePhase, setIntakePhase] = useState<IntakePhase>("client");
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [freeText, setFreeText] = useState("");
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const level = clientLevel ?? "intermediate";
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const setAnswer = (questionId: string, value: string | string[]) =>
    setAnswers((prev: IntakeAnswers) => ({ ...prev, [questionId]: value }));

  const toggleMultiselect = (questionId: string, option: string) => {
    const current = (answers[questionId] as string[] | undefined) ?? [];
    setAnswer(questionId, current.includes(option) ? current.filter((v) => v !== option) : [...current, option]);
  };

  // When a client is selected, pre-load all known profile data so we don't ask again
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    setProfileSaved(false);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setAnswers((prev: IntakeAnswers) => ({
        ...prev,
        ...(!prev["business_name"] && client.name ? { business_name: client.name } : {}),
        ...(!prev["business_description"] && client.description ? { business_description: client.description } : {}),
        ...(!prev["brand_tone"] && client.brandTone ? { brand_tone: client.brandTone } : {}),
        ...(!prev["brand_existing"] && client.brandExisting ? { brand_existing: client.brandExisting } : {}),
        ...(!prev["audience"] && client.targetAudience ? { audience: client.targetAudience } : {}),
        ...(!prev["current_channels"] && client.currentChannels ? { current_channels: client.currentChannels } : {}),
        ...(!prev["what_works"] && client.whatWorks ? { what_works: client.whatWorks } : {}),
        ...(!prev["what_fails"] && client.whatFails ? { what_fails: client.whatFails } : {}),
        ...(!(prev["available_assets"] as string[] | undefined)?.length && client.availableAssets?.length ? { available_assets: client.availableAssets } : {}),
        ...(!prev["restrictions"] && client.restrictions ? { restrictions: client.restrictions } : {}),
      }));
    }
  };

  // Persist completed client profile answers back to the Client Hub
  const saveClientProfile = (currentAnswers: IntakeAnswers, clientId: string) => {
    const updates: Partial<Client> = {};
    if (currentAnswers["business_description"]) updates.description = currentAnswers["business_description"] as string;
    if (currentAnswers["brand_tone"]) updates.brandTone = currentAnswers["brand_tone"] as string;
    if (currentAnswers["brand_existing"]) updates.brandExisting = currentAnswers["brand_existing"] as string;
    if (currentAnswers["audience"]) updates.targetAudience = currentAnswers["audience"] as string;
    if (currentAnswers["current_channels"]) updates.currentChannels = currentAnswers["current_channels"] as string;
    if (currentAnswers["what_works"]) updates.whatWorks = currentAnswers["what_works"] as string;
    if (currentAnswers["what_fails"]) updates.whatFails = currentAnswers["what_fails"] as string;
    if ((currentAnswers["available_assets"] as string[] | undefined)?.length) updates.availableAssets = currentAnswers["available_assets"] as string[];
    if (currentAnswers["restrictions"]) updates.restrictions = currentAnswers["restrictions"] as string;
    if (Object.keys(updates).length > 0) {
      updateClient(clientId, updates);
      setProfileSaved(true);
    }
  };

  const availableModes: IntakeMode[] =
    clientLevel === "beginner" ? ["guided"] :
    clientLevel === "intermediate" ? ["guided", "free_brief"] :
    ["guided", "free_brief", "existing_brief"];

  const MODE_LABELS: Record<IntakeMode, string> = {
    guided: "Entrevista Guiada",
    free_brief: "Briefing Livre",
    existing_brief: "Briefing Pronto",
  };

  const handleLevelSelect = (lvl: ClientLevel) => {
    setClientLevel(lvl);
    setIntakeMode(lvl === "advanced" ? "existing_brief" : "guided");
    setIntakePhase("client");
    setCurrentBlockIndex(0);
    setAnswers({});
    setFreeText("");
    setSummary(null);
    setSelectedClientId("");
    setProfileSaved(false);
  };

  // Active blocks depend on which phase we're in
  const activeBlocks = intakePhase === "client" ? CLIENT_PROFILE_BLOCKS : PROJECT_BRIEF_BLOCKS;
  const currentBlock = activeBlocks[currentBlockIndex];
  const totalBlocks = activeBlocks.length;

  // Check if all required client profile fields are already filled (from auto-load or prior answers)
  const clientProfileComplete = CLIENT_PROFILE_BLOCKS
    .flatMap((b) => b.questions)
    .filter((q) => q.required)
    .every((q) => {
      const a = answers[q.id];
      return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
    });

  // Labels for missing required profile fields (shown in right panel during client phase)
  const missingProfileLabels = CLIENT_PROFILE_BLOCKS
    .flatMap((b) => b.questions)
    .filter((q) => q.required)
    .filter((q) => {
      const a = answers[q.id];
      return !(Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3);
    })
    .map((q) => q.internalLabel);

  const canAdvanceBlock = () =>
    currentBlock.questions
      .filter((q) => q.required)
      .every((q) => {
        const a = answers[q.id];
        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
      });

  const handleNextBlock = () => {
    if (currentBlockIndex < activeBlocks.length - 1) {
      setCurrentBlockIndex((i: number) => i + 1);
    } else if (intakePhase === "client") {
      saveClientProfile(answers, selectedClientId);
      setIntakePhase("project");
      setCurrentBlockIndex(0);
    } else {
      setSummary(computeIntakeSummary(answers, selectedClientId));
    }
  };

  const handleTextSubmit = () => {
    const parsed = parseTextToAnswers(freeText);
    // Auto-load client data on top of parsed answers
    if (selectedClient) {
      if (!parsed["business_name"] && selectedClient.name) parsed["business_name"] = selectedClient.name;
      if (!parsed["business_description"] && selectedClient.description) parsed["business_description"] = selectedClient.description;
    }
    setAnswers(parsed);
    setSummary(computeIntakeSummary(parsed, selectedClientId));
  };

  // ── Summary screen ──────────────────────────────────────────────────────────

  if (summary) {
    const color =
      summary.readinessScore >= 70
        ? { bar: "bg-[var(--success)]", text: "text-[var(--success)]", badge: "bg-[var(--success-bg)] text-[var(--success)]" }
        : summary.readinessScore >= 40
        ? { bar: "bg-[var(--warning)]", text: "text-[var(--warning)]", badge: "bg-[var(--warning-bg)] text-[var(--warning)]" }
        : { bar: "bg-[var(--danger)]", text: "text-[var(--danger)]", badge: "bg-[#FEE2E2] text-[var(--danger)]" };

    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
            <span className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-[0.05em]">Resumo da Captação</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>
              {summary.readinessLabel}
            </span>
          </div>

          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">Nível de Prontidão</span>
              <span className={`text-[14px] font-bold tabular-nums ${color.text}`}>{summary.readinessScore}%</span>
            </div>
            <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${color.bar}`} style={{ width: `${summary.readinessScore}%` }} />
            </div>
          </div>

          <div className="divide-y divide-[var(--border)]">
            <SummaryRow label="Cliente" value={summary.clientContext} />
            <SummaryRow label="Objetivo" value={summary.projectObjective} />
            <div className="flex items-start gap-3 px-5 py-3">
              <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
                Serviços
              </span>
              <div className="flex flex-wrap gap-1.5">
                {summary.servicesRequested.length > 0 ? (
                  summary.servicesRequested.map((s: string) => (
                    <span key={s} className="h-5 px-2 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--navy)]">{s}</span>
                  ))
                ) : (
                  <span className="text-[12px] text-[var(--text-subtle)] italic">Não especificado</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {summary.missingInformation.length > 0 && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--danger)] uppercase tracking-[0.05em] mb-2.5">
              Informações Obrigatórias Faltando
            </div>
            <ul className="space-y-1.5">
              {summary.missingInformation.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#7F1D1D]">
                  <span className="shrink-0 text-[var(--danger)] font-bold mt-px">×</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.recommendedNextQuestions.length > 0 && (
          <div className="bg-[var(--warning-bg)] border border-[#FDE68A] rounded-[10px] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-2.5">
              Perguntas de Acompanhamento Recomendadas
            </div>
            <ul className="space-y-1.5">
              {summary.recommendedNextQuestions.map((q: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#78350F]">
                  <span className="shrink-0 text-[var(--warning)] mt-px">→</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSummary(null)}>
            Revisar Captação
          </Button>
          <button
            onClick={() => onComplete(summary, intakeToPrefill(answers, selectedClientId))}
            disabled={summary.missingInformation.length > 0}
            className="flex-1 h-9 bg-[var(--text-primary)] hover:bg-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
          >
            Continuar para o Orquestrador →
          </button>
        </div>
      </div>
    );
  }

  // ── Level selection screen ──────────────────────────────────────────────────

  if (!clientLevel) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border)]">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Captação de Cliente</h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Antes de gerar o plano de execução, reunimos e validamos o contexto do projeto. Qual a experiência deste cliente com marketing?
            </p>
          </div>
          <div className="px-6 py-5">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-3">Nível de experiência do cliente</div>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  {
                    level: "beginner" as ClientLevel,
                    label: "Precisa de orientação",
                    desc: "O cliente não sabe ao certo o que precisa. Conduzimos toda a conversa.",
                    icon: "?",
                    hoverBg: "group-hover:bg-[var(--danger)]",
                    badge: "bg-[#FEE2E2] text-[var(--danger)]",
                    modeNote: "Só entrevista guiada",
                  },
                  {
                    level: "intermediate" as ClientLevel,
                    label: "Tem uma ideia inicial",
                    desc: "O cliente tem alguma direção, mas precisa de ajuda para estruturar.",
                    icon: "≈",
                    hoverBg: "group-hover:bg-[var(--warning)]",
                    badge: "bg-[var(--warning-bg)] text-[var(--warning)]",
                    modeNote: "Entrevista ou briefing livre",
                  },
                  {
                    level: "advanced" as ClientLevel,
                    label: "Já tem um briefing pronto",
                    desc: "O cliente sabe exatamente o que precisa e já tem materiais prontos.",
                    icon: "✓",
                    hoverBg: "group-hover:bg-[var(--success)]",
                    badge: "bg-[var(--success-bg)] text-[var(--success)]",
                    modeNote: "Qualquer modo",
                  },
                ] as const
              ).map(({ level, label, desc, icon, hoverBg, badge, modeNote }) => (
                <button
                  key={level}
                  onClick={() => handleLevelSelect(level)}
                  className="flex flex-col items-start gap-3 p-4 rounded-[8px] border-2 border-[var(--border)] hover:border-[var(--navy)] hover:bg-[var(--accent-light)]/20 text-left transition-all group"
                >
                  <div className={`w-9 h-9 rounded-full bg-[var(--accent)] ${hoverBg} flex items-center justify-center text-[14px] font-bold text-[var(--text-muted)] group-hover:text-white transition-all`}>
                    {icon}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{desc}</div>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
                    {modeNote}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Intake form screen ──────────────────────────────────────────────────────

  const LEVEL_CHIP: Record<ClientLevel, { label: string; style: string }> = {
    beginner: { label: "Precisa de orientação", style: "bg-[#FEE2E2] text-[var(--danger)]" },
    intermediate: { label: "Tem uma ideia inicial", style: "bg-[var(--warning-bg)] text-[var(--warning)]" },
    advanced: { label: "Já tem um briefing pronto", style: "bg-[var(--success-bg)] text-[var(--success)]" },
  };

  const stepLabel = level === "beginner" ? "Passo" : "Bloco";

  const nextBlockLabel =
    currentBlockIndex < activeBlocks.length - 1
      ? `Próximo: ${activeBlocks[currentBlockIndex + 1]?.title}`
      : intakePhase === "client"
      ? "Continuar para o Briefing do Projeto →"
      : "Gerar Resumo da Captação";

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden h-fit">

        {/* Level chip + change */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Cliente</span>
            <span className={`h-5 px-2 rounded-full text-[11px] font-medium ${LEVEL_CHIP[level as ClientLevel].style}`}>
              {LEVEL_CHIP[level as ClientLevel].label}
            </span>
          </div>
          <button onClick={() => setClientLevel(null)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
            Trocar
          </button>
        </div>

        {/* Mode tabs */}
        {availableModes.length > 1 && (
          <div className="flex border-b border-[var(--border)]">
            {availableModes.map((mode) => (
              <button
                key={mode}
                onClick={() => { setIntakeMode(mode); setIntakePhase("client"); setCurrentBlockIndex(0); setSummary(null); setAnswers({}); setFreeText(""); setSelectedClientId(""); }}
                className={`flex-1 py-2.5 text-[12px] font-medium border-b-2 -mb-[1px] transition-colors ${
                  intakeMode === mode
                    ? "border-[var(--navy)] text-[var(--navy)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          {/* Client selector — auto-loads known profile data on selection */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Cliente *</label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            >
              <option value="">Selecionar cliente...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── GUIDED INTERVIEW ─────────────────────────────────────────────── */}
          {intakeMode === "guided" && (
            <div className="space-y-4">
              {/* Phase indicator */}
              <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[7px]">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {intakePhase === "client" ? "Fase 1 — Perfil do Cliente" : "Fase 2 — Briefing do Projeto"}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {intakePhase === "client"
                      ? "Capture ou confirme o que já sabemos sobre este cliente."
                      : `O que ${selectedClient?.name ?? "este cliente"} quer fazer agora?`}
                  </div>
                </div>
                {intakePhase === "project" && (
                  <button
                    onClick={() => { setIntakePhase("client"); setCurrentBlockIndex(0); }}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap shrink-0 ml-3"
                  >
                    ← Perfil
                  </button>
                )}
              </div>

              {/* Profile saved confirmation */}
              {intakePhase === "project" && profileSaved && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--success-bg)] border border-[#BBF7D0] rounded-[7px]">
                  <span className="text-[var(--success)] font-bold text-[11px]">✓</span>
                  <span className="text-[12px] font-medium text-[#15803D]">Perfil do cliente atualizado</span>
                </div>
              )}

              {/* Profile complete shortcut — skip to project brief */}
              {intakePhase === "client" && clientProfileComplete && selectedClientId && (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[var(--success-bg)] border border-[#BBF7D0] rounded-[7px]">
                  <div>
                    <div className="text-[12px] font-semibold text-[#15803D]">Perfil completo</div>
                    <div className="text-[11px] text-[#166534]">Todas as informações principais do cliente estão carregadas.</div>
                  </div>
                  <button
                    onClick={() => { saveClientProfile(answers, selectedClientId); setIntakePhase("project"); setCurrentBlockIndex(0); }}
                    className="h-7 px-3 text-[12px] font-semibold bg-[var(--success)] text-white rounded-[6px] hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                  >
                    Iniciar Briefing do Projeto →
                  </button>
                </div>
              )}

              {/* Block progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">
                    {stepLabel} {currentBlockIndex + 1} of {totalBlocks}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">{currentBlock.title}</span>
                </div>
                <div className="h-1 bg-[var(--accent)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--navy)] rounded-full transition-all duration-300"
                    style={{ width: `${((currentBlockIndex + 1) / totalBlocks) * 100}%` }}
                  />
                </div>
              </div>

              {/* Block header */}
              <div>
                <div className="text-[14px] font-semibold text-[var(--text-primary)]">{currentBlock.title}</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{currentBlock.description}</div>
              </div>

              {/* Questions */}
              <div className="space-y-3.5">
                {currentBlock.questions.map((q) => {
                  const questionText = resolve(q.question, level);
                  const hintText = q.hint ? resolve(q.hint, level) : "";
                  const placeholderText = resolve(q.placeholder, level);
                  const opts = q.options ? resolveOptions(q.options, level) : [];

                  return (
                    <div key={q.id}>
                      <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1 leading-snug">
                        {questionText}
                        {q.required && <span className="text-[var(--danger)] ml-0.5">*</span>}
                      </label>
                      {hintText && (
                        <p className="text-[11px] text-[var(--text-muted)] mb-1.5 leading-snug">{hintText}</p>
                      )}
                      {q.type === "textarea" && (
                        <textarea
                          value={(answers[q.id] as string) ?? ""}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder={placeholderText}
                          rows={3}
                          className="w-full px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none"
                        />
                      )}
                      {q.type === "text" && (
                        <input
                          value={(answers[q.id] as string) ?? ""}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder={placeholderText}
                          className="w-full h-8 px-3 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                        />
                      )}
                      {q.type === "multiselect" && (
                        <div className="flex flex-wrap gap-2">
                          {opts.map((opt) => {
                            const selected = ((answers[q.id] as string[] | undefined) ?? []).includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleMultiselect(q.id, opt)}
                                className={`h-7 px-3 rounded-full text-[12px] font-medium border transition-all ${
                                  selected
                                    ? "bg-[var(--navy)] border-[var(--navy)] text-white"
                                    : "bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--navy)] hover:text-[var(--navy)]"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex gap-2 pt-1">
                {(currentBlockIndex > 0 || intakePhase === "project") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (currentBlockIndex > 0) {
                        setCurrentBlockIndex((i: number) => i - 1);
                      } else {
                        setIntakePhase("client");
                        setCurrentBlockIndex(CLIENT_PROFILE_BLOCKS.length - 1);
                      }
                    }}
                  >
                    Voltar
                  </Button>
                )}
                <button
                  onClick={handleNextBlock}
                  disabled={!selectedClientId || !canAdvanceBlock()}
                  className={`flex-1 h-9 text-[13px] font-semibold rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    currentBlockIndex === totalBlocks - 1 && intakePhase === "project"
                      ? "bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-white"
                      : "bg-[var(--navy)] hover:bg-[#0D1230] text-white"
                  }`}
                >
                  {nextBlockLabel}
                </button>
              </div>
            </div>
          )}

          {/* ── FREE BRIEF ───────────────────────────────────────────────────── */}
          {intakeMode === "free_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Descreva o cliente e o que ele quer alcançar
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  Inclua quem é o cliente, o que a empresa faz, para quem ela se dirige, o que quer alcançar com este projeto e que tipo de ajuda precisa.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={`ex.: "O cliente tem um restaurante japonês em São Paulo. Quer que mais pessoas o descubram e visitem — especialmente casais e profissionais em busca de uma experiência especial. Está ativo no Instagram, mas nunca fez anúncios pagos. O orçamento é de cerca de €2.000/mês e precisa estar pronto antes de julho."`}
                  rows={9}
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none leading-relaxed"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 20}
                className="w-full h-9 bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Analisar e Gerar Resumo
              </button>
            </div>
          )}

          {/* ── EXISTING BRIEF ───────────────────────────────────────────────── */}
          {intakeMode === "existing_brief" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Cole o briefing que o cliente já tem
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  Vamos extrair automaticamente os dados do perfil do cliente e os objetivos do projeto. Revise o resumo antes de continuar.
                </p>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Cole o texto completo do briefing aqui..."
                  rows={11}
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white resize-none leading-relaxed font-mono"
                />
              </div>
              <button
                onClick={handleTextSubmit}
                disabled={!selectedClientId || freeText.trim().length < 30}
                className="w-full h-9 bg-[var(--navy)] hover:bg-[#0D1230] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-[8px] transition-colors"
              >
                Extrair e Revisar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {intakeMode === "guided" && (
          <>
            {/* CLIENT PHASE: block progress map + known info */}
            {intakePhase === "client" && (
              <>
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Perfil do Cliente — Progresso</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {CLIENT_PROFILE_BLOCKS.map((block, i) => {
                      const isActive = i === currentBlockIndex;
                      const isDone = i < currentBlockIndex;
                      const allRequired = block.questions.filter((q) => q.required).every((q) => {
                        const a = answers[q.id];
                        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
                      });
                      return (
                        <div key={block.id} className={`flex items-center gap-3 px-5 py-3 ${isActive ? "bg-[var(--accent-light)]/40" : ""}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            allRequired && (isDone || isActive) ? "bg-[var(--success-bg)] text-[var(--success)]" :
                            isActive ? "bg-[var(--navy)] text-white" :
                            "bg-[var(--accent)] text-[var(--text-muted)]"
                          }`}>
                            {allRequired && (isDone || isActive) ? "✓" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-medium ${isActive ? "text-[var(--navy)]" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                              {block.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{block.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Known information from Client Hub */}
                {selectedClient && (
                  <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Carregado do Hub de Clientes</span>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      <ContextRow label="Nome" value={selectedClient.name} />
                      <ContextRow label="Segmento" value={selectedClient.industry} />
                      {selectedClient.website && <ContextRow label="Site" value={selectedClient.website} />}
                      {selectedClient.description && <ContextRow label="Sobre" value={selectedClient.description} />}
                    </div>
                    {missingProfileLabels.length > 0 && (
                      <div className="px-5 py-3 border-t border-[var(--border)] bg-[#FFFBEB]">
                        <div className="text-[10px] font-semibold text-[var(--warning)] uppercase tracking-[0.05em] mb-1.5">Faltando no perfil</div>
                        <div className="space-y-1">
                          {missingProfileLabels.map((label) => (
                            <div key={label} className="flex items-center gap-1.5 text-[11px] text-[#92400E]">
                              <span className="shrink-0 text-[var(--warning)]">·</span>
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* PROJECT PHASE: client context card + project brief progress */}
            {intakePhase === "project" && (
              <>
                {/* Client profile summary — read-only context */}
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Perfil do Cliente</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {selectedClient && <ContextRow label="Cliente" value={`${selectedClient.name} · ${selectedClient.industry}`} />}
                    {answers["business_description"] && <ContextRow label="Sobre" value={answers["business_description"] as string} />}
                    {answers["audience"] && <ContextRow label="Audiência" value={answers["audience"] as string} />}
                    {answers["brand_tone"] && <ContextRow label="Tom" value={answers["brand_tone"] as string} />}
                    {answers["current_channels"] && <ContextRow label="Canais" value={answers["current_channels"] as string} />}
                    {answers["restrictions"] && <ContextRow label="Restrições" value={answers["restrictions"] as string} />}
                    {!answers["business_description"] && !answers["audience"] && (
                      <div className="px-5 py-3">
                        <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhum dado de perfil capturado ainda.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Project brief block progress */}
                <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">Briefing do Projeto — Progresso</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {PROJECT_BRIEF_BLOCKS.map((block, i) => {
                      const isActive = i === currentBlockIndex;
                      const isDone = i < currentBlockIndex;
                      const allRequired = block.questions.filter((q) => q.required).every((q) => {
                        const a = answers[q.id];
                        return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 3;
                      });
                      return (
                        <div key={block.id} className={`flex items-center gap-3 px-5 py-3 ${isActive ? "bg-[var(--accent-light)]/40" : ""}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            allRequired && (isDone || isActive) ? "bg-[var(--success-bg)] text-[var(--success)]" :
                            isActive ? "bg-[var(--navy)] text-white" :
                            "bg-[var(--accent)] text-[var(--text-muted)]"
                          }`}>
                            {allRequired && (isDone || isActive) ? "✓" : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-medium ${isActive ? "text-[var(--navy)]" : isDone ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
                              {block.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] truncate">{block.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Free brief / existing brief: what to include */}
        {(intakeMode === "free_brief" || intakeMode === "existing_brief") && (
          <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-5 py-4">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
              Perfil do Cliente
            </div>
            <ul className="space-y-1.5 mb-4">
              {["Quem é o cliente e o que faz", "O público-alvo", "Canais de marketing atuais", "Tom da marca e materiais visuais", "Regras ou restrições da marca"].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#BBF7D0] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
              Briefing do Projeto
            </div>
            <ul className="space-y-1.5">
              {["O que quer alcançar com este projeto", "Serviços necessários", "Faixa de orçamento", "Prazo ou data de lançamento"].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className="w-[140px] shrink-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
        {label}
      </span>
      {value ? (
        <p className="flex-1 text-[13px] text-[var(--text-primary)] leading-snug">{value}</p>
      ) : (
        <p className="flex-1 text-[12px] text-[var(--text-subtle)] italic">Não informado</p>
      )}
    </div>
  );
}

// ─── ContextRow ───────────────────────────────────────────────────────────────

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-2.5">
      <span className="w-[80px] shrink-0 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] pt-0.5">
        {label}
      </span>
      <p className="flex-1 text-[12px] text-[var(--text-primary)] leading-snug">{value}</p>
    </div>
  );
}
