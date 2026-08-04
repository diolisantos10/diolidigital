// quality-auditor.ts — o agente de QUALIDADE audita cada entrega.
//
// MODO SOMBRA (por decisão do dono): a Qualidade avalia e REGISTRA o parecer,
// mas NÃO bloqueia — a entrega segue pro cliente como antes. Assim medimos se o
// juízo dela é bom antes de ligar o freio (virar bloqueante). Fail-open: se a IA
// da auditoria falhar, passa (a entrega já foi gerada por IA de qualquer forma).

import { generate } from "@/lib/ai/generate";

export interface QualityVerdict {
  verdict: "pass" | "flag";
  issues: string[];
  note: string;
}

export async function auditDeliverable(input: {
  deptLabel: string;
  title: string;
  content: string;
  brandContext: string;
  /** Diretrizes ATUAIS de mercado (Radar Dioli) — a Qualidade audita contra elas. */
  marketGuidelines?: string;
  /** O estado da leitura do feed, vindo da própria `SinteseDoFeed` — não de
   *  farejar substring no contexto. Ausente = fluxo que não leu feed nenhum. */
  feed?: { lida: boolean; posts: number };
  workspaceId: string;
}): Promise<QualityVerdict> {
  // O critério do feed real (pedido do CEO, 04/08/2026) tem TRÊS estados, e a
  // versão anterior só enxergava dois porque decidia farejando o texto do
  // contexto (`includes("FEED REAL DO CLIENTE")`). Conta conectada com ZERO
  // posts produz exatamente essa substring SEM a marca "feed não lido" — e o
  // juiz era perguntado "isto conversa com o feed real do cliente?" sobre um
  // feed que não existe. Pergunta sem referente só pode ser respondida por
  // invenção. Agora o estado vem do booleano da síntese.
  const estado: "lido" | "semPosts" | "naoLido" | "desconhecido" =
    !input.feed ? "desconhecido"
    : !input.feed.lida ? "naoLido"
    : input.feed.posts > 0 ? "lido"
    : "semPosts";

  const criterioDoFeed = estado === "lido"
    ? ` (6) a peça CONVERSA com o FEED REAL DO CLIENTE descrito no contexto — mesma família de tom, tema e formato do que ele já publica, sem destoar nem copiar?`
    : "";
  const avisoSemFeed =
    estado === "naoLido"
      ? `\nATENÇÃO: o feed do cliente NÃO foi lido nesta produção. NÃO avalie aderência ao feed e NÃO penalize a peça por isso.`
      : estado === "semPosts"
        ? `\nATENÇÃO: a conta do cliente está conectada e NÃO tem nenhum post publicado — não existe feed contra o qual comparar. NÃO avalie aderência ao feed, NÃO penalize a peça por isso e NÃO descreva um estilo anterior que não existe.`
        : "";
  try {
    const result = await generate({
      system: "Você é o agente de Qualidade de uma agência de marketing brasileira. Audite a entrega abaixo com rigor — NÃO reescreva, só avalie. Responda SOMENTE com JSON válido.",
      user: `ENTREGA (${input.deptLabel}) — "${input.title}":
${input.content}

CONTEXTO DA MARCA:
${input.brandContext}
${input.marketGuidelines ? `\n${input.marketGuidelines}\n` : ""}
Verifique: (1) está no tom e no segmento certos? (2) tem promessa falsa ou garantia irreal? (3) inventa número/preço/dado que não foi fornecido? (4) tem clichê vazio ou erro grave? (5) está alinhada às diretrizes ATUAIS de mercado acima (quando houver)?${criterioDoFeed}${avisoSemFeed}
Responda JSON: {"verdict":"pass"|"flag","issues":["problema 1","problema 2"],"note":"1 frase de parecer"}. verdict="flag" só se houver problema real.`,
      maxTokens: 500,
      workspaceId: input.workspaceId,
      preferredProvider: "claude",
    });
    if (!result.ok) return { verdict: "pass", issues: [], note: "auditoria indisponível (IA) — passou em sombra" };
    const d = result.data as Record<string, unknown>;
    const verdict = d.verdict === "flag" ? "flag" : "pass";
    const issues = Array.isArray(d.issues) ? d.issues.filter((x): x is string => typeof x === "string") : [];
    const note = typeof d.note === "string" ? d.note : "";
    return { verdict, issues, note };
  } catch {
    return { verdict: "pass", issues: [], note: "auditoria falhou — passou em sombra" };
  }
}
