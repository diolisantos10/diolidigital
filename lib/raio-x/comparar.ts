// A COMPARAÇÃO COM ONTEM — metade do valor do raio-x.
//
// "37 mensagens presas" não diz nada. "37, contra 4 ontem" diz tudo. É por isso
// que a coleta é código e não IA: IA coletando erra diferente toda noite, e duas
// listas que erram diferente não se comparam.
//
// A SUTILEZA QUE FAZ A COMPARAÇÃO NÃO MENTIR: achado que sumiu porque a
// varredura ficou CEGA não é achado resolvido. Uma varredura quebrada some com
// tudo que ela achava — e um relatório dizendo "8 problemas resolvidos" na noite
// em que a varredura parou de rodar é pior do que não ter raio-x nenhum.

import type { Achado, Coleta } from "./tipos";

export type Comparacao = {
  novos: Achado[];
  persistentes: Achado[];
  resolvidos: Achado[];
  /** Sumiram porque a varredura ficou cega — NÃO são resolvidos. */
  desconhecidos: Achado[];
  /** Medida → [ontem, hoje]. Só entra quando as duas noites mediram. */
  variacoes: Record<string, { ontem: number; hoje: number; delta: number }>;
  /** Varreduras que não olharam nada nesta noite, com o motivo. */
  cegas: Array<{ varredura: string; motivo: string }>;
};

function achadosDe(c: Coleta | null): Map<string, Achado> {
  const m = new Map<string, Achado>();
  if (!c) return m;
  for (const v of c.varreduras) for (const a of v.achados) m.set(a.chave, a);
  return m;
}

function varredurasCegas(c: Coleta | null): Set<string> {
  const s = new Set<string>();
  if (!c) return s;
  for (const v of c.varreduras) if (v.status === "cega") s.add(v.varredura);
  return s;
}

function medidasDe(c: Coleta | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!c) return out;
  for (const v of c.varreduras) {
    if (v.status !== "rodou") continue;
    for (const [k, n] of Object.entries(v.medidas)) out[k] = n;
  }
  return out;
}

/** De qual varredura veio um achado — precisa ser derivável para saber se ele
 *  "sumiu" ou se ninguém olhou. A varredura é a que declara o mesmo padrão. */
function varreduraDoAchado(c: Coleta, chave: string): string | null {
  for (const v of c.varreduras) if (v.achados.some((a) => a.chave === chave)) return v.varredura;
  return null;
}

export function comparar(hoje: Coleta, ontem: Coleta | null): Comparacao {
  const deHoje = achadosDe(hoje);
  const deOntem = achadosDe(ontem);
  const cegasHoje = varredurasCegas(hoje);

  const novos: Achado[] = [];
  const persistentes: Achado[] = [];
  const resolvidos: Achado[] = [];
  const desconhecidos: Achado[] = [];

  for (const [chave, a] of deHoje) (deOntem.has(chave) ? persistentes : novos).push(a);

  for (const [chave, a] of deOntem) {
    if (deHoje.has(chave)) continue;
    const origem = ontem ? varreduraDoAchado(ontem, chave) : null;
    if (origem && cegasHoje.has(origem)) desconhecidos.push(a);
    else resolvidos.push(a);
  }

  const mHoje = medidasDe(hoje);
  const mOntem = medidasDe(ontem);
  const variacoes: Comparacao["variacoes"] = {};
  for (const [k, n] of Object.entries(mHoje)) {
    if (!(k in mOntem)) continue;
    variacoes[k] = { ontem: mOntem[k]!, hoje: n, delta: n - mOntem[k]! };
  }

  const cegas = hoje.varreduras
    .filter((v) => v.status === "cega")
    .map((v) => ({ varredura: v.varredura, motivo: v.motivo ?? "sem motivo registrado" }));

  return { novos, persistentes, resolvidos, desconhecidos, variacoes, cegas };
}
