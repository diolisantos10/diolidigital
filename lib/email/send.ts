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

/**
 * O remetente compartilhado da Resend. **NÃO é mais um fallback de envio** —
 * ver `SEM_REMETENTE` logo abaixo. Fica declarado aqui porque é o valor que a
 * Resend usaria, e nomear o que se recusa a fazer vale mais que apagá-lo.
 */
const REMETENTE_COMPARTILHADO_DA_RESEND = "Dioli Studio <onboarding@resend.dev>";

/** Motivo devolvido quando a chave não está configurada (ou está em branco). */
export const SEM_CHAVE = "sem_chave: RESEND_API_KEY não configurada (ausente ou vazia) no ambiente";

/**
 * ⛔ O REMETENTE AUSENTE VIRA RECUSA — e o motivo, em 25/08/2026, é MEDIDO.
 *
 * `GET /api/agency/diagnostico-de-email` em produção, nesta data, respondeu:
 * `RESEND_API_KEY` **válida** (`restricted_api_key`, que é o certo para chave
 * de aplicação) e `RESEND_FROM` **ausente**. Sem ela, esta função caía no
 * remetente compartilhado da Resend — que entrega SÓ para o dono da conta
 * Resend. Cliente nenhum recebe.
 *
 * E o envio voltava `{ ok: true, id }`. Esse é o defeito, e ele é pior que o
 * silêncio: `orcamento-do-briefing.ts` gravava `avisoOrcamentoStatus =
 * "avisado"`, e a fila de reenvio **nunca busca "avisado"** (é justamente essa
 * regra que impede o cliente de receber o orçamento duas vezes). Ou seja: cada
 * aviso que "saiu" ficava marcado como entregue **para sempre**, e nem o dia em
 * que o `RESEND_FROM` existir os traria de volta. Régua verde sobre o
 * componente errado mata a dúvida e deixa o defeito.
 *
 * Agora é recusa `skipped` — o mesmo balde de "sem chave", que a fila de
 * reenvio BUSCA (`falhou`/`skipped`). Consequência: no minuto em que o CEO
 * cadastrar `RESEND_FROM` num domínio verificado, todo mundo que ficou sem
 * aviso é avisado, sem duplicar quem já recebeu.
 *
 * ⚠️ O QUE ISTO **NÃO** RESOLVE, e é do CEO: cadastrar `RESEND_FROM` no
 * Railway com um endereço de domínio VERIFICADO na conta Resend. Não há
 * contorno em código — e inventar um remetente num domínio não verificado
 * trocaria este erro claro por um 403 da Resend.
 */
export const SEM_REMETENTE =
  `sem_remetente: RESEND_FROM não está no ambiente. Sem ela a casa enviaria por ${REMETENTE_COMPARTILHADO_DA_RESEND}, ` +
  "que a Resend entrega SÓ para o dono da conta — cliente nenhum receberia, e a casa registraria 'avisado'. " +
  "Ação do CEO: cadastrar RESEND_FROM no Railway com um endereço de domínio verificado na Resend.";

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

  // ⛔ FAIL-CLOSED NO REMETENTE. Antes daqui havia `|| DEFAULT_FROM`, e era
  // uma porta que dizia "entreguei" sem entregar. Ver `SEM_REMETENTE`.
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    return { ok: false, skipped: true, error: SEM_REMETENTE };
  }

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
