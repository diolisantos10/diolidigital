// A RODADA DO GERENTE GERAL EM BANCO DE VERDADE.
//
// O laço puro já está provado em `laco.test.ts`. O que este arquivo prova é a
// outra metade — a que só aparece com banco: o atraso VIRA LINHA COM DONO na
// tabela que a Central lê, a segunda rodada não duplica nada, o projeto que
// volta ao prazo tem o bloqueio resolvido, e o aviso ao cliente entra na fila
// uma vez por dia — nunca a cada batida de relógio.
//
// Banco SQLite descartável, caminho único por processo, massa 100% sintética
// (cliente "NOME TESTE", contato `.invalid`). Nenhum dado real é tocado.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { caminhoDeBancoDescartavel, limparArquivosDoBanco } from "../v2/_infra/banco-descartavel";

const CAMINHO_DB = caminhoDeBancoDescartavel("gg-rodada");
let db: PrismaClient;

// `rodada.ts` fala com o singleton da casa. Aqui ele aponta para o banco
// descartável — é o que permite provar a GRAVAÇÃO sem mock de Prisma, que
// provaria só que o mock foi chamado.
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return db;
  },
}));

let rodadaDoGerenteGeral: typeof import("@/lib/agency/gerencia/rodada").rodadaDoGerenteGeral;

const AGORA = new Date("2026-08-25T12:00:00Z");
const h = (n: number) => new Date(AGORA.getTime() - n * 3_600_000);

beforeAll(async () => {
  limparArquivosDoBanco(CAMINHO_DB);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
  db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${CAMINHO_DB}` }) });
  ({ rodadaDoGerenteGeral } = await import("@/lib/agency/gerencia/rodada"));

  await db.agencyWorkspace.create({ data: { id: "ws", name: "NOME TESTE", slug: "nome-teste" } });
  await db.client.create({
    data: { id: "cli", workspaceId: "ws", name: "NOME TESTE", email: "nome.teste@exemplo.invalid" },
  });
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  limparArquivosDoBanco(CAMINHO_DB);
});

async function projeto(id: string, dados: { estado?: string; horas: number; deadline?: string | null }) {
  await db.project.create({
    data: {
      id,
      workspaceId: "ws",
      clientId: "cli",
      name: `Projeto ${id}`,
      stage: "production",
      estadoCanonico: dados.estado ?? "production",
      deadline: dados.deadline ?? null,
      tasks: { create: { title: "t", agentId: "a2", status: "in_progress" } }, // a2 = design
    },
  });
  // `updatedAt` é @updatedAt: só um UPDATE cru envelhece o projeto.
  await db.$executeRawUnsafe(`UPDATE "Project" SET "updatedAt" = ? WHERE id = ?`, h(dados.horas), id);
}

describe("a rodada do Gerente Geral grava o que o laço julgou", () => {
  it("⛔ projeto atrasado vira BLOQUEIO COM DONO — não linha de log", async () => {
    await projeto("p_atrasado", { horas: 200 }); // production tem SLA de 72h
    const r = await rodadaDoGerenteGeral(AGORA);

    expect(r.atrasados).toBe(1);
    expect(r.bloqueiosAbertos).toBe(1);

    const b = await db.bloqueioV2.findFirstOrThrow({ where: { entidadeId: "p_atrasado" } });
    expect(b.donoFuncaoId).toBe("manager-design"); // a bola é do GERENTE do departamento
    expect(b.escalonadoPara).toBe("gerente-geral");
    expect(b.acaoRecomendada).toContain("manager-design");
    expect(b.resolvidoEm).toBeNull();
  });

  it("a SEGUNDA rodada não duplica o bloqueio — alarme repetido é como o alarme morre", async () => {
    const r = await rodadaDoGerenteGeral(AGORA);
    expect(r.bloqueiosAbertos).toBe(0);
    expect(await db.bloqueioV2.count({ where: { entidadeId: "p_atrasado", resolvidoEm: null } })).toBe(1);
  });

  it("projeto que volta ao prazo tem o bloqueio RESOLVIDO — coluna que ninguém atualiza mente", async () => {
    await db.$executeRawUnsafe(`UPDATE "Project" SET "updatedAt" = ? WHERE id = ?`, h(1), "p_atrasado");
    const r = await rodadaDoGerenteGeral(AGORA);
    expect(r.bloqueiosResolvidos).toBe(1);
    expect(await db.bloqueioV2.count({ where: { entidadeId: "p_atrasado", resolvidoEm: null } })).toBe(0);
  });

  it("⛔ prazo PROMETIDO queimado enfileira a fala do Gerente Geral — coluna gravada não é cliente informado", async () => {
    await projeto("p_prometido", { horas: 2, deadline: h(30).toISOString() });
    const r = await rodadaDoGerenteGeral(AGORA);
    expect(r.avisosEnfileirados).toBe(1);

    const efeito = await db.outboxV2.findFirstOrThrow({ where: { correlationId: "gg-atraso:p_prometido" } });
    expect(efeito.tipo).toBe("mensagem_ao_cliente");
    expect(efeito.status).toBe("pending");
    const carga = JSON.parse(efeito.payload) as { clienteId: string; autorNome: string; corpo: string };
    expect(carga.clienteId).toBe("cli");
    expect(carga.autorNome).toBe("Gerente de projeto"); // a voz única
    expect(carga.corpo).toContain("antes de você perguntar");
  });

  it("a batida seguinte NÃO reenfileira o mesmo aviso — a idempotência mora no banco", async () => {
    const r = await rodadaDoGerenteGeral(AGORA);
    expect(r.avisosEnfileirados).toBe(0);
    expect(await db.outboxV2.count({ where: { correlationId: "gg-atraso:p_prometido" } })).toBe(1);
  });

  it("projeto sem tarefa com agente conhecido é SEM DONO, e a bola volta ao Gerente Geral", async () => {
    await db.project.create({
      data: { id: "p_orfao", workspaceId: "ws", clientId: "cli", name: "Projeto órfão", stage: "production", estadoCanonico: "production" },
    });
    await db.$executeRawUnsafe(`UPDATE "Project" SET "updatedAt" = ? WHERE id = ?`, h(50), "p_orfao");
    await rodadaDoGerenteGeral(AGORA);
    const b = await db.bloqueioV2.findFirstOrThrow({ where: { entidadeId: "p_orfao" } });
    expect(b.donoFuncaoId).toBe("gerente-geral");
    expect(b.acaoRecomendada).toContain("sem ninguém responsável");
  });
});
