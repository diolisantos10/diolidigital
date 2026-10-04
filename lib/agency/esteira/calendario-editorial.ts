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
//
// ═══════════════════════════════════════════════════════════════════════════
// CARDÁPIO, CARROSSEL EM SEQUÊNCIA, SÉRIES E STORIES DERIVADOS (CEO, 27/09/2026, W12b)
// ═══════════════════════════════════════════════════════════════════════════
//
// Bloco ADITIVO — nada do que já existia acima muda de comportamento sem um
// destes campos opcionais presentes no pacote.
//
//   • COMBO de story: o preço NUNCA vem da IA — `comboParaStory` (`cardapio.ts`)
//     escolhe o combo do `pacote.cardapio` e o nome+preço entram LITERAIS no
//     prompt (`SlotDoCalendario.combo`); `conferirPeca` reprova qualquer
//     legenda cujo preço não bata, byte a byte, com o cadastrado. Sem cardápio
//     cadastrado, o slot vira PENDENTE antes de qualquer chamada de IA — nunca
//     um preço inventado.
//   • "terceiro_autorizado" (ex-"repost"): nunca gera. Pendente nomeando os
//     dois insumos que faltam — autorização guardada e arquivo original.
//   • CARROSSEL do pacote (`pacote.carrossel`, Foocci) e SÉRIES nomeadas
//     (`pacote.series`) são uma segunda linha de produção, INDEPENDENTE da
//     linha de cima: cada carrossel vira N cards (`scenesJson`, um por card),
//     seguindo `SEQUENCIA_DO_CARROSSEL` (`gerarCarrosselUnico`,
//     `processarSlotDeCarrossel`). O card "prova" é conferido contra
//     `pacote.fontesDeProva` (`conferirNumeroComFonte`) — sem fonte, o card
//     regenera como benefício qualitativo e a peça carrega
//     `scriptJson.avisos`; número sem fonte, na segunda tentativa, NUNCA sai
//     (a peça é barrada). Série com `exigeFonte: true` (o caso "Radar") NÃO
//     chama IA aqui — vira só um slot PENDENTE ("Radar: aguardando pauta com
//     fonte"); quem preenche é a rota `POST /api/social-posts/radar`.
//
//     ⚠️ GAP CONHECIDO E DECLARADO: `scenesJson` destes cards é texto PLANO,
//     sem o prefixo `[papel]` que `lib/agency/design/storyboard.ts` exige
//     (`lerTela`/`conferirStoryboard`). O vocabulário de intenção destes cards
//     ("dor"/"transformacao"/"beneficio"/"importancia_do_servico") NÃO existe
//     em `FUNCOES` daquele arquivo, e inventar um mapeamento arriscaria dar
//     direção de imagem ERRADA a um card cujo texto não corresponde ao papel
//     mapeado — pior que não ter o gate. Por isso estas peças nascem com
//     `"fase":"final"` (prontas para a fila de arte de sempre,
//     `execution/artes.ts`), mas `montarCarrossel` vai REPROVAR o storyboard
//     delas (`funcao_nao_declarada`) até que `storyboard.ts` ganhe uma régua
//     própria para `SEQUENCIA_DO_CARROSSEL`. Isto é dívida a resolver por
//     quem for dono de `storyboard.ts`/`artes.ts` — fora do escopo desta ficha.
//   • STORIES DERIVADOS (`pacote.stories.derivados`): "capa_do_post_do_dia"
//     cria, para cada post de feed/carrossel do dia, um story-filho
//     (`scriptJson.tipo === "capa_derivada"`, `dependeDe: <id do pai>`),
//     agendado ≥30min depois do pai. Ele nasce com `"fase":"pauta"` DE
//     PROPÓSITO e PERMANENTEMENTE — não é um estágio transitório: é o único
//     jeito, dentro do escopo desta ficha, de mantê-lo fora da rodada global
//     de `execution/artes.ts` (que já exclui "fase":"pauta" — ver
//     `ehFasePauta` abaixo) sem editar aquele arquivo. `semana-editorial.ts`
//     também o exclui da finalização de legenda pelo mesmo motivo: esta peça
//     nunca tem legenda própria, e a arte dela nasce na hora da publicação
//     (W11), nunca aqui. "reel_do_acervo" ainda não tem acervo (1B) — vira
//     PENDENTE "aguardando acervo", todo dia em que o bloco de stories roda.

import "server-only";

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { proximaDataLivre } from "@/lib/agency/esteira/publicacao";
import { conferirDataDaPeca, NOME_DO_DIA, type DiaDaSemana } from "@/lib/agency/esteira/calendario-do-cliente";
import { frasesDeDirecaoInterna, motivoDaDirecaoInterna } from "@/lib/agency/esteira/direcao-interna";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import {
  lerPacote,
  SEQUENCIA_DO_CARROSSEL,
  type PacoteDaMarca,
  type StoriesDoPacote,
} from "@/lib/agency/esteira/pacote-da-marca";
import { conferirPromocaoNoFormato } from "@/lib/agency/esteira/promocao-so-em-stories";
import { comboParaStory, instrucaoDoCombo, legendaCitaPreco } from "@/lib/agency/esteira/cardapio";
import { conferirNumeroComFonte } from "@/lib/agency/esteira/prova-com-fonte";
import { dnaVigente, type DnaDaMarcaConteudo } from "@/lib/agency/esteira/dna-da-marca";
import { pacoteComUltimaAnaliseAplicada } from "@/lib/agency/esteira/analista-semanal";

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
 * O DNA DA MARCA — o contrato de verdade mora em `dna-da-marca.ts` (bloco
 * 1B-B2, tirado do acervo). Aqui só se usa `DnaDaMarcaConteudo` e como ele
 * PREVALECE sobre a ficha. Reexportado com o nome antigo (`DnaDaMarca`) para
 * não quebrar quem já importava daqui.
 */
export type DnaDaMarca = DnaDaMarcaConteudo;

export interface ParametrosDoCalendarioEditorial {
  workspaceId: string;
  clientId: string;
  /** "AAAA-MM". */
  mes: string;
  /** Injeção do provedor de IA — só para teste. Ausente = `generate` de verdade. */
  gerar?: GeradorDeIA;
  /** Opcional. Presente e não vazio, PREVALECE sobre a ficha de marca — ver o
   *  cabeçalho do arquivo. Ausente = busca o VIGENTE (`dnaVigente(clientId)`);
   *  sem vigente nenhum, cai na ficha de marca como sempre. */
  dna?: DnaDaMarcaConteudo;
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
 *  tem um), nunca embutidas no meio do texto. Pura, reusada pelo carrossel do
 *  pacote/séries (`gerarCarrosselUnico`), que não tem um `PecaGeradaPelaIA`. */
function comHashtags(legenda: string, hashtags: readonly string[]): string {
  const tags = hashtags
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const corpo = legenda.trim();
  return tags ? `${corpo}\n\n${tags}` : corpo;
}

function legendaComHashtags(peca: PecaGeradaPelaIA): string {
  return comHashtags(peca.legenda, peca.hashtags);
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
 *
 * `comboEsperado` (W12b, 27/09/2026): quando o slot é um STORY "combo", o
 * PREÇO é o dado que menos pode sair errado — reprova a peça se o preço
 * literal do `pacote.cardapio` não aparecer, byte a byte, na legenda final.
 */
function conferirPeca(
  peca: PecaGeradaPelaIA,
  data: Date,
  pilarAlvo: string,
  formato: FormatoDoPostGerado,
  comboEsperado?: { nome: string; preco: string },
): VereditoDePeca {
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

  // ── COMBO: O PREÇO NUNCA VEM DA IA (CEO, 27/09/2026) ────────────────────
  if (comboEsperado && !comboEsperado.preco && legendaCitaPreco(caption)) {
    return { ok: false, motivo: "combo sem preço cadastrado, mas a legenda citou um valor — preço não se inventa" };
  }
  if (comboEsperado && comboEsperado.preco && !caption.includes(comboEsperado.preco)) {
    return {
      ok: false,
      motivo:
        `o preço do combo não apareceu exatamente como no cardápio — esperado "${comboEsperado.nome}" ` +
        `com o preço "${comboEsperado.preco}"`,
    };
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
 *  do pacote normal).
 *
 *  "terceiro_autorizado" (W12b, 27/09/2026) é o nome NOVO do que antes se
 *  chamava "repost" — `pacote-da-marca.ts` já lê pacotes antigos com "repost"
 *  e devolve sempre "terceiro_autorizado" (ver `ItemDaMisturaSchema` lá). */
export type TipoDeStory = "combo" | "reciclado" | "terceiro_autorizado";

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
  /** Só em STORY "combo" (`comboParaStory`, `cardapio.ts`) — o combo ESCOLHIDO
   *  para este slot, já com nome+preço literais do `pacote.cardapio`. Entra no
   *  prompt como texto obrigatório (`montarUserPrompt`) e é conferido byte a
   *  byte na legenda final (`conferirPeca`) — o preço NUNCA vem da IA. */
  combo?: { nome: string; preco: string; descricao?: string };
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
/** Intervalo padrão antes de a MESMA arte voltar ao ar (CEO, 03/10/2026). */
export const INTERVALO_PADRAO_DE_REPETICAO_DIAS = 14;

/** Papéis que NUNCA se publicam (CEO, 03/10/2026): "Referências" (inclui post
 *  de concorrente) só orienta o estilo; logo, manual e fonte são insumo da
 *  arte, não peça. Reciclar um deles seria publicar o que não é do cliente,
 *  ou não é post. */
export const PAPEIS_QUE_NUNCA_SE_PUBLICAM = ["referencia", "logo", "manual_de_marca", "fonte", "captura_de_tela"];

export async function materiaisParaReciclar(
  clientId: string,
  agora: Date = new Date(),
  intervaloDias: number = INTERVALO_PADRAO_DE_REPETICAO_DIAS,
): Promise<Array<{ id: string }>> {
  const todos = await prisma.mediaAsset
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
  if (todos.length === 0) return todos;

  // Fail-closed: sem conseguir ler os papéis, NADA recicla — melhor um story
  // a menos do que publicar uma referência de concorrente.
  const proibidas = await prisma.driveMaterial
    .findMany({
      where: { clientId, papel: { in: PAPEIS_QUE_NUNCA_SE_PUBLICAM }, mediaAssetId: { not: null } },
      select: { mediaAssetId: true },
    })
    .catch(() => null);
  if (proibidas === null) return [];
  const bloqueadas = new Set(proibidas.map((p) => p.mediaAssetId!));

  // A MESMA arte não volta antes do intervalo — nem para trás (publicada) nem
  // para frente (já agendada).
  const janelaMs = intervaloDias * 24 * 60 * 60_000;
  const recentes = await prisma.socialPost
    .findMany({
      where: {
        clientId,
        mediaUrl: { startsWith: "/api/media/" },
        scheduledFor: { gte: new Date(agora.getTime() - janelaMs), lte: new Date(agora.getTime() + janelaMs) },
      },
      select: { mediaUrl: true },
    })
    .catch(() => [] as Array<{ mediaUrl: string | null }>);
  for (const r of recentes) if (r.mediaUrl) bloqueadas.add(r.mediaUrl.replace("/api/media/", ""));

  return todos.filter((m) => !bloqueadas.has(m.id));
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

/** O que a peça do plano B NÃO tem e não pode inventar: vira lacuna nomeada. */
export function lacunasDaPecaSemIa(slot: SlotDoCalendario): string[] {
  const l: string[] = [];
  if (slot.tipoStory === "combo") {
    if (!slot.combo?.nome?.trim()) l.push("nome do combo (cadastrar no cardápio)");
    if (!slot.combo?.preco?.trim()) l.push("preço do combo (cadastrar no cardápio)");
    l.push("foto do combo (subir em Material de marca)");
  }
  return l;
}

/** O slot pode nascer sem IA? Só STORY de combo (com combo escolhido do
 *  cardápio) ou reciclado (com a foto real já escolhida). */
export function podeNascerSemIa(slot: SlotDoCalendario): boolean {
  if (slot.formato !== "story") return false;
  if (slot.tipoStory === "combo") return !!slot.combo;
  if (slot.tipoStory === "reciclado") return !!slot.mediaUrlReciclado;
  return false;
}

/**
 * A PEÇA DO MODELO — o plano B sem IA (04/10/2026). Só usa dado cadastrado:
 * nome do negócio, e nome/descrição/preço do combo LITERAIS do cardápio.
 * `null` quando o slot não pode nascer sem IA (quem chama barra com motivo).
 */
export function pecaSemIa(slot: SlotDoCalendario, contexto: ContextoDeGeracao): PecaGeradaPelaIA | null {
  if (!podeNascerSemIa(slot)) return null;
  const negocio = contexto.nomeDoNegocio.trim() || "a casa";
  if (slot.tipoStory === "combo" && slot.combo) {
    const { preco, descricao } = slot.combo;
    // Cardápio vazio chega com nome vazio (`comboParaStory`): "um combo da
    // casa", nunca um nome inventado.
    const nome = slot.combo.nome.trim() || "Um combo da casa";
    const partes = [
      `${nome}${descricao?.trim() ? ` — ${descricao.trim()}` : ""}.`,
      preco ? `Por ${preco}.` : "",
      `Peça o seu no ${negocio}.`,
    ].filter(Boolean);
    return {
      pilar: slot.pilarAlvo,
      tema: nome,
      legenda: partes.join(" "),
      hashtags: [],
      direcaoDeArte: `Story do combo ${nome}: foto real do produto, com o nome${preco ? " e o preço" : ""} em destaque.`,
    };
  }
  return {
    pilar: slot.pilarAlvo,
    tema: "material do cliente",
    legenda: `Hoje tem ${negocio}. Peça o seu e aproveite!`,
    hashtags: [],
    direcaoDeArte: "Story com a foto real do cliente, sem texto sobreposto.",
  };
}

function isoDoDia(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * O texto do DNA da marca, no MESMO papel que o texto do contrato de marca —
 * é isto que "prevalece sobre a ficha" quer dizer na prática: o que chega a
 * quem produz é este bloco, não o contrato lido do banco.
 *
 * Campos em `"preciso confirmar"` (paleta/tipografia/tomDeVoz sem lastro
 * visual — ver `dna-da-marca.ts`) NÃO viram linha: afirmar "preciso
 * confirmar" ao redator é pior que omitir, porque soa como instrução de
 * produto em vez de lacuna de dado.
 */
function textoDoDna(dna: DnaDaMarcaConteudo): string {
  const partes: string[] = ["DNA DA MARCA (prevalece sobre a ficha — obedeça isto)"];
  if (typeof dna.tomDeVoz === "string" && dna.tomDeVoz) partes.push(`Tom de voz: ${dna.tomDeVoz}`);
  if (dna.pilares.length > 0) partes.push(`Pilares de conteúdo: ${dna.pilares.map((p) => p.nome).join(", ")}`);
  if (Array.isArray(dna.paleta) && dna.paleta.length > 0) partes.push(`Paleta: ${dna.paleta.join(", ")}`);
  if (typeof dna.tipografia === "string" && dna.tipografia) partes.push(`Tipografia: ${dna.tipografia}`);
  if (dna.estilosDeLayout.length > 0) {
    partes.push(`Estilos visuais recorrentes: ${dna.estilosDeLayout.map((e) => e.nome).join(", ")}`);
  }
  if (dna.melhoresHorarios.length > 0) {
    partes.push(
      `Melhores horários (referência, medido no acervo): ${dna.melhoresHorarios
        .map((h) => `${NOME_DO_DIA[(h.diaDaSemana % 7) as DiaDaSemana]} ${h.hora}`)
        .join(", ")}`,
    );
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
    "e direção de arte coerentes com os dois — não é sua tarefa escolher outro pilar. Quando uma data " +
    'trouxer "COMBO OBRIGATÓRIO", a legenda TEM que citar o nome e o preço EXATAMENTE como vieram — nunca ' +
    "calcule, arredonde, troque a moeda ou invente outro valor: o preço é dado fixo do cardápio da marca, " +
    "não seu para decidir. Responda usando a ferramenta, com um post por data recebida, na MESMA ORDEM da lista."
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
      const combo = s.combo
        ? ` — ${instrucaoDoCombo(s.combo)}` +
          `${s.combo.descricao ? ` (${s.combo.descricao})` : ""}`
        : "";
      return `- ${isoDoDia(s.data)} (${nomeDoDia}), formato: ${FORMATO_LEGIVEL[s.formato]}${pilar}${combo}`;
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

// ─────────────────────────────────────────────────────────────────────────────
// CARROSSEL EM SEQUÊNCIA — pacote.carrossel (Foocci) e pacote.series (W12b,
// CEO 27/09/2026). Ver o cabeçalho do arquivo para o gap conhecido de
// storyboard/`FUNCOES`.
// ─────────────────────────────────────────────────────────────────────────────

/** O pilar gravado por NOME — prefere o pilar já declarado com este nome
 *  (ex.: a série "Radar Dioli Tech" com um pilar "radar"); sem ele, cai no
 *  primeiro pilar declarado. Nunca `""` (o pacote sempre tem `pilares.min(1)`). */
function pilarParaNome(nomeAlvo: string, pilares: PacoteDaMarca["pilares"]): string {
  const porNome = pilares.find((p) => p.nome.trim().toLowerCase() === nomeAlvo.trim().toLowerCase())?.nome;
  return porNome ?? pilares[0]?.nome ?? nomeAlvo;
}

/** Os dias do mês (1..N) cujo dia da semana em Brasília está em `diasValidos`
 *  e cuja meia-noite Brasília não é anterior a `minimoDia` — a MESMA régua de
 *  `gerarSlotsDoPacote`/`gerarSlotsDeStoriesDoPacote`, fatorada aqui para o
 *  carrossel do pacote e as séries reusarem sem duplicar o laço. */
function diasNoMes(ano: number, mesIndex: number, diasValidos: readonly number[], minimoDia: Date): number[] {
  const diasSet = new Set(diasValidos);
  const totalDiasDoMes = new Date(Date.UTC(ano, mesIndex + 1, 0)).getUTCDate();
  const saida: number[] = [];
  for (let dia = 1; dia <= totalDiasDoMes; dia++) {
    if (!diasSet.has(diaDaSemanaBrasilia(ano, mesIndex, dia))) continue;
    if (meiaNoiteBrasilia(ano, mesIndex, dia).getTime() < minimoDia.getTime()) continue;
    saida.push(dia);
  }
  return saida;
}

/** Um slot BRUTO do carrossel "de sempre" da marca (`pacote.carrossel`) —
 *  só a DATA; quantos cards e em que sequência é decidido por
 *  `processarSlotDeCarrossel`, que recebe a régua do pacote inteira. */
export interface SlotDeCarrosselBruto {
  data: Date;
}

/**
 * O bloco `pacote.carrossel`, traduzido em slots — uma segunda linha de
 * produção, INDEPENDENTE de `postsPorDia`/`postsPorSemana`/`formatos` (o
 * mesmo desenho de `gerarSlotsDeStoriesDoPacote` para `pacote.stories`):
 * `porDia` (padrão 1) carrosséis por dia, nos dias de `diasValidos`, no
 * `horario` já resolvido por quem chama (DNA ou `horarioPadrao`).
 *
 * Com `porDia > 1`, cada carrossel adicional do mesmo dia recebe +1h sobre o
 * horário-base — só para não colidir dois posts no MESMO instante; a casa não
 * declarou uma régua de espaçamento própria para este caso.
 */
export function gerarSlotsDeCarrosselDoPacote(args: {
  ano: number;
  mesIndex: number;
  diasValidos: readonly number[];
  minimoDia: Date;
  porDia: number;
  horario: string;
}): SlotDeCarrosselBruto[] {
  const { ano, mesIndex, diasValidos, minimoDia, horario } = args;
  const porDia = Math.max(1, Math.floor(args.porDia) || 1);
  const saida: SlotDeCarrosselBruto[] = [];
  for (const dia of diasNoMes(ano, mesIndex, diasValidos, minimoDia)) {
    const base = horaBrasiliaParaUtc(horario, ano, mesIndex, dia);
    for (let i = 0; i < porDia; i++) {
      saida.push({ data: new Date(base.getTime() + i * 60 * 60_000) });
    }
  }
  return saida;
}

/**
 * Os PAPÉIS de cada card, na ordem final — a última posição é SEMPRE "cta"
 * (CEO: "CTA escrito na legenda E no último card"), mesmo que a sequência
 * declarada não termine nela. As posições anteriores ciclam pela sequência
 * SEM o "cta" (para não duplicá-lo no meio), na ordem em que a marca a
 * declarou. `dia` (do mês) decide a QUANTIDADE dentro de `[cardsMin,
 * cardsMax]`, de forma determinística — o mesmo rodízio de
 * `gerarSlotsDeStoriesDoPacote`.
 */
export function papeisDoCarrossel(
  cardsMin: number,
  cardsMax: number,
  sequencia: readonly string[],
  dia: number,
): string[] {
  const rangeSize = Math.max(1, cardsMax - cardsMin + 1);
  const n = Math.max(1, cardsMin + (((dia % rangeSize) + rangeSize) % rangeSize));
  const semCta = sequencia.filter((s) => s !== "cta");
  const base = semCta.length > 0
    ? semCta
    : sequencia.length > 0
      ? sequencia
      : SEQUENCIA_DO_CARROSSEL.filter((s) => s !== "cta");
  const papeis: string[] = [];
  for (let i = 0; i < n - 1; i++) papeis.push(base[i % base.length]!);
  papeis.push("cta");
  return papeis;
}

interface ResultadoCarrossel {
  legenda: string;
  hashtags: string[];
  /** O texto de cada card, na MESMA ordem de `papeis` — vira `scenesJson`. */
  cards: string[];
  /** "preciso confirmar..." quando um card de prova foi reescrito sem número
   *  por falta de fonte — grava em `scriptJson.avisos`. */
  avisos: string[];
}

function esquemaDoCarrossel(n: number): Record<string, unknown> {
  return {
    type: "object" as const,
    properties: {
      legenda: { type: "string" },
      hashtags: { type: "array", items: { type: "string" } },
      cards: {
        type: "array",
        items: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
        minItems: n,
        maxItems: n,
      },
    },
    required: ["legenda", "hashtags", "cards"],
  };
}

function montarSystemPromptCarrossel(): string {
  return (
    "Você é o redator de social media de uma agência de marketing brasileira, responsável por UM " +
    "carrossel de Instagram. Escreva em português do Brasil, PRONTO PARA PUBLICAR, falando diretamente " +
    "com o público — nunca em terceira pessoa e nunca com instrução de produção dentro do texto. Só pode " +
    "afirmar sobre a marca o que estiver nas REGRAS DA MARCA fornecidas — é PROIBIDO inventar serviço, " +
    "preço, promessa ou número que não esteja lá. NÚMERO DE PROVA (percentual, multiplicador, valor em " +
    "reais, quantidade com unidade de resultado) só pode aparecer no card de prova se estiver EXATAMENTE " +
    "numa das FONTES DE PROVA fornecidas — sem fonte, escreva esse card em palavras, sem nenhum número " +
    "específico. Cada card segue a INTENÇÃO indicada (dor, transformação, prova, benefício, importância " +
    "do serviço ou CTA), na ordem dada — a última é sempre CTA, e a MESMA chamada para ação do último " +
    "card tem de aparecer também na legenda. Responda usando a ferramenta."
  );
}

function montarUserPromptCarrossel(args: {
  contexto: ContextoDeGeracao;
  naoConstituida: boolean;
  data: Date;
  papeis: readonly string[];
  fontesDeProva: readonly { afirmacao: string; fonte: string }[];
  ctaLiteral?: string;
  instrucaoExtra?: string;
}): string {
  const nomeDoDia = NOME_DO_DIA[args.data.getUTCDay() as DiaDaSemana];
  const blocoDeMarca = args.naoConstituida
    ? "ATENÇÃO: a marca deste cliente ainda não constituiu regra suficiente. Escreva um carrossel " +
      "genérico de bom conteúdo, SEM inventar identidade, serviço ou promessa que não conste de um " +
      "briefing.\n\n"
    : `REGRAS DA MARCA (obedeça):\n${args.contexto.marcaTexto}\n\n`;
  const fontes = args.fontesDeProva.length > 0
    ? `FONTES DE PROVA (só pode citar número que esteja aqui):\n${args.fontesDeProva.map((f) => `- ${f.afirmacao} (fonte: ${f.fonte})`).join("\n")}\n\n`
    : "SEM fontes de prova cadastradas para esta marca — o card de prova NÃO pode citar nenhum número " +
      "específico; escreva-o como benefício qualitativo.\n\n";
  const ctaTexto = args.ctaLiteral
    ? `O CTA já está definido pela marca e TEM que ser usado, literalmente, no último card e na ` +
      `legenda: "${args.ctaLiteral}"\n\n`
    : "";
  const listaDeCards = args.papeis.map((p, i) => `${i + 1}. intenção: ${p}`).join("\n");
  return (
    `Cliente: ${args.contexto.nomeDoNegocio}${args.contexto.segmento ? ` (${args.contexto.segmento})` : ""}\n\n` +
    blocoDeMarca + fontes + ctaTexto +
    `Data: ${isoDoDia(args.data)} (${nomeDoDia}).\n` +
    `Gere UM carrossel com ${args.papeis.length} cards, nesta ordem de intenção:\n${listaDeCards}\n\n` +
    "Devolva a legenda (pronta para publicar), de 3 a 6 hashtags (sem #) e o texto de cada card, na MESMA " +
    "ordem." +
    (args.instrucaoExtra ? `\n\nATENÇÃO: ${args.instrucaoExtra}` : "")
  );
}

/**
 * Gera UM carrossel (legenda + N cards) e confere o card "prova" contra
 * `fontesDeProva` (`conferirNumeroComFonte`) — sem fonte, regenera o
 * carrossel INTEIRO uma vez com instrução explícita para reescrever aquele
 * card como benefício qualitativo. Se o número sem fonte SOBREVIVER à
 * regeneração, a peça é recusada: **número sem fonte nunca sai**, nem na
 * segunda tentativa.
 */
async function gerarCarrosselUnico(args: {
  gerar: GeradorDeIA;
  contexto: ContextoDeGeracao;
  naoConstituida: boolean;
  data: Date;
  papeis: string[];
  fontesDeProva: readonly { afirmacao: string; fonte: string }[];
  ctaLiteral?: string;
  workspaceId: string;
  clientId: string;
}): Promise<{ ok: true; resultado: ResultadoCarrossel } | { ok: false; motivo: string }> {
  const n = args.papeis.length;
  const pedir = (instrucaoExtra?: string) =>
    args.gerar({
      system: montarSystemPromptCarrossel(),
      user: montarUserPromptCarrossel({ ...args, instrucaoExtra }),
      maxTokens: Math.min(4000, 260 * n + 700),
      esquema: esquemaDoCarrossel(n),
      workspaceId: args.workspaceId,
      clientId: args.clientId,
      agentId: AGENT_ID,
    });

  const r = await pedir();
  if (!r.ok) return { ok: false, motivo: r.error };
  const dados = r.data as { legenda?: unknown; hashtags?: unknown; cards?: unknown };
  if (typeof dados.legenda !== "string" || !Array.isArray(dados.cards) || dados.cards.length !== n) {
    return { ok: false, motivo: "a IA não devolveu o carrossel no formato esperado" };
  }
  let cards = (dados.cards as Array<{ texto?: unknown }>).map((c) => (typeof c?.texto === "string" ? c.texto : ""));
  let legenda = dados.legenda;
  const hashtags = Array.isArray(dados.hashtags)
    ? dados.hashtags.filter((h): h is string => typeof h === "string")
    : [];
  const avisos: string[] = [];

  // ── O CARD "prova" — número sem fonte NUNCA sai ──────────────────────────
  const fontes = args.fontesDeProva as { afirmacao: string; fonte: string }[];
  const indiceDaProva = args.papeis.findIndex((p) => p === "prova");
  if (indiceDaProva >= 0) {
    const veredito = conferirNumeroComFonte({ texto: cards[indiceDaProva] ?? "", fontes });
    if (!veredito.passa) {
      const r2 = await pedir(
        `o card de PROVA (posição ${indiceDaProva + 1}) citou um número sem fonte cadastrada ` +
        `(${veredito.motivo}). Reescreva TODO o carrossel; esse card precisa virar um BENEFÍCIO ` +
        "QUALITATIVO, em palavras, SEM nenhum número específico.",
      );
      if (!r2.ok) {
        return { ok: false, motivo: `número de prova sem fonte (${veredito.motivo}), e a reescrita falhou: ${r2.error}` };
      }
      const dados2 = r2.data as { legenda?: unknown; hashtags?: unknown; cards?: unknown };
      if (typeof dados2.legenda !== "string" || !Array.isArray(dados2.cards) || dados2.cards.length !== n) {
        return { ok: false, motivo: "número de prova sem fonte, e a reescrita não devolveu o formato esperado" };
      }
      const cards2 = (dados2.cards as Array<{ texto?: unknown }>).map((c) => (typeof c?.texto === "string" ? c.texto : ""));
      const veredito2 = conferirNumeroComFonte({ texto: cards2[indiceDaProva] ?? "", fontes });
      if (!veredito2.passa) {
        return { ok: false, motivo: `número de prova sem fonte, mesmo após reescrever: ${veredito2.motivo}` };
      }
      cards = cards2;
      legenda = dados2.legenda;
      avisos.push(
        `preciso confirmar: o card de prova foi reescrito sem número específico (fonte ausente para: ${veredito.numeros.join(", ")})`,
      );
    }
  }

  // ── CTA LITERAL força o último card e garante a MESMA frase na legenda ──
  if (args.ctaLiteral) {
    cards[n - 1] = args.ctaLiteral;
    if (!legenda.includes(args.ctaLiteral)) legenda = `${legenda}\n\n${args.ctaLiteral}`;
  }

  return { ok: true, resultado: { legenda, hashtags, cards, avisos } };
}

/** As MESMAS travas de `conferirPeca` (direção interna, promoção só em
 *  stories, data coerente, pilar não bloqueado), aplicadas à legenda de um
 *  carrossel do pacote/série — nunca uma segunda régua paralela. */
function conferirCarrosselGerado(args: {
  resultado: ResultadoCarrossel;
  data: Date;
  pilarAlvo: string;
}): { ok: true; caption: string } | { ok: false; motivo: string } {
  const caption = comHashtags(args.resultado.legenda, args.resultado.hashtags);
  if (!caption || caption.trim().length < 20) {
    return { ok: false, motivo: "a legenda do carrossel ficou curta demais para virar post" };
  }
  if (/PRECISO CONFIRMAR/i.test(caption)) {
    return {
      ok: false,
      motivo: 'a legenda confessa falta de dado ("PRECISO CONFIRMAR") — não vai ao ar sem a informação real do cliente',
    };
  }
  const internas = frasesDeDirecaoInterna(caption);
  if (internas.length > 0) return { ok: false, motivo: motivoDaDirecaoInterna(internas) };

  const vereditoDePromocao = conferirPromocaoNoFormato({
    formato: "carousel",
    texto: `${caption}\n${args.resultado.cards.join("\n")}`,
  });
  if (!vereditoDePromocao.passa) return { ok: false, motivo: vereditoDePromocao.motivo };

  const conferenciaDeData = conferirDataDaPeca({ texto: caption, agendadaPara: args.data });
  if (!conferenciaDeData.passa) return { ok: false, motivo: conferenciaDeData.motivo };

  const vereditoDoPilar = conferirPilar(args.pilarAlvo, { exigido: true });
  if (vereditoDoPilar.bloqueado) return { ok: false, motivo: motivoCurto(vereditoDoPilar) };

  return { ok: true, caption };
}

/** Gera, confere e prepara UM slot de carrossel (do pacote OU de uma série) —
 *  devolve o `caption` final e o `scenesJson` já serializado (um card por
 *  tela; ver o gap de storyboard no cabeçalho do arquivo). */
async function processarSlotDeCarrossel(args: {
  gerar: GeradorDeIA;
  contexto: ContextoDeGeracao;
  naoConstituida: boolean;
  data: Date;
  cardsMin: number;
  cardsMax: number;
  sequencia: readonly string[];
  ctaLiteral?: string;
  fontesDeProva: readonly { afirmacao: string; fonte: string }[];
  pilarAlvo: string;
  workspaceId: string;
  clientId: string;
}): Promise<{ ok: true; caption: string; scenesJson: string; avisos: string[] } | { ok: false; motivo: string }> {
  const diaDoMes = diaCivilBrasilia(args.data).dia;
  const papeis = papeisDoCarrossel(args.cardsMin, args.cardsMax, args.sequencia, diaDoMes);
  const gerado = await gerarCarrosselUnico({ ...args, papeis });
  if (!gerado.ok) return gerado;
  const conferido = conferirCarrosselGerado({ resultado: gerado.resultado, data: args.data, pilarAlvo: args.pilarAlvo });
  if (!conferido.ok) return conferido;
  return {
    ok: true,
    caption: conferido.caption,
    scenesJson: JSON.stringify(gerado.resultado.cards),
    avisos: gerado.resultado.avisos,
  };
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
  // ── O ANALISTA SEMANAL (F2-F1, 27/09/2026) — pesos de pilar e horários ────
  // ajustados pela ÚLTIMA análise semanal APLICADA (nunca a proposta que
  // ninguém aprovou: `pacoteComUltimaAnaliseAplicada` só lê status
  // "aplicada"). Sem nenhuma análise aplicada, devolve o pacote tal como veio
  // — este é o ÚNICO ponto de integração, de propósito ("ligue isso de forma
  // mínima e testada"): toda a distribuição de pilares e horários do mês já
  // lê `pacote` a partir daqui, então uma reatribuição de nome é suficiente.
  const pacote = await pacoteComUltimaAnaliseAplicada(clientId, pacoteLido.pacote).catch(() => pacoteLido.pacote);

  // ── A FICHA DE MARCA (OU O DNA, QUE PREVALECE) ────────────────────────────
  //
  // `entrada.dna` é a injeção explícita (teste, ou quem já tem o DNA em mão).
  // Sem ela, busca o VIGENTE gravado pelo bloco 1B-B2 (`dna-da-marca.ts`) —
  // "o DNA já prevalece sobre a ficha pela regra existente" (ordem do CEO):
  // cliente sem ficha mas com DNA vigente gera calendário normalmente, sem
  // nunca consultar `contratoDeMarca`.
  const dnaEfetivo: DnaDaMarcaConteudo | null =
    entrada.dna ?? (await dnaVigente(clientId).catch(() => null))?.conteudo ?? null;

  let marcaTexto = "";
  let naoConstituida = false;
  if (dnaEfetivo) {
    marcaTexto = textoDoDna(dnaEfetivo);
  } else {
    // ── FICHA INCOMPLETA É AVISO, NÃO TRAVA (ordem do CEO, 28/09/2026) ──────
    // Antes, marca sem ficha constituída RECUSAVA o calendário inteiro. Agora
    // gera com o que existe (nome, setor, pacote), no modo "peças genéricas,
    // sem inventar identidade" do prompt, e cada peça sai carimbada
    // `fichaIncompleta` no scriptJson para a revisão do CEO. A ficha completa
    // continua sugerida; a trava de PUBLICAÇÃO (`publicacao.ts`) não muda.
    const marca = await contratoDeMarca(clientId).catch(() => null);
    if (!marca || marca.naoConstituida) {
      naoConstituida = true;
      marcaTexto = marca?.texto ?? "";
    } else {
      marcaTexto = marca.texto;
    }
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
    const terceiros = geradoStories.slots.filter((s) => s.tipoStory === "terceiro_autorizado");
    const reciclados = geradoStories.slots.filter((s) => s.tipoStory === "reciclado");

    // "terceiro_autorizado" (ex-"repost", CEO 27/09/2026): NUNCA gera — falta
    // autorização guardada e o arquivo original do autor, e nenhuma das duas
    // coisas nasce de uma chamada de IA. Direto para pendentes, sem IA e sem
    // material.
    for (const s of terceiros) {
      pendentes.push({
        dia: isoDoDia(s.data),
        motivo:
          "material de terceiro autorizado: preciso da autorização guardada e do arquivo original do " +
          "autor (com crédito @autor)",
      });
    }

    // "combo": o PREÇO vem do CARDÁPIO da marca (`comboParaStory`), NUNCA da
    // IA — ver o cabeçalho do arquivo. Sem cardápio cadastrado (ou cardápio
    // vazio), o slot vira PENDENTE antes de qualquer chamada de IA, nunca um
    // preço inventado. Rodízio determinístico pelo ÍNDICE do combo dentro do
    // mês (nunca `Math.random`).
    const pilarCombo = pilarParaTipoDeStory("combo", pacote.pilares);
    combos.forEach((s, i) => {
      const veredito = comboParaStory(pacote, i);
      if (!veredito.ok) {
        pendentes.push({ dia: isoDoDia(s.data), motivo: veredito.motivo });
        return;
      }
      slots.push({
        data: s.data, formato: "story", pilarAlvo: pilarCombo, tipoStory: "combo", combo: veredito.combo,
      });
    });

    // "reciclado": precisa de material existente do cliente (MediaAsset
    // inbound, imagem ou vídeo). Com material, a peça NASCE com `mediaUrl` já
    // apontando para ele (rodízio determinístico entre os materiais
    // disponíveis); sem nenhum, PENDENTE — nunca um post sem imagem.
    if (reciclados.length > 0) {
      const materiais = await materiaisParaReciclar(
        clientId,
        new Date(),
        pacote.intervaloDeRepeticaoDias ?? INTERVALO_PADRAO_DE_REPETICAO_DIAS,
      );
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

  const contexto: ContextoDeGeracao = {
    nomeDoNegocio: perfil?.name || "o cliente",
    segmento: perfil?.industry || "",
    marcaTexto,
  };

  const criadosPosts: PostDoCalendarioGerado[] = [];
  const barradas: PecaBarradaDoCalendario[] = [];
  // Os posts de FEED/CARROSSEL criados hoje, por dia (AAAA-MM-DD) — é do que
  // "capa_do_post_do_dia" (STORIES DERIVADOS, mais abaixo) tira os pais.
  const idsDoDia = new Map<string, string[]>();
  function registrarPostDoDia(dia: string, id: string): void {
    idsDoDia.set(dia, [...(idsDoDia.get(dia) ?? []), id]);
  }

  // ── A LINHA DE PRODUÇÃO "DE SEMPRE" (feed/carousel/reel/story do pacote) ──
  // Só roda se sobrou slot depois dos cortes acima — uma marca SÓ DE
  // CARROSSEL-DO-PACOTE/SÉRIES (sem `postsPorDia`/`stories`) chega aqui com
  // `slots` vazio, e as linhas de produção NOVAS (mais abaixo) não dependem
  // desta.
  if (slots.length > 0) {
    // ── A IA ─────────────────────────────────────────────────────────────
    const lote = await gerarLoteDeIA({ gerar, contexto, naoConstituida, slots, workspaceId, clientId });
    // ── PLANO B SEM IA (CEO, 04/10/2026) ──────────────────────────────────
    // Mês SÓ de stories de combo e reciclado não precisa de IA para existir:
    // o combo sai do CARDÁPIO (nome, descrição, preço literais) e o reciclado
    // já tem a foto real do cliente. Com a IA fora (o cofre ainda fechado),
    // cada story nasce de um MODELO FIXO e passa pela MESMA conferência da
    // peça da IA (`conferirPeca`). Nada é inventado: o modelo só usa o que o
    // cardápio e o cadastro dizem. Qualquer outro formato continua exigindo a
    // IA — e falha com o motivo dela, como antes.
    const semIa = !lote.ok && slots.every(podeNascerSemIa);
    if (!lote.ok && !semIa) {
      return { ok: false, motivo: lote.motivo, codigo: "ia_falhou" };
    }
    const pecasDoLote: Array<PecaGeradaPelaIA | null> = lote.ok
      ? lote.posts
      : slots.map((sl) => pecaSemIa(sl, contexto));

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const bruta = pecasDoLote[i] ?? null;

      let veredito: VereditoDePeca = bruta
        ? conferirPeca(bruta, slot.data, slot.pilarAlvo, slot.formato, slot.combo)
        : { ok: false, motivo: "a IA não devolveu peça para este dia" };

      // Regenera UMA vez, citando o motivo. Falhou de novo → barrada.
      // (No plano B não há a quem pedir: a peça do modelo que não passou na
      // conferência é barrada direto, com o motivo.)
      if (!veredito.ok && !semIa) {
        const motivoOriginal = veredito.motivo;
        const retry = await gerarPecaUnica({
          gerar, contexto, naoConstituida, slot, motivoAnterior: motivoOriginal, workspaceId, clientId,
        });
        veredito = retry
          ? conferirPeca(retry, slot.data, slot.pilarAlvo, slot.formato, slot.combo)
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
          // `pacote.stories` (27/09/2026) — "combo"/"reciclado"/"terceiro_autorizado"
          // ("terceiro_autorizado" nunca chega aqui: vira pendente antes de
          // existir slot de IA).
          scriptJson: JSON.stringify({
            origemGerador: MARCADOR_DE_ORIGEM, ...(naoConstituida ? { fichaIncompleta: true } : {}),
            mes: entrada.mes,
            // Plano B: o texto do modelo JÁ é o final — não há o que a rotina
            // semanal reescrever sem IA. `semIa` marca a peça para ser
            // refeita quando o cofre abrir, se o CEO quiser.
            fase: semIa ? "final" : "pauta",
            ...(semIa ? { semIa: true } : {}),
            // LACUNAS DECLARADAS NA PEÇA (CEO, 04/10/2026): o que o modelo NÃO
            // pode inventar fica escrito aqui, para quem aprova ver o que falta.
            ...(semIa && lacunasDaPecaSemIa(slot).length ? { lacunas: lacunasDaPecaSemIa(slot) } : {}),
            ...(slot.tipoStory ? { tipo: slot.tipoStory } : {}),
            // O combo ESCOLHIDO (W12b) — snapshot, não índice: `semana-editorial.ts`
            // relê este mesmo objeto na finalização para reconferir o preço,
            // mesmo que o cardápio da marca mude entre a proposta e a semana.
            ...(slot.combo ? { combo: slot.combo } : {}),
          }),
          // STORY "reciclado" já nasce com a mídia do cliente — nunca espera o
          // relógio de arte (`execution/artes.ts` só toca post com
          // `mediaUrl: null`, então isto o exclui de lá por construção).
          ...(slot.mediaUrlReciclado ? { mediaUrl: slot.mediaUrlReciclado } : {}),
        },
        select: { id: true, scheduledFor: true },
      });
      criadosPosts.push({ id: post.id, scheduledFor: post.scheduledFor as Date });
      if (slot.formato === "feed" || slot.formato === "carousel") {
        registrarPostDoDia(isoDoDia(slot.data), post.id);
      }
    }
  }

  // ── O CARROSSEL "DE SEMPRE" DA MARCA (pacote.carrossel, Foocci — W12b) ────
  // Linha de produção independente: N cards por sequência, sempre fechando
  // em CTA. Ver o cabeçalho do arquivo para o gap de storyboard.
  if (pacote.carrossel) {
    const carrossel = pacote.carrossel;
    // `melhoresHorarios` já vem ORDENADO desc por engajamento médio
    // (`dna-da-marca.ts`) — o [0] é o melhor horário medido, não um índice
    // arbitrário. `.hora` é sempre "HH:MM" Brasília, hora cheia.
    const melhorHorarioDoDna = dnaEfetivo?.melhoresHorarios?.[0]?.hora;
    const horarioDoCarrossel =
      carrossel.usarHorarioDoDna && melhorHorarioDoDna
        ? melhorHorarioDoDna
        : (carrossel.horarioPadrao ?? "12:00");
    const brutos = gerarSlotsDeCarrosselDoPacote({
      ano, mesIndex, diasValidos: pacote.dias, minimoDia,
      porDia: carrossel.porDia ?? 1, horario: horarioDoCarrossel,
    });
    const pilarDoCarrossel = pacote.pilares[0]?.nome ?? "";
    for (const bruto of brutos) {
      if (horariosOcupados.has(bruto.data.getTime())) continue;
      const processado = await processarSlotDeCarrossel({
        gerar, contexto, naoConstituida,
        data: bruto.data,
        cardsMin: carrossel.cardsMin,
        cardsMax: carrossel.cardsMax,
        sequencia: carrossel.sequencia,
        ctaLiteral: carrossel.cta,
        fontesDeProva: pacote.fontesDeProva ?? [],
        pilarAlvo: pilarDoCarrossel,
        workspaceId, clientId,
      });
      if (!processado.ok) {
        barradas.push({ dia: isoDoDia(bruto.data), motivo: processado.motivo });
        continue;
      }
      const post = await prisma.socialPost.create({
        data: {
          workspaceId, clientId,
          caption: processado.caption,
          networks: JSON.stringify(["instagram"]),
          format: "carousel",
          pillar: pilarDoCarrossel || null,
          scenesJson: processado.scenesJson,
          scheduledFor: bruto.data,
          status: "draft",
          visibility: "compartilhado",
          // "fase":"final" — a legenda JÁ é a final (mesmo pipeline de checagem
          // que a semana aplicaria); a peça segue direto para a fila de arte
          // de sempre, sem passar pela finalização semanal de legenda.
          scriptJson: JSON.stringify({
            origemGerador: MARCADOR_DE_ORIGEM, ...(naoConstituida ? { fichaIncompleta: true } : {}),
            mes: entrada.mes,
            fase: "final",
            tipo: "carrossel_pacote",
            ...(processado.avisos.length ? { avisos: processado.avisos } : {}),
          }),
        },
        select: { id: true, scheduledFor: true },
      });
      criadosPosts.push({ id: post.id, scheduledFor: post.scheduledFor as Date });
      registrarPostDoDia(isoDoDia(bruto.data), post.id);
    }
  }

  // ── SÉRIES NOMEADAS (pacote.series, W12b) ────────────────────────────────
  // "servico" (ou qualquer série sem `exigeFonte`) segue a MESMA linha de
  // carrossel em sequência de cima. "radar" (`exigeFonte: true`) NÃO chama IA
  // aqui — vira só um slot PENDENTE; quem preenche é a rota
  // `POST /api/social-posts/radar`.
  for (const serie of pacote.series ?? []) {
    const horarioDaSerie = serie.horario ?? pacote.carrossel?.horarioPadrao ?? "12:00";
    for (const dia of diasNoMes(ano, mesIndex, serie.dias, minimoDia)) {
      const data = horaBrasiliaParaUtc(horarioDaSerie, ano, mesIndex, dia);
      if (serie.exigeFonte) {
        pendentes.push({ dia: isoDoDia(data), motivo: "Radar: aguardando pauta com fonte" });
        continue;
      }
      if (horariosOcupados.has(data.getTime())) continue;
      const sequenciaDaSerie = serie.sequencia ?? pacote.carrossel?.sequencia;
      if (!sequenciaDaSerie || sequenciaDaSerie.length === 0) {
        pendentes.push({ dia: isoDoDia(data), motivo: `preciso da sequência de cards da série "${serie.nome}"` });
        continue;
      }
      const pilarDaSerie = pilarParaNome(serie.nome, pacote.pilares);
      const processado = await processarSlotDeCarrossel({
        gerar, contexto, naoConstituida, data,
        cardsMin: serie.cardsMin,
        cardsMax: serie.cardsMax ?? serie.cardsMin,
        sequencia: sequenciaDaSerie,
        ctaLiteral: pacote.carrossel?.cta,
        fontesDeProva: pacote.fontesDeProva ?? [],
        pilarAlvo: pilarDaSerie,
        workspaceId, clientId,
      });
      if (!processado.ok) {
        barradas.push({ dia: isoDoDia(data), motivo: processado.motivo });
        continue;
      }
      const post = await prisma.socialPost.create({
        data: {
          workspaceId, clientId,
          caption: processado.caption,
          networks: JSON.stringify(["instagram"]),
          format: "carousel",
          pillar: pilarDaSerie || null,
          scenesJson: processado.scenesJson,
          scheduledFor: data,
          status: "draft",
          visibility: "compartilhado",
          scriptJson: JSON.stringify({
            origemGerador: MARCADOR_DE_ORIGEM, ...(naoConstituida ? { fichaIncompleta: true } : {}),
            mes: entrada.mes,
            fase: "final",
            tipo: "serie",
            serieId: serie.id,
            ...(serie.layout ? { layout: serie.layout } : {}),
            ...(processado.avisos.length ? { avisos: processado.avisos } : {}),
          }),
        },
        select: { id: true, scheduledFor: true },
      });
      criadosPosts.push({ id: post.id, scheduledFor: post.scheduledFor as Date });
      registrarPostDoDia(isoDoDia(data), post.id);
    }
  }

  // ── STORIES DERIVADOS (pacote.stories.derivados, W12b) ───────────────────
  // Nascem de OUTRA peça já existente, não de um slot próprio — ver o
  // cabeçalho do arquivo para o motivo de "capa_derivada" nascer em
  // "fase":"pauta" PERMANENTEMENTE.
  const derivados = pacote.stories?.derivados;
  if (derivados && derivados.length > 0) {
    const derivadosSet = new Set(derivados);
    if (derivadosSet.has("capa_do_post_do_dia")) {
      for (const idsDoPai of idsDoDia.values()) {
        for (const paiId of idsDoPai) {
          const pai = criadosPosts.find((p) => p.id === paiId);
          if (!pai) continue;
          const agendado = new Date(pai.scheduledFor.getTime() + 30 * 60_000);
          const post = await prisma.socialPost.create({
            data: {
              workspaceId, clientId,
              caption: "",
              networks: JSON.stringify(["instagram"]),
              format: "story",
              scheduledFor: agendado,
              status: "draft",
              visibility: "compartilhado",
              scriptJson: JSON.stringify({
                origemGerador: MARCADOR_DE_ORIGEM, ...(naoConstituida ? { fichaIncompleta: true } : {}),
                mes: entrada.mes,
                fase: "pauta",
                tipo: "capa_derivada",
                dependeDe: paiId,
              }),
            },
            select: { id: true, scheduledFor: true },
          });
          criadosPosts.push({ id: post.id, scheduledFor: post.scheduledFor as Date });
        }
      }
    }
    if (derivadosSet.has("reel_do_acervo")) {
      for (const dia of idsDoDia.keys()) {
        pendentes.push({ dia, motivo: "aguardando acervo" });
      }
    }
  }

  if (criadosPosts.length === 0 && barradas.length === 0) {
    return { ok: true, criados: 0, jaExistiam: 0, posts: [], barradas: [], pendentes };
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
