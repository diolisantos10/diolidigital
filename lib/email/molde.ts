// molde.ts — O MOLDE ÚNICO DOS E-MAILS DA CASA.
//
// ─── POR QUE ELE EXISTE (27/08/2026) ────────────────────────────────────────
//
// O CEO recebeu o primeiro e-mail real da casa e devolveu três coisas:
//
//   *"Precisa de logo, precisa de um e-mail com design, bonito, com a nossa
//   cara. Um e-mail bem preparado, com cara de empresa grande."*
//
// E, sobre o WhatsApp escrito como número solto no meio de um parágrafo:
//
//   *"Eu acho uma coisa muito pobre, tem que ser um link com um botão."*
//
// Até aqui cada template carregava a sua PRÓPRIA cópia do HTML inteiro —
// `<!DOCTYPE>`, cabeçalho, rodapé, paleta, tudo duplicado, palavra por palavra.
// Foi assim que o nome errado sobreviveu em dois rodapés ao mesmo tempo: para
// consertar era preciso lembrar dos dois. **Verdade em dois lugares já está
// errada em um.** Daqui em diante o corpo é o que varia; a casca é esta.
//
// ─── AS REGRAS DE E-MAIL QUE MANDAM NESTE ARQUIVO ───────────────────────────
//
// Cliente de e-mail não é navegador. O que parece exagero aqui é o que faz o
// e-mail não desmontar no Outlook:
//
//   1. **Layout em `<table>`**, não em flex/grid. O Outlook para Windows
//      renderiza com o motor do Word; `display:flex` simplesmente não existe lá.
//   2. **Todo estilo INLINE.** `<style>` no `<head>` é removido por vários
//      clientes (o Gmail corta em parte dos contextos). Classe CSS não sobrevive.
//   3. **Botão é `<a>` com padding e fundo dentro de uma `<table>`** — NUNCA
//      `<button>`, que não é clicável em cliente de e-mail nenhum, e nunca um
//      `<div>` com `onclick`, que não existe.
//   4. **Largura ~600px**, o consenso que cabe no painel de leitura do Outlook.
//      `width="100%"` + `max-width` para o celular.
//   5. **O e-mail tem de continuar legível com TODA imagem bloqueada** —
//      Gmail e Outlook fazem isso por padrão com remetente novo. Nada essencial
//      pode morar dentro de um pixel. Ver `LOGO_ALT` em `lib/marca.ts` e o
//      número legível embaixo do botão.
//
// ─── E O QUE NÃO ENTRA AQUI ─────────────────────────────────────────────────
//
// ⛔ **Direção interna nunca vai ao ar.** A mesma lei da legenda
// (`lib/agency/esteira/direcao-interna.ts`) vale para o e-mail: "Post
// destacando…", "Peça que comunica…", trecho de briefing e instrução de equipe
// são conversa DA CASA. O molde não recebe esse tipo de texto porque quem monta
// o corpo passa só o que é para o cliente ler — e `blocoDeTexto` escapa o que
// recebe, então nada de HTML vindo de fora.

import {
  CORES, LOGO_ALT, LOGO_ALTURA, LOGO_BRANCO_URL, LOGO_LARGURA, NOME_DA_EMPRESA,
  WHATSAPP_CONVITE, WHATSAPP_LEGIVEL, WHATSAPP_LINK,
} from "@/lib/marca";

/** Escapa texto que vai virar HTML. Nome de negócio com `&` ou `<` não pode
 *  quebrar o e-mail — nem virar injeção no cliente de e-mail de quem lê. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * O CABEÇALHO: barra navy com o logo branco.
 *
 * A altura fixa importa — sem ela, o cliente de e-mail que bloqueia imagem
 * colapsa a linha e o `alt` fica ilegível, grudado na borda. E ela vem de
 * `LOGO_ALTURA`, não digitada: o par 150 × 34 que estava aqui NÃO batia com a
 * proporção do arquivo (512 × 130), e o logo chegava esticado em toda caixa de
 * entrada. Ver o comentário de `LOGO_LARGURA` em `lib/marca.ts`.
 */
function cabecalho(): string {
  return `<tr><td style="background:${CORES.navy};padding:26px 32px">
  <img src="${LOGO_BRANCO_URL}" alt="${LOGO_ALT}" width="${LOGO_LARGURA}" height="${LOGO_ALTURA}"
       style="display:block;border:0;outline:none;text-decoration:none;height:${LOGO_ALTURA}px;width:${LOGO_LARGURA}px;max-width:${LOGO_LARGURA}px;color:#FFFFFF;font-family:${FONTE};font-size:16px;font-weight:700;letter-spacing:.02em">
</td></tr>
<tr><td style="height:3px;line-height:3px;font-size:0;background:${CORES.menta}">&nbsp;</td></tr>`;
}

/**
 * O BOTÃO DE WHATSAPP — a ordem do CEO, em técnica de e-mail.
 *
 * Ele é uma `<table>` com fundo, e o `<a>` leva o padding: é assim que a área
 * clicável cobre o retângulo inteiro em vez de só as letras. E o número
 * **continua escrito embaixo**, em texto, para quem lê com estilo/imagem
 * bloqueados ou quer digitar o número à mão — botão que some não pode levar o
 * contato junto.
 *
 * ⚠️ ELE É O BOTÃO **SECUNDÁRIO**, e isso é decisão de leitura, não de gosto.
 * Todo e-mail da casa tem uma ação principal ("ver o meu orçamento", "abrir o
 * portal"), e ela é sólida em navy. Se o WhatsApp fosse sólido também, os dois
 * competiriam com o mesmo peso e o e-mail deixaria de ter UMA resposta óbvia —
 * o cliente escolhe entre dois iguais, e escolher é atrito. Aqui ele é
 * contornado: presente e clicável, sem disputar a vez.
 *
 * A linha fina acima dele separa "o assunto do e-mail" de "como falar com a
 * gente" — o rodapé de contato de uma empresa que atende, não um número
 * jogado no fim de um parágrafo.
 */
function botaoDeWhatsapp(): string {
  return `<tr><td style="padding:8px 32px 28px;border-top:1px solid ${CORES.linha}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:20px">
    <tr>
      <td align="center" bgcolor="${CORES.cartao}" style="border-radius:12px;background:${CORES.cartao};border:1.5px solid ${CORES.navy}">
        <a href="${WHATSAPP_LINK}"
           style="display:inline-block;padding:13px 24px;font-family:${FONTE};font-size:15px;font-weight:600;line-height:1;color:${CORES.navy};text-decoration:none;border-radius:12px">
          ${WHATSAPP_CONVITE}
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:12px 0 0;font-family:${FONTE};font-size:13px;line-height:1.5;color:${CORES.apoio}">
    Ou chame no <a href="${WHATSAPP_LINK}" style="color:${CORES.grafite};font-weight:600;text-decoration:none">${WHATSAPP_LEGIVEL}</a> — e responder este e-mail também chega na gente.
  </p>
</td></tr>`;
}

/** O RODAPÉ. O nome vem de `lib/marca.ts`, nunca digitado. */
function rodape(nota: string): string {
  return `<tr><td style="padding:18px 32px;background:${CORES.fundo};border-top:1px solid ${CORES.linha}">
  <p style="margin:0;font-family:${FONTE};font-size:12px;line-height:1.6;color:${CORES.apoio}">
    <strong style="color:${CORES.grafite}">${NOME_DA_EMPRESA}</strong> · ${esc(nota)}
  </p>
</td></tr>`;
}

/** Um parágrafo do corpo. O texto é ESCAPADO — HTML de fora não entra. */
export function blocoDeTexto(texto: string): string {
  return `<tr><td style="padding:0 32px 14px">
  <p style="margin:0;font-family:${FONTE};font-size:15px;line-height:1.65;color:${CORES.grafite}">${esc(texto)}</p>
</td></tr>`;
}

/** Um rótulo pequeno acima de um dado (ESTIMATIVA, O QUE VOCÊ PEDIU…). */
export function blocoRotulado(rotulo: string, valorHtml: string): string {
  return `<tr><td style="padding:4px 32px 16px">
  <p style="margin:0 0 6px;font-family:${FONTE};font-size:11px;color:${CORES.apoio};text-transform:uppercase;letter-spacing:.08em;font-weight:700">${esc(rotulo)}</p>
  ${valorHtml}
</td></tr>`;
}

/** O botão principal da mensagem (ver o orçamento, abrir o portal…). */
export function blocoDeBotao(href: string, rotulo: string): string {
  return `<tr><td style="padding:6px 32px 20px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
    <tr><td align="center" bgcolor="${CORES.navy}" style="border-radius:12px;background:${CORES.navy}">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONTE};font-size:15px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:12px">${esc(rotulo)}</a>
    </td></tr>
  </table>
</td></tr>`;
}

/**
 * O PREHEADER — a linha que o Gmail e o Outlook mostram AO LADO do assunto, na
 * lista de mensagens, antes de a pessoa abrir.
 *
 * Ele existe querendo ou não. Sem esta linha, o cliente de e-mail pega o
 * primeiro texto que encontra no HTML — que aqui seria o `alt` do logo. A
 * prévia da caixa de entrada viraria *"Seu orçamento está pronto — Dioli
 * Digital Dioli Digital"*. É o detalhe que separa e-mail de empresa de e-mail
 * de script.
 *
 * A técnica: texto escondido por `display:none` **mais** um bloco de espaços
 * invisíveis (`&#847;&zwnj;&nbsp;`) que empurra para longe qualquer texto que
 * viesse depois. Os dois juntos, porque cada cliente ignora um deles.
 */
function preheader(texto: string): string {
  const empurrador = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(texto)}${empurrador}</div>`;
}

export interface MoldeInput {
  /** A primeira linha grande — "Olá, Fulano!". */
  saudacao: string;
  /**
   * A prévia da caixa de entrada. Ver `preheader()`: ela aparece com ou sem
   * você — quem não a escreve entrega o `alt` do logo no lugar dela.
   */
  previa: string;
  /** Os blocos do corpo, já montados pelos ajudantes acima. */
  corpo: string[];
  /** A linha pequena do rodapé, depois do nome da empresa. */
  notaDoRodape: string;
}

/**
 * Monta o e-mail inteiro. **Todo e-mail da casa sai por aqui** — se um novo
 * template escrever o próprio `<!DOCTYPE>`, ele nasce fora do molde e é assim
 * que a próxima divergência começa.
 */
export function moldeDoEmail(input: MoldeInput): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${CORES.fundo};font-family:${FONTE}">
  ${preheader(input.previa)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CORES.fundo};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background:${CORES.cartao};border:1px solid ${CORES.linha};border-radius:16px;overflow:hidden">
        ${cabecalho()}
        <tr><td style="padding:30px 32px 10px">
          <h1 style="margin:0;font-family:${FONTE};font-size:22px;line-height:1.3;font-weight:700;color:${CORES.grafite}">${input.saudacao}</h1>
        </td></tr>
        ${input.corpo.join("\n        ")}
        ${botaoDeWhatsapp()}
        ${rodape(input.notaDoRodape)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
