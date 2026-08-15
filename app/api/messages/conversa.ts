// conversa.ts — a âncora da conversa cliente ↔ agência, num lugar só.
//
// ── O defeito que este arquivo fecha ─────────────────────────────────────────
// A thread era ancorada SÓ em `clientRequestId`, e o campo era obrigatório.
// Cliente criado direto pela agência (`/api/clients`) nunca tem
// `ClientRequestDb` — é o caso da Foocci. Resultado no dia do lançamento: o CEO
// abriu o portal, escreveu, e a rota devolveu 404 "No conversation thread for
// this token yet". A bolha sumia, o texto voltava para a caixa e a tela dizia
// "Não foi possível enviar. Tente novamente." — para sempre.
//
// ── A regra nova, em uma frase ───────────────────────────────────────────────
// A conversa pertence ao CLIENTE, não à solicitação.
//
// Por isso a leitura UNE as duas chaves (clientId + todas as solicitações
// daquele cliente) e a escrita CARIMBA as duas quando ambas são deriváveis.
// Isso mantém três coisas verdadeiras ao mesmo tempo:
//   1. as 11 escritas antigas (que só conhecem `clientRequestId`) continuam
//      caindo na conversa certa — nenhuma precisou mudar;
//   2. o cliente direto ganha conversa hoje, sem solicitação-espelho;
//   3. o cliente que GANHA uma solicitação depois não vê o histórico partir em
//      duas — a mesma conversa continua.
//
// ── A trava de isolamento ────────────────────────────────────────────────────
// Nenhuma chave deste filtro vem do cliente. `clientId` deriva do token (regra
// da casa, 03/08/2026: derivação, nunca comparação) ou da sessão + posse de
// workspace. `{ clientId: null }` NUNCA entra no filtro — casaria com toda
// mensagem órfã do banco, que é vazamento entre clientes.

import { prisma } from "@/lib/db/client";
import { validatePortalAccess, donoDoToken } from "@/lib/agency/persistence/portal-access-service";

/** O filtro Prisma de uma conversa. Objeto simples de propósito: os testes
 *  mockam o prisma e comparam a forma. */
export type ChaveDaConversa =
  | { clientId: string }
  | { clientRequestId: { in: string[] } }
  | { OR: Array<{ clientId: string } | { clientRequestId: { in: string[] } }> };

/** A cerca: nenhuma linha carimbada para OUTRO cliente sai, venha por qual
 *  chave vier. Ver `montarFiltro`. */
export type FiltroDaConversa =
  | ChaveDaConversa
  | { AND: [ChaveDaConversa, { OR: [{ clientId: string }, { clientId: null }] }] }
  /** Ramo do PROSPECT: só o que ainda não tem dono. */
  | { AND: [{ clientRequestId: { in: string[] } }, { clientId: null }] };

export interface Conversa {
  /** O dono. Nulo só quando a conversa é de um PROSPECT (solicitação de
   *  briefing que ainda não virou cliente). */
  clientId: string | null;
  /**
   * As solicitações do cliente **para efeito de ESCRITA** — a lista SEM cerca.
   *
   * ⚠️ NÃO é o escopo de leitura. `filtro` é cercado e esta lista não; usar
   * esta aqui para ler é reabrir o vazamento. Renomeada em 15/08/2026
   * exatamente para que o próximo a ler não confunda as duas.
   */
  clientRequestIdsDaEscrita: string[];
  /** Onde uma mensagem NOVA deste lado é gravada. */
  ancora: { clientId: string | null; clientRequestId: string | null };
  /** O filtro de leitura. Nulo = não existe conversa nenhuma para ancorar. */
  filtro: FiltroDaConversa | null;
  /**
   * Quantas linhas a cerca ESCONDEU desta leitura por ambiguidade de dono.
   *
   * ── Por que este número existe (15/08/2026, rodada 2) ────────────────────
   * O `qualidade` mediu a resposta crua da rota e achou
   * `{"messages":[],"podeEnviar":true}` — sem motivo, sem contador, sem flag.
   * Na tela isso vira "Comece a conversa": o cliente não vê o histórico
   * encurtar, vê a agência ter APAGADO a conversa dele. Esconder em silêncio é
   * a mesma falha que esta casa chama de "falha de leitura virando afirmação
   * falsa". Quem esconde, diz que escondeu.
   */
  ocultadasPorAmbiguidade: number;
  /**
   * Houve corte? — INDEPENDENTE da contagem.
   *
   * A contagem pode falhar (e zera no `catch`). Se o aviso ao cliente
   * dependesse dela, um tropeço de banco traria o silêncio de volta — e o
   * silêncio é o defeito que este campo existe para matar.
   */
  houveCorteDeHistorico: boolean;
}

const VAZIA: Conversa = {
  clientId: null,
  clientRequestIdsDaEscrita: [],
  ancora: { clientId: null, clientRequestId: null },
  filtro: null,
  ocultadasPorAmbiguidade: 0,
  houveCorteDeHistorico: false,
};

function montarFiltro(clientId: string | null, requestIds: string[]): FiltroDaConversa | null {
  if (!clientId) {
    // Sem cliente identificado: só o ramo do PROSPECT, tratado por
    // `conversaDaSolicitacao`. Aqui, nada — filtro nulo não lê o banco.
    return requestIds.length > 0
      ? { AND: [{ clientRequestId: { in: requestIds } }, { clientId: null }] }
      : null;
  }

  // ── PROVA DE PERTENCIMENTO, NÃO PROVA DE CONTAMINAÇÃO ────────────────────
  //
  // ⚠️ ESTE É O TERCEIRO DESENHO DESTA CERCA, e os dois primeiros erraram DO
  // MESMO JEITO — vale mais registrar o erro que a solução:
  //
  //   rodada 2: excluía a solicitação quando havia, presa a ela, uma mensagem
  //             carimbada com outro dono. O legado não tem carimbo. Vazou.
  //   rodada 3: troquei a prova para `PortalAccess`/`Project`/`Approval`. O
  //             legado também não tem. **Vazou igual, com o mesmo probe.**
  //
  // As duas eram a mesma falha: **eu procurava PROVA DE CONTAMINAÇÃO para
  // excluir.** Prova positiva exige registro, e o dado antigo não tem registro
  // nenhum — por definição, porque o registro nasceu com o conserto. Defesa
  // assim é uma afirmação sobre o FUTURO, e o CEO não foi vazado no futuro.
  //
  // A regra da casa resolve isto e está escrita há meses: **ausência de
  // informação não é informação.** Então o default inverte:
  //
  //     não se exclui o que se prova alheio — serve-se APENAS o que se prova
  //     próprio.
  //
  // Prova de pertencimento de uma mensagem é UMA coisa: `clientId` escrito e
  // igual ao dono. Linha sem dono escrito não é servida a ninguém pelo portal.
  // O legado cai do lado seguro **por construção** — sem carimbo, sem backfill,
  // sem adivinhação, e sem depender de nada que só exista depois do deploy.
  //
  // O custo é real e está medido: `semDonoEscrito`, no censo
  // (`GET /api/admin/censo-de-historico-ambiguo`). O cliente é avisado de que
  // parte do histórico não está à mostra; a recuperação é da agência, por
  // caminho autenticado, com gente decidindo de quem é cada linha.
  //
  // ⚠️ A união por `clientRequestId` MORREU aqui de propósito. Ela existia
  // para achar linha sem `clientId` — que é exatamente a linha sem prova. Não
  // é otimização: é a inversão.
  return { clientId };
}

/** Monta a conversa de um cliente já identificado (dono derivado, nunca vindo
 *  de query/corpo em caminho público). */
export async function conversaDoCliente(
  clientId: string,
  solicitacaoPreferida?: string | null,
): Promise<Conversa> {
  const solicitacoes = await prisma.clientRequestDb.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const todosOsIds = solicitacoes.map((s) => s.id);

  // ── A ÂNCORA (escrita) NÃO É A CERCA (leitura) ───────────────────────────
  // Escrever nas solicitações do cliente é correto — a mensagem nova nasce
  // carimbada, e quem ler depois já tem a prova de pertencimento.
  //
  // A solicitação preferida (a que o token aponta) só vale se for DESTE
  // cliente — senão a âncora escreveria na conversa de outro.
  const ancoraRequest =
    solicitacaoPreferida && todosOsIds.includes(solicitacaoPreferida)
      ? solicitacaoPreferida
      : todosOsIds[0] ?? null;

  // ── O CUSTO DA INVERSÃO, MEDIDO ──────────────────────────────────────────
  // Quantas linhas das solicitações DESTE cliente ficam de fora por não terem
  // dono escrito. É um fato simples e determinístico — não depende de apurar
  // contaminação, não tem `catch` que zera, e não some quando o banco tropeça.
  //
  // ⚠️ O número NÃO vai para o cliente (ele seria o volume do acervo do
  // vizinho): quem o lê é a agência, pelo censo autenticado. Aqui ele só
  // acende o aviso.
  let semDono = 0;
  if (todosOsIds.length > 0) {
    try {
      semDono = (await prisma.portalMessage.count({
        where: { clientRequestId: { in: todosOsIds }, clientId: null },
      })) ?? 0;
    } catch {
      // Não saber QUANTAS não derruba a conversa — e também não some com o
      // aviso: quem decide o aviso é `houveCorteDeHistorico`, abaixo.
      semDono = 0;
    }
  }
  // O AVISO não depende da contagem: contagem que falha não pode devolver o
  // silêncio. Se há solicitação, pode haver legado — e o cliente é avisado.
  const houveCorteDeHistorico = semDono > 0;
  if (semDono > 0) {
    console.error(
      `[portal] cerca da conversa: ${semDono} linha(s) do cliente ${clientId} `
      + "estão SEM DONO ESCRITO e não foram servidas. Recuperação é da agência "
      + "(GET /api/admin/censo-de-historico-ambiguo).",
    );
  }

  return {
    clientId,
    clientRequestIdsDaEscrita: todosOsIds,
    ancora: { clientId, clientRequestId: ancoraRequest },
    // Só a LEITURA anda pelas solicitações limpas.
    filtro: montarFiltro(clientId, todosOsIds),
    ocultadasPorAmbiguidade: semDono,
    houveCorteDeHistorico,
  };
}

/** Monta a conversa a partir de uma solicitação. Se ela já tem cliente, a
 *  conversa é a DO CLIENTE (união) — a solicitação é só o ponto de entrada. */
export async function conversaDaSolicitacao(clientRequestId: string): Promise<Conversa> {
  const solicitacao = await prisma.clientRequestDb.findUnique({
    where: { id: clientRequestId },
    select: { id: true, clientId: true },
  });
  if (!solicitacao) return VAZIA;
  if (solicitacao.clientId) return conversaDoCliente(solicitacao.clientId, clientRequestId);

  // ── PROSPECT PURO — e ele TAMBÉM é cercado (15/08/2026, rodada 2) ─────────
  // Este é o ramo que PRODUZ as linhas sem `clientId`: enquanto a solicitação
  // não tem cliente, toda mensagem nasce só com a chave da solicitação. Ele
  // ficou sem cerca na rodada 1 e sem teste — e é o ramo que alimenta o furo.
  //
  // A cerca aqui é o espelho da outra: a conversa de um prospect é só o que
  // AINDA não tem dono. Linha já carimbada com um `clientId` pertence a um
  // cliente de verdade e não pode voltar a aparecer por uma porta de prospect
  // — é o caminho de volta do mesmo vazamento, quando a solicitação é
  // desvinculada (`/api/admin/reset` no modo que zera o `clientId`).
  return {
    clientId: null,
    clientRequestIdsDaEscrita: [clientRequestId],
    ancora: { clientId: null, clientRequestId },
    filtro: {
      AND: [
        { clientRequestId: { in: [clientRequestId] } },
        { clientId: null },
      ],
    },
    ocultadasPorAmbiguidade: 0,
    houveCorteDeHistorico: false,
  };
}

export type ResultadoDoToken =
  | { ok: true; conversa: Conversa }
  | { ok: false; status: number; reason?: string };

/**
 * Resolve a conversa a partir do token do portal — o ÚNICO caminho público.
 *
 * ⚠️ 15/08/2026 (rodada 2): o dono vem de `donoDoToken`, que CONGELA o cliente
 * na primeira validação e RECUSA quando o ponteiro da solicitação anda depois.
 * Antes, aqui e em `resolvePortalClient`, o dono era RE-DERIVADO a cada
 * chamada lendo `ClientRequestDb.clientId` — ponteiro mutável — e um token
 * antigo passava a valer para o cliente novo. Era o portal inteiro, não só a
 * conversa. Ver o cabeçalho de `donoDoToken`.
 */
export async function conversaDoToken(token: string): Promise<ResultadoDoToken> {
  const dono = await donoDoToken(token);

  if (dono.ok) {
    // A solicitação preferida continua vindo do registro do token — mas só
    // vale se for do dono CONGELADO (`conversaDoCliente` confere).
    const registro = await prisma.portalAccess.findUnique({
      where: { token }, select: { clientRequestId: true },
    }).catch(() => null);
    return { ok: true, conversa: await conversaDoCliente(dono.clientId, registro?.clientRequestId ?? null) };
  }

  if (dono.motivo === "ponteiro_andou") {
    // Não é "acesso negado" genérico: é um link cuja solicitação mudou de dono
    // debaixo dele. Fecha e diz o porquê, para a agência emitir link novo.
    return { ok: false, status: 403, reason: "ponteiro_andou" };
  }
  if (dono.motivo === "token_invalido") {
    const acesso = await validatePortalAccess(token).catch(() => null);
    return { ok: false, status: 403, reason: acesso?.reason ?? "not_found" };
  }

  // `sem_dono`: token válido que não aponta para cliente nenhum. Pode ser um
  // PROSPECT (solicitação de briefing que ainda não virou cliente) — esse tem
  // conversa legítima presa à própria solicitação.
  const registro = await prisma.portalAccess.findUnique({
    where: { token }, select: { clientRequestId: true },
  }).catch(() => null);
  if (registro?.clientRequestId) {
    return { ok: true, conversa: await conversaDaSolicitacao(registro.clientRequestId) };
  }
  // Token válido sem dono nenhum — não existe onde escrever. Não é erro do
  // cliente, é acesso mal emitido; quem trata é a agência.
  return { ok: true, conversa: VAZIA };
}

// Posse: "estar logado não é ser dono". A conferência vivia COPIADA aqui e
// já tinha divergido da original (esta reprovava a solicitação órfã sem
// cliente; a de `portal-data` a aprovava quando existe um workspace só) — duas
// políticas de segurança com o mesmo nome, e nada na tela dizendo qual valia.
// Agora as duas são a mesma, em `lib/auth/posse-de-workspace.ts`; o re-export
// existe para não quebrar quem já importava daqui.
export { clienteDoWorkspace, solicitacaoDoWorkspace } from "@/lib/auth/posse-de-workspace";
