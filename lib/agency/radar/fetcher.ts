// fetcher.ts — busca itens recentes de um feed (RSS/Atom). Leve, sem dependência
// nova: extrai title/link/summary por regex. Fail-safe: qualquer erro → [].
// Bounded: no máximo N itens por feed (não estoura o prompt nem o tempo).

const MAX_ITEMS = 6;
const FETCH_TIMEOUT_MS = 12_000;

export interface FeedItem {
  title: string;
  link: string;
  summary: string;
}

function stripTags(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripTags(m[1]) : "";
}

/** Busca itens de um feed RSS/Atom. Nunca lança — retorna [] em qualquer falha. */
export async function fetchFeedItems(url: string): Promise<FeedItem[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "RadarDioli/1.0" } });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();

    // RSS <item> ou Atom <entry>.
    const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
    const items: FeedItem[] = [];
    for (const block of blocks.slice(0, MAX_ITEMS)) {
      const title = pick(block, "title");
      const link = pick(block, "link") || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
      const summary = pick(block, "description") || pick(block, "summary") || pick(block, "content");
      if (title) items.push({ title, link, summary: summary.slice(0, 500) });
    }
    return items;
  } catch {
    return [];
  }
}
