// piso-de-verdade.ts — O FREIO QUE NÃO DEPENDE DE IA.
//
// O P0 desta casa, em uma frase: das 31 checagens declaradas em
// `quality-gates.ts`, 28 são texto descrevendo o que um humano deveria conferir.
// Com revisão humana isso era um checklist. Sem revisão humana é decoração.
//
// O auditor que roda de verdade (`quality-auditor.ts`) é um LLM — e um LLM
// julgando outro LLM tem o mesmo ponto cego dos dois: se o modelo inventou um
// telefone plausível, o juiz acha plausível também. Além disso, o auditor é
// fail-open: IA fora do ar = passou.
//
// Este módulo é o PISO. Roda em código, sem IA, sem rede, e por isso:
//   • não tem ponto cego compartilhado com quem escreveu a peça;
//   • não pode ficar "indisponível";
//   • é determinístico — o mesmo texto dá sempre o mesmo veredito.
//
// Ele NÃO julga qualidade, gosto ou criatividade — isso continua com o LLM.
// Ele responde uma pergunta só, e é a que chega no cliente como mentira:
// **esta peça afirma algum FATO que a agência não tem como sustentar?**
//
// Regra de convivência com o auditor de IA: o piso é BLOQUEANTE e o juízo do
// LLM continua sendo parecer. Reprovar por invenção de dado é objetivo;
// reprovar por "achei fraco" não é.

/** Um fato que a agência SABE sobre o cliente. Tudo que a peça afirmar e que
 *  contradiga (ou extrapole) isto é invenção, não criatividade. */
export interface VerdadeDoCliente {
  businessName: string;
  /** Telefones conhecidos (do briefing / cadastro), só dígitos. */
  telefones: string[];
  /** E-mails conhecidos. */
  emails: string[];
  /** Serviços realmente contratados. */
  servicos: string[];
  /** Valores que o cliente informou (verba, mensalidade). Em reais. */
  valores: number[];
  /**
   * O que o cliente contou sobre a OPERAÇÃO dele — horário, área de entrega,
   * pagamento, oferta, canal e prazo. Montado pelo servidor a partir do banco
   * (`buildVerdadeDoCliente`, em `lib/dioli-brain/client-snapshot.ts`).
   *
   * AUSENTE = o cliente não contou nada. E aqui está o ponto do módulo inteiro:
   * ausência NÃO desliga a checagem, ela a torna mais dura. Campo vazio
   * significa "afirmar isso é invenção", nunca "provavelmente está certo".
   * O padrão contrário seria fail-open — o mesmo defeito que este piso existe
   * para consertar.
   */
  operacao?: VerdadeOperacional;
}

/** As classes de afirmação que este piso sabe conferir. Cada uma é um fato
 *  sobre o negócio do cliente que ELE não tem como revisar: ele lê "entregamos
 *  em toda a cidade" e aprova de boa-fé, porque parece coisa dele. */
export type ClasseDeFato =
  | "horario"
  | "area_de_atendimento"
  | "pagamento"
  | "oferta"
  | "canal"
  | "prazo";

/**
 * A verdade operacional, já normalizada em tokens comparáveis. Tudo aqui saiu
 * das PALAVRAS DO CLIENTE (briefing, cadastro, Brand Brain) — nada é derivado
 * por inferência. Lista vazia = o cliente nunca falou disso.
 */
export interface VerdadeOperacional {
  /** Horas de funcionamento atestadas: "09:00", "23:00" ou "24h" (sempre aberto). */
  horarios: string[];
  /** Dias atestados: seg…dom, "todos", "uteis", "fds", "feriado". */
  dias: string[];
  /** Cidades / bairros / regiões atendidos, normalizados (minúsculo, sem acento). */
  areas: string[];
  /** Raio de entrega em km, se o cliente informou. */
  raioEntregaKm?: number;
  /** Formas de pagamento: pix | credito | debito | cartao | dinheiro | boleto | vale. */
  pagamentos: string[];
  /** Maior número de parcelas que o cliente disse aceitar. */
  parcelasMax?: number;
  /** Canais: whatsapp | instagram | facebook | site | ifood | rappi | telegram | tiktok | telefone. */
  canais: string[];
  /** Perfis (@algo) e domínios que o cliente informou serem dele. */
  handles: string[];
  /** Vocabulário do que o cliente disse vender/fazer — a base do "também fazemos X". */
  ofertas: string[];
  /** Prazos atestados, normalizados: "30 minuto", "24 hora", "5 dia". */
  prazos: string[];
}

export function operacaoVazia(): VerdadeOperacional {
  return { horarios: [], dias: [], areas: [], pagamentos: [], canais: [], handles: [], ofertas: [], prazos: [] };
}

export interface Violacao {
  /** id estável — vira métrica de "o que mais reprova" com o tempo. */
  id: string;
  /** O que apareceu na peça. */
  trecho: string;
  /** Por que isto não pode ir ao cliente, em linguagem de negócio. */
  motivo: string;
}

export interface VereditoDoPiso {
  aprovado: boolean;
  violacoes: Violacao[];
}

// ─── Padrões ────────────────────────────────────────────────────────────────

/** Telefone brasileiro em qualquer formatação usual. */
const RE_TELEFONE = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}/g;
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const RE_VALOR = /R\$\s?([\d.]+(?:,\d{2})?)/g;
/** CNPJ e CPF: nunca deveriam ser gerados por um modelo. */
const RE_DOCUMENTO = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/** Rascunho que vazou para a entrega. O cliente lendo "[inserir aqui]" perde a
 *  confiança em tudo que veio junto — e isso não é questão de gosto. */
const RE_PLACEHOLDER = /\[(?:inserir|preencher|completar|adicionar|seu|sua)\b[^\]]*\]|\blorem ipsum\b|\{\{[^}]+\}\}/gi;

/** Marcadores que SÓ valem em CAIXA ALTA, e a distinção não é preciosismo:
 *  `TODO` sem diferenciar maiúscula casa com "Todo dia", "toda semana", "todos
 *  os dias" — palavras comuníssimas em português. Reprovar por elas faria o
 *  piso barrar peça legítima o tempo todo, e um freio que reprova tudo é
 *  desligado na primeira semana. */
const RE_PLACEHOLDER_CAIXA_ALTA = /\bTODO\b|\bFIXME\b|\bXXX+\b/g;

/** Promessa de resultado com número. É o que dá processo, não só reclamação:
 *  marketing não garante venda, e prometer garantia é publicidade enganosa. */
const RE_PROMESSA = new RegExp(
  String.raw`\b(garant\w+|assegur\w+|prometemos|com certeza)\b[^.!?\n]{0,80}?\d+\s*%` + "|" +
  String.raw`\d+\s*%[^.!?\n]{0,60}?\b(garantid\w+|assegurad\w+)\b` + "|" +
  String.raw`\b(garantimos|prometemos)\b[^.!?\n]{0,60}?\b(vendas?|faturamento|resultado|retorno|lucro|clientes?)\b`,
  "gi",
);

// ─── Normalização ───────────────────────────────────────────────────────────

const digitos = (s: string) => s.replace(/\D/g, "");

/** "R$ 2.500,00" → 2500 */
function paraNumero(bruto: string): number {
  const limpo = bruto.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

/** Gasto JÁ REALIZADO pela agência — o vocabulário da prestação de contas. Note
 *  o que ficou de fora: "investimento sugerido", "orçamento", "proposta". Esses
 *  são promessa ao cliente e continuam sendo conferidos contra o que ele
 *  informou. */
//
// Só a PRIMEIRA PESSOA da agência e o particípio do gasto dela. "gasta" e
// "custa" ficaram de fora de propósito: "seu cliente gasta R$ 500 por visita" é
// afirmação sobre o negócio dele, não prestação de contas — e passaria a caber
// no teto da verba sem ninguém ter medido nada.
const RE_FRAME_GASTO =
  /\b(investimos|investidos?|aplicamos|aplicad[oa]s?|gastamos|veiculamos|verba utilizada|verba aplicada|valor investido|investimento realizado)\b/;

/** A janela de texto imediatamente ANTES de uma posição, sem cruzar linha.
 *  Não dá para usar `frases()` aqui: o separador de frase é o ponto, e
 *  "R$ 5.000,00" tem ponto no meio — partir por frase quebraria o próprio
 *  valor ao meio. */
function janelaAntes(texto: string, indice: number, tamanho = 90): string {
  const inicio = Math.max(0, indice - tamanho);
  const janela = texto.slice(inicio, indice);
  const corte = Math.max(janela.lastIndexOf("\n"), janela.lastIndexOf("•"), janela.lastIndexOf("|"));
  return corte >= 0 ? janela.slice(corte + 1) : janela;
}

/** O texto sem os trechos em que o especialista ADMITE não saber. "PRECISO
 *  CONFIRMAR: verba mensal" é o comportamento correto — não pode ser punido. */
function semAdmissoes(texto: string): string {
  return texto.replace(/PRECISO CONFIRMAR[^\n]*/gi, " ");
}

/** Um número de telefone só é "conhecido" se bater com um do cliente. Comparar
 *  por sufixo de 8 dígitos evita falso positivo por DDD escrito diferente. */
function telefoneConhecido(achado: string, conhecidos: string[]): boolean {
  const d = digitos(achado);
  if (d.length < 8) return false;
  const sufixo = d.slice(-8);
  return conhecidos.some((c) => digitos(c).endsWith(sufixo));
}

// ─── As afirmações sobre a operação do cliente ───────────────────────────────
//
// Por que esta parte existe, em uma frase do CEO: **quem revisa é o cliente.**
// Ele julga muito bem o que enxerga — gosto, marca, tom. E não tem como julgar
// o que não consegue conferir: uma peça que diz "atendemos até meia-noite" ou
// "entregamos em toda a cidade" ele lê como coisa dele, e aprova de boa-fé.
// Afirmação factual sobre o negócio dele é exatamente o buraco da revisão do
// cliente. Por isso ela é conferida por CÓDIGO, contra o que ele de fato contou.
//
// O RECORTE — e ele é o que separa um freio de um carimbo:
// só entra aqui afirmação **factual e verificável**, isto é, ancorada num token
// concreto: uma hora, um lugar, uma forma de pagamento, um canal, um número com
// unidade de tempo. "Atendimento rápido", "o melhor da região", "qualidade
// incomparável" não trazem token nenhum — são elogio, não fato — e passam. Um
// piso que reprova elogio reprova tudo, e freio que reprova tudo é desligado na
// primeira semana.

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Frases, para que o "contexto" de uma afirmação não vaze de uma linha para a
 *  outra. Bullet e quebra de linha contam como fim de frase — peça de marketing
 *  é escrita em lista, não em parágrafo. */
function frases(texto: string): string[] {
  return texto
    .split(/[.!?;\n\r•|]+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 1);
}

const pad = (n: number) => String(n).padStart(2, "0");

// ── Horário ───────────────────────────────────────────────────────────────────
/** Só é afirmação de horário o que vem num quadro de funcionamento. Sem isto,
 *  "o pão leva 18 horas de fermentação" viraria alegação de expediente. */
const RE_FRAME_HORARIO = /\b(abert\w*|abrimos|abre|abrem|fechad\w*|fechamos|fecha|funcion\w*|atendemos|atendimento|horario|expediente|plantao|servimos)\b/;

/**
 * As horas de uma frase, normalizadas em "HH:MM".
 *
 * O `(?!\d)` no lugar do `\b` final NÃO é preciosismo — foi um falso NEGATIVO
 * medido. O padrão anterior era `\b(\d{1,2})\s*h(?:oras?)?\b(?:\s*(\d{2})\b)?`,
 * e **não existe fronteira de palavra entre `h` e `30`**: em "23h30" o `\b`
 * falhava, o casamento inteiro caía e a hora não era reconhecida em lugar
 * nenhum — nem ao ler o briefing, nem ao conferir a peça. Efeito duplo, e o
 * segundo é o grave: num cliente que fecha às 23h30, a peça "fechamos às 2h30
 * da manhã" PASSAVA. A trava era cara ou coroa conforme a notação que o cliente
 * usou para escrever a própria hora.
 */
function tokensDeHora(frase: string): string[] {
  const n = semAcento(frase);
  const out = new Set<string>();
  if (/\bmeia[- ]noite\b/.test(n)) out.add("00:00");
  if (/\bmeio[- ]dia\b/.test(n)) out.add("12:00");
  for (const m of n.matchAll(/\b(\d{1,2})\s*:\s*(\d{2})\b/g)) {
    const h = Number(m[1]);
    if (h <= 23) out.add(`${pad(h)}:${m[2]}`);
  }
  for (const m of n.matchAll(/\b(\d{1,2})\s*(?:horas?|hs|h)\s?(\d{2})?(?!\d)/g)) {
    const h = Number(m[1]);
    const min = m[2];
    if (h === 24 && !min) out.add("24h");
    else if (h <= 23) out.add(`${pad(h)}:${min ?? "00"}`);
  }
  return [...out];
}

const DIAS: Array<[RegExp, string]> = [
  [/\btodos os dias\b|\btodo dia\b|\b7 dias por semana\b|\bdiariamente\b|\bsempre aberto\b/, "todos"],
  [/\bdias uteis\b|\bdia util\b/, "uteis"],
  [/\bfins? de semana\b|\bfinais de semana\b|\bfinal de semana\b/, "fds"],
  [/\bferiados?\b/, "feriado"],
  [/\bsegunda\b|\bsegundas\b|\bsegunda-feira\b|\bseg\b/, "seg"],
  [/\bterca\b|\btercas\b|\bterca-feira\b|\bter\b/, "ter"],
  [/\bquarta\b|\bquartas\b|\bquarta-feira\b|\bqua\b/, "qua"],
  [/\bquinta\b|\bquintas\b|\bquinta-feira\b|\bqui\b/, "qui"],
  [/\bsexta\b|\bsextas\b|\bsexta-feira\b|\bsex\b/, "sex"],
  [/\bsabados?\b|\bsab\b/, "sab"],
  [/\bdomingos?\b|\bdom\b/, "dom"],
];

/** A semana em ordem, para que INTERVALO vire os dias que ele contém. */
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
const NOME_DO_DIA: Record<string, string> = {
  segunda: "seg", terca: "ter", quarta: "qua", quinta: "qui", sexta: "sex", sabado: "sab", domingo: "dom",
};
/** "de segunda a sábado", "terça a domingo", "seg-sex", "de quarta até domingo". */
const RE_INTERVALO_DE_DIAS = new RegExp(
  String.raw`\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?(?:-feiras?)?\s*(?:as|ate|ao|a|-|–|—)\s*(?:o\s+|a\s+)?(segunda|terca|quarta|quinta|sexta|sabado|domingo)s?(?:-feiras?)?\b`,
  "g",
);

/**
 * Os dias que a frase atesta.
 *
 * O INTERVALO é expandido, e esta era a maior fonte de falso positivo do piso:
 * "de segunda a sábado" produzia só `["seg","sab"]` e deixava terça, quarta,
 * quinta e sexta PROIBIDAS. Todo post de "hoje é quarta, vem!" morria contra um
 * cliente que abre a semana inteira. Expandir não afrouxa nada — é ler o que o
 * cliente escreveu: quem diz "de segunda a sábado" disse os seis dias.
 *
 * A expansão vale para os DOIS lados (briefing e peça), porque é a MESMA função:
 * a assimetria entre o que se exige do cliente e o que se exige da peça é o
 * defeito estrutural que esta rodada inteira conserta.
 */
function tokensDeDia(frase: string): string[] {
  const n = semAcento(frase);
  const out = new Set<string>(DIAS.filter(([re]) => re.test(n)).map(([, id]) => id));
  for (const m of n.matchAll(RE_INTERVALO_DE_DIAS)) {
    const de = SEMANA.indexOf(NOME_DO_DIA[m[1]!] as (typeof SEMANA)[number]);
    const ate = SEMANA.indexOf(NOME_DO_DIA[m[2]!] as (typeof SEMANA)[number]);
    if (de < 0 || ate < 0) continue;
    // A semana dá a volta: "de sexta a domingo" e "de sábado a terça" são
    // intervalos legítimos de comércio.
    for (let i = 0; i <= (ate - de + 7) % 7; i++) out.add(SEMANA[(de + i) % 7]!);
  }
  return [...out];
}

// ── Área de atendimento / entrega ─────────────────────────────────────────────
const RE_FRAME_AREA = /\b(entreg\w+|delivery|atendemos|atendimento|levamos|cobrimos|raio|retirada|buscamos)\b/;
/** O quantificador universal é o pior caso: "toda a cidade" nunca é confirmável
 *  por acaso, e é a frase que faz o cliente perder pedido em bairro que ele não
 *  atende. */
const RE_AREA_UNIVERSAL =
  /\btod[oa]s?\s+(?:a|o|os|as)\s+(cidade|regiao|regioes|bairros?|estado|pais|zona \w+|grande \w+)\b|\btodo o brasil\b|\bpara todo o brasil\b|\bqualquer (bairro|lugar|regiao|cidade|endereco)\b|\bem todo lugar\b/;

/** Palavras que parecem nome de lugar mas não são — evita que "Atendimento no
 *  Instagram" vire alegação de cobertura geográfica. */
const NAO_E_LUGAR = new Set([
  "instagram", "facebook", "whatsapp", "tiktok", "ifood", "rappi", "telegram", "youtube", "google",
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo", "natal", "pascoa",
]);

const LIGACOES = new Set(["de", "do", "da", "dos", "das"]);

/** Os lugares que a frase afirma atender. Só conta nome próprio depois de
 *  preposição ("em Moema", "para a Vila Mariana"), e a lista é quebrada em
 *  "e"/vírgula — senão "entregamos em Moema e Vila Mariana" atestaria só o
 *  primeiro bairro e o segundo passaria batido.
 *
 *  A VÍRGULA ficou DENTRO do segmento (antes o `[^,...]` cortava nela). Cortar
 *  na vírgula fazia o cliente que escreve "Delivery em Moema, Vila Mariana e
 *  Ibirapuera" atestar **só Moema** — enquanto o lado da peça, que quebra por
 *  " e ", enxergava os três. Era a assimetria condenando os bairros REAIS 2 e 3:
 *  "Delivery na Vila Mariana" virava `area_contradiz` contra o próprio briefing.
 *  O que segura o alargamento é o filtro de nome próprio logo abaixo: "Moema,
 *  das 18h às 23h" quebra em "das 18h às 23h", que não começa com maiúscula e
 *  morre ali. */
function lugaresAfirmados(frase: string, businessName: string): string[] {
  const nome = new Set(semAcento(businessName).split(" ").filter(Boolean));
  const out: string[] = [];
  const re = /\b(?:em|para|no|na|nos|nas|ate)\s+((?:a |o |as |os )?[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ][^.;!?\n]{1,80})/g;
  for (const m of frase.matchAll(re)) {
    const segmento = m[1]!.replace(/^(?:a|o|as|os)\s+/i, "");
    for (const cru of segmento.split(/\s+e\s+|,/)) {
      // "Santana e no Tucuruvi": o segundo item chega com a preposição colada.
      const bruto = cru.trim().replace(/^(?:a|o|as|os|no|na|nos|nas|em|para)\s+/i, "");
      // Do candidato, só a sequência inicial de nomes próprios: em "Moema com
      // atendimento rápido", o lugar é "Moema".
      const palavras: string[] = [];
      for (const p of bruto.trim().split(/\s+/)) {
        const eProprio = /^[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ]/.test(p);
        if (!eProprio && !(LIGACOES.has(semAcento(p)) && palavras.length > 0)) break;
        palavras.push(p);
      }
      while (palavras.length > 0 && LIGACOES.has(semAcento(palavras[palavras.length - 1]!))) palavras.pop();
      if (palavras.length === 0) continue;
      const norm = semAcento(palavras.join(" ").replace(/[^\wÀ-ÿ\s]/g, ""));
      if (!norm || NAO_E_LUGAR.has(norm)) continue;
      if (norm.split(" ").every((p) => nome.has(p))) continue; // é o nome do próprio cliente
      out.push(norm);
    }
  }
  return out;
}

// ── Pagamento ────────────────────────────────────────────────────────────────
const RE_FRAME_PAGAMENTO = /\b(aceitamos|aceita|aceite|pagamento|pagamentos|pagar|pague|paga|parcel\w+|sem juros|a vista|cobramos)\b/;
const PAGAMENTOS: Array<[RegExp, string]> = [
  [/\bpix\b/, "pix"],
  [/\bcredito\b|\bcartao de credito\b/, "credito"],
  [/\bdebito\b|\bcartao de debito\b/, "debito"],
  [/\bcart(?:ao|oes)\b/, "cartao"],
  [/\bdinheiro\b|\bespecie\b/, "dinheiro"],
  [/\bboleto\b/, "boleto"],
  [/\bvale[- ](?:refeicao|alimentacao)\b|\bticket\b|\bsodexo\b|\balelo\b/, "vale"],
];

function tokensDePagamento(frase: string): string[] {
  const n = semAcento(frase);
  return PAGAMENTOS.filter(([re]) => re.test(n)).map(([, id]) => id);
}

/** Formas cuja palavra só significa pagamento: "Pix" e "boleto" não são outra
 *  coisa em português. "cartão" (de visita) e "dinheiro" ("dá dinheiro") são —
 *  por isso só pegam carona quando a frase já traz um inequívoco ou um verbo. */
const PAGAMENTOS_INEQUIVOCOS = new Set(["pix", "boleto", "credito", "debito", "vale"]);

/**
 * A frase do CLIENTE fala de pagamento? Vale o verbo-frame ("aceitamos…") OU um
 * termo inequívoco.
 *
 * Por que o verbo deixou de ser obrigatório na EXTRAÇÃO: briefing de cliente vem
 * em bullet — "Pix, cartão em até 6x e boleto." não tem verbo nenhum. Sem isto,
 * nada era registrado, e a peça que apenas REPETIA o bullet do cliente era
 * barrada como `pagamento_nao_informado`. O piso reprovava a peça por dizer
 * exatamente o que o cliente escreveu.
 *
 * Na CONFERÊNCIA o frame continua obrigatório, e a diferença é proposital: ler
 * o cliente com generosidade e a peça com rigor é o único desequilíbrio seguro —
 * o inverso é o que produzia a mordaça.
 */
function fraseDePagamentoDoCliente(n: string, formas: string[]): boolean {
  return RE_FRAME_PAGAMENTO.test(n) || formas.some((f) => PAGAMENTOS_INEQUIVOCOS.has(f));
}

function parcelasAfirmadas(frase: string): number[] {
  const n = semAcento(frase);
  return [...n.matchAll(/\b(\d{1,2})\s*x\b/g)].map((m) => Number(m[1])).filter((v) => v > 1);
}

// ── Canal ────────────────────────────────────────────────────────────────────
/** Chamada para ação. Citar "Instagram" ao PLANEJAR ("post para o Instagram")
 *  não afirma nada sobre o cliente; mandar o público dele "seguir no Instagram"
 *  afirma que o perfil existe. A diferença é o verbo. */
const RE_FRAME_CANAL = /\b(chame|chama|fale|falem|peca|peça|pedidos?|peça|acesse|acessa|siga|sigam|clique|link na bio|direct|agende|reserve|encomende|compre|baixe|entre em contato|solicite|chama no|pelo|pela|via)\b/i;
const CANAIS: Array<[RegExp, string]> = [
  [/\bwhats?app\b|\bwpp\b|\bzap\b/, "whatsapp"],
  [/\binstagram\b|\binsta\b/, "instagram"],
  [/\bfacebook\b/, "facebook"],
  [/\bifood\b/, "ifood"],
  [/\brappi\b/, "rappi"],
  [/\btelegram\b/, "telegram"],
  [/\btiktok\b/, "tiktok"],
  [/\b(?:nosso |no |pelo )site\b|\bwebsite\b|\bloja virtual\b/, "site"],
  [/\btelefone\b|\bligue\b/, "telefone"],
];

function tokensDeCanal(frase: string): string[] {
  const n = semAcento(frase);
  return CANAIS.filter(([re]) => re.test(n)).map(([, id]) => id);
}

/** Perfil social. O `(?<![\w.])` impede que o domínio de um e-mail vire "perfil". */
const RE_HANDLE = /(?<![\w.])@[a-z0-9._]{3,30}\b/gi;
const RE_DOMINIO = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,}\.(?:com|net|org|io|app|shop|store|me|co|dev|blog)(?:\.br)?)\b/gi;

function tokensDeEndereco(texto: string): string[] {
  const out = new Set<string>();
  for (const m of texto.matchAll(RE_HANDLE)) out.add(semAcento(m[0]));
  // Um domínio dentro de um e-mail já é julgado pela checagem de e-mail.
  const emails = (texto.match(RE_EMAIL) ?? []).map((e) => semAcento(e));
  for (const m of texto.matchAll(RE_DOMINIO)) {
    const d = semAcento(m[1]!);
    if (emails.some((e) => e.endsWith(d))) continue;
    out.add(d);
  }
  return [...out];
}

// ── Oferta ───────────────────────────────────────────────────────────────────
/** O recorte mais estreito de todos, de propósito. "Oferecemos X" é frase que
 *  qualquer texto usa; **"TAMBÉM fazemos X"** é a frase que ESTENDE o catálogo
 *  além do que o cliente contou — que é exatamente a alucinação que dá dano
 *  ("também fazemos sobrancelha", "também fazemos delivery"). Verbo genérico
 *  sem "também" ficou de fora porque o falso positivo comeria peça legítima. */
const RE_OFERTA_EXTRA =
  /\b(?:tambem|inclusive)\s+(?:fazemos|oferecemos|temos|vendemos|servimos|realizamos|produzimos|trabalhamos com|contamos com|atendemos)\b([^.!?\n;]{0,70})/g;

const STOPWORDS = new Set([
  "para", "com", "sem", "dos", "das", "uma", "uns", "umas", "seu", "sua", "seus", "suas",
  "todo", "toda", "todos", "todas", "mais", "menos", "muito", "muita", "nosso", "nossa",
  "nossos", "nossas", "aqui", "voce", "voces", "melhor", "melhores", "novo", "nova",
  "grande", "pequeno", "otimo", "otima", "sempre", "nunca", "tambem", "inclusive",
  "opcao", "opcoes", "linha", "tipo", "tipos", "servico", "servicos", "produto", "produtos",
]);

function palavrasDeConteudo(s: string): string[] {
  return semAcento(s)
    .split(/[^a-z0-9]+/)
    // Precisa ter letra: pedaço de número solto ("98940") não é oferta, e
    // vocabulário numérico só serviria para carregar dado pessoal picado.
    .filter((p) => p.length >= 4 && /[a-z]/.test(p) && !STOPWORDS.has(p));
}

// ── Prazo ────────────────────────────────────────────────────────────────────
/** Verbo conjugado, não infinitivo: "entregamos em 30 minutos" é promessa ao
 *  cliente final; "entregar 12 posts em 30 dias" é planejamento interno da
 *  agência e não afirma nada sobre a operação do cliente. */
const RE_FRAME_PRAZO = /\b(entregamos|entregas|entrega|entregue|pronto|prontinho|respondemos|resposta|retorno|prazo|chega|receba|enviamos|envio|fica pronto)\b/;
const RE_QUANTIDADE_DE_TEMPO = /\b(\d{1,3})\s*(minutos?|horas?|dias?|semanas?|mes(?:es)?)\b/g;

function tokensDePrazo(frase: string): string[] {
  const n = semAcento(frase);
  const out = new Set<string>();
  for (const m of n.matchAll(RE_QUANTIDADE_DE_TEMPO)) {
    const unidade = m[2]!.replace(/s$/, "").replace(/^mese$/, "mes");
    out.add(`${Number(m[1])} ${unidade}`);
  }
  return [...out];
}

// ── A extração: as palavras do cliente viram tokens comparáveis ──────────────

/**
 * Lê o que o CLIENTE escreveu (briefing, contexto, marca) e devolve a verdade
 * operacional em tokens. Usa exatamente os mesmos detectores da conferência —
 * simetria é o que garante que "das 18h às 23h" no briefing case com "das 18h
 * às 23h" na peça, e que nada mais case por acaso.
 *
 * O que o cliente não escreveu não aparece aqui. Nunca é preenchido por padrão.
 */
export function extrairVerdadeOperacional(textoDoCliente: string, businessName = ""): VerdadeOperacional {
  const op = operacaoVazia();
  if (!textoDoCliente || textoDoCliente.trim().length === 0) return op;

  const horarios = new Set<string>(), dias = new Set<string>(), areas = new Set<string>();
  const pagamentos = new Set<string>(), canais = new Set<string>(), prazos = new Set<string>();

  for (const frase of frases(textoDoCliente)) {
    const n = semAcento(frase);
    if (RE_FRAME_HORARIO.test(n)) {
      for (const t of tokensDeHora(frase)) horarios.add(t);
      for (const t of tokensDeDia(frase)) dias.add(t);
    }
    if (RE_FRAME_AREA.test(n)) {
      const universal = n.match(RE_AREA_UNIVERSAL);
      if (universal) areas.add(semAcento(universal[0]));
      for (const l of lugaresAfirmados(frase, businessName)) areas.add(l);
      const raio = n.match(/\b(?:raio de\s*)?(\d{1,3})\s*km\b/);
      if (raio) op.raioEntregaKm = Math.max(op.raioEntregaKm ?? 0, Number(raio[1]));
    }
    const formasDaFrase = tokensDePagamento(frase);
    if (fraseDePagamentoDoCliente(n, formasDaFrase)) {
      for (const t of formasDaFrase) pagamentos.add(t);
      for (const p of parcelasAfirmadas(frase)) op.parcelasMax = Math.max(op.parcelasMax ?? 0, p);
    }
    // Canal e prazo o cliente costuma informar SEM verbo de chamada ("WhatsApp:
    // (11) 9...", "prazo de 30 dias"), então aqui o dicionário basta.
    for (const t of tokensDeCanal(frase)) canais.add(t);
    if (RE_FRAME_PRAZO.test(n)) for (const t of tokensDePrazo(frase)) prazos.add(t);
  }

  op.horarios = [...horarios];
  op.dias = [...dias];
  op.areas = [...areas];
  op.pagamentos = [...pagamentos];
  op.canais = [...canais];
  op.prazos = [...prazos];
  op.handles = tokensDeEndereco(textoDoCliente);
  op.ofertas = [...new Set(palavrasDeConteudo(textoDoCliente))];
  return op;
}

/** As classes sobre as quais o cliente não contou NADA — o que a agência precisa
 *  perguntar antes de a peça poder afirmar. Serve ao painel e ao pedido de
 *  material; não altera veredito. */
export function classesSemInformacao(op: VerdadeOperacional): ClasseDeFato[] {
  const faltando: ClasseDeFato[] = [];
  if (op.horarios.length === 0 && op.dias.length === 0) faltando.push("horario");
  if (op.areas.length === 0 && op.raioEntregaKm === undefined) faltando.push("area_de_atendimento");
  if (op.pagamentos.length === 0 && op.parcelasMax === undefined) faltando.push("pagamento");
  if (op.ofertas.length === 0) faltando.push("oferta");
  if (op.canais.length === 0 && op.handles.length === 0) faltando.push("canal");
  if (op.prazos.length === 0) faltando.push("prazo");
  return faltando;
}

// ── A conferência ────────────────────────────────────────────────────────────

const NAO_CONTOU =
  "O cliente nunca informou isso. Afirmar sobre o que ele não contou é invenção — " +
  "ausência de informação não é informação. Escreva \"PRECISO CONFIRMAR\" e pergunte a ele.";

function conferirOperacao(texto: string, verdade: VerdadeDoCliente): Violacao[] {
  const op = verdade.operacao ?? operacaoVazia();
  const v: Violacao[] = [];
  const corta = (f: string) => f.trim().slice(0, 120);
  const atestado = (e: string) => op.handles.some((h) => h === e || h.endsWith(e) || e.endsWith(h));

  // Perfil e domínio são conferidos no TEXTO INTEIRO, não frase a frase: o ponto
  // de "sushicazza.com.br" é fim de frase para o separador e parte do endereço
  // para o leitor. Conferir por frase partiria o domínio ao meio e deixaria
  // passar exatamente o endereço inventado que se quer pegar.
  const enderecosDaPeca = tokensDeEndereco(texto);
  for (const e of enderecosDaPeca) {
    if (atestado(e)) continue;
    v.push({
      id: "endereco_inventado",
      trecho: e,
      motivo: "Perfil ou site que não veio do cliente. Endereço inventado numa peça publicada manda o público para lugar nenhum.",
    });
  }

  for (const frase of frases(texto)) {
    const n = semAcento(frase);

    // 1. HORÁRIO — "atendemos até meia-noite" num cliente que fecha 23h manda
    //    gente para uma porta fechada.
    if (RE_FRAME_HORARIO.test(n)) {
      const horas = tokensDeHora(frase);
      const diasDitos = tokensDeDia(frase);
      if (horas.length > 0 || diasDitos.length > 0) {
        if (op.horarios.length === 0 && op.dias.length === 0) {
          v.push({ id: "horario_nao_informado", trecho: corta(frase), motivo: `Horário de funcionamento. ${NAO_CONTOU}` });
        } else {
          for (const h of horas) {
            if (!op.horarios.includes(h)) {
              v.push({
                id: "horario_contradiz",
                trecho: corta(frase),
                motivo: `Horário "${h}" não bate com o que o cliente informou (${op.horarios.join(", ") || "nenhum horário"}). Cliente na porta fechada é dano direto ao negócio dele.`,
              });
            }
          }
          for (const d of diasDitos) {
            const cobre = op.dias.includes(d) || (op.dias.includes("todos") && d !== "todos");
            if (!cobre) {
              v.push({
                id: "horario_contradiz",
                trecho: corta(frase),
                motivo: `Dia de funcionamento "${d}" não bate com o que o cliente informou (${op.dias.join(", ") || "nenhum dia"}).`,
              });
            }
          }
        }
      }
    }

    // 2. ÁREA DE ATENDIMENTO / ENTREGA.
    if (RE_FRAME_AREA.test(n)) {
      const universal = n.match(RE_AREA_UNIVERSAL);
      const lugares = lugaresAfirmados(frase, verdade.businessName);
      const raio = n.match(/\b(?:raio de\s*)?(\d{1,3})\s*km\b/);
      const semArea = op.areas.length === 0 && op.raioEntregaKm === undefined;

      if (universal) {
        const conhecido = op.areas.some((a) => a === semAcento(universal[0]));
        if (!conhecido) {
          v.push({
            id: semArea ? "area_nao_informada" : "area_contradiz",
            trecho: corta(frase),
            motivo: semArea
              ? `Área de atendimento. ${NAO_CONTOU}`
              : `Cobertura total ("${universal[0]}") extrapola o que o cliente informou (${op.areas.join(", ")}). Prometer entrega onde ele não entrega vira pedido cancelado.`,
          });
        }
      }
      for (const l of lugares) {
        const conhecido = op.areas.some((a) => a.includes(l) || l.includes(a));
        if (conhecido) continue;
        v.push({
          id: semArea ? "area_nao_informada" : "area_contradiz",
          trecho: corta(frase),
          motivo: semArea
            ? `Área de atendimento ("${l}"). ${NAO_CONTOU}`
            : `"${l}" não está entre as áreas que o cliente informou (${op.areas.join(", ")}).`,
        });
      }
      if (raio) {
        const km = Number(raio[1]);
        if (op.raioEntregaKm === undefined) {
          v.push({ id: "area_nao_informada", trecho: corta(frase), motivo: `Raio de entrega. ${NAO_CONTOU}` });
        } else if (km > op.raioEntregaKm) {
          v.push({
            id: "area_contradiz",
            trecho: corta(frase),
            motivo: `Raio de ${km} km maior que o informado pelo cliente (${op.raioEntregaKm} km).`,
          });
        }
      }
    }

    // 3. PAGAMENTO — dizer que aceita Pix quem não aceita cria atrito no caixa.
    if (RE_FRAME_PAGAMENTO.test(n)) {
      const formas = tokensDePagamento(frase);
      const parcelas = parcelasAfirmadas(frase);
      const semPagamento = op.pagamentos.length === 0 && op.parcelasMax === undefined;
      for (const f of formas) {
        const conhecido = f === "cartao"
          ? op.pagamentos.some((p) => p === "cartao" || p === "credito" || p === "debito")
          : op.pagamentos.includes(f);
        if (conhecido) continue;
        v.push({
          id: semPagamento ? "pagamento_nao_informado" : "pagamento_contradiz",
          trecho: corta(frase),
          motivo: semPagamento
            ? `Forma de pagamento ("${f}"). ${NAO_CONTOU}`
            : `"${f}" não está entre as formas de pagamento que o cliente informou (${op.pagamentos.join(", ")}).`,
        });
      }
      for (const p of parcelas) {
        if (op.parcelasMax === undefined) {
          v.push({ id: "pagamento_nao_informado", trecho: corta(frase), motivo: `Parcelamento em ${p}x. ${NAO_CONTOU}` });
        } else if (p > op.parcelasMax) {
          v.push({
            id: "pagamento_contradiz",
            trecho: corta(frase),
            motivo: `Parcelamento em ${p}x acima do que o cliente informou (${op.parcelasMax}x).`,
          });
        }
      }
    }

    // 4. OFERTA — só o catálogo ESTENDIDO ("também fazemos X").
    for (const m of n.matchAll(RE_OFERTA_EXTRA)) {
      const objeto = (m[1] ?? "").trim();
      const palavras = palavrasDeConteudo(objeto);
      if (palavras.length === 0) continue;
      const atestado = palavras.some((p) => op.ofertas.some((o) => o === p || o.startsWith(p) || p.startsWith(o)));
      if (atestado) continue;
      v.push({
        id: op.ofertas.length === 0 ? "oferta_nao_informada" : "oferta_contradiz",
        trecho: corta(m[0]),
        motivo: op.ofertas.length === 0
          ? `Serviço/produto oferecido. ${NAO_CONTOU}`
          : `O cliente nunca disse que faz isso. Anunciar serviço que ele não presta gera pedido que ele não consegue atender.`,
      });
    }

    // 5. CANAL DE CONTATO — mandar o público para um canal que não existe é o
    //    mesmo dano do telefone inventado, com outra roupa.
    if (RE_FRAME_CANAL.test(n)) {
      // Um canal está ancorado quando a própria frase traz o contato atestado
      // do cliente: "chame no WhatsApp (11) 98940-0692" com o número que ELE
      // informou não inventa canal nenhum — aponta para o contato dele. Sem o
      // contato junto, a frase afirma sozinha que o canal existe, e aí precisa
      // estar no que o cliente contou.
      const contatoAncorado = (frase.match(RE_TELEFONE) ?? [])
        .some((a) => telefoneConhecido(a, verdade.telefones));
      const enderecoAncorado = enderecosDaPeca.some(atestado);
      // E o telefone do cliente ancora o CTA mesmo quando o número NÃO aparece
      // na peça. Este era o falso positivo mais caro do piso: o briefing real
      // (`BriefingScope`) não tem campo de canal de contato — tem
      // `social.platforms`, que é onde se PUBLICA. Com "Instagram, Facebook" no
      // briefing, `"chame no WhatsApp e peça o seu"` — o CTA mais comum do
      // mercado brasileiro — virava `canal_contradiz`. Publicar não é atender, e
      // o cliente que entregou um telefone atestou o canal de telefone dele.
      // Sem telefone nenhum, nada muda: continua sendo afirmação sem lastro.
      const telefoneAtestado = verdade.telefones.length > 0;
      for (const c of tokensDeCanal(frase)) {
        if (op.canais.includes(c)) continue;
        if ((contatoAncorado || telefoneAtestado) && (c === "whatsapp" || c === "telefone")) continue;
        if (enderecoAncorado && c === "site") continue;
        v.push({
          id: op.canais.length === 0 ? "canal_nao_informado" : "canal_contradiz",
          trecho: corta(frase),
          motivo: op.canais.length === 0
            ? `Canal de contato ("${c}"). ${NAO_CONTOU}`
            : `O cliente não informou atender por "${c}" (informou: ${op.canais.join(", ")}). Público mandado para canal que não existe é pedido perdido.`,
        });
      }
    }
    // 6. PRAZO.
    if (RE_FRAME_PRAZO.test(n)) {
      for (const t of tokensDePrazo(frase)) {
        if (op.prazos.includes(t)) continue;
        v.push({
          id: op.prazos.length === 0 ? "prazo_nao_informado" : "prazo_contradiz",
          trecho: corta(frase),
          motivo: op.prazos.length === 0
            ? `Prazo ("${t}"). ${NAO_CONTOU}`
            : `Prazo "${t}" não bate com o que o cliente informou (${op.prazos.join(", ")}). Prazo prometido é prazo cobrado.`,
        });
      }
    }
  }

  return v;
}

// ─── O piso ─────────────────────────────────────────────────────────────────

/**
 * Confere a peça contra a verdade conhecida do cliente. Determinístico,
 * sem IA e sem rede.
 *
 * Falso positivo aqui custa uma revisão automática; falso negativo custa a
 * confiança do cliente. Por isso, na dúvida, **reprova** — mas só sobre FATO
 * verificável, nunca sobre estilo.
 */
export function conferirPisoDeVerdade(conteudo: string, verdade: VerdadeDoCliente): VereditoDoPiso {
  const violacoes: Violacao[] = [];
  const texto = semAdmissoes(conteudo);

  // 1. Telefone que a agência não conhece. Cliente ligando num número errado
  //    impresso pela agência é dano direto ao negócio dele.
  for (const achado of texto.match(RE_TELEFONE) ?? []) {
    if (!telefoneConhecido(achado, verdade.telefones)) {
      violacoes.push({
        id: "telefone_inventado",
        trecho: achado.trim(),
        motivo: "Telefone que não veio do cliente. Número inventado numa peça publicada manda gente para a linha errada.",
      });
    }
  }

  // 2. E-mail desconhecido — mesmo raciocínio.
  for (const achado of texto.match(RE_EMAIL) ?? []) {
    const conhecido = verdade.emails.some((e) => e.toLowerCase() === achado.toLowerCase());
    if (!conhecido) {
      violacoes.push({
        id: "email_inventado",
        trecho: achado,
        motivo: "E-mail que não veio do cliente. Endereço inventado perde contato de verdade.",
      });
    }
  }

  // 3. Valor que o cliente nunca informou. É promessa comercial: o cliente lê
  //    "R$ 2.000/mês" e passa a cobrar isso da agência.
  const tetoInformado = verdade.valores.length > 0 ? Math.max(...verdade.valores) : undefined;
  for (const m of texto.matchAll(RE_VALOR)) {
    const n = paraNumero(m[1]!);
    if (!Number.isFinite(n)) continue;
    const informado = verdade.valores.some((v) => Math.abs(v - n) < 0.01);
    // O RELATÓRIO MENSAL: "Investimos R$ 1.200 em anúncios" é gasto MEDIDO pela
    // própria casa, não promessa feita ao cliente — e barrá-lo tornava
    // impossível prestar contas do que se gastou. A relaxação é estreita de
    // propósito: exige verbo de gasto REALIZADO na mesma frase E que o número
    // caiba dentro da maior verba que o cliente informou. Nunca se promete mais
    // do que ele autorizou, e sem verba informada nada disso vale — segue
    // fail-closed. O que ela NÃO faz é conferir se o gasto foi mesmo esse: isso
    // é medição, não ancoragem, e não é trabalho deste piso.
    const gastoDaCasa =
      !informado &&
      tetoInformado !== undefined &&
      n <= tetoInformado &&
      RE_FRAME_GASTO.test(semAcento(janelaAntes(texto, m.index ?? 0)));
    if (!informado && !gastoDaCasa) {
      violacoes.push({
        id: "valor_inventado",
        trecho: m[0],
        motivo: "Valor que o cliente não informou. Número em peça vira promessa comercial — e ele vai cobrar por ela.",
      });
    }
  }

  // 4. CNPJ/CPF gerado por modelo. Não existe motivo legítimo para um agente
  //    de marketing produzir documento: ou veio do cadastro, ou é ficção.
  for (const achado of texto.match(RE_DOCUMENTO) ?? []) {
    violacoes.push({
      id: "documento_inventado",
      trecho: achado,
      motivo: "CNPJ/CPF gerado pela IA. Documento em peça de cliente é sempre invenção — e é grave.",
    });
  }

  // 5. Rascunho vazado.
  const rascunhos = [...(texto.match(RE_PLACEHOLDER) ?? []), ...(texto.match(RE_PLACEHOLDER_CAIXA_ALTA) ?? [])];
  for (const achado of rascunhos) {
    violacoes.push({
      id: "placeholder",
      trecho: achado.trim(),
      motivo: "Marcador de rascunho na entrega. O cliente lendo isso desconfia de tudo que veio junto.",
    });
  }

  // 6. Promessa de resultado com número. O risco aqui é jurídico, não estético.
  for (const achado of texto.match(RE_PROMESSA) ?? []) {
    violacoes.push({
      id: "promessa_de_resultado",
      trecho: achado.trim().slice(0, 120),
      motivo: "Garantia de resultado numérico. Marketing não garante venda — prometer isso é publicidade enganosa.",
    });
  }

  // 7. AFIRMAÇÃO SOBRE A OPERAÇÃO DO CLIENTE conferida contra o snapshot:
  //    horário, área de entrega, pagamento, oferta, canal e prazo. É a metade
  //    que o cliente-revisor não tem como pegar — ele lê e aprova de boa-fé.
  violacoes.push(...conferirOperacao(texto, verdade));

  // Uma frase que erra duas vezes o mesmo fato reprova uma vez. Repetir o mesmo
  // parecer só faz o agente reescrever no escuro.
  const vistas = new Set<string>();
  const unicas = violacoes.filter((v) => {
    const chave = `${v.id}|${v.trecho}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });

  return { aprovado: unicas.length === 0, violacoes: unicas };
}

/** O parecer em uma linha, para o agente corrigir e para o painel mostrar. */
export function resumirViolacoes(violacoes: Violacao[]): string {
  if (violacoes.length === 0) return "";
  return violacoes.map((v) => `${v.motivo} (encontrado: "${v.trecho}")`).join(" ");
}
