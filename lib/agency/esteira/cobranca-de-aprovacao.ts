// cobranca-de-aprovacao.ts — A PEÇA PRONTA PARA DE MORRER EM SILÊNCIO.
//
// ── 🔴 O BURACO, MEDIDO CONTRA O CÓDIGO EM 15/08/2026 ──────────────────────
//
// `aprovacao-parada.ts` foi escrito em 12/08 e faz o que promete: conta o card
// que ninguém decidiu, separando o que espera o CLIENTE do que espera a AGÊNCIA.
// Buscando `aprovacoesParadas` e `resumoDasAprovacoes` no repositório inteiro,
// os únicos chamadores estão em `__tests__/esteira/aprovacao-parada.test.ts`.
//
// **Zero chamadores em produção. Nenhuma rota, nenhuma tela, nenhuma perna do
// relógio.** O contador existe, está correto, é testado — e ninguém o lê. O
// placar da casa (`docs/agencia-onde-estamos.md`, Aprovação) afirma que "o card
// parado passou a ser contado". Ele passou a ser CONTÁVEL. Contado, não é.
//
// Este arquivo é o elo que faltava: pega a fila que aquele módulo sabe medir e a
// transforma em AVISO ENDEREÇADO AO CLIENTE.
//
// ── AS QUATRO DECISÕES QUE ELE CARREGA ────────────────────────────────────
//
// 1. **NÃO cobra quem está esperando a AGÊNCIA.** `bolaConosco` (o cliente
//    perguntou e ninguém respondeu) sai da fila de cobrança e entra numa lista
//    própria. Cobrar aqui seria um alarme que responsabiliza o cliente pelo
//    atraso da casa — a injustiça que `aprovacao-parada.ts` foi escrito para
//    impedir, e que este arquivo não pode desfazer por conveniência.
//
// 2. **O prazo é o do CONTRATO, não um número novo.** `prazo-de-aprovacao.ts`
//    lê `expiresAt` do card quando existe e, quando não existe, aplica os 2 dias
//    úteis de `docs/precos.md`. Inventar aqui um terceiro horizonte seria a
//    quarta régua para a mesma pergunta.
//
// 3. **UM aviso por card, para sempre.** A idempotência mora numa consulta ao
//    `ClientNotice` do próprio card (`kind` + o id do card no corpo), e não em
//    memória: um processo que morra no meio da rodada não pode recomeçar
//    cobrando de novo quem já foi cobrado. Aviso repetido é a rajada que esta
//    casa já pagou caro, e desta vez ela sairia na frente do cliente.
//
// 4. **REGISTRA, não dispara.** Escreve `ClientNotice` com `status: "pendente"`
//    e o link do portal já montado. Quem envia é `avisarCliente` /
//    `cobrarAFila`, que já são o caminho de saída da casa e já sabem tratar
//    canal fora do ar, teto de reenvio e motivo permanente. Um segundo caminho
//    de envio seria a segunda verdade de sempre.
//
// ── ⛔ O QUE ESTÁ DELIBERADAMENTE DESLIGADO ────────────────────────────────
//
// **Este módulo NÃO está ligado no `despertador.ts`.** Foi construído sob ordem
// explícita de não ligar nada no bloco do relógio (Diretor, 15/08/2026). Ele é
// máquina pronta e desligada: existe, é testado com tempo simulado, e não roda
// sozinho até alguém plugá-lo.
//
// **O ato de ligar, e de quem é:** uma perna nova em `baterORelogio()`, no mesmo
// molde da perna `fila-que-se-cobra` (try/catch com `quebrou("cobranca-de-aprovacao", …)`).
// É ato do CEO/Diretor, porque liga cobrança automática a cliente pagante.

import { prisma } from "@/lib/db/client";
import { aprovacoesParadas, type AprovacaoParada } from "@/lib/agency/esteira/aprovacao-parada";
import { lerPrazoDoCard } from "@/lib/agency/esteira/prazo-de-aprovacao";
import { linkVivoDoPortal } from "@/lib/agency/esteira/link-do-portal-do-cliente";

/** O `kind` do aviso. Nome estável: é por ele que a idempotência procura, e é
 *  ele que `filaDeAvisos` mostra na tela. */
export const KIND_COBRANCA = "aprovacao";

/** Teto por rodada. Cobrar 5 clientes é cobrança; cobrar 200 é uma enxurrada de
 *  mensagens que ninguém pediu, na caixa de quem paga. */
export const MAX_COBRANCAS_POR_RODADA = 5;

/** A marca que torna o aviso rastreável até o card. Fica no CORPO porque
 *  `ClientNotice` não tem coluna para o id do card — e sem ela a idempotência
 *  seria por cliente, cobrando um card e calando os outros. */
export function marcaDoCard(approvalId: string): string {
  return `[card:${approvalId}]`;
}

export interface CobrancaGerada {
  approvalId: string;
  clientId: string;
  noticeId: string;
  /** O texto tal como foi gravado — é o que vai ao cliente. */
  texto: string;
  /** `false` quando o cliente não tem token de portal vivo. O aviso é gravado
   *  assim mesmo, com o motivo: sem link é pior, sem aviso é muito pior. */
  temLink: boolean;
}

export interface ResultadoDaCobranca {
  /** Avisos NOVOS gravados nesta rodada. */
  geradas: CobrancaGerada[];
  /** Cards que já tinham aviso — nenhuma linha foi escrita para eles. */
  jaCobrados: number;
  /** Cards ainda dentro do prazo. Não são problema; são a fila saudável. */
  noPrazo: number;
  /** ⚠️ A AGÊNCIA é que deve resposta. NÃO foram cobrados, e cada um é dívida
   *  da casa — a lista sobe com nome para virar trabalho de gente. */
  esperandoAAgencia: Array<{ approvalId: string; diasParado: number }>;
  /** Cards sem `clientId` resolvível: não há a quem endereçar. Declarados,
   *  nunca engolidos. */
  semDono: string[];
  /** Cards que venceram e não foram cobrados por causa do teto da rodada. */
  adiadosPeloTeto: number;
}

function vazio(): ResultadoDaCobranca {
  return { geradas: [], jaCobrados: 0, noPrazo: 0, esperandoAAgencia: [], semDono: [], adiadosPeloTeto: 0 };
}

/**
 * O texto que o cliente lê. Sem jargão interno, sem id, sem nome de tabela.
 *
 * A marca do card entra no fim, numa linha própria, porque ela é a chave de
 * idempotência. É feia e é deliberada: a alternativa era uma coluna nova no
 * `ClientNotice`, e migration em SQLite sobre volume de produção é risco maior
 * que uma linha de rodapé.
 */
export function textoDaCobranca(input: {
  assunto: string | null;
  diasParado: number;
  approvalId: string;
}): string {
  const oQue = input.assunto?.trim() || "uma entrega sua";
  const quanto = input.diasParado <= 1 ? "desde ontem" : `há ${input.diasParado} dias`;
  return (
    `Oi! ${oQue} está no seu portal esperando a sua aprovação ${quanto}.\n\n` +
    "Enquanto você não decide, a gente não segue — é a sua palavra que solta o próximo passo. " +
    "Dá uma olhada quando puder: aprovar, pedir ajuste ou tirar uma dúvida, tudo pelo link abaixo.\n\n" +
    marcaDoCard(input.approvalId)
  );
}

/** O assunto do e-mail, quando o canal de e-mail estiver ligado. */
export function assuntoDaCobranca(assunto: string | null): string {
  return assunto?.trim()
    ? `Esperando a sua aprovação: ${assunto.trim()}`
    : "Tem uma entrega sua esperando aprovação";
}

/** Já existe aviso deste card? A busca é pela marca dentro do corpo, em
 *  qualquer status: aviso já enviado, já dispensado ou ainda pendente são
 *  todos "este card já foi cobrado". Reenviar é decisão de `cobrarAFila`. */
async function jaFoiCobrado(clientId: string, approvalId: string): Promise<boolean> {
  const achado = await prisma.clientNotice.findFirst({
    where: { clientId, kind: KIND_COBRANCA, body: { contains: marcaDoCard(approvalId) } },
    select: { id: true },
  }).catch(() => null);
  return achado != null;
}

/**
 * Varre as aprovações paradas e grava a cobrança de quem passou do prazo.
 *
 * `agora` é sempre INJETADO — nunca `new Date()` aqui dentro. É o que torna a
 * cadeia inteira provável com tempo simulado, sem esperar dois dias úteis
 * rodarem de verdade.
 *
 * Nunca lança: uma rodada que falha não pode derrubar o relógio da casa.
 */
export async function cobrarAprovacoesParadas(
  workspaceId: string,
  agora: Date,
  opcoes: { teto?: number } = {},
): Promise<ResultadoDaCobranca> {
  const saida = vazio();
  const teto = Math.max(1, opcoes.teto ?? MAX_COBRANCAS_POR_RODADA);

  let fila: AprovacaoParada[] = [];
  try {
    fila = await aprovacoesParadas(workspaceId, agora);
  } catch {
    return saida;
  }

  for (const card of fila) {
    // 1. A bola é NOSSA. Sai da cobrança e entra na dívida da casa.
    if (card.bolaConosco) {
      saida.esperandoAAgencia.push({ approvalId: card.id, diasParado: card.diasParado });
      continue;
    }

    // 2. O prazo do contrato — do card quando há, da régua da casa quando não há.
    const prazo = lerPrazoDoCard({ abertoEm: card.abertoEm, expiresAt: null }, agora);
    // `prazoVencido` do próprio card vence a derivação: se alguém acordou data
    // com o cliente, é ela que manda.
    const venceu = card.prazoVencido || prazo.venceu;
    if (!venceu) {
      saida.noPrazo++;
      continue;
    }

    if (!card.clientId) {
      // Card preso a uma solicitação sem cliente ainda: não há a quem endereçar,
      // e endereçar por palpite manda o portal de um cliente a outro.
      saida.semDono.push(card.id);
      continue;
    }

    if (saida.geradas.length >= teto) {
      saida.adiadosPeloTeto++;
      continue;
    }

    if (await jaFoiCobrado(card.clientId, card.id)) {
      saida.jaCobrados++;
      continue;
    }

    const texto = textoDaCobranca({
      assunto: card.titulo,
      diasParado: card.diasParado,
      approvalId: card.id,
    });
    const portal = await linkVivoDoPortal(card.clientId, agora);

    try {
      const gravado = await prisma.clientNotice.create({
        data: {
          workspaceId,
          clientId: card.clientId,
          kind: KIND_COBRANCA,
          body: texto,
          link: portal.link,
          // NASCE PENDENTE, sempre. Quem envia é o caminho de saída da casa;
          // este módulo não dispara nada. Gravar "enviado" aqui seria um
          // comprovante de algo que não aconteceu.
          status: "pendente",
          channel: "nenhum",
          failReason: portal.link
            ? "cobrança de aprovação registrada — ainda não saiu por canal nenhum"
            : `cobrança registrada SEM link do portal: ${portal.motivo}`,
        },
        select: { id: true },
      });
      saida.geradas.push({
        approvalId: card.id,
        clientId: card.clientId,
        noticeId: gravado.id,
        texto,
        temLink: portal.link != null,
      });
    } catch {
      // Falha de escrita não derruba os outros clientes da rodada. O card fica
      // sem cobrança e será reexaminado na passada seguinte — que é o
      // comportamento certo: perder uma cobrança é recuperável, duplicar não.
      continue;
    }
  }

  return saida;
}
