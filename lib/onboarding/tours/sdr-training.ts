import type { TourDefinition } from "../types";

// Tour for /agency/simulations/training — covers Estatísticas, Runs,
// Sugestões, Aprovação de melhorias, Batch no servidor e Alertas.
// Targets match data-tour attributes set in the training page.

export const SDR_TRAINING_TOUR: TourDefinition = {
  id: "sdr-training",
  steps: [
    {
      target: '[data-tour="training-stats"]',
      title: "Estatísticas da sessão",
      body:
        "Visão rápida do treino: sugestões pendentes, aprovadas e rejeitadas, runs de hoje, score médio e falhas críticas. Os números mudam de cor quando exigem atenção — vermelho indica problema.",
    },
    {
      target: '[data-tour="training-controls"]',
      title: "Rodar simulações",
      body:
        "Escolha o modo de treino — Dinâmico (cenários novos), Misto ou Fixos (regressão) — e rode 1, 10 ou 50 simulações. O modo Contínuo roda 3 simulações a cada 8 segundos enquanto esta aba estiver aberta.",
    },
    {
      target: '[data-tour="training-runs"]',
      title: "Histórico de runs",
      body:
        "Cada linha é uma simulação avaliada com verdict (Pass, Warning ou Fail) e score de 0 a 100. Clique em uma linha para ver issues e recomendações. Use os filtros para isolar falhas ou cenários dinâmicos.",
    },
    {
      target: '[data-tour="training-suggestions"]',
      title: "Sugestões de melhoria",
      body:
        "Quando o mesmo critério falha em 2 ou mais runs, o sistema gera uma sugestão com problema, evidência e mudança proposta. As abas separam pendentes, aprovadas e rejeitadas.",
    },
    {
      target: '[data-tour="training-suggestions"]',
      title: "Aprovação de melhorias",
      body:
        "Aprovar uma sugestão NÃO altera o brain do SDR automaticamente — ela fica arquivada aguardando aplicação manual. Sugestões rejeitadas ficam guardadas para referência e nunca são apagadas.",
    },
    {
      target: '[data-tour="training-batch"]',
      title: "Batch no servidor",
      body:
        "Rode batches diretamente no servidor: escolha modo e quantidade (máx. 100). Diferente do modo navegador, os resultados são persistidos no banco de dados e não dependem da aba aberta.",
    },
    {
      target: '[data-tour="training-server"]',
      title: "Treino 24h e alertas",
      body:
        "Este painel mostra o worker 24h: estatísticas persistidas, alertas automáticos (score baixo, falhas críticas) e melhorias pendentes do servidor. Aprovar aqui cria um BrainChangeRequest com status pending.",
    },
  ],
};
