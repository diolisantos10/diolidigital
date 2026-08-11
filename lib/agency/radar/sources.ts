// sources.ts — as FONTES ao vivo do Radar Dioli (Fase 3).
//
// Registro das fontes que o Radar consulta (feeds/RSS das plataformas). Config
// por env RADAR_SOURCES (JSON) — DESLIGADO por padrão: sem fonte configurada, o
// Radar segue só propondo pela IA (Fase 2), sem risco de raspar dado ruim.
//
// GOVERNANÇA: uma fonte marcada `official: true` (o blog/newsroom da própria
// plataforma) alimenta insights que entram ATIVOS; qualquer outra alimenta
// insights que entram PENDENTES (validação humana). É a regra do dono aplicada
// na origem.

import type { InsightDomain } from "@/lib/agency/radar/library";

export interface RadarSource {
  name: string;          // ex.: "Meta Newsroom"
  domain: InsightDomain; // a que domínio os itens alimentam
  url: string;           // feed RSS/Atom
  official: boolean;     // true = plataforma oficial → insights ATIVOS
}

// ─── AS FONTES QUE VÊM DE FÁBRICA ───────────────────────────────────────────
//
// Até 11/08/2026 esta lista nascia VAZIA, e o Radar só funcionava se alguém
// colasse um JSON na variável `RADAR_SOURCES`. Ninguém colou — e o resultado é
// que a tela de mercado da casa mostrava **o que um modelo lembrava**, não o que
// as plataformas publicaram.
//
// Mecanismo que depende de um humano colar configuração é mecanismo desligado.
// Por isso as fontes passam a vir no código, e a variável de ambiente vira o que
// deveria ter sido desde o começo: a EXCEÇÃO, não o interruptor.
//
// ── CADA URL ABAIXO FOI BUSCADA E CONFERIDA EM 11/08/2026 ─────────────────
//
// E a conferência não foi olhar o código de resposta — foi olhar o CORPO. Duas
// candidatas óbvias foram reprovadas **justamente por passarem no teste fácil**:
//
//   • `newsroom.tiktok.com/en-us/rss.xml`  → HTTP 200 devolvendo HTML
//   • `about.instagram.com/blog/rss`       → HTTP 200 devolvendo HTML
//
// Duzentos com HTML é a pior resposta possível: parece viva, e o leitor extrai
// zero item dela. Ficam nomeadas aqui para ninguém "consertar o Radar"
// adicionando as duas de novo sem antes abrir o corpo da resposta.
const FONTES_DE_FABRICA: RadarSource[] = [
  // Mudança de produto e de política da Meta — o que muda o que se pode postar.
  { name: "Meta Newsroom", domain: "social", url: "https://about.fb.com/news/feed/", official: true },
  // Mudança de API e de permissão. É a fonte que avisa quando o chão da casa se
  // mexe: existe UM aplicativo, e ele serve WhatsApp e Instagram ao mesmo tempo.
  { name: "Meta Developers", domain: "social", url: "https://developers.facebook.com/blog/feed/", official: true },
  // Anúncio: formato novo, lance, política de campanha.
  { name: "Google Ads & Commerce", domain: "paid-traffic", url: "https://blog.google/products/ads-commerce/rss/", official: true },
  { name: "YouTube Blog", domain: "social", url: "https://blog.youtube/rss/", official: true },
  // NÃO é fonte oficial de plataforma — é imprensa especializada. Por isso
  // `official: false`, e o que sai dela entra PENDENTE de validação humana. É a
  // regra do dono aplicada na ORIGEM, e não depois.
  { name: "Search Engine Journal", domain: "seo", url: "https://www.searchenginejournal.com/feed/", official: false },
];

/**
 * Fontes configuradas.
 *
 * `RADAR_SOURCES` (JSON array) SUBSTITUI a lista de fábrica por inteiro — quem
 * define a variável está dizendo "eu sei quais fontes quero". Uma lista vazia
 * explícita (`[]`) desliga as fontes ao vivo, e é assim que se desliga: dizendo,
 * não omitindo.
 */
export function getConfiguredSources(): RadarSource[] {
  const raw = process.env.RADAR_SOURCES;
  if (!raw) return FONTES_DE_FABRICA;
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => s as Partial<RadarSource>)
      .filter((s): s is RadarSource =>
        typeof s.name === "string" && typeof s.url === "string" && typeof s.domain === "string" && typeof s.official === "boolean")
      .slice(0, 20);
  } catch {
    return [];
  }
}
