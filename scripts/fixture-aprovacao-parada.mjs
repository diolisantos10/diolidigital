// A FILA DE APROVAÇÃO PARADA, EM DADO FICTÍCIO — só para captura de tela local.
//
// Mesma regra do `fixture-porta-da-frente.mjs`, e pelo mesmo motivo: captura
// commitada com nome real é PII dentro de um PNG, que nenhum `grep` encontra
// depois. Aqui a exposição é menor (a faixa mostra departamento e dias, nunca
// nome de cliente) — o cliente existe só porque `ApprovalRequest` prende a
// posse a ele. Ainda assim: nomes inventados, sempre.
//
// O que o fixture precisa provar, e é a única coisa que ele prova:
//
//   • "esperando o cliente" e "ele perguntou e não respondemos" são DUAS filas
//     e sobem separadas — a segunda em cima, porque é a nossa;
//   • prazo estourado é diferente de parado sem prazo;
//   • card pendente SEM DONO existe e não entra em fila nenhuma por workspace.
//
// ── A TRAVA ───────────────────────────────────────────────────────────────
// Este script ESCREVE no banco e se recusa a rodar contra qualquer coisa que
// não seja um SQLite local. Aviso em cabeçalho não barra ninguém.
//
// ── 🔴 OS IDS TÊM A FORMA QUE A PRODUÇÃO GRAVA (16/08/2026) ───────────────
//
// Eles eram `fx_ap_duvida2`, `fx_ap_velho`. A faixa mostra os **últimos 6
// caracteres** do id como localizador do card (é o que distingue duas linhas
// "Social Media"), e com id legível a captura saía com "#uvida2" e "#_velho" —
// pedaços de palavra que não existem em produção nenhuma, onde o id é um cuid.
//
// É a mesma lição do fixture da porta da frente, no mesmo dia: **fixture que
// produz o que a produção não produz valida o desenho e esconde o produto.**
//
// Uso:  node scripts/fixture-aprovacao-parada.mjs

import { createClient } from "@libsql/client";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";

if (!dbUrl.startsWith("file:")) {
  console.error(`✋ RECUSADO: DATABASE_URL não é um arquivo local (${dbUrl.split(":")[0]}:…).`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("✋ RECUSADO: NODE_ENV=production. Fixture não entra em produção.");
  process.exit(1);
}

const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;

const db = createClient({ url });

const ws = "cmpyzf1nw0000nq7dz5ij66aa"; // o mesmo de scripts/seed-db.mjs
const DIA = 86_400_000;
const agora = Date.now();
const quando = (dias) => new Date(agora - dias * DIA).toISOString();

await db.execute({
  // `portalToken` é NOT NULL e é a chave de acesso do portal. Fixture local
  // recebe um token obviamente inútil, nunca um parecido com token de verdade.
  sql: `INSERT OR REPLACE INTO Client (id, workspaceId, name, portalToken, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?)`,
  args: ["fixture_cliente", ws, "Cliente Exemplo", "fixture-local-sem-valor", quando(90), quando(90)],
});

const cards = [
  // A DÍVIDA NOSSA: ele perguntou e ninguém respondeu. O prazo dele está
  // pausado, e por isso este é o card urgente mesmo sendo o mais novo.
  { id: "cmfx0000ap0004duvida5", dept: "design", dias: 2, expira: null, perguntou: quando(1) },
  { id: "cmfx0000ap0003duvid24", dept: "social-media", dias: 5, expira: null, perguntou: quando(3) },
  // Esperando o cliente, sem prazo próprio: passou de 3 dias, virou abandono.
  { id: "cmfx0000ap0001velhozz2", dept: "social-media", dias: 12, expira: null, perguntou: null },
  // Prazo próprio ESTOURADO — "passou do prazo" é diferente de "sem prazo".
  { id: "cmfx0000ap0002vencid3", dept: "paid-traffic", dias: 6, expira: quando(2), perguntou: null },
  // Novo em folha: não é abandono, e a faixa não pode chamá-lo de atraso.
  { id: "cmfx0000ap0005novozz6", dept: "design", dias: 0, expira: null, perguntou: null },
];

for (const c of cards) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO ApprovalRequest
      (id, clientId, clientRequestId, department, requestedBy, status, expiresAt,
       questionOpenedAt, clientVisible, sourcePostIdsJson, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      c.id, "fixture_cliente", null, c.dept, "internal", "pending",
      c.expira, c.perguntou, 1, "[]", quando(c.dias), quando(c.dias),
    ],
  });
}

// O ÓRFÃO: sem solicitação e sem cliente. Fica fora de toda fila por workspace
// — corretamente, porque varrer órfão de outro inquilino é vazamento — e por
// isso mesmo precisa ser contado à parte em algum lugar.
await db.execute({
  sql: `INSERT OR REPLACE INTO ApprovalRequest
    (id, clientId, clientRequestId, department, requestedBy, status, expiresAt,
     questionOpenedAt, clientVisible, sourcePostIdsJson, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  args: ["cmfx0000ap0000orfaozz1", null, null, "design", "internal", "pending", null, null, 1, "[]", quando(20), quando(20)],
});

const r = await db.execute(`SELECT id, department, status FROM ApprovalRequest ORDER BY createdAt`);
console.log(`✓ ${r.rows.length} card(s) de aprovação fictícios:`);
for (const row of r.rows) console.log(`   ${row.id} — ${row.department} (${row.status})`);
