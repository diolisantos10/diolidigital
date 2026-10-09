---
titulo: "Google Ads API — relatórios (reporting)"
url: https://developers.google.com/google-ads/api/docs/reporting/overview?hl=pt-br
capturado_em: 2026-10-09
hash: 7254f3dd1abff02e
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Visão geral dos relatórios

A API Google Ads gera relatórios dos dados de performance. Com as opções flexíveis de relatórios na API, você pode receber dados de performance de todos os recursos consultáveis, desde uma campanha inteira até as palavras-chave específicas que acionaram seu anúncio.

Para extrair dados de relatórios na API Google Ads, crie uma consulta usando a linguagem de consulta do Google Ads (GAQL), que especifica o recurso de destino na cláusula FROM e os atributos, segmentos e métricas selecionados na cláusula SELECT. Em seguida, envie a consulta para GoogleAdsService.SearchStream (para transmitir todo o conjunto de dados em uma única conexão) ou GoogleAdsService.Search (para paginar os resultados). Para uma lista completa de recursos, campos e métricas que podem ser consultados, consulte a documentação de referência de relatórios.

Próximas etapas

Acesse a seção deste guia que melhor se adapta ao seu caso de uso:

Teste um exemplo rápido
Recuperar métricas de performance de critérios
Segmentar os dados do relatório
Processar linhas de métrica zero
Usar rótulos para organizar e filtrar relatórios
Transmitir dados do relatório com o SearchStream
Navegar por grandes conjuntos de resultados
Mapear relatórios da interface com recursos da API
Revise a sintaxe da linguagem de consulta do Google Ads
Gerenciar dados de relatórios com eficiência
Avançar
Caso de uso
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-01 UTC.