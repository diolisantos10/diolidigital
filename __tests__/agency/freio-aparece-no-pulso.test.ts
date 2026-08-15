// FREIO SILENCIOSO VIRA FILA MORTA INVISÍVEL — e essa é a cicatriz desta casa.
//
// A trava que segura trabalho pronto e não conta a ninguém tem o mesmo efeito
// prático de fila morta, com o agravante de parecer que está tudo bem: o pulso
// diria "0 enviados, 0 falhas" tanto com a torneira fechada quanto com a esteira
// morta. São fatos opostos, e de fora eram indistinguíveis.
//
// Por isso a torneira fechada é um TERCEIRO estado no pulso: não é falha (regra
// funcionando não pode alarmar o vigia toda noite até o painel ensinar a ser
// ignorado) e não é silêncio. É estado declarado, com motivo e contagem.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "pulso-freio-"));
  process.env.RAILWAY_VOLUME_MOUNT_PATH = pasta;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  await rm(pasta, { recursive: true, force: true });
});

describe("a torneira fechada aparece no pulso", () => {
  it("com motivo e contagem — não como número solto", async () => {
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    await registrarBatida({
      em: new Date().toISOString(), ms: 10, moveu: {}, falhas: [],
      freios: [{ nome: "WHATSAPP_SAIDA", motivo: "está fechada por política de opt-in", retidos: 37 }],
    });

    const p = await lerPulso();
    expect(p.freios).toHaveLength(1);
    expect(p.freios[0]!.nome).toBe("WHATSAPP_SAIDA");
    expect(p.freios[0]!.retidos).toBe(37);
    expect(p.freios[0]!.motivo, "número sem motivo manda o operador adivinhar").toBeTruthy();
  });

  it("freio NÃO é falha — o vigia da madrugada não pode alarmar por regra funcionando", async () => {
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    await registrarBatida({
      em: new Date().toISOString(), ms: 10, moveu: {}, falhas: [],
      freios: [{ nome: "AVALIACOES_GOOGLE", motivo: "fechada", retidos: 2 }],
    });
    const p = await lerPulso();
    expect(p.falhas24h).toHaveLength(0);
    expect(p.ok).toBe(true);
  });

  it("o freio lido é o da ÚLTIMA batida, não a soma de 24 h", async () => {
    // Somar 24 h daria "288 mensagens retidas" para 1 mensagem vista 288 vezes
    // — que é o jeito mais rápido de a contagem deixar de ser levada a sério.
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    const agora = Date.now();
    for (const i of [3, 2, 1]) {
      await registrarBatida({
        em: new Date(agora - i * 60_000).toISOString(), ms: 5, moveu: {}, falhas: [],
        freios: [{ nome: "WHATSAPP_SAIDA", motivo: "fechada", retidos: 4 }],
      });
    }
    expect((await lerPulso()).freios[0]!.retidos).toBe(4);
  });

  it("batida ANTIGA, sem o campo, não quebra a leitura", async () => {
    // O arquivo do pulso é histórico: as batidas gravadas antes de 15/08/2026
    // não têm `freios`, e um leitor que quebrasse com elas apagaria a noite
    // inteira de testemunho.
    const { registrarBatida, lerPulso } = await import("@/lib/agency/pulso");
    await registrarBatida({ em: new Date().toISOString(), ms: 5, moveu: {}, falhas: [] });
    expect((await lerPulso()).freios).toEqual([]);
  });
});

// ── E A METADE QUE FAZ ISTO EXISTIR DE VERDADE ──────────────────────────────
//
// Um campo de freio que ninguém preenche é o mesmo silêncio de antes, só que
// com mais código. O relógio precisa anotá-lo.

const DESPERTADOR = readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

describe("o relógio anota o freio na batida", () => {
  it("as três pernas de saída passam o freio adiante", () => {
    // WhatsApp (duas pernas) e avaliações. Se uma parar de anotar, a fila dela
    // volta a ser invisível.
    expect(DESPERTADOR.match(/anotarFreio\(/g) ?? []).toHaveLength(3);
  });

  it("e a batida gravada leva o campo `freios`", () => {
    const i = DESPERTADOR.indexOf("registrarBatida({");
    expect(DESPERTADOR.slice(i, i + 700)).toContain("freios,");
  });

  it("as duas pernas de WhatsApp somam numa linha só — o operador quer a chave, não a função", () => {
    expect(DESPERTADOR).toContain("igual.retidos += f.retidos");
  });
});
