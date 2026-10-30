---
titulo: "Google Identity — verificação de escopos restritos"
url: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification?hl=pt-br
capturado_em: 2026-10-30
hash: 6bd950dd41acacff
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Verificação de escopo restrito
Nesta página
Noções básicas sobre escopos restritos
Entender o uso do escopo
Tipos de aplicativos permitidos
Security assessment
Etapas para se preparar para a verificação
Requisitos da página inicial do aplicativo
Requisitos do link da Política de Privacidade do aplicativo
Como enviar seu app para verificação de marca

Algumas APIs do Google (as que aceitam escopos sensíveis ou restritos) têm requisitos para apps que buscam permissão para acessar dados do consumidor. Esses requisitos adicionais para escopos restritos exigem que um app demonstre que é um tipo de aplicativo permitido e que seja submetido a outras análises, incluindo uma possível avaliação de segurança.

A aplicabilidade de escopos restritos em uma API depende principalmente do grau de acesso necessário para fornecer um recurso relevante no app: somente leitura, somente gravação, leitura e gravação etc.

Quando você usa o OAuth 2.0 para receber permissão de uma Conta do Google para acessar esses dados, você usa strings chamadas escopos para especificar o tipo de dados que quer acessar e o nível de acesso necessário. Se o app solicitar escopos sensíveis ou restritos, será necessário concluir o processo de verificação, a menos que o uso do app se qualifique para uma exceção.

Os escopos restritos são menos numerosos em comparação com os escopos sensíveis. As Perguntas frequentes sobre a verificação da API OAuth contêm a lista atual de escopos sensíveis e restritos. Esses escopos fornecem amplo acesso aos dados do usuário do Google e exigem que você passe por um processo de verificação de escopo antes de solicitar os escopos de qualquer Conta do Google. Para mais informações sobre esse requisito, consulte a Política de dados do usuário dos serviços de API do Google e os Requisitos adicionais para escopos de API específicos ou a página do Google Developers específica do produto. Se você armazena ou transmite dados de escopo restrito em servidores, precisa concluir uma avaliação de segurança.

Noções básicas sobre escopos restritos

Se o app solicitar escopos restritos e não se qualificar para uma exceção, você precisará atender aos Requisitos adicionais para escopos de API específicos da Política de Dados do Usuário dos Serviços de API do Google ou aos requisitos específicos do produto na página do Google Developers do produto, que exige um processo de análise mais abrangente.

Entender o uso do escopo
Revise os escopos que seu app usa ou quer usar. Para encontrar o uso atual do escopo, examine o código-fonte do app para ver se há escopos enviados com solicitações de autorização.
Determine se cada escopo solicitado é necessário para as ações pretendidas do recurso do app e se ele usa o privilégio mínimo necessário para fornecer o recurso. Uma API do Google normalmente tem documentação de referência na página do Google Developers do produto para os endpoints, que inclui o escopo necessário para chamar o endpoint ou propriedades específicas dele. Para mais informações sobre os escopos de acesso necessários para os endpoints de API que seu app chama, leia a documentação de referência desses endpoints. Por exemplo, para um app que usa as APIs do Gmail apenas para enviar e-mails ocasionalmente em nome de um usuário, não solicite o escopo que fornece acesso total aos dados de e-mail do usuário.
Os dados recebidos de uma API do Google só podem ser usados de acordo com as políticas da API e da maneira que você representa aos usuários nas ações do app e na Política de Privacidade.
Consulte a documentação da API para saber mais sobre cada escopo, incluindo o status potencial sensível ou restrito.
Declare todos os escopos usados pelo app na página de acesso a dados do Console do Cloud. Os escopos que você especifica são agrupados em categorias sensíveis ou restritas para destacar qualquer verificação adicional necessária.
Encontre o melhor escopo que corresponda aos dados usados pela sua integração, entenda o uso dele, confirme se tudo ainda funciona em um ambiente de teste e prepare-se para enviar para verificação.

Considere o tempo necessário para concluir a verificação no plano de lançamento do app ou de novos recursos que exijam um novo escopo. Um desses requisitos adicionais ocorre se o app acessa ou tem a capacidade de acessar dados de usuários do Google de ou por um servidor. Nesses casos, o sistema precisa passar por uma avaliação de segurança anual feita por um avaliador terceirizado independente aprovado pelo Google. Por esse motivo, o processo de verificação de escopos restritos pode levar várias semanas para ser concluído. Todos os apps precisam concluir primeiro a etapa de verificação de marca, que normalmente leva de dois a três dias úteis, se as informações de branding tiverem mudado desde a última verificação aprovada da tela de permissão OAuth.

Tipos de aplicativos permitidos

Alguns tipos de aplicativos podem acessar escopos restritos para cada produto. Você pode encontrar os tipos de aplicativo na página do Google Developers específica do produto (por exemplo, a Política da API Gmail).

É sua responsabilidade entender e determinar o tipo de aplicativo. No entanto, se você não tiver certeza do tipo de aplicativo do seu app, não selecione nenhuma opção para a pergunta Quais recursos você vai usar? ao enviar o app para verificação. A equipe de verificação da API do Google vai determinar o tipo de aplicativo.

Security assessment

Todos os apps que solicitam acesso aos dados restritos dos usuários do Google e têm a capacidade de acessar dados de ou por um servidor de terceiros precisam passar por uma avaliação de segurança realizada por painéis de avaliadores do Google. Essa avaliação ajuda a manter os dados dos usuários do Google seguros, verificando se todos os apps que acessam esses dados demonstram a capacidade de processar dados com segurança e de excluir dados do usuário quando solicitado.

Para padronizar nossa avaliação de segurança, usamos a App Defense Alliance e o framework de avaliação de segurança para aplicativos na nuvem (CASA, na sigla em inglês).

Como mencionado anteriormente, para manter o acesso a qualquer escopo restrito verificado, os apps precisam ser verificados novamente para compliance e concluir uma avaliação de segurança pelo menos a cada 12 meses após a data de aprovação da Carta de Avaliação (LOA, na sigla em inglês) do avaliador. Se o app adicionar um novo escopo restrito, talvez seja necessário reavaliá-lo para cobrir o escopo adicional, caso ele não tenha sido incluído em uma avaliação de segurança anterior.

A equipe de análise do Google vai enviar um e-mail quando for hora de recertificar seu app. Para garantir que os membros corretos da sua equipe sejam notificados sobre essa aplicação anual, associe outras Contas do Google ao seu projeto do console do Cloud como proprietário ou editor. Também ajuda a manter atualizados os e-mails de suporte ao usuário e de contato do desenvolvedor especificados na página de branding do OAuth do console do Google Cloud.

Etapas para se preparar para a verificação

Todos os apps que usam APIs do Google para solicitar acesso a dados precisam seguir as etapas abaixo para concluir a verificação de marca:

Confirme se o app não se enquadra em nenhum dos casos de uso na seção Exceções aos requisitos de verificação.
Verifique se o app obedece aos requisitos para marcas das APIs ou do produto associado. Por exemplo, consulte as diretrizes de branding para escopos do Login do Google.
Verifique a propriedade dos domínios autorizados do seu projeto no Google Search Console. Use uma Conta do Google associada ao projeto do Console de APIs como proprietário ou editor.
Verifique se todas as informações de branding na tela de permissão do OAuth, como o nome do app, o e-mail de suporte, o URI da página inicial, o URI da Política de Privacidade etc., representam com precisão a identidade do app.
Requisitos da página inicial do aplicativo

Verifique se a página inicial atende aos seguintes requisitos:

A página inicial precisa ser acessível ao público, não apenas aos usuários conectados ao site.
A relevância da página inicial para o app em análise precisa ser clara.
Links para a página de detalhes do app na Google Play Store ou para a página do Facebook dele não são considerados páginas iniciais válidas.
Requisitos do link da Política de Privacidade do aplicativo

Verifique se a Política de Privacidade do seu app atende aos seguintes requisitos:

A Política de Privacidade precisa estar visível para os usuários, hospedada no mesmo domínio da página inicial do aplicativo e vinculada à tela de permissão OAuth do Console de APIs do Google. A página inicial precisa incluir uma descrição da funcionalidade do app, além de links para a Política de Privacidade e os Termos de Serviço opcionais.
A Política de Privacidade precisa divulgar como o aplicativo acessa, usa, armazena ou compartilha dados do usuário do Google. A Política de Privacidade precisa obedecer à Política de dados do usuário dos serviços de API do Google e aos requisitos de uso limitado para escopos restritos. Você precisa limitar o uso de dados do usuário do Google às práticas divulgadas na Política de Privacidade publicada.
Confira exemplos de casos de Políticas de Privacidade que não atendem aos requisitos de uso limitado.
Como enviar seu app para verificação de marca

Um projeto do console do Google Cloud organiza todos os recursos do console do Cloud. Um projeto consiste em um conjunto de Contas do Google associadas que têm permissão para realizar operações do projeto, um conjunto de APIs ativadas e configurações de faturamento, autenticação e monitoramento dessas APIs. Por exemplo, um projeto pode conter um ou mais clientes OAuth, configurar APIs para uso por esses clientes e configurar uma tela de permissão OAuth que é mostrada aos usuários antes que eles autorizem o acesso ao seu app.

Se algum dos seus clientes OAuth não estiver pronto para produção, sugerimos que você o exclua do projeto que está solicitando a verificação. Isso pode ser feito na página Clientes.

Para enviar para verificação, siga estas etapas:

Verifique se o app obedece aos Termos de Serviço das APIs do Google e à Política de dados do usuário dos serviços de API do Google.
Mantenha atualizados os papéis de proprietário e editor das contas associadas ao projeto, bem como o e-mail de suporte ao usuário da tela de permissão OAuth e os dados de contato do desenvolvedor no console do Cloud. Isso garante que os membros certos da sua equipe sejam notificados sobre novos requisitos.
Acesse a página de branding do OAuth no console do Cloud.
Clique no botão Seletor de projetos.
Na caixa de diálogo Selecionar de que aparece, selecione seu projeto. Se você não encontrar o projeto, mas souber o ID do projeto, crie um URL no navegador no seguinte formato:
https://console.developers.google.com/auth/branding?project=[PROJECT_ID]
Substitua [PROJECT_ID] pelo ID do projeto que você quer usar.
Na página Branding, forneça as informações de branding do app, incluindo nome, logotipo, dados de contato do desenvolvedor e links relevantes. Todas as mudanças feitas são salvas como Rascunho de branding.
Clique no botão Verificar branding para iniciar o processo de avaliação. A análise automática geralmente é concluída em alguns minutos.
Observação: não é permitido modificar a marca enquanto a verificação está em andamento. Para fazer mudanças na marca, primeiro cancele qualquer verificação em andamento clicando no botão Cancelar.
Quando a avaliação for concluída, revise o status. Se tudo der certo, o status vai mudar para Pronto para publicação. Se a verificação automática falhar, você poderá ver os problemas detectados e corrigi-los ou solicitar uma revisão manual.
Clique no botão Publicar branding para ativar a nova identidade visual.
Observação: os resultados da verificação de conformidade são válidos por 7 dias. Se você não publicar nesse período, o status vai mudar para É necessário verificar novamente, e você terá que refazer o processo.
Se o app também exigir verificação para escopos sensíveis ou restritos, acesse a Central de Verificação do OAuth para acompanhar o Status de acesso aos dados e fornecer as informações adicionais solicitadas, como um vídeo de demonstração. É preciso ter um status de branding publicado antes de solicitar a verificação para acesso aos dados.
Use o botão Adicionar ou remover escopos para declarar todos os escopos solicitados pelo app. Um conjunto inicial de escopos necessários para o Login do Google é preenchido automaticamente na seção Escopos não sensíveis. Os escopos adicionados são classificados como não sensíveis, sensíveis ou restritos.
Forneça até três links para documentos relevantes sobre recursos relacionados no seu app.
Nas etapas seguintes, forneça as informações adicionais solicitadas sobre o app.
Verifique se o app obedece aos Requisitos adicionais para escopos de API específicos, o que inclui passar por uma avaliação de segurança anual se o app acessar dados de usuários do Google de escopo restrito de ou por um servidor de terceiros.
Verifique se o app é um dos tipos permitidos especificados na seção Uso limitado da página Requisitos adicionais para escopos de API específicos.
Se o app for uma plataforma de automação de tarefas, o vídeo de demonstração precisa mostrar como vários fluxos de trabalho de API são criados e automatizados e em quais direções os dados do usuário fluem.
Prepare um vídeo que demonstre como um usuário inicia e concede acesso aos escopos solicitados e mostre, em detalhes, o uso dos escopos sensíveis e restritos concedidos no app. Faça upload do vídeo no YouTube Studio e defina a Visibilidade como Não listado. Você precisa fornecer um link para o vídeo de demonstração no campo de link do YouTube.
Mostre o processo de permissão de acesso OAuth que os usuários vão seguir, em inglês. Isso inclui o fluxo de consentimento e, se você usa o Login do Google, o fluxo de login.
Mostre que a tela de permissão OAuth exibe corretamente o nome do app.
Mostre que a barra de endereço do navegador da tela de permissão OAuth inclui corretamente o ID do cliente OAuth do seu app.
Para mostrar como os dados serão usados, demonstre a funcionalidade ativada por cada escopo sensível e restrito que você solicitar.
Se você usa vários clientes e, portanto, tem vários IDs de cliente OAuth, mostre como os dados são acessados em cada cliente OAuth.
Selecione o tipo de aplicativo permitido na lista "Quais recursos você vai usar?".
Descreva como você vai usar os escopos restritos no app e por que os escopos mais limitados não são suficientes.

Depois que você publicar sua marca ou enviar uma solicitação de acesso a dados, a equipe de confiabilidade e segurança do Google poderá entrar em contato por e-mail para pedir mais informações ou indicar as etapas que você precisa concluir. Confira seus endereços de e-mail na seção Informações de contato do desenvolvedor e o e-mail de suporte da tela de permissão OAuth para solicitações de mais informações. Você também pode acessar as páginas "Branding" ou "Central de verificação" do projeto para confirmar o status atual da análise, inclusive se o processo está pausado enquanto aguardamos sua resposta.

Exceções aos requisitos de verificação

Se o app for usado em qualquer um dos cenários descritos nas seções a seguir, não será necessário enviá-lo para revisão.

Uso pessoal

Um caso de uso é se você for o único usuário do app ou se ele for usado por poucas pessoas, todas conhecidas pessoalmente por você. Você e seu número limitado de usuários podem se sentir confortáveis em avançar pela tela do app não verificado e conceder às suas contas pessoais acesso ao app.

Observação: um limite de usuários restringe o número de Contas do Google que podem conceder acesso ao seu app não verificado.
Projetos usados nos níveis de desenvolvimento, teste ou preparo

Para obedecer às políticas do OAuth 2.0 do Google, recomendamos que você tenha projetos diferentes para ambientes de teste e de produção. Recomendamos que você envie o app para verificação somente se quiser disponibilizá-lo para qualquer usuário com uma Conta do Google. Portanto, se o app estiver nas fases de desenvolvimento, teste ou preparo, a verificação não será necessária.

Se o app estiver em fase de desenvolvimento ou teste, deixe o Status de publicação na configuração padrão de Teste. Essa configuração significa que o app ainda está em desenvolvimento e só está disponível para os usuários que você adicionou à lista de usuários de teste. Você precisa gerenciar a lista de Contas do Google envolvidas no desenvolvimento ou teste do seu app.

Observação: seu app ainda vai estar sujeito a uma tela de aviso do testador, conforme mostrado na figura 1, um limite de usuários vai ser aplicado e o ciclo de vida do token de atualização vai ser limitado.
Figura 1. Tela de aviso do testador
Somente dados de propriedade do serviço

Se o app usa uma conta de serviço para acessar apenas os próprios dados e não acessa dados do usuário (vinculados a uma Conta do Google), não é necessário enviar para verificação.

Para entender o que são contas de serviço, consulte Contas de serviço na documentação do Google Cloud. Para instruções sobre como usar uma conta de serviço, consulte Como usar o OAuth 2.0 para aplicativos de servidor para servidor.

Somente para uso interno

Isso significa que o app é usado apenas por pessoas na sua organização do Google Workspace ou do Cloud Identity. O projeto precisa ser da organização, e a tela de permissão OAuth precisa ser configurada para um tipo de usuário interno. Nesse caso, seu app pode precisar da aprovação de um administrador da organização. Para mais informações, consulte Considerações adicionais para o Google Workspace.

Saiba mais sobre aplicativos públicos e internos.
Saiba como marcar seu aplicativo como interno nas Perguntas frequentes Como posso marcar meu aplicativo como somente para uso interno?
Instalação em todo o domínio

Se você planeja que seu app segmente apenas usuários de uma organização do Google Workspace ou do Cloud Identity e sempre use a instalação em todo o domínio, ele não vai precisar de verificação de marca. No entanto, se o app usar escopos restritos ou sensíveis, a verificação de apps será obrigatória. Isso ocorre porque uma instalação em todo o domínio permite que um administrador do domínio conceda a aplicativos internos e de terceiros acesso aos dados dos seus usuários. Somente os administradores da organização podem adicionar o app a uma lista de permissões para uso nos domínios.

Saiba como tornar seu app uma instalação em todo o domínio nas perguntas frequentes Meu aplicativo tem usuários com contas corporativas de outro domínio do Google Workspace.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-29 UTC.