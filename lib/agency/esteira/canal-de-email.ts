// canal-de-email.ts — O SEGUNDO CANAL DO AVISO, CONSTRUÍDO E DESLIGADO.
//
// ── O defeito, medido em 15/08/2026 ────────────────────────────────────────
//
// `avisarCliente` tinha UM caminho de saída: `tentarWhatsApp`. Fora da janela de
// 24h a Meta recusa texto livre — que é justamente o caso do aviso de trabalho
// parado, porque trabalho parado por definição já esperou. Então o caminho
// automático da casa é o que a plataforma mais recusa, e todo o resto vira fila
// para mão humana.
//
// A casa TEM um remetente de e-mail desde sempre (`lib/email/send.ts`, Resend,
// já usado na confirmação do briefing) e `Client.email` é coluna de verdade no
// schema. **O canal existia dos dois lados e ninguém ligou o meio** — o mesmo
// padrão do material do portal (08/08) e do link morto (15/08).
//
// ── POR QUE ELE NASCE DESLIGADO, E ISSO NÃO É COVARDIA ─────────────────────
//
// E-mail que sai é ato irreversível em nome de um cliente pagante, e esta casa
// roda **100% IA, sem revisão humana antes do entregável**. Ligar um canal de
// saída novo no mesmo ato em que ele é escrito é exatamente o gesto que a trava
// de plataforma de 03/08 existe para impedir.
//
// São **DUAS** condições, e as duas têm de ser verdade:
//
//   1. `AVISO_POR_EMAIL=on` — o interruptor explícito. Ausente = desligado.
//   2. `RESEND_API_KEY` presente — sem chave, `sendEmail` já devolve
//      `{ ok:false, skipped:true }` sem tocar a rede.
//
// Fail-closed nas duas pontas: falta qualquer uma e a função **não abre socket
// nenhum** e devolve o motivo. Não há caminho em que o silêncio pareça envio.
//
// ── O QUE FALTA PARA LIGAR, e de quem é o ato ─────────────────────────────
//
//   • `AVISO_POR_EMAIL=on` no Railway ................. ato do CEO/Diretor
//   • `RESEND_API_KEY` no Railway ..................... ato do CEO (é a conta dele)
//   • `RESEND_FROM` num domínio verificado no Resend .. ato do CEO
//
// ⚠️ Sem `RESEND_FROM`, `lib/email/send.ts` cai no remetente compartilhado
// `onboarding@resend.dev`, que **só entrega ao dono da conta Resend**. Ligar o
// interruptor sem verificar o domínio produziria o pior estado possível:
// `ok: true` no registro e nenhum cliente recebendo nada.

import { sendEmail } from "@/lib/email/send";

export interface EnvioPorEmail {
  /** Saiu de verdade. */
  ok: boolean;
  /** Nem tentou — canal desligado ou sem endereço. NUNCA é `ok`. */
  naoTentou: boolean;
  /** Em português, sempre. */
  motivo: string;
}

/** O interruptor. Só a string "on" liga — qualquer outra coisa (vazio, "true",
 *  "1", "sim") deixa desligado, de propósito: interruptor que liga por engano é
 *  o que manda e-mail para cliente real numa segunda-feira. */
export function emailLigado(): boolean {
  return (process.env.AVISO_POR_EMAIL ?? "").trim().toLowerCase() === "on";
}

/** Por que o canal está fechado, com todas as letras. `null` = está aberto. */
export function porQueOEmailEstaFechado(): string | null {
  if (!emailLigado()) {
    return "o canal de e-mail está DESLIGADO (AVISO_POR_EMAIL não é \"on\") — máquina pronta, interruptor com o CEO";
  }
  if (!process.env.RESEND_API_KEY) {
    return "AVISO_POR_EMAIL está ligado mas não há RESEND_API_KEY — nenhum e-mail sai, e isto é falha de configuração, não silêncio";
  }
  return null;
}

/** Escapa o que vai para dentro do HTML. Texto de aviso é redigido pela casa,
 *  mas passa por nome de cliente e por link — e nome com `<` viraria marcação. */
function seguro(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * O corpo do e-mail. Função PURA — testável sem rede, sem chave e sem banco.
 *
 * Sem link, o e-mail sai assim mesmo e **diz que o link não está disponível**.
 * Um botão "abrir o portal" apontando para lugar nenhum é o defeito que este
 * módulo nasceu ao lado de consertar.
 */
export function corpoDoEmail(input: { texto: string; link: string | null }): string {
  const paragrafos = input.texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1F2430">${seguro(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const acao = input.link
    ? `<p style="margin:22px 0 0"><a href="${seguro(input.link)}" style="display:inline-block;background:#101828;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600">Abrir o seu portal</a></p>`
    : `<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6B7280">O link do seu portal não está disponível neste momento — responda este e-mail e a gente reenvia.</p>`;

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px">
${paragrafos}${acao}
<p style="margin:28px 0 0;font-size:12px;color:#9AA1AC">Dioli Digital</p>
</div>`;
}

/**
 * Manda o aviso por e-mail — **se, e só se, os dois interruptores estiverem
 * ligados e houver endereço.**
 *
 * Nunca lança. Nunca devolve `ok: true` sem `sendEmail` ter respondido `ok`.
 */
export async function avisarPorEmail(input: {
  para: string | null | undefined;
  assunto: string;
  texto: string;
  link: string | null;
}): Promise<EnvioPorEmail> {
  const fechado = porQueOEmailEstaFechado();
  if (fechado) return { ok: false, naoTentou: true, motivo: fechado };

  const para = (input.para ?? "").trim();
  // Piso mínimo de forma. Endereço malformado vira bounce, e bounce em massa
  // queima a reputação do domínio da agência — dano que sobrevive ao aviso.
  if (!para || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) {
    return {
      ok: false, naoTentou: true,
      motivo: para
        ? "o e-mail cadastrado do cliente não tem forma de endereço válido"
        : "o cliente não tem e-mail cadastrado",
    };
  }

  const r = await sendEmail({
    to: para,
    subject: input.assunto,
    html: corpoDoEmail({ texto: input.texto, link: input.link }),
  }).catch((e: unknown) => ({
    ok: false as const,
    error: e instanceof Error ? e.message.slice(0, 140) : "erro",
  }));

  if (r.ok) return { ok: true, naoTentou: false, motivo: "enviado por e-mail" };
  // `skipped` só acontece se a chave sumir entre a conferência e o envio —
  // ainda assim é "não tentou", nunca falha do cliente.
  if ("skipped" in r && r.skipped) {
    return { ok: false, naoTentou: true, motivo: "RESEND_API_KEY sumiu no meio do envio — nada saiu" };
  }
  return { ok: false, naoTentou: false, motivo: r.error ?? "o provedor de e-mail recusou o envio" };
}
