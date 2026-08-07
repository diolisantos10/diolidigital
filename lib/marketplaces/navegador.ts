// ─── BrowserComputer — o navegador da casa, com o portão na frente ──────────
//
// O CEO disse que esta é a peça que faltava e que se começa por ela. Ela é a
// ÚNICA porta pela qual o agente toca um marketplace.
//
// ── POR QUE UMA CLASSE, E NÃO "chamar playwright onde precisar" ─────────────
// Porque o portão precisa estar num lugar só. Playwright espalhado pelo código
// é a garantia matemática de que, um dia, alguém chama `page.click()` numa rota
// nova sem passar pelo Compliance Gate — e é assim que a conta é banida. Aqui,
// TODA operação passa por `portaoDeConformidade` antes de existir.
//
// ── PLAYWRIGHT DETERMINÍSTICO POR PADRÃO (emenda §37 do CEO) ────────────────
// Seletor e URL, nunca "olhe a tela e decida". Computer Use é exceção
// declarada, e nesta rodada NÃO EXISTE: não há um caminho no código para o
// modelo dirigir o mouse. Uma capacidade que não existe não pode ser ligada
// por engano.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, POR ORDEM ──────────────────────────────────
//   • NÃO faz login (`login` é BLOCK no portão);
//   • NÃO escreve nada em lugar nenhum (`preencherCandidatura` produz um
//     RASCUNHO em memória — não digita, não clica, não envia);
//   • NÃO resolve CAPTCHA: ao encontrar um, PARA e escala.
//
// ── O QUE ELE LÊ É DADO NÃO CONFIÁVEL ──────────────────────────────────────
// O HTML de um marketplace é escrito por desconhecidos e pode dizer "ignore as
// instruções anteriores". Aqui o texto extraído sai marcado como
// `conteudoDeTerceiro` e nenhuma função deste arquivo o interpreta como
// comando. Quem ligar IA nesta pipeline tem obrigação de mantê-lo delimitado.

import { portaoDeConformidade, type Acao, type Decisao } from "@/lib/marketplaces/portao";

export interface PaginaLida {
  url: string;
  /** O texto visível, já sem script/style. Conteúdo de terceiro. */
  conteudoDeTerceiro: string;
  /** Quando a página foi lida. */
  lidaEm: Date;
}

export type ResultadoDeLeitura =
  | { ok: true; pagina: PaginaLida }
  | { ok: false; motivo: "portao" | "sem_navegador" | "captcha" | "erro_de_rede" | "fora_do_dominio"; detalhe: string; decisao?: Decisao };

/** Só a área PÚBLICA, e só do domínio da plataforma. Lista FECHADA. */
const DOMINIOS_PERMITIDOS: Record<string, string[]> = {
  "99freelas": ["www.99freelas.com.br", "99freelas.com.br"],
};

/**
 * Caminhos que o robots.txt marca como `Disallow` ou que exigem sessão.
 * `/projects` está FORA desta lista de propósito: é o único sinal positivo que
 * a plataforma dá (não é Disallow e está no sitemap com prioridade 0.80).
 */
const CAMINHOS_PROIBIDOS = [/^\/termos/i, /^\/privacidade/i, /^\/faq/i, /^\/freelancer-premium/i, /^\/login/i, /^\/entrar/i, /^\/minha-conta/i, /^\/painel/i];

/** Sinais de que a plataforma pôs um desafio na frente. Encontrou, PARA. */
const SINAIS_DE_CAPTCHA = [
  /recaptcha/i, /g-recaptcha/i, /cf-turnstile/i, /turnstile/i,
  /verifique que voc[êe] (?:n[ãa]o )?[ée] (?:um )?(?:humano|rob[ôo])/i,
  /checking your browser/i, /attention required/i, /acesso negado/i,
];

export interface OpcoesDoNavegador {
  /** Pausa entre uma leitura e a próxima. RITMO HUMANO, não velocidade de
   *  máquina — é o que separa "usar o site" de "operar em ritmo de robô", que
   *  foi exatamente o que custou a conta de anúncios da Meta em 03/08. */
  pausaEntreLeiturasMs?: number;
  /** Teto de páginas por sessão. Sem teto, um bug de paginação vira 10 mil
   *  requisições na madrugada. */
  maximoDePaginas?: number;
}

export const PAUSA_PADRAO_MS = 8_000;
export const MAXIMO_DE_PAGINAS_PADRAO = 20;

/**
 * O navegador da casa.
 *
 * Instanciar é barato e NÃO abre navegador nenhum: o Chromium só sobe no
 * primeiro `lerProjeto`/`descobrir` que o portão aprovar. Abrir navegador em
 * construtor faria todo teste e toda importação pagar meio segundo e ~200 MB.
 */
export class BrowserComputer {
  private readonly plataforma: string;
  private readonly pausaMs: number;
  private readonly maximoDePaginas: number;
  private paginasLidas = 0;
  private ultimaLeituraEm = 0;
  // `unknown` e não o tipo do Playwright: importar o tipo arrastaria a
  // biblioteca para dentro de todo módulo que só quer ler a política.
  private navegador: unknown = null;

  constructor(plataforma: string, opcoes: OpcoesDoNavegador = {}) {
    this.plataforma = plataforma;
    this.pausaMs = opcoes.pausaEntreLeiturasMs ?? PAUSA_PADRAO_MS;
    this.maximoDePaginas = opcoes.maximoDePaginas ?? MAXIMO_DE_PAGINAS_PADRAO;
  }

  /** O portão, exposto: quem quiser saber ANTES de tentar, pergunta. */
  podeFazer(acao: Acao): Decisao {
    return portaoDeConformidade({ plataforma: this.plataforma, acao });
  }

  /**
   * A URL é de um lugar que podemos ler?
   *
   * Três coisas, todas fail closed: protocolo, domínio da lista fechada e
   * caminho fora dos `Disallow`. Uma URL vinda de um link da própria página é
   * dado de terceiro — sem esta conferência, um link plantado leva o navegador
   * da agência para onde o terceiro quiser.
   */
  urlPermitida(url: string): { ok: boolean; motivo: string } {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, motivo: "URL inválida." };
    }
    if (u.protocol !== "https:") return { ok: false, motivo: `protocolo "${u.protocol}" — só https.` };
    const permitidos = DOMINIOS_PERMITIDOS[this.plataforma] ?? [];
    if (!permitidos.includes(u.hostname.toLowerCase())) {
      return { ok: false, motivo: `"${u.hostname}" não é domínio da plataforma "${this.plataforma}".` };
    }
    const proibido = CAMINHOS_PROIBIDOS.find((r) => r.test(u.pathname));
    if (proibido) {
      return { ok: false, motivo: `"${u.pathname}" está fora da área pública autorizada (Disallow no robots.txt ou exige sessão).` };
    }
    return { ok: true, motivo: "área pública autorizada." };
  }

  /** O HTML tem um desafio anti-bot na frente? */
  static temDesafio(html: string): boolean {
    return SINAIS_DE_CAPTCHA.some((r) => r.test(html ?? ""));
  }

  /**
   * Lê uma página pública. É a ÚNICA operação que toca a rede.
   *
   * Ordem: portão → URL → ritmo → teto → navegador → desafio. Cada passo fecha
   * a porta sozinho; nenhum depende do anterior ter sido lembrado.
   */
  async lerPagina(url: string, acao: Acao = "lerProjeto"): Promise<ResultadoDeLeitura> {
    const decisao = this.podeFazer(acao);
    if (decisao.veredito !== "ALLOW") {
      return { ok: false, motivo: "portao", detalhe: decisao.motivo, decisao };
    }
    const permissao = this.urlPermitida(url);
    if (!permissao.ok) return { ok: false, motivo: "fora_do_dominio", detalhe: permissao.motivo };

    if (this.paginasLidas >= this.maximoDePaginas) {
      return {
        ok: false, motivo: "portao",
        detalhe: `teto de ${this.maximoDePaginas} páginas por sessão atingido. O teto existe para que um erro de paginação não vire mil requisições.`,
      };
    }

    await this.respeitarORitmo();

    let html: string;
    try {
      html = await this.baixarHtml(url);
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : "erro desconhecido";
      // "não consegui ler" NUNCA vira "não existe": é a lição do Drive de
      // 07/08, em que uma falha de LEITURA saiu como fato sobre o cliente.
      if (/playwright|chromium|browser|launch|executable/i.test(detalhe)) {
        return { ok: false, motivo: "sem_navegador", detalhe };
      }
      return { ok: false, motivo: "erro_de_rede", detalhe };
    }

    if (BrowserComputer.temDesafio(html)) {
      return {
        ok: false, motivo: "captcha",
        detalhe: "A plataforma pôs um desafio (reCAPTCHA / Turnstile) na frente. O agente PARA e escala — contornar é fraude na lista de Sanções.",
      };
    }

    this.paginasLidas++;
    this.ultimaLeituraEm = Date.now();
    return { ok: true, pagina: { url, conteudoDeTerceiro: textoVisivel(html), lidaEm: new Date() } };
  }

  /** Fecha o navegador, se ele chegou a abrir. Idempotente. */
  async fechar(): Promise<void> {
    const n = this.navegador as { close?: () => Promise<void> } | null;
    this.navegador = null;
    if (n?.close) await n.close().catch(() => { /* fechar não pode derrubar o chamador */ });
  }

  private async respeitarORitmo(): Promise<void> {
    if (this.ultimaLeituraEm === 0) return;
    const decorrido = Date.now() - this.ultimaLeituraEm;
    if (decorrido >= this.pausaMs) return;
    await new Promise((r) => setTimeout(r, this.pausaMs - decorrido));
  }

  /**
   * Playwright, importado sob demanda.
   *
   * `/usr/bin/chromium` é o binário do apt que já está na imagem de produção
   * (`railpack.json → deploy.aptPackages`), o mesmo que o motor de molde usa.
   * Não exige variável de ambiente: pedir configuração para uma coisa funcionar
   * é a armadilha do ffmpeg, que some em silêncio.
   */
  private async baixarHtml(url: string): Promise<string> {
    const { chromium } = (await import("playwright")) as typeof import("playwright");
    const caminho = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
    const { existsSync } = await import("node:fs");
    const navegador = await chromium.launch(existsSync(caminho) ? { executablePath: caminho } : {});
    this.navegador = navegador;
    try {
      const contexto = await navegador.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      const pagina = await contexto.newPage();
      await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return await pagina.content();
    } finally {
      this.navegador = null;
      await navegador.close().catch(() => { /* idem */ });
    }
  }
}

/** Tira script, style e marcação. Puro e exportado para o teste poder olhar. */
export function textoVisivel(html: string): string {
  return (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
