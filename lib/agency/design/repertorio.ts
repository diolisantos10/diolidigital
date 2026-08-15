// repertorio.ts — O CÉREBRO CRIATIVO DE UMA MARCA.
//
// ── O PEDIDO (CEO, 07/08/2026), verbatim ────────────────────────────────────
//
// "Eu não quero que você copie, não quero que o design olhe e faça igual. Eu
// quero que ele ENTENDA sobre estilo, sobre sofisticação, sobre um design de
// alto nível, com camadas, com storytelling, com coisas que chamam atenção
// porque a gente vive no mundo de imagem."
//
// "Ele precisa criar um cérebro ou um repertório criativo pra cada marca."
//
// ── POR QUE ISTO NÃO É UMA PASTA DE IMAGENS ─────────────────────────────────
//
// Banco de imagem ensina a COPIAR, que é exatamente o que ele proibiu. Uma
// entrada de repertório aqui é sempre TRÊS COISAS JUNTAS:
//
//   • a PEÇA — a composição que ela usa e o bloco de produto que ela carrega;
//   • a RAZÃO — por que dividiu em curva, por que é clara, por que o mockup
//     entra ali. Sem a razão, a próxima peça imita o formato e perde o motivo;
//   • o RESULTADO, quando existir dado real. Quando não existir, o campo fica
//     vazio e a falta é declarada. Número sem origem não entra.
//
// E toda entrada carrega PROCEDÊNCIA obrigatória. Entrada sem procedência é
// gosto da agência virando regra da marca do cliente — e o motor a RECUSA, não
// a aceita com aviso. Aceitar "com aviso" é aceitar: quem produz não lê avisos.
//
// ── AS TRÊS CAMADAS DO CÉREBRO ──────────────────────────────────────────────
//
//   1. REPERTÓRIO — peça + razão + resultado.
//   2. AMPLITUDE  — os extremos PERMITIDOS, declarados. "Democrática: transita
//      do boteco ao bistrô, e isso é proposital." Sem isso, variedade vira
//      incoerência e coerência vira molde. Hoje o sistema sabe "a cor é
//      laranja" e não sabe disso.
//   3. FORMATOS   — os formatos daquele produto, cada um com a régua própria de
//      storyboard. Formato novo entra como DADO, nunca como `if`.
//
// ── ESTE ARQUIVO É PURO ─────────────────────────────────────────────────────
//
// Sem banco, rede ou IA. O material persistido (BrandBrain, o Drive por cliente
// que o especialista `google` está construindo) entra por `montarCerebro`, que
// valida ANTES de deixar aquilo virar decisão de arte.

import type { ReguaDeStoryboard } from "./storyboard";
import { REGUAS } from "./storyboard";

/**
 * A COMPOSIÇÃO: onde o texto mora dentro da peça.
 *
 * A lista é fechada porque cada valor existe no CSS de `molde.ts`. Composição
 * em texto livre seria o cérebro pedindo um layout que ninguém sabe rasterizar
 * — e a peça sairia no layout antigo, em silêncio.
 *
 * Os nomes vêm do diagnóstico das peças de referência do CEO (07/08/2026): elas
 * DIVIDEM A TELA (um lado é campo sólido com o texto, o outro é foto), em corte
 * reto ou em CURVA — e a curva é assinatura forte daquele repertório.
 */
export type Composicao =
  /** Foto cheia + degradê por baixo do texto. Era a ÚNICA que existia até
   *  07/08/2026 — e foi ela que produziu as 36 telas iguais da Foocci. */
  | "foto-cheia"
  /** Campo sólido com o texto, foto na outra metade, divisão RETA. */
  | "dividido-reto"
  /** O mesmo, com a divisão em CURVA. */
  | "dividido-curva";

export const COMPOSICOES: Composicao[] = ["foto-cheia", "dividido-reto", "dividido-curva"];

export function composicaoValida(v: string | null | undefined): Composicao | null {
  const s = (v ?? "").trim();
  return (COMPOSICOES as string[]).includes(s) ? (s as Composicao) : null;
}

/**
 * O bloco de produto que a peça carrega, quando carrega.
 *
 * Os quatro tipos são os de `mockup.ts` — a biblioteca que já existe, com a
 * trava que já vale: **captura real ou selo de ilustração na peça**, e número
 * sem origem declarada não vira pixel. O repertório aponta para ela e NÃO a
 * afrouxa: aqui se declara qual bloco aquele papel pede; quem confere
 * procedência e origem continua sendo `montarMockup`.
 */
export type BlocoDeProduto = "celular" | "painel" | "conversa" | "numeros";

const BLOCOS: BlocoDeProduto[] = ["celular", "painel", "conversa", "numeros"];

export function blocoValido(v: string | null | undefined): BlocoDeProduto | null {
  const s = (v ?? "").trim();
  return (BLOCOS as string[]).includes(s) ? (s as BlocoDeProduto) : null;
}

/**
 * Uma entrada do repertório: peça + razão + resultado.
 *
 * `razao` é plural de propósito. Uma peça boa raramente é boa por um motivo só,
 * e é o CONJUNTO de motivos que ensina — não a foto.
 */
export interface PecaDeRepertorio {
  id: string;
  /** O que a peça faz, em uma linha. */
  descricao: string;
  composicao: Composicao;
  /** POR QUE ela é assim. Vazio = a entrada é RECUSADA. Sem o porquê, o
   *  repertório vira banco de imagem, e banco de imagem ensina a copiar. */
  razao: string[];
  /** Em que papéis de storyboard esta peça funciona. É o que liga o repertório
   *  à trava: a escolha de layout passa a ser derivada da FUNÇÃO da tela. */
  funcoes: string[];
  /** O bloco de produto que este papel pede, se pedir. A trava de mockup
   *  continua valendo por cima — este campo é pedido, não permissão. */
  bloco?: BlocoDeProduto | null;
  /**
   * Como ela performou. **Só dado real do cliente.**
   *
   * Ausente é o estado normal e honesto. Preencher com estimativa seria
   * exatamente a promessa de número que esta casa proíbe.
   */
  resultado?: { metrica: string; valor: string; origem: string } | null;
  /** De onde veio esta entrada. Obrigatória. */
  procedencia: string;
}

/**
 * A AMPLITUDE de uma marca: os extremos permitidos, declarados.
 *
 * "A gente é uma marca democrática, então a gente não pode parecer sempre que é
 * um restaurante de luxo, mas em algum momento a gente tem que pôr um
 * restaurante de luxo também." (CEO, 07/08/2026)
 *
 * Um eixo, dois extremos, e a permissão ESCRITA de transitar entre eles. Sem
 * este objeto, o sistema só sabe "a cor é laranja" — e aí ou repete a mesma
 * peça (coerência virando molde) ou varia sem critério (variedade virando
 * incoerência).
 */
export interface EixoDeAmplitude {
  /** O nome do eixo: "formalidade", "preço percebido", "temperatura". */
  eixo: string;
  extremoA: string;
  extremoB: string;
  /** Por que os dois extremos são permitidos NESTA marca. */
  porque: string;
  /** O que fica FORA dos extremos — o que a marca nunca é. Vazio é vazio:
   *  sem isso declarado, nada é proibido por este eixo. */
  foraDaMarca?: string[];
  procedencia: string;
}

/**
 * Um formato de produto: a régua de storyboard mais o que ele pode desenhar.
 *
 * É por aqui que a revistinha semanal entra sem virar gambiarra — ela é um
 * `FormatoDeProduto` novo, com régua própria e composições próprias. Nenhum
 * `if` de motor sabe que ela existe.
 */
export interface FormatoDeProduto {
  id: string;
  label: string;
  /** Com que frequência ele roda. Texto livre porque quem cobra é o calendário. */
  cadencia: string;
  /** A régua de storyboard deste formato. */
  regua: ReguaDeStoryboard;
  /** As composições que este formato pode usar. Fora daqui, não desenha. */
  composicoesPermitidas: Composicao[];
  procedencia: string;
}

/** O cérebro criativo de UMA marca. */
export interface CerebroCriativo {
  marca: string;
  repertorio: PecaDeRepertorio[];
  amplitude: EixoDeAmplitude[];
  formatos: FormatoDeProduto[];
  /**
   * O que este cérebro NÃO sabe.
   *
   * Sobe junto com toda peça produzida a partir dele — lacuna que ninguém lê
   * não é lacuna declarada. Cérebro vazio é estado legítimo; cérebro genérico
   * inventado pela agência não é.
   */
  lacunas: string[];
}

// ─── A montagem, com a procedência como porta ───────────────────────────────

export interface EntradaRecusada {
  id: string;
  motivo:
    | "sem_procedencia"
    | "sem_razao"
    | "composicao_desconhecida"
    | "resultado_sem_origem"
    | "regua_desconhecida";
  detalhe: string;
}

export interface CerebroMontado {
  cerebro: CerebroCriativo;
  recusadas: EntradaRecusada[];
}

/**
 * Monta o cérebro de uma marca a partir de entradas brutas. Nunca lança.
 *
 * RECUSA em vez de avisar. Entrada sem procedência, sem razão, com composição
 * que o molde não sabe desenhar ou com resultado sem origem NÃO entra no
 * repertório: vira `EntradaRecusada`, com o motivo dito.
 */
export function montarCerebro(input: {
  marca: string;
  repertorio?: Array<Partial<PecaDeRepertorio>>;
  amplitude?: Array<Partial<EixoDeAmplitude>>;
  formatos?: Array<Partial<FormatoDeProduto> & { reguaId?: string }>;
}): CerebroMontado {
  const recusadas: EntradaRecusada[] = [];
  const marca = (input.marca ?? "").trim();

  const repertorio: PecaDeRepertorio[] = [];
  for (const [i, bruta] of (input.repertorio ?? []).entries()) {
    const id = (bruta.id ?? `peça ${i + 1}`).trim();
    const procedencia = (bruta.procedencia ?? "").trim();
    if (!procedencia) {
      recusadas.push({
        id,
        motivo: "sem_procedencia",
        detalhe: `a entrada "${id}" não diz de onde veio. Repertório sem procedência é o gosto da agência virando regra da marca do cliente.`,
      });
      continue;
    }
    const razao = (bruta.razao ?? []).map((r) => r.trim()).filter(Boolean);
    if (razao.length === 0) {
      recusadas.push({
        id,
        motivo: "sem_razao",
        detalhe: `a entrada "${id}" não diz POR QUE é assim. Sem a razão, o repertório vira banco de imagem — e banco de imagem ensina a copiar, que é o que o CEO proibiu.`,
      });
      continue;
    }
    const composicao = composicaoValida(bruta.composicao);
    if (!composicao) {
      recusadas.push({
        id,
        motivo: "composicao_desconhecida",
        detalhe: `a entrada "${id}" pede a composição "${bruta.composicao ?? "(nenhuma)"}", que o molde não sabe desenhar. Conhecidas: ${COMPOSICOES.join(", ")}.`,
      });
      continue;
    }
    // Resultado é opcional — mas resultado SEM ORIGEM não existe. É a mesma
    // regra da trava de mockup: número sem origem declarada não vira pixel, e
    // aqui também não vira aprendizado.
    const r = bruta.resultado;
    if (r && !(r.origem ?? "").trim()) {
      recusadas.push({
        id,
        motivo: "resultado_sem_origem",
        detalhe: `a entrada "${id}" traz o resultado "${r.metrica}: ${r.valor}" sem dizer de onde veio. Número sem origem declarada não entra no repertório.`,
      });
      continue;
    }
    repertorio.push({
      id,
      descricao: (bruta.descricao ?? "").trim(),
      composicao,
      razao,
      funcoes: (bruta.funcoes ?? []).map((f) => f.trim()).filter(Boolean),
      bloco: blocoValido(bruta.bloco),
      resultado: r ?? null,
      procedencia,
    });
  }

  const amplitude: EixoDeAmplitude[] = [];
  for (const [i, bruta] of (input.amplitude ?? []).entries()) {
    const id = (bruta.eixo ?? `eixo ${i + 1}`).trim();
    if (!(bruta.procedencia ?? "").trim()) {
      recusadas.push({
        id,
        motivo: "sem_procedencia",
        detalhe: `o eixo de amplitude "${id}" não diz de onde veio. Declarar o que a marca do cliente PODE ser é decisão dele, não da agência.`,
      });
      continue;
    }
    if (!(bruta.porque ?? "").trim()) {
      recusadas.push({
        id,
        motivo: "sem_razao",
        detalhe: `o eixo "${id}" não diz por que os dois extremos são permitidos.`,
      });
      continue;
    }
    amplitude.push({
      eixo: id,
      extremoA: (bruta.extremoA ?? "").trim(),
      extremoB: (bruta.extremoB ?? "").trim(),
      porque: bruta.porque!.trim(),
      foraDaMarca: (bruta.foraDaMarca ?? []).map((s) => s.trim()).filter(Boolean),
      procedencia: bruta.procedencia!.trim(),
    });
  }

  const formatos: FormatoDeProduto[] = [];
  for (const [i, bruta] of (input.formatos ?? []).entries()) {
    const id = (bruta.id ?? `formato ${i + 1}`).trim();
    if (!(bruta.procedencia ?? "").trim()) {
      recusadas.push({ id, motivo: "sem_procedencia", detalhe: `o formato "${id}" não diz de onde veio.` });
      continue;
    }
    const regua = bruta.regua ?? (bruta.reguaId ? REGUAS[bruta.reguaId] : undefined);
    if (!regua) {
      recusadas.push({
        id,
        motivo: "regua_desconhecida",
        detalhe: `o formato "${id}" não tem régua de storyboard. Formato sem régua é formato sem conferência — e sem conferência a peça volta a ser "só imagens". Réguas conhecidas: ${Object.keys(REGUAS).join(", ")}.`,
      });
      continue;
    }
    const permitidas = (bruta.composicoesPermitidas ?? [])
      .map((c) => composicaoValida(c))
      .filter((c): c is Composicao => !!c);
    formatos.push({
      id,
      label: (bruta.label ?? id).trim(),
      cadencia: (bruta.cadencia ?? "").trim(),
      regua,
      // Formato sem composição declarada usa TODAS as que o molde sabe: é o
      // estado "ainda não decidimos", não uma proibição inventada.
      composicoesPermitidas: permitidas.length > 0 ? permitidas : [...COMPOSICOES],
      procedencia: bruta.procedencia!.trim(),
    });
  }

  const lacunas: string[] = [];
  if (repertorio.length === 0) lacunas.push("repertório de peças com razão declarada");
  if (amplitude.length === 0) lacunas.push("amplitude da marca (os extremos permitidos)");
  if (formatos.length === 0) lacunas.push("formatos de produto com régua própria");

  return { cerebro: { marca, repertorio, amplitude, formatos, lacunas }, recusadas };
}

/** O cérebro vazio — declarado como vazio. Nunca um cérebro genérico. */
export function cerebroVazio(marca: string): CerebroCriativo {
  return montarCerebro({ marca }).cerebro;
}

// ─── O que o cérebro decide ─────────────────────────────────────────────────

export interface EscolhaDeComposicao {
  composicao: Composicao;
  bloco: BlocoDeProduto | null;
  /** As razões da entrada escolhida, para o registro da peça. */
  porque: string;
  /** O id da entrada de repertório que decidiu. */
  fonte: string;
}

/**
 * A composição desta tela, dado o papel que ela cumpre.
 *
 * É AQUI que o cérebro deixa de ser documentação e vira mecanismo: a tela 3 de
 * um carrossel para de usar o mesmo layout da tela 1 porque o layout passa a
 * ser derivado do PAPEL, consultado no repertório DAQUELA marca.
 *
 * Devolve `null` quando o repertório não cobre o papel — e quem chama cai no
 * `foto-cheia` DECLARANDO que caiu. Escolher uma composição "que combina" seria
 * a agência decidindo o repertório do cliente sozinha.
 */
export function composicaoParaFuncao(
  cerebro: CerebroCriativo,
  funcao: string | null | undefined,
  formatoId?: string | null,
): EscolhaDeComposicao | null {
  const f = (funcao ?? "").trim();
  if (!f) return null;

  const formato = formatoId ? cerebro.formatos.find((x) => x.id === formatoId) : undefined;
  const permitidas = formato ? new Set(formato.composicoesPermitidas) : null;

  const candidatas = cerebro.repertorio.filter(
    (p) => p.funcoes.includes(f) && (!permitidas || permitidas.has(p.composicao)),
  );
  if (candidatas.length === 0) return null;

  // A que TEM resultado real ganha da que não tem. Não é ranking de gosto: é
  // dar precedência ao que foi medido no cliente sobre o que foi só descrito.
  const escolhida = candidatas.find((p) => p.resultado && p.resultado.origem) ?? candidatas[0]!;
  return {
    composicao: escolhida.composicao,
    bloco: escolhida.bloco ?? null,
    porque: escolhida.razao.join(" · "),
    fonte: escolhida.id,
  };
}

/**
 * O ID do formato "post simples de feed" no cérebro de uma marca.
 *
 * É o contrato entre o registro (`repertorio-registrado.ts`) e o motor
 * (`artes.ts`). Uma constante, e não uma string solta em dois arquivos, porque
 * foi exatamente essa desconexão que produziu o defeito de 15/08: o CityJobs
 * declara `post-simples-de-feed → composicoesPermitidas: ["dividido-reto"]`,
 * com o comentário de que foto-cheia "viraria a mesma peça 60 vezes por mês", e
 * o post simples continuava saindo em `foto-cheia` — a proibida — porque
 * `composicaoParaFuncao` só era chamada nos três caminhos de CARROSSEL
 * (`artes.ts`, `recompor-carrossel.ts`).
 */
export const ID_DO_POST_SIMPLES = "post-simples-de-feed";

/**
 * O PAPEL que um pilar de conteúdo cumpre, resolvido contra o repertório DA
 * MARCA — nunca inventado.
 *
 * O pilar é texto livre de LLM ("bastidor da região", "chamada de comunidade"),
 * e o repertório declara funções curtas ("bastidor", "comunidade"). Casar os
 * dois por igualdade estrita nunca casaria nada. Casar por SUBSTRING da forma
 * normalizada casa — e só casa com função que a marca DECLAROU, o que é o
 * limite que importa: a agência não inventa papel nenhum, ela reconhece o que o
 * cliente já registrou.
 *
 * Devolve `null` quando nada casa. Null é null: quem chama declara que caiu no
 * padrão, em vez de escolher um papel "que combina".
 */
export function funcaoDeclaradaParaPilar(
  cerebro: CerebroCriativo,
  pilar: string | null | undefined,
): string | null {
  const alvo = (pilar ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!alvo) return null;

  const declaradas = [...new Set(cerebro.repertorio.flatMap((p) => p.funcoes))];
  // A mais LONGA primeiro: "comunidade" antes de "dica", para que um pilar que
  // contenha duas funções resolva pela mais específica em vez de pela ordem em
  // que alguém escreveu o repertório.
  declaradas.sort((a, b) => b.length - a.length);
  for (const f of declaradas) {
    const n = f
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    if (!n) continue;
    if (new RegExp(`(?:^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$| )`).test(alvo)) return f;
  }
  return null;
}

/** Como a composição de uma peça foi decidida. Sobe junto com a peça: layout
 *  sem procedência é layout que ninguém consegue auditar depois. */
export type OrigemDaComposicao =
  /** Uma entrada de repertório da marca cobriu o papel desta peça. */
  | "repertorio"
  /** O repertório não cobriu o papel, mas o FORMATO declara o que é permitido —
   *  e a peça sai na primeira permitida, não na proibida. */
  | "formato"
  /** A marca não registrou formato nenhum: `foto-cheia`, como sempre foi. */
  | "padrao-da-casa";

export interface EscolhaDeComposicaoDeclarada extends EscolhaDeComposicao {
  origem: OrigemDaComposicao;
}

/**
 * A composição de um POST SIMPLES — o formato que é o volume da casa.
 *
 * ── POR QUE ELA NÃO PODE SER `composicaoParaFuncao` DIRETO ──────────────────
 *
 * `composicaoParaFuncao` devolve `null` quando o repertório não cobre o papel, e
 * os três chamadores de carrossel caem em `"foto-cheia"` declarando que caíram.
 * No post simples esse fallback é o BUG: para o CityJobs, `foto-cheia` é
 * justamente a composição que o formato PROÍBE. Cair no default aqui é violar a
 * regra escrita da marca em silêncio, 60 vezes por mês.
 *
 * Então a ordem é: (1) o repertório, pelo papel; (2) o que o FORMATO permite;
 * (3) só então o padrão da casa — e só quando a marca não declarou formato
 * nenhum, que é o caso em que não há regra para violar.
 */
export function composicaoDoPostSimples(
  cerebro: CerebroCriativo,
  pilar: string | null | undefined,
): EscolhaDeComposicaoDeclarada {
  const formato = cerebro.formatos.find((f) => f.id === ID_DO_POST_SIMPLES);
  const funcao = funcaoDeclaradaParaPilar(cerebro, pilar);

  const doRepertorio = composicaoParaFuncao(cerebro, funcao, ID_DO_POST_SIMPLES);
  if (doRepertorio) return { ...doRepertorio, origem: "repertorio" };

  const permitida = formato?.composicoesPermitidas[0];
  if (permitida) {
    return {
      composicao: permitida,
      bloco: null,
      porque:
        `o repertório desta marca não cobre o pilar "${(pilar ?? "").trim() || "(não declarado)"}", ` +
        `mas o formato "${formato!.id}" só permite ${formato!.composicoesPermitidas.join(", ")} — ` +
        "a peça sai na primeira permitida, e nunca numa que o formato proíbe.",
      fonte: formato!.id,
      origem: "formato",
    };
  }

  return {
    composicao: "foto-cheia",
    bloco: null,
    porque:
      "esta marca não registrou o formato de post simples: a peça sai na composição base da casa (foto cheia), " +
      "que é o comportamento anterior a 15/08/2026.",
    fonte: "",
    origem: "padrao-da-casa",
  };
}

/**
 * As instruções de amplitude para o prompt da FOTO.
 *
 * Cérebro sem amplitude devolve string vazia — e aí o prompt simplesmente não
 * fala de amplitude. Vazio é vazio.
 */
export function direcaoDeAmplitude(cerebro: CerebroCriativo): string {
  if (cerebro.amplitude.length === 0) return "";
  const linhas = cerebro.amplitude.map((a) => {
    const fora = (a.foraDaMarca ?? []).length > 0 ? ` NUNCA: ${a.foraDaMarca!.join(", ")}.` : "";
    return `${a.eixo}: transita de "${a.extremoA}" a "${a.extremoB}" — ${a.porque}${fora}`;
  });
  return `Amplitude declarada desta marca (os extremos são PERMITIDOS e propositais, não desvios): ${linhas.join(" | ")}`;
}

/** O formato de produto por id. `null` quando a marca não tem esse formato —
 *  nunca o formato de outra marca. */
export function formatoDoCerebro(
  cerebro: CerebroCriativo,
  formatoId: string | null | undefined,
): FormatoDeProduto | null {
  const id = (formatoId ?? "").trim();
  if (!id) return null;
  return cerebro.formatos.find((f) => f.id === id) ?? null;
}
