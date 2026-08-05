// O Radar injetava texto de IA como DIRETRIZ OFICIAL da agência inteira.
//
// `scanSource` gravava `source: "official"` quando a FONTE era oficial, e
// `library.addInsight` traduzia isso em `status: "active"`,
// `approvedBy: "official-source"`, na hora. Só que o `guidance` não era da
// fonte: era o que um modelo extraiu dela, com um "NÃO invente" no prompt.
//
// Esse texto vai para (a) o prompt de TODOS os especialistas sob "siga estas
// diretrizes" e (b) o prompt do AUDITOR DE QUALIDADE como régua. Uma alucinação
// virava diretriz da casa e a própria Qualidade passava a auditar contra ela —
// contaminando todos os clientes de uma vez.
//
// Regra nova: `official` = a FONTE é confiável. `extraction` = o TEXTO foi
// conferido. Só a conjunção ativa.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ marketInsight: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() } }));
const generate = vi.hoisted(() => vi.fn());
const fetchFeedItems = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/radar/fetcher", () => ({ fetchFeedItems }));

import { runRadarScan, temLastroLiteral } from "@/lib/agency/radar/radar-agent";
import { addInsight } from "@/lib/agency/radar/library";

const FONTE_OFICIAL = JSON.stringify([
  { name: "Meta Newsroom", domain: "social", url: "https://meta.example/rss", official: true },
]);

beforeEach(() => {
  vi.clearAllMocks();
  db.marketInsight.findMany.mockResolvedValue([]);
  db.marketInsight.updateMany.mockResolvedValue({ count: 0 });
  db.marketInsight.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "i1", status: args.data.status,
  }));
  delete process.env.RADAR_SOURCES;
});

describe("'official' passou a significar 'a fonte é confiável', não 'a extração é verificada'", () => {
  it("fonte oficial + guidance INVENTADO pelo modelo → PENDENTE, não ativo", async () => {
    process.env.RADAR_SOURCES = FONTE_OFICIAL;
    fetchFeedItems.mockResolvedValue([
      { title: "Reels agora aceita 3 minutos", summary: "O limite de duração subiu." },
    ]);
    generate.mockResolvedValue({
      ok: true,
      data: { items: [{
        topic: "reels-3min",
        title: "Reels de 3 minutos",
        // Nada disto está no feed. É exatamente a alucinação que virava lei.
        guidance: "Publique sempre às terças com legendas de dez linhas e desconto de trinta por cento.",
      }] },
    });

    await runRadarScan("ws1");

    const gravado = db.marketInsight.create.mock.calls.at(-1)![0].data;
    expect(gravado.status).toBe("pending");
    expect(gravado.approvedBy).toBeNull();
    expect(gravado.approvedAt).toBeNull();
  });

  it("fonte oficial + texto com lastro LITERAL no feed → ativo (a fonte disse aquilo)", async () => {
    process.env.RADAR_SOURCES = FONTE_OFICIAL;
    fetchFeedItems.mockResolvedValue([
      { title: "Reels aceita 3 minutos", summary: "O limite de duração dos Reels subiu para 3 minutos." },
    ]);
    generate.mockResolvedValue({
      ok: true,
      data: { items: [{ topic: "reels-3min", title: "Reels aceita 3 minutos", guidance: "O limite de duração subiu para 3 minutos." }] },
    });

    await runRadarScan("ws1");

    const gravado = db.marketInsight.create.mock.calls.at(-1)![0].data;
    expect(gravado.status).toBe("active");
    expect(gravado.approvedBy).toBe("official-source");
  });

  it("a biblioteca sozinha: `official` sem declarar extração cai no lado seguro", async () => {
    await addInsight({
      workspaceId: "ws1", domain: "social", topic: "t", title: "T",
      guidance: "g", source: "official", sourceName: "Meta",
    });
    expect(db.marketInsight.create.mock.calls[0]![0].data.status).toBe("pending");
  });

  it("a biblioteca sozinha: `official` + `literal_da_fonte` ativa e arquiva o tópico anterior", async () => {
    await addInsight({
      workspaceId: "ws1", domain: "social", topic: "t", title: "T",
      guidance: "g", source: "official", extraction: "literal_da_fonte", sourceName: "Meta",
    });
    expect(db.marketInsight.create.mock.calls[0]![0].data.status).toBe("active");
    expect(db.marketInsight.updateMany).toHaveBeenCalled();
  });

  it("texto de modelo carrega a ressalva no nome da fonte — quem lê o painel vê", async () => {
    await addInsight({
      workspaceId: "ws1", domain: "social", topic: "t", title: "T",
      guidance: "g", source: "official", sourceName: "Meta Newsroom",
    });
    expect(db.marketInsight.create.mock.calls[0]![0].data.sourceName).toContain("extraído por modelo");
  });
});

describe("o piso de lastro do Radar", () => {
  const feed = "1. Reels aceita 3 minutos — O limite de duração dos Reels subiu para 3 minutos.";

  it("aceita o que a fonte escreveu", () => {
    expect(temLastroLiteral("O limite de duração subiu para 3 minutos", feed)).toBe(true);
  });

  it("recusa o que a fonte não escreveu", () => {
    expect(temLastroLiteral("Publique sempre às terças com desconto", feed)).toBe(false);
  });

  it("COBERTURA TOTAL: um token de álibi verdadeiro não carrega a frase inventada", () => {
    // "Reels" existe no feed; "carrossel" e "terça" não. Limiar fracionário
    // deixaria passar — cobertura total não deixa.
    expect(temLastroLiteral("Reels em carrossel toda terça", feed)).toBe(false);
  });

  it("corta em conjunção: o modelo não é obrigado a pontuar", () => {
    expect(temLastroLiteral("O limite subiu para 3 minutos e publique com desconto", feed)).toBe(false);
  });

  it("fonte sem texto não atesta nada (fail-closed)", () => {
    expect(temLastroLiteral("qualquer coisa", "")).toBe(false);
  });
});

describe("o Radar deixou de confundir 'não achei nada' com 'quebrei'", () => {
  it("scan que explode aparece como falha — não como 0 propostas", async () => {
    db.marketInsight.findMany.mockRejectedValue(new Error("banco fora do ar"));
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBe(0);
    expect(r.falhas).toBe(5);          // os 5 domínios
    expect(r.cego).toBe(true);         // nenhum escopo rodou: "0" não é notícia do mercado
    expect(r.falhasDetalhe.length).toBeGreaterThan(0);
    expect(Object.values(r.statusPorEscopo).every((s) => s === "erro")).toBe(true);
  });

  it("IA fora do ar é distinguível de mercado calmo", async () => {
    generate.mockResolvedValue({ ok: false });
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBe(0);
    expect(r.cego).toBe(true);
    expect(Object.values(r.statusPorEscopo).every((s) => s === "ia_indisponivel")).toBe(true);
  });

  it("scan que rodou e não achou nada é 'ok' com zero — e não conta como falha", async () => {
    generate.mockResolvedValue({ ok: true, data: { items: [] } });
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBe(0);
    expect(r.falhas).toBe(0);
    expect(r.cego).toBe(false);
    expect(Object.values(r.statusPorEscopo).every((s) => s === "ok")).toBe(true);
  });

  it("feed mudo é erro da fonte, não silêncio do mercado", async () => {
    process.env.RADAR_SOURCES = FONTE_OFICIAL;
    generate.mockResolvedValue({ ok: true, data: { items: [] } });
    fetchFeedItems.mockResolvedValue([]);
    const r = await runRadarScan("ws1");
    expect(r.statusPorEscopo["Meta Newsroom"]).toBe("erro");
    expect(r.falhas).toBe(1);
    expect(r.cego).toBe(false);
  });
});

describe("os tópicos conhecidos deixaram de ser lidos à toa", () => {
  it("entram no PROMPT — o modelo passa a poder evitar a repetição", async () => {
    db.marketInsight.findMany.mockResolvedValue([{ topic: "ig-reels-curtos" }]);
    generate.mockResolvedValue({ ok: true, data: { items: [] } });
    await runRadarScan("ws1");
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toContain("ig-reels-curtos");
    expect(prompt).toMatch(/NÃO os repita/i);
  });

  it("a rede pós-resposta continua de pé: tópico repetido ainda é descartado", async () => {
    db.marketInsight.findMany.mockResolvedValue([{ topic: "ig-reels" }]);
    generate.mockResolvedValue({ ok: true, data: { items: [{ topic: "ig-reels", title: "x", guidance: "y" }] } });
    const r = await runRadarScan("ws1");
    expect(r.proposed).toBe(0);
    expect(db.marketInsight.create).not.toHaveBeenCalled();
  });
});
