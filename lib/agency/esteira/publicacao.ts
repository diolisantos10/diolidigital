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
import { caminhoPublicoAssinado } from "@/lib/agency/media/armazenamento";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";

/** Quantos posts publicamos por rodada do relógio. Publicação é irreversível e
 *  a Meta limita chamadas — melhor ir devagar e nunca em enxurrada. */
const MAX_PUBLICACOES_POR_RODADA = 10;

/** A que horas um post nasce quando ninguém escolheu horário. 10h é começo de
 *  expediente do público da maioria dos clientes desta casa. */
const HORA_PADRAO = 10;

/** Tipos de entregável que viram post. Estratégia e relatório não vão ao ar. */
const TIPOS_PUBLICAVEIS = ["social", "video"];

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
}

/**
 * Transforma as entregas de social apresentadas em posts com DATA.
 *
 * Idempotente POR ENTREGA (`deliverableId`): um `Deliverable` que já gerou
 * posts não gera de novo, mas uma entrega nova depois (mês 2, refação) gera.
 * Idempotência por projeto travaria a agência no primeiro mês para sempre.
 */
export async function agendarPostsDaEntrega(projectId: string): Promise<AgendamentoFeito> {
  const saida: AgendamentoFeito = { projectId, criados: 0, jaAgendadas: 0, naoInterpretadas: [], bloqueadasPorPilar: [] };

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
      // ── A TRAVA DE PILAR, ANTES DE A PEÇA EXISTIR ─────────────────────────
      // Barrar só na hora da arte deixaria a peça no calendário do CLIENTE,
      // com data marcada, para nunca sair — que é a definição de fila morta.
      // Aqui ela simplesmente não nasce, e o fato é registrado.
      const veredito = conferirPilar(peca.pilar);
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
      await prisma.socialPost.update({ where: { id: post.id }, data: { lastError: erro } })
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

    // ── O FORMATO DO ARQUIVO, ANTES DE FALAR COM A META ─────────────────────
    // 08/08/2026: com o interruptor JÁ LIBERADO, os 6 carrosséis da Foocci
    // falhavam 12 vezes por hora com "Only photo or video can be accepted as
    // media type" — as 36 telas são PNG, e o Instagram só aceita JPEG. A casa
    // descobria isso PERGUNTANDO À META, em rajada permanente, contra a conta
    // de um cliente, com o app em modo de desenvolvimento. É o padrão de
    // 03/08. Ver `lib/integrations/meta/formato-de-midia.ts`.
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
      data: { status: "scheduled", scheduledFor: quando },
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

import { quebrarCenas } from "@/lib/agency/design/storyboard";

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
