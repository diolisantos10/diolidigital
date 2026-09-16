---
titulo: "Google Ads API — selecionar conta e hierarquia MCC"
url: https://developers.google.com/google-ads/api/docs/get-started/select-account?hl=pt-br
capturado_em: 2026-09-16
hash: 577aa8ff1e08bbac
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Participe da nossa transmissão ao vivo no Discord no servidor da comunidade de publicidade e medição do Google e no YouTube em 20 de agosto, às 11h (horário de Brasília). Vamos discutir os novos recursos adicionados à versão 25.1 da API Google Ads.
 O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Início rápido

Este guia de início rápido ajuda você a fazer sua primeira chamada de API para a API Google Ads.

Principais conceitos
Projeto do Google Cloud:um projeto do Google Cloud forma a base para criar, ativar e usar todos os serviços do Google, incluindo o gerenciamento de APIs e credenciais da API OAuth 2.0. É possível criar um no console do Google Cloud.
Nível de acesso à API:o nível de acesso à API do seu projeto na nuvem do Google Cloud controla o número de chamadas de API que você pode fazer por dia e os ambientes em que é possível fazer essas chamadas. O nível de acesso à API do seu projeto está listado na página de visão geral da API Google Ads.
Conta de administrador do Google Ads:usada para gerenciar outras contas do Google Ads, que podem ser uma coleção de contas de cliente do Google Ads ou outras contas de administrador do Google Ads.
Conta de cliente do Google Ads:a conta do Google Ads usada para veicular anúncios que você quer segmentar com chamadas de API.
ID de cliente do cliente:o número de 10 dígitos que identifica uma conta de cliente do Google Ads. Se você copiou esse ID da interface do Google Ads, remova os hífens.
OAuth 2.0:o OAuth 2.0 é um protocolo padrão do setor para autorização, usado por todas as APIs do Google. Você precisa de uma conta de serviço e chave para gerar credenciais do OAuth 2.0 e fazer chamadas de API.
Conta de serviço:um tipo especial de Conta do Google que pertence ao seu aplicativo, e não a um usuário individual. Ele é usado para autenticar seu aplicativo na API Google Ads. Você precisa de um projeto na nuvem do Google Cloud para conseguir uma conta de serviço.
Chave da conta de serviço:um arquivo JSON de credenciais do app que contém a chave privada da sua conta de serviço. Ele é usado para gerar credenciais do OAuth 2.0 e autenticar uma conta de serviço ao fazer uma chamada da API Google Ads. Você precisa de uma conta de serviço para receber uma chave de conta de serviço.
Pré-requisitos

Para fazer uma chamada da API Google Ads, siga estas etapas.

Configurar seu projeto do Console de APIs do Google para acesso à API Google Ads

O projeto do Google Cloud é usado para gerenciar APIs do Google e credenciais da API OAuth 2.0. Para encontrar ou criar projetos do Google Cloud, acesse o console do Google Cloud.

Comece ativando a API Google Ads no seu projeto:

Ativar a API Google Ads

Em seguida, acesse a página de visão geral da API Google Ads. A página mostra seu nível de acesso atual à API. Se o nível de acesso à API atual for Teste, expanda a seção Fazer upgrade do nível de acesso. Siga as instruções para solicitar o nível de acesso Explorer.

Depois que você concluir a inscrição, o Google vai analisar e fazer upgrade automático para o Explorer na maioria dos casos. Se você não tiver acesso de administrador, não se preocupe. Este guia vai fornecer as instruções adequadas ao configurar sua conta de cliente do Google Ads.

Criar uma conta de serviço
Ponto principal:anote o endereço de e-mail e a chave da conta de serviço gerados nesta etapa. Você vai precisar dele ao fazer as chamadas de API.

Você precisa de uma conta de serviço e uma chave de conta de serviço para fazer chamadas de API. Se você já estiver usando outra API do Google e tiver criado uma conta de serviço e uma chave do OAuth 2.0, pule esta etapa e reutilize as credenciais atuais.

Como criar uma conta de serviço e uma chave
No console do Google Cloud, acesse Menu > IAM e administrador > Contas de serviço.

Acessar a página "Contas de serviço"

Selecione sua conta de serviço.
Clique em Chaves > Adicionar chave > Criar nova chave.
Selecione JSON e clique em Criar.

Seu novo par de chave pública/privada é gerado e transferido por download para sua máquina como um novo arquivo. Salve o arquivo JSON baixado como credentials.json no seu diretório de trabalho. Esse arquivo é a única cópia dessa chave.

Clique em Fechar.
Configurar sua conta de cliente do Google Ads
Importante:anote o ID de cliente do Google Ads de 10 dígitos sem os hífens. Você vai precisar desse ID para especificar a conta em que está fazendo chamadas de API.

Comece identificando a conta do Google Ads em que você está fazendo chamadas de API. O tipo de conta para que você pode fazer chamadas de API depende do nível de acesso à API do seu projeto na nuvem do Google Cloud. Confira a página de visão geral da API Google Ads para saber seu nível de acesso à API.

Níveis de acesso Explorer, Basic e Standard
Testar o acesso

Você pode fazer chamadas para sua conta de produção do Google Ads. No entanto, é possível criar uma conta de teste do Google Ads seguindo as instruções na guia Acesso de teste, se necessário.

Para fazer uma chamada de API a um cliente do Google Ads, você precisa conceder acesso e as permissões adequadas à sua conta de serviço na conta de cliente do Google Ads. Para fazer isso, você precisa ter acesso de administrador à conta do cliente.

Como conceder à conta de serviço acesso à sua conta do Google Ads
Comece fazendo login na sua conta do Google Ads como administrador.
Acesse Administrador > Acesso e segurança.
Clique no botão na guia Usuários.

Digite o endereço de e-mail da conta de serviço na caixa de entrada E-mail. Selecione o nível de acesso à conta adequado e clique no botão Adicionar conta. O nível de acesso "E-mail" não está disponível para contas de serviço.

A conta de serviço recebe acesso.

[Opcional] Por padrão, não é possível conceder acesso de administrador a uma conta de serviço. Se as chamadas de API exigirem acesso de administrador, faça upgrade do acesso da seguinte maneira.
Clique na seta suspensa ao lado do nível de acesso da conta de serviço na coluna Nível de acesso.
Selecione Administrador na lista suspensa.
Baixar ferramentas e bibliotecas de cliente

Você pode baixar uma biblioteca de cliente ou um cliente HTTP, dependendo de como quer fazer as chamadas de API.

Usar uma biblioteca de cliente
Usar cliente HTTP (REST)

Faça o download e instale uma biblioteca de cliente de sua escolha.

Fazer uma chamada de API
Importante:as instruções se referem a um CUSTOMER_ID (no caminho do URL da solicitação) e a uma configuração login_customer_id (nas configurações da biblioteca de cliente ou nos cabeçalhos HTTP). A forma como você define isso depende da hierarquia da sua conta:
CUSTOMER_ID: o ID de cliente de 10 dígitos da conta de cliente de destino que você quer consultar ou modificar.
login_customer_id (ou loginCustomerId / login-customer-id): se o acesso à conta de cliente for por uma conta de administrador, esse cabeçalho será obrigatório e precisa ser definido como o ID de cliente de 10 dígitos dessa conta de administrador. Se você fizer a autenticação diretamente com as credenciais da conta de cliente, omita essa configuração ou defina o ID da conta de cliente.

Requisito de formato importante:os IDs de cliente (para a conta de cliente de destino e a conta de administrador) não podem conter hífens nas solicitações de API, URLs e configurações. Se você copiar um ID da interface do Google Ads e incluir os traços (por exemplo, usando 123-456-7890 em vez de 1234567890), a chamada de API vai falhar com um erro INVALID_CUSTOMER_ID.

Para mais detalhes, consulte o modelo de acesso do Google Ads e a estrutura de chamada de API.

Observação:as instruções da biblioteca de cliente podem se referir a uma versão específica da biblioteca. Ele é apenas para fins ilustrativos. Você pode usar a versão mais recente da biblioteca de cliente, a menos que seja expressamente indicado.
Dica:quer executar mais consultas de relatórios? Consulte nosso criador de consultas GAQL. Saiba mais sobre relatórios.

Selecione o cliente de sua preferência para instruções sobre como fazer uma chamada de API:

Java
C#
PHP
Python
Ruby
Perl
curl

Os artefatos da biblioteca de cliente são publicados no repositório Maven central. Adicione a biblioteca de cliente como uma dependência ao seu projeto da seguinte maneira:

A dependência do Maven é:

<dependency>
  <groupId>com.google.api-ads</groupId>
  <artifactId>google-ads</artifactId>
  <version>46.0.0</version>
</dependency>

A dependência do Gradle é:

implementation 'com.google.api-ads:google-ads:46.0.0'

Também recomendamos usar a lista de materiais (BOM) da API Google Ads (link em inglês) para gerenciar versões de dependência. Consulte o guia de BOM para instruções.

Crie um arquivo ~/ads.properties com o seguinte conteúdo.

api.googleads.serviceAccountSecretsPath=JSON_KEY_FILE_PATH
api.googleads.loginCustomerId=INSERT_LOGIN_CUSTOMER_ID_HERE

Crie um objeto GoogleAdsClient da seguinte forma:

GoogleAdsClient googleAdsClient = null;
try {
  googleAdsClient = GoogleAdsClient.newBuilder().fromPropertiesFile().build();
} catch (FileNotFoundException fnfe) {
  System.err.printf(
      "Failed to load GoogleAdsClient configuration from file. Exception: %s%n",
      fnfe);
  System.exit(1);
} catch (IOException ioe) {
  System.err.printf("Failed to create GoogleAdsClient. Exception: %s%n", ioe);
  System.exit(1);
}

Em seguida, execute um relatório de campanha usando o método GoogleAdsService.SearchStream para recuperar as campanhas na sua conta.

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

Se você encontrar erros ao fazer sua primeira chamada, consulte Como lidar com erros da API para orientações sobre solução de problemas.

Anterior
Introdução
Avançar
Tratar erros
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-15 UTC.