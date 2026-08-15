// ── QUANTAS MENSAGENS A CERCA ESCONDE? (15/08/2026) ────────────────────────
//
// O `qualidade` barrou o merge com uma pergunta que não tinha resposta:
// **um P0 cujo custo declarado é "esconder histórico" não se mescla sem o
// número.** Este script é a medida. Ele é SOMENTE LEITURA — não migra, não
// carimba, não apaga.
//
// O que ele conta: `PortalMessage` com `clientId IS NULL` cuja `clientRequestId`
// tenha uma irmã carimbada com um `clientId` diferente do dono ATUAL daquela
// solicitação. Essas são as linhas ambíguas — as que a cerca deixa de fora,
// porque não dá para saber de quem são, e adivinhar é o que a lei da casa
// proíbe.
//
// Rodar:
//   DATABASE_URL="file:./dev.db" npx tsx scripts/censo-de-historico-ambiguo.mts
//   DATABASE_URL="<url de produção>" npx tsx scripts/censo-de-historico-ambiguo.mts

import { prisma } from "../lib/db/client";

async function main() {
  const solicitacoes = await prisma.clientRequestDb.findMany({ select: { id: true, clientId: true } });
  const donoAtual = new Map(solicitacoes.map((s) => [s.id, s.clientId]));

  const carimbadas = await prisma.portalMessage.findMany({
    where: { clientId: { not: null }, clientRequestId: { not: null } },
    select: { clientRequestId: true, clientId: true },
    distinct: ["clientRequestId", "clientId"],
  });

  // Solicitação cujo histórico tem carimbo de alguém que NÃO é o dono de hoje.
  const suspeitas = new Set<string>();
  for (const c of carimbadas) {
    if (!c.clientRequestId) continue;
    const atual = donoAtual.get(c.clientRequestId) ?? null;
    if (atual && c.clientId && c.clientId !== atual) suspeitas.add(c.clientRequestId);
  }

  const ambiguas = suspeitas.size === 0 ? 0 : await prisma.portalMessage.count({
    where: { clientRequestId: { in: [...suspeitas] }, clientId: null },
  });

  const totalMensagens = await prisma.portalMessage.count();
  const totalSemDono = await prisma.portalMessage.count({ where: { clientId: null } });

  console.log(JSON.stringify({
    medidoEm: new Date().toISOString(),
    totalDeMensagens: totalMensagens,
    // O universo de risco: linha sem dono escrito. A cerca só esconde a fatia
    // ambígua abaixo — o resto continua aparecendo normalmente.
    semDonoEscrito: totalSemDono,
    solicitacoesQueTrocaramDeDono: suspeitas.size,
    // ⬇️ O NÚMERO QUE DECIDE O TRADE-OFF: quantas mensagens somem da tela.
    mensagensOcultadasPelaCerca: ambiguas,
    solicitacoesAfetadas: [...suspeitas],
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
