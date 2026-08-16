// DADO DE TESTE LOCAL — cinco briefings do MESMO contato, mais um sem contato.
//
// POR QUE ESTE SCRIPT EXISTE: a regra de design desta casa manda conferir toda
// tela alterada em 375/768/1440 com screenshot. Screenshot de uma tela onde o
// elemento novo NÃO APARECE não prova nada — e o carimbo de repetição e o bloco
// "Este contato já escreveu antes" só existem quando há mais de um briefing do
// mesmo e-mail. Sem plantar o dado, a captura seria teatro.
//
// NUNCA rode isto contra produção: só escreve em banco local (exige DATABASE_URL
// apontando para arquivo SQLite).
//
// Uso: node scripts/plantar-leads-repetidos.mjs
// Mesma porta do `scripts/seed-db.mjs`: `@libsql/client` cru, sem prisma
// generate e sem tsx. Um script de dado de teste não deve depender de build.
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
if (!dbUrl.startsWith("file:")) {
  console.error("RECUSADO: DATABASE_URL não é um arquivo SQLite local. Este script é só para a máquina de quem desenvolve.");
  process.exit(1);
}
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const db = createClient({ url });
const q = (sql, args = []) => db.execute({ sql, args });

const COLUNAS =
  "id, workspaceId, businessName, segment, services, objectives, status, source, rawContext, briefingJson, attachmentsJson, chaveDoProspect, createdAt, updatedAt";
const INSERT = `INSERT INTO ClientRequestDb (${COLUNAS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const DIA = 24 * 60 * 60 * 1000;
const agora = Date.now();

// A Camila é o caso real que gerou a pergunta do CEO: ela já estava duplicada em
// produção. Cinco briefings, mesmo e-mail, PEDIDOS DIFERENTES — porque é
// exatamente isso que a tela precisa deixar quem lê distinguir: reenvio do mesmo
// pedido ou segundo projeto legítimo.
const CAMILA = "camila@beautyclinicsp.com.br";
const briefingsDaCamila = [
  {
    diasAtras: 37,
    businessName: "Beauty Clinic — Camila Pereira",
    segment: "estética e bem-estar",
    services: ["social media"],
    objectives: ["mais agendamentos"],
    rawContext:
      "Tenho uma clínica de estética em Moema e quero começar a postar direito. Hoje eu mesma faço no celular e não tenho tempo.",
  },
  {
    diasAtras: 30,
    businessName: "Beauty Clinic — Camila Pereira",
    segment: "estética e bem-estar",
    services: ["social media", "video"],
    objectives: ["mais agendamentos", "presença no Reels"],
    rawContext:
      "Refiz o formulário porque esqueci de marcar que quero muito vídeo, principalmente Reels de antes e depois.",
  },
  {
    diasAtras: 22,
    businessName: "Beauty Clinic — Camila Pereira",
    segment: "estética e bem-estar",
    services: ["trafego pago"],
    objectives: ["captar lead para harmonização"],
    rawContext:
      "Agora é outra coisa: quero anunciar no Instagram para harmonização facial. Orçamento de mídia por volta de R$ 2.000 por mês.",
  },
  {
    diasAtras: 11,
    businessName: "Clínica Camila Pereira — unidade Pinheiros",
    segment: "estética e bem-estar",
    services: ["identidade visual"],
    objectives: ["abrir segunda unidade"],
    rawContext:
      "Vou abrir a segunda unidade em Pinheiros e preciso de identidade visual nova, porque a marca atual é de 2019.",
  },
  {
    diasAtras: 3,
    businessName: "Clínica Camila Pereira — unidade Pinheiros",
    segment: "estética e bem-estar",
    services: ["social media", "trafego pago", "identidade visual"],
    objectives: ["lançar a unidade nova"],
    rawContext:
      "Alguém me responde? Já mandei outras vezes. Quero fechar o pacote completo para o lançamento da unidade de Pinheiros em setembro.",
  },
];

const iso = (ms) => new Date(ms).toISOString();

async function main() {
  const ws = await q("SELECT id FROM AgencyWorkspace LIMIT 1");
  const workspaceId = ws.rows[0]?.id;
  if (!workspaceId) throw new Error("Nenhum workspace — rode `node scripts/seed-db.mjs` antes.");

  // Idempotente: rodar duas vezes não empilha dez briefings da Camila.
  await q("DELETE FROM ClientRequestDb WHERE source = ?", ["briefing-teste-local"]);

  for (const b of briefingsDaCamila) {
    const em = iso(agora - b.diasAtras * DIA);
    await q(INSERT, [
      randomUUID(),
      workspaceId,
      b.businessName,
      b.segment,
      JSON.stringify(b.services),
      JSON.stringify(b.objectives),
      "new",
      "briefing-teste-local",
      b.rawContext,
      // O formato CANÔNICO do contato (gate de 08/08). É daqui que `lerContato`
      // e, por consequência, a chave do prospect saem.
      JSON.stringify({ contato: { nome: "Camila Pereira", email: CAMILA, whatsapp: "11987654321" } }),
      "[]",
      `email:${CAMILA}`,
      em,
      em,
    ]);
  }

  // O contraste que o cartão precisa ter na MESMA tela: alguém SEM canal. Sem
  // chave, ele nunca é agrupado — e o cartão vermelho tem que continuar sendo o
  // mais gritante da tela, não competir com o carimbo de repetição.
  const velho = iso(agora - 51 * DIA);
  await q(INSERT, [
    randomUUID(),
    workspaceId,
    "Sushi Cazza",
    "restaurante",
    JSON.stringify(["planejamento de conteudo", "direcao visual"]),
    JSON.stringify(["encher a casa na semana"]),
    "new",
    "briefing-teste-local",
    "Somos o @sushicazzaoficial, restaurante japonês na Mooca. Precisamos de conteúdo e direção visual.",
    JSON.stringify({}),
    "[]",
    null,
    velho,
    velho,
  ]);

  const total = await q("SELECT COUNT(*) AS n FROM ClientRequestDb WHERE source = ?", ["briefing-teste-local"]);
  console.log(`✓ plantados ${total.rows[0].n} briefings de teste (5 da Camila com o mesmo e-mail + 1 sem contato)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
