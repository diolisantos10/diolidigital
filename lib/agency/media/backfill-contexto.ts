// A LEITURA DO MUNDO para o backfill de carrossel — um lugar só.
//
// Por que existe separado: dois caminhos aplicam este backfill — a tela de
// master (`app/api/admin/backfill-carrossel/route.ts`) e a tarefa de boot
// (`backfill-boot.ts`, ligada por variável de ambiente quando ninguém tem como
// clicar). Se cada um montasse o próprio contexto, um dia eles divergiriam: um
// olharia o índice de uso nas três fontes e o outro não, e o passe do logo
// voltaria por uma porta que ninguém está olhando.
//
// SOMENTE LEITURA. Nenhuma escrita mora aqui — nem a da tela, nem a do boot.
//
// A regra de casamento continua inteira em `backfill-carrossel.mjs` (com 29
// testes). Este arquivo só sabe consultar o banco e entregar as linhas.

import { prisma } from "@/lib/db/client";
import { montarEmUso, planejarBackfill } from "@/lib/agency/media/backfill-carrossel.mjs";
import type { Plano } from "@/lib/agency/media/backfill-carrossel.mjs";

/** Formatos que a casa grava para carrossel (o legado usa o termo em PT). */
export const FORMATOS_CARROSSEL = ["carousel", "carrossel"];

export interface ContextoDoBackfill {
  cliente: { id: string; nome: string; workspaceId: string };
  /** Quantas imagens existem nos Arquivos do cliente (o denominador do log). */
  imagens: number;
  /** Quantas mídias do workspace já têm dono nas três fontes. */
  midiasComDono: number;
  plano: Plano;
}

/**
 * Lê o mundo e monta o plano do backfill deste cliente.
 *
 * `porOrdem` NUNCA é ligado aqui — o casamento posicional monta carrossel com
 * logo e material bruto, e a auditoria de 04/08/2026 tirou essa flag de toda
 * superfície automática. Quem realmente precisar roda
 * `scripts/backfill-carrossel-foocci.mjs --por-ordem` na mão, lendo o log.
 *
 * @returns `null` quando o cliente não existe (nunca lança por isso).
 */
export async function montarPlanoDoCliente(clientId: string): Promise<ContextoDoBackfill | null> {
  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, workspaceId: true },
  });
  if (!cliente) return null;

  const pedidos = await prisma.clientRequestDb.findMany({
    where: { clientId },
    select: { id: true },
  });
  const idsDePedido = pedidos.map((p) => p.id);

  const [postsRows, assetsRows, usoPosts, usoEntregaveis, usoVersoes] = await Promise.all([
    prisma.socialPost.findMany({
      where: { clientId, format: { in: FORMATOS_CARROSSEL } },
      select: { id: true, caption: true, mediaUrl: true, mediaUrlsJson: true, scheduledFor: true },
    }),
    prisma.mediaAsset.findMany({
      where: {
        mimeType: { startsWith: "image/" },
        OR: [{ clientId }, ...(idsDePedido.length ? [{ clientRequestId: { in: idsDePedido } }] : [])],
      },
      select: { id: true, fileName: true, mimeType: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { fileName: "asc" }],
    }),
    // O índice de "já tem dono" olha o WORKSPACE inteiro, nas três fontes — foi
    // o achado da auditoria: o logo não é citado por post nenhum, ele vive em
    // Deliverable.content e em DeliverableVersion.mediaAssetIds.
    prisma.socialPost.findMany({
      where: { workspaceId: cliente.workspaceId },
      select: { id: true, mediaUrl: true, mediaUrlsJson: true },
    }),
    prisma.deliverable.findMany({
      where: { project: { workspaceId: cliente.workspaceId } },
      select: { id: true, name: true, content: true },
    }),
    prisma.deliverableVersion.findMany({
      where: { deliverable: { project: { workspaceId: cliente.workspaceId } } },
      select: { deliverableId: true, content: true, mediaAssetIds: true },
    }),
  ]);

  const emUso = montarEmUso({
    posts: usoPosts,
    deliverables: usoEntregaveis,
    versoes: usoVersoes,
  });

  const plano = planejarBackfill({
    postsRows,
    assetsRows,
    emUso,
    // 🔒 NUNCA `true` aqui. Ver o cabeçalho.
    porOrdem: false,
  });

  return {
    cliente: { id: cliente.id, nome: cliente.name, workspaceId: cliente.workspaceId },
    imagens: assetsRows.length,
    midiasComDono: emUso.size,
    plano,
  };
}
