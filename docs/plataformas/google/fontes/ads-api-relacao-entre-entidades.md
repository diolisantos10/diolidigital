---
titulo: "Google Ads API — relação entre entidades (conta → campanha → grupo → anúncio)"
url: https://developers.google.com/google-ads/api/docs/concepts/entity-relationships?hl=pt-br
capturado_em: 2026-10-19
hash: 538411ff65926d20
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Introdução à API do Google Ads

A API Google Ads é a interface programática do Google Ads, usada para gerenciar contas e campanhas grandes ou complexas do Google Ads. É possível criar um software que gerencie contas desde o nível do cliente até o nível da palavra-chave. Os casos de uso típicos incluem:

Gerenciamento automatizado de contas: crie e vincule contas, gerencie hierarquias de contas e automatize o acesso do usuário.
Relatórios personalizados: consulte métricas de performance, segmentos e atributos de recursos usando a linguagem de consulta do Google Ads (GAQL).
Gerenciamento de anúncios com base em campanhas e inventário: crie e atualize campanhas Performance Max, de pesquisa, Geração de demanda, Shopping, de vídeo e para apps, orçamentos e recursos.
Medição de conversões e gerenciamento de estratégias de Lances Inteligentes: faça upload de conversões otimizadas, de cliques e de chamadas e configure estratégias de lances automáticas.
A API Google Ads é o produto certo para mim?

O Google oferece vários produtos para ajudar a automatizar as contas do Google Ads. Use a tabela a seguir para identificar o produto que melhor atende aos seus requisitos:

Cenário	Recomendação
Sou um desenvolvedor que quer criar um software personalizado ou fazer a integração com a API Google Ads e me sinto confortável em gerenciar a infraestrutura de servidores e bancos de dados.	Usar a API Google Ads. Comece com o Guia de início rápido para configurar o acesso e fazer sua primeira chamada de API.
Sou um desenvolvedor que quer escrever uma lógica personalizada, mas prefiro não gerenciar a infraestrutura do servidor.	Use os scripts do Google Ads.
Não sou desenvolvedor, mas quero aprender programação básica para automatizar o Google Ads.	Use os scripts do Google Ads.
Sou analista de dados e preciso fazer o download de relatórios do Google Ads para análise off-line ou de warehouse.	Use o serviço de transferência de dados do BigQuery para transferências do Google Ads.
Estou criando modelos de mix de marketing (MMM) e preciso de dados de anúncios do Google Ads.	Use a MMM Data Platform. Embora muitos anunciantes usem a API Google Ads para extrair dados, ela não é ideal para o desenvolvimento da MMM.
Quero gerenciar o Google Ads em massa sem escrever código.	Use regras automatizadas, uploads em massa ou o Google Ads Editor.
Comece a usar e confira os principais tópicos

Se a API Google Ads for adequada para seu projeto, use o guia de tarefas a seguir para configurar o acesso, instalar uma biblioteca de cliente e criar sua integração:

Meta	Guia principal	Recursos relacionados
Faça sua primeira chamada de API	Guia de início rápido	Configuração do projeto do Google Cloud, Níveis de acesso, Contas de teste, Conceitos básicos, Próximas etapas
Configurar o OAuth 2.0 e as credenciais	Visão geral de autenticação e autorização	Visão geral do modelo de acesso, Fluxo de trabalho da conta de serviço, Fluxo de trabalho de autenticação do usuário, Verificação de marca, Desativação do token de desenvolvedor
Instalar uma biblioteca de cliente ou chamar REST	Bibliotecas de cliente	Java, .NET, PHP, Python, Ruby, Perl, Exemplos de código, Interface REST
Consultar relatórios e criar consultas da GAQL	Visão geral dos relatórios	Linguagem de consulta do Google Ads (GAQL), Criador de consultas interativo, Validador de consultas, Query Cookbook, Referência de relatórios (v26)
Usar ferramentas de IA e exploradores interativos	Assistente para desenvolvedores da API Google Ads	Instalar o Assistente para Desenvolvedores, servidor MCP do Google Ads, habilidades do agente, API Explorer
Resolver problemas e planejar upgrades	Tratar erros	Erros comuns, Entender os erros da API, Notas da versão, Fazer upgrade da versão da API, Cronograma de descontinuação e encerramento
Avançar
Início rápido
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-16 UTC.