// Plain Node.js seed — no TypeScript, no tsx, no build tools.
// Uses only production dependencies: @libsql/client + bcryptjs.
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";

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

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;

const db = createClient({ url });

async function q(sql, args = []) {
  return db.execute({ sql, args });
}

async function main() {
  console.log("🌱 Seeding Dioli Agency OS…");

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
  const masterPw = exigirSenha("SEED_MASTER_PASSWORD");
  const staffPw  = exigirSenha("SEED_STAFF_PASSWORD");
  const masterHash = await hash(masterPw, 12);
  const staffHash  = await hash(staffPw,  12);

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
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.close());
