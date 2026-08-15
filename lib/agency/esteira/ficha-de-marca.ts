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
  // A redação NÃO é nova: é a da entrevista do painel (`IntakeEngine.tsx:339`),
  // que já perguntava isto em língua de cliente há meses — e cuja resposta ia
  // para `updateClient` → `PUT /api/clients/[id]`, uma rota que lê do corpo só
  // name/industry/email/phone/website e descarta o resto em silêncio. Uma
  // terceira redação para a mesma pergunta é como as duas verdades nascem.
  //
  // O "até três" é o gatilho falando: a constituição pede **três** proibições
  // vigentes, e pedir uma de cada vez faria o cliente responder três rodadas
  // para abrir a porta uma vez.
  proibicoes:
    "Tem algo que a gente nunca deve fazer, dizer ou mostrar no material de vocês? " +
    "Pode ser uma palavra, uma cor ou um concorrente que nunca deve ser citado. " +
    "Escreva até três, uma por linha.",
  referencias: "Manda um exemplo de post que você achou a sua cara — e um que você achou que não era.",
  atributos_formais: "Quais são as cores da marca? Se não souber o código, manda uma foto do logo.",
  limites_de_promessa: "Tem alguma coisa que vocês preferem não prometer, mesmo sendo verdade?",
  hierarquia_e_dono: "Quem aprova o material de vocês, e por onde a gente fala com essa pessoa?",
};

// ─────────────────────────────────────────────────────────────────────────────
// OS CAMPOS DE DUAS METADES — e por que a segunda nunca era gravada
// ─────────────────────────────────────────────────────────────────────────────
//
// Dois dos nove campos são PARES por natureza, e o par existe porque a metade
// negativa é a única que permite REPROVAR:
//
//   `voz`         — "falamos assim" / "nunca falaríamos assim"
//   `referencias` — "este post é a nossa cara" / "este não era"
//
// A pergunta ao cliente já pedia as duas metades desde sempre (`PERGUNTA.voz` e
// `PERGUNTA.referencias`, logo acima). Mas a tela tinha UM campo de texto, a
// rota recebia UMA string e os dois escritores de produção gravavam a segunda
// metade **vazia por literal**: `{dizemos: t, naoDizemos: ""}` e
// `{aprovadas: [t], reprovadas: []}`.
//
// A consequência não era estética: `referenciasCompletas` exige as duas, o
// gatilho do dia zero exige `referenciasCompletas`, e `publicacao.ts` recusa
// todo post de marca não constituída. **Nenhum cliente conseguia publicar, por
// mais que respondesse tudo** — e a suíte era verde porque os testes montavam
// `{aprovadas:["p1"], reprovadas:["p9"]}` À MÃO, numa forma que escritor nenhum
// desta casa produzia. Teste de peça não pega corrente arrebentada.
//
// A régua não foi afrouxada: continua exigindo as duas. O que mudou é que agora
// existe por onde escrever a segunda.

export interface MetadeDaResposta {
  /** A chave dentro do JSON gravado. É o que a tela devolve no POST. */
  chave: string;
  /** O que a tela escreve em cima do campo. */
  rotulo: string;
  /** A pergunta desta metade, em língua de cliente. */
  pergunta: string;
}

export const METADES: Partial<Record<CampoDaMarca, MetadeDaResposta[]>> = {
  voz: [
    {
      chave: "dizemos",
      rotulo: "Do jeito que vocês falam",
      pergunta: "Escreva uma frase do jeito que vocês falariam com o cliente de vocês.",
    },
    {
      chave: "naoDizemos",
      rotulo: "Do jeito que vocês NUNCA falariam",
      pergunta: "Agora escreva uma frase do jeito que vocês nunca falariam — pode ser o clichê que te dá agonia.",
    },
  ],
  referencias: [
    {
      chave: "aprovada",
      rotulo: "Um post com a cara de vocês",
      pergunta: "Manda um post que você achou a sua cara — link, print ou só descreva com suas palavras.",
    },
    {
      chave: "reprovada",
      rotulo: "Um post que NÃO era a cara de vocês",
      pergunta: "E um que você achou que não era. Este é o mais importante: é ele que me deixa reprovar peça antes de você ver.",
    },
  ],
};

export interface CampoNaFicha {
  campo: CampoDaMarca;
  rotulo: string;
  estado: EstadoDoCampo;
  /** O conteúdo, já legível. Vazio quando o estado não é `definido`. */
  valor: string;
  /** A pergunta a fazer ao dono. Só quando o estado é `lacuna`. */
  pergunta: string | null;
  /** As metades que ainda faltam neste campo. Vazio para campo de resposta
   *  única e para campo já completo. Quem responde "a nossa cara" e volta
   *  depois não é perguntado de novo pela metade que já deu. */
  metadesQueFaltam: MetadeDaResposta[];
}

/** Onde cada campo da ficha mora no banco.
 *
 *  Morava dentro de `app/api/agency/clients/[id]/marca/route.ts` e subiu para cá
 *  em 15/08/2026, quando a aplicação do brand book passou a precisar do mesmo
 *  mapa. Duas cópias divergem — uma ganha campo novo, a outra não, e a resposta
 *  do cliente cai no lixo pelo caminho que ninguém olhou.
 *
 *  As PROIBIÇÕES não estão aqui: têm dono próprio (`esteira/proibicoes.ts`). */
export const COLUNA_DA_FICHA: Partial<Record<CampoDaMarca, string>> = {
  proposito_e_promessa: "purposeAndPromise",
  publico_e_relacao: "audienceRelation",
  voz: "voicePairsJson",
  lexico: "lexiconJson",
  referencias: "referencesJson",
  atributos_formais: "formalTokensJson",
  limites_de_promessa: "promiseLimits",
  hierarquia_e_dono: "ownerAndHierarchyJson",
};

/** Colunas guardadas como JSON. Texto puro que chega para elas é embrulhado, em
 *  vez de gravado cru — senão a leitura seguinte quebra e o campo inteiro some
 *  da ficha sem ninguém perceber. */
export const COLUNA_EH_JSON = new Set([
  "voicePairsJson", "lexiconJson", "referencesJson", "formalTokensJson", "ownerAndHierarchyJson",
]);

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
   * O que AINDA FALTA para a publicação deixar de ser barrada, em português de
   * gente e item por item.
   *
   * Existe porque `definidos` e `naoConstituida` respondem perguntas
   * diferentes, e a tela mostrava só o primeiro. Um campo pode estar
   * legitimamente `definido` (uma proibição registrada É uma regra, e o piso a
   * cobra) sem o gatilho estar satisfeito (ele pede três). Enquanto a tela
   * mostrava "8 de 9" e a porta continuava fechada, ninguém tinha como
   * descobrir o que faltava sem ler o código do gatilho.
   *
   * Vazio = a porta abre. É o mesmo cálculo de `naoConstituida`, escrito por
   * extenso — nunca uma segunda conta.
   */
  oQueFaltaParaPublicar: string[];
}

function textoDe(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

/**
 * O JSON tem CONTEÚDO — não só envelope.
 *
 * ── O que esta função contava antes, e por que era o defeito ───────────────
 *
 * Ela media `Object.keys(v).length > 0`: contava CHAVE, não resposta. Com isso,
 * `{"dizemos":"vaga perto de você","naoDizemos":""}` e `{"descricao":""}`
 * chegavam como campo `definido` — a ficha somava +1, a barra de progresso
 * andava, e a metade que a régua exige estava em branco.
 *
 * **É isto que fazia a tela mostrar progresso com a porta fechada.** O cliente
 * respondia, o número subia, e `naoConstituida` continuava `true` sem nada na
 * tela explicar por quê. Número que promete o que a máquina não faz é pior que
 * número nenhum.
 *
 * Agora conta FOLHA com texto: um objeto cujos valores são todos vazios é um
 * envelope vazio, e envelope vazio não é resposta.
 */
function jsonTemConteudo(bruto: string | null | undefined): boolean {
  const s = (bruto ?? "").trim();
  if (!s || s === "{}" || s === "[]" || s === "null") return false;
  try {
    return algumaFolhaCheia(JSON.parse(s), 0);
  } catch {
    return false;
  }
}

/** Fundo máximo da varredura. JSON de ficha é raso; o teto existe para que
 *  estrutura estranha não vire recursão infinita. */
const FUNDO_MAXIMO = 4;

function algumaFolhaCheia(v: unknown, fundo: number): boolean {
  if (fundo > FUNDO_MAXIMO) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number" || typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some((x) => algumaFolhaCheia(x, fundo + 1));
  if (v && typeof v === "object") return Object.values(v).some((x) => algumaFolhaCheia(x, fundo + 1));
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// OS LEITORES DAS DUAS METADES
//
// Uma função por campo, e ela é lida por TRÊS bocas: o estado do campo na ficha,
// o gatilho do dia zero e a pergunta que volta ao cliente. Enquanto a tela
// contava por um critério e o portão decidia por outro, a ficha mostrava
// progresso e a porta continuava fechada — sem nada ficar vermelho.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParDeVoz {
  dizemos: string;
  naoDizemos: string;
}

/** Os pares de voz gravados. Tolera o formato antigo (array) e o objeto solto. */
export function paresDeVoz(bruto: string | null | undefined): ParDeVoz[] {
  try {
    const v = JSON.parse((bruto ?? "").trim() || "[]") as unknown;
    const lista = Array.isArray(v) ? v : [v];
    return lista
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ dizemos: textoDe(x.dizemos), naoDizemos: textoDe(x.naoDizemos) }));
  } catch {
    return [];
  }
}

/** Um par de voz só é par com as DUAS metades. "Falamos assim" sozinho descreve;
 *  é o "nunca falaríamos assim" que permite reprovar. */
export function vozCompleta(bruto: string | null | undefined): boolean {
  return paresDeVoz(bruto).some((p) => !!p.dizemos && !!p.naoDizemos);
}

export interface Referencias {
  aprovadas: string[];
  reprovadas: string[];
}

export function referenciasDeclaradas(bruto: string | null | undefined): Referencias {
  try {
    const v = JSON.parse((bruto ?? "").trim() || "{}") as { aprovadas?: unknown; reprovadas?: unknown };
    const lista = (x: unknown): string[] =>
      Array.isArray(x) ? x.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean) : [];
    return { aprovadas: lista(v.aprovadas), reprovadas: lista(v.reprovadas) };
  } catch {
    return { aprovadas: [], reprovadas: [] };
  }
}

/**
 * A régua das referências: uma aprovada E uma reprovada.
 *
 * **Esta é a função que decide a publicação** — pelo gatilho do dia zero, por
 * `contratoDeMarca` e por `publicacao.ts`. Ela está certa em espírito e não
 * mudou: sem contraexemplo não há como reprovar peça, e agência que só sabe o
 * que o cliente gosta aprova tudo. O que mudou foi existir por onde escrever a
 * segunda metade.
 */
export function referenciasCompletas(bruto: string | null | undefined): boolean {
  const r = referenciasDeclaradas(bruto);
  return r.aprovadas.length >= 1 && r.reprovadas.length >= 1;
}

/** As metades que ainda faltam num campo de par. Campo de resposta única
 *  devolve vazio — não existe segunda metade para cobrar. */
export function metadesQueFaltam(campo: CampoDaMarca, bruto: string | null | undefined): MetadeDaResposta[] {
  const metades = METADES[campo];
  if (!metades) return [];
  if (campo === "voz") {
    const par = paresDeVoz(bruto).find((p) => p.dizemos || p.naoDizemos) ?? { dizemos: "", naoDizemos: "" };
    return metades.filter((m) => !(m.chave === "dizemos" ? par.dizemos : par.naoDizemos));
  }
  const r = referenciasDeclaradas(bruto);
  return metades.filter((m) => (m.chave === "aprovada" ? r.aprovadas.length === 0 : r.reprovadas.length === 0));
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
      // e adjetivo não é verificável. Só os pares de exemplo contam — e **um par
      // com uma metade em branco não é um par**. `jsonTemConteudo` contava a
      // CHAVE, então `{dizemos:"x", naoDizemos:""}` somava +1 na tela enquanto
      // a régua continuava sem o "nunca falaríamos assim" que permite reprovar.
      cheio: vozCompleta(marca?.voicePairsJson),
      valor: legivel(marca?.voicePairsJson),
    },
    lexico: { cheio: jsonTemConteudo(marca?.lexiconJson), valor: legivel(marca?.lexiconJson) },
    proibicoes: {
      cheio: temProibicao,
      valor: (proib.itens ?? []).map((i) => i.frase).join(" · ").slice(0, 240),
    },
    // A MESMA função que o gatilho do dia zero consulta, e que
    // `publicacao.ts:699` obedece. Enquanto a ficha contava por
    // `jsonTemConteudo` e a porta decidia por `referenciasCompletas`, o campo
    // aparecia verde na tela com a publicação barrada — dois números para a
    // mesma pergunta, e o da tela era o mentiroso.
    referencias: { cheio: referenciasCompletas(marca?.referencesJson), valor: legivel(marca?.referencesJson) },
    atributos_formais: {
      cheio: jsonTemConteudo(marca?.formalTokensJson) || !!textoDe(marca?.primaryColor),
      valor: legivel(marca?.formalTokensJson) || [marca?.primaryColor, marca?.secondaryColor, marca?.typography].filter(Boolean).join(" · "),
    },
    limites_de_promessa: { cheio: !!textoDe(marca?.promiseLimits), valor: textoDe(marca?.promiseLimits) },
    hierarquia_e_dono: { cheio: jsonTemConteudo(marca?.ownerAndHierarchyJson), valor: legivel(marca?.ownerAndHierarchyJson) },
  };

  /** O texto CRU de cada coluna de par, para as metades serem contadas na
   *  fonte e não no texto já resumido para leitura humana. */
  const brutoDaColuna: Partial<Record<CampoDaMarca, string | null>> = {
    voz: marca?.voicePairsJson ?? null,
    referencias: marca?.referencesJson ?? null,
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
      // As metades pendentes acompanham o campo mesmo quando ele já conta como
      // definido: `voz` com um par completo e outro pela metade não é lacuna,
      // mas ainda tem o que perguntar.
      metadesQueFaltam: metadesQueFaltam(campo, brutoDaColuna[campo] ?? null),
    };
  });

  const definidos = campos.filter((c) => c.estado === "definido").length;
  const lacunas = campos.filter((c) => c.estado === "lacuna");

  // ── O GATILHO DE SAÍDA DO DIA ZERO, verificável por máquina ──────────────
  // Da constituição: campos 1, 2, 3, 4 e 9 definidos, ao menos 3 proibições
  // vigentes e ao menos 2 referências. "Quando houver regra" não é gatilho —
  // é opinião, e opinião nunca fecha um estado.
  const exigidos: CampoDaMarca[] = ["proposito_e_promessa", "publico_e_relacao", "voz", "lexico", "hierarquia_e_dono"];
  const temExigidos = exigidos.every((c) => campos.find((x) => x.campo === c)?.estado === "definido");
  const proibicoesSuficientes = (proib.itens ?? []).length >= 3;
  // A MESMA função que a ficha usa para dizer se o campo está definido. Duas
  // contas para a mesma pergunta é como a tela mostra 22% e a porta continua
  // fechada sem ninguém entender por quê.
  const referenciasSuficientes = referenciasCompletas(marca?.referencesJson);

  // O MESMO cálculo, escrito por extenso. Nunca uma segunda conta: cada item
  // aqui é uma das três parcelas do gatilho, e a lista vazia é exatamente a
  // condição de `naoConstituida === false`.
  const refs = referenciasDeclaradas(marca?.referencesJson);
  const oQueFaltaParaPublicar = [
    ...exigidos
      .filter((c) => campos.find((x) => x.campo === c)?.estado !== "definido")
      .map((c) => ROTULO[c]),
    proibicoesSuficientes
      ? ""
      : `o que a marca nunca faz — ${(proib.itens ?? []).length} de 3 regras registradas`,
    referenciasSuficientes
      ? ""
      : refs.aprovadas.length === 0 && refs.reprovadas.length === 0
      ? "um post que é a cara de vocês, e um que não é"
      : refs.reprovadas.length === 0
      ? "falta o post que NÃO era a cara de vocês — é ele que me deixa reprovar peça"
      : "falta o post que É a cara de vocês",
  ].filter(Boolean);

  return {
    clientId,
    campos,
    definidos,
    lacunas,
    naoConstituida: !(temExigidos && proibicoesSuficientes && referenciasSuficientes),
    oQueFaltaParaPublicar,
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
