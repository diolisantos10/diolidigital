// ─── O CONTADOR DE CONEXÕES, NO VOLUME ──────────────────────────────────────
//
// A cota é mensal e conexão gasta não volta. Um contador em memória zera a cada
// deploy — e teto que zera é teto que não existe (a lição do rate limit, no
// raio-x de 05/08). Aqui cada gasto é uma linha em `ConexaoGasta`.
//
// ── FAIL CLOSED NA LEITURA ──────────────────────────────────────────────────
// Se a consulta falhar, o gasto do mês NÃO volta como 0. Volta como a cota
// inteira — ou seja, "não sei quanto gastei" fecha a porta em vez de abrir.
// Zero num caminho de erro é a forma mais discreta de estourar uma cota.

import { prisma } from "@/lib/db/client";
import { competenciaDe, cotaMensal, avaliarSaldo, type Saldo } from "@/lib/marketplaces/99freelas/conexoes";

export type MotivoDoGasto = "proposta" | "pergunta";

export interface LeituraDoContador {
  competencia: string;
  gastas: number;
  /** `false` quando a leitura falhou e o número é o pior caso, não o real. */
  confiavel: boolean;
  motivo: string;
}

export async function conexoesGastasNoMes(p: {
  workspaceId: string;
  plataforma?: string;
  quando?: Date;
}): Promise<LeituraDoContador> {
  const plataforma = p.plataforma ?? "99freelas";
  const competencia = competenciaDe(p.quando ?? new Date());
  try {
    const linhas = await prisma.conexaoGasta.findMany({
      where: { workspaceId: p.workspaceId, plataforma, competencia },
      select: { custo: true },
    });
    const gastas = linhas.reduce((s, l) => s + (Number.isFinite(l.custo) ? l.custo : 0), 0);
    return { competencia, gastas, confiavel: true, motivo: `${gastas} conexão(ões) gasta(s) em ${competencia}.` };
  } catch (e) {
    const cota = cotaMensal(plataforma);
    return {
      competencia,
      gastas: cota.cota,
      confiavel: false,
      motivo: `NÃO CONSEGUI LER O CONTADOR (${e instanceof Error ? e.message : "erro"}). Fail closed: o mês conta como esgotado. "Não sei quanto gastei" nunca pode valer zero — conexão gasta não volta.`,
    };
  }
}

/** O saldo real, pronto para o portão. */
export async function saldoAtual(p: {
  workspaceId: string;
  custoLidoDaTela: unknown;
  plataforma?: string;
  quando?: Date;
}): Promise<Saldo & { contadorConfiavel: boolean }> {
  const leitura = await conexoesGastasNoMes(p);
  const saldo = avaliarSaldo({
    gastasNoMes: leitura.gastas,
    custoLidoDaTela: p.custoLidoDaTela,
    competencia: leitura.competencia,
    plataforma: p.plataforma,
  });
  return {
    ...saldo,
    pode: saldo.pode && leitura.confiavel,
    motivo: leitura.confiavel ? saldo.motivo : leitura.motivo,
    contadorConfiavel: leitura.confiavel,
  };
}

/**
 * Registra um gasto. Chamado DEPOIS que o humano clicou — nunca antes.
 *
 * Idempotente por `(workspace, plataforma, motivo, oportunidade)`: dois cliques
 * na mesma proposta não contam duas conexões. E não desfaz: conexão gasta não
 * volta, então não existe função de estorno neste arquivo — de propósito.
 */
export async function registrarGasto(p: {
  workspaceId: string;
  plataforma?: string;
  motivo: MotivoDoGasto;
  /** LIDO DA TELA. Quem chama com um número inventado quebra o contador. */
  custoLidoDaTela: number;
  oportunidadeId?: string | null;
  registradoPor: string;
  quando?: Date;
}): Promise<{ ok: boolean; jaEstavaRegistrado: boolean; motivo: string }> {
  if (!Number.isInteger(p.custoLidoDaTela) || p.custoLidoDaTela < 1) {
    return {
      ok: false, jaEstavaRegistrado: false,
      motivo: "O custo em conexões precisa ser um inteiro ≥ 1 LIDO DA TELA da plataforma. Custo inventado corrompe o contador do mês inteiro.",
    };
  }
  const plataforma = p.plataforma ?? "99freelas";
  const competencia = competenciaDe(p.quando ?? new Date());
  try {
    await prisma.conexaoGasta.create({
      data: {
        workspaceId: p.workspaceId,
        plataforma,
        competencia,
        motivo: p.motivo,
        custo: p.custoLidoDaTela,
        oportunidadeId: p.oportunidadeId ?? null,
        registradoPor: p.registradoPor,
      },
    });
    return { ok: true, jaEstavaRegistrado: false, motivo: `${p.custoLidoDaTela} conexão(ões) registrada(s) em ${competencia}.` };
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: true, jaEstavaRegistrado: true, motivo: "Este gasto já estava registrado — não foi contado duas vezes." };
    }
    return { ok: false, jaEstavaRegistrado: false, motivo: e instanceof Error ? e.message : "erro ao registrar o gasto" };
  }
}
