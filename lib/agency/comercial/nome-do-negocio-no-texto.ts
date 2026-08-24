// nome-do-negocio-no-texto.ts — O LEITOR ÚNICO do nome do negócio numa frase.
//
// ─── POR QUE ISTO VIROU UM MÓDULO (Farol 27, 24/08/2026) ─────────────────────
//
// A cliente disse "meu negócio é a Farol 27" e o escopo gravou **"Farol"**. O
// número caiu porque as capturas só aceitavam palavras de LETRAS — e, pior, o
// corte passava por sucesso: o `if (!businessName)` do padrão seguinte via um
// nome preenchido e nem tentava. Nome de cliente é dado de IDENTIDADE: sai na
// proposta, na peça, na conversa. Cortar não é estilo, é dado errado.
//
// O conserto é `(?:\s+\d{1,4})?` no fim de cada captura. O que fez este arquivo
// existir foi OUTRA coisa, descoberta ao consertar: havia DUAS cópias desta
// lista de padrões — uma em `question-engine.parseInitialMessage` (4 padrões) e
// outra em `prospect-engine.parseProspectNameBiz` (6). A do question-engine não
// conhecia "meu negócio é a X". Consertar uma e não a outra é como esta casa
// descobre uma divergência: pelo cliente lendo um nome na conversa e outro na
// proposta. Mesma lição já paga em `comercial/verba-declarada.ts`.
//
// Aqui mora a lista inteira, uma vez. Quem quer o nome pergunta a este módulo.

/**
 * O nome do negócio dito NESTA frase, ou `undefined`.
 *
 * Ordem importa: o primeiro padrão que casa manda. Toda captura exige inicial
 * maiúscula — nome próprio nunca é palavra comum minúscula — e todas aceitam um
 * número como última parte do nome.
 */
export function nomeDoNegocioNoTexto(text: string): string | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;

  // 1. "chamado X" / "chamada X"
  const m1 = text.match(/chamad[ao]\s+([A-ZÀ-ÿ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (m1 && /^[A-ZÀ-ÿ]/.test(m1[1])) return m1[1].trim();

  // 2. "é o/a X" — "meu negócio é o Restaurante Sabor"
  const m2 = text.match(/[eé]\s+(?:o|a)\s+([A-ZÀ-ÿ][^.!?,\s]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3}(?:\s+\d{1,4})?)/i);
  if (m2 && /^[A-ZÀ-ÿ]/.test(m2[1])) return m2[1].trim();

  // 3. "negócio/empresa/restaurante… é/se chama X" — sem artigo
  const m3 = text.match(/\b(?:neg[óo]cio|empresa|restaurante|loja|marca|bar|sushi\s*bar|caf[eé]|cantina|padaria)\s+(?:é|se\s+chama)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3}(?:\s+\d{1,4})?)/i);
  if (m3 && /^[A-ZÀ-ÿ]/.test(m3[1])) return m3[1].trim();

  // 4. "sou/trabalho/venho da/do/de [Nome]"
  //
  // ⚠️ A PALAVRA-CHAVE É /i, A CAPTURA CONTINUA EXIGINDO MAIÚSCULA (post-check).
  // Antes o regex inteiro era sem /i, "para que a captura exigisse maiúscula" —
  // e o efeito colateral era mudo: "**T**rabalho na Bistro 220" não casava,
  // porque a frase começa com maiúscula, que é como gente escreve. O padrão
  // servia a quem escrevia no meio da frase e falhava para quem abria com ela.
  // Os padrões 1–3 já faziam certo: /i na palavra-chave, `/^[A-ZÀ-ÿ]/` no nome.
  const m4 = text.match(/\b(?:sou|estou|trabalho|venho|falo)\s+(?:da|do|de|na|no|pelo|pela)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3}(?:\s+\d{1,4})?)(?:\s*[,.!?]|\s+e\s|$)/i);
  if (m4 && /^[A-ZÀ-ÿ]/.test(m4[1])) return m4[1].trim();

  // 5. "para o/a [Nome]" — mesma regra do 4
  const m5 = text.match(/\bpara\s+(?:o|a)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3}(?:\s+\d{1,4})?)(?:\s*[,.!?]|\s+e\s|$)/i);
  if (m5 && /^[A-ZÀ-ÿ]/.test(m5[1])) return m5[1].trim();

  // 6. TitleCase de duas ou mais palavras no começo da frase — "Marca Exemplo, quero…"
  const m6 = text.match(/^([A-ZÀ-ÿ][a-zÀ-ÿ]{1,}(?:\s+[A-ZÀ-ÿ][a-zÀ-ÿ]{1,})+(?:\s+\d{1,4})?)(?:\s*[,.]|\s+[a-z]|$)/);
  if (m6) return m6[1].trim();

  return undefined;
}
