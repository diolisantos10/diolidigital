---
titulo: "Google Analytics — Data API (GA4): cotas e limites"
url: https://developers.google.com/analytics/devguides/reporting/data/v1/quotas?hl=pt-br
capturado_em: 2026-10-27
hash: 132a6b297a465eed
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Limites e cotas da API Data
Nesta página
Como as cotas são aplicadas
Categorias de cota
Cotas de propriedade do Google Analytics
Cota de tokens de propriedade

Os limites e as cotas a seguir se aplicam à API Data.

Como as cotas são aplicadas

Todas as solicitações à API Google Analytics Data v1 exigem um projeto do Google Cloud e estão sujeitas às cotas descritas nesta página. As cotas são consumidas independentemente do método usado para identificar o projeto de chamada, incluindo:

Solicitações autenticadas com credenciais do OAuth 2.0.
Solicitações autenticadas usando apenas uma chave de API.

As chaves de API são usadas para associar uma solicitação a um projeto na nuvem específico do Google Cloud para fins de cota e faturamento. Todas as chamadas de API feitas usando credenciais ou uma chave de API do seu projeto serão contabilizadas nas cotas aplicáveis do projeto e da propriedade do Google Analytics.

Categorias de cota

A API Data tem quatro categorias de cota de solicitação: Core, Realtime, Funnel e Chat.

As solicitações de API para métodos Core cobram cotas Core. As solicitações de API para métodos Realtime cobram cotas Realtime. As solicitações de API para métodos Funnel cobram cotas Funnel. As solicitações de API para métodos Chat cobram cotas Chat. Cada solicitação consome apenas um tipo de cota.

Categoria de cota	Métodos da API
Núcleo	runReport, runPivotReport, batchRunReports, batchRunPivotReports, runAccessReport, getMetadata, checkCompatibility, createAudienceExports
Em tempo real	runRealtimeReport
Funil	runFunnelReport
Chat	properties.chat
Cotas de propriedade do Google Analytics

Todas as solicitações consomem cotas de propriedade.

Nome da cota	Limite de propriedade padrão	Limite de propriedade do Analytics 360
Tokens principais por propriedade e dia	200.000	2.000.000
Tokens principais por propriedade e hora	40.000	400.000
Tokens principais por projeto, propriedade e hora	14.000	140.000
Solicitações simultâneas principais por propriedade	10	50
Erros de servidor principais por projeto, propriedade e hora	10	50
Tokens em tempo real por propriedade e dia	200.000	2.000.000
Tokens em tempo real por propriedade e hora	40.000	400.000
Tokens em tempo real por projeto, propriedade e hora	14.000	140.000
Solicitações simultâneas em tempo real por propriedade	10	50
Erros de servidor em tempo real por projeto, propriedade e hora	10	50
Tokens de funil por propriedade e dia	200.000	2.000.000
Tokens de funil por propriedade e hora	40.000	400.000
Tokens de funil por projeto, propriedade e hora	14.000	140.000
Solicitações simultâneas de funil por propriedade	10	50
Erros de servidor de funil por projeto, propriedade e hora	10	50
Tokens de chat por propriedade e dia	3.750.000	3.750.000
Tokens de chat por propriedade e hora	500.000	500.000
As solicitações simultâneas são medidas pelo número de solicitações que estão sendo executadas simultaneamente. Para reduzir a simultaneidade das solicitações, aguarde a conclusão das solicitações anteriores antes de enviar outras.
Os erros de servidor são códigos 500 e 503. As cotas de erros de servidor só são cobradas quando uma solicitação resulta em um erro de servidor. Quando as cotas de erros de servidor são esgotadas para um par de projeto e propriedade, todas as solicitações para a propriedade do projeto são bloqueadas. Para conferir uma lista completa de respostas de erro, consulte Error Responses.
Cada solicitação consome cota para tokens por propriedade e hora e tokens por projeto, propriedade e hora. Isso significa que uma propriedade precisa ser acessada por mais de três projetos para que a cota de "Tokens por propriedade e hora" possa ser esgotada antes da cota de "Tokens por projeto, propriedade e hora".
Observação: todas as cotas diárias são atualizadas à meia-noite do horário padrão do Pacífico. Todas as cotas por hora são atualizadas em uma hora, mas não necessariamente nos limites de hora inteira.

As propriedades podem ter 120 solicitações potencialmente limitadas por hora. As dimensões userAgeBracket, userGender, brandingInterest, audienceId e audienceName podem ser limitadas. Os limites são aplicados para impedir que as pessoas que visualizam um relatório consigam deduzir as informações demográficas ou os interesses de usuários individuais.

Cota de tokens de propriedade

Os tokens são consumidos com cada solicitação à API Google Analytics Data v1. O número de tokens cobrados depende da complexidade da solicitação. Embora a maioria das solicitações cobre 10 ou menos tokens, as solicitações mais complexas (como as consultas chat do Ask Advisor) consomem mais.

Fatores que influenciam o consumo de tokens

O custo exato do token para uma solicitação é determinado no momento da execução, o que dificulta o pré-cálculo preciso. O custo é influenciado por uma combinação de fatores relacionados à solicitação em si e aos dados subjacentes na propriedade do Google Analytics. Esses fatores podem resultar em custos mais altos:

Número de linhas:solicitar um número maior de linhas.
Número de dimensões e métricas:incluir um número maior de dimensões e métricas.
Complexidade do filtro:usar expressões de filtro complexas.
Duração do período:consultar períodos mais longos.
Cardinalidade de dados:dimensões com alta cardinalidade (muitos valores exclusivos, como pagePath, dimensões personalizadas) podem aumentar significativamente o custo do token.
Volume de eventos de propriedade:consultas em propriedades com um volume maior de eventos podem consumir mais tokens do que a mesma consulta em uma propriedade com menos dados.
Monitorar o uso de tokens

A maneira mais eficaz de determinar o custo do token para suas chamadas de API específicas é incluir o parâmetro "returnPropertyQuota": true no corpo da solicitação (com suporte em runReport, batchRunReports, runPivotReport, batchRunPivotReports, runRealtimeReport e runFunnelReport). A resposta da API vai incluir o objeto PropertyQuota, que detalha os tokens consumidos por essa solicitação específica e os saldos de cota restantes.

Exemplo de solicitação com returnPropertyQuota
POST https://analyticsdata.googleapis.com/v1beta/properties/GA_PROPERTY_ID:runReport
{
  "dateRanges": [
    { "startDate": "7daysAgo", "endDate": "yesterday" }
  ],
  "dimensions": [
    { "name": "country" }
  ],
  "metrics": [
    { "name": "activeUsers" }
  ],
  "returnPropertyQuota": true
}

Exemplo de payload de resposta propertyQuota

Quando "returnPropertyQuota": true está definido, a resposta inclui um propertyQuota objeto em que cada campo contém um QuotaStatus com consumed e remaining números inteiros:

{
  "dimensionHeaders": [
    { "name": "country" }
  ],
  "metricHeaders": [
    { "name": "activeUsers", "type": "TYPE_INTEGER" }
  ],
  "rows": [
    {
      "dimensionValues": [{ "value": "United States" }],
      "metricValues": [{ "value": "4820" }]
    }
  ],
  "propertyQuota": {
    "tokensPerDay": {
      "consumed": 1,
      "remaining": 199999
    },
    "tokensPerHour": {
      "consumed": 1,
      "remaining": 39999
    },
    "concurrentRequests": {
      "consumed": 0,
      "remaining": 10
    },
    "serverErrorsPerProjectPerHour": {
      "consumed": 0,
      "remaining": 10
    },
    "potentiallyThresholdedRequestsPerHour": {
      "consumed": 0,
      "remaining": 120
    },
    "tokensPerProjectPerHour": {
      "consumed": 1,
      "remaining": 13999
    }
  }
}

Cada campo em propertyQuota corresponde a uma cota em cotas de propriedade do Google Analytics. A cobrança de token de uma única solicitação de API é deduzida simultaneamente de tokensPerDay, tokensPerHour e tokensPerProjectPerHour. Se algum bucket de cota atingir 0 restante, as solicitações subsequentes para essa propriedade vão retornar um erro 429 RESOURCE_EXHAUSTED.

Práticas recomendadas para evitar erros 429 RESOURCE_EXHAUSTED
Monitore remaining saldos dinamicamente: inspecione propertyQuota.tokensPerProjectPerHour.remaining e propertyQuota.tokensPerHour.remaining nas respostas e limite ou pause jobs em segundo plano não urgentes quando os tokens restantes ficarem abaixo de um limite de segurança
Consultas relacionadas em lote: use batchRunReports ou batchRunPivotReports para agrupar até cinco relatórios em uma única chamada HTTP e reduzir a sobrecarga de ida e volta HTTP. Cada relatório em um lote ainda é contabilizado individualmente para as cotas de token e concurrentRequests.
Reduza a complexidade e a cardinalidade da consulta:limite as solicitações apenas às dimensões e métricas necessárias, encurte dateRanges sempre que possível e evite combinar várias dimensões de alta cardinalidade (como pagePath ou fullPageUrl) em consultas de pesquisa frequentes.
Controle a simultaneidade das solicitações:coloque as solicitações na fila ou limite o tamanho do pool de workers para que as solicitações em andamento fiquem abaixo do limite concurrentRequests (10 para o padrão, 50 para o Analytics 360).
Implemente a espera exponencial com limites de nova tentativa: se uma solicitação falhar com 429 RESOURCE_EXHAUSTED, 500 INTERNAL, ou 503 UNAVAILABLE, tente novamente usando a espera exponencial truncada, conforme descrito em Respostas de erro.
Consumo e monitoramento de tokens de chat

Para solicitações chat do Ask Advisor, os tokens representam custos de computação, raciocínio e recuperação de dados subjacentes do modelo. O consumo de tokens de chat é influenciado por:

Consulta e escopo analítico:complexidade e amplitude da análise solicitada.
Tokens de entrada e saída do modelo:volume de dados contextuais processados e narrativa de resposta gerada.
Tokens de raciocínio:etapas de raciocínio do modelo necessárias para sintetizar as descobertas.
Latência de execução:tempo de processamento necessário para análises de dados de várias etapas.

Para monitorar o uso de tokens de chat, defina "returnPropertyQuota": true no seu ChatRequest. A resposta vai incluir o PropertyChatQuota objeto que contém os tokensPerDay e tokensPerHour campos com saldos consumidos e restantes.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-23 UTC.