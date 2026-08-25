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
import { contratoDaBaseDeMarca, blocoDosCamposDaMarca } from "@/lib/agency/execution/branding";
// A trava de storyboard (`lib/agency/design/storyboard.ts`) roda nos DOIS pontos
// da esteira: aqui, no contrato de saída do especialista, onde ele ainda pode
// refazer; e em `artes.ts`, antes de gastar imagem. Mesma função, mesma régua.
import {
  conferirStoryboard, lerStoryboardDoCampo, REGUA_CARROSSEL_DE_VENDA,
} from "@/lib/agency/design/storyboard";
// O contrato de SAÍDA deriva do contrato de ENTRADA. Ver `escopo-do-cliente.ts`
// para por que os números fixos daqui eram o defeito, e não a calibragem deles.
import {
  exigenciaDeConteudo, escopoNaoDeclarado,
  type EscopoDeConteudo, type ExigenciaDeConteudo, type FormatoContratado,
} from "@/lib/agency/execution/escopo-do-cliente";

/** O contexto do cliente que todo especialista recebe. Verdade ancorada: campo
 *  vazio é campo vazio — nenhum prompt aqui manda preencher por inferência. */
export interface Ctx {
  /**
   * QUAL LEVA DO CICLO esta passada está produzindo (1, 2, 3…).
   *
   * O mês deixou de sair numa passada só (ver `escopo-do-cliente.ts`). É este
   * número que diz ao especialista o TAMANHO do lote que ele escreve agora —
   * sem ele, todo lote voltaria a ser o mês inteiro e a régua o reprovaria.
   * Ausente = 1, que é o comportamento de quem monta Ctx fora do motor.
   */
  leva?: number;
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
  /**
   * O QUE O CLIENTE COMPROU — volume e formatos, lidos do que ele escreveu.
   *
   * Existe desde 15/08/2026, e nasceu de um conflito medido: o contrato de saída
   * do especialista de copy exigia de TODO cliente "6 a 8 peças, com 1 a 2
   * carrossel e 2 a 3 story", enquanto o contrato do CityJobs
   * (`docs/projetos/cityjobs-orcamento.md`) EXCLUI carrossel, story e vídeo e
   * compra 60 posts simples por mês. A trava mais cara da casa cobrava
   * exatamente o que o cliente não comprou.
   *
   * Ausente = o motor não conseguiu ler o contrato daquele cliente. Aí a régua
   * histórica continua valendo, com a lacuna NOMEADA — nunca um número
   * inventado no lugar do dele.
   */
  escopoContratado?: EscopoDeConteudo;
  /**
   * O QUE O CLIENTE ATESTOU, e o que ele NUNCA contou.
   *
   * ── Por que isto nasceu (24/08/2026) ─────────────────────────────────────
   * O piloto barrou "Pesquisa de concorrência" no piso de verdade com
   * `area_nao_informada`: a peça afirmou uma área de atendimento que o cliente
   * jamais informou. O piso está certo — afirmar sobre o que o cliente não
   * contou é invenção, e essa é a regra de ouro da casa.
   *
   * O defeito estava do outro lado: **o especialista nunca recebeu a verdade
   * que o piso cobra.** `ctxBlock` mandava segmento, público e tom, e nada
   * sobre horário, área de atendimento, pagamento, oferta, canal ou prazo. O
   * produtor escrevia às cegas contra uma régua que confere fato atestado, e o
   * piso o pegava DEPOIS de a peça estar pronta e paga.
   *
   * É o mesmo defeito que o `contratoDeMarca` consertou em 09/08 para as
   * proibições do cliente — "quem produzia era pego, nunca avisado" —, agora
   * para os fatos operacionais. `classesSemInformacao()` já existia e servia só
   * ao painel; aqui ela vira instrução para quem escreve.
   *
   * Ausente = quem montou o Ctx não tinha a verdade (teste, ferramenta). Nunca
   * significa "o cliente não atestou nada" — a diferença está escrita no bloco.
   */
  verdadeAtestada?: {
    /** As linhas de fato atestado, prontas para o prompt. */
    linhas: string[];
    /** As classes sobre as quais o cliente não contou NADA. */
    semInformacao: string[];
  };
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
  /**
   * QUANDO ESTE ESPECIALISTA SEQUER É ESCALADO.
   *
   * Diferente de `precisaDe`: aquilo é "falta insumo, pergunte ao cliente";
   * isto é "este trabalho NÃO está no escopo dele, não custe um token". Nasceu
   * com a saída do vídeo da vitrine (25/08/2026) — a casa não edita vídeo, e o
   * roteiro de reel era produzido para todo cliente de social, inclusive os que
   * declararam zero reel no briefing. Produzir o que não se vende é a mesma
   * dívida de D-0A3 pelo avesso: a promessa some da tabela e o gasto fica.
   */
  soQuando?: (c: Ctx) => boolean;
  prompt: (c: Ctx) => string;
  provedor?: ProvedorPreferido;
  /**
   * O CONTRATO DE SAÍDA — o que o prompt pede em número e formato, conferido em
   * código sobre o JSON que o modelo devolveu.
   *
   * Devolve a lista de violações em português, pronta para virar parecer. Lista
   * vazia = cumpriu.
   */
  contrato?: (data: Record<string, unknown>, c: Ctx) => string[];
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

/** Os itens do JSON do especialista. Exportada em 25/08/2026 para que a
 *  corrente do Story leia as peças da MESMA forma que o contrato de saída as
 *  conta — uma segunda leitura aqui faria o produtor e o conferente
 *  discordarem sobre quantas peças existem. */
export function itensDe(data: Record<string, unknown>): Array<Record<string, unknown>> {
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

/**
 * A MISTURA DE FORMATOS — a mesma tabela para quem PEDE e para quem CONFERE.
 *
 * Estava escrita só dentro de `contratoDasLegendas`, e o prompt do especialista
 * carregava a sua própria cópia em prosa ("1 a 2 CARROSSEL, 2 a 3 STORY..."). Duas
 * cópias da mesma regra é uma que envelhece sem ninguém notar — foi exatamente o
 * que aconteceu com o VOLUME: o contrato virou derivado do cliente em 15/08/2026
 * e o prompt ficou preso em "6 a 8 peças". No piloto de 24/08 o cliente havia
 * comprado 12 e o especialista, obediente ao prompt, nunca teve como acertar:
 * cada refação relia o mesmo "6 a 8". A régua estava certa e o pedido, errado.
 */
/**
 * ⚠️ 25/08/2026 — A TABELA MUDOU DE CASA, E NENHUM NÚMERO MUDOU.
 *
 * Ela agora mora em `lib/agency/contrato-de-quantidade.ts` e aqui só é
 * REEXPORTADA. O motivo foi medido no case Farol 27: a proposta prometia
 * 7 stories/semana, esta tabela admite 3, e as duas verdades viviam em
 * arquivos que não se conheciam. O especialista obedecia à proposta, este
 * contrato recusava, três tentativas, `blocked` — impasse por construção.
 *
 * Quem VENDE passou a ler DAQUI (o mesmo objeto, provado por identidade em
 * `__tests__/comercial/a-proposta-nasce-do-briefing`), e por isso a proposta
 * não tem mais como prometer o que este contrato proíbe.
 */
import { LIMITES_POR_FORMATO, misturaDoLote, receitaDoLote } from "@/lib/agency/contrato-de-quantidade";
export { LIMITES_POR_FORMATO as MISTURA_DE_FORMATOS };

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
function contratoDasLegendas(data: Record<string, unknown>, c?: Ctx): string[] {
  const itens = itensDe(data);

  // ── A EXIGÊNCIA VEM DO CONTRATO DO CLIENTE (15/08/2026) ───────────────────
  //
  // Era "6 a 8 peças, 1-2 carrossel, 2-3 story, 2-3 feed" — no código, igual
  // para todo mundo. O contrato do CityJobs exclui carrossel, story e vídeo e
  // compra 60 posts simples por mês. A trava mais cara da casa cobrava
  // exatamente o que o cliente NÃO comprou, com um teto de 13% do que ele pagou.
  //
  // Sem contrato legível, `escopoNaoDeclarado()` devolve a régua histórica com
  // a lacuna nomeada — parar todo cliente cujo briefing não escreveu o volume
  // trocaria um dano por um maior.
  const exigencia: ExigenciaDeConteudo = exigenciaDeConteudo(c?.escopoContratado ?? escopoNaoDeclarado(), c?.leva ?? 1);
  const problemas = exigirQuantidade(data, exigencia.min, exigencia.max, "peças de conteúdo");

  const porFormato = { carrossel: 0, story: 0, feed: 0, reel: 0, semFormato: 0 };
  for (const it of itens) {
    const f = formatoDaPeca(it);
    if (!f) porFormato.semFormato++;
    else porFormato[f as keyof typeof porFormato]++;
  }
  if (porFormato.semFormato > 0) {
    problemas.push(`${porFormato.semFormato} peça(s) sem o campo "format" — o formato decide como a arte é gerada e onde a peça é publicada.`);
  }

  // ── O PILAR, CONFERIDO ONDE ELE NASCE (15/08/2026) ────────────────────────
  //
  // O bloqueio de pilar (`pilares-bloqueados.ts`) foi criado em 07/08 depois de
  // TRÊS peças saírem com salário inventado dentro dos pixels. Ele lê
  // `post.pillar` — e na esteira automática `post.pillar` era SEMPRE null,
  // porque nem o prompt pedia `pillar` nem o markdown emitia a linha "Pilar".
  // `conferirPilar(null)` devolvia LIBERADO, e o bloqueio nunca disparou no
  // caminho automático: só quando um humano criava o post pelo Planner.
  //
  // Conferir aqui é conferir na ORIGEM, onde o especialista ainda pode refazer.
  // O fail-closed do calendário (`publicacao.ts`) é a segunda metade: sem as
  // duas, ou a esteira aprova por omissão, ou ela para sem dizer por quê.
  const semPilar = itens.filter((it) => !texto(it, "pillar")).length;
  if (semPilar > 0) {
    problemas.push(
      `${semPilar} peça(s) sem o campo "pillar" — o pilar é o que o bloqueio de conteúdo confere antes de a peça virar imagem paga. ` +
      "Sem ele a trava não roda, e peça sem pilar NÃO entra no calendário do cliente.",
    );
  }
  // ── FORMATO FORA DO ESCOPO É QUEBRA DE CONTRATO, NÃO VARIEDADE ────────────
  //
  // O cliente escreveu "sem carrossel" e recebia carrossel porque a régua era
  // de código. Entregar o que ele excluiu é entregar outra coisa: ele paga por
  // 60 posts simples e recebe 6 peças, duas delas de um formato que ele recusou.
  for (const f of ["carrossel", "story", "feed", "reel"] as const) {
    if (exigencia.permitidos.includes(f as FormatoContratado)) continue;
    if (porFormato[f] > 0) {
      problemas.push(
        `${porFormato[f]} peça(s) de ${f} — este cliente EXCLUIU ${f} do escopo contratado. ` +
        "Formato que ele não comprou não é variedade: é entrega errada.",
      );
    }
  }

  // ── A MISTURA, SÓ ENTRE O QUE ELE COMPROU ─────────────────────────────────
  //
  // A mistura existe para o mês não sair inteiro no mesmo formato — e isso só
  // faz sentido quando há mais de um formato no escopo. Cliente de UM formato
  // só (o CityJobs: post simples de feed) não tem mistura para fazer, e exigi-la
  // é o defeito que este bloco corrige.
  //
  // ── E A RÉGUA É A DO LOTE, NÃO A DE UM LOTE DE 12 (25/08/2026) ────────────
  //
  // `LIMITES_POR_FORMATO` descrevia a forma de um lote de 12 peças com REEL
  // absorvendo a sobra. Sem reel (a casa não edita vídeo) e com lotes de tamanho
  // variável (as levas), aquela régua reprovava os dois extremos: o lote de 11
  // do plano Completo, porque os tetos somavam 8; e o lote de 4 do Essencial,
  // porque os mínimos somavam 5. A mistura passou a ser PROPORÇÃO do lote, na
  // mesma fonte única — ver `misturaDoLote` em `contrato-de-quantidade.ts`.
  const daMistura = (["carrossel", "story", "feed"] as const).filter((f) =>
    exigencia.permitidos.includes(f as FormatoContratado),
  );
  if (daMistura.length > 1) {
    const regua = misturaDoLote(exigencia.max, daMistura);
    for (const f of daMistura) {
      const [min, max] = regua[f];
      const n = porFormato[f];
      if (n < min) problemas.push(`só ${n} peça(s) de ${f} — este lote pede de ${min} a ${max}. Sem a mistura, o mês inteiro sai no mesmo formato.`);
      else if (n > max) problemas.push(`${n} peças de ${f} — este lote pede no máximo ${max}.`);
    }
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
    // ── A VERDADE ATESTADA, E O QUE ELE NUNCA CONTOU ────────────────────────
    // Por último porque é o bloco que o especialista consulta enquanto escreve,
    // e porque a lista do que FALTA precisa ser a última coisa lida antes das
    // REGRAS INEGOCIÁVEIS — as duas dizem a mesma coisa e se reforçam.
    fatosDaVerdade(c),
    regrasDeRedacao(c),
  ].filter(Boolean).join("\n\n");
}

/**
 * O MESMO CONTEXTO, MENOS AS REGRAS DE REDAÇÃO — é o que o JUIZ recebe.
 *
 * ── Por que existe (24/08/2026) ────────────────────────────────────────────
 * O motor mandava `ctxBlock` inteiro como `brandContext` da auditoria. O juiz
 * lia instruções escritas para o autor e as cobrava como checklist: reprovou
 * roteiros dizendo, na mesma frase, que a peça era *"publicável"*, que a
 * *"redação está correta, sem erro"* e que *"nenhum roteiro inventa dado"* —
 * as objeções eram todas de OMISSÃO de fato atestado.
 *
 * O juiz PRECISA dos fatos: sem eles não há como pegar invenção nem
 * contradição com o que o cliente disse. O que ele não pode receber é o manual
 * de quem escreve, porque instrução lida por quem julga vira exigência.
 *
 * ⚠️ Nenhum critério de julgamento sai daqui — eles vivem no prompt do
 * auditor, não neste bloco. O que sai é o manual de redação.
 */
export function ctxBlockParaJuiz(c: Ctx): string {
  return [
    c.contratoDeMarca,
    `Negócio: ${c.businessName}`,
    c.segment && `Segmento: ${c.segment}`,
    c.targetAudience && `Público-alvo: ${c.targetAudience}`,
    c.tone && `Tom de voz: ${c.tone}`,
    c.services.length && `Serviços contratados: ${c.services.join(", ")}`,
    c.objectives.length && `Objetivos: ${c.objectives.join(", ")}`,
    c.strategyHeadline && `Direção estratégica: ${c.strategyHeadline}`,
    c.feedRealDoCliente,
    fatosDaVerdade(c),
  ].filter(Boolean).join("\n\n");
}

/**
 * O bloco que diz ao produtor o que ele PODE afirmar — e o que, se afirmar,
 * será barrado no piso de verdade.
 *
 * A assimetria é de propósito: o que o cliente atestou vai como lista seca, e o
 * que ele NÃO contou vai com a instrução do que fazer. Dizer "faltou área de
 * atendimento" sem dizer "escreva PRECISO CONFIRMAR" deixa o modelo preencher
 * com o que parece razoável, que é exatamente como a invenção entra.
 */
/**
 * OS FATOS ATESTADOS — para quem ESCREVE e para quem JULGA.
 *
 * ── Por que este bloco foi partido em dois (24/08/2026) ────────────────────
 * Ele nasceu como um bloco só: fatos + regras de redação, tudo junto, e o motor
 * mandava o mesmo texto para o especialista (via `ctxBlock`) e para o auditor
 * de Qualidade (via `brandContext`). Medido ao vivo, e o parecer se contradizia
 * na mesma frase: *"peça é publicável"*, *"redação atual está correta, sem
 * erro"*, *"nenhum roteiro inventa dado não atestado"* — e mesmo assim `flag`.
 *
 * As objeções que sobravam eram todas de OMISSÃO: *"Roteiro 2 não menciona
 * fechamento às 23h — incompleto quanto à operação atestada"*. O juiz estava
 * lendo instruções escritas para o AUTOR ("use o fato como ele foi atestado")
 * e cobrando-as como checklist de conformidade. Um post não é obrigado a listar
 * horário de funcionamento.
 *
 * **Instrução para quem escreve, lida por quem julga, vira exigência.** Por
 * isso os FATOS ficam aqui — o juiz precisa deles para pegar invenção e
 * contradição — e as REGRAS DE REDAÇÃO ficam em `regrasDeRedacao`, que só o
 * autor recebe.
 */
function fatosDaVerdade(c: Ctx): string {
  const v = c.verdadeAtestada;
  // Sem verdade montada, calar é a única saída honesta: um bloco dizendo "o
  // cliente não atestou nada" seria FALSO quando quem montou o Ctx é um teste.
  if (!v) return "";

  const partes: string[] = [];
  if (v.linhas.length > 0) {
    partes.push(
      "O QUE O CLIENTE ATESTOU (veio das palavras dele):\n"
      + v.linhas.map((l) => `- ${l}`).join("\n"),
    );
  }
  if (v.semInformacao.length > 0) {
    partes.push(
      "O QUE O CLIENTE NUNCA CONTOU:\n"
      + v.semInformacao.map((l) => `- ${l}`).join("\n"),
    );
  }
  return partes.join("\n\n");
}

/**
 * AS REGRAS DE REDAÇÃO — só para quem ESCREVE.
 *
 * ⚠️ NÃO vá para o auditor. Ver `fatosDaVerdade`: lidas por quem julga, elas
 * viram checklist e a peça é reprovada por não citar todos os fatos.
 */
function regrasDeRedacao(c: Ctx): string {
  // Sem verdade montada não há do que falar — e inventar regra sobre uma lista
  // que não existe só encheria o prompt.
  if (!c.verdadeAtestada) return "";

  // ── A REGRA CATEGÓRICA, E POR QUE A LISTA DE FATOS NÃO BASTA ────────────
  //
  // Medido em 24/08/2026: a peça foi barrada em `horario_nao_informado` num
  // briefing em que a lista de "nunca contou" NÃO trazia horário. Não é
  // contradição — é granularidade. A lista de classes (`classesSemInformacao`)
  // é um resumo de painel: considera a classe "horário" coberta quando o
  // cliente atestou os DIAS, mesmo sem nunca ter dito uma HORA. O piso confere
  // fato a fato e reprova "das 12h às 15h" porque nenhuma hora foi atestada.
  //
  // Enquanto o aviso enumerar classes e a régua conferir fatos, sempre haverá
  // um fato no vão. A regra abaixo fecha o vão pelo único lado que fecha: em
  // vez de enumerar o proibido, define o permitido.
  return (
    "REGRA DO QUE PODE SER AFIRMADO — é assim que o piso de verdade confere, fato a fato:\n"
    + "Só afirme HORÁRIO, DIA, ÁREA DE ATENDIMENTO, RAIO, PREÇO, PRAZO, FORMA DE PAGAMENTO, "
    + "CANAL, PERFIL ou OFERTA que apareça LITERALMENTE na lista de atestados acima. "
    + "Não vale deduzir do segmento, do público, do objetivo nem do bom senso — "
    + '"restaurante abre no almoço" é dedução, não é fato do cliente.\n'
    + 'Para qualquer um desses que você precise e não esteja atestado, escreva '
    + '"PRECISO CONFIRMAR: <o quê>" no lugar do valor. Uma peça com PRECISO CONFIRMAR é '
    + "entregue e revisada; uma peça com fato inventado é REPROVADA INTEIRA e não chega ao cliente.\n"
    + "Peça boa sem número inventado existe: fale do que a marca faz, de quem ela serve e "
    + "do que o cliente escreveu — nada disso precisa de hora, preço ou endereço.\n"
    + "\n"
    + "⚠️ E NÃO CONSTRUA A PEÇA EM CIMA DO QUE FALTA. Medido em 24/08/2026: peças "
    + "escritas com CTA do tipo \"chame no WhatsApp [PRECISO CONFIRMAR: número]\" foram "
    + "REPROVADAS pela Qualidade e o pacote inteiro ficou retido — a peça dependia de um "
    + "dado que ninguém tinha. Escreva a peça que FUNCIONA com o que está atestado: "
    + "\"chama a gente no direct\" não precisa de número; \"venha almoçar com a gente\" não "
    + "precisa de horário. Use \"PRECISO CONFIRMAR\" só quando a peça REALMENTE não existe "
    + "sem aquele dado — não como recheio de um texto que você já decidiu escrever.\n"
    + "\n"
    + "⚠️ E USE O FATO COMO ELE FOI ATESTADO — não estreite, não generalize, não "
    + "arredonde. Medido em 24/08/2026: com \"terça a domingo, das 11h30 às 15h e das "
    + "18h30 às 23h\" atestado, a peça saiu falando em dias úteis e horário genérico, e "
    + "foi REPROVADA por \"restringir dias de funcionamento sem base\". Fechar o "
    + "restaurante no domingo por descuido de redação custa o domingo inteiro de movimento.\n"
    + "Você NÃO precisa citar todos os fatos atestados — a peça não é um cadastro. "
    + "Cite o que servir à peça; o que citar, cite certo. Se o fato for comprido demais, "
    + "use a PARTE que couber sem contradizer o resto (\"aberto até 23h\" está certo; "
    + "\"de segunda a sexta\" quando abre terça a domingo está errado) — ou não fale do assunto."
  );
}

/** O rodapé que vai em TODO prompt: a regra de ouro da casa, aplicada ao
 *  especialista. Sem revisor humano, "não invente" precisa estar em cada peça. */
const REGRA = `
REGRAS INEGOCIÁVEIS
- Não invente número, preço, prazo, endereço, nome de pessoa nem resultado passado.
- Se faltar um dado para fazer bem, escreva "PRECISO CONFIRMAR: <o quê>" naquele campo.
- Português do Brasil. Específico deste negócio — nada que sirva para qualquer cliente.
- Responda SOMENTE JSON válido, no formato pedido.`;

/**
 * O PEDIDO DE VOLUME, DERIVADO DO CONTRATO DO CLIENTE.
 *
 * Uma fonte só para o número que o prompt pede e o número que a régua cobra.
 * Enquanto eram dois, o especialista era reprovado por obedecer ao prompt.
 */
function pedidoDeVolume(c: Ctx): string {
  const e = exigenciaDeConteudo(c.escopoContratado ?? escopoNaoDeclarado(), c.leva ?? 1);
  const quantas = e.min === e.max ? `EXATAMENTE ${e.min} peças` : `de ${e.min} a ${e.max} peças`;
  const linhas = [
    `Escreva ${quantas}. Este número é o que o cliente COMPROU e é conferido em código: `
    + "entregar menos reprova a entrega inteira, e ela não chega a ele.",
  ];
  if (e.cobreDoMes && e.cobreDoMes.levas > 1) {
    // Ele está escrevendo UMA leva do mês, e precisa saber disso: sem esta
    // linha o especialista tenta "compensar" escrevendo o mês inteiro — e é
    // barrado pelo outro lado da régua, que confere o tamanho da leva.
    linhas.push(
      `(Esta é a leva ${e.cobreDoMes.leva} de ${e.cobreDoMes.levas} deste mês. O cliente comprou `
      + `${e.cobreDoMes.contratado} peças no ciclo; as outras levas vêm nos próximos dias — não tente compensar aqui.)`,
    );
  }
  if (e.cobreDoMes && e.cobreDoMes.entrega < e.cobreDoMes.contratado) {
    // Honestidade com quem produz: ele não está entregando o mês inteiro, e não
    // é falha dele. Sem esta linha, o especialista tenta "compensar" escrevendo
    // mais do que o teto permite — e é barrado pelo outro lado da régua.
    linhas.push(
      `(⚠️ O cliente comprou ${e.cobreDoMes.contratado} peças no mês e a casa entrega ${e.cobreDoMes.entrega} `
      + "no ciclo inteiro — o teto do mês mordeu. Isso é pergunta para gente, não trabalho seu: não tente compensar aqui.)",
    );
  }
  linhas.push("Use a MISTURA de formatos que funciona para negócio local — não faça tudo feed:");
  return linhas.join("\n");
}

/**
 * A MISTURA, com os números exatos que o contrato confere — e a conta que sobra.
 *
 * O bloco calcula o que fazer com as peças ALÉM da mistura: com 12 peças
 * compradas, os tetos de carrossel/story/feed somam 8, e as outras 4 têm de ser
 * reel. Sem dizer isso, o modelo enche de feed e leva "12 peças de feed — o
 * contrato pede no máximo 3".
 */
function misturaPedida(c: Ctx): string {
  const e = exigenciaDeConteudo(c.escopoContratado ?? escopoNaoDeclarado(), c.leva ?? 1);
  const daMistura = (["carrossel", "story", "feed"] as const)
    .filter((f) => e.permitidos.includes(f as FormatoContratado));
  if (daMistura.length <= 1) {
    // Cliente de um formato só não tem mistura a fazer, e o contrato também não
    // a cobra. Pedir mistura aqui seria pedir o que a régua não quer.
    return daMistura.length === 1
      ? `Todas as ${e.min} peças são de formato "${daMistura[0]}" — é o único que este cliente contratou.`
      : "";
  }

  const receita = receitaDeFormatos(e);
  const linhas = Object.entries(receita)
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `- ${f.toUpperCase()}: exatamente ${n} peça(s).`);
  const total = Object.values(receita).reduce((a, b) => a + b, 0);
  linhas.push(
    `Some: ${Object.values(receita).filter((n) => n > 0).join(" + ")} = ${total} peças. `
    + "Estas contagens são conferidas em código, uma a uma. Não arredonde e não troque um formato por outro.",
  );
  return linhas.join("\n");
}

/**
 * A RECEITA EXATA DE FORMATOS — quantas de cada, sem sobrar conta para o modelo.
 *
 * ── Por que uma receita e não uma faixa (24/08/2026) ────────────────────────
 * A primeira versão deste bloco mandava a FAIXA de cada formato ("carrossel 1 a
 * 2, story 2 a 3, feed 2 a 3") e depois dizia "o resto vai em reel", com o
 * resto calculado sobre os MÁXIMOS. Medido ao vivo: o modelo escolheu valores
 * no meio da faixa e entregou 11 de 12 — matematicamente impossível de acertar
 * sem adivinhar que precisava estourar todos os tetos.
 *
 * A faixa é da RÉGUA, que precisa aceitar mais de uma composição válida. O
 * PEDIDO não tem esse luxo: quem escreve precisa de um número, não de um
 * intervalo com uma conta pendurada. Aritmética deixada para o modelo é
 * aritmética que uma hora sai errada — e sai errada de um jeito que a régua
 * reprova e o modelo não entende por quê.
 *
 * A receita nasce dos mínimos (é o que a régua exige de cada formato), sobe até
 * os tetos enquanto faltar peça, e joga o excedente em reel — que é o único
 * formato sem teto na mistura.
 */
function receitaDeFormatos(e: ExigenciaDeConteudo): Record<string, number> {
  const daMistura = (["carrossel", "story", "feed"] as const)
    .filter((f) => e.permitidos.includes(f as FormatoContratado));
  // A MESMA função que a régua usa, e é esse o ponto: o pedido recita a receita
  // exata, e o contrato confere a mesma receita com uma peça de tolerância. Duas
  // contas separadas aqui foram exatamente o defeito de 24/08 — o modelo
  // entregava 11 de 12 porque a aritmética tinha sido deixada com ele.
  const r = receitaDoLote(e.max, daMistura);
  const receita: Record<string, number> = {};
  for (const f of daMistura) receita[f] = r[f];
  return receita;
}

/**
 * A FORMA DA RESPOSTA, TRAVADA EM CÓDIGO — não confiada à prosa do prompt.
 *
 * ── Por que nasceu, e por que mora AQUI (24/08/2026) ────────────────────────
 * `formato()`, logo abaixo, descreve a forma em texto: `{"title", "summary",
 * "items": [...]}`. Todo contrato de saída desta casa conta `data.items`. No
 * piloto, o especialista de pauta devolveu um objeto SEM `items` e o contrato
 * leu "entregou 0 semanas de calendário" — de forma intermitente: duas rodadas
 * certas, a terceira não. É a pior maneira de um defeito aparecer, porque
 * parece azar e volta quando ninguém está olhando.
 *
 * Prompt é aviso; código é trava (guardrail 4). Declarado como esquema da
 * ferramenta, o modelo NÃO CONSEGUE devolver outra forma — deixa de ser uma
 * instrução que ele pode desobedecer.
 *
 * Mora ao lado de `formato()` de propósito: os dois descrevem a MESMA forma, e
 * separá-los seria criar a segunda régua que envelhece sozinha. A camada de IA
 * só empresta o mecanismo (`esquema`), não conhece esta forma.
 */
export const ESQUEMA_DO_PACOTE = {
  type: "object" as const,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    items: { type: "array", items: { type: "object", additionalProperties: true }, minItems: 1 },
  },
  required: ["items"],
  additionalProperties: true,
};

/** Formato único de saída — o motor sabe transformar isto em entregável. */
function formato(titulo: string, campos: string): string {
  return `Responda em JSON: {"title": "${titulo}", "summary": "1 frase", "items": [{${campos}}]}`;
}

export const DEPARTAMENTOS: Departamento[] = [
  // ── BRANDING ──────────────────────────────────────────────────────────────
  //
  // VEM ANTES DE ESTRATÉGIA, e a ordem é a mensagem: branding é o que amarra o
  // resto. Social, design e tráfego obedecem à base de marca; sem ela, cada
  // casa inventa a sua e nenhuma está errada sozinha.
  //
  // ── POR QUE ESTE DEPARTAMENTO NÃO EXISTIA ATÉ 24/08/2026 ──────────────────
  // O case Farol 27 percorreu os doze departamentos e mediu o buraco: o cliente
  // pediu REPOSICIONAMENTO DE MARCA como serviço principal e a esteira não tinha
  // quem fizesse. O Brand Hub e o Brand Book saíram à mão, fora da máquina — e o
  // que sai fora da máquina não tem portão de qualidade, não alimenta o
  // `BrandBrain` e não vira régua para as outras casas.
  //
  // ⚠️ ISTO NÃO É O KIT DE MARCA (`design-kit-de-marca`, tipo `brand-kit`), que é
  // manual + arquivos de logo montado em código. Aqui é a CONSTITUIÇÃO: quem a
  // marca é, com quem fala, como fala, o que nunca diz. O kit é a embalagem; a
  // base é o conteúdo, e o conteúdo é que serve de régua.
  //
  // ⚠️ DEPENDE DE CHAVE DE IA, e isso está declarado em vez de maquiado: sem
  // provedor configurado, `generate` falha e o motor registra
  // "Branding · Base de marca (IA: <erro>)" em `skipped`. Ele NÃO entrega
  // documento vazio com cara de entrega — o contrato de saída abaixo recusa
  // exatamente isso.
  {
    id: "branding",
    label: "Branding",
    keywords: /branding|reposicionamento|marca|identidade de marca|brand|ess[êe]ncia/i,
    insightDomain: "general",
    especialistas: [
      {
        id: "branding-base-de-marca",
        label: "Base de marca",
        // ── O TIPO É SEPARADO DOS PUBLICÁVEIS, DE PROPÓSITO ────────────────
        // `brand-foundation` está declarado em `tipos-de-entrega.ts` com
        // `publicavel: false`. Um documento de marca NÃO pode entrar em fila de
        // publicação — foi exatamente o que aconteceu com a Pauta do mês, que
        // era `social` e entrou na fila para virar post no perfil do cliente.
        // Publicar a base de marca seria publicar o gabarito das peças.
        deliverableType: "brand-foundation",
        contrato: contratoDaBaseDeMarca,
        provedor: "claude",
        prompt: (c) => `Você é o especialista de BASE DE MARCA da Dioli Digital. Escreva a CONSTITUIÇÃO da marca deste cliente — o documento que todas as outras casas (social, design, tráfego) vão obedecer.

CONTEXTO
${ctxBlock(c)}

REGRA DE OURO DESTE DOCUMENTO: **lacuna é entrega.**
O cliente não contou tudo, e o que ele não contou você NÃO INVENTA. Cada campo
sai com um estado declarado:
  "definido"        — o dono decidiu, e você diz em \`fonte\` onde isso está escrito no contexto acima;
  "lacuna"          — ninguém decidiu ainda. \`conteudo\` fica VAZIO e \`falta\` diz o que precisa vir do cliente;
  "herdado_default" — a casa empresta um mínimo enquanto a marca não se constitui. Diga em \`conteudo\` qual, e deixe claro que é da casa.

Preencher um campo bonito sobre um cliente que não contou nada é pior que deixá-lo
em branco: este documento vira RÉGUA das peças do mês inteiro.

OS CAMPOS (um item por campo, exatamente estes, nesta ordem):
${blocoDosCamposDaMarca()}
${REGRA}
Responda em JSON: {"title": "Base de marca — <negócio>", "summary": "1 frase sobre o que a marca é", "items": [{"campo": "proposito_e_promessa", "headline": "rótulo do campo em português", "estado": "definido|lacuna|herdado_default", "conteudo": "a decisão escrita, ou vazio se for lacuna", "fonte": "de onde veio (obrigatório quando definido)", "falta": "o que precisa vir do cliente (obrigatório quando lacuna)"}]}`,
      },
    ],
  },
  // ── ESTRATÉGIA ────────────────────────────────────────────────────────────
  // Vinha primeiro até 24/08/2026, quando BRANDING nasceu acima dela: a
  // estratégia decide o caminho, mas quem a marca É vem antes de para onde ela
  // vai. Segue sendo a casa que decide o caminho que as outras seguem. A concorrência é o único trabalho da agência que EXIGE olhar para
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
        //
        // ⚠️ SEM A CHAVE DA PERPLEXITY, ESTE ESPECIALISTA NÃO ENTREGA — e falha
        // de um jeito que parece defeito dele. Medido no piloto de 24/08/2026:
        // sem a chave, `generate` cai no provedor padrão (que não pesquisa), a
        // peça sai como diagnóstico de lacunas em vez de análise, e a Qualidade
        // a barra com razão:
        //
        //   "3 dos 3 concorrentes listados estão marcados como 'PRECISO
        //    CONFIRMAR' sem dados verificados (...) o núcleo da análise de
        //    concorrência — sua própria razão de ser — permanece suspenso."
        //
        // O cliente TINHA dado as referências ("Bráz", "Carlos Pizza"): o que
        // faltava era a capacidade de pesquisar, não o dado do briefing.
        //
        // CONSERTO: conectar a chave da PERPLEXITY em Integrações. Só ela serve
        // — `perplexity` fica fora de `FILA_DE_ARBITROS` de propósito ("é
        // pesquisadora com fonte, não juíza de texto"), então a segunda chave
        // que destrava o ÁRBITRO (openai/gemini/deepseek) NÃO destrava isto.
        // São dois problemas diferentes, com duas chaves diferentes.
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
        // ── É PLANO, NÃO É POST (24/08/2026) ───────────────────────────────
        // Era `social`, o MESMO tipo das legendas prontas, e o tipo é o que a
        // casa usa para decidir duas coisas independentes — e errava as duas:
        //
        //   • a Qualidade julgava a pauta como peça publicável e a reprovava
        //     com "pode-se publicar COMO ESTÁ? Não — é um blueprint". Estava
        //     certa sobre o artefato e errada sobre o que lhe disseram que ele
        //     era;
        //   • `TIPOS_PUBLICAVEIS` (`publicacao.ts`) inclui `social`, então o
        //     calendário do mês entrava na fila para VIRAR POST. Um plano
        //     interno agendado para ir ao ar no perfil do cliente.
        //
        // ⚠️ Isto NÃO a isenta de nada: `plano-de-conteudo` não está em
        // `TIPOS_DE_DOCUMENTO_INTERNO`, então a régua determinística de texto
        // continua conferindo a pauta palavra por palavra. Muda só o que ela É.
        deliverableType: "plano-de-conteudo",
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

${pedidoDeVolume(c)}
- CARROSSEL: o formato que mais segura atenção. Use quando o assunto tem PASSOS ou LISTA ("3 sinais de que...", "como escolher..."). No campo "cenas", descreva de 3 a 6 telas, uma por linha, começando com "1)", "2)"...

STORYBOARD OBRIGATÓRIO — cada tela declara o PAPEL que cumpre na história, entre colchetes, logo depois do número:
"1) [gancho] a cena da dor acontecendo · 2) [tensao] o custo de continuar assim · 3) [mecanismo] como funciona, na prática · 4) [acao] o próximo passo"
Papéis: gancho (para o dedo, nomeia a dor) · tensao (o custo de continuar como está) · prova (evidência REAL do cliente) · mecanismo (como funciona) · resultado (o estado depois) · acao (o próximo passo).
REGRAS QUE REPROVAM A PEÇA, e são conferidas em código: a primeira tela é sempre [gancho] e a última sempre [acao]; NENHUM papel se repete; NENHUMA cena descreve a mesma coisa que outra — cada tela pede uma imagem diferente porque cumpre um papel diferente. Descreva o que a imagem daquela tela MOSTRA (a imagem é o argumento, não fundo bonito). Se um papel exigir material que você não tem (um dado do cliente para [prova], por exemplo), escreva "PRECISO CONFIRMAR: <o quê>" naquela tela — nunca preencha com cena genérica.
- STORY: assunto do dia, bastidor, enquete. Story é vertical e vive 24h — nada que precise durar.
- FEED: o que fica no perfil e representa a marca.
${misturaPedida(c)}
${REGRA}

O CAMPO "pillar" É OBRIGATÓRIO EM TODA PEÇA. Escreva o pilar de conteúdo a que ela pertence, com as palavras da pauta deste cliente (ex.: "bastidor da região", "institucional — vaga validada"). Ele é conferido em código: peça sem pilar não entra no calendário do cliente. NÃO invente um pilar bonito — use o que a pauta do mês declarou.

O CAMPO "visual" É A DIREÇÃO DE ARTE, E ELE VIRA O PEDIDO À CÂMERA. Escreva a FOTO que existe, nomeando as três coisas que um fotógrafo precisaria para ir até lá:
  • SUJEITO — quem ou o quê aparece, e o que essa pessoa está fazendo;
  • LUGAR — onde, com o nome do lugar ou da cidade;
  • LUZ — a hora do dia ou a luz da cena.
Exemplo que passa: "galpão de logística em Suzano no fim da tarde, operador de empilhadeira conferindo caixas, luz baixa entrando pelo portão".
Exemplo que NÃO passa: "a confiança de quem encontra uma vaga validada" — isso é um conceito, não uma foto. Conceito não tem lugar nem hora, e o gerador de imagem só sabe resolvê-lo com símbolo, ícone e cor chapada: a peça sai desenho vetorial e é reprovada no portão de pixel, depois de já ter sido paga.
É CONFERIDO EM CÓDIGO, antes de qualquer geração: direção sem os três sinais não vira imagem e volta para você (\`lib/agency/design/direcao-fotografavel.ts\`). Nada de "estilo moderno", "cores vibrantes" ou "transmitindo profissionalismo" — nada disso é fotografável.
${formato("Legendas Prontas — <negócio>", `"format": "feed|story|reel|carrossel", "pillar": "o pilar de conteúdo desta peça", "headline": "...", "caption": "legenda pronta", "visual": "a direção de arte: SUJEITO fazendo algo, no LUGAR, sob a LUZ tal", "cenas": "só para carrossel: 1) [gancho] tela 1 · 2) [tensao] tela 2 · 3) [acao] ..."`)}`,
      },
      {
        id: "social-roteiro-video",
        label: "Roteiro de vídeo",
        deliverableType: "video",
        // VÍDEO E REEL NÃO ENTRAM NO PLANO (decisão do CEO, 25/08/2026): a casa
        // não edita vídeo, e vender o roteiro sozinho é a dívida de D-0A3 —
        // promessa sem produtor. Ele só roda para quem contratou reel de forma
        // explícita; para todo o resto, nem é escalado e não custa nada.
        soQuando: (c) => (c.escopoContratado?.excluidos.includes("reel") === false)
          && (c.escopoContratado?.pecasPorMes ?? 0) > 0
          && /reel|v[ií]deo/i.test(c.services.join(" ")),
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

O CAMPO "direction" É A DIREÇÃO DE ARTE, E ELE VIRA O PEDIDO À CÂMERA. É CONFERIDO EM CÓDIGO (\`lib/agency/design/direcao-fotografavel.ts\`) ANTES de qualquer imagem ser paga: direção que não descreve uma foto não vira imagem e volta para você reescrever. Escreva a FOTO que existe, numa destas duas famílias:
  A) CENA DE AMBIENTE — SUJEITO (quem aparece e o que está fazendo) + LUGAR (onde, com nome) + LUZ (a hora do dia ou a luz da cena).
     ex.: "galpão de logística em Suzano no fim da tarde, operador conferindo caixas, luz baixa entrando pelo portão"
  B) TOMADA CONTROLADA (close-up de produto), quando a peça é sobre uma COISA — diga o ENQUADRAMENTO FECHADO com todas as letras ("close-up de", "macro de", "detalhe de", "primeiro plano de"), o que aparece ATRÁS (fundo, superfície, estúdio, bancada) e a LUZ.
     ex.: "macro do disco de freio desgastado sobre a bancada, fundo desfocado cinza escuro, luz fria de fluorescente da oficina"
A LUZ É OBRIGATÓRIA NAS DUAS FAMÍLIAS. Nada de "estilo moderno", "cores vibrantes", "visual limpo e premium" ou "imagem bonita do produto" — nada disso é fotografável, e o gerador resolve tudo isso com símbolo, ícone e cor chapada.
${formato("Criativos de Social — <negócio>", `"headline": "nome da peça", "direction": "a direção de arte: a FOTO que existe, com sujeito/lugar/luz ou enquadramento/fundo/luz", "palette": "cores desta peça", "note": "texto que entra na arte"`)}`,
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

/** Um contexto MÍNIMO, para quem confere um contrato fora do motor (testes,
 *  ferramentas). Escopo não declarado = a régua histórica com a lacuna dita. */
const CTX_SEM_CONTRATO: Ctx = {
  businessName: "", segment: "", targetAudience: "", tone: "",
  services: [], objectives: [], strategyHeadline: "",
  hasBrandAssets: false, hasRawMaterial: false, criandoIdentidade: false,
  materiaisEntregues: [], escopoContratado: escopoNaoDeclarado(),
};

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
  /** O contexto do cliente. É por ele que o contrato de SAÍDA passa a derivar do
   *  contrato de ENTRADA (`Ctx.escopoContratado`). Ausente = a régua histórica
   *  da casa, com a lacuna nomeada — nunca um número inventado. */
  c?: Ctx,
): { cumpriu: boolean; violacoes: string[] } {
  if (!esp.contrato) return { cumpriu: true, violacoes: [] };
  let violacoes: string[];
  try {
    violacoes = esp.contrato(data, c ?? CTX_SEM_CONTRATO);
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
