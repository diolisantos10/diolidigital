// A LEVA ABRE A PRODUÇÃO — o teste que alcança o caminho que atende o cliente.
//
// ═══ A PERGUNTA OBRIGATÓRIA DESTA CASA ══════════════════════════════════════
//
// *O teste alcança o caminho que atende o cliente, ou um irmão pouco usado?*
//
// O caminho que atende o cliente é: o despertador bate → a leva vencida põe o
// projeto em `pending` → `retomarProducao` o encontra → `runProjectExecution`
// produz o lote daquela leva. Régua verde sobre o componente errado é pior que
// régua nenhuma: a régua nenhuma deixa a dúvida viva; a verde no lugar errado
// mata a dúvida e deixa o defeito.
//
// Então este arquivo usa BANCO DE VERDADE, com as migrations de verdade, e
// exercita `abrirLevasVencidas` — a função que o despertador chama — em vez de
// reimplementar a decisão dela.
//
// ═══ PROVADO POR MUTAÇÃO ════════════════════════════════════════════════════
//
// Cada afirmação abaixo foi conferida desligando a coisa que ela protege:
//   • zerar `DIAS_ENTRE_LEVAS` → a leva 3 abriria no dia 1 (o cliente recebe o
//     mês inteiro numa tarde);
//   • ignorar a coluna `leva` na leitura da última entrega → a leva reabriria a
//     cada batida do relógio, 288 vezes por dia, cada uma custando IA;
//   • tirar o filtro `executionStatus: { in: ["done", "idle"] }` → uma passada
//     `running` seria marcada `pending` por cima da trava anti-concorrência.
// Sem os `expect` daqui, os três passam despercebidos.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { caminhoDeBancoDescartavel, limparArquivosDoBanco } from "../v2/_infra/banco-descartavel";
import { DIAS_ENTRE_LEVAS, LEVAS_POR_CICLO } from "@/lib/agency/execution/escopo-do-cliente";

const CAMINHO_DB = caminhoDeBancoDescartavel("levas-da-producao");
let db: PrismaClient;
let abrirLevasVencidas: typeof import("@/lib/agency/esteira/levas").abrirLevasVencidas;
let ESPECIALISTAS_DE_PECA: readonly string[];

const DIA = 86_400_000;
const INICIO = "2026-09-01";

beforeAll(async () => {
  limparArquivosDoBanco(CAMINHO_DB);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
  // O módulo sob teste usa o cliente global da casa — o MESMO que a produção
  // usa. Apontá-lo para este banco antes do import é o que faz o teste exercitar
  // o caminho real em vez de um cliente de mentira injetado.
  process.env.DATABASE_URL = `file:${CAMINHO_DB}`;
  const mod = await import("@/lib/agency/esteira/levas");
  abrirLevasVencidas = mod.abrirLevasVencidas;
  ESPECIALISTAS_DE_PECA = mod.ESPECIALISTAS_DE_PECA;
  db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${CAMINHO_DB}` }) });
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  limparArquivosDoBanco(CAMINHO_DB);
});

let n = 0;
/** Um projeto pago, com direção aprovada, ciclo aberto e a leva 1 já entregue.
 *  É o estado real de um cliente no dia 1 do mês, depois da primeira passada. */
async function projetoComLeva1(estado = "done"): Promise<{ projectId: string; cycleId: string }> {
  const sufixo = `${process.pid}-${n++}`;
  const ws = await db.agencyWorkspace.create({ data: { name: `[TESTE] ws ${sufixo}`, slug: `teste-ws-${sufixo}` } });
  const client = await db.client.create({ data: { workspaceId: ws.id, name: `[TESTE] cliente ${sufixo}`, email: `teste-${sufixo}@exemplo.invalid` } });
  const req = await db.clientRequestDb.create({
    data: { workspaceId: ws.id, clientId: client.id, businessName: "[TESTE] negócio", status: "in_progress", rawContext: "cliente fictício de teste" },
  });
  const project = await db.project.create({
    data: {
      workspaceId: ws.id, clientId: client.id, clientRequestId: req.id,
      name: `[TESTE] projeto ${sufixo}`,
      directionApprovedAt: new Date(), executionStatus: estado, executionAttempts: 5,
    },
  });
  const cycle = await db.cycle.create({
    data: { projectId: project.id, reference: "2026-09", status: "aberto", startsOn: INICIO, endsOn: "2026-09-30" },
  });
  await db.deliverable.create({
    data: {
      projectId: project.id, cycleId: cycle.id, name: "[TESTE] Legendas", type: "social",
      ownerAgentId: ESPECIALISTAS_DE_PECA[0]!, leva: 1, content: "x",
    },
  });
  return { projectId: project.id, cycleId: cycle.id };
}

const emDias = (d: number) => new Date(new Date(`${INICIO}T00:00:00Z`).getTime() + d * DIA);

describe("a leva vencida entra na fila — e é o relógio que já existe que a leva", () => {
  it("no dia 1 NÃO abre leva nenhuma: a leva 1 é trabalho da virada do mês", async () => {
    const { projectId } = await projetoComLeva1();
    const r = await abrirLevasVencidas(emDias(0));
    expect(r.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
    const p = await db.project.findUnique({ where: { id: projectId } });
    expect(p!.executionStatus).toBe("done");
  });

  it(`no dia ${DIAS_ENTRE_LEVAS + 1} a leva 2 abre e o projeto volta para "pending"`, async () => {
    const { projectId } = await projetoComLeva1();
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    expect(r.abertas.find((a) => a.projectId === projectId)?.leva).toBe(2);

    const p = await db.project.findUnique({ where: { id: projectId } });
    // `pending` é o ÚNICO estado que `retomarProducao` sabe ler — é esta linha
    // que liga a leva ao caminho que atende o cliente.
    expect(p!.executionStatus).toBe("pending");
    // As tentativas são por passada, não por vida do projeto: sem zerar, um
    // projeto que queimou as cinco no mês 1 nunca mais teria uma leva.
    expect(p!.executionAttempts).toBe(0);
  });

  it("rodar de novo NÃO reabre a mesma leva — 288 batidas por dia não viram 288 produções", async () => {
    const { projectId } = await projetoComLeva1();
    await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    const segunda = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    // Já está `pending`, e `pending` não é candidato: a passada em curso é que
    // vai escrever a leva 2.
    expect(segunda.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
  });

  it("leva JÁ produzida não é reaberta — é este `continue` que separa 3 produções de 288", async () => {
    const { projectId, cycleId } = await projetoComLeva1();
    // O cliente já recebeu a leva 2, e o projeto voltou a `done`. No dia 11 a
    // leva devida é 2: nada a fazer. Sem esta guarda, cada batida do relógio
    // (a cada 5 minutos) reabriria a mesma leva, e cada reabertura custa IA.
    await db.deliverable.create({
      data: {
        projectId, cycleId, name: "[TESTE] Legendas leva 2", type: "social",
        ownerAgentId: ESPECIALISTAS_DE_PECA[0]!, leva: 2, content: "x",
      },
    });
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    expect(r.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
    expect((await db.project.findUnique({ where: { id: projectId } }))!.executionStatus).toBe("done");
  });

  it("um ciclo esquecido não despeja o mês inteiro numa tarde: uma leva por vez", async () => {
    const { projectId } = await projetoComLeva1();
    // Dois períodos vencidos de uma vez (leva 3 devida, leva 1 produzida).
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS * 2 + 1));
    expect(r.abertas.find((a) => a.projectId === projectId)?.leva).toBe(2);
  });

  it("passada em curso NÃO é atropelada — a trava anti-concorrência continua de pé", async () => {
    const { projectId } = await projetoComLeva1("running");
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    expect(r.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
    expect((await db.project.findUnique({ where: { id: projectId } }))!.executionStatus).toBe("running");
  });

  it("projeto sem direção aprovada não recebe leva — o portão do cliente vale inteiro", async () => {
    const { projectId } = await projetoComLeva1();
    await db.project.update({ where: { id: projectId }, data: { directionApprovedAt: null } });
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    expect(r.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
  });

  it("data ilegível NÃO vira produção: vira aviso", async () => {
    const { projectId, cycleId } = await projetoComLeva1();
    await db.cycle.update({ where: { id: cycleId }, data: { startsOn: "não é data" } });
    const r = await abrirLevasVencidas(emDias(DIAS_ENTRE_LEVAS));
    expect(r.abertas.find((a) => a.projectId === projectId)).toBeUndefined();
    expect(r.avisos.some((a) => a.includes(projectId))).toBe(true);
    expect((await db.project.findUnique({ where: { id: projectId } }))!.executionStatus).toBe("done");
  });
});

describe("uma lista só de quem produz peça", () => {
  it("`ESPECIALISTAS_DE_PECA` e o `produzemPeca` do motor são a MESMA lista", () => {
    // Duas listas que combinam hoje divergem no primeiro especialista novo — e
    // divergindo, ou a leva nunca abre, ou ela reabre para sempre.
    const motor = readFileSync("lib/agency/execution/run-execution.ts", "utf8");
    const m = /const produzemPeca = new Set\(\[([^\]]*)\]\)/.exec(motor);
    expect(m, "o motor não declara mais `produzemPeca` — a leva perdeu o par dela").toBeTruthy();
    const doMotor = [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(doMotor).toEqual([...ESPECIALISTAS_DE_PECA]);
  });

  it("o ritmo cabe em qualquer mês", () => {
    expect(DIAS_ENTRE_LEVAS * (LEVAS_POR_CICLO - 1)).toBeLessThan(28);
  });
});
