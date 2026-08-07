// links-do-portal.mts — os links de portal dos clientes, prontos para colar.
//
// Existe porque em 07/08/2026 o CEO ficou parado esperando três links
// (CityJobs, Foocci, Dioli Digital) e não havia caminho: o link só se descobre
// lendo o banco, e ninguém tinha comando para isso. Link que só existe dentro
// da cabeça de quem tem acesso ao banco não é link — é um pedido de favor.
//
// ── AS DECISÕES QUE ESTE SCRIPT CARREGA ─────────────────────────────────────
//
// 1. HOST FIXO NO DOMÍNIO PRÓPRIO. Só `www.diolidigital.com.br` está registrado
//    como redirect no Google (`/api/google/drive/callback`). Um link do host do
//    Railway leva o cliente a `redirect_uri_mismatch` na hora de conectar o
//    Drive — erro do Google, com cara de defeito nosso. Sobrescrevível por
//    --host, mas o padrão é o único que funciona ponta a ponta.
//
// 2. NÃO REVOGA NADA. Um token de portal vivo pode estar no WhatsApp do cliente.
//    Trocá-lo por um novo quebra o link que ele já tem, em silêncio. O script
//    REUSA o token válido e só emite quando não há nenhum.
//
// 3. ESCREVER É EXPLÍCITO. Sem `--emitir`, é leitura pura: quem não tem token
//    aparece como faltando, e nada é gravado. Emitir credencial de 180 dias por
//    efeito colateral de um comando de consulta é como credencial vaza.
//
// Uso:
//   DATABASE_URL=<prod> npx tsx scripts/links-do-portal.mts
//   DATABASE_URL=<prod> npx tsx scripts/links-do-portal.mts --emitir
//   ... --clientes="CityJobs,Foocci,Dioli Digital"

// O cliente do banco é o MESMO da aplicação (`lib/db/client.ts`): ele carrega o
// adaptador libsql e a normalização de caminho `file:./`. Montar um
// `new PrismaClient()` aqui seria a segunda forma de abrir o banco — e a que
// diverge no dia em que o provedor mudar.
import { prisma } from "@/lib/db/client";
import { randomBytes } from "crypto";

const HOST_PADRAO = "https://www.diolidigital.com.br";

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const tem = (n: string) => args.includes(`--${n}`);

const host = (flag("host") ?? HOST_PADRAO).replace(/\/+$/, "");
const emitir = tem("emitir");
const procurados = (flag("clientes") ?? "CityJobs,Foocci,Dioli Digital")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Token válido = não revogado e não vencido. A data é conferida aqui, e não
 *  no `where`, para que "vencido" apareça no relato em vez de sumir. */
function vivo(t: { revokedAt: Date | null; expiresAt: Date | null }): boolean {
  if (t.revokedAt) return false;
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return false;
  return true;
}

async function main() {
  console.log(`\nLinks de portal — host ${host}${emitir ? "" : "  (leitura pura; use --emitir para gerar o que faltar)"}\n`);

  const todos = await prisma.client.findMany({
    select: { id: true, name: true, workspaceId: true },
    orderBy: { name: "asc" },
  });

  console.log(`Clientes no banco: ${todos.length}`);
  for (const c of todos) console.log(`  · ${c.name}  (${c.id})`);
  console.log("");

  let faltando = 0;

  for (const nome of procurados) {
    // Busca por conteúdo, sem `mode: insensitive` — o SQLite do Prisma não o
    // suporta e ele lança em vez de filtrar. Comparação feita em memória.
    const alvo = todos.filter((c) => c.name.toLowerCase().includes(nome.toLowerCase()));

    if (alvo.length === 0) {
      console.log(`❌ ${nome} — NÃO EXISTE em produção. Sem cliente não há portal.`);
      faltando++;
      continue;
    }
    if (alvo.length > 1) {
      // Ambiguidade não se resolve por palpite: mandar o link do cliente errado
      // entrega o portal de um cliente a outro.
      console.log(`⚠️  ${nome} — ${alvo.length} clientes casam com este nome. Não escolhi por conta própria:`);
      for (const c of alvo) console.log(`      ${c.name} (${c.id})`);
      faltando++;
      continue;
    }

    const c = alvo[0];
    const acessos = await prisma.portalAccess.findMany({
      where: { clientId: c.id },
      orderBy: { grantedAt: "desc" },
    });
    const bom = acessos.find(vivo);

    if (bom) {
      console.log(`✅ ${c.name}\n   ${host}/portal/access/${bom.token}`);
      console.log(`   (token existente, emitido em ${bom.grantedAt.toISOString().slice(0, 10)}, ${bom.accessCount} acesso(s))\n`);
      continue;
    }

    const motivo = acessos.length === 0
      ? "nunca teve token de portal"
      : "todos os tokens estão revogados ou vencidos";

    if (!emitir) {
      console.log(`🟡 ${c.name} — ${motivo}. Rode de novo com --emitir para gerar.\n`);
      faltando++;
      continue;
    }

    const novo = await prisma.portalAccess.create({
      data: { token: randomBytes(32).toString("base64url"), clientId: c.id },
    });
    console.log(`🆕 ${c.name} (${motivo} — token novo)\n   ${host}/portal/access/${novo.token}\n`);
  }

  if (faltando > 0) {
    console.log(`\n${faltando} cliente(s) sem link. Nada foi inventado: veja o motivo em cada linha.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("\nFALHOU:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
