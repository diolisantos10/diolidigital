// QUANTO CUSTA ATENDER CADA CONTA — horas humanas, separadas por atividade.
//
// ─── POR QUE ISTO EXISTE (ordem do Diretor Geral, 16/08/2026) ────────────────
//
// O parecer do conselho de 05/08 fez a conta de margem da casa inteira tratando
// o **Presença de R$ 790 como a entrada**, e registrou o risco em uma frase:
// *"o plano de entrada atrai o cliente que paga menos e exige mais, ocupando
// capacidade que valia três vezes mais"*.
//
// Com o **Pulso a R$ 49**, a mesma hora de atendimento custa proporcionalmente
// **dezesseis vezes mais**. Uma hora humana por mês numa conta de R$ 49 já pode
// consumir o degrau inteiro — e ninguém sabe, porque **ninguém mediu**.
// `docs/precos.md` diz "a medir" na coluna de hora humana desde 05/08.
//
// ─── O QUE ISTO NÃO É ────────────────────────────────────────────────────────
//
// **Não bloqueia venda nenhuma.** Pulso e Ritmo são decisão consciente do CEO e
// continuam abertos. Isto é um MEDIDOR: existe para o número chegar ao CEO
// **antes** de a carteira encher, e não depois, quando a decisão já custou.
//
// Não escreve, não decide, não alerta e não fecha porta. Lê e conta.
//
// ─── ONDE O DADO JÁ ESTAVA ───────────────────────────────────────────────────
//
// Nada foi construído do zero: `ExecucaoV2` (Marco 2 da V2) já grava `ator`
// ("humano" | "ia"), `clienteId`, `funcaoId`, `departamentoId`, `inicio` e
// `fim`. Isso é exatamente "horas humanas por conta, separadas por atividade" —
// faltava alguém somar. O que **realmente** falta está em `LACUNAS_DA_MEDICAO`,
// no fim do arquivo, com tabela, campo e tela nomeados.

import { prisma } from "@/lib/db/client";

/** Uma execução já registrada. Espelha as colunas de `ExecucaoV2` que importam. */
export interface LinhaDeEsforco {
  ator: string;
  /** `null` = trabalho interno da casa, sem dono. É resposta legítima, não falta. */
  clienteId: string | null;
  funcaoId: string;
  departamentoId: string;
  inicio: Date;
  /** `null` = a execução nunca foi fechada. NÃO vira duração zero. */
  fim: Date | null;
}

export interface EsforcoPorAtividade {
  funcaoId: string;
  departamentoId: string;
  /** Execuções fechadas, com duração conhecida. */
  execucoesMedidas: number;
  minutos: number;
  /** Execuções abertas ou com relógio impossível: contadas, nunca somadas. */
  execucoesNaoMedidas: number;
}

export interface EsforcoDaConta {
  clienteId: string;
  /** Soma das atividades medidas. */
  minutosHumanos: number;
  horasHumanas: number;
  atividades: EsforcoPorAtividade[];
  /**
   * Quantas execuções entraram sem duração. **É o número que decide se o total
   * acima vale alguma coisa.** Um total de 12 minutos com 40 execuções não
   * medidas não é "conta barata": é conta não medida, e as duas coisas se
   * parecem no relatório se ninguém as separar.
   */
  execucoesNaoMedidas: number;
  /** true quando NADA foi medido nesta conta. */
  totalmenteNaoMedida: boolean;
}

export interface RetratoDoEsforco {
  contas: EsforcoDaConta[];
  /** Execuções humanas sem `clienteId`: trabalho interno da casa. Sai separado
   *  porque "gasto sem dono" é uma linha de gestão, não um erro a esconder. */
  minutosSemDono: number;
  /** Execuções de IA ignoradas aqui — o custo de IA já é medido em `AIRunLog`. */
  execucoesDeIaIgnoradas: number;
  /** Total de linhas lidas. Zero linhas com `medido: false` é o alarme de que a
   *  leitura falhou; zero linhas com `medido: true` é "não houve trabalho". */
  linhasLidas: number;
}

/** Teto de sanidade: 24h numa única execução é relógio errado, não trabalho. */
const MINUTOS_ABSURDOS = 24 * 60;

/**
 * A conta, pura. Recebe as linhas e devolve o retrato — sem banco, para poder
 * ser provada contra casos que a produção ainda não produziu.
 *
 * **As três regras que fazem o número ser honesto:**
 *   1. execução sem `fim` NÃO é duração zero — é `execucoesNaoMedidas`;
 *   2. duração negativa ou absurda também não entra, pelo mesmo motivo;
 *   3. execução de IA não vira hora humana (o custo de IA mora no `AIRunLog`).
 */
export function medirEsforco(linhas: LinhaDeEsforco[]): RetratoDoEsforco {
  const porConta = new Map<string, EsforcoDaConta>();
  let minutosSemDono = 0;
  let execucoesDeIaIgnoradas = 0;

  for (const l of linhas) {
    if (l.ator !== "humano") {
      execucoesDeIaIgnoradas++;
      continue;
    }

    const minutos =
      l.fim === null ? null : Math.round((l.fim.getTime() - l.inicio.getTime()) / 60_000);
    const valido = minutos !== null && Number.isFinite(minutos) && minutos >= 0 && minutos <= MINUTOS_ABSURDOS;

    if (l.clienteId === null) {
      if (valido) minutosSemDono += minutos as number;
      continue;
    }

    let conta = porConta.get(l.clienteId);
    if (!conta) {
      conta = {
        clienteId: l.clienteId,
        minutosHumanos: 0,
        horasHumanas: 0,
        atividades: [],
        execucoesNaoMedidas: 0,
        totalmenteNaoMedida: true,
      };
      porConta.set(l.clienteId, conta);
    }

    let atividade = conta.atividades.find((a) => a.funcaoId === l.funcaoId);
    if (!atividade) {
      atividade = {
        funcaoId: l.funcaoId,
        departamentoId: l.departamentoId,
        execucoesMedidas: 0,
        minutos: 0,
        execucoesNaoMedidas: 0,
      };
      conta.atividades.push(atividade);
    }

    if (valido) {
      atividade.execucoesMedidas++;
      atividade.minutos += minutos as number;
      conta.minutosHumanos += minutos as number;
      conta.totalmenteNaoMedida = false;
    } else {
      atividade.execucoesNaoMedidas++;
      conta.execucoesNaoMedidas++;
    }
  }

  const contas = [...porConta.values()].map((c) => ({
    ...c,
    // Uma casa decimal: dizer "2,3h" é honesto; dizer "2,28333h" finge uma
    // precisão que um relógio de execução não tem.
    horasHumanas: Math.round((c.minutosHumanos / 60) * 10) / 10,
    // Empate desempata por nome, não pela ordem em que as linhas chegaram do
    // banco: relatório que muda de ordem entre duas leituras iguais faz quem lê
    // achar que algo mudou.
    atividades: c.atividades.sort((a, b) => b.minutos - a.minutos || a.funcaoId.localeCompare(b.funcaoId)),
  }));
  contas.sort((a, b) => b.minutosHumanos - a.minutosHumanos);

  return { contas, minutosSemDono, execucoesDeIaIgnoradas, linhasLidas: linhas.length };
}

export type LeituraDoEsforco =
  | { medido: true; retrato: RetratoDoEsforco }
  | { medido: false; motivo: string };

/**
 * Lê o esforço registrado numa janela.
 *
 * **Falha de leitura NUNCA vira zero.** "Ninguém trabalhou nesta conta" e "não
 * consegui ler o banco" são fatos opostos, e o segundo apresentado como o
 * primeiro faria o CEO concluir que o Pulso não dá trabalho nenhum.
 */
export async function lerEsforco(desde: Date, ate: Date): Promise<LeituraDoEsforco> {
  try {
    const linhas = await prisma.execucaoV2.findMany({
      where: { ator: "humano", inicio: { gte: desde, lte: ate } },
      select: { ator: true, clienteId: true, funcaoId: true, departamentoId: true, inicio: true, fim: true },
      // Teto para a consulta não varrer a tabela inteira num volume grande.
      take: 20_000,
      orderBy: { inicio: "desc" },
    });
    return { medido: true, retrato: medirEsforco(linhas as LinhaDeEsforco[]) };
  } catch (e) {
    return {
      medido: false,
      motivo: `não consegui ler ExecucaoV2: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE FALTA PARA A MEDIÇÃO RESPONDER A PERGUNTA DO CEO
// ─────────────────────────────────────────────────────────────────────────────
//
// A pergunta é "quanto custa atender um cliente de Pulso?". O que está acima
// responde "quanto custa atender o cliente X". Falta o elo entre conta e plano
// — e ele não existe no banco.
//
// A lista abaixo é a resposta ao pedido "diga exatamente o que falta, em vez de
// construir uma torre": cada linha nomeia TABELA, CAMPO ou TELA. Nenhuma delas
// foi construída aqui de propósito — schema é frente de `plataforma`, e mexer
// no `prisma/` sem dono declarado já quebrou frente de outro agente antes.

export interface Lacuna {
  o_que: string;
  onde: string;
  porque_importa: string;
  dono: string;
}

export const LACUNAS_DA_MEDICAO: Lacuna[] = [
  {
    o_que: "🔴 `Client` NÃO TEM CAMPO DE PLANO. É a lacuna que bloqueia a pergunta inteira.",
    onde: "prisma/schema.prisma → `model Client` (migration: `planoId String?`, valores = ids de `lib/agency/planos.ts`)",
    porque_importa:
      "Sem isto dá para dizer 'a conta X consumiu 3h', e não 'o Pulso consome em média 3h'. " +
      "A decisão do CEO é sobre o DEGRAU, não sobre um cliente. Hoje a associação só existe na " +
      "cabeça de quem vendeu.",
    dono: "plataforma",
  },
  {
    o_que: "`ExecucaoV2.fim` é opcional, e execução que ninguém fecha some da conta",
    onde: "prisma/schema.prisma → `model ExecucaoV2.fim`; quem fecha é `lib/agency/execucao-v2/executor.ts`",
    porque_importa:
      "Toda execução aberta vira `execucoesNaoMedidas`. Se a proporção for alta, o total de horas " +
      "é um piso, não uma medida — e um piso apresentado como medida subestima o custo do plano " +
      "mais barato, que é exatamente o erro caro aqui.",
    dono: "plataforma",
  },
  {
    o_que: "Não há TELA que mostre horas por conta e por atividade",
    onde: "sugestão: uma seção em `/agency/catalog` (onde já vive a Inteligência de Margem, MASTER-only)",
    porque_importa:
      "O número existir no banco e ninguém olhar é o mesmo que não medir. A Inteligência de Margem " +
      "já mostra `custo: não medido` nos seis planos — é o lugar natural de plugar isto.",
    dono: "interface + experiencia",
  },
  {
    o_que: "O trabalho humano de atendimento pode não passar por `ExecucaoV2`",
    onde: "responder no WhatsApp, revisar peça na mão, ligar para o cliente",
    porque_importa:
      "A tabela cobre a linha de execução da V2. Atendimento que acontece fora dela não é contado, " +
      "e é justamente o atendimento que se teme no plano de entrada. O medidor mede o que passa " +
      "pela linha — declarar isso evita que o total vire uma prova falsa de que 'o Pulso é barato'.",
    dono: "esteira",
  },
  {
    o_que: "`costBasis` dos seis planos continua `null` em `pricing-margins.ts`",
    onde: "lib/agency/pricing-margins.ts → `MarginProfile.costBasis`",
    porque_importa:
      "É o consumidor natural deste medidor: hora humana medida + custo de IA (já em `AIRunLog`) = " +
      "custo por conta. Enquanto for `null`, o painel do dono mostra 'sem custo' em vez de uma " +
      "margem inventada — o que está certo, e é temporário por decisão, não por esquecimento.",
    dono: "CEO decide a prioridade",
  },
];
