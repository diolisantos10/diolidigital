// trava-do-molde.ts — O CADEADO DA PORTA DE E-MAIL.
//
// ─── POR QUE UM CADEADO, SE JÁ EXISTE O MOLDE (27/08/2026) ──────────────────
//
// `lib/email/molde.ts` monta o e-mail com a cara da casa, e
// `__tests__/marca/o-email-com-a-cara-da-casa.test.ts` prova que as duas
// mensagens de hoje saem por ele. Mas os dois medem **as mensagens que
// existem**. `sendEmail` aceita `html: string` — qualquer string. Nada, no
// código, impedia a terceira mensagem (o aviso de atraso, o link do portal, a
// peça pronta) de nascer com o próprio `<!DOCTYPE>` e o próprio rodapé, como
// nasceram as duas primeiras — que foi exatamente como o nome errado da
// empresa conseguiu viver em dois rodapés ao mesmo tempo.
//
// **Prompt é aviso; código é trava.** O comentário "todo e-mail sai pelo
// molde" é aviso. Isto aqui é a trava: a porta recusa o que não veio de casa.
//
// ─── AS TRÊS RECUSAS, E O QUE CADA UMA DEFENDE ──────────────────────────────
//
//   1. **Sem a marca no corpo → recusa.** É a prova de que o HTML passou pelo
//      molde: só ele escreve o cabeçalho com o logo e o rodapé com o nome.
//   2. **Com valor no corpo → recusa.** Ordem do CEO: *"eu não acho que o
//      valor tem que estar estampado no e-mail"*. O e-mail é convite, não
//      proposta — preço lido sozinho, sem ninguém do outro lado, é preço que o
//      cliente compara e descarta em silêncio.
//   3. **Com o nome aposentado → recusa.** "Dioli Studio" não sai mais desta
//      casa por e-mail, venha de onde vier o texto.
//
// ⚠️ PONTO FRACO DECLARADO, para ser dívida e não armadilha: esta trava lê o
// HTML JÁ MONTADO. Ela pega o valor escrito no corpo — que é o defeito que o
// CEO apontou — e **não pega** um valor que chegue como imagem, por extenso
// ("mil e oitocentos"), ou escondido dentro da URL de um link. Cobrir isso
// exigiria entender o texto, e trava que adivinha é trava que reprova envio
// bom. A régua honesta: ela fecha a porta pela qual o defeito passou.

import { LOGO_BRANCO_URL, NOME_APOSENTADO, NOME_DA_EMPRESA } from "@/lib/marca";

/** O texto que uma pessoa lê — sem tags e sem atributos.
 *
 *  A separação importa: DENTRO dos atributos moram números legítimos (o
 *  telefone no `wa.me`, o `-512` do nome do arquivo do logo, os `padding:14px`
 *  do botão). Medir o HTML cru faria a trava reprovar todo e-mail da casa. */
export function textoVisivelDoEmail(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os jeitos de escrever dinheiro que este cadeado reconhece. */
const MARCAS_DE_VALOR: ReadonlyArray<readonly [RegExp, string]> = [
  [/R\$/, "R$"],
  [/\b\d{1,3}\.\d{3}\b/, "número com separador de milhar (ex.: 1.800)"],
  [/\b\d+,\d{2}\b/, "número com centavos (ex.: 990,00)"],
  [/\breais\b/i, 'a palavra "reais"'],
];

/**
 * O motivo pelo qual este e-mail NÃO pode sair — ou `null` quando pode.
 *
 * Devolve motivo em vez de `boolean` pela mesma razão que `sendEmail` devolve:
 * status de erro não é motivo, e quem recusa devolve TAMBÉM por quê. Um
 * `false` mudo aqui viraria "o e-mail não saiu" na tela do CEO, que é o tipo
 * de silêncio que já custou um dia inteiro a esta casa.
 */
export function motivoParaNaoEnviar(html: string, subject: string): string | null {
  if (html.includes(NOME_APOSENTADO) || subject.includes(NOME_APOSENTADO)) {
    return `nome_aposentado: o texto ainda diz "${NOME_APOSENTADO}" — a empresa é ${NOME_DA_EMPRESA}`;
  }

  // A prova de procedência: cabeçalho com o logo E rodapé com o nome. Um e-mail
  // escrito à mão pode até conter o nome; ele não contém a URL do logo por
  // acidente.
  if (!html.includes(LOGO_BRANCO_URL)) {
    return "fora_do_molde: o e-mail não traz o cabeçalho da marca — todo e-mail da casa sai por moldeDoEmail()";
  }
  if (!html.includes(NOME_DA_EMPRESA)) {
    return "fora_do_molde: o e-mail não traz o rodapé assinado — todo e-mail da casa sai por moldeDoEmail()";
  }

  const visivel = textoVisivelDoEmail(html);
  for (const [regex, comoSeChama] of MARCAS_DE_VALOR) {
    if (regex.test(visivel)) {
      return `valor_no_corpo: o corpo estampa ${comoSeChama} — o e-mail é convite, não proposta; o valor mora no portal`;
    }
    if (regex.test(subject)) {
      return `valor_no_assunto: o assunto estampa ${comoSeChama} — o e-mail é convite, não proposta`;
    }
  }

  return null;
}
