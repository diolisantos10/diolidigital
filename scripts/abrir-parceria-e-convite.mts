// ABRIR A PARCERIA E CUNHAR O CONVITE — de uma vez, para quem JÁ está no ambiente.
//
// ── Por que existe, e por que é "só a boca" ────────────────────────────────
//
// A porta normal são as rotas, com sessão de agência e CSRF:
//   • `POST /api/agency/parcerias`               (autorizar)
//   • `POST /api/agency/convites-de-parceria`    (cunhar o link)
//
// Este script é o SEGUNDO caminho, para quem está no ambiente e alcança o
// banco — o mesmo molde de `conceder-isencao-de-parceria.mts`, e pela mesma
// razão registrada lá: dizer "não é rota, por decisão" já custou a esta casa um
// literal *"não concedi porque não alcanço o banco"*. Duas bocas, UMA regra.
//
// ⚠️ Toda a conferência mora nas bibliotecas
// (`financeiro/parceria-do-parceiro.ts`, `comercial/convite-de-parceria.ts`).
// Um script que reimplementasse a regra seria o segundo caminho que ninguém
// testa — e é justamente por isso que aqui não há NENHUMA validação própria.
//
// ── Uso ────────────────────────────────────────────────────────────────────
//
//   npx tsx scripts/abrir-parceria-e-convite.mts \
//     --nome-do-cliente "FOOCCI" \
//     --autorizada-por "o CEO (D-0B9, D-0C2)" \
//     --dias 30 \
//     --escopo "social media (Instagram @foocci_)" \
//     --pecas 12 \
//     --teto-ia-centavos-usd 200 \
//     [--cliente <clientId já existente>] \
//     [--dias-do-convite 14] [--observacao "..."]
//
// ⛔ NÃO cadastra e-mail nem telefone. São opcionais no `Client`, e ficam
// NULOS de propósito: contato real de cliente não se inventa, e um endereço
// inventado é pior — a casa dispara para ele.

import { prisma } from "@/lib/db/client";
import { autorizarParceriaDoCliente } from "@/lib/agency/financeiro/parceria-do-parceiro";
import { cunharConviteDeParceria } from "@/lib/agency/comercial/convite-de-parceria";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Texto → número SEM cair em zero: a omissão de um teto não pode virar teto 0. */
function num(v: string | undefined): number {
  return v === undefined ? Number.NaN : Number(v);
}

function dias(v: string | undefined, padrao: number): Date {
  const n = v === undefined ? padrao : Number(v);
  return new Date(Date.now() + n * 24 * 3600_000);
}

// ── 1. O CLIENTE ───────────────────────────────────────────────────────────
// Ou já existe (`--cliente`), ou é cadastrado agora pelo nome. Cadastrar
// cliente é ato de agência, legítimo. ⚠️ O BRIEFING dele NÃO se fabrica: tem de
// vir do parceiro, com as palavras dele.
let clientId = arg("cliente") ?? "";
if (!clientId) {
  const nome = arg("nome-do-cliente") ?? "";
  if (!nome.trim()) {
    console.error("Informe --cliente <id> ou --nome-do-cliente \"NOME\".");
    process.exit(1);
  }
  const ws = await prisma.agencyWorkspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!ws) {
    console.error("Nenhum workspace no banco — não há onde cadastrar o cliente.");
    process.exit(1);
  }
  const existente = await prisma.client.findFirst({ where: { workspaceId: ws.id, name: nome.trim() } });
  // Idempotente: rodar duas vezes não cria dois clientes com o mesmo nome.
  const cli = existente ?? (await prisma.client.create({
    data: { workspaceId: ws.id, name: nome.trim(), industry: arg("escopo") ?? null },
  }));
  clientId = cli.id;
  console.log(`${existente ? "Cliente já existia" : "Cliente cadastrado"}: ${cli.name} (${cli.id}) — sem e-mail e sem telefone.`);
}

// ── 2. A PARCERIA (rompe o nó: não precisa de pedido) ──────────────────────
const p = await autorizarParceriaDoCliente({
  clientId,
  autorizadaPor: arg("autorizada-por") ?? "",
  validaAte: dias(arg("dias"), Number.NaN),
  escopo: arg("escopo") ?? "",
  pecasContratadas: num(arg("pecas")),
  tetoDeIaCentavosUsd: num(arg("teto-ia-centavos-usd")),
  observacao: arg("observacao") ?? null,
});
if (!p.ok) {
  console.error(`PARCERIA RECUSADA (${p.recusa}): ${p.motivo}`);
  process.exit(1);
}
console.log(`Parceria ${p.jaExistia ? "já autorizada" : "autorizada"} — vale até ${p.validaAte.toISOString().slice(0, 10)}.`);

// ── 3. O CONVITE ───────────────────────────────────────────────────────────
const c = await cunharConviteDeParceria({
  clientId,
  criadoPor: `script:${process.env.USER ?? "ambiente"}`,
  expiraEm: dias(arg("dias-do-convite"), 14),
});
if (!c.ok) {
  console.error(`CONVITE RECUSADO (${c.recusa}): ${c.motivo}`);
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
console.log("");
console.log("LINK PARA O PARCEIRO (entregue pela mão, não por e-mail automático):");
console.log(`${base}/briefing?convite=${encodeURIComponent(c.token)}`);
console.log(`Expira em ${c.expiraEm.toISOString()}.`);
console.log("");
console.log("Morre antes disso se a parceria for revogada ou vencer — ela é conferida a cada uso.");
console.log("NÃO é pagamento: receita R$ 0, custo contado normalmente, margem negativa visível.");
