// A TRAVA DE CONVERSA COM FECHADURA — banco de verdade, disputa de verdade.
//
// O CEO nomeou isto como CRITÉRIO DE CONCLUSÃO: "não concluído se dois agentes
// podem responder ao mesmo tempo" e "se o histórico não sobreviver ao
// reinício". Até 30/08/2026 `PortaDaConversa` era só interface.
//
// ── POR QUE `Promise.all` E NÃO DUAS CHAMADAS SEGUIDAS ───────────────────
// Duas chamadas em sequência provam que a SEGUNDA vê a primeira gravada. Não
// é isso que quebra em produção. O que quebra é o intervalo entre "ver que
// está livre" e "gravar meu nome": nele cabe o outro agente inteiro. Um teste
// sequencial passa com uma implementação de "ler, verificar, gravar" — que é
// exatamente a implementação errada.

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
CREATE TABLE "ConversaDaCelula" (
    "conversaId" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "agenteResponsavel" TEXT,
    "etapa" TEXT NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" DATETIME NOT NULL
);
CREATE TABLE "TravaDaConversaDaCelula" (
    "conversaId" TEXT NOT NULL PRIMARY KEY,
    "agente" TEXT NOT NULL,
    "expiraEm" DATETIME NOT NULL,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TravaDaConversaDaCelula_expiraEm_idx" ON "TravaDaConversaDaCelula"("expiraEm");
`;

let pasta = "";
let arquivo = "";

function abrir(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivo}` }) });
}

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "trava-conversa-"));
  arquivo = path.join(pasta, "t.db");
  estado.prisma = abrir();
  for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await estado.prisma.$executeRawUnsafe(stmt);
  }
});

afterEach(async () => {
  await estado.prisma?.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
});

const AGORA = new Date("2026-08-30T12:00:00Z");
const DAQUI_A_5MIN = new Date(AGORA.getTime() + 5 * 60_000).toISOString();

async function porta() {
  const { portaDaConversaNoBanco } = await import(
    "@/lib/agency/celula/mensagens/porta-da-conversa-no-banco"
  );
  return portaDaConversaNoBanco(estado.prisma, () => AGORA);
}

describe("🔴 dois agentes ao mesmo tempo — a prova que o CEO exigiu", () => {
  it("DEZ agentes disputando a MESMA conversa simultaneamente: exatamente UM ganha", async () => {
    const p = await porta();

    // Nada de await entre eles: as dez reservas partem juntas e são resolvidas
    // pelo banco. É aqui que "ler, verificar, gravar" deixaria mais de um passar.
    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        p.reservar({ conversaId: "conv-1", agente: `agente-${i}`, expiraEm: DAQUI_A_5MIN }),
      ),
    );

    expect(resultados.filter(Boolean).length, "exatamente um agente pode ganhar").toBe(1);

    // e o banco tem UMA trava só, do vencedor
    const travas = await estado.prisma.travaDaConversaDaCelula.findMany();
    expect(travas.length).toBe(1);
    expect(travas[0]!.conversaId).toBe("conv-1");
  });

  it("conversas DIFERENTES não disputam entre si — a metade gêmea", async () => {
    const p = await porta();
    const r = await Promise.all([
      p.reservar({ conversaId: "conv-a", agente: "x", expiraEm: DAQUI_A_5MIN }),
      p.reservar({ conversaId: "conv-b", agente: "y", expiraEm: DAQUI_A_5MIN }),
      p.reservar({ conversaId: "conv-c", agente: "z", expiraEm: DAQUI_A_5MIN }),
    ]);
    expect(r).toEqual([true, true, true]);
  });
});

describe("a trava é de quem pegou", () => {
  it("outro agente NÃO consegue reservar enquanto a trava está viva", async () => {
    const p = await porta();
    expect(await p.reservar({ conversaId: "c", agente: "ana", expiraEm: DAQUI_A_5MIN })).toBe(true);
    expect(await p.reservar({ conversaId: "c", agente: "bruno", expiraEm: DAQUI_A_5MIN })).toBe(false);
  });

  it("o dono RENOVA a própria trava", async () => {
    const p = await porta();
    await p.reservar({ conversaId: "c", agente: "ana", expiraEm: DAQUI_A_5MIN });
    expect(await p.reservar({ conversaId: "c", agente: "ana", expiraEm: DAQUI_A_5MIN })).toBe(true);
  });

  it("liberar só solta o que é seu — bruno não destrava a conversa de ana", async () => {
    const p = await porta();
    await p.reservar({ conversaId: "c", agente: "ana", expiraEm: DAQUI_A_5MIN });

    await p.liberar({ conversaId: "c", agente: "bruno" });
    expect(
      await p.reservar({ conversaId: "c", agente: "bruno", expiraEm: DAQUI_A_5MIN }),
      "bruno não pode ter destravado a conversa de ana",
    ).toBe(false);

    await p.liberar({ conversaId: "c", agente: "ana" });
    expect(await p.reservar({ conversaId: "c", agente: "bruno", expiraEm: DAQUI_A_5MIN })).toBe(true);
  });
});

describe("nenhum estado prende trabalho para sempre", () => {
  it("trava VENCIDA é tomada — processo que morreu não prende a conversa", async () => {
    const p = await porta();
    const jaVenceu = new Date(AGORA.getTime() - 60_000).toISOString();
    await p.reservar({ conversaId: "c", agente: "morto", expiraEm: jaVenceu });

    expect(await p.reservar({ conversaId: "c", agente: "vivo", expiraEm: DAQUI_A_5MIN })).toBe(true);
    const t = await estado.prisma.travaDaConversaDaCelula.findUnique({ where: { conversaId: "c" } });
    expect(t!.agente).toBe("vivo");
  });

  it("dois agentes disputando a MESMA trava vencida: só um toma", async () => {
    const p = await porta();
    await p.reservar({
      conversaId: "c",
      agente: "morto",
      expiraEm: new Date(AGORA.getTime() - 60_000).toISOString(),
    });

    const r = await Promise.all([
      p.reservar({ conversaId: "c", agente: "a", expiraEm: DAQUI_A_5MIN }),
      p.reservar({ conversaId: "c", agente: "b", expiraEm: DAQUI_A_5MIN }),
      p.reservar({ conversaId: "c", agente: "c2", expiraEm: DAQUI_A_5MIN }),
    ]);
    expect(r.filter(Boolean).length).toBe(1);
  });

  it("expiraEm inválido é RECUSADO — trava sem prazo legível é trava eterna", async () => {
    const p = await porta();
    expect(await p.reservar({ conversaId: "c", agente: "a", expiraEm: "nao-e-data" })).toBe(false);
    expect(await estado.prisma.travaDaConversaDaCelula.count()).toBe(0);
  });
});

describe("o histórico SOBREVIVE ao reinício — o outro critério do CEO", () => {
  it("estado gravado é lido de volta por um processo NOVO sobre o mesmo arquivo", async () => {
    const { gravarEstadoDaConversa } = await import(
      "@/lib/agency/celula/mensagens/porta-da-conversa-no-banco"
    );
    await gravarEstadoDaConversa(
      {
        workspaceId: "w1",
        estado: {
          conversaId: "conv-x",
          ultimaRecebida: { em: "2026-08-30T11:00:00Z", texto: "preciso de posts" },
          ultimaEnviada: null,
          agenteResponsavel: "sdr",
          etapa: "briefing_em_coleta",
          perguntasJaFeitas: ["quantidade", "formato"],
          respostasRecebidas: { quantidade: "12" },
          arquivos: [],
          proximaAcao: "perguntar prazo",
          modelosJaUsados: ["M01"],
        },
      },
      estado.prisma,
    );

    // O que um deploy faz: derruba o processo e sobe outro sobre o MESMO arquivo.
    await estado.prisma.$disconnect();
    estado.prisma = abrir();

    const p = await porta();
    const lido = await p.ler("conv-x");
    expect(lido).not.toBeNull();
    expect(lido!.perguntasJaFeitas).toEqual(["quantidade", "formato"]);
    expect(lido!.respostasRecebidas).toEqual({ quantidade: "12" });
    expect(lido!.modelosJaUsados).toEqual(["M01"]);
    expect(lido!.etapa).toBe("briefing_em_coleta");
  });

  it("conversa inexistente devolve null, e NÃO um estado vazio remendado", async () => {
    const p = await porta();
    expect(await p.ler("nunca-existiu")).toBeNull();
  });

  it("estado CORROMPIDO devolve null — remendar com defaults faria a pergunta repetida sair", async () => {
    for (const lixo of ["{", "", "null", "[]", '{"etapa":""}', '{"etapa":"x","perguntasJaFeitas":"nao-e-lista"}']) {
      await estado.prisma.conversaDaCelula.upsert({
        where: { conversaId: "c" },
        create: { conversaId: "c", workspaceId: "w", estado: lixo, etapa: "x", atualizadaEm: AGORA },
        update: { estado: lixo, atualizadaEm: AGORA },
      });
      const p = await porta();
      expect(await p.ler("c"), `estado ${JSON.stringify(lixo)} não pode virar estado válido`).toBeNull();
    }
  });
});
