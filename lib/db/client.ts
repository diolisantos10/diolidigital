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

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
