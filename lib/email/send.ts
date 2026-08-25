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

import {
  motivoDoBloqueio,
  registrarSaidaBloqueada,
} from "@/lib/agency/cliente-falso/trava-de-saida";
import {
  avaliarConsentimento, comoDestravar, registrarAbordagemBarrada,
  type ConsentimentoDeSaida,
} from "@/lib/agency/consentimento/prova";

export interface SendEmailInput {
  to: string;
  /**
   * ⛔ OBRIGATÓRIO. A mesma pergunta do WhatsApp: isto é resposta a quem
   * procurou a casa, ou abordagem? E, sendo abordagem, cadê a prova?
   *
   * Obrigatório de propósito — porta de saída nova sem consentimento declarado
   * não compila. Ver `lib/agency/consentimento/prova.ts`.
   */
  consentimento: ConsentimentoDeSaida;
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

/** Motivo devolvido quando a chave não está configurada (ou está em branco). */
export const SEM_CHAVE = "sem_chave: RESEND_API_KEY não configurada (ausente ou vazia) no ambiente";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // ⛔ A TRAVA VEM ANTES DE TUDO — inclusive antes de ler a chave.
  //
  // O cliente falso (23/08/2026) dirige a esteira REAL de ponta a ponta, e a
  // esteira real manda e-mail em dois pontos: a confirmação do briefing e a
  // entrega do orçamento. Se a trava morasse depois do `if (!apiKey)`, ela
  // valeria só nas máquinas SEM chave configurada — ou seja, valeria por sorte
  // de ambiente, e produção TEM chave. A sonda de 23/08 mediu a tentativa
  // acontecendo: *"confirmation e-mail skipped — RESEND_API_KEY not set"*.
  //
  // Isto não é caminho de teste enxertado em código de produção por
  // conveniência: trava de saída tem de morar NA saída.
  //
  // ⚠️ CORRIGIDO EM 24/08/2026 — AQUI DIZIA UMA MEDIÇÃO VENCIDA. O texto
  // afirmava que esta era *"a Única porta de saída de mensagem da casa (medido
  // — não há outro remetente; o WhatsApp é link `wa.me`, não envio
  // programático)"*. Era verdade quando foi escrito e virou mentira depois,
  // sem que ninguém relesse: hoje há QUATRO portas —
  //
  //   sendWhatsAppDirect   → POST {phoneNumberId}/messages    (Meta)
  //   publishPost          → publica no Instagram do cliente
  //   publicarNoGoogle     → posta no perfil Google do cliente
  //   responderAvaliacao   → responde avaliação pública do cliente
  //
  // As três novas ficaram SEM CADEADO NENHUM até 24/08. A lição não é sobre
  // e-mail: **afirmação medida tem prazo de validade, e "medido" no comentário
  // é o que faz a próxima pessoa não remedir.** Se você acrescentar uma porta
  // de saída, ela entra em `trava-de-saida.ts` e nesta lista.
  //
  // Ver `lib/agency/cliente-falso/trava-de-saida.ts` para os cadeados de cada
  // canal — e para quantos cada um tem DE VERDADE (`CADEADOS_POR_CANAL`).
  const bloqueio = motivoDoBloqueio(input.to);
  if (bloqueio) {
    registrarSaidaBloqueada({ canal: "email", destino: input.to, assunto: input.subject, motivo: bloqueio });
    return { ok: false, skipped: true, error: `bloqueado:${bloqueio}` };
  }

  // ── TRAVA DE CONSENTIMENTO — TAMBÉM ANTES DA CHAVE ──────────────────────
  // Pelo mesmo motivo do bloco acima: trava que mora depois de ler a chave é
  // trava que vale por sorte de ambiente.
  const consent = avaliarConsentimento(input.consentimento);
  if (!consent.pode) {
    registrarAbordagemBarrada({ canal: "email", destino: input.to, motivo: consent.motivo });
    return { ok: false, error: `sem_consentimento:${consent.motivo}\n${comoDestravar(consent)}` };
  }

  // `.trim()` de propósito: variável CADASTRADA COM VALOR EM BRANCO (ou só
  // espaço) é o modo de falha mais traiçoeiro do Railway — o nome aparece na
  // lista, então quem audita conclui "está configurada", e o header
  // `Authorization: Bearer ` sairia vazio para a Resend, que responderia um
  // 401 genérico. Aqui isso vira o MESMO caso de "não configurada", dito com
  // essa palavra.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // E-mail not configured — no-op so the calling flow never breaks.
    //
    // ⚠️ O `error` NÃO É DECORAÇÃO (medido em 25/08/2026). Antes daqui este
    // ramo devolvia `{ ok:false, skipped:true }` mudo, e o bloco de cima —
    // a trava de saída — devolve `{ ok:false, skipped:true, error:"bloqueado:…" }`.
    // Dois motivos OPOSTOS, a mesma forma. Quem chamava (`orcamento-do-briefing.ts`)
    // lia só `r.skipped` e gravava no banco a frase fixa "RESEND_API_KEY ausente".
    // Resultado medido em produção: dois pedidos do CLIENTE FALSO, com contato
    // `@cliente-falso.invalid`, barrados corretamente pela trava `.invalid` e
    // registrados na tela do CEO como "RESEND_API_KEY ausente" — a chave EXISTE
    // no Railway. A tela mandava o CEO configurar uma chave que já estava lá,
    // e escondia que a trava de teste é que tinha funcionado.
    //
    // Status de erro não é motivo; o motivo está na mensagem. Quem devolve
    // `skipped` devolve TAMBÉM por quê, e quem grava copia o porquê recebido em
    // vez de adivinhar.
    return { ok: false, skipped: true, error: SEM_CHAVE };
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
