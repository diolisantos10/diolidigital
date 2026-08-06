// /api/portal/meta-ativos — A ESCOLHA É DO CLIENTE, NA TELA DELE.
//
// ─── POR QUE ESTA ROTA EXISTE (incidente de 06/08/2026) ─────────────────────
//
// O CEO clicou "Conectar Facebook/Instagram" no portal da Foocci. A Meta
// devolveu um token do USUÁRIO dele, e a agência passou a alcançar 14 contas de
// anúncio e todas as Páginas/Instagram da vida dele — Santioh, Dilix, Queise,
// DileeBags, contas pessoais. Ele autorizou a Foocci. A agência ganhou o resto
// junto.
//
// O conserto não é filtrar melhor: é PERGUNTAR. Depois de conectar, o dono do
// negócio vê o que o acesso dele alcança e marca o que a agência pode usar.
// Enquanto não marcar, a agência não lê nada — e a tela diz isso com todas as
// letras, em vez de mostrar dado que não devia ter.
//
// ─── AS TRÊS REGRAS DESTA ROTA ──────────────────────────────────────────────
//
// 1. **DERIVAÇÃO, NUNCA COMPARAÇÃO.** O cliente dono vem do token do portal.
//    `clientId` de query ou de corpo é ignorado — nem é lido.
// 2. **SÓ O DONO VÊ O ALCANCE CRU.** O GET aqui é o único lugar da casa que
//    mostra tudo o que o token alcança, e quem está olhando é o dono das contas
//    vendo as próprias contas. O caminho da agência (`lerContasDeAnuncio`)
//    filtra sempre.
// 3. **REVOGAR APAGA.** Desmarcar remove a linha da lista **e** a MetaConnection
//    correspondente — deixar o token guardado depois de revogado seria manter
//    exatamente o dano que a trava existe para impedir.
//
// Somente leitura na Meta: GET lista, POST/DELETE mexem só no banco desta casa
// (e, no POST, gravam a conexão com o token de Página que a Meta já devolveu).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import {
  alcanceDoAcesso, marcarAutorizados, aplicarEscolha, type PedidoDeEscolha,
} from "@/lib/integrations/meta/escolha-de-ativos";
import { revogarAtivo, TIPOS_DE_ATIVO } from "@/lib/integrations/meta/ativos-autorizados";

export const dynamic = "force-dynamic";

// ⚠️ O QUE ERA CÓDIGO AQUI VIROU MÓDULO (06/08/2026, noite). O alcance, a
// aplicação da escolha e a gravação moravam nesta rota — e quando chegou a hora
// de dar a MESMA tela à agência, copiar seria criar um segundo mecanismo. Dois
// mecanismos divergem: conserta-se um, esquece-se o outro, e o incidente volta
// pela porta que ninguém está olhando. A lógica agora é
// `lib/integrations/meta/escolha-de-ativos.ts`, compartilhada com
// `/api/meta/ativos`. Esta rota guarda o que é DELA: quem é o dono.

async function dono(req: NextRequest) {
  const token = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!token) return null;
  return resolvePortalClient(token);
}

/** A conexão de USUÁRIO do cliente — a credencial que ele concedeu. Sem ela não
 *  há o que listar, e isso é "conecte primeiro", não erro. */
async function conexaoDeUsuario(workspaceId: string, clientId: string): Promise<string | null> {
  const row = await prisma.metaConnection
    .findFirst({
      where: { workspaceId, clientId, platform: "user", status: "connected" },
      orderBy: { connectedAt: "desc" },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ?? null;
}

// ─── GET: o que o acesso alcança e o que já está liberado ───────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const d = await dono(req);
  if (!d) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const connectionId = await conexaoDeUsuario(d.workspaceId, d.clientId);
  if (!connectionId) {
    return NextResponse.json({ semConexao: true, ativos: [], lacunas: [] });
  }

  const { ativos, lacunas } = await alcanceDoAcesso(d.workspaceId, connectionId);
  await marcarAutorizados(d.workspaceId, d.clientId, ativos);

  return NextResponse.json({
    semConexao: false,
    ativos,
    liberados: ativos.filter((a) => a.autorizado).length,
    lacunas,
  });
}

// ─── POST: o cliente marca o que libera ─────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const d = await dono(req);
  if (!d) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  let body: { ativos?: PedidoDeEscolha[] };
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const pedidos = Array.isArray(body.ativos) ? body.ativos : [];

  const connectionId = await conexaoDeUsuario(d.workspaceId, d.clientId);
  if (!connectionId) {
    return NextResponse.json({ error: "Conecte sua conta Meta antes de escolher o que liberar." }, { status: 409 });
  }

  const r = await aplicarEscolha({
    workspaceId: d.workspaceId,
    clientId: d.clientId,
    connectionId,
    pedidos,
    autorizadoPor: `portal:${d.clientId}`,
  });

  return NextResponse.json({ ok: true, ...r });
}

// ─── DELETE: revogar ────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const d = await dono(req);
  if (!d) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const tipo = TIPOS_DE_ATIVO.find((t) => t === q.get("tipo"));
  const externalId = q.get("externalId") ?? "";
  if (!tipo || !externalId) {
    return NextResponse.json({ error: "informe tipo e externalId" }, { status: 400 });
  }

  const r = await revogarAtivo(d.workspaceId, d.clientId, tipo, externalId);
  return NextResponse.json({ ok: true, ...r });
}
