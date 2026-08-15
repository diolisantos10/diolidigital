// Stub compartilhado: `escopoDoToken` para as suítes que mockam o
// `portal-access-service`.
//
// ── Por que ele existe (15/08/2026, rodada 3) ───────────────────────────────
// A trava do ponteiro andado saiu de `donoDoToken` e virou `escopoDoToken` — o
// escopo CONGELADO (cliente + workspace + solicitações DO CLIENTE), porque a
// lição da rodada foi: *"a trava vai onde o id é USADO"*. Oito rotas passaram a
// chamá-la, e treze suítes mockavam o módulo só com `validatePortalAccess`.
//
// Mockar um valor FIXO aqui esconderia justamente o que mudou. Este stub IMITA
// o real: congela o dono do registro do token e, sem dono no registro, deriva
// da solicitação — e devolve as solicitações **do cliente**, nunca a do
// registro. Assim um teste que dependa do comportamento antigo continua caindo.

import { vi } from "vitest";

interface RegistroDeAcesso {
  clientId?: string | null;
  clientRequestId?: string | null;
}
/** Frouxo de propósito: cada suíte mocka um recorte diferente do prisma. */
type PrismaFake = Record<string, unknown> & {
  clientRequestDb?: { findUnique?: (a: unknown) => unknown; findMany?: (a: unknown) => unknown };
  client?: { findUnique?: (a: unknown) => unknown };
};

/**
 * Constrói o `escopoDoToken` de teste a partir do `validatePortalAccess`
 * mockado da própria suíte.
 */
export function escopoFalso(
  validatePortalAccess: { (token: string): Promise<unknown> },
  prisma: PrismaFake,
  opcoes: {
    /** Quando a suíte já mocka `resolvePortalClient`, ele é a fonte do
     *  workspace — é o que aqueles testes descrevem. */
    resolvePortalClient?: (token: string) => Promise<unknown>;
    workspacePadrao?: string;
  } = {},
) {
  const workspacePadrao = opcoes.workspacePadrao ?? "ws1";
  return vi.fn(async (token: string) => {
    const acesso = (await validatePortalAccess(token)) as
      { valid?: boolean; record?: RegistroDeAcesso } | null | undefined;
    if (!acesso?.valid || !acesso.record) return { ok: false, motivo: "token_invalido" };

    let clientId = acesso.record.clientId ?? null;
    let workspaceDaSolicitacao: string | null = null;
    if (!clientId && acesso.record.clientRequestId && prisma.clientRequestDb?.findUnique) {
      const sol = (await prisma.clientRequestDb.findUnique({
        where: { id: acesso.record.clientRequestId }, select: { clientId: true, workspaceId: true },
      })) as { clientId?: string | null; workspaceId?: string | null } | null;
      clientId = sol?.clientId ?? null;
      workspaceDaSolicitacao = sol?.workspaceId ?? null;
    }
    // Ramo do PROSPECT: solicitação que ainda não virou cliente tem portal
    // legítimo, e o escopo dele é a própria solicitação.
    if (!clientId) {
      // No código real o workspace do prospect sai da própria solicitação.
      return acesso.record.clientRequestId
        ? {
            ok: true, clientId: null,
            workspaceId: workspaceDaSolicitacao ?? workspacePadrao,
            clientRequestIds: [acesso.record.clientRequestId],
          }
        : { ok: false, motivo: "sem_dono" };
    }

    // As solicitações saem do CLIENTE — é esta linha que, no código real,
    // impede o ponteiro andado de continuar valendo.
    let ids: string[] = [];
    if (prisma.clientRequestDb?.findMany) {
      const linhas = (await prisma.clientRequestDb.findMany({
        where: { clientId }, orderBy: { createdAt: "desc" }, select: { id: true },
      })) as { id: string }[] | undefined;
      if (Array.isArray(linhas)) ids = linhas.map((l) => l.id);
    }
    // Suíte que não mocka `findMany` continua valendo a solicitação do
    // registro — é o comportamento observável que aqueles testes descrevem.
    if (ids.length === 0 && acesso.record.clientRequestId) ids = [acesso.record.clientRequestId];

    let workspaceId = workspacePadrao;
    if (opcoes.resolvePortalClient) {
      const r = (await opcoes.resolvePortalClient(token)) as { workspaceId?: string } | null;
      if (r?.workspaceId) workspaceId = r.workspaceId;
    }
    if (prisma.client?.findUnique) {
      const c = (await prisma.client.findUnique({
        where: { id: clientId }, select: { id: true, workspaceId: true },
      })) as { workspaceId?: string } | null;
      if (c?.workspaceId) workspaceId = c.workspaceId;
    }

    return { ok: true, clientId, workspaceId, clientRequestIds: ids };
  });
}
