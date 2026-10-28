---
titulo: "Google Ads API — limites de taxa (rate limits)"
url: https://developers.google.com/google-ads/api/docs/best-practices/rate-limits?hl=pt-br
capturado_em: 2026-10-28
hash: 7947ef9ca2e4fe1c
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Limites de taxas

A API Google Ads aplica a limitação de taxa por consultas por segundo (QPS, na sigla em inglês) em IDs de clientes e projetos do Google Cloud de forma independente. Além das solicitações por minuto (que medem a frequência das chamadas de API), a API Google Ads também aplica limites às operações por minuto (que medem o número total de operações de API em todas as solicitações). A API Google Ads usa um algoritmo de token bucket para medir as solicitações e determinar um limite de QPS adequado. Portanto, o limite exato varia dependendo da carga geral do servidor em um determinado momento.

O objetivo de impor limites de taxa é evitar que um usuário interrompa o serviço para outros usuários, sobrecarregando (intencionalmente ou não) os servidores da API Google Ads com um grande volume de solicitações.

As solicitações que violam os limites de taxa são rejeitadas com o erro: RESOURCE_TEMPORARILY_EXHAUSTED.

Você pode controlar seu app e atenuar os limites de taxa reduzindo ativamente o número de solicitações e limitando o QPS do lado do cliente.

Há várias maneiras de reduzir as chances de exceder a limitação de taxa. Conhecer os conceitos de padrões de integração empresarial (EIP) como mensagens, nova entrega e limitação, pode ajudar a criar um app cliente mais robusto.

As práticas recomendadas a seguir são ordenadas por complexidade, com estratégias mais simples na parte de cima e arquiteturas mais robustas, mas sofisticadas, depois:

Espera exponencial
Limitar tarefas simultâneas
Solicitações em lote
Limitação e limitadores de taxa
Enfileiramento
Espera exponencial

Quando o aplicativo receber um RESOURCE_TEMPORARILY_EXHAUSTED erro, use uma política de espera exponencial com jitter aleatório antes de tentar novamente a solicitação com falha. A espera exponencial aumenta progressivamente o tempo de espera entre as tentativas (por exemplo, esperando 2 segundos, depois 4 segundos, depois 8 segundos, além de um pequeno atraso aleatório), permitindo que a carga do servidor e os buckets de cota se recuperem, evitando picos de repetição sincronizados em instâncias de cliente.

Limitar tarefas simultâneas

Uma das causas principais de exceder os limites de limitação de taxa é que o app cliente está gerando um número excessivo de tarefas paralelas. Embora não limitemos o número de solicitações paralelas que um app cliente pode ter, isso pode exceder o limite de solicitações por segundo no nível do projeto do Google Cloud.

Recomendamos definir um limite superior razoável para o número total de tarefas simultâneas que farão solicitações (em todos os processos e máquinas) e ajustar para cima para otimizar a capacidade de processamento sem exceder o limite de taxa.

Além disso, você pode limitar o QPS do lado do cliente (consulte Limitação e limitadores de taxa).

Solicitações em lote

Considere agrupar várias operações em uma única solicitação. Isso é mais aplicável em chamadas Mutate para vários serviços. Por exemplo, se você estiver atualizando o status de várias instâncias de AdGroupAd, poderá chamar MutateAdGroupAds uma vez e transmitir várias operations em vez de chamar MutateAdGroupAds uma vez para cada AdGroupAd. Consulte nossas orientações sobre operações em lote para conferir outros exemplos.

Embora as solicitações em lote reduzam o número total de chamadas de API e atenuem a limitação de taxa de solicitações por minuto, elas podem acionar o limite de taxa de operações por minuto se você realizar um grande número de operações em uma única conta.

Limitação e limitadores de taxa

Além de limitar o número total de linhas de execução no aplicativo, você também pode implementar limitadores de taxa no lado do cliente. Isso garante que todas as linhas de execução em seus processos, clusters ou ambos sejam regidas por um limite de QPS específico do lado do cliente.

Consulte o RateLimiter do Guava ou implemente seu próprio algoritmo de bucket de tokens para um ambiente clusterizado. Por exemplo, você pode gerenciar tokens em um armazenamento de dados distribuído e de baixa latência na memória, como o Redis ou o Memcached, em que cada cliente adquire e consome um token antes de processar uma solicitação. Se os tokens estiverem esgotados, o cliente aguardará até que o próximo lote de tokens seja reabastecido.

Enfileiramento

Uma fila de mensagens é a solução para distribuição de carga de operação, além de controlar as taxas de solicitação e de consumidor. Há várias opções de fila de mensagens disponíveis, algumas de código aberto, outras proprietárias, e muitas delas podem funcionar com diferentes linguagens.

Ao usar filas de mensagens, você pode ter vários produtores enviando mensagens para a fila e vários consumidores processando essas mensagens. As limitações podem ser implementadas no lado do consumidor, limitando o número de consumidores simultâneos ou implementando limitadores de taxa ou limitações para os produtores ou consumidores.

Por exemplo, se um consumidor de mensagens encontrar um erro de limite de taxa, ele poderá retornar a solicitação à fila com um atraso de repetição padronizado (usando a espera exponencial) e atualizar um loop de feedback de limitador de taxa compartilhado para que todos os consumidores reduzam automaticamente a taxa de processamento ao se recuperar do erro.

Anterior
Gerenciar dados com eficiência
Avançar
Alias compartilhados
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-14 UTC.