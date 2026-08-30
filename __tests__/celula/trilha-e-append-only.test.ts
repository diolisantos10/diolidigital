// A TRILHA É APPEND-ONLY DE VERDADE — não só de intenção.
//
// Metade 1 (negativa): varre o CÓDIGO-FONTE de `lib/agency/celula/trilha.ts`
// por regex e falha se `update`/`updateMany`/`delete`/`deleteMany`/`upsert`
// aparecer chamado sobre `transicaoDoFunil` em qualquer lugar do arquivo — a
// trava fica em código, não em promessa de comentário.
//
// Metade 2 (positiva): `.create` existe e de fato grava — a varredura acima
// não pode estar "provando" um arquivo vazio.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

// `vi.hoisted`/`vi.mock` precisam estar no topo do módulo, junto dos
// imports — não dentro de um `describe` (o vitest hoisteia de qualquer
// jeito, mas avisa que isso vira erro em versão futura). A anotação de tipo
// (`{ prisma: null as unknown as PrismaClient }`) é o que impede a família de
// erro TS2322/TS2493 que já barrou três PRs desta casa.
const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

describe("varredura estática: nenhuma escrita mutante sobre transicaoDoFunil", () => {
  const codigoFonte = readFileSync(
    path.join(process.cwd(), "lib/agency/celula/trilha.ts"),
    "utf-8",
  );

  it("não existe .update / .updateMany / .delete / .deleteMany / .upsert sobre transicaoDoFunil", () => {
    // Casa o acesso `transicaoDoFunil.<metodo mutante>(` (com `tx.` ou
    // `prisma.` opcional na frente) em QUALQUER lugar do arquivo.
    const proibidos = /transicaoDoFunil\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/g;
    const achados = codigoFonte.match(proibidos);
    expect(achados, `métodos mutantes encontrados sobre transicaoDoFunil: ${JSON.stringify(achados)}`).toBeNull();
  });

  it("o `.create` sobre transicaoDoFunil existe no arquivo — a varredura acima não está testando um arquivo vazio", () => {
    expect(/transicaoDoFunil\s*\.\s*create\s*\(/.test(codigoFonte)).toBe(true);
  });
});

describe("a metade positiva: .create funciona de verdade contra SQLite real", () => {
  const DDL = `
CREATE TABLE "LinhaDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'encontrada',
    "entrouNoEstadoEm" DATETIME NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "LinhaDoFunil_oportunidadeId_key" ON "LinhaDoFunil"("oportunidadeId");

CREATE TABLE "TransicaoDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estadoAnterior" TEXT NOT NULL,
    "estadoNovo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

  let pasta = "";
  let arquivo = "";

  beforeEach(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-funil-append-"));
    arquivo = path.join(pasta, "funil.db");
    estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivo}` }) });
    for (const instrucao of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await estado.prisma.$executeRawUnsafe(instrucao);
    }
    vi.resetModules();
  });

  afterEach(async () => {
    await estado.prisma.$disconnect().catch(() => {});
    await rm(pasta, { recursive: true, force: true });
  });

  it("avancarFunil grava a transição via .create, e ela é lida de volta", async () => {
    const { avancarFunil, trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-append-only";

    const resultado = await avancarFunil({
      workspaceId: "ws-1",
      oportunidadeId,
      para: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "nota acima do corte",
    });

    expect(resultado.ok).toBe(true);
    const trilha = await trilhaDoFunil(oportunidadeId);
    expect(trilha).toHaveLength(1);
    expect(trilha[0].estadoNovo).toBe("qualificada");
  });
});

// Defeito 1 do despacho de 30/08: `origem: linha.origem as OrigemDaTransicao`
// era um cast cego sobre dado do banco. Hoje `trilhaDoFunil` lê com
// `origemDeclarada`, e as duas metades abaixo provam o comportamento: uma
// origem ilegível vira `null` (nunca `'sistema'`, nunca some a linha), e as 4
// origens legítimas voltam intactas.
describe("leitura de origem: corrupção vira null, nunca 'sistema', nunca some a linha", () => {
  const DDL = `
CREATE TABLE "LinhaDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'encontrada',
    "entrouNoEstadoEm" DATETIME NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "LinhaDoFunil_oportunidadeId_key" ON "LinhaDoFunil"("oportunidadeId");

CREATE TABLE "TransicaoDoFunil" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "estadoAnterior" TEXT NOT NULL,
    "estadoNovo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

  let pasta = "";
  let arquivo = "";

  beforeEach(async () => {
    pasta = await mkdtemp(path.join(tmpdir(), "dioli-funil-origem-"));
    arquivo = path.join(pasta, "funil.db");
    estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivo}` }) });
    for (const instrucao of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
      await estado.prisma.$executeRawUnsafe(instrucao);
    }
    vi.resetModules();
  });

  afterEach(async () => {
    await estado.prisma.$disconnect().catch(() => {});
    await rm(pasta, { recursive: true, force: true });
  });

  it("metade negativa: linha com origem='xpto' (corrupção simulada) volta com origem null — não 'sistema', não some", async () => {
    const { trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-origem-corrompida";

    // Gravada direto por SQL cru, simulando uma linha de versão antiga ou
    // corrompida — `avancarFunil` nunca escreveria uma origem fora das 4.
    await estado.prisma.$executeRawUnsafe(
      `INSERT INTO "TransicaoDoFunil" (id, workspaceId, oportunidadeId, estadoAnterior, estadoNovo, autor, origem, justificativa, criadoEm)
       VALUES ('t-xpto', 'ws-1', ?, 'encontrada', 'qualificada', 'radar', 'xpto', 'linha corrompida', CURRENT_TIMESTAMP)`,
      oportunidadeId,
    );

    const trilha = await trilhaDoFunil(oportunidadeId);
    expect(trilha).toHaveLength(1);
    expect(trilha[0].origem).toBeNull();
    // não é 'sistema' — ausência de informação não é informação
    expect(trilha[0].origem).not.toBe("sistema");
  });

  it("metade positiva: as 4 origens legítimas (agente, gerente, cliente, sistema) voltam intactas", async () => {
    const { trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-origens-legitimas";
    const origens = ["agente", "gerente", "cliente", "sistema"] as const;

    for (const [indice, origem] of origens.entries()) {
      await estado.prisma.$executeRawUnsafe(
        `INSERT INTO "TransicaoDoFunil" (id, workspaceId, oportunidadeId, estadoAnterior, estadoNovo, autor, origem, justificativa, criadoEm)
         VALUES (?, 'ws-1', ?, 'encontrada', 'qualificada', 'radar', ?, 'transicao legitima', datetime('now', '+${indice} seconds'))`,
        `t-legit-${indice}`,
        oportunidadeId,
        origem,
      );
    }

    const trilha = await trilhaDoFunil(oportunidadeId);
    expect(trilha).toHaveLength(4);
    expect(trilha.map((linha) => linha.origem)).toEqual(["agente", "gerente", "cliente", "sistema"]);
  });
});
