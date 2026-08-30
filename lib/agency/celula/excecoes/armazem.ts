// O ARMAZÉM DA FILA DE EXCEÇÕES — a única ponte para o Prisma.
//
// O juiz (`lib/agency/celula/excecoes/fila.ts`) é puro, sem banco. Este
// arquivo grava o veredicto dele: julga com `avaliarAberturaDeExcecao` /
// `avaliarResolucao` e só então escreve. Abrir exceção grava
// `ExcecaoDaCelula` + o primeiro `EventoDaExcecaoDaCelula` dentro de UMA
// única `prisma.$transaction` — exceção sem trilha, ou trilha sem exceção, é
// o defeito que este desenho torna impossível, não algo que dependa de
// alguém lembrar de checar. Molde: `lib/agency/celula/trilha.ts`.
//
// ── APPEND-ONLY DE VERDADE — só sobre `EventoDaExcecaoDaCelula` ────────────
// Neste módulo NUNCA existe `eventoDaExcecaoDaCelula.update`, `.updateMany`,
// `.delete`, `.deleteMany` nem `.upsert`. A trilha da exceção só recebe
// `.create` e leitura — quem quiser "corrigir" um evento está no arquivo
// errado: o jeito certo é criar um evento NOVO que documente a correção.
// (`__tests__/celula/excecoes-fila.test.ts` varre este arquivo por regex e
// falha se qualquer um desses métodos aparecer sobre
// `eventoDaExcecaoDaCelula`.)
//
// `ExcecaoDaCelula` (o registro "estado atual" da exceção) NÃO tem essa
// restrição — é atualizado a cada transição de estado, de propósito, no
// mesmo espírito de `LinhaDoFunil` em `trilha.ts`: é o cache do "onde a
// exceção está agora", não a trilha.
//
// ── `contexto` é DADO do caso, nunca ordem ──────────────────────────────────
// Este módulo não interpreta `contexto`. Ver a nota equivalente em
// `fila.ts`, seção "O QUE ESTE ARQUIVO NÃO FAZ".

import { prisma } from "@/lib/db/client";
import {
  avaliarAberturaDeExcecao,
  avaliarResolucao,
  gritoDaFila,
  podeSeguirAutomatizando,
  type ExcecaoVencida,
  type GritoDaFila,
  type VeredictoDeAutomacao,
} from "@/lib/agency/celula/excecoes/fila";
import {
  type Caso,
  type Prioridade,
  type Responsavel,
  type EstadoDaExcecao,
  CASOS_QUE_INTERROMPEM_A_AUTOMACAO,
  casoDeclarado,
  prioridadeDeclarada,
  responsavelDeclarado,
  estadoDaExcecaoDeclarado,
} from "@/lib/agency/celula/excecoes/tipos";

function autorValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

// ── 1. Abrir exceção ──────────────────────────────────────────────────────

export type ResultadoDaAbertura =
  | { ok: true; excecaoId: string; caso: Caso; prioridade: Prioridade; prazoEm: Date; interrompeAutomacao: boolean }
  | { ok: false; codigo: string; motivo: string };

/**
 * O único caminho de escrita para abrir uma exceção. `autor` é quem/o que
 * está abrindo (agente, gerente, sdr) — registrado só no evento, porque
 * `ExcecaoDaCelula` não tem coluna de autor (o dono operacional dela é
 * `responsavel`, um dos dois valores fechados). Entrada inválida (caso
 * desconhecido, responsável inválido — inclusive o CEO —, prioridade
 * rebaixada num caso p0, contexto ou ação recomendada ausentes, autor
 * ausente) NÃO grava nada: a validação acontece antes de qualquer
 * `.create`.
 */
export async function abrirExcecao(entrada: {
  workspaceId: string;
  oportunidadeId?: string | null;
  arquivoId?: string | null;
  autor: unknown;
  caso: unknown;
  prioridade: unknown;
  responsavel: unknown;
  contexto: unknown;
  acaoRecomendada: unknown;
}): Promise<ResultadoDaAbertura> {
  if (!autorValido(entrada.autor)) {
    return {
      ok: false,
      codigo: "autor_ausente",
      motivo: "Abrir uma exceção exige um autor identificado, e nenhum foi informado.",
    };
  }

  const agora = new Date();
  const veredicto = avaliarAberturaDeExcecao(
    {
      caso: entrada.caso,
      prioridade: entrada.prioridade,
      responsavel: entrada.responsavel,
      contexto: entrada.contexto,
      acaoRecomendada: entrada.acaoRecomendada,
    },
    agora,
  );

  if (!veredicto.ok) {
    return { ok: false, codigo: veredicto.codigo, motivo: veredicto.motivo };
  }

  const interrompeAutomacao = CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(veredicto.caso);
  const autor = entrada.autor as string;

  return prisma.$transaction(async (tx) => {
    const excecao = await tx.excecaoDaCelula.create({
      data: {
        workspaceId: entrada.workspaceId,
        oportunidadeId: entrada.oportunidadeId ?? null,
        arquivoId: entrada.arquivoId ?? null,
        caso: veredicto.caso,
        prioridade: veredicto.prioridade,
        responsavel: veredicto.responsavel,
        prazoEm: veredicto.prazoEm,
        contexto: veredicto.contexto,
        acaoRecomendada: veredicto.acaoRecomendada,
        estado: "aberta",
        interrompeAutomacao,
      },
    });

    // A TRILHA — só `.create`. Ver a nota de append-only no topo do arquivo.
    await tx.eventoDaExcecaoDaCelula.create({
      data: {
        workspaceId: entrada.workspaceId,
        excecaoId: excecao.id,
        tipo: "aberta",
        autor,
        detalhe: `Exceção aberta para o caso "${veredicto.caso}" (prioridade ${veredicto.prioridade}), atribuída a ${veredicto.responsavel}.`,
      },
    });

    return {
      ok: true,
      excecaoId: excecao.id,
      caso: veredicto.caso,
      prioridade: veredicto.prioridade,
      prazoEm: veredicto.prazoEm,
      interrompeAutomacao,
    };
  });
}

// ── 2. Assumir exceção (aberta → em_tratamento) ─────────────────────────────

export type ResultadoDeAssumir = { ok: true } | { ok: false; codigo: string; motivo: string };

/** Só sai de `aberta`. Assumir uma exceção já `em_tratamento`, `resolvida`
 *  ou `descartada` é rejeitado — evita dois donos disputando a mesma
 *  exceção em silêncio. */
export async function assumirExcecao(entrada: {
  workspaceId: string;
  excecaoId: string;
  autor: unknown;
}): Promise<ResultadoDeAssumir> {
  if (!autorValido(entrada.autor)) {
    return { ok: false, codigo: "autor_ausente", motivo: "Assumir uma exceção exige um autor identificado, e nenhum foi informado." };
  }
  const autor = entrada.autor as string;

  return prisma.$transaction(async (tx) => {
    const atual = await tx.excecaoDaCelula.findUnique({
      where: { id: entrada.excecaoId },
      select: { estado: true, workspaceId: true },
    });

    if (!atual || atual.workspaceId !== entrada.workspaceId) {
      return { ok: false, codigo: "excecao_inexistente", motivo: `Nenhuma exceção "${entrada.excecaoId}" encontrada neste workspace.` };
    }

    const estadoAtual = estadoDaExcecaoDeclarado(atual.estado);
    if (estadoAtual !== "aberta") {
      return {
        ok: false,
        codigo: "estado_nao_permite_assumir",
        motivo: `Só é possível assumir uma exceção que está "aberta" — esta está "${estadoAtual ?? "ilegível"}".`,
      };
    }

    await tx.excecaoDaCelula.update({
      where: { id: entrada.excecaoId },
      data: { estado: "em_tratamento" },
    });

    await tx.eventoDaExcecaoDaCelula.create({
      data: {
        workspaceId: entrada.workspaceId,
        excecaoId: entrada.excecaoId,
        tipo: "assumida",
        autor,
        detalhe: `Exceção assumida por ${autor}.`,
      },
    });

    return { ok: true };
  });
}

// ── 3. Encerrar exceção — resolvida ou descartada, sempre com resolução escrita ──

export type ResultadoDoEncerramento = { ok: true } | { ok: false; codigo: string; motivo: string };

/** `desfecho` é `"resolvida"` ou `"descartada"` — as duas exigem resolução
 *  escrita (mesma régua da `justificativa` do funil). Resolver em silêncio
 *  é o que produziu o vigia noturno morto: não repetimos aqui. */
async function encerrarExcecao(entrada: {
  workspaceId: string;
  excecaoId: string;
  autor: unknown;
  resolucao: unknown;
  desfecho: "resolvida" | "descartada";
}): Promise<ResultadoDoEncerramento> {
  if (!autorValido(entrada.autor)) {
    return { ok: false, codigo: "autor_ausente", motivo: "Encerrar uma exceção exige um autor identificado, e nenhum foi informado." };
  }

  const veredictoDaResolucao = avaliarResolucao(entrada.resolucao);
  if (!veredictoDaResolucao.ok) {
    return { ok: false, codigo: veredictoDaResolucao.codigo, motivo: veredictoDaResolucao.motivo };
  }

  const autor = entrada.autor as string;
  const resolucao = veredictoDaResolucao.resolucao;

  return prisma.$transaction(async (tx) => {
    const atual = await tx.excecaoDaCelula.findUnique({
      where: { id: entrada.excecaoId },
      select: { estado: true, workspaceId: true },
    });

    if (!atual || atual.workspaceId !== entrada.workspaceId) {
      return { ok: false, codigo: "excecao_inexistente", motivo: `Nenhuma exceção "${entrada.excecaoId}" encontrada neste workspace.` };
    }

    const estadoAtual = estadoDaExcecaoDeclarado(atual.estado);
    if (estadoAtual !== "aberta" && estadoAtual !== "em_tratamento") {
      return {
        ok: false,
        codigo: "estado_nao_permite_encerramento",
        motivo: `Só é possível encerrar uma exceção "aberta" ou "em_tratamento" — esta está "${estadoAtual ?? "ilegível"}".`,
      };
    }

    const agora = new Date();

    await tx.excecaoDaCelula.update({
      where: { id: entrada.excecaoId },
      data: { estado: entrada.desfecho, resolvidaEm: agora, resolucao },
    });

    await tx.eventoDaExcecaoDaCelula.create({
      data: {
        workspaceId: entrada.workspaceId,
        excecaoId: entrada.excecaoId,
        tipo: entrada.desfecho,
        autor,
        detalhe: resolucao,
      },
    });

    return { ok: true };
  });
}

export function resolverExcecao(entrada: {
  workspaceId: string;
  excecaoId: string;
  autor: unknown;
  resolucao: unknown;
}): Promise<ResultadoDoEncerramento> {
  return encerrarExcecao({ ...entrada, desfecho: "resolvida" });
}

export function descartarExcecao(entrada: {
  workspaceId: string;
  excecaoId: string;
  autor: unknown;
  resolucao: unknown;
}): Promise<ResultadoDoEncerramento> {
  return encerrarExcecao({ ...entrada, desfecho: "descartada" });
}

// ── 4. Leitura para os juízes de trava 2 e trava 3 ──────────────────────────

export interface ExcecaoAbertaResumo {
  id: string;
  caso: Caso | null;
  responsavel: Responsavel | null;
  prioridade: Prioridade | null;
  estado: EstadoDaExcecao;
  prazoEm: Date;
  abertaEm: Date;
}

/**
 * As exceções vivas (`aberta` ou `em_tratamento`) de um workspace, no
 * formato que `podeSeguirAutomatizando`, `excecoesVencidas` e `gritoDaFila`
 * (todos em `fila.ts`) consomem. Leitura fail-closed: campo corrompido no
 * banco vira `null` no resumo — nunca `as Caso`/`as Responsavel`/`as
 * Prioridade`, nunca some a linha.
 */
export async function excecoesAbertasParaJulgamento(workspaceId: string): Promise<ExcecaoAbertaResumo[]> {
  const linhas = await prisma.excecaoDaCelula.findMany({
    where: { workspaceId, estado: { in: ["aberta", "em_tratamento"] } },
    orderBy: { abertaEm: "asc" },
  });

  return linhas
    .map((linha) => {
      const estado = estadoDaExcecaoDeclarado(linha.estado);
      // Defesa em profundidade: só `abrirExcecao`/`assumirExcecao` escrevem
      // aqui, sempre com um dos 4 estados válidos, e a query acima já
      // filtrou por "aberta"/"em_tratamento". Uma linha corrompida (edição
      // direta no banco, versão antiga do enum) não vira "aberta" por
      // default — some do resumo em vez de mentir sobre o estado dela.
      if (estado === null) return null;
      return {
        id: linha.id,
        caso: casoDeclarado(linha.caso),
        responsavel: responsavelDeclarado(linha.responsavel),
        prioridade: prioridadeDeclarada(linha.prioridade),
        estado,
        prazoEm: linha.prazoEm,
        abertaEm: linha.abertaEm,
      } satisfies ExcecaoAbertaResumo;
    })
    .filter((linha): linha is ExcecaoAbertaResumo => linha !== null);
}

/** Açúcar: já devolve o grito pronto para o dia a dia, sem o chamador
 *  precisar montar a lista na mão. Continua fail-closed via `gritoDaFila`. */
export async function gritoDaFilaDoWorkspace(
  workspaceId: string,
): Promise<{ ok: true; grito: GritoDaFila } | { ok: false; motivo: string }> {
  const abertas = await excecoesAbertasParaJulgamento(workspaceId);
  return gritoDaFila(new Date(), abertas);
}

/** Açúcar equivalente para a trava 2: consulta o workspace e já devolve o
 *  veredicto de `podeSeguirAutomatizando`. */
export async function podeSeguirAutomatizandoNoWorkspace(workspaceId: string): Promise<VeredictoDeAutomacao> {
  const abertas = await excecoesAbertasParaJulgamento(workspaceId);
  return podeSeguirAutomatizando(abertas);
}

export type { ExcecaoVencida };
