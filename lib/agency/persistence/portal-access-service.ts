import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

export interface CreatePortalAccessInput {
  clientRequestId?: string;
  clientId?: string;
  expiresAt?: Date;
}

// A portal token is the SOLE credential for unauthenticated client access, so
// it must be unguessable. cuid (the schema default) is collision-resistant but
// low-entropy — mint a 256-bit random, URL-safe token instead. Existing cuid
// tokens keep validating (lookup is by value).
export async function createPortalAccess(input: CreatePortalAccessInput) {
  return prisma.portalAccess.create({
    data: {
      token:           randomBytes(32).toString("base64url"),
      clientRequestId: input.clientRequestId,
      clientId:        input.clientId,
      expiresAt:       input.expiresAt,
    },
  });
}

/**
 * O token serve? — conferência SEM efeito colateral.
 *
 * `validatePortalAccess` incrementa `accessCount` e carimba `lastAccessedAt`:
 * é a validação de quem está ABRINDO o portal. Quem só precisa decidir "gravo
 * este cookie?" não pode contar como visita — senão todo acesso vira dois, e a
 * contagem que a agência usa para saber se o cliente entrou passa a mentir.
 */
export async function conferirTokenDoPortal(token: string): Promise<boolean> {
  try {
    const record = await prisma.portalAccess.findUnique({ where: { token } });
    if (!record || record.revokedAt) return false;
    if (record.expiresAt && record.expiresAt < new Date()) return false;
    return true;
  } catch {
    // Banco fora do ar: não grave credencial de 180 dias no escuro.
    return false;
  }
}

export async function validatePortalAccess(token: string) {
  const record = await prisma.portalAccess.findUnique({ where: { token } });
  if (!record) return { valid: false, reason: "not_found" as const };
  if (record.revokedAt) return { valid: false, reason: "revoked" as const };
  if (record.expiresAt && record.expiresAt < new Date()) {
    return { valid: false, reason: "expired" as const };
  }

  await prisma.portalAccess.update({
    where: { token },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });

  return { valid: true, record };
}

// ── Derivação do DONO a partir do token ──────────────────────────────────────
// Regra da casa (decisão do CEO, 03/08/2026 — modelo de parceria): em qualquer
// caminho público (portal/parceiro), o clientId vem SEMPRE do token — derivação,
// não comparação. Nunca aceite clientId de query/corpo nesses caminhos.
//
// Devolve o cliente e o workspace dele, ou null quando o token é inválido,
// revogado, expirado, ou não está vinculado a nenhum cliente.
// ── O TOKEN CONGELA O DONO NA PRIMEIRA VALIDAÇÃO (15/08/2026, rodada 2) ─────
//
// O furo mais grave da auditoria, e ele NÃO era da conversa: era do PORTAL
// INTEIRO. `resolvePortalClient` e `conversaDoToken` RE-DERIVAVAM o dono a cada
// chamada, lendo `ClientRequestDb.clientId` — um ponteiro MUTÁVEL. Ponteiro
// andou, token antigo passou a valer para o cliente novo.
//
// Probe do `seguranca`: `/api/portal/vista` com o token de um cliente devolveu
// `marca.nome` de OUTRO. O alcance é tudo que pendura no token — marca,
// projetos, métricas, aprovações, pedidos, materiais, conexões, drive e
// `/api/brain/portal-data`. E a conferência de dono da rodada 1 não pegava
// nada disso: a tela e a conversa derivam o MESMO cliente errado e concordam
// entre si.
//
// A regra nova, em uma frase: **o token aponta para um cliente e só; se o
// ponteiro andar depois, o token morre.**
//
//   • `PortalAccess.clientId` nulo + solicitação com dono → CONGELA (grava).
//   • `PortalAccess.clientId` preenchido e diferente do dono atual da
//     solicitação → **recusa** (`ponteiro_andou`). Nunca segue o ponteiro.
//
// Congelar é seguro: só fixa o que aquele token já concedia no primeiro uso.
// O que ele nunca mais faz é MUDAR de dono sozinho.

export type DonoDoToken =
  | { ok: true; clientId: string; workspaceId: string }
  | { ok: false; motivo: "token_invalido" | "sem_dono" | "ponteiro_andou" };

/**
 * O dono de um token de portal — congelado, conferido e único.
 * É o caminho ÚNICO: `resolvePortalClient` e `conversaDoToken` passam por aqui.
 */
export async function donoDoToken(token: string): Promise<DonoDoToken> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return { ok: false, motivo: "token_invalido" };
  const registro = acesso.record;

  // Quem a solicitação diz ser o dono AGORA.
  let daSolicitacao: string | null = null;
  if (registro.clientRequestId) {
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: registro.clientRequestId },
      select: { clientId: true },
    });
    daSolicitacao = solicitacao?.clientId ?? null;
  }

  const congelado = registro.clientId ?? null;

  if (congelado && daSolicitacao && congelado !== daSolicitacao) {
    // O ponteiro andou debaixo de um token já emitido. Não existe leitura
    // segura aqui: nem o dono antigo (que pode ter perdido a solicitação) nem
    // o novo (que nunca recebeu ESTE link). Fecha, e deixa rastro.
    const relato =
      `[portal] token recusado: ponteiro andou — solicitação ${registro.clientRequestId} `
      + `saiu do cliente ${congelado} para ${daSolicitacao}. PortalAccess ${registro.id}.`;
    console.error(relato);
    // ── NEGA **E REGISTRA** — e registra NO BANCO ──────────────────────────
    // A constituição dos Essenciais manda negar e registrar. Log de contêiner
    // não é registro: o Railway rotaciona, e a pergunta forense desta casa
    // ("algum cliente viu o que não era dele?") já terminou uma vez em "não há
    // como saber" por falta exatamente disto. `ActivityEvent` é consultável.
    await prisma.client.findUnique({ where: { id: congelado }, select: { workspaceId: true } })
      .then((c) => c && prisma.activityEvent.create({
        data: {
          workspaceId: c.workspaceId,
          clientId: congelado,
          type: "portal_ponteiro_andou",
          message: relato,
        },
      }))
      .catch(() => { /* o registro é best-effort; a RECUSA não é */ });
    return { ok: false, motivo: "ponteiro_andou" };
  }

  const clientId = congelado ?? daSolicitacao;
  if (!clientId) return { ok: false, motivo: "sem_dono" };

  // CONGELA na primeira vez. A partir daqui o token não segue mais ponteiro.
  if (!congelado) {
    try {
      await prisma.portalAccess.update({ where: { token }, data: { clientId } });
    } catch {
      // Não conseguir congelar não pode derrubar a visita: o dono desta
      // requisição já foi decidido acima, e a próxima tentará de novo.
    }
  }

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true },
  });
  if (!cliente) return { ok: false, motivo: "sem_dono" };

  return { ok: true, clientId: cliente.id, workspaceId: cliente.workspaceId };
}

export async function resolvePortalClient(
  token: string,
): Promise<{ clientId: string; workspaceId: string } | null> {
  const dono = await donoDoToken(token);
  return dono.ok ? { clientId: dono.clientId, workspaceId: dono.workspaceId } : null;
}

export async function revokePortalAccess(token: string) {
  return prisma.portalAccess.update({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function getPortalAccessForRequest(clientRequestId: string) {
  return prisma.portalAccess.findMany({
    where: { clientRequestId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}
