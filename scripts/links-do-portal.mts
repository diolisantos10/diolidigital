// links-do-portal.mts — os links de portal dos clientes, prontos para colar.
//
// Existe porque em 07/08/2026 o CEO ficou parado esperando três links
// (CityJobs, Foocci, Dioli Digital) e não havia caminho: o link só se descobre
// lendo o banco, e ninguém tinha comando para isso.
//
// ── ESTE ARQUIVO NÃO CARREGA MAIS A REGRA ──────────────────────────────────
//
// A regra (reuso de token, host, o que conta como token vivo, quando emitir)
// mora em `lib/agency/esteira/links-do-portal.ts`, e é a MESMA que
// `GET /api/admin/links-do-portal` executa. Aqui ficou só a impressão.
//
// O motivo é o defeito que este script tinha: ele exige o banco de PRODUÇÃO, e
// ninguém alcança o banco de produção — o SQLite mora num volume dentro do
// contêiner do Railway. A rota resolve isso rodando ONDE O BANCO ESTÁ; duas
// implementações da mesma regra divergiriam, e a que divergisse emitiria
// credencial de 180 dias com critério diferente da outra.
//
// Uso:
//   DATABASE_URL=<prod> npx tsx scripts/links-do-portal.mts
//   DATABASE_URL=<prod> npx tsx scripts/links-do-portal.mts --emitir
//   ... --clientes="CityJobs,Foocci,Dioli Digital"
//
// Sem acesso ao banco (o caso normal), use a rota:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://www.diolidigital.com.br/api/admin/links-do-portal

import { prisma } from "@/lib/db/client";
import { levantarLinksDoPortal } from "@/lib/agency/esteira/links-do-portal";

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const tem = (n: string) => args.includes(`--${n}`);

async function main() {
  const emitir = tem("emitir");
  const r = await levantarLinksDoPortal({
    clientes: (flag("clientes") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    host: flag("host") ?? null,
    emitir,
  });

  console.log(`\nLinks de portal — host ${r.host}${emitir ? "" : "  (leitura pura; use --emitir para gerar o que faltar)"}\n`);
  console.log(`Clientes no banco: ${r.clientesNoBanco.length}`);
  for (const c of r.clientesNoBanco) console.log(`  · ${c.nome}  (${c.id})`);
  console.log("");

  for (const l of r.linhas) {
    switch (l.situacao) {
      case "link_existente":
        console.log(`✅ ${l.cliente}\n   ${l.link}`);
        console.log(`   (token existente, emitido em ${l.emitidoEm}, ${l.acessos} acesso(s))\n`);
        break;
      case "link_novo":
        console.log(`🆕 ${l.cliente}\n   ${l.link}\n   (${l.motivo})\n`);
        break;
      case "sem_token":
        console.log(`🟡 ${l.cliente} — ${l.motivo} Rode de novo com --emitir para gerar.\n`);
        break;
      case "cliente_nao_existe":
        console.log(`❌ ${l.procurado} — ${l.motivo}`);
        break;
      case "nome_ambiguo":
        console.log(`⚠️  ${l.procurado} — ${l.motivo}`);
        for (const c of l.candidatos ?? []) console.log(`      ${c.nome} (${c.id})`);
        break;
    }
  }

  if (r.faltando > 0) {
    console.log(`\n${r.faltando} cliente(s) sem link. Nada foi inventado: veja o motivo em cada linha.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("\nFALHOU:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
