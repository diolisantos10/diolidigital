---
titulo: "Google Ads API — OAuth 2.0: visão geral e escopos"
url: https://developers.google.com/google-ads/api/docs/oauth/overview?hl=pt-br
capturado_em: 2026-10-03
hash: d4125924eebc30d9
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Usar o OAuth 2.0 para acessar a API Google Ads
Observação: configure as credenciais do OAuth usando o mesmo projeto do Google Cloud em que você ativou a API Google Ads e solicitou um nível de acesso à API adequado para que a API Google Ads funcione corretamente.

Assim como outras APIs do Google, a API Google Ads usa o protocolo OAuth 2.0 para autenticação e autorização. O OAuth 2.0 permite que o app cliente da API Google Ads acesse a conta do Google Ads de um usuário sem precisar processar ou armazenar as informações de login dele.

Em geral, todos os cenários de autorização do OAuth 2.0 compatíveis com o Google também funcionam com a API Google Ads. No entanto, este guia se concentra nos cenários mais comuns para desenvolvedores da API Google Ads.

Cenário	Abordagem recomendada
Meu app já usa uma ou mais APIs do Google. Já criei suporte para fluxos de trabalho do OAuth 2.0 no meu app e só preciso adicionar a funcionalidade da API Google Ads ao app atual.	
Verifique se o usuário autorizado ou a conta de serviço tem acesso às contas do Google Ads para as quais você está fazendo chamadas de API. Para mais informações, consulte o modelo de acesso do Google Ads.
Consulte o fluxo de trabalho de autenticação multiusuário ou o fluxo de trabalho de conta de serviço, dependendo da abordagem que você está usando com o restante das APIs do Google que seu app está usando.

Estou criando um app que gerencia contas do Google Ads a que já tenho acesso. Se eu precisar gerenciar novas contas do Google Ads no futuro, vou acessar essas contas vinculando-as à minha conta de administrador do Google Ads.

OU

Alguém vai me convidar para gerenciar essas contas.	

Use o fluxo de trabalho da conta de serviço.

Se as políticas organizacionais ou a configuração da conta impedirem o uso de contas de serviço, use o fluxo de trabalho de autenticação de usuário único.

Estou criando um app que gerencia contas do Google Ads em nome de outros usuários. Meu app vai criar uma tela de usuário que permite que os usuários conectados se conectem às contas do Google Ads e autorizem meu app a gerenciar essas contas em nome deles.	Use a autenticação multiúsuário.

Para revisar e revogar o acesso de aplicativos de terceiros conectados à sua Conta do Google, acesse a página de permissões da Conta do Google.

Avançar
Visão geral do modelo de acesso
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-30 UTC.