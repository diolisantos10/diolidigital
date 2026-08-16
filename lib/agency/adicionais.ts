// OS ADICIONAIS — o que se vende POR CIMA do plano, com uma fonte só.
//
// ─── POR QUE ESTE ARQUIVO NASCEU (16/08/2026, segunda rodada) ────────────────
//
// A primeira rodada unificou o preço de PLANO e declarou, no cabeçalho de
// `pricing-margins.ts`, que o "catálogo paralelo" tinha sido eliminado. A
// camada de dúvida refutou: **a economia dos adicionais continuava escrita em
// três lugares**, e um deles se contradizia com o outro.
//
// | Onde | O que dizia |
// |---|---|
// | `live-calculator.ts` → `P` | reel 150–400 · tráfego 500–1.200 · marca 1.200–2.500 · rebranding 2.000–4.000 |
// | `pricing-margins.ts` → `ADDON_MARGINS` | tráfego piso 450 alvo **1.200** · marca piso 1.050 alvo **2.500** · rebranding piso 1.750 alvo **4.000** |
// | `pricing-margins.ts` → `computeDealFloor` | reel: custo 120, piso **200**, alvo **400** |
//
// **O `maxPrice` de uma era o `targetPrice` da outra, número por número** — o
// mesmo padrão que a primeira rodada afirmou ter eliminado. Afirmação corrigida
// aqui e em `docs/precos.md`: comentário que promete mais do que o mecanismo
// entrega é a mentira mais cara desta casa.
//
// ─── 🔴 E HAVIA UMA CONTRADIÇÃO VIVA, NÃO SÓ UMA DUPLICATA ───────────────────
//
// No reel, o **piso (R$ 200) era MAIOR que o mínimo de tabela (R$ 150)**. Ou
// seja: a calculadora do briefing podia cotar R$ 150 ao prospect e o portão de
// margem, no mesmo negócio, dizer que abaixo de R$ 200 não se vende. Não é
// duplicata — é a casa discordando de si mesma sobre o menor preço de um item.
//
// **Não escolhi qual dos dois vale.** Nenhum dos dois tem procedência escrita, e
// escolher seria inventar o piso de um produto. O reel entra com `piso: null` —
// que é fail-closed em toda parte — e os dois números ficam registrados em
// `contradicao`, com nome, para o CEO decidir.

export interface Adicional {
  id: string;
  nome: string;
  /**
   * O que o cliente vê. É FAIXA, e não preço, porque adicional é orçado.
   *
   * Chamam-se `precoDe`/`precoAte` e não `de`/`ate` por causa do portão: `de` e
   * `ate` são palavras genéricas demais para entrar na lista de "chave de
   * preço" — em `comercial/negociacao.ts` elas são limites de FAIXA DE BOLSO
   * (0–150, 150–500) e degraus de desconto, que não são preço de nada. Nome
   * ambíguo obriga o portão a escolher entre cegar ou gritar no caso limpo.
   */
  precoDe: number;
  precoAte: number;
  /**
   * O menor valor autorizado. `null` = **não decidido**, e nada abaixo passa.
   * Ausência de piso não é piso zero: é ausência de autorização.
   */
  piso: number | null;
  /**
   * Custo interno. `medido: false` em todos: nenhum destes números foi apurado
   * — são hipóteses herdadas de `pricing-margins.ts`. Ficam porque descrevem o
   * MESMO produto (ao contrário do custo dos planos, que descrevia planos
   * inexistentes e por isso virou `null`).
   */
  custoBase: number | null;
  custoMedido: boolean;
  /** Unidade da faixa: o que o cliente compra. */
  unidade: "mês" | "projeto" | "unidade";
  /** Contradição conhecida e NÃO resolvida aqui. Decisão do CEO. */
  contradicao: string | null;
}

export const ADICIONAIS: Adicional[] = [
  {
    id: "reel",
    nome: "Reel avulso",
    precoDe: 150,
    precoAte: 400,
    // 🔴 Ver o cabeçalho: 150 (tabela) × 200 (piso) se contradizem.
    piso: null,
    custoBase: 120,
    custoMedido: false,
    unidade: "unidade",
    contradicao:
      "O mínimo de tabela era R$ 150 (live-calculator) e o piso de margem era R$ 200 " +
      "(pricing-margins) — o piso ficava ACIMA do mínimo cotável. Nenhum dos dois tem " +
      "procedência escrita. Enquanto o CEO não decidir, o reel não é cotado nem fechado " +
      "automaticamente. Some-se a isto que vídeo está em FORA_DE_TODO_PLANO por decisão do " +
      "CEO: o item é sempre orçado à parte.",
  },
  {
    id: "trafficMgmt",
    nome: "Gestão de Tráfego Pago",
    precoDe: 500,
    precoAte: 1200,
    piso: 450,
    custoBase: 220,
    custoMedido: false,
    unidade: "mês",
    contradicao:
      "🔴 NÃO É CONTRADIÇÃO DE PREÇO, É DE PERMISSÃO: este item vende operação de Meta/Google " +
      "Ads, e a conta de anúncios da agência está restrita desde 03/08/2026. É a MESMA laranja " +
      "que tornou o plano Performance não vendável — e este continua à venda. Tirar produto do " +
      "ar é decisão do CEO; registrar a incoerência é obrigação.",
  },
  {
    id: "branding",
    nome: "Identidade Visual",
    precoDe: 1200,
    precoAte: 2500,
    piso: 1050,
    custoBase: 480,
    custoMedido: false,
    unidade: "projeto",
    contradicao:
      "`docs/precos.md` diz Identidade Visual R$ 2.900 (projeto, 3x) e o código diz faixa de " +
      "R$ 1.200 a R$ 2.500 — o teto do código fica ABAIXO do preço do documento. Não unifiquei: " +
      "faixa e preço fechado são produtos comerciais diferentes, e escolher um seria decidir " +
      "preço. Decisão do CEO.",
  },
  {
    id: "brandingFull",
    nome: "Rebranding completo",
    precoDe: 2000,
    precoAte: 4000,
    piso: 1750,
    custoBase: 820,
    custoMedido: false,
    unidade: "projeto",
    contradicao: null,
  },
];

export function adicionalPorId(id: string): Adicional | undefined {
  return ADICIONAIS.find((a) => a.id === id);
}

/**
 * A faixa de um adicional, para a calculadora. **Falha alto** se o id sumir —
 * cotar `undefined` num briefing público é pior do que quebrar a build.
 */
export function faixaDoAdicional(id: string): { min: number; max: number } {
  const a = adicionalPorId(id);
  if (!a) throw new Error(`adicionais.ts: adicional "${id}" não existe. Corrija a fonte ou o chamador.`);
  return { min: a.precoDe, max: a.precoAte };
}

/** Os que têm contradição aberta. Lista de auditoria, lida por teste. */
export const ADICIONAIS_COM_CONTRADICAO = ADICIONAIS.filter((a) => a.contradicao !== null);
