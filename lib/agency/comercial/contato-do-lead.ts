// COMO SE FALA COM QUEM PEDIU — a única função desta casa que responde isso.
//
// A cicatriz, medida em produção em 08/08/2026: TRÊS interessados entraram pelo
// briefing público — Sushi Cazza (51 dias), Camila Pereira (29) e Beatriz
// Gimenes (28) — cada um com a conversa inteira gravada, ticket, público-alvo e
// paleta, e **nenhum com um telefone, um e-mail ou um nome de quem falou**.
// Briefing melhor que o de cliente pagante, e nenhum lugar para onde ligar.
//
// Duas coisas produziram isso, e as duas moram aqui:
//
//   1. O contato NÃO TINHA COLUNA. Ele morava dentro de `briefingJson`, um blob
//      de texto, em pelo menos dois formatos diferentes conforme a época. Cada
//      leitor reinventava o próprio `?.scope?.prospectEmail`, e o que não tem
//      leitor único não tem alarme, não tem filtro e não tem gate. Esta função
//      é o leitor único.
//
//      ✅ 16/08/2026 — A COLUNA EXISTE (`contatoNome`, `contatoEmail`,
//      `contatoWhatsapp`, `contatoEm`). Ela é a PRIMEIRA origem desta função, e
//      o `briefingJson` continua sendo lido como segunda: os registros antigos
//      não foram reescritos e não podem regredir. Quem escreve a coluna é o
//      serviço de persistência, a partir DESTA função — a coluna é projeção do
//      leitor único, nunca uma segunda verdade digitada em paralelo.
//
//      ⚠️ O valor da coluna é VALIDADO aqui do mesmo jeito que o do blob. Coluna
//      não é atestado de qualidade: um backfill, um seed ou um `UPDATE` à mão
//      podem pôr lixo lá, e um telefone de 4 dígitos vindo do banco faria
//      `temComoFalar` mentir com cara de dado estruturado. Valor de coluna que
//      não passa na validação é IGNORADO e a leitura cai para o blob.
//
//   2. NINGUÉM PERGUNTOU. A conversa do SDR foi desenhada para NÃO pedir e-mail
//      nem telefone (ver `__tests__/briefing/identity-capture.test.ts`), na
//      premissa de que o login do Google os traria depois. Quem não chega ao
//      login não deixa nada — e é a maioria.
//
// ⚠️ A LEI QUE MANDA NESTE ARQUIVO: **ausência de informação não é informação.**
// Contato é o que a pessoa DECLAROU como forma de falar com ela. Não se deduz de
// transcrição, de arroba de Instagram nem de número solto no meio de uma frase.
// O Sushi Cazza tem `@sushicazzaoficial` escrito no `rawContext` — é um caminho
// real, e por isso ele aparece como **PISTA** (`pistasDeContato`), num campo com
// outro nome, que **nunca** faz `temComoFalar` virar `true`. Quem aborda é o CEO.

/** Um canal declarado pela pessoa. Nada aqui é inferido de texto corrido. */
export type CanalDeContato = { tipo: "email" | "whatsapp"; valor: string };

export type ContatoDoLead = {
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Os canais realmente utilizáveis, na ordem em que a casa prefere usá-los. */
  canais: CanalDeContato[];
  /**
   * A única pergunta que importa: **dá para falar com esta pessoa?**
   * `true` exige pelo menos UM canal válido. Nome sozinho não é contato — nome
   * sozinho é como se chamava o desperdício.
   */
  temComoFalar: boolean;
  /** Preenchido só quando `temComoFalar` é falso. Vai para a fila e para a tela. */
  motivo: string | null;
};

/** Uma pista encontrada no texto da conversa. **NÃO é contato.** */
export type PistaDeContato = {
  tipo: "instagram" | "telefone" | "email" | "site";
  valor: string;
};

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailValido(v: unknown): v is string {
  return typeof v === "string" && RE_EMAIL.test(v.trim());
}

/**
 * Um número com o qual dá para abrir uma conversa no WhatsApp.
 *
 * O piso é 10 dígitos: DDD + 8 é o telefone fixo brasileiro mais curto, e
 * DDD + 9 é o celular. O teto é 13 (55 + DDD + 9). Aceitar 8 dígitos deixaria
 * "2 posts por dia" e "R$ 1.500,00" — números que aparecem em TODO briefing —
 * virarem telefone, e um telefone inventado é pior que nenhum: ele desliga o
 * alarme sem dar para onde ligar.
 */
export function whatsappValido(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
}

/** Só dígitos, sem o `+`. Formatação é assunto de tela, não de dado. */
export function normalizarWhatsapp(v: string): string {
  return v.replace(/\D/g, "");
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function objeto(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch { /* blob ilegível é ausência de informação, não contato vazio */ }
  }
  return null;
}

/**
 * A primeira origem que passa na validação, normalizada.
 *
 * Existe para que "a coluna vem antes" não vire "a coluna manda mesmo quando
 * está errada". Origem inválida é PULADA, não fatal — é a diferença entre
 * preferir uma fonte e confiar nela cegamente.
 */
function primeiroValido(
  candidatos: Array<string | null>,
  valido: (v: unknown) => boolean,
  normalizar: (v: string) => string,
): string | null {
  for (const c of candidatos) {
    if (c && valido(c)) return normalizar(c);
  }
  return null;
}

export const MOTIVO_SEM_CONTATO =
  "o briefing foi enviado sem nome de contato e sem canal (WhatsApp ou e-mail)";

/**
 * O que uma solicitação carrega de contato — a COLUNA (16/08/2026) e o blob
 * antigo, no mesmo objeto. Toda origem é opcional: um registro de 08/08 chega
 * aqui só com `briefingJson`, e um de hoje chega com os dois.
 */
export type EntradaDeContato = {
  contatoNome?: unknown;
  contatoEmail?: unknown;
  contatoWhatsapp?: unknown;
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
};

/**
 * Lê o contato de uma solicitação, venha ela de qual época vier.
 *
 * TRÊS origens, nesta ordem de precedência:
 *   0. as COLUNAS `contato*` — o formato de hoje, filtrável e indexável;
 *   1. `briefingJson.contato` — o formato canônico, escrito pelo gate de 08/08;
 *   2. `briefingJson.scope.prospect*` — o formato legado (as três de produção).
 *
 * A ordem tem consequência e ela é deliberada: **a coluna vence**, porque é ela
 * que o banco filtra. Se a coluna e o blob discordassem, uma consulta acharia um
 * conjunto e a tela mostraria outro — que é o defeito das duas verdades
 * adjacentes. Como quem escreve a coluna é o serviço de persistência a partir
 * desta mesma função, discordar exigiria alguém escrever no banco por fora.
 *
 * ⚠️ Cada origem passa pela MESMA validação. Coluna com lixo é ignorada, e a
 * leitura cai para a origem seguinte — nunca vira `temComoFalar: true`.
 *
 * `rawContext` **não é lido aqui, de propósito.** Ver o cabeçalho do arquivo.
 */
export function lerContato(entrada: EntradaDeContato | null | undefined): ContatoDoLead {
  const briefing = objeto(entrada?.briefingJson);
  const canonico = objeto(briefing?.contato);
  const escopo   = objeto(briefing?.scope);
  const handoff  = objeto(entrada?.sdrHandoffJson);

  const nome =
    texto(entrada?.contatoNome) ??
    texto(canonico?.nome) ??
    texto(escopo?.prospectName) ??
    texto(handoff?.prospectName);

  // A coluna entra na fila de candidatos como mais uma origem — não como uma
  // resposta pronta. `primeiroValido` corre as origens NA ORDEM e devolve a
  // primeira que passa na validação: coluna com lixo não derruba o registro
  // para "sem contato" quando o blob antigo tem o dado bom.
  const email = primeiroValido(
    [texto(entrada?.contatoEmail), texto(canonico?.email), texto(escopo?.prospectEmail), texto(handoff?.prospectEmail)],
    emailValido,
    (v) => v.trim(),
  );

  const whatsapp = primeiroValido(
    [texto(entrada?.contatoWhatsapp), texto(canonico?.whatsapp), texto(escopo?.prospectPhone), texto(handoff?.prospectPhone)],
    whatsappValido,
    normalizarWhatsapp,
  );

  // WhatsApp na frente: é por onde o cliente brasileiro responde. E-mail de
  // login do Google chega em caixa que ninguém lê.
  const canais: CanalDeContato[] = [];
  if (whatsapp) canais.push({ tipo: "whatsapp", valor: whatsapp });
  if (email)    canais.push({ tipo: "email",    valor: email });

  return {
    nome,
    email,
    whatsapp,
    canais,
    temComoFalar: canais.length > 0,
    motivo: canais.length > 0 ? null : MOTIVO_SEM_CONTATO,
  };
}

const RE_ARROBA = /(?:^|[\s(])@([A-Za-z0-9._]{3,30})\b/g;
const RE_INSTAGRAM_URL = /instagram\.com\/([A-Za-z0-9._]{3,30})/gi;
const RE_TELEFONE = /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g;
const RE_EMAIL_SOLTO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * O que o texto da conversa SUGERE como caminho de contato — e que esta casa
 * **não** promove a contato.
 *
 * Existe por um motivo específico e declarado pelo CEO: o Sushi Cazza escreveu
 * `@sushicazzaoficial` no briefing. É um caminho real de abordagem, e escondê-lo
 * seria jogar fora a única ponta de 51 dias de espera. Mas quem decide se aborda,
 * e por onde, é gente — não a máquina. Por isso: campo separado, nome separado,
 * e nenhum efeito sobre `temComoFalar`.
 */
export function pistasDeContato(rawContext: string | null | undefined): PistaDeContato[] {
  if (!rawContext) return [];
  const vistos = new Set<string>();
  const out: PistaDeContato[] = [];

  const push = (tipo: PistaDeContato["tipo"], valor: string) => {
    const chave = `${tipo}:${valor.toLowerCase()}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    out.push({ tipo, valor });
  };

  for (const m of rawContext.matchAll(RE_INSTAGRAM_URL)) push("instagram", `@${m[1]}`);
  for (const m of rawContext.matchAll(RE_ARROBA)) push("instagram", `@${m[1]}`);
  for (const m of rawContext.matchAll(RE_EMAIL_SOLTO)) push("email", m[0]);
  for (const m of rawContext.matchAll(RE_TELEFONE)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 13) push("telefone", m[0].trim());
  }

  // Teto: pista é ponta de investigação para uma pessoa ler, não um dump. Uma
  // lista de 40 números extraídos de uma conversa longa não é informação — é
  // ruído que ensina o CEO a não abrir a tela.
  return out.slice(0, 8);
}

/**
 * O bloco que o gate do briefing grava dentro de `briefingJson`.
 *
 * Devolve `null` quando não há canal nenhum — gravar `{ email: null,
 * whatsapp: null }` faria a leitura futura não distinguir "perguntamos e a
 * pessoa recusou" de "nunca perguntamos". Quem carrega esse fato é o `status`
 * da solicitação, não um objeto vazio.
 */
export function montarContato(input: {
  nome?: unknown;
  email?: unknown;
  whatsapp?: unknown;
}): { nome: string | null; email: string | null; whatsapp: string | null; informadoEm: string } | null {
  const nome     = texto(input.nome);
  const email    = emailValido(input.email) ? (input.email as string).trim() : null;
  const whatsapp = whatsappValido(input.whatsapp) ? normalizarWhatsapp(input.whatsapp as string) : null;
  if (!email && !whatsapp) return null;
  return { nome, email, whatsapp, informadoEm: new Date().toISOString() };
}

/** O que vai para as colunas `contato*` do `ClientRequestDb`. */
export type ColunasDeContato = {
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoWhatsapp: string | null;
  contatoEm: Date | null;
};

/**
 * A PROJEÇÃO do contato para as colunas do banco (16/08/2026).
 *
 * Esta é a única função que produz o valor das colunas, e ela **deriva de
 * `lerContato`**. Ninguém monta esses campos à mão em rota, em script ou em
 * seed: se um segundo lugar decidisse o que é contato, a coluna e a tela
 * passariam a discordar, e a consulta do banco acharia um conjunto diferente do
 * que o operador vê. É o defeito das duas verdades adjacentes, e esta casa já o
 * pagou duas vezes (o Drive e a fila do briefing).
 *
 * **Nome sozinho não sobe.** Sem canal, as quatro colunas ficam nulas — inclusive
 * o nome. Uma coluna de nome preenchida com o canal vazio é um índice que promete
 * o que não cumpre, e "nome sozinho" é exatamente como se chamava o desperdício
 * de 51 dias.
 */
export function colunasDeContato(
  entrada: EntradaDeContato | null | undefined,
  agora: Date = new Date(),
): ColunasDeContato {
  const contato = lerContato(entrada);
  if (!contato.temComoFalar) {
    return { contatoNome: null, contatoEmail: null, contatoWhatsapp: null, contatoEm: null };
  }
  // `informadoEm` do formato canônico é a hora em que a PESSOA declarou. Ela
  // vence o relógio de agora: reescrever a data a cada gravação apagaria há
  // quanto tempo a casa tem esse canal.
  const canonico = objeto(objeto(entrada?.briefingJson)?.contato);
  const declaradoEm = texto(canonico?.informadoEm);
  const quando = declaradoEm ? new Date(declaradoEm) : agora;
  return {
    contatoNome: contato.nome,
    contatoEmail: contato.email,
    contatoWhatsapp: contato.whatsapp,
    contatoEm: Number.isNaN(quando.getTime()) ? agora : quando,
  };
}
