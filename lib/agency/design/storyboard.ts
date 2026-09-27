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
  /**
   * QUE CLASSES DE MATERIAL REAL DO CLIENTE servem a este papel — declarado,
   * papel a papel, e derivado de `imagemPrecisa`, não de gosto.
   *
   * É o que impede o defeito inverso do que a casa consertou em 07/08/2026.
   * Ligar "usa foto do cliente" como interruptor global poria a foto do balcão
   * na tela de GANCHO, cujo trabalho é mostrar a DOR acontecendo — e foto real
   * que não tem nada a ver com o texto é pior que foto de IA: ela parece
   * verdade e não é argumento.
   *
   * **Lista VAZIA é uma resposta, e é a mais comum.** `gancho` e `tensao` pedem
   * a dor e o custo; nenhum cliente sobe ao Drive a foto da própria bagunça.
   * `capa`, `materia` e `fechamento` pedem cena própria daquela edição. Para
   * esses papéis a foto real NÃO entra, e a imagem continua sendo gerada.
   *
   * A ordem importa: é a preferência quando o cliente tem material de mais de
   * uma classe para o mesmo papel.
   */
  materiaisReais: MaterialReal[];
}

/**
 * As classes de material real que podem virar a IMAGEM de uma peça.
 *
 * Espelham `Papel` de `lib/integrations/google/escolha-de-material.ts` — os
 * papéis que o PRÓPRIO CLIENTE declarou ao escolher o arquivo no Drive. Só
 * entram aqui os que são FOTOGRAFIA de alguma coisa: `logo` assina a peça (é
 * outro trabalho, ver `Molde.logo`), `manual_de_marca` é documento, e
 * `referencia`/`outro` são justamente as classes sem semântica declarada —
 * usá-las seria escolher por sobra, que é o defeito de 04/08/2026.
 *
 * Repetido como união local, e não importado, porque este arquivo é PURO: o
 * módulo do Drive arrasta Prisma no import. A correspondência é conferida por
 * teste (`__tests__/design/foto-real-na-peca.test.ts`), que é o que impede as
 * duas listas de divergirem em silêncio.
 */
export type MaterialReal = "foto_produto" | "foto_equipe" | "foto_local" | "captura_de_tela";

/** O vocabulário de papéis da casa. */
export const FUNCOES: Record<string, Funcao> = {
  // ── A história de venda ────────────────────────────────────────────────────
  gancho: {
    id: "gancho",
    label: "Gancho",
    cumpre: "para o dedo: nomeia a dor ou a pergunta, em uma frase.",
    imagemPrecisa: "a cena da dor/pergunta ACONTECENDO — não um retrato bonito do produto.",
    // VAZIO por decisão: o gancho pede a DOR acontecendo, e ninguém sobe ao
    // Drive a foto do próprio problema. Pôr aqui a foto do produto seria o
    // "retrato bonito do produto" que a própria linha de cima proíbe.
    materiaisReais: [],
  },
  tensao: {
    id: "tensao",
    label: "Tensão",
    cumpre: "mostra o custo de continuar como está.",
    imagemPrecisa: "o custo visível: a bagunça, a fila, a mensagem sem resposta.",
    // VAZIO: o material que o cliente escolhe mostrar é o melhor dele, nunca o
    // custo de não o ter. Material não existe para este papel.
    materiaisReais: [],
  },
  prova: {
    id: "prova",
    label: "Prova",
    cumpre: "traz evidência REAL do cliente — dado, captura, caso, número com origem.",
    imagemPrecisa: "a evidência em si (captura real, documento, cena registrada). Ilustração de evidência entra com selo de ilustração, nunca disfarçada de prova.",
    // É AQUI que o material real vale mais. A linha acima já diz: a evidência
    // tem de ser REAL, e ilustração de evidência é a coisa que ela proíbe
    // disfarçar. Captura vem primeiro porque é a evidência mais literal.
    materiaisReais: ["captura_de_tela", "foto_produto", "foto_local"],
  },
  mecanismo: {
    id: "mecanismo",
    label: "Mecanismo",
    cumpre: "explica COMO funciona — o passo, a engrenagem, a diferença.",
    imagemPrecisa: "a engrenagem em operação: a tela do produto, a mão fazendo, o antes/depois.",
    // "a tela do produto" é, literalmente, a captura de tela que o cliente
    // mandou; "a mão fazendo" é a foto de equipe em operação.
    materiaisReais: ["captura_de_tela", "foto_produto", "foto_equipe"],
  },
  resultado: {
    id: "resultado",
    label: "Resultado",
    cumpre: "mostra o estado depois, sem prometer número que não veio do cliente.",
    imagemPrecisa: "o estado depois, na cena real do negócio.",
    // "na cena REAL do negócio" — o lugar e o produto dele, não uma cena
    // inventada que se parece com o negócio dele.
    materiaisReais: ["foto_local", "foto_produto", "foto_equipe"],
  },
  acao: {
    id: "acao",
    label: "Ação",
    cumpre: "diz o próximo passo, um só, concreto.",
    imagemPrecisa: "o ponto de contato: a porta, o balcão, o canal por onde a ação acontece.",
    // A porta e o balcão DELE. É o papel em que a foto genérica mais engana:
    // manda o cliente a um lugar que não existe.
    materiaisReais: ["foto_local", "foto_equipe"],
  },
  // ── A revistinha semanal (formato pedido pelo CEO em 07/08/2026) ──────────
  // Vive no mesmo vocabulário, e não num arquivo à parte, porque a conferência
  // é a mesma. O que muda é a RÉGUA, não o motor.
  capa: {
    id: "capa",
    label: "Capa da edição",
    cumpre: "nomeia a edição e a semana. É índice, não manchete de venda.",
    imagemPrecisa: "uma cena-síntese daquela semana, própria daquela edição.",
    // VAZIO: "própria daquela edição". Uma foto fixa do acervo, reusada toda
    // semana, é exatamente a capa que não pertence à edição.
    materiaisReais: [],
  },
  materia: {
    id: "materia",
    label: "Matéria",
    cumpre: "uma notícia por tela: o que aconteceu e por que importa para quem lê.",
    imagemPrecisa: "a cena daquela notícia específica. Duas matérias nunca dividem imagem.",
    // VAZIO: a notícia é do mundo, não do acervo do cliente. Casar acervo com
    // notícia por proximidade de palavra seria inventar a ilustração de um
    // fato — o pior lugar possível para material que parece verdade.
    materiaisReais: [],
  },
  fechamento: {
    id: "fechamento",
    label: "Fechamento",
    cumpre: "amarra a edição e diz quando sai a próxima.",
    imagemPrecisa: "a assinatura visual da publicação, própria do fechamento.",
    // VAZIO: a assinatura visual é do molde e do logo, não uma fotografia.
    materiaisReais: [],
  },
  // ── O CARROSSEL DO PACOTE/SÉRIE (CEO, 27/09/2026, W12b) ───────────────────
  //
  // Vocabulário de INTENÇÃO do "carrossel do pacote" (Foocci) e das séries
  // nomeadas sem `exigeFonte` (ex.: "servico" da Dioli) — espelha
  // `SEQUENCIA_DO_CARROSSEL` de `lib/agency/esteira/pacote-da-marca.ts`,
  // DUPLICADO aqui de propósito: este arquivo é PURO (sem banco, rede,
  // navegador ou IA) e `pacote-da-marca.ts` não é. A correspondência das duas
  // listas é conferida por teste (`__tests__/design/storyboard.test.ts`), a
  // mesma régua que já vale para `MaterialReal` (ver o comentário dele acima).
  // "prova" NÃO se repete aqui: é a MESMA entrada já declarada acima — a
  // evidência real vale o mesmo, seja o carrossel de venda ou o do pacote.
  dor: {
    id: "dor",
    label: "Dor",
    cumpre: "nomeia a dor do público, em uma frase — o problema que o serviço resolve.",
    imagemPrecisa: "a dor ACONTECENDO, do jeito que o público vive — não um retrato bonito do produto.",
    // VAZIO pela mesma razão de `gancho`: ninguém sobe ao Drive a foto do
    // próprio problema.
    materiaisReais: [],
  },
  transformacao: {
    id: "transformacao",
    label: "Transformação",
    cumpre: "mostra a mudança que o serviço promete — o antes cedendo lugar ao depois.",
    imagemPrecisa: "o momento da virada, na cena real do negócio — o antes e o depois, não uma metáfora solta.",
    materiaisReais: ["foto_local", "foto_produto", "foto_equipe"],
  },
  beneficio: {
    id: "beneficio",
    label: "Benefício",
    cumpre: "nomeia o ganho concreto que o cliente tem ao contratar.",
    imagemPrecisa: "o benefício sendo vivido — quem usa, o resultado em mãos, no lugar dele.",
    materiaisReais: ["foto_produto", "foto_local", "foto_equipe"],
  },
  importancia_do_servico: {
    id: "importancia_do_servico",
    label: "Importância do serviço",
    cumpre: "explica por que este serviço importa, e por que agora — não é enfeite, é necessidade.",
    imagemPrecisa: "a cena que mostra o custo de adiar ou o valor de ter o serviço por perto.",
    // VAZIO: é argumento sobre URGÊNCIA — a mesma classe de coisa que `tensao`
    // já declara vazia, e pelo mesmo motivo.
    materiaisReais: [],
  },
  cta: {
    id: "cta",
    label: "Chamada para ação (do carrossel do pacote/série)",
    cumpre: "diz o próximo passo, um só, concreto — a MESMA chamada que está na legenda.",
    imagemPrecisa: "o ponto de contato: a porta, o balcão, o canal por onde a ação acontece.",
    // Mesma direção de `acao` — é o mesmo papel na história, só que vem da
    // sequência do pacote/série, não do carrossel de venda escrito à mão.
    materiaisReais: ["foto_local", "foto_equipe"],
  },
  // ── O RADAR (série com `exigeFonte: true` — Dioli, `"layout":"radar"`) ────
  noticia: {
    id: "noticia",
    label: "Notícia",
    cumpre: "uma notícia por tela: o título, o veículo e a data — nunca mais de uma por tela.",
    imagemPrecisa: "a cena daquela notícia específica, do mundo — nunca uma ilustração genérica de tecnologia.",
    // VAZIO: a notícia é do mundo, não do acervo do cliente — a mesma razão
    // que `materia` já declara acima, e pelo mesmo motivo.
    materiaisReais: [],
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

/**
 * O carrossel do PACOTE/SÉRIE — Foocci (`pacote.carrossel`) e as séries
 * nomeadas sem `exigeFonte` da Dioli (ex.: "servico") — CEO, 27/09/2026, W12b.
 *
 * `fechaCom: "cta"` é GARANTIDO por construção, não por convenção de quem
 * escreve: `papeisDoCarrossel` (`calendario-editorial.ts`) sempre põe "cta" na
 * última posição, nunca dentro do ciclo. Sem `abreCom`: a primeira posição é o
 * primeiro item da sequência que a MARCA declarou (`pacote.carrossel.sequencia`
 * / `serie.sequencia`), e nada nesta casa garante que toda marca comece por
 * "dor" — travar nisso reprovaria uma sequência que a própria marca escolheu.
 */
export const REGUA_CARROSSEL_DE_SERVICO: ReguaDeStoryboard = {
  id: "carrossel-de-servico",
  label: "Carrossel de serviço (pacote/série da marca)",
  procedencia:
    'a sequência de intenção do "carrossel do pacote" e das séries nomeadas — CEO, 27/09/2026, W12b: ' +
    '"dor → transformação → prova → benefício → importância do serviço [→ CTA]", pedida para a Foocci ' +
    'e para a série "servico" da Dioli (ver `pacote-da-marca.ts: SEQUENCIA_DO_CARROSSEL`).',
  minTelas: 2,
  maxTelas: 10,
  funcoesPermitidas: ["dor", "transformacao", "prova", "beneficio", "importancia_do_servico", "cta"],
  fechaCom: "cta",
  // As cinco intenções (tudo, menos "cta") podem repetir: o carrossel CICLA
  // pela sequência quando tem mais cards do que intenções distintas
  // (`papeisDoCarrossel`) — é o mesmo raciocínio de "materia" na revistinha:
  // repetir o PAPEL é o formato determinístico, não um roteiro preguiçoso.
  // Cada card continua obrigado a ter cena própria (a conferência de CENA
  // repetida, mais abaixo, não abre exceção nenhuma).
  funcoesQuePodemRepetir: [
    { funcao: "dor", porque: "o carrossel cicla pela sequência da marca quando tem mais cards que intenções distintas." },
    { funcao: "transformacao", porque: "o carrossel cicla pela sequência da marca quando tem mais cards que intenções distintas." },
    { funcao: "prova", porque: "o carrossel cicla pela sequência da marca quando tem mais cards que intenções distintas." },
    { funcao: "beneficio", porque: "o carrossel cicla pela sequência da marca quando tem mais cards que intenções distintas." },
    { funcao: "importancia_do_servico", porque: "o carrossel cicla pela sequência da marca quando tem mais cards que intenções distintas." },
  ],
};

/**
 * O RADAR — série com `exigeFonte: true` da Dioli, preenchida por
 * `POST /api/social-posts/radar`: 1 capa + 1 card por notícia aprovada, com
 * veículo e data escritos no próprio texto do card.
 *
 * ⚠️ DECLARADO: o layout DEFINITIVO de capa e card de notícia depende das 3
 * edições de referência do acervo do feed (bloco 1B), que ainda não existem.
 * Enquanto isso, a peça sai num molde limpo (a composição "foto-cheia" que já
 * é o default de `molde.ts` quando ninguém pediu outra coisa) — quem
 * substituir o layout troca a COMPOSIÇÃO em `repertorio.ts`/
 * `repertorio-registrado.ts`, não esta régua nem a atribuição de papel por
 * posição de `lerStoryboardDoRadar`.
 */
export const REGUA_RADAR: ReguaDeStoryboard = {
  id: "radar-semanal",
  label: "Radar — a série de notícias tech (Dioli)",
  procedencia:
    'a série "Radar" do pacote da marca (`exigeFonte: true`, CEO 27/09/2026, W12b), preenchida por ' +
    '`POST /api/social-posts/radar`. LAYOUT AINDA PROVISÓRIO: falta o acervo de 3 edições de referência ' +
    "do feed (bloco 1B) — ver a declaração completa acima.",
  minTelas: 2,
  // 10 = o teto de mídia do Instagram (o mesmo teto de `quebrarCenas`, mais
  // acima neste arquivo) — não o teto de custo de 6 telas do carrossel de
  // venda, que não se aplica ao Radar (ver `MAX_TELAS_DO_RADAR` em `artes.ts`).
  maxTelas: 10,
  funcoesPermitidas: ["capa", "noticia"],
  abreCom: "capa",
  funcoesQuePodemRepetir: [
    {
      funcao: "noticia",
      porque:
        "a edição É uma sequência de notícias — repetir o papel é o formato, não um defeito. Cada notícia continua obrigada a ter cena própria (veículo, data e assunto próprios).",
    },
  ],
};

export const REGUAS: Record<string, ReguaDeStoryboard> = {
  [REGUA_CARROSSEL_DE_VENDA.id]: REGUA_CARROSSEL_DE_VENDA,
  [REGUA_REVISTINHA_SEMANAL.id]: REGUA_REVISTINHA_SEMANAL,
  [REGUA_CARROSSEL_DE_SERVICO.id]: REGUA_CARROSSEL_DE_SERVICO,
  [REGUA_RADAR.id]: REGUA_RADAR,
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

// ─── As FAMÍLIAS DE LAYOUT PRÓPRIAS (CEO, 27/09/2026, W12b) ─────────────────
//
// O carrossel do pacote/série e o Radar não nascem do especialista descrito
// acima — nascem de `calendario-editorial.ts` e de `POST
// /api/social-posts/radar`, escrevendo `scenesJson` como texto PLANO, SEM o
// `[papel]` que `lerTela` exige (o gap está declarado no cabeçalho de
// `calendario-editorial.ts`). Adivinhar o papel a partir da PALAVRA da cena
// seria o mesmo defeito que `lerTela` já recusa (ver o teste "o papel não é
// ADIVINHADO"); a diferença aqui é que a ORDEM em si já é a declaração — a
// posição de cada card é determinística por construção
// (`papeisDoCarrossel`/a rota do Radar), então ler por POSIÇÃO não é
// adivinhar: é espelhar uma regra que já existe em outro arquivo.

/**
 * O nome dos papéis, sem o "cta", na ordem em que o carrossel do pacote/série
 * CICLA — espelha `SEQUENCIA_DO_CARROSSEL` (menos "cta", que nunca é uma
 * posição do ciclo: é sempre a ÚLTIMA tela) de
 * `lib/agency/esteira/pacote-da-marca.ts`.
 *
 * Duplicado aqui, e não importado, pela MESMA razão de `MaterialReal` (ver o
 * comentário dele, no alto deste arquivo): este módulo é PURO e
 * `pacote-da-marca.ts` não é (ele usa `"server-only"` e valida contra Zod). A
 * correspondência das duas listas é conferida por teste
 * (`__tests__/design/storyboard.test.ts`), a mesma régua que impede
 * `MaterialReal` e `Papel` do Drive de divergirem em silêncio.
 */
export const SEQUENCIA_DO_CARROSSEL_DE_SERVICO_SEM_CTA = [
  "dor", "transformacao", "prova", "beneficio", "importancia_do_servico",
] as const;

/**
 * Lê o storyboard do carrossel do PACOTE/SÉRIE (Foocci; série "servico" da
 * Dioli) — texto plano, sem `[papel]`. O papel de cada tela é atribuído por
 * POSIÇÃO, espelhando `papeisDoCarrossel` (`calendario-editorial.ts`): as
 * posições 1..n-1 ciclam por `SEQUENCIA_DO_CARROSSEL_DE_SERVICO_SEM_CTA`, e a
 * ÚLTIMA é sempre "cta" — nunca adivinhada a partir da palavra da cena.
 *
 * Nunca lança: `cenas` vazio devolve lista vazia, e `conferirStoryboard`
 * reprova por `telas_fora_da_faixa`, como qualquer carrossel curto demais.
 */
export function lerStoryboardDoCarrosselDeServico(cenas: string[]): TelaDoStoryboard[] {
  const n = cenas.length;
  const base = SEQUENCIA_DO_CARROSSEL_DE_SERVICO_SEM_CTA;
  return cenas.map((c, i) => ({
    ordem: i + 1,
    funcao: i === n - 1 ? "cta" : base[i % base.length]!,
    descricao: (c ?? "").trim(),
  }));
}

/**
 * Lê o storyboard do RADAR — texto plano, sem `[papel]`: a rota
 * `POST /api/social-posts/radar` grava `[capa, notícia 1, notícia 2, ...]`,
 * nesta ordem, sempre. O papel de cada tela é atribuído por POSIÇÃO: a
 * primeira é sempre "capa", e toda tela seguinte é "noticia" — nunca
 * adivinhado a partir da palavra da cena.
 *
 * ⚠️ Ver a declaração de layout provisório em `REGUA_RADAR`, acima: quando o
 * acervo de referência (bloco 1B) existir, o que muda é a COMPOSIÇÃO da peça,
 * não esta atribuição de papel por posição.
 */
export function lerStoryboardDoRadar(cenas: string[]): TelaDoStoryboard[] {
  return cenas.map((c, i) => ({
    ordem: i + 1,
    funcao: i === 0 ? "capa" : "noticia",
    descricao: (c ?? "").trim(),
  }));
}

/**
 * Quebra o campo "cenas" do especialista nas telas, preservando o `[papel]`.
 *
 * Mora AQUI, e não em cada ponto da esteira, porque este mesmo texto é lido em
 * três lugares: o contrato de saída do especialista (`especialistas.ts`), a
 * gravação do post (`publicacao.ts`) e a produção da arte (`artes.ts`). Ler
 * diferente em qualquer um deles faria o contrato aprovar um storyboard que a
 * produção depois reprova — o pior dos dois mundos, porque o especialista não
 * teria como saber o que consertar.
 *
 * Teto de 10 porque é o limite de mídia da Meta. Cortar aqui é melhor do que a
 * Meta recusar o carrossel inteiro na hora de publicar.
 */
export function quebrarCenas(bruto: string | null | undefined): string[] {
  if (!bruto?.trim()) return [];
  return bruto
    .split(/\s*(?:·|\||\n|(?<=[.!?])\s)?\s*\d+\)\s*/)
    .map((t) => t.replace(/^[·|\-\s]+/, "").trim())
    .filter((t) => t.length > 3)
    .slice(0, 10);
}

/** O storyboard a partir do campo "cenas" cru, em um passo só. */
export function lerStoryboardDoCampo(bruto: string | null | undefined): TelaDoStoryboard[] {
  return lerStoryboard(quebrarCenas(bruto));
}
