import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchFeedItems } from "@/lib/agency/radar/fetcher";
import { getConfiguredSources } from "@/lib/agency/radar/sources";

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>Instagram muda ranking de Reels</title><link>https://x/1</link><description><![CDATA[Agora prioriza retenção nos primeiros 3s.]]></description></item>
  <item><title>Novo formato de anúncio</title><link>https://x/2</link><description>Detalhes do formato.</description></item>
</channel></rss>`;

const OLD = process.env.RADAR_SOURCES;
afterEach(() => { if (OLD === undefined) delete process.env.RADAR_SOURCES; else process.env.RADAR_SOURCES = OLD; vi.unstubAllGlobals(); });
beforeEach(() => vi.clearAllMocks());

describe("Radar Dioli — buscador de feed (fetcher)", () => {
  it("parseia itens de RSS (title/link/summary)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => RSS }));
    const items = await fetchFeedItems("https://feed");
    expect(items).toHaveLength(2);
    expect(items[0].title).toMatch(/Reels/);
    expect(items[0].summary).toMatch(/retenção/);
  });

  it("fail-safe: erro de rede → [] (nunca lança)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await fetchFeedItems("https://feed")).toEqual([]);
  });

  it("resposta não-ok → []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }));
    expect(await fetchFeedItems("https://feed")).toEqual([]);
  });
});

describe("Radar Dioli — registro de fontes (governança na origem)", () => {
  it("sem RADAR_SOURCES → vazio (fontes desligadas por padrão)", () => {
    delete process.env.RADAR_SOURCES;
    expect(getConfiguredSources()).toEqual([]);
  });

  it("parseia fontes válidas; oficial e não-oficial", () => {
    process.env.RADAR_SOURCES = JSON.stringify([
      { name: "Meta Newsroom", domain: "social", url: "https://meta/rss", official: true },
      { name: "Blog X", domain: "design", url: "https://x/rss", official: false },
    ]);
    const s = getConfiguredSources();
    expect(s).toHaveLength(2);
    expect(s[0].official).toBe(true);
  });

  it("JSON inválido → vazio (nunca quebra)", () => {
    process.env.RADAR_SOURCES = "{nope";
    expect(getConfiguredSources()).toEqual([]);
  });
});
