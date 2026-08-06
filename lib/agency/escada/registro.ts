// A escada, no banco — quem lê, quem escreve e quem tem permissão de subir.
//
// Regra de existência deste arquivo: NENHUM estado gravado que ninguém lê. Cada
// coisa escrita aqui tem um leitor nomeado:
//
//   • `DepartmentLadder.degrau`      → lido por `escadaFiltraEntregas`, que é
//     chamada por `esteira/marcos.ts` e `esteira/mes.ts` no exato ponto em que a
//     entrega vira "compartilhado". Sem esse leitor, a escada seria decoração —
//     o defeito das 31 checagens, repetido com outra roupa.
//   • `DepartmentLadderRecord`       → lido por `avaliarSubida`, que é o único
//     caminho para um degrau subir.
//   • `provaJson`                    → lido pela tela/API (`/api/agency/escada`)
//     e pelo relatório: é a prova congelada da última subida.

import { prisma } from "@/lib/db/client";
import {
  degrauDeclarado, departamentoDoAgente, departamentosDaCasa, decidirEntrega,
  avaliarSubida, alturaDo, JANELA_DE_EVIDENCIA_DIAS,
  type Degrau, type EstadoDoDegrau, type ResultadoDaPeca, type AvaliacaoDeSubida,
} from "./degraus";
export { departamentosDaCasa } from "./degraus";

function lerClientes(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // JSON quebrado não é "todos liberados". É lista vazia — fail-closed.
    return [];
  }
}

// ── SEMEADURA ────────────────────────────────────────────────────────────────

/**
 * Cria as linhas que faltam. Idempotente, e roda barato depois da primeira vez.
 *
 * ── O PROBLEMA REAL QUE ESTA FUNÇÃO RESOLVE ────────────────────────────────
 * Se a escada nascesse com todo mundo em SOMBRA, ela pararia a agência no dia 1
 * — exatamente o defeito pelo qual a inversão do default do registry está
 * segurada. Mas conceder WIDE a todos para "não parar nada" seria escrever
 * `wide` sem evidência nenhuma, e aí a escada não existiria.
 *
 * A saída não é opinião, é o que o banco já diz: departamento que JÁ entregava
 * a um cliente nasce em ALLOWLIST **com exatamente aqueles clientes**. Nada muda
 * para quem já era atendido, e nenhum cliente NOVO recebe a saída de um
 * departamento que nunca provou nada. Quem nunca entregou nasce em SOMBRA, que é
 * o degrau de nascimento.
 *
 * WIDE nunca é semeado. Para chegar lá, só pela evidência.
 */
export async function garantirEscada(workspaceId: string): Promise<void> {
  const ids = departamentosDaCasa();
  const existentes: Array<{ departmentId: string }> = await prisma.departmentLadder.findMany({
    where: { workspaceId },
    select: { departmentId: true },
  });
  const jaTem = new Set(existentes.map((e) => e.departmentId));
  const faltando = ids.filter((id) => !jaTem.has(id));
  if (faltando.length === 0) return;

  // O histórico REAL: que departamento já teve peça marcada "compartilhado",
  // e para quais clientes.
  const jaEntregues = await prisma.deliverable.findMany({
    where: { visibility: "compartilhado", project: { workspaceId } },
    select: { ownerAgentId: true, project: { select: { clientId: true } } },
  }).catch(() => [] as Array<{ ownerAgentId: string | null; project: { clientId: string } | null }>);

  const herdado = new Map<string, Set<string>>();
  for (const d of jaEntregues) {
    const dept = departamentoDoAgente(d.ownerAgentId);
    const cliente = d.project?.clientId;
    if (!dept || !cliente) continue;
    if (!herdado.has(dept)) herdado.set(dept, new Set());
    herdado.get(dept)!.add(cliente);
  }

  for (const departmentId of faltando) {
    const clientes = [...(herdado.get(departmentId) ?? [])];
    const temHistorico = clientes.length > 0;
    await prisma.departmentLadder.create({
      data: {
        workspaceId,
        departmentId,
        degrau: temHistorico ? "allowlist" : "sombra",
        clientesLiberados: JSON.stringify(clientes),
        motivo: temHistorico
          ? `herdado da operação: já entregava a ${clientes.length} cliente(s) antes da escada existir. Nenhum cliente novo entra sem evidência.`
          : "degrau de nascimento — nunca entregou nada a cliente nenhum nesta casa.",
        decididoPor: "escada:semeadura",
        provaJson: JSON.stringify({ origem: "historico_de_entregas", clientes: clientes.length }),
      },
    }).catch(() => { /* corrida entre dois processos: o unique resolve, e quem perdeu não precisa fazer nada */ });
  }
}

// ── LEITURA ──────────────────────────────────────────────────────────────────

export interface DegrauNaCasa extends EstadoDoDegrau {
  motivo: string | null;
  decididoPor: string | null;
  prova: unknown;
  atualizadoEm: Date;
  /** O que falta, em número, para subir. `null` no topo. */
  subida: AvaliacaoDeSubida | null;
}

export async function estadoDaEscada(workspaceId: string): Promise<DegrauNaCasa[]> {
  await garantirEscada(workspaceId);
  const linhas = await prisma.departmentLadder.findMany({ where: { workspaceId } });
  const desde = new Date(Date.now() - JANELA_DE_EVIDENCIA_DIAS * 24 * 60 * 60_000);
  const registros = await prisma.departmentLadderRecord.findMany({
    where: { workspaceId, criadoEm: { gte: desde } },
    select: { departmentId: true, resultado: true, clientId: true },
  }).catch(() => [] as Array<{ departmentId: string; resultado: string; clientId: string | null }>);

  const porDept = new Map<string, Array<{ resultado: string; clientId: string | null }>>();
  for (const r of registros) {
    if (!porDept.has(r.departmentId)) porDept.set(r.departmentId, []);
    porDept.get(r.departmentId)!.push({ resultado: r.resultado, clientId: r.clientId });
  }

  return linhas
    .map((l) => {
      const degrau = degrauDeclarado(l.degrau);
      return {
        departmentId: l.departmentId,
        degrau,
        clientesLiberados: lerClientes(l.clientesLiberados),
        motivo: l.motivo,
        decididoPor: l.decididoPor,
        prova: (() => { try { return JSON.parse(l.provaJson); } catch { return {}; } })(),
        atualizadoEm: l.updatedAt,
        subida: avaliarSubida(degrau, porDept.get(l.departmentId) ?? []),
      };
    })
    .sort((a, b) => alturaDo(b.degrau) - alturaDo(a.degrau) || a.departmentId.localeCompare(b.departmentId));
}

// ── O PONTO EM QUE A ESCADA DECIDE ───────────────────────────────────────────

export interface EntregaCandidata {
  id: string;
  ownerAgentId: string | null;
}

export interface FiltroDaEscada {
  /** Ids que PODEM ir ao cliente. */
  liberados: string[];
  /** Ids retidos, com o motivo concreto — vai para o `ActivityEvent`. */
  retidos: Array<{ id: string; departmentId: string | null; motivo: string }>;
}

/**
 * O portão da escada, no exato ponto em que a peça viraria "compartilhado".
 *
 * Não lança NUNCA por erro de banco: falha de leitura retém tudo (fail-closed)
 * em vez de liberar tudo. Reter é um alarme que a equipe resolve; liberar é uma
 * peça publicada em nome de um cliente pagante.
 */
export async function escadaFiltraEntregas(p: {
  workspaceId: string;
  clientId: string | null;
  entregas: EntregaCandidata[];
}): Promise<FiltroDaEscada> {
  if (p.entregas.length === 0) return { liberados: [], retidos: [] };

  let linhas: Array<{ departmentId: string; degrau: string; clientesLiberados: string }>;
  try {
    await garantirEscada(p.workspaceId);
    linhas = await prisma.departmentLadder.findMany({
      where: { workspaceId: p.workspaceId },
      select: { departmentId: true, degrau: true, clientesLiberados: true },
    });
  } catch (e) {
    return {
      liberados: [],
      retidos: p.entregas.map((d) => ({
        id: d.id,
        departmentId: departamentoDoAgente(d.ownerAgentId),
        motivo: `não consegui ler a escada (${e instanceof Error ? e.message : "erro"}) — fail-closed: nada é compartilhado`,
      })),
    };
  }

  const porId = new Map<string, EstadoDoDegrau>(
    linhas.map((l) => [l.departmentId, {
      departmentId: l.departmentId,
      degrau: degrauDeclarado(l.degrau),
      clientesLiberados: lerClientes(l.clientesLiberados),
    }]),
  );

  const liberados: string[] = [];
  const retidos: FiltroDaEscada["retidos"] = [];
  for (const entrega of p.entregas) {
    const dept = departamentoDoAgente(entrega.ownerAgentId);
    const estado = dept ? porId.get(dept) ?? null : null;
    const veredito = decidirEntrega(estado, p.clientId);
    if (veredito.chega) liberados.push(entrega.id);
    else {
      retidos.push({
        id: entrega.id,
        departmentId: dept,
        motivo: dept
          ? veredito.motivo ?? "retida pela escada"
          : `executor "${entrega.ownerAgentId ?? "(vazio)"}" não pertence a departamento conhecido — fail-closed: retida`,
      });
    }
  }
  return { liberados, retidos };
}

// ── ESCRITA DO NUMERADOR/DENOMINADOR ─────────────────────────────────────────

/**
 * Um registro por peça produzida — inclusive as que morreram no portão.
 *
 * Best-effort de propósito: perder um registro atrasa uma promoção, e derrubar a
 * produção por causa dele seria trocar um risco pequeno por um grande. Mas o
 * erro NÃO some: sem registro, a evidência simplesmente não acumula, e o
 * departamento fica onde está — que é o lado certo para errar.
 */
export async function registrarProducao(p: {
  workspaceId: string;
  departmentId: string;
  projectId?: string | null;
  clientId?: string | null;
  deliverableId?: string | null;
  degrauNaEpoca: Degrau;
  resultado: ResultadoDaPeca;
  detalhe?: string | null;
}): Promise<void> {
  // `try/catch` e não `.catch()` no fim da promessa: os dois NÃO são a mesma
  // coisa. `.catch()` só pega a rejeição — se o cliente do banco não tiver a
  // tabela (teste com dublê incompleto, migração não rodada), o acesso à
  // propriedade estoura ANTES de existir promessa, e a exceção síncrona passa
  // por cima do `.catch` e derruba a produção inteira. Um contador de evidência
  // não pode ser capaz de parar a agência.
  try {
    await prisma.departmentLadderRecord.create({
      data: {
        workspaceId: p.workspaceId,
        departmentId: p.departmentId,
        projectId: p.projectId ?? null,
        clientId: p.clientId ?? null,
        deliverableId: p.deliverableId ?? null,
        degrauNaEpoca: p.degrauNaEpoca,
        resultado: p.resultado,
        detalhe: p.detalhe?.slice(0, 500) ?? null,
      },
    });
  } catch { /* best-effort: sem registro, a evidência não acumula e o
      departamento fica onde está — que é o lado certo para errar. */ }
}

/** Em que degrau este departamento está AGORA (para carimbar no registro). */
export async function degrauAtual(workspaceId: string, departmentId: string): Promise<Degrau> {
  try {
    const l = await prisma.departmentLadder.findUnique({
      where: { workspaceId_departmentId: { workspaceId, departmentId } },
      select: { degrau: true },
    });
    return degrauDeclarado(l?.degrau);
  } catch {
    // Não sei o degrau → sombra. É só um carimbo de registro; errar para o lado
    // de "sombra" subestima a evidência, e subestimar nunca promove ninguém.
    return "sombra";
  }
}

// ── SUBIR E DESCER ───────────────────────────────────────────────────────────

export interface ResultadoDaMudanca {
  ok: boolean;
  degrau: Degrau;
  erro?: string;
  faltam?: string[];
}

/**
 * Sobe UM degrau, e só com o número na mão.
 *
 * Não existe parâmetro de força. Foi decisão consciente: um `{ forcar: true }`
 * aqui viraria o caminho normal na primeira sexta-feira apertada, e a escada
 * inteira passaria a ser um campo de texto.
 */
export async function subirDegrau(p: {
  workspaceId: string;
  departmentId: string;
  quem: string;
}): Promise<ResultadoDaMudanca> {
  await garantirEscada(p.workspaceId);
  const linha = await prisma.departmentLadder.findUnique({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
  });
  const atual = degrauDeclarado(linha?.degrau);
  const desde = new Date(Date.now() - JANELA_DE_EVIDENCIA_DIAS * 24 * 60 * 60_000);
  const registros = await prisma.departmentLadderRecord.findMany({
    where: { workspaceId: p.workspaceId, departmentId: p.departmentId, criadoEm: { gte: desde } },
    select: { resultado: true, clientId: true },
  }).catch(() => [] as Array<{ resultado: string; clientId: string | null }>);

  const avaliacao = avaliarSubida(atual, registros);
  if (!avaliacao) return { ok: false, degrau: atual, erro: "já está no topo da escada (wide)" };
  if (!avaliacao.pode) {
    return { ok: false, degrau: atual, erro: "evidência insuficiente", faltam: avaliacao.faltam };
  }

  await prisma.departmentLadder.update({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
    data: {
      degrau: avaliacao.alvo,
      motivo: `subiu para ${avaliacao.alvo} com ${avaliacao.contagem.aprovadas} entrega(s) aprovada(s) em ${JANELA_DE_EVIDENCIA_DIAS} dias, ${avaliacao.contagem.clientesDistintos} cliente(s) distinto(s).`,
      decididoPor: p.quem,
      // A prova congelada: a janela move, e sem isto ninguém consegue conferir
      // depois com que número a subida aconteceu.
      provaJson: JSON.stringify({ em: new Date().toISOString(), de: atual, para: avaliacao.alvo, contagem: avaliacao.contagem, criterio: avaliacao.criterio }),
    },
  });
  return { ok: true, degrau: avaliacao.alvo };
}

/**
 * Desce. Sem pergunta, sem evidência, imediato.
 *
 * A assimetria é o ponto: quem viu fumaça precisa conseguir fechar a porta em um
 * comando. Exigir justificativa numérica para DESCER é o mesmo que atrasar a
 * contenção — e contenção atrasada é o incidente inteiro.
 */
export async function descerDegrau(p: {
  workspaceId: string;
  departmentId: string;
  para?: Degrau;
  motivo: string;
  quem: string;
}): Promise<ResultadoDaMudanca> {
  await garantirEscada(p.workspaceId);
  const linha = await prisma.departmentLadder.findUnique({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
  });
  const atual = degrauDeclarado(linha?.degrau);
  const alvo: Degrau = p.para ?? "sombra";
  if (alturaDo(alvo) >= alturaDo(atual)) {
    return { ok: false, degrau: atual, erro: `descer é para BAIXO — ${alvo} não é abaixo de ${atual}. Para subir, use subirDegrau (que exige evidência).` };
  }
  await prisma.departmentLadder.update({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
    data: {
      degrau: alvo,
      motivo: `desceu de ${atual} para ${alvo}: ${p.motivo}`,
      decididoPor: p.quem,
      provaJson: JSON.stringify({ em: new Date().toISOString(), de: atual, para: alvo, motivo: p.motivo }),
    },
  });
  return { ok: true, degrau: alvo };
}

/**
 * Põe um cliente na allowlist de um departamento.
 *
 * Exige a MESMA evidência do degrau de allowlist. Sem isto, a lista seria a
 * porta dos fundos: o departamento fica em "allowlist" com um cliente herdado e
 * alguém acrescenta os outros nove à mão — wide sem nunca ter subido.
 */
export async function liberarCliente(p: {
  workspaceId: string;
  departmentId: string;
  clientId: string;
  quem: string;
}): Promise<ResultadoDaMudanca> {
  await garantirEscada(p.workspaceId);
  const linha = await prisma.departmentLadder.findUnique({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
  });
  const atual = degrauDeclarado(linha?.degrau);
  if (atual !== "allowlist") {
    return { ok: false, degrau: atual, erro: `só faz sentido em allowlist — o departamento está em ${atual}` };
  }
  const desde = new Date(Date.now() - JANELA_DE_EVIDENCIA_DIAS * 24 * 60 * 60_000);
  const registros = await prisma.departmentLadderRecord.findMany({
    where: { workspaceId: p.workspaceId, departmentId: p.departmentId, criadoEm: { gte: desde } },
    select: { resultado: true, clientId: true },
  }).catch(() => [] as Array<{ resultado: string; clientId: string | null }>);
  // A régua é a de ENTRAR em allowlist, aplicada a cada novo cliente.
  const avaliacao = avaliarSubida("sombra", registros);
  if (!avaliacao?.pode) {
    return { ok: false, degrau: atual, erro: "evidência insuficiente para liberar mais um cliente", faltam: avaliacao?.faltam ?? [] };
  }
  const lista = new Set(lerClientes(linha?.clientesLiberados));
  lista.add(p.clientId);
  await prisma.departmentLadder.update({
    where: { workspaceId_departmentId: { workspaceId: p.workspaceId, departmentId: p.departmentId } },
    data: { clientesLiberados: JSON.stringify([...lista]), decididoPor: p.quem },
  });
  return { ok: true, degrau: atual };
}
