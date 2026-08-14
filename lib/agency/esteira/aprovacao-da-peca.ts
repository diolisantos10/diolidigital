// aprovacao-da-peca.ts — QUEM LIBERA É O CLIENTE, PEÇA POR PEÇA. SERVER-ONLY.
//
// ─── A ORDEM QUE PRODUZIU ESTE ARQUIVO (CEO, 14/08/2026) ────────────────────
//
//   *"Quem libera, quem aprova, são os clientes. Quem é o dono da CityJobs sou
//   eu, então eu vou aprovar. Se entrar um cliente novo, quem aprova é ele."*
//
// Ele repetiu isso várias vezes. Até hoje a casa tratava como pergunta aberta e
// respondia com um INTERRUPTOR GERAL (`PUBLICACAO_ORGANICA`): ligado, TODA peça
// agendada saía sozinha pelo despertador de 5 minutos, aprovada ou não. Foi
// exatamente esse formato que quase publicou os 6 carrosséis da Foocci em
// 07/08 — está escrito no cabeçalho de `trava-de-publicacao.ts`.
//
// Um interruptor geral não pode ser a resposta a uma ordem que é "peça por
// peça". Ele responde "a casa pode publicar hoje?"; a ordem pergunta "ESTE
// cliente liberou ESTA peça?". São perguntas diferentes, e só a segunda é a que
// o CEO deu. Este módulo é a segunda.
//
// ─── O QUE ELE NÃO É: UM SEGUNDO MECANISMO DE APROVAÇÃO ─────────────────────
//
// A casa JÁ registra aprovação, e registra bem. `ApprovalRequest` guarda o card
// que o cliente decide; `sourcePostIdsJson` diz QUAIS peças aquele card decide
// (gravado por `/api/social-posts/aprovacao`); `reviewedBy` e `reviewedAt`
// gravam quem decidiu e quando (gravados por `/api/portal/approvals`, com a
// posse derivada do token do portal). É o que alimenta o "Aprovações 15 · 7
// aguardando revisão" do painel.
//
// Este módulo **não cria registro nenhum**. Ele só LÊ o que já existe e
// responde a pergunta que ninguém estava fazendo antes de publicar. Um segundo
// mecanismo começaria idêntico e divergiria no primeiro ajuste — e a casa já se
// machucou assim (ver `prontidao-de-publicacao.ts`, "não reimplementa trava
// nenhuma").
//
// ─── AS TRÊS COISAS QUE UMA APROVAÇÃO PRECISA DIZER ─────────────────────────
//
// 1. **QUEM** aprovou. Aprovação sem autor não é aprovação — é um carimbo.
// 2. **QUANDO** (`reviewedAt`).
// 3. **EM NOME DE QUAL CLIENTE** (`ApprovalRequest.clientId`), e esse cliente
//    tem de ser o DONO da peça. Card do cliente A não libera peça do cliente B.
//
// ─── POR QUE SÓ `client:` CONTA ─────────────────────────────────────────────
//
// `reviewedBy` tem três grafias vivas no repositório, e elas NÃO valem o mesmo:
//
//   • `client:<nome>` — escrito por `app/api/portal/approvals/route.ts`, e só
//     por lá. Para chegar ali é preciso um token de portal válido cuja posse foi
//     conferida contra o dono do card. **É o cliente, e ele tem nome.** VALE.
//   • `cliente` (seco) — escrito por `marcos.aprovarPacote`. Não tem autor, e
//     `aprovarPacote` é alcançável por `app/api/projects/[id]/esteira/route.ts`,
//     que é **rota de sessão da agência**: alguém da casa clicando "aprovar
//     tudo" pelo cliente grava a mesma string. Autoria ambígua não é autoria.
//     NÃO VALE para publicar.
//   • `equipe:<email>` / `internal` — a agência, declaradamente. NÃO VALE.
//
// A consequência é deliberada e vale dita: **o carimbo de `aprovarPacote` não
// autoriza publicação.** Ele continua abrindo a implementação e o ciclo, que é
// o trabalho dele; levar a peça ao perfil do cliente exige o clique do próprio
// cliente, com nome, no card daquela peça. Foi isso que o CEO pediu.
//
// ─── FAIL-CLOSED, COMO AS TRAVAS VIZINHAS ───────────────────────────────────
//
// Sem peça identificada, sem post no banco, sem dono, sem card, com o banco
// fora do ar, ou com card decidido por quem não é o cliente: **NÃO PUBLICA**.
// Ausência de aprovação nunca vira permissão — é o guardrail 1 da casa
// (ausência de informação não é informação) no ponto em que ele custa mais
// caro, porque publicação é irreversível.
//
// ⚠️ Só importa `prisma` e o `donoDe` de `ativos-autorizados` (função pura de
//    normalização). É de propósito: `lib/integrations/meta/trava-de-publicacao`
//    depende deste arquivo, e uma dependência mais gorda faria a trava carregar
//    meia esteira para responder uma pergunta de leitura.

import { prisma } from "@/lib/db/client";
import { donoDe } from "@/lib/integrations/meta/ativos-autorizados";

/** A marca de que quem decidiu foi o CLIENTE, pelo portal dele. Escrita em
 *  `app/api/portal/approvals/route.ts` como `client:${clientIdentity}`. */
export const PREFIXO_DO_CLIENTE = "client:";

/** O status de `ApprovalRequest` que significa "aprovado". */
export const STATUS_APROVADO = "approved";

/**
 * O parecer. Aprovada COM as três respostas (quem, quando, por qual cliente),
 * ou recusada COM MOTIVO LEGÍVEL — nunca um booleano seco, que obrigaria quem
 * chama a inventar a frase e faria a casa dizer coisas diferentes por caminho.
 */
export type ParecerDeAprovacao =
  | {
      aprovada: true;
      /** O card que registra a decisão. É a evidência (guardrail 6). */
      approvalRequestId: string;
      /** QUEM — já sem o prefixo técnico, pronto para linha de relatório. */
      aprovadaPor: string;
      /** QUANDO. */
      aprovadaEm: Date;
      /** EM NOME DE QUAL CLIENTE. */
      clientId: string;
    }
  | { aprovada: false; motivo: string };

/** A decisão foi do cliente? Só o prefixo `client:` responde que sim — ver o
 *  bloco "POR QUE SÓ `client:` CONTA" no cabeçalho. */
export function decisaoEhDoCliente(reviewedBy: string | null | undefined): boolean {
  const cru = (reviewedBy ?? "").trim();
  return cru.toLowerCase().startsWith(PREFIXO_DO_CLIENTE) && cru.length > PREFIXO_DO_CLIENTE.length;
}

/** O nome de quem decidiu, sem o prefixo técnico. Mesma limpeza que
 *  `reabrir-aprovacao.ts` já faz para mostrar ao cliente. */
export function nomeDeQuemAprovou(reviewedBy: string | null | undefined): string {
  const cru = (reviewedBy ?? "").trim();
  if (!cru) return "(sem autor registrado)";
  return cru.replace(/^client:/i, "").trim() || "(sem autor registrado)";
}

/** Lê os ids de peça de um card. JSON quebrado vira lista vazia — nunca
 *  exceção, e nunca "deu ruim, então libera". */
function lerIds(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** A frase única da recusa por falta de aprovação, para a casa inteira dizer a
 *  mesma coisa — e para ela nunca virar "erro ao publicar", que faria o
 *  operador procurar defeito onde há regra. */
export function fraseSemAprovacao(quemDeveriaAprovar: string | null): string {
  const dono = quemDeveriaAprovar ? `o cliente ${quemDeveriaAprovar}` : "o cliente dono da peça";
  return (
    `Esta peça NÃO tem aprovação registrada ${dono ? `de ${dono}` : ""}. ` +
    "Quem libera uma peça é o cliente dela, peça por peça (ordem do CEO, 14/08/2026) — " +
    "e ausência de aprovação nunca vira permissão. " +
    "O caminho: a equipe abre o card em POST /api/social-posts/aprovacao (as peças viram UM card " +
    "visível ao cliente) e o cliente decide no portal dele, que grava quem aprovou e quando."
  );
}

export interface PecaParaAprovar {
  /** O id do `SocialPost`. Ausente = não há peça identificada, e sem peça não
   *  existe aprovação de peça possível: recusa. */
  postId: string | null | undefined;
  /** O dono DERIVADO da `MetaConnection` cujo token será usado — nunca do
   *  chamador. Serve para cruzar: a peça que vai ao ar é do mesmo cliente de
   *  quem é o perfil? Nulo = conexão de nível agência. */
  donoDaConexao?: string | null;
}

/**
 * A TERCEIRA PERGUNTA: **esta peça tem aprovação registrada do cliente dono
 * dela?** Chamada por `conferirPublicacao` antes de qualquer chamada de rede.
 *
 * Somente leitura, do começo ao fim. Este módulo nunca aprova nada — aprovar é
 * ato do cliente, no portal dele.
 */
export async function aprovacaoDaPeca(entrada: PecaParaAprovar): Promise<ParecerDeAprovacao> {
  const postId = (entrada.postId ?? "").trim();

  // ── Sem peça identificada ────────────────────────────────────────────────
  // Este é o caminho de quem chama `publishPost` "solto" (a rota manual
  // /api/meta/publish, uma ferramenta interna, um script escrito amanhã).
  // Publicação sem peça é publicação que nenhum cliente viu — logo, que nenhum
  // cliente aprovou. Recusa, e a recusa DIZ o caminho certo em vez de só negar.
  if (!postId) {
    return {
      aprovada: false,
      motivo:
        "Publicação sem peça identificada: não veio `postId`, e sem peça não existe aprovação de " +
        "cliente para conferir. Desde 14/08/2026 quem libera é o cliente, peça por peça — " +
        "publicar conteúdo avulso pelo perfil de um cliente não tem quem o tenha aprovado, por " +
        "construção. O caminho é agendar a peça (SocialPost) e levá-la ao card de aprovação do cliente.",
    };
  }

  // ── A peça existe, e de quem ela é? ──────────────────────────────────────
  // `null` cobre os dois casos que não podem virar permissão: peça inexistente
  // e banco fora do ar. Fail-closed nos dois, como a trava de ativos ao lado.
  const peca = await prisma.socialPost
    .findUnique({ where: { id: postId }, select: { id: true, clientId: true } })
    .catch(() => null);

  if (!peca) {
    return {
      aprovada: false,
      motivo:
        `Não consegui ler a peça ${postId} para conferir a aprovação do cliente (ela não existe, ou o ` +
        "banco não respondeu). Fail-closed: sem conseguir perguntar, não se publica.",
    };
  }

  const donoDaPeca = donoDe(peca.clientId);
  if (!donoDaPeca) {
    return {
      aprovada: false,
      motivo:
        `A peça ${postId} não tem cliente dono (SocialPost.clientId vazio) — não existe quem a aprove. ` +
        "Peça sem dono nunca sai, por construção.",
    };
  }

  // ── A peça é do mesmo cliente de quem é o perfil? ────────────────────────
  // O dono da conexão é DERIVADO (propriedade 1 da trava vizinha). Se ele
  // diverge do dono da peça, alguém está prestes a postar o conteúdo de um
  // cliente no perfil de outro — e nenhuma aprovação do mundo cobre isso.
  const donoDoPerfil = donoDe(entrada.donoDaConexao ?? null);
  if (donoDoPerfil !== donoDaPeca) {
    return {
      aprovada: false,
      motivo:
        `A peça ${postId} é do cliente ${donoDaPeca}, mas o perfil de destino é ` +
        `${donoDoPerfil ?? "da própria agência"}. Peça de um cliente não vai ao perfil de outro — ` +
        "a aprovação de um nunca vale pelo outro.",
    };
  }

  // ── Existe card APROVADO que decide ESTA peça, para ESTE cliente? ────────
  // `contains` é só PRÉ-FILTRO barato no banco; a conferência que vale é a
  // comparação de id exato depois do parse. Substring casaria um id que é
  // prefixo de outro, e "quase o mesmo id" não é o mesmo id.
  const cards = await prisma.approvalRequest
    .findMany({
      where: {
        clientId: donoDaPeca,
        status: STATUS_APROVADO,
        sourcePostIdsJson: { contains: postId },
      },
      select: {
        id: true,
        clientId: true,
        reviewedBy: true,
        reviewedAt: true,
        sourcePostIdsJson: true,
      },
      orderBy: { reviewedAt: "desc" },
    })
    .catch(() => null);

  if (cards === null) {
    return {
      aprovada: false,
      motivo:
        `Não consegui ler os registros de aprovação da peça ${postId} (banco indisponível). ` +
        "Fail-closed: 'não consegui perguntar' nunca vira 'está aprovada'.",
    };
  }

  const queDecidemEstaPeca = cards.filter((c) => lerIds(c.sourcePostIdsJson).includes(postId));

  if (queDecidemEstaPeca.length === 0) {
    return { aprovada: false, motivo: fraseSemAprovacao(donoDaPeca) };
  }

  // ── E quem decidiu foi o CLIENTE? ────────────────────────────────────────
  const doCliente = queDecidemEstaPeca.find(
    (c) => decisaoEhDoCliente(c.reviewedBy) && !!c.reviewedAt,
  );

  if (!doCliente) {
    // A recusa carrega a evidência (guardrail 6): dizer QUEM carimbou é o que
    // separa "ninguém aprovou" de "a agência aprovou por ele" — e a segunda é
    // um problema de outra natureza, que some se o alerta for genérico.
    const carimbos = queDecidemEstaPeca
      .map((c) => `${c.id}="${c.reviewedBy ?? "(sem autor)"}"`)
      .join(", ");
    return {
      aprovada: false,
      motivo:
        `A peça ${postId} tem ${queDecidemEstaPeca.length} registro(s) de aprovação, mas NENHUM foi ` +
        `decidido pelo cliente dono dela: ${carimbos}. Só conta a decisão tomada no portal do cliente ` +
        `(gravada como "${PREFIXO_DO_CLIENTE}<nome>"), porque só ela prova que quem liberou foi ele. ` +
        "Carimbo da agência em nome do cliente não é aprovação do cliente (ordem do CEO, 14/08/2026).",
    };
  }

  return {
    aprovada: true,
    approvalRequestId: doCliente.id,
    aprovadaPor: nomeDeQuemAprovou(doCliente.reviewedBy),
    aprovadaEm: doCliente.reviewedAt!,
    clientId: donoDaPeca,
  };
}
