---
titulo: "Google Ads API — selecionar conta e hierarquia MCC"
url: https://developers.google.com/google-ads/api/docs/get-started/select-account?hl=pt-br
capturado_em: 2026-10-30
hash: 2903466f4bcc935f
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Início rápido

Este guia de início rápido ajuda você a fazer sua primeira chamada de API para a API Google Ads.

Principais conceitos
Projeto do Google Cloud: um projeto do Google Cloud forma a base para criar, ativar e usar todos os serviços do Google, incluindo o gerenciamento de APIs e credenciais de API do OAuth 2.0. É possível criar um no Console do Google Cloud.
Nível de acesso à API: o nível de acesso à API do seu projeto do Google Cloud controla o número de chamadas de API que você pode fazer por dia e os ambientes em que pode fazer chamadas de API. O nível de acesso à API do seu projeto está listado na página de visão geral da API Google Ads.
Conta de administrador do Google Ads: usada para gerenciar outras contas do Google Ads, que podem ser um conjunto de contas de cliente ou de administrador do Google Ads.
Conta de cliente do Google Ads: a conta do Google Ads usada para veicular anúncios que você quer segmentar com chamadas de API.
ID de cliente: o número de 10 dígitos que identifica uma conta de cliente do Google Ads. Se você copiou esse ID da interface do Google Ads, remova os hífens.
OAuth 2.0: o OAuth 2.0 é um protocolo padrão do setor para autorização, usado por todas as APIs do Google. Você precisa de uma conta de serviço e uma chave para gerar credenciais do OAuth 2.0 para fazer chamadas de API.
Conta de serviço: um tipo especial de Conta do Google que pertence ao seu aplicativo, e não a um usuário individual. Ele é usado para autenticar seu aplicativo na API Google Ads. Você precisa de um projeto na nuvem do Google Cloud para receber uma conta de serviço.
Chave da conta de serviço: um arquivo de credencial de app JSON que contém a chave privada da sua conta de serviço. Ele é usado para gerar credenciais do OAuth 2.0 para autenticar uma conta de serviço ao fazer uma chamada de API da API Google Ads. Você precisa de uma conta de serviço para receber uma chave de conta de serviço.
Pré-requisitos

Para fazer uma chamada da API Google Ads, siga estas etapas.

Configurar seu projeto na nuvem para acessar a API Google Ads

O projeto do Google Cloud é usado para gerenciar as APIs do Google e as credenciais da API OAuth 2.0. Para encontrar seus projetos do Google Cloud ou criar um, acesse o console do Google Cloud.

Comece ativando a API Google Ads no seu projeto:

Ativar a API Google Ads

Em seguida, acesse a página de visão geral da API Google Ads. A página mostra seu nível de acesso atual à API. Se o nível de acesso atual à API for Teste, abra a seção Fazer upgrade do nível de acesso. Siga as instruções para solicitar o nível de acesso Explorer.

Depois que você concluir sua inscrição, o Google vai analisá-la automaticamente e, na maioria dos casos, fazer o upgrade para o nível Explorer. Se você não tiver recebido o acesso de explorador, não se preocupe. Este guia vai fornecer as instruções adequadas ao configurar sua conta de cliente do Google Ads.

Criar uma conta de serviço
Importante: anote o endereço de e-mail e a chave da conta de serviço que você gerar nesta etapa. Você vai precisar deles ao fazer as chamadas de API.

Você precisa de uma conta de serviço e uma chave de conta de serviço para fazer chamadas de API. Se você já estiver usando outra API do Google e tiver criado uma conta de serviço e uma chave do OAuth 2.0, pule esta etapa e reutilize as credenciais atuais.

Como criar uma conta de serviço e uma chave
No console do Google Cloud, acesse Menu > IAM e administrador > Contas de serviço.

Acesse Contas de serviço

Selecione a conta de serviço.
Clique em Chaves > Adicionar chave > Criar nova chave.
Selecione JSON e clique em Criar.

Seu novo par de chaves pública/privada é gerado e transferido por download para sua máquina como um novo arquivo. Salve o arquivo JSON transferido por download como credentials.json no seu diretório de trabalho. Esse arquivo é a única cópia dessa chave. Não faça commit de credentials.json no controle de versões. Por exemplo, adicione-o ao arquivo .gitignore.

Clique em Fechar.
Configurar sua conta de cliente do Google Ads
Importante: anote o ID de cliente do Google Ads de 10 dígitos, sem os hífens. Você vai precisar desse ID para especificar em qual conta está fazendo chamadas de API.

Comece identificando a conta do Google Ads em que você está fazendo chamadas de API. O tipo de conta em que você pode fazer chamadas de API depende do nível de acesso à API do seu projeto do Google Cloud. Confira sua página de visão geral da API Google Ads para saber seu nível de acesso à API.

Níveis de acesso Explorer, Basic e Standard
Testar o acesso

Você pode fazer chamadas para sua conta de produção do Google Ads. No entanto, você pode criar uma conta de teste do Google Ads seguindo as instruções na guia Acesso de teste, se necessário.

Para fazer uma chamada de API para um cliente do Google Ads, você precisa conceder acesso e as permissões adequadas à sua conta de serviço na conta de cliente do Google Ads. Para fazer isso, você precisa ter acesso de administrador à conta de cliente.

Como conceder à conta de serviço acesso à sua conta do Google Ads
Primeiro, faça login na sua conta do Google Ads como administrador.
Acesse Administrador > Acesso e segurança.
Clique no botão na guia Usuários.

Digite o endereço de e-mail da conta de serviço na caixa de entrada E-mail. Selecione o nível de acesso à conta apropriado e clique no botão Adicionar conta. O nível de acesso "Somente e-mail" não é compatível com contas de serviço.

A conta de serviço recebe acesso.

[Opcional] Não é possível conceder acesso de administrador a uma conta de serviço durante a configuração inicial. Se as chamadas de API exigirem acesso de administrador, faça upgrade do acesso da seguinte maneira.
Clique na seta suspensa ao lado do nível de acesso da conta de serviço na coluna Nível de acesso.
Selecione Administrador na lista suspensa.
Fazer o download de ferramentas e bibliotecas de cliente
Dica: recomendamos instalar o Assistente para Desenvolvedores da API Google Ads. Com o poder do Gemini, o Assistente para Desenvolvedores facilita as etapas restantes. Ele pode produzir código na linguagem de programação escolhida ou como uma solicitação de API REST, orientar você na configuração de credenciais, gerar consultas GAQL e diagnosticar erros de autenticação ou de API que você encontrar ao fazer sua primeira chamada.

É possível baixar uma biblioteca de cliente ou um cliente HTTP, dependendo de como você quer fazer chamadas de API.

Usar uma biblioteca de cliente
Usar o cliente HTTP (REST)

Faça o download e instale uma biblioteca de cliente de sua escolha.

Fazer uma chamada de API
Importante: as instruções se referem a um CUSTOMER_ID (o ID de cliente de 10 dígitos da conta de cliente de destino no caminho do URL da solicitação) e a uma configuração login_customer_id (ou loginCustomerId / login-customer-id, que é obrigatória e precisa ser definida como o ID de 10 dígitos da conta de administrador se você acessar a conta de cliente por uma conta de administrador ou omitida se você fizer a autenticação diretamente na conta de cliente). Os IDs de cliente não podem conter hífens em solicitações de API, URLs ou configurações. Por exemplo, use 1234567890 em vez de 123-456-7890 para evitar um erro INVALID_CUSTOMER_ID. Para mais detalhes, consulte o modelo de acesso do Google Ads e a estrutura de chamadas de API.
Observação: as instruções da biblioteca de cliente podem se referir a uma versão específica da biblioteca. Ele serve apenas para fins ilustrativos. Você pode usar a versão mais recente da biblioteca de cliente, a menos que seja expressamente indicado o contrário.
Dica : quer executar mais consultas de relatórios? Consulte nosso criador de consultas GAQL. Saiba mais sobre a geração de relatórios.

Selecione o cliente de sua preferência para ver instruções sobre como fazer uma chamada de API:

Java
C#
PHP
Python
Ruby
Perl
curl

Os artefatos da biblioteca de cliente são publicados no repositório Maven Central.

Para gerenciar as versões de dependência e evitar conflitos, consulte o guia da lista de materiais (BOM) da API Google Ads.

Se você não estiver usando a BOM, adicione a biblioteca de cliente diretamente ao seu projeto usando uma das seguintes ferramentas de build:

Maven: adicione a seguinte dependência ao arquivo pom.xml:

<dependency>
  <groupId>com.google.api-ads</groupId>
  <artifactId>google-ads</artifactId>
  <version>48.1.0</version>
</dependency>

Gradle: adicione a seguinte dependência ao arquivo build.gradle:

implementation 'com.google.api-ads:google-ads:48.1.0'

Crie um arquivo ads.properties no diretório principal (~/ads.properties no Linux e no macOS ou %USERPROFILE%\ads.properties no Windows) com o seguinte conteúdo:

api.googleads.serviceAccountSecretsPath=JSON_KEY_FILE_PATH
api.googleads.loginCustomerId=INSERT_LOGIN_CUSTOMER_ID_HERE

Antes de executar solicitações de API, crie uma instância de GoogleAdsClient. Por padrão, fromPropertiesFile() carrega as credenciais do arquivo ads.properties localizado no diretório principal:

GoogleAdsClient googleAdsClient;
try {
  googleAdsClient = GoogleAdsClient.newBuilder().fromPropertiesFile().build();
} catch (IOException e) {
  System.err.printf("Failed to create GoogleAdsClient: %s%n", e);
  throw new RuntimeException("Initialization failed", e);
}

Em seguida, gere um relatório de campanha usando GoogleAdsService.SearchStream para transmitir grandes conjuntos de resultados de forma eficiente e recuperar as campanhas na sua conta:

    private void runExample(GoogleAdsClient googleAdsClient, long customerId) {
  try (GoogleAdsServiceClient googleAdsServiceClient =
      googleAdsClient.getLatestVersion().createGoogleAdsServiceClient()) {
    String query = "SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id";
    // Constructs the SearchGoogleAdsStreamRequest.
    SearchGoogleAdsStreamRequest request =
        SearchGoogleAdsStreamRequest.newBuilder()
            .setCustomerId(Long.toString(customerId))
            .setQuery(query)
            .build();

    // Creates and issues a search Google Ads stream request that will retrieve all campaigns.
    ServerStream<SearchGoogleAdsStreamResponse> stream =
        googleAdsServiceClient.searchStreamCallable().call(request);

    // Iterates through and prints all of the results in the stream response.
    for (SearchGoogleAdsStreamResponse response : stream) {
      for (GoogleAdsRow googleAdsRow : response.getResultsList()) {
        System.out.printf(
            "Campaign with ID %d and name '%s' was found.%n",
            googleAdsRow.getCampaign().getId(), googleAdsRow.getCampaign().getName());
      }
    }
  }
}
GetCampaigns.java

Se você encontrar erros ao fazer sua primeira chamada, consulte Tratar erros da API para orientações sobre solução de problemas.

Anterior
Introdução
Avançar
Tratar erros
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-30 UTC.