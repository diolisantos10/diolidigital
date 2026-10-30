---
titulo: "Google Ads API — cotas de operações e recursos"
url: https://developers.google.com/google-ads/api/docs/best-practices/quotas?hl=pt-br
capturado_em: 2026-10-30
hash: 40b1363e93b8492d
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Limites e cotas da API

A API Google Ads impõe limites às operações de API, como o número de operações que podem ser enviadas em uma única solicitação de mutação. A tabela a seguir resume alguns dos limites e cotas importantes que você precisa conhecer.

Tipo de solicitação, limitação e código do erro
Operações com o nível de acesso de teste	15.000 operações de API por dia em contas de teste	RESOURCE_EXHAUSTED
Operações com o nível de acesso de explorador	2.880 operações de API por dia em contas de produção
15.000 operações de API por dia em contas de teste	RESOURCE_EXHAUSTED
Operações com nível de acesso básico	15.000 operações de API por dia em contas de teste e de produção	RESOURCE_EXHAUSTED
Operações com nível de acesso padrão	Operações de API ilimitadas por dia em contas de teste e de produção	N/A
Solicitações de mutação	10.000 operações de mutação por solicitação	TOO_MANY_MUTATE_OPERATIONS
Solicitações de serviço de planejamento	1 QPS	RESOURCE_EXHAUSTED
Solicitações de serviço de upload de conversões	2.000 conversões por solicitação	TOO_MANY_CONVERSIONS_IN_REQUEST
Solicitações de faturamento e do serviço de orçamento da conta	1 operação por solicitação de mutação	TOO_MANY_MUTATE_OPERATIONS
Limites diários de operações de API

Os limites diários de uso da API são baseados no número de operações da API feitas pelo projeto do Google Cloud. As operações de API são a soma total de solicitações Search e SearchStream, operações de mutação individuais e outras solicitações de serviço. Os limites para operações diárias da API dependem do nível de acesso à API do seu projeto na nuvem do Google Cloud. O guia de níveis de acesso e uso permitido descreve os limites específicos de operação da API para cada nível de acesso.

As solicitações que violam esses limites são rejeitadas com o erro: RESOURCE_EXHAUSTED.

Limitações do gRPC

Todas as bibliotecas de cliente da API Google Ads usam o gRPC para gerar solicitações e respostas. Por padrão, o gRPC tem um tamanho de mensagem de 4 MB, mas nossas bibliotecas de cliente definem o tamanho máximo da mensagem como 64 MB para aumentar a eficiência.

As respostas não podem exceder esse limite. Por exemplo, uma solicitação de pesquisa que inclui muitos campos pode gerar uma resposta que excede 64 MB. Para evitar esse limite, reduza o número de campos selecionados ou use o streaming. Para mutações, envie menos operações por solicitação.

As solicitações que violarem essa limitação não vão gerar um GoogleAdsError, mas vão gerar um erro RESOURCE_EXHAUSTED (código gRPC 8 / HTTP 429). Consulte a lista de códigos e mensagens de erro do gRPC.

Solicitações de mutação

Além de ser contabilizada na cota de operações diárias do usuário, uma solicitação de mutação não pode conter mais de 10.000 operações de mutação por solicitação. As solicitações que violam essa limitação são rejeitadas com o erro: TOO_MANY_MUTATE_OPERATIONS.

Confira a seguir outros limites e considerações para serviços e tipos de solicitação específicos.

Solicitações de pesquisa

Uma solicitação Search ou SearchStream conta como uma operação na cota diária de operações do usuário. Uma solicitação SearchStream conta como uma operação de API, independentemente do número de lotes.

Solicitações paginadas

As solicitações paginadas (por exemplo, solicitações que contêm um next_page_token válido) não são contabilizadas na cota de operação diária de um usuário. No entanto, as solicitações de paginação que contêm um token de página expirado ou inválido vão gerar uma exceção e serão contabilizadas na cota de operação diária.

Para mais detalhes sobre paginação, consulte Como fazer paginação de resultados.

Outros tipos de solicitações

Uma solicitação que não seja Mutate, Search ou SearchStream conta como uma operação na cota diária de operações do usuário.

Alguns exemplos dessas solicitações incluem:

BatchJobService.ListBatchJobResults
ConversionUploadService.UploadCallConversions
ConversionUploadService.UploadClickConversions
OfflineUserDataJobService.AddOfflineUserDataJobOperations
OfflineUserDataJobService.CreateOfflineUserDataJob
UserDataService.UploadUserData
Solicitações que retornam exceções de API

As solicitações rejeitadas com um GoogleAdsFailure ainda contam para a cota de operação diária do usuário.

As solicitações que falham, mas não retornam um GoogleAdsFailure, como um erro no nível da rede, não são contabilizadas na cota diária de operações do usuário, já que as solicitações nunca chegam ao serviço. Um exemplo disso é uma falha de conectividade de rede.

Serviço de planejamento de palavras-chave

Devido ao custo e à complexidade, os seguintes métodos do serviço de planejamento de palavras-chave estão sujeitos a limites diferentes de outros tipos de solicitações.

Limitado a 1 solicitação por segundo por CID:

KeywordPlanIdeaService.GenerateKeywordIdeas
KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics
KeywordPlanIdeaService.GenerateKeywordForecastMetrics

As solicitações que violam essas limitações são rejeitadas com o erro: RESOURCE_EXHAUSTED.

1 QPS é calculado como 60 solicitações a cada 60 segundos.

Limitado a 2 solicitações por segundo por CID:

KeywordPlanIdeaService.GenerateAdGroupThemes

Lembre-se desses limites ao criar um plano de palavras-chave.

Objeto de plano de palavras-chave	Número máximo
KeywordPlan por conta	10.000
KeywordPlanAdGroup por KeywordPlan	200
KeywordPlanAdGroupKeyword por KeywordPlan	10.000
KeywordPlanCampaignKeyword (palavras-chave negativas) por KeywordPlan	1.000
KeywordPlanCampaign por KeywordPlan	1
Serviço de insights sobre público-alvo

Os métodos a seguir em AudienceInsightsService estão sujeitos a limites de cota específicos.

Limitado a aproximadamente 200 solicitações por dia por CID:
AudienceInsightsService.GenerateAudienceCompositionInsights
AudienceInsightsService.GenerateSuggestedTargetingInsights
Limitado a 2 solicitações por segundo por projeto na nuvem do Google Cloud:
AudienceInsightsService.GenerateTargetingSuggestionMetrics
Serviço de upload de conversões

Limitado a 2.000 conversões de chamada ou clique por solicitação:

ConversionUploadService.UploadCallConversions
ConversionUploadService.UploadClickConversions

As solicitações que violam esses limites são rejeitadas com o erro: TOO_MANY_CONVERSIONS_IN_REQUEST.

Observação: a partir de 15 de junho de 2026, ConversionUploadService.UploadClickConversions será restrito para novos usuários (retornando NotAllowlistedError.CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE). As novas integrações de upload de conversões precisam usar a API Data Manager.
Serviço de upload de ajuste de conversão

Limitado a 2.000 ajustes de conversão por solicitação:

ConversionAdjustmentUploadService.UploadConversionAdjustments

As solicitações que violam esses limites são rejeitadas com o erro: TOO_MANY_ADJUSTMENTS_IN_REQUEST.

Regras do valor da conversão

Limite de 100.000 regras de valor da conversão por conta.

As solicitações que violam esse limite são rejeitadas com o erro ResourceCountLimitExceededError.ACCOUNT_LIMIT.

Observação: as regras de valor da conversão criadas com a API Google Ads só serão ativadas se fizerem parte de um conjunto de regras de valor da conversão que inclua os nomes de recursos ConversionValueRule no campo conversion_value_rules e que tenha o status ConversionValueRuleSet definido como ENABLED. As regras de valor da conversão que não fazem parte de nenhum conjunto de regras de valor da conversão não são visíveis na interface do Google Ads e só podem ser gerenciadas usando a API.

Se já houver um ConversionValueRuleSet com um attachment_type de CUSTOMER na conta, adicione as novas regras de valor da conversão a esse conjunto para que elas sejam ativadas. Se não houver um conjunto de regras de valor da conversão, crie um e adicione suas regras de valor da conversão a ele, conforme descrito em Criar conjuntos de regras.

Serviços de faturamento e orçamento da conta

As mutações só podem ser feitas em contas configuradas para faturamento mensal.

As solicitações que violam essa limitação são rejeitadas com o erro: MUTATE_NOT_ALLOWED.

Apenas 1 operação é permitida para solicitações de mutação.

As solicitações que violam essa limitação são rejeitadas com o erro: TOO_MANY_MUTATE_OPERATIONS.

Aguarde pelo menos 12 horas entre as mudanças no orçamento da conta (AccountBudget ou AccountBudgetProposal) na mesma conta. Fazer mudanças antes de 12 horas pode resultar em falhas irrecuperáveis que só podem ser resolvidas pelo representante da sua conta do Google Ads.

Convites para contas de cliente

Novos usuários podem ser convidados para contas de cliente com o CustomerUserAccessInvitationService. Como esse recurso envia e-mails de convite para outros usuários, ele pode ser usado de forma indevida. Por isso, há limitações no comportamento dele:

Os usuários não podem receber mais de um convite pendente para a mesma conta de cliente. Se uma solicitação subsequente for feita para enviar um convite a um usuário que já tem um convite pendente, este erro será retornado: EMAIL_ADDRESS_ALREADY_HAS_PENDING_INVITATION.

As contas de cliente não podem ter mais de 70 convites pendentes ao mesmo tempo. Se uma solicitação for enviada e fizer com que esse valor seja excedido, este erro será retornado: PENDING_INVITATIONS_LIMIT_EXCEEDED.

Dados do usuário

Os dados do usuário são gerenciados com o UserDataService e o OfflineUserDataJobService.

Observação: a partir de 1º de abril de 2026, UserDataService e OfflineUserDataJobService para a Segmentação por Lista de Clientes serão restritos para novos usuários (retornando NotAllowlistedError.CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE). As novas integrações da Segmentação por Lista de Clientes precisam usar a API Data Manager.

Cada objeto UserData em uma operação create ou remove pertence a um único usuário final. O campo user_identifiers em um único objeto UserData é limitado a no máximo 20 identificadores. Exceder esse limite em um único objeto UserData resultará em um erro OfflineUserDataJobError.TOO_MANY_USER_IDENTIFIERS ou UserDataError.TOO_MANY_USER_IDENTIFIERS.

Processar usuários com mais de 20 identificadores

Se um único usuário final tiver mais de 20 identificadores que você precisa enviar, distribua esses identificadores em vários objetos UserData. Para garantir que o Google possa associar todos esses identificadores ao mesmo usuário final, cada objeto UserData desse usuário precisa incluir pelo menos um user_identifier comum, como o mesmo hashed_email, hashed_phone_number ou third_party_user_id. O Google usa esses identificadores compartilhados para vincular e mesclar as informações das operações separadas do UserData ao perfil correto do usuário final.

Se você usa PIIs, como e-mails ou números de telefone com hash, verifique se eles estão normalizados e com hash de acordo com os requisitos da API Google Ads (SHA-256, letras minúsculas, sem espaços em branco) para evitar falhas de vinculação.

Por exemplo, se um usuário tiver 30 endereços de e-mail, você poderá enviar dois objetos UserData que compartilham um third_party_user_id comum (colocando thirdPartyUserId e os e-mails de 1 a 19 no primeiro objeto para permanecer dentro do limite de 20 identificadores, e thirdPartyUserId e os e-mails de 20 a 30 no segundo):

{
  "userIdentifiers": [
    { "thirdPartyUserId": "user123" },
    { "hashedEmail": "SHA256_OF_EMAIL_1" },
    // Hashed emails 2 through 18 are omitted here.
    { "hashedEmail": "SHA256_OF_EMAIL_19" }
  ]
}

{
  "userIdentifiers": [
    { "thirdPartyUserId": "user123" },
    { "hashedEmail": "SHA256_OF_EMAIL_20" },
    // Hashed emails 21 through 29 are omitted here.
    { "hashedEmail": "SHA256_OF_EMAIL_30" }
  ]
}

O limite total de user_identifiers em todas as operações em um único AddOfflineUserDataJobOperationsRequest é de 100.000 (um OfflineUserDataJob pode aceitar várias chamadas AddOfflineUserDataJobOperationsRequest, até um máximo recomendado de 1.000.000 de operações por job). Para uploads síncronos usando UploadUserDataRequest (UserDataService.UploadUserData), cada solicitação é limitada a um máximo de 10 operações e 100 user_identifiers em toda a solicitação.

Outros tipos de limites

Um campo repetido, como uma lista de operações, que tem muitos itens em uma solicitação pode gerar o erro: REQUEST_SIZE_LIMIT_EXCEEDED. Essa mesma mensagem de erro também pode ser causada por outros problemas.

Se você encontrar essa limitação e estiver fazendo solicitações que usam um campo repetido, tente reduzir o número de itens no campo repetido dividindo a lista de operações em várias solicitações de mutação.

Ao fazer uma consulta GAQL, o número máximo de itens em uma cláusula IN é 20.000. Se você exceder esse limite, um erro FILTER_HAS_TOO_MANY_VALUES será retornado.

Anterior
Visão geral
Avançar
Limites do sistema
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-30 UTC.