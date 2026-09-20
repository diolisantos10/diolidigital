---
titulo: "Permissions Reference — todas as permissões da Graph API e o nível exigido"
url: https://developers.facebook.com/docs/permissions
capturado_em: 2026-09-20
hash: 2b067d08edc1b63a
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Esta página foi traduzida do inglês para outro idioma usando IA. O conteúdo traduzido por IA pode conter erros, omissões ou divergências de sentido. Como a tradução automática pode ser imprecisa ou pouco clara, consulte o conteúdo original em inglês desta página para validar as orientações corretas.
Isso foi útil?
Referência de permissões para APIs de tecnologias da Meta
Updated: 5 de dez de 2025
Copiar para LLM
Ver como Markdown
As permissões são uma forma de autorização granular da Graph API concedida pelo usuário do app. Para que o app possa usar um ponto de extremidade de API e acessar os dados de um usuário, primeiro é preciso que o usuário conceda todas as permissões exigidas pelo ponto de extremidade.
Selecione apenas as permissões necessárias para o funcionamento desejado do app. A seleção de permissões desnecessárias é um motivo comum de rejeição durante a análise do app.
As permissões também podem ser usadas para solicitar insights de análise a fim de melhorar o app. Além disso, elas podem ser usadas para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Requisitos
Análise do App da Meta: para apps que precisam de acesso a dados que não são seus ou que você não gerencia
Verificação da empresa: é necessária para todos os apps que solicitam Advanced Access
Caso o app solicite permissão para usar um ponto de extremidade e acessar os dados de um usuário, talvez seja necessário responder às perguntas sobre o tratamento de dados.
Também pode ser necessário fazer um Checkup de Uso de Dados anual.
Maneiras de pedir permissão
Ao entrar no seu app, os usuários recebem uma solicitação para conceder as permissões de que o app precisa. Os usuários do app poderão conceder ou negar as permissões solicitadas ou qualquer subconjunto delas.
Login do Facebook
Login do Facebook para Empresas
API do Instagram com Login do Facebook para Empresas
API do Instagram com Login do Instagram para Empresas
Gerenciador de Negócios da Meta
Se o app não usar uma permissão por 90 dias (o que normalmente ocorre devido à inatividade do usuário), o usuário precisará concedê-la novamente.
Remover uma permissão
Você pode usar o Painel de Apps da Meta para remover uma permissão que o app não usa mais ou que está obsoleta.
A
Permissão	Descrição e uso permitido	O que incluir no envio para a análise do app

ads_management

Dependências
pages_read_engagement
pages_show_list
	
Com a permissão ads_management, seu aplicativo pode ler e gerenciar a conta de anúncios que possui ou à qual teve ou que tenha recebido acesso pelo proprietário da conta de anúncios.
Essa permissão pode ser usada para criar campanhas de forma programática, gerenciar anúncios ou buscar métricas de anúncio para ajudar nos negócios. Além disso, também pode ser usada para criar ferramentas de gerenciamento que forneçam soluções inovadoras e valores diferenciados para os anunciantes.

Uso permitido
Programar a criação de campanhas, o gerenciamento de anúncios e a busca por métricas.
Criar ferramentas de gerenciamento de anúncios que forneçam soluções inovadoras e valor diferenciado para os anunciantes.
	
Forneça exemplos específicos do porquê seu app precisa gerenciar anúncios em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como uma empresa pode acessar dados de desempenho de anúncios na plataforma do app depois de conceder a permissão.
Mostre que os dados de desempenho dos anúncios (como impressões, conversões, gastos, cliques e alcance) são exibidos na plataforma do app.

ads_read

Dependências
Nenhum
	
Com a permissão ads_read, seu app pode acessar a API de Insights sobre Anúncios para extrair informações de relatório de anúncios de contas de anúncios que você possui ou para as quais recebeu acesso pelo proprietário ou proprietários de outras contas de anúncios por meio dessa permissão. Essas permissões também concedem ao app o acesso à API do lado do servidor para que os anunciantes possam enviar eventos da web diretamente dos respectivos servidores para o Facebook.

Uso permitido
Fornecer à API acesso aos dados de desempenho de seu anúncio para utilização em análises de dados e painéis personalizados.
Enviar eventos da web do seu servidor diretamente para o Facebook.
	
Forneça exemplos específicos do porquê seu app precisa acessar anúncios e estatísticas relacionadas em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como uma empresa pode acessar dados de desempenho de anúncios na plataforma do app depois de conceder a permissão.
Mostre que os dados de desempenho dos anúncios (como impressões, conversões, gastos, cliques e alcance) são exibidos na plataforma do app.

attribution_read

Dependências
Nenhum
	
Com a permissão attribution_read, seu aplicativo pode acessar a API de Atribuição para extrair dados do relatório de atribuição das linhas de negócios que você possui ou às quais tenha recebido acesso pelo proprietário ou proprietários de outras linhas de negócios.

Uso permitido
Permite que o seu aplicativo acesse dados de desempenho dos anúncios da Atribuição para uso em análises de dados e painéis personalizados.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
B
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

business_management

Dependências
pages_read_engagement
pages_show_list
	
Com a permissão business_management, seu aplicativo pode ler e escrever com a API do Gerenciador de Negócios.
Essa permissão pode ser usada para gerenciar ativos comerciais, como uma conta de anúncios, e para reivindicar contas de anúncios.

Uso permitido
Gerenciar ativos comerciais, como uma conta de anúncios.
Reivindicar contas de anúncios.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa gerenciar ativos comerciais em nome de outras empresas. Caso a permissão seja solicitada como dependência de uma permissão principal, incluindo pages_messaging ou pages_show_list, especifique a permissão principal na descrição do caso de uso.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como uma empresa pode acessar dados de desempenho de anúncios na plataforma do app depois de conceder a permissão.
Mostre que os dados de desempenho dos anúncios (como impressões, conversões, gastos, cliques e alcance) são exibidos na plataforma do app.
C
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

catalog_management

Dependências
business_management
	
Com a permissão catalog_management, seu aplicativo pode criar, ler, atualizar e excluir catálogos de produtos da empresa dos quais o usuário é administrador.
Essa permissão pode ser usada para criar soluções relacionadas ao comércio para plataformas de comércio eletrônico, plataformas de viagem e anúncios dinâmicos. Ela também pode ser usada para criar soluções de gerenciamento de tipo de inventário, como inventário de produtos, de hotel ou de automóveis.
Uso permitido
Criar soluções relacionadas ao comércio, como plataformas de comércio eletrônico, plataformas de viagem e anúncios dinâmicos.
Criar soluções de gerenciamento de tipo de inventário, como inventário de produtos, de hotel ou de automóveis.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa gerenciar catálogos de produtos de empresas cujo acesso é concedido a você.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app cria, atualiza e exclui um catálogo de produtos na plataforma do app.

commerce_account_manage_orders
	
Com a permissão commerce_account manage_orders, seu aplicativo pode ler e atualizar os pedidos da conta de comércio.
Uso permitido
Ler e atualizar os pedidos na sua conta de comércio.
Os provedores de tecnologia gerenciam pedidos em nome dos seus clientes.
Acessar as notificações de webhook.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

commerce_account_read_orders
	
Com a permissão commerce_account_read_orders, seu aplicativo pode ler os pedidos da conta de comércio.
Uso permitido
Ler os pedidos na sua conta de comércio.
Usar o endereço de email do comprador para fins de publicidade somente se um comprador tiver consentido com o recebimento de emails de marketing na finalização da compra.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

commerce_account_read_reports
	
Com a permissão commerce_account_read_reports, seu aplicativo pode ler os dados de relatórios financeiros para gerar relatórios personalizados de impostos, de reembolso e de reconciliação para sua conta de comércio.
Uso permitido
Ler os dados de relatórios financeiros na sua conta de comércio para gerar relatórios personalizados de reembolso, assim como de reconciliação de impostos e caixa.
Os provedores de tecnologia podem gerar relatórios financeiros em nome dos clientes deles.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

commerce_account_read_settings
	
Com a permissão commerce_account_read_settings, seu aplicativo pode ler as configurações da conta de comércio.
Uso permitido
Ler dados básicos da conta de comércio, como canais conectados, opções de envio, localizações de atendimento e empresas conectadas, entre outros.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

commerce_manage_accounts
	
Com a permissão commerce_manage_accounts, seu aplicativo pode criar e gerenciar contas de comércio, como um aplicativo de comércio eletrônico.
Uso permitido
Associar seu aplicativo à sua conta de comércio.
Os provedores de tecnologia criam uma conta de comércio em nome dos respectivos clientes.
Os provedores de tecnologia ativam um novo canal de vendas dentro da conta de comércio dos respectivos clientes.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
E
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

email
	
Com a permissão email, seu app pode ler o endereço de email principal de uma pessoa.
Uso permitido
Comunicar-se com as pessoas e permitir que elas entrem no seu aplicativo com o endereço de email associado ao perfil do Facebook delas.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
F
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

facebook_branded_content_ads_brand

Dependências
pages_read_engagement
pages_show_list
	
A permissão facebook_branded_content_ads_brand possibilita que um app leia os posts do Facebook em que o perfil do usuário do app no Facebook foi marcado como parceiro pago e possibilita que um usuário do app leia, solicite e revogue permissões para veicular anúncios em parceria.
O uso permitido dessa funcionalidade possibilita que uma empresa leia publicações do Facebook nas quais a conta foi marcada como parceiro pago e gerencie permissões para veicular anúncios em parceria sem a necessidade de uma publicação pré-existente.
Uso permitido
Permitir que uma empresa leia os posts do Facebook em que a conta foi marcada como um parceiro pago
Gerenciar permissões para veicular anúncios em parceria sem a necessidade de uma publicação pré-existente
	
Descrição do caso de uso
Forneça exemplos específicos de por que seu app requer acesso para gerenciar campanhas de anúncios de conteúdo de marca e acessar dados relacionados a anúncios de conteúdo de marca em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook para Empresas na plataforma do seu app, mostrando como o usuário do seu app concede a ele essa permissão.
Demonstre como o usuário do app seleciona um post de conteúdo de marca e o promove como um anúncio na plataforma do app.

facebook_creator_marketplace_discovery

Dependências
pages_show_list
	
Com a permissão facebook_creator_marketplace_discovery, um app pode descobrir criadores de conteúdo na plataforma Descoberta de Criadores do Facebook.
O uso permitido dessa permissão é para empresas do Facebook acessarem dados de insights de criadores do Facebook qualificados, a fim de descobri-los e avaliá-los para campanhas de marca, além de dar crédito e pagar aos criadores de conteúdo pela presença deles no Facebook.
Uso permitido
Acessar dados de insights de criadores do Facebook qualificados, a fim de descobri-los e avaliá-los para campanhas de marca
Para dar crédito e pagar aos criadores de conteúdo pela presença deles no Facebook
	
Descrição do caso de uso
Forneça exemplos específicos de por que seu app requer o gerenciamento da descoberta de criadores do Facebook em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como procurar Criadores na plataforma Descoberta de Criadores do Facebook e destaque como acessar insights sobre os Criadores como bio do criador, contagem de seguidores e alcance da conta.
Demonstre como você pretende usar os dados dos insights que você obteve de acordo com os propósitos permitidos e mostrando conformidade com todos os usos aplicáveis e as políticas de privacidade.
G
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

gaming_user_locale

Dependências
gaming_profile
	
A permissão gaming_user_locale permite que seu app obtenha o idioma de preferência de um usuário enquanto ele joga no Facebook (por exemplo, Jogos Instantâneos ou Jogos na Nuvem).
O uso permitido serve para exibir uma interface de jogo no idioma de preferência do usuário.

Uso permitido
Exiba uma interface de jogo no idioma preferido do usuário.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
I
Permissão	Descrição e uso permitido	O que incluir no envio para a análise do app

instagram_basic

Dependências
pages_read_user_content
pages_show_list
	
Com a permissão instagram_basic, seu app pode ler conteúdo de mídia e informações do perfil de uma conta do Instagram.
Seu uso permitido é obter metadados básicos do perfil de uma conta do Instagram para Empresas, por exemplo, nome de usuário e ID.
Uso permitido
Obter metadados básicos de um perfil da conta do Instagram para Empresas, por exemplo, nome de usuário e identificação.
	
Descrição do caso de uso
Inclua quais informações de perfil da conta profissional do Instagram são exigidas pelo seu caso de uso. Descreva onde essas informações podem ser encontradas na sua solução.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app e seleciona a conta do Instagram.

instagram_branded_content_ads_brand

Dependências
instagram_basic
pages_read_engagement
pages_show_list

	
Com a permissão instagram_branded_content_ads_brand, um app pode ler posts do Instagram nos quais a conta do Instagram do usuário do app foi marcada como parceiro pago. Além disso, um usuário do app pode ler, solicitar e revogar permissões para veicular anúncios em parceria.
O uso permitido dessa funcionalidade possibilita que uma empresa leia publicações do Instagram nas quais a conta foi marcada como parceiro pago e gerencie permissões para veicular anúncios em parceria sem a necessidade de uma publicação pré-existente.
Uso permitido
Ler publicações do Instagram nas quais a conta foi marcada como parceiro pago
Gerenciar permissões para veicular anúncios em parceria sem a necessidade de uma publicação pré-existente
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa de acesso para gerenciar campanhas de anúncios de conteúdo de marca no Instagram e acessar dados relacionados em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app seleciona um post de conteúdo de marca e o promove como um anúncio na plataforma do app.

instagram_branded_content_brand

Dependências
instagram_basic
pages_read_engagement
pages_show_list

	
Com a permissão instagram_branded_content_brand, seu aplicativo pode adicionar, remover e visualizar nomes da lista de criadores de conteúdo aprovados de uma marca específica.
O uso permitido é gerenciar as configurações de criadores de conteúdo do Instagram de uma marca específica.
Uso permitido
Gerencie as configurações de criadores de conteúdo da marca na conta de uma empresa no Instagram.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa de acesso para gerenciar campanhas de anúncios de conteúdo de marca no Instagram e acessar dados relacionados em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do seu app adiciona, remove e visualiza criadores de conteúdo da lista de criadores de conteúdo aprovados de uma marca na plataforma do app.

instagram_branded_content_creator

Dependências
instagram_basic
pages_read_engagement
pages_show_list

	
A permissão instagram_branded_content_creator possibilita que seu aplicativo leia e altere o status do turbinamento de determinado conteúdo.
Seu uso é permitido para gerenciar as configurações de criadores de conteúdo do Instagram.
Uso permitido
Ler publicações do Instagram nas quais a conta foi marcada como parceiro pago
Gerenciar permissões para veicular anúncios em parceria sem a necessidade de uma publicação pré-existente
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa de acesso para gerenciar campanhas de anúncios de conteúdo de marca no Instagram e acessar dados relacionados em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app seleciona um post de conteúdo de marca e o promove como um anúncio na plataforma do app.

instagram_business_basic

Dependências
Nenhum
	
Com a permissão instagram_business_basic, seu app pode ler conteúdo de mídia e informações do perfil de uma conta do Instagram para Empresas.
Seu uso permitido é obter metadados básicos do perfil de uma conta do Instagram para Empresas, por exemplo, nome de usuário e ID.
Uso permitido
Obter metadados básicos do perfil de uma conta do Instagram para Empresas
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_business_basic para acessar metadados básicos dos perfis de contas empresariais do Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Instagram na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o acesso aos metadados básicos (como o nome de usuário e a identificação) de um perfil da conta comercial do Instagram na plataforma do app.

instagram_business_content_publish

Dependências
instagram_business_basic

	
Com a permissão instagram_business_content_publish, um app pode criar publicações de foto e vídeo de feed orgânicas em nome de um usuário comercial.
O uso permitido dessa autorização possibilita que um app gerencie o processo de criação de conteúdo orgânico para o Instagram (por exemplo, publicar fotos e vídeos) em nome de uma conta empresarial do Instagram.
Uso permitido
Gerencie o processo de criação de conteúdo orgânico para o Instagram (por exemplo, publicar fotos e vídeos) em nome de uma conta empresarial do Instagram.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_business_content_publish para criar e publicar posts de vídeo ou foto orgânicos em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Instagram na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como criar um post orgânico com foto no feed em nome de um usuário comercial.
Mostre como adicionar uma legenda, hashtags e outros metadados e postar no feed do Instagram do usuário comercial.

instagram_business_manage_comments

Dependências
instagram_business_basic

	
Com a permissão instagram_business_content_publish, um app pode criar publicações de foto e vídeo de feed orgânicas em nome de um usuário comercial.
O uso permitido dessa autorização possibilita que um app gerencie o processo de criação de conteúdo orgânico para o Instagram (por exemplo, publicar fotos e vídeos) em nome de uma conta empresarial do Instagram.
Uso permitido
Gerencie o processo de criação de conteúdo orgânico para o Instagram (por exemplo, publicar fotos e vídeos) em nome de uma conta empresarial do Instagram.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_business_manage_comments para gerenciar comentários no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Instagram na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como criar um comentário, atualizar um comentário existente e excluir um comentário.
Mostre como isso aparece tanto no seu app quanto no app nativo do Instagram.

instagram_business_manage_messages

Dependências
instagram_business_basic

	
A permissão instagram_business_manage_messages possibilita que um app acesse as mensagens em uma conta profissional do Instagram.
O uso permitido dessa autorização permite visualizar mensagens, gerenciá-las e responder a elas, além de usar ferramentas de CRM (gestão do relacionamento com o cliente) de terceiros para o seu gerenciamento.
Uso permitido
Ver mensagens, gerenciá-las e responder a elas
Use ferramentas de CRM (gestão do relacionamento com o cliente) de terceiros para gerenciar suas mensagens.
	
Descrição do caso de uso
Explique a funcionalidade de mensagens que seu app oferece aos clientes empresariais que estão integrados à plataforma e descreva como eles executam essas funções.
Requisitos do screencast
Demonstre o processo completo de login do Instagram na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre seu app enviando uma mensagem a um usuário do Instagram e a caixa de entrada do Instagram do cliente (seja na web ou no app para celular) recebendo e exibindo a mensagem enviada.
Demonstre como gerar uma solicitação de cURL que você possa integrar à plataforma do app para enviar uma mensagem. Para isso, você pode usar o Auxiliar de Integração da API no Painel de Apps da Meta > Instagram.

instagram_creator_marketplace_discovery

Dependências

business_management
instagram_basic
pages_manage_metadata
pages_show_list
	
Com a permissão instagram_creator_marketplace_discovery, seu app pode descobrir criadores de conteúdo no marketplace de criadores de conteúdo do Instagram e acessar informações como bio do criador, contagem de seguidores e alcance da conta de empresas no Instagram integradas à plataforma.
O uso permitido dessa permissão é para empresas do Instagram integradas ao marketplace de criadores de conteúdo recuperarem dados de insights de criadores do Instagram qualificados, como bio do criador, contagem de seguidores e alcance da conta.
Uso permitido
Recupere dados de insights para criadores de conteúdo qualificados do Instagram, como bio, contagem de seguidores e alcance da conta.
	
Descrição do caso de uso
Forneça exemplos específicos de por que seu app requer o gerenciamento de instagram_creator_marketplace_discovery em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como procurar Criadores no Marketplace de Criadores do Instagram e destaque como acessar insights sobre os Criadores como bio do criador, contagem de seguidores e alcance da conta.

instagram_creator_marketplace_messaging

Dependências

instagram_basic
pages_read_user_content
pages_show_list
	
Com a permissão instagram_creator_marketplace_messaging, o app pode obter as conversas de parceria de uma marca e a identificação de mensagens de um criador de conteúdo usada para mensagens de parceria.
O uso permitido dessa permissão é que as marcas no marketplace de criadores de conteúdo do Instagram enviem mensagens de parceria paga aos criadores de conteúdo.
Uso permitido
Permite que marcas no marketplace de criadores de conteúdo do Instagram enviem mensagens de parceria paga aos criadores.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa gerenciar mensagens do marketplace de criadores de conteúdo do Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook para Empresas na plataforma do seu app, mostrando como o usuário do seu app concede a ele essa permissão.
Demonstre como recuperar mensagens e conversas de parceria.

instagram_content_publish

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissão instagram_content_publish, seu aplicativo pode criar publicações de foto e vídeo de feed orgânico em nome de um usuário comercial.
O uso permitido serve para gerenciar o processo de criação de conteúdo orgânico do Instagram. Por exemplo, publicar fotos ou vídeos no feed principal em nome de uma empresa.
Uso permitido
Gerenciamento do processo de criação de conteúdo orgânico do Instagram (por exemplo, publicar fotos e vídeos no feed principal) em nome de uma empresa.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_content_publish para criar e publicar posts de vídeo ou foto orgânicos no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como criar um post com foto e publicá-lo no feed do Instagram do usuário comercial.

instagram_manage_comments

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissão instagram_manage_comments, seu aplicativo pode criar, excluir e ocultar comentários em nome da conta do Instagram vinculada a uma página. Seu aplicativo também pode ler e responder a mídias públicas e comentários em que uma empresa tenha sido mencionada ou marcada em uma foto.
O uso permitido para essa permissão é ler, atualizar e excluir comentários de contas empresariais do Instagram.
Uso permitido
Ler, atualizar e excluir comentários de contas do Instagram para Empresas.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_content_publish para criar e publicar posts de vídeo ou foto orgânicos no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como criar um post com foto e publicá-lo no feed do Instagram do usuário comercial.

instagram_manage_contents

Dependências
instagram_basic

	
Com a permissão instagram_manage_contents, seu app pode excluir posts em nome de uma conta do Instagram vinculada a uma Página do Facebook.
O uso permitido para essa permissão é possibilitar que um usuário do app exclua um post, story ou reel do Instagram.
Uso permitido
Excluir um post, story ou reel do Instagram.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_manage_contents para excluir a mídia do Instagram de um usuário do app.
Requisitos do screencast
Demonstre o processo completo de Login do Facebook para Empresas na plataforma do app, mostrando como uma empresa concede ao seu app a permissão instagram_manage_contents.
Demonstre como excluir mídias do feed do Instagram de um usuário empresarial.

instagram_manage_engagement

Dependências

instagram_basic
pages_read_user_content
pages_show_list
	
Com a permissão instagram_manage_engagement, o app pode publicar ou excluir uma "Curtida" em objetos de mídia, feed ou reels do Instagram, bem como em objetos de comentário ou resposta, em nome de uma conta do Instagram vinculada a uma Página do Facebook.
O uso permitido serve para possibilitar que um usuário do app publique ou exclua uma "Curtida" em objetos de mídia, feed ou reels do Instagram, bem como em objetos de comentário ou resposta.
Uso permitido
Publique ou exclua uma "Curtida" em objetos de mídia, feed ou reels do Instagram
Publique ou exclua uma "Curtida" em objetos de comentário, comentário ou resposta do Instagram
	
Descrição do caso de uso
Forneça exemplos específicos do motivo pelo qual seu app precisa da permissão instagram_manage_engagement para publicar ou excluir a "Curtida" de um usuário do app em objetos de mídia do Instagram (Feed, Reels) e objetos de comentário do Instagram (Comentário, Resposta).
Requisitos do screencast
Demonstre o processo completo de login do Facebook para Empresas na plataforma do seu app, mostrando como uma empresa concede ao seu app a permissão instagram_manage_engagement.
Demonstre como publicar ou excluir uma mídia de "curtida" do Instagram do feed do usuário comercial.
Demonstre como publicar ou excluir uma "Curtida" em objetos de comentário do Instagram.

instagram_manage_events

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
A permissão instagram_manage_events possibilita uma permissão de app para registrar eventos (por exemplo, comprar, adicionar ao carrinho, cadastros) em nome de contas do Instagram gerenciadas pelos usuários do app.
O uso permitido para tanto possibilita registrar eventos em contas do Instagram e enviar esses dados de atividade à Meta para o direcionamento, a otimização e a denúncia de anúncios; e para fornecer informações de análise sobre marketing e publicidade.
Uso permitido
Registrar eventos em contas do Instagram e enviar esses dados de atividade à Meta para o direcionamento, a otimização e a denúncia de anúncios
Fornecer informações de análise sobre marketing e publicidade
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_manage_upcoming_events para gerenciar eventos futuros no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como recuperar a lista de eventos futuros e visualizar detalhes dos eventos.
Crie um evento e demonstre como adicionar detalhes (como título, data, hora e localização).

instagram_manage_insights

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissão instagram_manage_insights, seu aplicativo pode obter acesso a informações da conta do Instagram vinculada a uma Página do Facebook. Seu aplicativo também pode descobrir e ler as informações de perfil e a mídia de outros perfis comerciais.
O uso dessa permissão é concedido para obter metadados, e informações de dados e de story de uma conta do Instagram para Empresas.
Uso permitido
Obter metadados de uma conta do Instagram para Empresas.
Obter informações de dados de uma conta do Instagram para Empresas.
Obter informações de story de uma conta do Instagram para Empresas.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_manage_insights para oferecer insights sobre o desempenho no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como acessar insights sobre metadados, publicações, fotos e vídeos da conta profissional do usuário do app no Instagram.
Demonstre como acessar insights sobre metadados e mídia do perfil público de uma conta profissional do Instagram em nome da conta profissional do Instagram do usuário do app.

instagram_manage_messages

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissão instagram_manage_messages, os usuários comerciais podem ler e responder mensagens do Instagram Direct.
O uso dessa permissão é concedido para uma empresa recuperar conversas e mensagens da caixa de entrada do Instagram Direct, gerenciar mensagens com clientes ou usar ferramentas de CRM (gestão do relacionamento com o cliente) de terceiros para gerenciar a caixa de entrada do Instagram Direct.
Uso permitido
Empresas que desejam recuperar conversas e mensagens de suas caixas de entrada do Direct.
Empresas que desejam gerenciar mensagens com seus clientes.
Empresas que desejam usar ferramentas de CRM (gestão do relacionamento com o cliente) de terceiros para gerenciar suas caixas de entrada do Instagram Direct.
	
Descrição do caso de uso
Explique a funcionalidade de mensagens que seu app oferece aos clientes empresariais que estão integrados à plataforma e descreva como eles executam essas funções.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre seu app enviando uma mensagem a um usuário do Instagram e a caixa de entrada do Instagram do cliente (seja na web ou no app para celular) recebendo e exibindo a mensagem enviada.
Gere uma solicitação de cURL que você possa integrar à plataforma do app para enviar uma mensagem. Para isso, você pode usar o Auxiliar de Integração da API no Painel de Apps da Meta > Instagram.
Certifique-se de compartilhar uma gravação da mensagem sendo enviada do app para o usuário, em vez de capturas de tela das mensagens recebidas na caixa de entrada do Instagram do cliente.

instagram_shopping_tag_products

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissão instagram_shopping_tag_products, um aplicativo pode marcar mídias do Instagram com etiquetas de produto e fazer uma apelação contra rejeições de produtos.
O uso permitido dessa funcionalidade é verificar a qualificação para a marcação de produto, obter catálogos e produtos, marcar mídias com etiquetas de produtos, gerenciar marcações existentes e fazer apelações contra rejeições de produtos.
Uso permitido
Verificar a qualificação para marcação de produtos
Obter catálogos e produtos
Marcar mídia com etiquetas de produto
Gerenciar marcações de produtos existentes
Fazer uma apelação de rejeição de produtos
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_shopping_tag_products para marcar etiquetas de produto em mídias do Instagram e gerenciar o catálogo de produtos em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como recuperar a lista de catálogos e produtos disponíveis e selecionar um deles.
Marque uma etiqueta de produto em um item de mídia

instagram_manage_upcoming_events

Dependências
instagram_basic
pages_read_engagement
pages_show_list
	
Com a permissãoinstagram_manage_upcoming_events, um app pode ler, criar e atualizar eventos futuros em nome de contas do Instagram gerenciadas por pessoas usando o app.
O uso permitido dessa autorização possibilita o gerenciamento de eventos futuros em contas do Instagram gerenciadas pelas pessoas que usam o app.
Uso permitido
Gerenciar eventos futuros em contas do Instagram administradas pelas pessoas que usam o app
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão instagram_manage_upcoming_events para gerenciar eventos futuros no Instagram em nome de outras empresas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como recuperar a lista de eventos futuros e visualizar detalhes dos eventos.
Crie um evento e demonstre como adicionar detalhes (como título, data, hora e localização).
G
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

leads_retrieval

Dependências
Ads Management Standard Access
ads_management
ads_read
business_management
pages_manage_ads
pages_read_engagement
pages_show_list
	
Com a permissão leads_retrieval, seu aplicativo pode recuperar e ler todas as informações capturadas por um formulário de anúncio de cadastro associado a um anúncio criado no Gerenciador de Anúncios ou na API de Marketing.
O uso dessa permissão é concedido para contatar as pessoas que preencheram seu formulário de anúncio de cadastro solicitando mais informações. Essa permissão também pode ser usada pelas plataformas de CRM autorizadas pelos anunciantes para extrair dados de cadastros em nome dos anunciantes.
Uso permitido
Contatar as pessoas que preencheram seu formulário de anúncio de cadastro solicitando mais informações. Por exemplo, uma concessionária entra em contato com um cliente em potencial (cadastro) que respondeu ao anúncio dela com cotações para um carro.
Para plataformas de CRM autorizadas pelos anunciantes extraírem dados de cadastros em nome dos anunciantes. Esses anunciantes podem usar as informações do cadastro para entrar em contato com o usuário.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa acessar leads das Páginas cujo acesso é concedido a você.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
M
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

manage_app_solutions
	
Com a permissão manage_app_solution, seu app pode obter uma lista de apps que um usuário pode gerenciar e fazer chamadas de API em nome desses apps.
O uso autorizado para essa permissão possibilita que uma empresa crie e gerencie soluções de parceiros entre Provedores de Tecnologia e Parceiros de Solução.
Uso permitido
Permitir que uma empresa crie e gerencie soluções de parceiros entre Provedores de Tecnologia e Parceiros de Solução
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

manage_fundraisers
	
A permissão manage_fundraisers possibilita que um aplicativo crie, atualize e leia uma campanha de arrecadação de fundos e as respectivas doações em nome de um usuário.
Uso permitido
Ajude os criadores de campanha de arrecadação de fundos a aumentar o alcance no Facebook.
Sincronize o valor arrecadado exibido no site da campanha e na campanha vinculada do Facebook.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

marketing_messages_messenger

Dependências

ads_management
pages_messaging
	
Com a permissão marketing_messages_messenger, um app pode criar, gerenciar e enviar mensagens de marketing pagas no Messenger e ver o desempenho das campanhas dessas mensagens de marketing em nome do usuário do app usando as Contas de anúncios autorizadas dele.
O uso permitido para essa permissão é possibilitar que um usuário do app envie mensagens de marketing pagas no Messenger a pessoas que optaram por receber avisos e mensagens promocionais de determinadas Páginas do Facebook gerenciadas pelo usuário do app.
Uso permitido
Enviar mensagens de marketing pagas no Messenger a pessoas que optaram por receber avisos e mensagens promocionais.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão marketing_messages_messenger para acessar pontos de extremidade de mensagens de marketing no Messenger.
Requisitos do screencast
Demonstre o processo completo de login do Facebook para Empresas na plataforma do seu app, mostrando como o usuário do seu app concede a ele essa permissão.
Demonstre como o usuário do app seleciona as Páginas e contas de anúncios na plataforma do app.
O processo de concordar com os Termos de Serviço das mensagens de marketing beta para esses ativos.
Demonstre a capacidade de criar e enviar mensagens de marketing no Messenger.
P
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

pages_events

Dependências
pages_show_list
	
Com a permissão page_events, seu aplicativo registra eventos em nome de Páginas do Facebook administradas por pessoas que usam o seu aplicativo e envia esses eventos ao Facebook para direcionamento de anúncios, otimização e relatórios.
O uso dessa permissão é concedido para enviar atividades relacionadas a negócios (por exemplo, compra, adicionar ao carrinho, cadastro) em nome das páginas que as pessoas que usam o seu aplicativo possuem.
Uso permitido
Enviar atividades relacionadas a negócios (por exemplo, compra, adicionar ao carrinho, cadastro) em nome das Páginas dos usuários do seu aplicativo.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_manage_ads

Dependências
pages_show_list
	
A permissão pages_manage_ads autoriza seu aplicativo a gerenciar anúncios associados à Página.
O uso permitido para essa permissão é criar e gerenciar para a Página anúncios ou anúncios de clique para uma superfície de mensagens da empresa (como Messenger, Instagram Direct ou WhatsApp) associada à Página.
Uso permitido
Criar anúncios para sua Página
Gerenciar anúncios para sua Página
Criar e gerenciar anúncios de clique para uma superfície de mensagens da empresa
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa criar e gerenciar anúncios em nome de outras empresas nas Páginas delas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app cria um anúncio para a Página do Facebook dele na plataforma do app.
Mostre que os anúncios foram criados na Página.

pages_manage_cta
	
A permissão pages_manage_cta autoriza seu aplicativo a executar as funções POST e DELETE nos pontos de extremidade usados para gerenciar botões de chamada para ação em uma Página do Facebook.
Uso permitido
Fornecer acesso à API para gerenciar botões de chamada para ação (CTA) nas Páginas que você gerencia.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_manage_instant_articles

Dependências
pages_show_list
	
A permissão pages_manage_instant_articles autoriza seu aplicativo a gerenciar os Instant Articles em nome de Páginas do Facebook administradas por pessoas que usam seu aplicativo.
O uso permitido dessa permissão é criar e atualizar Instant Articles para as Páginas de propriedade dos usuários de seu aplicativo.
Uso permitido
Criar e atualizar Instant Articles para as Páginas dos usuários do aplicativo.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_manage_engagement

Dependências
pages_read_user_content
pages_show_list
	
A permissão pages_manage_engagement autoriza seu aplicativo a criar, editar e excluir comentários postados na Página.
O uso permitido para essa permissão é ajudar a gerenciar e moderar o conteúdo da Página.
Uso permitido
Fazer um comentário em uma publicação da Página.
Atualizar seu comentário em uma publicação da Página.
Excluir um comentário em uma publicação da Página.
Curtir uma publicação da Página ou remover a curtida.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa gerenciar comentários em nome de outros usuários em Páginas que são de propriedade deles.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app publica um comentário na Página do Facebook dele na plataforma do app.
Mostre o comentário recém-publicado na página do usuário do app.

pages_manage_metadata

Dependências
pages_show_list
	
A permissão pages_manage_metadata autoriza seu aplicativo a assinar e receber webhooks sobre atividades na Página e atualizar configurações na Página.
O uso permitido para essa permissão é ajudar um administrador da Página a administrar e gerenciar uma Página.
Uso permitido
Inscrever-se para receber webhooks da sua Página.
Atualizar configurações da sua Página.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa gerenciar contas, configurações ou webhooks de uma Página em nome do respectivo usuário proprietário.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app assina eventos de webhook ou atualiza as configurações da Página do Facebook na plataforma do app.

pages_manage_posts

Dependências
pages_read_engagement
pages_show_list
	
A permissão pages_manage_posts autoriza seu aplicativo a criar, editar e excluir posts da sua Página.
O uso permitido para essa permissão é criar e excluir conteúdo em uma Página.
Uso permitido
Fazer uma publicação e publicar uma foto ou um vídeo na sua Página.
Atualizar uma publicação, uma foto ou um vídeo na sua Página.
Excluir uma publicação, uma foto ou um vídeo na sua Página.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa criar ou gerenciar posts em nome de outros usuários em Páginas que são de propriedade deles.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app cria, edita e exclui um post da Página do Facebook dele na plataforma do app.
Mostre o post recém-atualizado na página dele.

pages_messaging

Dependências
pages_manage_metadata
pages_show_list
	
Com a permissão pages_messaging, seu app pode gerenciar e acessar conversas e ligações da Página no Messenger.
O uso permitido para essa permissão é criar experiências interativas iniciadas pelo usuário, enviar mensagens de solicitação de suporte, confirmar reservas ou compras e pedidos, bem como facilitar ligações entre uma empresa e os clientes.
Uso permitido
Criar experiências interativas iniciadas por um usuário.
Confirmar interações do cliente, como compras, pedidos e reservas.
Enviar mensagens de solicitação de suporte.
Gerencie as comunicações entre empresas e clientes.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa criar e gerenciar anúncios em nome de outras empresas nas Páginas delas.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre uma das seguintes opções:
Demonstre o recebimento de ligações de clientes ou a realização de ligações para clientes; ou
Seu app enviando uma mensagem para um usuário do Messenger, e demonstre o cliente da caixa de entrada do Messenger (na web ou no app para celular) recebendo e exibindo a mensagem enviada.
Gere uma solicitação de cURL que você possa integrar à plataforma do app para enviar uma mensagem. Você pode usar o Auxiliar de Integração da API no Painel de Apps da Meta > Messenger para fazer isso.
Certifique-se de compartilhar uma gravação da mensagem sendo enviada do app para o usuário, em vez de capturas de tela das mensagens recebidas no Messenger do cliente.

pages_read_engagement

Dependências
pages_show_list
	
A permissão pages_read_engagement autoriza seu aplicativo a ler conteúdo (posts, fotos, vídeos, eventos) postado pela Página, ler dados de seguidores (incluindo nome e PSID) e a foto do perfil, além de ler metadados e outras informações sobre a Página.
O uso permitido para essa permissão é ajudar um administrador da Página a administrar e gerenciar uma Página.
Uso permitido
Obter conteúdo publicado pela sua Página.
Obter nomes, PSIDs e fotos de perfil dos seguidores da sua Página.
Obter metadados sobre sua Página.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa ler conteúdo postado em nome de outros usuários em Páginas que são de propriedade deles.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app acessa o conteúdo de um post na Página do Facebook dele na plataforma do app.
Mostre que o conteúdo do post é exibido na plataforma do app.

pages_read_user_content

Dependências
pages_show_list
	
A permissão pages_read_user_content autoriza seu aplicativo a ler conteúdo gerado pelo usuário na Página, como posts, comentários e classificações feitas por usuários ou outras Páginas e excluir comentários de usuários nos posts da Página.
O uso permitido para essa permissão é ler conteúdo do usuário e de outra Página postado na Página se você precisar dele para ajudar a gerenciá-la.
Uso permitido
Obter conteúdo gerado por usuários na sua Página.
Obter publicações nas quais sua Página está marcada.
Exclua comentários publicados por usuários na sua Página.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa ler conteúdo gerado pelo usuário em nome de usuários do app em Páginas que são de propriedade deles.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app lê um comentário gerado pelo usuário na Página do Facebook dele na plataforma do app.
Mostre que o comentário gerado pelo usuário é exibido na plataforma do app.

pages_show_list

Dependências
Nenhum
	
Com a permissão pages_show_list, seu aplicativo pode acessar a lista das Páginas gerenciadas por uma pessoa.
O uso permitido dessa permissão serve para mostrar a uma pessoa a lista de Páginas que ela gerencia e confirmar se uma pessoa gerencia uma Página.
Uso permitido
Mostrar para uma pessoa a lista de Páginas que ela gerencia.
Confirma se uma pessoa gerencia uma Página.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa acessar a lista de páginas que são de propriedade de um usuário. Caso a permissão pages_show_list permission seja solicitada como dependência de uma permissão principal, especifique a permissão principal na descrição do caso de uso.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Mostre que as páginas de propriedade do usuário foram conectadas à plataforma do app.

pages_user_gender
	
Com a permissão pages_user_gender, seu app acessa o gênero de um usuário por meio da Página à qual o app está conectado.
Uso permitido
Personalizar experiências ou recomendações conforme o gênero.
Usar idioma com conceito de gênero, como pronomes e títulos corretos.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_user_locale
	
Com a permissão pages_user_locale, seu app acessa o idioma de um usuário por meio da Página à qual o app está conectado.
Uso permitido
Personalizar experiências com base no idioma de uma pessoa mostrando conteúdo específico ao idioma.
Enviar respostas no idioma preferido da pessoa.
Exibir números, horas e datas corretamente no idioma da pessoa.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_user_timezone
	
Com a permissão pages_user_timezone, seu app pode acessar o fuso horário de um usuário por meio da Página à qual o app está conectado.
Uso permitido
Evitar que mensagens sejam enviadas em um horário inconveniente.
Enviar conteúdo sensível ou notícias recorrentes em um horário específico.
Fornecer conteúdo personalizado com base no horário.
Enviar saudações apropriadas ao horário.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

pages_utility_messaging
	
A permissão pages_utility_messaging possibilita que um app acesse os modelos de mensagens de utilidade de uma Página.
O uso permitido dessa permissão é voltado para o gerenciamento dos modelos de mensagens de utilidade de uma Página e para o envio dessas mensagens pelo Messenger.
Uso permitido
Gerenciar os modelos de mensagens utilitárias de uma Página
Enviar mensagens utilitárias de uma Página pelo Messenger
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

paid_marketing_messages
	
Com a permissão paid_marketing_messages, um app pode criar, gerenciar e enviar mensagens de marketing pagas no Messenger e ver o desempenho das campanhas dessas mensagens de marketing em nome do usuário do app.
O uso permitido para essa permissão é possibilitar que um usuário do app envie mensagens de marketing pagas no Messenger a pessoas que optaram por receber avisos e mensagens promocionais do usuário do app.
Uso permitido
Enviar mensagens de marketing pagas no Messenger a pessoas que optaram por receber avisos e mensagens promocionais.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

public_profile

Dependências
Nenhum
	
A permissão public_profile possibilita que um app leia os campos de perfil público padrão no nó do usuário. Essa permissão é concedida automaticamente a todos os aplicativos.
O uso permitido é autenticar e fornecer aos usuários uma experiência personalizada no aplicativo.
Uso permitido
Autenticar os usuários do aplicativo e fornecer a eles uma experiência personalizada no aplicativo.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

publish_video

Dependências
Nenhum
	
Com a permissão publish_video, o app pode publicar vídeos ao vivo na linha do tempo, no grupo, no evento ou na Página de um usuário dele.
O uso permitido serve para transmitir stream de vídeo ao vivo na linha do tempo, em um evento ou na Página de um usuário do app.
Uso permitido
Concede permissão a um aplicativo para transmitir stream de vídeo na linha do tempo, no grupo, no evento ou na Página de um usuário desse aplicativo.
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
R
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

read_audience_network_insights

Dependências
Nenhum
	
Com a permissão read_audience_network_insights, um app pode acessar os dados de insights do Audience Network e extrair informações de relatórios de desempenho sobre suas propriedades.
O uso permitido para essa autorização possibilita que os dados de desempenho das propriedades do Audience Network sejam integrados às análises de dados e aos painéis do proprietário do app.
Uso permitido
Integrar os dados de desempenho das propriedades do Audience Network às análises de dados e aos painéis do proprietário do app
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

read_insights

Dependências
pages_read_engagement
pages_show_list
	
Com a permissão read_insights, seu aplicativo poder ler os dados sobre informações de Páginas, aplicativos e domínios da web que pertencem à pessoa.
Uso permitido
Integrar em suas próprias ferramentas de análise as informações sobre o aplicativo, a página ou o domínio do Facebook.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa acessar insights sobre a Página em nome de usuários do app em Páginas que são de propriedade deles.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre como o usuário do app recupera as métricas de insights da Página do Facebook dele na plataforma do app.
Mostre que as métricas de insights são exibidas na plataforma do app.
T
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

threads_basic
	
Com a permissão threads_basic, um app pode obter as informações de perfil do Threads de um usuário e o conteúdo de mídia e texto que ele postou no Threads.
O uso permitido para essa permissão é exibir os posts do Threads de um usuário em um app de empresa e torná-los visíveis apenas para o usuário que os criou.
Uso permitido
Mostrar os posts do Threads de um usuário em um app e deixá-los visíveis apenas para a pessoa que os criou, com o objetivo de gerenciar a presença do usuário no Threads.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_basic para acessar as informações do perfil, as mídias e o conteúdo de texto postado de um usuário do Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Recupere uma lista das publicações do usuário no Threads e demonstre como ver detalhes do post como texto, imagens e vídeos.

threads_business_basic
	
Com a permissão threads_business_basic, o app de empresa pode usar nomes de usuário correspondentes para buscar a identificação da conta do Threads associada a uma conta do Instagram no portfólio empresarial.
O uso permitido para essa permissão é recuperar a identificação de uma conta do Threads para usar como threads_user_id durante a criação de anúncios no Threads. Ela não serve para nenhum outro propósito. Por exemplo, é estritamente proibido usar a permissão threads_business_basic em um app para consumidores.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Recupere um ID de conta do Threads para usar como threads_user_id durante a criação de anúncios no Threads, com o objetivo de gerenciar a presença do usuário no Threads.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa que threads_business_basic recupere threads_user_id durante a criação de anúncios no Threads.
Requisitos do screencast
Demonstre o processo completo de login do Facebook na plataforma do app, mostrando como o usuário concede essa permissão ao app e seleciona a conta do Instagram conectada à conta do Threads.
Demonstre como o usuário do app cria um anúncio para ser exibido no Threads na plataforma do app.

threads_content_publish

Dependências
threads_basic
	
A permissão threads_content_publish possibilita que um app de empresa crie e publique conteúdo em nome de um perfil do Threads. O uso permitido para essa permissão possibilita que um usuário do app de negócios crie e publique conteúdo no próprio perfil do Threads.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Permite que um usuário do app crie e publique conteúdo no próprio perfil do Threads, com o objetivo de gerenciar a presença do usuário no Threads.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_content_publish para permitir que os usuários criem e publiquem conteúdo no próprio perfil do Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Crie um post e demonstre como adicionar texto, imagens ou vídeos.
Publique o post no perfil do Threads e demonstre como ver o conteúdo publicado.
Mostre o resultado da criação do post no seu app e no app nativo do Threads.

threads_delete

Dependências
threads_basic
	
Com a permissão threads_delete, um app pode excluir os posts do Threads de um usuário.
O uso permitido dessa autorização é voltado a excluir os posts de um usuário do app no Threads.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Exclua os posts do Threads de um usuário do app.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_delete para excluir posts de um usuário do app no Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Selecione um post e demonstre como excluí-lo.
Confirme que o post foi excluído.
Mostre o resultado da criação do post no seu app e no app nativo do Threads.

threads_keyword_search

Dependências
threads_basic
	
Com a permissão threads_keyword_search, seu app pode pesquisar e buscar conteúdo com uma palavra-chave específica em nome de um usuário do Threads. Com a permissão, também é possível publicar respostas ao conteúdo buscado.
O uso permitido para essa permissão é ajudar o usuário a gerenciar sua presença nas redes sociais.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Mostrando conteúdo público e a árvore de conteúdo público que um usuário procura usando uma palavra-chave específica.
Permite que o usuário classifique as próprias threads com menção.
Dar ao usuário a possibilidade de publicar respostas a conteúdo público que ele pesquisa.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_keyword_search para gerenciar sua presença nas redes sociais ao pesquisar e recuperar conteúdo com palavras-chave específicas no Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Insira uma palavra-chave e demonstre como procurar conteúdo publicado relacionado a ela.
Mostre o resultado da criação do post no seu app e no app nativo do Threads.

threads_location_tagging

Dependências
threads_basic
	
Com a permissão threads_location_tagging, seu app pode pesquisar e buscar localizações públicas usando consultas/palavras-chave ou coordenadas específicas em nome de um usuário do Threads e publicar mídia com localização marcada.
O uso permitido para essa permissão é ajudar os usuários a marcar localizações públicas em seus posts e solicitar localizações quando uma mídia for recuperada.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Ajudam os usuários a marcar localizações públicas em publicações e solicitar localizações quando uma mídia for recuperada.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_location_tagging para permitir que os usuários leiam informações de localização ou publiquem um post com informações de localização.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Demonstre o uso das informações de localização.
Mostre como ler informações de localização ou publicar um post com informações de localização.

threads_manage_insights

Dependências
threads_basic
	
Com a permissão threads_manage_insights, seu app pode obter acesso a insights de um perfil do Threads. Seu app pode obter insights de um perfil do Threads e de threads individuais publicadas por esse perfil.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Obter insights de um perfil do Threads
Obter insights de threads individuais publicadas por esse perfil
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_manage_insights para acompanhar sua performance no Threads ao fornecer insights do perfil e métricas individuais do Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Recupere dados de insights sobre um perfil no Threads e demonstre como ver métricas no nível do perfil (como seguidores, engajamento e alcance).
Recupere dados de insights sobre uma thread específica e demonstre como ver métricas no nível da thread (como curtidas, comentários e compartilhamentos).

threads_manage_mentions

Dependências
threads_basic
	
Com a permissão threads_manage_mentions, o app pode buscar conteúdo que menciona o usuário em nome de um usuário do Threads.
O uso dessa permissão é concedido para ajudar o usuário a gerenciar a própria presença nas redes sociais. Isso inclui mostrar o conteúdo público e a árvore de conteúdo público em que um usuário foi mencionado, permitir que o usuário classifique as menções feitas a ele e publicar respostas na árvore de conteúdo público em que foi mencionado.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Mostrar conteúdo público e a árvore de conteúdo público em que um usuário foi mencionado.
Permite que o usuário classifique as próprias threads com menção.
Oferecer a possibilidade de o usuário publicar respostas a conteúdo público que o menciona.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_manage_insights para acompanhar sua performance no Threads ao fornecer insights do perfil e métricas individuais do Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Recupere conteúdo público em que o usuário é mencionado e demonstre como ver a árvore de conteúdo.

threads_manage_replies

Dependências
threads_basic
	
Com a permissão threads_manage_replies, o app pode criar uma resposta em nome de um perfil do Threads, ocultar ou exibir respostas a uma thread e controlar quem pode responder a uma thread no perfil do Threads. O app pode criar uma resposta em nome de um perfil do Threads, ocultar ou exibir respostas a uma thread e controlar quem pode responder a uma thread no perfil do Threads.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Criar uma resposta em nome de um perfil do Threads
Ocultar ou exibir respostas a uma thread
Controlar quem pode responder a uma thread no perfil do Threads
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_manage_replies para possibilitar que os usuários gerenciem a própria presença no Threads ao responderem em nome do perfil deles, ocultarem/mostrarem respostas a threads e controlarem quem pode responder threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Demonstre uma destas opções: a criação de uma resposta em nome de um perfil do Threads.
Crie uma resposta e demonstre como adicionar texto, imagens e outras mídias.
Demonstre como ocultar/mostrar respostas a uma thread.
Oculte uma resposta e mostre como reexibi-la.
Demonstre como controlar quem pode responder a uma thread no perfil do Threads.
Defina o controle de respostas como "Todos" e demonstre como alterá-lo para "Pessoas que você está seguindo".

threads_profile_discovery

Dependências
threads_basic

	
Com a permissão threads_profile_discovery, seu app pode acessar perfis de contas públicas do Threads e os posts públicos dessas contas.
O uso permitido para essa permissão é possibilitar que os usuários do app encontrem perfis de contas públicas do Threads e posts públicos dessas contas para realizar análises de concorrentes.
Uso permitido
Permita que os usuários do app encontrem perfis de contas públicas do Threads e posts públicos dessas contas para realizar análises de concorrentes.
	
Descrição do caso de uso
Forneça exemplos específicos justificando por que seu app requer que a permissão threads_profile_discovery habilite o acesso dos usuários aos perfis para contas públicas do Threads e os posts públicos dessas contas.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Pesquise um perfil público do Threads e/ou demonstre como pesquisar posts públicos nesse perfil.

threads_read_replies

Dependências
threads_basic
	
Com a permissão threads_read_replies, o app pode ler as respostas a uma thread do usuário. Com essa permissão, é possível obter respostas a uma thread pertencente ao usuário do app.
A permissão também pode ser usada para solicitar insights de análise a fim de melhorar o app. Além disso, ela pode ser usada para fins de marketing ou de publicidade, por meio do uso de informações agregadas, anônimas ou sem identificação (desde que não seja possível identificar esses dados novamente).
Uso permitido
Obter respostas a uma thread pertencente ao usuário do app
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa da permissão threads_read_replies para permitir que os usuários vejam respostas às próprias threads no Threads.
Requisitos do screencast
Demonstre o processo completo de login do OAuth do Threads na plataforma do app, mostrando como o usuário concede essa permissão ao app.
Demonstre o fluxo completo de vincular uma conta do Threads no seu app e mostre quais permissões são solicitadas do usuário.
Recupere respostas a uma thread e demonstre como ver mídias e texto de resposta.

threads_share_to_instagram

Dependências
Nenhum
	
Com a permissão threads_share_to_instagram, seu app pode postar o post do Threads do usuário do app na conta do Instagram vinculada em nome do usuário.
O uso permitido para essa permissão possibilita que um usuário publique conteúdo do Threads na sua conta do Instagram vinculada, seja como uma ação única ou automaticamente para posts futuros.
Uso permitido
Postar o conteúdo do Threads do usuário do seu app na conta do Instagram vinculada dele
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.
U
Permissão	Descrição

user_age_range
	
Com a permissão user_age_range, seu app pode acessar a faixa etária de uma pessoa conforme indicado no perfil do Facebook.
Uso permitido
O aplicativo deve ter classificação etária por exigência legal.
O aplicativo inclui conteúdo inadequado para a base geral de usuários do Facebook, como conteúdo de encontros, adulto ou violento.

user_birthday
	
Com a permissão user_birthday, seu app pode ler o aniversário de uma pessoa conforme publicado no perfil dela no Facebook.
Uso permitido
Fornecer às pessoas conteúdo compatível com a respectiva idade quando a faixa etária não for suficiente.

user_friends
	
Com a permissão user_friends, seu app pode obter uma lista dos amigos de uma pessoa que usam esse app.
Uso permitido
Fornecer conteúdo relacionado ao Facebook para personalizar a experiência de uma pessoa.

user_gender
	
Com a permissão user_gender, seu app pode ler o gênero de uma pessoa conforme publicado no perfil dela no Facebook.
Uso permitido
Para dar pronomes.
Personalizar a experiência de uma pessoa conforme o gênero. Por exemplo, aplicativos de encontros, compras e moda.

user_hometown
	
Com a permissão user_hometown, seu app pode ler a cidade natal de uma pessoa no perfil dela no Facebook.
Fornecer uma experiência personalizada com base no local em que uma pessoa viveu ou cresceu.

user_likes
	
Com a permissão user_likes, seu aplicativo pode ler uma lista de todas as Páginas do Facebook que um usuário já curtiu.
Uso permitido
Proporcionar uma experiência personalizada com a correlação ou a exibição de conteúdo referente às curtidas da pessoa. Isso inclui selecionar conteúdo em escala para personalizar aplicativos com grande quantidade de conteúdo e permitir que as pessoas compartilhem as próprias curtidas com outros usuários, como no caso de aplicativos de encontros e de música.
Permitir o uso de aplicativos de monitoramento e controles de acesso dos pais para analisar curtidas dos usuários a fim de detectar problemas relacionados à segurança e ao bem-estar de pessoas menores de 18 anos. Esse recurso se destina ao uso exclusivo de pais, mães ou responsáveis de dependentes menores de 18 anos e está limitado à análise das redes sociais de menores, conforme apresentado na interface do usuário do aplicativo.

user_link
	
Com a permissão user_link, seu aplicativo pode acessar a URL de perfil do Facebook da pessoa que está usando o aplicativo.
Uso permitido
Fornecer a uma pessoa que usa seu aplicativo uma maneira de visitar o perfil de outra pessoa no Facebook.

user_location
	
Com a permissão user_location, seu app pode ler o nome da cidade, conforme exibido no campo de localização do perfil de uma pessoa no Facebook.
Fornecer uma experiência personalizada com base no nome da cidade, conforme exibido no campo de localização do perfil de uma pessoa no Facebook.

user_messenger_contact
	
Com a permissão user_messenger_contact, as empresas podem entrar em contato com uma pessoa pelo Messenger após a aprovação ou o início de uma conversa com a Página da empresa.
Uso permitido
Para uma Página enviar a uma pessoa uma mensagem inicial, atualizações pós-compra e atualizações da conta.

user_photos
	
Com a permissão user_photos, seu aplicativo pode ler as fotos de uma pessoa carregadas no Facebook.
Uso permitido
Criar livros ou álbuns físicos ou digitais das fotos de uma pessoa, o que inclui permitir que as pessoas exportem fotos para impressão.
Fornecer às pessoas a capacidade de exibir fotos com outros usuários do aplicativo. Por exemplo, em aplicativos sociais ou de encontros.
Fornecer às pessoas a capacidade de editar ou criar novo conteúdo fotográfico com base em fotos existentes.

user_posts
	
Com a permissão user_posts, seu aplicativo pode acessar as publicações que um usuário fez na própria linha do tempo.
Uso permitido
Permitir que as pessoas criem livros ou álbuns (físicos ou digitais) da linha do tempo e compartilhem lembranças da linha do tempo no Facebook ou em outros aplicativos sociais.
Permitir o uso de aplicativos de monitoramento e controles de acesso dos pais para analisar o conteúdo de uma publicação a fim de detectar problemas relacionados à segurança e ao bem-estar de pessoas menores de 18 anos. Esse recurso se destina ao uso exclusivo de pais, mães ou responsáveis de dependentes menores de 18 anos e está limitado à análise das redes sociais de menores, conforme apresentado na interface do usuário do aplicativo.

user_videos
	
Com a permissão user_videos, seu aplicativo pode ler uma lista de vídeos carregados por uma pessoa.
Uso permitido
Exibir os vídeos de uma pessoa em uma TV por meio de um set-top box ou em um porta-retrato digital.
Fornecer às pessoas a capacidade de editar ou criar novo conteúdo de vídeo usando vídeos existentes.
Fornecer às pessoas a capacidade de exibir vídeo com donos no aplicativo. Por exemplo, em aplicativos sociais ou de encontros.
W
Permissão
	
Descrição e uso permitido
	
O que incluir no envio para a análise do app

whatsapp_business_manage_events

Dependências
whatsapp_business_management
	
Com a permissão whatsapp_business_manage_events, seu app pode registrar eventos como compra, adição ao carrinho, leads e muito mais, em nome de uma conta do WhatsApp Business administrada por um usuário do app.
O uso permitido dessa permissão é registrar eventos em contas do WhatsApp Business e enviar esses dados de atividade à Meta para relatórios, otimização e direcionamento de anúncios.
Uso permitido
Registrar eventos em contas do WhatsApp Business
Enviar dados de atividade de eventos à Meta para relatórios, otimização e direcionamento de anúncios
	
Descrição do caso de uso
Consulte a documentação sobre análise do app para saber mais.
Requisitos do screencast
Consulte a documentação sobre análise do app para saber mais.

whatsapp_business_management

Dependências
Nenhum
	
Com a permissão whatsapp_business_management, o app pode ler e/ou gerenciar ativos de negócios do WhatsApp que você possui ou aos quais outras empresas concederam acesso a você por meio dessa permissão. Esses ativos comerciais incluem contas comerciais do WhatsApp, telefones, modelos de mensagem, códigos QR e mensagens relacionadas, bem como assinaturas de webhook.
O uso permitido dela serve para gerenciar ativos comerciais do WhatsApp e exibir análises da conta do WhatsApp Business no seu portal do cliente.
Uso permitido
Gerenciar ativos comerciais do WhatsApp.
Exibir análises de conta do WhatsApp Business no seu portal comercial.
	
Descrição do caso de uso
Forneça exemplos específicos do porquê seu app precisa acessar os ativos de negócios de uma empresa que fez a integração na sua plataforma.
Requisitos do screencast
Demonstre uma das seguintes opções:
Demonstre como o usuário do seu app cria um modelo de mensagem no seu app ou no Gerenciador do WhatsApp.
O usuário do seu app habilitando o ícone do Botão de Ligação para a empresa do WhatsApp por meio de: (1) uma solicitação CURL; ou (2) configurações dentro da interface do usuário do seu app. Depois que ele for habilitado, abra a conversa com sua empresa pelo app de usuário do WhatsApp e mostre que o ícone do Botão de Ligação está visível para o usuário na conversa com sua empresa.

whatsapp_business_messaging

Dependências
whatsapp_business_management
	
Com a permissão whatsapp_business_messaging, o app pode enviar mensagens do WhatsApp e fazer chamadas para um número de telefone específico, carregar e recuperar mídia de mensagens, gerenciar e obter informações do perfil do WhatsApp Business e registrar os números de telefones com a Meta.
O uso dessa permissão é concedido para criar experiências de mensagens e ligações iniciadas por um cliente ou uma empresa.
Uso permitido
Envie mensagens do WhatsApp para um número de telefone específico
Carregar e recuperar mídia de mensagens
Faça ligações do WhatsApp para um número de telefone específico
Gerenciar e obter informações do perfil comercial do WhatsApp
Registre um número de telefone com a Meta
	
Descrição do caso de uso
Explique a funcionalidade de mensagens que seu app oferece aos clientes empresariais que você integrou à plataforma e como eles executam essas funções.
Requisitos do screencast
Demonstre uma das seguintes opções:
Demonstre seu app enviando uma mensagem a um número do WhatsApp e o cliente do WhatsApp (seja na web ou no app para celular) recebendo e exibindo a mensagem enviada. Você pode usar o painel WhatsApp > Configuração da API no Painel de Apps da Meta para gerar uma solicitação de cURL que você possa integrar ao app para enviar a mensagem.
Que seu app pode realizar uma ligação iniciada pela empresa e que um usuário aceita a ligação em um cliente móvel do WhatsApp. Em alternativa, você pode demonstrar que um usuário pode realizar uma ligação para seu número de telefone comercial e que seu app recebe a ligação iniciada pelo usuário.
Saiba mais
Tokens de acesso
Como manter o acesso a dados
Solicitações seguras
Termos e políticas
Você achou esta página útil?