// templates.ts — O QUE CADA E-MAIL DA CASA DIZ.
//
// A CASCA (logo, cabeçalho navy, botão de WhatsApp, rodapé, paleta) mora em
// `lib/email/molde.ts`. Aqui fica só o que MUDA de uma mensagem para outra.
// Até 27/08/2026 cada template carregava a sua própria cópia do HTML inteiro, e
// foi assim que o nome errado da empresa sobreviveu em dois rodapés ao mesmo
// tempo — para consertar era preciso lembrar dos dois.
//
// ─── AS DUAS MENSAGENS, E O QUE CADA UMA PODE DIZER ─────────────────────────
//
//   • `briefingConfirmationEmail` — sai ANTES de existir número. Nunca leva
//     valor, porque valor nenhum foi derivado ainda. Inventar aqui seria
//     alucinar preço.
//   • `orcamentoProntoEmail` — sai DEPOIS, e **também não leva valor**. Ele é
//     um CONVITE: "está pronto" + o botão para o portal, onde o número mora
//     junto do SDR que responde por ele. Ordem do CEO em 27/08/2026.
//
// ⛔ **NENHUM E-MAIL DESTA CASA ESTAMPA PREÇO.** Não é estilo: preço lido
// sozinho, sem ninguém do outro lado, é preço que o cliente compara e descarta
// em silêncio — e a agência nem fica sabendo que houve uma objeção.
//
// O que NENHUM dos dois pode ter: promessa de prazo. Ordem do CEO em
// 16/08/2026 — *"em relação à confirmação de promessa, de orçamento em um dia,
// não autorizei nada disso."*
//
// ⛔ E nenhum dos dois carrega DIREÇÃO INTERNA. A mesma lei da legenda: "Post
// destacando…", "Peça que comunica…", trecho de briefing e instrução de equipe
// são conversa da casa. O que entra aqui é o que o cliente escreveu ou o que a
// casa decidiu DIZER a ele.

import {
  blocoDeBotao, blocoDeTexto, blocoRotulado, esc, moldeDoEmail,
} from "@/lib/email/molde";
import { CORES } from "@/lib/marca";

export { esc };

export interface BriefingConfirmationInput {
  prospectName?: string;
  businessName?: string;
  services?: string[];
}

export function briefingConfirmationEmail(input: BriefingConfirmationInput): {
  subject: string;
  html: string;
} {
  const name = input.prospectName?.trim();
  const biz = input.businessName?.trim();
  const greeting = name ? `Olá, ${esc(name)}!` : "Olá!";

  const services = (input.services ?? []).filter((s) => typeof s === "string" && s.trim());

  const corpo: string[] = [
    blocoDeTexto(
      biz
        ? `Recebemos o pedido de orçamento para ${biz}. Nossa equipe já está com ele em mãos.`
        : "Recebemos o seu pedido de orçamento. Nossa equipe já está com ele em mãos.",
    ),
  ];

  if (services.length > 0) {
    corpo.push(
      blocoRotulado(
        "O que você pediu",
        `<p style="margin:0;font-size:15px;line-height:1.6;color:${CORES.grafite}">${esc(services.join(" · "))}</p>`,
      ),
    );
  }

  corpo.push(
    blocoRotulado(
      "Próximos passos",
      // ⛔ SEM PRAZO. Ordem do CEO em 16/08/2026. Este e-mail é a IRMÃ da tela
      // de confirmação: as duas nasceram do mesmo texto, e consertar só a que
      // aparece no print deixa a promessa viva na caixa de entrada do cliente.
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;color:${CORES.grafite};line-height:1.6">
         <tr><td style="padding:3px 0">1. Analisamos o escopo que você enviou</td></tr>
         <tr><td style="padding:3px 0">2. Preparamos uma proposta formal detalhada</td></tr>
         <tr><td style="padding:3px 0">3. Entramos em contato por este e-mail</td></tr>
       </table>`,
    ),
  );

  return {
    subject: biz ? `Recebemos seu pedido — ${biz}` : "Recebemos seu pedido de orçamento",
    html: moldeDoEmail({
      saudacao: greeting,
      // A prévia da caixa de entrada. Ela diz o que aconteceu, não repete o
      // assunto: quem lê os dois lado a lado ganha uma informação a mais.
      previa: "Seu pedido chegou. A equipe já está com ele em mãos.",
      corpo,
      notaDoRodape: "Este é um e-mail automático de confirmação.",
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DE QUE O ORÇAMENTO FICOU PRONTO
//
// A pergunta do CEO em 16/08/2026, com o piloto no ar: *"nada ainda via e-mail.
// O que aconteceu?"* O orçamento fora calculado, o texto escrito e a conversa
// do portal recebera tudo — e ninguém avisou o destinatário. É o defeito D-003:
// caixa certa, seta faltando.
//
// Ele é um TOQUE NO OMBRO com um botão: avisa que ficou pronto e leva ao portal.
// **Não substitui o portal** — a conversa continua sendo a fonte da verdade, e é
// lá que o valor aparece. Um e-mail que tentasse ser a conversa inteira criaria
// uma segunda verdade, e duas verdades divergem no primeiro ajuste de escopo.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrcamentoProntoInput {
  prospectName?: string;
  businessName?: string;
  /**
   * O endereço da conversa no portal — onde o valor mora e onde o SDR atende.
   * É o destino do botão, e por isso virou a peça mais importante deste e-mail.
   */
  portalLink?: string;
  /**
   * A estimativa passou da verba que o cliente declarou.
   *
   * Existe porque o CityJobs, em 16/08/2026, disse *"algo em torno de R$ 500
   * por mês"* e recebeu R$ 1.800–3.400 sem uma palavra sobre a diferença.
   *
   * ⚠️ Aqui entra só o RECONHECIMENTO, **sem número nenhum** — quem nomeia a
   * diferença, mostra o que cabe e negocia é a conversa do portal.
   */
  verbaEstourada?: boolean;
}

export function orcamentoProntoEmail(input: OrcamentoProntoInput): {
  subject: string;
  html: string;
} {
  const name = input.prospectName?.trim();
  const biz = input.businessName?.trim();
  const greeting = name ? `Olá, ${esc(name)}!` : "Olá!";

  // ⛔ ESTE E-MAIL É UM CONVITE, NÃO UMA PROPOSTA (ordem do CEO, 27/08/2026):
  //
  //   *"Eu não acho que o valor tem que estar estampado no e-mail. Tem que ser
  //   um e-mail clicável, tipo: 'seu orçamento está pronto, clique aqui'."*
  //
  // O motivo é comercial e vale a pena escrever: **preço lido sozinho, sem
  // ninguém do outro lado, é preço que o cliente compara e descarta em
  // silêncio.** Ninguém fica sabendo que ele desistiu, e não houve conversa
  // nenhuma. No portal o número aparece junto de quem responde por ele.
  //
  // Por isso `faixa` NÃO É MAIS PARÂMETRO desta função: campo que existe é
  // campo que alguém volta a preencher.
  const corpo: string[] = [
    blocoDeTexto(
      biz
        ? `O orçamento da ${biz} está pronto. Ele fica na sua conversa com a gente — é lá que a gente detalha o que entra, ajusta o que precisar e responde o que você quiser perguntar.`
        : "O seu orçamento está pronto. Ele fica na sua conversa com a gente — é lá que a gente detalha o que entra, ajusta o que precisar e responde o que você quiser perguntar.",
    ),
  ];

  if (input.verbaEstourada) {
    corpo.push(
      blocoDeTexto(
        "Você comentou uma verba mais enxuta do que o escopo que a gente montou — isso está nomeado lá na conversa, junto do que cabe no seu momento. Preferimos conversar sobre isso com você do que mandar um número solto.",
      ),
    );
  }

  // O botão só existe quando há link de verdade. Botão que leva a lugar nenhum
  // é pior que ausência de botão: o cliente clica, não acontece nada, e conclui
  // que a agência está quebrada.
  if (input.portalLink) {
    corpo.push(blocoDeBotao(input.portalLink, "Ver o meu orçamento"));
  }

  corpo.push(
    blocoDeTexto(
      "É uma estimativa a partir do que você contou, não a proposta final. Se algo estiver diferente do que você precisa, é só dizer por lá — dá para trocar o plano, tirar e acrescentar.",
    ),
  );

  return {
    subject: biz ? `Seu orçamento está pronto — ${biz}` : "Seu orçamento está pronto",
    html: moldeDoEmail({
      saudacao: greeting,
      // ⛔ SEM VALOR AQUI TAMBÉM. A prévia é lida ANTES de abrir o e-mail — um
      // preço nela seria o preço mais exposto de todos.
      previa: "Ele está na sua conversa com a gente. É só abrir e ver.",
      corpo,
      notaDoRodape: "Este é um aviso automático. A conversa completa fica no seu portal.",
    }),
  };
}
