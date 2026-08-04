// quality-auditor.ts — o agente de QUALIDADE audita cada entrega.
//
// ── TRÊS ESTADOS, NÃO DOIS (decisão do CEO, 04/08/2026) ──────────────────────
//
// Até hoje este arquivo devolvia `pass` em três situações que NÃO são a mesma
// coisa: a peça foi olhada e está boa; a IA da auditoria caiu; a IA respondeu
// lixo. As três viravam "quality_ok" no banco e a peça seguia ao cliente como
// se um árbitro tivesse dito sim. O único freio da casa dizia "sim" na dúvida.
//
// A regra da casa (CLAUDE.md, P0 item 2) pede as duas metades separadas:
// **reprovação BLOQUEANTE** e **indisponibilidade NÃO-bloqueante**. Fundidas num
// `pass` só, nenhuma das duas existe de verdade. Agora:
//
//   • `aprovado`     → o juiz olhou e aprovou.
//   • `reprovado`    → o juiz olhou e reprovou. BLOQUEIA a apresentação
//                      (`marcos.apresentar` / `mes.apresentarCiclo` recusam
//                      enquanto houver `quality_flag`), e `pacote-travado.ts`
//                      refaz até 2 tentativas antes de escalar.
//   • `nao_auditado` → NINGUÉM olhou (IA fora do ar, timeout, resposta
//                      inválida). NÃO bloqueia — a operação não pode parar
//                      porque um provedor caiu — mas fica declarado com todas
//                      as letras, no banco e num ActivityEvent, para ser
//                      possível responder depois "quantas peças foram ao
//                      cliente sem árbitro?".
//
// Vazio é vazio: `nao_auditado` NUNCA pode ser lido como `aprovado`. É por isso
// que o mapeamento para o banco mora AQUI (`revisionStatusDoVeredito`) e não
// espalhado em `? :` no chamador — string comparada à mão é como o bug volta.

import { generate } from "@/lib/ai/generate";

/** O parecer possível da Qualidade. Três estados, de propósito — ver o topo. */
export type VereditoDaQualidade = "aprovado" | "reprovado" | "nao_auditado";

/** Por que a peça não foi auditada. Só existe quando `verdict === "nao_auditado"`. */
export type MotivoDeNaoAuditar = "ia_indisponivel" | "timeout" | "erro" | "resposta_invalida";

export interface QualityVerdict {
  verdict: VereditoDaQualidade;
  issues: string[];
  note: string;
  /** Preenchido SOMENTE em `nao_auditado`. Presente = ninguém olhou a peça. */
  motivo?: MotivoDeNaoAuditar;
}

/**
 * O `revisionStatus` que cada veredito grava no `Deliverable`.
 *
 * Único ponto de tradução veredito → banco. Quem precisar ler o estado da
 * Qualidade importa daqui em vez de comparar string na mão.
 */
export const REVISION_STATUS_DA_QUALIDADE = {
  aprovado: "quality_ok",
  reprovado: "quality_flag",
  nao_auditado: "quality_nao_auditado",
} as const satisfies Record<VereditoDaQualidade, string>;

export type RevisionStatusDaQualidade =
  (typeof REVISION_STATUS_DA_QUALIDADE)[VereditoDaQualidade];

export function revisionStatusDoVeredito(v: VereditoDaQualidade): RevisionStatusDaQualidade {
  return REVISION_STATUS_DA_QUALIDADE[v];
}

/**
 * A peça foi OLHADA e APROVADA por um árbitro?
 *
 * Só `aprovado` responde `true`. Existe para que nenhum contador, tela ou
 * relatório precise escrever `!== "reprovado"` — que é exatamente a forma de
 * contar "não auditado" como aprovado com outra roupa.
 */
export function foiAprovadaPelaQualidade(v: VereditoDaQualidade): boolean {
  return v === "aprovado";
}

/** A peça foi reprovada por um árbitro que a olhou? (o que bloqueia) */
export function foiReprovadaPelaQualidade(v: VereditoDaQualidade): boolean {
  return v === "reprovado";
}

/** Ninguém olhou a peça. (não bloqueia, mas precisa ficar declarado) */
export function ficouSemArbitro(v: VereditoDaQualidade): boolean {
  return v === "nao_auditado";
}

/** Teto de espera do juiz. Provedor que pendura a conexão travaria a produção
 *  inteira sem isto — e "travou" seria contado como... nada. Estourou: a peça
 *  não fica reprovada nem aprovada; fica declarada como não auditada. */
export const AUDIT_TIMEOUT_MS = 45_000;

const MOTIVO_EM_PALAVRAS: Record<MotivoDeNaoAuditar, string> = {
  ia_indisponivel: "NÃO AUDITADA: a IA da Qualidade estava indisponível — nenhum árbitro olhou esta peça.",
  timeout: "NÃO AUDITADA: a IA da Qualidade não respondeu a tempo — nenhum árbitro olhou esta peça.",
  erro: "NÃO AUDITADA: a auditoria falhou com erro — nenhum árbitro olhou esta peça.",
  resposta_invalida: "NÃO AUDITADA: a IA da Qualidade respondeu fora do formato — o parecer não pôde ser lido.",
};

function semArbitro(motivo: MotivoDeNaoAuditar): QualityVerdict {
  return { verdict: "nao_auditado", issues: [], note: MOTIVO_EM_PALAVRAS[motivo], motivo };
}

/** Lê o veredito do JSON do modelo SEM inventar o benefício da dúvida.
 *  Qualquer coisa que não seja um dos dois rótulos conhecidos é resposta que
 *  não dá para interpretar — e não interpretar é `nao_auditado`, não `pass`. */
function lerVeredito(bruto: unknown): "aprovado" | "reprovado" | null {
  if (typeof bruto !== "string") return null;
  const v = bruto.trim().toLowerCase();
  if (v === "flag" || v === "reprovado" || v === "fail") return "reprovado";
  if (v === "pass" || v === "aprovado" || v === "ok") return "aprovado";
  return null;
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
    const chamada = generate({
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

    // O timeout é do AUDITOR, não do provedor: provedor que pendura a conexão
    // seguraria a produção inteira, e "a produção travou" não é um veredito.
    let estourou = false;
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      chamada,
      new Promise<null>((resolve) => {
        relogio = setTimeout(() => { estourou = true; resolve(null); }, AUDIT_TIMEOUT_MS);
      }),
    ]);
    if (relogio) clearTimeout(relogio);
    // Uma chamada abandonada que rejeita depois viraria unhandled rejection.
    void Promise.resolve(chamada).catch(() => { /* já respondemos nao_auditado */ });

    if (estourou || !result) return semArbitro("timeout");
    if (!result.ok) return semArbitro("ia_indisponivel");

    const d = result.data as Record<string, unknown>;
    const veredito = lerVeredito(d.verdict);
    // Resposta que não traz veredito legível NÃO é aprovação. Este `return` é o
    // conserto do `d.verdict === "flag" ? "flag" : "pass"` antigo, onde `{}`,
    // `null` e "talvez" todos viravam aprovação silenciosa.
    if (veredito === null) return semArbitro("resposta_invalida");

    const issues = Array.isArray(d.issues) ? d.issues.filter((x): x is string => typeof x === "string") : [];
    const note = typeof d.note === "string" ? d.note : "";
    return { verdict: veredito, issues, note };
  } catch {
    return semArbitro("erro");
  }
}
