// despertador-acervo.test.ts — a perna do relógio que importa o acervo do
// Instagram sozinha (ficha 1B-B1/B1c, 27/09/2026). Prova, isolado do resto do
// relógio (que já tem sua própria suíte em `__tests__/execution/despertador.test.ts`):
//
//   • no máximo UMA marca por tique, mesmo com várias candidatas na fila;
//   • sequencial — nunca duas chamadas de `importarAcervo` na mesma batida;
//   • só entra quem tem `acervoImportadoEm: null` E conexão de Instagram
//     conectada (a candidata sem conexão é pulada, não conta como a "1").
//
// Mockado à parte de `despertador.test.ts` porque este arquivo PRECISA
// controlar `@/lib/integrations/meta/acervo` (o oposto do que
// `__tests__/meta/acervo.test.ts` faz, que testa o módulo de verdade) — os
// dois não podem viver no mesmo arquivo sem um `vi.mock` pisar no outro.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), update: vi.fn() },
  client: { findMany: vi.fn() },
}));
const runProjectExecution = vi.hoisted(() => vi.fn());
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const importarAcervo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/integrations/meta/acervo", () => ({ importarAcervo }));

const destravarPacote = vi.hoisted(() => vi.fn());
const pacotesTravados = vi.hoisted(() => vi.fn());
type ResultadoDaReauditoria = { aprovadas: string[]; reprovadas: string[]; aindaSemArbitro: string[] };
const reauditarSemArbitro = vi.hoisted(() =>
  vi.fn(async (): Promise<ResultadoDaReauditoria> => ({ aprovadas: [], reprovadas: [], aindaSemArbitro: [] })),
);
vi.mock("@/lib/agency/esteira/pacote-travado", () => ({ destravarPacote, pacotesTravados, reauditarSemArbitro }));

import { baterORelogio } from "@/lib/agency/despertador";

type ImportarAcervoResultado =
  | { ok: true; importados: number; jaExistiam: number; semInsights: number; midiasBaixadas: number; falhasDeMidia: never[] }
  | { ok: false; motivo: string; codigo: "ja_importado" | "sem_conexao" | "teto_da_meta" | "erro_da_meta" };

function candidato(id: string, workspaceId = "ws1") {
  return { id, workspaceId };
}

const CONEXAO_CONECTADA = { id: "mc1", platform: "instagram", externalId: "ig1", status: "connected", tokenExpiresAt: null, metaJson: {}, token: "tk" };

/** A ASSINATURA da chamada da PERNA DO ACERVO — `select: { id, workspaceId }`
 *  é única a ela em `despertador.ts` (conferido: `grep prisma.client.` no
 *  arquivo só devolve esta perna). Módulos REAIS não-mockados chamados mais
 *  cedo na mesma rodada (ex.: `decisoes-do-dono.ts`) também podem chamar
 *  `prisma.client.findMany` — condicionar a resposta pela assinatura evita
 *  que a lista de candidatas do teste vaze para eles. */
type CandidatoDoAcervo = { id: string; workspaceId: string };
let candidatosDoAcervo: CandidatoDoAcervo[] = [];

function ehChamadaDaPernaDoAcervo(args: unknown): boolean {
  const a = args as { select?: { id?: boolean; workspaceId?: boolean } } | undefined;
  return a?.select?.id === true && a?.select?.workspaceId === true;
}

beforeEach(() => {
  vi.clearAllMocks();
  candidatosDoAcervo = [];
  db.project.findMany.mockResolvedValue([]);
  db.project.update.mockResolvedValue({});
  db.client.findMany.mockImplementation(async (args: unknown) =>
    ehChamadaDaPernaDoAcervo(args) ? candidatosDoAcervo : [],
  );
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: [], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
  pacotesTravados.mockResolvedValue([]);
  destravarPacote.mockResolvedValue({ projectId: "p1", corrigidas: [], persistentes: [], escalado: false });
  conexaoDoCliente.mockResolvedValue(null);
  importarAcervo.mockResolvedValue({
    ok: true, importados: 1, jaExistiam: 0, semInsights: 0, midiasBaixadas: 1, falhasDeMidia: [],
  } satisfies ImportarAcervoResultado);
});

/** Acha, entre TODAS as chamadas a `client.findMany` da rodada (podem existir
 *  outras, de módulos reais não-mockados), a que pertence à perna do acervo. */
function chamadaDaPernaDoAcervo(): { where: { acervoImportadoEm: unknown }; take: number; orderBy: unknown } {
  const chamada = db.client.findMany.mock.calls.find((c) => ehChamadaDaPernaDoAcervo(c[0]));
  if (!chamada) throw new Error("a perna do acervo não chamou client.findMany");
  return chamada[0] as { where: { acervoImportadoEm: unknown }; take: number; orderBy: unknown };
}

describe("o acervo do Instagram, importado sozinho pelo relógio", () => {
  it("no máximo 1 marca por tique, mesmo com várias candidatas conectadas", async () => {
    candidatosDoAcervo = [candidato("c1"), candidato("c2"), candidato("c3")];
    conexaoDoCliente.mockResolvedValue({ ...CONEXAO_CONECTADA });

    await baterORelogio();

    expect(importarAcervo).toHaveBeenCalledTimes(1);
    expect(importarAcervo).toHaveBeenCalledWith({ workspaceId: "ws1", clientId: "c1" });
  });

  it("pula quem não tem conexão de Instagram conectada, e tenta a próxima candidata na mesma batida", async () => {
    candidatosDoAcervo = [candidato("sem-conexao"), candidato("com-conexao")];
    conexaoDoCliente.mockImplementation(async (_ws: string, clientId: string) =>
      clientId === "com-conexao" ? { ...CONEXAO_CONECTADA } : null,
    );

    await baterORelogio();

    expect(importarAcervo).toHaveBeenCalledTimes(1);
    expect(importarAcervo).toHaveBeenCalledWith({ workspaceId: "ws1", clientId: "com-conexao" });
  });

  it("conexão existente mas não conectada (expirada) também é pulada", async () => {
    candidatosDoAcervo = [candidato("c1")];
    conexaoDoCliente.mockResolvedValue({ ...CONEXAO_CONECTADA, status: "expired" });

    await baterORelogio();

    expect(importarAcervo).not.toHaveBeenCalled();
  });

  it("nenhuma candidata na fila → não toca em `conexaoDoCliente` nem em `importarAcervo`", async () => {
    candidatosDoAcervo = [];
    await baterORelogio();
    expect(conexaoDoCliente).not.toHaveBeenCalled();
    expect(importarAcervo).not.toHaveBeenCalled();
  });

  it("busca só quem tem `acervoImportadoEm: null` — o filtro vai no `where`, não numa comparação depois", async () => {
    candidatosDoAcervo = [];
    await baterORelogio();
    expect(chamadaDaPernaDoAcervo().where.acervoImportadoEm).toBeNull();
  });

  it("erro de uma marca (ex.: teto da Meta) não derruba a rodada nem impede a próxima batida", async () => {
    candidatosDoAcervo = [candidato("c1")];
    conexaoDoCliente.mockResolvedValue({ ...CONEXAO_CONECTADA });
    importarAcervo.mockResolvedValue({
      ok: false, motivo: "a Meta limitou nosso ritmo", codigo: "teto_da_meta",
    } satisfies ImportarAcervoResultado);

    // Não pode lançar — o relógio nunca pode morrer.
    await expect(baterORelogio()).resolves.toBeDefined();
    expect(importarAcervo).toHaveBeenCalledTimes(1);
  });
});
