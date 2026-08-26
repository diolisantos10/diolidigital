// retratacao.ts — o cliente desdiz o que já tinha dito, e a casa inteira precisa
// desdizer junto.
//
// ─── O CASO QUE PRODUZIU ESTE ARQUIVO (8ª volta, 26/08/2026) ─────────────────
//
// O cliente oculto tinha entrado pela porta deixando o WhatsApp. No meio da
// conversa ele escreveu, com todas as letras:
//
//     "esquece o WhatsApp, prefiro e-mail"
//
// O turno seguinte do SDR já não trazia `prospectPhone` — o modelo OUVIU. E o
// número reapareceu, inteiro, em DOIS lugares da solicitação gravada:
// `briefingJson.scope.prospectPhone` e `contato.whatsapp`.
//
// ─── POR QUE OUVIR NÃO BASTAVA ───────────────────────────────────────────────
//
// Porque nenhuma das três memórias desta conversa sabe APAGAR:
//
//   1. o escopo acumulado do servidor é `{ ...body.scope, ...patch }` — o
//      patch novo só SOBRESCREVE; campo ausente no patch é campo preservado;
//   2. `mergeScopeGaps`, no navegador, é gap-fill DECLARADO: ele só escreve
//      onde ainda não há nada. Por construção, não apaga;
//   3. a porta de gravação (`/api/brain/client-requests`) lê o WhatsApp do
//      `contato` da porta ANTES do escopo — e a porta é anterior à retratação.
//
// Três memórias, e a retratação teria de vencer as três. Uma DELEÇÃO não
// atravessa nenhuma delas: some no primeiro merge.
//
// ─── A FORMA DO CONSERTO: MARCA POSITIVA, NUNCA DELEÇÃO ──────────────────────
//
// O que atravessa gap-fill é o que CRESCE. Por isso a retratação não é a
// ausência de um campo: é um campo a mais, `canaisRetratados`, uma lista que só
// aumenta e que todo merge preserva sozinho, sem nenhum dos três merges precisar
// aprender uma regra nova de apagamento.
//
// A leitura, então, é uma só e vale em qualquer superfície: **canal retratado
// não é canal**, independentemente de quantas cópias do número sobraram por aí.
// Verdade escrita em dois lugares já está errada em um deles — aqui ela passa a
// ser escrita num lugar só (a marca) e OBEDECIDA nos três.
//
// ─── A RÉGUA É DURA DE PROPÓSITO ─────────────────────────────────────────────
//
// Apagar contato do cliente por engano é dano de verdade: a casa perde o único
// jeito de falar com ele. Por isso a retratação exige as DUAS metades na mesma
// fala — um verbo de desdizer E o canal nomeado. "prefiro e-mail" sozinho é
// preferência, não retratação, e preferência não apaga telefone: ela vira
// `preferredChannel`, que é outro campo e outra consequência.

/** Os canais que o cliente pode retratar. São os que a casa grava. */
export type CanalRetratavel = "whatsapp" | "email";

/** O campo do escopo que cada canal retratado derruba. `null` = o canal não
 *  guarda dado nenhum do cliente nesta casa (o e-mail nunca entra no escopo —
 *  ver `aplicarTravasDeEscopo`), então retratá-lo muda a preferência e mais
 *  nada. */
export const CAMPO_DO_CANAL: Record<CanalRetratavel, string | null> = {
  whatsapp: "prospectPhone",
  email: null,
};

/** Verbo de desdizer. "esquece", "esqueça", "esqueçam", "deixa pra lá",
 *  "cancela", "não use", "não usem", "tira", "tire", "remove", "apaga",
 *  "desconsidera", "ignora", "nem precisa". */
//
// ⚠️ A BORDA NÃO É `\b`. "lá" termina em `á`, e `á` não é caractere de palavra
// em JavaScript: um `\b` depois dele NUNCA casa, e "deixa pra lá o zap"
// devolvia lista vazia. É a mesma armadilha que `negociacao.ts` já registrou
// em "até R$ 150" e `mira-da-peca.ts` em `ª`/`º` — a terceira vez nesta casa.
const LETRA = "a-zA-ZÀ-ÿ";
const VERBO_DE_RETRATACAO = new RegExp(
  `(?<![${LETRA}])(?:esque[cç]\\w*|deix[ae]\\s+pra\\s+l[áa]|cancel\\w*|desconsider\\w*|ignor\\w*|desprez\\w*|n[ãa]o\\s+(?:use\\w*|precisa\\w*|quero|queremos|manda\\w*|mande\\w*|envie\\w*|mais)|tir[ae]\\w*|remov\\w+|apag\\w+|exclu\\w+)(?![${LETRA}])`,
  "i",
);

/** O canal nomeado. `zap`/`whats`/`wpp` são o mesmo canal na boca do cliente,
 *  e "telefone"/"celular"/"número" também: quem retrata o WhatsApp está
 *  retratando o número, não o aplicativo. */
const NOME_DO_CANAL: { canal: CanalRetratavel; re: RegExp }[] = [
  { canal: "whatsapp", re: /\b(?:whats\s?app|whatsapp|whats|wpp|zap|telefone|celular|n[úu]mero|fone)\b/i },
  { canal: "email",    re: /\b(?:e-?mails?|correio\s+eletr[ôo]nico)\b/i },
];

/** Onde um trecho termina. A vírgula conta: é ela que separa o que ele desdiz
 *  do que ele escolhe no lugar, na mesma frase. O travessão também — é como a
 *  pessoa emenda a alternativa ("deixa pra lá o zap — me manda por e-mail"). */
const SEPARADOR_DE_TRECHO = /[.!?;,\n\u2014\u2013]+/;

/**
 * Os canais que ESTA fala retrata. Lista vazia é o caso comum e é honesto:
 * quase nenhuma fala desdiz coisa alguma.
 *
 * As duas metades têm de estar no MESMO TRECHO, e o trecho é curto de
 * propósito: o texto entre pontuações, VÍRGULA INCLUÍDA. Sem essa janela:
 *
 *   • *"não quero anúncio pago; pode falar comigo no WhatsApp"* seria lido como
 *     retratação do WhatsApp, e a casa apagaria o número que o cliente acabou
 *     de confirmar;
 *   • a própria fala medida — *"esquece o WhatsApp, prefiro e-mail"* — teria
 *     retratado os DOIS canais, porque o verbo de uma metade alcançaria o canal
 *     da outra. Retratar tudo é ficar sem canal nenhum.
 */
export function canaisRetratados(fala: unknown): CanalRetratavel[] {
  if (typeof fala !== "string" || !fala.trim()) return [];
  const achados = new Set<CanalRetratavel>();
  for (const frase of fala.split(SEPARADOR_DE_TRECHO)) {
    if (!VERBO_DE_RETRATACAO.test(frase)) continue;
    for (const { canal, re } of NOME_DO_CANAL) {
      if (re.test(frase)) achados.add(canal);
    }
  }
  return [...achados];
}

/**
 * O escopo com a retratação APLICADA — a marca acrescentada e os campos que ela
 * derruba, fora.
 *
 * ⚠️ A marca é ACUMULATIVA e nunca encolhe: retratação lida num turno continua
 * valendo nos turnos seguintes, mesmo que o cliente não repita a frase. Sem
 * isso, o número voltaria no primeiro turno em que o modelo reenviasse o escopo
 * acumulado — que é exatamente como ele voltou em produção.
 *
 * ⚠️ PONTO FRACO DECLARADO: o cliente que MUDA DE IDEIA de volta — "na verdade
 * pode mandar no WhatsApp mesmo" — não é atendido por este módulo. A marca não
 * cai sozinha, e o número dele teria de ser dado de novo por uma porta que não
 * é esta. É dívida com dono, e é o lado SEGURO de errar: o erro guarda um canal
 * a menos, nunca usa um canal que o cliente mandou parar de usar.
 */
export function escopoComRetratacao(
  escopo: Record<string, unknown>,
  fala: unknown,
): Record<string, unknown> {
  const novos = canaisRetratados(fala);
  const antigos = lerRetratados(escopo.canaisRetratados);

  // A marca SOMA. É o que a faz atravessar os três merges: cada turno reenvia o
  // escopo acumulado, e uma lista que só cresce sobrevive a qualquer um deles.
  const marcados = new Set([...antigos, ...novos]);

  const saida = { ...escopo };
  for (const canal of marcados) {
    const campo = CAMPO_DO_CANAL[canal];
    if (campo) delete saida[campo];
  }
  if (marcados.size === 0) {
    delete saida.canaisRetratados;
    return saida;
  }
  saida.canaisRetratados = [...marcados].sort();
  // Retratar um canal é escolher o outro quando só existem dois. Dizer o que
  // fica no lugar é a instrução gêmea da proibição: apagar sem dizer por onde
  // falar deixaria o cliente sem canal nenhum.
  if (marcados.has("whatsapp") && !marcados.has("email")) saida.preferredChannel = "email";
  if (marcados.has("email") && !marcados.has("whatsapp")) saida.preferredChannel = "whatsapp";
  return saida;
}

/** A marca lida de um escopo qualquer — tolerante ao que vier do navegador. */
export function lerRetratados(v: unknown): CanalRetratavel[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is CanalRetratavel => x === "whatsapp" || x === "email");
}

/** Este canal foi retratado neste escopo? A pergunta que as três memórias fazem. */
export function canalFoiRetratado(escopo: unknown, canal: CanalRetratavel): boolean {
  if (!escopo || typeof escopo !== "object") return false;
  return lerRetratados((escopo as Record<string, unknown>).canaisRetratados).includes(canal);
}
