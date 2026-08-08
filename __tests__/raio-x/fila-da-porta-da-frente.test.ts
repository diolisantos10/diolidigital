// A FILA DA PORTA DA FRENTE ENTRA NO RAIO-X (08/08/2026).
//
// O defeito, medido em produção: `GET /api/brain/client-requests` mostrava três
// solicitações em `"new"` — 51, 29 e 28 dias — e **nenhum alarme desta casa
// tocava**. O raio-x varre `ContentRequest` (o pedido de quem já é cliente);
// estas moram em `ClientRequestDb`, a porta do prospect, e ninguém a olhava.
//
// É o mesmo defeito que criou o cargo de PM: lá, dois dias de um pedido do
// próprio CEO. Aqui, sete semanas de gente de fora com dinheiro na mão.
//
// AS DUAS METADES, sempre:
//   • acha quando o problema está plantado (e separa "com contato" de "sem");
//   • **não inventa achado no caso limpo** — fila fresca não toca alarme, senão
//     a agência aprende a ignorar o relatório, que é como o alarme morre.

import { describe, it, expect, beforeEach, vi } from "vitest";

type Lead = {
  id: string;
  businessName: string;
  status: string;
  createdAt: Date;
  briefingJson: string | null;
  sdrHandoffJson: string | null;
};

const estado = vi.hoisted(() => ({ leads: [] as Lead[] }));

const db = vi.hoisted(() => {
  const vazio = { count: async () => 0, findMany: async () => [], findFirst: async () => null };
  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, modelo: string) {
      if (modelo === "clientRequestDb") {
        return {
          count: async ({ where }: { where: Record<string, unknown> }) => {
            const st = (where.status as { in?: string[] })?.in ?? [];
            const corte = (where.createdAt as { lt?: Date } | undefined)?.lt;
            return estado.leads.filter(
              (l) => st.includes(l.status) && (!corte || l.createdAt < corte),
            ).length;
          },
          findMany: async ({ where }: { where: Record<string, unknown> }) => {
            const st = (where.status as { in?: string[] })?.in ?? [];
            const corte = (where.createdAt as { lt?: Date } | undefined)?.lt;
            return estado.leads
              .filter((l) => st.includes(l.status) && (!corte || l.createdAt < corte))
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          },
          findFirst: async () => null,
        };
      }
      return vazio;
    },
  });
});

vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { varrerDadosPresos } from "@/lib/raio-x/dados";

const AGORA = new Date("2026-08-08T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

function lead(p: Partial<Lead> & { id: string; businessName: string; createdAt: Date }): Lead {
  return { status: "new", briefingJson: null, sdrHandoffJson: null, ...p };
}

const achado = (r: Awaited<ReturnType<typeof varrerDadosPresos>>, chave: string) =>
  r.achados.find((a) => a.chave === chave);

beforeEach(() => { estado.leads = []; });

describe("acha o problema plantado — as três de produção", () => {
  it("🔴 Sushi Cazza (51 dias), Camila (29) e Beatriz (28), todas sem contato, viram UM achado alto com a mais antiga nomeada", async () => {
    estado.leads = [
      lead({ id: "cm-sushi",   businessName: "Restaurante Sushi Cazza", createdAt: diasAtras(51) }),
      lead({ id: "cm-camila",  businessName: "Camila Pereira",          createdAt: diasAtras(29) }),
      lead({ id: "cm-beatriz", businessName: "Beatriz Gimenes",         createdAt: diasAtras(28) }),
    ];

    const r = await varrerDadosPresos(AGORA);
    expect(r.status).toBe("rodou");

    const a = achado(r, "briefing-parado-sem-contato");
    expect(a).toBeDefined();
    expect(a!.gravidade).toBe("alto");
    expect(a!.evidencia).toContain("3 solicitação");
    expect(a!.evidencia).toContain("Restaurante Sushi Cazza");
    expect(a!.evidencia).toContain("51 dia");

    expect(r.medidas.solicitacoesDeBriefingParadasHaMaisDeUmDia).toBe(3);
    expect(r.medidas.solicitacoesParadasSemContato).toBe(3);
    expect(r.medidas.solicitacoesParadasComContato).toBe(0);
  });

  it("separa COM contato de SEM contato — a ação é diferente e o alarme também", async () => {
    estado.leads = [
      lead({ id: "a", businessName: "Sem canal", createdAt: diasAtras(10) }),
      lead({
        id: "b",
        businessName: "Com WhatsApp",
        createdAt: diasAtras(4),
        briefingJson: JSON.stringify({ contato: { nome: "Ana", whatsapp: "11989400692" } }),
      }),
    ];

    const r = await varrerDadosPresos(AGORA);
    expect(achado(r, "briefing-parado-sem-contato")!.evidencia).toContain("Sem canal");
    const comContato = achado(r, "briefing-parado-com-contato");
    expect(comContato).toBeDefined();
    expect(comContato!.gravidade).toBe("alto");
    expect(comContato!.evidencia).toContain("Com WhatsApp");
    expect(r.medidas.solicitacoesParadasComContato).toBe(1);
    expect(r.medidas.solicitacoesParadasSemContato).toBe(1);
  });

  it("o lead recusado no gate ('lead_incompleto') também é varrido — ele não pode virar gaveta silenciosa", async () => {
    estado.leads = [lead({ id: "c", businessName: "Recusou contato", status: "lead_incompleto", createdAt: diasAtras(3) })];
    const r = await varrerDadosPresos(AGORA);
    expect(achado(r, "briefing-parado-sem-contato")).toBeDefined();
    expect(r.medidas.solicitacoesDeBriefingAbertas).toBe(1);
  });

  it("o formato LEGADO de contato conta como contato — senão as fichas antigas boas virariam alarme falso", async () => {
    estado.leads = [
      lead({
        id: "d",
        businessName: "Legado",
        createdAt: diasAtras(5),
        briefingJson: JSON.stringify({ scope: { prospectName: "Ana", prospectEmail: "ana@x.com.br" } }),
      }),
    ];
    const r = await varrerDadosPresos(AGORA);
    expect(achado(r, "briefing-parado-sem-contato")).toBeUndefined();
    expect(achado(r, "briefing-parado-com-contato")).toBeDefined();
  });
});

describe("NÃO inventa problema no caso limpo", () => {
  it("fila vazia não toca alarme nenhum", async () => {
    const r = await varrerDadosPresos(AGORA);
    expect(achado(r, "briefing-parado-sem-contato")).toBeUndefined();
    expect(achado(r, "briefing-parado-com-contato")).toBeUndefined();
    expect(r.medidas.solicitacoesDeBriefingAbertas).toBe(0);
  });

  it("lead de hoje NÃO é 'parado' — 24h é o horizonte, e abaixo dele é operação normal", async () => {
    estado.leads = [lead({ id: "e", businessName: "Chegou agora", createdAt: new Date(AGORA.getTime() - 60_000) })];
    const r = await varrerDadosPresos(AGORA);
    expect(r.medidas.solicitacoesDeBriefingAbertas).toBe(1);
    expect(r.medidas.solicitacoesDeBriefingParadasHaMaisDeUmDia).toBe(0);
    expect(achado(r, "briefing-parado-sem-contato")).toBeUndefined();
  });

  it("lead que já virou cliente (status fora da fila) não é varrido", async () => {
    estado.leads = [lead({ id: "f", businessName: "Virou projeto", status: "in_progress", createdAt: diasAtras(60) })];
    const r = await varrerDadosPresos(AGORA);
    expect(r.medidas.solicitacoesDeBriefingAbertas).toBe(0);
    expect(r.achados.filter((a) => a.chave.startsWith("briefing-parado"))).toEqual([]);
  });
});

describe("zero e 'não sei' não dividem o mesmo pixel", () => {
  it("a contagem classificada é publicada ao lado do total — split que some do total é número que mente sem avisar", async () => {
    estado.leads = [lead({ id: "g", businessName: "X", createdAt: diasAtras(2) })];
    const r = await varrerDadosPresos(AGORA);
    expect(r.medidas.solicitacoesClassificadas).toBe(r.medidas.solicitacoesDeBriefingParadasHaMaisDeUmDia);
  });
});
