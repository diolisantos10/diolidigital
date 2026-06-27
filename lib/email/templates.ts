// E-mail templates (HTML). Plain inline styles for broad client support.
// IMPORTANT: prospect-facing templates NEVER include prices — the briefing
// flow deliberately withholds values until the agency reviews the scope.

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
            <tr><td style="padding:2px 0">3. Entramos em contato por este e-mail em até 1 dia útil</td></tr>
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
