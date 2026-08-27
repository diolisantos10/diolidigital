// DE QUEM É ESTA CONVERSA — a régua PURA, sem uma linha de banco.
//
// ═══ O BURACO QUE ESTE ARQUIVO FECHA ════════════════════════════════════════
//
// `promover-conversas-paradas.ts` faz a conversa parada de um PARCEIRO virar
// pedido sozinha, no relógio. Mas só consegue com rastros que carregam
// `clienteDoConvite` — o cliente que o SERVIDOR derivou do token do convite.
//
// **E a conversa que mais importava não tem esse campo.** O primeiro cliente
// real da agência (FOOCCI, `cmtc145qf007a0xo4txmjss11`) conversou em 27/08 às
// 01:34 e às 13:43, contou o briefing inteiro, e a conversa travou na pergunta
// de verba. Aquele rastro é **v1**: ele não sabe de quem é. E fazer o cliente
// repetir o briefing que ele já mandou é inaceitável.
//
// ═══ DECLARAR NÃO É DEDUZIR — e a diferença é toda a segurança ══════════════
//
// A tentação óbvia é olhar o e-mail digitado no chat e concluir o dono. O autor
// da promoção se RECUSOU a isso, e a recusa está certa: bastaria um visitante
// qualquer escrever o e-mail de um parceiro para ser promovido a pedido isento.
// **Essa recusa não se desfaz aqui.**
//
// O que se acrescenta é outra coisa, e a diferença é a mesma que torna
// `autorizadaPor` legítimo na parceria: a verdade vem **de dentro da casa**, por
// um operador com sessão de AGÊNCIA, com nome, hora e registro — não do que o
// visitante escreve. Ninguém adivinha: alguém **responde pelo ato**.
//
//   • `clienteDoConvite`  → DERIVADO pelo servidor de um token que a casa cunhou.
//   • `atribuicao`        → DECLARADO por um operador da casa, com autor e data.
//
// As duas são verdade de dentro. Nenhuma outra fonte entra — e principalmente
// não entra nada que o próprio visitante tenha escrito.
//
// ═══ POR QUE PURO, E POR QUE EM ARQUIVO SEPARADO ════════════════════════════
//
// `question-engine` e a sala de briefing rodam NO NAVEGADOR, e `await
// import("@/lib/db/client")` dentro de uma função NÃO impede o empacotador de
// arrastar o Prisma junto — lição que já reprovou um `npm run build` desta casa.
// Régua pura em arquivo sem banco; a leitura e a escrita vivem em
// `atribuir-conversa-orfa.ts`.
//
// ═══ FAIL-CLOSED ═══════════════════════════════════════════════════════════
//
// Sem convite e sem atribuição → `null`, e `null` é "não sei de quem é", que a
// promoção lê como "não agir". Campo malformado (não-string, string vazia) é
// tratado como ausente: forma que não confere não vira permissão.
// *"Não sei" nunca vira "pode ir".*

/** O ato declarado pela casa. Carrega a TRILHA inteira: quem, quando, e sobre
 *  qual rastro — para que "por que este pedido é do FOOCCI" tenha resposta no
 *  banco daqui a seis meses, e não na memória de quem estava na sala. */
export type AtribuicaoDaCasa = {
  /** De quem a casa declarou que é a conversa. */
  clientId: string;
  /** O `userId` da SESSÃO de quem declarou. Nunca do corpo da requisição: um
   *  campo que o próprio operador digita não pode ser a única testemunha do
   *  ato — a mesma lei de `registradaPor` em `/api/agency/parcerias`. */
  atribuidoPor: string;
  /** Quando, em ISO. */
  atribuidoEm: string;
  /** O rastro de ORIGEM (o fio `sdr:...`). Redundante com a linha que a
   *  carrega, e de propósito: o rastro é APAGADO quando vira pedido, e a cópia
   *  dentro do pedido é o que sobrevive à limpeza. */
  fio: string;
};

/** Qual das duas fontes de dentro da casa respondeu. Vai gravado no pedido. */
export type OrigemDoDono = "convite_de_parceria" | "atribuicao_da_casa";

export type DonoDoRastro = {
  clientId: string;
  origem: OrigemDoDono;
  /** Presente só quando a origem é a atribuição — é a trilha do ato. */
  atribuicao?: AtribuicaoDaCasa;
};

function textoUtil(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * A FORMA DE UMA ATRIBUIÇÃO, CONFERIDA CAMPO A CAMPO.
 *
 * Um JSON gravado ontem pode ter sido escrito por uma versão anterior, ou ter
 * chegado truncado no teto de carga. Meia atribuição — com cliente e sem autor
 * — não é atribuição: é um dono sem ninguém que responda por ele, que é
 * exatamente o que este mecanismo existe para impedir. Recusa inteira.
 */
export function atribuicaoValida(bruto: unknown): AtribuicaoDaCasa | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const clientId = textoUtil(b.clientId);
  const atribuidoPor = textoUtil(b.atribuidoPor);
  const atribuidoEm = textoUtil(b.atribuidoEm);
  const fio = textoUtil(b.fio);
  if (!clientId || !atribuidoPor || !atribuidoEm || !fio) return null;
  return { clientId, atribuidoPor, atribuidoEm, fio };
}

/**
 * DE QUEM É O RASTRO — ou `null`, que é a resposta honesta na maioria das vezes.
 *
 * ⚠️ O convite vem PRIMEIRO por ordem de força, não por ordem de escrita: ele é
 * derivado de um token criptográfico que a casa cunhou, e nenhuma declaração
 * humana posterior deveria sobrepor uma prova de posse. Se as duas existirem e
 * discordarem, vence o token — e a atribuição fica no registro do rastro para
 * quem for auditar.
 */
export function donoDeclaradoDoRastro(rastro: {
  clienteDoConvite?: string | null;
  atribuicao?: AtribuicaoDaCasa | null;
}): DonoDoRastro | null {
  const doConvite = textoUtil(rastro.clienteDoConvite);
  if (doConvite) return { clientId: doConvite, origem: "convite_de_parceria" };

  const atribuicao = atribuicaoValida(rastro.atribuicao);
  if (atribuicao) {
    return { clientId: atribuicao.clientId, origem: "atribuicao_da_casa", atribuicao };
  }

  // Nem token, nem ato declarado. A conversa continua sendo o que sempre foi:
  // uma parada com dono humano, na lista de quem atende. Fail-closed.
  return null;
}
