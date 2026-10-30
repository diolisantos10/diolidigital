---
titulo: "Google Ads API — limites de taxa (rate limits)"
url: https://developers.google.com/google-ads/api/docs/best-practices/rate-limits?hl=pt-br
capturado_em: 2026-10-30
hash: be8171247ba0a995
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Limites de taxas

A API Google Ads aplica a limitação de taxa por consultas por segundo (QPS) em IDs de cliente e projetos do Google Cloud de forma independente. Além das solicitações por minuto (que medem a frequência das chamadas de API), a API Google Ads também impõe limites às operações por minuto (que medem o número total de operações de API em todas as solicitações). A API Google Ads usa um algoritmo de token bucket para medir as solicitações e determinar um limite de QPS adequado. Portanto, o limite exato varia de acordo com a carga geral do servidor em um determinado momento.

O objetivo de impor limites de taxa é evitar que um usuário interrompa o serviço para outros usuários ao sobrecarregar (intencionalmente ou não) os servidores da API Google Ads com um alto volume de solicitações.

As solicitações que violam os limites de taxa são rejeitadas com o erro: RESOURCE_TEMPORARILY_EXHAUSTED.

É possível assumir o controle do app e reduzir os limites de taxa reduzindo ativamente o número de solicitações e limitando as QPS do lado do cliente.

Há várias maneiras de reduzir as chances de exceder a limitação de taxa. Conhecer os conceitos de padrões de integração empresarial (EIP, na sigla em inglês), como mensagens, reenvio e limitação, pode ajudar você a criar um app cliente mais robusto.

As práticas recomendadas a seguir são ordenadas por complexidade, com estratégias mais simples no topo e arquiteturas mais robustas, porém sofisticadas, depois:

Espera exponencial
Limitar tarefas simultâneas
Solicitações em lote
Limitação e limitadores de taxa
Vídeos na fila
Espera exponencial

Quando o aplicativo receber um erro RESOURCE_TEMPORARILY_EXHAUSTED, use uma política de espera exponencial com instabilidade aleatória antes de tentar novamente a solicitação com falha. A espera exponencial aumenta progressivamente o tempo de espera entre as novas tentativas (por exemplo, aguardando 2 segundos, depois 4 segundos, depois 8 segundos, além de um pequeno atraso aleatório), permitindo que a carga do servidor e os buckets de cota se recuperem, evitando picos de novas tentativas sincronizadas entre as instâncias do cliente.

Limitar tarefas simultâneas

Uma causa raiz de exceder os limites de limitação de taxa é que o app cliente está gerando um número excessivo de tarefas paralelas. Embora não limitemos o número de solicitações paralelas que um app cliente pode ter, isso pode exceder o limite de solicitações por segundo no nível do projeto do Google Cloud.

É recomendável definir um limite superior razoável para o número total de tarefas simultâneas que vão fazer solicitações (em todos os processos e máquinas) e ajustar para cima para otimizar a capacidade de processamento sem exceder o limite de taxa.

Além disso, é possível limitar as QPS do lado do cliente (consulte Limitação e limitadores de taxa).

Solicitações em lote

Considere agrupar várias operações em uma única solicitação. Isso é mais aplicável em chamadas Mutate para vários serviços. Por exemplo, se você estiver atualizando o status de várias instâncias de AdGroupAd, chame MutateAdGroupAds uma vez e transmita vários operations em vez de chamar MutateAdGroupAds uma vez para cada AdGroupAd. Consulte nossas orientações sobre operações em lote para ver mais exemplos.

Embora a solicitação em lote reduza o número total de chamadas de API e mitigue a limitação de taxa de solicitações por minuto, ela pode acionar o limite de taxa de operações por minuto se você realizar um grande número de operações em uma única conta.

Limitação e limitadores de taxa

Além de limitar o número total de linhas de execução no aplicativo, também é possível implementar limitadores de taxa no lado do cliente. Isso garante que todas as linhas de execução nos processos, clusters ou ambos sejam regidas por um limite de QPS específico do lado do cliente.

Consulte o RateLimiter do Guava ou implemente seu próprio algoritmo de token bucket para um ambiente em cluster. Por exemplo, é possível gerenciar tokens em um armazenamento de dados em memória distribuído e de baixa latência, como Redis ou Memcached, em que cada cliente adquire e consome um token antes de processar uma solicitação. Se os tokens se esgotarem, o cliente vai esperar até que o próximo lote de tokens seja reabastecido.

Enfileiramento

Uma fila de mensagens é a solução para a distribuição de carga de operação, além de controlar as taxas de solicitação e de consumo. Há várias opções de fila de mensagens disponíveis, algumas de código aberto, outras proprietárias, e muitas delas podem funcionar com diferentes linguagens.

Ao usar filas de mensagens, é possível ter vários produtores enviando mensagens para a fila e vários consumidores processando essas mensagens. As limitações podem ser implementadas no lado do consumidor, limitando o número de consumidores simultâneos ou implementando limitadores de taxa ou de limitação para os produtores ou consumidores.

Por exemplo, se um consumidor de mensagens encontrar um erro de limite de taxa, ele poderá retornar a solicitação à fila com um atraso de nova tentativa padronizado (usando espera exponencial) e atualizar um loop de feedback compartilhado do limitador de taxa para que todos os consumidores reduzam automaticamente a taxa de processamento enquanto se recuperam do erro.

Anterior
Gerenciar dados com eficiência
Avançar
Alias compartilhados
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-30 UTC.