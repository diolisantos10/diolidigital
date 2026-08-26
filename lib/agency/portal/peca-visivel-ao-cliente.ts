// peca-visivel-ao-cliente.ts — A REGRA, EM UM LUGAR SÓ, DE QUE PEÇA O CLIENTE VÊ.
//
// ── Por que este arquivo existe (26/08/2026) ────────────────────────────────
//
// O carimbo `visibility: "compartilhado"` é aplicado no NASCIMENTO do
// `SocialPost`, em cinco lugares da esteira, ANTES de a arte existir. É o
// desenho certo — a escada de exposição decide O QUE o cliente pode ver, não
// QUANDO —, e ele deixa um vão: peça carimbada e sem arquivo aparece no portal
// como cartão de peça sem peça.
//
// Medido em produção duas vezes, no mesmo dia:
//
//   • três `SocialPost` em `draft` + `compartilhado` + `mediaUrl: null`, do
//     cliente da rodada anterior, porque o portão do fundo reprovou a arte;
//   • e de novo na jornada do cliente oculto (projeto
//     cmt9f1f7w001y0xo781zi2jt4): logo depois da apresentação, os três posts
//     nascem sem arte e o portal já os oferecia — com `statusLegivel:
//     "Esperando você"`, ou seja, PEDINDO DECISÃO sobre um cartão vazio.
//
// O primeiro conserto fechou `/api/social-posts` e esqueceu o CALENDÁRIO de
// `/api/portal/projetos`, que lê a mesma tabela com a mesma condição. Duas
// consultas com a mesma regra escrita à mão divergem na primeira vez que
// alguém conserta uma — que é exatamente o que aconteceu, em minutos.
//
// Por isso a regra mora aqui, uma vez, como CLÁUSULA DE CONSULTA: quem lista
// peça para o cliente importa daqui e não escreve o filtro à mão.
//
// ── FAIL-CLOSED, E POSITIVO ────────────────────────────────────────────────
//
// O filtro é `mediaUrl: { not: null }` — afirmativo. Uma lista de estados
// "ruins" a excluir deixaria todo estado NOVO passar por omissão, que é como
// esta casa já perdeu portão antes.
//
// ⚠️ O que isto NÃO faz: não esconde a peça para sempre. Ela volta a aparecer
// sozinha na rodada em que a arte sair — e a arte só sai depois da
// `design/regua-da-peca-final.ts`, que é a outra metade deste conserto.

/**
 * A cláusula que toda listagem de peça PARA O CLIENTE tem de carregar.
 *
 * Espalhada num `...spread` do `where`, ela some do diff se alguém a remover —
 * e é por isso que há teste afirmando a presença dos dois campos em cada rota.
 */
export const PECA_VISIVEL_AO_CLIENTE = {
  /** A escada de exposição liberou. "interno" NUNCA sai pelo portal. */
  visibility: "compartilhado",
  /** E existe arquivo. Peça sem arte não é entrega; é trabalho em andamento. */
  mediaUrl: { not: null },
} as const;
