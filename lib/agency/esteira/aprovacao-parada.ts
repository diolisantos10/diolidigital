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

/** Quantos a LISTA carrega. A contagem NÃO tem teto — ver
 *  `contarAprovacoesParadas`. Truncar a contagem mente sobre o tamanho da fila;
 *  truncar a lista é só não despejar 250 linhas numa faixa de tela. */
export const TETO_DA_LISTA = 200;

export interface AprovacaoParada {
  id: string;
  departamento: string;
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
 * ⚠️ **LANÇA quando o banco não responde, e isso mudou em 16/08/2026.**
 *
 * A versão anterior prometia "nunca lança: uma leitura que falha não pode
 * esconder a fila" e fazia `.catch(() => [])` nas duas consultas — que é
 * exatamente esconder a fila, com a agravante de ser em silêncio. O resultado
 * prático, quando esta função ganhou tela: banco piscando → `paradas: 0` →
 * a tela imprimindo *"Nenhuma peça esperando decisão do cliente. Isto é boa
 * notícia."* Uma afirmação sobre o cliente construída em cima de um erro de
 * infraestrutura, com cara de fato conferido.
 *
 * Havia um TESTE trancando esse comportamento como invariante ("banco fora do
 * ar não derruba quem consulta"). É o mesmo padrão que esta casa já pagou três
 * vezes: **o defeito virando contrato.**
 *
 * Quem chama trata: a perna do relógio tem `try/catch` próprio com
 * `quebrou("aprovacao-parada")`, e a rota devolve 503 dizendo *"esta fila NÃO é
 * zero, é desconhecida"*. Falha de leitura e fila vazia são fatos opostos.
 */
/**
 * Quantos cards estão parados neste inquilino. **Sem teto.**
 *
 * É a metade que faltava da separação entre CONTAR e LISTAR: até 16/08 o resumo
 * derivava `paradas` do tamanho de uma lista com `take: 200`, e a tela imprimia
 * "a lista tem teto, a contagem acima não" — afirmação que o dado não
 * sustentava.
 */
export async function contarAprovacoesParadas(workspaceId: string): Promise<number> {
  return prisma.approvalRequest.count({ where: await ondeMoraAFila(workspaceId) });
}

/**
 * A cláusula de posse, escrita UMA vez.
 *
 * Contar e listar têm de olhar exatamente o mesmo conjunto. Duas cópias desta
 * cláusula divergem no dia em que alguém consertar só uma — e a divergência
 * apareceria como "201 parados, 200 listados" numa fila de 200, que ninguém
 * relacionaria à causa.
 */
async function ondeMoraAFila(workspaceId: string) {
  // Sem `.catch`: engolir o erro aqui devolveria lista vazia de donos, o ramo do
  // `clientId` sairia da consulta e a fila voltaria MENOR do que é — um número
  // errado para menos, em silêncio, que é pior que erro nenhum.
  const donos = await prisma.client.findMany({ where: { workspaceId }, select: { id: true } });
  const idsDoWorkspace = donos.map((c) => c.id);
  return {
    status: "pending",
    OR: [
      { clientRequest: { workspaceId } },
      // Sem clientes no workspace, este ramo é omitido de propósito:
      // `{ clientId: { in: [] } }` casa com nada, mas `{ clientId: null }`
      // casaria com TODO card órfão do banco.
      ...(idsDoWorkspace.length > 0 ? [{ clientId: { in: idsDoWorkspace } }] : []),
    ],
  };
}

export async function aprovacoesParadas(workspaceId: string, agora: Date): Promise<AprovacaoParada[]> {
  // ── DE QUEM É O CARD ──────────────────────────────────────────────────────
  // `ApprovalRequest` NÃO tem `workspaceId`: a posse é `clientRequestId` OU
  // `clientId` (a regra que a casa adotou em 03/08/2026 para o cliente criado
  // direto). Então o inquilino se resolve pelos dois caminhos, e **card sem
  // nenhum dos dois fica de fora** — ele não tem dono, e varrer órfão de outro
  // inquilino é vazamento entre clientes.
  // Sem `.catch`: engolir o erro aqui devolveria lista vazia de donos, o ramo
  // do `clientId` sairia da consulta e a fila voltaria MENOR do que é — um
  // número errado para menos, em silêncio, que é pior que erro nenhum.
  const cards = await prisma.approvalRequest.findMany({
    where: await ondeMoraAFila(workspaceId),
    orderBy: { createdAt: "asc" },
    take: TETO_DA_LISTA,
  });

  return cards.map((c) => {
    const dias = Math.floor((agora.getTime() - c.createdAt.getTime()) / 86_400_000);
    const bolaConosco = c.questionOpenedAt != null;
    // Sem prazo definido, o card não está "vencido" — está parado. As duas
    // coisas são diferentes, e chamar ausência de prazo de prazo estourado
    // seria inventar um compromisso que ninguém assumiu.
    const prazoVencido = c.expiresAt != null && c.expiresAt.getTime() < agora.getTime();
    return {
      id: c.id,
      departamento: c.department,
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
  /** **O total. Cliente e casa somados.** Nunca use este número sob um rótulo
   *  que fale de um dos dois — ver `esperandoOCliente`. */
  paradas: number;
  /** Passou do prazo do próprio card, ou do horizonte de abandono. */
  abandonadas: number;
  /** Cards em que a agência é que deve resposta. **É o número que cobra a casa,
   *  e o que tem urgência maior — porque é o atraso que é nosso.** */
  bolaConosco: number;
  /**
   * A bola é **DELE**: `paradas − bolaConosco`.
   *
   * ── 🔴 POR QUE ESTE CAMPO EXISTE (16/08/2026) ────────────────────────────
   *
   * A faixa da tela imprimia `paradas` sob o rótulo **"esperando a decisão
   * dele"** — e `paradas` inclui `bolaConosco`. Medido: 3 cards, 2 com dúvida
   * aberta → a tela dizia *"2 ele perguntou e não respondemos"* **e** *"3
   * esperando a decisão dele"*, quando só **1** esperava o cliente.
   *
   * É o alarme que o cabeçalho deste arquivo jura impedir: **um que cobra o
   * cliente pelo atraso da própria casa.** A separação estava feita na prosa e
   * não estava feita no número — e o aviso de não-soma da tela ficava entre
   * `abandonadas` e `paradas`, que não era o par que se sobrepunha.
   *
   * A conta mora aqui, e não na tela, porque tela que faz conta é a segunda
   * cópia da regra.
   */
  esperandoOCliente: number;
  /** Dias do card mais antigo parado, **de qualquer lado**. */
  maisAntigoEmDias: number | null;
  /**
   * Dias do mais antigo em que a bola é **DELE**. Nulo quando não há nenhum.
   *
   * Separado de `maisAntigoEmDias` pelo mesmo motivo: com 3 cards em que o mais
   * velho tem dúvida aberta, "a mais antiga há 6 dias" ao lado de "esperando a
   * decisão dele" datava a espera do cliente com o relógio de um card que o
   * schema declara **pausado**.
   */
  maisAntigoDeleEmDias: number | null;
  /** Dias do mais antigo em que a bola é **NOSSA**. É a dívida mais velha da
   *  casa, e é a que devia doer primeiro. */
  maisAntigoNossoEmDias: number | null;
  /** Quantos couberam na lista que gerou os números acima. */
  listados: number;
  /** `true` quando `listados < paradas`: os baldes são **piso**, não total. */
  amostrada: boolean;
}

/**
 * O resumo que sobe para quem olha a casa. Conclusão primeiro.
 *
 * A CONTAGEM é consulta própria e **não tem teto**; a lista tem. Derivar
 * `paradas` de `fila.length`, como esta função fazia até 16/08, fazia 250 cards
 * virarem "200 parados" sem marcador nenhum — enquanto a tela imprimia, com
 * todas as letras, *"a lista tem teto, a contagem acima não"*.
 */
export async function resumoDasAprovacoes(workspaceId: string, agora: Date): Promise<ResumoDasAprovacoes> {
  return (await lerAsAprovacoesParadas(workspaceId, agora)).resumo;
}

/** A fila e o resumo dela, numa leitura só. É o que a rota usa. */
export async function lerAsAprovacoesParadas(
  workspaceId: string,
  agora: Date,
): Promise<{ resumo: ResumoDasAprovacoes; fila: AprovacaoParada[] }> {
  const fila = await aprovacoesParadas(workspaceId, agora);
  const total = await contarAprovacoesParadas(workspaceId);
  const nossos = fila.filter((f) => f.bolaConosco);
  const deles = fila.filter((f) => !f.bolaConosco);
  const maior = (xs: AprovacaoParada[]) =>
    xs.length === 0 ? null : Math.max(...xs.map((f) => f.diasParado));

  const resumo: ResumoDasAprovacoes = {
    paradas: total,
    listados: fila.length,
    amostrada: fila.length < total,
    abandonadas: fila.filter((f) => f.prazoVencido || f.diasParado >= DIAS_ATE_VIRAR_ABANDONO).length,
    bolaConosco: nossos.length,
    // A conta que a tela fazia errado, feita aqui uma vez.
    esperandoOCliente: deles.length,
    // Nulo, e não zero: zero afirmaria "o mais antigo espera há zero dias" sobre
    // uma fila que não existe.
    maisAntigoEmDias: maior(fila),
    maisAntigoDeleEmDias: maior(deles),
    maisAntigoNossoEmDias: maior(nossos),
  };
  return { resumo, fila };
}
