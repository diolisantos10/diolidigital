// storyboard.ts — ANTES DA ARTE, A HISTÓRIA. E A HISTÓRIA É CONFERÍVEL.
//
// ── O DIAGNÓSTICO (CEO, 07/08/2026) ─────────────────────────────────────────
//
// "Tem carrosséis que têm duas imagens e as imagens ficam sendo repetidas. NÃO
// CONTAM HISTÓRIA DE ACORDO COM O TEXTO, SÓ SÃO IMAGENS."
//
// É diagnóstico de método, não de qualidade do gerador. Nas peças de referência
// que ele enviou, a imagem É O ARGUMENTO: o post-it bagunçado *é* o
// esquecimento, a sacola entregue *é* o canal próprio, a tela do app *é* a
// automação. Nas nossas, a imagem é FUNDO — e imagem repetida entre telas é a
// prova material de que aquela tela não tinha função própria.
//
// ── O QUE ESTE MÓDULO FAZ ───────────────────────────────────────────────────
//
// Obriga cada tela a DECLARAR que papel cumpre na história antes de existir
// como arte, e depois CONFERE a declaração. Não é opinião de gosto — as duas
// coisas que o CEO apontou são contáveis:
//
//   • duas telas com a mesma função → a peça não passa;
//   • imagem repetida entre telas   → a peça não passa.
//
// E a terceira, que é a que evita a invenção: quando a função não pode ser
// cumprida com o material disponível, a peça DECLARA O QUE FALTA e escala.
// Nunca preenche com foto genérica. Ausência de informação não é informação.
//
// ── ESTE ARQUIVO É PURO ─────────────────────────────────────────────────────
//
// Sem banco, rede, navegador ou IA. Entra storyboard, sai veredito. É
// pré-requisito de "sem gate = reprovado": checagem que precisa de
// infraestrutura para rodar acaba desligada no dia em que a infraestrutura
// tosse — e aí a peça passa sozinha.
//
// ── POR QUE A RÉGUA É DADO, E NÃO `if` ──────────────────────────────────────
//
// O CEO pediu a revistinha semanal de tech: outro formato, outra régua. Se
// "duas telas com a mesma função reprova" fosse regra fixa no motor, a
// revistinha — que é uma sequência de notícias, ou seja, várias telas com a
// MESMA função DE PROPÓSITO — só entraria como exceção dentro de um `if`. Então
// a não-repetição de FUNÇÃO é o default, e cada formato declara por escrito
// quais funções podem repetir e por quê (`funcoesQuePodemRepetir`).
//
// A repetição de IMAGEM não é negociável em formato nenhum. Não existe régua
// que a libere, porque foi exatamente ela que o CEO apontou com o dedo.

/**
 * O papel que uma tela cumpre na história.
 *
 * O vocabulário é FECHADO de propósito: papel em texto livre volta a ser
 * descrição, e descrição não é conferível. Papel novo entra declarando o que
 * ele cumpre E o que a IMAGEM dele precisa mostrar — porque é daí que sai a
 * escolha da foto, em vez de "o que sobrou".
 */
export interface Funcao {
  id: string;
  label: string;
  /** O que esta tela precisa fazer no texto. */
  cumpre: string;
  /** O que a IMAGEM desta tela precisa MOSTRAR para servir ao papel.
   *  É este campo que transforma "imagem de fundo" em "imagem argumento". */
  imagemPrecisa: string;
}

/** O vocabulário de papéis da casa. */
export const FUNCOES: Record<string, Funcao> = {
  // ── A história de venda ────────────────────────────────────────────────────
  gancho: {
    id: "gancho",
    label: "Gancho",
    cumpre: "para o dedo: nomeia a dor ou a pergunta, em uma frase.",
    imagemPrecisa: "a cena da dor/pergunta ACONTECENDO — não um retrato bonito do produto.",
  },
  tensao: {
    id: "tensao",
    label: "Tensão",
    cumpre: "mostra o custo de continuar como está.",
    imagemPrecisa: "o custo visível: a bagunça, a fila, a mensagem sem resposta.",
  },
  prova: {
    id: "prova",
    label: "Prova",
    cumpre: "traz evidência REAL do cliente — dado, captura, caso, número com origem.",
    imagemPrecisa: "a evidência em si (captura real, documento, cena registrada). Ilustração de evidência entra com selo de ilustração, nunca disfarçada de prova.",
  },
  mecanismo: {
    id: "mecanismo",
    label: "Mecanismo",
    cumpre: "explica COMO funciona — o passo, a engrenagem, a diferença.",
    imagemPrecisa: "a engrenagem em operação: a tela do produto, a mão fazendo, o antes/depois.",
  },
  resultado: {
    id: "resultado",
    label: "Resultado",
    cumpre: "mostra o estado depois, sem prometer número que não veio do cliente.",
    imagemPrecisa: "o estado depois, na cena real do negócio.",
  },
  acao: {
    id: "acao",
    label: "Ação",
    cumpre: "diz o próximo passo, um só, concreto.",
    imagemPrecisa: "o ponto de contato: a porta, o balcão, o canal por onde a ação acontece.",
  },
  // ── A revistinha semanal (formato pedido pelo CEO em 07/08/2026) ──────────
  // Vive no mesmo vocabulário, e não num arquivo à parte, porque a conferência
  // é a mesma. O que muda é a RÉGUA, não o motor.
  capa: {
    id: "capa",
    label: "Capa da edição",
    cumpre: "nomeia a edição e a semana. É índice, não manchete de venda.",
    imagemPrecisa: "uma cena-síntese daquela semana, própria daquela edição.",
  },
  materia: {
    id: "materia",
    label: "Matéria",
    cumpre: "uma notícia por tela: o que aconteceu e por que importa para quem lê.",
    imagemPrecisa: "a cena daquela notícia específica. Duas matérias nunca dividem imagem.",
  },
  fechamento: {
    id: "fechamento",
    label: "Fechamento",
    cumpre: "amarra a edição e diz quando sai a próxima.",
    imagemPrecisa: "a assinatura visual da publicação, própria do fechamento.",
  },
};

/** Uma tela declarada, antes de virar arte. */
export interface TelaDoStoryboard {
  /** 1-based, na ordem de leitura. */
  ordem: number;
  /** O id do papel em `FUNCOES`. `null` = não declarou — e não declarar
   *  REPROVA. Sem gate = reprovado; sem declaração não existe gate. */
  funcao: string | null;
  /** A cena, em palavras. Vira o prompt da foto e a fonte auditada do texto. */
  descricao: string;
  /**
   * A identidade da imagem desta tela: hash dos bytes, id do MediaAsset ou
   * qualquer chave estável. Duas telas com a mesma identidade = imagem
   * repetida. Ausente antes da produção é o normal — a conferência de imagem
   * só morde quando as identidades existem.
   */
  imagem?: string | null;
  /**
   * O material que a FUNÇÃO exige e que a casa NÃO tem.
   *
   * Exemplo real: `prova` exige evidência do cliente. Sem o dado dele, a tela
   * não pode ser cumprida — e a saída certa não é uma foto genérica de gente
   * sorrindo, é declarar a falta e escalar.
   */
  materialFaltante?: string[];
}

/**
 * A régua de um formato de produto.
 *
 * Formato novo entra criando uma régua — nunca abrindo exceção no motor.
 */
export interface ReguaDeStoryboard {
  id: string;
  label: string;
  /** De onde veio esta régua. Régua sem procedência é gosto da agência virando
   *  norma da marca do cliente. */
  procedencia: string;
  minTelas: number;
  maxTelas: number;
  /** Os papéis admitidos. Papel fora desta lista reprova — inclusive um papel
   *  válido de OUTRO formato. */
  funcoesPermitidas: string[];
  /** O papel obrigatório da PRIMEIRA tela. Ausente = o formato não exige. */
  abreCom?: string | null;
  /** O papel obrigatório da ÚLTIMA tela. Ausente = o formato não exige. */
  fechaCom?: string | null;
  /**
   * Os papéis que PODEM repetir neste formato, com o motivo escrito.
   *
   * Aqui mora a diferença entre "a revistinha é um formato" e "a revistinha é
   * uma gambiarra".
   */
  funcoesQuePodemRepetir?: Array<{ funcao: string; porque: string }>;
}

/** O carrossel comercial — a régua que os 36 criativos da Foocci não tiveram. */
export const REGUA_CARROSSEL_DE_VENDA: ReguaDeStoryboard = {
  id: "carrossel-de-venda",
  label: "Carrossel de venda",
  procedencia: "descrito pelo Diretor a partir das peças enviadas pelo CEO em 07/08/2026",
  minTelas: 3,
  maxTelas: 6,
  funcoesPermitidas: ["gancho", "tensao", "prova", "mecanismo", "resultado", "acao"],
  abreCom: "gancho",
  fechaCom: "acao",
  // Nenhuma repetição: num carrossel de venda, duas telas com o mesmo papel são
  // a mesma tela publicada duas vezes.
};

/** A revistinha semanal de tech da Dioli — pedida pelo CEO em 07/08/2026. */
export const REGUA_REVISTINHA_SEMANAL: ReguaDeStoryboard = {
  id: "revistinha-semanal-tech",
  label: "Revistinha semanal — atualizações do mundo tech",
  procedencia:
    'pedida pelo CEO em 07/08/2026: "hoje a gente criou uma revistinha semanal falando das atualizações do mundo tech; tem que rodar uma vez por semana, e aí é outro formato de design"',
  minTelas: 4,
  maxTelas: 8,
  funcoesPermitidas: ["capa", "materia", "fechamento"],
  abreCom: "capa",
  fechaCom: "fechamento",
  funcoesQuePodemRepetir: [
    {
      funcao: "materia",
      porque:
        "a edição É uma sequência de notícias — repetir o papel de matéria é o formato, não um defeito. Cada matéria continua obrigada a ter imagem e cena próprias.",
    },
  ],
};

export const REGUAS: Record<string, ReguaDeStoryboard> = {
  [REGUA_CARROSSEL_DE_VENDA.id]: REGUA_CARROSSEL_DE_VENDA,
  [REGUA_REVISTINHA_SEMANAL.id]: REGUA_REVISTINHA_SEMANAL,
};

export type MotivoDeReprovacao =
  | "funcao_nao_declarada"
  | "funcao_fora_da_regua"
  | "funcao_repetida"
  | "imagem_repetida"
  | "cena_repetida"
  | "abertura_errada"
  | "fechamento_errado"
  | "telas_fora_da_faixa"
  | "material_faltante";

export interface Reprovacao {
  motivo: MotivoDeReprovacao;
  /** As telas envolvidas, 1-based. É o "nomeando qual tela e por quê". */
  telas: number[];
  /** A frase que vai para o registro, escrita para quem não leu o código. */
  detalhe: string;
}

export type ResultadoDoStoryboard =
  | { ok: true; regua: string; telas: TelaDoStoryboard[] }
  | { ok: false; regua: string; reprovacoes: Reprovacao[] };

// ─── Normalização, para comparar cena com cena ──────────────────────────────

/**
 * A assinatura de uma cena: minúscula, sem acento, sem pontuação, sem palavra
 * vazia, ordenada.
 *
 * Existe porque a repetição que o CEO apontou raramente é byte a byte — é "uma
 * mesa de café da manhã" contra "a mesa do café da manhã". Comparar string crua
 * não pegaria nenhuma das duas.
 */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "e", "ou", "que", "com", "sem", "para", "por",
  "ao", "aos", "se", "ele", "ela", "the", "of",
]);

export function assinaturaDaCena(texto: string): string[] {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !VAZIAS.has(t))
    .sort();
}

/** Jaccard entre duas assinaturas de cena. Conta, não julgamento. */
export function semelhancaDeCena(a: string, b: string): number {
  const A = new Set(assinaturaDaCena(a));
  const B = new Set(assinaturaDaCena(b));
  if (A.size === 0 || B.size === 0) return 0;
  let comuns = 0;
  for (const t of A) if (B.has(t)) comuns++;
  return comuns / (A.size + B.size - comuns);
}

/**
 * A partir de que semelhança duas cenas são A MESMA CENA.
 *
 * 0.7, e não 0.95: o alvo não é o copiar-e-colar (esse o modelo quase nunca
 * faz), é a cena reescrita com outras palavras — que produz exatamente a imagem
 * repetida que o CEO viu. Falso positivo aqui custa uma reescrita de cena;
 * falso negativo custa um carrossel publicado no perfil do cliente com a mesma
 * foto duas vezes.
 */
export const LIMIAR_DE_CENA_REPETIDA = 0.7;

// ─── A conferência ──────────────────────────────────────────────────────────

/**
 * Confere o storyboard contra a régua do formato. Nunca lança.
 *
 * REPROVA — não avisa. O retorno de falha NÃO carrega as telas, de propósito:
 * quem chamou não consegue produzir a partir de um veredito negativo sem
 * escrever código novo para isso.
 */
export function conferirStoryboard(
  telas: TelaDoStoryboard[],
  regua: ReguaDeStoryboard,
): ResultadoDoStoryboard {
  const reprovacoes: Reprovacao[] = [];
  const n = telas.length;

  if (n < regua.minTelas || n > regua.maxTelas) {
    reprovacoes.push({
      motivo: "telas_fora_da_faixa",
      telas: [],
      detalhe: `o storyboard tem ${n} tela(s) e o formato "${regua.label}" pede de ${regua.minTelas} a ${regua.maxTelas}.`,
    });
  }

  // ── 1. TODA TELA DECLARA O PAPEL ──────────────────────────────────────────
  // Sem declaração não existe conferência, e sem conferência a tela volta a ser
  // "só uma imagem". A reprovação nomeia a tela para que dê para consertar.
  for (const t of telas) {
    const f = (t.funcao ?? "").trim();
    if (!f) {
      reprovacoes.push({
        motivo: "funcao_nao_declarada",
        telas: [t.ordem],
        detalhe: `a tela ${t.ordem} não declarou que papel cumpre na história. Papéis deste formato: ${regua.funcoesPermitidas.join(", ")}.`,
      });
      continue;
    }
    if (!regua.funcoesPermitidas.includes(f)) {
      reprovacoes.push({
        motivo: "funcao_fora_da_regua",
        telas: [t.ordem],
        detalhe: `a tela ${t.ordem} declarou o papel "${f}", que não pertence ao formato "${regua.label}". Papéis deste formato: ${regua.funcoesPermitidas.join(", ")}.`,
      });
    }
  }

  // ── 2. DUAS TELAS COM O MESMO PAPEL ───────────────────────────────────────
  const podeRepetir = new Map((regua.funcoesQuePodemRepetir ?? []).map((r) => [r.funcao, r.porque]));
  const porFuncao = new Map<string, number[]>();
  for (const t of telas) {
    const f = (t.funcao ?? "").trim();
    if (!f || !regua.funcoesPermitidas.includes(f)) continue;
    porFuncao.set(f, [...(porFuncao.get(f) ?? []), t.ordem]);
  }
  for (const [f, ordens] of porFuncao) {
    if (ordens.length < 2 || podeRepetir.has(f)) continue;
    reprovacoes.push({
      motivo: "funcao_repetida",
      telas: ordens,
      detalhe: `as telas ${ordens.join(" e ")} cumprem o MESMO papel ("${FUNCOES[f]?.label ?? f}") — é a mesma tela publicada ${ordens.length} vezes. No formato "${regua.label}" esse papel não pode repetir.`,
    });
  }

  // ── 3. ABERTURA E FECHAMENTO ──────────────────────────────────────────────
  if (regua.abreCom && n > 0) {
    const primeira = telas[0]!;
    if ((primeira.funcao ?? "").trim() !== regua.abreCom) {
      reprovacoes.push({
        motivo: "abertura_errada",
        telas: [primeira.ordem],
        detalhe: `a primeira tela declarou "${primeira.funcao ?? "nada"}" e o formato "${regua.label}" abre com "${FUNCOES[regua.abreCom]?.label ?? regua.abreCom}".`,
      });
    }
  }
  if (regua.fechaCom && n > 0) {
    const ultima = telas[n - 1]!;
    if ((ultima.funcao ?? "").trim() !== regua.fechaCom) {
      reprovacoes.push({
        motivo: "fechamento_errado",
        telas: [ultima.ordem],
        detalhe: `a última tela declarou "${ultima.funcao ?? "nada"}" e o formato "${regua.label}" fecha com "${FUNCOES[regua.fechaCom]?.label ?? regua.fechaCom}".`,
      });
    }
  }

  // ── 4. CENA REPETIDA ──────────────────────────────────────────────────────
  // Antes da produção, a cena é o único proxy da imagem: duas telas que
  // descrevem a mesma coisa vão pedir a mesma foto ao gerador. Reprovar aqui é
  // reprovar ANTES de gastar duas chamadas pagas.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = telas[i]!;
      const b = telas[j]!;
      const s = semelhancaDeCena(a.descricao, b.descricao);
      if (s >= LIMIAR_DE_CENA_REPETIDA) {
        reprovacoes.push({
          motivo: "cena_repetida",
          telas: [a.ordem, b.ordem],
          detalhe: `as telas ${a.ordem} e ${b.ordem} descrevem a MESMA cena (${Math.round(s * 100)}% das palavras de conteúdo em comum) — as duas vão pedir a mesma imagem. Cada tela precisa de uma cena que sirva ao papel dela.`,
        });
      }
    }
  }

  // ── 5. IMAGEM REPETIDA ────────────────────────────────────────────────────
  // Não há régua que libere. É o defeito que o CEO apontou com o dedo.
  const porImagem = new Map<string, number[]>();
  for (const t of telas) {
    const img = (t.imagem ?? "").trim();
    if (!img) continue;
    porImagem.set(img, [...(porImagem.get(img) ?? []), t.ordem]);
  }
  for (const ordens of porImagem.values()) {
    if (ordens.length < 2) continue;
    reprovacoes.push({
      motivo: "imagem_repetida",
      telas: ordens,
      detalhe: `as telas ${ordens.join(" e ")} usam A MESMA IMAGEM. Imagem repetida é a prova de que aquela tela não tinha função própria — não passa em formato nenhum.`,
    });
  }

  // ── 6. O MATERIAL QUE FALTA ───────────────────────────────────────────────
  // Aqui a peça NÃO é "corrigida": ela é barrada e a falta é nomeada. Preencher
  // com foto genérica seria a agência inventando o que o cliente não deu.
  for (const t of telas) {
    const falta = (t.materialFaltante ?? []).map((s) => s.trim()).filter(Boolean);
    if (falta.length === 0) continue;
    const f = (t.funcao ?? "").trim();
    reprovacoes.push({
      motivo: "material_faltante",
      telas: [t.ordem],
      detalhe: `a tela ${t.ordem} ("${FUNCOES[f]?.label ?? (f || "sem papel")}") não pode ser cumprida com o material que a casa tem. Falta, e precisa vir do cliente: ${falta.join(", ")}. A peça NÃO foi preenchida com imagem genérica.`,
    });
  }

  if (reprovacoes.length > 0) return { ok: false, regua: regua.id, reprovacoes };
  return { ok: true, regua: regua.id, telas };
}

/**
 * O que a IMAGEM de uma tela precisa mostrar, dado o papel declarado.
 *
 * É a virada de "imagem de fundo" para "imagem argumento": o prompt da foto
 * passa a ser derivado do PAPEL daquela tela, e não da legenda do post inteiro.
 * Papel desconhecido devolve string vazia — nunca uma direção inventada.
 */
export function direcaoDaImagem(funcao: string | null | undefined): string {
  const f = FUNCOES[(funcao ?? "").trim()];
  return f ? f.imagemPrecisa : "";
}

/** O veredito em uma linha, pronto para virar registro legível. */
export function laudoDoStoryboard(r: ResultadoDoStoryboard): string {
  if (r.ok) return `[storyboard ${r.regua}] ${r.telas.length} telas, cada uma com papel próprio.`;
  return `[storyboard ${r.regua}] REPROVADO — ${r.reprovacoes.map((x) => x.detalhe).join(" | ")}`;
}

// ─── A leitura do que o especialista escreveu ───────────────────────────────

/**
 * Lê uma tela escrita pelo especialista no formato `[papel] descrição`.
 *
 * O contrato com o especialista (`especialistas.ts`) passou a exigir o papel
 * entre colchetes no início de cada tela. Tela sem colchete NÃO é adivinhada:
 * `funcao` volta `null`, e `conferirStoryboard` reprova nomeando a tela. Inferir
 * o papel a partir das palavras da cena seria a casa preenchendo por dedução
 * exatamente onde a declaração é a única prova de que alguém pensou na história.
 */
export function lerTela(bruto: string, ordem: number): TelaDoStoryboard {
  const texto = (bruto ?? "").trim();
  const m = texto.match(/^\[\s*([A-Za-zÀ-ÿ]+)\s*\]\s*([\s\S]*)$/);
  if (!m) return { ordem, funcao: null, descricao: texto };
  const declarado = m[1]!
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const descricao = (m[2] ?? "").trim();
  // Papel declarado que não existe no vocabulário continua sendo uma
  // DECLARAÇÃO — vira `funcao_fora_da_regua` na conferência, e não
  // `funcao_nao_declarada`. As duas falhas se consertam de jeitos diferentes.
  return { ordem, funcao: declarado, descricao: descricao || texto };
}

/** Lê a lista de telas cruas (o `scenesJson` histórico) como storyboard. */
export function lerStoryboard(cenas: string[]): TelaDoStoryboard[] {
  return cenas.map((c, i) => lerTela(c, i + 1));
}
