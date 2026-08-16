// NOME DO NEGÓCIO — ausência DECLARADA, nunca string vazia.
//
// ── A CICATRIZ QUE ESTE ARQUIVO FECHA (16/08/2026) ──────────────────────────
//
// `prospect-engine.ts` parou de gravar o e-mail do prospect como se fosse o
// nome do negócio (commit `1f9c4f6b`). Isso fechou a mentira — mas abriu um
// buraco diferente: `businessName` na coluna do banco é `String` NÃO-NULO
// (`prisma/schema.prisma`), então "não sei o nome do negócio" grava `""`.
//
// Os dois leitores da porta da frente (`quem-bateu-na-porta.ts` e
// `dossie-do-lead.ts`) repassavam `businessName` cru. String vazia renderizada
// numa tela é um BURACO BRANCO — e um buraco branco é ambíguo: quem olha não
// sabe se o negócio não foi informado, se o dado se perdeu no caminho, ou se a
// tela quebrou. Esta casa já pagou por essa ambiguidade uma vez: "falha de
// leitura nunca vira zero" foi a lição do Sushi Cazza (51 dias, fila invisível
// por sete semanas) — e vazio-com-cara-de-dado é o mesmo defeito, em ponto menor.
//
// ── A LEI ────────────────────────────────────────────────────────────────
//
// Ausência de informação não é informação. `lerNegocio` é o ÚNICO lugar que
// decide "isto é um nome ou isto é nada" — os dois leitores da porta importam
// daqui, para não haver duas cópias da mesma regra divergindo na primeira vez
// que alguém mexer numa e esquecer a outra (o mesmo motivo que fez
// `contato-do-lead.ts` existir).

/** `null` quando o nome do negócio não foi informado — NUNCA string vazia. */
export function lerNegocio(businessName: string | null | undefined): string | null {
  const v = typeof businessName === "string" ? businessName.trim() : "";
  return v.length > 0 ? v : null;
}

/** O rótulo que a tela mostra no lugar do nome — em português, e nunca um traço solto. */
export const NEGOCIO_NAO_INFORMADO = "Negócio não informado";
