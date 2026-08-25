// A RODADA DO GERENTE GERAL — o laço puro ligado no relógio que já existe.
//
// NÃO É UM RELÓGIO NOVO. Pendura-se no `POST /api/cron/v2`, que já bate junto
// com o despertador da casa. Relógio novo é mais uma peça para configurar à
// mão, mais um segredo para vazar e mais um lugar onde "está no ar?" tem
// resposta diferente da do app.
//
// Divisão de trabalho, de propósito:
//   `laco.ts`   → o JULGAMENTO (puro, testável sem banco);
//   este arquivo → a LEITURA e a GRAVAÇÃO (impura, fina, sem decisão nenhuma).
//
// ── AS DUAS SAÍDAS, E A REGRA QUE AS SEPARA ─────────────────────────────────
//
// 1. BLOQUEIO — `BloqueioV2`, com dono, ação recomendada, evidência e
//    escalada. É a tabela que a Central e o painel do PM já leem: o atraso
//    passa a OCUPAR ESPAÇO em vez de virar linha de log que morre no reinício.
//    Idempotente: bloqueio aberto do mesmo projeto e do mesmo tipo não vira um
//    segundo. Projeto que voltou ao prazo tem o bloqueio RESOLVIDO — falha não
//    some, mas também não fica mentindo depois de resolvida.
//
// 2. AVISO AO CLIENTE — `OutboxV2`, tipo `mensagem_ao_cliente`. Coluna gravada
//    não é cliente informado: quando o prazo PROMETIDO queima, o Gerente Geral
//    fala. A chave de idempotência carrega o DIA, então o mesmo cliente não
//    recebe o mesmo aviso duas vezes — nem a cada 5 minutos, que é o ritmo do
//    relógio.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO FAZ: entregar a mensagem. Ele ENFILEIRA. A entrega
// é do executor `mensagem_ao_cliente` do cron, que é fail-closed atrás da flag
// `v2_execucao` — sem linha de flag no escopo do cliente, nada sai. É a mesma
// escada de sempre: construir, provar, e só então ligar, com motivo e dono.

import { prisma } from "@/lib/db/client";
import { departamentoDoAgente } from "@/lib/agency/escada/degraus";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";
import { varrerOsProjetos, fraseDoLaco, type ProjetoAberto, type ResultadoDoLaco } from "./laco";

/** Teto por rodada. O relógio bate direto; enxurrada nunca. */
const MAX_PROJETOS = 200;

/** Fases em que o projeto ainda está vivo — fechado não se cobra. */
const FASES_ABERTAS = ["briefing", "direction", "production", "review", "implementation"];

export interface RelatorioDaRodada {
  frase: string;
  projetos: number;
  atrasados: number;
  bloqueiosAbertos: number;
  bloqueiosResolvidos: number;
  avisosEnfileirados: number;
  estadosSemRegua: string[];
}

/** `Project.deadline` é texto livre no schema. Data que não parseia é ausência
 *  de prazo — nunca um prazo inventado. */
export function prazoDe(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A chave que impede o mesmo aviso duas vezes no mesmo dia. */
export function chaveDoAviso(projetoId: string, agora: Date): string {
  return `gg-atraso:${projetoId}:${agora.toISOString().slice(0, 10)}`;
}

export async function rodadaDoGerenteGeral(agora = new Date()): Promise<RelatorioDaRodada> {
  const projetos = await prisma.project.findMany({
    where: { stage: { in: FASES_ABERTAS } },
    orderBy: { updatedAt: "asc" },
    take: MAX_PROJETOS,
    select: {
      id: true,
      clientId: true,
      name: true,
      estadoCanonico: true,
      updatedAt: true,
      deadline: true,
      tasks: {
        where: { status: { in: ["pending", "in_progress", "in_review"] } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { agentId: true },
      },
    },
  });

  const retrato: ProjetoAberto[] = projetos.map((p) => {
    const agente = p.tasks[0]?.agentId ?? null;
    const legado = agente ? departamentoDoAgente(agente) : null;
    return {
      id: p.id,
      clienteId: p.clientId,
      titulo: p.name,
      departamentoResponsavel: legado ? (deSlugLegado(legado) ?? null) : null,
      estadoCanonico: p.estadoCanonico,
      atualizadoEm: p.updatedAt,
      prazoPrometido: prazoDe(p.deadline),
    };
  });

  const laco = varrerOsProjetos(retrato, agora);
  const gravados = await gravar(laco, agora);

  return {
    frase: fraseDoLaco(laco),
    projetos: laco.vereditos.length,
    atrasados: laco.vereditos.filter((v) => v.situacao === "atrasado").length,
    estadosSemRegua: laco.estadosSemRegua,
    ...gravados,
  };
}

async function gravar(laco: ResultadoDoLaco, agora: Date) {
  let bloqueiosAbertos = 0;
  let bloqueiosResolvidos = 0;
  let avisosEnfileirados = 0;

  for (const b of laco.bloqueios) {
    // Bloqueio aberto do mesmo projeto e tipo não vira um segundo: a lista da
    // Central viraria ruído a cada 5 minutos, e ruído é como o alarme morre.
    const jaAberto = await prisma.bloqueioV2.findFirst({
      where: { entidadeTipo: "Project", entidadeId: b.entidadeId, tipo: b.tipo, resolvidoEm: null },
      select: { id: true },
    });
    if (jaAberto) continue;
    await prisma.bloqueioV2.create({
      data: {
        entidadeTipo: b.entidadeTipo,
        entidadeId: b.entidadeId,
        tipo: b.tipo,
        donoFuncaoId: b.donoFuncaoId,
        acaoRecomendada: b.acaoRecomendada,
        evidencia: b.evidencia,
        escalonadoPara: b.escalonadoPara,
        correlationId: `gg-laco:${b.entidadeId}`,
      },
    });
    bloqueiosAbertos += 1;
  }

  // Projeto que voltou ao prazo fecha o próprio bloqueio. Falha não desaparece
  // do histórico — mas continuar aberta depois de resolvida é a mesma mentira
  // que a coluna que ninguém atualiza.
  const noPrazo = laco.vereditos.filter((v) => v.situacao === "no_prazo").map((v) => v.projetoId);
  if (noPrazo.length > 0) {
    const r = await prisma.bloqueioV2.updateMany({
      where: { entidadeTipo: "Project", entidadeId: { in: noPrazo }, resolvidoEm: null, escalonadoPara: "gerente-geral" },
      data: { resolvidoEm: agora },
    });
    bloqueiosResolvidos = r.count;
  }

  for (const aviso of laco.avisosAoCliente) {
    if (aviso.decisao !== "enviar") continue;
    const chave = chaveDoAviso(aviso.mensagem.correlationId.replace("gg-atraso:", ""), agora);
    try {
      await prisma.outboxV2.create({
        data: {
          tipo: "mensagem_ao_cliente",
          payload: JSON.stringify({
            clienteId: aviso.mensagem.clienteId,
            autorNome: aviso.autorNome,
            corpo: aviso.mensagem.corpo,
          }),
          chaveIdempotencia: chave,
          correlationId: aviso.mensagem.correlationId,
        },
      });
      avisosEnfileirados += 1;
    } catch {
      // Chave única violada = o aviso de hoje já está na fila. Idempotência
      // mora no banco, não numa variável em memória.
    }
  }

  return { bloqueiosAbertos, bloqueiosResolvidos, avisosEnfileirados };
}
