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
//   • `orcamentoProntoEmail` — sai DEPOIS, e leva EXATAMENTE a faixa que o
//     cálculo derivou e que já está escrita na conversa do portal. Nunca um
//     número próprio: quem monta o texto passa o valor pronto.
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
// Ele é um TOQUE NO OMBRO: o essencial (a faixa que já está no portal) e o link
// para ver o resto. **Não substitui o portal** — a conversa continua sendo a
// fonte da verdade. Um e-mail que tentasse ser a conversa inteira criaria uma
// segunda verdade, e duas verdades divergem no primeiro ajuste de escopo.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrcamentoProntoInput {
  prospectName?: string;
  businessName?: string;
  /** A faixa JÁ DERIVADA e já escrita no portal. Este template não calcula
   *  nada: recebe o número pronto ou não mostra número nenhum. */
  faixa?: string;
  /** O endereço da conversa no portal. Ausente quando não há token — o e-mail
   *  sai assim mesmo, com o caminho de responder, em vez de não sair. */
  portalLink?: string;
  /** A estimativa passou da verba que o cliente declarou.
   *
   *  Existe porque o CityJobs, em 16/08/2026, disse *"algo em torno de R$ 500
   *  por mês"* e recebeu R$ 1.800–3.400 sem uma palavra sobre a diferença.
   *  Aqui entra só o RECONHECIMENTO, sem número e sem oferta: quem nomeia a
   *  diferença e lista o que cabe é a conversa. Duas versões da mesma conta em
   *  dois lugares divergem no primeiro ajuste. */
  verbaEstourada?: boolean;
}

export function orcamentoProntoEmail(input: OrcamentoProntoInput): {
  subject: string;
  html: string;
} {
  const name = input.prospectName?.trim();
  const biz = input.businessName?.trim();
  const greeting = name ? `Olá, ${esc(name)}!` : "Olá!";
  const faixa = input.faixa?.trim();

  const corpo: string[] = [
    blocoDeTexto(
      biz
        ? `O orçamento da ${biz} está pronto e já está na sua conversa com a gente.`
        : "O seu orçamento está pronto e já está na sua conversa com a gente.",
    ),
  ];

  if (faixa) {
    corpo.push(
      blocoRotulado(
        "Estimativa",
        `<p style="margin:0;font-size:26px;font-weight:700;line-height:1.2;color:${CORES.navy}">${esc(faixa)}</p>`,
      ),
    );
  }

  if (input.verbaEstourada) {
    corpo.push(
      blocoDeTexto(
        "Você comentou uma verba menor que isso — a gente nomeia a diferença na conversa e mostra o que cabe no seu momento. Preferimos te dizer agora do que mandar um número que não cabe.",
      ),
    );
  }

  // O botão só existe quando há link de verdade. Botão que leva a lugar nenhum
  // é pior que ausência de botão: o cliente clica, não acontece nada, e conclui
  // que a agência está quebrada.
  if (input.portalLink) {
    corpo.push(blocoDeBotao(input.portalLink, "Ver o orçamento completo"));
  }

  corpo.push(
    blocoDeTexto(
      "É uma estimativa a partir do que você contou, não a proposta final — o detalhamento, o que entra e o que fica de fora estão lá na conversa. Se algo estiver diferente do que você precisa, é só responder por lá.",
    ),
  );

  return {
    subject: biz ? `Seu orçamento está pronto — ${biz}` : "Seu orçamento está pronto",
    html: moldeDoEmail({
      saudacao: greeting,
      corpo,
      notaDoRodape: "Este é um aviso automático. A conversa completa fica no seu portal.",
    }),
  };
}
