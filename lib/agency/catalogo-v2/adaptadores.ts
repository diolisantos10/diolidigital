// ADAPTADORES DE SLUG — a ponte entre o legado e o catálogo canônico.
//
// Marco 2 da V2. Regra do plano de migração: "não reutilizar slug legado sem
// mapear significado". Este módulo é o ÚNICO lugar onde um slug antigo vira
// canônico (e volta). Os dois sentidos são TOTAIS sobre os vocabulários
// conhecidos e testados nos dois lados — slug desconhecido devolve
// `undefined`, e `undefined` não é "pode passar": quem chama trata como
// recusa (fail-closed, o mesmo desenho da escada).
//
// Fontes legadas mapeadas (inventário do Marco 1):
//   1. BRAIN_DEPARTMENTS        — 9 ids, inclui `financeiro`
//   2. organizacao/departamentos — 11 ids, inclui `brand-hub` e `financeiro`
//   3. execution/especialistas   — ids de produção
//   4. portal/vista-do-cliente   — chaves de exibição (social, trafego, pm…)
//   5. escada (`prospeccao`)     — vira FUNÇÃO, não departamento

import { departamentoV2, funcaoV2 } from "./catalogo";

/** Legado → canônico. Identidade para o que já é canônico. */
const DE_LEGADO: Record<string, string> = {
  // renomeações reais
  financeiro: "finance",
  "brand-hub": "branding",
  // chaves de exibição do portal
  social: "social-media",
  trafego: "paid-traffic",
  pm: "project-management",
  // já-canônicos (identidade explícita, para o mapa ser total e testável)
  "client-service-sdr": "client-service-sdr",
  "project-management": "project-management",
  strategy: "strategy",
  branding: "branding",
  "social-media": "social-media",
  design: "design",
  "paid-traffic": "paid-traffic",
  analytics: "analytics",
  quality: "quality",
  finance: "finance",
  operations: "operations",
  "product-technology": "product-technology",
};

/**
 * `prospeccao` era "departamento" na escada por não ter especialista de
 * entregável. Na V2 é a função `prospecting` de `client-service-sdr`.
 */
const LEGADO_QUE_VIRA_FUNCAO: Record<string, string> = {
  prospeccao: "prospecting",
};

/** Canônico → slug legado principal (para escrever em estruturas antigas). */
const PARA_LEGADO: Record<string, string> = {
  finance: "financeiro",
  branding: "brand-hub",
};

export function deSlugLegado(slug: string): string | undefined {
  const canonico = DE_LEGADO[slug];
  if (!canonico) return undefined;
  return departamentoV2(canonico) ? canonico : undefined;
}

export function funcaoDeSlugLegado(slug: string): string | undefined {
  const funcao = LEGADO_QUE_VIRA_FUNCAO[slug];
  if (!funcao) return undefined;
  return funcaoV2(funcao) ? funcao : undefined;
}

/**
 * Para escrever em estrutura legada durante a migração (leitura dupla).
 * Canônico sem renomeação devolve o próprio id — que É o slug legado nas
 * fontes 1–3 quando coincidem.
 */
export function paraSlugLegado(canonico: string): string | undefined {
  if (!departamentoV2(canonico)) return undefined;
  return PARA_LEGADO[canonico] ?? canonico;
}
