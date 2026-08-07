// A TABELA DE PREÇO POR MODELO — e a honestidade sobre o que ela é.
//
// ─── O QUE ESTE ARQUIVO É, COM TODAS AS LETRAS ───────────────────────────────
//
// É uma tabela de **preço de tabela** dos provedores, copiada da documentação
// pública de cada um. Ela NÃO é a fatura. A fatura tem desconto de contrato,
// crédito promocional, cache de prompt, tarifa de lote e arredondamento que
// nenhum código nosso enxerga.
//
// Por isso todo número que sai daqui é `custoEstimadoUsd`, sempre acompanhado de
// `TABELA_VERSAO`, e a tela é OBRIGADA a dizer "estimativa". Número inventado
// com cara de exato é pior que número ausente: ele encerra a conversa.
//
// ─── ONDE ELA MORA E COMO SE ATUALIZA ────────────────────────────────────────
//
// Mora AQUI, em código versionado, e não no banco, de propósito: preço é uma
// afirmação sobre o mundo, precisa de revisão por diff e de data de conferência.
// Num campo de tela ele mudaria sem ninguém saber quem mudou nem com base em quê.
//
// Para atualizar:
//   1. abra a página de preços do provedor (coluna `origem` de cada linha);
//   2. corrija `entrada`/`saida` (USD por 1.000.000 de tokens);
//   3. anote a data em `conferidoEm` da linha;
//   4. **suba `TABELA_VERSAO`** — é ele que carimba cada linha do log, e é o que
//      permite dizer depois "este mês foi calculado com a tabela velha".
//
// ─── MODELO DESCONHECIDO NÃO CUSTA ZERO ──────────────────────────────────────
//
// Custa `null`. Zero seria dizer que a chamada foi de graça, e um modelo novo
// entrando na casa apareceria como economia. `null` aparece no relatório como
// "sem preço na tabela: N chamadas" — que é a verdade e é acionável.

/** Sobe a cada mudança de preço. Carimbado em cada linha do `AIRunLog`. */
export const TABELA_VERSAO = "2026-08-06.1";

/**
 * `conferidoEm: null` significa **preço de tabela copiado da documentação
 * pública e ainda NÃO reconferido por esta casa**. Está declarado assim de
 * propósito — a alternativa era uma data falsa.
 */
export interface PrecoDoModelo {
  /** USD por 1.000.000 de tokens de ENTRADA. */
  entrada: number;
  /** USD por 1.000.000 de tokens de SAÍDA. */
  saida: number;
  origem: string;
  conferidoEm: string | null;
}

/**
 * Chave = nome do modelo como ele é ENVIADO ao provedor. Casamento por prefixo
 * (ver `precoDoModelo`), porque os nomes carregam sufixo de data
 * (`claude-haiku-4-5-20251001`) e a data muda sem o preço mudar.
 */
export const PRECOS: Record<string, PrecoDoModelo> = {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  "claude-haiku-4-5":  { entrada: 1.00,  saida: 5.00,  origem: "https://www.anthropic.com/pricing", conferidoEm: null },
  "claude-sonnet-4-6": { entrada: 3.00,  saida: 15.00, origem: "https://www.anthropic.com/pricing", conferidoEm: null },
  "claude-opus-4-8":   { entrada: 15.00, saida: 75.00, origem: "https://www.anthropic.com/pricing", conferidoEm: null },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  "gpt-4o-mini":       { entrada: 0.15,  saida: 0.60,  origem: "https://openai.com/api/pricing/",   conferidoEm: null },
  "gpt-4o":            { entrada: 2.50,  saida: 10.00, origem: "https://openai.com/api/pricing/",   conferidoEm: null },
  "gpt-4-turbo":       { entrada: 10.00, saida: 30.00, origem: "https://openai.com/api/pricing/",   conferidoEm: null },
  "gpt-3.5-turbo":     { entrada: 0.50,  saida: 1.50,  origem: "https://openai.com/api/pricing/",   conferidoEm: null },

  // ── Google Gemini — a faixa gratuita ───────────────────────────────────────
  // ATENÇÃO: os apelidos móveis (`-latest`) são exatamente isso — MÓVEIS. O
  // modelo por trás muda, e o preço com ele. Esta é a linha que mais envelhece.
  // Dentro da cota gratuita o custo REAL é 0; a tabela guarda o preço PAGO
  // porque a cota estoura calada e ninguém quer descobrir isso pela fatura.
  "gemini-flash-latest":      { entrada: 0.30, saida: 2.50, origem: "https://ai.google.dev/pricing", conferidoEm: null },
  "gemini-flash-lite-latest": { entrada: 0.10, saida: 0.40, origem: "https://ai.google.dev/pricing", conferidoEm: null },
  "gemini-pro-latest":        { entrada: 1.25, saida: 10.00, origem: "https://ai.google.dev/pricing", conferidoEm: null },

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  "deepseek-v4-flash": { entrada: 0.28, saida: 0.42, origem: "https://api-docs.deepseek.com/quick_start/pricing", conferidoEm: null },
  "deepseek-v4-pro":   { entrada: 0.56, saida: 1.68, origem: "https://api-docs.deepseek.com/quick_start/pricing", conferidoEm: null },

  // ── Perplexity ─────────────────────────────────────────────────────────────
  // A Perplexity cobra token E uma taxa por requisição de busca, que NÃO está
  // aqui. O custo dela sai subestimado, e está dito.
  "sonar-reasoning":   { entrada: 1.00, saida: 5.00, origem: "https://docs.perplexity.ai/guides/pricing", conferidoEm: null },
  "sonar-pro":         { entrada: 3.00, saida: 15.00, origem: "https://docs.perplexity.ai/guides/pricing", conferidoEm: null },
  "sonar":             { entrada: 1.00, saida: 1.00, origem: "https://docs.perplexity.ai/guides/pricing", conferidoEm: null },
};

/**
 * Acha o preço do modelo. Casamento exato primeiro; depois o PREFIXO mais longo
 * que casa — `claude-haiku-4-5-20251001` cai em `claude-haiku-4-5`.
 *
 * "Mais longo" importa: `sonar` é prefixo de `sonar-pro`, e o preço do pro é 3×.
 * Um casamento ingênuo cobraria o pro a preço de sonar e a conta fecharia errado
 * para menos — o lado ruim de errar numa conta de gasto.
 */
export function precoDoModelo(model: string): PrecoDoModelo | null {
  const m = model.trim().toLowerCase();
  if (!m) return null;
  if (PRECOS[m]) return PRECOS[m];

  let melhor: { chave: string; preco: PrecoDoModelo } | null = null;
  for (const [chave, preco] of Object.entries(PRECOS)) {
    if (!m.startsWith(chave)) continue;
    if (!melhor || chave.length > melhor.chave.length) melhor = { chave, preco };
  }
  return melhor?.preco ?? null;
}

export interface CustoEstimado {
  /** `null` = modelo fora da tabela. NÃO é zero. */
  usd: number | null;
  /** A versão da tabela usada. Vai gravada junto do número. */
  versao: string;
}

/**
 * O custo estimado de UMA chamada. Tokens ausentes (provedor que não devolveu
 * `usage`) → `null`, pelo mesmo motivo: ausência de informação não é zero.
 */
export function estimarCusto(
  model: string,
  tokensEntrada: number | null | undefined,
  tokensSaida: number | null | undefined,
): CustoEstimado {
  const preco = precoDoModelo(model);
  if (!preco || tokensEntrada == null || tokensSaida == null) {
    return { usd: null, versao: TABELA_VERSAO };
  }
  const usd = (tokensEntrada / 1_000_000) * preco.entrada + (tokensSaida / 1_000_000) * preco.saida;
  // Seis casas: uma chamada barata custa US$ 0,0003 e arredondar para centavo a
  // transformaria em zero — mil chamadas de zero somam zero.
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, versao: TABELA_VERSAO };
}

/** O aviso que TODA tela e TODA resposta de API que mostra dinheiro repete. */
export const AVISO_DE_ESTIMATIVA =
  "Estimativa. Calculada com o preço de tabela público de cada provedor " +
  `(tabela ${TABELA_VERSAO}, ainda não reconferida por esta casa) — não é a fatura. ` +
  "Não inclui cota gratuita, desconto de contrato, cache de prompt nem a taxa de busca da Perplexity.";
