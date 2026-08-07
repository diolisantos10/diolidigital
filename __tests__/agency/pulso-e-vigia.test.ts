// As duas metades do alarme da madrugada.
//
// Metade que PEGA: relógio parado, falha de produção e achado grave viram
// alarme. Metade que NÃO INVENTA: noite limpa não produz alarme nenhum, e
// noite limpa TAMBÉM produz o fechamento verde (é ele que distingue "tudo bem"
// de "o alarme quebrou").

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "pulso-"));
  process.env.RAILWAY_VOLUME_MOUNT_PATH = pasta;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  await rm(pasta, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("pulso — a testemunha do relógio", () => {
  it("nunca ter batido é ALARME, não 'ainda não sei'", async () => {
    const { lerPulso } = await import("@/lib/agency/pulso");
    const p = await lerPulso();
    expect(p.ultima).toBeNull();
    expect(p.haMinutos).toBeNull();
    expect(p.ok).toBe(false); // ← o ponto do teste
  });

  it("batida recente = ok; batida velha = alarme", async () => {
    const { registrarBatida, lerPulso, ATRASO_QUE_ALARMA_MIN } = await import("@/lib/agency/pulso");
    const agora = new Date("2026-08-07T06:00:00.000Z");

    await registrarBatida({ em: new Date(agora.getTime() - 4 * 60_000).toISOString(), ms: 12, moveu: {}, falhas: [] });
    expect((await lerPulso(agora)).ok).toBe(true);

    await registrarBatida({
      em: new Date(agora.getTime() - (ATRASO_QUE_ALARMA_MIN + 1) * 60_000).toISOString(),
      ms: 12, moveu: {}, falhas: [],
    });
    const velho = await lerPulso(agora);
    expect(velho.ok).toBe(false);
    expect(velho.haMinutos).toBe(ATRASO_QUE_ALARMA_MIN + 1);
  });

  it("a rodada SILENCIOSA também deixa rastro — é ela que prova que o relógio vive", async () => {
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    await registrarBatida({ em: new Date().toISOString(), ms: 3, moveu: { pedidos: 0, artes: 0 }, falhas: [] });
    const p = await lerPulso();
    expect(p.batidas).toBe(1);
    expect(Object.values(p.moveu24h).reduce((a, b) => a + b, 0)).toBe(0);
    expect(p.ok).toBe(true);
  });

  it("agrupa a MESMA falha repetida em vez de listar 288 linhas iguais", async () => {
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    for (let i = 0; i < 5; i++) {
      await registrarBatida({
        em: new Date(Date.now() - i * 60_000).toISOString(),
        ms: 1, moveu: {},
        falhas: [{ perna: "publicacao", erro: "o carrossel ainda não tem as artes das telas" }],
      });
    }
    const p = await lerPulso();
    expect(p.falhas24h).toHaveLength(1);
    expect(p.falhas24h[0].vezes).toBe(5);
  });

  it("arquivo corrompido não derruba a leitura — o pulso é testemunha, não trabalho", async () => {
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    await registrarBatida({ em: new Date().toISOString(), ms: 1, moveu: {}, falhas: [] });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(pasta, "pulso", "batidas.json"), "{lixo", "utf8");
    const p = await lerPulso();
    expect(p.ok).toBe(false);
    expect(p.batidas).toBe(0);
  });
});

describe("vigia da madrugada — o aviso que o CEO encontra de manhã", () => {
  const eventos: Array<{ type: string; message: string }> = [];

  async function carregar(achados: Array<{ gravidade: string; titulo: string; evidencia: string; local: string }>) {
    eventos.length = 0;
    vi.doMock("@/lib/db/client", () => ({
      prisma: {
        agencyWorkspace: { findFirst: async () => ({ id: "ws1" }) },
        activityEvent: { create: async ({ data }: { data: { type: string; message: string } }) => { eventos.push(data); return data; } },
      },
    }));
    vi.doMock("@/lib/raio-x/dados", () => ({
      varrerDadosPresos: async () => ({ varredura: "dados-presos", padrao: "estado-morto", status: "rodou", achados, medidas: {} }),
    }));
    return import("@/lib/agency/vigia-da-madrugada");
  }

  /** 03h de São Paulo = 06:00 UTC. */
  const tresDaManha = new Date("2026-08-07T06:10:00.000Z");

  it("fora da hora, NÃO roda — senão o aviso sai 12 vezes por hora", async () => {
    const { vigiarAMadrugada } = await carregar([]);
    const r = await vigiarAMadrugada([], new Date("2026-08-07T12:00:00.000Z"));
    expect(r.rodou).toBe(false);
    expect(eventos).toHaveLength(0);
  });

  it("PEGA: falha da noite e achado grave viram linha vermelha no painel", async () => {
    const { vigiarAMadrugada } = await carregar([
      { gravidade: "alto", titulo: "Agente travou por falta de material", evidencia: "1 pedido há +24h", local: "MaterialRequest.askedClientAt" },
      { gravidade: "baixo", titulo: "coisa pequena", evidencia: "x", local: "y" },
    ]);
    const r = await vigiarAMadrugada(
      [{ perna: "publicacao", erro: "o carrossel ainda não tem as artes das telas" }],
      tresDaManha,
    );
    expect(r.rodou).toBe(true);
    expect(r.achadosGraves).toBe(1);
    expect(r.falhasDaNoite).toBe(1);
    const vermelhos = eventos.filter((e) => e.type === "vigia_achado");
    // 1 grave + 1 falha. O achado "baixo" NÃO vira alarme.
    expect(vermelhos).toHaveLength(2);
    expect(vermelhos.some((e) => e.message.includes("carrossel"))).toBe(true);
    expect(eventos.some((e) => e.message.includes("coisa pequena"))).toBe(false);
  });

  it("NÃO INVENTA: noite limpa não gera alarme — mas gera o fechamento verde", async () => {
    const { vigiarAMadrugada } = await carregar([]);
    const r = await vigiarAMadrugada([], tresDaManha);
    expect(r.rodou).toBe(true);
    expect(r.achadosGraves).toBe(0);
    expect(r.falhasDaNoite).toBe(0);
    expect(eventos.filter((e) => e.type === "vigia_achado")).toHaveLength(0);
    // O fechamento sai mesmo assim: é ele que distingue "noite tranquila" de
    // "o vigia parou de funcionar".
    const fechamento = eventos.filter((e) => e.type === "vigia_da_madrugada");
    expect(fechamento).toHaveLength(1);
    expect(fechamento[0].message).toContain("não tinha trabalho pendente");
  });

  it("o mesmo dia não fecha duas vezes — restart às 03h05 não duplica o aviso", async () => {
    const { vigiarAMadrugada } = await carregar([]);
    await vigiarAMadrugada([], tresDaManha);
    const depoisDoPrimeiro = eventos.length;
    const segundo = await vigiarAMadrugada([], new Date("2026-08-07T06:45:00.000Z"));
    expect(segundo.rodou).toBe(false);
    expect(eventos).toHaveLength(depoisDoPrimeiro);
    expect((await readFile(path.join(pasta, "pulso", "vigia.txt"), "utf8")).trim()).toBe("2026-08-07");
  });
});
