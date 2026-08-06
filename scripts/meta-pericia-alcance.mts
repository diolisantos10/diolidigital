// PERÍCIA E LIMPEZA DO ALCANCE INDEVIDO NA META — 06/08/2026
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
// O CEO clicou "Conectar Facebook/Instagram" no portal do cliente Foocci. A
// Meta devolveu um token do USUÁRIO dele. Duas coisas aconteceram na sequência:
//
//   1. O CALLBACK (`app/api/meta/callback/route.ts`) varreu `me/accounts` e
//      GRAVOU como conexão da Foocci **todas** as Páginas e Instagram que o
//      token alcançava — com o token de Página junto, que PUBLICA. Isto é
//      estado durável: linha em `MetaConnection`.
//   2. `ads-leitura.ts` perguntou `me/adaccounts` (~13h20) e leu 14 contas de
//      anúncio. A leitura em si não grava relatório em lugar nenhum — mas cada
//      conta consultada deixa rastro do PRÓPRIO ID na cota por pontuação
//      (`MetaAdCota`, uma linha por conta e janela de 300s) e, se a Meta tiver
//      freado, em `MetaAdFreio`.
//
// Este script encontra e apaga o que é de conta NÃO autorizada. Ele não fala
// com a Meta: é só banco.
//
// ─── PROTOCOLO (obrigatório, nesta ordem) ───────────────────────────────────
//
//   npx tsx scripts/meta-pericia-alcance.mts            # 1. dry-run: só imprime
//   (conferir a lista impressa)                          # 2. olhar
//   npx tsx scripts/meta-pericia-alcance.mts --apply    # 3. apagar
//
// Contra PRODUÇÃO: exportar o `DATABASE_URL` de produção na chamada. Sem isso
// ele roda contra o banco local e não prova nada sobre o incidente.

// ─── O QUE A PERÍCIA EM PRODUÇÃO MOSTROU — 06/08/2026, e mudou este script ──
//
// O dry-run contra uma réplica fiel do banco de produção (27 linhas lidas de
// GET /api/meta/connections) listou para exclusão **25 de 25** conexões de
// ativo: as 19 de terceiros, as 4 da própria Dioli e **as 2 legítimas da
// Foocci**. Um `--apply` teria zerado a casa.
//
// Duas causas, as duas consertadas aqui:
//
//   1. "Sem cliente" tinha duas grafias no banco — `null` (callback) e `""`
//      (`/api/meta/token`, que gravou as 24 linhas de nível agência em 03/08).
//      O `=== null` abaixo não reconhecia `""` e mandava tudo para o ramo do
//      cliente. Agora usa `donoDe`, a forma canônica.
//
//   2. **"Sem autorização" NÃO é "gravado indevidamente".** A tabela
//      `MetaAtivoAutorizado` nasce vazia — de propósito. Logo, no primeiro boot
//      TODA conexão de cliente parece não autorizada, inclusive a que o cliente
//      concedeu de verdade. Deduzir exclusão de uma lista vazia é exatamente o
//      erro que produziu o incidente: tratar ausência de informação como
//      informação.
//
//      Por isso apagar deixou de ser inferido. Agora exige `--ids=<id,id,...>`
//      — a lista que uma pessoa conferiu. Sem ids, `--apply` não apaga nada e
//      sai com erro. Trava, não aviso.

import { prisma } from "@/lib/db/client";
import { donoDe } from "@/lib/integrations/meta/ativos-autorizados";

const APLICAR = process.argv.includes("--apply");
const IDS_PARA_APAGAR = new Set(
  (process.argv.find((a) => a.startsWith("--ids="))?.slice("--ids=".length) ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean),
);

function linha(s = "") { console.log(s); }
function titulo(s: string) { linha(); linha(`── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`); }

const TIPO_POR_PLATAFORMA: Record<string, string | null> = {
  facebook: "page",
  instagram: "instagram",
  whatsapp: "whatsapp",
  user: null,
};

// ─── 1. Conexões de CLIENTE sem autorização ─────────────────────────────────

titulo("1. MetaConnection — ativos de cliente sem linha na lista autorizada");

const conexoes = await prisma.metaConnection.findMany({
  orderBy: { connectedAt: "asc" },
  select: {
    id: true, workspaceId: true, clientId: true, platform: true,
    name: true, externalId: true, connectedAt: true,
  },
});
linha(`Total de conexões no banco: ${conexoes.length}`);

const autorizacoes = await prisma.metaAtivoAutorizado.findMany();
linha(`Total de autorizações registradas: ${autorizacoes.length}`);
const chaveAut = new Set(
  autorizacoes.map((a) => `${a.workspaceId}:${a.clientId ?? "agencia"}:${a.tipo}:${a.externalId}`),
);

const conexoesIndevidas = conexoes.filter((c) => {
  const tipo = TIPO_POR_PLATAFORMA[c.platform] ?? null;
  if (tipo === null) return false;                 // "user": credencial concedida
  if (donoDe(c.clientId) === null) return false;   // conta da própria agência
  return !chaveAut.has(`${c.workspaceId}:${donoDe(c.clientId)}:${tipo}:${c.externalId}`);
});

// As de nível agência entram no relatório à parte. Elas NÃO são candidatas a
// exclusão automática (quem autoriza e quem é dono são a mesma pessoa), mas
// esconder a lista foi o que deixou 19 Páginas de terceiros passarem por
// "conta da própria agência" durante três dias.
const conexoesDaAgencia = conexoes.filter(
  (c) => (TIPO_POR_PLATAFORMA[c.platform] ?? null) !== null && donoDe(c.clientId) === null,
);

if (conexoesIndevidas.length === 0) {
  linha("✅ Nenhuma conexão de cliente sem autorização.");
} else {
  linha(`🔴 ${conexoesIndevidas.length} conexão(ões) de CLIENTE sem linha na lista autorizada:`);
  for (const c of conexoesIndevidas) {
    linha(`   • [${c.id}] ${c.platform.padEnd(10)} ${c.externalId.padEnd(20)} "${c.name}" · cliente ${c.clientId} · ${c.connectedAt.toISOString()}`);
  }
  linha();
  linha("⚠️  ATENÇÃO — LEIA ANTES DE APAGAR: a lista de autorizados nasce VAZIA.");
  linha("   Uma conexão aparecer aqui significa \"ainda não foi reautorizada na");
  linha("   tela do cliente\", NÃO \"foi obtida indevidamente\". As duas coisas se");
  linha("   parecem e só uma justifica exclusão. Confira nome por nome.");
}

linha();
linha(`ℹ️  ${conexoesDaAgencia.length} conexão(ões) de nível AGÊNCIA (sem cliente) — não são candidatas a exclusão,`);
linha("   mas é aqui que ativo de TERCEIRO se esconde. Confira se cada uma é mesmo da Dioli:");
for (const c of conexoesDaAgencia) {
  linha(`   • [${c.id}] ${c.platform.padEnd(10)} ${c.externalId.padEnd(20)} "${c.name}" · ${c.connectedAt.toISOString()}`);
}

// ─── 2. Contas de anúncio que deixaram rastro na cota ───────────────────────

titulo("2. MetaAdCota / MetaAdFreio — ids de conta de anúncio consultados");

const cotas = await prisma.metaAdCota.findMany({ orderBy: { atualizadoEm: "asc" } });
const freios = await prisma.metaAdFreio.findMany();
const contasAutorizadas = new Set(
  autorizacoes.filter((a) => a.tipo === "ad_account").map((a) => a.externalId),
);

const cotasIndevidas = cotas.filter((c) => c.contaId.startsWith("act_") && !contasAutorizadas.has(c.contaId));
const freiosIndevidos = freios.filter((f) => f.contaId.startsWith("act_") && !contasAutorizadas.has(f.contaId));

linha(`Linhas de cota: ${cotas.length} (com id de conta real: ${cotas.filter((c) => c.contaId.startsWith("act_")).length})`);
if (cotasIndevidas.length === 0) {
  linha("✅ Nenhuma linha de cota de conta não autorizada.");
} else {
  const ids = [...new Set(cotasIndevidas.map((c) => c.contaId))];
  linha(`🔴 ${cotasIndevidas.length} linha(s) de cota, de ${ids.length} conta(s) não autorizada(s):`);
  for (const id of ids) linha(`   • ${id}`);
}
if (freiosIndevidos.length > 0) {
  linha(`🔴 ${freiosIndevidos.length} freio(s) de conta não autorizada: ${freiosIndevidos.map((f) => f.contaId).join(", ")}`);
}

// ─── 3. Onde MAIS a leitura poderia ter gravado — conferido, e não gravou ───

titulo("3. Onde mais procurei (e o que encontrei)");

const [runs, eventos, campanhas] = await Promise.all([
  prisma.aIRunLog.count({
    where: { OR: [{ promptSummary: { contains: "act_" } }, { outputSummary: { contains: "act_" } }, { warnings: { contains: "act_" } }] },
  }).catch(() => -1),
  prisma.activityEvent.count({ where: { OR: [{ type: { contains: "meta" } }, { message: { contains: "act_" } }] } }).catch(() => -1),
  prisma.adCampaign.count().catch(() => -1),
]);
linha(`AIRunLog com "adaccount"/"act_": ${runs === -1 ? "não consultável" : runs}`);
linha(`ActivityEvent de meta / com "act_":  ${eventos === -1 ? "não consultável" : eventos}`);
linha(`AdCampaign (campanhas gravadas):     ${campanhas === -1 ? "não consultável" : campanhas}`);
linha();
linha("Observação de código, não de banco: `lerPanoramaDaAgencia` NÃO persiste");
linha("nada — nem cache, nem relatório, nem log. O painel devolve JSON e morre.");
linha("O único rastro da leitura é o id da conta em MetaAdCota (item 2).");

// ─── 4. Apagar ──────────────────────────────────────────────────────────────

titulo(APLICAR ? "4. APAGANDO" : "4. DRY-RUN — nada foi apagado");

if (!APLICAR) {
  linha("Confira a lista acima e rode de novo com:");
  linha("  --apply --ids=<os ids que você decidiu apagar>");
  linha("`--apply` sozinho é recusado de propósito — ver a trava do apagar abaixo.");
  await prisma.$disconnect();
  process.exit(0);
}

// ─── A TRAVA DO APAGAR ──────────────────────────────────────────────────────
// Sem `--ids=`, não se apaga conexão nenhuma. O conjunto "não autorizado" é
// grande demais e ambíguo demais (ver o cabeçalho) para virar comando de
// exclusão sozinho.
if (IDS_PARA_APAGAR.size === 0) {
  linha("✗ RECUSADO: `--apply` sem `--ids=<id,id,...>`.");
  linha();
  linha("  Este script não apaga conexão por dedução. Ausência de linha na lista");
  linha("  de autorizados NÃO prova que a conexão foi obtida indevidamente — a");
  linha("  tabela nasce vazia, então até a conexão legítima aparece como \"sem");
  linha("  autorização\". Em produção isso listou 25 de 25, inclusive as 2 da");
  linha("  Foocci e as 4 da própria Dioli.");
  linha();
  linha("  Confira a lista acima e passe os ids que VOCÊ decidiu apagar:");
  linha("    npx tsx scripts/meta-pericia-alcance.mts --apply --ids=abc123,def456");
  await prisma.$disconnect();
  process.exit(1);
}

const porId = new Map(conexoes.map((c) => [c.id, c]));
const desconhecidos = [...IDS_PARA_APAGAR].filter((id) => !porId.has(id));
if (desconhecidos.length > 0) {
  linha(`✗ RECUSADO: ${desconhecidos.length} id(s) não existem neste banco: ${desconhecidos.join(", ")}`);
  linha("  Id que não casa costuma ser lista colada do banco errado. Nada foi apagado.");
  await prisma.$disconnect();
  process.exit(1);
}

let n = 0;
for (const id of IDS_PARA_APAGAR) {
  const c = porId.get(id)!;
  await prisma.metaConnection.delete({ where: { id: c.id } });
  linha(`   apagada conexão ${c.platform} ${c.externalId} ("${c.name}") · cliente ${c.clientId || "(agência)"}`);
  n++;
}
const cot = cotasIndevidas.length
  ? await prisma.metaAdCota.deleteMany({ where: { id: { in: cotasIndevidas.map((c) => c.id) } } })
  : { count: 0 };
const fre = freiosIndevidos.length
  ? await prisma.metaAdFreio.deleteMany({ where: { contaId: { in: freiosIndevidos.map((f) => f.contaId) } } })
  : { count: 0 };

linha();
linha(`✅ ${n} conexão(ões), ${cot.count} linha(s) de cota e ${fre.count} freio(s) apagados.`);
linha("O token de usuário (platform \"user\") foi PRESERVADO de propósito: é a");
linha("credencial que a pessoa concedeu, e sem ela o cliente não consegue nem");
linha("abrir a tela para escolher o que liberar. Ele não dá acesso a nada por si:");
linha("todo caminho de leitura filtra pela lista antes de devolver qualquer coisa.");

await prisma.$disconnect();
