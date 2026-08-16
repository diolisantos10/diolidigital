// QUEM BATEU NA PORTA E NÃO FOI ATENDIDO.
//
// ── A CICATRIZ QUE ESTE ARQUIVO FECHA ───────────────────────────────────────
//
// Medido em produção em 08/08/2026: três interessados entraram pelo briefing
// público — Sushi Cazza (**51 dias**), Camila Pereira (29) e Beatriz Gimenes
// (28) — com a conversa inteira gravada, ticket, público-alvo e paleta. Briefing
// melhor que o de cliente pagante.
//
// Duas coisas foram consertadas depois disso, e uma não:
//
//   ✅ o briefing passou a PEDIR contato (`question-engine.ts`);
//   ✅ existe um leitor único de contato (`contato-do-lead.ts`);
//   ❌ **ninguém varre a fila.** Continuava não havendo nada que dissesse
//      "estas pessoas entraram e não foram respondidas".
//
// A casa já sabia fazer isso em dois outros lugares — `fila-que-se-cobra.ts`
// para o aviso interno e `o-que-espera-no-portao.ts` para a proposta parada. A
// porta da frente, que é por onde entra dinheiro novo, era a que não tinha.
//
// ── A DISTINÇÃO QUE FAZ ESTE ARQUIVO VALER ─────────────────────────────────
//
// "Ninguém respondeu" e "não temos como responder" parecem a mesma linha na
// tela e são problemas OPOSTOS:
//
//   • **esperando** → é desleixo nosso. O conserto é uma pessoa abrir e falar.
//   • **sem caminho** → é buraco de dado. Falar é impossível, e cobrar alguém
//     por não ter falado seria cobrar o impossível.
//
// Somar os dois num número só produziria um alarme que ninguém sabe atender —
// e alarme que não diz o conserto é ruído que se aprende a ignorar.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, E É DE PROPÓSITO ───────────────────────────
//
// **Não fala com ninguém.** Não manda e-mail, não manda WhatsApp, não escreve no
// banco. Ele CONTA. Dois motivos, e os dois têm peso:
//
//   1. quem aborda lead é gente, não máquina — abordagem automática em quem
//      demonstrou interesse é o caminho mais curto para queimar a marca e o
//      número;
//   2. **ordem do CEO, 10/08/2026:** nenhuma demanda de cliente até a agência
//      estar pronta. Uma varredura que dispara mensagem violaria a ordem no dia
//      em que fosse ligada, sem ninguém decidir isso.
//
// Contar é seguro sob a ordem dele. Falar não é. Há teste para as duas coisas.

import { prisma } from "@/lib/db/client";
import { lerContato, pistasDeContato, type PistaDeContato } from "@/lib/agency/comercial/contato-do-lead";

/** A partir de quantos dias sem resposta a espera vira negligência. Dois dias:
 *  quem preencheu um briefing inteiro espera retorno rápido, e no terceiro dia
 *  ele já falou com outra agência. */
export const DIAS_ATE_VIRAR_DESLEIXO = 2;

/**
 * Status que significam "ainda não foi atendido" — e a régua é **alguém agiu**,
 * nunca "a máquina terminou".
 *
 * ── O DEFEITO QUE ESTA LISTA TINHA, ATÉ 16/08/2026 ─────────────────────────
 *
 * Ela era `["new", "triaged", "qualifying"]`. **`triaged` e `qualifying` não
 * existem no vocabulário do banco** (`ClientRequestDbStatus`, em
 * `lib/agency/persistence/client-request-service.ts`) — nunca existiram, e
 * nenhuma linha do repositório os escreve. Sobrava `new`, e `new` dura
 * segundos:
 *
 *   • briefing **com** contato nasce `new` e `runAutoScope` dispara na hora; ao
 *     terminar ele grava **`scope_ready`** (`lib/dioli-brain/run-auto-scope.ts`)
 *     → o lead **caía fora da fila em segundos**, com escopo pronto e sem
 *     ninguém ter falado com ele. É exatamente "bateu na porta e não foi
 *     atendido", e era o caso que sumia;
 *   • briefing **sem** contato nasce **`lead_incompleto`** (o gate de contato de
 *     08/08) → **nunca esteve nesta fila**. `semCaminho` era estruturalmente
 *     zero em produção, enquanto a tela listava cartões "sem como falar" vindos
 *     de outra leitura. Duas verdades na mesma tela.
 *
 * O resultado: a fila mostrava só quem o auto-escopo tinha falhado ou ainda
 * estava rodando. Um alarme que só toca quando OUTRA coisa quebra.
 *
 * ── POR QUE CADA STATUS ENTRA ──────────────────────────────────────────────
 *
 * | status | quem escreve | por que ainda está na porta |
 * |---|---|---|
 * | `new` | a rota pública, com contato | acabou de chegar; ninguém olhou |
 * | `lead_incompleto` | a rota pública, sem contato | chegou e **não dá** para falar. Não é lixo: é a fila `semCaminho` |
 * | `scope_ready` | `runAutoScope` (**máquina**) | a proposta ficou pronta; **nenhuma pessoa falou com ele** |
 * | `needs_revision` | declarado no vocabulário, hoje sem escritor | o escopo voltou para refazer; ninguém fechou |
 *
 * ── POR QUE OS OUTROS SAEM ─────────────────────────────────────────────────
 *
 * `in_progress` é gravado por `create-project-from-request.ts` e por
 * `orchestrate/apply` — os dois são **ato de pessoa**: alguém aceitou a proposta
 * e abriu o projeto. `waiting_*` é a esteira trabalhando, `completed` e
 * `cancelled` são fim de linha. Nesses quatro casos alguém agiu, e é isso que
 * tira da porta.
 *
 * ⚠️ **Se um status novo entrar no vocabulário e ninguém mexer aqui, ele fica
 * de fora em silêncio.** Há teste que compara esta lista com
 * `ClientRequestDbStatus` inteiro e obriga quem acrescentar um status a
 * declarar de que lado ele cai.
 */
export const AINDA_NA_PORTA = ["new", "lead_incompleto", "scope_ready", "needs_revision"] as const;

/**
 * Status que saem da fila porque **alguém agiu**. Existe para o teste poder
 * exigir que a soma das duas listas seja o vocabulário inteiro — status novo
 * sem lado declarado reprova.
 */
export const JA_FOI_ATENDIDO = [
  "waiting_strategy", "waiting_social", "waiting_design", "waiting_traffic",
  "waiting_analytics", "waiting_quality", "in_progress", "completed", "cancelled",
] as const;

/**
 * Quantos a LISTA carrega. Ela tem teto e a **contagem não** — `resumoDaPorta`
 * conta no banco, sem `take`, e diz quando a lista é amostra.
 *
 * A versão anterior tinha `take: 200` e o resumo derivava `naPorta` do tamanho
 * da lista: com 250 na fila a tela afirmava "200 na porta", sem marcador. Teto
 * que corta a contagem é mentira sobre o tamanho da fila; teto que corta a
 * lista é só não despejar 250 cartões numa tela.
 */
export const TETO_DA_LISTA = 200;

export interface NaPorta {
  id: string;
  negocio: string;
  /** Dias desde que a pessoa entrou. CALCULADO — nunca digitado. */
  diasEsperando: number;
  /** `true` quando existe canal declarado. Nome sozinho não conta. */
  temComoFalar: boolean;
  /** Por que não dá para falar. Nulo quando dá. */
  porQueNaoDaParaFalar: string | null;
  /** Pistas achadas no texto — Instagram, telefone solto. **NÃO é contato**, e
   *  nunca faz `temComoFalar` virar `true`. Serve para uma pessoa decidir se
   *  vale a pena tentar. */
  pistas: PistaDeContato[];
  /** Passou do prazo de virar desleixo. */
  desleixo: boolean;
}

/**
 * Quem entrou pela porta da frente e ainda não foi atendido.
 *
 * Devolve no máximo `TETO_DA_LISTA` — os **mais antigos**, que são os que
 * cobram. Quem quer o tamanho da fila usa `resumoDaPorta`, que conta no banco.
 *
 * ⚠️ **LANÇA quando o banco não responde, e isso mudou em 16/08/2026.**
 *
 * A versão anterior prometia "nunca lança: uma leitura que falha não pode
 * esconder a fila" e fazia `.catch(() => [])` — que é exatamente esconder a
 * fila, com a agravante de ser em silêncio. Medido: com o banco caindo, a rota
 * devolvia **200 · `medido: true` · `fila: []`**, a tela imprimia *"Isto é boa
 * notícia: todo briefing que chegou já foi atendido"*, e o `catch` da rota — que
 * existe para dizer *"esta fila NÃO é zero, é desconhecida"* — era
 * **inalcançável**. O relógio também não registrava: não passava por
 * `quebrou()`, não entrava no pulso.
 *
 * É a mesma correção que a irmã `aprovacao-parada.ts` recebeu no mesmo dia, e
 * pelo mesmo motivo. Quem chama trata: a perna do relógio tem `try/catch`
 * próprio com `quebrou("porta-da-frente")`, e a rota devolve 503. Falha de
 * leitura e fila vazia são fatos opostos.
 */
export async function quemBateuNaPorta(workspaceId: string, agora: Date): Promise<NaPorta[]> {
  const pedidos = await prisma.clientRequestDb.findMany({
    where: { workspaceId, status: { in: [...AINDA_NA_PORTA] } },
    orderBy: { createdAt: "asc" },
    take: TETO_DA_LISTA,
  });

  return pedidos.map((p) => {
    const contato = lerContato({ briefingJson: p.briefingJson, sdrHandoffJson: p.sdrHandoffJson });
    const dias = Math.floor((agora.getTime() - p.createdAt.getTime()) / 86_400_000);
    return {
      id: p.id,
      negocio: p.businessName,
      diasEsperando: dias,
      temComoFalar: contato.temComoFalar,
      porQueNaoDaParaFalar: contato.temComoFalar ? null : contato.motivo,
      pistas: contato.temComoFalar ? [] : pistasDeContato(p.rawContext),
      desleixo: contato.temComoFalar && dias >= DIAS_ATE_VIRAR_DESLEIXO,
    };
  });
}

export interface ResumoDaPorta {
  /** Total parado na porta. **Contado no banco, sem teto** — não é o tamanho da
   *  lista. Ver `amostrada`. */
  naPorta: number;
  /** Quantos couberam na lista que gerou os baldes abaixo. */
  listados: number;
  /** `true` quando `listados < naPorta`: os números seguintes falam dos
   *  `listados` **mais antigos**, e não da fila inteira. A tela é obrigada a
   *  dizer isso — afirmar o contrário foi o defeito de 16/08. */
  amostrada: boolean;
  /** Dá para falar, e ninguém falou. **É o número que cobra a casa.**
   *  Sai da lista, então respeita o teto: com `amostrada: true` ele é um piso,
   *  não o total. */
  esperandoResposta: number;
  /** Passou do prazo. Subconjunto de `esperandoResposta`, e também um piso
   *  quando `amostrada`. */
  desleixo: number;
  /** Não dá para falar. Problema de DADO, não de atendimento — e é por isso que
   *  ele é contado separado: cobrar alguém por não ter ligado para quem não
   *  deixou telefone é cobrar o impossível.
   *
   *  ⚠️ Era **estruturalmente zero** até 16/08/2026, porque `lead_incompleto`
   *  não estava em `AINDA_NA_PORTA`. Ver o cabeçalho daquela lista. */
  semCaminho: number;
  /** Há quantos dias espera o mais antigo de quem DÁ para responder.
   *  Nulo quando não há ninguém nessa situação — nunca zero. */
  maisAntigoEmDias: number | null;
}

/**
 * O resumo que sobe para quem olha a casa. Conclusão primeiro.
 *
 * A CONTAGEM e a LISTA são duas leituras, de propósito: `count` no banco não
 * tem teto e diz o tamanho de verdade; a lista tem teto porque precisa abrir
 * `briefingJson` linha a linha para saber quem tem canal de contato. Derivar
 * `naPorta` de `fila.length` — como esta função fazia até 16/08 — fazia 250 na
 * fila virarem "200 na porta" sem marcador nenhum.
 *
 * Lança pelo mesmo motivo de `quemBateuNaPorta`: falha de leitura não vira
 * fila vazia.
 */
export async function resumoDaPorta(workspaceId: string, agora: Date): Promise<ResumoDaPorta> {
  return (await lerAPorta(workspaceId, agora)).resumo;
}

/**
 * A fila e o resumo dela, numa leitura só. É o que a rota usa.
 *
 * Até 16/08 a rota chamava `resumoDaPorta` e `quemBateuNaPorta` em paralelo,
 * com um comentário defendendo a dupla leitura ("recontar aqui seria uma
 * segunda cópia da mesma regra"). O argumento estava certo e a solução era
 * outra: **uma função que devolve as duas coisas**. Assim continua havendo uma
 * regra só, e o banco é lido uma vez — a leitura dupla virava tripla agora que
 * a contagem tem consulta própria.
 */
export async function lerAPorta(
  workspaceId: string,
  agora: Date,
): Promise<{ resumo: ResumoDaPorta; fila: NaPorta[] }> {
  const [total, fila] = await Promise.all([
    prisma.clientRequestDb.count({ where: { workspaceId, status: { in: [...AINDA_NA_PORTA] } } }),
    quemBateuNaPorta(workspaceId, agora),
  ]);
  const alcancaveis = fila.filter((f) => f.temComoFalar);
  const resumo: ResumoDaPorta = {
    naPorta: total,
    listados: fila.length,
    amostrada: fila.length < total,
    esperandoResposta: alcancaveis.length,
    desleixo: fila.filter((f) => f.desleixo).length,
    semCaminho: fila.filter((f) => !f.temComoFalar).length,
    // Nulo, e não zero: zero afirmaria "o mais antigo espera há zero dias" sobre
    // uma fila que não existe.
    maisAntigoEmDias: alcancaveis.length === 0 ? null : Math.max(...alcancaveis.map((f) => f.diasEsperando)),
  };
  return { resumo, fila };
}
