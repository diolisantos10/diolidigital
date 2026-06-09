import type { ScreenExplanation } from "../types";

// "Explique esta tela" builder for /agency/simulations/training.
// Deterministic and local — reads the live screen state and produces the
// explanation without external AI calls (none are configured for this).

export interface TrainingScreenState {
  totalRuns: number;
  runsToday: number;
  avgScore: number;
  failCount: number;
  criticalFails: number;
  pendingSuggestions: number;
  approvedSuggestions: number;
  continuousMode: boolean;
}

export function buildTrainingExplanation(s: TrainingScreenState): ScreenExplanation {
  const parts: string[] = [];
  if (s.totalRuns === 0) {
    parts.push("Nenhuma simulação foi executada nesta sessão ainda.");
  } else {
    parts.push(
      `Você executou ${s.totalRuns} simulaç${s.totalRuns === 1 ? "ão" : "ões"} nesta sessão (${s.runsToday} hoje), com score médio de ${s.avgScore}/100.`
    );
  }
  if (s.pendingSuggestions > 0) {
    parts.push(
      `Há ${s.pendingSuggestions} sugest${s.pendingSuggestions === 1 ? "ão" : "ões"} de melhoria aguardando sua decisão.`
    );
  }
  if (s.criticalFails > 0) {
    parts.push(`${s.criticalFails} simulaç${s.criticalFails === 1 ? "ão teve" : "ões tiveram"} falhas críticas.`);
  }

  const sections = [
    {
      title: "O que existe nesta tela",
      items: [
        "Status do treino contínuo — roda apenas enquanto esta aba estiver aberta.",
        "Cartões de estatística: pendentes, aprovadas, rejeitadas, runs hoje, score médio e falhas críticas.",
        "Controles para rodar simulações em modo Dinâmico, Misto ou Fixo.",
        "Histórico de simulações com filtros e detalhes por run.",
        "Fila de sugestões de melhoria para aprovar ou rejeitar.",
        "Painel Treino 24h — batches executados no servidor e persistidos no banco.",
      ],
    },
    {
      title: "O que é mais importante",
      items: [
        "Score médio — termômetro geral da performance do SDR.",
        "Sugestões pendentes — decisões que dependem de você.",
        "Falhas críticas — indicam problemas graves no comportamento do agente.",
      ],
    },
  ];

  const attention: string[] = [];
  if (s.criticalFails > 0) {
    attention.push(`${s.criticalFails} falha(s) crítica(s) — abra o histórico filtrando por "Falhas".`);
  }
  if (s.pendingSuggestions > 0) {
    attention.push(`${s.pendingSuggestions} sugestão(ões) pendente(s) — aprove ou rejeite na fila de melhorias.`);
  }
  if (s.avgScore > 0 && s.avgScore < 60) {
    attention.push(`Score médio baixo (${s.avgScore}/100) — revise as recomendações das runs com Fail.`);
  }
  if (s.continuousMode) {
    attention.push("Modo contínuo está ativo — ele pausa automaticamente se você fechar esta aba.");
  }

  const firstSteps: string[] = [];
  if (s.totalRuns === 0) {
    firstSteps.push('Clique em "Rodar 1" para executar sua primeira simulação.');
    firstSteps.push("Abra o resultado no histórico para entender o formato de avaliação.");
    firstSteps.push("Depois rode 10 cenários dinâmicos para gerar volume de treino real.");
  } else {
    if (s.pendingSuggestions > 0) {
      firstSteps.push("Revise as sugestões pendentes na fila de melhorias.");
    }
    if (s.failCount > 0) {
      firstSteps.push('Filtre o histórico por "Falhas" e leia as recomendações de cada run.');
    }
    firstSteps.push("Rode um novo ciclo dinâmico para validar a evolução do score.");
  }

  return { summary: parts.join(" "), sections, attention, firstSteps };
}
