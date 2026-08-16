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
  // ⚠️ `clientRequestClientId` FOI APAGADO (16/08/2026). Ele era o ponteiro
  // MUTÁVEL lido na hora da decisão; virou campo morto quando a posse passou a
  // exigir carimbo, e campo morto numa struct de segurança é o próximo a ser
  // "reaproveitado". Quem precisar do dono atual da solicitação que o derive
  // do resolvedor único.
}

export interface TokenParaPosse {
  clientRequestId: string | null;
  clientId: string | null;
}

export function pertenceAoToken(
  aprovacao: AprovacaoParaPosse,
  token: TokenParaPosse,
  clientIdDaSolicitacaoDoToken: string | null,
  // ⚠️ `solicitacoesLimpasDoToken` FOI APAGADO (rodada 9). Ele alimentava a
  // metade 2 — o ramo que decidia o card ÓRFÃO por "ausência de evidência de
  // troca de dono". Esse ramo morreu (ver abaixo), e parâmetro que ninguém lê
  // numa função de segurança é o próximo a ser religado sem teste.
): boolean {
  if (token.clientRequestId && aprovacao.clientRequestId === token.clientRequestId) {
    return true;
  }
  const tokenClientId = token.clientId ?? clientIdDaSolicitacaoDoToken;
  if (!tokenClientId) return false;

  // ── 🔴 EU PAREI A ESTEIRA COMERCIAL (16/08/2026) ──────────────────────────
  //
  // A rodada 5 exigiu carimbo e só carimbo. Mas `ApprovalRequest.clientId`
  // NASCE NULO no fluxo Brain — está escrito no meu próprio comentário em
  // `approval-service.ts`. O carimbo vale para card criado DEPOIS do deploy;
  // **todo card pendente que já existe tem `clientId` nulo**.
  //
  // Resultado medido em navegador: o dono legítimo abre "Aprovações", vê
  // "1 DECISÃO PENDENTE — Pacote mensal R$ 12.000", clica em Aprovar e recebe
  // `Approval not accessible with this token`, em inglês e em vermelho. E
  // aprovar proposta é o gatilho de `createProjectFromRequest` →
  // `runProjectExecution`: não é histórico escondido, é a **esteira comercial
  // parada, com o botão à vista**.
  //
  // As DUAS metades, e nenhuma delas depende de dado pós-deploy:
  //
  //   • card COM carimbo  → o carimbo manda, e só ele. (barra o alheio)
  //   • card SEM carimbo  → pertence se a solicitação dele estiver entre as
  //     que o token prova possuir E sem evidência de ter sido de outro.
  //     (atende o próprio)
  //
  // A lista limpa é montada pelo chamador, do lado do servidor, a partir do
  // escopo congelado. Ela nunca AMPLIA o alcance de um card carimbado — só
  // decide o destino do card órfão, que hoje simplesmente não abriria.
  // ── A METADE 2 MORREU (rodada 9) ─────────────────────────────────────────
  // Card órfão NÃO é decidível por ninguém. Era esta regra que deixava o token
  // legítimo de B aprovar o card órfão de A: a "evidência de ter sido de
  // outro" é cega justamente onde a produção vive (`PortalAccess` legado tem
  // `clientId` nulo). E aprovação, nesta casa, PUBLICA.
  //
  // O card órfão do dono legítimo volta a abrir pelo BACKFILL — que o carimba
  // offline, com curadoria — e não por uma exceção no caminho quente.
  if (aprovacao.clientId == null) return false;

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
