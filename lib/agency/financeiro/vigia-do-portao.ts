// O VIGIA DO PORTÃO DE PAGAMENTO — a régua que se olha sozinha.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// Um portão que barra produção precisa contar quem ele está barrando. Sem esta
// contagem, "quantos clientes a trava está segurando?" só teria resposta por
// alguém abrir o banco à mão — e pergunta cuja resposta custa trabalho é
// pergunta que ninguém faz. Aí a trava passa a segurar cliente pagante em
// silêncio, que é o único jeito de este conserto virar defeito.
//
// Roda a cada passada do despertador (5 min) e só LÊ. Nunca escreve, nunca
// libera nada, nunca produz. Falhar aqui não pode parar a rodada: a contagem é
// vigilância, não caminho de produção.

import { prisma } from "@/lib/db/client";

export interface RetratoDoPortao {
  /** Clientes que têm ao menos um projeto. É a medida de "a casa atende alguém". */
  clientesComProjeto: number;
  /** Projetos que a esteira ainda pode pegar (`done` não é barrado por portão). */
  projetosVivos: number;
  /** Vivos SEM linha em `PagamentoConfirmado`. */
  semProvaDePagamento: number;
  /** Destes, os que o portão barra DE FATO agora. É o número que importa. */
  paradosPeloPortao: number;
  /** Até 5 nomes, para a linha do log ser acionável em vez de só numérica. */
  exemplos: string[];
  /**
   * QUEM são os clientes com projeto, e em que estado cada projeto está.
   *
   * Existe porque "1 cliente com projeto" não é acionável: para decidir sobre a
   * régua é preciso saber SE aquele projeto pode voltar a rodar e SE ele tem
   * pedido a que ligar um pagamento. Cliente sem pedido (`cliente direto`) é o
   * caso que o registro manual não alcança — e é o único que poderia ficar
   * preso sem saída. Ele precisa aparecer pelo nome, não virar estatística.
   */
  quemTemProjeto: Array<{
    cliente: string;
    projetos: Array<{ nome: string; estado: string; temPedido: boolean; pago: boolean }>;
  }>;
}

/**
 * Conta quem o portão está segurando. Só leitura.
 *
 * `semProvaDePagamento` e `paradosPeloPortao` são NÚMEROS DIFERENTES enquanto
 * existir alguma liberação que não venha de prova (uma anistia de vigência, por
 * exemplo). Quando não existe nenhuma, os dois são iguais — e é assim que se
 * enxerga, de fora, se ainda há porta aberta.
 */
export async function retratoDoPortao(): Promise<RetratoDoPortao> {
  const { conferirPagamento } = await import("@/lib/agency/financeiro/portao-de-pagamento");

  const [clientesComProjeto, vivos] = await Promise.all([
    prisma.client.count({ where: { projects: { some: {} } } }),
    prisma.project.findMany({
      where: { executionStatus: { in: ["idle", "pending", "running", "failed"] } },
      select: { id: true, name: true, clientRequestId: true },
    }),
  ]);

  const pagos = new Set(
    (await prisma.pagamentoConfirmado.findMany({ select: { clientRequestId: true } }))
      .map((p) => p.clientRequestId),
  );

  let semProva = 0;
  let parados = 0;
  const exemplos: string[] = [];

  for (const p of vivos) {
    if (p.clientRequestId && pagos.has(p.clientRequestId)) continue;
    semProva++;
    // O veredito REAL do portão — não uma segunda cópia da regra. Reimplementar
    // a decisão aqui faria o vigia mentir no dia em que o portão mudasse.
    const v = await conferirPagamento(p.clientRequestId);
    if (!v.liberado) {
      parados++;
      if (exemplos.length < 5) exemplos.push(`${p.name} (${p.id})`);
    }
  }

  // O retrato nominal. `take` porque isto roda a cada 5 minutos e uma casa com
  // mil clientes não pode virar mil linhas de log — o objetivo é enxergar o
  // começo, quando o número é pequeno e a decisão sobre a régua ainda está viva.
  const comProjeto = await prisma.client.findMany({
    where: { projects: { some: {} } },
    select: {
      name: true,
      projects: {
        select: { name: true, executionStatus: true, clientRequestId: true },
        take: 10,
      },
    },
    take: 10,
  });

  const quemTemProjeto = comProjeto.map((c) => ({
    cliente: c.name,
    projetos: c.projects.map((pr) => ({
      nome: pr.name,
      estado: pr.executionStatus,
      temPedido: pr.clientRequestId !== null,
      pago: pr.clientRequestId !== null && pagos.has(pr.clientRequestId),
    })),
  }));

  return {
    clientesComProjeto,
    projetosVivos: vivos.length,
    semProvaDePagamento: semProva,
    paradosPeloPortao: parados,
    exemplos,
    quemTemProjeto,
  };
}
