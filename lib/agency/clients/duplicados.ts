// duplicados.ts — QUEM ESTÁ DUPLICADO E O QUE ESTÁ PENDURADO EM CADA LINHA.
// SOMENTE LEITURA. Não funde, não apaga, não move nada.
//
// ─── POR QUE SÓ LÊ ──────────────────────────────────────────────────────────
//
// Fundir cliente é irreversível: projeto, aprovação decidida, conversa do portal
// e token de acesso ficam pendurados em UM dos dois ids, e escolher errado
// apaga trabalho que o cliente já viu. Quem decide a fusão é o dono do negócio,
// com a lista na mão — este módulo produz a lista, e para aí.
//
// A restrição de unicidade (`Client.nameKey`) impede duplicata NOVA. As que já
// existem continuam existindo, intactas, até alguém decidir o que fazer com
// elas — e é isso que a migration de 15/08/2026 faz de propósito (desempata sem
// apagar).
//
// Quem chama isto em produção é `GET /api/admin/pericia-do-piloto-assistido`:
// o banco é um SQLite num volume do Railway e não se alcança de fora, então a
// leitura roda onde o banco está (mesmo desenho de `links-do-portal`).

import { prisma } from "@/lib/db/client";
import { chaveDeReconhecimento } from "@/lib/agency/clients/chave-do-nome";

export interface LinhaDuplicada {
  id: string;
  name: string;
  createdAt: Date;
  /** O que está pendurado nesta linha — rótulo legível → quantidade. */
  pendurado: Record<string, number>;
  /** Soma de tudo que está pendurado: 0 = linha vazia, candidata natural a sair. */
  total: number;
}

export interface GrupoDuplicado {
  /** A chave que os torna o mesmo cliente aos olhos de gente. */
  chave: string;
  linhas: LinhaDuplicada[];
  /** A mais antiga — a que os caminhos novos passam a reencontrar sempre. */
  principalId: string;
}

async function pendurado(clientId: string): Promise<Record<string, number>> {
  const projetos = await prisma.project.findMany({ where: { clientId }, select: { id: true } });
  const projectIds = projetos.map((p) => p.id);

  const contagens: Array<[string, Promise<number>]> = [
    ["projetos", Promise.resolve(projetos.length)],
    [
      "entregas",
      projectIds.length > 0
        ? prisma.deliverable.count({ where: { projectId: { in: projectIds } } })
        : Promise.resolve(0),
    ],
    ["aprovações", prisma.approvalRequest.count({ where: { clientId } })],
    ["pedidos de conteúdo", prisma.contentRequest.count({ where: { clientId } })],
    ["solicitações", prisma.clientRequestDb.count({ where: { clientId } })],
    ["mensagens do portal", prisma.portalMessage.count({ where: { clientId } })],
    ["posts sociais", prisma.socialPost.count({ where: { clientId } })],
    ["acessos ao portal", prisma.portalAccess.count({ where: { clientId } })],
    ["avisos", prisma.clientNotice.count({ where: { clientId } })],
    ["ficha de marca", prisma.brandBrain.count({ where: { clientId } })],
    ["execuções V2", prisma.execucaoV2.count({ where: { clienteId: clientId } })],
    // A ficha do piloto assistido mora em FlagV2 com o id do cliente no escopo:
    // fundir sem olhar isto desliga o piloto de quem estava ligado.
    ["chaves de piloto", prisma.flagV2.count({ where: { escopo: clientId } })],
  ];

  const saida: Record<string, number> = {};
  for (const [rotulo, promessa] of contagens) {
    const n = await promessa.catch(() => 0);
    if (n > 0) saida[rotulo] = n;
  }
  return saida;
}

/**
 * Os grupos de clientes que são o MESMO cliente escrito de jeitos diferentes,
 * com o que está pendurado em cada linha. Só grupos com 2+ linhas voltam.
 */
export async function clientesDuplicados(workspaceId?: string): Promise<GrupoDuplicado[]> {
  const clientes = await prisma.client.findMany({
    ...(workspaceId ? { where: { workspaceId } } : {}),
    select: { id: true, name: true, workspaceId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const grupos = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const chave = `${c.workspaceId}::${chaveDeReconhecimento(c.name)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
  }

  const saida: GrupoDuplicado[] = [];
  for (const [chave, linhas] of grupos) {
    if (linhas.length < 2) continue;
    const detalhadas: LinhaDuplicada[] = [];
    for (const l of linhas) {
      const p = await pendurado(l.id);
      detalhadas.push({
        id: l.id,
        name: l.name,
        createdAt: l.createdAt,
        pendurado: p,
        total: Object.values(p).reduce((a, b) => a + b, 0),
      });
    }
    saida.push({ chave: chave.split("::")[1] ?? chave, linhas: detalhadas, principalId: detalhadas[0]!.id });
  }
  return saida;
}
