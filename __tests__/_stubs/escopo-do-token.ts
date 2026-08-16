// Stub compartilhado: `escopoDoToken` para as suítes que mockam o
// `portal-access-service`.
//
// ── A REGRA DESTE ARQUIVO, e ela já foi quebrada duas vezes ─────────────────
// **O stub NUNCA pode ser mais permissivo que o código real.** Stub frouxo
// pinta de verde um teste que o código reprovaria — e, pior, deixa a suíte
// estruturalmente incapaz de exercitar a trava.
//
// O `seguranca` achou TRÊS defeitos deste tipo aqui, todos meus:
//   1. reinstalava o ponteiro cru (`ids = [record.clientRequestId]`) — a coisa
//      que a rodada 3 existia para eliminar. Era por isso que a mutação de
//      `escopoDoToken` ficava verde;
//   2. não tinha ramo `ponteiro_andou`, então 13 suítes não conseguiam
//      exercitar a trava do dono congelado nem se quisessem;
//   3. presumia que a solicitação existe, enquanto o real devolve `sem_dono`.
//
// Esta versão espelha o real linha a linha. Se o real mudar e este não, a
// diferença aparece como teste vermelho — que é o ponto.

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

export function escopoFalso(
  validatePortalAccess: { (token: string): Promise<unknown> },
  prisma: PrismaFake,
  opcoes: {
    resolvePortalClient?: (token: string) => Promise<unknown>;
    workspacePadrao?: string;
  } = {},
) {
  const workspacePadrao = opcoes.workspacePadrao ?? "ws1";

  return vi.fn(async (token: string) => {
    const acesso = (await validatePortalAccess(token)) as
      { valid?: boolean; record?: RegistroDeAcesso } | null | undefined;
    if (!acesso?.valid || !acesso.record) return { ok: false, motivo: "token_invalido" };

    // A solicitação do registro, e o dono dela HOJE.
    let daSolicitacao: string | null = null;
    let solicitacao: { clientId?: string | null; workspaceId?: string | null } | null = null;
    let consultou = false;
    if (acesso.record.clientRequestId && prisma.clientRequestDb?.findUnique) {
      consultou = true;
      solicitacao = (await prisma.clientRequestDb.findUnique({
        where: { id: acesso.record.clientRequestId },
        select: { clientId: true, workspaceId: true },
      })) as { clientId?: string | null; workspaceId?: string | null } | null;
      daSolicitacao = solicitacao?.clientId ?? null;
    }

    const congelado = acesso.record.clientId ?? null;

    // (2) O ramo que faltava: ponteiro andou debaixo de um token já emitido.
    if (congelado && daSolicitacao && congelado !== daSolicitacao) {
      return { ok: false, motivo: "ponteiro_andou" };
    }

    // (1) `PortalAccess.clientId` é a ÚNICA prova de pertencimento de um token.
    // O real NÃO deriva do ponteiro — e este também não.
    if (!congelado) {
      // Ramo do PROSPECT: só vale se a solicitação EXISTE e ainda não tem dono.
      // (3) Sem consultar, não se presume que exista.
      const existe = consultou ? !!solicitacao : false;
      if (!acesso.record.clientRequestId || !existe || solicitacao?.clientId) {
        return { ok: false, motivo: "sem_dono" };
      }
      return {
        ok: true,
        tipo: "prospect",
        clientRequestId: acesso.record.clientRequestId,
        workspaceId: solicitacao?.workspaceId ?? workspacePadrao,
      };
    }

    // As solicitações saem do CLIENTE — nunca do registro do token.
    let ids: string[] = [];
    if (prisma.clientRequestDb?.findMany) {
      const linhas = (await prisma.clientRequestDb.findMany({
        where: { clientId: congelado }, orderBy: { createdAt: "desc" }, select: { id: true },
      })) as { id: string }[] | undefined;
      if (Array.isArray(linhas)) ids = linhas.map((l) => l.id);
    }

    let workspaceId = workspacePadrao;
    if (opcoes.resolvePortalClient) {
      const r = (await opcoes.resolvePortalClient(token)) as { workspaceId?: string } | null;
      if (r?.workspaceId) workspaceId = r.workspaceId;
    }
    if (prisma.client?.findUnique) {
      const c = (await prisma.client.findUnique({
        where: { id: congelado }, select: { id: true, workspaceId: true },
      })) as { workspaceId?: string } | null;
      if (c?.workspaceId) workspaceId = c.workspaceId;
    }

    return { ok: true, tipo: "cliente", clientId: congelado, workspaceId, clientRequestIds: ids };
  });
}

/**
 * `donoDoToken` de teste — o mesmo espelho, para as suítes que mockam ELE em
 * vez de `escopoDoToken`. Mesma regra: nunca mais permissivo que o real.
 * `PortalAccess.clientId` é a única prova; ponteiro andado recusa.
 */
export function donoFalso(
  validatePortalAccess: { (token: string): Promise<unknown> },
  prisma: PrismaFake,
  workspacePadrao = "ws1",
) {
  return vi.fn(async (token: string) => {
    const acesso = (await validatePortalAccess(token)) as
      { valid?: boolean; record?: RegistroDeAcesso } | null | undefined;
    if (!acesso?.valid || !acesso.record) return { ok: false, motivo: "token_invalido" };

    let daSolicitacao: string | null = null;
    if (acesso.record.clientRequestId && prisma.clientRequestDb?.findUnique) {
      const sol = (await prisma.clientRequestDb.findUnique({
        where: { id: acesso.record.clientRequestId }, select: { clientId: true },
      })) as { clientId?: string | null } | null;
      daSolicitacao = sol?.clientId ?? null;
    }
    const congelado = acesso.record.clientId ?? null;
    if (congelado && daSolicitacao && congelado !== daSolicitacao) {
      return { ok: false, motivo: "ponteiro_andou" };
    }
    if (!congelado) return { ok: false, motivo: "sem_dono" };
    return { ok: true, clientId: congelado, workspaceId: workspacePadrao };
  });
}
