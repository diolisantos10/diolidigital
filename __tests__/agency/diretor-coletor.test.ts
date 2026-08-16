// O COLETOR — a prova de que a seta liga na caixa (lib/agency/diretor/coletor.ts).
//
// O achado do essencial `qualidade` (16/08/2026, D-003) era exatamente isto:
// `podeODiretorEncerrar` julgava certo e só aparecia no PRÓPRIO teste. Este
// arquivo testa o outro lado — quem vai ao banco e monta o retrato que o
// veredito recebe.
//
// A metade que importa mais está no segundo describe: uma fonte que FALHA não
// pode virar "nada pendente". Sem essa metade, um coletor que sempre reprova
// (todas as fontes retornam erro) passaria no teste de "casa limpa" por
// acidente e ninguém notaria que ele nunca produz pendência nenhuma — ver o
// terceiro teste, que prova as duas coisas ao mesmo tempo: a fonte que quebrou
// aparece em falhas, e as fontes que não quebraram CONTINUAM rodando.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  bloqueioV2: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
  handoffV2: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  contentRequest: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
  outboxV2: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  whatsAppOutbox: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { coletarRetratoDasFontes, ESCOPO_DESTE_PRODUTO } from "@/lib/agency/diretor/coletor";
import { podeODiretorEncerrar } from "@/lib/agency/diretor/pendencias";

const AGORA = new Date("2026-08-16T12:00:00Z");
const HORA = 3_600_000;
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * HORA);

function tudoLimpo() {
  db.bloqueioV2.findMany.mockResolvedValue([]);
  db.project.findMany.mockResolvedValue([]);
  db.handoffV2.findMany.mockResolvedValue([]);
  db.task.findMany.mockResolvedValue([]);
  db.deliverable.findMany.mockResolvedValue([]);
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.contentRequest.findMany.mockResolvedValue([]);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.outboxV2.findMany.mockResolvedValue([]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.whatsAppOutbox.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  tudoLimpo();
});

describe("casa limpa — todas as fontes respondem e não há nada pendente", () => {
  it("o retrato sai vazio dos dois lados, e o veredito libera o encerramento", async () => {
    const retrato = await coletarRetratoDasFontes(AGORA);
    expect(retrato.falhas).toEqual([]);
    expect(retrato.pendencias).toEqual([]);
    expect(podeODiretorEncerrar(retrato).podeEncerrar).toBe(true);
  });
});

describe("A METADE QUE IMPORTA — silêncio de fonte não vira 'casa limpa'", () => {
  it("uma fonte que LANÇA erro entra em falhas, e o veredito reprova por auditoria incompleta", async () => {
    db.bloqueioV2.findMany.mockRejectedValue(new Error("banco indisponível"));
    const retrato = await coletarRetratoDasFontes(AGORA);

    expect(retrato.falhas).toHaveLength(1);
    expect(retrato.falhas[0]!.fonte).toContain("bloqueios-canonicos");
    expect(retrato.falhas[0]!.erro).toContain("banco indisponível");

    const veredito = podeODiretorEncerrar(retrato);
    expect(veredito.podeEncerrar).toBe(false);
    if (veredito.podeEncerrar) return;
    // NÃO é "pendencias_abertas" — é "auditoria_incompleta". Um coletor que
    // confundisse os dois deixaria o Diretor pensar que só falta resolver a
    // lista, quando na verdade a lista pode estar curta por causa da falha.
    expect(veredito.motivo).toBe("auditoria_incompleta");
  });

  it("a fonte que quebrou NÃO derruba as outras — elas continuam rodando e reportando", async () => {
    db.handoffV2.findMany.mockRejectedValue(new Error("timeout"));
    db.bloqueioV2.findMany.mockResolvedValue([
      {
        entidadeTipo: "Project", entidadeId: "p9", tipo: "aguardando-decisao", donoFuncaoId: "diretor",
        abertoEm: horasAtras(10), acaoRecomendada: "decida", resolvidoEm: null,
      },
    ]);

    const retrato = await coletarRetratoDasFontes(AGORA);

    expect(retrato.falhas).toHaveLength(1);
    expect(retrato.falhas[0]!.fonte).toContain("handoffs-e-tarefas");
    // A fonte de bloqueios canônicos não tinha nada a ver com o handoff que
    // quebrou — e o achado dela aparece do mesmo jeito.
    expect(retrato.pendencias).toHaveLength(1);
    expect(retrato.pendencias[0]!.tipo).toBe("bloqueio_aberto");
  });
});

describe("pendência real vira Pendencia real", () => {
  it("um bloqueio canônico aberto aparece no veredito com escopo do produto e ação legível", async () => {
    db.bloqueioV2.findMany.mockResolvedValue([
      {
        entidadeTipo: "Project", entidadeId: "p1", tipo: "aguardando-decisao", donoFuncaoId: "diretor",
        abertoEm: horasAtras(33), acaoRecomendada: "confirme com o cliente", resolvidoEm: null,
      },
    ]);
    const retrato = await coletarRetratoDasFontes(AGORA);
    expect(retrato.pendencias).toHaveLength(1);
    const p = retrato.pendencias[0]!;
    expect(p.tipo).toBe("bloqueio_aberto");
    expect(p.escopo).toBe(ESCOPO_DESTE_PRODUTO);
    expect(p.horasParada).toBe(33);
    expect(p.acao).toContain("confirme com o cliente");
    expect(podeODiretorEncerrar(retrato).podeEncerrar).toBe(false);
  });

  it("a mais antiga vem primeiro mesmo vindo de fontes diferentes (BloqueioV2 × WhatsAppOutbox)", async () => {
    db.bloqueioV2.findMany.mockResolvedValue([
      {
        entidadeTipo: "Project", entidadeId: "p1", tipo: "x", donoFuncaoId: "diretor",
        abertoEm: horasAtras(5), acaoRecomendada: "a", resolvidoEm: null,
      },
    ]);
    db.whatsAppOutbox.findMany.mockResolvedValue([
      { id: "w1", updatedAt: horasAtras(80), error: "número inválido", kind: "proposal_sent" },
    ]);
    const retrato = await coletarRetratoDasFontes(AGORA);
    const veredito = podeODiretorEncerrar(retrato);
    expect(veredito.podeEncerrar).toBe(false);
    if (veredito.podeEncerrar) return;
    expect(veredito.pendencias[0]!.referencia).toBe("WhatsAppOutbox:w1");
    expect(veredito.pendencias[0]!.horasParada).toBe(80);
  });

  it("handoff sem aceite (via lib/agency/pm/varredura, a MESMA régua do PM) vira handoff_sem_aceite", async () => {
    db.handoffV2.findMany.mockResolvedValue([
      {
        id: "h1", deDepartamento: "social-media", paraDepartamento: "design",
        responsavelEntrega: "copywriter", criadoEm: horasAtras(10), cobradoEm: null,
      },
    ]);
    const retrato = await coletarRetratoDasFontes(AGORA);
    const achada = retrato.pendencias.find((p) => p.tipo === "handoff_sem_aceite");
    expect(achada).toBeDefined();
    expect(achada!.referencia).toBe("h1");
  });

  it("a MESMA régua de SLA (SLA_POR_ESTADO_HORAS) aplicada a um ContentRequest vira prazo_estourado", async () => {
    db.contentRequest.findMany.mockImplementation(({ where }: { where?: Record<string, unknown> }) =>
      Promise.resolve(
        where && "estadoCanonico" in where
          ? [{ id: "cr1", estadoCanonico: "production", updatedAt: horasAtras(100) }]
          : [], // esta é a chamada da fonte "pedidos-escalados" (where.status)
      ),
    );
    const retrato = await coletarRetratoDasFontes(AGORA);
    const achada = retrato.pendencias.find((p) => p.referencia === "ContentRequest:cr1");
    expect(achada?.tipo).toBe("prazo_estourado");
    // 100h em "production" (SLA de 72h, a mesma tabela do detector-de-parados)
    expect(achada?.horasParada).toBe(100);
  });
});
