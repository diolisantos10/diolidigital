// A FRONTEIRA DO INQUILINO — a conferência de posse, UMA VEZ, para todo mundo.
//
// A regra da casa em uma frase: **estar logado não é ser dono**. `requireSession`
// responde "quem é você"; nada nele responde "isto é seu". Toda rota que aceita
// um id vindo de query, corpo ou caminho precisa das duas perguntas — e o id é
// global, então a segunda nunca é opcional.
//
// POR QUE ESTE ARQUIVO EXISTE: a conferência já vivia copiada em três lugares
// (`app/api/brain/portal-data`, `app/api/messages/conversa.ts` e inline em
// `/api/media`), e as cópias JÁ DIVERGIAM — a de `conversa.ts` reprovava a
// solicitação órfã sem cliente, a de `portal-data` aprovava quando há um único
// workspace. Cópia de trava de segurança não é duplicação de código: é duas
// políticas de segurança diferentes com o mesmo nome, e ninguém sabe qual vale.
//
// A ÓRFÃ É CASO LEGÍTIMO NESTA CASA. `ClientRequestDb.workspaceId` é nulo em
// briefing público antigo (o prospect não sabe o workspace e o formulário não
// manda — ver `client-request-service.resolverWorkspacePublico`). Em 01/08/2026,
// 6 das 7 solicitações em produção eram órfãs. Filtrar só por `workspaceId`
// esconde dado que existe e aparece na tela; aceitar qualquer órfã abre a porta.
// A política única, fail-closed:
//   • tem workspaceId  → tem que bater, ponto;
//   • órfã COM cliente → vale o workspace do Client (que é obrigatório);
//   • órfã SEM cliente → só passa se existir UM único workspace na base.
//     Com dois, adivinhar é o mesmo que vazar.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/** Três estados, não dois: quem faz upsert precisa distinguir "não existe"
 *  (pode criar) de "existe e é do vizinho" (404, e nada gravado). */
export type Posse = "propria" | "alheia" | "inexistente";

/** O 404 padrão da fronteira. É 404 e não 403 de propósito: responder
 *  "proibido" confirma que aquele id existe — um oráculo de enumeração. */
export function naoEncontrado(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * O único workspace da base, quando existe exatamente um.
 * `ambiguo` = há dois ou mais; nesse caso ninguém pode adivinhar por ninguém.
 * Banco indisponível devolve `{ id: null, ambiguo: false }` — quem decide posse
 * trata isso como "não é seu" (fail-closed).
 */
export async function workspaceUnico(): Promise<{ id: string | null; ambiguo: boolean }> {
  try {
    const todos = await prisma.agencyWorkspace.findMany({ select: { id: true }, take: 2 });
    if (todos.length === 1) return { id: todos[0]!.id, ambiguo: false };
    return { id: null, ambiguo: todos.length > 1 };
  } catch {
    return { id: null, ambiguo: false };
  }
}

/** Posse: o cliente é DESTE workspace? `Client.workspaceId` é obrigatório, então
 *  aqui a conferência é direta — e o `workspaceId` VAI NO WHERE, sempre. */
export async function clienteDoWorkspace(clientId: string, workspaceId: string): Promise<boolean> {
  const dono = await prisma.client.findFirst({
    where: { id: clientId, workspaceId },
    select: { id: true },
  });
  return !!dono;
}

/** Posse da solicitação, com os três estados. Ver a política das órfãs no topo. */
export async function posseDaSolicitacao(
  clientRequestId: string,
  workspaceId: string,
): Promise<Posse> {
  // O `workspaceId` VAI NO WHERE (defesa no banco, não só no if) e a órfã entra
  // pelo `OR` para ser julgada abaixo.
  const cr = await prisma.clientRequestDb.findFirst({
    where: { id: clientRequestId, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, workspaceId: true, clientId: true },
  });
  if (cr) {
    if (cr.workspaceId === workspaceId) return "propria";
    if (cr.clientId) {
      return (await clienteDoWorkspace(cr.clientId, workspaceId)) ? "propria" : "alheia";
    }
    const unico = await workspaceUnico();
    return unico.id === workspaceId ? "propria" : "alheia";
  }

  // Não veio nada: ou o id não existe, ou existe e é de outra agência. A
  // distinção só interessa a quem faz upsert (`/api/brain/artifacts`) — para
  // todo o resto as duas respostas são a mesma porta fechada, e de propósito:
  // 404 nos dois casos é o que impede a rota de virar um oráculo de "este id
  // existe em algum lugar do banco".
  const existe = await prisma.clientRequestDb.findFirst({
    where: { id: clientRequestId },
    select: { id: true },
  });
  return existe ? "alheia" : "inexistente";
}

/** A pergunta de sim ou não — o formato que quase toda rota quer. */
export async function solicitacaoDoWorkspace(
  clientRequestId: string,
  workspaceId: string,
): Promise<boolean> {
  return (await posseDaSolicitacao(clientRequestId, workspaceId)) === "propria";
}

/**
 * Posse do card de aprovação. `ApprovalRequest` tem o MESMO par de chaves do
 * `SocialPost`: `clientRequestId` (fluxo Brain) OU `clientId` (cliente criado
 * direto). Quando há `clientId`, ele manda — e sozinho: card com cliente do
 * vizinho não é salvo por apontar para uma solicitação sua.
 */
export async function aprovacaoDoWorkspace(
  approvalRequestId: string,
  workspaceId: string,
): Promise<boolean> {
  const ap = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
    select: { clientId: true, clientRequestId: true },
  });
  if (!ap) return false;
  if (ap.clientId) return clienteDoWorkspace(ap.clientId, workspaceId);
  if (ap.clientRequestId) return solicitacaoDoWorkspace(ap.clientRequestId, workspaceId);
  const unico = await workspaceUnico();
  return unico.id === workspaceId;
}

/** Posse do artefato do Brain — mesmo par de chaves da aprovação. */
export async function artefatoDoWorkspace(
  artifactId: string,
  workspaceId: string,
): Promise<boolean> {
  const art = await prisma.brainArtifact.findUnique({
    where: { id: artifactId },
    select: { clientId: true, clientRequestId: true },
  });
  if (!art) return false;
  if (art.clientId) return clienteDoWorkspace(art.clientId, workspaceId);
  if (art.clientRequestId) return solicitacaoDoWorkspace(art.clientRequestId, workspaceId);
  const unico = await workspaceUnico();
  return unico.id === workspaceId;
}

type LinhaComDono = { workspaceId: string | null; clientId: string | null };

/**
 * A MESMA política, em lote. Existe para que listar não custe uma consulta por
 * linha — e para que ninguém invente um atalho mais frouxo "porque é listagem".
 * A consulta que produziu `linhas` já deve ter filtrado
 * `OR: [{ workspaceId }, { workspaceId: null }]`; aqui caem as órfãs.
 */
export async function apenasDoWorkspace<T extends LinhaComDono>(
  linhas: T[],
  workspaceId: string,
): Promise<T[]> {
  const orfasComCliente = linhas.filter((l) => !l.workspaceId && l.clientId);
  const idsDeCliente = [...new Set(orfasComCliente.map((l) => l.clientId as string))];
  const meus = idsDeCliente.length
    ? new Set(
        (await prisma.client.findMany({
          where: { id: { in: idsDeCliente }, workspaceId },
          select: { id: true },
        })).map((c) => c.id),
      )
    : new Set<string>();

  const temOrfaSemCliente = linhas.some((l) => !l.workspaceId && !l.clientId);
  const unico = temOrfaSemCliente ? await workspaceUnico() : { id: null, ambiguo: false };

  return linhas.filter((l) => {
    if (l.workspaceId) return l.workspaceId === workspaceId;
    if (l.clientId) return meus.has(l.clientId);
    return unico.id === workspaceId;
  });
}

/** O conjunto de solicitações, entre `ids`, que pertencem ao workspace.
 *  Para filtrar tabelas que só guardam `clientRequestId` (BrainUpdate, por ex.). */
export async function solicitacoesDoWorkspace(
  ids: string[],
  workspaceId: string,
): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Set();
  const linhas = await prisma.clientRequestDb.findMany({
    where: { id: { in: unicos }, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true, workspaceId: true, clientId: true },
  });
  return new Set((await apenasDoWorkspace(linhas, workspaceId)).map((l) => l.id));
}
