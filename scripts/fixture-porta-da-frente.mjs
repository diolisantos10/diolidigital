// A FILA DA PORTA DA FRENTE, EM DADO FICTÍCIO — só para captura de tela local.
//
// ── POR QUE ESTE ARQUIVO EXISTE (16/08/2026) ──────────────────────────────
//
// As primeiras capturas de `/agency/leads` foram tiradas com os NOMES REAIS dos
// três interessados medidos em produção em 08/08. Nome de pessoa e de negócio
// real dentro de um PNG commitado é PII que **nenhum grep encontra depois**: não
// sai numa varredura de texto, não sai num `git grep`, e quem for procurar por
// ela em cinco meses não vai achar. Texto a gente conserta; imagem a gente
// reescreve o histórico.
//
// Daqui em diante a captura sai deste fixture. **Todos os nomes são inventados.**
// O que a captura precisa provar não é quem são as pessoas — é a DISTINÇÃO:
//
//   • quem deixou canal e ninguém respondeu (cobra a casa)   → 6 dias
//   • quem entrou hoje e ainda não é desleixo                → 0 dias
//   • quem NÃO deixou canal, com pista no texto              → 51 e 28 dias
//   • quem recusou deixar contato no fim do briefing         → 29 dias
//
// Os DIAS são os mesmos dos casos reais de propósito: eles são a prova de que a
// tela separa as duas filas e de que o mais antigo sobe. A identidade não prova
// nada e custa caro.
//
// ── A TRAVA ───────────────────────────────────────────────────────────────
//
// Este script ESCREVE no banco. Ele se recusa a rodar contra qualquer coisa que
// não seja um arquivo SQLite local — dado de mentira entrando na base de um
// cliente pagante é o pior desfecho possível deste arquivo, e aviso em cabeçalho
// não barra ninguém.
//
// Uso:  node scripts/fixture-porta-da-frente.mjs

import { createClient } from "@libsql/client";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";

// Trava, não aviso. `file:` é banco em disco local; qualquer outra coisa
// (libsql://, http://, turso) é banco de verdade de alguém.
if (!dbUrl.startsWith("file:")) {
  console.error(`✋ RECUSADO: DATABASE_URL não é um arquivo local (${dbUrl.split(":")[0]}:…).`);
  console.error("   Este script semeia dado FICTÍCIO e só roda contra SQLite local.");
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

// O mesmo workspace de `scripts/seed-db.mjs`. Sem ele, a fila é lida por um
// workspace que não existe e a tela mostra zero com o banco cheio.
const ws = "cmpyzf1nw0000nq7dz5ij66aa";
const DIA = 86_400_000;
const agora = Date.now();

const linhas = [
  {
    id: "fixture_porta_vagas",
    nome: "Portal de Vagas Exemplo",
    segmento: "Plataforma de vagas",
    status: "new",
    dias: 6,
    servicos: ["social media", "tráfego pago"],
    // Telefone deliberadamente impossível (11 9 0000-0000): tem os 10 dígitos
    // que o leitor de contato exige e não pertence a ninguém.
    briefing: { contato: { nome: "Equipe do Portal", whatsapp: "11900000000" } },
    raw: "Plataforma de vagas regional. Precisamos de conteúdo diário e campanha de captação de candidatos.",
  },
  {
    id: "fixture_porta_hoje",
    nome: "Padaria Exemplo",
    segmento: "Alimentação",
    status: "new",
    dias: 0,
    servicos: ["social media"],
    briefing: { contato: { nome: "Responsável", email: "contato@exemplo.com.br" } },
    raw: "Padaria de bairro, 12 posts por mês.",
  },
  {
    id: "fixture_porta_sem_canal_antigo",
    nome: "Restaurante Exemplo",
    segmento: "Restaurante",
    status: "new",
    dias: 51,
    servicos: ["planejamento de conteúdo", "direção visual", "estratégia"],
    briefing: {},
    // A arroba entra para provar que PISTA não vira CONTATO na tela. O handle é
    // inventado e não existe.
    raw: "Somos um restaurante japonês. Nosso perfil é @restaurante.exemplo e queremos crescer.",
  },
  {
    id: "fixture_porta_sem_canal",
    nome: "Estúdio de Lash Exemplo",
    segmento: "Lash designer",
    status: "new",
    dias: 28,
    servicos: ["social media", "tráfego pago", "identidade visual"],
    briefing: {},
    raw: "Sou lash designer, atendo em estúdio próprio. Quero aparecer mais no Instagram.",
  },
  {
    id: "fixture_porta_incompleto",
    nome: "Clínica Exemplo",
    segmento: "Beauty clinic",
    status: "lead_incompleto",
    dias: 29,
    servicos: ["social media"],
    briefing: { recusouContato: true },
    raw: "Clínica de estética, quero muito vídeo. Prefiro não deixar contato agora.",
  },
];

for (const l of linhas) {
  const t = new Date(agora - l.dias * DIA).toISOString();
  await db.execute({
    sql: `INSERT OR REPLACE INTO ClientRequestDb
      (id, workspaceId, businessName, segment, services, objectives, status, source,
       rawContext, briefingJson, attachmentsJson, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      l.id, ws, l.nome, l.segmento, JSON.stringify(l.servicos), JSON.stringify([]),
      l.status, "briefing", l.raw, JSON.stringify(l.briefing), "[]", t, t,
    ],
  });
}

const r = await db.execute(`SELECT id, businessName, status FROM ClientRequestDb ORDER BY createdAt`);
console.log(`✓ ${linhas.length} linhas fictícias na porta da frente:`);
for (const row of r.rows) console.log(`   ${row.businessName} — ${row.status}`);
