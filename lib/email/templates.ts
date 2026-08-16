// E-mail templates (HTML). Plain inline styles for broad client support.
//
// ── A REGRA DE VALOR, E O DIA EM QUE ELA MUDOU DE FORMA ─────────────────────
//
// Esta linha ficou aqui por meses: *"prospect-facing templates NEVER include
// prices — the briefing flow deliberately withholds values until the agency
// reviews the scope."* A premissa dela morreu em 16/08/2026, quando a casa
// passou a ENTREGAR a estimativa sozinha, sem revisão da agência
// (`lib/agency/esteira/orcamento-do-briefing.ts`).
//
// A regra que vale agora, e é mais estreita:
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  const bizLine = biz
    ? `Recebemos o pedido de orçamento para <strong>${esc(biz)}</strong>.`
    : "Recebemos o seu pedido de orçamento.";

  const services = (input.services ?? []).filter((s) => typeof s === "string" && s.trim());
  const servicesBlock =
    services.length > 0
      ? `<tr><td style="padding:0 0 16px">
           <p style="margin:0 0 6px;font-size:12px;color:#9B9B95;text-transform:uppercase;letter-spacing:.06em;font-weight:600">O que você pediu</p>
           <p style="margin:0;font-size:15px;color:#1A1A1A">${esc(services.join(" · "))}</p>
         </td></tr>`
      : "";

  const subject = biz
    ? `Recebemos seu pedido — ${biz}`
    : "Recebemos seu pedido de orçamento";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F6;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E5E5E2;border-radius:14px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1A1A1A;letter-spacing:.02em">DIOLI STUDIO</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0">
          <h1 style="margin:0 0 12px;font-size:20px;color:#1A1A1A">${greeting}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A3A38">
            ${bizLine} Nossa equipe já está com ele em mãos.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${servicesBlock}
          </table>
        </td></tr>
        <tr><td style="padding:4px 32px 0">
          <p style="margin:0 0 8px;font-size:12px;color:#9B9B95;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Próximos passos</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3A3A38;line-height:1.6">
            <tr><td style="padding:2px 0">1. Analisamos o escopo que você enviou</td></tr>
            <tr><td style="padding:2px 0">2. Preparamos uma proposta formal detalhada</td></tr>
            <!-- ⛔ SEM PRAZO. Ordem do CEO em 16/08/2026: *"em relação à
                 confirmação de promessa, de orçamento em um dia, não autorizei
                 nada disso."* Este e-mail é a IRMÃ da tela de confirmação: as
                 duas nasceram do mesmo texto, e consertar só a que aparece no
                 print deixa a promessa viva na caixa de entrada do cliente. -->
            <tr><td style="padding:2px 0">3. Entramos em contato por este e-mail</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 28px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6B6B65">
            Quer adiantar algo? É só responder este e-mail ou falar com a gente no
            WhatsApp <a href="https://wa.me/5511989400692" style="color:#1A1A1A;font-weight:600;text-decoration:none">(11) 98940-0692</a>.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#FAFAF9;border-top:1px solid #F0F0ED">
          <p style="margin:0;font-size:11px;color:#9B9B95">Dioli Studio · Este é um e-mail automático de confirmação.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO DE QUE O ORÇAMENTO FICOU PRONTO
//
// A pergunta do CEO em 16/08/2026, com o piloto no ar: *"nada ainda via e-mail.
// O que aconteceu?"*
//
// O que tinha acontecido: o orçamento foi calculado, o texto foi escrito e a
// conversa do portal recebeu tudo — e ninguém avisou o destinatário. A casa
// mandava e-mail na CONFIRMAÇÃO do briefing e ficava muda justamente na hora da
// coisa que o cliente estava esperando. É o defeito D-003 outra vez: caixa
// certa, seta faltando. Na véspera o CEO esperou a noite inteira por uma seta;
// no dia seguinte, pela seta seguinte.
//
// ── O QUE ESTE E-MAIL É, E O QUE ELE NÃO É ──────────────────────────────────
//
// Ele é um TOQUE NO OMBRO: o essencial (a faixa que já está no portal) e o link
// para ver o resto. **Ele não substitui o portal** — a conversa continua sendo
// a fonte da verdade, é lá que o cliente responde e é lá que a equipe lê. Um
// e-mail que tentasse ser a conversa inteira criaria uma segunda verdade, e
// duas verdades divergem no primeiro ajuste de escopo.
//
// ⛔ SEM PRAZO. Mesma ordem do CEO que tirou o "em 1 dia" da tela de
// confirmação e do e-mail de confirmação. Prazo prometido por máquina é dívida
// que a agência paga.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrcamentoProntoInput {
  prospectName?: string;
  businessName?: string;
  /** A faixa JÁ DERIVADA e já escrita no portal. Este template não calcula
   *  nada: ele recebe o número pronto ou não mostra número nenhum. */
  faixa?: string;
  /** O endereço da conversa no portal. Ausente quando não há token — o e-mail
   *  sai assim mesmo, com o caminho de responder, em vez de não sair. */
  portalLink?: string;
  /** A estimativa passou da verba que o cliente declarou.
   *
   *  Existe porque o CityJobs, em 16/08/2026, disse *"algo em torno de R$ 500
   *  por mês"* e recebeu R$ 1.800–3.400 sem uma palavra sobre a diferença. O
   *  portal passou a nomear a diferença e oferecer o que cabe; se o e-mail
   *  mostrasse só a faixa, o número chegaria NU na caixa de entrada — e o
   *  primeiro lugar onde o cliente lê o valor é justamente o e-mail.
   *
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

  const subject = biz
    ? `Seu orçamento está pronto — ${biz}`
    : "Seu orçamento está pronto";

  const faixa = input.faixa?.trim();
  const faixaBlock = faixa
    ? `<tr><td style="padding:0 0 4px">
         <p style="margin:0 0 6px;font-size:12px;color:#9B9B95;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Estimativa</p>
         <p style="margin:0;font-size:22px;font-weight:700;color:#1A1A1A">${esc(faixa)}</p>
       </td></tr>`
    : "";

  const verbaBlock = input.verbaEstourada
    ? `<tr><td style="padding:12px 0 0">
         <p style="margin:0;font-size:14px;line-height:1.6;color:#3A3A38">
           Você comentou uma verba menor que isso — a gente nomeia a diferença
           na conversa e mostra o que cabe no seu momento. Preferimos te dizer
           agora do que mandar um número que não cabe.
         </p>
       </td></tr>`
    : "";

  // O botão só existe quando há link de verdade. Botão que leva a lugar nenhum
  // é pior que ausência de botão: o cliente clica, não acontece nada, e ele
  // conclui que a agência está quebrada.
  const linkBlock = input.portalLink
    ? `<tr><td style="padding:20px 32px 4px">
         <a href="${esc(input.portalLink)}" style="display:inline-block;background:#1A1A1A;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px">Ver o orçamento completo</a>
       </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F6;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E5E5E2;border-radius:14px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1A1A1A;letter-spacing:.02em">DIOLI STUDIO</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0">
          <h1 style="margin:0 0 12px;font-size:20px;color:#1A1A1A">${greeting}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A3A38">
            O orçamento${biz ? ` da <strong>${esc(biz)}</strong>` : ""} está pronto e já está na sua conversa com a gente.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${faixaBlock}
            ${verbaBlock}
          </table>
        </td></tr>
        ${linkBlock}
        <tr><td style="padding:20px 32px 28px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6B6B65">
            É uma estimativa a partir do que você contou, não a proposta final —
            o detalhamento, o que entra e o que fica de fora estão lá na conversa.
            Se algo estiver diferente do que você precisa, é só responder por lá
            ou responder este e-mail.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#FAFAF9;border-top:1px solid #F0F0ED">
          <p style="margin:0;font-size:11px;color:#9B9B95">Dioli Studio · Este é um aviso automático. A conversa completa fica no seu portal.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
