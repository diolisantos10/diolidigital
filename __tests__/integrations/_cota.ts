// Ajuda de teste: a COTA POR PONTUAÇÃO da Marketing API num SQLite de mentira
// — mas SQLite de verdade (libsql em memória), criado a partir do arquivo de
// migration real.
//
// Existe porque a cota é FAIL-CLOSED: sem banco, a casa recusa a chamada. Todo
// teste que exercita o caminho de anúncios precisa de um banco, ou vai medir a
// recusa em vez do comportamento.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { configurarCota, type BancoDaCota } from "@/lib/integrations/meta/cota-de-anuncios";

const MIGRATION = path.join(
  process.cwd(), "prisma", "migrations",
  "20260806120000_cota_por_pontuacao_da_marketing_api", "migration.sql",
);

export function bancoDaCotaEmMemoria(c: Client): BancoDaCota {
  return {
    executar: async (sql, params) => (await c.execute({ sql, args: params as never[] })).rowsAffected,
    consultar: async <T>(sql: string, params: unknown[]) =>
      (await c.execute({ sql, args: params as never[] })).rows as unknown as T[],
  };
}

/** Sobe o banco da cota e o instala. Devolve o cliente para quem quiser espiar. */
export async function subirCotaDeTeste(agora: () => number): Promise<Client> {
  const c = createClient({ url: ":memory:" });
  const sql = readFileSync(MIGRATION, "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const comando of sql.split(";")) {
    const limpo = comando.trim();
    if (limpo) await c.execute(limpo);
  }
  configurarCota({ agora, banco: bancoDaCotaEmMemoria(c) });
  return c;
}
