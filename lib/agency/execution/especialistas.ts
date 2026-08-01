// especialistas.ts — O ORGANOGRAMA DA AGÊNCIA, em código.
//
// Decisão do CEO em 01/08/2026: **departamento é a casa; agente é o especialista
// dentro dela.** Design não é um agente — é um departamento onde moram o de
// identidade, o de criativo de social, o de criativo de tráfego e o de vídeo.
//
// Por que isto é fundação e não detalhe: com um agente por departamento, "Design"
// entrega UMA frase sobre conceito visual. Com departamento-equipe, Design entrega
// identidade, criativo de anúncio e roteiro de vídeo — coisas que o cliente
// recebe. **A estrutura é o que determina o que a agência consegue produzir.**
//
// Regras desta casa que estão codificadas aqui:
//
//   • O `id` de um especialista é o `ownerAgentId` gravado no entregável. Ele é
//     ÚNICO na agência inteira e NUNCA muda — é a chave que faz o motor pular
//     quem já produziu. Renomear um id é reprocessar tudo.
//   • Um especialista só existe se ENTREGA PEÇA ao cliente. Função interna não
//     vira agente — vira passo de outro.
//   • `provedor` é quem faz melhor AQUELE trabalho, não a IA preferida da casa.
//     Pesquisa com fonte ≠ redação criativa ≠ raciocínio de número.
//   • `precisaDe` é a trava de verdade ancorada: sem o insumo, o especialista
//     NÃO inventa — ele abre pedido e o gerente de projeto cobra o cliente.

import type { InsightDomain } from "@/lib/agency/radar/library";

/** O contexto do cliente que todo especialista recebe. Verdade ancorada: campo
 *  vazio é campo vazio — nenhum prompt aqui manda preencher por inferência. */
export interface Ctx {
  businessName: string;
  segment: string;
  targetAudience: string;
  tone: string;
  services: string[];
  objectives: string[];
  strategyHeadline: string;
  /** Tem logo/cor/tipografia gravados? Sem isso, Design não desenha identidade. */
  hasBrandAssets: boolean;
  /** O cliente manda foto/vídeo bruto? Perguntado pelo SDR no briefing. Muda o
   *  trabalho do vídeo por inteiro: roteiro para filmar vs. roteiro para editar. */
  hasRawMaterial: boolean;
}

/** Qual IA faz melhor este trabalho. Vazio = a preferência global da casa. */
export type ProvedorPreferido = "claude" | "openai" | "gemini" | "deepseek" | "perplexity";

export interface Especialista {
  /** ownerAgentId no banco. Único na agência, imutável. */
  id: string;
  label: string;
  /** Tipo do entregável — o portal agrupa por ele. */
  deliverableType: string;
  /** O que este especialista precisa para não inventar. */
  precisaDe?: { tem: (c: Ctx) => boolean; pedido: string };
  prompt: (c: Ctx) => string;
  provedor?: ProvedorPreferido;
}

export interface Departamento {
  id: string;
  label: string;
  /** Casa com o serviço contratado no briefing. */
  keywords: RegExp;
  /** Domínio do Radar Dioli que abastece os especialistas desta casa. */
  insightDomain: InsightDomain;
  especialistas: Especialista[];
}

function ctxBlock(c: Ctx): string {
  return [
    `Negócio: ${c.businessName}`,
    c.segment && `Segmento: ${c.segment}`,
    c.targetAudience && `Público-alvo: ${c.targetAudience}`,
    c.tone && `Tom de voz: ${c.tone}`,
    c.services.length && `Serviços contratados: ${c.services.join(", ")}`,
    c.objectives.length && `Objetivos: ${c.objectives.join(", ")}`,
    c.strategyHeadline && `Direção estratégica: ${c.strategyHeadline}`,
  ].filter(Boolean).join("\n");
}

/** O rodapé que vai em TODO prompt: a regra de ouro da casa, aplicada ao
 *  especialista. Sem revisor humano, "não invente" precisa estar em cada peça. */
const REGRA = `
REGRAS INEGOCIÁVEIS
- Não invente número, preço, prazo, endereço, nome de pessoa nem resultado passado.
- Se faltar um dado para fazer bem, escreva "PRECISO CONFIRMAR: <o quê>" naquele campo.
- Português do Brasil. Específico deste negócio — nada que sirva para qualquer cliente.
- Responda SOMENTE JSON válido, no formato pedido.`;

/** Formato único de saída — o motor sabe transformar isto em entregável. */
function formato(titulo: string, campos: string): string {
  return `Responda em JSON: {"title": "${titulo}", "summary": "1 frase", "items": [{${campos}}]}`;
}

export const DEPARTAMENTOS: Departamento[] = [
  // ── ESTRATÉGIA ────────────────────────────────────────────────────────────
  // Vem primeiro de propósito: é a casa que decide o caminho que as outras
  // seguem. A concorrência é o único trabalho da agência que EXIGE olhar para
  // fora — por isso é o único especialista que usa uma IA de pesquisa.
  {
    id: "strategy",
    label: "Estratégia",
    keywords: /estrat[ée]gia|posicionamento|concorr[êe]ncia|diagn[óo]stico|marca/i,
    insightDomain: "general",
    especialistas: [
      {
        id: "strategy-posicionamento",
        label: "Posicionamento",
        deliverableType: "strategy",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de POSICIONAMENTO da Dioli Digital.

CONTEXTO
${ctxBlock(c)}

Entregue: o posicionamento em uma frase, o público que ele serve, as 3 mensagens-chave que toda peça deve reforçar, e o tom de voz da marca em uma linha.
${REGRA}
${formato("Posicionamento — <negócio>", `"headline": "...", "note": "o que sustenta esta escolha", "audience": "para quem"`)}`,
      },
      {
        id: "strategy-concorrencia",
        label: "Pesquisa de concorrência",
        deliverableType: "strategy",
        // A ÚNICA IA de pesquisa da casa. Concorrente é fato verificável do
        // mundo real: um modelo criativo INVENTA concorrente, e inventar
        // concorrente é o erro mais caro que a Estratégia pode cometer.
        provedor: "perplexity",
        prompt: (c) => `Você é o especialista de CONCORRÊNCIA da Dioli Digital. Pesquise a concorrência REAL deste negócio.

CONTEXTO
${ctxBlock(c)}

Pesquise e liste de 3 a 5 concorrentes REAIS do mesmo segmento e região. Para cada um: como ele se posiciona, o que ele faz bem, e a brecha que ele deixa aberta. **Cite a fonte de cada afirmação.** Se não encontrar informação confiável sobre um ponto, escreva "PRECISO CONFIRMAR" — concorrente inventado é o erro mais caro desta casa.
${REGRA}
${formato("Concorrência — <negócio>", `"headline": "nome do concorrente", "note": "como se posiciona + a brecha que deixa", "audience": "fonte"`)}`,
      },
    ],
  },

  // ── CONTEÚDO / SOCIAL ─────────────────────────────────────────────────────
  {
    id: "social-media",
    label: "Social Media",
    keywords: /social|stories?|reels?|instagram|conte[úu]do|redes|feed|post/i,
    insightDomain: "social",
    especialistas: [
      {
        // a3 é o id histórico do departamento inteiro. Fica com o primeiro
        // especialista para não invalidar entregas já produzidas.
        id: "a3",
        label: "Pauta do mês",
        deliverableType: "social",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de PAUTA da Dioli Digital. Monte o plano de conteúdo do mês.

CONTEXTO
${ctxBlock(c)}

Entregue os pilares de conteúdo (3 a 4) e um calendário de 4 semanas: por semana, o tema e os formatos. Volume compatível com os serviços contratados.
${REGRA}
${formato("Pauta do Mês — <negócio>", `"headline": "Semana N — tema", "note": "por que este tema agora", "audience": "formatos da semana"`)}`,
      },
      {
        id: "social-copy",
        label: "Copy dos posts",
        deliverableType: "social",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de COPY de social da Dioli Digital. Escreva as legendas prontas para publicar.

CONTEXTO
${ctxBlock(c)}

Escreva de 4 a 6 peças. Para cada uma: formato (feed/story/reel), headline, legenda completa (2 a 3 frases, pronta para copiar e colar) e a ideia de visual que acompanha.
${REGRA}
${formato("Legendas Prontas — <negócio>", `"format": "feed|story|reel", "headline": "...", "caption": "legenda pronta", "visual": "o que aparece na imagem"`)}`,
      },
      {
        id: "social-roteiro-video",
        label: "Roteiro de vídeo",
        deliverableType: "video",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de ROTEIRO DE VÍDEO da Dioli Digital. Escreva roteiros de reels prontos para gravar.

CONTEXTO
${ctxBlock(c)}
Material bruto do cliente (foto/vídeo): ${c.hasRawMaterial ? "SIM — o cliente envia material. Escreva o roteiro para EDIÇÃO do material dele." : "NÃO — o cliente não envia material. Escreva o roteiro para o cliente GRAVAR com o celular, com instrução de enquadramento simples."}

Entregue 3 roteiros. Para cada um: gancho dos primeiros 2 segundos (é o que decide se o vídeo é visto), a sequência de cenas com duração, a legenda na tela, o áudio/trilha sugerida e a chamada final.
${REGRA}
${formato("Roteiros de Vídeo — <negócio>", `"headline": "título do vídeo", "note": "GANCHO (0-2s) + cenas com duração + CTA", "visual": "o que grava/edita em cada cena", "caption": "legenda do post"`)}`,
      },
    ],
  },

  // ── DESIGN ────────────────────────────────────────────────────────────────
  {
    id: "design",
    label: "Design",
    keywords: /design|identidade|visual|logo|marca|arte|pe[çc]a/i,
    insightDomain: "design",
    especialistas: [
      {
        id: "a2",
        label: "Identidade visual",
        deliverableType: "design",
        provedor: "claude",
        precisaDe: {
          tem: (c) => c.hasBrandAssets,
          pedido: "Para começar as peças de design, precisamos dos materiais da sua marca: logo (se tiver), cores, fontes e alguma referência visual que você goste. Pode enviar por aqui? 🎨",
        },
        prompt: (c) => `Você é o especialista de IDENTIDADE VISUAL da Dioli Digital. Defina a direção de arte da marca.

CONTEXTO
${ctxBlock(c)}

Entregue: paleta (com o papel de cada cor), tipografia (título e texto), estilo de fotografia, e 3 regras do que NUNCA usar nesta marca.
${REGRA}
${formato("Direção Visual — <negócio>", `"headline": "...", "direction": "...", "palette": "...", "note": "..."`)}`,
      },
      {
        id: "design-criativo-social",
        label: "Criativo de social",
        deliverableType: "design",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de CRIATIVO DE SOCIAL da Dioli Digital. Descreva as artes dos posts, prontas para produzir.

CONTEXTO
${ctxBlock(c)}

Descreva de 3 a 4 peças: o que aparece, a composição, onde entra o texto, e a sensação que ela precisa provocar. Específico ao segmento — nada de "imagem bonita do produto".
${REGRA}
${formato("Criativos de Social — <negócio>", `"headline": "nome da peça", "direction": "composição e enquadramento", "palette": "cores desta peça", "note": "texto que entra na arte"`)}`,
      },
      {
        id: "design-criativo-trafego",
        label: "Criativo de tráfego",
        deliverableType: "design",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de CRIATIVO DE TRÁFEGO da Dioli Digital. Anúncio é outra peça: precisa parar o dedo e vender.

CONTEXTO
${ctxBlock(c)}

Descreva 3 criativos de anúncio. Para cada um: o ângulo de venda, o visual, o texto sobre a imagem (curto), e por que este ângulo funciona para este público. Formatos para feed e stories.
${REGRA}
${formato("Criativos de Anúncio — <negócio>", `"headline": "ângulo de venda", "direction": "o visual do anúncio", "cta": "texto sobre a imagem", "note": "por que funciona para este público"`)}`,
      },
    ],
  },

  // ── TRÁFEGO PAGO ──────────────────────────────────────────────────────────
  {
    id: "paid-traffic",
    label: "Tráfego Pago",
    keywords: /tr[áa]fego|ads|an[úu]ncio|m[íi]dia\s*paga|campanha|google|meta/i,
    insightDomain: "paid-traffic",
    especialistas: [
      {
        id: "a4",
        label: "Estrutura de campanha",
        deliverableType: "campaign",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de ESTRUTURA DE CAMPANHA da Dioli Digital.

CONTEXTO
${ctxBlock(c)}

Entregue: objetivo da campanha, as plataformas recomendadas, os públicos (com o critério de cada um) e como mediremos resultado. NÃO invente verba — se o briefing não trouxe, escreva "PRECISO CONFIRMAR: verba mensal".
${REGRA}
${formato("Estrutura de Campanha — <negócio>", `"headline": "nome da campanha", "audience": "público e critério", "note": "objetivo e como medimos", "cta": "..."`)}`,
      },
      {
        id: "traffic-copy-anuncio",
        label: "Copy de anúncio",
        deliverableType: "campaign",
        provedor: "claude",
        prompt: (c) => `Você é o especialista de COPY DE ANÚNCIO da Dioli Digital. Texto de anúncio não é legenda de post: tem que vender em uma linha.

CONTEXTO
${ctxBlock(c)}

Escreva 4 anúncios, cada um com um ângulo diferente. Para cada um: headline (máx. 6 palavras), texto principal (2 frases), chamada para ação, e o público a que se destina.
${REGRA}
${formato("Anúncios — <negócio>", `"headline": "headline do anúncio", "caption": "texto principal", "cta": "chamada para ação", "audience": "para quem"`)}`,
      },
    ],
  },

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  {
    id: "analytics",
    label: "Analytics",
    keywords: /analytics|kpi|m[ée]trica|relat[óo]rio|resultado|performance|dados|indicador/i,
    insightDomain: "analytics",
    especialistas: [
      {
        id: "a5",
        label: "Plano de medição",
        deliverableType: "analytics",
        provedor: "openai",
        prompt: (c) => `Você é o especialista de MEDIÇÃO da Dioli Digital. Defina como vamos provar que funcionou.

CONTEXTO
${ctxBlock(c)}

Defina de 3 a 5 indicadores adequados ao objetivo e ao segmento: o que cada um mede, de onde vem o dado, e a cadência do relatório. NÃO invente meta que dependa de histórico que não temos — escreva "PRECISO CONFIRMAR: número atual" quando for o caso.
${REGRA}
${formato("Plano de Medição — <negócio>", `"headline": "<indicador>", "note": "o que mede + cadência", "audience": "de onde vem o dado"`)}`,
      },
    ],
  },

  // ── FINANCEIRO ────────────────────────────────────────────────────────────
  // Departamento novo, pedido pelo CEO em 01/08/2026: custos, gastos,
  // investimentos e pagamentos. Nasce em produção junto com os outros porque
  // cliente que não entende para onde vai o dinheiro cancela no segundo mês.
  {
    id: "financeiro",
    label: "Financeiro",
    keywords: /financeiro|custo|or[çc]amento|verba|investimento|pagamento|mensalidade/i,
    insightDomain: "general",
    especialistas: [
      {
        id: "financeiro-plano",
        label: "Plano de investimento",
        deliverableType: "financeiro",
        provedor: "openai",
        prompt: (c) => `Você é o especialista FINANCEIRO da Dioli Digital. Explique para o dono do negócio para onde vai cada real.

CONTEXTO
${ctxBlock(c)}

Entregue a divisão do investimento do mês entre as frentes contratadas, o que cada frente deve devolver em troca, e o que ainda precisa ser confirmado. ESTA É A REGRA MAIS IMPORTANTE AQUI: **não invente nenhum valor**. Se o briefing não trouxe verba ou mensalidade, escreva "PRECISO CONFIRMAR: <o quê>" no lugar do número. Um número errado aqui é uma promessa comercial falsa.
${REGRA}
${formato("Plano de Investimento — <negócio>", `"headline": "frente de investimento", "note": "o que ela deve devolver", "audience": "valor ou PRECISO CONFIRMAR"`)}`,
      },
    ],
  },
];

/** Todos os especialistas da casa, achatados. Útil para painel e auditoria. */
export const TODOS_OS_ESPECIALISTAS: Array<Especialista & { departamentoId: string; departamentoLabel: string }> =
  DEPARTAMENTOS.flatMap((d) =>
    d.especialistas.map((e) => ({ ...e, departamentoId: d.id, departamentoLabel: d.label })),
  );

/** Um id de especialista nunca pode se repetir — é a chave da idempotência.
 *  Falhar cedo e alto é melhor que descobrir por entrega duplicada no cliente. */
const vistos = new Set<string>();
for (const e of TODOS_OS_ESPECIALISTAS) {
  if (vistos.has(e.id)) throw new Error(`especialistas.ts: id duplicado "${e.id}" — a idempotência do motor depende dele ser único`);
  vistos.add(e.id);
}

export { ctxBlock };
