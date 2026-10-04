// A ROTINA DE 5 EM 5 MIN ESPERA O COFRE EM SILÊNCIO (CEO, 04/10/2026).
// Produção, 04/10: 301 chamadas de IA em 24h, 301 com falha — o despertador
// tentando IA sem caminho. Agora: dentro da rotina e sem cofre aprovado, a
// camada devolve "aguardando cofre", sem gravar falha e sem chave direta;
// pendente, ainda sonda o cofre (é assim que a aprovação é descoberta); fora
// da rotina, nada muda.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const estado = vi.hoisted(() => ({
  pareamento: "pendente" as "sem_pareamento" | "pendente" | "aprovado",
  respostaDoCofre: { ok: false, erro: "aguardando aprovação no cofre" } as Record<string, unknown>,
}));
const espioes = vi.hoisted(() => ({
  registrar: vi.fn(async (_x: unknown): Promise<void> => undefined),
  resolver: vi.fn(async (_p: unknown, _w?: unknown): Promise<null> => null),
  pedir: vi.fn(async (_p: unknown): Promise<Record<string, unknown>> => ({})),
}));

vi.mock("@/lib/ai/cofre", () => ({
  AGUARDANDO_O_COFRE: "aguardando",
  cofreLigado: () => estado.pareamento !== "sem_pareamento",
  cofreAprovado: () => estado.pareamento === "aprovado",
  pedirAoCofre: async (p: unknown) => { espioes.pedir(p); return estado.respostaDoCofre; },
  provedorDoModelo: () => null,
}));
vi.mock("@/lib/ai/registro-de-custo", () => ({ registrarChamadaDeIa: espioes.registrar }));
vi.mock("@/lib/ai/escolha-por-cliente", () => ({ escolhaDoCliente: async () => null }));
vi.mock("@/lib/ai/resolve-key", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/resolve-key")>()),
  resolveProviderKey: espioes.resolver,
}));

const { generate } = await import("@/lib/ai/generate");
const { comoRotina, AGUARDANDO_COFRE } = await import("@/lib/ai/rotina-sem-cofre");

const pedido = { system: "s", user: "u", workspaceId: "ws", agentId: "social-media" };

beforeEach(() => {
  estado.pareamento = "pendente";
  estado.respostaDoCofre = { ok: false, erro: "aguardando aprovação no cofre" };
  espioes.registrar.mockClear(); espioes.resolver.mockClear(); espioes.pedir.mockClear();
});

describe("dentro da rotina, sem cofre aprovado", () => {
  it("pendente: pergunta ao cofre (a sonda), não grava falha, não tenta chave direta", async () => {
    const r = await comoRotina(() => generate(pedido));
    expect(r).toMatchObject({ ok: false, error: AGUARDANDO_COFRE });
    expect(espioes.pedir).toHaveBeenCalledTimes(1);
    expect(espioes.registrar).not.toHaveBeenCalled();
    expect(espioes.resolver).not.toHaveBeenCalled();
  });

  it("sem pareamento nenhum: nem pergunta", async () => {
    estado.pareamento = "sem_pareamento";
    const r = await comoRotina(() => generate(pedido));
    expect(r).toMatchObject({ ok: false, error: AGUARDANDO_COFRE });
    expect(espioes.pedir).not.toHaveBeenCalled();
    expect(espioes.registrar).not.toHaveBeenCalled();
  });

  it("o Diego aprovou: a sonda volta ok e a rotina segue sozinha, gravando o sucesso", async () => {
    estado.respostaDoCofre = { ok: true, texto: '{"a":1}', modelo: "m" };
    const r = await comoRotina(() => generate(pedido));
    expect(r.ok).toBe(true);
    expect(espioes.registrar).toHaveBeenCalledTimes(1);
  });
});

describe("fora da rotina, nada muda", () => {
  it("uma pessoa numa tela: a falha do cofre é gravada e a reserva é tentada como sempre", async () => {
    const r = await generate(pedido);
    expect(r.ok).toBe(false);
    expect(espioes.registrar).toHaveBeenCalled();
    expect(espioes.resolver).toHaveBeenCalled();
  });
});

describe("as rotinas usam o contexto", () => {
  const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("o despertador roda cada batida como rotina e anuncia a espera uma vez", () => {
    const d = ler("lib/agency/despertador.ts");
    expect(d).toContain("void comoRotina(() => baterORelogio())");
    expect(d).toContain("anunciarEsperaDoCofre()");
  });
  it("a rota de recuperação do GitHub pula sem cofre aprovado, lendo o banco", () => {
    expect(ler("app/api/cron/execute/route.ts")).toContain('(await resumoDoPareamento()).estado !== "aprovado"');
  });
  it("a imagem também espera", () => {
    expect(ler("lib/ai/design-engine.ts")).toContain("if (rotinaEsperaOCofre())");
  });
});
