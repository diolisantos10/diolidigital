// A APROVAÇÃO QUE NINGUÉM DECIDIU — a peça pronta que morre esperando um clique.
//
// ── O BURACO (medido contra o código em 12/08/2026) ────────────────────────
//
// `ApprovalRequest` tem `expiresAt` desde sempre, e **nenhum varredor o lê**.
// Buscando `approvalRequest.findMany` no repositório inteiro: quatro chamadas,
// todas para montar tela ou reabrir card à mão. Nenhuma pergunta *"quais cards
// venceram e ninguém decidiu?"*.
//
// Consequência prática: a casa produz a peça, gasta IA, gasta relógio, manda
// para o cliente decidir — e se ele não clicar, **acabou ali**. Ninguém é
// avisado. Do lado de fora parece que a agência não entregou; do lado de dentro
// parece que entregou. Fila morta conta como entrega não feita, e esta é a fila
// mais cara de todas: é a única que já custou o trabalho inteiro.
//
// A casa já sabia varrer isso em três lugares — `fila-que-se-cobra.ts` (aviso
// interno), `o-que-espera-no-portao.ts` (proposta) e `quem-bateu-na-porta.ts`
// (lead). A aprovação, que é onde a peça pronta espera, era a que faltava.
//
// ── A DISTINÇÃO QUE FAZ ESTE ARQUIVO NÃO SER INJUSTO ──────────────────────
//
// Duas situações parecem "o cliente não respondeu" e são opostas:
//
//   • **esperando o cliente** — a bola é dele. Cobrar é legítimo.
//   • **dúvida aberta** (`questionOpenedAt`) — ele PERGUNTOU e a agência não
//     respondeu. **A bola é nossa.** O schema já diz isso com todas as letras:
//     *"o relógio do prazo não pode correr contra ele enquanto a bola está com a
//     agência"*.
//
// Somar as duas produziria a pior espécie de alarme: um que cobra o cliente
// pelo atraso da própria casa. Por isso a dúvida aberta sai contada à parte —
// e ela é a que tem urgência maior, porque é a que é culpa nossa.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
//
// Não decide por ninguém, não aprova, não reprova, não expira card e não manda
// mensagem. **Aprovar no lugar do cliente é falsificar o consentimento dele** —
// e é o único erro desta lista que não tem desfazer. Ele CONTA.

import { prisma } from "@/lib/db/client";

/** A partir de quantos dias sem decisão a espera vira abandono, para o card que
 *  não tem prazo próprio. Três dias: o cliente que ia responder já respondeu. */
export const DIAS_ATE_VIRAR_ABANDONO = 3;

export interface AprovacaoParada {
  id: string;
  departamento: string;
  /** DE QUEM É O CARD. Sem isto não há a quem endereçar a cobrança — e foi
   *  exatamente por não carregar o dono que este módulo ficou sem consumidor:
   *  ele contava a fila e não sabia dizer para qual cliente. */
  clientId: string | null;
  clientRequestId: string | null;
  /** Quando o card foi aberto. Cru, para quem precisa aplicar o prazo do
   *  contrato (dias ÚTEIS) em vez de dias corridos. */
  abertoEm: Date;
  /** A primeira linha da `reviewNote` — o que o cliente vê como assunto. Nulo
   *  quando o card não tem corpo próprio; nunca inventado. */
  titulo: string | null;
  /** Dias desde que o card foi aberto. CALCULADO — nunca digitado. */
  diasParado: number;
  /** O prazo do card passou. `false` também quando não há prazo definido —
   *  ausência de prazo não é prazo vencido. */
  prazoVencido: boolean;
  /** O cliente perguntou e a agência não respondeu. **A bola é NOSSA.** */
  bolaConosco: boolean;
  /** A frase que a tela mostra. Diz de quem é a vez. */
  deQuemEAVez: string;
}

/**
 * Os cards de aprovação que ninguém decidiu.
 *
 * Nunca lança: uma leitura que falha não pode esconder a fila.
 */
export async function aprovacoesParadas(workspaceId: string, agora: Date): Promise<AprovacaoParada[]> {
  // ── DE QUEM É O CARD ──────────────────────────────────────────────────────
  // `ApprovalRequest` NÃO tem `workspaceId`: a posse é `clientRequestId` OU
  // `clientId` (a regra que a casa adotou em 03/08/2026 para o cliente criado
  // direto). Então o inquilino se resolve pelos dois caminhos, e **card sem
  // nenhum dos dois fica de fora** — ele não tem dono, e varrer órfão de outro
  // inquilino é vazamento entre clientes.
  const donos = await prisma.client.findMany({
    where: { workspaceId }, select: { id: true },
  }).catch(() => []);
  const idsDoWorkspace = donos.map((c) => c.id);

  const cards = await prisma.approvalRequest.findMany({
    where: {
      status: "pending",
      OR: [
        { clientRequest: { workspaceId } },
        // Sem clientes no workspace, este ramo é omitido de propósito:
        // `{ clientId: { in: [] } }` casa com nada, mas `{ clientId: null }`
        // casaria com TODO card órfão do banco.
        ...(idsDoWorkspace.length > 0 ? [{ clientId: { in: idsDoWorkspace } }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  }).catch(() => []);

  return cards.map((c) => {
    const dias = Math.floor((agora.getTime() - c.createdAt.getTime()) / 86_400_000);
    const bolaConosco = c.questionOpenedAt != null;
    // Sem prazo definido, o card não está "vencido" — está parado. As duas
    // coisas são diferentes, e chamar ausência de prazo de prazo estourado
    // seria inventar um compromisso que ninguém assumiu.
    const prazoVencido = c.expiresAt != null && c.expiresAt.getTime() < agora.getTime();
    const primeiraLinha = (c.reviewNote ?? "").split("\n")[0]?.trim() ?? "";
    return {
      id: c.id,
      departamento: c.department,
      clientId: c.clientId ?? null,
      clientRequestId: c.clientRequestId ?? null,
      abertoEm: c.createdAt,
      // Vazio vira NULO, nunca string vazia: "" na tela parece título perdido,
      // e null diz que este card não tem assunto próprio.
      titulo: primeiraLinha || null,
      diasParado: dias,
      prazoVencido,
      bolaConosco,
      deQuemEAVez: bolaConosco
        ? "o cliente perguntou e ainda não foi respondido — a vez é da agência, e o prazo dele está pausado"
        : "aguardando a decisão do cliente",
    };
  });
}

export interface ResumoDasAprovacoes {
  paradas: number;
  /** Passou do prazo do próprio card, ou do horizonte de abandono. */
  abandonadas: number;
  /** Cards em que a agência é que deve resposta. **É o número que cobra a casa,
   *  e o que tem urgência maior — porque é o atraso que é nosso.** */
  bolaConosco: number;
  /** Dias do card mais antigo parado. Nulo em fila vazia — nunca zero. */
  maisAntigoEmDias: number | null;
}

/** O resumo que sobe para quem olha a casa. Conclusão primeiro. */
export async function resumoDasAprovacoes(workspaceId: string, agora: Date): Promise<ResumoDasAprovacoes> {
  const fila = await aprovacoesParadas(workspaceId, agora);
  return {
    paradas: fila.length,
    abandonadas: fila.filter((f) => f.prazoVencido || f.diasParado >= DIAS_ATE_VIRAR_ABANDONO).length,
    bolaConosco: fila.filter((f) => f.bolaConosco).length,
    // Nulo, e não zero: zero afirmaria "o mais antigo espera há zero dias" sobre
    // uma fila que não existe.
    maisAntigoEmDias: fila.length === 0 ? null : Math.max(...fila.map((f) => f.diasParado)),
  };
}
