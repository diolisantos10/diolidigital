// A POSSE DE UMA APROVAÇÃO — a pergunta de isolamento do portal, pura.
//
// Marco 5 da V2. Era lógica inline na rota `/api/portal/approvals`; virou
// função pura para o gate do marco ("isolamento entre organizações provado
// por teste") ser provado à exaustão — inclusive o cenário 11 do
// 07-CRITERIOS: trocar o id na requisição e receber negação.
//
// A regra, na ordem (a mesma que a rota sempre aplicou):
//   1. a aprovação pertence ao token pela SOLICITAÇÃO (fluxo Brain); ou
//   2. pertence pelo CLIENTE — o do token, ou o derivado da solicitação do
//      token (caso cliente direto, sem ClientRequestDb).
// Dono SEMPRE derivado do token. Nada vindo da requisição decide posse.

export interface AprovacaoParaPosse {
  clientRequestId: string | null;
  clientId: string | null;
  clientRequestClientId: string | null;
}

export interface TokenParaPosse {
  clientRequestId: string | null;
  clientId: string | null;
}

export function pertenceAoToken(
  aprovacao: AprovacaoParaPosse,
  token: TokenParaPosse,
  clientIdDaSolicitacaoDoToken: string | null,
): boolean {
  if (token.clientRequestId && aprovacao.clientRequestId === token.clientRequestId) {
    return true;
  }
  const tokenClientId = token.clientId ?? clientIdDaSolicitacaoDoToken;
  if (!tokenClientId) return false;

  // ── 🔴 RODADA 5: `clientRequestClientId` SAIU DAQUI ───────────────────────
  //
  // Eu afirmei na rodada 3 que "a posse deixou de aceitar a solicitação como
  // prova". **Não tinha deixado** — esta linha aceitava
  // `aprovacao.clientRequestClientId`, que é `approval.clientRequest.clientId`:
  // o ponteiro MUTÁVEL, lido AGORA. Com a solicitação re-apontada, o card
  // legado do ALFA passava a "provar" que era do BETA. O A/B do `seguranca`
  // devolveu `200 approved` na base E no PR, com o banco `approved` nos dois.
  //
  // Nesta casa **entrega aprovada publica**: não é leitura indevida, é escrita
  // no negócio de terceiro.
  //
  // Prova é CARIMBO. `ApprovalRequest.clientId` é gravado na criação e não
  // anda; `clientRequest.clientId` anda. Só o primeiro vale.
  return aprovacao.clientId === tokenClientId;
}
