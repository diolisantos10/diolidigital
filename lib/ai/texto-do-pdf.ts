// texto-do-pdf.ts — o TEXTO de dentro de um PDF, para quem só lê texto.
//
// A IA do cofre (DeepSeek) não lê PDF nativo. Antes de 04/10/2026 não havia
// biblioteca de PDF neste projeto; `unpdf` entrou para isto (sem dependências,
// feita para rodar em servidor). Ela extrai o TEXTO — o visual das páginas e
// as imagens embutidas NÃO saem daqui, e quem usa declara isso.
//
// Nunca lança: PDF ilegível, cifrado ou só de imagem devolve `null`.

export async function textoDoPdf(bytes: Buffer): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const limpo = (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+/g, " ").trim();
    return limpo ? limpo : null;
  } catch {
    return null;
  }
}
