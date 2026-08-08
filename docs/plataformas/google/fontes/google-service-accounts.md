---
titulo: "Google Identity — contas de serviço (JWT/2LO, domain-wide delegation)"
url: https://developers.google.com/identity/protocols/oauth2/service-account
capturado_em: 2026-08-08
hash: 5bf9e7d449509938
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Usar o OAuth 2.0 para aplicativos de servidor para servidor
Importante:se você estiver trabalhando com o Google Cloud, use contas de serviço e uma biblioteca de cliente do Cloud, a menos que planeje criar sua própria biblioteca de cliente. Não faça a autorização explicitamente, conforme descrito neste documento.Para mais informações, consulte a Visão geral da autenticação na documentação do Google Cloud.

O sistema Google OAuth 2.0 aceita interações de servidor para servidor, como as que ocorrem entre um aplicativo da Web e um serviço do Google. Para esse cenário, você precisa de uma conta de serviço, que pertence ao aplicativo, e não a um usuário final individual. O aplicativo chama as APIs do Google em nome da conta de serviço, evitando o envolvimento direto dos usuários. Esse cenário às vezes é chamado de "OAuth de duas pernas" ou "2LO". O termo relacionado "OAuth de três etapas" se refere a cenários em que seu aplicativo chama as APIs do Google em nome dos usuários finais e em que o consentimento do usuário às vezes é necessário.

Consulte Práticas recomendadas para contas de serviço para mais informações.

Normalmente, um aplicativo usa uma conta de serviço quando usa APIs do Google para trabalhar com os próprios dados, em vez dos dados de um usuário. Por exemplo, um aplicativo que usa o Google Cloud Datastore para persistência de dados usaria uma conta de serviço para autenticar as chamadas à API Datastore do Google Cloud.

Os administradores de domínio do Google Workspace também podem conceder às contas de serviço autoridade em todo o domínio para acessar dados do usuário em nome dos usuários no domínio.

Este documento descreve como um aplicativo pode concluir o fluxo do OAuth 2.0 de servidor para servidor usando uma biblioteca de cliente das APIs do Google (recomendado) ou HTTP.

Com algumas APIs do Google, é possível fazer chamadas de API autorizadas usando um JWT assinado em vez de usar o OAuth 2.0, o que pode economizar uma solicitação de rede. Consulte Adendo: autorização de conta de serviço sem OAuth.
Visão geral

Para oferecer suporte às interações de servidor para servidor, primeiro crie uma conta de serviço para seu projeto no Console de APIs. Se quiser acessar os dados dos usuários na sua conta do Google Workspace, delegue o acesso em todo o domínio à conta de serviço.

Em seguida, o aplicativo se prepara para fazer chamadas de API autorizadas usando as credenciais da conta de serviço para solicitar um token de acesso do servidor de autenticação OAuth 2.0.

Por fim, seu aplicativo pode usar o token de acesso para chamar as APIs do Google.

Recomendação:seu aplicativo pode concluir essas tarefas usando a biblioteca de cliente das APIs do Google para sua linguagem ou interagindo diretamente com o sistema OAuth 2.0 usando HTTP. No entanto, a mecânica das interações de autenticação de servidor para servidor exige que os aplicativos criem e assinem criptograficamente JSON Web Tokens (JWTs). Erros podem causar problemas graves que podem ter um impacto significativo na segurança do seu aplicativo.

Por isso, recomendamos usar bibliotecas, como as de cliente das APIs do Google, que abstraem a criptografia do código do seu aplicativo.

Criar uma conta de serviço

As credenciais de uma conta de serviço incluem um endereço de e-mail gerado que é exclusivo e pelo menos um par de chaves públicas/privadas. Se a delegação em todo o domínio estiver ativada, um ID do cliente também fará parte das credenciais da conta de serviço.

Se o aplicativo for executado no Google App Engine, uma conta de serviço será configurada automaticamente quando você criar o projeto.

Se o aplicativo for executado no Google Compute Engine, uma conta de serviço também será configurada automaticamente ao criar o projeto, mas você precisará especificar os escopos que o aplicativo precisa acessar ao criar uma instância do Google Compute Engine. Para mais informações, consulte Preparar uma instância para usar contas de serviço.

Se o aplicativo não for executado no Google App Engine ou no Google Compute Engine, será necessário obter essas credenciais no Console de APIs do Google. Para gerar credenciais de conta de serviço ou ver as credenciais públicas que você já gerou, faça o seguinte:

Crie primeiro uma conta de serviço:

Abra a página Contas de serviço.
Se for solicitado, selecione um projeto ou crie um novo.
Clique em  Criar conta de serviço.
Em Detalhes da conta de serviço, digite um nome, um ID e uma descrição para a conta de serviço e clique em Criar e continuar.
Opcional: em Conceder acesso a essa conta de serviço ao projeto, selecione os papéis do IAM que serão concedidos à conta de serviço.
Clique em Continuar.
Opcional: em Conceder aos usuários acesso a essa conta de serviço, adicione os usuários ou grupos que podem usar e gerenciar a conta de serviço.
Clique em Concluído.

Em seguida, crie uma chave de conta de serviço:

Clique no endereço de e-mail da conta de serviço que você criou.
Clique na guia Chaves.
Na lista suspensa Adicionar chave, selecione Criar nova chave.
Clique em Criar.
Seu novo par de chave pública/privada é gerado e transferido por download para sua máquina. Essa é a única cópia da chave privada. Você é responsável por armazená-la com segurança. Se você perder esse par de chaves, será necessário gerar outro.

Para saber mais, consulte Práticas recomendadas para gerenciar chaves de conta de serviço.

Você pode voltar ao Console de APIs a qualquer momento para conferir o endereço de e-mail, as impressões digitais da chave pública e outras informações, ou para gerar mais pares de chaves públicas/privadas. Para mais detalhes sobre as credenciais da conta de serviço no Console de APIs, consulte Contas de serviço no arquivo de ajuda do Console de APIs.

Anote o endereço de e-mail da conta de serviço e armazene o arquivo de chave privada em um local acessível ao seu aplicativo. Seu aplicativo precisa deles para fazer chamadas de API autorizadas.

Observação:armazene e gerencie chaves privadas com segurança nos ambientes de desenvolvimento e produção. O Google não mantém uma cópia das suas chaves privadas, apenas das públicas. Consulte a seção Como processar credenciais do cliente com segurança das políticas do OAuth 2.0 para mais informações.
Delegar autoridade em todo o domínio à conta de serviço

Com uma conta do Google Workspace, um administrador do Workspace da organização pode autorizar um aplicativo a acessar dados do usuário em nome de usuários no domínio do Google Workspace. Por exemplo, um aplicativo que usa a API Google Calendar para adicionar eventos às agendas de todos os usuários em um domínio do Google Workspace usa uma conta de serviço para acessar essa API em nome dos usuários. Autorizar uma conta de serviço a acessar dados em nome de usuários em um domínio é, às vezes, denominado "delegar autoridade em todo o domínio" a uma conta de serviço.

Observação:quando você usa o Google Workspace Marketplace para instalar um aplicativo no seu domínio, as permissões necessárias são concedidas automaticamente ao aplicativo durante a instalação. Não é necessário autorizar manualmente as contas de serviço usadas pelo aplicativo.
Observação:embora seja possível usar contas de serviço em aplicativos executados em um domínio do Google Workspace, elas não são membros da sua conta do Google Workspace e não estão sujeitas às políticas de domínio definidas pelos administradores do Google Workspace. Por exemplo, um conjunto de políticas definido no Admin Console do Google Workspace para restringir a capacidade dos usuários finais do Google Workspace de compartilhar documentos fora do domínio não se aplicaria às contas de serviço.

Para delegar autoridade em todo o domínio a uma conta de serviço, um superadministrador do domínio do Google Workspace precisa concluir as etapas a seguir:

No Admin Console do seu domínio do Google Workspace, acesse Menu principal > Segurança > Controle de acesso e dados > Controles de API.
No painel Delegação em todo o domínio, selecione Gerenciar a delegação em todo o domínio.
Clique em Adicionar novo.
No campo ID do cliente, digite o ID do cliente da conta de serviço. Você pode encontrar o ID do cliente da sua conta de serviço na página Contas de serviço.
No campo Escopos do OAuth (delimitados por vírgula), insira a lista de escopos a que seu aplicativo deve ter acesso. Por exemplo, se o aplicativo precisar de acesso total em todo o domínio à API Google Drive e à API Google Calendar, insira: https://www.googleapis.com/auth/drive, https://www.googleapis.com/auth/calendar.
Clique em Autorizar.

Agora, seu aplicativo tem autoridade para fazer chamadas de API como usuários no seu domínio do Workspace (para "representar" usuários). Ao se preparar para fazer essas chamadas de API delegadas, você especifica explicitamente o usuário a ser representado.

Observação:geralmente, o acesso por representação leva alguns minutos para ser concedido depois que o ID do cliente é adicionado, mas, em alguns casos, pode levar até 24 horas para ser propagado a todos os usuários da sua Conta do Google.
Fazer uma chamada de API delegada

As seções a seguir mostram como fazer uma chamada de API autorizada usando uma biblioteca de cliente das APIs do Google ou interagindo diretamente com o sistema OAuth 2.0 usando HTTP.

Dica:se você estiver usando as APIs do Google Workspace, exemplos abrangentes estarão disponíveis nas amostras para desenvolvedores do Google Workspace no GitHub e na página Produtos para desenvolvedores do Google Workspace.
Java
Python
HTTP/REST

Depois de conseguir o endereço de e-mail do cliente e a chave privada no Console de APIs, use a Biblioteca de autenticação do Google para Java para criar um objeto GoogleCredentials com as credenciais da conta de serviço e os escopos que seu aplicativo precisa acessar. Exemplo:

import com.google.auth.oauth2.GoogleCredentials;
import com.google.api.services.sqladmin.SQLAdminScopes;

// ...

GoogleCredentials credentials = GoogleCredentials.fromStream(new FileInputStream("ServiceAccountKey.json"))
    .createScoped(Collections.singleton(SQLAdminScopes.SQLSERVICE_ADMIN));

Se você estiver desenvolvendo um app no Google Cloud, use as credenciais padrão do aplicativo para simplificar o processo.

Delegar autoridade em todo o domínio

Se você tiver delegado o acesso em todo o domínio à conta de serviço e quiser representar uma conta de usuário, especifique o endereço de e-mail da conta de usuário com o método createDelegated do objeto GoogleCredentials. Por exemplo:

GoogleCredentials credentials = GoogleCredentials.fromStream(new FileInputStream("ServiceAccountKey.json"))
    .createScoped(Collections.singleton(SQLAdminScopes.SQLSERVICE_ADMIN))
    .createDelegated("workspace-user@example.com");

O objeto GoogleCredentials é usado para chamar o método createDelegated(). O argumento do método createDelegated() precisa ser um usuário que pertence à sua conta do Workspace. O código que faz a solicitação usa essa credencial para chamar as APIs do Google com sua conta de serviço.

Consideração importante sobre segurança: entender a representação
Ao delegar autoridade em todo o domínio, você não concede à conta de serviço acesso direto a todos os dados do usuário. Em vez disso, você está autorizando a ferramenta a representar usuários específicos ao fazer chamadas de API.
O acesso é em nome de um usuário: seu aplicativo precisa especificar qual usuário será representado em cada solicitação de API. O aplicativo age com as permissões desse usuário específico, não com privilégios elevados ou em todo o domínio.
Permissões limitadas: o acesso da conta de serviço é restrito por dois fatores: as permissões do usuário representado e os escopos do OAuth autorizados no Admin Console. Ele não pode acessar dados que o usuário representado não pode acessar.
Princípio do privilégio mínimo: como esse recurso permite o acesso aos dados do usuário sem consentimento direto, é fundamental seguir as práticas recomendadas de segurança. Conceda apenas os escopos necessários do OAuth e entenda as implicações de segurança.
Para diretrizes de segurança detalhadas, consulte Práticas recomendadas de delegação em todo o domínio.
Chamar APIs do Google
Java
Python
HTTP/REST

Use o objeto GoogleCredentials para chamar as APIs do Google seguindo estas etapas:

Crie um objeto de serviço para a API que você quer chamar usando o objeto GoogleCredentials. Exemplo:
SQLAdmin sqladmin =
    new SQLAdmin.Builder(httpTransport, JSON_FACTORY, credentials).build();
Faça solicitações ao serviço de API usando a interface fornecida pelo objeto de serviço. Por exemplo, para listar as instâncias de bancos de dados do Cloud SQL no projeto exciting-example-123:
SQLAdmin.Instances.List instances =
    sqladmin.instances().list("exciting-example-123").execute();
Códigos de erro do JWT
Campo error	Campo error_description	Significado	Como resolver
unauthorized_client	Unauthorized client or scope in request.	Se você estiver tentando usar a delegação em todo o domínio, a conta de serviço não estará autorizada no Admin Console do domínio do usuário.	

Verifique se a conta de serviço está autorizada na página Delegação em todo o domínio do Admin Console para o usuário na declaração (campo) sub.

Embora isso geralmente leve alguns minutos, pode levar até 24 horas para que a autorização seja propagada para todos os usuários na sua Conta do Google.

unauthorized_client	Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.	Uma conta de serviço foi autorizada usando o endereço de e-mail do cliente em vez do ID do cliente (numérico) no Admin Console, ou um Grupo do Google foi usado para autorização.	Na página Delegação em todo o domínio do Admin Console, remova o cliente e adicione-o novamente com o ID numérico ou remova o Grupo do Google e substitua-o pela conta de serviço ou de usuário individual.
access_denied	(qualquer valor)	Se você estiver usando a delegação em todo o domínio, um ou mais escopos solicitados não estarão autorizados no Admin Console.	

Verifique se a conta de serviço está autorizada na página Delegação em todo o domínio do Admin Console para o usuário na declaração sub (campo) e se ela inclui todos os escopos solicitados na declaração scope do JWT.

Confirme se o acesso aos Serviços do Google não está restrito em Gerenciar o acesso a serviços que não são controlados individualmente.

Embora isso geralmente leve alguns minutos, pode levar até 24 horas para que a autorização seja propagada para todos os usuários na sua Conta do Google.

admin_policy_enforced	(qualquer valor)	A Conta do Google não pode autorizar um ou mais escopos solicitados devido às políticas do admin do Google Workspace.	

Consulte o artigo de ajuda do administrador do Google Workspace Controlar quais apps internos e de terceiros acessam os dados do Google Workspace para saber como um administrador pode restringir o acesso a todos os escopos ou a escopos sensíveis e restritos até que o acesso seja concedido explicitamente ao ID do cliente OAuth.

invalid_client	(qualquer valor)	

O cliente OAuth ou o token JWT é inválido ou está configurado incorretamente.

Consulte a descrição do erro para mais detalhes.

	

Verifique se o token JWT é válido e contém declarações corretas.

Verifique se o cliente OAuth e a conta de serviço estão configurados corretamente e se você está usando o endereço de e-mail certo.

Verifique se o token JWT está correto e foi emitido para o ID do cliente na solicitação.

deleted_client	(qualquer valor)	

O cliente OAuth usado para fazer a solicitação foi excluído. A exclusão pode acontecer de forma manual ou automática no caso de clientes inativos . Os clientes excluídos podem ser restaurados em até 30 dias após a exclusão. Saiba mais.

	

Use um ID de cliente que ainda esteja ativo.

invalid_grant	Not a valid email ou Invalid email or User ID.	O usuário não existe.	Verifique se o endereço de e-mail na declaração (campo) sub está correto.
invalid_grant	

Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe. Check your 'iat' and 'exp' values and use a clock with skew to account for clock differences between systems.

	Em geral, isso significa que a hora do sistema local não está correta. Isso também pode acontecer se o valor de exp estiver mais de 65 minutos no futuro em relação ao valor de iat ou se o valor de exp for menor que o valor de iat.	

Verifique se o relógio do sistema em que o JWT é gerado está correto. Se necessário, sincronize seu horário com o NTP do Google.

invalid_grant	Invalid JWT Signature.	

A declaração JWT foi assinada com uma chave privada não associada à conta de serviço identificada pelo e-mail do cliente ou a chave usada foi excluída, desativada ou expirou.

Como alternativa, a declaração JWT pode estar codificada incorretamente. Ela precisa ser codificada em Base64, sem novas linhas ou sinais de igual de padding.

	

Decodifique o conjunto de declarações do JWT e verifique se a chave que assinou a declaração está associada à conta de serviço.

Tente usar uma biblioteca OAuth fornecida pelo Google para garantir que o JWT seja gerado corretamente.

invalid_scope	Invalid OAuth scope or ID token audience provided.	Nenhum escopo foi solicitado (lista vazia de escopos) ou um dos escopos solicitados não existe (ou seja, é inválido).	

Verifique se a declaração (campo) scope do JWT está preenchida e compare os escopos que ela contém com os escopos documentados das APIs que você quer usar para garantir que não haja erros ou erros de digitação.

Observe que a lista de escopos na declaração scope precisa ser separada por espaços, não por vírgulas.

disabled_client	The OAuth client was disabled.	A chave usada para assinar a declaração JWT está desativada.	

Acesse o console de APIs do Google e, em IAM e administrador > Contas de serviço, ative a conta de serviço que contém o "ID da chave" usado para assinar a declaração.

org_internal	This client is restricted to users within its organization.	O ID do cliente OAuth na solicitação faz parte de um projeto que limita o acesso a contas do Google em uma organização do Google Cloud específica.	

Use uma conta de serviço da organização para autenticar. Confirme a configuração do tipo de usuário para seu aplicativo OAuth.

Adendo: autorização de conta de serviço sem OAuth

Com algumas APIs do Google, é possível fazer chamadas de API autorizadas usando um JWT assinado diretamente como um token de portador, em vez de um token de acesso OAuth 2.0. Quando isso é possível, você evita ter que fazer uma solicitação de rede ao servidor de autorização do Google antes de fazer uma chamada de API.

Se a API que você quer chamar tiver uma definição de serviço publicada no repositório do GitHub das APIs do Google, será possível fazer chamadas de API autorizadas usando um JWT em vez de um token de acesso. Para fazer isso, siga estas etapas:

Crie uma conta de serviço. Não se esqueça de guardar o arquivo JSON que você recebe ao criar a conta.
Usando qualquer biblioteca JWT padrão, como uma encontrada em jwt.io, crie um JWT com um cabeçalho e um payload como o exemplo a seguir:
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "abcdef1234567890"
}
.
{
  "iss": "123456-compute@developer.gserviceaccount.com",
  "sub": "123456-compute@developer.gserviceaccount.com",
  "aud": "https://firestore.googleapis.com/",
  "iat": 1511900000,
  "exp": 1511903600
}
No campo kid do cabeçalho, especifique o ID da chave privada da sua conta de serviço. Você encontra esse valor no campo private_key_id do arquivo JSON da conta de serviço.
Nos campos iss e sub, especifique o endereço de e-mail da sua conta de serviço. Você encontra esse valor no campo client_email do arquivo JSON da conta de serviço. Esse valor identifica exclusivamente o cliente e, funcionalmente, é o ID do cliente.
No campo aud, especifique o endpoint de API. Por exemplo, https://SERVICE.googleapis.com/.
No campo iat, especifique a época atual do Unix. No campo exp, especifique o horário exatamente 3.600 segundos depois, quando o JWT vai expirar.

Assine o JWT com RSA-256 usando a chave privada encontrada no arquivo JSON da conta de serviço.

Exemplo:

Java
Python

Usando google-auth-library-java e java-jwt:

import com.google.auth.oauth2.ServiceAccountCredentials;
...
GoogleCredentials credentials =
        GoogleCredentials.fromStream(new FileInputStream("MyProject-1234.json"));
PrivateKey privateKey = ((ServiceAccountCredentials) credentials).getPrivateKey();
String privateKeyId = ((ServiceAccountCredentials) credentials).getPrivateKeyId();

long now = System.currentTimeMillis();

try {
    Algorithm algorithm = Algorithm.RSA256(null, privateKey);
    String signedJwt = JWT.create()
        .withKeyId(privateKeyId)
        .withIssuer("123456-compute@developer.gserviceaccount.com")
        .withSubject("123456-compute@developer.gserviceaccount.com")
        .withAudience("https://firestore.googleapis.com/")
        .withIssuedAt(new Date(now))
        .withExpiresAt(new Date(now + 3600 * 1000L))
        .sign(algorithm);
} catch ...
Chame a API usando o JWT assinado como o token de portador:
GET /v1/projects/abc/databases/123/indexes HTTP/1.1
Authorization: Bearer SIGNED_JWT
Host: firestore.googleapis.com
Implementar a Proteção entre contas

Outra etapa para proteger as contas dos usuários é implementar a proteção entre contas usando o serviço de proteção entre contas do Google. Com esse serviço, você pode assinar notificações de ocorrências de segurança que fornecem informações ao seu aplicativo sobre mudanças importantes na conta do usuário. Depois, use as informações para tomar medidas dependendo de como você decide responder aos eventos.

Alguns exemplos dos tipos de eventos enviados ao seu app pelo Serviço de proteção entre contas do Google:

https://schemas.openid.net/secevent/risc/event-type/sessions-revoked
https://schemas.openid.net/secevent/oauth/event-type/token-revoked
https://schemas.openid.net/secevent/risc/event-type/account-disabled

Consulte a página Proteger contas de usuário com a Proteção entre contas para mais informações sobre como implementar a Proteção entre contas e a lista completa de eventos disponíveis.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-03-23 UTC.