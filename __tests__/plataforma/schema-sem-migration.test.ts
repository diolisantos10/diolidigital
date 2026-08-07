// TODA TABELA DO SCHEMA TEM DE EXISTIR EM PRODUÇÃO — e quem cria é migration.
//
// ── O INCIDENTE QUE PRODUZIU ESTE TESTE (07/08/2026) ────────────────────────
//
// A feature do Google Drive do cliente subiu em 07/08 (commit d0985b6) com
// `GoogleDriveConnection` e `DriveMaterial` em `prisma/schema.prisma` e **sem
// nenhuma migration**. Em desenvolvimento ninguém percebe: o comando da casa é
// `prisma db push`, que aplica o schema direto. Em PRODUÇÃO, `scripts/start.sh`
// recusa `db push` de propósito e aplica esquema só por `migrate deploy` — então
// as duas tabelas simplesmente não existiam no volume.
//
// O que o CEO viu, com o Drive da Foocci na tela: o popup dizia "Drive
// conectado" e o cartão do portal, no mesmo instante, dizia "Drive não
// conectado.". Depois do F5 não sobrava nada, e o botão "Escolher arquivos"
// nunca aparecia. Toda a frente do Drive esteve morta desde o primeiro minuto,
// para todos os clientes, e nada no repositório denunciava isso.
//
// ── POR QUE O TESTE, E NÃO UM AVISO NO README ──────────────────────────────
//
// Regra da casa: trava, não aviso. "Lembre de gerar a migration" é sugestão, e
// foi exatamente essa sugestão que falhou. Um `db push` local deixa o
// desenvolvedor com tudo verde e a produção sem a tabela — a falha só aparece
// no cliente, em silêncio, porque toda leitura do Prisma nesta casa está
// embrulhada em `.catch(() => null)` para não derrubar a página.
//
// Este teste é barato, é puro (lê arquivos) e fecha a classe inteira.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const RAIZ = resolve(__dirname, "../..");

/** Os modelos declarados no schema — o que a aplicação ACHA que existe. */
function modelosDoSchema(): string[] {
  const schema = readFileSync(resolve(RAIZ, "prisma/schema.prisma"), "utf8");
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

/** As tabelas que as migrations CRIAM — o que vai existir em produção.
 *  É esta lista, e não o schema, que descreve o banco do cliente. */
function tabelasCriadasPorMigration(): Set<string> {
  const dir = resolve(RAIZ, "prisma/migrations");
  const sql = readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, "migration.sql")))
    .map((n) => readFileSync(join(dir, n, "migration.sql"), "utf8"))
    .join("\n");
  return new Set(
    [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?/gi)].map((m) => m[1]!),
  );
}

describe("⛔ nenhum modelo do schema fica sem migration que o crie", () => {
  it("toda tabela que o código consulta é criada por alguma migration", () => {
    const criadas = tabelasCriadasPorMigration();
    const semMigration = modelosDoSchema().filter((m) => !criadas.has(m));

    expect(
      semMigration,
      semMigration.length === 0
        ? ""
        : `Estes modelos existem em prisma/schema.prisma e NENHUMA migration os cria:\n` +
          semMigration.map((m) => `  · ${m}`).join("\n") +
          `\n\nEm produção eles NÃO VÃO EXISTIR: scripts/start.sh aplica esquema só por\n` +
          `\`prisma migrate deploy\`, nunca \`db push\`. Toda consulta a eles vai lançar,\n` +
          `os \`.catch(() => null)\` da casa vão engolir, e a feature morre em silêncio —\n` +
          `foi exatamente isso que aconteceu com o Google Drive em 07/08/2026.\n\n` +
          `Conserto: \`npx prisma migrate diff --from-migrations prisma/migrations \\\n` +
          `  --to-schema prisma/schema.prisma --script\` e guarde o CREATE TABLE em\n` +
          `prisma/migrations/<timestamp>_<nome>/migration.sql.`,
    ).toEqual([]);
  });

  it("✅ a metade que não pode virar 'reprova sempre': o schema tem modelos e eles são achados", () => {
    // Sem esta metade, um regex quebrado devolveria lista vazia dos dois lados e
    // o teste passaria eternamente sem conferir nada.
    const modelos = modelosDoSchema();
    const criadas = tabelasCriadasPorMigration();
    expect(modelos.length).toBeGreaterThan(20);
    expect(criadas.size).toBeGreaterThan(20);
    // E as duas tabelas do incidente estão, agora, entre as criadas.
    expect(criadas.has("GoogleDriveConnection")).toBe(true);
    expect(criadas.has("DriveMaterial")).toBe(true);
  });
});
