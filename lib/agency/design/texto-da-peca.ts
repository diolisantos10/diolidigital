// texto-da-peca.ts — o contrato do texto que vira pixel.
//
// Extraído de `molde.ts` em 06/08/2026, quando a biblioteca de mockup
// (`mockup.ts`) passou a precisar das MESMAS duas coisas: o tipo do texto
// conferido e a função de escape. Sem esta extração, os dois módulos se
// importariam em círculo — ou, pior, o mockup ganharia a própria cópia do
// escape. Segunda cópia de escape de HTML é como nasce um XSS: uma delas é
// corrigida, a outra não, e ninguém sabe qual está em uso.
//
// `molde.ts` reexporta os dois, então nenhum chamador antigo muda.

/** Um pedaço de texto que vai virar pixel — e que o renderizador vai conferir
 *  contra o DOM (`renderizar.ts`). Texto pintado fora desta lista é texto que
 *  entrou na arte sem passar por conferência nenhuma. */
export interface TextoDaPeca {
  /** Identificador do papel no layout. */
  papel: "titulo" | "apoio" | "selo" | "assinatura" | "indice";
  /** O texto EXATO. É este string que o renderizador confere no DOM. */
  texto: string;
}

/** Escapa para conteúdo de elemento E para valor de atributo. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
