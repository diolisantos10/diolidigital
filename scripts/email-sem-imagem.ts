// COMO O E-MAIL DA CASA CHEGA COM TODA IMAGEM BLOQUEADA.
//
// Gmail e Outlook bloqueiam imagem por padrão em remetente novo — não é caso
// de borda, é o PRIMEIRO e-mail de todo cliente novo. Este script imprime o
// que sobra: o `alt` no lugar do logo, e o texto inteiro.
//
//   npx tsx scripts/email-sem-imagem.ts
//
// Ele é uma LENTE, não uma trava. A trava é
// `__tests__/marca/o-email-com-a-cara-da-casa.test.ts`; isto existe para o
// humano ler com os próprios olhos o que o cliente lê.

import { briefingConfirmationEmail, orcamentoProntoEmail } from "@/lib/email/templates";

/** O e-mail como um leitor com imagens bloqueadas o recebe: cada `<img>` vira
 *  o seu `alt` (que é o que o cliente de e-mail desenha no lugar dela). */
/** O preheader NÃO é corpo: é a prévia que aparece na LISTA de mensagens,
 *  ao lado do assunto. Mostrado à parte para não se confundir com o texto. */
function previaDaCaixaDeEntrada(html: string): string {
  const m = html.match(/<div style="display:none[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return "⚠️ SEM PREHEADER — o cliente de e-mail vai inventar um";
  return m[1].replace(/&#847;|&zwnj;|&nbsp;/g, "").trim();
}

function comoChegaSemImagem(html: string): string {
  return html
    .replace(/<div style="display:none[\s\S]*?<\/div>/g, "")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, "[imagem bloqueada: $1]")
    .replace(/<img[^>]*>/g, "[imagem bloqueada: SEM ALT ⚠️]")
    .replace(/<\/(tr|p|h1|table|td)>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

const MENSAGENS = [
  ["CONFIRMAÇÃO DE BRIEFING", briefingConfirmationEmail({
    prospectName: "NOME TESTE", businessName: "Padaria do Teste",
    services: ["Gestão de redes sociais", "Criação de peças"],
  })],
  ["ORÇAMENTO PRONTO", orcamentoProntoEmail({
    prospectName: "NOME TESTE", businessName: "Padaria do Teste",
    portalLink: "https://www.diolidigital.com.br/portal/access/exemplo",
  })],
] as const;

for (const [nome, { subject, html }] of MENSAGENS) {
  console.log(`\n${"═".repeat(70)}\n${nome}`);
  console.log(`Na lista de mensagens:  ${subject}`);
  console.log(`                        ${previaDaCaixaDeEntrada(html)}`);
  console.log("─".repeat(70));
  console.log(comoChegaSemImagem(html));
}
