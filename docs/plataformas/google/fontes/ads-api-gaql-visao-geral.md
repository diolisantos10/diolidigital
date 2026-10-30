---
titulo: "Google Ads API — GAQL: visão geral das consultas"
url: https://developers.google.com/google-ads/api/docs/query/overview?hl=pt-br
capturado_em: 2026-10-30
hash: 5089bbb1c03ff7ce
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Linguagem de consulta do Google Ads
Dica: use o Criador de consultas interativo para criar e validar suas consultas da GAQL.
Terminologia importante
Recurso
Uma entidade no Google Ads, como campaign ou ad_group.
Segmento
Uma dimensão usada para agrupar dados, como segments.date ou segments.device. Quando os segmentos são incluídos na cláusula SELECT com métricas, as métricas são divididas por segmento.
Métrica
Uma medida de performance, como metrics.impressions ou metrics.clicks.
Recurso atribuído
Um recurso que é implicitamente unido ao recurso principal na cláusula FROM, permitindo que você selecione os atributos dele junto com os atributos do recurso principal.
Consultar informações de recursos ou metadados

A Linguagem de consulta do Google Ads pode consultar a API Google Ads para os seguintes tipos de informações:

Recursos e os atributos, segmentos e métricas relacionados usando GoogleAdsService Search ou SearchStream: o resultado de uma consulta GoogleAdsService é uma lista de instâncias de GoogleAdsRow, em que cada GoogleAdsRow representa um recurso.

Se algum atributo ou métrica for solicitado, a linha também vai incluir esses campos. Se algum segmento for solicitado, a resposta também vai mostrar uma linha adicional para cada tupla de recurso de segmento.

Metadados sobre campos e recursos disponíveis em GoogleAdsFieldService: esse serviço fornece um catálogo de campos consultáveis com detalhes sobre a compatibilidade e o tipo deles.

O resultado de uma consulta GoogleAdsFieldService é uma lista de instâncias GoogleAdsField, em que cada GoogleAdsField contém detalhes sobre o campo solicitado.

Para mais detalhes sobre a estrutura de consulta, consulte Estrutura de consulta e Gramática da linguagem de consulta do Google Ads.

Consultar atributos de recursos

Veja um exemplo de consulta básica para atributos do recurso de campanha que mostra como retornar o ID, o nome e o status da campanha:

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

Essa consulta filtra apenas as campanhas com o status PAUSED e que tiveram mais de 1.000 impressões, ordenando por ID da campanha. Cada GoogleAdsRow resultante teria um campo metrics preenchido com as métricas selecionadas.

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

Para uma lista de segmentos que podem ser consultados, consulte a documentação de Segments.

Consultar atributos de um recurso relacionado

Em uma consulta para um determinado recurso, talvez seja possível fazer uma mesclagem com outros recursos relacionados, se disponíveis. Esses recursos relacionados são conhecidos como "recursos atribuídos". É possível fazer uma mesclagem com recursos atribuídos implicitamente selecionando um atributo na consulta.

SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  bidding_strategy.name
FROM campaign
ORDER BY campaign.id

Essa consulta não apenas seleciona atributos de campanha, mas também extrai atributos relacionados de cada campanha selecionada. Cada GoogleAdsRow resultante representa um objeto campaign preenchido com os atributos de campanha selecionados, bem como o atributo de estratégia de lances selecionado bidding_strategy.name.

Para saber quais recursos atribuídos estão disponíveis para consultas de campanha, consulte a documentação de referência de Campaign.

Práticas recomendadas
Selecione apenas os campos necessários para evitar tempos de resposta longos e tempos limite.
Use LIMIT durante o desenvolvimento e o teste para evitar o processamento de grandes conjuntos de resultados.
Aplique filtros na cláusula WHERE para minimizar a transferência de dados e o tamanho da resposta.
Use GoogleAdsFieldService para verificar a compatibilidade de campos e os tipos de dados antes de criar consultas complexas.
Alguns campos, especialmente aqueles que envolvem grandes quantidades de dados ou cálculos complexos, podem aumentar o custo da consulta.
Mudar com base nos resultados da consulta

Ao consultar um determinado recurso, você pode usar imediatamente os resultados retornados como objetos, modificá-los e enviá-los de volta ao método mutate no serviço desse recurso. Confira um exemplo de fluxo de trabalho:

Execute uma consulta para todas as campanhas de PAUSED que têm mais de 1.000 impressões.
Acesse o objeto Campaign no campo campaign de cada GoogleAdsRow na resposta.
Mude o status de cada campanha de PAUSED para ENABLED.
Chame CampaignService.MutateCampaigns com as campanhas modificadas e um FieldMask correspondente para atualizá-las.
Observação : ao atualizar recursos recuperados de uma consulta, especifique um FieldMask (ou use o utilitário de máscara de campo integrado da biblioteca de cliente) para que apenas os campos modificados sejam atualizados, evitando erros READ_ONLY_FIELD ou IMMUTABLE_FIELD ou a substituição não intencional de outros atributos.
Metadados do campo

As consultas enviadas para GoogleAdsFieldService servem para recuperar metadados de campo. Essas informações podem ser usadas para entender como os campos podem ser usados juntos em uma consulta. Como os dados estão disponíveis na API e ela fornece os metadados necessários para validar ou criar uma consulta, os desenvolvedores podem fazer isso de forma programática. Veja uma consulta típica de metadados:

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

É possível substituir <INSERT_RESOURCE_OR_FIELD> nessa consulta por um recurso (como customer ou campaign) ou campo (como campaign.id, metrics.impressions ou ad_group.id).

Importante: observe que não há uma cláusula FROM nesta consulta.

Para uma lista de campos que podem ser consultados, consulte a documentação de GoogleAdsField.

Diferenças específicas da versão

Embora a sintaxe, as cláusulas e os operadores da Linguagem de consulta do Google Ads sejam idênticos em todas as versões compatíveis da API Google Ads (v23, v24, v25 e v26), o catálogo de recursos, segmentos, métricas e comportamentos de relatórios que podem ser consultados varia de acordo com a versão principal. Consulte GoogleAdsFieldService no endpoint da versão da API de destino para inspecionar os campos e as regras de compatibilidade dessa versão:

Visualização de recursos de expansão de URL final:
Suporte para campanhas do Shopping (v26 e mais recentes): final_url_expansion_asset_view é compatível com campanhas do Shopping (campaign.advertising_channel_type = 'SHOPPING'), além de campanhas Performance Max e de pesquisa. Nas campanhas do Shopping, é possível selecionar e filtrar por campos ad_group, mas não é possível selecionar campos asset_group.
Métricas selecionáveis (v25 e mais recentes): consultar final_url_expansion_asset_view retorna todas as métricas selecionáveis para a visualização. Na v24 e anteriores, as respostas incluem apenas metrics.conversions e metrics.conversions_value para campanhas Performance Max e metrics.impressions para campanhas de pesquisa.
Recursos de meta de ciclo de vida: na v25 e em versões mais recentes, todas as metas de ciclo de vida (aquisição de novos clientes, retenção de clientes e retenção de fidelidade) são consultadas nos recursos unificados goal e campaign_goal_config, substituindo customer_lifecycle_goal e campaign_lifecycle_goal (que eram usados para metas de aquisição de novos clientes na v24 e em versões anteriores, além de goal e campaign_goal_config para metas de retenção de clientes).
Relatórios de produtos do Shopping para campanhas para apps: na v24 e em versões mais recentes, o recurso shopping_product retorna linhas de produtos para campanhas para apps, além de campanhas do Shopping, Performance Max, Geração de Demanda e de vídeo (na v23, as campanhas para apps são excluídas dos resultados de shopping_product).
Recursos, segmentos e métricas específicos da versão:
v26 e mais recentes: inclui o recurso search_lift_keyword_bundle, campaign.lift_measurement_config, local_services_lead.campaign, segments.search_lift_keyword_bundle, segments.search_property e métricas de Search Lift (como metrics.relative_search_lift, metrics.normalized_incremental_searches, metrics.search_lift_cost_micros e metrics.search_lift_impressions).
v25 e mais recentes: inclui recursos de medição de aumento (como lift_measurement_config), segmentos como segments.ad_sub_format_type e segments.loyalty_membership e métricas de engajamento do YouTube (metrics.youtube_likes, metrics.youtube_comments e metrics.youtube_shares). Remove local_services_lead.contact_details.email (que pode ser selecionado na v24 e em versões anteriores).
v24 e mais recentes: inclui o recurso cart_data_sales_view, segments.conversion_attribution_event_type em shopping_performance_view, segments.mobile_device_platform e segments.ad_network_type em performance_max_placement_view. Remove campaign.video_brand_safety_suitability (substituído por customer.video_brand_safety_suitability), segments.ad_sub_network_type em campaign_budget e segments.click_type em ad_group_asset, campaign_asset e customer_asset (que são selecionáveis apenas na v23).
Código de erro de lookback de data granular: consultas que segmentam por segments.date, segments.week ou segments.hour (ou filtram em um período inferior a um mês) além da janela de lookback de 37 meses retornam DateRangeError.REQUESTED_DATE_GRANULARITY_NOT_SUPPORTED na v24 e em versões mais recentes (ou DateRangeError.UNKNOWN na v23). Consulte Períodos para mais detalhes.
Exemplos de código

As bibliotecas de cliente têm exemplos de uso da Linguagem de consulta do Google Ads em GoogleAdsService. A pasta operações básicas tem exemplos como GetCampaigns, GetKeywords e SearchForGoogleAdsFields.

Avançar
Gramática das consultas
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-30 UTC.