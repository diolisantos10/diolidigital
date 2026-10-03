---
titulo: "Google Ads API — GAQL: visão geral das consultas"
url: https://developers.google.com/google-ads/api/docs/query/overview?hl=pt-br
capturado_em: 2026-10-03
hash: 99ad04d35d758073
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Linguagem de consulta do Google Ads
Dica: use o criador de consultas interativo para criar e validar suas consultas da GAQL.
Terminologia importante
Recurso
Uma entidade no Google Ads, como campaign ou ad_group.
Segmento
Uma dimensão usada para agrupar dados, como segments.date ou segments.device. Quando segmentos são incluídos na cláusula SELECT com métricas, elas são divididas por segmento.
Métrica
Uma medição de performance, como metrics.impressions ou metrics.clicks.
Recurso atribuído
Um recurso que é unido implicitamente ao recurso principal na cláusula FROM, permitindo selecionar os atributos dele junto com os atributos do recurso principal.
Consultar informações de recursos ou metadados

A linguagem de consulta do Google Ads pode consultar a API Google Ads para os seguintes tipos de informações:

Recursos e atributos, segmentos e métricas relacionados usando GoogleAdsService Search ou SearchStream: o resultado de uma consulta GoogleAdsService é uma lista de instâncias GoogleAdsRow, em que cada GoogleAdsRow representa um recurso.

Se algum atributo ou métrica for solicitado, a linha também vai incluir esses campos. Se algum segmento for solicitado, a resposta também vai mostrar uma linha adicional para cada tupla segmento-recurso.

Metadados sobre campos e recursos disponíveis em GoogleAdsFieldService: esse serviço fornece um catálogo de campos consultáveis com detalhes sobre a compatibilidade e o tipo deles.

O resultado de uma consulta GoogleAdsFieldService é uma lista de instâncias de GoogleAdsField, com cada GoogleAdsField contendo detalhes sobre o campo solicitado.

Para mais detalhes sobre a estrutura da consulta, consulte Estrutura da consulta e Gramática da linguagem de consulta do Google Ads.

Consultar atributos de recursos

Confira um exemplo de consulta básica para atributos do recurso de campanha que mostra como retornar o ID da campanha, o nome e o status:

SELECT
  campaign.id,
  campaign.name,
  campaign.status
FROM campaign
ORDER BY campaign.id

Essa consulta ordena por ID da campanha. Cada GoogleAdsRow resultante representa um objeto campaign preenchido com os campos selecionados, incluindo o resource_name da campanha.

Para saber quais outros campos estão disponíveis para consultas de campanha, consulte a documentação de referência de Campaign.

Consultar métricas

Além dos atributos selecionados para um determinado recurso, você também pode consultar métricas relacionadas:

SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  metrics.impressions
FROM campaign
WHERE campaign.status = 'PAUSED'
  AND metrics.impressions > 1000
ORDER BY campaign.id

Essa consulta filtra apenas as campanhas com status PAUSED e mais de 1.000 impressões, ordenando por ID da campanha. Cada GoogleAdsRow resultante teria um campo metrics preenchido com as métricas selecionadas.

Para uma lista de métricas que podem ser consultadas, consulte a documentação do Metrics.

Consultar segmentos

Além dos atributos selecionados para um determinado recurso, você também pode consultar segmentos relacionados:

SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  metrics.impressions,
  segments.date
FROM campaign
WHERE campaign.status = 'PAUSED'
  AND metrics.impressions > 1000
  AND segments.date DURING LAST_30_DAYS
ORDER BY campaign.id

Assim como na consulta de métricas, essa consulta filtra apenas as campanhas que têm o status PAUSED e mais de 1.000 impressões. No entanto, essa consulta segmenta os dados por data. Isso faz com que cada GoogleAdsRow resultante represente uma tupla de uma campanha e o segmento de data. A segmentação divide as métricas selecionadas, agrupando por cada segmento na cláusula SELECT.

Para uma lista de segmentos que podem ser consultados, consulte a documentação do Segments.

Consultar atributos de um recurso relacionado

Em uma consulta para um determinado recurso, é possível fazer uma junção com outros recursos relacionados, se disponíveis. Esses recursos relacionados são conhecidos como "recursos atribuídos". É possível fazer uma junção implícita com recursos atribuídos selecionando um atributo na consulta.

SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  bidding_strategy.name
FROM campaign
ORDER BY campaign.id

Essa consulta não apenas seleciona atributos de campanha, mas também extrai atributos relacionados de cada campanha selecionada. Cada GoogleAdsRow resultante representa um objeto campaign preenchido com os atributos da campanha selecionada e o atributo da estratégia de lances bidding_strategy.name.

Para saber quais recursos atribuídos estão disponíveis para consultas de campanha, consulte a documentação de referência Campaign.

Práticas recomendadas
Selecione apenas os campos necessários para evitar tempos de resposta longos e tempos limite.
Use LIMIT durante o desenvolvimento e os testes para evitar o processamento de grandes conjuntos de resultados.
Aplique filtros na cláusula WHERE para minimizar a transferência de dados e o tamanho da resposta.
Use GoogleAdsFieldService para verificar a compatibilidade de campos e os tipos de dados antes de criar consultas complexas.
Alguns campos, especialmente aqueles que envolvem grandes quantidades de dados ou cálculos complexos, podem aumentar o custo da consulta.
Fazer mutações com base nos resultados da consulta

Ao consultar um determinado recurso, você pode usar imediatamente os resultados retornados como objetos, modificá-los e enviá-los de volta ao método de mutação no serviço desse recurso. Confira um exemplo de fluxo de trabalho:

Execute uma consulta para todas as campanhas PAUSED com impressões maiores que 1.000.
Acesse o objeto Campaign no campo campaign de cada GoogleAdsRow na resposta.
Mude o status de cada campanha de PAUSED para ENABLED.
Chame CampaignService.MutateCampaigns com as campanhas modificadas e um FieldMask correspondente para atualizá-las.
Observação: ao atualizar recursos recuperados de uma consulta, especifique um FieldMask ou use o utilitário de máscara de campo integrado da biblioteca de cliente para que apenas os campos modificados sejam atualizados, evitando erros READ_ONLY_FIELD ou IMMUTABLE_FIELD ou substituindo outros atributos sem querer.
Metadados do campo

As consultas enviadas para GoogleAdsFieldService são destinadas à recuperação de metadados de campo. Essas informações podem ser usadas para entender como os campos podem ser usados juntos em uma consulta. Como os dados estão disponíveis na API e fornecem os metadados necessários para validar ou criar uma consulta, os desenvolvedores podem fazer isso de forma programática. Confira uma consulta típica de metadados:

SELECT
  name,
  category,
  selectable,
  filterable,
  sortable,
  selectable_with,
  data_type,
  is_repeated
WHERE name = "<INSERT_RESOURCE_OR_FIELD>"

Você pode substituir <INSERT_RESOURCE_OR_FIELD> nesta consulta por um recurso (como customer ou campaign) ou um campo (como campaign.id, metrics.impressions ou ad_group.id).

Importante: não há uma cláusula FROM nesta consulta.

Para uma lista de campos que podem ser consultados, consulte a documentação GoogleAdsField.

Diferenças específicas da versão

Embora a sintaxe, as cláusulas e os operadores da linguagem de consulta do Google Ads sejam idênticos em todas as versões compatíveis da API Google Ads (v23, v24 e v25), o catálogo de recursos, segmentos, métricas e comportamentos de geração de relatórios que podem ser consultados varia de acordo com a versão principal. Consulte GoogleAdsFieldService no endpoint da versão da API de destino para inspecionar os campos e as regras de compatibilidade dessa versão:

Recursos de meta de ciclo de vida:na v25 e em versões mais recentes, todas as metas de ciclo de vida (aquisição de novos clientes, retenção de clientes e retenção de fidelidade) são consultadas nos recursos unificados goal e campaign_goal_config, substituindo customer_lifecycle_goal e campaign_lifecycle_goal, que eram usados para metas de aquisição de novos clientes na v24 e em versões anteriores, junto com goal e campaign_goal_config para metas de retenção de clientes.
Métricas de visualização de recursos de expansão de URL final:na v25 e em versões mais recentes, a consulta de final_url_expansion_asset_view retorna todas as métricas selecionáveis da visualização. Na v24 e versões anteriores, as respostas incluem apenas metrics.conversions e metrics.conversions_value para campanhas Performance Max e metrics.impressions para campanhas de pesquisa.
Relatórios de produtos do Shopping para campanhas para apps:na v24 e versões mais recentes, o recurso shopping_product retorna linhas de produtos para campanhas para apps, além de campanhas do Shopping, Performance Max, Geração de Demanda e de vídeo. Na v23, as campanhas para apps são excluídas dos resultados de shopping_product.
Recursos, segmentos e métricas específicos da versão:
v25 e versões mais recentes:inclui recursos de medição de Lift (como lift_measurement_config), segmentos como segments.ad_sub_format_type e segments.loyalty_membership, e métricas de engajamento do YouTube (metrics.youtube_likes, metrics.youtube_comments e metrics.youtube_shares). Remove local_services_lead.contact_details.email (que pode ser selecionado na v24 e em versões anteriores).
v24 e versões mais recentes:inclui o recurso cart_data_sales_view, segments.conversion_attribution_event_type em shopping_performance_view, segments.mobile_device_platform e segments.ad_network_type em performance_max_placement_view. Remove campaign.video_brand_safety_suitability (substituído por customer.video_brand_safety_suitability), segments.ad_sub_network_type em campaign_budget e segments.click_type em ad_group_asset, campaign_asset e customer_asset (que podem ser selecionados apenas na v23).
Código de erro de período granular:consultas que segmentam por segments.date, segments.week ou segments.hour (ou filtram um período inferior a um mês) além da janela de lookback de 37 meses retornam DateRangeError.REQUESTED_DATE_GRANULARITY_NOT_SUPPORTED na v24 e em versões mais recentes (ou DateRangeError.UNKNOWN na v23). Consulte Períodos para mais detalhes.
Exemplos de código

As bibliotecas de cliente têm exemplos de uso da linguagem de consulta do Google Ads em GoogleAdsService. A pasta operações básicas tem exemplos como GetCampaigns, GetKeywords e SearchForGoogleAdsFields.

Avançar
Gramática das consultas
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-30 UTC.