// ritmo.ts — QUANTO FALTA ESPERAR. A régua do espaçamento, pura e testável.
//
// ─── Por que existe (15/08/2026) ────────────────────────────────────────────
//
// Três pernas desta casa precisam da MESMA pergunta: *"já dá para tocar este
// alvo de novo, ou ele foi tocado agora há pouco?"*
//
//   • publicação — duas peças no mesmo perfil não saem no mesmo minuto;
//   • avaliações do Google — o perfil público não recebe cinco respostas de uma
//     vez, porque isso parece robô para qualquer um que olhe;
//   • guardião de verba — a Meta só atualiza insights a cada 15 min, e ler de 5
//     em 5 é ritmo de máquina sem ganho contra uma conta já restringida uma vez.
//
// A régua nasceu em `lib/agency/esteira/publicacao.ts` (`faltaEsperar`) e está
// copiada aqui **byte a byte no comportamento**, com um teste que compara as
// duas em cima da mesma tabela de entradas e reprova a divergência.
//
// ⚠️ DÍVIDA DECLARADA: o certo é `publicacao.ts` importar daqui e o repositório
//    ter UMA implementação. Não foi feito nesta rodada porque aquele arquivo
//    está sob ordem explícita de não ser tocado (parecer do especialista `meta`
//    sobre a publicação orgânica, 15/08/2026), e mexer nele para arrumar a casa
//    de outra frente é exatamente como se quebra o que estava certo. A unificação
//    é proposta escrita no PR, e o teste de concordância é o que segura a ponte
//    enquanto ela não acontece.

/**
 * Quanto falta esperar antes do próximo toque neste alvo. `0` = pode ir.
 *
 * Fail-closed nas duas bordas:
 *   • data no FUTURO (relógio torto, registro digitado à mão) conta como
 *     "acabou de acontecer" — o freio erra para o lado seguro;
 *   • `null`/inválido é "nunca aconteceu", que é diferente de "não consegui
 *     medir". Quem não conseguiu MEDIR não pode chamar esta função esperando um
 *     `0`: essa distinção é do chamador, e trocá-la vira permissão por engano.
 */
export function faltaEsperar(
  ultima: Date | null | undefined,
  agora: Date,
  intervalo: number,
): number {
  if (!ultima || isNaN(ultima.getTime())) return 0;
  const decorrido = agora.getTime() - ultima.getTime();
  if (decorrido < 0) return intervalo;
  return decorrido >= intervalo ? 0 : intervalo - decorrido;
}
