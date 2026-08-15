// O ROLLOUT DA V2 — ligar, backfillar, reconciliar e DIZER o veredito.
//
// Marco 7. O caminho que o plano manda: flags por escopo (piloto por
// workspace/cliente antes de global), backfill idempotente, leitura dupla e
// relatório de reconciliação ANTES de promover. Este módulo é o motor; quem
// aciona é a direção (rota /api/v2/rollout) — com procedência gravada na
// própria flag, como a escada exige das decisões do dono.

import { backfillDeEntidade, type ArmazemDeBackfill, type ResultadoDoBackfill } from "./backfill";
import { reconciliar, type RelatorioDeReconciliacao } from "./leitura-dupla";
import {
  derivarDeOportunidade,
  derivarDeClientRequest,
  derivarDeBriefing,
  derivarDeSocialPost,
  derivarDeTask,
  derivarDeApprovalRequest,
  derivarDeCycle,
  derivarDeDeliverable,
} from "./derivar";

type Derivador = (legado: Record<string, unknown>) => string | null;

/** As entidades do rollout, com o derivador de cada uma (mapa do Marco 1). */
export const ENTIDADES_DO_ROLLOUT: ReadonlyArray<{ tipo: string; derivar: Derivador }> = [
  { tipo: "Oportunidade", derivar: (l) => derivarDeOportunidade(l as { status: string }) },
  { tipo: "ClientRequestDb", derivar: (l) => derivarDeClientRequest(l as { status: string }) },
  { tipo: "Briefing", derivar: (l) => derivarDeBriefing(l as { status: string }) },
  { tipo: "SocialPost", derivar: (l) => derivarDeSocialPost(l as { status: string }) },
  { tipo: "Task", derivar: (l) => derivarDeTask(l as { status: string }) },
  { tipo: "ApprovalRequest", derivar: (l) => derivarDeApprovalRequest(l as { status: string }) },
  { tipo: "Cycle", derivar: (l) => derivarDeCycle(l as { status: string }) },
  { tipo: "Deliverable", derivar: (l) => derivarDeDeliverable(l as { status: string }) },
];

export interface FontesDoRollout {
  armazemDe(tipo: string): ArmazemDeBackfill;
  compararDe(tipo: string): Promise<Array<{ id: string; gravado: string | null; derivado: string | null }>>;
  gravarRelatorio(r: RelatorioDeReconciliacao): Promise<void>;
}

export interface ResultadoDoRollout {
  backfills: ResultadoDoBackfill[];
  reconciliacoes: RelatorioDeReconciliacao[];
  /** Promovível SÓ quando toda entidade não-vazia reconciliou sem divergência. */
  veredito: "promovivel" | "nao_promovivel";
}

export async function executarRollout(fontes: FontesDoRollout): Promise<ResultadoDoRollout> {
  const backfills: ResultadoDoBackfill[] = [];
  const reconciliacoes: RelatorioDeReconciliacao[] = [];

  for (const { tipo, derivar } of ENTIDADES_DO_ROLLOUT) {
    backfills.push(await backfillDeEntidade(tipo, derivar, fontes.armazemDe(tipo)));
    const comparacoes = await fontes.compararDe(tipo);
    // Entidade sem NENHUMA linha não reprova o rollout — casa nova tem tabela
    // vazia; o relatório registra "vazia" com todas as letras.
    const relatorio =
      comparacoes.length === 0
        ? { entidadeTipo: tipo, total: 0, divergentes: 0, amostra: [], veredito: "promovivel" as const }
        : reconciliar(tipo, comparacoes);
    reconciliacoes.push(relatorio);
    await fontes.gravarRelatorio(relatorio);
  }

  const veredito = reconciliacoes.every((r) => r.veredito === "promovivel")
    ? "promovivel" as const
    : "nao_promovivel" as const;
  return { backfills, reconciliacoes, veredito };
}
