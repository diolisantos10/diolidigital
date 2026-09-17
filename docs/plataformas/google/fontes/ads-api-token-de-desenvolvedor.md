---
titulo: "Google Ads API — token de desenvolvedor"
url: https://developers.google.com/google-ads/api/docs/get-started/dev-token?hl=pt-br
capturado_em: 2026-09-17
hash: 278354b3289666b9
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Participe da nossa transmissão ao vivo no Discord no servidor da comunidade de publicidade e medição do Google e no YouTube em 24 de setembro às 11h (horário de Brasília)! Vamos falar sobre os novos recursos adicionados na v25.2 da API Google Ads.
 O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Token de desenvolvedor

O token de desenvolvedor é uma string alfanumérica de 22 caracteres usada para conectar seu app à API Google Ads. Os tokens de desenvolvedor foram desativados em 9 de setembro de 2026. Este guia resume as mudanças e lista as perguntas frequentes sobre essa migração para ajudar os desenvolvedores atuais.

O que muda?

Fizemos várias mudanças na experiência de integração da API Google Ads e no gerenciamento de acesso à API como parte da descontinuação do token de desenvolvedor. Esta seção destaca as principais mudanças.

Os níveis de acesso à API estão associados a projetos do Google Cloud

Vamos desativar os tokens de desenvolvedor em 9 de setembro de 2026. Seu nível de acesso ao token de desenvolvedor atual e ativo foi transferido automaticamente para seus projetos do Google Cloud com base na atividade recente da API. Você pode continuar enviando tokens de desenvolvedor nos cabeçalhos de chamadas de API, mas isso é opcional e ignorado pelos servidores de API. Seu código atual vai continuar funcionando sem mudanças. Seus níveis de acesso à API agora são determinados pelo projeto na nuvem do Google Cloud usado para gerar as credenciais do OAuth.

Se o app usa o fluxo de trabalho de autenticação do usuário, esse é o projeto que possui o ID e a chave secreta do cliente OAuth.
Se você usar o fluxo de trabalho da conta de serviço, esse será o projeto proprietário da sua conta de serviço.
Uma nova experiência de inscrição na API Google Ads
Observação: se você for um desenvolvedor que precisa de acesso à API App Conversion Tracking, continue se inscrevendo para um token de desenvolvedor na página do API Center.

Agora você pode se inscrever para ter acesso à API Google Ads diretamente no console do Google Cloud sem precisar de uma conta de administrador do Google Ads. Não se inscreva para receber um token de desenvolvedor na página do Centro de APIs nem tente solicitar acesso à API na página do Centro de APIs na sua conta de administrador do Google Ads. Esses processos foram transferidos para o console do Google Cloud e não serão processados se forem iniciados na página do Centro de APIs.

Uma nova experiência de gerenciamento de acesso à API

Desativamos todas as novas funcionalidades de inscrição e gerenciamento de acesso à API, como solicitação e gerenciamento de níveis de acesso à API na página do Centro de APIs nas contas de administrador do Google Ads. Essas funcionalidades agora estão disponíveis na página de visão geral da API Google Ads no console do Google Cloud.

Você ainda pode acessar a página do API Center para consultar seus detalhes históricos de desenvolvedor. Esta página será desativada completamente no futuro.

Novos códigos de erro

A versão v25 da API Google Ads vai gerar um erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar usar um projeto na nuvem do Google Cloud com Acesso de teste para fazer chamadas a uma conta de produção. Versões mais antigas da API vão gerar um erro ACTION_NOT_PERMITTED. Se você encontrar esse erro, acesse a página de visão geral da API Google Ads do seu projeto do Google Cloud e solicite acesso ao Explorer.

A verificação de marca é obrigatória para o acesso básico e padrão

Para novos aplicativos de acesso básico e padrão, é necessário concluir a verificação de marca do seu projeto do Google Cloud. Os titulares de acesso atuais não precisam concluir a verificação de marca, mas é recomendável que façam isso.

As solicitações de acesso básico agora são automatizadas e serão analisadas em minutos após a verificação e o envio da marca.

Devido a essas atualizações de processo, todas as solicitações pendentes de acesso básico serão encerradas como parte dessa transição. Os candidatos afetados vão receber um e-mail com detalhes e precisam se inscrever novamente para o acesso básico na página de visão geral da API Google Ads.

Novos e-mails de contato da API

Enquanto nos preparamos para desativar a página do Central de APIs, vamos passar a usar a lista de usuários proprietários e editores no seu projeto do Google Cloud como o único canal para comunicações administrativas e de conformidade obrigatória. Para garantir uma transição tranquila, vamos continuar enviando avisos obrigatórios de serviço (MSAs, na sigla em inglês) para o endereço de e-mail listado no seu Centro de APIs. Vamos manter você atualizado à medida que finalizamos a transição dos nossos canais de comunicação.

O que fazer se você já for um desenvolvedor

Revise os níveis de acesso à API do seu projeto do Google Cloud:se você já é um desenvolvedor, recomendamos que revise a página de visão geral da API Google Ads dos seus projetos do Google Cloud para garantir que eles tenham o mesmo nível de acesso à API que seu token de desenvolvedor atual. Siga as instruções neste guia para resolver as discrepâncias que encontrar.

Revise o endereço de e-mail de contato da API:acesse a página do IAM (gerenciamento de identidade e acesso) do seu projeto do Google Cloud. Verifique se os desenvolvedores e gerentes de contas ativos do Google Ads têm as funções de proprietário ou editor adequadas no seu projeto do Google Cloud. Vamos começar a enviar avisos obrigatórios de serviço (MSAs, na sigla em inglês) para esses endereços de e-mail para informar sobre mudanças futuras na API Google Ads. Vamos continuar enviando MSAs para o endereço de e-mail de contato listado na Central de API por um período temporário e informaremos você sempre que esse processo for atualizado.

Corrija o código do app:recomendamos que você atualize o app para parar de enviar o token de desenvolvedor como parte das chamadas de API. Publicamos versões atualizadas das bibliotecas de cliente, do servidor MCP do Google Ads e do Assistente para desenvolvedores da API Google Ads, que permitem fazer chamadas de API sem definir um token de desenvolvedor. Vamos começar a rejeitar tokens de desenvolvedor em chamadas de API em uma versão principal futura da API Google Ads. Se o app usa essas bibliotecas, atualize as dependências para usar a versão mais recente.

Entre em contato com o suporte da API Google Ads se precisar de mais ajuda ou tiver mais dúvidas.

Problemas conhecidos

Esta seção documenta todos os problemas conhecidos relacionados ao encerramento dos tokens de desenvolvedor.

Os usuários não recebem acesso ao Explorer ou acesso básico mesmo depois de concluir a verificação de marca

Estamos cientes de um problema em que alguns usuários com projetos verificados pela marca são rejeitados ao solicitar o acesso básico. Os usuários vão receber um e-mail de rejeição que diz: "O acesso básico exige um perfil de marca OAuth verificado com sucesso. Sua inscrição não foi aprovada porque você não concluiu a verificação da marca do seu projeto". Da mesma forma, alguns usuários que se inscrevem para o acesso ao Explorer também são rejeitados com um e-mail que diz: "No momento, não é possível conceder acesso ao Explorer ao seu projeto do Google Cloud porque ele não atende aos critérios de qualificação necessários para acesso direto à conta de produção de acordo com nossas políticas e Termos de Serviço da API Google Ads".

Causa raiz

Seu projeto na nuvem do Google Cloud pode estar no programa de teste sem custo financeiro do Google Cloud ou ter uma conta de faturamento suspensa ou desativada.

Como verificar

Verifique seu status de faturamento do Google Cloud. Se o projeto de faturamento aparecer como "Conta de teste sem custo financeiro" ou estiver suspenso ou desativado, você será afetado por esse problema.

Status

Identificamos a causa principal e estamos trabalhando em uma correção para esse problema.

Solução alternativa temporária

Há várias soluções alternativas para resolver esse problema. Selecione a opção mais adequada para seu caso de uso.

Fazer upgrade do seu projeto do Google Cloud para um nível pago

Faça upgrade do seu projeto do Google Cloud para um nível pago. Aguarde alguns minutos e tente se inscrever no acesso básico novamente.

Remover o faturamento do seu projeto na nuvem do Google Cloud

Aviso :a remoção do faturamento desativa todos os outros serviços pagos do Google Cloud em execução nesse projeto e pode ter outros efeitos indesejados. Use essa solução alternativa apenas se você planeja usar esse projeto exclusivamente para a integração da API Google Ads ou se não tiver problemas em pausar temporariamente outros serviços de nuvem.

Se você não tiver outros serviços em execução no projeto do Google Cloud, remova o faturamento do projeto. Aguarde alguns minutos e tente se inscrever no acesso básico novamente.

Usar outro projeto na nuvem do Google Cloud

Se você tiver outro projeto na nuvem do Google Cloud com verificação de marca, use-o para solicitar o acesso básico.

Projetos com níveis de acesso básico ou explorador recém-aprovados recebem um AUTHORIZATION_ERROR

Estamos cientes de um problema em que alguns usuários que fizeram upgrade recentemente do nível de acesso do projeto do Google Cloud para os níveis de acesso básico ou Explorer aprovados recebem um AUTHORIZATION_ERROR ao fazer chamadas da API Google Ads para contas de produção.

Causa raiz

A API Google Ads não está honrando os upgrades de nível de acesso à API concluídos no console do Google Cloud para alguns projetos.

Como verificar

Você será afetado por esse problema se todas as condições a seguir forem verdadeiras:

Você tem um token de desenvolvedor com nível de acesso de teste.
Você usou seu projeto do Google Cloud e token de desenvolvedor para fazer chamadas de API Google Ads antes de 9 de setembro de 2026.
Você fez upgrade do nível de acesso do seu projeto do Google Cloud para Explorer, Basic ou acesso padrão após 9 de setembro de 2026.
Suas chamadas de API para uma conta de produção estão falhando com um AUTHORIZATION_ERROR. As chamadas de API para contas de teste são concluídas.
Status

Já temos uma correção para esse problema e estamos trabalhando para implementá-la nos nossos servidores. Assim que a correção for implementada, suas chamadas de API vão voltar a funcionar.

Solução alternativa temporária

Você pode usar um novo projeto do Google Cloud para solicitar acesso ao Explorer.

Perguntas frequentes
O que vai acontecer com os níveis de acesso à API?

Os níveis de acesso à API ainda são aplicados na API Google Ads. No entanto, agora eles são concedidos ao seu projeto do console do Google Cloud em vez do seu token de desenvolvedor. Quando você faz chamadas de API, seus níveis de acesso à API são determinados pelo projeto do Google Cloud usado para gerar suas credenciais do OAuth.

Se o app usa o fluxo de trabalho de autenticação do usuário, esse é o projeto que possui o ID e a chave secreta do cliente OAuth.
Se você usar o fluxo de trabalho da conta de serviço, esse será o projeto proprietário da sua conta de serviço.
Como os projetos foram identificados para transferência de níveis de acesso à API?

Se você já tinha um token de desenvolvedor aprovado antes de 9 de setembro de 2026, os níveis de acesso dele foram transferidos para seus projetos do Google Cloud da seguinte forma:

Analisamos os registros de chamadas de API dos últimos 90 dias para identificar quais projetos do Cloud foram usados para fazer chamadas de API com seu token de desenvolvedor aprovado.
Atribuímos os níveis de acesso à API do token de desenvolvedor a todos os projetos do Cloud identificados.
Posso ter vários projetos do Cloud com vários níveis de acesso após essa mudança?

Sim, é possível ter vários projetos do Google Cloud com diferentes níveis de acesso à API. Por exemplo, é possível ter um projeto do Google Cloud com acesso básico e outro com acesso padrão.

Exemplo

Por exemplo, suponha que você tenha quatro tokens de desenvolvedor e seis projetos do Cloud com os seguintes detalhes:

Token de desenvolvedor 1: abcdefghijkl1234567890 tem acesso padrão. Ele foi usado com os IDs de projeto: 1234567890, 5678912345, 45678912345.
Token de desenvolvedor 2: xyzabcdefghi6789012345 tem acesso básico. Ele foi usado com os IDs de projeto: 1231235678.
Token de desenvolvedor 3: asdfgflkjhjz7654321012 tem acesso básico, mas nunca foi usado para fazer uma chamada de API. Ele foi aprovado recentemente.
Token de desenvolvedor 4: qwertypoiuyu6543298790 tinha acesso padrão, mas não foi usado nos últimos 90 dias. O ID do projeto 9876564900 foi usado com este token de desenvolvedor no passado.
Projeto na nuvem: o ID do projeto na nuvem 7171234567 nunca foi usado com nenhum dos tokens de desenvolvedor para fazer uma chamada de API.

Os níveis de acesso à API serão transferidos dos tokens de desenvolvedor para os projetos do Google Cloud da seguinte maneira:

Token de desenvolvedor	ID do projeto	Nível de acesso	Explicação
abcdefghijkl1234567890	1234567890	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados.
abcdefghijkl1234567890	5678912345	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados.
abcdefghijkl1234567890	45678912345	Acesso padrão	O token de desenvolvedor e o ID do projeto estão associados.
xyzabcdefghi6789012345	1231235678	Acesso básico	O token de desenvolvedor e o ID do projeto estão associados.
asdfgflkjhjz7654321012	--	--	O acesso à API do token de desenvolvedor não foi transferido para nenhum projeto porque nunca foi usado para fazer uma chamada de API.
qwertypoiuyu6543298790	9876564900	Testar o acesso	O acesso à API do token de desenvolvedor foi revogado devido à inatividade por 90 dias. O nível de acesso à API do projeto é definido como "Acesso de teste" por padrão.
--	7171234567	Testar o acesso	Este é um novo projeto que não foi usado com nenhum token de desenvolvedor. O nível de acesso à API do projeto é definido como "Acesso de teste" por padrão.
Tenho mais de um token de desenvolvedor aprovado. Para qual projeto você vai transferir os níveis de acesso à API?

Os níveis de acesso de cada token de desenvolvedor aprovado serão transferidos para os projetos do Google Cloud associados a esse token. Confira um exemplo.

Uso vários projetos do Google Cloud. Para qual projeto você vai transferir os níveis de acesso à API?

Se você usou vários projetos do Google Cloud com seu token de desenvolvedor aprovado nos últimos 90 dias, todos esses projetos vão receber os mesmos níveis de acesso à API que o token de desenvolvedor. Confira um exemplo.

Os níveis de acesso à API foram atribuídos a um projeto que não uso mais. Como posso resolver isso?

Se o acesso à API Google Ads estiver atribuído a um projeto do Google Cloud que você não usa mais, não será necessário fazer mais nada. O Google vai revogar o acesso à API do projeto não utilizado após 90 dias de inatividade.

Os níveis de acesso à API não foram atribuídos ao meu projeto na nuvem do Google Cloud. Como posso resolver isso?

Seu projeto na nuvem do Google Cloud não herdou o nível de acesso do token de desenvolvedor, provavelmente porque você nunca usou o token de desenvolvedor e o projeto na nuvem para fazer uma chamada de API, ou o acesso à API do token de desenvolvedor expirou recentemente devido à inatividade. Para corrigir o problema, solicite o nível de acesso à API adequado para esse projeto na página Visão geral da API Google Ads. Confira um exemplo.

Onde posso ver os níveis de acesso à API do meu projeto?

Você pode conferir o nível de acesso à API do seu projeto do Google Cloud na página de visão geral da API Google Ads.

Como faço para solicitar níveis mais altos de acesso à API?

É possível solicitar níveis de acesso à API mais altos para seu projeto na nuvem do Google Cloud na página de visão geral da API Google Ads.

O que acontece com meu pedido de acesso à API pendente?

Todos os pedidos de acesso básico pendentes iniciados no Centro de API da conta de administrador do Google Ads antes de 9 de setembro de 2026 serão encerrados. Reenvie a solicitação de acesso básico na página de visão geral da API Google Ads do seu projeto do Google Cloud. Se você for afetado por essa mudança, vai receber um e-mail com as instruções necessárias.

Todos os pedidos de acesso padrão pendentes iniciados na Central de APIs da conta de administrador do Google Ads até 9 de setembro de 2026 serão analisados como de costume. Se aprovado, o projeto na nuvem do Google Cloud associado ao seu token de desenvolvedor receberá acesso padrão.

Posso reassociar meu token de desenvolvedor aprovado a um novo projeto do Google Cloud?

No passado, a equipe da API Google Ads oferecia suporte à reassociação de um token de desenvolvedor a um novo projeto na nuvem do Google caso a caso. Esse recurso não será mais compatível a partir de 9 de setembro de 2026, já que desativamos os tokens de desenvolvedor. Se você precisar usar um novo projeto do Google Cloud, solicite o acesso à API adequado na página de visão geral da API Google Ads do projeto.

Tenho um token de desenvolvedor aprovado, mas nunca o usei. Posso usar este token de desenvolvedor?

Não, não é possível usar esse token de desenvolvedor. Há duas possibilidades:

O acesso ao seu token de desenvolvedor pode ser revogado por inatividade:de acordo com as políticas do Google, o Google pode revogar seu token da API se ele não for usado de forma consecutiva por 90 dias. Se você não usa seu token de desenvolvedor há algum tempo, é provável que os níveis de acesso dele tenham sido revogados por inatividade. Se for esse o caso, faça uma nova solicitação de acesso à API para seu projeto na nuvem do Google Cloud na página de visão geral da API Google Ads. Confira um exemplo.

Seu token de desenvolvedor foi aprovado recentemente, mas você nunca o usou antes de 9 de setembro de 2026:como você nunca usou seu token de desenvolvedor aprovado com um projeto do Google Cloud antes de 9 de setembro de 2026, os níveis de acesso dele não foram transferidos para o projeto do Cloud. Como resultado, não é mais possível usar seu token de desenvolvedor. Vamos gerar um erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar fazer uma chamada de API para uma conta de produção com esse token de desenvolvedor. Para corrigir o erro, solicite o acesso à API apropriada na página de visão geral da API Google Ads do seu projeto do Google Cloud. Confira um exemplo.

Em ambos os casos, você pode solicitar acesso ao Explorer e ao nível de acesso básico, e eles serão analisados automaticamente. Não é mais necessário trabalhar com a equipe de compliance do Google para concluir o processo de análise. Se você precisar de acesso padrão, será necessário fazer uma revisão manual. No entanto, você pode compartilhar os detalhes do token de desenvolvedor aprovado ao solicitar o acesso padrão para que a equipe de compliance possa analisar sua nova solicitação de acesso padrão de acordo com as informações.

Posso parar de enviar tokens de desenvolvedor como parte das minhas solicitações de API?

Sim, você pode parar de enviar tokens de desenvolvedor como parte das suas solicitações de API. Se você usa uma biblioteca de cliente, talvez seja necessário fazer upgrade para a versão mais recente. Confira os registros de mudanças da biblioteca para confirmar se ela permite fazer chamadas de API sem especificar um token de desenvolvedor.

Fiz parte do programa piloto de nível de acesso gerenciado do Cloud. Como isso pode me afetar?

O programa piloto de nível de acesso gerenciado na nuvem foi criado para que os desenvolvedores do Google Cloud possam fazer chamadas de API sem enviar um token de desenvolvedor como parte da solicitação de API. Agora que desativamos os tokens de desenvolvedor, esse programa será descontinuado.

Os níveis de acesso do seu token de desenvolvedor ativo foram transferidos para o projeto do Google Cloud. Portanto, o código atual vai continuar funcionando sem alterações. Se você precisar usar um novo projeto do Google Cloud, solicite o acesso à API na página de visão geral da API Google Ads do projeto.

Meu token de desenvolvedor fazia parte de uma lista de permissões. Como isso pode me afetar?

O Google pode executar programas piloto que dão a alguns desenvolvedores acesso a recursos experimentais. Às vezes, o acesso a esses recursos é concedido adicionando seu token de desenvolvedor a uma lista de permissões. Se você participou de um programa piloto, não precisa fazer nada.

Atualizamos todos os programas piloto para usar projetos do Google Cloud em vez de tokens de desenvolvedor como mecanismo de lista de permissões e transferimos o status da lista de permissões do token de desenvolvedor para os projetos associados do Google Cloud. Seu código atual vai continuar funcionando sem mudanças. Se você continuar enfrentando problemas, entre em contato com o gerente de contas do Google que fez sua inscrição no programa piloto.

Tenho um token de desenvolvedor aprovado e quero usá-lo com um novo projeto do Google Cloud. Isso é permitido?

Não, não é possível usar um novo projeto na nuvem do Google com seu token de desenvolvedor aprovado. Como você nunca usou seu token de desenvolvedor aprovado com o novo projeto do Google Cloud antes de 9 de setembro de 2026, os níveis de acesso dele não foram transferidos para o projeto do Cloud. Vamos gerar um erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION se você tentar fazer uma chamada de API com esse token de desenvolvedor, já que eles não são mais usados para determinar seus níveis de acesso à API. Para corrigir o erro, solicite o acesso à API apropriada na página de visão geral da API Google Ads do seu projeto do Google Cloud. Confira um exemplo.

Meu token de desenvolvedor vazou externamente. Preciso redefinir meu token de desenvolvedor?

Não, não é necessário redefinir o token de desenvolvedor nesse caso. Como transferimos os níveis de acesso à API do seu token de desenvolvedor para seu projeto do Google Cloud, um usuário não autorizado não pode mais usar seu token de desenvolvedor com o próprio projeto do Google Cloud.

O que vai acontecer com a Central de APIs?

A página atual da Central de API na conta de administrador do Google Ads foi descontinuada e será removida em breve. Se você já tem um token de desenvolvedor, ainda pode fazer login na sua conta de administrador do Google Ads e conferir os detalhes. No entanto, elas são fornecidas apenas para sua referência. Não realize tarefas relacionadas a níveis de acesso do token de desenvolvedor, como solicitar níveis de acesso mais altos da API nesta página.

Se você precisar solicitar níveis mais altos de acesso à API, faça isso na página de visão geral da API Google Ads do seu projeto do Google Cloud.

Ainda preciso de uma conta de administrador do Google Ads para usar a API Google Ads?

Agora você não precisa mais de uma conta de administrador do Google Ads para usar a API Google Ads. Você só precisa de uma conta de administrador se precisar vincular e gerenciar várias contas usando a API.

Sou um novo desenvolvedor. Como faço para me inscrever na API Google Ads?

Siga as instruções do guia para iniciantes e inscreva-se na API Google Ads. Não se inscreva para receber um token de desenvolvedor na Central de API da sua conta de administrador do Google Ads. Essas solicitações não serão processadas. O API Center será desativado em breve.

Quais permissões do IAM são necessárias para gerenciar níveis de acesso à API?

Você precisa de permissões de gerenciamento de cota para seu projeto na nuvem do Google Cloud para gerenciar níveis de acesso da API Google Ads. As permissões necessárias estão incluídas por padrão nos seguintes papéis: proprietário, editor, administrador de cotas e administrador do Service Usage. Consulte a documentação sobre permissões de cota para mais informações.

Confira na página do IAM do seu projeto na nuvem do Google Cloud os papéis atribuídos a você. Trabalhe com o administrador do projeto do Google Cloud para conceder os papéis necessários do IAM ao projeto.

Avançar
Níveis de acesso e uso permitido
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-16 UTC.