// ── O BACKFILL CURADO — o conserto, não o plano B ──────────────────────────
//
// ── Por que ele existe (16/08/2026, rodada 9) ──────────────────────────────
// Quatro rodadas trocando de parede:
//
//   exigir carimbo      → o dono legítimo perde tudo (tela vazia para quem paga)
//   não exigir carimbo  → o estranho entra (aprova card órfão de outro)
//
// **Não existe regra de LEITURA que resolva isso, porque a informação não está
// no banco.** "De quem é esta linha sem carimbo?" não tem resposta em tempo de
// leitura, e toda tentativa de inferir vira uma das duas paredes.
//
// A saída é resolver **uma vez, offline, com curadoria**: carimbar o que se
// consegue PROVAR e deixar fora o genuinamente ambíguo. Depois disso a regra
// de leitura volta a ser a simples e correta — **exige carimbo, ponto** — e as
// duas metades param de brigar, porque a população deixa de ser 100% sem prova.
//
// ── O QUE CONTA COMO PROVA, e por que ────────────────────────────────────────
// Uma linha órfã presa à solicitação R é carimbada com o dono atual de R
// somente se as TRÊS valerem:
//
//   1. **Nenhum filho de R carrega carimbo de OUTRO cliente.** Carimbo alheio
//      é prova documental de que R já foi de outra pessoa.
//   2. **Nenhum `PortalAccess` preso a R aponta para outro cliente.** Mesma
//      prova, na tabela de credencial — e é ela que pega o caso em que o dono
//      antigo tinha portal.
//   3. **O cliente dono JÁ EXISTIA quando a linha foi escrita**
//      (`Client.createdAt <= linha.createdAt`). Se a linha é mais velha que o
//      cliente, ela **não pode** ter nascido dele — é a única prova positiva
//      que o banco oferece, e sem ela o carimbo seria palpite.
//
// Falhou qualquer uma: **não carimba, e diz por quê.** Não sabido fecha.
//
// ── 🟠 O RESÍDUO IRREDUTÍVEL — medido, não suposto ──────────────────────────
// **Se o ponteiro andou sem deixar NENHUM rastro, este backfill carimba o dono
// ATUAL — que pode ser o errado.** Medido com a sonda A/B (o cenário do ALFA
// cujas linhas ficaram presas à solicitação hoje do BETA, sem carimbo alheio e
// sem `PortalAccess` do dono antigo): as três linhas saem carimbadas para o
// BETA. As três provas são DOCUMENTAIS; sem documento, não há o que provar.
//
// Isto não tem conserto em código, e escrever uma heurística para adivinhar
// seria preencher por inferência — o que esta casa proíbe. O que o contém:
//
//   1. **Re-apontar virou impossível** (o balcão parou de fundir ficha por
//      e-mail não verificado, rodada 2). A população afetada é FECHADA: só o
//      que já estava no banco antes do conserto.
//   2. **O critério 2 pega o caso que importa** — o dono antigo que TINHA
//      portal. Quem nunca teve portal não tem portal onde a linha possa vazar.
//   3. **O ensaio marca com `atencao` toda solicitação que já serviu um portal
//      sem dono escrito** — a forma do incidente. É por essa lista que a
//      conferência humana começa, e é o que faz a curadoria ser trabalho e não
//      carimbo de borracha.
//
// Quem aplicar sem ler o ensaio está pulando a curadoria, e a curadoria é
// metade do conserto.
//
// ⚠️ **Este é o ÚNICO lugar do repositório onde carimbo retroativo pode
// acontecer** — offline, com relatório, sob decisão de gente. No caminho
// quente ele é proibido: `cardGenericoJaPendente` fazia isso e **fabricava
// prova falsa** (carimbava o card de A com o id de B, com autoridade, e o
// rastro forense sumia).

import { prisma } from "@/lib/db/client";

export interface LinhaDoBackfill {
  clientRequestId: string;
  clientId: string | null;
  carimbadas: { mensagens: number; aprovacoes: number; artefatos: number; pecas: number };
  /** Preenchido quando NÃO carimbou. */
  deixadaDeFora?: string;
  /**
   * Carimbou, MAS esta linha merece olho humano antes do `POST`. Ver o
   * "RESÍDUO IRREDUTÍVEL" no cabeçalho: é a lista curta que transforma a
   * curadoria em trabalho real em vez de carimbo de borracha.
   */
  atencao?: string;
}

export interface RelatorioDoBackfill {
  medidoEm: string;
  aplicou: boolean;
  solicitacoes: number;
  carimbadas: number;
  deixadasDeFora: number;
  /** Carimbadas COM ressalva. É esta a fila de conferência humana. */
  comAtencao: number;
  totalDeLinhasCarimbadas: number;
  linhas: LinhaDoBackfill[];
}

/**
 * @param aplicar `false` (padrão) = ENSAIO. Lê, decide e relata sem gravar
 *   nada — porque um backfill que grava antes de alguém ler o relatório é o
 *   mesmo erro do carimbo no caminho quente, com outro nome.
 */
export async function backfillDeCarimbo(aplicar = false): Promise<RelatorioDoBackfill> {
  const solicitacoes = await prisma.clientRequestDb.findMany({
    where: { clientId: { not: null } },
    select: { id: true, clientId: true },
  });

  const linhas: LinhaDoBackfill[] = [];
  let totalDeLinhasCarimbadas = 0;

  for (const s of solicitacoes) {
    const clientId = s.clientId!;
    const vazio = { mensagens: 0, aprovacoes: 0, artefatos: 0, pecas: 0 };

    // (1) e (2): qualquer carimbo alheio, em qualquer tabela.
    const alheio = { not: null as null, notIn: [clientId] };
    const [msgAlheia, cardAlheio, artAlheio, pecaAlheia, acessoAlheio] = await Promise.all([
      prisma.portalMessage.findFirst({ where: { clientRequestId: s.id, clientId: alheio }, select: { id: true } }),
      prisma.approvalRequest.findFirst({ where: { clientRequestId: s.id, clientId: alheio }, select: { id: true } }),
      prisma.brainArtifact.findFirst({ where: { clientRequestId: s.id, clientId: alheio }, select: { id: true } }),
      prisma.socialPost.findFirst({ where: { clientRequestId: s.id, clientId: alheio }, select: { id: true } }),
      prisma.portalAccess.findFirst({ where: { clientRequestId: s.id, clientId: alheio }, select: { id: true } }),
    ]);
    if (msgAlheia || cardAlheio || artAlheio || pecaAlheia || acessoAlheio) {
      linhas.push({
        clientRequestId: s.id, clientId, carimbadas: vazio,
        deixadaDeFora:
          "esta solicitação tem registro carimbado para OUTRO cliente — ela já foi de outra pessoa, "
          + "e não dá para saber quais linhas órfãs são de quem. Precisa de decisão humana.",
      });
      continue;
    }

    // (3) A prova positiva: o cliente já existia quando a linha foi escrita.
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { createdAt: true } });
    if (!cliente) {
      linhas.push({
        clientRequestId: s.id, clientId, carimbadas: vazio,
        deixadaDeFora: "o cliente dono não existe mais no banco.",
      });
      continue;
    }
    const nascidoAntes = { clientRequestId: s.id, clientId: null, createdAt: { lt: cliente.createdAt } };
    const [msgVelha, cardVelho, artVelho, pecaVelha] = await Promise.all([
      prisma.portalMessage.findFirst({ where: nascidoAntes, select: { id: true } }),
      prisma.approvalRequest.findFirst({ where: nascidoAntes, select: { id: true } }),
      prisma.brainArtifact.findFirst({ where: nascidoAntes, select: { id: true } }),
      prisma.socialPost.findFirst({ where: nascidoAntes, select: { id: true } }),
    ]);
    if (msgVelha || cardVelho || artVelho || pecaVelha) {
      linhas.push({
        clientRequestId: s.id, clientId, carimbadas: vazio,
        deixadaDeFora:
          "há linha órfã MAIS VELHA que o cliente dono — ela não pode ter nascido dele. "
          + "Carimbar seria palpite.",
      });
      continue;
    }

    // ── A RESSALVA: esta solicitação já serviu um portal SEM dono escrito ────
    // Não é prova de nada — é a FORMA do incidente. `PortalAccess` legado
    // preso à solicitação é o que o cliente antigo tinha na mão. Não barra o
    // carimbo (barrar excluiria quase todo o acervo e devolveria a tela vazia),
    // mas sai marcado no ensaio para que a conferência humana comece por aqui.
    const acessoLegado = await prisma.portalAccess.findFirst({
      where: { clientRequestId: s.id, clientId: null },
      select: { id: true },
    });
    const atencao = acessoLegado
      ? "esta solicitação tem token de portal SEM dono escrito — é a forma do incidente. "
        + "Confirme com o CEO de quem é esta pasta antes de aplicar."
      : undefined;

    const orfa = { clientRequestId: s.id, clientId: null };
    if (!aplicar) {
      const [m, a, ar, p] = await Promise.all([
        prisma.portalMessage.count({ where: orfa }),
        prisma.approvalRequest.count({ where: orfa }),
        prisma.brainArtifact.count({ where: orfa }),
        prisma.socialPost.count({ where: orfa }),
      ]);
      const c = { mensagens: m, aprovacoes: a, artefatos: ar, pecas: p };
      totalDeLinhasCarimbadas += m + a + ar + p;
      linhas.push({ clientRequestId: s.id, clientId, carimbadas: c, atencao });
      continue;
    }

    // Idempotente: `clientId: null` no WHERE. Rodar de novo não toca em nada.
    const [m, a, ar, p] = await Promise.all([
      prisma.portalMessage.updateMany({ where: orfa, data: { clientId } }),
      prisma.approvalRequest.updateMany({ where: orfa, data: { clientId } }),
      prisma.brainArtifact.updateMany({ where: orfa, data: { clientId } }),
      prisma.socialPost.updateMany({ where: orfa, data: { clientId } }),
    ]);
    const c = {
      mensagens: m?.count ?? 0, aprovacoes: a?.count ?? 0,
      artefatos: ar?.count ?? 0, pecas: p?.count ?? 0,
    };
    totalDeLinhasCarimbadas += c.mensagens + c.aprovacoes + c.artefatos + c.pecas;
    linhas.push({ clientRequestId: s.id, clientId, carimbadas: c, atencao });
  }

  return {
    medidoEm: new Date().toISOString(),
    aplicou: aplicar,
    solicitacoes: solicitacoes.length,
    carimbadas: linhas.filter((l) => !l.deixadaDeFora).length,
    deixadasDeFora: linhas.filter((l) => l.deixadaDeFora).length,
    comAtencao: linhas.filter((l) => !l.deixadaDeFora && l.atencao).length,
    totalDeLinhasCarimbadas,
    linhas,
  };
}
