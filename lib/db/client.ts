// Prisma client singleton — Prisma 7 requires an adapter or accelerateUrl.
// We use @prisma/adapter-libsql with local file-based SQLite.
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // libsql expects absolute "file:" paths
  const url = dbUrl.startsWith("file:./")
    ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
    : dbUrl;
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// ⚠️ O CACHE VALE EM PRODUÇÃO TAMBÉM — e isso é o conserto.
//
// O padrão que se copia de todo tutorial ("só cacheia fora de produção") existe
// para um motivo específico: em desenvolvimento o hot-reload reexecuta o módulo
// e criaria um cliente novo a cada salvamento. Em produção, o pressuposto é que
// o módulo é avaliado UMA vez.
//
// Aqui esse pressuposto não vale. O Next empacota rotas em bundles separados;
// contextos diferentes podem avaliar este módulo de novo, e cada avaliação
// abria mais uma conexão libsql para o MESMO arquivo SQLite. O SQLite tem UM
// lock de escrita para o banco inteiro: mais clientes não é mais paralelismo, é
// mais gente disputando o mesmo lock — o mesmo lock que já produziu
// "database is locked" no deploy e obrigou o `start.sh` a ter retry.
//
// Guardar no `globalThis` sempre custa nada e remove a disputa que a própria
// aplicação criava contra si mesma.
globalForPrisma.prisma = prisma;
