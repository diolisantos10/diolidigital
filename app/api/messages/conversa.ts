// conversa.ts — a âncora da conversa cliente ↔ agência, num lugar só.
//
// ── O defeito que este arquivo fecha ─────────────────────────────────────────
// A thread era ancorada SÓ em `clientRequestId`, e o campo era obrigatório.
// Cliente criado direto pela agência (`/api/clients`) nunca tem
// `ClientRequestDb` — é o caso da Foocci. Resultado no dia do lançamento: o CEO
// abriu o portal, escreveu, e a rota devolveu 404 "No conversation thread for
// this token yet". A bolha sumia, o texto voltava para a caixa e a tela dizia
// "Não foi possível enviar. Tente novamente." — para sempre.
//
// ── A regra nova, em uma frase ───────────────────────────────────────────────
// A conversa pertence ao CLIENTE, não à solicitação.
//
// Por isso a leitura UNE as duas chaves (clientId + todas as solicitações
// daquele cliente) e a escrita CARIMBA as duas quando ambas são deriváveis.
// Isso mantém três coisas verdadeiras ao mesmo tempo:
//   1. as 11 escritas antigas (que só conhecem `clientRequestId`) continuam
//      caindo na conversa certa — nenhuma precisou mudar;
//   2. o cliente direto ganha conversa hoje, sem solicitação-espelho;
//   3. o cliente que GANHA uma solicitação depois não vê o histórico partir em
//      duas — a mesma conversa continua.
//
// ── A trava de isolamento ────────────────────────────────────────────────────
// Nenhuma chave deste filtro vem do cliente. `clientId` deriva do token (regra
// da casa, 03/08/2026: derivação, nunca comparação) ou da sessão + posse de
// workspace. `{ clientId: null }` NUNCA entra no filtro — casaria com toda
// mensagem órfã do banco, que é vazamento entre clientes.

import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";

/** O filtro Prisma de uma conversa. Objeto simples de propósito: os testes
 *  mockam o prisma e comparam a forma. */
export type FiltroDaConversa =
  | { clientId: string }
  | { clientRequestId: { in: string[] } }
  | { OR: Array<{ clientId: string } | { clientRequestId: { in: string[] } }> };

export interface Conversa {
  /** O dono. Nulo só quando a conversa é de um PROSPECT (solicitação de
   *  briefing que ainda não virou cliente). */
  clientId: string | null;
  /** Todas as solicitações daquele cliente — o histórico que já existe. */
  clientRequestIds: string[];
  /** Onde uma mensagem NOVA deste lado é gravada. */
  ancora: { clientId: string | null; clientRequestId: string | null };
  /** O filtro de leitura. Nulo = não existe conversa nenhuma para ancorar. */
  filtro: FiltroDaConversa | null;
}

const VAZIA: Conversa = {
  clientId: null,
  clientRequestIds: [],
  ancora: { clientId: null, clientRequestId: null },
  filtro: null,
};

function montarFiltro(clientId: string | null, requestIds: string[]): FiltroDaConversa | null {
  const chaves: Array<{ clientId: string } | { clientRequestId: { in: string[] } }> = [];
  // A guarda que impede o vazamento: só entra chave com valor de verdade.
  if (clientId) chaves.push({ clientId });
  if (requestIds.length > 0) chaves.push({ clientRequestId: { in: requestIds } });
  if (chaves.length === 0) return null;
  if (chaves.length === 1) return chaves[0]!;
  return { OR: chaves };
}

/** Monta a conversa de um cliente já identificado (dono derivado, nunca vindo
 *  de query/corpo em caminho público). */
export async function conversaDoCliente(
  clientId: string,
  solicitacaoPreferida?: string | null,
): Promise<Conversa> {
  const solicitacoes = await prisma.clientRequestDb.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const ids = solicitacoes.map((s) => s.id);
  // A solicitação preferida (a que o token aponta) só vale se for DESTE cliente
  // — senão a âncora escreveria na conversa de outro.
  const ancoraRequest =
    solicitacaoPreferida && ids.includes(solicitacaoPreferida)
      ? solicitacaoPreferida
      : ids[0] ?? null;
  return {
    clientId,
    clientRequestIds: ids,
    ancora: { clientId, clientRequestId: ancoraRequest },
    filtro: montarFiltro(clientId, ids),
  };
}

/** Monta a conversa a partir de uma solicitação. Se ela já tem cliente, a
 *  conversa é a DO CLIENTE (união) — a solicitação é só o ponto de entrada. */
export async function conversaDaSolicitacao(clientRequestId: string): Promise<Conversa> {
  const solicitacao = await prisma.clientRequestDb.findUnique({
    where: { id: clientRequestId },
    select: { id: true, clientId: true },
  });
  if (!solicitacao) return VAZIA;
  if (solicitacao.clientId) return conversaDoCliente(solicitacao.clientId, clientRequestId);
  // Prospect puro: ainda não é cliente. A conversa vive presa à solicitação.
  return {
    clientId: null,
    clientRequestIds: [clientRequestId],
    ancora: { clientId: null, clientRequestId },
    filtro: { clientRequestId: { in: [clientRequestId] } },
  };
}

export type ResultadoDoToken =
  | { ok: true; conversa: Conversa }
  | { ok: false; status: number; reason?: string };

/** Resolve a conversa a partir do token do portal — o ÚNICO caminho público. */
export async function conversaDoToken(token: string): Promise<ResultadoDoToken> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) {
    return { ok: false, status: 403, reason: acesso.reason };
  }
  const registro = acesso.record;
  if (registro.clientId) {
    return { ok: true, conversa: await conversaDoCliente(registro.clientId, registro.clientRequestId) };
  }
  if (registro.clientRequestId) {
    return { ok: true, conversa: await conversaDaSolicitacao(registro.clientRequestId) };
  }
  // Token válido sem dono nenhum — não existe onde escrever. Não é erro do
  // cliente, é acesso mal emitido; quem trata é a agência.
  return { ok: true, conversa: VAZIA };
}

/** Posse: o cliente é DESTE workspace? Estar logado não é ser dono. */
export async function clienteDoWorkspace(clientId: string, workspaceId: string): Promise<boolean> {
  const dono = await prisma.client.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true },
  });
  return !!dono;
}

/** Posse da solicitação — espelha `solicitacaoDoWorkspace` do portal-data:
 *  solicitação sem workspace (briefing público antigo) vale pelo cliente. */
export async function solicitacaoDoWorkspace(clientRequestId: string, workspaceId: string): Promise<boolean> {
  const cr = await prisma.clientRequestDb.findFirst({
    where: { id: clientRequestId, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, workspaceId: true, clientId: true },
  });
  if (!cr) return false;
  if (cr.workspaceId === workspaceId) return true;
  if (cr.clientId) return clienteDoWorkspace(cr.clientId, workspaceId);
  return false;
}
