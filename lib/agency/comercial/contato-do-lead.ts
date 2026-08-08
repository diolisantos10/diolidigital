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
//   1. O contato NÃO TEM COLUNA. Ele mora dentro de `briefingJson`, um blob de
//      texto, em pelo menos dois formatos diferentes conforme a época. Cada
//      leitor reinventava o próprio `?.scope?.prospectEmail`, e o que não tem
//      leitor único não tem alarme, não tem filtro e não tem gate. Esta função
//      é o leitor único.
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

export const MOTIVO_SEM_CONTATO =
  "o briefing foi enviado sem nome de contato e sem canal (WhatsApp ou e-mail)";

/**
 * Lê o contato de uma solicitação, venha ela de qual época vier.
 *
 * Duas origens, nesta ordem de precedência:
 *   1. `briefingJson.contato` — o formato canônico, escrito pelo gate de 08/08;
 *   2. `briefingJson.scope.prospect*` — o formato legado (as três de produção).
 *
 * `rawContext` **não é lido aqui, de propósito.** Ver o cabeçalho do arquivo.
 */
export function lerContato(entrada: {
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
} | null | undefined): ContatoDoLead {
  const briefing = objeto(entrada?.briefingJson);
  const canonico = objeto(briefing?.contato);
  const escopo   = objeto(briefing?.scope);
  const handoff  = objeto(entrada?.sdrHandoffJson);

  const nome =
    texto(canonico?.nome) ??
    texto(escopo?.prospectName) ??
    texto(handoff?.prospectName);

  const emailBruto =
    texto(canonico?.email) ??
    texto(escopo?.prospectEmail) ??
    texto(handoff?.prospectEmail);
  const email = emailValido(emailBruto) ? emailBruto!.trim() : null;

  const zapBruto =
    texto(canonico?.whatsapp) ??
    texto(escopo?.prospectPhone) ??
    texto(handoff?.prospectPhone);
  const whatsapp = whatsappValido(zapBruto) ? normalizarWhatsapp(zapBruto!) : null;

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
