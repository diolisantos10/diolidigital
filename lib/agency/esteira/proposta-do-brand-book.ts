// proposta-do-brand-book.ts — A EXTRAÇÃO DO BRAND BOOK VIRA PROPOSTA DE FICHA.
//
// ── O DEFEITO QUE ISTO FECHA (15/08/2026) ───────────────────────────────────
//
// `app/api/brain/analyze-brand-book/route.ts` roda, lê o PDF e devolve paleta,
// tipografia, tom, público e posicionamento. A tela do Brand Hub renderiza tudo
// (`app/agency/brand-hub-agent/page.tsx`, bloco `bbExtraction`).
//
// E **nada disso era gravado**. A extração morria no estado do React: fechar a
// aba jogava fora o trabalho. O CEO mandou o brand book do CityJobs, viu a
// análise aparecer na tela, e a ficha de marca continuou em 22% — porque nenhuma
// linha do resultado chegava ao `BrandBrain`.
//
// A porta de escrita SEMPRE existiu: `PUT /api/agency/clients/[id]/marca`
// (route.ts:64). O que faltava era a ponte — e duas garantias sem as quais a
// ponte não podia existir.
//
// ── GARANTIA 1: A EXTRAÇÃO PROPÕE, NUNCA SOBRESCREVE ────────────────────────
//
// O `PUT` grava o que recebe (`update: dados`, route.ts:95). Mandar a extração
// direto para ele apagaria a resposta que o DONO já tinha dado, trocando a
// palavra do cliente pelo palpite de um modelo lendo um PDF. Campo já `definido`
// na ficha entra em `jaDefinidos` e **não é tocado** — a máquina não muda a
// regra que o humano fixou.
//
// ── GARANTIA 2: PROCEDÊNCIA, OU NÃO ENTRA ──────────────────────────────────
//
// Todo campo aplicado registra de qual ARQUIVO veio, QUANDO e QUEM confirmou,
// em `BrandBrain.fieldStatesJson` — que já existe exatamente para isso ("JSON
// por campo … com data e autor", schema.prisma). Sem isso, daqui a três meses
// ninguém sabe se "público: donos de pequeno comércio" saiu da boca do cliente
// ou de um modelo chutando a partir de um PDF.
//
// ── E O MAIS IMPORTANTE: O BRAND BOOK NÃO FECHA A FICHA ────────────────────
//
// Medido contra `ficha-de-marca.ts` (o `bruto` de `lerFichaDeMarca`), o brand
// book alcança **3 dos 9 campos**. Os outros seis não são falha de extração:
// eles **não existem em brand book nenhum**, porque são decisão do dono, não
// descrição da marca.
//
// Isso PRECISA aparecer na tela. Uma tela que sugere "mandou o PDF, resolveu"
// faz o CEO clicar em aplicar e continuar vendo 33% sem entender por quê — e a
// culpa parece do sistema. Por isso `foraDoAlcance` sai junto da proposta, com
// o motivo de cada um, e não é opcional.
//
// Mais forte ainda, e é o número que importa: nenhum dos três campos alcançados
// entra no gatilho de saída do dia zero (`naoConstituida` exige voz, léxico,
// hierarquia, 3 proibições e referências aprovadas E reprovadas). **Aplicar o
// brand book inteiro não tira a marca do dia zero.** Ver `fechaAFicha`.

import type { BrandExtraction } from "@/lib/types/brand-extraction";
import { CAMPOS_DA_MARCA, ROTULO, type CampoDaMarca, type FichaDeMarca } from "@/lib/agency/esteira/ficha-de-marca";

/** Um campo que o brand book consegue preencher, pronto para o `PUT`. */
export interface PropostaDeCampo {
  campo: CampoDaMarca;
  rotulo: string;
  /** O valor a gravar. Já no formato que aquele campo espera. */
  valor: string;
  /** De onde saiu, em português. Vai para a tela e para a procedência. */
  deOnde: string;
}

/** Um campo que o brand book NÃO alcança, com o motivo dito por extenso. */
export interface ForaDoAlcance {
  campo: CampoDaMarca;
  rotulo: string;
  porque: string;
}

export interface PropostaDoBrandBook {
  /** O que dá para aplicar agora: alcançável pelo brand book E ainda em lacuna. */
  aplicaveis: PropostaDeCampo[];
  /** Alcançável, mas o dono já respondeu. NÃO é sobrescrito. */
  jaDefinidos: Array<{ campo: CampoDaMarca; rotulo: string }>;
  /** Os seis que nenhum brand book traz. */
  foraDoAlcance: ForaDoAlcance[];
  /** A frase de conclusão para a tela. Diz o que falta e por quê. */
  recado: string;
  /** `false` sempre — e a constante existe para ser testada, não para variar.
   *  Ver o cabeçalho: nenhum campo alcançável entra no gatilho do dia zero. */
  fechaAFicha: false;
}

/**
 * Os três campos que um brand book alcança, e POR QUE só três.
 *
 * Derivado de `lerFichaDeMarca`: um campo só conta como `definido` quando a
 * coluna que ele lê tem conteúdo. Cruzando as colunas com o que
 * `BrandExtraction` traz, sobram estes.
 */
export const ALCANCADOS_PELO_BRAND_BOOK: CampoDaMarca[] = [
  "proposito_e_promessa",
  "publico_e_relacao",
  "atributos_formais",
];

/**
 * Por que cada um dos outros seis fica de fora. Texto de tela: quem lê é o dono
 * do negócio, e ele precisa entender que a falta não é defeito do sistema.
 */
export const PORQUE_FORA_DO_ALCANCE: Record<CampoDaMarca, string> = {
  proposito_e_promessa: "",
  publico_e_relacao: "",
  atributos_formais: "",
  voz:
    "O brand book descreve o tom com adjetivo (\"moderno e ousado\"). A ficha exige DUAS FRASES literais — uma do jeito que vocês falam, outra do jeito que nunca falariam. Adjetivo não é verificável; frase é.",
  lexico:
    "Grafia exata do nome e as palavras que vocês não usam. É decisão de dono — nenhum PDF de identidade visual traz a lista de palavras proibidas.",
  proibicoes:
    "O que a marca nunca faz. Mora em outro lugar do sistema e vem sempre da boca do cliente, nunca de um documento.",
  referencias:
    "Exige o exemplo que ficou CERTO e o que ficou ERRADO, com motivo. Brand book traz o certo; o errado só o dono sabe.",
  limites_de_promessa:
    "O que não se afirma mesmo sendo verdade (superlativo, garantia, comparação com concorrente). É risco jurídico e de marca — decisão do dono, não do designer que fez o manual.",
  hierarquia_e_dono:
    "Quem aprova, por qual canal e em quanto tempo. Não existe em brand book nenhum: é combinação entre vocês e a agência.",
};

function limpo(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

/**
 * Monta a proposta a partir da extração e da ficha ATUAL.
 *
 * Pura: sem banco, sem rede. Dá para provar as duas metades que importam — que
 * campo já respondido pelo dono não entra em `aplicaveis`, e que os seis fora do
 * alcance saem nomeados com motivo.
 */
export function proporDoBrandBook(
  extracao: BrandExtraction,
  ficha: Pick<FichaDeMarca, "campos">,
): PropostaDoBrandBook {
  const estadoDe = (c: CampoDaMarca) => ficha.campos.find((x) => x.campo === c)?.estado ?? "lacuna";

  const candidatos: PropostaDeCampo[] = [];

  // 1) Propósito e promessa. O posicionamento é o que mais se aproxima; a
  //    tagline entra só como reforço, e o resumo NÃO entra — resumo de modelo é
  //    paráfrase, e paráfrase virando régua de marca é como a peça começa a
  //    afirmar o que ninguém disse.
  const proposito = [limpo(extracao.positioning), limpo(extracao.tagline)].filter(Boolean).join(" — ");
  if (proposito) {
    candidatos.push({
      campo: "proposito_e_promessa",
      rotulo: ROTULO.proposito_e_promessa,
      valor: proposito.slice(0, 4000),
      deOnde: "posicionamento e tagline do brand book",
    });
  }

  // 2) Público e relação. O brand book descreve o público; a RELAÇÃO (par,
  //    autoridade, prestador) ele quase nunca diz — e por isso o valor entra
  //    como está, sem a casa completar a metade que falta.
  const publico = limpo(extracao.targetAudience);
  if (publico) {
    candidatos.push({
      campo: "publico_e_relacao",
      rotulo: ROTULO.publico_e_relacao,
      valor: publico.slice(0, 4000),
      deOnde: "público-alvo do brand book",
    });
  }

  // 3) Atributos formais. Este é o campo em que o brand book é a MELHOR fonte
  //    que existe: cor e tipografia saem como VALOR (hex, nome da fonte), que é
  //    exatamente o que `formalTokensJson` exige — token, nunca adjetivo.
  const tokens: Record<string, string> = {};
  if (limpo(extracao.primaryColor)) tokens.corPrimaria = limpo(extracao.primaryColor);
  if (limpo(extracao.secondaryColor)) tokens.corSecundaria = limpo(extracao.secondaryColor);
  if (limpo(extracao.accentColor)) tokens.corDeDestaque = limpo(extracao.accentColor);
  if (limpo(extracao.typography)) tokens.tipografia = limpo(extracao.typography);
  if (Object.keys(tokens).length > 0) {
    candidatos.push({
      campo: "atributos_formais",
      rotulo: ROTULO.atributos_formais,
      valor: JSON.stringify(tokens),
      deOnde: "paleta e tipografia do brand book",
    });
  }

  // ── A trava: já definido não entra ────────────────────────────────────────
  const aplicaveis: PropostaDeCampo[] = [];
  const jaDefinidos: Array<{ campo: CampoDaMarca; rotulo: string }> = [];
  for (const c of candidatos) {
    if (estadoDe(c.campo) === "definido") jaDefinidos.push({ campo: c.campo, rotulo: c.rotulo });
    else aplicaveis.push(c);
  }

  const foraDoAlcance: ForaDoAlcance[] = CAMPOS_DA_MARCA
    .filter((c) => !ALCANCADOS_PELO_BRAND_BOOK.includes(c))
    .map((c) => ({ campo: c, rotulo: ROTULO[c], porque: PORQUE_FORA_DO_ALCANCE[c] }));

  const recado = montarRecado(aplicaveis.length, jaDefinidos.length, foraDoAlcance.length);

  return { aplicaveis, jaDefinidos, foraDoAlcance, recado, fechaAFicha: false };
}

/**
 * A frase que a tela mostra. Regra: ela NUNCA pode soar como "pronto".
 *
 * O CEO precisa sair desta tela sabendo que ainda vai ter que responder
 * perguntas — senão ele aplica, vê 33% e conclui que o sistema comeu o PDF dele.
 */
function montarRecado(aplicaveis: number, jaDefinidos: number, fora: number): string {
  const partes: string[] = [];
  if (aplicaveis > 0) partes.push(`${aplicaveis} campo(s) da ficha saem do brand book`);
  if (jaDefinidos > 0) partes.push(`${jaDefinidos} já tinham sido respondidos por você e não foram tocados`);
  const cabeca = partes.length > 0 ? partes.join(", e ") + "." : "O brand book não trouxe nada que a ficha use.";
  return `${cabeca} Os outros ${fora} campos NÃO vêm de brand book nenhum — são decisão sua (como vocês falam, o que nunca se diz, quem aprova). O PDF adianta a parte visual; ele não fecha a ficha nem tira a marca do dia zero.`;
}

/**
 * O registro de procedência de um campo aplicado.
 *
 * Vai para `fieldStatesJson`, que já é o lugar do estado por campo. Guardar em
 * coluna nova duplicaria a verdade sobre o mesmo fato.
 */
export interface ProcedenciaDoCampo {
  estado: "definido";
  origem: "brand_book";
  /** O nome do arquivo de onde saiu. É o que permite auditar depois. */
  arquivo: string;
  /** Quem clicou em aplicar. Nunca "sistema": alguém confirmou. */
  confirmadoPor: string;
  em: string;
  deOnde: string;
}

/**
 * Funde a procedência dos campos aplicados no `fieldStatesJson` que já existe.
 *
 * NUNCA reescreve o objeto inteiro: estado de campo que veio de outro caminho
 * (o formulário do portal, a resposta do dono) tem que sobreviver a isto. JSON
 * ilegível no banco é tratado como vazio — e não como motivo para perder o que
 * está sendo gravado agora.
 */
export function fundirProcedencia(
  fieldStatesJsonAtual: string | null | undefined,
  aplicados: PropostaDeCampo[],
  contexto: { arquivo: string; confirmadoPor: string; em?: Date },
): string {
  let base: Record<string, unknown> = {};
  try {
    const v = JSON.parse((fieldStatesJsonAtual ?? "{}").trim() || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) base = v as Record<string, unknown>;
  } catch {
    base = {};
  }

  const em = (contexto.em ?? new Date()).toISOString();
  for (const c of aplicados) {
    const registro: ProcedenciaDoCampo = {
      estado: "definido",
      origem: "brand_book",
      arquivo: contexto.arquivo.slice(0, 200),
      confirmadoPor: contexto.confirmadoPor.slice(0, 120),
      em,
      deOnde: c.deOnde,
    };
    base[c.campo] = registro;
  }

  return JSON.stringify(base);
}
