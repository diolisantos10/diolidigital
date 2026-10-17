---
titulo: "Google Identity — OAuth 2.0 para apps de servidor web (refresh token)"
url: https://developers.google.com/identity/protocols/oauth2/web-server?hl=pt-br
capturado_em: 2026-10-17
hash: 9bacf6d1ad897db0
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Como usar o OAuth 2.0 para aplicativos de servidor da Web
Nesta página
Bibliotecas de cliente
Pré-requisitos
Ativar as APIs do projeto
Criar credenciais de autorização
Identificar escopos de acesso

Neste documento, explicamos como os apps de servidor da Web usam as bibliotecas de cliente das APIs ou os endpoints OAuth 2.0 do Google para implementar a autorização desse protocolo e acessar as APIs do Google.

O OAuth 2.0 permite que os usuários compartilhem dados específicos com um aplicativo, mantendo a privacidade de nomes de usuário, senhas e outras informações. Por exemplo, um aplicativo pode usar o OAuth 2.0 para receber permissão dos usuários para armazenar arquivos no Google Drive deles.

Esse fluxo do OAuth 2.0 é específico para autorização do usuário. Ele foi projetado para aplicativos que podem armazenar informações confidenciais e manter o estado. Um aplicativo de servidor da Web devidamente autorizado pode acessar uma API enquanto o usuário interage com o aplicativo ou depois que o usuário sai dele.

Os aplicativos de servidor da Web também costumam usar contas de serviço para autorizar solicitações de API, principalmente ao chamar APIs do Cloud para acessar dados baseados em projetos, em vez de dados específicos do usuário. Os aplicativos de servidor da Web podem usar contas de serviço em conjunto com a autorização do usuário.

Observação:dadas as implicações de segurança de uma implementação correta, recomendamos que você use as bibliotecas do OAuth 2.0 ao interagir com os endpoints do OAuth 2.0 do Google. É uma prática recomendada usar códigos bem depurados fornecidos por terceiros, o que ajuda a proteger você e seus usuários. Para mais informações, consulte Bibliotecas de cliente.
Bibliotecas de cliente

Os exemplos específicos para cada linguagem nesta página usam bibliotecas de cliente das APIs do Google para implementar a autorização do OAuth 2.0. Para executar os exemplos de código, primeiro instale a biblioteca de cliente para sua linguagem.

Quando você usa uma biblioteca de cliente de APIs do Google para processar o fluxo do OAuth 2.0 do seu aplicativo, ela realiza muitas ações que o aplicativo precisaria processar por conta própria. Por exemplo, ele determina quando o aplicativo pode usar ou atualizar tokens de acesso armazenados, bem como quando o aplicativo precisa solicitar o consentimento novamente. A biblioteca de cliente também gera URLs de redirecionamento corretos e ajuda a implementar gerenciadores de redirecionamento que trocam códigos de autorização por tokens de acesso.

As bibliotecas de cliente de APIs do Google para aplicativos do lado do servidor estão disponíveis nas seguintes linguagens:

Go
Java
.NET
Node.js
Dart
PHP
Python
Ruby
Importante:a biblioteca de cliente da API do Google para JavaScript e o Fazer login com o Google são destinados apenas ao processamento do OAuth 2.0 no navegador do usuário. Se você quiser usar JavaScript no lado do servidor para gerenciar interações do OAuth 2.0 com o Google, use a biblioteca do Node.js na sua plataforma de back-end.
Pré-requisitos
Ativar as APIs do projeto

Qualquer aplicativo que chame as APIs do Google precisa ativá-las no Console de APIs.

Para ativar uma API para um projeto, faça o seguinte:

Abra a biblioteca de APIs no Console de APIs do Google.
Se for solicitado, selecione um projeto ou crie um novo.
A biblioteca de APIs lista todas as APIs disponíveis agrupadas por família de produtos e popularidade. Se a API que você quer ativar não estiver visível na lista, use a pesquisa para encontrá-la ou clique em Ver tudo na família de produtos a que ela pertence.
Selecione aquela que você quer habilitar e clique no botão Ativar.
Se necessário, ative o faturamento.
Se for solicitado, leia e aceite os Termos de Serviço da API.
Criar credenciais de autorização

Qualquer aplicativo que use o OAuth 2.0 para acessar as APIs do Google precisa ter credenciais de autorização que o identifiquem para o servidor OAuth 2.0 do Google. As etapas a seguir explicam como criar credenciais para seu projeto. Seus aplicativos podem usar as credenciais para acessar as APIs que você ativou para esse projeto.

Acesse a página Clientes.
Clique em Criar cliente.
Selecione o tipo de aplicativo Aplicativo da Web.
Preencha o formulário e clique em Criar. Os aplicativos que usam linguagens e frameworks como PHP, Java, Python, Ruby e .NET precisam especificar URIs de redirecionamento autorizados. Os URIs de redirecionamento são os endpoints para os quais o servidor OAuth 2.0 pode enviar respostas. Esses endpoints precisam seguir as regras de validação do Google.

Para testes, é possível especificar URIs que se referem à máquina local, como http://localhost:8080. Todos os exemplos neste documento usam http://localhost:8080 como o URI de redirecionamento.

Recomendamos que você projete os endpoints de autenticação do seu app para que ele não exponha códigos de autorização a outros recursos na página.

Depois de criar suas credenciais, faça o download do arquivo client_secret.json no Console de APIs. Armazene o arquivo com segurança em um local que só seu aplicativo possa acessar.

Importante:não armazene o arquivo client_secret.json em um local acessível ao público. Além disso, se você compartilhar o código-fonte do seu aplicativo, por exemplo, no GitHub, armazene o arquivo client_secret.json fora da árvore de origem para evitar o compartilhamento acidental da chave secreta do cliente.

A chave secreta do cliente do aplicativo só vai aparecer depois que você criar o cliente. Não será possível acessar ou fazer o download da chave secreta do cliente novamente. Saiba mais .

Identificar escopos de acesso

Os escopos permitem que o aplicativo solicite acesso apenas aos recursos necessários e que os usuários controlem o nível de acesso concedido ao aplicativo. Assim, pode haver uma relação inversa entre o número de escopos solicitados e a probabilidade de receber o consentimento do usuário.

Antes de começar a implementar a autorização do OAuth 2.0, recomendamos que você identifique os escopos que seu app precisará de permissão para acessar.

Também recomendamos que seu aplicativo solicite acesso aos escopos de autorização por um processo de autorização incremental, em que o aplicativo solicita acesso aos dados do usuário no contexto. Essa prática recomendada ajuda os usuários a entenderem com mais facilidade por que o aplicativo precisa do acesso que está solicitando.

O documento Escopos da API OAuth 2.0 contém uma lista completa de escopos que podem ser usados para acessar as APIs do Google.

Se o aplicativo público usa escopos que permitem o acesso a determinados dados do usuário, ele precisa passar por um processo de verificação. Se você encontrar a mensagem app não verificado na tela ao testar seu aplicativo, envie uma solicitação de verificação para removê-la. Saiba mais sobre apps não verificados e confira as respostas para perguntas frequentes sobre a verificação de apps na Central de Ajuda.
Requisitos específicos de idioma

Para executar qualquer um dos exemplos de código neste documento, você precisa de uma Conta do Google, acesso à Internet e um navegador da Web. Se você estiver usando uma das bibliotecas de cliente da API, consulte também os requisitos específicos da linguagem nas seções a seguir.

PHP
Python
Ruby
Node.js
HTTP/REST

Para executar os exemplos de código PHP neste documento, você precisa de:

PHP 8.0 ou mais recente com a interface de linha de comando (CLI) e a extensão JSON instaladas.
A ferramenta de gerenciamento de dependências Composer.

A biblioteca de cliente das APIs do Google para PHP:

composer require google/apiclient:^2.15.0

Consulte a biblioteca de cliente das APIs do Google para PHP para mais informações.

Como conseguir tokens de acesso do OAuth 2.0

As etapas a seguir mostram como seu aplicativo interage com o servidor OAuth 2.0 do Google para receber o consentimento do usuário para realizar uma solicitação de API em nome dele. Seu aplicativo precisa ter esse consentimento antes de executar uma solicitação de API do Google que exija autorização do usuário.

A lista a seguir resume essas etapas:

O aplicativo identifica as permissões necessárias.
O aplicativo redireciona o usuário para o Google com a lista de permissões solicitadas.
O usuário decide se vai conceder as permissões ao aplicativo.
Seu aplicativo descobre o que o usuário decidiu.
Se o usuário conceder as permissões solicitadas, o aplicativo vai recuperar os tokens necessários para fazer solicitações de API em nome do usuário.
Etapa 1: definir os parâmetros de autorização

A primeira etapa é criar o pedido de autorização. Essa solicitação define parâmetros que identificam o aplicativo e as permissões que o usuário precisa conceder a ele.

Se você usar uma biblioteca de cliente do Google para autenticação e autorização do OAuth 2.0, crie e configure um objeto que defina esses parâmetros.
Se você chamar o endpoint do OAuth 2.0 do Google diretamente, vai gerar um URL e definir os parâmetros nele.

As guias a seguir definem os parâmetros de autorização compatíveis com aplicativos de servidor da Web. Os exemplos específicos de linguagem também mostram como usar uma biblioteca de cliente ou de autorização para configurar um objeto que define esses parâmetros:

PHP
Python
Ruby
Node.js
HTTP/REST

O snippet de código abaixo cria um objeto Google\Client(), que define os parâmetros na solicitação de autorização.

Esse objeto usa informações do arquivo client_secret.json para identificar seu aplicativo. Consulte Como criar credenciais de autorização para saber mais sobre esse arquivo. O objeto também identifica os escopos que seu aplicativo está solicitando permissão para acessar e o URL do endpoint de autenticação do seu aplicativo, que vai processar a resposta do servidor OAuth 2.0 do Google. Por fim, o código define os parâmetros opcionais access_type e include_granted_scopes.

Por exemplo, este código solicita acesso off-line somente leitura aos metadados do Google Drive e aos eventos da agenda de um usuário:

use Google\Client;

$client = new Client();

// Required, call the setAuthConfig function to load authorization credentials from
// client_secret.json file.
$client->setAuthConfig('client_secret.json');

// Required, to set the scope value, call the addScope function
$client->addScope([Google\Service\Drive::DRIVE_METADATA_READONLY, Google\Service\Calendar::CALENDAR_READONLY]);

// Required, call the setRedirectUri function to specify a valid redirect URI for the
// provided client_id
$client->setRedirectUri('http://' . $_SERVER['HTTP_HOST'] . '/oauth2callback.php');

// Recommended, offline access will give you both an access and refresh token so that
// your app can refresh the access token without user interaction.
$client->setAccessType('offline');

// Recommended, call the setState function. Using a state value can increase your assurance that
// an incoming connection is the result of an authentication request.
$client->setState($sample_passthrough_value);

// Optional, if your application knows which user is trying to authenticate, it can use this
// parameter to provide a hint to the Google Authentication Server.
$client->setLoginHint('hint@example.com');

// Optional, call the setPrompt function to set "consent" will prompt the user for consent
$client->setPrompt('consent');

// Optional, call the setIncludeGrantedScopes function with true to enable incremental
// authorization
$client->setIncludeGrantedScopes(true);

O servidor de autorização do Google é compatível com os seguintes parâmetros de string de consulta para aplicativos de servidor da Web:

Parâmetros
client_id	Obrigatório

O ID do cliente do aplicativo. Esse valor pode ser encontrado na página Clientes do console do Cloud.

redirect_uri	Obrigatório

Determina para onde o servidor de API redireciona o usuário depois que ele conclui o fluxo de autorização. O valor precisa corresponder exatamente a um dos URIs de redirecionamento autorizados para o cliente OAuth 2.0, que você configurou na página Clientes do Console do Cloud do cliente. Se esse valor não corresponder a um URI de redirecionamento autorizado para o client_id fornecido, você vai receber um erro redirect_uri_mismatch.

O esquema http ou https, as letras maiúsculas e minúsculas e a barra final ('/') precisam ser iguais.

response_type	Obrigatório

Determina se o endpoint do OAuth 2.0 do Google retorna um código de autorização.

Defina o valor do parâmetro como code para aplicativos de servidor da Web.

scope	Obrigatório

Uma lista de escopos delimitada por espaços que identifica os recursos que seu aplicativo pode acessar em nome do usuário. Esses valores informam a tela de permissão que o Google mostra ao usuário.

Os escopos permitem que o aplicativo solicite acesso apenas aos recursos necessários, além de permitir que os usuários controlem o nível de acesso concedido ao aplicativo. Assim, há uma relação inversa entre o número de escopos solicitados e a probabilidade de obter o consentimento do usuário.

Recomendamos que seu aplicativo solicite acesso aos escopos de autorização no contexto sempre que possível. Ao solicitar acesso aos dados do usuário de acordo com o contexto, usando a autorização incremental, você ajuda os usuários a entender por que o aplicativo precisa do acesso solicitado.

access_type	Recomendado

Indica se o aplicativo pode atualizar tokens de acesso quando o usuário não está presente no navegador. Os valores de parâmetro válidos são online, que é o valor padrão, e offline.

Defina o valor como offline se o aplicativo precisar atualizar os tokens de acesso quando o usuário não estiver presente no navegador. Esse é o método de atualização de tokens de acesso descrito mais adiante neste documento. Esse valor instrui o servidor de autorização do Google a retornar um token de atualização e um token de acesso na primeira vez que o aplicativo trocar um código de autorização por tokens.

state	Recomendado

Especifica qualquer valor de string que o aplicativo usa para manter o estado entre a solicitação de autorização e a resposta do servidor de autorização. O servidor retorna o valor exato que você envia como um par name=value no componente de consulta de URL (?) do redirect_uri depois que o usuário consente ou nega a solicitação de acesso do aplicativo.

É possível usar esse parâmetro para várias finalidades, como direcionar o usuário ao recurso correto no aplicativo, enviar nonces e reduzir a falsificação de solicitações entre sites. Como seu redirect_uri pode ser adivinhado, usar um valor state pode aumentar a garantia de que uma conexão recebida é o resultado de uma solicitação de autenticação. Se você gerar uma string aleatória ou codificar o hash de um cookie ou outro valor que capture o estado do cliente, poderá validar a resposta para garantir que a solicitação e a resposta tenham se originado no mesmo navegador, fornecendo proteção contra ataques como falsificação de solicitação entre sites. Consulte a documentação do OpenID Connect para ver um exemplo de como criar e confirmar um token state.

Importante:o cliente OAuth precisa impedir a CSRF, conforme indicado na especificação do OAuth2 . Uma maneira de fazer isso é usar o parâmetro state para manter o estado entre a solicitação de autorização e a resposta do servidor de autorização.

include_granted_scopes	Opcional

Permite que os aplicativos usem a autorização incremental para solicitar acesso a outros escopos no contexto. Se você definir o valor desse parâmetro como true e a solicitação de autorização for concedida, o novo token de acesso também vai abranger todos os escopos para os quais o usuário já concedeu acesso ao aplicativo. Consulte a seção de autorização incremental para ver exemplos.

enable_granular_consent	Opcional

O valor padrão é true. Se definido como false, as permissões mais granulares da Conta do Google serão desativadas para IDs de cliente OAuth criados antes de 2019. Não tem efeito para IDs de cliente OAuth mais recentes, já que as permissões mais granulares estão sempre ativadas para eles.

Quando o Google ativar as permissões granulares para um aplicativo, esse parâmetro não terá mais efeito.

login_hint	Opcional

Se o aplicativo souber qual usuário está tentando se autenticar, ele poderá usar esse parâmetro para fornecer uma dica ao servidor de autenticação do Google. O servidor usa a dica para simplificar o fluxo de login, preenchendo o campo de e-mail no formulário de login ou selecionando a sessão de login múltiplo apropriada.

Defina o valor do parâmetro como um endereço de e-mail ou identificador sub, que é equivalente ao ID do Google do usuário.

prompt	Opcional

Uma lista de solicitações delimitada por espaços e que diferencia maiúsculas de minúsculas para apresentar ao usuário. Se você não especificar esse parâmetro, o usuário será solicitado apenas na primeira vez que o projeto solicitar acesso. Consulte Como solicitar um novo consentimento para mais informações.

Os valores possíveis são:

none	Não mostre telas de autenticação ou consentimento. Não pode ser especificado com outros valores.
consent	Peça o consentimento do usuário.
select_account	Peça para o usuário selecionar uma conta.
Etapa 2: redirecionar para o servidor OAuth 2.0 do Google

Redirecione o usuário para o servidor OAuth 2.0 do Google para iniciar o processo de autenticação e autorização. Normalmente, isso ocorre quando o aplicativo precisa acessar os dados do usuário pela primeira vez. No caso da autorização incremental, essa etapa também ocorre quando o aplicativo precisa acessar recursos adicionais que ele não tem permissão para acessar.

PHP
Python
Ruby
Node.js
HTTP/REST
Gere um URL para solicitar acesso do servidor OAuth 2.0 do Google:
$auth_url = $client->createAuthUrl();
Redirecione o usuário para $auth_url:
header('Location: ' . filter_var($auth_url, FILTER_SANITIZE_URL));

O servidor OAuth 2.0 do Google autentica o usuário e recebe o consentimento dele para que seu aplicativo acesse os escopos solicitados. A resposta é enviada de volta ao aplicativo usando o URL de redirecionamento que você especificou.

Etapa 3: o Google pede o consentimento do usuário

Nesta etapa, o usuário decide se concede ao aplicativo o acesso solicitado. Nessa fase, o Google exibe uma janela de consentimento que mostra o nome do aplicativo e os serviços da API do Google que estão solicitando permissão de acesso com as credenciais de autorização do usuário e um resumo dos escopos de acesso a serem concedidos. O usuário pode consentir em conceder acesso a um ou mais escopos solicitados pelo aplicativo ou recusar a solicitação.

Seu aplicativo não precisa fazer nada nesse estágio, pois ele aguarda a resposta do servidor OAuth 2.0 do Google indicando se algum acesso foi concedido. Essa resposta é explicada na próxima etapa.

Erros

As solicitações para o endpoint de autorização do OAuth 2.0 do Google podem exibir mensagens de erro voltadas ao usuário, em vez dos fluxos de autenticação e autorização esperados. Os códigos de erro comuns e as resoluções sugeridas são:

admin_policy_enforced

A Conta do Google não pode autorizar um ou mais escopos solicitados devido às políticas do administrador do Google Workspace. Consulte o artigo de ajuda para admins do Google Workspace Controlar os apps internos e de terceiros com acesso aos dados do Google Workspace para mais informações sobre como um administrador pode restringir o acesso a todos os escopos ou aos escopos sensíveis e restritos até que o acesso seja explicitamente concedido ao ID do cliente OAuth.

disallowed_useragent

O endpoint de autorização é exibido em um user agent incorporado não permitido pelas políticas do OAuth 2.0 do Google.

Os desenvolvedores de iOS e macOS podem encontrar esse erro ao abrir solicitações de autorização no WKWebView. Em vez disso, os desenvolvedores precisam usar bibliotecas do iOS, como o Login do Google para iOS ou o AppAuth para iOS da OpenID Foundation.

Os desenvolvedores web podem encontrar esse erro quando um app para iOS ou macOS abre um link da Web geral em um user agent incorporado e um usuário acessa o endpoint de autorização do OAuth 2.0 do Google no seu site. Os desenvolvedores precisam permitir que links gerais sejam abertos no gerenciador de links padrão do sistema operacional, o que inclui os gerenciadores de links universais ou o app de navegador padrão. A biblioteca SFSafariViewController também é uma opção compatível.

org_internal

O ID do cliente OAuth na solicitação faz parte de um projeto que limita o acesso às Contas do Google em uma organização específica do Google Cloud. Para mais informações sobre essa opção de configuração, consulte a seção Tipo de usuário no artigo de ajuda "Como configurar a tela de permissão OAuth".

invalid_client

A chave secreta do cliente OAuth está incorreta. Revise a configuração do cliente OAuth, incluindo o ID do cliente e a chave secreta usados para essa solicitação.

deleted_client

O cliente OAuth usado para fazer a solicitação foi excluído. A exclusão pode acontecer de forma manual ou automática no caso de clientes não utilizados . Os clientes excluídos podem ser restaurados em até 30 dias após a exclusão. Saiba mais .

invalid_grant

Ao atualizar um token de acesso ou usar a autorização incremental, o token pode ter expirado ou sido invalidado. Autentique o usuário novamente e peça o consentimento do usuário para obter novos tokens. Se o erro persistir, verifique se o aplicativo foi configurado corretamente e se você está usando os tokens e parâmetros corretos na solicitação. Caso contrário, é possível que a conta do usuário tenha sido excluída ou desativada.

redirect_uri_mismatch

O redirect_uri transmitido na solicitação de autorização não corresponde a um URI de redirecionamento autorizado para o ID do cliente OAuth. Revise os URIs de redirecionamento autorizados na página Clientes do console do Google Cloud.

O parâmetro redirect_uri pode se referir ao fluxo fora de banda (OOB, na sigla em inglês) do OAuth, que foi descontinuado e não é mais compatível. Consulte o guia de migração para atualizar sua integração.

invalid_request

Ocorreu um erro na sua solicitação. Isso pode acontecer por vários motivos:

A solicitação não foi formatada corretamente
A solicitação não tinha os parâmetros obrigatórios
A solicitação usa um método de autorização que não é aceito pelo Google. Verifique se a integração do OAuth usa um método de integração recomendado
Etapa 4: processar a resposta do servidor OAuth 2.0
Importante:antes de processar a resposta do OAuth 2.0 no servidor, confirme se o state recebido do Google corresponde ao state enviado na solicitação de autorização. Essa verificação ajuda a garantir que o usuário, e não um script malicioso, esteja fazendo a solicitação e reduz o risco de ataques CSRF.

O servidor OAuth 2.0 responde à solicitação de acesso do aplicativo usando o URL especificado na solicitação.

Se o usuário aprovar a solicitação de acesso, a resposta vai conter um código de autorização. Se o usuário não aprovar a solicitação, a resposta vai conter uma mensagem de erro. O código de autorização ou a mensagem de erro retornada ao servidor da Web aparece na string de consulta, como mostrado nos exemplos a seguir:

Uma resposta de erro:

https://oauth2.example.com/auth?error=access_denied

Uma resposta de código de autorização:

https://oauth2.example.com/auth?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7
Importante:se o endpoint de resposta renderizar uma página HTML, todos os recursos nessa página poderão ver o código de autorização no URL. Os scripts podem ler o URL diretamente, e o URL no cabeçalho HTTP Referer pode ser enviado para qualquer um ou todos os recursos na página.

Considere cuidadosamente se você quer enviar credenciais de autorização para todos os recursos nessa página (especialmente scripts de terceiros, como plug-ins sociais e análises). Para evitar esse problema, recomendamos que o servidor primeiro processe a solicitação e, em seguida, redirecione para outro URL que não inclua os parâmetros de resposta.

Exemplo de resposta do servidor OAuth 2.0

Para testar esse fluxo, clique no URL de exemplo a seguir, que solicita acesso somente leitura para visualizar metadados de arquivos no Google Drive e acesso somente leitura para visualizar seus eventos do Google Agenda:

https://accounts.google.com/o/oauth2/v2/auth?
 scope=https%3A//www.googleapis.com/auth/drive.metadata.readonly%20https%3A//www.googleapis.com/auth/calendar.readonly&
 access_type=offline&
 include_granted_scopes=true&
 response_type=code&
 state=state_parameter_passthrough_value&
 redirect_uri=https%3A//developers.google.com/oauthplayground&
 client_id=client_id

Depois de concluir o fluxo do OAuth 2.0, o navegador vai redirecionar você para o OAuth 2.0 Playground, uma ferramenta para testar fluxos do OAuth. Você vai notar que o OAuth 2.0 Playground capturou automaticamente o código de autorização.

Etapa 5: trocar o código de autorização por tokens de atualização e acesso

Depois que o servidor da Web recebe o código de autorização, ele pode trocar o código de autorização por um token de acesso.

PHP
Python
Ruby
Node.js
HTTP/REST

Para trocar um código de autorização por um token de acesso, use o método fetchAccessTokenWithAuthCode:

$access_token = $client->fetchAccessTokenWithAuthCode($_GET['code']);
Erros

Ao trocar o código de autorização por um token de acesso, você pode encontrar o seguinte erro em vez da resposta esperada. Os códigos do erro comuns e as resoluções sugeridas estão listados nesta seção.

invalid_grant

O código de autorização fornecido é inválido ou está no formato incorreto. Solicite um novo código reiniciando o processo OAuth para pedir o consentimento do usuário novamente.

Etapa 6: verificar quais escopos os usuários concederam

Ao solicitar várias permissões (escopos), os usuários podem não conceder ao app acesso a todas elas. Seu app precisa verificar quais escopos foram realmente concedidos e lidar de forma adequada com situações em que algumas permissões são negadas, normalmente desativando os recursos que dependem desses escopos negados.

No entanto, há exceções. Os apps do Google Workspace Enterprise com delegação de autoridade em todo o domínio ou marcados como Confiáveis ignoram a tela de permissão granular. Para esses apps, os usuários não vão ver a tela de permissão granular. Em vez disso, o app vai receber todos os escopos solicitados ou nenhum.

Para mais informações, consulte Como processar permissões granulares.

PHP
Python
Ruby
Node.js
HTTP/REST

Para verificar quais escopos o usuário concedeu, use o método getGrantedScope():

// Space-separated string of granted scopes if it exists, otherwise null.
$granted_scopes = $client->getOAuth2Service()->getGrantedScope();

// Determine which scopes user granted and build a dictionary
$granted_scopes_dict = [
  'Drive' => str_contains($granted_scopes, Google\Service\Drive::DRIVE_METADATA_READONLY),
  'Calendar' => str_contains($granted_scopes, Google\Service\Calendar::CALENDAR_READONLY)
];
Chamar APIs do Google
PHP
Python
Ruby
Node.js
HTTP/REST

Use o token de acesso para chamar as APIs do Google seguindo estas etapas:

Se você precisar aplicar um token de acesso a um novo objeto Google\Client, por exemplo, se tiver armazenado o token de acesso em uma sessão de usuário, use o método setAccessToken:
$client->setAccessToken($access_token);
Crie um objeto de serviço para a API que você quer chamar. Para criar um objeto de serviço, forneça um objeto Google\Client autorizado ao construtor da API que você quer chamar. Por exemplo, para chamar a API Drive:
$drive = new Google\Service\Drive($client);
Faça solicitações ao serviço da API usando a interface fornecida pelo objeto de serviço. Por exemplo, para listar os arquivos no Google Drive do usuário autenticado:
$files = $drive->files->listFiles(array());
Exemplo completo

O exemplo a seguir mostra uma lista em formato JSON de arquivos no Google Drive de um usuário depois que ele faz a autenticação e autoriza o aplicativo a acessar os metadados do Drive.

PHP
Python
Ruby
Node.js
HTTP/REST

Para executar esse exemplo:

No console de APIs, adicione o URL da máquina local à lista de URLs de redirecionamento. Por exemplo, adicione http://localhost:8080.
Crie um novo diretório e mude para ele. Exemplo:
mkdir ~/php-oauth2-example
cd ~/php-oauth2-example
Instale a biblioteca de cliente da API do Google para PHP usando o Composer:
composer require google/apiclient:^2.15.0
Crie os arquivos index.php e oauth2callback.php com o conteúdo a seguir.
Execute o exemplo com o servidor da Web de teste integrado do PHP:
php -S localhost:8080 ~/php-oauth2-example
index.php
<?php
require_once __DIR__.'/vendor/autoload.php';

session_start();

$client = new Google\Client();
$client->setAuthConfig('client_secret.json');

// User granted permission as an access token is in the session.
if (isset($_SESSION['access_token']) && $_SESSION['access_token'])
{
  $client->setAccessToken($_SESSION['access_token']);
  
  // Check if user granted Drive permission
  if ($_SESSION['granted_scopes_dict']['Drive']) {
    echo "Drive feature is enabled.";
    echo "</br>";
    $drive = new Drive($client);
    $files = array();
    $response = $drive->files->listFiles(array());
    foreach ($response->files as $file) {
        echo "File: " . $file->name . " (" . $file->id . ")";
        echo "</br>";
    }
  } else {
    echo "Drive feature is NOT enabled.";
    echo "</br>";
  }

   // Check if user granted Calendar permission
  if ($_SESSION['granted_scopes_dict']['Calendar']) {
    echo "Calendar feature is enabled.";
    echo "</br>";
  } else {
    echo "Calendar feature is NOT enabled.";
    echo "</br>";
  }
}
else
{
  // Redirect users to outh2call.php which redirects users to Google OAuth 2.0
  $redirect_uri = 'http://' . $_SERVER['HTTP_HOST'] . '/oauth2callback.php';
  header('Location: ' . filter_var($redirect_uri, FILTER_SANITIZE_URL));
}
?>
oauth2callback.php
<?php
require_once __DIR__.'/vendor/autoload.php';

session_start();

$client = new Google\Client();

// Required, call the setAuthConfig function to load authorization credentials from
// client_secret.json file.
$client->setAuthConfigFile('client_secret.json');
$client->setRedirectUri('http://' . $_SERVER['HTTP_HOST']. $_SERVER['PHP_SELF']);

// Required, to set the scope value, call the addScope function.
$client->addScope([Google\Service\Drive::DRIVE_METADATA_READONLY, Google\Service\Calendar::CALENDAR_READONLY]);

// Enable incremental authorization. Recommended as a best practice.
$client->setIncludeGrantedScopes(true);

// Recommended, offline access will give you both an access and refresh token so that
// your app can refresh the access token without user interaction.
$client->setAccessType("offline");

// Generate a URL for authorization as it doesn't contain code and error
if (!isset($_GET['code']) && !isset($_GET['error']))
{
  // Generate and set state value
  $state = bin2hex(random_bytes(16));
  $client->setState($state);
  $_SESSION['state'] = $state;

  // Generate a url that asks permissions.
  $auth_url = $client->createAuthUrl();
  header('Location: ' . filter_var($auth_url, FILTER_SANITIZE_URL));
}

// User authorized the request and authorization code is returned to exchange access and
// refresh tokens.
if (isset($_GET['code']))
{
  // Check the state value
  if (!isset($_GET['state']) || $_GET['state'] !== $_SESSION['state']) {
    die('State mismatch. Possible CSRF attack.');
  }

  // Get access and refresh tokens (if access_type is offline)
  $token = $client->fetchAccessTokenWithAuthCode($_GET['code']);

  /** Save access and refresh token to the session variables.
    * ACTION ITEM: In a production app, you likely want to save the
    *              refresh token in a secure persistent storage instead. */
  $_SESSION['access_token'] = $token;
  $_SESSION['refresh_token'] = $client->getRefreshToken();
  
  // Space-separated string of granted scopes if it exists, otherwise null.
  $granted_scopes = $client->getOAuth2Service()->getGrantedScope();

  // Determine which scopes user granted and build a dictionary
  $granted_scopes_dict = [
    'Drive' => str_contains($granted_scopes, Google\Service\Drive::DRIVE_METADATA_READONLY),
    'Calendar' => str_contains($granted_scopes, Google\Service\Calendar::CALENDAR_READONLY)
  ];
  $_SESSION['granted_scopes_dict'] = $granted_scopes_dict;
  
  $redirect_uri = 'http://' . $_SERVER['HTTP_HOST'] . '/';
  header('Location: ' . filter_var($redirect_uri, FILTER_SANITIZE_URL));
}

// An error response e.g. error=access_denied
if (isset($_GET['error']))
{
  echo "Error: ". $_GET['error'];
}
?>
Regras de validação de URI de redirecionamento

O Google aplica as seguintes regras de validação para redirecionar URIs para ajudar os desenvolvedores a manter os aplicativos seguros. Os URIs de redirecionamento precisam seguir estas regras. Consulte a seção 3 da RFC 3986 para ver a definição de domínio, host, caminho, consulta, esquema e informações do usuário, usados nessas regras.

Regras de validação
Esquema	

Os URIs de redirecionamento precisam usar o esquema HTTPS, não HTTP simples. Os URIs de host local (incluindo URIs de endereço IP de host local) estão isentos dessa regra.

Host	

Os hosts não podem ser endereços IP brutos. Os endereços IP do localhost estão isentos dessa regra.

Domínio	
Os TLDs (domínios de nível superior) do host precisam pertencer à lista de sufixos públicos.
Os domínios hospedados não podem ser “googleusercontent.com”.
Os URIs de redirecionamento não podem conter domínios de encurtamento de URL (por exemplo, goo.gl), a menos que o app seja o proprietário do domínio. Além disso, se um app que possui um domínio de encurtador optar por redirecionar para esse domínio, o URI de redirecionamento precisará conter “/google-callback/” no caminho ou terminar com “/google-callback”.

Userinfo	

Os URIs de redirecionamento não podem conter o subcomponente userinfo.

Caminho	

Os URIs de redirecionamento não podem conter uma travessia de caminho (também chamada de retrocesso de diretório), que é representada por um “/..” ou “\..” ou pela codificação de URL deles.

Consulta	

Os URIs de redirecionamento não podem conter redirecionamentos abertos.

Fragmentos	

Os URIs de redirecionamento não podem conter o componente de fragmento.

Caracteres	Os URIs de redirecionamento não podem conter determinados caracteres, incluindo:
Caracteres curinga ('*')
Caracteres ASCII não imprimíveis
Codificações por percentual inválidas (qualquer codificação por percentual que não siga o formato de codificação de URL de um sinal de porcentagem seguido por dois dígitos hexadecimais)
Caracteres nulos (um caractere NULL codificado, por exemplo, %00, %C0%80)
Autorização incremental

No protocolo OAuth 2.0, seu app solicita autorização para acessar recursos, que são identificados por escopos. É considerada uma prática recomendada de experiência do usuário solicitar autorização para recursos no momento em que você precisa deles. Para permitir essa prática, o servidor de autorização do Google oferece suporte à autorização incremental. Esse recurso permite solicitar escopos conforme necessário e, se o usuário conceder permissão para o novo escopo, retornar um código de autorização que pode ser trocado por um token que contém todos os escopos que o usuário concedeu ao projeto.

Por exemplo, um app que permite que as pessoas testem faixas de música e criem mixagens pode precisar de poucos recursos no momento do login, talvez apenas o nome da pessoa que está fazendo login. No entanto, para salvar uma mixagem concluída, é necessário ter acesso ao Google Drive. A maioria das pessoas acharia natural se o acesso ao Google Drive fosse solicitado apenas quando o app realmente precisasse dele.

Nesse caso, no momento do login, o app pode solicitar os escopos openid e profile para realizar o login básico e, depois, solicitar o escopo https://www.googleapis.com/auth/drive.file no momento da primeira solicitação para salvar uma mixagem.

Para implementar a autorização incremental, conclua o fluxo normal para solicitar um token de acesso, mas verifique se a solicitação de autorização inclui escopos concedidos anteriormente. Essa abordagem evita que o app precise gerenciar vários tokens de acesso.

As regras a seguir se aplicam a um token de acesso recebido de uma autorização incremental:

O token pode ser usado para acessar recursos correspondentes a qualquer um dos escopos incluídos na nova autorização combinada.
Quando você usa o token de atualização para a autorização combinada para receber um token de acesso, o token de acesso representa a autorização combinada e pode ser usado para qualquer um dos valores de scope incluídos na resposta.
A autorização combinada inclui todos os escopos que o usuário concedeu ao projeto da API, mesmo que as concessões tenham sido solicitadas de clientes diferentes. Por exemplo, se um usuário concedeu acesso a um escopo usando o cliente para computador de um aplicativo e, em seguida, concedeu outro escopo ao mesmo aplicativo por um cliente móvel, a autorização combinada incluiria os dois escopos.
Se você revogar um token que representa uma autorização combinada, o acesso a todos os escopos dessa autorização em nome do usuário associado será revogado simultaneamente.
Atenção:se você optar por incluir escopos concedidos, os escopos concedidos anteriormente pelo usuário serão adicionados automaticamente à sua solicitação de autorização. Uma página de aviso ou erro poderá ser exibida se o app não estiver aprovado para solicitar todos os escopos que podem ser retornados na resposta. Consulte Apps não verificados para mais informações.

Os exemplos de código específicos para cada linguagem na Etapa 1: definir o redirecionamento de autorização para o servidor OAuth 2.0 do Google usam a autorização incremental. Os exemplos de código a seguir também mostram o código que você precisa adicionar para usar a autorização incremental.

PHP
Python
Ruby
Node.js
HTTP/REST
$client->setIncludeGrantedScopes(true);
Atualizar um token de acesso (acesso off-line)

Os tokens de acesso expiram periodicamente e se tornam credenciais inválidas para uma solicitação de API relacionada. É possível atualizar um token de acesso sem pedir permissão ao usuário (inclusive quando ele não está presente) se você tiver solicitado acesso off-line aos escopos associados ao token.

Se você usa uma biblioteca de cliente da API do Google, o objeto do cliente atualiza o token de acesso conforme necessário, desde que você configure esse objeto para acesso off-line.
Se você não estiver usando uma biblioteca de cliente, defina o parâmetro de consulta HTTP access_type como offline ao redirecionar o usuário para o servidor OAuth 2.0 do Google. Nesse caso, o servidor de autorização do Google retorna um token de atualização quando você troca um código de autorização por um token de acesso. Em seguida, se o token de acesso expirar (ou em qualquer outro momento), será possível usar um token de atualização para receber um novo token de acesso.

Solicitar acesso off-line é um requisito para qualquer aplicativo que precise acessar uma API do Google quando o usuário não estiver presente. Por exemplo, um app que realiza serviços de backup ou executa ações em horários predeterminados precisa atualizar o token de acesso quando o usuário não está presente. O estilo de acesso padrão é chamado de online.

Os aplicativos da Web do lado do servidor, os aplicativos instalados e os dispositivos recebem tokens de atualização durante o processo de autorização. Os tokens de atualização não costumam ser usados em aplicativos da Web do lado do cliente (JavaScript).

PHP
Python
Ruby
Node.js
HTTP/REST

Se o aplicativo precisar de acesso off-line a uma API do Google, defina o tipo de acesso do cliente da API como offline:

$client->setAccessType("offline");

Depois que um usuário concede acesso off-line aos escopos solicitados, você pode continuar usando o cliente da API para acessar as APIs do Google em nome do usuário quando ele estiver off-line. O objeto do cliente vai atualizar o token de acesso conforme necessário.

Revogação de token

Em alguns casos, um usuário pode querer revogar o acesso concedido a um aplicativo. Para revogar o acesso, o usuário precisa acessar as Configurações da conta. Consulte a seção Remover o acesso de sites ou apps de terceiros com acesso à sua conta no documento de suporte para mais informações.

Também é possível que um aplicativo revogue de forma programática o acesso concedido a ele. A revogação programática é importante em casos em que um usuário cancela a inscrição, remove um aplicativo ou os recursos da API exigidos por um app mudaram significativamente. Em outras palavras, parte do processo de remoção pode incluir uma solicitação de API para garantir que as permissões concedidas anteriormente ao aplicativo sejam removidas.

PHP
Python
Ruby
Node.js
HTTP/REST

Para revogar um token de maneira programática, chame revokeToken():

$client->revokeToken();
Importante:a revogação remove todos os escopos do OAuth 2.0 concedidos anteriormente a um projeto, invalidando todos os tokens de acesso ou tokens de atualização emitidos para todos os clientes registrados nesse projeto.
Observação:após uma resposta de revogação bem-sucedida, pode levar algum tempo para que a revogação tenha efeito total.
Acesso baseado no horário

O acesso baseado em tempo permite que um usuário conceda ao app acesso aos dados dele por um período limitado para concluir uma ação. O acesso por tempo limitado está disponível em alguns produtos do Google durante o fluxo de consentimento, permitindo que os usuários concedam acesso por um período limitado. Um exemplo é a API Data Portability, que permite uma transferência única de dados.

Quando um usuário concede ao aplicativo acesso com base no tempo, o token de atualização expira após a duração especificada. Os tokens de atualização podem ser invalidados antes em circunstâncias específicas. Consulte estes casos para mais detalhes. O campo refresh_token_expires_in retornado na resposta da troca de código de autorização representa o tempo restante até que o token de atualização expire nesses casos.

Implementar a Proteção entre Contas

Outra etapa que você deve seguir para proteger as contas dos usuários é implementar a Proteção entre Contas usando o serviço de Proteção entre Contas do Google. Esse serviço permite que você se inscreva para receber notificações de ocorrências de segurança que fornecem informações ao seu aplicativo sobre mudanças importantes na conta do usuário. Em seguida, você pode usar as informações para entrar em ação, dependendo de como decidir responder aos eventos.

Alguns exemplos de tipos de evento enviados ao seu app pelo serviço de Proteção entre Contas do Google são:

https://schemas.openid.net/secevent/risc/event-type/sessions-revoked
https://schemas.openid.net/secevent/oauth/event-type/token-revoked
https://schemas.openid.net/secevent/risc/event-type/account-disabled

Consulte a página Proteger contas de usuário com a Proteção entre Contas para saber como implementar a Proteção entre Contas e conferir a lista completa de eventos disponíveis.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-16 UTC.