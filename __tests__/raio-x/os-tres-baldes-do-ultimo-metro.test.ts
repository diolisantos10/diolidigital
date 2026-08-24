// OS TRÊS BALDES QUE FALTAVAM PARA RELIGAR O RELÓGIO (15/08/2026).
//
// O raio-x media peça presa, mensagem sem leitura, material não perguntado e
// briefing parado — e **não media** três estados que prendem trabalho JÁ PAGO
// no último metro:
//
//   1. projeto com direção aprovada pelo cliente e execução que não andou;
//   2. entregável barrado pela Qualidade (`quality_flag`) — o freio funciona e
//      ninguém contava quantas peças ele segura;
//   3. `ClientNotice` em `"pendente"` — o aviso ao cliente que NUNCA tentou
//      sair. Este é o grave: o balde existente conta `WhatsAppOutbox` em
//      `"failed"`, que é **outro modelo e outro estado**. "Tentou e a Meta
//      recusou" e "nunca foi tentado" são fatos opostos; o segundo era
//      invisível para o raio-x inteiro.
//
// AS DUAS METADES em cada um: acha o problema plantado · não inventa problema
// no caso limpo. Alarme que toca à toa é alarme que a agência desliga.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Projeto { id: string; directionApprovedAt: Date | null; executionStatus: string; executionError: string | null; executionRequestedAt: Date | null }
interface Entregavel { id: string; projectId: string; revisionStatus: string | null; updatedAt: Date }
interface Aviso { id: string; kind: string; channel: string; status: string; failReason: string | null; createdAt: Date; updatedAt: Date }

const estado = vi.hoisted(() => ({
  projetos: [] as Projeto[],
  entregaveis: [] as Entregavel[],
  avisos: [] as Aviso[],
}));

const db = vi.hoisted(() => {
  const vazio = {
    count: async () => 0,
    findMany: async () => [],
    findFirst: async () => null,
  };

  /** Um `where` minúsculo, mas HONESTO: se ele ignorasse os filtros, todo teste
   *  abaixo passaria com o código defeituoso — a "peça verde, junta rompida"
   *  que esta casa já pagou duas vezes. */
  const casa = (linha: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where ?? {}).every(([campo, cond]) => {
      const v = linha[campo];
      if (cond === null) return v === null || v === undefined;
      if (typeof cond === "object" && cond !== null) {
        const c = cond as Record<string, unknown>;
        if ("in" in c) return (c.in as unknown[]).includes(v);
        if ("not" in c && c.not === null) {
          const naoNulo = v !== null && v !== undefined;
          if (!naoNulo) return false;
          if ("lt" in c) return (v as Date) < (c.lt as Date);
          return true;
        }
        if ("lt" in c) return v !== null && v !== undefined && (v as Date) < (c.lt as Date);
      }
      return v === cond;
    });

  const modelo = <T extends Record<string, unknown>>(linhas: () => T[], ordenar: (a: T, b: T) => number) => ({
    count: async (a?: { where?: Record<string, unknown> }) =>
      linhas().filter((l) => casa(l, a?.where ?? {})).length,
    findMany: async (a?: { where?: Record<string, unknown> }) =>
      linhas().filter((l) => casa(l, a?.where ?? {})),
    findFirst: async (a?: { where?: Record<string, unknown> }) =>
      linhas().filter((l) => casa(l, a?.where ?? {})).sort(ordenar)[0] ?? null,
  });

  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, nome: string) {
      if (nome === "project") return modelo(() => estado.projetos as unknown as Record<string, unknown>[], (a, b) => ((a.directionApprovedAt as Date)?.getTime() ?? 0) - ((b.directionApprovedAt as Date)?.getTime() ?? 0));
      if (nome === "deliverable") return modelo(() => estado.entregaveis as unknown as Record<string, unknown>[], (a, b) => (a.updatedAt as Date).getTime() - (b.updatedAt as Date).getTime());
      if (nome === "clientNotice") return modelo(() => estado.avisos as unknown as Record<string, unknown>[], (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
      return vazio;
    },
  });
});

vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { varrerDadosPresos } from "@/lib/raio-x/dados";

const AGORA = new Date("2026-08-15T12:00:00.000Z");
const ANTEONTEM = new Date("2026-08-13T09:00:00.000Z");
const HA_POUCO = new Date("2026-08-15T09:00:00.000Z");

beforeEach(() => {
  estado.projetos = [];
  estado.entregaveis = [];
  estado.avisos = [];
});

const achado = (r: Awaited<ReturnType<typeof varrerDadosPresos>>, chave: string) =>
  r.achados.find((a) => a.chave === chave);

describe("1. direção aprovada e execução travada", () => {
  it("⛔ acha o projeto que o cliente liberou e a casa não executou", async () => {
    estado.projetos = [
      { id: "prj_1", directionApprovedAt: ANTEONTEM, executionStatus: "idle", executionError: null, executionRequestedAt: null },
      { id: "prj_2", directionApprovedAt: ANTEONTEM, executionStatus: "failed", executionError: "IA indisponível", executionRequestedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.projetosComDirecaoAprovadaESemExecucao).toBe(2);
    const a = achado(r, "direcao-aprovada-sem-execucao")!;
    expect(a.gravidade).toBe("alto");
    expect(a.evidencia).toContain("prj_1"); // o mais antigo é nomeado
  });

  it("✅ NÃO toca em projeto aprovado hoje, nem em execução concluída", async () => {
    estado.projetos = [
      // aprovado há 3h: operação normal, não é "preso".
      { id: "prj_fresco", directionApprovedAt: HA_POUCO, executionStatus: "idle", executionError: null, executionRequestedAt: null },
      // aprovado há muito, mas a execução TERMINOU.
      { id: "prj_ok", directionApprovedAt: ANTEONTEM, executionStatus: "done", executionError: null, executionRequestedAt: ANTEONTEM },
      // nunca aprovado: não há "vai" do cliente para morrer dentro de casa.
      { id: "prj_sem_aval", directionApprovedAt: null, executionStatus: "idle", executionError: null, executionRequestedAt: null },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.projetosComDirecaoAprovadaESemExecucao).toBe(0);
    expect(achado(r, "direcao-aprovada-sem-execucao")).toBeUndefined();
  });

  it("⛔ execução PENDURADA (+24h em pending/running) é balde próprio", async () => {
    estado.projetos = [
      { id: "prj_x", directionApprovedAt: null, executionStatus: "running", executionError: null, executionRequestedAt: ANTEONTEM },
    ];
    const r = await varrerDadosPresos(AGORA);
    expect(r.medidas.projetosComExecucaoPenduradaHaMaisDeUmDia).toBe(1);
    expect(achado(r, "execucao-pendurada")).toBeDefined();
  });

  it("✅ execução pedida há 3h não é pendurada — é execução acontecendo", async () => {
    estado.projetos = [
      { id: "prj_y", directionApprovedAt: null, executionStatus: "running", executionError: null, executionRequestedAt: HA_POUCO },
    ];
    const r = await varrerDadosPresos(AGORA);
    expect(r.medidas.projetosComExecucaoPenduradaHaMaisDeUmDia).toBe(0);
  });
});

describe("2. pacote barrado pela Qualidade", () => {
  it("⛔ conta os entregáveis em quality_flag e nomeia o mais antigo", async () => {
    estado.entregaveis = [
      { id: "dlv_1", projectId: "prj_1", revisionStatus: "quality_flag", updatedAt: ANTEONTEM },
      { id: "dlv_2", projectId: "prj_1", revisionStatus: "quality_flag", updatedAt: HA_POUCO },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.entregaveisBarradosPelaQualidade).toBe(2);
    expect(achado(r, "entregavel-barrado-pela-qualidade")!.evidencia).toContain("dlv_1");
  });

  it("✅ entregável revisado e OK não conta — o freio não é o alarme", async () => {
    estado.entregaveis = [
      { id: "dlv_ok", projectId: "prj_1", revisionStatus: "quality_ok", updatedAt: ANTEONTEM },
      { id: "dlv_nulo", projectId: "prj_1", revisionStatus: null, updatedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.entregaveisBarradosPelaQualidade).toBe(0);
    expect(achado(r, "entregavel-barrado-pela-qualidade")).toBeUndefined();
  });
});

describe("3. o aviso ao cliente que nunca saiu — o furo grave", () => {
  it("⛔ acha o ClientNotice em 'pendente' há +24h, com tipo e canal", async () => {
    estado.avisos = [
      { id: "avs_1", kind: "entrega", channel: "whatsapp", status: "pendente", failReason: null, createdAt: ANTEONTEM, updatedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.avisosAoClientePendentes).toBe(1);
    expect(r.medidas.avisosAoClientePendentesHaMaisDeUmDia).toBe(1);
    const a = achado(r, "aviso-ao-cliente-nunca-enviado")!;
    expect(a.gravidade).toBe("alto");
    expect(a.evidencia).toContain("entrega");
    expect(a.evidencia).toContain("whatsapp");
  });

  it("🔑 'pendente' e WhatsApp 'failed' são baldes DIFERENTES — este era o furo", async () => {
    // O balde antigo (`whatsappFalhado`) olha `WhatsAppOutbox.status = failed`:
    // a mensagem que TENTOU sair. Um aviso preso em `pendente` nunca tentou, e
    // por isso era invisível para o raio-x inteiro. Se um dia alguém colapsar os
    // dois num número só, este teste cai.
    estado.avisos = [
      { id: "avs_1", kind: "direcao", channel: "nenhum", status: "pendente", failReason: null, createdAt: ANTEONTEM, updatedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.avisosAoClientePendentes).toBe(1);
    expect(r.medidas.whatsappFalhado).toBe(0); // outro modelo, outro estado
    expect(achado(r, "aviso-ao-cliente-nunca-enviado")).toBeDefined();
    expect(achado(r, "whatsapp-falhado")).toBeUndefined();
  });

  it("⛔ 'falhou' tem balde e MOTIVO próprios — não se mistura com 'pendente'", async () => {
    estado.avisos = [
      { id: "avs_f", kind: "material", channel: "whatsapp", status: "falhou", failReason: "fora da janela de 24h", createdAt: ANTEONTEM, updatedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.avisosAoClienteFalhados).toBe(1);
    expect(r.medidas.avisosAoClientePendentes).toBe(0);
    expect(achado(r, "aviso-ao-cliente-falhou")!.evidencia).toContain("fora da janela de 24h");
  });

  it("✅ aviso criado há 3h não toca alarme — a fila tem direito de existir", async () => {
    estado.avisos = [
      { id: "avs_novo", kind: "ciclo", channel: "whatsapp", status: "pendente", failReason: null, createdAt: HA_POUCO, updatedAt: HA_POUCO },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.avisosAoClientePendentes).toBe(1); // existe
    expect(r.medidas.avisosAoClientePendentesHaMaisDeUmDia).toBe(0); // não está preso
    expect(achado(r, "aviso-ao-cliente-nunca-enviado")).toBeUndefined();
  });

  it("✅ aviso já enviado ou dispensado não conta em nada", async () => {
    estado.avisos = [
      { id: "a", kind: "entrega", channel: "whatsapp", status: "enviado", failReason: null, createdAt: ANTEONTEM, updatedAt: ANTEONTEM },
      { id: "b", kind: "entrega", channel: "manual", status: "dispensado", failReason: null, createdAt: ANTEONTEM, updatedAt: ANTEONTEM },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.avisosAoClientePendentes).toBe(0);
    expect(r.medidas.avisosAoClienteFalhados).toBe(0);
    expect(r.achados.filter((a) => a.chave.startsWith("aviso-ao-cliente"))).toEqual([]);
  });
});

describe("a casa limpa não produz achado nenhum destes três", () => {
  it("✅ banco vazio: as seis medidas existem e são zero, sem alarme", async () => {
    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.projetosComDirecaoAprovadaESemExecucao).toBe(0);
    expect(r.medidas.projetosComExecucaoPenduradaHaMaisDeUmDia).toBe(0);
    expect(r.medidas.entregaveisBarradosPelaQualidade).toBe(0);
    expect(r.medidas.avisosAoClientePendentes).toBe(0);
    expect(r.medidas.avisosAoClientePendentesHaMaisDeUmDia).toBe(0);
    expect(r.medidas.avisosAoClienteFalhados).toBe(0);

    const novas = ["direcao-aprovada-sem-execucao", "execucao-pendurada",
      "entregavel-barrado-pela-qualidade", "aviso-ao-cliente-nunca-enviado", "aviso-ao-cliente-falhou"];
    expect(r.achados.filter((a) => novas.includes(a.chave))).toEqual([]);
  });
});
