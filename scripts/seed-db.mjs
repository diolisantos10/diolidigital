// Plain Node.js seed — no TypeScript, no tsx, no build tools.
// Uses only production dependencies: @libsql/client + bcryptjs.
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Carrega o `.env` do repositório, se houver — leitura pura, nenhum I/O de
 * escrita.
 *
 * Por que existe: a receita de boot do CLAUDE.md monta um `.env` e chama
 * `node scripts/seed-db.mjs`. O Prisma lê `.env` sozinho; o Node **não**. Sem
 * esta linha, tudo o que a receita escreve no `.env` é invisível para o seed —
 * era metade do motivo de a receita não funcionar.
 *
 * ⚠️ `process.loadEnvFile` NÃO sobrescreve variável que já está no ambiente
 * (verificado em 29/08/2026, Node 22). A ordem de precedência continua sendo a
 * certa: ambiente explícito > `.env`. Em produção não há `.env` no container,
 * então isto é no-op.
 */
function carregarEnvLocal() {
  const arquivo = join(process.cwd(), ".env");
  if (!existsSync(arquivo)) return;
  try {
    process.loadEnvFile(arquivo);
  } catch {
    // `.env` malformado não pode derrubar o boot de produção. Quem manda em
    // produção é o ambiente do painel, não um arquivo que nem deveria existir lá.
  }
}

/**
 * Lê uma senha do ambiente ou PARA a execução.
 *
 * Ausência de chave nunca vira porta aberta: sem a variável não há senha
 * padrão, nem senha inventada, nem "segue mesmo assim". O erro diz o NOME da
 * variável — nunca o valor de nenhuma delas, porque log é lido, copiado e
 * colado.
 */
function exigirSenha(nomeDaVariavel) {
  const valor = process.env[nomeDaVariavel];

  // A PARADA é só por AUSÊNCIA. Ausência de chave nunca vira porta aberta.
  if (!valor) {
    throw new Error(
      `${nomeDaVariavel} não está definida. O seed NÃO inventa senha e NÃO cai ` +
        `num padrão. Defina a variável no painel da hospedagem e reinicie. ` +
        `ATENÇÃO: esta casa NÃO tem fluxo de "esqueci minha senha" — a ` +
        `variável é a única via de recuperação.`,
    );
  }

  // Senha CURTA é outro assunto, e vira aviso, não parada.
  //
  // ⚠️ Isto é deliberado. Um mínimo de comprimento imposto aqui derrubaria o
  // seed de uma produção que hoje sobe bem, por uma política que ninguém
  // conferiu contra o valor vivo — e o efeito seria a conta do dono parar de
  // ser rotacionada em silêncio. Recusar-se a subir por causa de uma senha
  // que JÁ está em uso é trocar um risco por um pior.
  if (valor.length < 12) {
    console.warn(`⚠ ${nomeDaVariavel} tem menos de 12 caracteres — troque por uma mais longa no painel.`);
  }

  return valor;
}

/** Recusa que o usuário provocou e sabe consertar: sai sem despejar stack. */
class RecusaLimpa extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "RecusaLimpa";
    this.recusaLimpa = true;
  }
}

/**
 * ⛔ NADA DE I/O ANTES DAQUI. Esta função é a PRIMEIRA coisa que main() chama.
 *
 * Em 29/08/2026 mediu-se ao vivo: rodando o seed sem as duas variáveis, ele
 * apagava 8 linhas (3 Deliverable, 1 MaterialRequest, 1 Project, 1 BrandBrain,
 * 1 User, 1 Client), inseria o workspace, e SÓ ENTÃO parava por falta de senha.
 * Quem seguia a receita do CLAUDE.md — que também não citava as variáveis —
 * terminava PIOR do que começou: sem seed e sem o que tinha.
 *
 * A regra que saiu dali: recusar ANTES de destruir é o piso, não o extra.
 * Toda conferência de pré-requisito mora aqui, e aqui é antes da primeira
 * escrita. Se você precisar de uma variável nova no seed, ela entra NESTA
 * lista — não num `process.env.X` solto lá embaixo.
 *
 * Junta TODAS as ausências numa mensagem só. Uma por vez faria o dev definir
 * a primeira, rodar de novo e descobrir a segunda — duas idas para um problema.
 */
function conferirCredenciais(ambiente = process.env) {
  const OBRIGATORIAS = ["SEED_MASTER_PASSWORD", "SEED_STAFF_PASSWORD"];
  const faltantes = OBRIGATORIAS.filter((nome) => !ambiente[nome]);

  if (faltantes.length > 0) {
    // A mensagem diz o NOME da variável e COMO defini-la. Nunca o valor de
    // nenhuma — log é lido, copiado e colado.
    const linhas = [
      "",
      `✗ O seed foi RECUSADO — falta ${faltantes.length === 1 ? "1 variável" : `${faltantes.length} variáveis`} de ambiente:`,
      ...faltantes.map((nome) => `    • ${nome}`),
      "",
      "  NADA foi escrito e NADA foi apagado. O banco está exatamente como estava.",
      "",
      "  Para rodar LOCALMENTE (senhas descartáveis, de desenvolvimento):",
      ...faltantes.map((nome) => `    echo '${nome}=dev-${nome.toLowerCase().replace(/_/g, "-")}-local-only' >> .env`),
      "",
      "  Em PRODUÇÃO: defina no painel da hospedagem (Railway → Variables) e",
      "  reimplante. ATENÇÃO: esta casa NÃO tem fluxo de \"esqueci minha senha\" —",
      "  a variável é a única via de recuperação.",
      "",
    ];
    throw new RecusaLimpa(linhas.join("\n"));
  }

  // Passou pela conferência agregada; `exigirSenha` continua sendo a trava de
  // última instância (e é quem avisa sobre senha curta).
  return {
    masterPw: exigirSenha("SEED_MASTER_PASSWORD"),
    staffPw: exigirSenha("SEED_STAFF_PASSWORD"),
  };
}

carregarEnvLocal();

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;

// ⚠️ LAZY DE PROPÓSITO. `createClient` com uma URL `file:` CRIA o arquivo.
// Abrir a conexão no topo do módulo faria uma recusa por falta de credencial
// deixar um dev.db vazio para trás — pequeno, mas ainda é o disco mudando numa
// execução que não devia ter tocado em nada.
let db = null;

function abrirBanco() {
  if (!db) db = createClient({ url });
  return db;
}

async function q(sql, args = []) {
  return abrirBanco().execute({ sql, args });
}

/**
 * Conferência de SCHEMA — leitura pura, também antes da primeira escrita.
 *
 * Sem isto, um banco sem `prisma db push` morre no primeiro `DELETE FROM
 * Deliverable` com "no such table", que é um erro sobre o SQL e não sobre o
 * que o usuário esqueceu de fazer.
 */
async function conferirSchema() {
  const alvo = await abrirBanco().execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='User'`,
  );
  if (alvo.rows.length === 0) {
    throw new RecusaLimpa(
      [
        "",
        "✗ O seed foi RECUSADO — o banco não tem as tabelas da aplicação.",
        `    DATABASE_URL: ${url}`,
        "",
        "  NADA foi escrito e NADA foi apagado.",
        "",
        "  Provisione o schema antes:",
        "    npx prisma db push",
        "",
      ].join("\n"),
    );
  }
}

async function main() {
  console.log("🌱 Seeding Dioli Agency OS…");

  // ── PRÉ-REQUISITOS — tudo o que pode recusar, recusa AQUI ─────────────────
  // Antes de qualquer DELETE, INSERT ou UPDATE. Não mova nada daqui para baixo.
  const { masterPw, staffPw } = conferirCredenciais();
  await conferirSchema();

  // O hash também vem antes: é a última etapa que ainda pode falhar sem que o
  // disco tenha mudado.
  const masterHash = await hash(masterPw, 12);
  const staffHash = await hash(staffPw, 12);
  // ── A PARTIR DAQUI O DISCO MUDA ───────────────────────────────────────────

  const wsId = "cmpyzf1nw0000nq7dz5ij66aa";

  // ── Remove demo data from previous seed versions ──────────────────────────
  // These IDs were seeded in early versions and must not appear in production.
  await q(`DELETE FROM Deliverable WHERE id IN ('d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12')`);
  await q(`DELETE FROM MaterialRequest WHERE id = 'mr1'`);
  await q(`DELETE FROM Project WHERE id = 'p7'`);
  await q(`DELETE FROM BrandBrain WHERE id = 'bb_c4'`);
  await q(`DELETE FROM User WHERE id = 'u_client01'`);
  await q(`DELETE FROM Client WHERE id = 'c4'`);
  console.log("✓ Demo data removed");

  // AgencyWorkspace
  await q(`INSERT OR IGNORE INTO AgencyWorkspace (id, name, slug, createdAt)
    VALUES (?, 'Dioli Agência', 'dioli-agency', datetime('now'))`, [wsId]);
  console.log("✓ Workspace");

  // Users (staff only — no demo clients)
  //
  // SEGURANÇA — FAIL-CLOSED. A senha NUNCA é constante commitada, e desde
  // 26/08/2026 também não é mais ALEATÓRIA POR BOOT. O fallback aleatório
  // parecia seguro e escondia dois defeitos:
  //   1. numa base nova ele criava um master que existe e ninguém consegue
  //      usar — e esta casa não tem fluxo de "esqueci minha senha"
  //      (app/api/auth/ só tem signin, signout e o Google do briefing);
  //   2. ele transformava "a variável sumiu" num aviso no log, e log ninguém
  //      lê. Agora vira uma PARADA com motivo.
  //
  // Boot de produção não fica refém disso: start.sh chama este seed com
  // `|| echo` — a falha é dita alto e o app sobe do mesmo jeito, com a base
  // que já existe. O que não acontece mais é a base nascer com credencial
  // que ninguém controla.
  //
  // As senhas já foram exigidas e hasheadas no TOPO de main(), antes do
  // primeiro DELETE — ver `conferirCredenciais`.

  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('cmpyzf27d0001nq7dt0331v31','master@dioli.studio','Dioli Master',?,'master',?, datetime('now'), datetime('now'))`, [masterHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_pm01','pm@dioli.studio','PM Agência',?,'project_manager',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_social01','social@dioli.studio','Social Staff',?,'social_staff',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_design01','design@dioli.studio','Design Staff',?,'design_staff',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);

  // ROTAÇÃO: a conta que já existe passa a valer a senha do ambiente. É o que
  // mantém a senha viva do master igual a SEED_MASTER_PASSWORD a cada boot —
  // e é por isso que a senha antiga que estava no código não vale mais nada.
  await q(`UPDATE User SET passwordHash = ? WHERE email = 'master@dioli.studio'`, [masterHash]);
  await q(`UPDATE User SET passwordHash = ? WHERE email IN ('pm@dioli.studio','social@dioli.studio','design@dioli.studio')`, [staffHash]);
  console.log("✓ Users seeded (master@dioli.studio)");

  console.log("\n✅ Seed complete — sistema limpo, sem dados demo.");
  console.log("   Login:  master@dioli.studio");
}

main()
  .catch((e) => {
    // Recusa por pré-requisito é erro do OPERADOR, não defeito do programa: ele
    // precisa ler o que fazer, não uma stack. Stack de 12 linhas empurra a
    // instrução para fora da tela e o dev conclui "quebrou" em vez de "faltou".
    if (e instanceof RecusaLimpa || e?.recusaLimpa) {
      console.error(e.message);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    // `db` é null quando a recusa veio antes de abrir a conexão.
    if (db) db.close();
  });
