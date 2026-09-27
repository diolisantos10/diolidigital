// calendario-editorial.ts — O CEO PEDE O MÊS, A IA PROPÕE, O CLIENTE APROVA.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA FUNÇÃO FAZ, E O QUE ELA NÃO FAZ
// ═══════════════════════════════════════════════════════════════════════════
//
// Gera o calendário editorial de Instagram de UM cliente para UM mês — SÓ EM
// TEXTO (decisão do CEO, 27/09/2026): por post, pilar, tema, rascunho de
// legenda e direção de arte. Passa cada legenda pelas MESMAS travas da última
// porta de publicação (`publicacao.ts`) e grava cada peça como `SocialPost` em
// `"draft"`, fase `"pauta"` (ver `MARCADOR_FASE_PAUTA` abaixo) — proposta em
// texto, sem arte ainda. A ROTINA SEMANAL (`semana-editorial.ts`) é quem
// finaliza a legenda e manda desenhar a arte, uma semana de cada vez.
//
// Esta função NÃO abre o card de aprovação, NÃO publica e, desde 27/09/2026,
// NÃO desenha arte nenhuma — nem para a peça que nasce aqui.
//
// ═══════════════════════════════════════════════════════════════════════════
// O PACOTE DA MARCA MANDA NA FORMA; A FICHA (OU O DNA) MANDA NO CONTEÚDO
// ═══════════════════════════════════════════════════════════════════════════
//
// `lerPacote(cliente.pacoteJson)` decide QUANTOS posts, EM QUE DIAS, A QUE
// HORA (Brasília), EM QUE FORMATO e sobre QUAL PILAR — de forma determinística
// e ANTES de qualquer chamada de IA. Sem pacote, a função recusa com
// `"preciso do pacote da marca"` (código `"sem_pacote"`) sem gastar um token.
//
// `postsPorSemana`/`horario` DEIXARAM DE SER PARÂMETRO desta função (decisão
// deste bloco, 27/09/2026): duas fontes de verdade sobre "quantas vezes por
// semana" — o corpo da requisição E o pacote — divergem no primeiro cliente
// que tiver as duas configuradas diferente, e ninguém saberia qual valeu. O
// pacote manda sozinho; quem quiser mudar a cadência muda o pacote.
//
// `dna?: DnaDaMarca` é OPCIONAL e, quando presente, PREVALECE sobre a ficha de
// marca — inclusive satisfazendo a exigência dela: cliente sem ficha mas com
// DNA gera calendário normalmente. Quem preenche o DNA é outro bloco (1B); esta
// função só sabe usá-lo quando alguém o entrega pronto.
//
// ═══════════════════════════════════════════════════════════════════════════
// A IDEMPOTÊNCIA E A FASE — POR QUE `scriptJson`, E NÃO UMA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════
//
// `scriptJson` ("AI video/reel script") é o único campo JSON da tabela sem
// LEITOR nenhum antes deste arquivo — confirmado por busca no repositório
// inteiro. Ele grava `{"origemGerador":"<MARCADOR_DE_ORIGEM>","mes":"AAAA-MM","fase":"pauta"}`.
// A idempotência do MÊS consulta `scriptJson CONTAINS MARCADOR_DE_ORIGEM` e
// depois confere `scriptJson.mes === "AAAA-MM"` — o mês PEDIDO, nunca a janela
// de datas da consulta (27/09/2026: um slot no fim do mês em Brasília pode
// cair, em UTC, no mês seguinte; se a idempotência confiasse na janela, a
// peça "vazada" do mês anterior seria vista como se já tivesse gerado o mês
// seguinte, e este viria com ZERO peças, em silêncio — bug medido e corrigido
// nesta data). A janela de datas (`inicioMes`/`fimMes`) segue existindo, mas
// serve só para achar horários já ocupados. A exclusão do relógio de arte
// global (`execution/artes.ts`) consulta `scriptJson CONTAINS
// MARCADOR_FASE_PAUTA` — uma peça em fase "pauta" não tem texto final nem
// direito a arte ainda. A rotina semanal, ao finalizar, regrava `scriptJson`
// com `"fase":"final"`, e a partir daí a peça é uma peça como outra qualquer.
//
// ═══════════════════════════════════════════════════════════════════════════
// REELS SEM VÍDEO BRUTO NÃO ENTRAM NA FILA
// ═══════════════════════════════════════════════════════════════════════════
//
// Esta casa NÃO gera vídeo do zero — só corta vídeo bruto do cliente
// (`editarParaReel`, `lib/agency/media/video.ts`). Antes de gastar uma
// chamada de IA com um slot que o pacote marcou como Reels, confere-se se
// existe vídeo bruto do cliente no banco (`MediaAsset`, `kind: "inbound"`,
// `mimeType` começando em `"video/"` — não existe um modelo `MaterialDoCliente`
// no schema; este é o mais próximo, e cobre tanto o que o cliente sobe direto
// no portal quanto o que chega pelo Google Drive e já foi importado). Sem
// vídeo, o slot NUNCA chama IA: vai direto para `pendentes`, com o motivo
// `"preciso de vídeo do cliente"`, e nenhum `SocialPost` nasce para ele — nem
// como rascunho marcado, para não existir um estado que o relógio de arte ou
// o de publicação possam pegar por engano.
//
// STORY, ao contrário: já sai suportada de ponta a ponta (9:16) — o molde já
// tem as medidas de story (`lib/agency/design/molde.ts:108`), `artes.ts:462-464`
// já gera em proporção retrato para este formato, e `publishPost`
// (`lib/integrations/meta/client.ts:169-179`) já publica STORIES, imagem ou
// vídeo. Story do pacote segue o caminho normal, sem tratamento especial.
//
// ═══════════════════════════════════════════════════════════════════════════
// AS TRAVAS, NA ENTRADA — NUNCA "GRAVA E CONFERE DEPOIS"
// ═══════════════════════════════════════════════════════════════════════════
//
// Cada legenda (já com as hashtags no fim, como o texto que vai ao ar) passa
// por `conferirDataDaPeca`, `frasesDeDirecaoInterna` e `conferirPilar` — a
// mesma esteira de sempre. O PILAR final gravado é o que o PACOTE atribuiu a
// este slot (distribuição proporcional ao peso, determinística —
// `distribuirPilares`), não o que a IA devolveu: o pacote é a fonte da
// verdade sobre "quem fala de quê"; a IA só escreve o texto. Quando o pacote
// não declara pilar nenhum, cai no que a IA devolveu, como sempre foi.

import "server-only";

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { proximaDataLivre } from "@/lib/agency/esteira/publicacao";
import { conferirDataDaPeca, NOME_DO_DIA, type DiaDaSemana } from "@/lib/agency/esteira/calendario-do-cliente";
import { frasesDeDirecaoInterna, motivoDaDirecaoInterna } from "@/lib/agency/esteira/direcao-interna";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { lerPacote, type PacoteDaMarca, type StoriesDoPacote } from "@/lib/agency/esteira/pacote-da-marca";
import { conferirPromocaoNoFormato } from "@/lib/agency/esteira/promocao-so-em-stories";

/** O dono desta chamada de IA, registrado em `lib/ai/donos.ts`. */
const AGENT_ID = "esteira-calendario-editorial";

/** A marca de origem gravada em `SocialPost.scriptJson`. */
export const MARCADOR_DE_ORIGEM = "calendario-editorial-v1";

/**
 * A marca de FASE gravada em `SocialPost.scriptJson` enquanto a peça é só
 * texto (sem legenda final, sem arte). `execution/artes.ts` a exclui da rodada
 * GLOBAL — ver o cabeçalho e `ehFasePauta` abaixo. Exportada para que
 * `artes.ts` e a rotina semanal leiam a MESMA string, nunca uma cópia.
 */
export const MARCADOR_FASE_PAUTA = '"fase":"pauta"';

/** `true` quando o `scriptJson` de um post ainda está em fase de PAUTA — texto
 *  proposto, sem legenda final e sem arte. Função pura, sem banco. */
export function ehFasePauta(scriptJson: string | null | undefined): boolean {
  return (scriptJson ?? "").includes(MARCADOR_FASE_PAUTA);
}

/** O campo `"mes"` ("AAAA-MM") que esta função grava em `scriptJson` — `null`
 *  se ausente ou se o JSON estiver quebrado. A IDEMPOTÊNCIA decide por ESTE
 *  valor, nunca pela janela de datas da consulta que trouxe a linha (ver o
 *  cabeçalho do arquivo): a janela pode conter uma peça de OUTRO mês (um slot
 *  de fim de mês em Brasília cai, em UTC, no mês seguinte) e confiar nela
 *  faria o mês seguinte parecer "já gerado" quando na verdade é vazio. */
function mesDoScriptJson(scriptJson: string | null | undefined): string | null {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    return o && typeof o.mes === "string" ? o.mes : null;
  } catch {
    return null;
  }
}

const MES_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type CodigoDeRecusaDoCalendario =
  | "mes_invalido"
  | "cliente_nao_encontrado"
  | "sem_pacote"
  | "sem_ficha_de_marca"
  | "ia_falhou";

export interface PostDoCalendarioGerado {
  id: string;
  scheduledFor: Date;
}

export interface PecaBarradaDoCalendario {
  /** A data (AAAA-MM-DD) que ficou sem post. */
  dia: string;
  /** Motivo, em português de gente — a mesma frase da trava que barrou. */
  motivo: string;
}

/** Um slot que o PACOTE pediu e que não virou post — nunca por falha da IA,
 *  sempre por falta de um INSUMO que só o cliente tem (hoje: vídeo bruto de
 *  Reels). Nenhum `SocialPost` nasce para estes dias. */
export interface PendenteDoCalendario {
  dia: string;
  motivo: string;
}

export type ResultadoDoCalendarioEditorial =
  | {
      ok: true;
      criados: number;
      jaExistiam: number;
      posts: PostDoCalendarioGerado[];
      barradas: PecaBarradaDoCalendario[];
      pendentes: PendenteDoCalendario[];
    }
  | { ok: false; motivo: string; codigo: CodigoDeRecusaDoCalendario };

/** A assinatura de `generate()` — usada como tipo da injeção `gerar`, para o
 *  teste substituir o provedor de IA sem mockar o módulo inteiro. */
export type GeradorDeIA = (
  opcoes: Parameters<typeof generate>[0],
) => ReturnType<typeof generate>;

/**
 * O DNA DA MARCA — tipo mínimo, preenchido por outro bloco (1B). Aqui só se
 * define o contrato e como ele PREVALECE sobre a ficha; a origem do dado
 * (BrandBrain, brand book, o que vier) não é problema desta função.
 */
export interface DnaDaMarca {
  tomDeVoz?: string;
  pilares?: string[];
  paleta?: string[];
  estilos?: string[];
  melhoresHorarios?: string[];
  observacoes?: string;
}

export interface ParametrosDoCalendarioEditorial {
  workspaceId: string;
  clientId: string;
  /** "AAAA-MM". */
  mes: string;
  /** Injeção do provedor de IA — só para teste. Ausente = `generate` de verdade. */
  gerar?: GeradorDeIA;
  /** Opcional. Presente e não vazio, PREVALECE sobre a ficha de marca — ver o
   *  cabeçalho do arquivo. */
  dna?: DnaDaMarca;
}

// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA COMO A IA DEVOLVE, E COMO ELA VIRA CAPTION
// ─────────────────────────────────────────────────────────────────────────────

interface PecaGeradaPelaIA {
  pilar: string;
  tema: string;
  legenda: string;
  hashtags: string[];
  direcaoDeArte: string;
}

/** Valida a forma mínima de uma peça devolvida pela IA. `null` = descartável —
 *  quem chama trata como "este dia não veio" e tenta a regeneração única. */
function pecaValidaOuNula(x: unknown): PecaGeradaPelaIA | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.pilar !== "string" || typeof o.legenda !== "string") return null;
  const hashtags = Array.isArray(o.hashtags)
    ? o.hashtags.filter((h): h is string => typeof h === "string")
    : [];
  return {
    pilar: o.pilar,
    tema: typeof o.tema === "string" ? o.tema : "",
    legenda: o.legenda,
    hashtags,
    direcaoDeArte: typeof o.direcaoDeArte === "string" ? o.direcaoDeArte : "",
  };
}

/** Hashtags SEMPRE no fim da legenda — nunca em campo próprio (o schema não
 *  tem um), nunca embutidas no meio do texto. */
function legendaComHashtags(peca: PecaGeradaPelaIA): string {
  const tags = peca.hashtags
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const legenda = peca.legenda.trim();
  return tags ? `${legenda}\n\n${tags}` : legenda;
}

type VereditoDePeca =
  | { ok: true; caption: string; peca: PecaGeradaPelaIA; pilarFinal: string }
  | { ok: false; motivo: string };

/**
 * AS MESMAS TRAVAS DA ÚLTIMA PORTA (`publicacao.ts`), NA ENTRADA.
 *
 * `pilarAlvo` é o pilar que o PACOTE atribuiu a este slot (pode ser `""`
 * quando o pacote não declara pilar nenhum) — é ele que decide o pilar
 * gravado E o pilar conferido contra o bloqueio de risco, porque é ele que
 * vira `SocialPost.pillar`. A IA continua devolvendo `pilar` (compatibilidade
 * e fallback para quando não há pilar no pacote), mas não manda mais.
 *
 * `formato` (CEO, 27/09/2026) decide a trava de PROMOÇÃO SÓ EM STORIES
 * (`conferirPromocaoNoFormato`, `promocao-so-em-stories.ts`): confere caption
 * E direção de arte — as duas viram pixel ou letra na peça, e as duas podem
 * carregar preço riscado, "%", "off" etc.
 */
function conferirPeca(peca: PecaGeradaPelaIA, data: Date, pilarAlvo: string, formato: FormatoDoPostGerado): VereditoDePeca {
  if (!peca.legenda || peca.legenda.trim().length < 20) {
    return { ok: false, motivo: "a legenda ficou curta demais para virar post" };
  }
  if (/PRECISO CONFIRMAR/i.test(peca.legenda)) {
    return {
      ok: false,
      motivo:
        'a legenda confessa falta de dado ("PRECISO CONFIRMAR") — não vai ao ar sem a informação real do cliente',
    };
  }
  const caption = legendaComHashtags(peca);

  const internas = frasesDeDirecaoInterna(caption);
  if (internas.length > 0) {
    return { ok: false, motivo: motivoDaDirecaoInterna(internas) };
  }

  // ── PROMOÇÃO SÓ EM STORIES (CEO, 27/09/2026) ────────────────────────────
  // "story" passa sempre — é o lugar dela. Feed/carousel/reel com marcador de
  // promoção (preço riscado, "%", "off", "promoção", "desconto", "queima",
  // "liquidação") é barrado aqui, e regenera 1x como qualquer outra trava.
  const vereditoDePromocao = conferirPromocaoNoFormato({
    formato,
    texto: `${caption}\n${peca.direcaoDeArte}`,
  });
  if (!vereditoDePromocao.passa) {
    return { ok: false, motivo: vereditoDePromocao.motivo };
  }

  const conferenciaDeData = conferirDataDaPeca({ texto: caption, agendadaPara: data });
  if (!conferenciaDeData.passa) {
    return { ok: false, motivo: conferenciaDeData.motivo };
  }

  const pilarFinal = pilarAlvo.trim() || peca.pilar;

  // `exigido: true`: esta é esteira automática — o mesmo raciocínio de
  // `publicacao.ts` para `agendarPostsDaEntrega`.
  const vereditoDoPilar = conferirPilar(pilarFinal, { exigido: true });
  if (vereditoDoPilar.bloqueado) {
    return { ok: false, motivo: motivoCurto(vereditoDoPilar) };
  }

  return { ok: true, caption, peca, pilarFinal };
}

// ─────────────────────────────────────────────────────────────────────────────
// O PACOTE — dias, horários, formatos e pilares viram SLOTS determinísticos
// ─────────────────────────────────────────────────────────────────────────────

export type FormatoDoPostGerado = "feed" | "carousel" | "reel" | "story";

/** feed_imagem→"feed", carrossel→"carousel", reels→"reel", stories→"story". */
export const MAPA_FORMATO_DO_PACOTE: Record<PacoteDaMarca["formatos"][number], FormatoDoPostGerado> = {
  feed_imagem: "feed",
  carrossel: "carousel",
  reels: "reel",
  stories: "story",
};

export const FORMATO_LEGIVEL: Record<FormatoDoPostGerado, string> = {
  feed: "Feed", carousel: "Carrossel", reel: "Reels", story: "Story",
};

/** Uma segunda-feira, para ancorar o número da semana — qualquer segunda serve,
 *  o que importa é que todas as datas usem a MESMA âncora. */
const SEGUNDA_DE_ANCORAGEM_MS = Date.UTC(1970, 0, 5);

/** O dia da semana (0=dom..6=sáb) desta data CIVIL em Brasília, sem depender do
 *  fuso do processo: meio-dia UTC cai sempre dentro do mesmo dia civil em
 *  Brasília (UTC-3), então `getUTCDay()` do meio-dia é a resposta certa. */
export function diaDaSemanaBrasilia(ano: number, mesIndex: number, dia: number): number {
  return new Date(Date.UTC(ano, mesIndex, dia, 12, 0, 0)).getUTCDay();
}

/** O número da semana (Brasília, semana começando segunda), para aplicar o
 *  teto de `postsPorSemana` — determinístico e sem depender de biblioteca. */
export function semanaBrasilia(ano: number, mesIndex: number, dia: number): number {
  const meioDia = Date.UTC(ano, mesIndex, dia, 12, 0, 0);
  return Math.floor((meioDia - SEGUNDA_DE_ANCORAGEM_MS) / (7 * 24 * 60 * 60_000));
}

/** Converte "HH:MM" Brasília para o instante UTC daquele dia civil. Brasília é
 *  UTC-3 sem horário de verão desde 2019 (`America/Sao_Paulo`) — converter é
 *  somar 3 horas; `Date.UTC` normaliza sozinho quando isso vira o dia seguinte. */
export function horaBrasiliaParaUtc(hhmm: string, ano: number, mesIndex: number, dia: number): Date {
  const [hh, mm] = hhmm.split(":").map((n) => Number(n) || 0);
  return new Date(Date.UTC(ano, mesIndex, dia, (hh ?? 10) + 3, mm ?? 0, 0, 0));
}

/**
 * A meia-noite BRASÍLIA (UTC-3, sem horário de verão) deste dia civil, como
 * instante UTC — usada em TUDO que decide "qual dia" uma peça pertence.
 * NUNCA `new Date(ano, mesIndex, dia)` local/UTC crua: meia-noite UTC é 21h
 * Brasília do dia ANTERIOR, e um slot às 22h Brasília do último dia do mês
 * (`horaBrasiliaParaUtc`, +3h) cairia fora da janela do mês que gerou ele.
 * `Date.UTC` normaliza `mesIndex`/`dia` fora do intervalo do mês, então
 * "mesIndex + 1, dia 1" cai certo mesmo virando o ano.
 */
export function meiaNoiteBrasilia(ano: number, mesIndex: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesIndex, dia, 3, 0, 0, 0));
}

/**
 * O dia civil EM BRASÍLIA (ano, mesIndex, dia) deste instante UTC — o inverso
 * de `meiaNoiteBrasilia`: desloca -3h e lê os campos UTC do resultado, como
 * `civilBrasilia` de `semana-editorial.ts`.
 */
export function diaCivilBrasilia(instante: Date): { ano: number; mesIndex: number; dia: number } {
  const brt = new Date(instante.getTime() - 3 * 60 * 60_000);
  return { ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate() };
}

/**
 * Distribui `quantidade` posts entre os pilares, PROPORCIONAL ao peso e
 * DETERMINÍSTICO (método do maior resto — sem aleatoriedade, sem depender de
 * ordem de iteração do banco). Pilares sem peso declarado (todos `peso: 0`)
 * dividem em partes iguais, em vez de zerar todo mundo.
 *
 * Pura, exportada para ser provada sem pacote nenhum no banco.
 */
export function distribuirPilares(
  pilares: readonly { nome: string; peso: number }[],
  quantidade: number,
): string[] {
  if (quantidade <= 0 || pilares.length === 0) return [];
  const pesosBrutos = pilares.map((p) => Math.max(0, p.peso));
  const semPesoDeclarado = pesosBrutos.every((p) => p === 0);
  const pesos = semPesoDeclarado ? pilares.map(() => 1) : pesosBrutos;
  const total = pesos.reduce((s, p) => s + p, 0);
  const bruto = pesos.map((p) => (p / total) * quantidade);
  const contagem = bruto.map(Math.floor);
  let atribuidos = contagem.reduce((a, b) => a + b, 0);
  const porResto = bruto
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; atribuidos < quantidade; k++) {
    contagem[porResto[k % porResto.length]!.i]! += 1;
    atribuidos++;
  }
  const ordemPorContagem = pilares.map((_, i) => i).sort((a, b) => contagem[b]! - contagem[a]! || a - b);
  const restantes = [...contagem];
  const saida: string[] = [];
  while (saida.length < quantidade) {
    for (const i of ordemPorContagem) {
      if (restantes[i]! > 0) {
        restantes[i]! -= 1;
        saida.push(pilares[i]!.nome);
      }
      if (saida.length >= quantidade) break;
    }
  }
  return saida;
}

/** O tipo de um STORY nascido do bloco `pacote.stories` (CEO, 27/09/2026) —
 *  ver `gerarSlotsDeStoriesDoPacote`. Ausente (`undefined`, em `SlotDoCalendario`)
 *  em qualquer slot que NÃO veio deste bloco (feed/carousel/reel/story "solto"
 *  do pacote normal). */
export type TipoDeStory = "combo" | "reciclado" | "repost";

export interface SlotDoCalendario {
  data: Date;
  formato: FormatoDoPostGerado;
  /** `""` quando o pacote não declara pilar nenhum — a IA decide sozinha. */
  pilarAlvo: string;
  /** Só em STORY do bloco `pacote.stories` — grava em `scriptJson.tipo`. */
  tipoStory?: TipoDeStory;
  /** Só em STORY "reciclado" com material do cliente já encontrado —
   *  `/api/media/{id}` do `MediaAsset` que a peça referencia direto. Setado
   *  já na CRIAÇÃO do post (não espera o relógio de arte): `execution/artes.ts`
   *  só toca post com `mediaUrl: null`, então isto o exclui de lá por
   *  construção, e não por uma segunda trava para lembrar de escrever. */
  mediaUrlReciclado?: string;
}

/**
 * O PACOTE, TRADUZIDO EM SLOTS — dias × horários × postsPorDia, cortados no
 * teto de `postsPorSemana` e datados nunca antes de `minimoDia`. Determinístico:
 * mesmo pacote, mesmo mês, mesmos slots, sempre.
 *
 * `minimoDia` e cada dia candidato são comparados como MEIA-NOITE BRASÍLIA
 * (`meiaNoiteBrasilia`), nunca dia civil local/UTC cru — a mesma régua da
 * janela do mês, e pelo mesmo motivo: um dia decidido em UTC puro pode
 * divergir do dia Brasília que o pacote (`dias`, `horarios`) descreve.
 */
export function gerarSlotsDoPacote(args: {
  ano: number;
  mesIndex: number;
  pacote: PacoteDaMarca;
  minimoDia: Date;
  horariosOcupados: ReadonlySet<number>;
}): SlotDoCalendario[] {
  const { ano, mesIndex, pacote, minimoDia, horariosOcupados } = args;
  const diasValidos = new Set(pacote.dias);
  const horarios = pacote.horarios.length > 0 ? pacote.horarios : ["10:00"];
  const formatosPacote = pacote.formatos.length > 0 ? pacote.formatos : (["feed_imagem"] as const);
  // `Math.max(0, ...)` — NÃO `Math.max(1, ...)`: desde 27/09/2026 uma marca SÓ
  // DE STORIES (`pacote.stories` + `formatos === ["stories"]`) declara
  // `postsPorDia`/`postsPorSemana` como 0 DE PROPÓSITO (schema em
  // `pacote-da-marca.ts` permite). Forçar mínimo 1 aqui geraria um post
  // "fantasma" de formato pacote por semana, em cima do que o bloco
  // `pacote.stories` já gera — a mesma marca produzindo pelos DOIS caminhos.
  // `|| 0` cobre só o caso defensivo de `NaN`/campo ausente, nunca o de zero
  // explícito.
  const postsPorDia = Math.max(0, Math.floor(pacote.postsPorDia) || 0);
  const tetoPorSemana = Math.max(0, Math.floor(pacote.postsPorSemana) || 0);
  // Contagem de dias do mês — sem fuso nenhum envolvido, então UTC crua serve.
  const totalDiasDoMes = new Date(Date.UTC(ano, mesIndex + 1, 0)).getUTCDate();

  const candidatos: Array<{ dia: number; slotNoDia: number }> = [];
  for (let dia = 1; dia <= totalDiasDoMes; dia++) {
    if (!diasValidos.has(diaDaSemanaBrasilia(ano, mesIndex, dia))) continue;
    const candidatoDia = meiaNoiteBrasilia(ano, mesIndex, dia);
    if (candidatoDia.getTime() < minimoDia.getTime()) continue;
    for (let slot = 0; slot < postsPorDia; slot++) candidatos.push({ dia, slotNoDia: slot });
  }

  const porSemana = new Map<number, number>();
  const aceitos: Array<{ dia: number; slotNoDia: number }> = [];
  for (const c of candidatos) {
    const wk = semanaBrasilia(ano, mesIndex, c.dia);
    const usados = porSemana.get(wk) ?? 0;
    if (usados >= tetoPorSemana) continue;
    porSemana.set(wk, usados + 1);
    aceitos.push(c);
  }

  const pilarPorIndice = distribuirPilares(pacote.pilares ?? [], aceitos.length);

  const saida: SlotDoCalendario[] = [];
  for (let i = 0; i < aceitos.length; i++) {
    const c = aceitos[i]!;
    const horario = horarios[c.slotNoDia % horarios.length]!;
    const data = horaBrasiliaParaUtc(horario, ano, mesIndex, c.dia);
    if (horariosOcupados.has(data.getTime())) continue;
    const formatoPacote = formatosPacote[i % formatosPacote.length]!;
    saida.push({
      data,
      formato: MAPA_FORMATO_DO_PACOTE[formatoPacote] ?? "feed",
      pilarAlvo: pilarPorIndice[i] ?? "",
    });
  }
  return saida;
}

// ─────────────────────────────────────────────────────────────────────────────
// O PACOTE DE STORIES (CEO, 27/09/2026) — combo, reciclado, repost
// ─────────────────────────────────────────────────────────────────────────────
//
// `pacote.stories` é um SEGUNDO gerador de slots, independente de
// `gerarSlotsDoPacote` acima: ele não olha `formatos`/`postsPorDia`/
// `postsPorSemana`/`horarios` — tem a própria faixa (`porDiaMin..porDiaMax`),
// o próprio horário de início e o próprio intervalo. Os dois convivem: uma
// marca pode ter feed pelo caminho de cima E stories por este daqui (o caso
// misto), ou só stories (o caso do Sushi Cazza, onde o caminho de cima produz
// ZERO slots — ver o comentário sobre `postsPorDia`/`postsPorSemana` acima).

/** Um dia em que a quantidade PEDIDA de stories não coube antes de 23:59:59.999
 *  Brasília e foi REDUZIDA — nunca descartada em silêncio. */
export interface DiaComStoriesReduzidas {
  /** AAAA-MM-DD, o dia que sofreu o corte. */
  dia: string;
  motivo: string;
}

export interface SlotDeStoryBruto {
  data: Date;
  tipoStory: TipoDeStory;
}

/**
 * O bloco `pacote.stories`, traduzido em slots — um por dia de `diasValidos`
 * (o mesmo `pacote.dias`), na quantidade que cabe entre `aPartirDe` e 23:59:59
 * Brasília, espaçados por `intervaloMinimoMin`.
 *
 * QUANTIDADE, determinística e SEM `Math.random`: um rodízio simples pelo dia
 * do mês dentro da faixa `[porDiaMin, porDiaMax]` — o mesmo pacote, o mesmo
 * mês, sempre os mesmos números.
 *
 * TIPO de cada slot: os primeiros `combosMinPorDia` são sempre "combo"; o
 * resto cicla pela `mistura` declarada, na ordem em que ela foi escrita.
 *
 * Pura — sem banco, sem IA. Quem decide o que um tipo "repost"/"reciclado"
 * PRODUZ (pendente, ou post com material) é `gerarCalendarioEditorial`, não
 * esta função: aqui só existe a AGENDA.
 */
export function gerarSlotsDeStoriesDoPacote(args: {
  ano: number;
  mesIndex: number;
  stories: StoriesDoPacote;
  diasValidos: readonly number[];
  minimoDia: Date;
}): { slots: SlotDeStoryBruto[]; reduzidas: DiaComStoriesReduzidas[] } {
  const { ano, mesIndex, stories, diasValidos, minimoDia } = args;
  const diasSet = new Set(diasValidos);
  const totalDiasDoMes = new Date(Date.UTC(ano, mesIndex + 1, 0)).getUTCDate();
  const rangeSize = Math.max(1, stories.porDiaMax - stories.porDiaMin + 1);
  const intervaloMs = Math.max(1, stories.intervaloMinimoMin) * 60_000;

  const slots: SlotDeStoryBruto[] = [];
  const reduzidas: DiaComStoriesReduzidas[] = [];

  for (let dia = 1; dia <= totalDiasDoMes; dia++) {
    if (!diasSet.has(diaDaSemanaBrasilia(ano, mesIndex, dia))) continue;
    const meiaNoite = meiaNoiteBrasilia(ano, mesIndex, dia);
    if (meiaNoite.getTime() < minimoDia.getTime()) continue;

    const quantidadePedida = stories.porDiaMin + (dia % rangeSize);
    const inicio = horaBrasiliaParaUtc(stories.aPartirDe, ano, mesIndex, dia);
    // 23:59:59.999 Brasília deste MESMO dia civil — a meia-noite Brasília do
    // dia SEGUINTE, menos 1ms (a mesma régua da janela do mês, no cabeçalho).
    const fimDoDiaBrasilia = new Date(meiaNoiteBrasilia(ano, mesIndex, dia + 1).getTime() - 1);

    const cabem = Math.max(0, Math.floor((fimDoDiaBrasilia.getTime() - inicio.getTime()) / intervaloMs) + 1);
    const quantidade = Math.min(quantidadePedida, cabem);
    if (quantidade < quantidadePedida) {
      reduzidas.push({
        dia: isoDoDia(meiaNoite),
        motivo:
          `pedido ${quantidadePedida} stories a partir de ${stories.aPartirDe} com intervalo de ` +
          `${stories.intervaloMinimoMin}min, mas só ${quantidade} cabem antes de 23:59 Brasília — reduzido.`,
      });
    }
    if (quantidade === 0) continue;

    const tipos: TipoDeStory[] = [];
    for (let i = 0; i < quantidade; i++) {
      if (i < stories.combosMinPorDia) {
        tipos.push("combo");
        continue;
      }
      const idx = (i - stories.combosMinPorDia) % stories.mistura.length;
      tipos.push(stories.mistura[idx]!);
    }

    for (let i = 0; i < quantidade; i++) {
      slots.push({ data: new Date(inicio.getTime() + i * intervaloMs), tipoStory: tipos[i]! });
    }
  }

  return { slots, reduzidas };
}

/** O pilar gravado num slot de STORY, por tipo — nunca `""`: `conferirPeca`
 *  chama `conferirPilar` com `exigido: true` (esteira automática), e pilar
 *  ausente REPROVA (ver `pilares-bloqueados.ts`). Prefere o nome que a marca já
 *  declarou em `pacote.pilares` ("combo"/"produto", o caso do Sushi Cazza);
 *  sem um pilar daquele nome, cai no primeiro pilar declarado, e só na falta de
 *  QUALQUER pilar usa o nome do próprio tipo como último recurso. */
function pilarParaTipoDeStory(
  tipo: "combo" | "reciclado",
  pilares: PacoteDaMarca["pilares"],
): string {
  const alvo = tipo === "combo" ? "combo" : "produto";
  const porNome = pilares.find((p) => p.nome.trim().toLowerCase() === alvo)?.nome;
  return porNome ?? pilares[0]?.nome ?? tipo;
}

/** Os materiais do cliente que servem para RECICLAR um story — `MediaAsset`
 *  `kind: "inbound"` (o cliente que mandou), imagem OU vídeo. A mesma classe
 *  de material que `existeVideoBrutoDoCliente` confere para Reels, mas aqui
 *  sem o filtro de vídeo: reciclar aceita imagem também (é um REPOST do que o
 *  cliente já mandou, não uma edição). Ordenado por `createdAt` para o
 *  rodízio entre vários stories "reciclado" no mesmo mês ser determinístico. */
async function materiaisParaReciclar(clientId: string): Promise<Array<{ id: string }>> {
  return prisma.mediaAsset
    .findMany({
      where: {
        clientId,
        kind: "inbound",
        OR: [{ mimeType: { startsWith: "image/" } }, { mimeType: { startsWith: "video/" } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })
    .catch(() => [] as Array<{ id: string }>);
}

/** Existe vídeo BRUTO deste cliente no banco? Não há modelo `MaterialDoCliente`
 *  no schema desta casa — o mais próximo é `MediaAsset` com `kind: "inbound"`
 *  (o cliente que mandou, não a IA que gerou) e `mimeType` de vídeo. Cobre o
 *  que chega direto pelo portal e o que chega pelo Drive (que também vira
 *  `MediaAsset` depois de importado — ver `material-do-drive.ts`). */
async function existeVideoBrutoDoCliente(clientId: string): Promise<boolean> {
  const achado = await prisma.mediaAsset
    .findFirst({
      where: { clientId, kind: "inbound", mimeType: { startsWith: "video/" } },
      select: { id: true },
    })
    .catch(() => null);
  return !!achado;
}

// ─────────────────────────────────────────────────────────────────────────────
// A CHAMADA DE IA — um lote (todas as datas) e, se preciso, uma regeneração
// pontual (uma data só, com o motivo da recusa anterior).
// ─────────────────────────────────────────────────────────────────────────────

interface ContextoDeGeracao {
  nomeDoNegocio: string;
  segmento: string;
  marcaTexto: string;
}

function isoDoDia(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** O texto do DNA da marca, no MESMO papel que o texto do contrato de marca —
 *  é isto que "prevalece sobre a ficha" quer dizer na prática: o que chega a
 *  quem produz é este bloco, não o contrato lido do banco. */
function textoDoDna(dna: DnaDaMarca): string {
  const partes: string[] = ["DNA DA MARCA (prevalece sobre a ficha — obedeça isto)"];
  if (dna.tomDeVoz) partes.push(`Tom de voz: ${dna.tomDeVoz}`);
  if (dna.pilares && dna.pilares.length > 0) partes.push(`Pilares de conteúdo: ${dna.pilares.join(", ")}`);
  if (dna.paleta && dna.paleta.length > 0) partes.push(`Paleta: ${dna.paleta.join(", ")}`);
  if (dna.estilos && dna.estilos.length > 0) partes.push(`Estilos visuais: ${dna.estilos.join(", ")}`);
  if (dna.melhoresHorarios && dna.melhoresHorarios.length > 0) {
    partes.push(`Melhores horários (referência): ${dna.melhoresHorarios.join(", ")}`);
  }
  if (dna.observacoes) partes.push(`Observações: ${dna.observacoes}`);
  return partes.join("\n");
}

function montarSystemPrompt(): string {
  return (
    "Você é o redator de social media de uma agência de marketing brasileira, responsável pelo " +
    "calendário editorial de Instagram de um cliente. Escreva legendas PRONTAS PARA PUBLICAR, em " +
    "português do Brasil, falando diretamente com o público do cliente — NUNCA descreva a peça em " +
    'terceira pessoa ("post que destaca...", "carrossel mostrando...") e NUNCA inclua instrução de ' +
    "produção dentro da legenda. Você só pode afirmar sobre a marca o que estiver nas REGRAS DA MARCA " +
    "fornecidas — é PROIBIDO inventar serviço, preço, promessa ou fato que não esteja lá. Se a legenda " +
    "citar um dia da semana, ele TEM de ser exatamente o dia da data marcada para aquele post — nunca " +
    "outro dia. O FORMATO e o PILAR de cada data já foram decididos pela agência: escreva tema, legenda " +
    "e direção de arte coerentes com os dois — não é sua tarefa escolher outro pilar. Responda usando a " +
    "ferramenta, com um post por data recebida, na MESMA ORDEM da lista."
  );
}

function montarUserPrompt(
  contexto: ContextoDeGeracao,
  naoConstituida: boolean,
  slots: readonly SlotDoCalendario[],
): string {
  const linhasDeData = slots
    .map((s) => {
      const nomeDoDia = NOME_DO_DIA[s.data.getUTCDay() as DiaDaSemana];
      const pilar = s.pilarAlvo ? ` — pilar: ${s.pilarAlvo}` : "";
      return `- ${isoDoDia(s.data)} (${nomeDoDia}), formato: ${FORMATO_LEGIVEL[s.formato]}${pilar}`;
    })
    .join("\n");
  const blocoDeMarca = naoConstituida
    ? "ATENÇÃO: a marca deste cliente ainda não constituiu regra suficiente. Escreva peças genéricas " +
      "de bom conteúdo de social media, SEM inventar identidade, serviço ou promessa que não conste " +
      "de um briefing.\n\n"
    : `REGRAS DA MARCA (obedeça — nunca afirme o que não está aqui):\n${contexto.marcaTexto}\n\n`;
  return (
    `Cliente: ${contexto.nomeDoNegocio}${contexto.segmento ? ` (${contexto.segmento})` : ""}\n\n` +
    blocoDeMarca +
    `Gere um post para CADA uma destas datas, nesta ordem:\n${linhasDeData}\n\n` +
    "Cada post tem: pilar de conteúdo (use o pilar já indicado quando houver um), tema, legenda " +
    "(pronta para publicar), de 3 a 6 hashtags (sem o símbolo #, só a palavra) e a direção de arte — " +
    "o que a IMAGEM deve mostrar. A direção de arte NUNCA vira texto da legenda."
  );
}

function esquemaDoLote(quantidade: number): Record<string, unknown> {
  const item = {
    type: "object" as const,
    properties: {
      pilar: { type: "string" },
      tema: { type: "string" },
      legenda: { type: "string" },
      hashtags: { type: "array", items: { type: "string" } },
      direcaoDeArte: { type: "string" },
    },
    required: ["pilar", "tema", "legenda", "hashtags", "direcaoDeArte"],
  };
  return {
    type: "object" as const,
    properties: {
      posts: { type: "array", items: item, minItems: quantidade, maxItems: quantidade },
    },
    required: ["posts"],
  };
}

async function gerarLoteDeIA(args: {
  gerar: GeradorDeIA;
  contexto: ContextoDeGeracao;
  naoConstituida: boolean;
  slots: SlotDoCalendario[];
  workspaceId: string;
  clientId: string;
}): Promise<{ ok: true; posts: Array<PecaGeradaPelaIA | null> } | { ok: false; motivo: string }> {
  const r = await args.gerar({
    system: montarSystemPrompt(),
    user: montarUserPrompt(args.contexto, args.naoConstituida, args.slots),
    maxTokens: Math.min(4000, 300 * args.slots.length + 600),
    esquema: esquemaDoLote(args.slots.length),
    workspaceId: args.workspaceId,
    clientId: args.clientId,
    agentId: AGENT_ID,
  });
  if (!r.ok) return { ok: false, motivo: r.error };
  const dados = r.data as { posts?: unknown };
  if (!Array.isArray(dados.posts)) {
    return { ok: false, motivo: 'a IA não devolveu o formato esperado ("posts" ausente)' };
  }
  return { ok: true, posts: dados.posts.map(pecaValidaOuNula) };
}

/** A regeneração ÚNICA de UMA peça que falhou, citando o motivo da recusa. */
async function gerarPecaUnica(args: {
  gerar: GeradorDeIA;
  contexto: ContextoDeGeracao;
  naoConstituida: boolean;
  slot: SlotDoCalendario;
  motivoAnterior: string;
  workspaceId: string;
  clientId: string;
}): Promise<PecaGeradaPelaIA | null> {
  const r = await args.gerar({
    system: montarSystemPrompt(),
    user:
      montarUserPrompt(args.contexto, args.naoConstituida, [args.slot]) +
      `\n\nATENÇÃO: a tentativa anterior para este dia foi RECUSADA porque: ${args.motivoAnterior}. ` +
      "Corrija exatamente isso nesta nova tentativa.",
    maxTokens: 900,
    esquema: esquemaDoLote(1),
    workspaceId: args.workspaceId,
    clientId: args.clientId,
    agentId: AGENT_ID,
  });
  if (!r.ok) return null;
  const dados = r.data as { posts?: unknown };
  if (!Array.isArray(dados.posts) || dados.posts.length === 0) return null;
  return pecaValidaOuNula(dados.posts[0]);
}

/**
 * Gera o calendário editorial de Instagram de um cliente, para um mês — SÓ
 * TEXTO, obedecendo ao pacote da marca.
 *
 * Ver o cabeçalho do arquivo para a ordem das decisões e o porquê de cada uma.
 */
export async function gerarCalendarioEditorial(
  entrada: ParametrosDoCalendarioEditorial,
): Promise<ResultadoDoCalendarioEditorial> {
  const { workspaceId, clientId } = entrada;
  const gerar = entrada.gerar ?? generate;

  const mesMatch = MES_REGEX.exec((entrada.mes ?? "").trim());
  if (!mesMatch) {
    return {
      ok: false,
      motivo: `mês inválido: "${entrada.mes}" — use o formato AAAA-MM`,
      codigo: "mes_invalido",
    };
  }
  const ano = Number(mesMatch[1]);
  const mesIndex = Number(mesMatch[2]) - 1;

  // ── POSSE: o cliente precisa ser DESTE workspace ──────────────────────────
  const cliente = await clienteOuNulo(clientId, { workspaceId });
  if (!cliente) {
    return { ok: false, motivo: "cliente não encontrado neste workspace", codigo: "cliente_nao_encontrado" };
  }

  // A janela do mês em BRASÍLIA (não UTC cru — ver o cabeçalho do arquivo):
  // 00:00 Brasília do dia 1 até 23:59:59.999 Brasília do último dia. Serve SÓ
  // para achar horários já ocupados (`horariosOcupados`, mais abaixo) — a
  // IDEMPOTÊNCIA, logo em seguida, não depende dela.
  const inicioMes = meiaNoiteBrasilia(ano, mesIndex, 1);
  const fimMes = new Date(meiaNoiteBrasilia(ano, mesIndex + 1, 1).getTime() - 1);

  // ── IDEMPOTÊNCIA — PELO MÊS GRAVADO NO MARCADOR, NUNCA PELA JANELA DE DATA ──
  // Ver o cabeçalho do arquivo: um slot de fim de mês em Brasília pode cair,
  // em UTC, no mês seguinte, e uma peça assim — gerada PARA este mês — cairia
  // dentro da JANELA do mês seguinte se a idempotência confiasse na janela. A
  // consulta ao banco ainda filtra por `MARCADOR_DE_ORIGEM` (é dela que sai a
  // lista de candidatas), mas quem decide "já gerei este mês?" é o campo
  // `mes` que a própria rodada gravou — não a data em que a peça calhou de
  // cair.
  const postsDeOrigemDoCliente = await prisma.socialPost
    .findMany({
      where: { workspaceId, clientId, scriptJson: { contains: MARCADOR_DE_ORIGEM } },
      select: { id: true, scheduledFor: true, scriptJson: true },
    })
    .catch(() => [] as Array<{ id: string; scheduledFor: Date | null; scriptJson: string | null }>);

  const jaGerados = postsDeOrigemDoCliente.filter(
    (p) => (p.scriptJson ?? "").includes(MARCADOR_DE_ORIGEM) && mesDoScriptJson(p.scriptJson) === entrada.mes,
  );
  if (jaGerados.length > 0) {
    return {
      ok: true,
      criados: 0,
      jaExistiam: jaGerados.length,
      posts: jaGerados
        .filter((p): p is { id: string; scheduledFor: Date; scriptJson: string | null } => p.scheduledFor !== null)
        .map((p) => ({ id: p.id, scheduledFor: p.scheduledFor })),
      barradas: [],
      pendentes: [],
    };
  }

  // ── O PACOTE DA MARCA — recusa ANTES de chamar a IA, e ANTES da ficha ─────
  const perfil = await prisma.client
    .findUnique({ where: { id: clientId }, select: { name: true, industry: true, pacoteJson: true } })
    .catch(() => null);
  const pacoteLido = lerPacote(perfil?.pacoteJson ?? null);
  if (!pacoteLido.ok) {
    return { ok: false, motivo: "preciso do pacote da marca", codigo: "sem_pacote" };
  }
  const pacote = pacoteLido.pacote;

  // ── A FICHA DE MARCA (OU O DNA, QUE PREVALECE) ────────────────────────────
  let marcaTexto = "";
  let naoConstituida = false;
  if (entrada.dna) {
    marcaTexto = textoDoDna(entrada.dna);
  } else {
    const marca = await contratoDeMarca(clientId).catch(() => null);
    if (!marca || marca.naoConstituida) {
      return {
        ok: false,
        motivo:
          "preciso confirmar a ficha de marca deste cliente antes de gerar o calendário — " +
          (marca && marca.lacunas.length > 0
            ? `ainda faltam: ${marca.lacunas.join(", ")}.`
            : "a marca ainda não declarou regra suficiente."),
        codigo: "sem_ficha_de_marca",
      };
    }
    marcaTexto = marca.texto;
    naoConstituida = marca.naoConstituida;
  }

  // ── OS SLOTS, DO PACOTE ───────────────────────────────────────────────────
  const minimo = await proximaDataLivre(workspaceId, clientId);
  // `minimo` é um instante UTC; o dia que importa é o dia CIVIL EM BRASÍLIA
  // dele, não o dia UTC cru (mesmo raciocínio da janela do mês, acima).
  const minimoCivil = diaCivilBrasilia(minimo);
  const minimoDia = meiaNoiteBrasilia(minimoCivil.ano, minimoCivil.mesIndex, minimoCivil.dia);
  // Horários já ocupados dentro da janela do mês (em Brasília) — só para não
  // colidir agenda; a idempotência já foi decidida lá em cima.
  const existentesDoMes = await prisma.socialPost
    .findMany({
      where: { workspaceId, clientId, scheduledFor: { gte: inicioMes, lte: fimMes } },
      select: { scheduledFor: true },
    })
    .catch(() => [] as Array<{ scheduledFor: Date | null }>);
  const horariosOcupados = new Set(
    existentesDoMes.filter((p) => p.scheduledFor).map((p) => (p.scheduledFor as Date).getTime()),
  );
  const slotsDoMes = gerarSlotsDoPacote({ ano, mesIndex, pacote, minimoDia, horariosOcupados });

  // ── REELS SEM VÍDEO BRUTO NÃO CHAMAM IA — ver o cabeçalho ────────────────
  const pendentes: PendenteDoCalendario[] = [];
  const slots: SlotDoCalendario[] = [];
  const temReelNoMes = slotsDoMes.some((s) => s.formato === "reel");
  const temVideoBruto = temReelNoMes ? await existeVideoBrutoDoCliente(clientId) : false;
  for (const slot of slotsDoMes) {
    if (slot.formato === "reel" && !temVideoBruto) {
      pendentes.push({
        dia: isoDoDia(slot.data),
        motivo:
          "preciso de vídeo do cliente — esta casa não gera Reels do zero, só corta vídeo bruto que o " +
          "cliente enviar. Sem ele, este slot não entra na fila.",
      });
      continue;
    }
    slots.push(slot);
  }

  // ── O PACOTE DE STORIES (CEO, 27/09/2026) — combo, reciclado, repost ────
  //
  // Independente do bloco acima: uma marca SÓ DE STORIES (Sushi Cazza) chega
  // até aqui com `slotsDoMes` VAZIO (o schema permite `postsPorDia: 0` e
  // `gerarSlotsDoPacote` respeita o zero desde 27/09/2026) — é este bloco, e
  // só ele, que produz slots para ela. Por isso o "não há nada a gerar" só é
  // decidido DEPOIS deste bloco, nunca antes.
  if (pacote.stories) {
    const geradoStories = gerarSlotsDeStoriesDoPacote({
      ano, mesIndex, stories: pacote.stories, diasValidos: pacote.dias, minimoDia,
    });
    for (const reduzida of geradoStories.reduzidas) {
      pendentes.push({ dia: reduzida.dia, motivo: reduzida.motivo });
    }

    const combos = geradoStories.slots.filter((s) => s.tipoStory === "combo");
    const repostados = geradoStories.slots.filter((s) => s.tipoStory === "repost");
    const reciclados = geradoStories.slots.filter((s) => s.tipoStory === "reciclado");

    // "repost": NUNCA gera (parecer do `meta` pendente) — direto para
    // pendentes, sem passar por IA nem por material.
    for (const s of repostados) {
      pendentes.push({ dia: isoDoDia(s.data), motivo: "repost aguardando parecer do meta" });
    }

    const pilarCombo = pilarParaTipoDeStory("combo", pacote.pilares);
    for (const s of combos) {
      slots.push({ data: s.data, formato: "story", pilarAlvo: pilarCombo, tipoStory: "combo" });
    }

    // "reciclado": precisa de material existente do cliente (MediaAsset
    // inbound, imagem ou vídeo). Com material, a peça NASCE com `mediaUrl` já
    // apontando para ele (rodízio determinístico entre os materiais
    // disponíveis); sem nenhum, PENDENTE — nunca um post sem imagem.
    if (reciclados.length > 0) {
      const materiais = await materiaisParaReciclar(clientId);
      const pilarReciclado = pilarParaTipoDeStory("reciclado", pacote.pilares);
      reciclados.forEach((s, i) => {
        if (materiais.length === 0) {
          pendentes.push({
            dia: isoDoDia(s.data),
            motivo: "preciso de material do cliente para reciclar",
          });
          return;
        }
        const asset = materiais[i % materiais.length]!;
        slots.push({
          data: s.data,
          formato: "story",
          pilarAlvo: pilarReciclado,
          tipoStory: "reciclado",
          mediaUrlReciclado: `/api/media/${asset.id}`,
        });
      });
    }
  }

  if (slots.length === 0) {
    return { ok: true, criados: 0, jaExistiam: 0, posts: [], barradas: [], pendentes };
  }

  const contexto: ContextoDeGeracao = {
    nomeDoNegocio: perfil?.name || "o cliente",
    segmento: perfil?.industry || "",
    marcaTexto,
  };

  // ── A IA ───────────────────────────────────────────────────────────────────
  const lote = await gerarLoteDeIA({ gerar, contexto, naoConstituida, slots, workspaceId, clientId });
  if (!lote.ok) {
    return { ok: false, motivo: lote.motivo, codigo: "ia_falhou" };
  }

  const criadosPosts: PostDoCalendarioGerado[] = [];
  const barradas: PecaBarradaDoCalendario[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const bruta = lote.posts[i] ?? null;

    let veredito: VereditoDePeca = bruta
      ? conferirPeca(bruta, slot.data, slot.pilarAlvo, slot.formato)
      : { ok: false, motivo: "a IA não devolveu peça para este dia" };

    // Regenera UMA vez, citando o motivo. Falhou de novo → barrada.
    if (!veredito.ok) {
      const motivoOriginal = veredito.motivo;
      const retry = await gerarPecaUnica({
        gerar, contexto, naoConstituida, slot, motivoAnterior: motivoOriginal, workspaceId, clientId,
      });
      veredito = retry
        ? conferirPeca(retry, slot.data, slot.pilarAlvo, slot.formato)
        : { ok: false, motivo: motivoOriginal };
    }

    if (!veredito.ok) {
      barradas.push({ dia: isoDoDia(slot.data), motivo: veredito.motivo });
      continue;
    }

    const post = await prisma.socialPost.create({
      data: {
        workspaceId,
        clientId,
        caption: veredito.caption,
        networks: JSON.stringify(["instagram"]),
        format: slot.formato,
        pillar: veredito.pilarFinal.trim() || null,
        artDirection: veredito.peca.direcaoDeArte.trim() || null,
        scheduledFor: slot.data,
        // "draft": a data é proposta, sem aval — o cliente decide no portal.
        status: "draft",
        // O calendário existe PARA o cliente ver e aprovar (mesma decisão de
        // `publicacao.ts`): sem isto ele não aparece no portal.
        visibility: "compartilhado",
        // "fase":"pauta" — texto proposto, SEM arte ainda. A rotina semanal
        // (`semana-editorial.ts`) regrava para "fase":"final" ao finalizar a
        // legenda e mandar desenhar a arte. `tipo` só existe em STORY do bloco
        // `pacote.stories` (27/09/2026) — "combo"/"reciclado"/"repost" (repost
        // nunca chega aqui: vira pendente antes de existir slot de IA).
        scriptJson: JSON.stringify({
          origemGerador: MARCADOR_DE_ORIGEM,
          mes: entrada.mes,
          fase: "pauta",
          ...(slot.tipoStory ? { tipo: slot.tipoStory } : {}),
        }),
        // STORY "reciclado" já nasce com a mídia do cliente — nunca espera o
        // relógio de arte (`execution/artes.ts` só toca post com
        // `mediaUrl: null`, então isto o exclui de lá por construção).
        ...(slot.mediaUrlReciclado ? { mediaUrl: slot.mediaUrlReciclado } : {}),
      },
      select: { id: true, scheduledFor: true },
    });
    criadosPosts.push({ id: post.id, scheduledFor: post.scheduledFor as Date });
  }

  await prisma.activityEvent
    .create({
      data: {
        workspaceId,
        clientId,
        type: "calendario_editorial_gerado",
        message:
          `Calendário editorial de ${entrada.mes} gerado para ${contexto.nomeDoNegocio}: ` +
          `${criadosPosts.length} rascunho(s) criado(s), ${barradas.length} barrado(s), ` +
          `${pendentes.length} pendente(s) de insumo.`.slice(0, 900),
      },
    })
    .catch(() => { /* best-effort: o registro não pode travar a geração */ });

  return { ok: true, criados: criadosPosts.length, jaExistiam: 0, posts: criadosPosts, barradas, pendentes };
}
