---
titulo: "Google Ads API — projeto do Cloud e credenciais OAuth"
url: https://developers.google.com/google-ads/api/docs/get-started/oauth-cloud-project?hl=pt-br
capturado_em: 2026-10-21
hash: 7331ad89a921b7e2
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Configurar um projeto do Console de APIs do Google

A forma como você cria e configura um projeto do Console de APIs do Google depende do cenário de autorização OAuth 2.0 do aplicativo. Selecione um cenário de autorização para personalizar este guia.

Contas de serviço Autenticação do usuário

Você precisa de um projeto do Console de APIs do Google para criar credenciais OAuth 2.0 e ativar a API Google Ads para seu app.

Essas credenciais autenticam e autorizam seu app ou usuários do Google Ads nos servidores do Google e permitem que você gere tokens OAuth para serem usados em chamadas para a API.

Selecionar ou criar um projeto do Console de APIs do Google
Observação: se você já tem um projeto do Console de APIs do Google com acesso à API e quer usá-lo para criar credenciais, pule para Ativar a API Google Ads no seu projeto.

Para configurar um novo projeto, siga o guia para criar um projeto do Console de APIs do Google. Ativar o faturamento para seu projeto é opcional. Se você tiver o faturamento ativado, selecione uma conta de faturamento para o novo projeto. Não há cobrança pelo uso da API Google Ads, embora os projetos na nuvem estejam sujeitos aos limites de cota padrão do projeto.

Ativar a API Google Ads no seu projeto

Para ativar a API Google Ads no seu projeto, siga estas etapas:

Abra a biblioteca de APIs no Console de APIs do Google. Se solicitado, selecione seu projeto ou crie um novo. A biblioteca de APIs lista todas as APIs disponíveis agrupadas por família de produtos e popularidade.

Use a pesquisa para encontrar a API Google Ads se ela não estiver visível na lista.

Selecione a API Google Ads e clique no botão Ativar.

Ativar a API Google Ads

Solicitar acesso à API

Em seguida, acesse a página de visão geral da API Google Ads para verificar seu nível de acesso atual à API. Se o nível de acesso atual à API for Teste, expanda a seção Fazer upgrade do nível de acesso. Siga as instruções para solicitar o nível de acesso Explorer.

Depois que você concluir a inscrição, o Google vai fazer uma análise automática e fazer upgrade para o acesso Explorer na maioria dos casos.

Crie uma conta de serviço e uma chave
Observação: Se você já estiver usando outra API do Google e tiver criado uma conta de serviço e uma chave OAuth 2.0, pule esta etapa e reutilize as credenciais atuais.

Crie credenciais para a conta de serviço. Faça o download da chave da conta de serviço no formato JSON e anote o ID e o e-mail da conta de serviço.

Anterior
Internos do OAuth 2.0
Avançar
Gerenciamento de credenciais
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-14 UTC.