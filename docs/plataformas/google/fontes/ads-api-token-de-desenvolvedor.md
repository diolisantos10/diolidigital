---
titulo: "Google Ads API — token de desenvolvedor"
url: https://developers.google.com/google-ads/api/docs/get-started/dev-token?hl=pt-br
capturado_em: 2026-10-29
hash: 222327d77043fd01
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Token de desenvolvedor

O token de desenvolvedor é uma string alfanumérica de 22 caracteres usada para conectar seu app à API Google Ads. Os tokens de desenvolvedor foram desativados em 9 de setembro de 2026. Este guia resume as mudanças e lista as perguntas frequentes sobre essa migração para ajudar os desenvolvedores.

Importante: não conhece a API Google Ads? Você não precisa mais de um token de desenvolvedor ou de uma conta de administrador do Google Ads para começar. O acesso à API agora é gerenciado diretamente no seu projeto do Google Cloud: a ativação da API concede acesso de teste (15.000 operações por dia em contas de teste), e você pode solicitar na página de visão geral da API Google Ads o acesso de explorador (revisão e aprovação automatizadas na maioria dos casos, para até 2.880 operações por dia em contas de produção). Siga o guia de início rápido "Faça sua primeira chamada" ou conecte um assistente de IA ao servidor MCP do Google Ads.

Acesse a Visão geral da API Google Ads no Console do Cloud

O que muda?

Fizemos várias mudanças na experiência de integração da API Google Ads e no gerenciamento de acesso à API como parte da descontinuação do token de desenvolvedor. Esta seção destaca as principais mudanças.

Os níveis de acesso à API estão associados aos projetos na nuvem do Google Cloud

Vamos desativar os tokens de desenvolvedor em 9 de setembro de 2026. O nível de acesso atual e ativo do token de desenvolvedor foi transferido automaticamente para seus projetos na nuvem do Google Cloud com base na atividade da API nos 90 dias anteriores à desativação. Você pode continuar enviando tokens de desenvolvedor nos cabeçalhos de chamada de API, mas isso é opcional e ignorado pelos servidores de API. O código atual vai continuar funcionando sem mudanças. Os níveis de acesso à API são determinados pelo projeto do Google Cloud usado para gerar suas credenciais do OAuth.

Se o app usa o fluxo de trabalho de autenticação do usuário, esse é o projeto que possui o ID e a chave secreta do cliente OAuth.
Se você usar o fluxo de trabalho da conta de serviço, esse será o projeto que possui sua conta de serviço.
Uma nova experiência de inscrição na API Google Ads
Observação: se você é um desenvolvedor que precisa de acesso à API de rastreamento de conversões de apps, continue se inscrevendo para receber um token de desenvolvedor na página da Central de APIs.

Você pode se inscrever para acessar a API Google Ads diretamente no console do Google Cloud sem precisar de uma conta de administrador do Google Ads. Não se inscreva para receber um token de desenvolvedor na página da Central de APIs nem tente solicitar acesso à API na página da Central de APIs na sua conta de administrador do Google Ads, já que esses processos foram transferidos para o console do Google Cloud e não serão processados se forem iniciados na página da Central de APIs.

Uma nova experiência de gerenciamento de acesso à API

Desativamos todas as novas funcionalidades de inscrição e gerenciamento de acesso à API, como solicitar acesso à API e gerenciar níveis de acesso à API na página da Central de APIs nas contas de administrador do Google Ads. Essas funcionalidades estão disponíveis na página de visão geral da API Google Ads no console do Google Cloud.

Você ainda pode acessar a página da Central de API para consultar os detalhes históricos do desenvolvedor. Esta página será desativada no futuro.

Novos códigos de erro

Na v25 e em versões mais recentes, a API Google Ads vai gerar um erro AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar usar um projeto na nuvem do Google Cloud com acesso de teste para fazer chamadas para uma conta de produção. As versões mais antigas da API (v24 e anteriores) geram um erro AuthorizationError.ACTION_NOT_PERMITTED. Se você encontrar esse erro, acesse a página de visão geral da API Google Ads do seu projeto na nuvem do Google Cloud e solicite acesso ao Explorer.

A verificação de marca é obrigatória para os acessos básico e padrão

Para novos aplicativos de acesso básico e padrão, é necessário concluir a verificação de marca do seu projeto do Google Cloud. Os titulares de acesso atuais não precisam concluir a verificação de marca, mas é recomendável.

As solicitações de acesso básico são automatizadas e serão analisadas em minutos após a verificação e o envio da marca.

Devido a essas atualizações de processo, todas as solicitações de acesso básico pendentes serão encerradas como parte dessa transição. Os candidatos afetados recebem um e-mail com detalhes e precisam se inscrever novamente para o acesso básico na página de visão geral da API Google Ads.

Novos e-mails de contato da API

Como estamos nos preparando para desativar a página da Central de APIs, vamos passar a usar a lista de usuários proprietários e editores no seu projeto do Google Cloud como o único canal para comunicações administrativas e de conformidade obrigatória. Para garantir uma transição tranquila, vamos continuar enviando temporariamente avisos obrigatórios de serviço (MSAs, na sigla em inglês) para o endereço de e-mail listado na sua Central de APIs. Vamos manter você informado sobre a finalização da transição dos nossos canais de comunicação.

O que fazer se você já é um desenvolvedor

Revise os níveis de acesso à API do seu projeto do Google Cloud:se você já é um desenvolvedor, recomendamos que revise a página de visão geral da API Google Ads dos seus projetos do Google Cloud para garantir que eles tenham o mesmo nível de acesso à API do seu token de desenvolvedor atual. Siga as instruções neste guia para resolver as discrepâncias que encontrar.

Revise seu endereço de e-mail para contato da API:acesse a página do IAM (Identity and Access Management) do seu projeto na nuvem do Google Cloud. Verifique se os desenvolvedores e gerentes de contas ativos do Google Ads têm os papéis de proprietário ou editor atribuídos no seu projeto do Google Cloud. Vamos começar a enviar avisos obrigatórios de serviço (MSAs, na sigla em inglês) para esses endereços de e-mail para informar sobre mudanças futuras na API Google Ads. Vamos continuar enviando MSAs para o endereço de e-mail para contato listado na sua Central de API por um período temporário e informaremos você sempre que esse processo for atualizado.

Corrija o código do app:recomendamos que você atualize o app para deixar de enviar um token de desenvolvedor como parte das chamadas de API. Publicamos versões atualizadas das bibliotecas de cliente, do servidor MCP do Google Ads e do Assistente para desenvolvedores da API Google Ads, que permitem fazer chamadas de API sem definir um token de desenvolvedor. Vamos começar a rejeitar tokens de desenvolvedor em chamadas de API em uma versão principal futura da API Google Ads. Se o app usa essas bibliotecas, atualize as dependências dele para usar a versão mais recente.

Entre em contato com o suporte da API Google Ads se precisar de mais ajuda ou tiver outras dúvidas.

Problemas conhecidos

Esta seção documenta todos os problemas conhecidos relacionados à desativação dos tokens de desenvolvedor.

Os usuários não recebem acesso de explorador ou básico mesmo depois de concluir a verificação de marca

Estamos cientes de um problema em que alguns usuários com projetos verificados pela marca são rejeitados ao solicitar o acesso básico. Os usuários vão receber um e-mail de rejeição com a mensagem "O acesso básico requer um perfil de marca OAuth verificado. Sua inscrição não foi aprovada porque você não concluiu a verificação de marca do seu projeto." Da mesma forma, alguns usuários que se inscrevem para o acesso de explorador também são rejeitados com um e-mail que diz: "No momento, não podemos conceder acesso de explorador ao seu projeto na nuvem do Google Cloud porque ele não atende aos critérios de qualificação necessários para acesso direto à conta de produção de acordo com nossas políticas e Termos de Serviço da API Google Ads".

Causa raiz

Seu projeto na nuvem do Google Cloud pode estar no programa de teste sem custo financeiro do Google Cloud ou ter uma conta de faturamento suspensa ou desativada.

Como verificar

Verifique o status de faturamento do Google Cloud. Se o projeto de faturamento aparecer como "Conta de teste sem custo financeiro" ou estiver suspenso ou desativado, você será afetado por esse problema.

Status

Identificamos a causa raiz e estamos trabalhando em uma correção para esse problema.

Solução alternativa temporária

Há várias soluções alternativas para resolver esse problema. Selecione a opção mais adequada para seu caso de uso.

Fazer upgrade do projeto do Google Cloud para um nível pago

Faça upgrade do seu projeto na nuvem do Google Cloud para um nível pago. Aguarde alguns minutos e tente solicitar o acesso básico novamente.

Remover o faturamento do projeto na nuvem do Google Cloud

Aviso :a remoção do faturamento desativa todos os outros serviços pagos do Google Cloud em execução no projeto e pode ter outros efeitos indesejados. Use essa solução alternativa apenas se você planeja usar esse projeto exclusivamente para a integração da API Google Ads ou se não se importa em pausar temporariamente outros serviços de nuvem.

Se você não tiver outros serviços em execução no projeto do Google Cloud, remova o faturamento do projeto na nuvem do Google. Aguarde alguns minutos e tente solicitar o acesso básico novamente.

Usar um projeto diferente do Google Cloud

Se você tiver outro projeto na nuvem do Google Cloud com marca verificada, use-o para solicitar o acesso básico.

Os projetos com níveis de acesso Básico ou Explorer recém-aprovados recebem um AUTHORIZATION_ERROR

Estamos cientes de um problema em que alguns usuários que fizeram upgrade do nível de acesso do projeto do Google Cloud para os níveis de acesso básico ou Explorer aprovados após 9 de setembro de 2026 recebem um AUTHORIZATION_ERROR ao fazer chamadas da API Google Ads para contas de produção.

Causa raiz

A API Google Ads não está respeitando os upgrades de nível de acesso à API que foram concluídos no console do Google Cloud para alguns projetos.

Como verificar

Você será afetado por esse problema se todas as condições a seguir forem verdadeiras:

Você tem um token de desenvolvedor com nível de acesso de teste.
Você usou seu projeto na nuvem do Google Cloud e o token de desenvolvedor para fazer chamadas da API Google Ads antes de 9 de setembro de 2026.
Você fez upgrade do nível de acesso do seu projeto do Google Cloud para Explorer, Basic ou Standard após 9 de setembro de 2026.
Suas chamadas de API para uma conta de produção estão falhando com um AUTHORIZATION_ERROR. As chamadas de API para contas de teste são bem-sucedidas.
Status

Já temos uma correção para esse problema e estamos trabalhando para implementá-la nos nossos servidores. Depois que a correção for implementada, as chamadas de API vão voltar a funcionar.

Solução alternativa temporária

Você pode usar um novo projeto do Google Cloud para solicitar acesso ao Explorer.

Perguntas frequentes

A seção a seguir responde a perguntas frequentes sobre a descontinuação do token de desenvolvedor e os níveis de acesso à API.

O que acontece com os níveis de acesso à API?

Os níveis de acesso à API ainda são aplicados na API Google Ads. No entanto, elas são concedidas ao seu projeto do console do Google Cloud, e não ao seu token de desenvolvedor. Quando você faz chamadas de API, os níveis de acesso à API são determinados pelo projeto do Google Cloud que você usou para gerar as credenciais do OAuth.

Se o app usa o fluxo de trabalho de autenticação do usuário, esse é o projeto que possui o ID e a chave secreta do cliente OAuth.
Se você usar o fluxo de trabalho da conta de serviço, esse será o projeto que possui sua conta de serviço.
Como os projetos foram identificados para a transferência dos níveis de acesso da API?

Se você já tinha um token de desenvolvedor aprovado antes de 9 de setembro de 2026, os níveis de acesso dele foram transferidos para seus projetos do Google Cloud da seguinte forma:

Analisamos os registros de chamadas de API dos últimos 90 dias para identificar quais projetos na nuvem foram usados para fazer chamadas de API com seu token de desenvolvedor aprovado.
Atribuímos os níveis de acesso à API do token de desenvolvedor a todos os projetos na nuvem identificados.
Posso ter vários projetos na nuvem com diferentes níveis de acesso após essa mudança?

Sim, é possível ter vários projetos na nuvem do Google Cloud com diferentes níveis de acesso à API. Por exemplo, é possível ter um projeto na nuvem do Google Cloud com acesso Basic e outro projeto na nuvem do Google Cloud com acesso padrão.

Exemplo

Por exemplo, suponha que você tenha quatro tokens de desenvolvedor e seis projetos na nuvem com os seguintes detalhes:

Token de desenvolvedor 1: abcdefghijkl1234567890 tem acesso padrão. Ele foi usado com os IDs de projeto: 1234567890, 5678912345, 45678912345.
Token de desenvolvedor 2: xyzabcdefghi6789012345 tem acesso básico. Ele foi usado com os IDs de projeto: 1231235678.
Token de desenvolvedor 3: asdfgflkjhjz7654321012 tem acesso básico, mas nunca foi usado para fazer uma chamada de API. Foi aprovado nos 90 dias anteriores a 9 de setembro de 2026.
Token de desenvolvedor 4: qwertypoiuyu6543298790 tinha acesso padrão, mas não foi usado nos últimos 90 dias. O ID do projeto 9876564900 foi usado com este token de desenvolvedor há mais de 90 dias.
Projeto na nuvem: o ID do projeto na nuvem 7171234567 nunca foi usado com nenhum dos tokens de desenvolvedor para fazer uma chamada de API.

Os níveis de acesso à API serão transferidos dos tokens de desenvolvedor para os projetos do Google Cloud da seguinte forma:

Token de desenvolvedor	ID do projeto	Nível de acesso	Explicação
abcdefghijkl1234567890	1234567890	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados um ao outro.
abcdefghijkl1234567890	5678912345	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados um ao outro.
abcdefghijkl1234567890	45678912345	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados um ao outro.
xyzabcdefghi6789012345	1231235678	Acesso básico	O token de desenvolvedor e o ID do projeto estão associados um ao outro.
asdfgflkjhjz7654321012	--	--	O acesso à API do token de desenvolvedor não foi transferido para nenhum projeto, já que nunca foi usado para fazer uma chamada de API.
qwertypoiuyu6543298790	9876564900	Testar o acesso	O acesso à API do token de desenvolvedor foi revogado devido à inatividade por 90 dias. O nível de acesso à API do projeto é definido como acesso de teste por padrão.
--	7171234567	Testar o acesso	Este é um novo projeto que não foi usado com nenhum token de desenvolvedor. O nível de acesso à API do projeto é definido como "Acesso de teste" por padrão.
Tenho mais de um token de desenvolvedor aprovado. De qual projeto você vai transferir os níveis de acesso à API?

Os níveis de acesso de cada token de desenvolvedor aprovado são transferidos para os projetos na nuvem do Google associados a esse token. Confira um exemplo.

Uso vários projetos na nuvem do Google Cloud. De qual projeto você vai transferir os níveis de acesso à API?

Se você usou vários projetos na nuvem do Google com seu token de desenvolvedor aprovado nos últimos 90 dias, todos esses projetos vão receber os mesmos níveis de acesso à API do seu token de desenvolvedor. Confira um exemplo.

Os níveis de acesso à API foram atribuídos a um projeto que não uso mais. Como posso corrigir esse problema?

Se o acesso à API Google Ads estiver atribuído a um projeto do Google Cloud que você não usa mais, nenhuma ação adicional será necessária. O Google vai revogar o acesso à API do projeto não utilizado após 90 dias de inatividade.

Os níveis de acesso à API não foram atribuídos ao meu projeto na nuvem do Google Cloud. Como posso corrigir esse problema?

Seu projeto na nuvem do Google Cloud não herdou o nível de acesso do token de desenvolvedor, provavelmente porque você nunca usou o token de desenvolvedor e o projeto na nuvem para fazer uma chamada de API ou porque o acesso à API do token de desenvolvedor expirou devido à inatividade. Para corrigir o problema, solicite o nível de acesso à API adequado para esse projeto na página de visão geral da API Google Ads. Confira um exemplo.

Onde posso ver os níveis de acesso à API do meu projeto?

Confira o nível de acesso à API do seu projeto do Google Cloud na página de visão geral da API Google Ads.

Como faço para solicitar níveis de acesso mais altos à API?

É possível solicitar níveis de acesso à API mais altos para seu projeto na nuvem do Google Cloud na página de visão geral da API Google Ads.

O que acontece com meu pedido de acesso à API que está pendente?

Todas as solicitações de acesso básico pendentes que você iniciou na Central de APIs da sua conta de administrador do Google Ads antes de 9 de setembro de 2026 serão encerradas. Solicite novamente o acesso Basic na página de visão geral da API Google Ads do seu projeto na nuvem do Google Cloud. Se você for afetado por essa mudança, vai receber um e-mail com as instruções necessárias.

As solicitações de acesso padrão pendentes que você iniciou na Central de APIs da sua conta de administrador do Google Ads a partir de 9 de setembro de 2026 serão analisadas normalmente. Se aprovado, o projeto na nuvem do Google Cloud associado ao seu token de desenvolvedor receberá acesso padrão.

Posso associar novamente meu token de desenvolvedor aprovado a um novo projeto do Google Cloud?

Antes de 9 de setembro de 2026, a equipe da API Google Ads permitia a reassociação de um token de desenvolvedor a um novo projeto do Google Cloud em casos específicos. Isso não será mais aceito a partir de 9 de setembro de 2026, já que os tokens de desenvolvedor foram desativados. Se você precisar usar um novo projeto do Google Cloud, solicite o acesso adequado à API na página de visão geral da API Google Ads do seu projeto do Google Cloud.

Tenho um token de desenvolvedor aprovado, mas nunca o usei. Posso usar esse token de desenvolvedor?

Não, não é possível usar esse token de desenvolvedor. Há duas possibilidades:

Seu acesso ao token de desenvolvedor pode ser revogado por inatividade:de acordo com as políticas do Google, o Google pode revogar seu token da API se ele não for usado de forma consecutiva por 90 dias. Se você não usa seu token de desenvolvedor há algum tempo, é provável que os níveis de acesso dele tenham sido revogados por inatividade. Se esse for o caso, solicite novamente o acesso à API para seu projeto na nuvem do Google Cloud na página de visão geral da API Google Ads. Confira um exemplo.

Seu token de desenvolvedor foi aprovado nos 90 dias anteriores a 9 de setembro de 2026, mas você nunca o usou:como você nunca usou o token de desenvolvedor aprovado com um projeto do Google Cloud antes de 9 de setembro de 2026, os níveis de acesso dele não foram transferidos para o projeto na nuvem. Por isso, não é mais possível usar seu token de desenvolvedor. Vamos gerar um erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar fazer uma chamada de API para uma conta de produção com esse token de desenvolvedor. Para corrigir o erro, solicite o acesso adequado à API na página de visão geral da API Google Ads do seu projeto na nuvem do Google Cloud. Confira um exemplo.

Nesses dois casos, é possível solicitar o acesso Explorer e o nível de acesso Basic, que serão analisados automaticamente. Não é mais necessário trabalhar com a equipe de compliance do Google para concluir o processo de análise. Se você precisar de acesso padrão, será necessária uma revisão manual. No entanto, você pode compartilhar os detalhes do seu token de desenvolvedor aprovado ao solicitar o acesso padrão para que a equipe de compliance possa analisar sua nova solicitação de acesso padrão.

Posso parar de enviar tokens de desenvolvedor como parte das minhas solicitações de API?

Sim, você pode deixar de enviar tokens de desenvolvedor como parte das suas solicitações de API. Se você usa uma biblioteca de cliente, talvez seja necessário fazer upgrade para a versão mais recente. Verifique os registros de alterações da biblioteca para confirmar se ela permite fazer chamadas de API sem especificar um token de desenvolvedor.

Eu fiz parte do programa piloto de nível de acesso gerenciado do Cloud. Como isso pode me afetar?

O programa piloto de nível de acesso gerenciado do Cloud foi lançado para que os desenvolvedores do Google Cloud façam chamadas de API sem enviar um token de desenvolvedor como parte da solicitação de API. Agora que desativamos os tokens de desenvolvedor, esse programa será descontinuado.

Os níveis de acesso do seu token de desenvolvedor ativo foram transferidos para o projeto do Google Cloud. Portanto, o código atual vai continuar funcionando sem mudanças. Se você precisar usar um novo projeto do Google Cloud, solicite acesso à API na página de visão geral da API Google Ads do seu projeto do Google Cloud.

Meu token de desenvolvedor fazia parte de uma lista de permissões. Como isso pode me afetar?

O Google pode executar programas piloto que dão a alguns desenvolvedores acesso a recursos experimentais. O acesso a esses recursos às vezes é fornecido adicionando seu token de desenvolvedor a uma lista de permissões. Se você participou de um programa piloto desse tipo, não precisa fazer nada.

Atualizamos todos os programas piloto para usar projetos do Google Cloud em vez de tokens de desenvolvedor como mecanismo de inclusão na lista de permissões e transferimos o status da lista de permissões do token de desenvolvedor para os projetos associados do Google Cloud. Seu código atual vai continuar funcionando sem mudanças. Se você continuar tendo problemas, entre em contato com o gerente de contas do Google que inscreveu você no programa piloto.

Tenho um token de desenvolvedor aprovado e quero usá-lo com um novo projeto do Google Cloud. Isso é permitido?

Não, não é possível usar um novo projeto na nuvem do Google com seu token de desenvolvedor aprovado. Como você nunca usou seu token de desenvolvedor aprovado com o novo projeto do Google Cloud antes de 9 de setembro de 2026, os níveis de acesso dele não foram transferidos para o projeto na nuvem. Vamos gerar um erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar fazer uma chamada de API com esse token de desenvolvedor, já que eles não são mais usados para determinar seus níveis de acesso à API. Para corrigir o erro, solicite o acesso adequado à API na página de visão geral da API Google Ads do seu projeto na nuvem do Google Cloud. Confira um exemplo.

Meu token de desenvolvedor vazou externamente. Preciso redefinir meu token de desenvolvedor?

Não, não é necessário redefinir o token de desenvolvedor nesse caso. Como transferimos os níveis de acesso à API do seu token de desenvolvedor para o projeto do Google Cloud, um usuário não autorizado não pode mais usar seu token de desenvolvedor com o próprio projeto do Google Cloud.

O que acontece com o API Center?

A página atual da Central de API na conta de administrador do Google Ads foi descontinuada e será removida em breve. Se você já tiver um token de desenvolvedor, poderá fazer login na sua conta de administrador do Google Ads e conferir os detalhes. No entanto, elas são fornecidas apenas para sua referência. Não realize tarefas relacionadas aos níveis de acesso do token de desenvolvedor, como solicitar níveis de acesso mais altos da API nesta página.

Se você precisar solicitar níveis de acesso mais altos à API, faça isso na página de visão geral da API Google Ads do seu projeto do Google Cloud.

Ainda preciso de uma conta de administrador do Google Ads para usar a API Google Ads?

Você não precisa mais de uma conta de admin do Google Ads para usar a API Google Ads. Você só precisa de uma conta de administrador se quiser vincular e gerenciar várias contas usando a API.

Sou um novo desenvolvedor. Como faço para me inscrever na API Google Ads?

Siga as instruções no guia para iniciantes para se inscrever na API Google Ads. Não se inscreva para receber um token de desenvolvedor na Central de API da sua conta de administrador do Google Ads. Essas inscrições não serão processadas. O API Center será desativado em breve.

Quais permissões do IAM são necessárias para gerenciar os níveis de acesso da API?

Você precisa de permissões de gerenciamento de cotas no seu projeto na nuvem do Google Cloud para gerenciar os níveis de acesso da API Google Ads. Por padrão, as permissões necessárias estão incluídas nos seguintes papéis: Proprietário, Editor, Administrador de cotas e Administrador do Service Usage. Para mais informações, consulte a documentação sobre permissões de cota.

Verifique a página do IAM do seu projeto na nuvem do Google Cloud para conferir os papéis atribuídos. Trabalhe com o administrador do projeto na nuvem do Google Cloud para conceder os papéis do IAM necessários para o projeto na nuvem do Google Cloud.

Avançar
Níveis de acesso e uso permitido
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-28 UTC.