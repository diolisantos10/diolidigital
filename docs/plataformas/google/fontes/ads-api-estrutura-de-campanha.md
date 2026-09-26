---
titulo: "Google Ads API — campanhas (estrutura e tipos)"
url: https://developers.google.com/google-ads/api/docs/campaigns/overview?hl=pt-br
capturado_em: 2026-09-26
hash: 29aa5f5485ba59a8
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Campanhas

Uma campanha do Google Ads é um conjunto de um ou mais grupos de anúncios (anúncios, palavras-chave e lances) que compartilham um orçamento, uma segmentação por local e outras configurações. As campanhas são geralmente usadas para organizar categorias de produtos ou serviços que você oferece. As campanhas são a principal ferramenta de organização na sua conta do Google Ads.

Os itens que podem ser definidos no nível da campanha incluem lances, orçamento, idioma, local, distribuição para a Rede do Google e muito mais. Grandes anunciantes geralmente criam campanhas de anúncios separadas para exibir anúncios em locais diferentes ou com orçamentos diferentes.

Ao criar um Campaign, você precisa especificar campos principais como name, status (ENABLED ou PAUSED), advertising_channel_type, campaign_budget e uma estratégia de lances. Recomendamos usar nossas bibliotecas de cliente, mas você também pode modificar campanhas usando CampaignService.MutateCampaigns.

Tipos de campanha

No Google Ads, pense nesses conceitos em uma hierarquia:

Tipo de campanha: sua principal escolha e o modelo de toda a campanha.
Redes de publicidade: os lugares em que seus anúncios podem ser veiculados, determinados principalmente pelo tipo de campanha.
Controles de rede e canal: as configurações específicas que você pode usar para ajustar onde seus anúncios aparecem nessas redes. Os controles que você usa dependem do tipo de campanha.
Comece com o tipo de campanha

O tipo de campanha é a base dos seus esforços de publicidade. É a primeira decisão que você toma e que determina todo o resto, incluindo:

Que tipo de anúncios você pode criar (por exemplo, anúncios de texto, banners de imagem ou anúncios em vídeo).
Quais recursos e estratégias de lances estão disponíveis.

Exemplos de tipos de campanha incluem Pesquisa, Display, Performance Max e Geração de demanda.

Cada campanha segmenta um tipo de campanha, especificado na API Google Ads pelo campo advertising_channel_type no objeto Campaign.

A API Google Ads é compatível com os seguintes tipos de campanha:

Apenas na Rede de Display
Apenas na Rede de Pesquisa
Inclusão da Rede de Display na pesquisa
Campanhas para apps
Só para chamadas (descontinuado; não é mais possível criar anúncios só para chamadas, e os anúncios atuais só serão aceitos até fevereiro de 2027. Use anúncios responsivos de pesquisa com recursos de ligação)
Geração de demanda
Performance Max
Campanhas do Shopping
Serviços locais
Entenda as redes

As redes de publicidade são os conjuntos de sites, apps e propriedades em que seus anúncios podem ser veiculados. Os principais são:

Rede de pesquisa do Google:Pesquisa Google, Google Maps e sites de parceiros de pesquisa.
Rede de Display do Google:milhões de sites de terceiros, sites de notícias, blogs e Serviços do Google, como Gmail e YouTube, que mostram anúncios visuais.
Rede do YouTube:o próprio YouTube, incluindo o feed da página inicial, os resultados da pesquisa, os vídeos e os Shorts.

Cada tipo de campanha foi criado para veicular anúncios em redes específicas. Por exemplo, uma campanha de pesquisa é criada principalmente para a rede de pesquisa.

Controlar canais

A forma de controlar quais redes sua campanha usa varia muito de acordo com o tipo de campanha escolhido. Confira em detalhes:

Exemplo de tipo de campanha	Como controlar onde os anúncios aparecem	Explicação
Pesquisa	Usos network_settings	Esse é o modelo padrão. Use o campo network_settings para incluir ou excluir explicitamente os parceiros de pesquisa do Google e a Rede de Display do Google da sua campanha de pesquisa.
Performance Max (PMax)	Sem controle manual	A PMax foi criada para maximizar o alcance e a automação. Ela veicula automaticamente seus anúncios em todas as redes do Google (por exemplo, Pesquisa, Display e YouTube) para encontrar conversões. Não é possível desativar redes específicas.
Geração de demanda	Usa controles de canal	Esse tipo de campanha usa DemandGenChannelControls em vez de configurações de rede amplas, permitindo que você ative ou desative canais de inventário específicos, incluindo o Google Maps pelo selected_channels.maps a partir de v24.
Em resumo: uma analogia

Pense na configuração da campanha como a escolha de um veículo:

Tipo de campanha = O veículo que você compra (por exemplo, um carro urbano, um caminhão off-road ou um ônibus autônomo).
Redes = o terreno para o qual o veículo foi projetado (por exemplo, vias urbanas pavimentadas, trilhas de montanha acidentadas ou todas as opções acima).
Controles de rede e canal = os recursos específicos que você pode ajustar:
Uma campanha de pesquisa (carro urbano) permite usar network_settings para escolher se você também quer dirigir em vias suburbanas (parceiros de pesquisa).
Uma campanha Performance Max (ônibus autônomo) lida com a navegação automaticamente em todas as redes para alcançar sua meta.
Uma campanha Geração de demanda (caminhão off-road) oferece DemandGenChannelControls dedicados para selecionar plataformas específicas no ambiente dela.
Diferenças em relação à IU do Google Ads

A API Google Ads tem limitações para gerenciar campanhas legadas e de vídeo.

Para campanhas de vídeo, você pode usar a API Google Ads para ler dados. Você pode extrair relatórios de performance (cliques, visualizações, custo) de todas as campanhas de vídeo usando a API Google Ads.

Para alguns tipos específicos de campanhas de vídeo, não é possível gravar mudanças com a API Google Ads. Não é possível usar a API para fazer mudanças como pausar, ativar, alterar a segmentação ou adicionar novos anúncios. Essas campanhas precisam ser editadas na interface da Web do Google Ads.

Prática recomendada: para criar e gerenciar anúncios em vídeo no YouTube usando a API, use campanhas Performance Max ou Geração de demanda. Eles são totalmente compatíveis com relatórios e gerenciamento.

O objetivo da interface do Google Ads ("Vendas", "Leads") é um assistente de configuração. Ele pede sua meta e sugere e preenche automaticamente as melhores configurações para você, como o tipo de campanha, a estratégia de lances e muito mais.

A API Google Ads oferece os elementos básicos para campanhas. Não há um campo "objetivo" único porque a API oferece controle direto sobre cada configuração. Você alcança seu objetivo montando os blocos de construção certos:

Escolha um tipo de campanha:defina advertising_channel_type como SEARCH ou PERFORMANCE_MAX.
Escolha uma estratégia de lances:defina o campo maximize_conversion_value na união campaign_bidding_strategy ou anexe um portfólio bidding_strategy com um valor target_roas.
Defina metas de conversão:configure a campanha para otimizar suas PURCHASE ações de conversão.

Os tipos de campanha são representados na API Google Ads pelo campo advertising_channel_type. Defina advertising_channel_type para todas as campanhas. Em seguida, confira os guias de integração da campanha específica que você está criando (como Performance Max para metas de viagem ou Geração de Demanda) para saber se ela também exige a configuração de advertising_channel_sub_type.

Se você quiser criar essa campanha...	Defina advertising_channel_type como...	E defina advertising_channel_sub_type como...
Uma campanha de pesquisa padrão	SEARCH	(Não definir / Deixar em branco)
Uma campanha padrão de display	DISPLAY	(Não definir / Deixar em branco)
Uma campanha Performance Max padrão	PERFORMANCE_MAX	(Não definir / Deixar em branco)
Uma campanha Performance Max para metas de turismo	PERFORMANCE_MAX	TRAVEL_GOALS
Uma campanha Geração de demanda	DEMAND_GEN	(Não definir / Deixar em branco)
Subtipos de campanha

Os subtipos de campanha na interface do Google Ads, como Padrão e Todos os recursos, ajudam os usuários da interface a encontrar opções de campanha relevantes, mas não há um mapeamento direto entre a coluna Subtipo de campanha da interface e os campos advertising_channel_type e advertising_channel_sub_type no objeto Campaign. Por exemplo, uma campanha de pesquisa criada com a API Google Ads é sempre tratada como uma campanha de Todos os recursos na interface.

Orçamento da campanha, estratégias de lances e segmentação

Na API Google Ads, gerenciar uma campanha significa responder a três perguntas fundamentais que controlam como e onde seus anúncios aparecem:

Quanto posso gastar? (Orçamento da campanha)

Esse é o limite financeiro da sua campanha. Na API, você cria um objeto CampaignBudget separado com um limite de gastos (em micros) e anexa o nome do recurso à sua campanha. Um orçamento diário médio também pode ser compartilhado entre várias campanhas.

Como o Google deve gastar meu dinheiro? (Estratégia de lances)

Isso informa ao Google qual é sua meta principal de otimização. Você escolhe uma estratégia de lances com base no que quer alcançar:
Para tráfego: use TargetSpend (Maximizar cliques).
Para leads ou inscrições: use MaximizeConversions com um target_cpa_micros opcional.
Para vendas de e-commerce: use MaximizeConversionValue com um target_roas opcional.

Quem deve ver meus anúncios? (Público-alvo)

É aqui que você define seu mercado. Você adiciona objetos CampaignCriterion ou AdGroupCriterion para restringir seu alcance às pessoas certas. A segmentação pode ser baseada em:
Palavras-chave: o que os usuários estão pesquisando.
Locais: onde os usuários estão.
Informações demográficas: idade, gênero, renda familiar ou status parental.
Públicos-alvo: comportamento anterior (por exemplo, visitantes do site) ou interesses.
Como pensar nas campanhas

Ao gerenciar ou criar campanhas com a API Google Ads, é útil entender a estrutura e os modelos que regem como as campanhas, os anúncios e os recursos são organizados e veiculados. Há três modelos principais: grupo de anúncios e modelo de anúncio, grupo de recursos e modelo de recurso, além de um modelo híbrido de grupos de anúncios e anúncios com recursos. Esses modelos dependem do AdvertisingChannelType escolhido.

Estruturas de campanha da API Google Ads
Estrutura	Exemplo de uso (AdvertisingChannelType)	Como funciona	CONCEITO PRINCIPAL
Estrutura do grupo de anúncios	SEARCH, padrão DISPLAY	A campanha é organizada em recursos AdGroup. Cada grupo de anúncios contém um conjunto de anúncios finalizados e um conjunto de critérios de segmentação (por exemplo, palavras-chave e públicos-alvo).	A vinculação entre anúncios criados manualmente e a segmentação deles é controlada de perto no grupo de anúncios.
Estrutura do grupo de recursos	PERFORMANCE_MAX	Em vez de grupos de anúncios, você cria recursos AssetGroup. Cada grupo de recursos contém um conjunto de recursos criativos brutos (títulos, imagens, vídeos) e indicadores de público-alvo.	Você fornece os componentes criativos, e a IA do Google monta os anúncios finais em tempo real para otimizá-los em todos os canais.
Estrutura híbrida	DEMAND_GEN, DISPLAY	Isso envolve uma estrutura padrão de grupo de anúncios com recursos modernos (como sitelinks ou frases de destaque) vinculados no nível da campanha ou do grupo de anúncios.	O anúncio principal é estruturado no nível do grupo de anúncios, e você fornece recursos extras intercambiáveis para serem mostrados com ele.
Avançar
Criar campanhas
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-24 UTC.