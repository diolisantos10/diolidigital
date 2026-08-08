// ── O DINHEIRO NÃO SAI QUANDO O MOLDE NÃO PODE SER APLICADO ─────────────────
//
// 08/08/2026, medido em produção: `GET /api/capacidades` respondeu
// `montar-molde: pronta:false` com `onde_achei_o_navegador: null`. Não há
// Chromium no container.
//
// `comporComMolde` já era FAIL CLOSED desde 07/08 — sem navegador a peça não é
// gravada, e isso está certo: ferramenta faltando é problema da agência, não um
// entregável pior para o cliente pagante.
//
// Só que a porta fechava DEPOIS da foto. A ordem real era: gerar a imagem de IA
// (que custa, por peça), guardar, e só então descobrir que não havia como pôr a
// camada de texto — e jogar tudo fora. O despertador bate a cada 5 minutos:
// uma torneira aberta contra um balde furado, 288 vezes por dia.
//
// `renderizadorDisponivel()` foi escrito exatamente para isto e não tinha um
// único chamador no caminho vivo.
//
// AS DUAS METADES: a guarda tem de parar a rodada quando não há navegador, E
// tem de sair da frente quando há. Guarda que barra sempre não é guarda — é uma
// funcionalidade desligada.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
}));
const renderizadorDisponivel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/design/renderizar", () => ({
  renderizadorDisponivel,
  renderizarHtml: vi.fn(),
}));

import { produzirArtesPendentes } from "@/lib/agency/execution/artes";

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([]);
});

describe("sem Chromium, a rodada de artes para ANTES de pagar", () => {
  it("BARRA: nenhuma peça é buscada, e o motivo sobe nomeado", async () => {
    renderizadorDisponivel.mockResolvedValue({ disponivel: false, caminho: null });

    const r = await produzirArtesPendentes();

    expect(r.produzidas).toBe(0);
    // A prova de que nada foi gasto: a rodada nem chegou a olhar a fila. Não
    // há como pagar por uma imagem de uma peça que não foi lida.
    expect(db.socialPost.findMany).not.toHaveBeenCalled();
    // E não é silêncio: "zero peças" sem motivo é como o molde ficou desligado
    // em produção por dias, com a única testemunha dentro do `lastError`.
    expect(r.semRenderizador).toBeTruthy();
    expect(r.semRenderizador).toContain("Chromium");
    // A causa e o conserto, no mesmo texto — quem lê o alarme sabe o que fazer.
    expect(r.semRenderizador).toContain("railpack.json");
    expect(r.semRenderizador).toContain("/api/capacidades");
  });

  it("BARRA: a leitura do renderizador que FALHA também para a rodada", async () => {
    // "Não sei se tenho navegador" não autoriza gastar. Do lado do dinheiro,
    // não-medido e ausente param igual.
    renderizadorDisponivel.mockRejectedValue(new Error("boom"));

    const r = await produzirArtesPendentes();

    expect(db.socialPost.findMany).not.toHaveBeenCalled();
    expect(r.semRenderizador).toBeTruthy();
  });

  it("NÃO BARRA: com navegador, a rodada segue e a fila é lida normalmente", async () => {
    renderizadorDisponivel.mockResolvedValue({ disponivel: true, caminho: "/usr/bin/chromium" });

    const r = await produzirArtesPendentes();

    expect(db.socialPost.findMany).toHaveBeenCalled();
    // Nada de motivo inventado no caso limpo: alarme que toca sempre é
    // desligado por quem não sabe o que ele protege.
    expect(r.semRenderizador).toBeUndefined();
  });
});

describe("a guarda é uma antecipação, não um caminho alternativo", () => {
  it("nenhuma peça sai crua por causa dela — o fail closed do molde continua", async () => {
    const artes = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "lib/agency/execution/artes.ts"), "utf8",
    );
    // `comporComMolde` continua devolvendo `ok:false` para falha de INFRA. Se
    // alguém "resolvesse" o Chromium ausente deixando a foto crua passar, esta
    // guarda nova viraria a desculpa para isso.
    expect(artes).toContain("MOTIVOS_DE_INFRA");
    expect(artes).toContain('"sem_navegador"');
    expect(artes).toContain("a peça NÃO foi gravada");
    // E sem porta dos fundos: nada de env que desligue a guarda.
    const trecho = artes.slice(artes.indexOf("const renderizador = await renderizadorDisponivel"), artes.indexOf("const pendentes = await prisma.socialPost.findMany"));
    expect(trecho).not.toMatch(/process\.env/);
  });

  it("o despertador GRITA a rodada que não aconteceu", async () => {
    const desp = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "lib/agency/despertador.ts"), "utf8",
    );
    // Sem esta linha o pulso registraria "0 falhas" numa casa que produz zero
    // peça por dia — o pior tipo de número, porque tem cara de saúde.
    expect(desp).toContain("r.semRenderizador");
    expect(desp).toMatch(/quebrou\("arte", r\.semRenderizador\)/);
  });
});
