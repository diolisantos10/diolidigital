// DB helpers for MetaConnection rows. SERVER-ONLY.
// Tokens are ALWAYS encrypted here before hitting the database, and decrypted
// only when a Graph call needs them (loadToken).

import { prisma } from "@/lib/db/client";
import { encryptSecret, decryptSecret, keyHint } from "@/lib/security/crypto";
import type { MetaConnectionView, MetaPlatform } from "./types";
import { TIPO_POR_PLATAFORMA, ativoAutorizado, normalizarId, donoDe } from "./ativos-autorizados";

/** A conexão foi recusada porque o ativo não está na lista do DONO — o cliente,
 *  na tela dele; a agência, na tela dela. Um só significado, dois donos. */
export class AtivoNaoAutorizadoError extends Error {
  constructor(public platform: string, public externalId: string) {
    super(
      `Ninguém autorizou "${externalId}" (${platform}). ` +
        `Só entra em MetaConnection o ativo que o dono marcou — cliente no portal, agência em Integrações.`,
    );
    this.name = "AtivoNaoAutorizadoError";
  }
}

interface SaveConnectionInput {
  workspaceId: string;
  clientId?: string | null;
  platform: MetaPlatform;
  name: string;
  externalId: string;
  accessToken: string; // plaintext — encrypted inside this function
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  meta?: Record<string, unknown>;
}

// Row → view (never exposes the token).
function toView(row: {
  id: string; platform: string; name: string; externalId: string; clientId: string | null;
  status: string; tokenHint: string | null; tokenExpiresAt: Date | null; scopes: string;
  connectedAt: Date; lastSyncedAt: Date | null;
}): MetaConnectionView {
  let scopes: string[] = [];
  try { scopes = JSON.parse(row.scopes) as string[]; } catch { /* ignore */ }
  return {
    id: row.id,
    platform: row.platform as MetaPlatform,
    name: row.name,
    externalId: row.externalId,
    clientId: row.clientId,
    status: row.status,
    tokenHint: row.tokenHint,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    scopes,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
  };
}

/**
 * ─── A TRAVA, NO PONTO ONDE O DADO NASCE (06/08/2026) ──────────────────────
 *
 * Até hoje, o callback do OAuth varria `me/accounts` e gravava aqui TODAS as
 * Páginas e Instagram que o token alcançava, carimbadas com o `clientId` de
 * quem clicou no portal. Resultado real, com o token do CEO no portal da
 * Foocci: as Páginas de Santioh, Dilix, Queise, DileeBags e as pessoais dele
 * viraram "conexões da Foocci" — **com o token de Página junto**, isto é, com
 * poder de publicar. Uma varredura do que o token alcança não é uma
 * autorização.
 *
 * Agora: ativo de CLIENTE (`clientId` preenchido) só é gravado se estiver na
 * lista que o próprio cliente marcou (`MetaAtivoAutorizado`). Sem linha na
 * lista, `saveConnection` LANÇA — não grava e não devolve silêncio.
 *
 * ─── E A AGÊNCIA? A EXCEÇÃO CAIU EM 06/08/2026 (à noite) ───────────────────
 *
 * Até esta linha ser escrita, `clientId === null` — a conta da própria agência
 * — era exceção declarada: passava sem consultar lista nenhuma. A perícia
 * contra o banco de PRODUÇÃO mostrou que essa exceção não era teórica, era o
 * VETOR: as 19 conexões de terceiros (Sushi Cazza, Dilee, Kero Shop, Acesso
 * Beleza, santioh_, dilix.br, queise, Santioh Europe, Spa da Mente, City Jobs
 * SP) entraram em 03/08 às 14:05 por `/api/meta/token`, que grava com dono
 * nulo. Fechar só o lado do cliente era fechar a porta da frente e deixar a
 * dos fundos escancarada — e limpar o banco antes disso é limpeza que o
 * próximo token colado desfaz.
 *
 * "Quem autoriza e quem é dono são a mesma pessoa" continua verdade — e é
 * exatamente por isso que a pessoa precisa MARCAR. O operador escolhe em
 * `/api/meta/ativos`; o que ele não marcou não vira conexão.
 *
 * Sobra UMA exceção, e só uma:
 *   • `platform: "user"` — o token de usuário é a CREDENCIAL que a pessoa
 *     concedeu, não um ativo escolhido. Sem ele não há como nem mostrar a lista
 *     de contas para ela marcar. Ele não dá acesso a nada por si: todo caminho
 *     de leitura filtra pela lista antes de devolver qualquer coisa.
 */
async function conferirAutorizacao(input: SaveConnectionInput): Promise<void> {
  const tipo = TIPO_POR_PLATAFORMA[input.platform] ?? null;
  if (tipo === null) return; // "user": credencial, não ativo.

  // `donoDe` e não `?? null`: "sem cliente" chega aqui em duas grafias — `null`
  // do callback e `""` de `/api/meta/token`. Ver a perícia em `donoDe`.
  // `null` (a agência) NÃO é mais atalho: ele é um dono como qualquer outro, e
  // `idsAutorizados`/`ativoAutorizado` já o tratam pela chave `agencia`.
  const clientId = donoDe(input.clientId);

  const ok = await ativoAutorizado(input.workspaceId, clientId, tipo, input.externalId);
  if (!ok) throw new AtivoNaoAutorizadoError(input.platform, normalizarId(tipo, input.externalId));
}

// Upsert a connection (unique on workspaceId+platform+externalId).
export async function saveConnection(input: SaveConnectionInput): Promise<MetaConnectionView> {
  await conferirAutorizacao(input);
  const encrypted = encryptSecret(input.accessToken);
  const hint = keyHint(input.accessToken);
  const scopes = JSON.stringify(input.scopes ?? []);
  const metaJson = JSON.stringify(input.meta ?? {});

  const row = await prisma.metaConnection.upsert({
    where: {
      workspaceId_platform_externalId: {
        workspaceId: input.workspaceId,
        platform: input.platform,
        externalId: input.externalId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      // Nunca mais gravar `""` como dono: era a segunda grafia de "sem cliente".
      clientId: donoDe(input.clientId),
      platform: input.platform,
      name: input.name,
      externalId: input.externalId,
      accessTokenEncrypted: encrypted,
      tokenHint: hint,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes,
      metaJson,
      status: "connected",
      lastSyncedAt: new Date(),
    },
    update: {
      clientId: donoDe(input.clientId) ?? undefined,
      name: input.name,
      accessTokenEncrypted: encrypted,
      tokenHint: hint,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes,
      metaJson,
      status: "connected",
      lastSyncedAt: new Date(),
    },
  });

  return toView(row);
}

export async function listConnections(workspaceId: string): Promise<MetaConnectionView[]> {
  const rows = await prisma.metaConnection.findMany({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
  return rows.map(toView);
}

// Loads the decrypted token + externalId + platform for a connection. Returns
// null if the connection doesn't exist, isn't in this workspace, or the token
// can't be decrypted.
//
// ⚠️ `clientId` SAI DAQUI DE PROPÓSITO (06/08/2026). Quem usa um token precisa
// saber DE QUEM ele é para consultar a lista de ativos autorizados — e a
// resposta tem que vir da linha da conexão, nunca de um `clientId` que o
// chamador passou. Trava derivada; trava comparada é trava que a próxima rota
// contorna sem perceber.
export async function loadConnectionToken(
  workspaceId: string,
  connectionId: string,
): Promise<{
  token: string;
  externalId: string;
  platform: MetaPlatform;
  clientId: string | null;
  metaJson: Record<string, unknown>;
} | null> {
  const row = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.workspaceId !== workspaceId) return null;
  const token = decryptSecret(row.accessTokenEncrypted);
  if (!token) return null;
  let metaJson: Record<string, unknown> = {};
  try { metaJson = JSON.parse(row.metaJson) as Record<string, unknown>; } catch { /* ignore */ }
  return {
    token,
    externalId: row.externalId,
    platform: row.platform as MetaPlatform,
    // Normalizado: a linha pode ter `""` (gravado antes de 06/08/2026). Quem
    // recebe isto consulta a lista de autorizados — com `""` consultaria o
    // ramo do CLIENTE para um ativo da agência.
    clientId: donoDe(row.clientId),
    metaJson,
  };
}

// ─── Resolução cliente → conexão ────────────────────────────────────────────
// A pergunta que meia casa fazia com findFirst inline: "qual é a conexão de
// Instagram DESTE cliente?". Centralizada aqui porque a resposta tem nuance:
// `clientId` nulo numa conexão significa "conta da própria agência" — buscar
// sem o clientId publicaria/leria o perfil errado. E uma conexão pode existir
// com status "expired"/"revoked": isso NÃO é "sem conexão", é "reconecte" —
// dois estados que o portal precisa distinguir.

export interface ConexaoResolvida {
  id: string;
  platform: MetaPlatform;
  externalId: string;
  /** "connected" | "expired" | "revoked" — quem lê decide o que fazer. */
  status: string;
  tokenExpiresAt: Date | null;
  metaJson: Record<string, unknown>;
  /** null quando o token não decifra (chave trocada) — trate como reconectar. */
  token: string | null;
}

/**
 * A conexão da plataforma para ESTE cliente (ou da agência, com clientId null).
 * Prefere a conectada; na falta, devolve a mais recente em qualquer status —
 * para o chamador poder dizer "precisa reconectar" em vez de "não existe".
 */
export async function conexaoDoCliente(
  workspaceId: string,
  clientId: string | null,
  platform: MetaPlatform,
): Promise<ConexaoResolvida | null> {
  const where = { workspaceId, clientId, platform };
  const row =
    (await prisma.metaConnection.findFirst({
      where: { ...where, status: "connected" },
      orderBy: { connectedAt: "desc" },
    })) ??
    (await prisma.metaConnection.findFirst({ where, orderBy: { connectedAt: "desc" } }));
  if (!row) return null;

  let metaJson: Record<string, unknown> = {};
  try { metaJson = JSON.parse(row.metaJson) as Record<string, unknown>; } catch { /* ignore */ }
  return {
    id: row.id,
    platform: row.platform as MetaPlatform,
    externalId: row.externalId,
    status: row.status,
    tokenExpiresAt: row.tokenExpiresAt,
    metaJson,
    token: decryptSecret(row.accessTokenEncrypted),
  };
}

/**
 * Carimba a conexão como expirada quando a Graph responde OAuth 190.
 * Best-effort: é o que faz o portal dizer "reconecte" na PRÓXIMA visita em vez
 * de tentar de novo com um token que a Meta já recusou.
 */
export async function marcarConexaoExpirada(connectionId: string): Promise<void> {
  await prisma.metaConnection.update({
    where: { id: connectionId },
    data: { status: "expired" },
  }).catch(() => { /* best-effort */ });
}

export async function deleteConnection(workspaceId: string, connectionId: string): Promise<boolean> {
  const row = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.workspaceId !== workspaceId) return false;
  await prisma.metaConnection.delete({ where: { id: connectionId } });
  return true;
}
