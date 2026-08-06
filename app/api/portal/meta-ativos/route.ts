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
import { loadConnectionToken, saveConnection } from "@/lib/integrations/meta/connections";
import { discoverPages, type DiscoveredPage } from "@/lib/integrations/meta/discovery";
import { lerContasQueOAcessoAlcanca } from "@/lib/integrations/meta/ads-leitura";
import { DEFAULT_SCOPES } from "@/lib/integrations/meta/config";
import {
  autorizarAtivos, revogarAtivo, idsAutorizados, normalizarId,
  TIPOS_DE_ATIVO, type TipoDeAtivo, type EntradaDeAutorizacao,
} from "@/lib/integrations/meta/ativos-autorizados";

export const dynamic = "force-dynamic";

interface AtivoAlcancado {
  tipo: TipoDeAtivo;
  externalId: string;
  nome: string;
  autorizado: boolean;
  /** Só para page/instagram: a Página dona (o IG publica com o token dela). */
  pageId?: string;
}

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

/** Tudo o que o token alcança, em uma lista só. Páginas e Instagram sempre;
 *  contas de anúncio quando a Meta liberar `ads_read` (sem App Review ela
 *  recusa — e isso vira lacuna declarada, não lista vazia silenciosa). */
async function alcance(
  workspaceId: string,
  connectionId: string,
): Promise<{ ativos: AtivoAlcancado[]; paginas: DiscoveredPage[]; lacunas: string[] }> {
  const lacunas: string[] = [];
  const ativos: AtivoAlcancado[] = [];

  const conn = await loadConnectionToken(workspaceId, connectionId);
  let paginas: DiscoveredPage[] = [];
  if (conn) {
    try {
      paginas = await discoverPages(conn.token);
    } catch (e) {
      lacunas.push(`Não consegui listar suas Páginas agora: ${e instanceof Error ? e.message : "erro na Meta"}`);
    }
  }

  for (const p of paginas) {
    ativos.push({ tipo: "page", externalId: p.id, nome: p.name, autorizado: false, pageId: p.id });
    if (p.instagram) {
      ativos.push({
        tipo: "instagram",
        externalId: p.instagram.id,
        nome: p.instagram.username ? `@${p.instagram.username}` : `Instagram ${p.instagram.id}`,
        autorizado: false,
        pageId: p.id,
      });
    }
  }

  const contas = await lerContasQueOAcessoAlcanca(workspaceId, connectionId);
  if (contas.ok && contas.dados) {
    for (const c of contas.dados) {
      ativos.push({
        tipo: "ad_account",
        externalId: c.id,
        nome: `${c.nome} · ${c.moeda}${c.ativa ? "" : ` · ${c.statusTexto}`}`,
        autorizado: false,
      });
    }
  } else if (contas.motivo && contas.motivo !== "sem_dado") {
    lacunas.push(contas.erro ?? "Não consegui listar suas contas de anúncio agora.");
  }

  return { ativos, paginas, lacunas };
}

// ─── GET: o que o acesso alcança e o que já está liberado ───────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const d = await dono(req);
  if (!d) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const connectionId = await conexaoDeUsuario(d.workspaceId, d.clientId);
  if (!connectionId) {
    return NextResponse.json({ semConexao: true, ativos: [], lacunas: [] });
  }

  const { ativos, lacunas } = await alcance(d.workspaceId, connectionId);

  const porTipo = new Map<TipoDeAtivo, Set<string>>();
  for (const t of TIPOS_DE_ATIVO) porTipo.set(t, await idsAutorizados(d.workspaceId, d.clientId, t));
  for (const a of ativos) {
    a.autorizado = porTipo.get(a.tipo)?.has(normalizarId(a.tipo, a.externalId)) ?? false;
  }

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

  let body: { ativos?: Array<{ tipo?: string; externalId?: string }> };
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const pedidos = Array.isArray(body.ativos) ? body.ativos : [];

  const connectionId = await conexaoDeUsuario(d.workspaceId, d.clientId);
  if (!connectionId) {
    return NextResponse.json({ error: "Conecte sua conta Meta antes de escolher o que liberar." }, { status: 409 });
  }

  // Só se autoriza o que o token DESTE cliente realmente alcança. Um id vindo
  // do corpo que a conta dele não administra não vira linha na lista: isso
  // seria a agência escrevendo autorização sobre ativo de terceiro.
  const { ativos: alcancados, paginas } = await alcance(d.workspaceId, connectionId);
  const conhecidos = new Map(alcancados.map((a) => [`${a.tipo}:${normalizarId(a.tipo, a.externalId)}`, a]));

  const entradas: EntradaDeAutorizacao[] = [];
  const recusados: string[] = [];
  for (const p of pedidos) {
    const tipo = TIPOS_DE_ATIVO.find((t) => t === p.tipo);
    const id = tipo ? normalizarId(tipo, String(p.externalId ?? "")) : "";
    const achado = tipo && id ? conhecidos.get(`${tipo}:${id}`) : undefined;
    if (!achado) { recusados.push(`${p.tipo ?? "?"}:${p.externalId ?? "?"}`); continue; }
    entradas.push({ tipo: achado.tipo, externalId: achado.externalId, nome: achado.nome });
  }

  const gravados = await autorizarAtivos(d.workspaceId, d.clientId, entradas, `portal:${d.clientId}`);

  // Com a autorização gravada, as conexões das Páginas/Instagram escolhidas
  // passam a poder existir (`saveConnection` confere a lista). O token de
  // Página vem da mesma descoberta — nenhuma chamada nova à Meta.
  let conexoes = 0;
  for (const e of entradas) {
    if (e.tipo === "page") {
      const p = paginas.find((x) => x.id === e.externalId);
      if (!p) continue;
      await saveConnection({
        workspaceId: d.workspaceId, clientId: d.clientId, platform: "facebook",
        name: p.name, externalId: p.id, accessToken: p.accessToken,
        tokenExpiresAt: null, scopes: DEFAULT_SCOPES, meta: { pageId: p.id },
      }).then(() => { conexoes++; }).catch(() => { /* a trava recusou: fica sem conexão */ });
    }
    if (e.tipo === "instagram") {
      const p = paginas.find((x) => x.instagram?.id === e.externalId);
      if (!p || !p.instagram) continue;
      await saveConnection({
        workspaceId: d.workspaceId, clientId: d.clientId, platform: "instagram",
        name: e.nome ?? `IG ${p.instagram.id}`, externalId: p.instagram.id,
        accessToken: p.accessToken, tokenExpiresAt: null, scopes: DEFAULT_SCOPES,
        meta: { pageId: p.id, igUserId: p.instagram.id },
      }).then(() => { conexoes++; }).catch(() => { /* idem */ });
    }
  }

  return NextResponse.json({ ok: true, autorizados: gravados, conexoes, recusados });
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
