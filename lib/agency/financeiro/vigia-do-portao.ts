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

  return {
    clientesComProjeto,
    projetosVivos: vivos.length,
    semProvaDePagamento: semProva,
    paradosPeloPortao: parados,
    exemplos,
  };
}
