---
titulo: "Google Analytics — Data API (GA4): cotas e limites"
url: https://developers.google.com/analytics/devguides/reporting/data/v1/quotas?hl=pt-br
capturado_em: 2026-08-11
hash: ffbe55f4158363cb
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

Todas as solicitações à API Google Analytics Data v1 exigem um projeto do Google Cloud e estão sujeitas às cotas descritas nesta página. As cotas são consumidas independente do método usado para identificar o projeto de chamada, incluindo:

Solicitações autenticadas com credenciais do OAuth 2.0.
Solicitações autenticadas usando apenas uma chave de API.

As chaves de API são usadas para associar uma solicitação a um projeto na nuvem específico do Google Cloud para fins de cota e faturamento. Todas as chamadas de API feitas usando credenciais ou uma chave de API do seu projeto serão contabilizadas nas cotas aplicáveis do projeto e da propriedade do Google Analytics.

Categorias de cota

A API Data tem três categorias de cota de solicitação: principal, de tempo real e de funil. As solicitações de API para métodos principais cobram cotas principais. As solicitações de API para métodos em tempo real cobram cotas de tempo real. Cada solicitação consome apenas um tipo de cota.

Categoria de cota	Métodos da API
Core	runReport, runPivotReport, batchRunReports, batchRunPivotReports, runAccessReport, getMetadata, checkCompatibility, createAudienceExports
Em tempo real	runRealtimeReport
Funil	runFunnelReport
Cotas de propriedade do Google Analytics

Todas as solicitações consomem cotas de propriedade.

Nome da cota	Limite de propriedade padrão	Limite de propriedades do Analytics 360
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
As solicitações simultâneas são medidas pelo número de solicitações que estão sendo executadas ao mesmo tempo. Para reduzir a simultaneidade de solicitações, aguarde a conclusão das solicitações anteriores antes de enviar outras.
Os erros de servidor são códigos 500 e 503. As cotas de erros do servidor só são cobradas quando uma solicitação resulta em um erro do servidor. Quando as cotas de erros de servidor são esgotadas para um par de projeto e propriedade, todas as solicitações à propriedade do projeto são bloqueadas. Para conferir uma lista completa de respostas de erro, consulte Respostas de erro.
Cada solicitação consome cota para "Tokens por propriedade e hora" e "Tokens por projeto, propriedade e hora". Isso significa que uma propriedade precisa ser acessada por mais de três projetos para que a cota "Tokens por propriedade e hora" se esgote antes da cota "Tokens por projeto, propriedade e hora".
Observação: todas as cotas diárias são atualizadas à meia-noite na Hora do Pacífico. Todas as cotas por hora são atualizadas em uma hora, mas não necessariamente nos limites de hora inteira.

As propriedades podem fazer 120 solicitações potencialmente limitadas por hora. As dimensões userAgeBracket, userGender, brandingInterest, audienceId e audienceName podem ter um limite. Os limites são aplicados para impedir que alguém que visualiza um relatório infira as informações demográficas ou interesses de usuários individuais.

Cota de tokens de propriedade

Os tokens são consumidos a cada solicitação para a API Google Analytics Data v1. O número de tokens cobrados depende da complexidade da solicitação. A maioria das solicitações cobra 10 tokens ou menos, mas as mais complexas consomem mais.

Fatores que influenciam o consumo de tokens

O custo exato do token para uma solicitação é determinado no momento da execução, o que dificulta o pré-cálculo preciso. O custo é influenciado por uma combinação de fatores relacionados à solicitação e aos dados da propriedade do Google Analytics. Esses fatores podem resultar em custos mais altos:

Número de linhas:solicite um número maior de linhas.
Número de dimensões e métricas:incluir um número maior de dimensões e métricas.
Complexidade do filtro:uso de expressões de filtro complexas.
Duração do período:consultas em períodos mais longos.
Cardinalidade dos dados:dimensões com alta cardinalidade (muitos valores exclusivos, como pagePath, dimensões personalizadas) podem aumentar significativamente o custo do token.
Volume de eventos da propriedade:consultas em propriedades com um volume maior de eventos podem consumir mais tokens do que a mesma consulta em uma propriedade com menos dados.
Monitorar o uso de tokens

A maneira mais eficaz de determinar o custo de token para suas chamadas de API específicas é incluir o parâmetro "returnPropertyQuota": true no corpo da solicitação. A resposta da API vai incluir o objeto PropertyQuota, que detalha os tokens consumidos por essa solicitação específica e os saldos de cota restantes.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-04-22 UTC.