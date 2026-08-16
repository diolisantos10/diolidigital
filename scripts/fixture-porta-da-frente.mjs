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
// ── 🔴 O FIXTURE PROVAVA O DESENHO E ESCONDIA O DEFEITO (corrigido em 16/08) ─
//
// A primeira versão plantava `status: "new"` em linhas **sem contato nenhum** —
// e essa combinação **a rota pública não sabe produzir**. O gate de contato de
// 08/08 (`POST /api/brain/client-requests`) decide o status no SERVIDOR: com
// canal grava `new`, sem canal grava `lead_incompleto`. Ou seja: as nove
// capturas ficaram bonitas mostrando um estado que **produção nenhuma tem**, e
// nenhuma delas mostrava o que a fila de verdade exibe.
//
// Pior: era justamente essa combinação inventada que fazia os cartões "sem como
// falar" aparecerem numa fila que, em produção, não os continha — o defeito A1
// desta rodada, escondido pelo próprio fixture feito para exibi-lo.
//
// **A regra agora:** o status **não é digitado, é DERIVADO** do briefing, pela
// mesma pergunta que o servidor faz (existe nome e pelo menos um canal?). Um
// `status` escrito à mão que contradiga o próprio briefing **para o script**.
// Fixture que pode inventar estado impossível é fixture que valida o desenho e
// não o produto.
//
// ── A OUTRA TRAVA ─────────────────────────────────────────────────────────
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

/**
 * A MESMA pergunta que o servidor faz antes de escolher o status.
 *
 * Espelha `lerContato`/`temComoFalar` de
 * `lib/agency/comercial/contato-do-lead.ts`: nome **e** pelo menos um canal
 * (WhatsApp com 10+ dígitos, ou e-mail). Nome sozinho não é contato — era assim
 * que o desperdício de 08/08 se chamava.
 *
 * ⚠️ É uma cópia da regra, e isso é dívida declarada: este arquivo é `.mjs` e
 * não importa TypeScript. A cópia é curta e está travada pela conferência
 * abaixo, mas quem mudar a regra do contato tem de mudar aqui também.
 */
function temComoFalar(briefing) {
  const c = briefing?.contato;
  if (!c?.nome) return false;
  const zap = String(c.whatsapp ?? "").replace(/\D/g, "");
  const email = String(c.email ?? "");
  return zap.length >= 10 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** O status que a rota pública gravaria para este briefing. Não se digita. */
function statusDoServidor(l) {
  // `scope_ready` é o único status que NÃO sai do gate de contato: ele é
  // gravado depois, pela máquina (`runAutoScope`), sobre um lead que TINHA
  // contato. Por isso ele é declarado, e conferido contra o contato.
  if (l.escopoPronto) return "scope_ready";
  return temComoFalar(l.briefing) ? "new" : "lead_incompleto";
}

const linhas = [
  {
    id: "fixture_porta_vagas",
    nome: "Portal de Vagas Exemplo",
    segmento: "Plataforma de vagas",
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
    dias: 0,
    servicos: ["social media"],
    briefing: { contato: { nome: "Responsável", email: "contato@exemplo.com.br" } },
    raw: "Padaria de bairro, 12 posts por mês.",
  },
  {
    id: "fixture_porta_sem_canal_antigo",
    nome: "Restaurante Exemplo",
    segmento: "Restaurante",
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
    dias: 28,
    servicos: ["social media", "tráfego pago", "identidade visual"],
    briefing: {},
    raw: "Sou lash designer, atendo em estúdio próprio. Quero aparecer mais no Instagram.",
  },
  {
    // 🔴 O CASO QUE SUMIA. Com contato, a rota grava `new` e `runAutoScope`
    // dispara na hora; ao terminar ele grava `scope_ready`. Até 16/08 este
    // lead CAÍA FORA DA FILA em segundos: proposta pronta, ninguém falou com
    // ele, e nenhuma tela o mostrava. É o cartão mais importante da captura.
    id: "fixture_porta_escopo_pronto",
    nome: "Ótica Exemplo",
    segmento: "Óptica",
    escopoPronto: true,
    dias: 4,
    servicos: ["social media", "identidade visual"],
    briefing: { contato: { nome: "Gerência", email: "gerencia@exemplo.com.br" } },
    raw: "Óptica de bairro, queremos vender mais óculos de grau.",
  },
  {
    id: "fixture_porta_incompleto",
    nome: "Clínica Exemplo",
    segmento: "Beauty clinic",
    dias: 29,
    servicos: ["social media"],
    briefing: { recusouContato: true },
    raw: "Clínica de estética, quero muito vídeo. Prefiro não deixar contato agora.",
  },
];

// ── A CONFERÊNCIA, ANTES DE ESCREVER UMA LINHA ────────────────────────────
// Nenhuma linha do fixture pode existir num estado que a rota pública não sabe
// produzir. Sem isto, "sem contato" com `status: "new"` volta na primeira vez
// que alguém acrescentar um caso à lista.
for (const l of linhas) {
  l.status = statusDoServidor(l);
  if (l.escopoPronto && !temComoFalar(l.briefing)) {
    console.error(`✋ RECUSADO: "${l.id}" pede escopo pronto sem contato.`);
    console.error("   `runAutoScope` NÃO roda para lead sem canal — este estado não existe em produção.");
    process.exit(1);
  }
}

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
console.log(`✓ ${linhas.length} linhas fictícias na porta da frente.`);
console.log("  O status é DERIVADO do briefing, pela mesma pergunta do servidor:");
for (const row of r.rows) console.log(`   ${row.businessName} — ${row.status}`);
