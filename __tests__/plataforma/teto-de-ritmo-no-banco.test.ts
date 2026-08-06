// O TETO DE RITMO QUE SOBREVIVE AO DEPLOY.
//
// O furo (raio-x de 05/08/2026): quatro rotas públicas que gastam chave de IA
// PAGA — `/api/sdr/chat`, `/api/sdr/transcribe`, `/api/sdr/upload`,
// `/api/brain/briefing-extract` — tinham como única defesa um `Map` na memória
// do processo. Todo deploy ZERA esse Map. Nesta casa vários agentes publicam
// por dia: o atacante não precisava nem esperar, bastava insistir até o próximo
// push devolver a cota inteira. É a mesma família do `/api/generate-image` que
// ficou aberto e custou dinheiro.
//
// ESTE TESTE USA UM SQLITE DE VERDADE. Um mock do Prisma aqui não provaria nada
// — o que se está afirmando é justamente sobre o comportamento do BANCO:
// atomicidade sob concorrência e persistência através do restart. Mock provaria
// que o mock funciona.
//
// AS DUAS METADES, em todos os blocos:
//   • o laço malicioso é BARRADO, e continua barrado depois do "deploy";
//   • quem está dentro do teto (e quem vem de outro IP) NÃO é barrado.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

/** O cliente Prisma que o módulo sob teste enxerga. Trocá-lo por um NOVO
 *  apontando para o MESMO arquivo é a simulação honesta de um deploy: processo
 *  novo, memória zerada, volume intacto. */
const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

const DDL = `
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "chave"     TEXT     NOT NULL PRIMARY KEY,
  "contagem"  INTEGER  NOT NULL DEFAULT 1,
  "resetAt"   DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
)`;

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
  return import("@/lib/security/limite-no-banco");
}

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dioli-teto-"));
  arquivo = path.join(pasta, "teto.db");
  estado.prisma = abrir();
  await estado.prisma.$executeRawUnsafe(DDL);
  vi.resetModules();
});

afterEach(async () => {
  await estado.prisma.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
});

describe("o teto conta e barra", () => {
  it("libera até o limite e barra a partir dele — e diz quanto esperar", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");

    for (let i = 0; i < 3; i++) {
      const r = await consumirVaga("sdr-chat:1.2.3.4", 3, 60_000);
      expect(r.liberado, `a ${i + 1}ª chamada está dentro do teto`).toBe(true);
    }

    const quarta = await consumirVaga("sdr-chat:1.2.3.4", 3, 60_000);
    expect(quarta.liberado).toBe(false);
    expect(quarta.motivo).toBe("estourou");
    expect(quarta.esperarSegundos).toBeGreaterThan(0);
  });

  it("A OUTRA METADE: outro IP não paga pelo laço do vizinho", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");

    for (let i = 0; i < 5; i++) await consumirVaga("sdr-chat:atacante", 3, 60_000);
    expect((await consumirVaga("sdr-chat:atacante", 3, 60_000)).liberado).toBe(false);

    const cliente = await consumirVaga("sdr-chat:cliente-legitimo", 3, 60_000);
    expect(cliente.liberado).toBe(true);
  });

  it("A OUTRA METADE: a mesma pessoa em OUTRA rota não é barrada — o balde é por rota", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    for (let i = 0; i < 4; i++) await consumirVaga("sdr-chat:9.9.9.9", 3, 60_000);
    expect((await consumirVaga("sdr-upload:9.9.9.9", 3, 60_000)).liberado).toBe(true);
  });

  it("a janela vira: passado o tempo, o mesmo IP volta a ser atendido", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");

    // Janela de 1 ms: na chamada seguinte ela já venceu.
    expect((await consumirVaga("sdr-chat:5.5.5.5", 1, 1)).liberado).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    const depois = await consumirVaga("sdr-chat:5.5.5.5", 1, 1);
    expect(depois.liberado, "janela vencida é reciclada, não é prisão perpétua").toBe(true);
  });
});

describe("O PONTO INTEIRO: o teto atravessa o deploy", () => {
  it("processo novo sobre o mesmo volume continua barrando o atacante", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    for (let i = 0; i < 3; i++) await consumirVaga("sdr-chat:atacante", 3, 60 * 60_000);
    expect((await consumirVaga("sdr-chat:atacante", 3, 60 * 60_000)).liberado).toBe(false);

    // ── o deploy acontece no meio do ataque ──────────────────────────────
    const depoisDoDeploy = await reiniciarComoSeFosseDeploy();

    const primeiraDoProcessoNovo = await depoisDoDeploy.consumirVaga(
      "sdr-chat:atacante",
      3,
      60 * 60_000,
    );
    expect(
      primeiraDoProcessoNovo.liberado,
      "com o contador em memória, esta linha voltaria TRUE e a cota inteira seria devolvida",
    ).toBe(false);

    // E a outra metade: o cliente legítimo do outro lado do deploy é atendido.
    const legitimo = await depoisDoDeploy.consumirVaga("sdr-chat:cliente", 3, 60 * 60_000);
    expect(legitimo.liberado).toBe(true);
  });

  it("a contagem é a mesma para duas 'réplicas' — dois clientes, um volume", async () => {
    const { consumirVaga: replicaA } = await import("@/lib/security/limite-no-banco");
    vi.resetModules();
    const outroCliente = abrir();
    const anterior = estado.prisma;
    estado.prisma = outroCliente;
    const { consumirVaga: replicaB } = await import("@/lib/security/limite-no-banco");

    // Duas chamadas em cada "réplica", teto 3: a quarta tem que barrar. Com
    // contador por processo, cada réplica acharia que está em 2 de 3.
    estado.prisma = anterior;
    await replicaA("sdr-upload:8.8.8.8", 3, 60_000);
    await replicaA("sdr-upload:8.8.8.8", 3, 60_000);
    estado.prisma = outroCliente;
    expect((await replicaB("sdr-upload:8.8.8.8", 3, 60_000)).liberado).toBe(true);
    expect((await replicaB("sdr-upload:8.8.8.8", 3, 60_000)).liberado).toBe(false);

    estado.prisma = anterior;
    await outroCliente.$disconnect();
  });
});

describe("concorrência: o teto não é ultrapassado por corrida", () => {
  it("20 requisições simultâneas com teto 5 liberam EXATAMENTE 5", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => consumirVaga("sdr-chat:enxame", 5, 60_000)),
    );
    expect(resultados.filter((r) => r.liberado).length).toBe(5);
  });
});

describe("fail-closed: contador que não responde NÃO autoriza gasto", () => {
  it("banco fora do ar recusa com 503, em vez de liberar a chave paga", async () => {
    const { consumirVaga, respostaDeRecusa } = await import("@/lib/security/limite-no-banco");
    const quebrado = {
      rateLimitBucket: {
        updateMany: () => Promise.reject(new Error("database is locked")),
        create: () => Promise.reject(new Error("database is locked")),
        findUnique: () => Promise.reject(new Error("database is locked")),
        deleteMany: () => Promise.reject(new Error("database is locked")),
      },
    };
    const bom = estado.prisma;
    estado.prisma = quebrado as unknown as PrismaClient;

    const r = await consumirVaga("sdr-chat:qualquer", 30, 60_000);
    expect(r.liberado, "fail-OPEN aqui é exatamente o estado que custou dinheiro").toBe(false);
    expect(r.motivo).toBe("indisponivel");
    expect(respostaDeRecusa(r).status).toBe(503);

    estado.prisma = bom;
  });
});
