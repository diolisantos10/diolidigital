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
}

const VAZIA: Conversa = {
  clientId: null,
  clientRequestIdsDaEscrita: [],
  ancora: { clientId: null, clientRequestId: null },
  filtro: null,
  ocultadasPorAmbiguidade: 0,
};

function montarFiltro(clientId: string | null, requestIds: string[]): FiltroDaConversa | null {
  const chaves: Array<{ clientId: string } | { clientRequestId: { in: string[] } }> = [];
  // A guarda que impede o vazamento: só entra chave com valor de verdade.
  if (clientId) chaves.push({ clientId });
  if (requestIds.length > 0) chaves.push({ clientRequestId: { in: requestIds } });
  if (chaves.length === 0) return null;
  const chave: ChaveDaConversa = chaves.length === 1 ? chaves[0]! : { OR: chaves };
  if (!clientId) return chave;

  // ── A CERCA DO DONO (15/08/2026) ──────────────────────────────────────────
  //
  // A união das duas chaves acima é o que mantém o histórico inteiro visível
  // quando um cliente ganha (ou troca de) solicitação. Ela também abriu um
  // vazamento entre clientes: **`ClientRequestDb.clientId` é um ponteiro
  // MUTÁVEL**, e quando ele anda a conversa antiga vai junto.
  //
  // ⚠️ QUEM MOVE O PONTEIRO — corrigido em 15/08/2026 (rodada 2), depois de
  // `seguranca` e `qualidade` chegarem ao mesmo lugar por caminhos diferentes.
  // A versão anterior deste comentário acusava três sites, e os TRÊS estão
  // inocentes:
  //
  //   • `/api/admin/reset` — a MESMA transação roda
  //     `tx.portalMessage.deleteMany({})` (`route.ts:177`) em TODOS os modos.
  //     Não sobra mensagem para vazar; é impossível produzir o sintoma por aí.
  //   • `create-project-from-request.ts:51` — está dentro de `if (!clientId)`
  //     (`:47`). Só preenche dono NULO. Nunca move A→B.
  //   • `orchestrate/apply/route.ts:111` — idem, guardado por `if (!clientId)`.
  //
  // **O culpado é `lib/agency/balcao/producao.ts` — a ÚNICA sobrescrita
  // incondicional do repositório, e a única que não apaga mensagem nenhuma.**
  // Ele achava `Client` por e-mail NÃO VERIFICADO vindo do formulário de compra
  // e re-apontava a solicitação por cima do dono existente. Fechado no mesmo
  // trabalho; ver `__tests__/comercial/balcao-nao-funde-ficha.test.ts`.
  //
  // A cerca: a linha tem que passar pela chave E ser do dono. `clientId: null`
  // continua passando porque é o formato das escritas antigas — barrar isso
  // apagaria histórico legítimo. O que nunca mais passa é linha carimbada para
  // OUTRO cliente.
  return { AND: [chave, { OR: [{ clientId }, { clientId: null }] }] };
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

  // ── SOLICITAÇÃO QUE JÁ FOI DE OUTRO (15/08/2026) ──────────────────────────
  //
  // A cerca de `montarFiltro` barra a linha carimbada para outro cliente. Falta
  // a linha LEGADA: as 11 escritas antigas gravam só `clientRequestId`, com
  // `clientId` NULO, e uma linha nula não tem dono escrito — ela pertence a
  // quem era dono da solicitação NA HORA em que foi escrita, e isso o banco não
  // guarda. Se a solicitação trocou de dono, essas linhas seguem junto e o
  // portal novo lê a conversa antiga.
  //
  // Não dá para adivinhar o dono de uma linha nula — e adivinhar é exatamente o
  // que a lei da casa proíbe. Mas dá para PROVAR que a solicitação já foi de
  // outro: basta existir, presa a ela, uma linha carimbada com outro clientId.
  // Onde há essa prova, a solicitação inteira sai da leitura deste cliente: as
  // linhas nulas dela são ambíguas, e ambiguidade fecha.
  //
  // As duas metades: no caso limpo NENHUMA solicitação tem carimbo alheio, nada
  // é escondido, e o histórico legado continua inteiro.
  //
  // ⚠️ FALHA DE LEITURA FECHA, NÃO ABRE. Se esta consulta não responder, não dá
  // para saber quais solicitações estão limpas — e a resposta segura para
  // "não sei" é ler só pelo `clientId`, nunca pela união. O cliente vê menos
  // histórico numa falha de banco; ninguém vê a conversa de outro.
  const ids = await (async () => {
    if (todosOsIds.length === 0) return [];
    try {
      const contaminadas = await prisma.portalMessage.findMany({
        where: { clientRequestId: { in: todosOsIds }, clientId: { not: null, notIn: [clientId] } },
        select: { clientRequestId: true },
        distinct: ["clientRequestId"],
      });
      if (!Array.isArray(contaminadas)) return [];
      const sujas = new Set(contaminadas.map((c) => c.clientRequestId).filter((x): x is string => !!x));
      if (sujas.size > 0) {
        // NEGA E REGISTRA. Esconder histórico em silêncio é o defeito que esta
        // casa chama de "falha de leitura virando afirmação falsa": o cliente
        // some com a conversa e ninguém fica sabendo que houve barramento.
        console.error(
          `[portal] cerca da conversa: cliente ${clientId} teve `
          + `${sujas.size} solicitação(ões) EXCLUÍDA(S) da leitura por carimbo de outro dono `
          + `(${[...sujas].join(", ")}). Solicitação que trocou de dono — investigar.`,
        );
      }
      return todosOsIds.filter((id) => !sujas.has(id));
    } catch (e) {
      console.error(
        `[portal] cerca da conversa: NÃO consegui apurar contaminação do cliente ${clientId} `
        + `— lendo só por clientId (fecha, não abre).`, e,
      );
      return [];
    }
  })();

  // ── A CERCA É DA LEITURA, NÃO DA ESCRITA ──────────────────────────────────
  // A âncora continua usando TODAS as solicitações do cliente: elas são dele
  // agora, e escrever nelas é correto — a mensagem nova nasce carimbada com o
  // `clientId`, então quem lê depois já está protegido pela cerca. Restringir a
  // âncora aqui faria uma falha de leitura (o `catch` acima) mudar ONDE a
  // mensagem é gravada, que é efeito colateral em cima de defeito.
  //
  // A solicitação preferida (a que o token aponta) só vale se for DESTE cliente
  // — senão a âncora escreveria na conversa de outro.
  const ancoraRequest =
    solicitacaoPreferida && todosOsIds.includes(solicitacaoPreferida)
      ? solicitacaoPreferida
      : todosOsIds[0] ?? null;
  // O CUSTO, MEDIDO — não estimado. Só as linhas AMBÍGUAS (sem dono escrito)
  // das solicitações excluídas: as que estão carimbadas com este `clientId`
  // continuam saindo pelo ramo `{ clientId }` e NÃO entram nesta conta.
  const excluidas = todosOsIds.filter((id) => !ids.includes(id));
  let ocultadasPorAmbiguidade = 0;
  if (excluidas.length > 0) {
    try {
      ocultadasPorAmbiguidade =
        (await prisma.portalMessage.count({
          where: { clientRequestId: { in: excluidas }, clientId: null },
        })) ?? 0;
    } catch {
      // Não saber QUANTAS não pode derrubar a conversa. Fica 0 e a rota ainda
      // avisa que houve corte (o motivo não depende deste número).
      ocultadasPorAmbiguidade = 0;
    }
  }

  return {
    clientId,
    clientRequestIdsDaEscrita: todosOsIds,
    ancora: { clientId, clientRequestId: ancoraRequest },
    // Só a LEITURA anda pelas solicitações limpas.
    filtro: montarFiltro(clientId, ids),
    ocultadasPorAmbiguidade,
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
