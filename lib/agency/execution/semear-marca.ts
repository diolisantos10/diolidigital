// semear-marca.ts — o briefing do cliente vira o CÉREBRO DE MARCA dele.
//
// O buraco que isto fecha, e ele era grande: em 01/08/2026 a produção tinha
// clientes, projetos e entregas — e **zero** `BrandBrain`. Nenhum. Nunca foi
// gravado um.
//
// A razão: o `BrandBrain` só era escrito por um formulário que alguém da agência
// precisava preencher à mão, ou por um aprendizado que alguém precisava aprovar.
// Numa agência que roda sem gente olhando, isso significa **nunca**.
//
// A consequência silenciosa: o motor de produção lê a marca antes de acionar
// cada especialista (`run-execution.ts`). Encontrando vazio, ele não avisa nada
// — só produz sem saber a cor, o tom de voz nem o público do cliente. Peça
// bonita e genérica, que serviria para qualquer negócio. É exatamente o que
// separa "a agência entregou" de "a agência entendeu o meu negócio".
//
// O que este módulo faz: colhe o que o cliente JÁ CONTOU no briefing e grava
// como ponto de partida. Não inventa nada — campo que o cliente não preencheu
// fica nulo, e nulo continua fazendo o especialista pedir o material.

import { prisma } from "@/lib/db/client";

/** O briefing chega como JSON livre. Estes são os apelidos que cada campo pode
 *  ter, porque o formulário mudou de nome mais de uma vez e briefing antigo
 *  continua valendo. Procurar por um nome só é perder dado que está lá. */
const APELIDOS: Record<string, string[]> = {
  tone: ["toneOfVoice", "tone", "tomDeVoz", "tom", "brandVoice", "voz"],
  targetAudience: ["targetAudience", "publicoAlvo", "publico", "audience", "clienteIdeal"],
  positioning: ["positioning", "posicionamento", "diferencial", "proposta"],
  primaryColor: ["primaryColor", "corPrimaria", "corPrincipal"],
  secondaryColor: ["secondaryColor", "corSecundaria"],
  typography: ["typography", "fonts", "fontes", "tipografia"],
  tagline: ["tagline", "slogan", "assinatura"],
  brandName: ["brandName", "nomeDaMarca", "marca"],
};

/** Cores costumam vir juntas numa frase ("preto, vermelho e branco" ou
 *  "#1A1A1A · #C0392B"). Separar é o que permite guardar primária e secundária. */
function separarCores(bruto: string): [string | null, string | null] {
  const hex = bruto.match(/#[0-9a-fA-F]{3,8}/g);
  if (hex && hex.length) return [hex[0] ?? null, hex[1] ?? null];
  const partes = bruto.split(/[·,;]|\se\s/).map((p) => p.trim()).filter(Boolean);
  return [partes[0] ?? null, partes[1] ?? null];
}

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 600);
  if (Array.isArray(v) && v.length) return v.filter((x) => typeof x === "string").join(", ").slice(0, 600) || null;
  return null;
}

/** Varre o objeto do briefing (raiz e `scope`) procurando por qualquer apelido. */
function colher(fonte: Record<string, unknown>, chaves: string[]): string | null {
  for (const k of chaves) {
    const achado = texto(fonte[k]);
    if (achado) return achado;
  }
  return null;
}

export interface MarcaSemeada {
  criou: boolean;
  camposPreenchidos: string[];
  /** O que o cliente NÃO contou. Vira pedido de material, nunca invenção. */
  camposVazios: string[];
}

/**
 * Semeia o `BrandBrain` a partir do briefing. Idempotente e conservador:
 * **nunca sobrescreve** um campo já preenchido — o que a agência ajustou à mão,
 * ou o que o Brain aprendeu depois, vale mais que o briefing inicial.
 */
export async function semearMarcaDoBriefing(
  clientId: string,
  clientRequestId: string,
): Promise<MarcaSemeada> {
  const req = await prisma.clientRequestDb.findUnique({
    where: { id: clientRequestId },
    select: { businessName: true, briefingJson: true, rawContext: true },
  });
  const vazio: MarcaSemeada = { criou: false, camposPreenchidos: [], camposVazios: [] };
  if (!req) return vazio;

  const briefing = (() => {
    try { return JSON.parse(req.briefingJson ?? "{}") as Record<string, unknown>; } catch { return {}; }
  })();
  const scope = (briefing.scope ?? {}) as Record<string, unknown>;
  const brandBlock = (briefing.brand ?? briefing.marca ?? {}) as Record<string, unknown>;
  // Um só lugar para procurar: o mais específico ganha do mais genérico.
  const fonte: Record<string, unknown> = { ...briefing, ...scope, ...brandBlock };

  const cores = colher(fonte, ["colors", "cores", "paleta", "colorPalette"]);
  const [primaria, secundaria] = cores ? separarCores(cores) : [null, null];

  const campos = {
    brandName: colher(fonte, APELIDOS.brandName) ?? req.businessName ?? null,
    tagline: colher(fonte, APELIDOS.tagline),
    tone: colher(fonte, APELIDOS.tone),
    targetAudience: colher(fonte, APELIDOS.targetAudience),
    positioning: colher(fonte, APELIDOS.positioning),
    primaryColor: colher(fonte, APELIDOS.primaryColor) ?? primaria,
    secondaryColor: colher(fonte, APELIDOS.secondaryColor) ?? secundaria,
    typography: colher(fonte, APELIDOS.typography),
  };

  const existente = await prisma.brandBrain.findUnique({ where: { clientId } });

  // Só grava o que está vazio hoje. Ajuste manual e aprendizado do Brain são
  // mais recentes e mais confiáveis que o briefing de entrada.
  const paraGravar: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (!v) continue;
    if (existente && (existente as unknown as Record<string, unknown>)[k]) continue;
    paraGravar[k] = v;
  }

  if (!existente) {
    await prisma.brandBrain.create({ data: { clientId, ...paraGravar } });
  } else if (Object.keys(paraGravar).length > 0) {
    await prisma.brandBrain.update({ where: { clientId }, data: paraGravar });
  }

  return {
    criou: !existente,
    camposPreenchidos: Object.keys(paraGravar),
    camposVazios: Object.entries(campos).filter(([, v]) => !v).map(([k]) => k),
  };
}
