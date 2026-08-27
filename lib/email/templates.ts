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

// ═══════════════════════════════════════════════════════════════════════════
// OS TRÊS E-MAILS QUE FALTAVAM — 27/08/2026
// ═══════════════════════════════════════════════════════════════════════════
//
// A casa tinha DOIS e-mails: a confirmação do briefing e o orçamento. Faltavam
// os três momentos em que o cliente mais precisa de notícia — e a falta não era
// cosmética:
//
//   1. **A peça ficou pronta e ninguém batia na porta dele.** A entrega
//      acontecia, o portal era atualizado, e o cliente só descobria se abrisse
//      o portal por conta própria. É o e-mail mais importante que faltava:
//      a agência terminava o trabalho e ficava esperando em silêncio.
//   2. **O atraso era contado para a casa, não para o cliente.** O Gerente
//      Geral detectava o prazo queimado e gravava uma `PortalMessage`. O
//      comentário em `batida-da-v2.ts` já dizia a régua certa — *"coluna
//      gravada não é cliente informado"* — logo acima do código que gravava a
//      coluna e parava ali.
//   3. **O cliente não recebia o caminho de volta.** Foi por isso que uma
//      travessia inteira precisou cunhar link à mão.
//
// ── TODOS SAEM PELO MOLDE, E ISSO É TRAVA, NÃO COMBINADO ───────────────────
// `lib/email/trava-do-molde.ts` recusa na porta o que não tem o cabeçalho da
// marca, o rodapé assinado, ou o que estampa valor. Nenhum destes três escreve
// `<!DOCTYPE>`, rodapé ou nome próprio: tudo vem de `moldeDoEmail`.
//
// ── E NENHUM DELES TEM PREÇO ───────────────────────────────────────────────
// Ordem do CEO: o e-mail é CONVITE, não proposta. Preço lido sozinho, sem
// ninguém do outro lado, é preço que o cliente compara e descarta em silêncio.

/** O que estes três precisam saber sobre quem vai ler. */
interface DestinatarioDoAviso {
  prospectName?: string;
  businessName?: string;
  /** O caminho de volta. Sem ele, não nasce botão — botão que não leva a lugar
   *  nenhum é pior que ausência de botão. */
  portalLink?: string;
}

function saudacaoDe(nome?: string): string {
  const n = nome?.trim();
  return n ? `Olá, ${esc(n)}!` : "Olá!";
}

export interface PecaProntaInput extends DestinatarioDoAviso {
  /** Quantas peças ficaram prontas. Governa o plural — e só isso. */
  quantasPecas?: number;
  /**
   * O aviso de que a publicação automática ainda não existe.
   *
   * ⚠️ DERIVADO, nunca constante: quem chama passa
   * `avisoDeAgendamentoManual()`, que sai de `freioSolto()`. No dia em que a
   * Meta liberar, o aviso some sozinho. Uma constante aqui criaria texto
   * fóssil — a tela continuaria negando algo que a casa passou a ter, e
   * ninguém apaga texto que não dá erro.
   */
  avisoDePublicacaoManual?: string | null;
}

/**
 * "SUA PEÇA ESTÁ PRONTA" — o e-mail que faltava, e o mais importante deles.
 *
 * Dispara no evento REAL: `apresentar()` → `falarComOCliente` →
 * `avisarCliente({ tipo: "entrega" })`. Não há segundo caminho de envio, e é de
 * propósito: *verdade escrita em dois lugares já está errada em um deles.*
 */
export function pecaProntaEmail(input: PecaProntaInput): { subject: string; html: string } {
  const biz = input.businessName?.trim();
  const n = typeof input.quantasPecas === "number" && input.quantasPecas > 0 ? input.quantasPecas : null;
  const quantas =
    n === null ? "O seu material" : n === 1 ? "A sua peça" : `As suas ${n} peças`;

  const corpo: string[] = [
    blocoDeTexto(
      `${quantas} ${n === 1 || n === null ? "está pronta" : "estão prontas"} e ${
        n !== null && n > 1 ? "esperam" : "espera"
      } a sua olhada. Está tudo no seu portal, na aba de aprovações.`,
    ),
    blocoDeTexto(
      "Lá você pode aprovar, pedir ajuste, recusar ou cancelar — cada peça, uma por uma. " +
        "Se algo não ficou como você imaginava, é só dizer o que mudar: refazer faz parte.",
    ),
  ];

  if (input.portalLink) corpo.push(blocoDeBotao(input.portalLink, "Ver o meu material"));

  // O aviso da publicação manual entra AQUI e não em outro lugar: é neste
  // e-mail que o cliente passa a esperar o material no ar. Quem vai aprovar
  // precisa saber o que acontece depois do sim.
  if (input.avisoDePublicacaoManual) corpo.push(blocoDeTexto(input.avisoDePublicacaoManual));

  return {
    subject: biz ? `Seu material está pronto — ${biz}` : "Seu material está pronto",
    html: moldeDoEmail({
      saudacao: saudacaoDe(input.prospectName),
      previa: "Está no seu portal, na aba de aprovações. É só abrir e dizer o que achou.",
      corpo,
      notaDoRodape: "Este é um aviso automático. Suas peças e a conversa ficam no seu portal.",
    }),
  };
}

export interface AvisoDeAtrasoInput extends DestinatarioDoAviso {
  /** O que atrasou, em palavras do cliente. Sem jargão, sem nome de coluna. */
  oQueAtrasou?: string;
}

/**
 * "AVISO DE ATRASO" — a casa avisando ANTES de o cliente perguntar.
 *
 * ⛔ ESTE E-MAIL NÃO PROMETE DATA NOVA, e a omissão é decisão. Uma data nova
 * dada no susto é a segunda promessa quebrada esperando para acontecer — e a
 * primeira acabou de ser. A casa reconhece, diz que está em cima, e chama para
 * a conversa, onde a data sai com quem responde por ela.
 *
 * Também NÃO carrega direção interna: por que atrasou é assunto da casa. O
 * cliente recebe o fato e o próximo passo.
 */
export function avisoDeAtrasoEmail(input: AvisoDeAtrasoInput): { subject: string; html: string } {
  const biz = input.businessName?.trim();
  const oQue = input.oQueAtrasou?.trim();

  const corpo: string[] = [
    blocoDeTexto(
      oQue
        ? `Passei para te avisar: ${esc(oQue)} não vai sair no prazo que combinamos.`
        : "Passei para te avisar: uma entrega sua não vai sair no prazo que combinamos.",
    ),
    blocoDeTexto(
      "Preferimos te contar agora a deixar você descobrir pelo silêncio. " +
        "Estamos em cima, e assim que tiver uma data que a gente consiga cumprir, ela vai para o seu portal — " +
        "com quem responde por ela do outro lado.",
    ),
  ];

  if (input.portalLink) corpo.push(blocoDeBotao(input.portalLink, "Falar com a gente"));

  return {
    subject: biz ? `Um aviso sobre o seu prazo — ${biz}` : "Um aviso sobre o seu prazo",
    html: moldeDoEmail({
      saudacao: saudacaoDe(input.prospectName),
      previa: "Uma entrega sua vai atrasar. Preferimos te contar agora.",
      corpo,
      notaDoRodape: "Este é um aviso automático. A conversa completa fica no seu portal.",
    }),
  };
}

/**
 * "SEU LINK DO PORTAL" — o caminho de volta.
 *
 * O portal é onde tudo acontece (peças, aprovações, conversa, orçamento) e o
 * cliente não recebia o endereço dele. Foi por isso que uma travessia inteira
 * precisou cunhar link à mão.
 *
 * ⚠️ SEM LINK, ESTE E-MAIL NÃO EXISTE — quem chama recebe `null`. Um e-mail
 * chamado "seu link do portal" sem link é a definição de promessa vazia, e ele
 * NASCERIA fora do único motivo de existir.
 */
export function linkDoPortalEmail(
  input: DestinatarioDoAviso,
): { subject: string; html: string } | null {
  if (!input.portalLink) return null;
  const biz = input.businessName?.trim();

  return {
    subject: biz ? `Seu acesso ao portal — ${biz}` : "Seu acesso ao portal",
    html: moldeDoEmail({
      saudacao: saudacaoDe(input.prospectName),
      previa: "É por aqui que você acompanha tudo. Guarde este link.",
      corpo: [
        blocoDeTexto(
          "Este é o seu caminho de volta. No portal ficam as suas peças, as aprovações, " +
            "os pedidos de material e a conversa com a gente — tudo no mesmo lugar.",
        ),
        blocoDeBotao(input.portalLink, "Abrir o meu portal"),
        blocoDeTexto(
          "Guarde este e-mail: o link é só seu e não pede senha. " +
            "Se em algum momento ele parar de funcionar, é só responder aqui que a gente manda outro.",
        ),
      ],
      notaDoRodape: "Este é um aviso automático. O portal é o seu acesso a tudo o que fazemos para você.",
    }),
  };
}
