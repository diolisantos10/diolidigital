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
export async function resolvePortalClient(
  token: string,
): Promise<{ clientId: string; workspaceId: string } | null> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return null;

  let clientId = acesso.record.clientId ?? null;
  if (!clientId && acesso.record.clientRequestId) {
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: acesso.record.clientRequestId },
      select: { clientId: true },
    });
    clientId = solicitacao?.clientId ?? null;
  }
  if (!clientId) return null;

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true },
  });
  if (!cliente) return null;

  return { clientId: cliente.id, workspaceId: cliente.workspaceId };
}

/**
 * QUEM É O DONO — e a diferença entre "não é você" e "ainda não há ficha".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O ACHADO (cliente oculto, 6ª rodada — medido em produção)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um prospect com o link legítimo do portal na mão, recém-orçado. Com o MESMO
 * token, no mesmo minuto:
 *
 *   /api/portal/esteira   → 200
 *   /api/portal/messages  → 200, com a proposta dele dentro
 *   /api/portal/projetos  → 403 "Acesso negado"
 *   /api/portal/pedidos   → 403 "Acesso negado"
 *   /api/portal/vista     → 403 "Acesso negado"
 *
 * A causa não é permissão: é que a ficha de `Client` só nasce quando ele
 * ACEITA a proposta. Antes disso `resolvePortalClient` devolve `null` — e
 * `null` chegava às rotas achatado com "token inválido", que responde 403.
 *
 * É o guardrail 1 outra vez, pela porta do HTTP: **a ausência de uma ficha
 * virou a afirmação de que o acesso foi negado.** E é a pior das afirmações
 * para quem está do outro lado: a casa acabou de mandar a ele um link e uma
 * proposta, e três abas dizem que ele não pode entrar.
 *
 * Esta função separa os dois fatos, que sempre foram dois:
 *   • `"invalido"`      — token que não existe, expirou ou foi revogado. 403,
 *                          como sempre foi. Nada aqui afrouxa segurança;
 *   • `"sem-cliente"`   — token VÁLIDO, e ainda não há ficha de cliente. A
 *                          rota responde 200 com o vazio honesto;
 *   • o dono            — o caminho de sempre.
 */
export async function donoDoPortal(
  token: string,
): Promise<{ clientId: string; workspaceId: string } | "invalido" | "sem-cliente"> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return "invalido";

  let clientId = acesso.record.clientId ?? null;
  if (!clientId && acesso.record.clientRequestId) {
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: acesso.record.clientRequestId },
      select: { clientId: true },
    });
    clientId = solicitacao?.clientId ?? null;
  }
  if (!clientId) return "sem-cliente";

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true },
  });
  // Ficha apontada e inexistente é dado quebrado, não acesso negado — mas
  // também não é dono. Cai no vazio honesto, que é o que a rota sabe mostrar.
  if (!cliente) return "sem-cliente";

  return { clientId: cliente.id, workspaceId: cliente.workspaceId };
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
