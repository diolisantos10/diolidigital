/**
 * A GUARDA DO E-MAIL COMO ELA ERA EM `2030ca6` — copiada byte a byte.
 *
 * Guardada aqui porque a régua do `qualidade` é explícita: prova de conserto
 * precisa das duas metades, e a metade que REPROVA o código de ontem só vale se
 * o código de ontem for **executado**, não descrito. O conserto do E1 mudou o
 * CONTRATO da rota (dois campos em vez de um), e nesse gesto todo teste novo
 * passaria a chamar uma assinatura que não existia — é o mesmo impasse do C1.
 *
 * ── O que ela fazia, e onde estava ─────────────────────────────────────────
 * `app/api/sdr/chat/route.ts:355`:
 *
 *     const msgHasAt = body.currentMessage.includes("@");
 *     if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) { ...recusa o turno }
 *
 * E `currentMessage` era montado no NAVEGADOR
 * (`PublicBriefingRoom.tsx:2018-2019` e `2068-2069`) como
 * `` `${text}\n\n${dossie}` `` — o dossiê carregando o texto extraído dos
 * arquivos. Qualquer PDF com um e-mail dentro fazia `msgHasAt` virar `true`, e
 * como o dossiê é remontado a CADA turno, a guarda ficava desligada pelo resto
 * da conversa.
 */

/** A expressão da rota, idêntica. */
export const EMAIL_HALLUCINATION_COMO_EM_2030CA6 =
  /e-mail.*v[áa]lid|formato.*@|nome@dom[íi]nio|confirmar.*e-mail|e-mail.*formato|qual.*seu e-mail|seu e-mail/i;

/**
 * A montagem do navegador de ontem: um campo só.
 */
export function montarMensagemComoEm2030ca6(texto: string, dossie: string): string {
  return dossie ? `${texto}\n\n${dossie}` : texto;
}

/**
 * A guarda de ontem. Devolve `true` quando o turno é RECUSADO (guarda armada e
 * disparando) e `false` quando ele passa — inclusive quando passa porque a
 * guarda foi desarmada, que é o defeito.
 */
export function guardaDoEmailComoEm2030ca6(currentMessage: string, replyText: string): boolean {
  const msgHasAt = currentMessage.includes("@");
  return !msgHasAt && EMAIL_HALLUCINATION_COMO_EM_2030CA6.test(replyText);
}
