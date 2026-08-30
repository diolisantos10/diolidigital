// A TRILHA DO FUNIL QUE SOBREVIVE AO DEPLOY — prova nº 8 do CEO.
//
// Mesma família de prova que `__tests__/plataforma/teto-de-ritmo-no-banco.test.ts`:
// SQLite REAL em `mkdtemp`, `PrismaLibSql`, e `reiniciarComoSeFosseDeploy()`
// fecha o cliente e abre outro sobre o MESMO arquivo — a simulação honesta de
// um deploy (processo novo, memória zerada, volume intacto). Mock do Prisma
// aqui não provaria nada: o que se afirma é sobre o comportamento do BANCO —
// atomicidade da dupla escrita e persistência através do restart.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

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
CREATE INDEX "LinhaDoFunil_workspaceId_estado_idx" ON "LinhaDoFunil"("workspaceId", "estado");

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
CREATE INDEX "TransicaoDoFunil_oportunidadeId_criadoEm_idx" ON "TransicaoDoFunil"("oportunidadeId", "criadoEm");
CREATE INDEX "TransicaoDoFunil_workspaceId_criadoEm_idx" ON "TransicaoDoFunil"("workspaceId", "criadoEm");
`;

let pasta = "";
let arquivo = "";

function abrir(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivo}` }) });
}

/** Sobe um processo novo sobre o MESMO arquivo: o que um deploy faz. */
async function reiniciarComoSeFosseDeploy() {
  await estado.prisma.$disconnect();
  vi.resetModules();
  estado.prisma = abrir();
  return import("@/lib/agency/celula/trilha");
}

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dioli-funil-"));
  arquivo = path.join(pasta, "funil.db");
  estado.prisma = abrir();
  for (const instrucao of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await estado.prisma.$executeRawUnsafe(instrucao);
  }
  vi.resetModules();
});

afterEach(async () => {
  await estado.prisma.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
});

const WORKSPACE = "ws-1";

describe("a trilha do funil sobrevive ao reinício do processo", () => {
  it("3 transições gravadas continuam lá, na ordem, com os 5 campos intactos, depois do 'deploy'", async () => {
    const { avancarFunil, trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-sobrevive";

    const r1 = await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "nota acima do corte",
    });
    expect(r1.ok).toBe(true);

    const r2 = await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "abordagem_preparada",
      autor: "radar",
      origem: "agente",
      justificativa: "mensagem gerada e aprovada",
    });
    expect(r2.ok).toBe(true);

    const r3 = await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "abordada",
      autor: "gerente@dioli.studio",
      origem: "gerente",
      justificativa: "envio confirmado na plataforma",
    });
    expect(r3.ok).toBe(true);

    // ── o deploy acontece no meio do funil ──────────────────────────────
    const depoisDoDeploy = await reiniciarComoSeFosseDeploy();

    const trilha = await depoisDoDeploy.trilhaDoFunil(oportunidadeId);
    expect(trilha).toHaveLength(3);

    expect(trilha[0]).toMatchObject({
      estadoAnterior: "encontrada",
      estadoNovo: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "nota acima do corte",
    });
    expect(trilha[1]).toMatchObject({
      estadoAnterior: "qualificada",
      estadoNovo: "abordagem_preparada",
      autor: "radar",
      origem: "agente",
      justificativa: "mensagem gerada e aprovada",
    });
    expect(trilha[2]).toMatchObject({
      estadoAnterior: "abordagem_preparada",
      estadoNovo: "abordada",
      autor: "gerente@dioli.studio",
      origem: "gerente",
      justificativa: "envio confirmado na plataforma",
    });

    // ordem cronológica: cada `criadoEm` >= o anterior
    expect(trilha[0].criadoEm.getTime()).toBeLessThanOrEqual(trilha[1].criadoEm.getTime());
    expect(trilha[1].criadoEm.getTime()).toBeLessThanOrEqual(trilha[2].criadoEm.getTime());
  });

  it("o ESTADO também sobrevive ao reinício (prova nº 8 do CEO)", async () => {
    const { avancarFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-estado-sobrevive";

    await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "nota acima do corte",
    });

    const depoisDoDeploy = await reiniciarComoSeFosseDeploy();
    const estadoLido = await depoisDoDeploy.estadoDoFunil(oportunidadeId);
    expect(estadoLido).toBe("qualificada");
  });

  it("transição inválida (par não permitido) não grava NADA — nem linha, nem trilha", async () => {
    const { avancarFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-par-invalido";

    const antesLinha = await estado.prisma.linhaDoFunil.count({ where: { oportunidadeId } });
    const antesTrilha = await estado.prisma.transicaoDoFunil.count({ where: { oportunidadeId } });

    // "encontrada" não pode ir direto para "abordada" — não está na tabela.
    const resultado = await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "abordada",
      autor: "radar",
      origem: "agente",
      justificativa: "tentativa de pular etapas",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.codigo).toBe("par_nao_permitido");

    const depoisLinha = await estado.prisma.linhaDoFunil.count({ where: { oportunidadeId } });
    const depoisTrilha = await estado.prisma.transicaoDoFunil.count({ where: { oportunidadeId } });
    expect(depoisLinha).toBe(antesLinha);
    expect(depoisTrilha).toBe(antesTrilha);
  });

  it("transição sem justificativa não grava NADA", async () => {
    const { avancarFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-sem-justificativa";

    const antesLinha = await estado.prisma.linhaDoFunil.count({ where: { oportunidadeId } });
    const antesTrilha = await estado.prisma.transicaoDoFunil.count({ where: { oportunidadeId } });

    const resultado = await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "",
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.codigo).toBe("justificativa_ausente");

    const depoisLinha = await estado.prisma.linhaDoFunil.count({ where: { oportunidadeId } });
    const depoisTrilha = await estado.prisma.transicaoDoFunil.count({ where: { oportunidadeId } });
    expect(depoisLinha).toBe(antesLinha);
    expect(depoisTrilha).toBe(antesTrilha);
  });

  it("duas transições válidas em sequência: o estadoAnterior da 2ª é o estadoNovo da 1ª", async () => {
    const { avancarFunil, trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const oportunidadeId = "opp-encadeada";

    await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "qualificada",
      autor: "radar",
      origem: "agente",
      justificativa: "primeira transição",
    });
    await avancarFunil({
      workspaceId: WORKSPACE,
      oportunidadeId,
      para: "abordagem_preparada",
      autor: "radar",
      origem: "agente",
      justificativa: "segunda transição",
    });

    const trilha = await trilhaDoFunil(oportunidadeId);
    expect(trilha).toHaveLength(2);
    expect(trilha[1].estadoAnterior).toBe(trilha[0].estadoNovo);
  });

  it("oportunidade nunca tocada lê 'encontrada'", async () => {
    const { estadoDoFunil } = await import("@/lib/agency/celula/trilha");
    expect(await estadoDoFunil("opp-nunca-tocada")).toBe("encontrada");
  });
});
