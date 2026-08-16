// ── A CERCA DO FILHO, COM AS DUAS METADES NA MESMA PORTA ───────────────────
//
// ⚠️ A LIÇÃO DA RODADA 8, e ela é cara:
// **cercar por uma chave que nenhum escritor escreve é APAGAR A TABELA.**
//
// Eu inverti o default nas tabelas-filhas (`ApprovalRequest`, `BrainArtifact`,
// `SocialPost`) exigindo `clientId` — e escrevi a metade positiva na porta
// VIZINHA (`social-posts`), não na porta cercada (`portal-data`). Medido em
// navegador, com uma proposta de R$ 12.000 pendente no banco:
//
//     0 DECISÕES PENDENTES · Nada esperando sua decisão
//     NADA DEPENDE DE VOCÊ AGORA
//
// A rodada 5 dava erro vermelho em inglês; a rodada 7 dá **silêncio com
// afirmação falsa**. Erro gera chamado; "nada depende de você" não gera nada.
// **É pior, não melhor.**
//
// E era permanente, não dívida de acervo: `brain-artifact-service` — o
// escritor real da casa — nunca gravou `clientId`. Cerca contra escritor que
// não carimba não é trava, é apagador.
//
// ── A REGRA, uma só, para todos os filhos ──────────────────────────────────
// É a MESMA de `pertenceAoToken`, agora em forma de consulta — porque a posse
// do card e a listagem do card não podem responder coisas diferentes (foi
// exatamente isso: o POST aceitava o que o GET nunca mostrava).
//
//   • filho COM carimbo  → o carimbo tem de bater      (barra o alheio)
//   • filho SEM carimbo  → vale se estiver preso a uma solicitação que o token
//                          prova possuir E sem evidência de ter sido de outro
//                                                       (atende o próprio)

/** Um ramo do `OR`: ou o carimbo bate, ou é órfão de solicitação provada. */
export type RamoDoFilho =
  | { clientId: string }
  | { AND: [{ clientId: null }, { clientRequestId: { in: string[] } }] };

/** Fragmento de `where` do Prisma para qualquer filho que tenha as duas chaves. */
export function filtroDeFilhoDoDono(clientId: string): { clientId: string } {
  // ── A METADE 2 MORREU (16/08/2026, rodada 9) ──────────────────────────────
  //
  // Ela dizia: "órfão de solicitação sem evidência de ter sido de outro,
  // então passa". Era ela que abria o bloqueante A — o token legítimo de B
  // aprovando card órfão de A —, porque a evidência é CEGA na população de
  // produção: `PortalAccess` legado tem `clientId` nulo e o filtro de carimbo
  // alheio (`{ not: null, notIn: [...] }`) simplesmente não o enxerga.
  //
  // "Não sabido fecha" é a regra desta casa, e eu já a tinha aplicado certo em
  // `montarFiltro`. O que faltava não era regra de leitura melhor: era o
  // BACKFILL (`backfill-de-carimbo.ts`), que resolve a ambiguidade UMA vez,
  // offline, com curadoria. Com ele, exigir carimbo deixa de apagar a tela do
  // dono — e a leitura volta a ser a simples e correta.
  return { clientId };
}
