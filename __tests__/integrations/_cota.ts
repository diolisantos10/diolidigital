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
import { configurarRitmoNoBanco } from "@/lib/integrations/meta/ritmo-no-banco";
import { configurarCacheNoBanco } from "@/lib/integrations/meta/cache-no-banco";

/** As migrations que criam as tabelas de ritmo/cota/cache da Meta. Ler o
 *  ARQUIVO REAL (e não um CREATE TABLE copiado no teste) é o que garante que o
 *  teste falha quando o schema de produção muda. */
const MIGRATIONS = [
  "20260806120000_cota_por_pontuacao_da_marketing_api",
  "20260806170000_ritmo_e_cache_da_meta_no_banco",
].map((d) => path.join(process.cwd(), "prisma", "migrations", d, "migration.sql"));

export function bancoDaCotaEmMemoria(c: Client): BancoDaCota {
  return {
    executar: async (sql, params) => (await c.execute({ sql, args: params as never[] })).rowsAffected,
    consultar: async <T>(sql: string, params: unknown[]) =>
      (await c.execute({ sql, args: params as never[] })).rows as unknown as T[],
  };
}

/**
 * Sobe o banco de ritmo/cota/cache e o instala nos três módulos que contam no
 * volume. Devolve o cliente para quem quiser espiar.
 *
 * É UM banco só de propósito: em produção também é um só, e teste com dois
 * bancos esconderia o dia em que um módulo passa a escrever onde o outro não lê.
 */
export async function subirCotaDeTeste(agora: () => number): Promise<Client> {
  const c = createClient({ url: ":memory:" });
  for (const arquivo of MIGRATIONS) {
    const sql = readFileSync(arquivo, "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const comando of sql.split(";")) {
      const limpo = comando.trim();
      if (limpo) await c.execute(limpo);
    }
  }
  const banco = bancoDaCotaEmMemoria(c);
  configurarCota({ agora, banco });
  configurarRitmoNoBanco({ agora, banco });
  configurarCacheNoBanco({ agora });
  return c;
}

/** Desfaz o que `subirCotaDeTeste` instalou. Chame no `afterEach`: contador que
 *  sobrevive ao teste contamina o próximo. */
export function baixarCotaDeTeste(): void {
  configurarCota();
  configurarRitmoNoBanco();
  configurarCacheNoBanco();
}
