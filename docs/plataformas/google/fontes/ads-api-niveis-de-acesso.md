---
titulo: "Google Ads API — níveis de acesso e RMF"
url: https://developers.google.com/google-ads/api/docs/productionize/access-levels?hl=pt-br
capturado_em: 2026-10-30
hash: 1097c01b8cca9d75
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Níveis de acesso e RMF

A API Google Ads tem níveis de acesso associados ao projeto do Google Cloud e usa um processo de análise de aplicativos para conceder vários níveis de acesso. É importante planejar e conseguir os níveis de acesso corretos antes de produzir o aplicativo.

Um cenário comum é o desenvolvimento do aplicativo começar com o nível de acesso Explorer, mas depois ultrapassar os limites de cota ao longo do tempo. Nesse momento, você deve solicitar o nível de acesso básico ou o nível de acesso padrão. As solicitações de acesso básico são analisadas automaticamente, mas o processo de análise do acesso padrão pode levar vários dias úteis ou, às vezes, semanas para ser concluído. Por isso, peça o upgrade para o nível de acesso padrão bem antes de precisar dos limites de cota maiores.

O Google pode exigir que seu app ofereça determinados recursos ou funcionalidades, conforme listado nos Recursos mínimos obrigatórios (RMF). Ao usar a API Google Ads, o RMF se aplica apenas a projetos na nuvem do Google Cloud com nível de acesso padrão. Revise esses requisitos com antecedência para evitar mais atrasos na criação dos recursos necessários no app.

Preços

O uso da API Google Ads é sem custo financeiro. Não há cobranças para usar a API Google Ads nos níveis de acesso Explorer, básico ou padrão. No entanto, se você estiver sujeito aos Recursos mínimos obrigatórios (RMF), a equipe de revisão da API vai auditar sua ferramenta para verificar a conformidade. Se a auditoria resultar em uma constatação de não conformidade, talvez seja necessário pagar taxas de não conformidade.

Anterior
Proteger credenciais
Avançar
Logging
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-30 UTC.