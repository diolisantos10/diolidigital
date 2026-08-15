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
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";

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
  | { AND: [ChaveDaConversa, { OR: [{ clientId: string }, { clientId: null }] }] };

export interface Conversa {
  /** O dono. Nulo só quando a conversa é de um PROSPECT (solicitação de
   *  briefing que ainda não virou cliente). */
  clientId: string | null;
  /** Todas as solicitações daquele cliente — o histórico que já existe. */
  clientRequestIds: string[];
  /** Onde uma mensagem NOVA deste lado é gravada. */
  ancora: { clientId: string | null; clientRequestId: string | null };
  /** O filtro de leitura. Nulo = não existe conversa nenhuma para ancorar. */
  filtro: FiltroDaConversa | null;
}

const VAZIA: Conversa = {
  clientId: null,
  clientRequestIds: [],
  ancora: { clientId: null, clientRequestId: null },
  filtro: null,
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
  // vazamento entre clientes que ninguém tinha medido:
  //
  //   `ClientRequestDb.clientId` NÃO é imutável. `/api/admin/reset` zera o
  //   campo (`clientId: null`), `createProjectFromRequest` e
  //   `/api/brain/orchestrate/apply` criam um Client novo e RE-APONTAM a mesma
  //   solicitação — e `Client` não tem `@@unique(workspaceId, name)`, então
  //   ficha duplicada para o mesmo negócio é fato registrado nesta casa
  //   (a Camila, em 08/08).
  //
  //   Quando a solicitação R sai do cliente A e passa para o cliente B, as
  //   mensagens antigas continuam gravadas com `clientId: A` E
  //   `clientRequestId: R` — as DUAS chaves, como esta casa passou a carimbar.
  //   A partir daí o portal de B lê aquelas mensagens pelo ramo
  //   `clientRequestId in [R]`, e o portal de A continua lendo pelo ramo
  //   `clientId: A`. **Os dois portais mostram a mesma conversa, com os mesmos
  //   horários** — que é exatamente o que o CEO viu em produção.
  //
  // A cerca: a linha tem que passar pela chave E ser do dono. `clientId: null`
  // continua passando porque é o formato das 11 escritas antigas (que só
  // conhecem `clientRequestId`) — barrar isso apagaria histórico legítimo. O
  // que nunca mais passa é linha carimbada para OUTRO cliente.
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
      return todosOsIds.filter((id) => !sujas.has(id));
    } catch {
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
  return {
    clientId,
    clientRequestIds: todosOsIds,
    ancora: { clientId, clientRequestId: ancoraRequest },
    // Só a LEITURA anda pelas solicitações limpas.
    filtro: montarFiltro(clientId, ids),
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
  // Prospect puro: ainda não é cliente. A conversa vive presa à solicitação.
  return {
    clientId: null,
    clientRequestIds: [clientRequestId],
    ancora: { clientId: null, clientRequestId },
    filtro: { clientRequestId: { in: [clientRequestId] } },
  };
}

export type ResultadoDoToken =
  | { ok: true; conversa: Conversa }
  | { ok: false; status: number; reason?: string };

/** Resolve a conversa a partir do token do portal — o ÚNICO caminho público. */
export async function conversaDoToken(token: string): Promise<ResultadoDoToken> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) {
    return { ok: false, status: 403, reason: acesso.reason };
  }
  const registro = acesso.record;
  if (registro.clientId) {
    return { ok: true, conversa: await conversaDoCliente(registro.clientId, registro.clientRequestId) };
  }
  if (registro.clientRequestId) {
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
