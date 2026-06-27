// Minimal transactional e-mail sender backed by Resend's HTTP API.
//
// Design goals:
//   - ZERO hard dependency: uses fetch, no SDK to install.
//   - SAFE BY DEFAULT: when RESEND_API_KEY is absent it returns
//     { ok: false, skipped: true } instead of throwing, so any caller
//     (e.g. the public briefing submit) keeps working with e-mail disabled.
//   - DIAGNOSABLE: on failure it surfaces Resend's actual error text.
//
// Configuration (Railway Variables):
//   RESEND_API_KEY   required to actually send (starts with "re_")
//   RESEND_FROM      sender address. Must be on a domain verified in Resend,
//                    e.g. "Dioli Studio <contato@dioli.studio>". Falls back to
//                    Resend's shared onboarding sender, which can ONLY deliver
//                    to the Resend account owner's own address (testing only).

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

const DEFAULT_FROM = "Dioli Studio <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // E-mail not configured — no-op so the calling flow never breaks.
    return { ok: false, skipped: true };
  }

  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const reason = `resend_${res.status}: ${detail.slice(0, 300)}`;
      console.error("[email/send] failed:", reason);
      return { ok: false, error: reason };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown";
    console.error("[email/send] threw:", reason);
    return { ok: false, error: reason };
  }
}
