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
// A trava de storyboard (`lib/agency/design/storyboard.ts`) roda nos DOIS pontos
// da esteira: aqui, no contrato de saída do especialista, onde ele ainda pode
// refazer; e em `artes.ts`, antes de gastar imagem. Mesma função, mesma régua.
import {
  conferirStoryboard, lerStoryboardDoCampo, REGUA_CARROSSEL_DE_VENDA,
} from "@/lib/agency/design/storyboard";

/** O contexto do cliente que todo especialista recebe. Verdade ancorada: campo
 *  vazio é campo vazio — nenhum prompt aqui manda preencher por inferência. */
export interface Ctx {
  /** A RÉGUA DA MARCA, entregue ANTES de produzir — texto de no máximo uma tela
   *  vindo de `esteira/contrato-de-marca.ts`: quem a marca é, o que ela NUNCA
   *  faz, com o que se parece, e o que ela ainda não decidiu (nomeado, para
   *  ninguém preencher por inferência).
   *
   *  Até 09/08/2026 isto não existia: as proibições do cliente só chegavam ao
   *  piso de verdade, que confere o texto DEPOIS de pronto. Quem produzia era
   *  pego, nunca avisado. */
  contratoDeMarca?: string;
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
  /** O serviço contratado É criar a identidade visual (o cliente não tem marca).
   *
   *  Existe para desfazer um deadlock que travava exatamente o cliente que mais
   *  precisa da agência: o especialista de identidade exigia material de marca
   *  para produzir, e quem contrata identidade visual contrata **porque não
   *  tem** marca. Ele pedia ao cliente o que o cliente pagou para receber, e o
   *  pacote nunca era apresentado. */
  criandoIdentidade: boolean;
  /** Os números do ciclo fechado anterior, em texto pronto. Vazio no primeiro
   *  mês — e aí o especialista de otimização é PROIBIDO de inventar desempenho
   *  passado, que é a forma mais fácil de um relatório virar ficção. */
  resultadoDoCicloAnterior?: string;
  /** O bloco de síntese do feed REAL do cliente (leitura-do-cliente.ts).
   *
   *  Pedido literal do CEO (04/08/2026): "você precisa ler a rede social, ver
   *  os posts que estão lá, antes de fazer os carrosséis". SEMPRE preenchido
   *  pelo motor: com o feed lido, é a síntese; sem conexão, é a degradação
   *  declarada ("feed não lido: <motivo>") que PROÍBE inferir estilo do nada —
   *  o mesmo padrão do resultadoDoCicloAnterior. Opcional só para quem monta
   *  Ctx fora do motor (testes, ferramentas). */
  feedRealDoCliente?: string;
  /** Tipos de material que o cliente JÁ entregou (ex.: "design").
   *
   *  Existe para impedir um laço cruel: o agente pede o logo, o cliente manda,
   *  a produção retoma, a marca no banco continua vazia — e o agente pede o
   *  logo DE NOVO. O cliente é cobrado para sempre por algo que ele já enviou.
   *  Quem já respondeu não é cobrado outra vez: o especialista trabalha com o
   *  que tem e marca o que faltar como "PRECISO CONFIRMAR". */
  materiaisEntregues: string[];
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
  /**
   * O CONTRATO DE SAÍDA — o que o prompt pede em número e formato, conferido em
   * código sobre o JSON que o modelo devolveu.
   *
   * Devolve a lista de violações em português, pronta para virar parecer. Lista
   * vazia = cumpriu.
   */
  contrato?: (data: Record<string, unknown>) => string[];
}

// ── POR QUE ISTO EXISTE (05/08/2026) ─────────────────────────────────────────
//
// Sete instruções de CONTAGEM e FORMATO viviam só dentro do prompt — "6 a 8
// peças", "1-2 carrossel, 2-3 story, 2-3 feed", "cenas: 3 a 6 telas",
// "calendário de 4 semanas", "3 a 4 peças", "3 criativos", "4 anúncios" — e
// nenhuma era conferida. Prompt é sugestão. O cliente contratava 8 posts e
// recebia 3, todos feed, e nada no sistema sabia dizer que faltou.
//
// Todas eram conferíveis o tempo todo: estão no JSON que o modelo já devolve,
// ANTES de virar markdown. E uma delas custa dinheiro direto — `artes.ts` gera
// UMA IMAGEM PAGA POR TELA de carrossel, então "cenas: 3 a 6" sem trava é um
// carrossel de 12 telas custando o dobro do mês.
//
// Fronteira honesta: só entra aqui o que é CONTÁVEL no JSON. "3 regras do que
// nunca usar" (identidade visual) mora dentro de um campo de texto livre e
// continua sem trava — está declarado, não esquecido.

function itensDe(data: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(data.items)
    ? data.items.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    : [];
}

function texto(it: Record<string, unknown>, campo: string): string {
  return typeof it[campo] === "string" ? (it[campo] as string).trim() : "";
}

/**
 * "quantos itens" — a checagem mais banal e a que mais falta ao cliente.
 *
 * ── MÍNIMO E MÁXIMO NÃO SÃO A MESMA COISA ───────────────────────────────────
 * O MÍNIMO é o contrato com o cliente: ele comprou 8 posts e recebeu 3. Isso
 * bloqueia.
 * O MÁXIMO existe só onde entregar demais CUSTA (cada peça de social vira arte
 * paga; cada tela de carrossel vira uma imagem paga; a Meta aceita 4 interesses
 * e não mais). Onde entregar a mais é só generosidade, o teto é folgado de
 * propósito — barrar uma entrega boa por excesso seria trocar dano por dano.
 */
function exigirQuantidade(data: Record<string, unknown>, min: number, max: number, oQue: string): string[] {
  const n = itensDe(data).length;
  if (n < min) return [`entregou ${n} ${oQue} — o contrato com o cliente é de ${min}${max > min ? ` a ${max}` : ""}. Faltam ${min - n}.`];
  if (n > max) return [`entregou ${n} ${oQue} — o teto é ${max}.`];
  return [];
}

/** O formato de uma peça de social, normalizado. Vazio = não declarou. */
function formatoDaPeca(it: Record<string, unknown>): string {
  const f = texto(it, "format").toLowerCase();
  if (/carrossel|carousel/.test(f)) return "carrossel";
  if (/story|stories/.test(f)) return "story";
  if (/reel|v[íi]deo|video/.test(f)) return "reel";
  if (/feed|post/.test(f)) return "feed";
  return "";
}

/** Quantas telas o campo `cenas` descreve. O formato pedido é "1) ... 2) ...". */
export function contarCenas(cenas: string): number {
  const marcadores = cenas.match(/(?:^|[\s·|])\d+\s*[)\].:-]/g);
  if (marcadores && marcadores.length > 0) return marcadores.length;
  return cenas.trim() ? cenas.split(/\n+/).filter((l) => l.trim()).length : 0;
}

const MIN_TELAS = 3;
const MAX_TELAS = 6;

/** O contrato da pauta: 4 semanas de calendário, uma por item. */
function contratoDaPauta(data: Record<string, unknown>): string[] {
  return exigirQuantidade(data, 4, 8, "semanas de calendário");
}

/**
 * O contrato das legendas — o mais caro de todos quando falha.
 *
 * Confere as três coisas que o prompt pede e ninguém verificava: quantas peças,
 * a MISTURA de formatos (senão sai tudo feed) e o tamanho do carrossel (que é
 * conta de imagem paga, não gosto).
 */
function contratoDasLegendas(data: Record<string, unknown>): string[] {
  const itens = itensDe(data);
  const problemas = exigirQuantidade(data, 6, 8, "peças de conteúdo");

  const porFormato = { carrossel: 0, story: 0, feed: 0, reel: 0, semFormato: 0 };
  for (const it of itens) {
    const f = formatoDaPeca(it);
    if (!f) porFormato.semFormato++;
    else porFormato[f as keyof typeof porFormato]++;
  }
  if (porFormato.semFormato > 0) {
    problemas.push(`${porFormato.semFormato} peça(s) sem o campo "format" — o formato decide como a arte é gerada e onde a peça é publicada.`);
  }
  for (const [f, min, max] of [["carrossel", 1, 2], ["story", 2, 3], ["feed", 2, 3]] as const) {
    const n = porFormato[f];
    if (n < min) problemas.push(`só ${n} peça(s) de ${f} — o contrato pede de ${min} a ${max}. Sem a mistura, o mês inteiro sai no mesmo formato.`);
    else if (n > max) problemas.push(`${n} peças de ${f} — o contrato pede no máximo ${max}.`);
  }

  itens.forEach((it, i) => {
    if (formatoDaPeca(it) !== "carrossel") return;
    const bruto = texto(it, "cenas");
    const telas = contarCenas(bruto);
    if (telas < MIN_TELAS || telas > MAX_TELAS) {
      problemas.push(`a peça ${i + 1} é carrossel e descreve ${telas} tela(s) em "cenas" — tem que ter de ${MIN_TELAS} a ${MAX_TELAS}, uma por linha começando com "1)", "2)". Cada tela vira uma arte produzida.`);
      return;
    }
    // ── O STORYBOARD, CONFERIDO ONDE O ESPECIALISTA ENTREGA ──────────────────
    //
    // A mesma trava roda depois, em `artes.ts`, antes de gastar imagem. Rodar
    // AQUI TAMBÉM não é redundância: aqui o especialista ainda pode refazer (é
    // o laço de contrato de saída que já existe), e lá o remédio seria descartar
    // o carrossel inteiro. Barato agora, caro depois.
    const r = conferirStoryboard(lerStoryboardDoCampo(bruto), REGUA_CARROSSEL_DE_VENDA);
    if (!r.ok) {
      for (const rep of r.reprovacoes) problemas.push(`a peça ${i + 1}: ${rep.detalhe}`);
    }
  });

  return problemas;
}


/** O contrato da segmentação: estes números entram na conta de anúncios do
 *  cliente e gastam a verba dele. Fora da faixa é dinheiro queimado. */
function contratoDaSegmentacao(data: Record<string, unknown>): string[] {
  const itens = itensDe(data);
  const problemas = exigirQuantidade(data, 1, 1, "públicos");
  const p = itens[0];
  if (!p) return problemas;

  const cidade = texto(p, "cidade");
  if (!cidade) problemas.push(`sem "cidade" — negócio local anunciado no país inteiro é dinheiro queimado. Se o briefing não disser, escreva "PRECISO CONFIRMAR: cidade".`);

  const raio = typeof p.raioKm === "number" ? p.raioKm : NaN;
  if (!Number.isFinite(raio) || raio < 1 || raio > 50) problemas.push(`"raioKm" = ${p.raioKm ?? "ausente"} — tem que ser um número entre 1 e 50.`);

  const min = typeof p.idadeMin === "number" ? p.idadeMin : NaN;
  const max = typeof p.idadeMax === "number" ? p.idadeMax : NaN;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 13 || max > 99 || min >= max) {
    problemas.push(`faixa de idade inválida (${p.idadeMin ?? "?"}–${p.idadeMax ?? "?"}) — a Meta exige idadeMin ≥ 13, idadeMax ≤ 99 e idadeMin < idadeMax.`);
  }

  const interesses = Array.isArray(p.interesses) ? p.interesses : null;
  if (!interesses) problemas.push(`"interesses" tem que ser uma lista (vazia é resposta válida).`);
  else if (interesses.length > 4) problemas.push(`${interesses.length} interesses — o contrato é de no máximo 4.`);

  return problemas;
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
    // ── O CONTRATO DE MARCA VEM PRIMEIRO, e a ordem é a mensagem ───────────
    // Entra no bloco COMPARTILHADO porque assim alcança TODO especialista de
    // uma vez — e não só aquele que alguém lembrou de alterar depois.
    c.contratoDeMarca,
    `Negócio: ${c.businessName}`,
    c.segment && `Segmento: ${c.segment}`,
    c.targetAudience && `Público-alvo: ${c.targetAudience}`,
    c.tone && `Tom de voz: ${c.tone}`,
    c.services.length && `Serviços contratados: ${c.services.join(", ")}`,
    c.objectives.length && `Objetivos: ${c.objectives.join(", ")}`,
    c.strategyHeadline && `Direção estratégica: ${c.strategyHeadline}`,
    // O feed real por último e inteiro: é um bloco, não um campo. Vai para
    // TODOS os especialistas — inclusive a degradação, que é instrução tanto
    // quanto a síntese ("não descreva o que ninguém viu").
    c.feedRealDoCliente,
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
        contrato: (d) => exigirQuantidade(d, 3, 8, "concorrentes"),
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
        contrato: contratoDaPauta,
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
        contrato: contratoDasLegendas,
        provedor: "claude",
        prompt: (c) => `Você é o especialista de COPY de social da Dioli Digital. Escreva as legendas prontas para publicar.

CONTEXTO
${ctxBlock(c)}

Escreva de 6 a 8 peças, com a MISTURA de formatos que funciona para negócio local — não faça tudo feed:
- 1 a 2 CARROSSEL: o formato que mais segura atenção. Use quando o assunto tem PASSOS ou LISTA ("3 sinais de que...", "como escolher..."). No campo "cenas", descreva de 3 a 6 telas, uma por linha, começando com "1)", "2)"...

STORYBOARD OBRIGATÓRIO — cada tela declara o PAPEL que cumpre na história, entre colchetes, logo depois do número:
"1) [gancho] a cena da dor acontecendo · 2) [tensao] o custo de continuar assim · 3) [mecanismo] como funciona, na prática · 4) [acao] o próximo passo"
Papéis: gancho (para o dedo, nomeia a dor) · tensao (o custo de continuar como está) · prova (evidência REAL do cliente) · mecanismo (como funciona) · resultado (o estado depois) · acao (o próximo passo).
REGRAS QUE REPROVAM A PEÇA, e são conferidas em código: a primeira tela é sempre [gancho] e a última sempre [acao]; NENHUM papel se repete; NENHUMA cena descreve a mesma coisa que outra — cada tela pede uma imagem diferente porque cumpre um papel diferente. Descreva o que a imagem daquela tela MOSTRA (a imagem é o argumento, não fundo bonito). Se um papel exigir material que você não tem (um dado do cliente para [prova], por exemplo), escreva "PRECISO CONFIRMAR: <o quê>" naquela tela — nunca preencha com cena genérica.
- 2 a 3 STORY: assunto do dia, bastidor, enquete. Story é vertical e vive 24h — nada que precise durar.
- 2 a 3 FEED: o que fica no perfil e representa a marca.
${REGRA}
${formato("Legendas Prontas — <negócio>", `"format": "feed|story|reel|carrossel", "headline": "...", "caption": "legenda pronta", "visual": "o que aparece na imagem", "cenas": "só para carrossel: 1) [gancho] tela 1 · 2) [tensao] tela 2 · 3) [acao] ..."`)}`,
      },
      {
        id: "social-roteiro-video",
        label: "Roteiro de vídeo",
        deliverableType: "video",
        contrato: (d) => exigirQuantidade(d, 3, 6, "roteiros de vídeo"),
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
          // Três formas de estar apto a produzir, e a terceira é a que faltava:
          //   1. já existe material de marca gravado;
          //   2. o cliente respondeu ao pedido de material;
          //   3. **o serviço contratado É criar a marca** — aqui não existe
          //      material para pedir, e exigi-lo trava o cliente para sempre.
          tem: (c) => c.criandoIdentidade || c.hasBrandAssets || c.materiaisEntregues.includes("design"),
          pedido: "Para começar as peças de design, precisamos dos materiais da sua marca: logo (se tiver), cores, fontes e alguma referência visual que você goste. Pode enviar por aqui? 🎨",
        },
        prompt: (c) => `Você é o especialista de IDENTIDADE VISUAL da Dioli Digital. Defina a direção de arte da marca.

CONTEXTO
${ctxBlock(c)}
${c.criandoIdentidade
  ? "SITUAÇÃO: a marca está sendo criada DO ZERO. O cliente não tem logo, cor nem tipografia — é exatamente isso que ele contratou. NÃO peça material de marca: proponha, justificando cada escolha pelo segmento e pelo público."
  : "SITUAÇÃO: a marca já existe. Trabalhe A PARTIR do material que a empresa tem, sem reinventar o que já está consolidado."}

Entregue: paleta (com o papel de cada cor), tipografia (título e texto), estilo de fotografia, e 3 regras do que NUNCA usar nesta marca.
${REGRA}
${formato("Direção Visual — <negócio>", `"headline": "...", "direction": "...", "palette": "...", "note": "..."`)}`,
      },
      {
        id: "design-criativo-social",
        label: "Criativo de social",
        deliverableType: "design",
        contrato: (d) => exigirQuantidade(d, 3, 8, "criativos de social"),
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
        contrato: (d) => exigirQuantidade(d, 3, 8, "criativos de anúncio"),
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
        // O especialista que faltava para a campanha SAIR DO PAPEL. Os outros
        // dois descrevem a campanha em prosa; este devolve os campos que a
        // Marketing API exige para criar o conjunto de anúncios. Sem ele, a
        // agência escrevia "público: mulheres do bairro, 25 a 45" e nenhum
        // código sabia transformar isso em segmentação de verdade.
        id: "traffic-segmentacao",
        label: "Segmentação",
        deliverableType: "campaign",
        contrato: contratoDaSegmentacao,
        provedor: "claude",
        prompt: (c) => `Você é o especialista de SEGMENTAÇÃO da Dioli Digital. Sua saída NÃO é um texto: são os parâmetros exatos que vão para dentro da conta de anúncios do cliente.

CONTEXTO
${ctxBlock(c)}

Defina UM público principal. Regras que valem mais que a sua opinião:
- CIDADE: escreva apenas a cidade e o estado, como no endereço do cliente ("Campinas, SP"). Se o briefing não disser a cidade, escreva "PRECISO CONFIRMAR: cidade" — negócio local anunciado no país inteiro é dinheiro queimado.
- RAIO: em km, entre 1 e 50. Comércio de bairro (padaria, salão, pet shop) vive entre 3 e 8 km. Só passe de 15 km se o cliente atende a região inteira.
- IDADE: faixa realista para quem COMPRA, não para quem curte.
- INTERESSES: no máximo 4, escritos como a Meta os nomeia ("Culinária", "Pequenas empresas"). Se não houver interesse óbvio, devolva lista vazia — segmentar por palpite é pior que não segmentar.
${REGRA}
Responda em JSON: {"title": "Segmentação — <negócio>", "summary": "1 frase justificando o público", "items": [{"headline": "Público principal", "cidade": "Cidade, UF", "raioKm": 5, "idadeMin": 25, "idadeMax": 55, "interesses": ["...", "..."], "note": "por que este público compra"}]}`,
      },
      {
        id: "traffic-copy-anuncio",
        label: "Copy de anúncio",
        deliverableType: "campaign",
        contrato: (d) => exigirQuantidade(d, 4, 8, "anúncios"),
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
        contrato: (d) => exigirQuantidade(d, 3, 8, "indicadores"),
        provedor: "openai",
        prompt: (c) => `Você é o especialista de MEDIÇÃO da Dioli Digital. Defina como vamos provar que funcionou.

CONTEXTO
${ctxBlock(c)}

Defina de 3 a 5 indicadores adequados ao objetivo e ao segmento: o que cada um mede, de onde vem o dado, e a cadência do relatório. NÃO invente meta que dependa de histórico que não temos — escreva "PRECISO CONFIRMAR: número atual" quando for o caso.
${REGRA}
${formato("Plano de Medição — <negócio>", `"headline": "<indicador>", "note": "o que mede + cadência", "audience": "de onde vem o dado"`)}`,
      },
      {
        // O especialista que transforma CICLO em APRENDIZADO. Sem ele, o mês 2
        // era uma cópia do mês 1 com datas novas: a agência media, relatava, e
        // no mês seguinte produzia exatamente a mesma coisa. Ciclo sem
        // aprendizado é rotina cara, não operação contínua.
        id: "analytics-otimizacao",
        label: "Otimização do próximo ciclo",
        deliverableType: "analytics",
        contrato: (d) => exigirQuantidade(d, 3, 8, "mudanças para o próximo ciclo"),
        provedor: "claude",
        prompt: (c) => `Você é o especialista de OTIMIZAÇÃO da Dioli Digital. Sua entrega decide o que muda no mês que vem.

CONTEXTO
${ctxBlock(c)}

${c.resultadoDoCicloAnterior
  ? `O QUE ACONTECEU NO CICLO ANTERIOR (números reais, medidos — use SOMENTE estes):\n${c.resultadoDoCicloAnterior}`
  : "AINDA NÃO HÁ CICLO ANTERIOR MEDIDO. Não invente desempenho passado: proponha o plano de partida e diga explicitamente que a otimização começa quando houver o primeiro mês medido."}

Decida de 3 a 5 mudanças para o próximo ciclo. Para cada uma: o que muda, POR QUE (ancorado num número acima — se não houver número que sustente, não proponha), e como saberemos se deu certo.
Regras que valem mais que a sua opinião:
- Mudança sem número que a sustente é palpite. Palpite não entra.
- Se algo caiu, a primeira mudança tem que endereçar a queda — não desviar o assunto para o que foi bem.
- Não proponha aumentar verba sem que o custo por resultado esteja bom. Escalar o que não funciona só gasta mais rápido.
${REGRA}
${formato("Otimização do próximo ciclo — <negócio>", `"headline": "o que muda", "note": "por que — cite o número", "cta": "como saberemos se deu certo"`)}`,
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

/**
 * O contrato de saída deste especialista foi cumprido?
 *
 * Ponto ÚNICO de chamada para o motor. Especialista sem `contrato` devolve lista
 * vazia — e isso é uma lacuna declarada, não uma aprovação: quem não tem
 * contrato conferível simplesmente não é conferido aqui.
 */
export function conferirContrato(
  esp: Pick<Especialista, "contrato">,
  data: Record<string, unknown>,
): { cumpriu: boolean; violacoes: string[] } {
  if (!esp.contrato) return { cumpriu: true, violacoes: [] };
  let violacoes: string[];
  try {
    violacoes = esp.contrato(data);
  } catch {
    // Um contrato que explode não pode derrubar a produção — mas também não
    // pode virar "cumpriu". Vira violação declarada.
    return { cumpriu: false, violacoes: ["não foi possível conferir o contrato de saída desta entrega"] };
  }
  return { cumpriu: violacoes.length === 0, violacoes };
}

/** Quantos especialistas da casa têm contrato conferível. Serve ao painel e à
 *  auditoria: "quantas entregas ninguém confere?" precisa de resposta. */
export function coberturaDeContratos(): { comContrato: number; total: number } {
  return {
    comContrato: TODOS_OS_ESPECIALISTAS.filter((e) => !!e.contrato).length,
    total: TODOS_OS_ESPECIALISTAS.length,
  };
}

export { ctxBlock };
