// A FICHA DE MARCA — os nove campos, cada um com estado declarado.
//
// ── Por que o ESTADO é um atributo, e não um décimo campo ───────────────────
//
// O Conselho separou isto explicitamente, e a razão é a regra mais antiga desta
// casa: **ausência de informação não é informação**. Um campo vazio pode ser
// três coisas muito diferentes, e tratá-las como uma só é o que produz peça
// errada com cara de peça certa:
//
//   `definido`         — o dono decidiu. Vale como régua.
//   `lacuna`           — ninguém decidiu ainda. NÃO é "pode tudo": é pergunta
//                        aberta, e quem produz precisa saber que ali não há
//                        régua.
//   `herdado_default`  — a casa emprestou um mínimo enquanto a marca não se
//                        constitui. Vale, mas é da casa e não do cliente — e
//                        some no dia em que o dono decidir.
//
// Sem essa distinção, um campo em branco vira silêncio, e silêncio vira
// permissão. Foi assim que a peça saiu com o nome do cliente em fonte comum.
//
// ── O QUE ESTE ARQUIVO NÃO GUARDA ──────────────────────────────────────────
//
// As PROIBIÇÕES. Elas já existem, funcionam e moram em `BrainArtifact`
// (`esteira/proibicoes.ts`). Duplicá-las aqui criaria duas verdades sobre a
// mesma regra — o defeito que esta casa já pagou duas vezes, em preço e em
// material. Este arquivo lê as de lá quando precisa contar o que falta.

import { prisma } from "@/lib/db/client";
import { lerProibicoes } from "@/lib/agency/esteira/proibicoes";

export type EstadoDoCampo = "definido" | "lacuna" | "herdado_default";

/** Os nove campos da constituição. A ordem é a de leitura por um humano: quem
 *  é → com quem fala → como fala → o que não pode → com o que se parece. */
export const CAMPOS_DA_MARCA = [
  "proposito_e_promessa",
  "publico_e_relacao",
  "voz",
  "lexico",
  "proibicoes",
  "referencias",
  "atributos_formais",
  "limites_de_promessa",
  "hierarquia_e_dono",
] as const;
export type CampoDaMarca = (typeof CAMPOS_DA_MARCA)[number];

/** O MODO MÍNIMO, para trabalho curto. Vem do Conselho, que apostou que quatro
 *  ou cinco dos nove ficarão em lacuna para sempre e que este seria a realidade.
 *  São os quatro sem os quais não existe julgamento nem escalada possível. */
export const MODO_MINIMO: CampoDaMarca[] = [
  "proposito_e_promessa",
  "lexico",
  "proibicoes",
  "hierarquia_e_dono",
];

/** O que o humano lê na tela. Sem jargão: a ficha é preenchida pelo dono do
 *  negócio, não por quem programa. */
export const ROTULO: Record<CampoDaMarca, string> = {
  proposito_e_promessa: "O que vocês fazem, e o que o cliente pode esperar",
  publico_e_relacao: "Com quem vocês falam, e de que jeito",
  voz: "Como vocês falam — e como não falam",
  lexico: "Como o nome se escreve, e as palavras que não se usa",
  proibicoes: "O que a marca nunca faz",
  referencias: "Exemplos do que ficou certo — e do que ficou errado",
  atributos_formais: "Cor e tipografia",
  limites_de_promessa: "O que não se afirma, mesmo sendo verdade",
  hierarquia_e_dono: "Quem decide, por onde, e em quanto tempo",
};

/** A pergunta que vai ao dono quando o campo está em lacuna. Fechada sempre que
 *  possível: escolher é mais fácil que escrever, e responde mais gente. */
export const PERGUNTA: Record<CampoDaMarca, string> = {
  proposito_e_promessa: "Em uma frase: o que o seu cliente ganha ao escolher vocês?",
  publico_e_relacao: "Vocês falam com o cliente como um igual, como especialista, ou como prestador de serviço?",
  voz: "Escreva duas frases: uma do jeito que vocês falariam, e uma do jeito que vocês NUNCA falariam.",
  lexico: "Como o nome se escreve, exatamente? E existe alguma palavra que vocês não usam?",
  proibicoes: "Tem alguma coisa que a gente nunca deve fazer no material de vocês?",
  referencias: "Manda um exemplo de post que você achou a sua cara — e um que você achou que não era.",
  atributos_formais: "Quais são as cores da marca? Se não souber o código, manda uma foto do logo.",
  limites_de_promessa: "Tem alguma coisa que vocês preferem não prometer, mesmo sendo verdade?",
  hierarquia_e_dono: "Quem aprova o material de vocês, e por onde a gente fala com essa pessoa?",
};

export interface CampoNaFicha {
  campo: CampoDaMarca;
  rotulo: string;
  estado: EstadoDoCampo;
  /** O conteúdo, já legível. Vazio quando o estado não é `definido`. */
  valor: string;
  /** A pergunta a fazer ao dono. Só quando o estado é `lacuna`. */
  pergunta: string | null;
}

export interface FichaDeMarca {
  clientId: string;
  campos: CampoNaFicha[];
  /** Quantos dos nove estão `definido`. É o número que a tela mostra. */
  definidos: number;
  /** Os que faltam, na ordem em que devem ser perguntados. */
  lacunas: CampoNaFicha[];
  /** `true` enquanto a marca não sai do dia zero. Gatilho de saída da
   *  constituição, verificável por máquina — não por julgamento. */
  naoConstituida: boolean;
  /**
   * O QUE FALTA PARA A MARCA SE CONSTITUIR, item por item, em português.
   *
   * ── Por que isto não é o mesmo que `lacunas` (14/08/2026) ─────────────────
   *
   * `lacunas` conta CAMPOS VAZIOS. O portão de publicação não pergunta isso:
   * ele pergunta pelo GATILHO DE SAÍDA — cinco campos nomeados, ao menos três
   * proibições vigentes e ao menos uma referência aprovada MAIS uma reprovada.
   * Os dois números divergem, e a divergência não é acadêmica:
   *
   *   • dois dos nove campos (`atributos_formais`, `limites_de_promessa`) podem
   *     estar definidos sem mover o gatilho um milímetro;
   *   • `referencias` conta como "definido" com UMA referência aprovada — e o
   *     gatilho exige também uma REPROVADA, que é a que ensina;
   *   • `proibicoes` não se preenche por este formulário: ela tem dono próprio
   *     (`esteira/proibicoes.ts`) e entra pelo que o cliente escreve no pedido,
   *     no ajuste ou no briefing.
   *
   * Sem esta lista, a ficha diz "faltam 2" e o post continua sendo recusado com
   * "marca não constituída" — e ninguém consegue ligar uma coisa na outra.
   * Vazio quando a marca ESTÁ constituída.
   */
  oQueFaltaParaConstituir: string[];
}

function textoDe(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

function jsonTemConteudo(bruto: string | null | undefined): boolean {
  const s = (bruto ?? "").trim();
  if (!s || s === "{}" || s === "[]" || s === "null") return false;
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return false;
  } catch {
    return false;
  }
}

function legivel(bruto: string | null | undefined, limite = 240): string {
  const s = (bruto ?? "").trim();
  if (!s) return "";
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ").slice(0, limite);
    if (v && typeof v === "object") {
      return Object.entries(v).map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`).join(" · ").slice(0, limite);
    }
  } catch { /* não era JSON: é texto puro */ }
  return s.slice(0, limite);
}

/**
 * Lê a ficha de um cliente e declara o estado de cada um dos nove campos.
 *
 * Nunca lança: banco fora do ar devolve uma ficha inteira em lacuna, que é a
 * leitura conservadora — e não uma ficha vazia que pareceria "nada a declarar".
 */
export async function lerFichaDeMarca(clientId: string): Promise<FichaDeMarca> {
  const [marca, proib] = await Promise.all([
    prisma.brandBrain.findUnique({ where: { clientId } }).catch(() => null),
    lerProibicoes(clientId).catch(() => ({ lidas: false, itens: [] as { frase: string }[] })),
  ]);

  const temProibicao = (proib.itens ?? []).length > 0;

  const bruto: Record<CampoDaMarca, { cheio: boolean; valor: string }> = {
    proposito_e_promessa: {
      cheio: !!textoDe(marca?.purposeAndPromise) || !!textoDe(marca?.tagline),
      valor: textoDe(marca?.purposeAndPromise) || textoDe(marca?.tagline),
    },
    publico_e_relacao: {
      cheio: !!textoDe(marca?.audienceRelation) || !!textoDe(marca?.targetAudience),
      valor: textoDe(marca?.audienceRelation) || textoDe(marca?.targetAudience),
    },
    voz: {
      // O tom sozinho NÃO conta como voz definida: "natural e direto" é adjetivo,
      // e adjetivo não é verificável. Só os pares de exemplo contam.
      cheio: jsonTemConteudo(marca?.voicePairsJson),
      valor: legivel(marca?.voicePairsJson),
    },
    lexico: { cheio: jsonTemConteudo(marca?.lexiconJson), valor: legivel(marca?.lexiconJson) },
    proibicoes: {
      cheio: temProibicao,
      valor: (proib.itens ?? []).map((i) => i.frase).join(" · ").slice(0, 240),
    },
    referencias: { cheio: jsonTemConteudo(marca?.referencesJson), valor: legivel(marca?.referencesJson) },
    atributos_formais: {
      cheio: jsonTemConteudo(marca?.formalTokensJson) || !!textoDe(marca?.primaryColor),
      valor: legivel(marca?.formalTokensJson) || [marca?.primaryColor, marca?.secondaryColor, marca?.typography].filter(Boolean).join(" · "),
    },
    limites_de_promessa: { cheio: !!textoDe(marca?.promiseLimits), valor: textoDe(marca?.promiseLimits) },
    hierarquia_e_dono: { cheio: jsonTemConteudo(marca?.ownerAndHierarchyJson), valor: legivel(marca?.ownerAndHierarchyJson) },
  };

  const estados = (() => {
    try {
      return JSON.parse(marca?.fieldStatesJson ?? "{}") as Record<string, { estado?: string }>;
    } catch {
      return {} as Record<string, { estado?: string }>;
    }
  })();

  const campos: CampoNaFicha[] = CAMPOS_DA_MARCA.map((campo) => {
    const b = bruto[campo];
    const declarado = estados[campo]?.estado;
    const estado: EstadoDoCampo = b.cheio
      ? "definido"
      : declarado === "herdado_default"
      ? "herdado_default"
      : "lacuna";
    return {
      campo,
      rotulo: ROTULO[campo],
      estado,
      valor: estado === "definido" ? b.valor : "",
      pergunta: estado === "lacuna" ? PERGUNTA[campo] : null,
    };
  });

  const definidos = campos.filter((c) => c.estado === "definido").length;
  const lacunas = campos.filter((c) => c.estado === "lacuna");

  // ── O GATILHO DE SAÍDA DO DIA ZERO, verificável por máquina ──────────────
  // Da constituição: campos 1, 2, 3, 4 e 9 definidos, ao menos 3 proibições
  // vigentes e ao menos 2 referências. "Quando houver regra" não é gatilho —
  // é opinião, e opinião nunca fecha um estado.
  const exigidos: CampoDaMarca[] = ["proposito_e_promessa", "publico_e_relacao", "voz", "lexico", "hierarquia_e_dono"];
  const faltandoExigidos = exigidos.filter((c) => campos.find((x) => x.campo === c)?.estado !== "definido");
  const temExigidos = faltandoExigidos.length === 0;
  const quantasProibicoes = (proib.itens ?? []).length;
  const proibicoesSuficientes = quantasProibicoes >= 3;
  const referencias = (() => {
    try {
      const v = JSON.parse(marca?.referencesJson ?? "{}") as { aprovadas?: unknown[]; reprovadas?: unknown[] };
      return { aprovadas: v.aprovadas?.length ?? 0, reprovadas: v.reprovadas?.length ?? 0 };
    } catch {
      return { aprovadas: 0, reprovadas: 0 };
    }
  })();
  const referenciasSuficientes = referencias.aprovadas >= 1 && referencias.reprovadas >= 1;

  // A lista é montada AQUI, do mesmo cálculo que decide o portão. Repetir a
  // regra num segundo lugar é como nasce a tela que diz uma coisa e o portão
  // que faz outra — e foi assim que a casa passou dias sem entender por que o
  // post não saía.
  const oQueFaltaParaConstituir: string[] = [];
  for (const c of faltandoExigidos) {
    oQueFaltaParaConstituir.push(`falta o campo "${ROTULO[c]}" — ${PERGUNTA[c]}`);
  }
  if (!proibicoesSuficientes) {
    oQueFaltaParaConstituir.push(
      `faltam proibições: há ${quantasProibicoes} registrada(s) e o portão exige 3. ` +
        "Proibição NÃO se preenche por este formulário — ela entra pelo que o cliente escreve " +
        "no pedido, no ajuste de uma peça ou no briefing, e fica guardada num lugar só.",
    );
  }
  if (!referenciasSuficientes) {
    oQueFaltaParaConstituir.push(
      `faltam referências: ${referencias.aprovadas} aprovada(s) e ${referencias.reprovadas} reprovada(s); ` +
        "o portão exige ao menos UMA de cada. O contra-exemplo é o que ensina — " +
        "sem a reprovada, o produtor sabe o que agradou e não sabe o que não pode.",
    );
  }

  return {
    clientId,
    campos,
    definidos,
    lacunas,
    naoConstituida: !(temExigidos && proibicoesSuficientes && referenciasSuficientes),
    oQueFaltaParaConstituir,
  };
}

/** As perguntas da próxima rodada. Teto de cinco, da constituição: questionário
 *  longo é questionário abandonado, e quem abandona no meio responde qualquer
 *  coisa — que é pior que campo vazio, porque vira regra falsa. */
export const PERGUNTAS_POR_RODADA = 5;

export function proximasPerguntas(ficha: FichaDeMarca): CampoNaFicha[] {
  // O modo mínimo primeiro: são os quatro sem os quais não há julgamento nem
  // escalada. Perguntar "referência visual" antes de "quem aprova" é otimizar a
  // ordem errada.
  const prioridade = (c: CampoNaFicha) => (MODO_MINIMO.includes(c.campo) ? 0 : 1);
  return [...ficha.lacunas].sort((a, b) => prioridade(a) - prioridade(b)).slice(0, PERGUNTAS_POR_RODADA);
}
