// POST /api/social-posts/radar — a PAUTA da série "Radar" (CEO, 27/09/2026, W12b).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTA ROTA EXISTE
// ═══════════════════════════════════════════════════════════════════════════
//
// `calendario-editorial.ts` NUNCA gera a série com `exigeFonte: true` (o caso
// "Radar Dioli Tech") pela IA — o gerador só cria o slot como PENDENTE ("Radar:
// aguardando pauta com fonte") e para aí, porque não existe hoje uma fonte de
// notícia que a casa possa citar sem risco de inventar (ver o campo "diga se
// há busca web/RSS" na ficha desta frente — RESPOSTA abaixo).
//
// Esta rota é o INSUMO HUMANO que fecha essa lacuna: o master entrega a lista
// de notícias JÁ CURADA (título, resumo, veículo, URL, data), e a rota:
//
//   1. confere CADA notícia contra `conferirNoticia` (`noticia-com-fonte.ts`) —
//      URL http(s) obrigatória, veículo e título não vazios, data dentro da
//      janela de 7 dias antes da edição. Reprovada é LISTADA e NÃO entra;
//   2. exige um MÍNIMO de notícias aprovadas (`MIN_NOTICIAS_APROVADAS_PADRAO`,
//      8 — o número que o CEO deu, salvo a série "radar" do pacote declarar o
//      próprio `cardsMin`) — menos que isso é 422, nada é gravado;
//   3. cria/ATUALIZA (upsert por cliente+edição) o post CARROSSEL da edição:
//      capa + 1 card por notícia aprovada (com veículo, data e a URL da fonte
//      no próprio texto do card — `scenesJson`), status "draft", `scriptJson`
//      com `tipo: "radar"`, `layout: "radar"`, a `edicao` e (se achado) o
//      `serieId` do `pacote.series` cuja `exigeFonte` é `true`. A legenda LISTA
//      as fontes.
//
// A IA NÃO É CHAMADA AQUI, de propósito: a única tarefa é dispor o que o
// humano já entregou — título e resumo já vêm prontos, e "a IA só pode
// reescrever título/resumo recebidos, nunca acrescentar notícia" (ORDEM do
// CEO) é mais barato de garantir NÃO chamando IA nenhuma do que auditando uma
// reescrita a cada rodada. Se um dia a casa quiser a IA só para polir o texto
// dos cards, ela entra aqui — reescrevendo o que já passou pela trava de
// fonte, nunca decidindo o que é notícia.
//
// ── A LACUNA DE BUSCA WEB/RSS, NOMEADA (ORDEM do CEO) ─────────────────────
//
// Busca no repositório inteiro (`grep -ri "rss\|feed\|search\|serp\|tavily\|
// bing"` em `lib/`, fora de testes e node_modules) encontra RSS de verdade —
// mas para um radar DIFERENTE. `lib/agency/radar/sources.ts` +
// `lib/agency/radar/fetcher.ts` (`fetchFeedItems`, `getConfiguredSources`) são
// o "Radar Dioli" INTERNO da AGÊNCIA: feeds de Meta Newsroom, Meta Developers,
// Google Ads & Commerce, YouTube Blog e Search Engine Journal, que abastecem
// `lib/agency/radar/library.ts` (insights de mudança de plataforma/política —
// o que os DEPARTAMENTOS e a QUALIDADE consomem como diretriz). Mesma palavra
// ("radar"), assunto DIFERENTE (o mercado de marketing digital, não "novidades
// do mundo tech" para o público de UM cliente) e uso DIFERENTE (guidance
// interna da casa, não card de carrossel para o feed do cliente).
//
// Além disso, `fetchFeedItems` não é um encaixe direto mesmo se o assunto
// batesse: ela devolve só `{title, link, summary}` — sem `pubDate`, e
// `NoticiaDoRadar.dataPublicacao` é OBRIGATÓRIO aqui (é ela que decide a janela
// de 7 dias). Usar este radar exigiria (a) uma fonte de feed sobre tech geral,
// que não existe na lista de fábrica, e (b) estender `fetcher.ts` para
// extrair `pubDate`/`published` do XML.
//
// Fora da Perplexity como PROVEDOR DE IA (`lib/ai/generate.ts`,
// `ordemDePreferenciaDaCasa`, modelo "sonar" com busca embutida — não chamada
// por nenhum caminho do radar de cliente hoje), **não existe hoje busca
// web/RSS para ESTA finalidade** — a pauta tem de vir de um humano (o master,
// por esta rota) até que alguém estenda `fetcher.ts` com data de publicação e
// cadastre uma fonte de tech geral, ou construa uma busca dedicada.
//
// Guarda copiada de `semana/route.ts`: sessão de staff SÓ "master" (curar
// pauta editorial é ato de negócio, não de produção), nunca portal, CSRF e
// rate-limit.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { prisma } from "@/lib/db/client";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { lerPacote } from "@/lib/agency/esteira/pacote-da-marca";
import { conferirNoticia, type NoticiaDoRadar } from "@/lib/agency/esteira/noticia-com-fonte";
import { horaBrasiliaParaUtc, MARCADOR_DE_ORIGEM } from "@/lib/agency/esteira/calendario-editorial";

const PODEM_CURAR_RADAR = ["master"] as const;

/** Ato de negócio raro (curar a pauta de uma edição semanal) — teto baixo de
 *  propósito, mesma régua de `semana/route.ts`. */
const CHAMADAS_POR_MINUTO = 5;

/** O número que o CEO deu (ORDEM 4, W12b): menos que isso, a edição não sai.
 *  Se a série "radar" do pacote desta marca declarar seu próprio `cardsMin`,
 *  ele é usado; sem ela (ou sem pacote), este é o piso. */
const MIN_NOTICIAS_APROVADAS_PADRAO = 8;

const EDICAO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = "force-dynamic";

/** `de` = 7 dias antes de `edicao` (inclusive), `ate` = a própria edição —
 *  comparação lexicográfica em "AAAA-MM-DD", a mesma régua de `conferirNoticia`. */
function janelaDeSeteDias(edicao: string): { de: string; ate: string } {
  const [y, m, d] = edicao.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 7);
  const de = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return { de, ate: edicao };
}

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** O texto de UM card — veículo e data no próprio texto, e a URL junto (a
 *  única forma que `scenesJson` tem de carregar a fonte, já que é um array
 *  de strings — ver `execution/artes.ts` e o cabeçalho de
 *  `calendario-editorial.ts` para o formato). */
function cardDaNoticia(n: NoticiaDoRadar): string {
  return `${n.titulo.trim()} — ${n.resumo.trim()} (${n.veiculo.trim()}, ${dataBr(n.dataPublicacao)}) ${n.url.trim()}`;
}

function montarLegenda(edicao: string, aprovadas: NoticiaDoRadar[]): string {
  const linhas = aprovadas.map((n) => `• ${n.titulo.trim()} — ${n.veiculo.trim()} (${dataBr(n.dataPublicacao)})`);
  const fontes = Array.from(new Set(aprovadas.map((n) => n.veiculo.trim())));
  return (
    `📡 Radar — as novidades da semana (edição de ${dataBr(edicao)}):\n\n` +
    `${linhas.join("\n")}\n\n` +
    `Fontes: ${fontes.join(", ")}`
  );
}

interface NoticiaReprovada {
  titulo: string;
  motivo: string;
}

function noticiaValidaOuNula(x: unknown): NoticiaDoRadar | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (
    typeof o.titulo !== "string" || typeof o.resumo !== "string" ||
    typeof o.veiculo !== "string" || typeof o.url !== "string" ||
    typeof o.dataPublicacao !== "string"
  ) {
    return null;
  }
  return {
    titulo: o.titulo, resumo: o.resumo, veiculo: o.veiculo, url: o.url, dataPublicacao: o.dataPublicacao,
  };
}

/** O post RADAR já existente desta edição (upsert por cliente+edição) — `null`
 *  se esta é a primeira submissão. Lido por `scriptJson` porque não há coluna
 *  própria para "edição do radar"; a mesma régua de `MARCADOR_DE_ORIGEM`. */
async function postDoRadarExistente(
  clientId: string,
  edicao: string,
): Promise<{ id: string } | null> {
  const candidatos = await prisma.socialPost
    .findMany({
      where: { clientId, format: "carousel", scriptJson: { contains: '"tipo":"radar"' } },
      select: { id: true, scriptJson: true },
    })
    .catch(() => [] as Array<{ id: string; scriptJson: string | null }>);
  for (const c of candidatos) {
    try {
      const o = c.scriptJson ? (JSON.parse(c.scriptJson) as Record<string, unknown>) : null;
      if (o?.edicao === edicao) return { id: c.id };
    } catch {
      // scriptJson quebrado não é candidato — segue para o próximo.
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_CURAR_RADAR]);
  if (error) return error;
  // Sessão de portal nunca cura pauta editorial em nome da agência.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`radar-editorial:${session.userId}`, CHAMADAS_POR_MINUTO, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas chamadas em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const corpo = (await request.json().catch(() => null)) as {
    clientId?: string;
    edicao?: string;
    noticias?: unknown;
  } | null;

  const clientId = corpo?.clientId?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  }
  const cliente = await clienteOuNulo(clientId, { workspaceId: session.workspaceId });
  if (!cliente) {
    // 404, nunca 403: não confirma que o id existe em outro workspace.
    return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  }

  const edicao = corpo?.edicao?.trim();
  if (!edicao || !EDICAO_REGEX.test(edicao)) {
    return NextResponse.json({ error: 'edicao é obrigatória, no formato "AAAA-MM-DD"' }, { status: 400 });
  }
  const [anoStr, mesStr, diaStr] = edicao.split("-");
  const ano = Number(anoStr);
  const mesIndex = Number(mesStr) - 1;
  const dia = Number(diaStr);

  const brutas = Array.isArray(corpo?.noticias) ? corpo!.noticias : null;
  if (!brutas || brutas.length === 0) {
    return NextResponse.json({ error: "noticias é obrigatório e precisa ter pelo menos um item" }, { status: 400 });
  }
  const noticias = brutas.map(noticiaValidaOuNula);
  if (noticias.some((n) => n === null)) {
    return NextResponse.json(
      { error: 'cada notícia precisa de "titulo", "resumo", "veiculo", "url" e "dataPublicacao"' },
      { status: 400 },
    );
  }

  // ── A SÉRIE "RADAR" DO PACOTE, SE HOUVER — cardsMin, horário, id, pilar ──
  // Nunca bloqueante: sem pacote, ou sem uma série com `exigeFonte`, a rota
  // segue com o piso padrão — o CEO deu o número (8) independente do pacote.
  const perfil = await prisma.client
    .findUnique({ where: { id: clientId }, select: { pacoteJson: true } })
    .catch(() => null);
  const pacoteLido = lerPacote(perfil?.pacoteJson ?? null);
  const serieRadar = pacoteLido.ok ? pacoteLido.pacote.series?.find((s) => s.exigeFonte) : undefined;
  const minimoDeNoticias = serieRadar?.cardsMin ?? MIN_NOTICIAS_APROVADAS_PADRAO;
  const horarioDaEdicao = serieRadar?.horario ?? "09:00";
  const pilarDaEdicao = pacoteLido.ok
    ? (pacoteLido.pacote.pilares.find((p) => p.nome.trim().toLowerCase() === "radar")?.nome
      ?? pacoteLido.pacote.pilares[0]?.nome
      ?? null)
    : null;

  // ── CADA NOTÍCIA PASSA PELA TRAVA DE FONTE ────────────────────────────────
  const janela = janelaDeSeteDias(edicao);
  const aprovadas: NoticiaDoRadar[] = [];
  const reprovadas: NoticiaReprovada[] = [];
  for (const n of noticias as NoticiaDoRadar[]) {
    const veredito = conferirNoticia(n, janela);
    if (veredito.passa) aprovadas.push(n);
    else reprovadas.push({ titulo: n.titulo, motivo: veredito.motivo });
  }

  if (aprovadas.length < minimoDeNoticias) {
    return NextResponse.json(
      {
        error:
          `menos de ${minimoDeNoticias} notícias aprovadas (${aprovadas.length} de ${noticias.length}) — ` +
          "a edição não sai sem o mínimo de fontes.",
        aprovadas: aprovadas.length,
        minimo: minimoDeNoticias,
        reprovadas,
      },
      { status: 422 },
    );
  }

  // ── O POST CARROSSEL DA EDIÇÃO — capa + 1 card por notícia aprovada ──────
  const scenesJson = JSON.stringify([
    `Radar — edição de ${dataBr(edicao)}`,
    ...aprovadas.map(cardDaNoticia),
  ]);
  const caption = montarLegenda(edicao, aprovadas);
  const scheduledFor = horaBrasiliaParaUtc(horarioDaEdicao, ano, mesIndex, dia);
  const scriptJson = JSON.stringify({
    origemGerador: MARCADOR_DE_ORIGEM,
    mes: `${anoStr}-${mesStr}`,
    fase: "final",
    tipo: "radar",
    layout: "radar",
    edicao,
    ...(serieRadar ? { serieId: serieRadar.id } : {}),
  });

  const existente = await postDoRadarExistente(clientId, edicao);
  const post = existente
    ? await prisma.socialPost.update({
        where: { id: existente.id },
        data: { caption, scenesJson, scriptJson, scheduledFor, pillar: pilarDaEdicao, status: "draft" },
        select: { id: true },
      })
    : await prisma.socialPost.create({
        data: {
          workspaceId: session.workspaceId,
          clientId,
          caption,
          networks: JSON.stringify(["instagram"]),
          format: "carousel",
          pillar: pilarDaEdicao,
          scenesJson,
          scheduledFor,
          status: "draft",
          visibility: "compartilhado",
          scriptJson,
        },
        select: { id: true },
      });

  return NextResponse.json({
    ok: true,
    postId: post.id,
    atualizado: !!existente,
    telas: aprovadas.length + 1,
    aprovadas: aprovadas.length,
    reprovadas,
  });
}
