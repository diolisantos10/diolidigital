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

import { prisma } from "@/lib/db/client";
import { publishPost } from "@/lib/integrations/meta/client";
import { conexaoDoCliente } from "@/lib/integrations/meta/connections";
import { caminhoPublicoAssinado } from "@/lib/agency/media/armazenamento";

/** Quantos posts publicamos por rodada do relógio. Publicação é irreversível e
 *  a Meta limita chamadas — melhor ir devagar e nunca em enxurrada. */
const MAX_PUBLICACOES_POR_RODADA = 10;

/** A que horas um post nasce quando ninguém escolheu horário. 10h é começo de
 *  expediente do público da maioria dos clientes desta casa. */
const HORA_PADRAO = 10;

/** Tipos de entregável que viram post. Estratégia e relatório não vão ao ar. */
const TIPOS_PUBLICAVEIS = ["social", "video"];

export interface AgendamentoFeito {
  projectId: string;
  criados: number;
  /** Entregas que já tinham virado calendário — não duplicamos. */
  jaAgendadas: number;
  /** Entregas cujo texto o leitor não conseguiu quebrar em peças. */
  naoInterpretadas: string[];
}

/**
 * Transforma as entregas de social apresentadas em posts com DATA.
 *
 * Idempotente POR ENTREGA (`deliverableId`): um `Deliverable` que já gerou
 * posts não gera de novo, mas uma entrega nova depois (mês 2, refação) gera.
 * Idempotência por projeto travaria a agência no primeiro mês para sempre.
 */
export async function agendarPostsDaEntrega(projectId: string): Promise<AgendamentoFeito> {
  const saida: AgendamentoFeito = { projectId, criados: 0, jaAgendadas: 0, naoInterpretadas: [] };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true },
  });
  // Só agenda o que o cliente já viu. Agendar antes da apresentação encheria o
  // calendário dele com coisa que ele ainda não aprovou.
  if (!projeto?.presentedAt) return saida;

  const entregas = await prisma.deliverable.findMany({
    where: { projectId, type: { in: TIPOS_PUBLICAVEIS } },
    select: { id: true, name: true, content: true, type: true },
    orderBy: { createdAt: "asc" },
  });
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
    where: { clientRequestId: projeto.clientRequestId, status: "draft" },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, scheduledFor: true },
  });
  if (rascunhos.length === 0) return { agendados: 0 };

  let proximo = amanhaAs(HORA_PADRAO);
  for (const post of rascunhos) {
    const original = post.scheduledFor;
    const quando = original && original > proximo ? original : new Date(proximo);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "scheduled", scheduledFor: quando },
    });
    // Empurrados ficam com pelo menos um dia entre si — nunca em rajada.
    proximo = new Date(Math.max(quando.getTime(), proximo.getTime()) + 24 * 60 * 60_000);
  }
  return { agendados: rascunhos.length };
}

export interface PublicacaoFeita {
  publicados: number;
  falhas: Array<{ postId: string; erro: string }>;
}

/**
 * Publica o que está agendado e chegou a hora.
 *
 * Só toca em `status: "scheduled"` — o que está em `draft` ainda não teve aval.
 */
export async function publicarAgendados(): Promise<PublicacaoFeita> {
  const saida: PublicacaoFeita = { publicados: 0, falhas: [] };
  const agora = new Date();

  const pendentes = await prisma.socialPost.findMany({
    where: { status: "scheduled", scheduledFor: { lte: agora } },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PUBLICACOES_POR_RODADA,
  });
  if (pendentes.length === 0) return saida;

  for (const post of pendentes) {
    const falhar = async (erro: string) => {
      saida.falhas.push({ postId: post.id, erro });
      // O post CONTINUA "scheduled": a causa quase sempre é externa e
      // temporária (conta não conectada, mídia faltando). Marcar como falha
      // permanente enterraria trabalho pago. `lastError` é o que fica visível.
      await prisma.socialPost.update({ where: { id: post.id }, data: { lastError: erro } })
        .catch(() => { /* best-effort */ });
    };

    // A conta do CLIENTE, não a da agência. `clientId` nulo numa conexão
    // significa "conta da própria Dioli" — publicar o post de um cliente por
    // ali seria postar no perfil errado.
    if (!post.clientId) {
      await falhar("post sem cliente definido — não sei em qual perfil postar");
      continue;
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
      carrossel = (await Promise.all(guardadas.map((u) => urlPublicaDaMidia(u))))
        .filter((u): u is string => !!u);
      if (carrossel.length < 2) {
        await falhar(
          guardadas.length === 0
            ? "o carrossel ainda não tem as artes das telas"
            : `só ${carrossel.length} de ${guardadas.length} telas do carrossel têm link público`,
        );
        continue;
      }
    }

    const mediaUrl = await urlPublicaDaMidia(post.mediaUrl);
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

    let r;
    try {
      r = await publishPost(post.workspaceId, {
        connectionId: conexao.id,
        platform: "instagram",
        format: formato,
        caption: post.caption,
        ...(formato === "carousel" ? { mediaUrls: carrossel } : { mediaUrl }),
      });
    } catch (err) {
      await falhar(err instanceof Error ? err.message : "erro ao falar com a Meta");
      continue;
    }

    if (!r.ok) {
      await falhar(r.error ?? "falha na publicação");
      continue;
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        externalPostId: r.externalPostId ?? null,
        permalink: r.permalink ?? null,
        lastError: null,
      },
    });
    saida.publicados++;

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

function amanhaAs(hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/** Onde o calendário deste cliente para. Nunca antes de amanhã. */
async function proximaDataLivre(workspaceId: string, clientId: string | null): Promise<Date> {
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

function normalizarFormato(f: string): "feed" | "reel" | "story" | "carousel" {
  if (f === "reel" || f === "video") return "reel";
  if (f === "story") return "story";
  if (f === "carousel" || f === "carrossel") return "carousel";
  return "feed";
}

/** Lê uma lista guardada como JSON. Campo corrompido vira lista vazia — nunca
 *  exceção: um JSON quebrado não pode derrubar a rodada de publicação. */
function lerLista(bruto: string | null | undefined): string[] {
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
async function urlPublicaDaMidia(mediaUrl: string | null): Promise<string | undefined> {
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

interface PecaExtraida {
  legenda: string;
  formato: string;
  pilar: string | null;
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
    pecas.push({ legenda: legenda.slice(0, 2000), formato: formatoFinal, pilar: capturar(bloco, "Pilar"), cenas });
  }
  return pecas;
}

/**
 * Lê as telas do carrossel. O especialista escreve "1) tela · 2) tela · 3) ..."
 * — numa linha só ou em várias, porque modelo não é consistente nisso.
 *
 * Teto de 10 porque é o limite da Meta. Cortar aqui é melhor do que a Meta
 * recusar o carrossel inteiro na hora de publicar.
 */
function lerCenas(bruto: string | null): string[] {
  if (!bruto) return [];
  return bruto
    .split(/\s*(?:·|\||\n|(?<=[.!?])\s)?\s*\d+\)\s*/)
    .map((t) => t.replace(/^[·|\-\s]+/, "").trim())
    .filter((t) => t.length > 3)
    .slice(0, 10);
}

function capturar(bloco: string, campo: string): string | null {
  const m = bloco.match(new RegExp(`^-\\s*${campo}:\\s*(.+)$`, "mi"));
  return m?.[1]?.trim() ?? null;
}
