---
titulo: "Google Analytics — Data API (GA4): visão geral"
url: https://developers.google.com/analytics/devguides/reporting/data/v1?hl=pt-br
capturado_em: 2026-09-23
hash: 851a97e710c4ddca
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Visão geral da API Google Analytics Data
Nesta página
Consistência de dados e identidade do relatório
Primeiros passos
Métodos disponíveis
Dimensões e métricas compatíveis

Você pode usar a API Data para acessar de maneira programática os dados de relatórios do Google Analytics.

Saiba mais sobre as propriedades do Google Analytics.

Os dados retornados pela API são consistentes com os mostrados na interface de usuário do Google Analytics e respeitam totalmente as configurações de identidade do relatório (como combinada, observada ou com base em dispositivo) configuradas para sua propriedade do Google Analytics.

Essa API oferece recursos nos canais Alfa e Beta. Os produtos Alfa e Beta podem ter suporte limitado, e as mudanças neles podem não ser compatíveis com outras versões Alfa e Beta.

Alfa: Os recursos estão em um estágio inicial de pré-lançamento. Tentamos informar você sobre mudanças futuras, mas podem acontecer alterações interruptivas antes de a API ser lançada publicamente.

Beta: Nenhuma mudança incompatível é esperada neste canal.

Para receber comunicados oficiais sobre a API Google Analytics, inscreva-se no grupo de notificações da API Google Analytics.

Confira alguns exemplos de relatórios que você pode gerar usando a API Google Analytics Data v1:

Quantos usuários ativos por dia seu app Android teve na última semana?
Quantas visualizações de página as 10 principais páginas do seu site tiveram nos últimos 28 dias.
Quantos usuários ativos por país seu app iOS teve nos últimos 30 minutos.

Você também pode usar a API Google Analytics Data v1 para fazer o seguinte:

criar painéis personalizados para exibir os dados do Google Analytics;
automatizar tarefas de relatórios complexas para economizar tempo;
integrar seus dados do Google Analytics a outros aplicativos de negócios.
Consistência de dados e identidade do relatório

A API Google Analytics Data v1 acessa os mesmos dados de relatórios que a interface do Google Analytics. Os dados retornados pela API respeitam totalmente as configurações de Identidade do relatório configuradas para sua propriedade do Google Analytics. Assim, as contagens de usuários, a eliminação de duplicação e a modelagem de dados se alinham ao espaço de identificação escolhido (como combinada, observada ou baseada em dispositivo) nas configurações da propriedade.

Para saber como diferentes espaços de identificação podem afetar seus relatórios, consulte Identidade do relatório.

Primeiros passos

Para começar, consulte o início rápido da biblioteca de cliente. Há bibliotecas de cliente em Java, Python, Node.js e outras linguagens para simplificar sua implementação.

Métodos disponíveis

Confira uma lista dos métodos da API Data. Para mais detalhes, consulte a documentação de referência.

runReport: retorna um relatório personalizado dos seus dados de eventos do Google Analytics e é o método preferido para consultas simples de relatórios.
batchRunReports: é uma versão em lote do método runReport que permite gerar vários relatórios usando uma única chamada de API.
runPivotReport: esse método retorna um relatório dinâmico personalizado com os dados de eventos do Google Analytics. Os relatórios dinâmicos são formatos mais avançados e expressivos do que os relatórios comuns. Cada tabela dinâmica descreve as colunas e linhas de dimensões visíveis na resposta do relatório.
batchRunPivotReports É uma versão em lote do método "runPivotReport", que permite gerar vários relatórios usando uma única chamada de API.
getMetadata Esse método retorna metadados para dimensões e métricas disponíveis nos métodos de relatórios. Usado para analisar as dimensões e métricas. A resposta desse método também inclui as dimensões e métricas personalizadas disponíveis para a propriedade especificada do Google Analytics.
checkCompatibility Esse método lista dimensões e métricas que podem ser adicionadas a uma solicitação de relatório e manter a compatibilidade.
runRealtimeReport: esse método retorna um relatório personalizado dos dados de eventos em tempo real da sua propriedade. Os eventos aparecem nos relatórios em tempo real segundos depois de serem enviados ao Google Analytics. Os relatórios em tempo real mostram eventos e dados de uso dos períodos que vão do momento atual até 30 minutos atrás (até 60 minutos para propriedades do Google Analytics 360).
properties.audienceExports Um grupo de métodos que permite gerar exportações de público-alvo, que incluem um snapshot dos usuários em um público-alvo.
properties.recurringAudienceLists (Prévia antecipada): um grupo de métodos que permite gerenciar exportações recorrentes de públicos-alvo. Uma exportação recorrente de público-alvo gera novas listas de público-alvo todos os dias.
runFunnelReport (Prévia antecipada): esse método retorna um relatório de funil personalizado dos dados de eventos do Google Analytics. Com a análise detalhada de funil, você pode ver as etapas que os usuários realizam até concluir uma tarefa e quais delas conseguem mantê-los no funil.
properties.chat (Prévia) Esse método oferece acesso programático por conversa ao Consultor do Analytics. Você pode fazer perguntas em linguagem natural sobre seus dados de eventos, diagnosticar mudanças de performance e receber insights estruturados em formato de narrativa e tabela.
Dimensões e métricas compatíveis

Para uma lista de todas as dimensões e métricas compatíveis com a API Data, consulte a documentação do esquema da API.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-19 UTC.