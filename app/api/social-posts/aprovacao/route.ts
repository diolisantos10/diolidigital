// POST /api/social-posts/aprovacao — a EQUIPE abre uma aprovação a partir dos
// posts do calendário. Rota master (e PM): é ato de negócio, não de produção.
//
// Por que existe: no lançamento da Foocci (03/08/2026) as 6 peças do carrossel
// estavam no calendário como "Esperando você" — e NENHUMA ApprovalRequest
// existia, porque toda aprovação nascia do fluxo Brain (por ClientRequestDb) e
// cliente criado direto não tem solicitação. O portal se contradizia: o Início
// dizia "nada depende de você" enquanto o calendário prometia uma aba de
// Aprovações vazia. Esta rota é o caminho que faltava: posts → UM card.
//
// O card nasce com:
//   • clientId derivado DOS POSTS (nunca do corpo — dono não viaja em request);
//   • reviewNote no formato que o portal já renderiza ("Título\n\ncorpo"),
//     corpo montado da caption + cenas (scenesJson) de cada peça;
//   • sourcePostIdsJson = a origem calendário + o que a decisão propaga:
//     aprovar → posts "approved" · ajuste/recusa → "revision_requested"
//     (a propagação vive em app/api/portal/approvals/route.ts).
//
// ── 14/08/2026: A REGRA SAIU DAQUI, O CONTRATO DESTA ROTA FICOU ──────────────
//
// O corpo do card e a triagem das peças moram agora em
// `lib/agency/esteira/cards-de-aprovacao.ts`, porque o piloto do CityJobs
// precisou abrir o MESMO card sem sessão de master na mão. Duas cópias da regra
// divergiriam, e a divergência apareceria no que o CLIENTE lê — o `reviewNote` é
// renderizado pelo portal.
//
// O que NÃO saiu daqui, de propósito: o guard de sessão, a posse por
// `workspaceId` e o RIGOR. Nesta rota alguém escolheu as peças a dedo, então uma
// peça inelegível é ERRO HTTP e não uma exclusão silenciosa — quem escolheu
// precisa saber que uma ficou de fora. Os códigos são os mesmos de antes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import {
  corpoDoCard,
  lerLista,
  DEPARTAMENTO,
  MAX_PECAS_POR_CARD,
} from "@/lib/agency/esteira/cards-de-aprovacao";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  let body: { postIds?: unknown; expiresAt?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const postIds = Array.isArray(body.postIds)
    ? [...new Set(body.postIds.filter((x): x is string => typeof x === "string" && !!x.trim()))]
    : [];
  if (postIds.length === 0) {
    return NextResponse.json({ error: "postIds é obrigatório (lista de ids de SocialPost)" }, { status: 400 });
  }
  if (postIds.length > MAX_PECAS_POR_CARD) {
    return NextResponse.json({ error: `No máximo ${MAX_PECAS_POR_CARD} peças por card de aprovação` }, { status: 400 });
  }

  try {
    // Posse pela SESSÃO: só posts do workspace de quem chama. Id de outro
    // workspace simplesmente "não existe" aqui (404, nunca 403 — não confirma).
    const posts = await prisma.socialPost.findMany({
      where: { id: { in: postIds }, workspaceId: session.workspaceId },
      select: {
        id: true, clientId: true, caption: true, format: true,
        pillar: true, status: true, visibility: true, scenesJson: true, scheduledFor: true,
      },
    });
    if (posts.length !== postIds.length) {
      return NextResponse.json({ error: "Um ou mais posts não foram encontrados" }, { status: 404 });
    }

    // UM card decide UM pacote de UM cliente. Post sem cliente não tem quem
    // aprove; posts de clientes misturados fariam um cliente decidir pelo outro.
    const clientIds = [...new Set(posts.map((p) => p.clientId))];
    if (clientIds.length !== 1 || !clientIds[0]) {
      return NextResponse.json(
        { error: "Todos os posts precisam pertencer ao MESMO cliente (e ter cliente definido)" },
        { status: 400 },
      );
    }
    const clientId = clientIds[0];

    // O cliente só pode decidir o que pode VER: post "interno" não entra num
    // card clientVisible — fail-closed, mesma regra do calendário do portal.
    const internos = posts.filter((p) => p.visibility !== "compartilhado");
    if (internos.length > 0) {
      return NextResponse.json(
        { error: `${internos.length} post(s) ainda estão com visibilidade "interno" — compartilhe antes de pedir aprovação` },
        { status: 400 },
      );
    }

    // Post já publicado não se aprova — a decisão chegaria depois do fato.
    const publicados = posts.filter((p) => p.status === "published");
    if (publicados.length > 0) {
      return NextResponse.json(
        { error: `${publicados.length} post(s) já publicados não entram em aprovação` },
        { status: 400 },
      );
    }

    // Idempotência de negócio: um post não pode estar em DOIS cards pendentes —
    // o cliente decidiria a mesma peça duas vezes, com resultados divergentes.
    const pendentes = await prisma.approvalRequest.findMany({
      where: { clientId, status: "pending", sourcePostIdsJson: { not: "[]" } },
      select: { id: true, sourcePostIdsJson: true },
    });
    const jaEmCard = new Set(pendentes.flatMap((a) => lerLista(a.sourcePostIdsJson)));
    const repetidos = postIds.filter((id) => jaEmCard.has(id));
    if (repetidos.length > 0) {
      return NextResponse.json(
        { error: `${repetidos.length} post(s) já estão num card de aprovação pendente` },
        { status: 409 },
      );
    }

    // ── O corpo do card, no formato que o portal já renderiza ────────────────
    // A régua é `corpoDoCard` e ela é a MESMA do caminho administrativo: título
    // na primeira linha, peças no resto. Ver o cabeçalho.
    const { titulo, reviewNote, ordenados } = corpoDoCard(posts);
    const n = ordenados.length;

    const expiresAt =
      typeof body.expiresAt === "string" && !Number.isNaN(Date.parse(body.expiresAt))
        ? new Date(body.expiresAt)
        : undefined;

    const aprovacao = await createApprovalRequest({
      clientId,
      department:    DEPARTAMENTO,
      // Origem marcada: quem abriu foi a EQUIPE a partir do calendário — não o
      // fluxo Brain. `sourcePostIds` é a outra metade da marca (e a propagação).
      requestedBy:   `equipe:${session.email}`,
      clientVisible: true,
      reviewNote,
      sourcePostIds: ordenados.map((p) => p.id),
      expiresAt,
    });

    return NextResponse.json({
      ok: true,
      approvalRequestId: aprovacao.id,
      clientId,
      titulo,
      pecas: n,
    });
  } catch (e) {
    console.error("[social-posts/aprovacao] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
