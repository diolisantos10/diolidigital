// COMO CADA PROVEDOR GARANTE O FORMATO — a pergunta que ninguém era obrigado a
// responder, e o buraco que isso abriu.
//
// ─── O ACHADO QUE CRIOU ESTE ARQUIVO (24/08/2026) ───────────────────────────
//
// A bateria do cliente falso rodou ao vivo pela primeira vez e barrou 10 de 16
// turnos. O laudo de forma foi unânime, em DUAS rodadas independentes:
//
//     "o modelo não abriu JSON nenhum (respondeu em prosa, 201–319 caracteres)"
//
// Não era corte pelo teto de tokens, não era preâmbulo antes do pacote, não era
// erro dentro do JSON. O modelo escrevia uma resposta conversacional perfeita e
// simplesmente NÃO a embrulhava no envelope pedido.
//
// Ao abrir `lib/ai/generate.ts` para consertar, o defeito apareceu maior do que
// o SDR. A camada JÁ tratava esta pergunta — só que caladamente, e só para uns:
//
//     openai      → `response_format: {type:"json_object"}`   (garante)
//     deepseek    → o mesmo dialeto                            (garante)
//     gemini      → `responseMimeType: "application/json"`     (garante)
//     perplexity  → NADA, com o motivo escrito em comentário   (declara que não)
//     claude      → NADA, e sem uma palavra                    (parecia coberto)
//
// O Claude estava na PIOR das três posições. "Não garante e não diz" é pior que
// "não garante e avisa", porque quem lê a camada conclui que está coberto. E as
// 29 chamadas desta casa que passam por `generate()` correm todas o mesmo risco
// — o SDR só foi onde alguém olhou, por ser o único com histórico longo em
// prosa empurrando o modelo para fora do formato a cada turno.
//
// ─── A REGRA QUE ESTE ARQUIVO INSTITUI ──────────────────────────────────────
//
// **Todo provedor declara a posição dele. Silêncio é a única resposta proibida.**
//
// "Não garanto, e por isto" é resposta legítima e fica registrada (é o caso da
// Perplexity, cujos modelos derrubam a chamada com 400 se `response_format` for
// mandado). O que não pode existir é um provedor sem posição — porque aí a
// ausência de trava vira suposição de trava.
//
// A trava da regra não é este comentário: é o `Record<AiProvider, …>` abaixo
// (o compilador cobra o provedor novo) somado a `__tests__/ai/
// formato-garantido.test.ts` (que cobra o MOTIVO escrito, não só a chave
// presente). Mesmo padrão do `enforceFrequency`: obrigar quem escreve o próximo
// caminho a responder a pergunta, em vez de herdar a resposta em silêncio.

import { ALL_PROVIDERS, type AiProvider } from "@/lib/ai/resolve-key";

/**
 * A posição de um provedor sobre formato. Três estados, e os três afirmam algo:
 *
 *  • `nativo`      — o provedor tem um mecanismo próprio e a camada o usa;
 *  • `ferramenta`  — não tem mecanismo de formato, mas tem uso de ferramenta, e
 *                    a camada força uma ferramenta cuja entrada É o pacote;
 *  • `nenhuma`     — não garante, e o motivo está escrito. Nunca é omissão.
 */
export type GarantiaDeFormato =
  | { tipo: "nativo"; mecanismo: string; porque: string }
  | { tipo: "ferramenta"; mecanismo: string; porque: string }
  | { tipo: "nenhuma"; porque: string };

/**
 * ⚠️ `Record<AiProvider, …>` de propósito: acrescentar um provedor em
 * `ALL_PROVIDERS` sem declarar a posição dele aqui NÃO COMPILA. É a primeira
 * metade da trava; a segunda mora no teste, que cobra o motivo escrito.
 */
export const GARANTIA_DE_FORMATO: Record<AiProvider, GarantiaDeFormato> = {
  claude: {
    tipo: "ferramenta",
    mecanismo: "tool_choice forçado na ferramenta `responder`",
    porque:
      "A saída estruturada nativa da Anthropic (`output_config.format`) NÃO existe no " +
      "claude-sonnet-4-6, que é o modelo desta casa, e o prefill do turno do assistente " +
      "foi removido na família 4.6+ (devolve 400). Sobra o uso de ferramenta, que existe " +
      "no 4.6 e resolve pela raiz: com `tool_choice` fixo o modelo NÃO PODE responder em " +
      "prosa — a resposta vem no canal de entrada da ferramenta, já como objeto, e não " +
      "como texto de onde se tenta pescar um JSON. Foi medido em 24/08/2026: sem isto, " +
      "10 de 16 turnos do SDR vinham em prosa e caíam no motor de regras em silêncio.",
  },
  openai: {
    tipo: "nativo",
    mecanismo: "response_format: { type: 'json_object' }",
    porque: "A API garante objeto JSON válido na resposta; é o mecanismo do próprio provedor.",
  },
  deepseek: {
    tipo: "nativo",
    mecanismo: "response_format: { type: 'json_object' }",
    porque: "Serve o mesmo dialeto da OpenAI, no host dela, com a mesma garantia.",
  },
  gemini: {
    tipo: "nativo",
    mecanismo: "generationConfig.responseMimeType: 'application/json'",
    porque: "O Gemini aceita declarar o MIME da resposta e passa a devolver JSON.",
  },
  perplexity: {
    tipo: "nenhuma",
    porque:
      "Nem todo modelo da Perplexity aceita `response_format`, e mandar o campo derruba a " +
      "chamada com 400. Uso de ferramenta também não é caminho confiável aqui. Então o " +
      "formato é PEDIDO no prompt e o extrator acha o JSON no texto — o que significa que " +
      "esta é a única porta da camada por onde uma resposta em prosa ainda passa. Fica " +
      "escrito para quem escolher a Perplexity saber o que está escolhendo: ela é " +
      "excelente em pesquisa com fonte, e é o provedor com a garantia mais fraca de formato.",
  },
};

/** Os provedores cuja garantia é real — os que podem ser oferecidos sem ressalva. */
export function provedoresComTravaDeFormato(): AiProvider[] {
  return ALL_PROVIDERS.filter((p) => GARANTIA_DE_FORMATO[p].tipo !== "nenhuma");
}

/**
 * A frase que a tela (ou o log) mostra ao lado do provedor.
 *
 * Existe para cumprir a segunda metade da ordem: provedor sem trava de formato
 * NÃO pode ser oferecido em silêncio — ou não aparece, ou aparece dizendo o que
 * não garante. Esta função é o "aparece dizendo".
 */
export function comoGaranteOFormato(p: AiProvider): string {
  const g = GARANTIA_DE_FORMATO[p];
  return g.tipo === "nenhuma"
    ? `sem trava de formato — ${g.porque}`
    : `${g.mecanismo} — ${g.porque}`;
}
