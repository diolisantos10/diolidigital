// PERÍCIA: ALGUM ANÚNCIO JÁ CRIADO NASCEU COM O ATIVO DE OUTRO CLIENTE?
// 15/08/2026. SOMENTE LEITURA — este script não escreve nada e NÃO fala com a
// Meta. É só banco.
//
// ─── O DEFEITO QUE ELE MEDE ─────────────────────────────────────────────────
//
// Até 15/08/2026, `montarCriativo` (`lib/agency/esteira/trafego.ts`) escolhia:
//
//   • a PÁGINA com `findFirst({ workspaceId, platform: "facebook", status:
//     "connected" })` — sem `clientId`. Isto é: a primeira Página conectada do
//     workspace, seja de quem for;
//   • a ARTE com `findFirst({ mediaUrl: { not: null } }, orderBy createdAt
//     desc)` — sem dono nenhum. Isto é: o post mais recente da base inteira.
//
// O `pageId` ia cru para `object_story_spec.page_id`. Logo, num workspace com
// mais de um cliente, o anúncio de A podia nascer assinado pela Página de B,
// com a arte de B.
//
// ─── POR QUE DÁ PARA MEDIR SEM CHAMAR A META ────────────────────────────────
//
// `AdCampaign` não guarda o `pageId` nem a `imagemUrl` usados — mas o código
// que os escolheu era DETERMINÍSTICO, e as duas entradas dele estão no banco:
// `MetaConnection` e `SocialPost`. Reconstruímos a escolha:
//
//   PÁGINA  → a Página que o `findFirst` teria devolvido para aquele workspace.
//             Sem `orderBy`, o Postgres não promete ordem; por isso o veredito
//             só é CONCLUSIVO quando o workspace tem exatamente UMA Página
//             conectada. Com mais de uma, o script diz "ambíguo" e lista as
//             candidatas — nunca chuta.
//   ARTE    → o `SocialPost` com `mediaUrl` de `createdAt` máximo ANTERIOR à
//             criação da campanha. Esse é exatamente o `orderBy desc` + `take
//             1` do código antigo, congelado naquele instante.
//
// Só entram campanhas com `adId` preenchido: sem anúncio criado, nenhum ativo
// foi usado.
//
// ─── COMO RODAR CONTRA PRODUÇÃO ────────────────────────────────────────────
//
//   DATABASE_URL="<url de produção>" npx tsx scripts/pericia-posse-do-criativo.mts
//
// Sem exportar o `DATABASE_URL` de produção ele roda contra o banco local e não
// prova nada sobre o incidente.

import { prisma } from "@/lib/db/client";
import { donoDe } from "@/lib/integrations/meta/ativos-autorizados";

function linha(s = "") { console.log(s); }
function titulo(s: string) { linha(); linha(`── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`); }

const anuncios = await prisma.adCampaign.findMany({
  where: { adId: { not: null } },
  select: {
    id: true, workspaceId: true, clientId: true, projectId: true,
    adId: true, name: true, status: true, createdAt: true,
  },
  orderBy: { createdAt: "asc" },
});

titulo("Anúncios criados por esta casa (AdCampaign com adId)");
linha(`Total: ${anuncios.length}`);
if (anuncios.length === 0) {
  linha("✅ Nenhum anúncio foi criado. Nada pode ter nascido com ativo alheio.");
  await prisma.$disconnect();
  process.exit(0);
}

const paginas = await prisma.metaConnection.findMany({
  where: { platform: "facebook", status: "connected" },
  select: { id: true, workspaceId: true, clientId: true, externalId: true, name: true, connectedAt: true },
});

const artes = await prisma.socialPost.findMany({
  where: { mediaUrl: { not: null } },
  select: { id: true, workspaceId: true, clientId: true, createdAt: true, caption: true },
  orderBy: { createdAt: "desc" },
});

let contaminados = 0;
let ambiguos = 0;
let limpos = 0;

titulo("Veredito, anúncio por anúncio");
for (const a of anuncios) {
  const dono = donoDe(a.clientId);
  const candidatas = paginas.filter((p) => p.workspaceId === a.workspaceId);
  const arteUsada = artes.find((s) => s.workspaceId === a.workspaceId && s.createdAt <= a.createdAt)
    // O código antigo nem filtrava por workspace: se não houver peça do
    // workspace, ele teria pego a de qualquer um. Medimos o pior caso real.
    ?? artes.find((s) => s.createdAt <= a.createdAt);

  const problemas: string[] = [];
  let ambiguo = false;

  if (candidatas.length === 0) {
    problemas.push("nenhuma Página conectada hoje — impossível reconstruir (a conexão pode ter sido apagada)");
    ambiguo = true;
  } else if (candidatas.length === 1) {
    const p = candidatas[0]!;
    if (donoDe(p.clientId) !== dono) {
      problemas.push(`PÁGINA DE OUTRO DONO: ${p.externalId} ("${p.name}") é do cliente ${donoDe(p.clientId) ?? "agência"}, e o anúncio é do cliente ${dono ?? "agência"}`);
    }
  } else {
    const deOutros = candidatas.filter((p) => donoDe(p.clientId) !== dono);
    if (deOutros.length > 0) {
      problemas.push(`AMBÍGUO: ${candidatas.length} Páginas conectadas no workspace, ${deOutros.length} de outro dono (${deOutros.map((p) => p.externalId).join(", ")}) — o findFirst sem ordem podia ter pegado qualquer uma`);
      ambiguo = true;
    }
  }

  if (!arteUsada) {
    problemas.push("nenhuma peça com arte anterior à campanha — o anúncio provavelmente não tinha imagem");
  } else if (donoDe(arteUsada.clientId) !== dono) {
    problemas.push(`ARTE DE OUTRO DONO: peça ${arteUsada.id} é do cliente ${donoDe(arteUsada.clientId) ?? "agência"}`);
  }

  if (problemas.length === 0) {
    limpos++;
    continue;
  }
  if (ambiguo) ambiguos++; else contaminados++;
  linha();
  linha(`${ambiguo ? "🟡" : "🔴"} [${a.id}] "${a.name}" · anúncio ${a.adId} · status ${a.status} · ${a.createdAt.toISOString()}`);
  linha(`   projeto ${a.projectId ?? "—"} · cliente ${dono ?? "agência"}`);
  for (const p of problemas) linha(`   • ${p}`);
}

titulo("Resumo");
linha(`✅ limpos (ativo do próprio dono):        ${limpos}`);
linha(`🔴 nasceram com ativo de OUTRO cliente:   ${contaminados}`);
linha(`🟡 não dá para concluir (ambíguo):        ${ambiguos}`);
linha();
linha("O QUE FAZER COM CADA UM:");
linha("  🔴 → pausar o anúncio na conta e apagar o criativo. É a marca de um");
linha("       cliente assinando a peça de outro; nenhum código desfaz isso.");
linha("  🟡 → conferir à mão no Gerenciador de Anúncios QUAL Página assina o");
linha("       anúncio. Ambíguo não é limpo — é 'não medido'.");
linha();
linha("Nenhuma linha foi escrita e nenhuma chamada foi feita à Meta.");

await prisma.$disconnect();
