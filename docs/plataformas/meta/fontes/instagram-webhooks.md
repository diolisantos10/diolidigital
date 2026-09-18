---
titulo: "Instagram — webhooks (campos e assinatura)"
url: https://developers.facebook.com/documentation/instagram-platform/webhooks
capturado_em: 2026-09-18
hash: 0e04aa236380807f
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Esta página foi traduzida do inglês para outro idioma usando IA. O conteúdo traduzido por IA pode conter erros, omissões ou divergências de sentido. Como a tradução automática pode ser imprecisa ou pouco clara, consulte o conteúdo original em inglês desta página para validar as orientações corretas.
Isso foi útil?
Webhooks do Instagram
Updated: 16 de set de 2026
Copiar para LLM
Ver como Markdown
Os Webhooks do Instagram enviam notificações em tempo real ao servidor quando há atividades compatíveis na conta profissional do Instagram conectada ao app. Dependendo dos campos assinados pelo app, as notificações podem descrever comentários, menções, insights sobre stories, mensagens e outras atividades.
Visão geral da configuração
São necessárias quatro etapas para receber notificações:
Crie e verifique um endpoint de retorno de chamada HTTPS no seu servidor.
Inscreva o app da Meta nos campos de webhook do Instagram exigidos pela integração.
Habilite as notificações para a conta profissional do Instagram de cada usuário do app.
Teste o retorno de chamada, a assinatura e o processamento de payload juntos.
Siga Configurar webhooks do Instagram para ver o fluxo de trabalho completo.
Links de configuração anteriores
As seções a seguir foram movidas para o guia de configuração de Webhooks:
Etapas de configuração
Requisitos
Limitações
Criar um ponto de extremidade de retorno de ligação
Solicitações de verificação
Notificações de eventos
Validar solicitações de verificação
Validar payloads
Habilitar assinaturas
Testar a veiculação
Exemplo de app
Verificar o exemplo de app
mTLS para webhooks
Configurar mTLS
Escolher as instruções para a configuração da API
A configuração do webhook varia conforme a configuração da API do Instagram. Em especial, o host da API, o token de acesso, o identificador da conta e os campos disponíveis não são intercambiáveis.
Configuração da API	Modelo de webhook

API do Instagram com o Login do Instagram
	
Usa um token de acesso do usuário do Instagram e graph.instagram.com.

API do Instagram com o Login do Facebook
	
Usa a autorização do Login do Facebook e graph.facebook.com. A conta profissional do Instagram precisa estar vinculada a uma Página do Facebook.
Campos de webhook
A disponibilidade de campos e as permissões necessárias dependem da configuração da API usada pelo seu app. Confira a matriz de campos e permissões do webhook do Instagram.
Payloads e testes
Use os exemplos de notificação de webhook para comparar os payload de cada configuração de autorização e testar seu parser em relação aos tipos de eventos usados pela integração.
Seu ponto de extremidade deve validar as assinaturas de notificação, retornar uma resposta HTTPS bem-sucedida imediatamente e gerenciar as entregas duplicadas. Os webhooks não fornecem um armazenamento de notificações histórico. Por isso, retenha os dados de evento exigidos pelo seu produto.
Próximas etapas
Configurar os Webhooks do Instagram
Analisar campos de webhook
Exemplos de notificação
Você achou esta página útil?