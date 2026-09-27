// Edit / delete a single planned post (agency only).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { autorDaEquipe, lerRegistroDePublicacao } from "@/lib/agency/esteira/registro-de-publicacao";
import { semanaTravada } from "@/lib/agency/esteira/semana-editorial";
import {
  podeRefazer,
  registrarRefacaoDaPeca,
  FRASE_LIMITE_ESTOURADO_AO_CLIENTE,
} from "@/lib/agency/esteira/limite-de-refacoes";

type Params = { id: string };

/** Os estados do contrato (schema: draft|scheduled|approved|published|failed). */
const STATUS_VALIDOS = new Set(["draft", "scheduled", "approved", "published", "failed"]);

export async function PATCH(request: NextRequest, ctx: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;
  const { id } = await ctx.params;

  const existing = await prisma.socialPost.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: Record<string, unknown> = {};
  if (typeof body.caption === "string") data.caption = body.caption;
  // O CLIENTE do post era ignorado no PATCH: a equipe trocava o cliente no
  // editor, salvava, e nada acontecia — em silêncio. Trocar o cliente reabre a
  // solicitação vinculada (é ela que liga o post à conversa do portal).
  //
  // ⚠️ O `clientId` VEM DO CORPO — logo tem de ser CONFERIDO contra o workspace
  // da sessão antes de ser gravado. Sem essa conferência, staff do workspace A
  // manda o id de um cliente do workspace B, o `clientRequestId` vira o do B, o
  // fail-closed de `visibility` vê "tem dono" e aprova, e a peça do A aparece no
  // portal do cliente do B. Vazamento entre inquilinos, sem erro nenhum na tela.
  if (typeof body.clientId === "string" || body.clientId === null) {
    const novoClientId = body.clientId || null;
    if (novoClientId) {
      const cliente = await prisma.client.findFirst({
        where: { id: novoClientId, workspaceId: session.workspaceId }, select: { id: true },
      });
      if (!cliente) {
        return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
      }
    }
    data.clientId = novoClientId;
    if (novoClientId !== existing.clientId) {
      const latest = novoClientId
        ? await prisma.clientRequestDb.findFirst({
            where: { clientId: novoClientId, workspaceId: session.workspaceId },
            orderBy: { createdAt: "desc" }, select: { id: true },
          })
        : null;
      data.clientRequestId = latest?.id ?? null;
    }
  }
  if (Array.isArray(body.networks)) data.networks = JSON.stringify((body.networks as unknown[]).filter((x) => typeof x === "string"));
  if (typeof body.format === "string") data.format = body.format;
  if (typeof body.pillar === "string" || body.pillar === null) data.pillar = body.pillar;
  if (typeof body.mediaUrl === "string" || body.mediaUrl === null) data.mediaUrl = body.mediaUrl;
  // As telas do carrossel: aceita SOMENTE array de strings e normaliza para
  // JSON — necessário para backfill e ajustes pela API. Qualquer outro tipo é
  // ignorado (não zera o que existe por engano); array vazio limpa de propósito.
  const listaDeTexto = (v: unknown): string[] =>
    (v as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim());
  const telas = body.telas ?? body.mediaUrlsJson;
  if (Array.isArray(telas)) {
    const lista = listaDeTexto(telas);
    data.mediaUrlsJson = JSON.stringify(lista);
    // ── INVARIANTE "A CAPA É A TELA 1" — travado NO DADO, não na tela ────────
    // `mediaUrl` (a capa que o portal mostra no card) e `mediaUrlsJson` (o que
    // `esteira/publicacao.ts:232` publica na Meta) chegam do Composer como dois
    // campos independentes. Gravados sem reconciliar, trocar ou apagar a tela 1
    // no editor deixa a capa apontando para uma arte que NÃO é a primeira do
    // carrossel publicado: o cliente aprova uma imagem e sai outra em nome dele.
    // Por isso o servidor decide — consertar no Composer deixaria a rota aberta
    // para qualquer outro chamador.
    if (lista.length > 0) data.mediaUrl = lista[0];
  }
  // As descrições internas das telas — o que o gerador de arte usa para desenhar
  // CADA tela. Sem isto no PATCH, carrossel só entrava pela esteira.
  const cenas = body.cenas ?? body.scenesJson;
  if (Array.isArray(cenas)) data.scenesJson = JSON.stringify(listaDeTexto(cenas));
  if (body.script === null) data.scriptJson = null;
  else if (body.script && typeof body.script === "object") data.scriptJson = JSON.stringify(body.script);
  if (typeof body.status === "string") {
    if (!STATUS_VALIDOS.has(body.status)) {
      return NextResponse.json({ error: `Status inválido: ${body.status}` }, { status: 400 });
    }
    data.status = body.status;
  }
  // A equipe decide o que o cliente vê. Só os dois valores do contrato de
  // visibilidade — qualquer outro cai fora (fail-closed).
  if (body.visibility === "compartilhado" || body.visibility === "interno") {
    // "Compartilhado" sem dono é promessa que ninguém recebe: nenhuma rota de
    // portal consegue alcançar um post sem cliente nem solicitação. Dizer isso
    // é melhor que gravar um estado que a tela mostra como "o cliente vê".
    const clientIdFinal = "clientId" in data ? (data.clientId as string | null) : existing.clientId;
    const requestIdFinal = "clientRequestId" in data
      ? (data.clientRequestId as string | null)
      : existing.clientRequestId;
    if (body.visibility === "compartilhado" && !clientIdFinal && !requestIdFinal) {
      return NextResponse.json(
        { error: "Escolha um cliente antes de compartilhar — sem cliente não existe portal onde este post apareça." },
        { status: 400 },
      );
    }
    data.visibility = body.visibility;
  }
  if (body.scheduledFor === null) data.scheduledFor = null;
  else if (typeof body.scheduledFor === "string" && body.scheduledFor) data.scheduledFor = new Date(body.scheduledFor);

  // ── O REGISTRO DA PUBLICAÇÃO FEITA À MÃO (14/08/2026) ─────────────────────
  // A régua vive em `lib/agency/esteira/registro-de-publicacao.ts` — aqui só a
  // fiação. Ela recusa marcar "publicado" sem o `externalPostId` (o post
  // fantasma do relatório) e carimba QUEM registrou.
  //
  // Nada aqui chama a plataforma: o post já foi ao ar pelas mãos de alguém, e
  // uma chamada à Meta neste caminho publicaria a peça uma segunda vez.
  const registro = lerRegistroDePublicacao({
    body,
    statusPedido: typeof data.status === "string" ? data.status : null,
    atual: { status: existing.status, externalPostId: existing.externalPostId },
    autor: autorDaEquipe(session.email),
  });
  if (registro.erro) return NextResponse.json({ error: registro.erro }, { status: 400 });
  Object.assign(data, registro.dados);

  // ── TRAVA DA SEMANA + LIMITE MENSAL DE REFAÇÕES (1C-C2, 28/09/2026) ───────
  //
  // Ordem do CEO: editar legenda ou arte de uma peça do CALENDÁRIO EDITORIAL
  // (sem `deliverableId` — a mesma identidade que `refacao.ts` usa para
  // "card de semana") DEPOIS da trava da semana é REGENERAÇÃO DA PEÇA, e
  // conta no limite mensal do cliente — mesmo quando quem editou foi a
  // EQUIPE pelo Composer, não o cliente pelo portal. Peça com `deliverableId`
  // (nasceu de um projeto/entrega) fica fora: aquele caminho tem o próprio
  // teto (`MAX_REFACOES_DO_CLIENTE`, em `refacao.ts`).
  //
  // ⚠️ ACHADO 3, Q4-qualidade (27/09/2026): a trava acima era contornável em
  // DOIS PATCHs na MESMA rota, mesmo botão de UI (arrastar card + editar
  // Composer): (1) `PATCH { scheduledFor: <futuro> }` — `mudouLegendaOuArte`
  // de propósito não olha `scheduledFor`, então passava sem checar nada; (2)
  // `PATCH { caption: "..." }` — a essa altura `existing.scheduledFor` JÁ era
  // o futuro gravado pelo PATCH (1), `semanaTravada` calculava `false`, e a
  // edição passava sem contar no limite e sem checar o teto — mesmo a peça
  // tendo sido aprovada e travada minutos antes.
  //
  // O conserto escolhido (mais simples e seguro que "contar a mudança de data
  // como refação própria" — não exige uma segunda régua de "o que mudou"):
  //
  //   1. Mudar `scheduledFor` de uma peça de calendário cuja data ATUAL já
  //      está travada é RECUSADO (409) — mudar a data depois da trava É
  //      refação, e o caminho para isso é o pedido de ajuste (`refacao.ts`),
  //      que já respeita o limite;
  //   2. A checagem de legenda/arte passa a considerar travada a peça cuja
  //      data ANTIGA *OU* NOVA caia numa semana travada — fecha o caso (mais
  //      raro, mas real) de UM PATCH só mover a peça PARA DENTRO de uma
  //      semana já travada e mudar a arte junto.
  const dataAntiga = existing.scheduledFor;
  const trocouData = "scheduledFor" in data;
  const dataNova = trocouData ? (data.scheduledFor as Date | null) : dataAntiga;
  const antigaTravada = !!dataAntiga && semanaTravada({ scheduledFor: dataAntiga }, new Date());
  const novaTravada = !!dataNova && semanaTravada({ scheduledFor: dataNova }, new Date());
  const houveMudancaDeData = trocouData && (dataNova?.getTime() ?? null) !== (dataAntiga?.getTime() ?? null);

  if (houveMudancaDeData && existing.clientId && !existing.deliverableId && antigaTravada) {
    return NextResponse.json(
      { error: "semana travada: mudar a data vira refação — use o pedido de ajuste" },
      { status: 409 },
    );
  }

  const mudouLegendaOuArte =
    (typeof data.caption === "string" && data.caption !== existing.caption) ||
    ("mediaUrl" in data && data.mediaUrl !== existing.mediaUrl) ||
    (typeof data.mediaUrlsJson === "string" && data.mediaUrlsJson !== existing.mediaUrlsJson) ||
    (typeof data.scenesJson === "string" && data.scenesJson !== existing.scenesJson);

  let refacaoParaRegistrar: { clientId: string; contaNoLimite: boolean } | null = null;
  if (mudouLegendaOuArte && existing.clientId && !existing.deliverableId) {
    const travada = antigaTravada || novaTravada;
    if (travada) {
      const veredito = await podeRefazer({ clientId: existing.clientId });
      if (!veredito.pode) {
        await prisma.activityEvent
          .create({
            data: {
              workspaceId: existing.workspaceId,
              clientId: existing.clientId,
              type: "limite_de_refacoes_estourado",
              message:
                `A equipe (${session.email}) tentou editar a peça ${existing.id} — semana travada e o ` +
                "limite mensal de refações do cliente já acabou.",
            },
          })
          .catch(() => { /* best-effort */ });
        return NextResponse.json({ error: FRASE_LIMITE_ESTOURADO_AO_CLIENTE }, { status: 409 });
      }
    }
    refacaoParaRegistrar = { clientId: existing.clientId, contaNoLimite: travada };
  }

  try {
    const post = await prisma.socialPost.update({ where: { id }, data });
    if (refacaoParaRegistrar) {
      await registrarRefacaoDaPeca({
        workspaceId: existing.workspaceId,
        clientId: refacaoParaRegistrar.clientId,
        socialPostId: existing.id,
        motivo: `edição da equipe (${session.email}) — legenda e/ou arte alteradas pelo editor`,
        origem: "equipe",
        contaNoLimite: refacaoParaRegistrar.contaNoLimite,
      });
    }
    if (registro.marcandoPublicado) {
      // A testemunha. Sem ela, "quem marcou" só existiria dentro do post — e a
      // linha do tempo do cliente mostraria a peça no ar sem nunca dizer que a
      // publicação foi manual.
      await prisma.activityEvent.create({
        data: {
          workspaceId: existing.workspaceId,
          clientId: existing.clientId,
          type: "post_publicado_a_mao",
          message:
            `Publicação registrada À MÃO por ${data.publishedBy} — id na plataforma ` +
            `${data.externalPostId ?? existing.externalPostId}: ${existing.caption.slice(0, 120)}`,
        },
      }).catch(() => { /* best-effort: o registro não pode desfazer a marcação */ });
    }
    return NextResponse.json({ ok: true, id: post.id });
  } catch (e) {
    console.error("[social-posts] PATCH error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<Params> }): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager", "social_staff"]);
  if (error) return error;
  const { id } = await ctx.params;
  const existing = await prisma.socialPost.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await prisma.socialPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
