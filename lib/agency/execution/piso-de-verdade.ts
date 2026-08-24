// piso-de-verdade.ts — O FREIO QUE NÃO DEPENDE DE IA.
//
// O P0 desta casa, em uma frase: das 32 checagens declaradas em
// `quality-gates.ts`, 25 não têm mecanismo — são texto descrevendo o que um
// humano deveria conferir. Com revisão humana isso era um checklist. Sem
// revisão humana é decoração. (Número de 06/08/2026, derivado do código por
// `__tests__/brain/o-numero-do-p0.test.ts`; antes a casa dizia "31 e 28", e o
// número estava errado nas duas direções — ver a vitrine da qualidade.)
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
  /** PREÇOS que o cliente informou — o que o negócio DELE cobra. Em reais.
   *  Só isto pode virar preço numa peça publicada. */
  valores: number[];
  /**
   * A VERBA que ele informou para pagar a agência / a mídia. Separada de
   * `valores` porque a lista única era cega: a verba de R$ 1.000 que o cliente
   * destinou a anúncios cabia como "valor informado" e virava
   * **"Pacote noiva por R$ 1.000,00"** numa peça de vitrine — um preço que ele
   * nunca cobrou de ninguém, impresso como oferta ao público dele.
   *
   * Verba só passa dentro da moldura de prestação de contas (verbo de gasto
   * realizado + termo de mídia). Ausente = comportamento antigo, em que
   * `valores` serve dos dois lados; só o caminho do servidor
   * (`buildVerdadeDoCliente`) separa hoje.
   */
  verbas?: number[];
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
  /**
   * O que o cliente PROIBIU — a metade negativa da verdade ancorada.
   *
   * Até 06/08/2026 isto não existia: a casa sabia o que o cliente É e não sabia
   * o que ele NÃO QUER. "Nunca use essa palavra", "não fale de preço", "não
   * cite concorrente" morriam no texto do pedido daquela vez.
   *
   * `undefined` = quem montou esta verdade não passa proibições (verdade montada
   * à mão em teste, ou caminho antigo). O piso não confere e diz por quê.
   * `{ lidas: false }` = **tentou ler e não conseguiu**, e aí o piso REPROVA.
   * A distinção é a diferença entre "não se aplica" e "a trava caiu".
   *
   * A gaveta e o extrator moram em `lib/agency/esteira/proibicoes.ts`; o tipo
   * mora aqui porque é o piso que decide o veredito.
   */
  proibicoes?: ProibicoesDoCliente;
}

/** Uma proibição declarada pelo cliente, pronta para ser conferida. */
export interface ProibicaoRegistrada {
  /** A frase DELE, para o motivo poder citar quem proibiu o quê. */
  frase: string;
  /** Os termos que não podem aparecer na peça. Já normalizados (minúsculo, sem
   *  acento). Lista vazia = proibição que nunca dispara, e por isso é descartada
   *  na leitura em vez de virar regra decorativa. */
  termos: string[];
  /**
   * A INSTRUÇÃO GÊMEA — o que usar NO LUGAR, nas palavras do cliente.
   *
   * ── Por que este campo existe (24/08/2026) ───────────────────────────────
   * Proibição sozinha engessa a marca. "Não use 'imperdível'" sem dizer o que
   * dizer no lugar deixa o produtor com duas saídas ruins: repetir a palavra
   * (e ser barrado) ou **cortar o assunto da peça** — e aí ele é reprovado por
   * obedecer. Esta casa já viu isso acontecer.
   *
   * `undefined` quando o cliente não disse. Nesse caso a instrução gêmea NÃO
   * some: ela é gerada em código por `instrucaoGemea`, com o texto padrão
   * "diga a mesma coisa de outro jeito, não corte o assunto".
   */
  substituto?: string;
  /** De onde veio (briefing, pedido, ajuste, marca, equipe). Regra de marca sem
   *  fonte não é auditável — e trava que não se explica é desligada. */
  origem?: string;
  /** Quando foi registrada, em ISO. Afirmação medida tem prazo de validade. */
  registradaEm?: string;
}

/**
 * A PROIBIÇÃO EM UMA LINHA, COM A INSTRUÇÃO GÊMEA JUNTO.
 *
 * Uma redação só, usada pelo contrato de marca (que vai a quem ESCREVE e a quem
 * JULGA) e pelo motivo da violação. Duas redações para a mesma regra seria a
 * segunda verdade — e é assim que o produtor obedece uma e é cobrado pela outra.
 */
export function instrucaoGemea(p: ProibicaoRegistrada): string {
  const fonte = [p.origem, p.registradaEm?.slice(0, 10)].filter(Boolean).join(", ");
  const selo = fonte ? ` (fonte: ${fonte})` : "";
  if (p.substituto?.trim()) {
    return `${p.frase} → em vez disso, use: ${p.substituto.trim()}${selo}`;
  }
  return (
    `${p.frase} → o cliente não disse o que usar no lugar: diga a MESMA coisa de outro `
    + `jeito. NÃO corte o assunto da peça por causa desta regra${selo}`
  );
}

export interface ProibicoesDoCliente {
  /** `false` significa que a LEITURA falhou — nunca "não há proibições". */
  lidas: boolean;
  itens: ProibicaoRegistrada[];
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
  /**
   * As JANELAS de funcionamento, "HH:MM-HH:MM". "Das 8h às 19h" atesta o
   * expediente inteiro, não só os dois extremos — exatamente como "de segunda a
   * sábado" atesta os seis dias.
   *
   * Opcional para não obrigar quem monta `VerdadeOperacional` à mão; ausente
   * significa "nenhuma janela conhecida", nunca "qualquer hora vale".
   */
  janelas?: string[];
  /** Dias atestados: seg…dom, "todos", "uteis", "fds", "feriado". */
  dias: string[];
  /** Cidades / bairros / regiões atendidos, normalizados (minúsculo, sem acento). */
  areas: string[];
  /**
   * Os lugares que o cliente disse EXPLICITAMENTE não atender.
   *
   * Não deixar de atestar já bastaria para a maioria dos casos, mas não para
   * este: "Não instalamos no litoral" e "Não entregamos em Osasco" são a palavra
   * mais dura que um cliente escreve num briefing, e o piso precisa reprovar a
   * peça que a inverte — não apenas "não confirmar". É o pior dano por
   * ocorrência da lista: afirmar cobertura onde ele disse que não vai.
   */
  areasNegadas?: string[];
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
  return { horarios: [], janelas: [], dias: [], areas: [], areasNegadas: [], pagamentos: [], canais: [], handles: [], ofertas: [], prazos: [] };
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

/**
 * O OBJETO do gasto. Sem isto, `RE_FRAME_GASTO` era colagem: bastava um verbo de
 * gasto aparecer ANTES do número na mesma linha para qualquer preço caber no
 * teto da verba. Medido no corpus da 6ª auditoria, e a regressão foi minha:
 *
 *   "Investimos R$ 1.999,00 no seu combo executivo por pessoa."  → PASSAVA
 *   "Investimos R$ 780,00 no seu pacote de beleza."              → PASSAVA
 *
 * As duas somam a mesma falha em duas camadas: `verdade.valores` é cego de
 * propósito (não distingue verba de preço), então a verba que o cliente informou
 * para PAGAR A AGÊNCIA virava preço de vitrine válido — um número que ele nunca
 * cobrou de ninguém, impresso como oferta ao público dele.
 *
 * A prestação de contas continua passando porque relatório de mídia SEMPRE
 * nomeia a mídia: "investimos R$ 1.200 em anúncios". Peça comercial não nomeia.
 */
const RE_TERMO_DE_MIDIA =
  /\b(anuncios?|campanhas?|impulsionament\w*|trafego|midia|ads|publicidade|veiculacao|patrocinad\w+|adsets?|criativos?)\b/;

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

/** A linha inteira em volta de uma posição — o antes e o DEPOIS. O objeto do
 *  gasto costuma vir depois do número ("investimos R$ 1.200 em anúncios"), e
 *  olhar só para trás foi exatamente o que deixou a colagem passar. */
function linhaEmVolta(texto: string, indice: number): string {
  const antes = janelaAntes(texto, indice, 120);
  const resto = texto.slice(indice, indice + 120);
  const fim = resto.search(/[\n•|]/);
  return antes + (fim >= 0 ? resto.slice(0, fim) : resto);
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
// O vocabulário do EXPEDIENTE, e ele não é só de comércio. Faltavam as palavras
// com que serviço agendado descreve o próprio funcionamento — *aulas, turmas,
// consultas, sessões, festas* — e "horário" só casava no singular
// (`\bhorario\b` não pega "horários"). Efeito medido: um estúdio de pilates que
// atende seg-sex podia anunciar "Aulas todos os dias, inclusive domingo" e o
// piso não olhava, porque a frase não tinha nenhuma palavra de comércio.
// Moldura estreita no conferidor não é rigor — é buraco.
const RE_FRAME_HORARIO =
  /\b(abert\w*|abrimos|abre|abrem|fechad\w*|fechamos|fecha|funcion\w*|atendemos|atendimento|horarios?|expediente|plantao|plantoes|servimos|aulas?|turmas?|consultas?|sessao|sessoes|festas?|agenda|agendamos|acesso|acessos|loja)\b/;

/**
 * O frame do horário LIDO NO BRIEFING. Além do vocabulário acima, a JANELA
 * sozinha basta: "das 8h às 18h" não tem outra leitura possível em português —
 * é expediente, com ou sem verbo.
 *
 * Sem isto, o cliente que escreve "Acesso das 7h às 22h" ou "Sábado das 9h às
 * 14h" — substantivo em vez de verbo, que é como briefing em bullet é escrito —
 * não tinha horário NENHUM registrado, e toda peça que citasse hora era barrada
 * como `horario_nao_informado`. Listar substantivos um a um não escala: a
 * moldura estreita vira buraco dos dois lados, e o lado do falso positivo é o
 * que treina o time a desligar o alarme.
 */
function fraseDeHorarioDoCliente(n: string, frase: string): boolean {
  return RE_FRAME_HORARIO.test(n) || janelasDeHora(frase).length > 0;
}

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

/**
 * As JANELAS de funcionamento de uma frase: "das 8h às 19h" → "08:00-19:00".
 *
 * Este é o MESMO defeito do intervalo de dias, no outro eixo, e ficou de pé uma
 * rodada inteira depois de o de dias ser consertado: a conferência comparava a
 * hora da peça contra o CONJUNTO DE EXTREMOS. Num cliente que abre 18h e fecha
 * 23h, "Abrimos às 20h" e "Atendimento até as 21h30" viravam
 * `horario_contradiz` — qualquer post que citasse hora DENTRO do expediente
 * morria. Falso positivo dessa frequência é o que treina o time a ignorar o
 * alarme, e alarme ignorado é o mesmo que alarme desligado.
 */
// O `(?:\d{2})?` é opcional de verdade. `\d{2}?` — que é o que eu tinha escrito —
// é "dois dígitos, lazy": EXIGE os minutos, e com ele "das 8h às 19h" não
// formava janela nenhuma. A correção silenciosamente não corrigia nada.
const H_BRUTA = String.raw`(?:\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*(?:horas?|hs|h)\s?(?:\d{2})?(?!\d)|meia[- ]noite|meio[- ]dia)`;
const RE_JANELA_DE_HORA = new RegExp(`(${H_BRUTA})\\s*(?:as|ate|ao|a|-|–|—)\\s*(${H_BRUTA})`, "g");

function janelasDeHora(frase: string): string[] {
  const n = semAcento(frase);
  const out: string[] = [];
  for (const m of n.matchAll(RE_JANELA_DE_HORA)) {
    const ini = tokensDeHora(m[1]!)[0];
    const fim = tokensDeHora(m[2]!)[0];
    // "24h" não é ponto no relógio — não delimita janela.
    if (!ini || !fim || ini === "24h" || fim === "24h") continue;
    out.push(`${ini}-${fim}`);
  }
  return out;
}

const emMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** A hora cabe em alguma janela atestada? A semana do relógio dá a volta: quem
 *  atende "das 18h às 2h" atesta a madrugada. */
function dentroDeAlgumaJanela(hora: string, janelas: string[] | undefined): boolean {
  if (hora === "24h" || !janelas || janelas.length === 0) return false;
  const t = emMinutos(hora);
  return janelas.some((j) => {
    const [a, b] = j.split("-");
    if (!a || !b) return false;
    const ini = emMinutos(a), fim = emMinutos(b);
    return ini <= fim ? t >= ini && t <= fim : t >= ini || t <= fim;
  });
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
// Além do verbo de ENTREGA, o vocabulário da PRESENÇA. `RE_FRAME_AREA` exigia
// verbo de entrega, então o anúncio de filial escapava inteiro: "Nova unidade em
// Diadema!" e "Agora também em Mauá" não eram nem olhados. Anunciar endereço que
// não existe manda o cliente do cliente para uma porta que não abre — é o mesmo
// dano do telefone inventado, com outra roupa.
const RE_FRAME_AREA =
  /\b(entreg\w+|delivery|atendemos|atendimento|levamos|cobrimos|raio|retirada|buscamos|coleta|coletamos|instalamos|instalacao|montamos|montagem|nova unidade|novas unidades|nova loja|nova filial|filial|filiais|unidades|inaugur\w+|chegamos|agora tambem|estamos tambem|abrimos em|cobertura)\b/;

/** A NEGAÇÃO explícita do cliente. Sem isto, "Não entregamos em Osasco" fazia
 *  Osasco virar área ATESTADA — o piso lia a palavra do cliente e registrava o
 *  contrário dela. É o pior dano por ocorrência da lista: a peça passava a poder
 *  afirmar entrega exatamente onde ele disse que não entrega.
 *
 *  O recorte é a frase (`frases()` já quebra por `.;•|` e quebra de linha).
 *  Dívida assumida e medida: "Não entregamos em Osasco, mas entregamos em
 *  Pinheiros" perde Pinheiros também, porque a vírgula não separa frase. O erro
 *  passa a ser na direção segura — deixa de atestar, nunca atesta ao contrário. */
const RE_NEGACAO_DE_AREA =
  /\b(nao|nunca|jamais)\s+(?:\w+\s+){0,2}?(entreg\w+|atend\w+|cobr\w+|lev\w+|faz\w+|instal\w+|mont\w+|buscamos|coletamos|vamos|temos)\b|\bexceto\b/;
// "fora de" e "menos em" saíram do padrão: são AMBÍGUOS de direção. No briefing,
// "não atendemos fora da capital" é negação; na PEÇA, "atendemos fora da
// capital" é afirmação de cobertura — e como o padrão casava os dois, a peça que
// invertia a palavra do cliente era tratada como se estivesse negando junto e
// escapava da conferência. A negação agora exige a palavra explícita.
/** O quantificador universal é o pior caso: "toda a cidade" nunca é confirmável
 *  por acaso, e é a frase que faz o cliente perder pedido em bairro que ele não
 *  atende. */
const RE_AREA_UNIVERSAL =
  /\btod[oa]s?\s+(?:a|o|os|as)\s+(cidade|capital|regiao|regioes|bairros?|estado|pais|litoral|interior|centro(?: \w+)?|zona \w+|grande \w+|regiao \w+)\b|\btodo o brasil\b|\bpara todo o brasil\b|\bqualquer (bairro|lugar|regiao|cidade|endereco)\b|\bem todo lugar\b/;

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
  const re =
    /\b(?:em|para|no|na|nos|nas|ate)\s+((?:(?:a|o|as|os)\s+|tod[oa]s?\s+(?:o|a|os|as)\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ][^.;!?\n]{1,80})/g;
  for (const m of frase.matchAll(re)) {
    const segmento = m[1]!.replace(/^(?:a|o|as|os)\s+/i, "");
    for (const cru of segmento.split(/\s+e\s+|,/)) {
      // "Santana e no Tucuruvi": o segundo item chega com a preposição colada.
      // E "entregamos em Vila Formosa": o segmento chega com o VERBO colado, e
      // era aí que o bairro real sumia — o laço de nome próprio abaixo morria na
      // primeira palavra minúscula e o bairro nunca era atestado. Depois,
      // "Entregamos em Vila Formosa" na peça virava `area_contradiz` contra o
      // próprio briefing do cliente. Irmã do bug da vírgula: mesmo defeito,
      // outra fronteira. Aqui o segmento é recortado a partir da ÚLTIMA
      // preposição que precede um nome próprio.
      let bruto = cru.trim().replace(/^(?:a|o|as|os|no|na|nos|nas|em|para)\s+/i, "");
      const interna = bruto.match(/^.*\b(?:em|para|no|na|nos|nas|ate)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ])/);
      if (interna) bruto = bruto.slice(interna[0].length);
      // "em todo o ABC", "para toda a Grande São Paulo": o quantificador
      // universal antecede o nome próprio. Se sobrar substantivo comum
      // ("toda a cidade"), o laço abaixo morre e quem julga é RE_AREA_UNIVERSAL.
      bruto = bruto.replace(/^tod[oa]s?\s+(?:o|a|os|as)\s+/i, "");
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

/**
 * Os lugares de uma frase com o filtro de nome próprio RELAXADO — aceita também
 * substantivo comum minúsculo depois da preposição.
 *
 * Só é usado nos DOIS lados da negação, e é por isso que pode ser relaxado sem
 * abrir buraco: o token só vira reprovação se o cliente tiver dito "não" sobre
 * exatamente ele. "Não instalamos no litoral" precisa disto — "litoral" nunca
 * seria capturado pelo filtro de nome próprio, e sem ele a peça "Instalamos no
 * litoral" passava batida.
 */
const PALAVRAS_SEM_LUGAR = new Set([
  "caso", "casos", "feriado", "feriados", "estoque", "falta", "hipotese", "nenhuma",
  "nenhum", "cima", "baixo", "frente", "todo", "toda", "todos", "todas", "casa",
]);

function lugaresRelaxados(frase: string, businessName: string): string[] {
  const out = new Set(lugaresAfirmados(frase, businessName));
  const nome = new Set(semAcento(businessName).split(" ").filter(Boolean));
  const n = semAcento(frase);
  // "a" e "ao" entram na lista de preposições: "não atendemos A DOMICÍLIO" é
  // negação de cobertura tanto quanto "não entregamos EM Osasco". Só é seguro
  // porque este relaxamento serve exclusivamente à negação — o token só vira
  // reprovação se o cliente tiver escrito "não" sobre exatamente ele.
  // `d[ao]s?` também: a negação de recorte vem com "de" ("não atendemos FORA DA
  // capital", "não entregamos ALÉM DO centro"), e sem ela o lugar negado não era
  // capturado nem no briefing nem na peça — a negação era detectada e vinha
  // vazia, que é o pior dos mundos: parece protegido e não está.
  for (const m of n.matchAll(/\b(?:em|para|no|na|nos|nas|ao?|d[ao]s?)\s+(?:o\s+|a\s+)?([a-z]{4,}(?:\s+(?:de\s+|do\s+|da\s+)?[a-z]{4,})?)/g)) {
    const t = m[1]!.trim();
    const cabeca = t.split(" ")[0]!;
    if (PALAVRAS_SEM_LUGAR.has(cabeca) || NAO_E_LUGAR.has(cabeca)) continue;
    if (t.split(" ").every((p) => nome.has(p))) continue;
    out.add(t);
    if (t !== cabeca) out.add(cabeca);
  }
  return [...out];
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
// O sufixo é GULOSO — `(?:\.[a-z]{2,3})*` e não `(?:\.br)?`. Com o sufixo fixo,
// "doceencanto.com.br.br" era lido como o domínio atestado "doceencanto.com.br"
// com a sobra ignorada: o piso via o endereço certo dentro de um endereço errado
// e aprovava. Capturando o domínio inteiro, o malformado deixa de casar com o
// atestado e é reprovado. O `*` não engole ponto final de frase, que não tem
// letra depois.
const RE_DOMINIO =
  /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,}\.(?:com|net|org|io|app|shop|store|me|co|dev|blog)(?:\.[a-z]{2,3})*)\b/gi;

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
// `pront\w+` no lugar de `pronto|prontinho`. A auditoria mediu o efeito e ele é
// grotesco: **concordância de gênero derrubava a checagem inteira.** "Sua
// matrícula fica PRONTA em 2 horas" passava; "fica PRONTO" barrava. O modelo não
// escolhe o gênero da frase — quem escolhe é o substantivo do cliente —, então
// metade dos negócios do país ficava sem trava por acidente de morfologia.
// `cheg\w+` e não `chega`: "Chegamos em 10 minutos" não casava `\bchega\b`, e o
// briefing do cliente dizia 30 minutos. Mais uma trava perdida por flexão.
const RE_FRAME_PRAZO =
  /\b(entregamos|entregas|entrega|entregue|pront\w+|respondemos|resposta|retorno|prazo|cheg\w+|receba|enviamos|envio|liberad\w+|agendad\w+)\b/;

/**
 * O mesmo frame, LIDO NO BRIEFING — e mais generoso, pelo mesmo motivo já
 * assumido no pagamento: o cliente escreve em bullet, sem verbo conjugado
 * ("Banner sai em 24 horas", "Orçamento fechado em 3 dias", "Análise de crédito
 * em 2 dias"). Sem isto, o prazo REAL dele não era registrado e a peça que
 * apenas o repetia era barrada como invenção — o piso reprovando a peça por
 * dizer exatamente o que o cliente escreveu.
 *
 * Ler o cliente com generosidade e a peça com rigor é o único desequilíbrio
 * seguro; o inverso é a mordaça.
 */
/**
 * O frame do prazo LIDO NO BRIEFING. Aqui a **preposição** é a marca, não o
 * verbo: em português, "em 2 horas", "em 15 dias", "dentro de 3 dias" só
 * significam prazo.
 *
 * Tentei antes listar os substantivos do entregável (encomenda, medição,
 * instalação…) e o holdout mostrou o que era óbvio: essa lista é infinita.
 * "Pedido separado em 2 horas", "Carteira de vacinação emitida em 1 dia",
 * "Fotos tratadas entregues em 15 dias" — cada vertical traz um substantivo
 * novo, e cada um que falta vira o piso barrando a peça por repetir o prazo que
 * o próprio cliente escreveu. Moldura estreita é buraco também deste lado.
 *
 * DÍVIDA MEDIDA E ACEITA: o texto do cliente inclui o escopo da agência
 * achatado, então "12 posts em 30 dias" passa a atestar o prazo "30 dia" —
 * a peça poderia prometer 30 dias sem o cliente ter dito. É prazo INTERNO
 * virando prazo do cliente. Escolhi este erro em vez do inverso: o outro
 * barrava peça legítima em 3 de 4 verticais do holdout.
 */
const RE_PREPOSICAO_DE_PRAZO = /\b(?:em|ate|dentro de|apos|no prazo de|com)\s*$/;

function fraseDePrazoDoCliente(n: string): boolean {
  if (RE_FRAME_PRAZO.test(n)) return true;
  for (const m of n.matchAll(RE_QUANTIDADE_DE_TEMPO)) {
    if (RE_PREPOSICAO_DE_PRAZO.test(n.slice(0, m.index ?? 0))) return true;
  }
  return RE_PRAZO_IMEDIATO.test(n);
}

const RE_QUANTIDADE_DE_TEMPO = /\b(\d{1,3})\s*(minutos?|horas?|dias?|semanas?|mes(?:es)?)\b/g;
/** Prazo sem número. "Entrega no mesmo dia" é promessa tão concreta quanto
 *  "em 24 horas" — e não tinha token nenhum, logo não era conferida. */
// "na hora" e "em minutos" ficaram de fora: casam "na hora do almoço" e
// "em minutos de conversa" — falso positivo comprado sem necessidade.
const RE_PRAZO_IMEDIATO = /\b(no mesmo dia|na mesma hora|imediatamente|em instantes|em tempo real)\b/;

function tokensDePrazo(frase: string): string[] {
  const n = semAcento(frase);
  const out = new Set<string>();
  for (const m of n.matchAll(RE_QUANTIDADE_DE_TEMPO)) {
    const unidade = m[2]!.replace(/s$/, "").replace(/^mese$/, "mes");
    out.add(`${Number(m[1])} ${unidade}`);
  }
  if (RE_PRAZO_IMEDIATO.test(n)) out.add("imediato");
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

  const horarios = new Set<string>(), janelas = new Set<string>(), dias = new Set<string>();
  const areas = new Set<string>(), negadas = new Set<string>();
  const pagamentos = new Set<string>(), canais = new Set<string>(), prazos = new Set<string>();

  for (const frase of frases(textoDoCliente)) {
    const n = semAcento(frase);
    if (fraseDeHorarioDoCliente(n, frase)) {
      for (const t of tokensDeHora(frase)) horarios.add(t);
      for (const t of janelasDeHora(frase)) janelas.add(t);
      for (const t of tokensDeDia(frase)) dias.add(t);
    }
    // A frase em que o cliente NEGA cobertura não atesta nada. Ler "Não
    // entregamos em Osasco" e registrar Osasco como área atendida inverte a
    // palavra explícita dele.
    // A NEGAÇÃO é registrada SEM exigir frame de área. O frame existe para não
    // transformar qualquer frase em alegação de cobertura; aqui não há esse
    // risco, porque o cliente escreveu "não" com todas as letras. Sem isto,
    // "Socorro na estrada: não fazemos em rodovia" não registrava nada — o verbo
    // era "fazemos", que não é (e não deve ser) frame de área.
    const negacao = n.match(RE_NEGACAO_DE_AREA);
    if (negacao) {
      // O alcance da negação PARA no conectivo adversativo. Sem este corte,
      // "Não entregamos em Osasco, mas entregamos em Pinheiros e no Butantã"
      // registrava Pinheiros e Butantã como NEGADOS — o piso não apenas perdia
      // os bairros reais, ele inventava uma proibição que o cliente nunca
      // escreveu, e depois reprovava a peça legítima citando "o cliente disse
      // que não atende Pinheiros". Errar contra a palavra do cliente na direção
      // oposta não é o lado seguro: é a mesma mentira com o sinal trocado.
      const inicio = negacao.index ?? 0;
      const resto = frase.slice(inicio);
      const adversativo = semAcento(resto).search(/\b(mas|porem|contudo|entretanto|todavia|so que)\b/);
      const trechoNegado = adversativo >= 0 ? resto.slice(0, adversativo) : resto;
      const trechoAfirmado = frase.slice(0, inicio) + (adversativo >= 0 ? resto.slice(adversativo) : "");
      for (const l of lugaresRelaxados(trechoNegado, businessName)) negadas.add(l);
      if (RE_FRAME_AREA.test(semAcento(trechoAfirmado))) {
        for (const l of lugaresAfirmados(trechoAfirmado, businessName)) areas.add(l);
      }
    } else if (RE_FRAME_AREA.test(n)) {
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
    if (fraseDePrazoDoCliente(n)) for (const t of tokensDePrazo(frase)) prazos.add(t);
  }

  op.horarios = [...horarios];
  op.janelas = [...janelas];
  op.dias = [...dias];
  op.areas = [...areas];
  op.areasNegadas = [...negadas];
  op.pagamentos = [...pagamentos];
  op.canais = [...canais];
  op.prazos = [...prazos];
  op.handles = tokensDeEndereco(textoDoCliente);
  op.ofertas = [...new Set(palavrasDeConteudo(textoDoCliente))];
  return op;
}

// ── Verba não é preço ────────────────────────────────────────────────────────

/**
 * A moldura que marca um número como VERBA — o que o cliente paga à agência /
 * à mídia — e não como preço do negócio dele.
 *
 * Confundir os dois foi a regressão mais cara desta rodada: numa lista única,
 * "verba de mídia R$ 1.000" autorizava a peça a anunciar
 * **"Pacote noiva por R$ 1.000,00"** — um preço que ele nunca cobrou de
 * ninguém, impresso como oferta ao público dele.
 */
const RE_MOLDURA_DE_VERBA =
  /\b(verba|budget|orcamento de midia|investimento mensal|investimento em (?:midia|anuncios|trafego)|midia|trafego|anuncios?|campanhas?|impulsionamento|mensalidade da agencia|honorarios?)\b/;

/** As chaves de briefing que são verba POR DEFINIÇÃO: quem as preenche é o SDR
 *  registrando quanto o cliente tem para gastar, nunca o preço dele. */
const CHAVES_DE_VERBA = ["monthlyBudget", "adsBudget", "budget", "budgetRange"];
const CHAVES_DE_PRECO = ["valor", "price"];

/**
 * Separa o que o cliente informou em PREÇO (o que ele cobra; pode virar preço
 * numa peça) e VERBA (o que ele paga; só passa dentro da moldura de prestação
 * de contas).
 *
 * Na dúvida — número em prosa sem moldura de verba — é PREÇO. É o uso legítimo
 * mais comum em peça de comércio, e o custo do engano nessa direção é reprovar
 * uma prestação de contas, não publicar preço inventado.
 */
export function separarValoresInformados(
  briefing: Record<string, unknown>,
  textoDoCliente = "",
): { precos: number[]; verbas: number[] } {
  const precos = new Set<number>();
  const verbas = new Set<number>();
  const push = (destino: Set<number>, n: number) => {
    if (Number.isFinite(n) && n > 0) destino.add(n);
  };
  const numeros = (destino: Set<number>, v: string) => {
    for (const m of v.matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)/g)) {
      push(destino, Number(m[1]!.replace(/\./g, "").replace(",", ".")));
    }
  };
  for (const chave of CHAVES_DE_VERBA) {
    const v = briefing[chave];
    if (typeof v === "number") push(verbas, v);
    if (typeof v === "string") numeros(verbas, v);
  }
  for (const chave of CHAVES_DE_PRECO) {
    const v = briefing[chave];
    if (typeof v === "number") push(precos, v);
    if (typeof v === "string") numeros(precos, v);
  }
  // Preço escrito em prosa. Exige o "R$" grudado no número: sem ele, "atendemos
  // 30 clientes por dia" viraria "R$ 30 informado" e o piso passaria a aceitar
  // qualquer preço de dois dígitos.
  //
  // A janela de moldura é CURTA (40 caracteres) e cortada no fim da oração
  // anterior. Linha inteira não serve: briefing real vem em prosa corrida, e
  // "Verba de mídia R$ 900. Mensalidade a partir de R$ 320,00" traz os dois na
  // mesma linha — com janela larga o preço do cliente seria engolido pela
  // moldura da verba e ele ficaria proibido de anunciar o próprio preço.
  const n = semAcento(textoDoCliente);
  for (const m of n.matchAll(/r\$\s?([\d.]+(?:,\d{2})?)/g)) {
    const i = m.index ?? 0;
    let antes = n.slice(Math.max(0, i - 40), i);
    const corte = antes.search(/[.:\n\r•|;]\s*[^.:\n\r•|;]*$/);
    if (corte >= 0) antes = antes.slice(corte + 1);
    numeros(RE_MOLDURA_DE_VERBA.test(antes) ? verbas : precos, m[1]!);
  }
  return { precos: [...precos], verbas: [...verbas] };
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
  // O sufixo SÓ vale em fronteira de ponto — subdomínio legítimo
  // (`loja.pontocerto.com.br`) continua atestado, e a colagem morre. Com o
  // `endsWith` cru, **"graficapontocerto.com.br" era aceito por
  // "pontocerto.com.br"**: bastava prefixar qualquer coisa no domínio do cliente
  // para inventar um endereço aprovado. Era o buraco mais fácil de explorar do
  // módulo inteiro, e não exigia má-fé — o modelo prefixa o nome do negócio
  // sozinho o tempo todo.
  const atestado = (e: string) =>
    op.handles.some((h) => h === e || h.endsWith(`.${e}`) || e.endsWith(`.${h}`));

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
            // Ponto exato atestado OU ponto DENTRO de uma janela atestada. A
            // segunda metade faltava, e era o falso positivo mais frequente do
            // piso inteiro (7 dos 10 medidos no corpus de 8 verticais novos).
            // "24h" atestado = sempre aberto: nenhuma hora contradiz. Sem isto,
            // um chaveiro 24 horas era reprovado por dizer "atendemos às 14h".
            if (op.horarios.includes("24h")) continue;
            if (!op.horarios.includes(h) && !dentroDeAlgumaJanela(h, op.janelas)) {
              v.push({
                id: "horario_contradiz",
                trecho: corta(frase),
                motivo: `Horário "${h}" está fora do expediente que o cliente informou (${(op.janelas?.length ? op.janelas : op.horarios).join(", ") || "nenhum horário"}). Cliente na porta fechada é dano direto ao negócio dele.`,
              });
            }
          }
          // "todos os dias" é coberto quando o cliente atesta a semana inteira,
          // mesmo que ele a tenha escrito como intervalo ("de segunda a
          // domingo"). Sem isto, o cliente que abre os 7 dias não podia dizer
          // que abre os 7 dias — a assimetria de novo, agora no quantificador.
          const semanaInteira = SEMANA.every((d) => op.dias.includes(d));
          for (const d of diasDitos) {
            const cobre =
              op.dias.includes(d) ||
              (op.dias.includes("todos") && d !== "todos") ||
              (semanaInteira && (d === "todos" || d === "uteis" || d === "fds"));
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
    // A NEGAÇÃO do cliente é conferida FORA do frame de área e não admite
    // atenuante: afirmar cobertura onde ele escreveu "não" inverte a palavra
    // explícita dele — o pior dano por ocorrência deste módulo. Frase que também
    // nega ("não instalamos no litoral", numa peça honesta) não é afirmação e
    // não entra aqui.
    const negadas = op.areasNegadas ?? [];
    if (negadas.length > 0 && !RE_NEGACAO_DE_AREA.test(n)) {
      for (const l of lugaresRelaxados(frase, verdade.businessName)) {
        if (!negadas.includes(l)) continue;
        v.push({
          id: "area_negada_pelo_cliente",
          trecho: corta(frase),
          motivo: `O cliente disse EXPRESSAMENTE que não atende "${l}". A peça afirma o contrário — é a palavra dele invertida numa publicação em nome dele.`,
        });
      }
    }

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
      // TODAS as palavras de conteúdo precisam estar no vocabulário do cliente,
      // não uma delas. Com `some`, "Também fazemos exame de audiometria" passava
      // numa ótica só porque ela faz "exame de vista": uma palavra em comum
      // liberava o serviço inteiro. O núcleo da extensão é justamente a palavra
      // que o cliente NUNCA disse — é ela que precisa ancorar.
      const atestado = palavras.every((p) => op.ofertas.some((o) => o === p || o.startsWith(p) || p.startsWith(o)));
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
    // 6. PRAZO. O prazo IMEDIATO dispensa frame: "no mesmo dia" já é, sozinho,
    //    promessa de prazo — não existe leitura em que não seja.
    if (RE_FRAME_PRAZO.test(n) || RE_PRAZO_IMEDIATO.test(n)) {
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
  // O teto do GASTO abrange preço e verba; o que pode virar PREÇO na peça é só
  // `valores`. A distinção é o que impede a verba de virar oferta.
  const paraTeto = [...verdade.valores, ...(verdade.verbas ?? [])];
  const tetoInformado = paraTeto.length > 0 ? Math.max(...paraTeto) : undefined;
  for (const m of texto.matchAll(RE_VALOR)) {
    const n = paraNumero(m[1]!);
    if (!Number.isFinite(n)) continue;
    const informado = verdade.valores.some((v) => Math.abs(v - n) < 0.01);
    // O RELATÓRIO MENSAL: "Investimos R$ 1.200 em anúncios" é gasto MEDIDO pela
    // própria casa, não promessa feita ao cliente — e barrá-lo tornava
    // impossível prestar contas do que se gastou. A relaxação é estreita de
    // propósito: exige verbo de gasto REALIZADO antes do número, TERMO DE MÍDIA
    // na mesma linha, e que o número caiba dentro da maior verba informada.
    // Nunca se promete mais do que ele autorizou, e sem verba informada nada
    // disso vale — segue fail-closed. O que ela NÃO faz é conferir se o gasto
    // foi mesmo esse: isso é medição, não ancoragem.
    const linha = semAcento(linhaEmVolta(texto, m.index ?? 0));
    const gastoDaCasa =
      !informado &&
      tetoInformado !== undefined &&
      n <= tetoInformado &&
      RE_FRAME_GASTO.test(semAcento(janelaAntes(texto, m.index ?? 0))) &&
      RE_TERMO_DE_MIDIA.test(linha);
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

  // 8. O QUE O CLIENTE PROIBIU. Última checagem e a mais direta: ele já avisou.
  violacoes.push(...conferirProibicoes(texto, verdade.proibicoes));

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

// ─── O que o cliente PROIBIU ────────────────────────────────────────────────
//
// Por que isto é CÓDIGO e não uma linha no prompt: a regra da casa é trava, não
// aviso. "Evite falar de preço" dentro de um prompt é uma sugestão entre outras
// vinte; o modelo cumpre na maioria das vezes, e a vez em que não cumpre é
// justamente a que chega ao cliente que já tinha avisado.
//
// A comparação é por FRONTEIRA DE PALAVRA e sem acento: "imperdível" e
// "imperdivel" são a mesma proibição para quem digitou no celular, e um termo
// que casasse no meio de outra palavra ("caro" dentro de "carrossel") barraria
// peça legítima o tempo todo — freio que reprova tudo é desligado na primeira
// semana.

function conferirProibicoes(texto: string, proibicoes: ProibicoesDoCliente | undefined): Violacao[] {
  // `undefined` = quem montou a verdade não passa proibições. Não é falha e não
  // é permissão: é uma checagem que não se aplica àquele caminho.
  if (!proibicoes) return [];

  // FAIL-CLOSED. A leitura tentou e não conseguiu; a peça NÃO sai como aprovada.
  // O oposto — "não consegui ler, então libera" — é o defeito que este módulo
  // inteiro existe para não repetir.
  if (!proibicoes.lidas) {
    return [{
      id: "proibicoes_nao_conferidas",
      trecho: "",
      motivo: "Não consegui ler o que este cliente proibiu, então não tenho como garantir que a peça respeita as restrições dele. Peça não conferida não vai como aprovada.",
    }];
  }

  const alvo = semAcento(texto);
  const violacoes: Violacao[] = [];
  for (const p of proibicoes.itens) {
    for (const termo of p.termos) {
      const t = semAcento(termo);
      if (t.length < 3) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(t)}(?![\\p{L}\\p{N}])`, "u");
      if (re.test(alvo)) {
        violacoes.push({
          id: "proibicao_do_cliente",
          trecho: termo,
          // A INSTRUÇÃO GÊMEA VAI JUNTO DO "NÃO", sempre. O motivo é lido por
          // quem REFAZ a peça: dizer só "isto é proibido" faz o produtor cortar
          // o assunto e ser reprovado do outro lado. `instrucaoGemea` é a mesma
          // redação que o contrato de marca usa — uma regra, um texto.
          motivo:
            `O cliente PROIBIU isto: ${instrucaoGemea(p)}. `
            + "Peça que viola uma proibição registrada é pior que peça sem graça — ele já tinha avisado.",
        });
      }
    }
  }
  return violacoes;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** O parecer em uma linha, para o agente corrigir e para o painel mostrar. */
export function resumirViolacoes(violacoes: Violacao[]): string {
  if (violacoes.length === 0) return "";
  return violacoes.map((v) => `${v.motivo} (encontrado: "${v.trecho}")`).join(" ");
}

// ─── A VERDADE, EM LINGUAGEM DE PROMPT ──────────────────────────────────────
//
// ── Por que mora aqui, e não no motor (24/08/2026) ──────────────────────────
// Quem confere é este módulo; quem produz precisa ler EXATAMENTE a mesma
// verdade, ou a régua cobra um fato que o prompt nunca entregou. Foi o que o
// piloto mediu: "Pesquisa de concorrência" barrada em `area_nao_informada`
// porque `ctxBlock` não mandava nada de operação ao especialista.
//
// Traduzir aqui garante que a lista do prompt e a lista da conferência saiam da
// MESMA estrutura. Se um campo novo entrar em `VerdadeOperacional` e ninguém o
// traduzir, ele fica de fora das duas — nunca de uma só.

/** O nome de cada classe de fato na língua de quem escreve a peça. */
const NOME_DA_CLASSE: Record<ClasseDeFato, string> = {
  horario: "horário e dias de funcionamento",
  area_de_atendimento: "área de atendimento, bairro, cidade ou raio de entrega",
  pagamento: "formas de pagamento e parcelamento",
  oferta: "promoção, desconto ou condição especial",
  canal: "canais de contato (telefone, WhatsApp, site, redes)",
  prazo: "prazo de entrega ou de execução",
};

/** As classes que o cliente não informou, com o nome legível. */
export function classesSemInformacaoLegiveis(op: VerdadeOperacional): string[] {
  return classesSemInformacao(op).map((c) => NOME_DA_CLASSE[c]);
}

/**
 * Os fatos ATESTADOS, em linhas prontas para o prompt.
 *
 * Só entra o que tem conteúdo: uma linha "Formas de pagamento: (nada)" seria
 * ruído no melhor caso e convite à invenção no pior.
 */
export function verdadeEmLinhas(op: VerdadeOperacional): string[] {
  const linhas: string[] = [];
  const juntar = (rotulo: string, valores: readonly string[] | undefined): void => {
    const v = (valores ?? []).filter((x) => x.trim());
    if (v.length > 0) linhas.push(`${rotulo}: ${v.join(", ")}`);
  };

  juntar("Horários atestados", op.horarios);
  juntar("Janelas de funcionamento", op.janelas);
  juntar("Dias atestados", op.dias);
  juntar("Áreas atendidas", op.areas);
  if ((op.areasNegadas ?? []).length > 0) {
    // A negação vem com o aviso junto: é o pior dano por ocorrência do módulo,
    // e o produtor precisa ler a consequência na mesma linha do fato.
    linhas.push(
      `Áreas que o cliente disse EXPRESSAMENTE que NÃO atende: ${op.areasNegadas!.join(", ")} `
      + "— afirmar cobertura em qualquer uma delas inverte a palavra dele e reprova a peça.",
    );
  }
  if (op.raioEntregaKm !== undefined) linhas.push(`Raio de entrega atestado: ${op.raioEntregaKm} km`);
  juntar("Formas de pagamento", op.pagamentos);
  if (op.parcelasMax !== undefined) linhas.push(`Parcelamento máximo atestado: ${op.parcelasMax}x`);
  juntar("Canais de contato", op.canais);
  juntar("Perfis e domínios", op.handles);
  juntar("Ofertas atestadas", op.ofertas);
  juntar("Prazos atestados", op.prazos);
  return linhas;
}
