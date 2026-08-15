// Dados de TELA para o banco LOCAL (dev.db). Cliente FICTÍCIO, nunca dado real.
// Existe só para renderizar os dois lados do interruptor em 375/768/1440.
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:./dev.db" });
const ws = await db.execute("SELECT id FROM AgencyWorkspace LIMIT 1");
const wsId = ws.rows[0].id;

const dia = 86_400_000;
const agora = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const cliId = "cli-teste-local";

await db.execute({
  sql: `INSERT INTO Client (id, workspaceId, name, portalToken, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)`,
  args: [cliId, wsId, "Padaria Fictícia (teste local)", "client-token-legado", iso(agora), iso(agora)],
});

await db.execute({
  sql: `INSERT INTO PortalAccess (id, token, clientId, grantedAt, accessCount, createdAt)
        VALUES (?, ?, ?, ?, 0, ?)`,
  args: ["pa-teste", "token-de-teste-local", cliId, iso(agora), iso(agora)],
});

const avisos = [
  ["n1", "aprovacao",
    "Oi! Calendário de agosto — 12 peças está no seu portal esperando a sua aprovação há 4 dias.\n\n[card:ap-teste]",
    "https://www.diolidigital.com.br/portal/access/token-de-teste-local",
    "cobrança de aprovação registrada — ainda não saiu por canal nenhum", 4],
  ["n2", "material",
    "Precisamos do seu logo em alta para começar as artes do mês.",
    "https://www.diolidigital.com.br/portal/access/token-de-teste-local",
    'cliente sem telefone cadastrado · e-mail: o canal de e-mail está DESLIGADO (AVISO_POR_EMAIL não é "on")', 2],
  ["n3", "recompra",
    "Faz 30 dias da última entrega — quer retomar o pacote?", null, null, 1],
];
for (const [id, kind, body, link, motivo, dias] of avisos) {
  await db.execute({
    sql: `INSERT INTO ClientNotice (id, workspaceId, clientId, kind, body, link, status, channel, failReason, retryCount, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 'pendente', 'nenhum', ?, 0, ?, ?)`,
    args: [id, wsId, cliId, kind, body, link, motivo, iso(agora - dias * dia), iso(agora)],
  });
}

// Um card esperando O CLIENTE; outro esperando A AGÊNCIA (dúvida aberta).
await db.execute({
  sql: `INSERT INTO ApprovalRequest (id, clientId, department, status, requestedBy, clientVisible, reviewNote, sourcePostIdsJson, createdAt, updatedAt)
        VALUES (?, ?, 'social-media', 'pending', 'equipe', 1, ?, '[]', ?, ?)`,
  args: ["ap-teste", cliId, "Calendário de agosto — 12 peças\n\nPeça 1...", iso(agora - 4 * dia), iso(agora)],
});
await db.execute({
  sql: `INSERT INTO ApprovalRequest (id, clientId, department, status, requestedBy, clientVisible, reviewNote, questionOpenedAt, sourcePostIdsJson, createdAt, updatedAt)
        VALUES (?, ?, 'design', 'pending', 'equipe', 1, ?, ?, '[]', ?, ?)`,
  args: ["ap-duvida", cliId, "Identidade — proposta de paleta\n\n...", iso(agora - 5 * dia), iso(agora - 6 * dia), iso(agora)],
});

console.log("ok — dados de tela inseridos no banco LOCAL");
