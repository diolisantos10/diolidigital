// escopo-do-ajuste.ts — O AJUSTE SÓ MEXE NO QUE O CLIENTE APONTOU.
//
// ═══════════════════════════════════════════════════════════════════════════
// A REGRA (Diretor Geral, 27/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
//     "O ajuste só mexe no que o cliente apontou. O resto fica congelado."
//
// Até aqui, *"ajustar uma coisa"* e *"reescrever a entrega inteira"* eram a
// MESMA PORTA: a refação mandava o entregável inteiro ao modelo e gravava o
// que voltasse. Medido na rodada paga: o cliente pediu **mais luz na arte** e
// recebeu, de brinde, uma legenda nova que ele nunca pediu — com um dia da
// semana que não existe no calendário dele e com o briefing colado no texto.
//
// Do lado de quem paga, isso não é generosidade: é perder o que já estava
// aprovado. Ele mandou trocar o pneu e o carro voltou com outra pintura.
//
// ═══════════════════════════════════════════════════════════════════════════
// COMO A REGRA VIRA MECÂNICA
// ═══════════════════════════════════════════════════════════════════════════
//
// Duas metades, e as duas moram aqui porque separadas divergem:
//
//   1. **LER O PEDIDO** — que faces da peça o cliente citou (a arte? a
//      legenda? o título? a data? o formato?).
//   2. **CONGELAR O RESTO** — campo por campo, o valor NOVO é descartado e o
//      ANTERIOR volta. Não é pedir ao modelo que preserve (isso é aviso); é
//      não deixar o valor novo ser gravado (isso é trava).
//
// ⚠️ E O SILÊNCIO NÃO LIBERA. Quando o comentário não cita face nenhuma
// ("está ruim, refaz"), o escopo sai `incerto` e NADA é congelado — é um
// pedido de refação ampla, e tratá-lo como estreito devolveria a mesma peça ao
// cliente com um ajuste que ele não reconhece. *Ausência de informação não é
// informação*: aqui ela é declarada (`incerto`), não interpretada.
//
// ⚠️ PURO. Não fala com banco, não chama IA.

/** As faces de uma peça que o cliente pode apontar. */
export type FaceDaPeca = "arte" | "legenda" | "titulo" | "data" | "formato" | "pilar" | "cta";

/**
 * Que CAMPOS do item do entregável cada face governa.
 *
 * As chaves são as de `CAMPOS_DA_ENTREGA` (`renderizar-entrega.ts`) — a mesma
 * lista que o renderizador emite e que `extrairPecas` lê. Uma segunda grafia
 * aqui congelaria um campo que não existe e deixaria passar o que existe.
 */
export const CAMPOS_DA_FACE: Record<FaceDaPeca, readonly string[]> = {
  arte: ["visual", "direction", "palette", "cenas"],
  legenda: ["caption", "note"],
  titulo: ["headline"],
  data: ["data", "date", "quando"],
  formato: ["format"],
  pilar: ["pillar"],
  cta: ["cta", "audience"],
};

/** Todo campo que este módulo sabe congelar. */
const TODOS_OS_CAMPOS: string[] = Array.from(new Set(Object.values(CAMPOS_DA_FACE).flat()));

/**
 * O vocabulário do cliente, por face.
 *
 * São as palavras que ele usa, não as que a casa usa: ele escreve "foto",
 * "fundo", "escuro", "clara" — nunca "direção de arte". A lista é generosa de
 * propósito do lado de RECONHECER (falso positivo aqui só amplia o escopo, que
 * é o comportamento de hoje) e nunca adivinha do lado de congelar.
 */
const PALAVRAS: Record<FaceDaPeca, RegExp> = {
  arte: /\b(arte|imagem|foto|fotografia|visual|fundo|luz|luminosidade|clar[oa]|escur[oa]|ilumina|cor|cores|paleta|contraste|enquadr|composi[çc][ãa]o|prato|produto em primeiro plano|primeiro plano|design|layout|tipografia|logo)/i,
  legenda: /\b(legenda|texto|copy|descri[çc][ãa]o|caption|escrit[oa]|reda[çc][ãa]o|palavr)/i,
  titulo: /\b(t[íi]tulo|headline|chamada|frase de cima|gancho)/i,
  data: /\b(data|dia|semana|calend[áa]rio|agenda|hor[áa]rio|quando|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i,
  formato: /\b(formato|carrossel|story|stories|reel|feed|v[íi]deo|est[áa]tic[oa]|telas?)/i,
  pilar: /\b(pilar|tema|assunto|editorial)/i,
  cta: /\b(cta|chamada para a[çc][ãa]o|call to action|link|bio|whats)/i,
};

export interface EscopoDoAjuste {
  /** As faces que o cliente citou. Vazio quando `incerto`. */
  faces: FaceDaPeca[];
  /**
   * O comentário não citou face nenhuma — é pedido AMPLO, e nada é congelado.
   * Declarado, nunca inferido como "então não muda nada".
   */
  incerto: boolean;
  /** Os campos do item que PODEM mudar. Em escopo incerto, todos. */
  camposLiberados: string[];
  /** Os campos que ficam como estavam. Vazio em escopo incerto. */
  camposCongelados: string[];
}

/** O que o cliente apontou, lido das palavras dele. */
export function escopoDoAjuste(comentario: string | null | undefined): EscopoDoAjuste {
  const texto = (comentario ?? "").trim();
  const faces = (Object.keys(PALAVRAS) as FaceDaPeca[]).filter((f) => PALAVRAS[f].test(texto));

  if (faces.length === 0) {
    return { faces: [], incerto: true, camposLiberados: [...TODOS_OS_CAMPOS], camposCongelados: [] };
  }

  const liberados = new Set<string>();
  for (const f of faces) for (const c of CAMPOS_DA_FACE[f]) liberados.add(c);
  return {
    faces,
    incerto: false,
    camposLiberados: [...liberados],
    camposCongelados: TODOS_OS_CAMPOS.filter((c) => !liberados.has(c)),
  };
}

/** O que o congelamento efetivamente segurou — é o que vira registro. */
export interface Congelamento {
  itens: Record<string, unknown>[];
  /** `"2:caption"` — item (1-based) e campo. Vazio = nada foi segurado. */
  segurados: string[];
}

/**
 * CONGELA o que o cliente não pediu para mudar.
 *
 * Casa item a item POR POSIÇÃO, que é a mesma correspondência que
 * `refazer-a-arte-do-ajuste.ts` usa para levar texto novo à peça certa. Quando
 * a contagem não bate, NADA é congelado e o campo `segurados` sai vazio: o
 * contrato de saída (`conferirContrato`) já barra a entrega que encolheu, e
 * misturar o campo de um item com o do vizinho é o defeito que essa mesma
 * correspondência existe para não cometer.
 */
export function congelarItens(
  anteriores: readonly Record<string, unknown>[],
  novos: readonly Record<string, unknown>[],
  escopo: EscopoDoAjuste,
): Congelamento {
  if (escopo.incerto || escopo.camposCongelados.length === 0) {
    return { itens: novos.map((i) => ({ ...i })), segurados: [] };
  }
  if (anteriores.length !== novos.length || anteriores.length === 0) {
    return { itens: novos.map((i) => ({ ...i })), segurados: [] };
  }

  const segurados: string[] = [];
  const itens = novos.map((novo, i) => {
    const antes = anteriores[i] ?? {};
    const saida: Record<string, unknown> = { ...novo };
    for (const campo of escopo.camposCongelados) {
      const valorAntes = antes[campo];
      const valorNovo = saida[campo];
      const tinha = typeof valorAntes === "string" && valorAntes.trim().length > 0;
      const mudou = String(valorNovo ?? "").trim() !== String(valorAntes ?? "").trim();
      if (!tinha || !mudou) continue;
      saida[campo] = valorAntes;
      segurados.push(`${i + 1}:${campo}`);
    }
    return saida;
  });
  return { itens, segurados };
}

/** A frase que a equipe (e o registro da versão) lê quando algo foi segurado. */
export function motivoDoCongelamento(escopo: EscopoDoAjuste, c: Congelamento): string {
  if (c.segurados.length === 0) return "";
  return (
    `congelei ${c.segurados.length} campo(s) que o cliente NÃO pediu para mudar ` +
    `(${c.segurados.join(", ")}) — ele apontou ${escopo.faces.join(", ")}. ` +
    "O que ele já tinha aprovado continua exatamente como estava."
  );
}
