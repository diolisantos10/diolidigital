// O ESTOURO DO TETO DEIXA RASTRO — achado 2 do parecer do `seguranca` sobre o
// freio por `sessionId` (16/08/2026).
//
// Até este conserto, `consumirVaga` só logava quando o BANCO estava fora do
// ar (`catch`, fail-closed). Quando o TETO estourava — o freio funcionando
// como desenhado — não sobrava rastro nenhum: impossível, olhando só o log,
// separar um 429 de IP de um 429 de sessão, ou perceber que o balde
// COMPARTILHADO (`sdr-chat-sessao:sdr:sem-sessao`, onde caem TODOS os
// visitantes sem `sessionId`) estava sendo atingido — o que seria DoS real
// contra terceiros, em silêncio.
//
// ESTE TESTE USA UM SQLITE DE VERDADE (mesmo padrão de
// `teto-de-ritmo-no-banco.test.ts`): o comportamento sob teste é do BANCO
// decidindo o estouro, não de um mock que já sabe a resposta.
//
// AS DUAS METADES, e a segunda é a que a definição de pronto do despacho
// chama de obrigatória — provar só que loga, sem provar que não vaza, é meia
// trava:
//   1. o estouro deixa rastro — `balde` e `motivo` aparecem no log;
//   2. o identificador CRU (IP, ou o fio da conversa) NUNCA aparece no log,
//      nem em texto claro, nem escondido dentro da linha inteira.

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

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "dioli-estouro-log-"));
  arquivo = path.join(pasta, "teto.db");
  estado.prisma = abrir();
  await estado.prisma.$executeRawUnsafe(DDL);
  vi.resetModules();
});

afterEach(async () => {
  await estado.prisma.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("o estouro deixa rastro no log — balde e motivo", () => {
  it("estourou o teto de IP: o log carrega balde=sdr-chat, e não carrega o IP", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});

    const IP_DA_VITIMA = "203.0.113.77"; // TEST-NET-3, RFC 5737 — nunca é IP real
    for (let i = 0; i < 2; i++) await consumirVaga(`sdr-chat:${IP_DA_VITIMA}`, 2, 60_000);
    const estourada = await consumirVaga(`sdr-chat:${IP_DA_VITIMA}`, 2, 60_000);
    expect(estourada.motivo).toBe("estourou");

    expect(espiao).toHaveBeenCalled();
    const linhas = espiao.mock.calls.map((c) => c.join(" "));
    const linhaDoEstouro = linhas.find((l) => l.includes("estourou"));
    expect(linhaDoEstouro, "tem que existir uma linha de log para o estouro").toBeDefined();

    // Metade 1: balde e motivo aparecem.
    expect(linhaDoEstouro).toContain("balde=sdr-chat");
    expect(linhaDoEstouro).toContain("motivo=estourou");

    // Metade 2 (obrigatória): o IP CRU não aparece em NENHUMA linha logada —
    // nem na do estouro, nem em qualquer outra chamada de log deste teste.
    for (const linha of linhas) {
      expect(linha).not.toContain(IP_DA_VITIMA);
    }
  });

  it("estourou o teto de SESSÃO: o log separa balde=sdr-chat-sessao de balde=sdr-chat, e não carrega o fio", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});

    const FIO_DA_VITIMA = "sdr:um-fio-de-sessao-bem-especifico-e-unico";
    for (let i = 0; i < 2; i++) {
      await consumirVaga(`sdr-chat-sessao:${FIO_DA_VITIMA}`, 2, 60_000);
    }
    const estourada = await consumirVaga(`sdr-chat-sessao:${FIO_DA_VITIMA}`, 2, 60_000);
    expect(estourada.motivo).toBe("estourou");

    const linhas = espiao.mock.calls.map((c) => c.join(" "));
    const linhaDoEstouro = linhas.find((l) => l.includes("estourou"));
    expect(linhaDoEstouro).toBeDefined();

    // Balde separa "por sessão" de "por IP" — literalmente, nomes diferentes.
    expect(linhaDoEstouro).toContain("balde=sdr-chat-sessao");
    expect(linhaDoEstouro).not.toContain("balde=sdr-chat:");

    // O fio da conversa (o identificador cru desta chamada) NUNCA aparece.
    for (const linha of linhas) {
      expect(linha).not.toContain(FIO_DA_VITIMA);
    }
  });

  it("dá para enxergar quando é o balde GLOBAL (sdr:sem-sessao) que estourou, sem revelar identidade de ninguém", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 2; i++) {
      await consumirVaga("sdr-chat-sessao:sdr:sem-sessao", 2, 60_000);
    }
    await consumirVaga("sdr-chat-sessao:sdr:sem-sessao", 2, 60_000);

    const linhas = espiao.mock.calls.map((c) => c.join(" "));
    const linhaDoEstouro = linhas.find((l) => l.includes("estourou"));
    expect(linhaDoEstouro).toContain("balde=sdr-chat-sessao");
    // O sinal que distingue "balde compartilhado por todo mundo" de "balde de
    // UMA pessoa" — sem nunca imprimir o valor do identificador em si.
    expect(linhaDoEstouro).toContain("compartilhado=true");
  });

  it("A OUTRA METADE: sessão individual (não a global) loga compartilhado=false", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 2; i++) {
      await consumirVaga("sdr-chat-sessao:sdr:visitante-comum-de-verdade", 2, 60_000);
    }
    await consumirVaga("sdr-chat-sessao:sdr:visitante-comum-de-verdade", 2, 60_000);

    const linhas = espiao.mock.calls.map((c) => c.join(" "));
    const linhaDoEstouro = linhas.find((l) => l.includes("estourou"));
    expect(linhaDoEstouro).toContain("compartilhado=false");
    for (const linha of linhas) {
      expect(linha).not.toContain("visitante-comum-de-verdade");
    }
  });

  it("dentro do teto (sem estourar) NÃO loga nada — o log é só para o caminho de recusa", async () => {
    const { consumirVaga } = await import("@/lib/security/limite-no-banco");
    const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await consumirVaga("sdr-chat:1.2.3.4", 5, 60_000);
    expect(r.liberado).toBe(true);
    expect(espiao).not.toHaveBeenCalled();
  });
});
