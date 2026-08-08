---
titulo: "Google Workspace — criar credenciais (conta de serviço + compartilhamento de arquivo/pasta)"
url: https://developers.google.com/workspace/guides/create-credentials
capturado_em: 2026-08-08
hash: c4226537305d29e5
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Criar credenciais de acesso

As credenciais são usadas para receber um token de acesso dos servidores de autorização do Google para que seu app possa chamar as APIs do Google Workspace. Este documento descreve como escolher e configurar as credenciais necessárias para seu app.

Escolher a credencial de acesso certa

As credenciais necessárias dependem do tipo de dados, da plataforma e da metodologia de acesso do seu app. Há três tipos de credenciais disponíveis:

Caso de uso	Método de autenticação	Sobre esse método de autenticação
Acessar dados disponíveis publicamente de forma anônima no seu app.	Chaves de API	Verifique se a API que você quer usar é compatível com chaves de API antes de usar esse método de autenticação.
Acessar dados do usuário, como endereço de e-mail ou idade.	ID do cliente OAuth	Exige que seu app solicite e receba o consentimento do usuário.
Acessar dados de propriedade do seu app, documentos compartilhados específicos (como Planilhas Google) ou recursos do Google Workspace em nome dos usuários por meio da delegação em todo o domínio.	Conta de serviço	Quando um app é autenticado como uma conta de serviço, ele tem acesso a todos os recursos que a conta de serviço tem permissão para acessar.
**Observação**: para receber orientações sobre como escolher uma credencial, consulte Escolher o método de autenticação certo para seu caso de uso no console do Google Cloud ou use a opção "Preciso de ajuda para escolher" no console do Google Cloud.

Para definições de termos encontrados nesta página, consulte a visão geral de autenticação e autorização.

Credenciais de chave de API

Uma chave de API é uma string longa que contém letras maiúsculas e minúsculas, números, sublinhados e hifens, como AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe. Esse método de autenticação é usado para acessar dados disponíveis publicamente de forma anônima, como arquivos do Google Workspace compartilhados usando a configuração de compartilhamento "Qualquer pessoa na Internet com este link". Para mais detalhes, consulte Gerenciar chaves de API.

Para criar uma chave de API, siga estas etapas:

No console do Google Cloud, acesse Menu > APIs e serviços > Credenciais.

Ir para Credenciais

Clique em Criar credenciais > Chave de API.
Sua nova chave de API será exibida.
Clique em Copy para copiar sua chave de API para uso em seu código de app. A chave de API também pode ser encontrada na seção "Chaves de API" das credenciais do seu projeto.
Para evitar o uso não autorizado, recomendamos restringir os locais e as APIs em que a chave de API pode ser usada. Para mais detalhes, consulte Adicionar restrições de API.
Credenciais de ID do cliente OAuth
Para autenticar usuários finais e acessar dados do usuário no seu app, crie um ou mais IDs do cliente OAuth 2.0. Um ID do cliente é usado para identificar um único app nos servidores OAuth do Google. Se o app for executado em várias plataformas, você precisará criar um ID do cliente separado para cada plataforma.

Escolha o seu tipo de aplicativo para instruções específicas sobre como criar um ID do cliente OAuth:

Aplicativo da Web
Android
iOS
Extensão do Chrome
App para computador
Mais
No console do Google Cloud, acesse Menu > Plataforma de autenticação do Google > Clientes.

Acessar clientes

Clique em Criar cliente.
Clique em Tipo de aplicativo > Aplicativo da Web.
No campo Nome, digite um nome para a credencial. Esse nome é mostrado apenas no console do Google Cloud.
Adicione URIs autorizados relacionados ao seu app:
Apps do lado do cliente (JavaScript): em Origens JavaScript autorizadas, clique em Adicionar URI. Em seguida, insira um URI a ser usado para solicitações do navegador. Isso identifica os domínios de onde seu aplicativo pode enviar solicitações de API para o servidor OAuth 2.0.
Apps do lado do servidor (Java, Python e outros): em URIs de redirecionamento autorizados, clique em Adicionar URI. Em seguida, insira um URI de endpoint para o qual o servidor OAuth 2.0 pode enviar respostas.
Clique em Criar.

A credencial recém-criada aparece em IDs do cliente OAuth 2.0.

As chaves secretas do cliente não são usadas para aplicativos da Web.

Credenciais da conta de serviço
Uma conta de serviço é um tipo especial de conta usada por um aplicativo, não uma pessoa. É possível usar uma conta de serviço para acessar dados ou realizar ações pela conta do robô ou para acessar dados em nome de usuários do Google Workspace ou do Cloud Identity. Para mais informações, consulte Visão geral das contas de serviço.

As funções do Identity and Access Management (IAM) configuradas no console do Google Cloud não concedem acesso a recursos do Google Workspace (como o Planilhas ou o Gmail). Para conceder a uma conta de serviço acesso a recursos do Google Workspace, use o seguinte:

Se o app precisar...	Onde configurar...
Acessar arquivos específicos (como uma planilha Google)	Compartilhamento direto de um arquivo ou pasta com o endereço de e-mail da conta de serviço
Realizar a administração do domínio (como criar usuários do Google Workspace)	Atribuir funções administrativas diretamente à conta de serviço
Acessar dados do usuário em todo o domínio (como ler eventos do Gmail ou da Agenda Google de qualquer usuário)	Autorizar a conta de serviço a usar a delegação em todo o domínio
Criar uma conta de serviço

É possível criar uma conta de serviço usando o console do Google Cloud ou a ferramenta de linha de comando gcloud.

Console do Google Cloud
CLI gcloud
No console do Google Cloud, acesse Menu > IAM e administrador > Contas de serviço.

Acessar a página "Contas de serviço"

As etapas restantes aparecem no console do Google Cloud.

Selecione um projeto do Google Cloud.
Clique em Criar conta de serviço.
Insira um nome de conta de serviço a ser exibido no console do Google Cloud.
Observação: por padrão, o Google cria um ID de conta de serviço exclusivo com base no nome da conta de serviço. É possível modificar o ID no campo "ID da conta de serviço". Não é possível mudar o ID mais tarde.
Se você não quiser definir controles de acesso agora, clique em Concluído para finalizar a criação da conta de serviço. Para definir os controles de acesso agora, clique em Criar e continuar e avance para a próxima etapa.
Observação:a concessão de controle de acesso aqui afeta apenas os recursos do Google Cloud. Os recursos do Google Workspace (como o Planilhas Google e o Google Drive) são compartilhados e configurados separadamente.
Opcional: atribua funções à sua conta de serviço para conceder acesso aos recursos do projeto do Google Cloud, além dos recursos do Google Workspace. Para mais detalhes, consulte Gerenciar o acesso a projetos, pastas e organizações.
Clique em Continuar.
Opcional: insira usuários ou grupos que podem gerenciar e realizar ações com essa conta de serviço. Para mais detalhes, consulte identidade temporária de conta de serviço.
Clique em Concluído para terminar a criação da conta de serviço.

Anote o endereço de e-mail da conta de serviço.

Acessar arquivos do Google Workspace diretamente com uma conta de serviço

Se o app precisar apenas ler ou gravar arquivos específicos (como uma planilha Google ou uma pasta do Google Drive), não será necessário atribuir funções administrativas ou configurar a delegação em todo o domínio. Em vez disso, você pode compartilhar arquivos individuais diretamente com o endereço de e-mail da conta de serviço usando a interface padrão. É possível tratar o endereço de e-mail da conta de serviço como uma conta de usuário nas configurações de compartilhamento do documento sem privilégios de administrador necessários.

Para conceder acesso, faça o seguinte:

Copie o endereço de e-mail da sua conta de serviço. Por exemplo, my-service-account@my-project.iam.gserviceaccount.com.
Abra o documento do Planilhas ou a pasta do Drive que você quer acessar.
Clique em Compartilhar.
Adicione o endereço de e-mail da conta de serviço e atribua o nível de acesso apropriado (como editor ou leitor).
Desmarque Notificar pessoas (como as contas de serviço não têm caixas de entrada, elas não recebem o e-mail de convite, mas a permissão ainda é concedida).
Clique em Compartilhar.
Criar uma chave de conta de serviço
É necessário receber credenciais na forma de um par de chaves públicas/privadas. Essas credenciais são usadas pelo seu código para autorizar ações da conta de serviço no app.

Para criar uma chave de conta de serviço:

No console do Google Cloud, acesse Menu > IAM e administrador > Contas de serviço.

Acessar a página "Contas de serviço"

As etapas restantes aparecem no console do Google Cloud.

Selecione um projeto do Google Cloud.
Clique no endereço de e-mail da conta de serviço para a qual você quer criar uma chave.
Clique na guia Chaves.
Clique no menu suspenso Adicionar chave e selecione Criar nova chave.
Selecione JSON como o Tipo de chave e clique em Criar.

Seu novo par de chave pública/privada é gerado e transferido por download para sua máquina como um arquivo de chave de conta de serviço. Salve o arquivo JSON transferido por download como credentials.json no seu diretório de trabalho. Esse arquivo é a única cópia da chave. Depois de fazer o download do arquivo de chave, não é possível fazer o download novamente. Para informações sobre como armazenar a chave com segurança, consulte Práticas recomendadas para gerenciar chaves de contas de serviço.

Atribuir uma função de administrador do Google Workspace a uma conta de serviço
Observação: a maioria dos apps não exige essa etapa. Atribua uma função de administrador somente se o app precisar realizar o gerenciamento de diretório em todo o domínio (como criar usuários usando a API Directory). Para acesso padrão a documentos (como o Planilhas), use o compartilhamento direto de documentos em vez disso.

É possível atribuir qualquer função predefinida ou personalizada do Google Workspace a uma conta de serviço, com exceção da função de superadministrador.

No Google Admin Console, acesse Menu > Conta > Funções do administrador.

Acessar Funções do administrador

Você precisa fazer login como um superadministrador para essa tarefa.

As etapas restantes aparecem no Google Admin Console.

Aponte para a função que você quer atribuir, clique no menu suspenso Actions e selecione Atribuir administrador.

Clique em Atribuir contas de serviço.

Digite o endereço de e-mail da conta de serviço.

Clique em Adicionar > Atribuir função.

Opcional: configurar a delegação em todo o domínio para uma conta de serviço
Use a delegação em todo o domínio quando o aplicativo precisar acessar dados do Google Workspace em nome de vários usuários individuais na sua organização (como enviar e-mails usando a API Gmail) sem exigir o consentimento individual do usuário. Para chamar APIs em nome de usuários em uma organização do Google Workspace, conceda à sua conta de serviço a delegação de autoridade em todo o domínio no Google Admin Console usando uma conta de superadministrador. Para mais informações, consulte Delegar autoridade em todo o domínio à conta de serviço.

Para configurar a delegação de autoridade em todo o domínio para uma conta de serviço:

No console do Google Cloud, acesse Menu > IAM e administrador > Contas de serviço.

Acessar a página "Contas de serviço"

Selecione um projeto do Google Cloud.
Clique no endereço de e-mail da conta de serviço para a qual você quer configurar a delegação em todo o domínio.
Clique em Mostrar configurações avançadas.
Em "Delegação em todo o domínio", encontre o "ID do cliente" da sua conta de serviço.
Clique em Copy para copiar o valor do ID do cliente para a área de transferência.

Se você tiver acesso de superadministrador à conta do Google Workspace relevante, clique em Acessar o Google Admin Console, faça login com sua conta de usuário de superadministrador e continue seguindo estas etapas.

Se você não tiver acesso de superadministrador à conta do Google Workspace relevante, entre em contato com um superadministrador da conta. Envie o ID do cliente da sua conta de serviço e uma lista de escopos do OAuth necessários para que o app possa concluir as etapas a seguir no Google Admin Console.

No Google Admin Console, acesse Menu > Segurança > Controle de acesso e dados > Controles de API.

Acessar controles de API

Clique em Gerenciar delegação em todo o domínio.
Clique em Adicionar novo.
No campo ID do cliente, cole o ID do cliente que você copiou anteriormente.
No campo Escopos do OAuth, insira uma lista separada por vírgulas dos escopos necessários para seu app. Esse é o mesmo conjunto de escopos que você definiu ao configurar a tela de permissão OAuth.
Clique em Autorizar.

As mudanças podem levar até 24 horas, mas costumam ser mais rápidas. Para mais informações, consulte Controlar o acesso da API com a delegação em todo o domínio.

Próxima etapa

Você está pronto para desenvolver no Google Workspace. Confira a lista de produtos para desenvolvedores do Google Workspace e como encontrar ajuda.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-07-01 UTC.