// A CADEIA ASSISTIDA — solicitação → PM → branding → social → design →
// aprovação humana → entrega. O primeiro fio de produção da agência nova.
//
// Ordem do CEO (15/08/2026): operação assistida com allowlist por cliente.
// Este módulo NÃO abre porta nenhuma: cada passo roda pelo executor V2 com
// as mesmas travas de sempre (ficha ligada + flag no escopo do cliente +
// entradas + ferramentas + teto). Entre departamentos, handoff com contrato
// e ACEITE — a regra da esteira integrada. No fim, o pacote NÃO vai ao
// cliente sozinho: vira card de aprovação HUMANA; publicação, verba e
// mensagem externa continuam atrás de gente (regra 5).
//
// Injetável de ponta a ponta (armazéns e realizar) — o mesmo ciclo roda no
// teste com dublês e em produção com Prisma + generate().

import { FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";
import { specDaFuncao } from "@/lib/agency/catalogo-v2/specs";
import {
  executarFuncao,
  type AtorDaExecucao,
  type DependenciasDoExecutor,
  type ResultadoDaExecucao,
} from "@/lib/agency/execucao-v2/executor";
import { criarHandoff, aceitarHandoff, type ArmazemDeHandoffs } from "@/lib/agency/handoff-v2/handoff";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

/** A cadeia mínima autorizada — na ordem em que o bastão corre. */
export const CADEIA_ASSISTIDA: readonly string[] = [
  "pm-orchestrator",
  "brand-architect",
  "social-strategist",
  "editorial-planner",
  "copywriter",
  "graphic-designer",
];

export interface PedidoDeCiclo {
  clienteId: string;
  workspaceId?: string;
  /** O texto da solicitação do cliente — o que entra na esteira. */
  solicitacao: string;
  nomeDoCliente: string;
  correlationId: string;
  /**
   * Passos já executados neste correlationId (funcaoId → saída gravada).
   * Retomada idempotente: trabalho pago uma vez não se paga duas. O ciclo
   * reaproveita a saída e segue de onde parou — a conexão do operador pode
   * cair, o trabalho da casa não recomeça do zero.
   */
  jaFeitos?: Record<string, string>;
}

export interface PassoExecutado {
  funcaoId: string;
  departamentoId: string;
  decisao: ResultadoDaExecucao["decisao"] | "reaproveitado";
  motivo?: string;
  custoUsd?: number;
  handoffId?: string;
  duracaoMs: number;
}

export interface ResultadoDoCiclo {
  ok: boolean;
  passos: PassoExecutado[];
  /** Artefatos por função (a saída de cada passo, íntegra). */
  artefatos: Record<string, string>;
  custoTotalUsd: number;
  /** Onde parou quando não completou (função + motivo). */
  parouEm?: { funcaoId: string; decisao: string; motivo: string };
}

export interface DependenciasDoCiclo {
  executor: DependenciasDoExecutor;
  handoffs: ArmazemDeHandoffs;
  perfil: PerfilOrganizacional;
  agora(): Date;
}

const ATOR_DA_CADEIA: AtorDaExecucao = {
  ator: "ia",
  modelo: "esteira-assistida",
  versaoModelo: "v1",
};

/**
 * Roda a cadeia inteira para UM cliente. Cada passo: aceita o handoff
 * anterior (quem recebe é a função do departamento destino), executa pela
 * trava dupla, e passa o bastão adiante com o contrato completo do 03.
 * Recusa ou escalada PARAM a cadeia — modo assistido não atropela trava.
 */
export async function executarCicloAssistido(
  pedido: PedidoDeCiclo,
  deps: DependenciasDoCiclo,
): Promise<ResultadoDoCiclo> {
  const passos: PassoExecutado[] = [];
  const artefatos: Record<string, string> = {};
  let custoTotalUsd = 0;

  // O dossiê acumulado: começa com a solicitação e cresce a cada artefato.
  const dossie: Record<string, string> = {
    "solicitação do cliente": pedido.solicitacao,
    cliente: pedido.nomeDoCliente,
  };

  let handoffPendente: string | undefined;

  for (const funcaoId of CADEIA_ASSISTIDA) {
    const resultadoSpec = specDaFuncao(funcaoId);
    if (!resultadoSpec.ok) {
      return {
        ok: false,
        passos,
        artefatos,
        custoTotalUsd,
        parouEm: { funcaoId, decisao: "recusado", motivo: resultadoSpec.motivo },
      };
    }
    const spec = resultadoSpec.spec;

    // Retomada: passo já pago neste correlationId volta do registro, não da IA.
    const jaFeito = pedido.jaFeitos?.[funcaoId];
    if (jaFeito) {
      artefatos[funcaoId] = jaFeito;
      dossie[`artefato de ${funcaoId} (${spec.departamento})`] = jaFeito;
      passos.push({ funcaoId, departamentoId: spec.departamento, decisao: "reaproveitado", duracaoMs: 0 });
      // O bastão daquele passo já correu quando ele executou de verdade.
      handoffPendente = undefined;
      continue;
    }

    // Aceite do bastão anterior — quem recebe é a função do destino.
    if (handoffPendente) {
      const aceite = await aceitarHandoff(
        handoffPendente,
        funcaoId,
        [spec.departamento],
        deps.handoffs,
        deps.agora,
      );
      if (!aceite.ok) {
        return {
          ok: false,
          passos,
          artefatos,
          custoTotalUsd,
          parouEm: { funcaoId, decisao: "recusado", motivo: `aceite de handoff falhou: ${aceite.motivo}` },
        };
      }
    }

    // Toda entrada obrigatória da ficha recebe o dossiê rotulado — a função
    // vê a solicitação e TUDO que a cadeia já produziu até aqui.
    const dossieCompleto = Object.entries(dossie)
      .map(([nome, valor]) => `## ${nome}\n${valor}`)
      .join("\n\n");
    const entradas: Record<string, string> = {};
    for (const nome of spec.entradas_obrigatorias) {
      entradas[nome] = dossie[nome] ?? dossieCompleto;
    }

    const inicioMs = deps.agora().getTime();
    const resultado = await executarFuncao(
      funcaoId,
      deps.perfil,
      {
        modo: "producao",
        entradas,
        ferramentasPrevistas: [...spec.ferramentas_permitidas],
        custoPrevistoUsd: Math.min(0.05, spec.teto_custo_usd_execucao / 2),
        correlationId: pedido.correlationId,
        escopos: [pedido.clienteId, ...(pedido.workspaceId ? [pedido.workspaceId] : [])],
        clienteId: pedido.clienteId,
      },
      ATOR_DA_CADEIA,
      deps.executor,
    );
    const duracaoMs = deps.agora().getTime() - inicioMs;

    if (resultado.decisao !== "executado") {
      passos.push({
        funcaoId,
        departamentoId: spec.departamento,
        decisao: resultado.decisao,
        motivo: resultado.decisao === "recusado" ? resultado.motivo : resultado.pacote.motivo,
        duracaoMs,
      });
      return {
        ok: false,
        passos,
        artefatos,
        custoTotalUsd,
        parouEm: {
          funcaoId,
          decisao: resultado.decisao,
          motivo: resultado.decisao === "recusado" ? resultado.motivo : resultado.pacote.motivo,
        },
      };
    }

    custoTotalUsd += resultado.custoUsd;
    artefatos[funcaoId] = resultado.saida;
    dossie[`artefato de ${funcaoId} (${spec.departamento})`] = resultado.saida;

    // Passa o bastão — contrato completo do 03, aguardando o aceite do próximo.
    const proximaId = CADEIA_ASSISTIDA[CADEIA_ASSISTIDA.indexOf(funcaoId) + 1];
    let handoffId: string | undefined;
    if (proximaId) {
      const proximaSpec = specDaFuncao(proximaId);
      if (proximaSpec.ok && proximaSpec.spec.departamento !== spec.departamento) {
        const handoff = await criarHandoff(
          {
            deDepartamento: spec.departamento,
            paraDepartamento: proximaSpec.spec.departamento,
            responsavelEntrega: funcaoId,
            entrada: `Dossiê do cliente ${pedido.nomeDoCliente} com ${Object.keys(dossie).length} seções`,
            saida: `Artefato de ${funcaoId}: ${spec.saida.formato}`,
            versaoArtefato: `v1-ciclo-${pedido.correlationId}`,
            criterios: spec.metrica_sucesso,
            // O PRAZO SAI DA FICHA DE QUEM RECEBE, não de quem entrega
            // (16/08/2026). `sla_horas` é o compromisso do recebedor: é ele
            // que promete devolver em tanto tempo, e é ele que o gavião do
            // relógio vai cobrar quando estourar. Handoff sem prazo é handoff
            // que nunca atrasa — e o que nunca atrasa nunca é cobrado.
            prazoProximo: new Date(deps.agora().getTime() + proximaSpec.spec.sla_horas * 3_600_000),
            correlationId: pedido.correlationId,
            workspaceId: pedido.workspaceId ?? null,
          },
          deps.handoffs,
          deps.agora,
        );
        if (!handoff.ok) {
          return {
            ok: false,
            passos,
            artefatos,
            custoTotalUsd,
            parouEm: { funcaoId, decisao: "recusado", motivo: `handoff falhou: ${handoff.motivo}` },
          };
        }
        handoffId = handoff.id;
        handoffPendente = handoff.id;
      } else {
        handoffPendente = undefined;
      }
    }

    passos.push({
      funcaoId,
      departamentoId: spec.departamento,
      decisao: "executado",
      custoUsd: resultado.custoUsd,
      handoffId,
      duracaoMs,
    });
  }

  return { ok: true, passos, artefatos, custoTotalUsd };
}

/** Sanidade: toda função da cadeia existe no catálogo (o teste cobra). */
export function cadeiaConhecida(): boolean {
  const ids = new Set(FUNCOES_V2.map((f) => f.id));
  return CADEIA_ASSISTIDA.every((f) => ids.has(f));
}
