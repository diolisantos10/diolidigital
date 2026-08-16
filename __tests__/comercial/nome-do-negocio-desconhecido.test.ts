// NOME DO NEGÓCIO DESCONHECIDO — ausência DECLARADA, nunca string vazia.
//
// POR QUE ESTE TESTE EXISTE (16/08/2026):
//
// `prospect-engine.ts` parou de gravar o e-mail do prospect como nome do
// negócio (commit `1f9c4f6b`) — mas a coluna `businessName` no banco é
// `String` NÃO-NULO, então "não sei o nome" virou `""`, não `NULL`. Os dois
// leitores da porta da frente (`quem-bateu-na-porta.ts` e `dossie-do-lead.ts`)
// repassavam essa string vazia crua, e a tela (`app/agency/leads/page.tsx`)
// a renderizava direto: o cartão ficava com um BURACO BRANCO onde deveria
// estar o nome do negócio.
//
// Um buraco branco é ambíguo — quem olha não sabe se o negócio não foi
// informado, se o dado se perdeu, ou se a tela quebrou. Esta casa já pagou
// por essa mesma ambiguidade: "falha de leitura nunca vira zero" foi a lição
// do Sushi Cazza, cuja fila ficou invisível por sete semanas porque um erro
// de banco tinha cara de lista vazia. Silêncio com cara de dado é o defeito.
//
// A lei: ausência de informação não é informação, e nunca se preenche por
// inferência (não se deriva nome do negócio do e-mail, do handle ou do nome
// da pessoa). As duas metades abaixo provam isso nos dois leitores.

import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({ clientRequestDb: { findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { quemBateuNaPorta } from "@/lib/agency/comercial/quem-bateu-na-porta";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";
import { lerNegocio } from "@/lib/agency/comercial/negocio-do-lead";

const AGORA = new Date("2026-08-16T12:00:00Z");

function pedido(businessName: string, over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    businessName,
    status: "new",
    rawContext: "",
    briefingJson: JSON.stringify({ contato: { email: "dono@exemplo.com.br" } }),
    sdrHandoffJson: null,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    ...over,
  };
}

describe("lerNegocio — o leitor único", () => {
  it("string vazia, espaço e ausência viram null — nunca ''", () => {
    expect(lerNegocio("")).toBeNull();
    expect(lerNegocio("   ")).toBeNull();
    expect(lerNegocio(null)).toBeNull();
    expect(lerNegocio(undefined)).toBeNull();
  });

  it("nome de verdade passa intacto, com espaço nas pontas removido", () => {
    expect(lerNegocio("  Sushi Cazza  ")).toBe("Sushi Cazza");
  });
});

describe("⛔ pedido SEM nome de negócio", () => {
  it("quemBateuNaPorta declara ausência — nunca string vazia", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido("")]);
    const fila = await quemBateuNaPorta("ws1", AGORA);
    expect(fila[0]!.negocio).toBeNull();
    expect(fila[0]!.negocio).not.toBe("");
  });

  it("montarDossie declara ausência E lista 'nome do negócio' em precisoConfirmar", () => {
    const d = montarDossie(
      {
        id: "r1",
        businessName: "",
        segment: "gastronomia",
        status: "new",
        createdAt: new Date("2026-08-10T12:00:00Z"),
        services: ["planejamento de conteúdo"],
        objectives: [],
        rawContext: "",
        briefingJson: JSON.stringify({ contato: { email: "dono@exemplo.com.br" } }),
      },
      AGORA,
    );
    expect(d.negocio).toBeNull();
    expect(d.negocio).not.toBe("");
    expect(d.precisoConfirmar.some((p) => /nome do neg[óo]cio/i.test(p))).toBe(true);
  });
});

describe("✅ pedido COM negócio de verdade — passa intacto", () => {
  it("quemBateuNaPorta devolve o nome, sem rótulo de ausência", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido("Sushi Cazza")]);
    const fila = await quemBateuNaPorta("ws1", AGORA);
    expect(fila[0]!.negocio).toBe("Sushi Cazza");
  });

  it("montarDossie devolve o nome e NÃO entra em precisoConfirmar", () => {
    const d = montarDossie(
      {
        id: "r1",
        businessName: "Sushi Cazza",
        segment: "gastronomia",
        status: "new",
        createdAt: new Date("2026-08-10T12:00:00Z"),
        services: ["planejamento de conteúdo"],
        objectives: [],
        rawContext: "",
        briefingJson: JSON.stringify({ contato: { email: "dono@exemplo.com.br" } }),
      },
      AGORA,
    );
    expect(d.negocio).toBe("Sushi Cazza");
    expect(d.precisoConfirmar.some((p) => /nome do neg[óo]cio/i.test(p))).toBe(false);
  });
});
