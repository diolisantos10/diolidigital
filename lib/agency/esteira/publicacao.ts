// publicacao.ts — DA ENTREGA ATÉ O AR.
//
// O buraco: a agência produzia e não entregava. O texto do especialista virava
// `Deliverable` e morria ali — nunca virava post com data, e `publishPost`
// (que existe e funciona) não tinha um único chamador automático. O índice
// `SocialPost.scheduledFor` existia no banco e ninguém consultava. O portal do
// cliente dizia "Seu calendário está sendo montado" para sempre.
//
// Três etapas, e elas são separadas de propósito:
//   1. AGENDAR   — a entrega apresentada vira posts com data, em `draft`.
//                  Reversível: dá para mexer na data, no texto, na mídia.
//   2. APROVAR   — o cliente aprovou o pacote; o calendário passa a valer
//                  (`scheduled`). É o único ponto em que a agência ganha
//                  permissão de postar em nome dele.
//   3. PUBLICAR  — o relógio olha a hora e manda para a Meta. Irreversível.
//
// Juntar as três faria a agência publicar no instante em que produz, sem o
// cliente ver nada antes — o oposto do que esta casa decidiu.
//
// ── 05/08/2026: "approved" era BECO SEM SAÍDA, e o conserto foi UM caminho ───
//
// A decisão do cliente num card de calendário gravava `SocialPost.status =
// "approved"` (app/api/portal/approvals). E NADA no repositório inteiro movia
// `approved → scheduled`: `publicarAgendados` só olha "scheduled" e
// `aprovarCalendario` só promove "draft". O cliente aprovava os 6 carrosséis, o
// portal escrevia "Aprovado por você", e nenhum post ia ao ar — nunca, e sem
// ninguém ser avisado. Receita cobrada, entrega que não acontece.
//
// Havia duas saídas e elas eram excludentes:
//   (a) a decisão PROMOVE a peça para "scheduled";
//   (b) `publicarAgendados` passa a aceitar "approved" também.
//
// Escolhida a (a), por três motivos:
//   1. "scheduled" já é o que o resto da casa entende por consentimento — o
//      relógio, o calendário do portal ("Programado") e a reabertura de card
//      (que devolve a peça a "draft" para RETIRAR o aval). "approved" seria um
//      segundo estado com o mesmo significado, e dois nomes para o mesmo estado
//      é como nasce a próxima divergência.
//   2. A data de um post em "approved" é uma data PROPOSTA — e pode já ter
//      passado enquanto o cliente pensava. A (b) faria o relógio disparar em
//      rajada tudo que estava marcado para ontem, a não ser reimplementando
//      dentro do relógio o empurrão de datas que já vive aqui. Relógio não
//      decide calendário.
//   3. A (a) mantém a publicação com UM gatilho só, aqui, onde ele é lido.
//
// "approved" continua ACEITO como estado de ENTRADA da promoção (peça que ficou
// presa antes deste conserto é resgatada na próxima promoção do mesmo dono),
// mas nunca mais é escrito como destino de uma decisão.

import { prisma } from "@/lib/db/client";
import { publishPost } from "@/lib/integrations/meta/client";
import { conexaoDoCliente } from "@/lib/integrations/meta/connections";
import { caminhoPublicoAssinado, guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";
import { prepararImagemDeStory } from "@/lib/integrations/meta/midia-de-story";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { aprovadaPeloCeo } from "@/lib/agency/esteira/aprovacao-da-peca";
import { AUTOR_DA_ESTEIRA } from "@/lib/agency/esteira/registro-de-publicacao";
import { REVISION_STATUS_DA_QUALIDADE } from "@/lib/agency/execution/quality-auditor";
import { frasesDeDirecaoInterna } from "@/lib/agency/esteira/direcao-interna";
import { conferirDataDaPeca } from "@/lib/agency/esteira/calendario-do-cliente";
import { conferirPromocaoNoFormato } from "@/lib/agency/esteira/promocao-so-em-stories";
import { lerPacote, type PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";
import { conferirCollaborators, type ConferenciaDeCollaborators } from "@/lib/integrations/meta/collab";
import { sincronizarEstadoExterno } from "@/lib/integracoes/cityjobs/sincronizar-estado";

/** Quantos posts publicamos por rodada do relógio. Publicação é irreversível e
 *  a Meta limita chamadas — melhor ir devagar e nunca em enxurrada. */
const MAX_PUBLICACOES_POR_RODADA = 10;

/**
 * O ESPAÇAMENTO MÍNIMO ENTRE DUAS PUBLICAÇÕES NO MESMO PERFIL. (14/08/2026)
 *
 * ── O risco medido, não hipotético ──────────────────────────────────────────
 *
 * As 6 peças do CityJobs estão em `scheduled` com data JÁ VENCIDA, e
 * `agendarPecasAprovadas` não empurra data de peça em `scheduled` — ela cai em
 * `ignorados` (ver `cards-de-aprovacao.ts` e o registro da oficina de 14/08).
 * Com `MAX_PUBLICACOES_POR_RODADA = 10`, no minuto em que o freio for solto o
 * relógio pegaria **as 6 na mesma rodada**: seis posts no mesmo minuto, no
 * perfil de um cliente, que é o tipo de coisa que a plataforma pune e que
 * ninguém pediu.
 *
 * ── Por que ESPAÇAMENTO, e não as outras duas saídas ────────────────────────
 *
 * Estavam na mesa três:
 *   (a) teto de N por perfil por rodada — não resolve: com rodada de 5 min, um
 *       teto de 1 ainda joga as 6 no ar em meia hora, e o teto não sabe nada
 *       sobre o que já foi publicado ANTES da rodada;
 *   (b) peça muito vencida não sai sozinha — protege de outra coisa (peça
 *       velha indo ao ar), não da rajada; e travaria as 6 sem exceção até
 *       alguém redatar uma a uma;
 *   (c) espaçamento mínimo por perfil — o que está aqui.
 *
 * A (c) é a única que mede o que o problema realmente é: *duas publicações
 * juntas demais no mesmo perfil*. Ela também é a única que **não briga com o
 * calendário legítimo**: `promoverParaAgendado` já garante pelo menos 24h entre
 * peças do mesmo cliente, então nenhuma peça programada por esta casa esbarra
 * neste freio. Quem esbarra é exatamente o acúmulo que ninguém planejou.
 *
 * ── O número, e o que ele custa quando o volume crescer ─────────────────────
 *
 * Duas horas: mais longo que qualquer rajada plausível e MUITO mais curto que
 * as 24h que o calendário promete — de propósito, para o freio nunca virar o
 * dono da agenda. O custo aparece no acúmulo: uma fila de N peças vencidas do
 * mesmo perfil leva N × 2h para drenar (as 6 do CityJobs sairiam ao longo de
 * ~10h, uma a cada duas horas, em vez de todas num minuto). Perfis diferentes
 * não se atrapalham — o freio é POR PERFIL, e cem clientes publicam no mesmo
 * minuto sem se ver.
 *
 * Fail-closed: não conseguir MEDIR a última publicação não vira permissão.
 */
export const INTERVALO_MINIMO_POR_PERFIL_MS = 2 * 60 * 60_000;

/**
 * Quanto falta esperar antes da próxima publicação deste perfil. `0` = pode ir.
 *
 * Exportada para ser provada direto: régua que só existe dentro de um laço de
 * 200 linhas é régua que ninguém consegue testar.
 */
export function faltaEsperar(
  ultima: Date | null | undefined,
  agora: Date,
  intervalo: number = INTERVALO_MINIMO_POR_PERFIL_MS,
): number {
  if (!ultima || isNaN(ultima.getTime())) return 0;
  const decorrido = agora.getTime() - ultima.getTime();
  // Publicação no futuro (relógio torto, data digitada errada no registro
  // manual) conta como "acabou de sair" — o freio erra para o lado seguro.
  if (decorrido < 0) return intervalo;
  return decorrido >= intervalo ? 0 : intervalo - decorrido;
}

/**
 * QUANTO ESPERAR ENTRE DUAS PUBLICAÇÕES DO MESMO PERFIL, POR FORMATO. (27/09/2026)
 *
 * ── O que mudou, e por quê ──────────────────────────────────────────────────
 *
 * `INTERVALO_MINIMO_POR_PERFIL_MS` (2h) foi medido contra RAJADA de feed —
 * seis carrosséis vencidos saindo no mesmo minuto. Aplicado a stories ele vira
 * o próprio problema que resolveu em feed: a Sushi Cazza publica 6–8 stories
 * por dia a partir das 18h, em ritmo de minutos, e 2h entre cada um faria a
 * própria rotina do cliente estourar o freio.
 *
 * Stories usam o intervalo QUE A MARCA DECLAROU
 * (`pacote.stories.intervaloMinimoMin`, em minutos). Pacote ausente ou
 * ilegível não vira "sem freio" — vira o PADRÃO abaixo (fail-closed: a
 * ausência de regra não é permissão de rajada). Feed, reel e carrossel
 * continuam com o intervalo fixo de sempre.
 *
 * Padrão de 30 min: CONFIRMADO pelo parecer do `meta` (`.despacho/M2-meta.out`,
 * item 1) — "PODE COM AJUSTE". A Meta não publica número oficial de intervalo
 * (pune rajada, não agendamento); 30 min é margem de segurança da casa, e o
 * parecer recomenda mantê-lo por já ser o valor gravado no pacote da Sushi
 * Cazza (W8) — dois números concorrendo seria o próximo defeito. Ficam de fora
 * deste ticket, por não serem sobre INTERVALO (registrar como pendência
 * separada para o PM): o teto diário de 50 publicações/24h da Meta
 * (stories contam no mesmo limite de `media_publish`) e a pré-condição de
 * escopo do token — conexões SEM o escopo `instagram_content_publish` não
 * publicam, qualquer que seja o formato (ver o parecer do `meta`).
 * CORREÇÃO (W15, laudo `meta`): a frase anterior aqui ("publicação real ainda
 * não funciona para NENHUM formato") estava larga demais — é por conexão, não
 * universal: a Foocci tem o escopo, a Sushi Cazza não tem, e a Dioli não foi
 * medida ainda.
 */
const INTERVALO_STORY_PADRAO_MIN = 30;

/**
 * A VARIAÇÃO DO RITMO DE STORY (27/09/2026 — parecer do `meta` / ordem do CEO).
 *
 * Intervalo fixo, minuto a minuto, é o padrão que uma automação deixa — e é
 * exatamente o que o parecer do `meta` pediu para quebrar: alguns minutos de
 * folga por story, sem que a casa precise sortear nada (`Math.random` não é
 * reproduzível: o mesmo post recalculado numa rodada seguinte teria que dar o
 * MESMO número, ou o freio de espaçamento compararia contra um alvo que já
 * mudou). Por isso é hash do `postId` — DETERMINÍSTICA: o mesmo post sempre
 * cai na mesma variação, e o cálculo não depende de estado nenhum.
 *
 * `0..maxMinutos` inclusive. Soma-se ao MÍNIMO — nunca abaixo dele, como pede
 * a ficha: a variação só alarga o intervalo, nunca aperta.
 */
export function variacaoDeMinutos(postId: string, maxMinutos: number = 5): number {
  let h = 0;
  for (let i = 0; i < postId.length; i++) {
    h = (h * 31 + postId.charCodeAt(i)) >>> 0;
  }
  return h % (maxMinutos + 1);
}

/**
 * `postId` é OPCIONAL de propósito: sem ele, nenhuma variação é aplicada — é o
 * que mantém `intervaloDoFormato(formato, pacote)` (sem terceiro argumento)
 * gerando o mesmo número de sempre para quem já testava a régua pura.
 */
export function intervaloDoFormato(formato: string, pacote: PacoteDaMarca | null, postId?: string): number {
  if (normalizarFormato(formato) !== "story") return INTERVALO_MINIMO_POR_PERFIL_MS;
  const declarado = pacote?.stories?.intervaloMinimoMin;
  const minutos = typeof declarado === "number" && Number.isFinite(declarado) && declarado > 0
    ? declarado
    : INTERVALO_STORY_PADRAO_MIN;
  const variacao = postId ? variacaoDeMinutos(postId) : 0;
  return (minutos + variacao) * 60_000;
}

/**
 * A RAMPA DA PRIMEIRA SEMANA (27/09/2026 — parecer do `meta` / ordem do CEO).
 *
 * Uma marca que NUNCA publicou story e estreia com 6–8 por dia é o padrão que
 * a Meta associa a automação nova testando limite. A trava: nos primeiros 7
 * dias corridos a partir do PRIMEIRO story publicado do cliente — marca que
 * nunca publicou nenhum começa a contagem AGORA, não no dia em que o pacote
 * foi cadastrado — no máximo `TETO_DA_RAMPA` por dia civil de Brasília,
 * qualquer que seja o teto do pacote. Depois da semana, o teto volta a ser o
 * do pacote (`stories.porDiaMax`) — ausência dele não vira "sem teto": cai no
 * mesmo `TETO_DA_RAMPA`, fail-closed, como todo o resto desta função.
 *
 * "3 por dia por 7 dias" é MARGEM DA CASA, por ordem do CEO repassando o
 * parecer do `meta` — a Meta não publica um número oficial de rampa de
 * aquecimento para conta nova de story; é a mesma natureza do intervalo de 30
 * min acima (`INTERVALO_STORY_PADRAO_MIN`), não um valor que a plataforma
 * divulga ou audita. Não citar como "número da Meta" em parecer de risco —
 * conferir a lacuna correspondente em `docs/plataformas/meta/cartilha.md`.
 */
export const TETO_DA_RAMPA = 3;
const DIAS_DA_RAMPA_MS = 7 * 24 * 60 * 60_000;

/** O degrau único de sempre — usado quando o pacote não declara `rampaDegraus`
 *  (ver abaixo). Mantém byte a byte o comportamento anterior a 28/09/2026. */
const DEGRAU_PADRAO: ReadonlyArray<{ ateDiasMs: number; teto: number }> = [
  { ateDiasMs: DIAS_DA_RAMPA_MS, teto: TETO_DA_RAMPA },
];

/**
 * Função PURA — o que decide, sem tocar banco. Exportada porque é a régua e
 * régua que só existe dentro da consulta é régua que ninguém consegue provar.
 *
 * ── DEGRAUS CONFIGURÁVEIS (CJ-J1, 28/09/2026) ────────────────────────────────
 *
 * Até aqui só existia UM degrau (3/dia por 7 dias, depois `porDiaMax`). O
 * parecer `meta` (M4) pediu 4 degraus para o City Jobs (3→6→10→15) — outra
 * marca que só precisa do degrau único não muda nada: `rampaDegraus` ausente
 * ou vazio cai em `DEGRAU_PADRAO`, que é EXATAMENTE a régua anterior.
 *
 * `rampaDegraus` vem em DIAS (não ms) porque é o formato que
 * `pacote-da-marca.ts` valida e que um humano lendo o pacote entende sem
 * fazer conta. A conversão para ms acontece só aqui, na régua pura.
 */
export function tetoDeStoriesDoDia(a: {
  primeiroStoryEm: Date | null;
  agora: Date;
  porDiaMax: number | null;
  /** Os degraus INTERMEDIÁRIOS da rampa, em qualquer ordem — esta função
   *  ordena por `ateDias` antes de usar. Ver `pacote-da-marca.ts`. */
  rampaDegraus?: ReadonlyArray<{ ateDias: number; teto: number }>;
}): number {
  if (!a.primeiroStoryEm) return TETO_DA_RAMPA;

  const decorridoMs = a.agora.getTime() - a.primeiroStoryEm.getTime();
  const degraus = a.rampaDegraus && a.rampaDegraus.length > 0
    ? [...a.rampaDegraus]
        .sort((x, y) => x.ateDias - y.ateDias)
        .map((d) => ({ ateDiasMs: d.ateDias * 24 * 60 * 60_000, teto: d.teto }))
    : DEGRAU_PADRAO;

  for (const degrau of degraus) {
    if (decorridoMs < degrau.ateDiasMs) return degrau.teto;
  }
  return typeof a.porDiaMax === "number" && Number.isFinite(a.porDiaMax) && a.porDiaMax > 0
    ? a.porDiaMax
    : TETO_DA_RAMPA;
}

/**
 * 00:00 de Brasília do dia em que `agora` cai, como instante UTC real. Brasil
 * não tem mais horário de verão desde 2019 — offset fixo é honesto (mesmo
 * raciocínio de `modo-de-aprovacao.ts:comoBrasilia`, duplicado aqui em 4
 * linhas porque aquele helper não é exportado e este arquivo não o edita).
 */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
export function inicioDoDiaCivilDeBrasilia(agora: Date): Date {
  const deslocado = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
  const meiaNoiteBrasilia = Date.UTC(
    deslocado.getUTCFullYear(),
    deslocado.getUTCMonth(),
    deslocado.getUTCDate(),
    0, 0, 0, 0,
  );
  return new Date(meiaNoiteBrasilia + OFFSET_BRASILIA_MS);
}

/**
 * A CONSULTA: mede o primeiro story publicado do cliente e quantos já saíram
 * hoje, e devolve se ESTE story pode ir. Fail-closed nas duas medidas — não
 * conseguir medir não pode virar permissão, mesma régua do freio de rajada
 * logo acima.
 */
/**
 * Exportada em 28/09/2026 (CJ-J1) para o City Jobs (fonte externa de story)
 * reusar a MESMA consulta de rampa/teto do dia que o resto da casa usa — em
 * vez de reimplementar "quantos stories já saíram hoje" numa segunda régua.
 */
export async function confereRampaDeStoriesDoDia(
  clientId: string,
  agora: Date,
  pacote: PacoteDaMarca | null,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const primeiro = await prisma.socialPost
    .findFirst({
      where: { clientId, format: "story", status: "published", publishedAt: { not: null } },
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    })
    .then((r) => r?.publishedAt ?? null)
    .catch(() => undefined);
  if (primeiro === undefined) {
    return {
      ok: false,
      motivo: "não consegui medir a rampa da primeira semana deste perfil — na dúvida, não publico",
    };
  }

  const contagemHoje = await prisma.socialPost
    .count({
      where: {
        clientId,
        format: "story",
        status: "published",
        publishedAt: { gte: inicioDoDiaCivilDeBrasilia(agora) },
      },
    })
    .catch(() => undefined);
  if (contagemHoje === undefined) {
    return {
      ok: false,
      motivo: "não consegui medir quantos stories já saíram hoje neste perfil — na dúvida, não publico",
    };
  }

  const rampaDegraus = pacote?.stories?.rampaDegraus;
  const teto = tetoDeStoriesDoDia({
    primeiroStoryEm: primeiro,
    agora,
    porDiaMax: pacote?.stories?.porDiaMax ?? null,
    rampaDegraus,
  });
  if (contagemHoje >= teto) {
    // A frase exata "rampa da primeira semana: 3 stories por dia" é a régua
    // ANTIGA (degrau único) — mantida byte a byte para não quebrar quem já
    // lê este texto. Só se aplica quando o pacote NÃO declarou degraus
    // próprios (senão o degrau único nem é o que decidiu o teto acima).
    const usandoDegrauPadrao = !rampaDegraus || rampaDegraus.length === 0;
    const dentroDaPrimeiraSemana =
      usandoDegrauPadrao && (!primeiro || agora.getTime() - primeiro.getTime() < DIAS_DA_RAMPA_MS);
    return {
      ok: false,
      motivo: dentroDaPrimeiraSemana
        ? "rampa da primeira semana: 3 stories por dia"
        : usandoDegrauPadrao
          ? `este perfil já publicou ${contagemHoje} stories hoje — o teto do pacote é ${teto} por dia`
          : `este perfil já publicou ${contagemHoje} stories hoje — o teto de hoje na rampa de aquecimento é ${teto} por dia`,
    };
  }
  return { ok: true };
}

/** A que horas um post nasce quando ninguém escolheu horário. 10h é começo de
 *  expediente do público da maioria dos clientes desta casa. */
export const HORA_PADRAO = 10;

/** Tipos de entregável que viram post. Estratégia e relatório não vão ao ar.
 *
 *  ── DERIVADA, NÃO DIGITADA (24/08/2026) ────────────────────────────────────
 *  Era uma lista literal aqui. Enquanto foi lista literal, "que tipo é este
 *  entregável?" tinha duas respostas — a de quem declarou o especialista e a
 *  desta linha — e foi assim que a Pauta do mês entrou na fila de publicação.
 *  A verdade agora mora em `execution/tipos-de-entrega.ts`, onde cada tipo diz
 *  se vai ao ar E por quê. Tipo desconhecido NÃO é publicável. */

// ─── QUEM PODE VIRAR CALENDÁRIO (13/08/2026) ────────────────────────────────
//
// ── O buraco, medido, e aberto por seis dias ────────────────────────────────
//
// `agendarPostsDaEntrega` lia TODO entregável de tipo publicável do projeto —
// sem olhar se a escada de exposição tinha liberado, e sem olhar o parecer da
// Qualidade — e criava cada `SocialPost` com `visibility: "compartilhado"`.
//
// As duas metades da esteira faziam a coisa certa e esta função desfazia as
// duas, uma linha depois:
//
//   • `marcos.apresentar` (`marcos.ts:210`) roda a escada e só marca
//     "compartilhado" o `Deliverable` LIBERADO. Sete linhas depois
//     (`marcos.ts:326`) chamava esta função, que ignorava aquele veredito.
//   • `apresentar` recusa apresentar com peça em `quality_flag`
//     (`marcos.ts:181`) — mas `mesmoComRessalva: true` existe, `apresentarCiclo`
//     tem o mesmo escape, e a peça reprovada continuava virando post.
//
// Não é hipótese. Está medido em `docs/projetos/cityjobs-registro-07-08.md:172`:
// as 10 peças reprovadas à mão apareceram no calendário do cliente marcadas
// como compartilhado — "De procurando emprego a CONTRATADO", "🔥 VAGAS QUENTES
// HOJE" — num departamento que estava em allowlist e não tinha aquele cliente.
// O registro daquele dia já nomeava a causa: *"`escadaFiltraEntregas` guarda o
// `Deliverable`. O `SocialPost` NÃO passa por ela."* Continuou não passando.
//
// ── Por que a correção é AQUI, e não em quem chama ──────────────────────────
//
// São dois chamadores (`marcos.ts:326` e `mes.ts:782`) e o defeito de 07/08
// nasceu exatamente de consertar um e esquecer o outro. A régua fica na função
// que cria o post: quem chamar, de onde chamar, obedece.
//
// ── O que NÃO mudou, de propósito ───────────────────────────────────────────
//
// O post continua nascendo `visibility: "compartilhado"`. A decisão está
// justificada logo abaixo e é correta — o calendário existe PARA o cliente ver
// e aprovar. O defeito nunca foi nascer compartilhado: era QUAIS entregas
// entravam.

/**
 * Estados de revisão da Qualidade cuja entrega PODE virar calendário.
 *
 * Importados de `quality-auditor.ts` em vez de escritos à mão: aquele arquivo é
 * o único ponto de tradução veredito → banco, e ele mesmo avisa que "string
 * comparada à mão é como o bug volta".
 *
 * ── `nao_auditado` SAIU DAQUI EM 26/08/2026 ────────────────────────────────
 *
 * Até esta data ele ENTRAVA, e o comentário desta linha dizia por quê: a casa
 * havia decidido que "ninguém olhou" não bloqueia, para a operação não parar
 * quando um provedor de IA cai. A decisão era coerente e estava aplicada em
 * três arquivos. Ela também estava MEDIDA — e o que a medição mostrou é que ela
 * custava exatamente o que ela prometia evitar, do lado errado:
 *
 *   **9 entregas chegaram ao cliente sem auditoria nenhuma** (cliente oculto em
 *   produção, 25/08/2026). Não "com ressalva na tela": sem árbitro nenhum,
 *   indistinguíveis das aprovadas para quem abre o portal.
 *
 * A própria casa já tinha corrigido METADE disso em 24/08, e no arquivo ao
 * lado: `esteira/marcos.ts:208` retém a APRESENTAÇÃO de entrega
 * `quality_nao_auditado`. Ou seja, desde 24/08 havia DUAS políticas sobre o
 * mesmo estado — a apresentação retinha, o calendário deixava passar —, e o
 * comentário que estava aqui pedia justamente que isso não acontecesse. Elas
 * ficam iguais agora, e a que sobrevive é a fail-closed.
 *
 * **Auditor mudo nunca é aprovado.** Peça retida não some: ela sai com nome e
 * motivo em `AgendamentoFeito.retidas` e num `ActivityEvent`, e destravá-la é
 * conectar a auditoria — não reescrever a peça, que não tem defeito conhecido.
 * O caminho de escape continua existindo e continua sendo de GENTE
 * (`mesmoComRessalva`, em `marcos.ts`).
 */
const REVISOES_QUE_PODEM_VIRAR_POST: readonly string[] = [
  REVISION_STATUS_DA_QUALIDADE.aprovado,
];

/** A visibilidade que a escada de exposição carimba em quem ela liberou. */
const LIBERADA_PELA_ESCADA = "compartilhado";

/**
 * Por que esta entrega NÃO vira calendário — ou `null` quando pode virar.
 *
 * **Fail-closed nas duas perguntas.** Visibilidade que não seja exatamente
 * "compartilhado" (inclusive nula, inclusive "aguardando_publicacao") é entrega
 * que a escada não liberou. `revisionStatus` ausente é entrega sem parecer, e
 * ausência de informação não é informação: peça nunca conferida não estreia no
 * calendário do cliente porque ninguém lembrou de reprová-la.
 *
 * Isto barra entrega legítima antiga — a coluna `revisionStatus` é anulável e
 * nasceu depois de parte do banco. É a troca certa e foi escolhida com o custo
 * na mão: peça reprovada chegando ao cliente é pior que peça boa atrasada, e a
 * peça boa atrasada aparece com nome e motivo (`AgendamentoFeito.retidas` e um
 * `ActivityEvent`), então dá para destravá-la. A peça reprovada que sai não dá
 * para despublicar.
 *
 * Exportada para ser testável direto: é a régua, e régua que só existe dentro de
 * um laço de 60 linhas é régua que ninguém consegue provar.
 */
export function motivoParaNaoVirarCalendario(
  entrega: { visibility?: string | null; revisionStatus?: string | null },
): string | null {
  if (entrega.visibility !== LIBERADA_PELA_ESCADA) {
    return `a escada de exposição não liberou esta entrega ao cliente (visibilidade "${entrega.visibility ?? "não declarada"}")`;
  }
  if (!entrega.revisionStatus) {
    return "entrega sem parecer da Qualidade registrado — ausência não é aprovação";
  }
  if (!REVISOES_QUE_PODEM_VIRAR_POST.includes(entrega.revisionStatus)) {
    return `a Qualidade marcou esta entrega como "${entrega.revisionStatus}"`;
  }
  return null;
}

/**
 * O ESTADO QUE A FILA DE ENTREGA LÊ. Um só, e é este.
 *
 * Exportado em 25/08/2026 para que a régua do ajuste (o e2e do Story) meça a
 * MESMA constante que `publicarAgendados` consulta, em vez de repetir a
 * palavra "scheduled" num `expect`. Uma régua que copia a literal fica verde no
 * dia em que a fila passar a ler outra coisa — e é justamente aí que a peça do
 * cliente para de sair.
 *
 * ⚠️ É um VALOR, não uma lista, e isso foi medido: como lista, a consulta virava
 * `status: { in: [...] }` e três réguas que guardam o FORMATO da consulta de
 * `publicarAgendados` ficaram vermelhas. Elas estão certas — é o formato que
 * impede uma condição de se perder no dia em que alguém mexer no filtro. Quem
 * se adapta é a constante.
 */
export const ESTADO_QUE_A_FILA_LE = "scheduled";

/**
 * Estados de onde uma peça PODE ser promovida a "scheduled".
 *
 * "draft" é o caminho normal (data proposta, sem aval). "approved" é o legado
 * do beco sem saída descrito no cabeçalho: peça que recebeu o "sim" do cliente
 * e ficou parada porque ninguém a agendava. Aceitá-la aqui resgata o que já
 * está no banco sem criar um segundo caminho de publicação — a promoção
 * continua sendo a única porta para "scheduled".
 *
 * O que NÃO entra: "revision_requested" (o cliente pediu mudança nessa peça —
 * agendá-la seria publicar o que ele recusou), "published" e "failed".
 */
const ESTADOS_PROMOVIVEIS = ["draft", "approved"];

export interface AgendamentoFeito {
  projectId: string;
  criados: number;
  /** Entregas que já tinham virado calendário — não duplicamos. */
  jaAgendadas: number;
  /** Entregas cujo texto o leitor não conseguiu quebrar em peças. */
  naoInterpretadas: string[];
  /**
   * Peças que NÃO viraram post porque o pilar está bloqueado
   * (`lib/agency/execution/pilares-bloqueados.ts`).
   *
   * Campo próprio, e não um silêncio: a peça descartada aqui é trabalho pago que
   * não vai ao calendário. Errar para menos, nunca em segredo — é a mesma regra
   * de `naoInterpretadas`, logo acima.
   */
  bloqueadasPorPilar: Array<{ pilar: string; motivo: string }>;
  /**
   * Entregas que existem e NÃO viraram calendário porque a escada não as
   * liberou ou a Qualidade não as aprovou.
   *
   * Campo próprio pelo mesmo motivo dos dois de cima: o que este conserto barra
   * é trabalho já pago, e barrar em silêncio troca um defeito visível (peça
   * ruim no portal) por um invisível (peça boa que nunca aparece e ninguém sabe
   * por quê). Vira também `ActivityEvent`, com o nome da entrega e o motivo.
   */
  retidas: Array<{ nome: string; motivo: string }>;
}

/**
 * Transforma as entregas de social apresentadas em posts com DATA.
 *
 * Idempotente POR ENTREGA (`deliverableId`): um `Deliverable` que já gerou
 * posts não gera de novo, mas uma entrega nova depois (mês 2, refação) gera.
 * Idempotência por projeto travaria a agência no primeiro mês para sempre.
 */
export async function agendarPostsDaEntrega(projectId: string): Promise<AgendamentoFeito> {
  const saida: AgendamentoFeito = { projectId, criados: 0, jaAgendadas: 0, naoInterpretadas: [], bloqueadasPorPilar: [], retidas: [] };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true },
  });
  // Só agenda o que o cliente já viu. Agendar antes da apresentação encheria o
  // calendário dele com coisa que ele ainda não aprovou.
  if (!projeto?.presentedAt) return saida;

  // ⚠️ `visibility` e `revisionStatus` são LIDOS, e a exclusão acontece em
  // código logo abaixo — não num `where`. É a mesma escolha de
  // `refacao.ts:216`, e pelo mesmo motivo: filtrando no banco, a entrega
  // barrada simplesmente não existe para esta função, e ninguém consegue dizer
  // ao operador POR QUE o calendário do cliente veio menor do que o pacote.
  const candidatas = await prisma.deliverable.findMany({
    where: { projectId, type: { in: [...TIPOS_PUBLICAVEIS] } },
    select: { id: true, name: true, content: true, type: true, visibility: true, revisionStatus: true },
    orderBy: { createdAt: "asc" },
  });
  if (candidatas.length === 0) return saida;

  const entregas: typeof candidatas = [];
  for (const c of candidatas) {
    const motivo = motivoParaNaoVirarCalendario(c);
    if (motivo) saida.retidas.push({ nome: c.name, motivo });
    else entregas.push(c);
  }
  if (saida.retidas.length > 0) {
    // O alerta carrega a própria evidência: qual entrega e por quê. "Algo foi
    // retido" sem o caso concreto é ruído que ninguém investiga.
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId,
        projectId,
        clientId: projeto.clientId,
        type: "calendario_reteve_entrega",
        message: `${saida.retidas.length} entrega(s) de social NÃO entraram no calendário do cliente: ${saida.retidas.map((r) => `"${r.nome}" — ${r.motivo}`).join(" | ")}`.slice(0, 900),
      },
    }).catch(() => { /* best-effort: o registro não pode travar o agendamento */ });
  }
  if (entregas.length === 0) return saida;

  const jaFeitas = new Set(
    (
      await prisma.socialPost.findMany({
        where: { deliverableId: { in: entregas.map((e) => e.id) } },
        select: { deliverableId: true },
      })
    ).map((p) => p.deliverableId),
  );

  // Continua de onde o calendário parou: se o mês 1 já ocupou as próximas 4
  // semanas, o mês 2 começa depois — e não em cima.
  let cursor = await proximaDataLivre(projeto.workspaceId, projeto.clientId);

  for (const entrega of entregas) {
    if (jaFeitas.has(entrega.id)) {
      saida.jaAgendadas++;
      continue;
    }

    const pecas = extrairPecas(entrega.content ?? "", entrega.type);
    if (pecas.length === 0) {
      // Não é erro silencioso: alguém precisa saber que uma entrega paga não
      // virou calendário. Errar para menos, mas nunca em segredo.
      saida.naoInterpretadas.push(entrega.name);
      continue;
    }

    // Espalhadas ao longo de ~4 semanas.
    const intervaloDias = Math.max(1, Math.floor(28 / pecas.length));
    for (const peca of pecas) {
      // ── A TRAVA DE PILAR, ANTES DE A PEÇA EXISTIR ─────────────────────────
      // Barrar só na hora da arte deixaria a peça no calendário do CLIENTE,
      // com data marcada, para nunca sair — que é a definição de fila morta.
      // Aqui ela simplesmente não nasce, e o fato é registrado.
      //
      // `exigido: true` porque ESTE é o caminho automático: a peça saiu de um
      // `Deliverable` produzido por especialista, e desde 15/08/2026 o prompt
      // exige o campo `pillar`, o contrato de saída o confere e o markdown o
      // emite. Pilar ausente aqui não é "esta casa não usa pilar" — é sinal de
      // que a corrente arrebentou em algum ponto, e isso não pode significar
      // liberado. Ver `pilares-bloqueados.ts`, `ComoConferirOPilar.exigido`.
      const veredito = conferirPilar(peca.pilar, { exigido: true });
      if (veredito.bloqueado) {
        saida.bloqueadasPorPilar.push({ pilar: peca.pilar ?? "", motivo: veredito.motivo ?? "" });
        await prisma.activityEvent.create({
          data: {
            workspaceId: projeto.workspaceId,
            clientId: projeto.clientId,
            projectId,
            type: "pilar_bloqueado",
            message: `Peça NÃO entrou no calendário: ${veredito.motivo ?? "pilar bloqueado"}`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode travar a rodada */ });
        continue;
      }

      await prisma.socialPost.create({
        data: {
          workspaceId: projeto.workspaceId,
          clientId: projeto.clientId,
          clientRequestId: projeto.clientRequestId,
          deliverableId: entrega.id,
          caption: peca.legenda,
          networks: JSON.stringify(["instagram"]),
          format: peca.formato,
          pillar: peca.pilar,
          // A direção de arte chega ao POST — e é daqui que ela alcança o
          // gerador de imagem (`artes.ts`). Antes de 15/08/2026 ela parava no
          // markdown do entregável.
          artDirection: peca.direcaoDeArte,
          scenesJson: JSON.stringify(peca.cenas),
          scheduledFor: new Date(cursor),
          // "draft", não "scheduled": a data está proposta, e quem aprova o
          // calendário é o cliente. Nascer já agendado publicaria sem aval.
          status: "draft",
          // O calendário existe PARA o cliente ver e aprovar — e só é montado
          // depois da apresentação (checagem de `presentedAt` acima). Por isso
          // o post nasce "compartilhado" aqui, por decisão explícita, e não
          // pelo default do modelo (que é "interno", fail-closed).
          visibility: "compartilhado",
        },
      });
      saida.criados++;
      cursor = new Date(cursor.getTime() + intervaloDias * 24 * 60 * 60_000);
    }
  }

  return saida;
}

/**
 * O cliente aprovou o pacote → o calendário passa a valer.
 *
 * Este é o consentimento. Sem ele nenhum post desta casa vai ao ar em nome de
 * ninguém — é a diferença entre uma agência e um robô de spam.
 *
 * Datas que já passaram enquanto o cliente pensava são empurradas para frente:
 * aprovar na sexta não pode disparar de uma vez tudo que estava marcado para a
 * quarta.
 */
export async function aprovarCalendario(projectId: string): Promise<{ agendados: number }> {
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientRequestId: true, clientApprovedAt: true },
  });
  if (!projeto?.clientApprovedAt || !projeto.clientRequestId) return { agendados: 0 };

  const rascunhos = await prisma.socialPost.findMany({
    where: { clientRequestId: projeto.clientRequestId, status: { in: ESTADOS_PROMOVIVEIS } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, scheduledFor: true },
  });
  return { agendados: await promoverParaAgendado(rascunhos) };
}

export interface CalendarioDoCiclo {
  cycleId: string | null;
  agendados: number;
  /** Por que nada foi agendado. Vazio quando agendou. */
  motivo?: string;
}

/**
 * O calendário DESTE CICLO passa a valer — o irmão mensal de `aprovarCalendario`.
 *
 * ── O buraco que isto fecha (05/08/2026) ─────────────────────────────────────
 * `aprovarCalendario` exige `Project.clientApprovedAt`, e quem o carimba é
 * `aprovarPacote`, que aborta de saída se o carimbo já existe. Ou seja: o
 * caminho `draft → scheduled` só funcionava UMA vez na vida do projeto, no
 * pacote inicial. Do mês 2 em diante `apresentarCiclo` escrevia ao cliente
 * "Aprove e a gente já agenda as publicações", ele aprovava, e o mês inteiro
 * ficava em rascunho. Todo mês. Mensalidade cobrada, nada indo ao ar.
 *
 * Por isso esta função NÃO passa por `aprovarPacote`: o consentimento do mês 2
 * não é o consentimento do contrato, é o do CICLO. As duas travas que sobram
 * são as que importam de verdade:
 *   • o ciclo precisa ter sido APRESENTADO (`presentedAt`) — o cliente não
 *     consente com o que não viu;
 *   • quem chama garante que não sobrou aprovação pendente do cliente.
 *
 * O recorte é por ciclo, via `Deliverable.cycleId`: aprovar o mês 2 não pode
 * agendar de carona um rascunho do mês 3 que ainda nem foi apresentado.
 */
export async function aprovarCalendarioDoCiclo(
  projectId: string,
  cycleId: string,
): Promise<CalendarioDoCiclo> {
  const ciclo = await prisma.cycle.findUnique({
    where: { id: cycleId },
    select: { id: true, projectId: true, presentedAt: true },
  });
  if (!ciclo || ciclo.projectId !== projectId) {
    return { cycleId: null, agendados: 0, motivo: "ciclo não encontrado neste projeto" };
  }
  if (!ciclo.presentedAt) {
    return { cycleId, agendados: 0, motivo: "o ciclo ainda não foi apresentado ao cliente" };
  }

  const entregas = await prisma.deliverable.findMany({
    where: { projectId, cycleId },
    select: { id: true },
  });
  if (entregas.length === 0) return { cycleId, agendados: 0, motivo: "o ciclo não tem entregas" };

  const rascunhos = await prisma.socialPost.findMany({
    where: {
      deliverableId: { in: entregas.map((e) => e.id) },
      status: { in: ESTADOS_PROMOVIVEIS },
    },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, scheduledFor: true },
  });
  return { cycleId, agendados: await promoverParaAgendado(rascunhos) };
}

/**
 * O ciclo que o cliente acabou de aprovar: o último APRESENTADO do projeto.
 *
 * É o que a ponte do portal chama quando `aprovarPacote` não se aplica mais
 * (projeto já aprovado = mês 2 em diante). Idempotente: rodar de novo só
 * encontra peças que já saíram de "draft" e agenda zero.
 */
export async function aprovarCalendarioDoCicloCorrente(projectId: string): Promise<CalendarioDoCiclo> {
  const ciclo = await prisma.cycle.findFirst({
    where: { projectId, presentedAt: { not: null } },
    orderBy: { reference: "desc" },
    select: { id: true },
  });
  if (!ciclo) return { cycleId: null, agendados: 0, motivo: "nenhum ciclo apresentado neste projeto" };
  return aprovarCalendarioDoCiclo(projectId, ciclo.id);
}

export interface PecasAgendadas {
  agendados: number;
  /** Peças do card que a promoção NÃO tocou, com o estado em que ficaram.
   *  Existe para que "não agendei esta" seja um dado visível e não um silêncio —
   *  peça que some entre o clique do cliente e o relógio é trabalho preso. */
  ignorados: Array<{ postId: string; status: string }>;
}

/**
 * O CLIENTE APROVOU O CARD → as peças dele viram calendário que vale.
 *
 * Esta é a ponte que faltava (ver o cabeçalho): o clique de "Aprovar" num card
 * de calendário — o caminho do cliente direto, sem `ClientRequestDb`, que é o
 * caso da Foocci — passa a produzir o MESMO estado que a aprovação do pacote,
 * com o mesmo empurrão de datas. Nada de estado intermediário que ninguém lê.
 *
 * `clientId` é do CARD, derivado do token pela rota: id de post de outro
 * cliente dentro do JSON continua intocável.
 */
export async function agendarPecasAprovadas(entrada: {
  clientId: string;
  postIds: string[];
}): Promise<PecasAgendadas> {
  const ids = [...new Set(entrada.postIds.filter((id) => typeof id === "string" && id))];
  if (ids.length === 0 || !entrada.clientId) return { agendados: 0, ignorados: [] };

  const pecas = await prisma.socialPost.findMany({
    where: { id: { in: ids }, clientId: entrada.clientId },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, scheduledFor: true, status: true },
  });

  const promoviveis = pecas.filter((p) => ESTADOS_PROMOVIVEIS.includes(p.status));
  const ignorados = pecas
    .filter((p) => !ESTADOS_PROMOVIVEIS.includes(p.status))
    .map((p) => ({ postId: p.id, status: p.status }));

  return { agendados: await promoverParaAgendado(promoviveis), ignorados };
}

export interface PublicacaoFeita {
  publicados: number;
  falhas: Array<{ postId: string; erro: string }>;
  /**
   * Peças que a rodada NÃO publicou por espaçamento — e que vão sair sozinhas
   * numa rodada seguinte.
   *
   * Campo próprio, separado de `falhas`, porque não é falha: nada quebrou e
   * ninguém precisa agir. Escrever isso em `lastError` pintaria a ficha da peça
   * de vermelho com "A publicação não completou", que é mentira, a cada 5
   * minutos. Mas também não é silêncio — o despertador imprime, com o post e o
   * motivo, e fila parada com testemunha é o mínimo desta casa.
   */
  adiados: Array<{ postId: string; motivo: string }>;
  /**
   * 27/09/2026 — IDEMPOTÊNCIA: peças que ficaram em "publish_unknown" nesta
   * rodada — falha ambígua ao publicar (não sabemos se a Meta processou o
   * pedido) ou recuperação de "publishing" preso por processo morto. Campo
   * próprio, separado de `falhas`: não é reagendável sozinho (a fila só lê
   * "scheduled") — tem dono humano e precisa de conferência no perfil do
   * Instagram. Ver `ActivityEvent` tipo "publicacao_incerta" para o rastro.
   */
  incertos: Array<{ postId: string; motivo: string }>;
}

/**
 * Publica o que está agendado e chegou a hora.
 *
 * Só toca em `status: "scheduled"` — o que está em `draft` ainda não teve aval.
 */
/**
 * Opções da rodada. Existem por UMA necessidade concreta: publicar uma peça
 * específica na hora, sem esperar o relógio — o botão "Publicar agora" do
 * Planner (e o vídeo de demonstração exigido pelo App Review da Meta, que
 * precisa MOSTRAR a publicação acontecendo).
 *
 * Repare no que isto NÃO é: um segundo caminho de publicação. É a MESMA
 * rodada, com a peça filtrada — todas as travas continuam na frente dela
 * (aprovação do cliente peça por peça, freio de emergência, ativo autorizado,
 * formato do arquivo, ritmo do perfil). Uma segunda porta seria uma segunda
 * porta para auditar, e esta casa já pagou por essa lição.
 */
export interface OpcoesDaRodada {
  /** Publica SÓ esta peça — e ainda assim só se ela estiver agendada e vencida. */
  apenasPostId?: string;
}

/**
 * RECUPERAÇÃO DE "publishing" PRESO (27/09/2026).
 *
 * Um processo que morre NO MEIO da chamada à Meta (deploy, OOM, o processo
 * caiu) deixa o post em "publishing" para sempre — a fila de `publicarAgendados`
 * só lê "scheduled", então ele nunca mais seria tocado, nem como falha nem
 * como sucesso. NÃO reenviamos sozinhos: não sabemos se a Meta já processou o
 * pedido antes do processo morrer, e reenviar arriscaria publicar a mesma
 * peça duas vezes. 15 min é generoso sobre o orçamento mais longo desta casa
 * (`ORCAMENTO_DE_VIDEO_MS`, 120s) — folga suficiente para não confundir
 * "ainda processando" com "morto", mesmo com o backoff de espera somado.
 *
 * Função PRÓPRIA, chamada pelo despertador FORA de `publicarAgendados`, de
 * propósito: as duas juntas na mesma função fariam TODA chamada a
 * `publicarAgendados` — inclusive "Publicar agora", inclusive a suíte inteira
 * que já mocka `prisma.socialPost.findMany` para devolver só a peça agendada
 * do teste, sem discriminar por `where` — carregar uma consulta a mais,
 * silenciosa, que os mocks antigos não sabem simular. Separada, ela tem teste
 * próprio e não desloca nenhum índice de chamada que a suíte de idempotência
 * já verifica.
 */
export async function recuperarPublicacoesPresas(
  agora: Date = new Date(),
): Promise<Array<{ postId: string; motivo: string }>> {
  const MINUTOS_PARA_CONSIDERAR_PRESO = 15;
  const recuperados: Array<{ postId: string; motivo: string }> = [];
  const presos = await prisma.socialPost
    .findMany({
      where: {
        status: "publishing",
        updatedAt: { lt: new Date(agora.getTime() - MINUTOS_PARA_CONSIDERAR_PRESO * 60_000) },
      },
      select: { id: true, workspaceId: true, clientId: true, scriptJson: true },
    })
    .catch(() => []);
  for (const preso of presos) {
    const motivo =
      `o processo que publicava esta peça parou no meio (mais de ${MINUTOS_PARA_CONSIDERAR_PRESO} min ` +
      'em "publishing") — não sei se ela saiu no Instagram. Confira no perfil do Instagram: ' +
      "se saiu, marque como publicada; se não, reagende.";
    await prisma.socialPost
      .update({ where: { id: preso.id }, data: { status: "publish_unknown", lastError: motivo } })
      .catch(() => { /* best-effort */ });
    await prisma.activityEvent
      .create({
        data: {
          workspaceId: preso.workspaceId,
          clientId: preso.clientId,
          type: "publicacao_incerta",
          message: `Publicação incerta (post ${preso.id}): ${motivo}`,
        },
      })
      .catch(() => { /* best-effort: o registro não pode travar a rodada */ });
    // Achado 2 (Q8-qualidade, 28/09/2026): se esta peça pertence a um
    // PostExterno (City Jobs), o contrato §8 promete o evento "em_conferencia"
    // exatamente neste caso — best-effort, nunca desfaz a recuperação acima.
    await sincronizarEstadoExterno(preso.id, { estado: "em_conferencia", motivo }, preso.scriptJson);
    recuperados.push({ postId: preso.id, motivo });
  }
  return recuperados;
}

// ─── STORY DERIVADO: "CAPA DO POST DO DIA" (27/09/2026) ─────────────────────
//
// Estados do PAI que significam "não vai sair — não adianta esperar". Fora
// desta lista, todo estado (draft, scheduled, approved, publishing, ou até um
// `pai` cujo status a casa venha a criar amanhã) é tratado como "ainda pode
// publicar" → adiado, nunca falha. É a mesma régua fail-closed de sempre,
// espelhada: aqui o lado seguro é NÃO desistir cedo demais.
const ESTADOS_SEM_VOLTA_DO_PAI: readonly string[] = ["failed", "publish_unknown", "cancelado"];

/**
 * Lê a dependência gravada pelo gerador (W12b) em `SocialPost.scriptJson`.
 * `null` para QUALQUER coisa que não seja exatamente o marcador esperado —
 * JSON quebrado, campo ausente, ou um scriptJson de outro uso (roteiro de
 * Reels) não pode ser lido como dependência por acidente.
 *
 * Exportada pela mesma razão de sempre: régua só testável de fora da rodada
 * inteira é régua que ninguém prova.
 */
export function lerDependenciaDoStory(scriptJson: string | null | undefined): { dependeDe: string } | null {
  if (!scriptJson) return null;
  let v: unknown;
  try {
    v = JSON.parse(scriptJson);
  } catch {
    return null;
  }
  if (
    v && typeof v === "object" &&
    (v as Record<string, unknown>).tipo === "capa_derivada" &&
    typeof (v as Record<string, unknown>).dependeDe === "string" &&
    (v as Record<string, unknown>).dependeDe
  ) {
    return { dependeDe: (v as Record<string, unknown>).dependeDe as string };
  }
  return null;
}

/**
 * Baixa a capa do post-pai pelo armazenamento da casa, converte para 9:16 com
 * `prepararImagemDeStory` (W10, `lib/integrations/meta/midia-de-story.ts`) e
 * grava como um `MediaAsset` NOVO — nunca sobrescreve o arquivo do pai, que
 * continua existindo como capa do post original.
 *
 * A capa só é aceita vinda do armazenamento desta casa (`/api/media/<id>`):
 * é o que `prisma.mediaAsset` sabe entregar em bytes. Uma capa gravada como
 * link externo (Drive antigo) não tem por onde ser baixada aqui — falha com
 * motivo, não tenta adivinhar.
 */
async function prepararCapaDeStoryDerivado(
  capaUrl: string,
  story: { id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null },
): Promise<{ ok: true; mediaUrl: string } | { ok: false; motivo: string }> {
  if (!capaUrl.startsWith("/api/media/")) {
    return {
      ok: false,
      motivo: "a capa do post do dia não está no armazenamento desta casa — não consigo convertê-la para story",
    };
  }
  const id = capaUrl.split("/api/media/")[1]?.split("?")[0] ?? "";
  const asset = await prisma.mediaAsset.findUnique({ where: { id } }).catch(() => undefined);
  if (asset === undefined) {
    return { ok: false, motivo: "não consegui conferir a capa do post do dia (banco indisponível)" };
  }
  if (!asset) {
    return { ok: false, motivo: "a capa do post do dia não existe mais no armazenamento — o story derivado não sai" };
  }
  const bytes = await lerArquivo(asset.storagePath).catch(() => null);
  if (!bytes || bytes.length === 0) {
    return { ok: false, motivo: "não encontrei os bytes da capa do post do dia no volume — o story derivado não sai" };
  }
  const preparo = await prepararImagemDeStory(Buffer.from(bytes), asset.mimeType);
  if (!preparo.ok) {
    return { ok: false, motivo: `não consegui converter a capa do post do dia para story: ${preparo.motivo}` };
  }
  const guardado = await guardarArquivo({
    bytes: preparo.buffer,
    fileName: `story-derivado-${story.id}.jpg`,
    mimeType: preparo.mime,
    workspaceId: story.workspaceId,
    clientId: story.clientId,
    clientRequestId: story.clientRequestId,
    kind: "generated",
    uploadedBy: "esteira",
  });
  if (!guardado.ok) {
    return { ok: false, motivo: `não consegui gravar a capa convertida do story derivado: ${guardado.motivo}` };
  }
  return { ok: true, mediaUrl: `/api/media/${guardado.arquivo.id}` };
}

export async function publicarAgendados(opcoes: OpcoesDaRodada = {}): Promise<PublicacaoFeita> {
  const saida: PublicacaoFeita = { publicados: 0, falhas: [], adiados: [], incertos: [] };
  const agora = new Date();
  /** A última publicação de cada perfil, medida uma vez por rodada e atualizada
   *  a cada post que sai. É o que impede duas peças do MESMO cliente de saírem
   *  juntas dentro desta mesma passada, onde o banco ainda não sabe da primeira. */
  const ultimaDoPerfil = new Map<string, Date | null>();

  const pendentes = await prisma.socialPost.findMany({
    where: {
      status: ESTADO_QUE_A_FILA_LE,
      scheduledFor: { lte: agora },
      ...(opcoes.apenasPostId ? { id: opcoes.apenasPostId } : {}),
    },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PUBLICACOES_POR_RODADA,
  });
  if (pendentes.length === 0) return saida;

  for (const post of pendentes) {
    // 27/09/2026 — IDEMPOTÊNCIA: vira `true` só depois da reserva atômica,
    // logo antes de `publishPost`. `falhar()` lê esta flag para saber se
    // precisa DEVOLVER o post para "scheduled" (ele está em "publishing") ou
    // se não precisa mexer no status (as travas anteriores à reserva nunca
    // tiraram o post de "scheduled" — não escrever é comportamento inalterado,
    // e é o que os testes anteriores a esta data já verificam campo a campo).
    let reservado = false;

    const falhar = async (erro: string) => {
      saida.falhas.push({ postId: post.id, erro });
      // ── 06/08/2026: A FALHA DE PUBLICAÇÃO NÃO TINHA TESTEMUNHA ─────────────
      // `lastError` é um campo dentro de um post: para vê-lo é preciso já
      // suspeitar e ir procurar. Os 6 carrosséis da Foocci estavam marcados
      // para as 07h de 07/08 SEM as telas do carrossel (`mediaUrls` vazio) —
      // iam falhar em silêncio na madrugada, e o CEO descobriria pelo cliente.
      // A hora marcada que não aconteceu é notícia, e notícia sobe ao painel.
      //
      // Só no PRIMEIRO erro, ou quando o MOTIVO muda: o post continua
      // "scheduled" e o relógio re-tenta a cada 5 min — um evento por tentativa
      // seriam 288 linhas iguais por dia, que é como um painel ensina a ser
      // ignorado.
      const motivoMudou = post.lastError !== erro;
      // O post CONTINUA "scheduled": a causa quase sempre é externa e
      // temporária (conta não conectada, mídia faltando). Marcar como falha
      // permanente enterraria trabalho pago. `lastError` é o que fica visível.
      await prisma.socialPost
        .update({ where: { id: post.id }, data: { ...(reservado ? { status: "scheduled" } : {}), lastError: erro } })
        .catch(() => { /* best-effort */ });
      if (motivoMudou) {
        await prisma.activityEvent.create({
          data: {
            workspaceId: post.workspaceId,
            clientId: post.clientId,
            type: "publicacao_falhou",
            message: `Post NÃO foi ao ar na hora marcada (${post.scheduledFor?.toISOString() ?? "sem data"}): ${erro}`,
          },
        }).catch(() => { /* best-effort: o registro não pode travar a rodada */ });
      }
      // Achado 2 (Q8-qualidade, 28/09/2026): "falha clara" (contrato §8,
      // evento "falhou") — se esta peça pertence a um PostExterno. A própria
      // função de sincronização é idempotente pelo `motivo`: repetir o mesmo
      // erro a cada 5 min não reenfileira webhook de novo.
      await sincronizarEstadoExterno(post.id, { estado: "falhou", motivo: erro }, post.scriptJson);
    };

    // ── FALHA AMBÍGUA (27/09/2026) ─────────────────────────────────────────
    // Diferente de `falhar`: aqui não sabemos se a peça foi ao ar. NUNCA volta
    // para "scheduled" — isso a devolveria para a fila, que republicaria uma
    // peça que talvez já esteja no perfil do cliente. Fica em "publish_unknown"
    // até alguém CONFERIR no Instagram e decidir.
    const marcarAmbigua = async (erro: string) => {
      saida.incertos.push({ postId: post.id, motivo: erro });
      await prisma.socialPost
        .update({ where: { id: post.id }, data: { status: "publish_unknown", lastError: erro } })
        .catch(() => { /* best-effort */ });
      await prisma.activityEvent
        .create({
          data: {
            workspaceId: post.workspaceId,
            clientId: post.clientId,
            type: "publicacao_incerta",
            message:
              `Publicação incerta (${post.scheduledFor?.toISOString() ?? "sem data"}): ${erro} ` +
              "Dono: quem opera o calendário. Próxima ação: conferir no perfil do Instagram se a peça " +
              "saiu; se saiu, marcar como publicada; se não, reagendar.",
          },
        })
        .catch(() => { /* best-effort: o registro não pode travar a rodada */ });
      // Achado 2 (Q8-qualidade, 28/09/2026): o evento "em_conferencia" do
      // contrato §8 — "a Dioli confere à mão, e o City Jobs não deve reenviar".
      await sincronizarEstadoExterno(post.id, { estado: "em_conferencia", motivo: erro }, post.scriptJson);
    };

    // ── A TRAVA DE PILAR, DE NOVO, NA ÚLTIMA PORTA ─────────────────────────
    // Não é redundância: os posts que JÁ estão no banco de produção nasceram
    // antes de a trava existir, e o calendário deles não passa por
    // `agendarPostsDaEntrega` outra vez. Uma trava só na entrada protege o
    // futuro e deixa o passado sair. Esta é a porta pela qual o dano chega ao
    // público — é aqui que ela precisa valer mesmo se as outras falharem.
    const vereditoDoPilar = conferirPilar(post.pillar);
    if (vereditoDoPilar.bloqueado) {
      await falhar(motivoCurto(vereditoDoPilar));
      continue;
    }

    // A conta do CLIENTE, não a da agência. `clientId` nulo numa conexão
    // significa "conta da própria Dioli" — publicar o post de um cliente por
    // ali seria postar no perfil errado.
    if (!post.clientId) {
      await falhar("post sem cliente definido — não sei em qual perfil postar");
      continue;
    }

    // ── O FREIO DE RAJADA, ANTES DE QUALQUER TRABALHO ─────────────────────
    // Aqui em cima de propósito: barrar depois de montar link assinado e ler
    // arquivo gastaria trabalho para jogar fora. E antes de qualquer coisa que
    // se pareça com falar com a plataforma.
    //
    // ── POR PERFIL E POR FAMÍLIA (27/09/2026) ─────────────────────────────
    // A Sushi Cazza publica 6–8 stories por dia a partir das 18h — com o
    // freio medido por perfil (sem olhar formato), o segundo story do dia
    // esperaria 2h, e a rotina do cliente nunca caberia na régua. Story e
    // feed agora são medidos SEPARADOS: a última publicação de UM formato não
    // freia o outro (`normalizarFormato`: "story" é uma família; "feed",
    // "reel" e "carousel" são a outra — "feed-família"). A chave do mapa (e da
    // consulta) inclui a família por isso.
    const familiaDoPost = normalizarFormato(post.format) === "story" ? "story" : "feed";
    const chaveDoFreio = `${post.clientId}:${familiaDoPost}`;
    if (!ultimaDoPerfil.has(chaveDoFreio)) {
      const medida = await prisma.socialPost
        .findFirst({
          where: {
            clientId: post.clientId,
            status: "published",
            publishedAt: { not: null },
            // Só a família deste post: um feed publicado agora não pode segurar
            // um story (nem o contrário) — são réguas de intervalo diferentes.
            format: familiaDoPost === "story" ? "story" : { not: "story" },
          },
          orderBy: { publishedAt: "desc" },
          select: { publishedAt: true },
        })
        .then((r) => r?.publishedAt ?? null)
        // Fail-closed: não conseguir medir não pode virar permissão de publicar.
        // `undefined` marca "não medi" e é diferente de `null` ("nunca publicou").
        .catch(() => undefined);
      if (medida === undefined) {
        saida.adiados.push({
          postId: post.id,
          motivo: "não consegui medir a última publicação deste perfil — na dúvida, não publico",
        });
        continue;
      }
      ultimaDoPerfil.set(chaveDoFreio, medida);
    }

    // O intervalo do FEED é a constante fixa de sempre; o de STORY vem do
    // pacote da marca (`pacote.stories.intervaloMinimoMin`). O MESMO pacote
    // alimenta os COLABORADORES lá embaixo — uma leitura só por post, feita
    // aqui, reaproveitada nos dois lugares (1C-C5, 27/09/2026).
    //
    // Pacote é ENRIQUECIMENTO (intervalo de story, colaboradores): se não der
    // para ler, a publicação segue com o padrão — nunca some da fila por
    // causa disto. `try/catch`, NUNCA só `.catch()` no fim de uma cadeia:
    // quando o dublê de teste não tem `client`, o acesso à PROPRIEDADE já
    // estoura SÍNCRONO, antes de existir promessa para o `.catch()` pegar —
    // mesmo raciocínio de `lib/ai/registro-de-custo.ts`.
    let pacoteDaMarca: PacoteDaMarca | null = null;
    try {
      const perfilDoPost = await prisma.client.findUnique({
        where: { id: post.clientId },
        select: { pacoteJson: true },
      });
      const lido = lerPacote(perfilDoPost?.pacoteJson ?? null);
      pacoteDaMarca = lido.ok ? lido.pacote : null;
    } catch {
      pacoteDaMarca = null;
    }

    // Fail-closed: pacote ilegível, ausente ou banco fora do ar → o padrão de
    // `intervaloDoFormato` (30 min), nunca um intervalo maior nem "sem freio".
    let intervaloAplicavel = INTERVALO_MINIMO_POR_PERFIL_MS;
    if (familiaDoPost === "story") {
      intervaloAplicavel = intervaloDoFormato(post.format, pacoteDaMarca, post.id);

      // ── A RAMPA DA PRIMEIRA SEMANA, ANTES DO ESPAÇAMENTO (27/09/2026) ─────
      // Mesmo raciocínio do freio de rajada logo acima: barrar antes de
      // qualquer trabalho de verdade. Adiado, não falha — a peça sai sozinha
      // amanhã, quando o teto do dia abrir de novo.
      const rampa = await confereRampaDeStoriesDoDia(post.clientId, agora, pacoteDaMarca);
      if (!rampa.ok) {
        saida.adiados.push({ postId: post.id, motivo: rampa.motivo });
        continue;
      }
    }

    const espera = faltaEsperar(ultimaDoPerfil.get(chaveDoFreio) ?? null, agora, intervaloAplicavel);
    if (espera > 0) {
      const minutos = Math.ceil(espera / 60_000);
      saida.adiados.push({
        postId: post.id,
        motivo:
          `este perfil publicou ${familiaDoPost === "story" ? "um story" : "um feed"} há pouco — a próxima peça ` +
          `sai em ~${minutos} min. Seis peças no mesmo minuto não é calendário, é rajada.`,
      });
      continue;
    }

    // ── O PORTÃO DE MARCA, NO CAMINHO DA ENTREGA (09/08/2026) ──────────────
    //
    // O Conselho listou nove premissas para a constituição do `branding` e
    // avisou que nenhuma tinha sido verificada. Oito esta casa cumpria. A que
    // faltava era a que sustenta todas:
    //
    //   > "O portão é bloqueante de fato: não existe rota alternativa para
    //   >  entregar contornando o portão."
    //
    // Existia. ESTA função era a rota: lia `socialPost` agendado e entregava.
    // Enquanto ela existisse assim, qualquer portão de marca ficaria AO LADO do
    // caminho, e não NO caminho — decorativo por melhor que fosse a
    // constituição.
    //
    // Por que aqui, e não na produção: a produção protege o futuro; esta é a
    // porta pela qual o dano chega ao público, e ela precisa valer mesmo para
    // as peças que nasceram antes de qualquer trava existir. É o mesmo
    // raciocínio da trava de pilar logo acima, e pela mesma razão.
    //
    // O que ele NÃO faz, de propósito: não julga a peça. Julgar identidade é do
    // agente `branding`, e ele não pode fazê-lo sem régua registrada. Este
    // portão pergunta uma coisa só, e é a mais básica: **esta marca chegou a
    // declarar alguma regra?** Publicar em nome de uma marca sobre a qual a casa
    // não sabe NADA é o caso que nenhuma revisão posterior conserta — o post
    // fica no perfil do cliente.
    const marca = await contratoDeMarca(post.clientId).catch(() => null);
    if (!marca) {
      // Fail-closed: não conseguir LER a régua não pode virar permissão. É o
      // mesmo princípio do "sem portão = reprovado".
      await falhar("não consegui ler a régua de marca deste cliente — não publico sem saber por qual régua a peça foi feita");
      continue;
    }
    if (marca.naoConstituida) {
      // ── A APROVAÇÃO DO CEO VALE COMO RÉGUA (CEO, 01/10/2026) ──────────────
      // Marca com ficha incompleta publica SE, e só se, o CEO aprovou ESTA
      // peça (carimbo `ceo:`). A peça sai carimbada `fichaIncompleta`. Sem a
      // aprovação dele — inclusive com aprovação do cliente ou por regra de
      // modo —, continua parada, como antes.
      const peloCeo = await aprovadaPeloCeo(post.id, post.clientId).catch(() => false);
      if (!peloCeo) {
        await falhar(
          "marca não constituída: este cliente não declarou nenhuma regra de marca — " +
            "nem proibição, nem identidade. Com a ficha incompleta, só sai peça aprovada pelo CEO " +
            "(\"Aprovar semana (CEO)\"). Preencha a ficha de marca, ou peça a aprovação do CEO.",
        );
        continue;
      }
      const carimbado = comFichaIncompleta(post.scriptJson);
      if (carimbado) {
        await prisma.socialPost
          .update({ where: { id: post.id }, data: { scriptJson: carimbado } })
          .catch(() => undefined);
      }
    }
    const conexao = await conexaoDoCliente(post.workspaceId, post.clientId, "instagram")
      .catch(() => null);
    if (!conexao) {
      await falhar("o cliente ainda não conectou o Instagram");
      continue;
    }
    // Conexão existe mas o token morreu: é OUTRA pendência — "reconecte", não
    // "conecte". O helper devolve a mais recente em qualquer status justamente
    // para esta frase ser verdadeira.
    if (conexao.status !== "connected") {
      await falhar("a conexão com o Instagram precisa ser refeita (token vencido ou revogado)");
      continue;
    }

    // ── STORY DERIVADO: A CAPA DO POST DO DIA (27/09/2026) ─────────────────
    //
    // W12b (o gerador) grava um story com `scriptJson` contendo
    // `{"dependeDe":"<postId do pai>","tipo":"capa_derivada"}` quando o slot é
    // "recorte do post do feed do dia, em 9:16" — em vez de um slot próprio na
    // agenda de stories. Esta peça não tem `mediaUrl` ao nascer: a arte é a
    // CAPA do post-pai, e o post-pai pode não ter publicado ainda.
    //
    // Por isso a checagem é DE ESTADO, não de conteúdo: o pai precisa estar
    // "published" COM `externalPostId` (a prova de que foi mesmo ao ar, não só
    // que o campo mudou de nome) antes de este story poder nascer de verdade.
    // Enquanto isso, "adiado" — a peça sai sozinha assim que o pai publicar, e
    // não é falha de ninguém. Se o pai já FALHOU de vez (`failed`,
    // `publish_unknown`, `cancelado`), esperar seria esperar para sempre —
    // aqui é `falhar`, com dono e próxima ação, não silêncio.
    const dependencia = lerDependenciaDoStory(post.scriptJson);
    if (dependencia) {
      // ⚠️ ACHADO DE SEGURANÇA (27/09/2026) — POSSE, NÃO SÓ EXISTÊNCIA.
      // `dependencia.dependeDe` é um id de `SocialPost` gravado em
      // `scriptJson`, e `PATCH /api/social-posts/[id]` aceita `body.script`
      // como objeto ARBITRÁRIO de qualquer staff (`master`, `project_manager`,
      // `social_staff`) — nada impede alguém de escrever
      // `{"tipo":"capa_derivada","dependeDe":"<id de post de OUTRO
      // workspace>"}` num post seu. Sem `workspaceId` no `where`, esta consulta
      // leria `status`/`externalPostId`/`mediaUrl` de QUALQUER post do
      // sistema, e a rodada baixaria e REPUBLICARIA a capa do cliente alheio
      // como story deste — vazamento e publicação cross-tenant, o "achado
      // mais comum e mais caro" (posse de recurso vindo da requisição sem
      // verificação). `workspaceId` no `where` (nunca numa comparação depois)
      // é a mesma régua de `posse-do-cliente.ts`.
      const pai = await prisma.socialPost
        .findUnique({
          where: { id: dependencia.dependeDe, workspaceId: post.workspaceId },
          select: { status: true, externalPostId: true, mediaUrl: true, mediaUrlsJson: true },
        })
        .catch(() => undefined);
      if (pai === undefined) {
        await falhar("não consegui conferir o post do dia do qual este story depende (banco indisponível)");
        continue;
      }
      if (!pai) {
        await falhar("o post do dia do qual este story depende não existe mais — o story derivado não sai");
        continue;
      }
      if (ESTADOS_SEM_VOLTA_DO_PAI.includes(pai.status)) {
        await falhar("o post do dia não publicou — o story derivado não sai");
        continue;
      }
      if (pai.status !== "published" || !pai.externalPostId) {
        saida.adiados.push({ postId: post.id, motivo: "esperando o post do dia publicar" });
        continue;
      }
      if (!post.mediaUrl) {
        const capaDoPai = pai.mediaUrl ?? lerLista(pai.mediaUrlsJson)[0] ?? null;
        if (!capaDoPai) {
          await falhar("o post do dia publicou mas não tem capa (imagem) para o story derivar");
          continue;
        }
        const preparo = await prepararCapaDeStoryDerivado(capaDoPai, {
          id: post.id,
          workspaceId: post.workspaceId,
          clientId: post.clientId,
          clientRequestId: post.clientRequestId,
        });
        if (!preparo.ok) {
          await falhar(preparo.motivo);
          continue;
        }
        // A gravação acontece AQUI, e não só na atualização de sucesso lá
        // embaixo: uma rodada seguinte não pode reconverter a mesma capa se
        // esta rodada falhar num passo posterior (formato, direção interna,
        // etc.) — a mídia já preparada é reaproveitada.
        await prisma.socialPost
          .update({ where: { id: post.id }, data: { mediaUrl: preparo.mediaUrl } })
          .catch(() => { /* best-effort: a variável local abaixo já tem o valor certo */ });
        post.mediaUrl = preparo.mediaUrl;
      }
    }

    // O Instagram exige mídia em TODO formato. Sem peça, a legenda sozinha não
    // vira post — e isso precisa aparecer como pendência, não como sucesso
    // silencioso. A mensagem muda com o formato porque a AÇÃO muda: falta arte
    // é problema nosso; falta vídeo é material que só o cliente tem.
    const formato = normalizarFormato(post.format);
    const ehVideo = formato === "reel";

    // ── CARROSSEL: várias imagens, e todas precisam de link público ──────────
    // Publicar um carrossel incompleto entregaria ao seguidor uma sequência
    // que perde o sentido no meio.
    let carrossel: string[] = [];
    if (formato === "carousel") {
      const guardadas = lerLista(post.mediaUrlsJson);
      // `linksPublicosDaMidia` e não `urlPublicaDaMidia` cru: a assinatura do
      // link LANÇA quando falta `AUTH_SECRET`, e um `throw` aqui matava a
      // rodada inteira sem gravar `lastError` em post nenhum. Ver o cabeçalho
      // daquela função.
      const r = await linksPublicosDaMidia(guardadas);
      if (r.erro) {
        await falhar(r.erro);
        continue;
      }
      carrossel = r.links;
      if (carrossel.length < 2) {
        await falhar(
          guardadas.length === 0
            ? "o carrossel ainda não tem as artes das telas"
            : `só ${carrossel.length} de ${guardadas.length} telas do carrossel têm link público`,
        );
        continue;
      }
    }

    const simples = await linksPublicosDaMidia([post.mediaUrl]);
    if (simples.erro) {
      await falhar(simples.erro);
      continue;
    }
    const mediaUrl = simples.links[0];
    if (formato !== "carousel" && !mediaUrl) {
      await falhar(
        post.mediaUrl
          ? "não consegui gerar link público da mídia (falta domínio público configurado)"
          : ehVideo
            ? "a peça ainda não tem vídeo — falta o material bruto do cliente para editarmos"
            : "a peça ainda não tem imagem — o Instagram não aceita post só com legenda",
      );
      continue;
    }

    // ── O FORMATO DO ARQUIVO, ANTES DE FALAR COM A META ─────────────────────
    // 08/08/2026: com o interruptor JÁ LIBERADO, os 6 carrosséis da Foocci
    // falhavam 12 vezes por hora com "Only photo or video can be accepted as
    // media type" — as 36 telas são PNG, e o Instagram só aceita JPEG. A casa
    // descobria isso PERGUNTANDO À META, em rajada permanente, contra a conta
    // de um cliente, com o app sem App Review. É o padrão de 03/08. Ver
    // `lib/integrations/meta/formato-de-midia.ts`.
    const idsDaPeca = (formato === "carousel" ? lerLista(post.mediaUrlsJson) : [post.mediaUrl])
      .filter((u): u is string => !!u && u.startsWith("/api/media/"))
      .map((u) => u.split("/api/media/")[1]?.split("?")[0] ?? "")
      .filter((id) => id.length > 0);
    if (idsDaPeca.length > 0) {
      const linhas = await prisma.mediaAsset
        .findMany({ where: { id: { in: idsDaPeca } }, select: { id: true, mimeType: true } })
        .catch(() => null);
      // Banco fora do ar não vira permissão: sem saber o formato, não se
      // arrisca a chamada. Fail-closed, como a trava de publicação ao lado.
      if (!linhas) {
        await falhar("não consegui conferir o formato dos arquivos desta peça (banco indisponível)");
        continue;
      }
      const porId = new Map(linhas.map((l) => [l.id, l.mimeType]));
      const conferidas: MidiaConferida[] = idsDaPeca.map((id) => ({ id, mime: porId.get(id) ?? null }));
      const veredito = conferirFormatoDeMidia(conferidas, ehVideo);
      if (!veredito.aceita) {
        await falhar(veredito.motivo);
        continue;
      }
    }

    // ── DIREÇÃO INTERNA NÃO VAI AO AR (27/08/2026, medido em produção) ─────
    //
    // A peneira mora em `captionDaPeca`, no nascimento e no ajuste. Esta é a
    // ÚLTIMA porta, e ela existe porque `SocialPost.caption` também é escrito
    // por outros caminhos (portal, painel, importação) que não passam por lá.
    //
    // Aqui NÃO se limpa o texto: publicar uma legenda diferente da que o
    // cliente aprovou seria a agência reescrevendo a peça na saída, calada.
    // Barra, grava o motivo e deixa para gente — com dono e próxima ação.
    const internas = frasesDeDirecaoInterna(post.caption);
    if (internas.length > 0) {
      await falhar(
        `a legenda desta peça contém DIREÇÃO INTERNA (${internas.map((i) => `"${i.frase.slice(0, 60)}"`).join(" · ")}) — ` +
        "isso é briefing, não legenda, e publicado sairia no perfil do cliente. " +
        "Dono: a agência (produção). Próxima ação: corrigir a legenda da peça e reagendar.",
      );
      continue;
    }

    // ── O DIA CITADO NO TEXTO É O DIA DA PEÇA? (27/08/2026) ────────────────
    //
    // A peça medida na rodada paga saiu com "Sexta é dia de estar aqui" num
    // calendário todo terça-a-quinta. Publicada, ela convida o público do
    // cliente para um dia que não é o dela — e quem lê não tem como saber qual
    // das duas informações vale.
    //
    // Aqui a data está no banco (`scheduledFor`), então a pergunta é forte e a
    // resposta é determinística. Texto que não cita dia nenhum passa direto.
    const data = conferirDataDaPeca({ texto: post.caption, agendadaPara: post.scheduledFor });
    if (!data.passa) {
      await falhar(data.motivo);
      continue;
    }

    // ── "PROMOÇÃO SÓ EM STORIES" NA ÚLTIMA PORTA (27/09/2026) ──────────────
    // Mesmo raciocínio das duas travas acima: `SocialPost.caption` também
    // nasce fora da esteira normal (portal, painel, importação), então a régua
    // de "oferta comercial não vai para feed/carrossel/reel" precisa valer
    // AQUI, onde toda peça passa antes de ir ao ar — não só no nascimento da
    // legenda. Não reescreve o texto: barra, grava o motivo, deixa para gente.
    const promocao = conferirPromocaoNoFormato({ formato: normalizarFormato(post.format), texto: post.caption });
    if (!promocao.passa) {
      await falhar(promocao.motivo);
      continue;
    }

    // ── COLABORADORES (1C-C1, 27/09/2026) — parecer do `meta`, PODE COM
    // AJUSTE ─────────────────────────────────────────────────────────────
    // A FONTE é o pacote da marca (`pacote.colaboradores`), nunca o post: um
    // campo em `SocialPost` seria mais um lugar para a mesma decisão
    // divergir. `ativo: false` é o padrão até o parecer liberar — pacote sem
    // o bloco, ou com `ativo: false`, não envia nada, silenciosamente
    // (ausência de intenção da marca não é erro).
    //
    // NUNCA em story, mesmo que o pacote declare contas: o parecer fecha essa
    // porta e `client.ts` já ignora por conta própria — este `if` só evita o
    // uso à toa, não é a trava de verdade. O pacote já foi lido acima
    // (`pacoteDaMarca`) — mesma leitura do post inteiro, não uma segunda.
    let colaboradoresParaEnviar: string[] | undefined;
    if (formato !== "story") {
      const colaboradoresDoPacote = pacoteDaMarca?.colaboradores;
      if (colaboradoresDoPacote?.ativo && colaboradoresDoPacote.contas.length > 0) {
        colaboradoresParaEnviar = colaboradoresDoPacote.contas;
      }
    }

    // ── RESERVA ATÔMICA — A TRAVA CONTRA DUAS RODADAS PUBLICANDO O MESMO
    // POST (27/09/2026) ────────────────────────────────────────────────────
    // Até aqui o post está "scheduled" no banco enquanto passa por TODAS as
    // travas acima. Duas rodadas concorrentes (o despertador de 5 em 5
    // minutos e o botão "Publicar agora", ou dois processos do mesmo relógio)
    // podem ler o MESMO post "scheduled" e chegar aqui ao mesmo tempo — cada
    // uma chamaria `publishPost` sem saber da outra, e o Instagram receberia
    // a mesma peça duas vezes.
    //
    // `updateMany` com `status: "scheduled"` no `where` é a reserva: só UMA
    // das corridas encontra a linha ainda "scheduled" e a move para
    // "publishing" (o `UPDATE ... WHERE` do SQLite é atômico por linha — a
    // segunda corrida, agindo depois, já não encontra a condição e recebe
    // `count: 0`). A outra desiste sem erro: ela não fez nada de errado, só
    // chegou depois de a primeira já ter reservado a peça.
    const reserva = await prisma.socialPost.updateMany({
      where: { id: post.id, status: "scheduled" },
      data: { status: "publishing" },
    });
    if (reserva.count === 0) {
      saida.adiados.push({ postId: post.id, motivo: "já sendo publicada por outra rodada" });
      continue;
    }
    reservado = true;

    let r;
    try {
      r = await publishPost(post.workspaceId, {
        connectionId: conexao.id,
        // QUAL peça — é o que permite à trava perguntar se o cliente dono dela
        // a aprovou (14/08/2026). Sem isto o despertador seria recusado peça a
        // peça, e com razão: ninguém saberia dizer o que estava indo ao ar.
        postId: post.id,
        platform: "instagram",
        format: formato,
        caption: post.caption,
        ...(formato === "carousel" ? { mediaUrls: carrossel } : { mediaUrl }),
        ...(colaboradoresParaEnviar ? { collaborators: colaboradoresParaEnviar } : {}),
      });
    } catch (err) {
      // Exceção pura, sem `talvezPublicado`: não sabemos em que fase ela
      // aconteceu, e é isso que a torna ambígua por padrão. Fail-safe: melhor
      // parar para conferência humana que arriscar publicar duas vezes.
      await marcarAmbigua(err instanceof Error ? err.message : "erro ao falar com a Meta");
      continue;
    }

    if (!r.ok) {
      if (r.talvezPublicado) {
        // A Meta pode ter processado o `media_publish` antes do erro chegar —
        // não é seguro devolver para "scheduled" (o relógio republicaria).
        await marcarAmbigua(r.error ?? "falha ambígua na publicação — não sei se a peça saiu no Instagram");
      } else {
        // Falha CLARA: o erro veio antes de qualquer `media_publish` (container,
        // validação, trava da casa). Nada foi ao ar — pode voltar para a fila.
        await falhar(r.error ?? "falha na publicação");
      }
      continue;
    }

    const publicadoEm = new Date();
    // Sem o filtro extra `status: "publishing"` aqui, DE PROPÓSITO: se
    // `recuperarPublicacoesPresas` (rodada separada do despertador, ver
    // acima) chegasse a mover esta MESMA linha para "publish_unknown" numa
    // corrida rara (`media_publish` demorou mais que os 15 min de tolerância
    // mas respondeu com sucesso), um filtro de status faria este UPDATE virar
    // no-op e um sucesso real ficaria preso em "publish_unknown" para sempre —
    // pior do que o problema que esta idempotência resolve. Um sucesso real
    // sempre grava "published".
    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: "published",
        publishedAt: publicadoEm,
        // QUEM publicou. Sem esta linha, `publishedBy` nulo teria dois
        // significados ao mesmo tempo — "o relógio" e "não sabemos" — e o
        // primeiro relatório que separasse manual de automático mentiria.
        publishedBy: AUTOR_DA_ESTEIRA,
        externalPostId: r.externalPostId ?? null,
        permalink: r.permalink ?? null,
        lastError: null,
      },
    });
    // O freio de rajada passa a valer para as peças seguintes DESTA rodada: o
    // banco acabou de saber, o laço tem de saber junto. Pela FAMÍLIA do post
    // que acabou de sair — story publicado não pode enganar o freio do feed.
    ultimaDoPerfil.set(chaveDoFreio, publicadoEm);
    saida.publicados++;
    // Achado 2 (Q8-qualidade, 28/09/2026): o evento "publicado" do contrato
    // §8, com permalink/externalPostId — se esta peça pertence a um
    // PostExterno. Best-effort, DEPOIS da publicação gravada, nunca antes.
    await sincronizarEstadoExterno(
      post.id,
      {
        estado: "publicado",
        permalink: r.permalink ?? null,
        externalPostId: r.externalPostId ?? null,
      },
      post.scriptJson,
    );

    // ── COLABORADORES: GRAVA O PEDIDO E CONFERE O CONVITE (1C-C1) ──────────
    // Best-effort, DEPOIS de a publicação estar gravada: falha aqui nunca
    // desfaz o que já saiu no Instagram (mesma régua de `permalink` acima).
    // Não existe endpoint para ACEITAR o convite — só o painel do Instagram
    // faz isso — então o que dá para gravar é o PEDIDO e, quando possível, a
    // conferência do estado atual (`invite_status`).
    if (colaboradoresParaEnviar && colaboradoresParaEnviar.length > 0) {
      const base: Record<string, unknown> = {
        pedidos: colaboradoresParaEnviar,
        enviadoEm: publicadoEm.toISOString(),
        ...(r.collabResponse !== undefined ? { resposta: r.collabResponse } : {}),
      };
      const conferencia = r.externalPostId && conexao.token
        ? await conferirCollaborators(r.externalPostId, conexao.token).catch(
            (e): ConferenciaDeCollaborators => ({
              ok: false,
              error: e instanceof Error ? e.message : "erro desconhecido ao conferir collaborators",
            }),
          )
        : { ok: false as const, error: "sem id de mídia publicada ou token para conferir os convites" };
      const collabJson = {
        ...base,
        conferidoEm: new Date().toISOString(),
        ...(conferencia.ok ? { convites: conferencia.convites } : { erroDaConferencia: conferencia.error }),
      };
      await prisma.socialPost
        .update({ where: { id: post.id }, data: { collabJson: JSON.stringify(collabJson) } })
        .catch(() => { /* best-effort: a publicação já está gravada e vale, independente disto */ });
    }

    await prisma.activityEvent.create({
      data: {
        workspaceId: post.workspaceId,
        clientId: post.clientId,
        type: "post_publicado",
        message: `Publicado no Instagram: ${post.caption.slice(0, 120)}`,
      },
    }).catch(() => { /* best-effort: o registro não pode desfazer a publicação */ });
  }

  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

/**
 * A ÚNICA escrita de "scheduled" desta casa.
 *
 * Recebe as peças já filtradas e ordenadas por data e empurra para frente o que
 * ficou para trás enquanto o cliente decidia: aprovar na sexta não pode disparar
 * de uma vez tudo que estava marcado para a quarta. Os empurrados ficam com pelo
 * menos um dia entre si — nunca em rajada no perfil do cliente.
 *
 * Está em um lugar só de propósito: as três portas de consentimento (pacote,
 * ciclo e card) precisam produzir exatamente o mesmo estado e a mesma régua de
 * datas. Duas cópias dessa régua divergiriam no primeiro ajuste.
 */
async function promoverParaAgendado(
  pecas: Array<{ id: string; scheduledFor: Date | null }>,
): Promise<number> {
  if (pecas.length === 0) return 0;
  let proximo = amanhaAs(HORA_PADRAO);
  for (const post of pecas) {
    const original = post.scheduledFor;
    const quando = original && original > proximo ? original : new Date(proximo);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: "scheduled", scheduledFor: quando,
        // A PEÇA ENTROU NA FILA — logo, não está mais parada. O aviso da
        // parada anterior sai junto: aviso que sobrevive ao conserto vira
        // ruído, e ruído ensina a ignorar o aviso da próxima vez.
        avisoAoCliente: null,
      },
    });
    proximo = new Date(Math.max(quando.getTime(), proximo.getTime()) + 24 * 60 * 60_000);
  }
  return pecas.length;
}

function amanhaAs(hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/** Onde o calendário deste cliente para. Nunca antes de amanhã. */
export async function proximaDataLivre(workspaceId: string, clientId: string | null): Promise<Date> {
  const base = amanhaAs(HORA_PADRAO);
  const ultimo = await prisma.socialPost.findFirst({
    where: { workspaceId, clientId, scheduledFor: { not: null } },
    orderBy: { scheduledFor: "desc" },
    select: { scheduledFor: true },
  });
  if (!ultimo?.scheduledFor) return base;
  const depois = new Date(ultimo.scheduledFor.getTime() + 24 * 60 * 60_000);
  return depois > base ? depois : base;
}

/** EXPORTADA em 14/08/2026 para `prontidao-de-publicacao.ts`. Não é
 *  conveniência: o diagnóstico precisa responder pelo MESMO formato que o
 *  publicador vai usar. Uma segunda cópia desta régua diria "carrossel" onde o
 *  publicador entende "feed" e o diagnóstico passaria a mentir no dia em que
 *  alguém acrescentasse um formato aqui e esquecesse lá. */
export function normalizarFormato(f: string): "feed" | "reel" | "story" | "carousel" {
  if (f === "reel" || f === "video") return "reel";
  if (f === "story") return "story";
  if (f === "carousel" || f === "carrossel") return "carousel";
  return "feed";
}

/** Lê uma lista guardada como JSON. Campo corrompido vira lista vazia — nunca
 *  exceção: um JSON quebrado não pode derrubar a rodada de publicação.
 *  EXPORTADA em 14/08/2026 pela mesma razão que `normalizarFormato`. */
export function lerLista(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * A Meta busca a mídia com os servidores DELA: precisa de URL pública. Por isso
 * o link é assinado e expira — não é o arquivo aberto ao mundo.
 */
export async function urlPublicaDaMidia(mediaUrl: string | null): Promise<string | undefined> {
  if (!mediaUrl) return undefined;
  if (!mediaUrl.startsWith("/api/media/")) {
    // Já é uma URL externa (Drive, CDN do cliente): usa como está.
    return mediaUrl.startsWith("http") ? mediaUrl : undefined;
  }
  const id = mediaUrl.split("/api/media/")[1]?.split("?")[0] ?? "";
  const base = process.env.PUBLIC_BASE_URL?.trim() || process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (!base || !id) return undefined;
  const dominio = base.startsWith("http") ? base : `https://${base}`;
  return `${dominio}${caminhoPublicoAssinado(id)}`;
}

/**
 * OS LINKS PÚBLICOS, SEM DERRUBAR A RODADA. (14/08/2026)
 *
 * ─── O defeito, medido ─────────────────────────────────────────────────────
 *
 * `urlPublicaDaMidia` **LANÇA** — `caminhoPublicoAssinado` → `assinar` →
 * `segredoDeAssinatura` joga `Error("AUTH_SECRET ausente…")` quando nem
 * `AUTH_SECRET` nem `JWT_SECRET` existem no ambiente. Está certo que lance: um
 * link "assinado" com segredo previsível aparenta proteção e não protege
 * (`media/armazenamento.ts:368-374`).
 *
 * O que estava errado era o CHAMADOR. As duas chamadas dentro do laço de
 * `publicarAgendados` estavam cruas, fora de qualquer `try`. Uma variável de
 * ambiente ausente, portanto, não produzia "este post não saiu porque X": ela
 * estourava para fora do laço, e com isso:
 *
 *   • **nenhum** post recebia `lastError` — o campo que o painel lê;
 *   • **nenhum** `ActivityEvent` de `publicacao_falhou` era criado — a
 *     testemunha que existe desde 06/08 justamente porque "a hora marcada que
 *     não aconteceu é notícia";
 *   • os posts SEGUINTES da fila nem eram avaliados, porque o laço morria no
 *     primeiro;
 *   • e o que sobrava era uma linha genérica no pulso do despertador
 *     (`despertador.ts:343`), sem dizer de qual post nem de qual cliente.
 *
 * Isto é o oposto declarado da regra desta função: *"o post CONTINUA
 * scheduled… `lastError` é o que fica visível"* e *"trabalho pago não é
 * enterrado"*. Um `throw` no meio do laço enterra — e enterra em silêncio, que
 * é a forma de falha que esta casa mais paga caro.
 *
 * ─── Por que a correção é AQUI, e não em `segredoDeAssinatura` ─────────────
 *
 * Fazer a assinatura devolver `undefined` em vez de lançar transformaria a
 * causa real ("falta o segredo") na mensagem errada que já existe ("falta
 * domínio público configurado") — o operador procuraria a variável errada. O
 * motivo tem de chegar inteiro ao post. Por isso a exceção é CAPTURADA e
 * VIRA MOTIVO, em vez de ser evitada.
 */
export async function linksPublicosDaMidia(
  brutas: Array<string | null>,
): Promise<{ links: string[]; erro: string | null }> {
  try {
    const links = (await Promise.all(brutas.map((u) => urlPublicaDaMidia(u))))
      .filter((u): u is string => !!u);
    return { links, erro: null };
  } catch (e) {
    return {
      links: [],
      erro:
        "não consegui montar o link público da mídia: " +
        (e instanceof Error ? e.message : "erro desconhecido") +
        ". A Meta busca o arquivo com os servidores dela, e sem link assinado não há como entregá-lo.",
    };
  }
}

import { quebrarCenas } from "@/lib/agency/design/storyboard";
import { TIPOS_PUBLICAVEIS } from "@/lib/agency/execution/tipos-de-entrega";

interface PecaExtraida {
  legenda: string;
  formato: string;
  pilar: string | null;
  /**
   * A DIREÇÃO DE ARTE — o que a IMAGEM desta peça tem de mostrar.
   *
   * Sai do campo `visual` do especialista de copy (`especialistas.ts`), que o
   * markdown grava como "- Visual: ..." (`run-execution.ts`,
   * `deliverableMarkdown`). Até 15/08/2026 este leitor NÃO a capturava: a
   * direção era escrita, gravada no entregável, e morria ali — e o gerador de
   * imagem recebia a LEGENDA como cena.
   *
   * "- Direção: ..." é o mesmo campo com outro rótulo: o markdown emite os dois
   * (`direction` para as peças de design, `visual` para as de copy), e ler só um
   * deixaria o outro no chão. Visual ganha quando os dois existem, porque é o
   * campo que o especialista de copy — o que produz post — preenche.
   *
   * ⚠️ NUNCA vira letra na peça. Ver `SocialPost.artDirection` no schema.
   */
  direcaoDeArte: string | null;
  /** As telas do carrossel, uma por item. Vazio nos outros formatos. */
  cenas: string[];
}

/**
 * Quebra o texto do entregável nas peças que ele contém.
 *
 * O motor grava cada peça como "**N. Título**" seguido de linhas "- Campo:
 * valor". Ler de volta esse formato é frágil por natureza — o certo, um dia, é
 * o especialista devolver as peças estruturadas em vez de texto. Enquanto isso,
 * este leitor prefere ERRAR PARA MENOS: peça que ele não entende não vira post,
 * em vez de virar post com texto quebrado no perfil do cliente.
 */
export function extrairPecas(conteudo: string, tipo: string): PecaExtraida[] {
  const pecas: PecaExtraida[] = [];
  const blocos = conteudo.split(/\n(?=\*\*\d+\.)/);

  for (const bloco of blocos) {
    const legenda = capturar(bloco, "Legenda");
    if (!legenda || legenda.length < 20) continue; // legenda curta demais não é post
    // Peça que confessa falta de dado não vai ao ar: a confissão é honesta para
    // a agência ler, não para o seguidor do cliente ler.
    if (/PRECISO CONFIRMAR/i.test(legenda)) continue;
    const formatoBruto = (capturar(bloco, "Formato") ?? "").toLowerCase();
    const cenas = lerCenas(capturar(bloco, "Cenas"));
    // A ordem dos testes importa. Carrossel primeiro: uma peça com telas
    // descritas É um carrossel, mesmo que o especialista tenha escrito "feed"
    // no campo formato — a estrutura do conteúdo manda mais que o rótulo.
    const formato =
      cenas.length >= 2 || formatoBruto.includes("carross") || formatoBruto.includes("carousel") ? "carousel"
      : formatoBruto.includes("reel") || tipo === "video" ? "reel"
      : formatoBruto.includes("story") ? "story"
      : "feed";
    // Carrossel sem telas suficientes não é carrossel — vira feed, em vez de
    // ser publicado com uma imagem só e o nome errado.
    const formatoFinal = formato === "carousel" && cenas.length < 2 ? "feed" : formato;
    // A direção de arte: "Visual" primeiro, "Direção" como o mesmo campo com
    // outro rótulo. Peça que confessa falta de dado NA DIREÇÃO não derruba a
    // peça (a legenda está boa) — ela cai no fallback, porque mandar
    // "PRECISO CONFIRMAR: ..." para o gerador de imagem desenharia a confissão.
    const direcaoBruta = capturar(bloco, "Visual") ?? capturar(bloco, "Direção") ?? capturar(bloco, "Direcao");
    const direcaoDeArte =
      direcaoBruta && direcaoBruta.length >= 10 && !/PRECISO CONFIRMAR/i.test(direcaoBruta)
        ? direcaoBruta.slice(0, 1200)
        : null;
    pecas.push({
      legenda: legenda.slice(0, 2000),
      formato: formatoFinal,
      pilar: capturar(bloco, "Pilar"),
      direcaoDeArte,
      cenas,
    });
  }
  return pecas;
}

/**
 * Lê as telas do carrossel. O especialista escreve
 * "1) [gancho] tela · 2) [tensao] tela · 3) ..." — numa linha só ou em várias,
 * porque modelo não é consistente nisso.
 *
 * A quebra delega para `quebrarCenas` (`lib/agency/design/storyboard.ts`): é o
 * MESMO texto lido no contrato de saída do especialista e na produção da arte,
 * e ler diferente em qualquer um dos três pontos faria um deles aprovar o que
 * o outro reprova. O `[papel]` de cada tela é preservado — é ele que a trava de
 * storyboard confere antes de a peça virar imagem paga.
 */
function lerCenas(bruto: string | null): string[] {
  return quebrarCenas(bruto);
}

function capturar(bloco: string, campo: string): string | null {
  const m = bloco.match(new RegExp(`^-\\s*${campo}:\\s*(.+)$`, "mi"));
  return m?.[1]?.trim() ?? null;
}

/** Carimba `fichaIncompleta: true` no scriptJson, preservando o resto. */
export function comFichaIncompleta(scriptJson: string | null | undefined): string | undefined {
  // scriptJson que não é objeto JSON fica intacto (`undefined` = não regravar):
  // perder o roteiro da peça para pôr um carimbo seria trocar o grande pelo pequeno.
  try {
    const v = scriptJson ? (JSON.parse(scriptJson) as unknown) : {};
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    return JSON.stringify({ ...(v as Record<string, unknown>), fichaIncompleta: true });
  } catch {
    return undefined;
  }
}
