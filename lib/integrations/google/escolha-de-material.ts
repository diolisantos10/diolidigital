// escolha-de-material.ts — O MECANISMO DE AUTORIZAÇÃO DO MATERIAL DO DRIVE.
//
// É UM SÓ, e é este. Toda pergunta do tipo "a casa pode usar este arquivo?"
// passa por aqui. Dois mecanismos divergem — um aperta, o outro esquece, e o
// incidente volta pela porta que ninguém olha.
//
// ── O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ──────────────────────────────────
//
// O cliente vai subir "IMG_2831.jpg". A casa não sabe se é o produto, a fachada,
// a equipe ou o cachorro dele. Adivinhar produz peça com a FOTO ERRADA — que é
// pior que peça sem foto, porque parece que a agência olhou e escolheu aquilo.
//
// Por isso a regra é: **o papel de um arquivo é DECLARADO PELO CLIENTE, nunca
// deduzido pela casa.** A casa até calcula um palpite (`sugerirPapel`), mas o
// palpite serve só para a tela já vir marcada — ele nunca autoriza sozinho.
// Sem `papelConfirmadoEm`, o arquivo não é insumo de nada.
//
// ── DUAS METADES, SEMPRE ────────────────────────────────────────────────────
//
// `materialAutorizado` decide SEM REDE. Ela recusa antes de qualquer chamada ao
// Google — é o que faz a trava ser trava, e não um aviso que a camada de baixo
// pode ignorar. O teste cobre as duas metades: o autorizado é lido; o não
// autorizado é recusado sem que uma requisição saia.
//
// ── E ISTO NÃO É VERDADE, É INSUMO ──────────────────────────────────────────
//
// Ter a foto do produto no Drive não autoriza a casa a AFIRMAR nada sobre o
// negócio do cliente. O piso de verdade (lib/agency/execution/piso-de-verdade.ts)
// continua valendo inteiro. Este arquivo governa o que a casa pode USAR numa
// peça — não o que ela pode DIZER.
//
// Fonte do escopo: docs/plataformas/google/fontes/drive-api-escopos.md
// ("drive.file — Criar novos arquivos do Drive ou modificar arquivos que você
// abre com um app ou que o usuário compartilha com um app ao usar a API Google
// Picker"). Escopo por arquivo, não sensível, sem avaliação de segurança.

/** O escopo estreito, e o único que esta casa pede para o Drive. */
export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";

/**
 * Os papéis que um material pode ter. LISTA FECHADA.
 *
 * Fechada porque cada papel tem um consumidor no código (o molde da arte, o
 * logo, a leitura do cliente). Papel livre viraria texto que ninguém lê — e
 * "estado gravado que ninguém lê" é o que esta casa proíbe.
 */
export const PAPEIS = {
  logo: {
    rotulo: "Logo da marca",
    ajuda: "O arquivo oficial do logo — PNG com fundo transparente, ou o vetor.",
    /** Usado como ARQUIVO na peça (em vez de a casa desenhar/escrever o nome). */
    entraNaPeca: true,
  },
  manual_de_marca: {
    rotulo: "Manual de marca / cores e tipografia",
    ajuda: "O PDF ou documento com as cores, as fontes e as regras da marca.",
    entraNaPeca: false,
  },
  foto_produto: {
    rotulo: "Foto de produto",
    ajuda: "O produto em si — embalagem, prato, peça, o que o cliente vende.",
    entraNaPeca: true,
  },
  foto_equipe: {
    rotulo: "Foto da equipe",
    ajuda: "As pessoas do negócio.",
    entraNaPeca: true,
  },
  foto_local: {
    rotulo: "Foto do local / fachada",
    ajuda: "A loja, o salão, a fachada, o ambiente.",
    entraNaPeca: true,
  },
  captura_de_tela: {
    rotulo: "Captura de tela do produto",
    ajuda: "Para produto digital: o app, o site, o painel — a tela real.",
    entraNaPeca: true,
  },
  referencia: {
    rotulo: "Peça de referência (já funcionou)",
    ajuda: "Anúncio ou post que já deu resultado e serve de inspiração.",
    entraNaPeca: false,
  },
  outro: {
    rotulo: "Outro material",
    ajuda: "Guarda no projeto, mas a casa não usa sozinha.",
    entraNaPeca: false,
  },
} as const;

export type Papel = keyof typeof PAPEIS;

export const PAPEIS_VALIDOS = Object.keys(PAPEIS) as Papel[];

/** Aceita só papel da lista. Qualquer outra coisa é `null` — nunca "outro" por
 *  conveniência: transformar lixo em "outro" silenciosamente esconde o erro de
 *  quem chamou. */
export function papelValido(v: unknown): Papel | null {
  return typeof v === "string" && (PAPEIS_VALIDOS as string[]).includes(v) ? (v as Papel) : null;
}

/** Os papéis que, quando confirmados, viram arquivo dentro de uma peça. */
export function papelEntraNaPeca(p: Papel): boolean {
  return PAPEIS[p].entraNaPeca;
}

// ─── O palpite (sugestão, jamais autorização) ────────────────────────────────

function normalizar(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O palpite do papel pelo nome e pelo tipo do arquivo.
 *
 * Devolve `null` quando o nome não diz nada — e "IMG_2831.jpg" NÃO diz nada. É
 * de propósito: o cliente ver o campo vazio e ter que escolher é melhor do que
 * ver "Foto de produto" preenchido por acaso e clicar em confirmar sem ler.
 *
 * Pura. Não toca banco nem rede — dá para testar cada nome de arquivo.
 */
export function sugerirPapel(nome: string, mimeType: string): Papel | null {
  const n = normalizar(nome);

  if (/\blogo|logotipo|marca[-_ ]?dagua|brandmark|wordmark\b/.test(n)) return "logo";
  if (/manual|brandbook|brand[-_ ]?book|identidade|guia[-_ ]?de[-_ ]?marca|paleta/.test(n)) return "manual_de_marca";
  if (/print|screenshot|captura|tela|dashboard|app[-_ ]|interface/.test(n)) return "captura_de_tela";
  if (/produto|embalagem|cardapio|prato|catalogo|pack/.test(n)) return "foto_produto";
  if (/equipe|time|team|socio|funcionario|atendente/.test(n)) return "foto_equipe";
  if (/fachada|loja|salao|ambiente|interno|externo|local/.test(n)) return "foto_local";
  if (/anuncio|criativo|campanha|referencia|inspiracao|ads?[-_]/.test(n)) return "referencia";

  // Manual de marca em PDF é comum o bastante para valer o palpite pelo tipo.
  if (mimeType === "application/pdf" && /marca|brand/.test(n)) return "manual_de_marca";

  // Nada no nome diz o que é. O cliente decide — e essa é a resposta certa.
  return null;
}

// ─── A TRAVA ────────────────────────────────────────────────────────────────

// ─── A ORIGEM DO MATERIAL ───────────────────────────────────────────────────
//
// 08/08/2026. Duas origens, e a diferença entre elas é de QUEM DEPENDE O ACESSO:
//
//   • "drive"        — o arquivo mora no Google. Para lê-lo a casa precisa da
//                      conexão viva, do escopo e do token. Se o cliente
//                      desconectar, o acesso acaba — e tem que acabar.
//   • "envio_direto" — o cliente arrastou o arquivo no portal (ou o operador
//                      subiu pelo admin). Os BYTES JÁ SÃO DA CASA, guardados no
//                      volume pelo ato do próprio dono. Não há nada a pedir ao
//                      Google, e por isso nada do Google pode barrar.
//
// É este parágrafo que estava faltando no meio da ponte: o portal guardava o
// arquivo desde 02/08, e a peça continuava saindo sem ele porque a única porta
// de material exigia uma conexão com o Google que nada tinha a ver com aquele
// arquivo.

export const ORIGENS = ["drive", "envio_direto"] as const;
export type OrigemDoMaterial = (typeof ORIGENS)[number];

/** Aceita só origem da lista. Desconhecida cai em "drive" — o lado ESTRITO:
 *  origem que a casa não reconhece passa a exigir conexão viva, nunca a
 *  dispensar. Fail-closed também aqui. */
export function origemValida(v: unknown): OrigemDoMaterial {
  return v === "envio_direto" ? "envio_direto" : "drive";
}

/** O que a trava precisa saber de um material para decidir. Só isto: nada de
 *  objeto do Prisma inteiro, para que a decisão seja testável sem banco. */
export interface MaterialParaDecidir {
  fileId: string;
  nome: string;
  ehPasta: boolean;
  papel: string | null;
  papelConfirmadoEm: Date | null;
  /** Ausente = "drive". Compatível com todo chamador anterior a 08/08/2026, e
   *  o padrão é o lado que EXIGE conexão. */
  origem?: string | null;
}

/** A conexão, pelo mínimo que decide. */
export interface ConexaoParaDecidir {
  status: string;
  escopos: string;
  tokenExpiresAt: Date | null;
  temRefresh: boolean;
}

export type MotivoDaRecusa =
  | "sem_conexao"
  | "conexao_expirada"
  | "escopo_insuficiente"
  | "papel_nao_declarado"
  | "papel_invalido"
  | "e_uma_pasta";

export interface Veredito {
  pode: boolean;
  papel?: Papel;
  motivo?: MotivoDaRecusa;
  /** A frase que vai para a tela do cliente ou para a escalação. Em português,
   *  dizendo a verdade — nunca "erro 401". */
  recado?: string;
}

/**
 * A casa pode usar este arquivo?
 *
 * SÍNCRONA E SEM REDE, de propósito: quem chama tem que ser capaz de ser
 * recusado ANTES de qualquer requisição ao Google. Uma trava que só descobre a
 * recusa depois de bater na rede não é trava, é aviso.
 *
 * Fail-closed em todos os ramos: qualquer dúvida devolve `pode: false` com
 * recado. Não existe caminho neutro.
 */
export function materialAutorizado(
  conexao: ConexaoParaDecidir | null | undefined,
  material: MaterialParaDecidir,
  agora: Date = new Date(),
): Veredito {
  const origem = origemValida(material.origem);

  // ── AS TRÊS CONFERÊNCIAS DE CONEXÃO SÓ VALEM PARA A ORIGEM "drive" ────────
  //
  // Elas perguntam "a casa consegue ir ao Google buscar este arquivo?". Para
  // material de ENVIO DIRETO a pergunta não faz sentido: o arquivo já está no
  // volume da casa, posto lá pelo próprio dono. Aplicá-las aqui faria o logo que
  // o cliente arrastou no portal sumir da peça no dia em que ele desconectasse
  // um Drive que nunca teve nada a ver com aquele arquivo — e, pior, faria o
  // envio direto ser inútil para os clientes que NUNCA conectaram o Google, que
  // são a maioria.
  //
  // O que NÃO é dispensado: papel declarado. Essa é a regra sobre o ARQUIVO, não
  // sobre o acesso a ele, e ela continua valendo inteira nas duas origens.
  if (origem === "drive") {
    if (!conexao || conexao.status === "revoked") {
      return {
        pode: false,
        motivo: "sem_conexao",
        recado: "o Google Drive deste cliente não está conectado — falta material",
      };
    }

    // Escopo: se o Google não concedeu `drive.file`, não existe leitura possível.
    // Conferir aqui (e não só na conexão) é o que impede uma conexão antiga, de
    // antes de uma mudança de escopo, de continuar valendo por inércia.
    if (!conexao.escopos.includes(ESCOPO_DRIVE)) {
      return {
        pode: false,
        motivo: "escopo_insuficiente",
        recado: "a autorização do Drive não cobre leitura de arquivo — o cliente precisa reconectar",
      };
    }

    // Token vencido SEM refresh é fim de linha: ninguém consegue renovar.
    // Com refresh, `comTokenDoDrive` renova — vencido aqui não é motivo de recusa.
    const vencido = !conexao.tokenExpiresAt || conexao.tokenExpiresAt.getTime() <= agora.getTime();
    if (conexao.status === "expired" || (vencido && !conexao.temRefresh)) {
      return {
        pode: false,
        motivo: "conexao_expirada",
        recado: "o acesso ao Drive do cliente expirou — ele precisa reconectar",
      };
    }
  }

  // Pasta não é material. Ver o parecer em
  // docs/plataformas/google/pareceres/2026-08-07-drive-do-cliente.md: com o
  // escopo estreito, escolher uma pasta NÃO está documentado como acesso ao que
  // está dentro dela. A casa não aposta em comportamento não documentado.
  if (material.ehPasta) {
    return {
      pode: false,
      motivo: "e_uma_pasta",
      recado: `"${material.nome}" é uma pasta — o cliente precisa escolher os arquivos de dentro dela`,
    };
  }

  if (!material.papelConfirmadoEm) {
    return {
      pode: false,
      motivo: "papel_nao_declarado",
      recado: `"${material.nome}" está no Drive mas o cliente ainda não disse o que é — falta material`,
    };
  }

  const p = papelValido(material.papel);
  if (!p) {
    return {
      pode: false,
      motivo: "papel_invalido",
      recado: `"${material.nome}" tem uma marcação que a casa não reconhece — precisa ser marcado de novo`,
    };
  }

  return { pode: true, papel: p };
}

// ─── O VEREDITO DA GRAVAÇÃO: escolha do cliente não se perde em silêncio ────
//
// ── O INCIDENTE (08/08/2026, com o CEO na tela) ─────────────────────────────
//
// O CEO abriu o portal da Foocci, clicou em "Escolher arquivos", passou pelo
// seletor do Google e escolheu o material. Medido em produção no mesmo dia pelo
// diagnóstico de conexões: **o Google concedeu 1 arquivo ao app e a tabela
// `DriveMaterial` tinha 0 linhas.** A tela dizia, em seguida, "Conectado, e a
// Dioli não alcança NENHUM arquivo seu" — ou seja, a casa perdeu a escolha e
// devolveu ao cliente a afirmação de que ele não tinha escolhido nada.
//
// O que produzia o silêncio, e são DOIS lugares:
//
//   1. o `upsert` do material era `.catch(() => null)` e virava um item em
//      `recusados` — que NENHUMA tela renderizava;
//   2. a rota devolvia **HTTP 200** mesmo com ZERO gravados, e o campo
//      `proximoPasso` (que a tela mostra em VERDE, como sucesso) dizia
//      "Você escolheu apenas pastas" — para um PNG. Sucesso verde por cima de
//      uma escrita que não aconteceu.
//
// ── A REGRA QUE FICA ────────────────────────────────────────────────────────
//
// **Zero gravado nunca é 200, e nunca é frase verde.** Esta função é o único
// lugar que decide isso, e ela é PURA: dá para provar as duas metades sem HTTP,
// sem banco e sem Google — escolha que entra aparece; escolha impedida declara
// o erro e **não** diz ao cliente que ele não escolheu nada.

export interface GravadoNaEscolha {
  ehPasta: boolean;
}

export interface RecusadoNaEscolha {
  nome: string;
  motivo: string;
}

export interface VereditoDaEscolha {
  /** O status HTTP que a rota devolve. 200 só quando algo entrou de verdade. */
  status: 200 | 502;
  /** `true` só se pelo menos uma escolha virou linha no banco. */
  ok: boolean;
  /** A frase de ERRO. Preenchida sempre que nada foi gravado. */
  erro: string | null;
  /** A frase de sucesso. NUNCA preenchida quando `ok` é falso. */
  proximoPasso: string | null;
  /** Gravou parte e perdeu parte: o que falhou, com todas as letras. */
  aviso: string | null;
}

/** A frase que o cliente lê quando a casa não conseguiu guardar a escolha. Ela
 *  não culpa o cliente, não diz "você não escolheu nada", e diz o que fazer. */
export const FRASE_ESCOLHA_PERDIDA =
  "Sua escolha NÃO foi registrada — a falha foi nossa, não sua. Nada mudou no seu Drive. Clique em “Escolher arquivos” e tente de novo; se repetir, avise a equipe.";

export function vereditoDaEscolha(
  gravados: GravadoNaEscolha[],
  recusados: RecusadoNaEscolha[],
): VereditoDaEscolha {
  const lista = recusados.map((r) => `${r.nome} — ${r.motivo}`).join(" · ");

  // Fail-closed: nada gravado é falha, mesmo sem recusa nomeada. Um caminho que
  // devolve 200 sem ter escrito nada é exatamente o defeito que isto fecha.
  if (gravados.length === 0) {
    return {
      status: 502,
      ok: false,
      erro: lista ? `${FRASE_ESCOLHA_PERDIDA} (${lista})` : FRASE_ESCOLHA_PERDIDA,
      proximoPasso: null,
      aviso: null,
    };
  }

  // "Apenas pastas" só pode ser dito quando pasta foi o que REALMENTE entrou.
  const proximoPasso = gravados.some((g) => !g.ehPasta)
    ? "Agora diga o que é cada arquivo — sem isso a equipe não usa nenhum deles."
    : "Você escolheu apenas pastas. Abra a pasta no seletor e escolha os arquivos de dentro.";

  return {
    status: 200,
    ok: true,
    erro: null,
    proximoPasso,
    // Gravação parcial não passa em branco: o cliente precisa saber QUAL arquivo
    // ficou de fora, senão ele acha que mandou tudo — que é o incidente inteiro.
    aviso: recusados.length > 0 ? `Não consegui guardar ${recusados.length} arquivo(s): ${lista}` : null,
  };
}

// ─── O retrato para a tela ──────────────────────────────────────────────────

export interface RetratoDaEscolha {
  /** Total de itens que o cliente já escolheu no seletor do Google. */
  escolhidos: number;
  /** Quantos ainda esperam o cliente dizer o que são. */
  faltaDizerOQueE: number;
  /** Quantos são pasta (e por isso não valem como material). */
  pastas: number;
  /** Os papéis já confirmados, com quantos arquivos cada um. */
  porPapel: Partial<Record<Papel, number>>;
  /** A frase de estado. NUNCA "conectado ✓" quando falta escolher — a tela que
   *  diz "pronto" enquanto falta coisa é a que produz a peça sem foto. */
  frase: string;
  /** `true` só quando existe pelo menos um material confirmado e utilizável. */
  utilizavel: boolean;
}

/**
 * A frase do estado que mais engana: conexão viva, material zero.
 *
 * Mora aqui como constante — e não solta no meio do `if` — porque é o ponto de
 * um incidente e precisa ser travável por teste. Ver o comentário no `if` de
 * `escolhidos === 0`.
 */
export const FRASE_ZERO_MATERIAL =
  "Conectado, e a Dioli não alcança NENHUM arquivo seu. Conectar não envia nada: enquanto você não escolher os arquivos no seletor do Google, a equipe segue sem seu logo e sem suas fotos.";

/**
 * O que a tela mostra. Regra: enquanto faltar declaração, o estado é "falta
 * escolher" — não "conectado".
 */
export function retratoDaEscolha(
  conexao: ConexaoParaDecidir | null | undefined,
  materiais: MaterialParaDecidir[],
  agora: Date = new Date(),
): RetratoDaEscolha {
  const porPapel: Partial<Record<Papel, number>> = {};
  let faltaDizerOQueE = 0;
  let pastas = 0;
  let utilizaveis = 0;

  for (const m of materiais) {
    const v = materialAutorizado(conexao, m, agora);
    if (v.pode && v.papel) {
      porPapel[v.papel] = (porPapel[v.papel] ?? 0) + 1;
      utilizaveis++;
      continue;
    }
    if (v.motivo === "e_uma_pasta") pastas++;
    else if (v.motivo === "papel_nao_declarado" || v.motivo === "papel_invalido") faltaDizerOQueE++;
  }

  const escolhidos = materiais.length;

  let frase: string;
  if (!conexao || conexao.status === "revoked") {
    frase = "Drive não conectado.";
  } else if (materialAutorizado(conexao, { fileId: "", nome: "", ehPasta: false, papel: "logo", papelConfirmadoEm: agora }, agora).motivo === "conexao_expirada") {
    frase = "O acesso ao seu Drive expirou. Reconecte para a equipe continuar buscando seu material.";
  } else if (escolhidos === 0) {
    // ── 08/08/2026: a frase dizia o ESTADO e escondia a CONSEQUÊNCIA ─────────
    //
    // Era "Conectado, mas nenhum arquivo escolhido ainda. Escolha o que a
    // equipe pode usar." — e o CEO, lendo aquilo no portal do CityJobs, seguiu
    // acreditando que já tinha mandado o logo da Foocci por ali. Medido em
    // produção no mesmo dia: 3 clientes com Drive conectado, **0 arquivos
    // escolhidos na agência inteira**.
    //
    // "Conectado" é a primeira palavra que a pessoa lê, e ela paga por todas as
    // que vêm depois. Conectar não envia nada — e a tela tem que dizer isso com
    // todas as letras, antes de dizer que está conectado.
    frase = FRASE_ZERO_MATERIAL;
  } else if (faltaDizerOQueE > 0) {
    frase = `Falta dizer o que é: ${faltaDizerOQueE} de ${escolhidos} arquivo(s) escolhido(s).`;
  } else if (pastas > 0 && utilizaveis === 0) {
    frase = `Você escolheu ${pastas} pasta(s). Precisamos dos arquivos de dentro — abra a pasta no seletor e escolha os arquivos.`;
  } else {
    frase = `${utilizaveis} material(is) prontos para a equipe usar.`;
  }

  return { escolhidos, faltaDizerOQueE, pastas, porPapel, frase, utilizavel: utilizaveis > 0 };
}
