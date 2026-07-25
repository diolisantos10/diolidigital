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

/**
 * Fontes configuradas. Lê de RADAR_SOURCES (JSON array). Vazio por padrão — o
 * dono pluga os feeds confiáveis quando quiser ligar as fontes ao vivo.
 * Exemplo de RADAR_SOURCES:
 *   [{"name":"Meta Newsroom","domain":"social","url":"https://.../rss","official":true}]
 */
export function getConfiguredSources(): RadarSource[] {
  const raw = process.env.RADAR_SOURCES;
  if (!raw) return [];
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
