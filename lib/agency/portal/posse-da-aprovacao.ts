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
  return (
    aprovacao.clientId === tokenClientId ||
    aprovacao.clientRequestClientId === tokenClientId
  );
}
