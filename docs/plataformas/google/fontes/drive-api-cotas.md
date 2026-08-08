---
titulo: "Google Drive API — limites de uso e cotas (usage limits)"
url: https://developers.google.com/workspace/drive/api/guides/limits
capturado_em: 2026-08-08
hash: 6ea618dcb7de95ff
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Limites de uso

A partir de 1º de maio de 2026, os limites de uso dessa API foram atualizados. Os projetos do Google Cloud que usaram essa API entre novembro de 2025 e abril de 2026 vão continuar com as cotas de uso definidas anteriormente. Os projetos do Cloud criados a partir de 1º de maio de 2026 estão sujeitos às novas cotas de API.

Para mais informações, incluindo cronogramas, consulte Modelo padronizado do Google Workspace para ferramentas e APIs de agente.

Para conferir o anúncio completo, consulte Ferramentas de agente e atualizações de segurança para desenvolvedores do Google Workspace.

Como a API Google Drive é um serviço compartilhado, aplicamos cotas e limitações para garantir que ela seja usada de forma justa por todos os usuários e para proteger o desempenho geral do sistema do Google Workspace.

Os limites são definidos em termos de unidades de cota, uma unidade de medida abstrata que representa o uso de recursos do Google Drive.

Cotas da API Drive

Há três tipos de cotas aplicadas:

Por minuto por projeto:é o número de unidades de cota que seu projeto na nuvem do Google Cloud pode usar em um minuto.

Por minuto por usuário por projeto:é o número de unidades de cota que um usuário específico pode usar no seu projeto na nuvem. Esse limite tem como objetivo ajudar você a garantir uma distribuição justa do uso entre os usuários.

Por dia por projeto: define o número máximo de bytes que seu projeto na nuvem do Google Cloud pode enviar em um período de 24 horas antes que as cobranças sejam aplicadas.

A tabela a seguir detalha esses limites:

Tipo de limite de uso	Limite
Por minuto por projeto	1.000.000 de unidades de cota
Por minuto por usuário por projeto	325.000 unidades de cota
Por dia por projeto	1 TB

Se você exceder uma cota, vai receber uma resposta de código de status HTTP 403: User rate limit exceeded. Outras verificações de limite de taxa no back-end do Drive também podem gerar uma 429: Rate limit exceeded resposta. Se isso acontecer, use um algoritmo de espera exponencial e tente novamente mais tarde.

Limite de faturamento diário

Esse limite por dia por projeto define o número máximo de unidades de cota que seu projeto do Google Cloud pode usar em um período de 24 horas antes que as cobranças sejam aplicadas.

O uso abaixo desse limite não gera cobranças extras, e sua conta do Google Cloud não é faturada. Os detalhes completos do faturamento serão compartilhados mais tarde em 2026, com pelo menos 90 dias de antecedência antes que as mudanças entrem em vigor.

Não é possível solicitar um aumento nesse limite diário.

A tabela a seguir detalha o limite:

Tipo de limite	Limite
Por dia por projeto	400.000.000 de unidades de cota

Para mais informações, consulte Modelo padronizado do Google Workspace para ferramentas de agente e APIs.

Uso de cotas por método

O número de unidades de cota consumidas por solicitação varia de acordo com o método chamado. A tabela a seguir descreve o uso de unidades de cota por método:

Ação	Unidades de cota
Ler itens, como files.get	5
Listar itens, como files.list	100
Fazer o download de itens, como files.download	200
Editar itens, como files.update	50
Outras ações, como files.generateIds	5
Outras restrições

As restrições a seguir são aplicadas ao trabalhar com a API Drive:

Os usuários do Google Workspace só podem fazer upload de 750 GB por dia entre o Meu Drive e todos os drives compartilhados. Esse limite também se aplica a cópias.

Os usuários que atingirem o limite de 750 GB ou fizerem upload de um arquivo com mais de 750 GB não poderão fazer upload ou copiar outros arquivos até que 24 horas tenham se passado.

O tamanho máximo de arquivo que os usuários podem fazer upload é de 5 TB. Apenas o primeiro arquivo que ultrapassa o limite conclui o upload. O tamanho máximo de arquivo que os usuários podem copiar é de 750 GB.

As notificações entregues ao endereço especificado ao abrir um canal de notificação não são contabilizadas nos limites de cota. No entanto, as chamadas para os changes.watch, channels.stop e files.watch métodos são contabilizadas na sua cota.

Desde que você permaneça dentro das cotas por minuto, não há limite para o número de solicitações que podem ser feitas por dia.

Dependendo do tipo de conta do Google Workspace, há limites adicionais de armazenamento no Drive.

Resolver erros de cota com base no tempo

Para todos os erros com base no tempo (máximo de N solicitações por X minutos), recomendamos que seu código detecte a exceção e use uma espera exponencial truncada para garantir que seus dispositivos não gerem carga excessiva.

A espera exponencial é uma estratégia padrão de tratamento de erros para aplicativos de rede. Um algoritmo de espera exponencial repete solicitações usando tempos de espera exponencialmente crescentes entre as solicitações, até um tempo máximo de espera. Se as solicitações ainda não forem bem-sucedidas, é importante que os atrasos entre as solicitações aumentem com o tempo até que a solicitação seja bem-sucedida.

Exemplo de algoritmo

Um algoritmo de espera exponencial repete solicitações exponencialmente, aumentando o tempo de espera entre novas tentativas até um tempo máximo de espera. Exemplo:

Faça uma solicitação para a API Google Drive.
Se a solicitação falhar, aguarde 1 + random_number_milliseconds e repita a solicitação.
Se a solicitação falhar, aguarde 2 + random_number_milliseconds e repita a solicitação.
Se a solicitação falhar, aguarde 4 + random_number_milliseconds e repita a solicitação.
E assim por diante, até um tempo maximum_backoff.
Continue aguardando e tentando novamente até um número máximo de novas tentativas, sem aumentar o tempo de espera entre elas.

em que:

O tempo de espera é min(((2^n)+random_number_milliseconds), maximum_backoff), com n incrementado em 1 para cada iteração (solicitação).
random_number_milliseconds é um número aleatório de milissegundos menor ou igual a 1.000. Isso ajuda a evitar casos em que muitos clientes são sincronizados por alguma situação e todos tentam novamente ao mesmo tempo, enviando solicitações em ondas sincronizadas. O valor de random_number_milliseconds é recalculado após cada nova tentativa de solicitação.
maximum_backoff costuma ser 32 ou 64 segundos. O valor adequado depende do caso de uso.

O cliente pode continuar tentando novamente depois de maximum_backoff. As novas tentativas após esse ponto não precisam continuar aumentando o tempo de espera. Por exemplo, se um cliente usar um tempo maximum_backoff de 64 segundos, depois de atingir este valor, o cliente poderá repetir a cada 64 segundos. Em algum momento, os clientes precisam ser impedidos de tentar novamente infinitas vezes.

O tempo de espera entre novas tentativas e o número de novas tentativas depende do seu caso de uso e das condições da rede.

Preços

Todo o uso padrão da API Google Drive está disponível sem custo extra. O excesso dos limites de solicitação de cota vai gerar cobranças na sua conta de faturamento do Google Cloud mais tarde em 2026. Para mais informações, consulte Modelo padronizado do Google Workspace para ferramentas e APIs de agente.

Solicitar aumento de cota

Dependendo do uso de recursos do seu projeto, talvez você queira solicitar um ajuste de cota. As chamadas de API por uma conta de serviço são consideradas como uso de uma única conta. Solicitar uma cota ajustada não garante a aprovação. As solicitações de ajuste de cota que aumentam significativamente o valor da cota podem levar mais tempo para serem aprovadas.

Nem todos os projetos têm as mesmas cotas. À medida que você usa o Google Cloud com o tempo, os valores de cota podem precisar aumentar. Caso espere um aumento de uso significativo, solicite o ajuste das cotas na página Cotas e limites do sistema no Console do Google Cloud.

Para saber mais, leia os seguintes artigos:

Sobre os ajustes de cota
Ver o uso e os limites de cota
Solicitar um limite de cota maior
Cotas do servidor MCP do Drive

O servidor MCP do Drive usa uma métrica de alocação de custo de consulta. As tabelas a seguir detalham o custo da consulta para cada método do servidor MCP do Drive por seção:

Cotas do MCP do Drive

Há dois tipos de cotas aplicadas:

Por minuto por projeto na nuvem: Este é o custo da consulta para seu projeto na nuvem do Google Cloud por um minuto.

Por minuto por usuário por projeto:é o custo da consulta para seu projeto na nuvem do Google Cloud por um minuto que um usuário específico pode usar.

A tabela a seguir detalha essas cotas:

Tipo de limite de uso	Custo da consulta
Por minuto por projeto	325.000
Por minuto por usuário por projeto	1.000.000
Cotas do conjunto de ferramentas do MCP do Drive

A tabela a seguir detalha o custo da consulta para cada conjunto de ferramentas drivemcp.googleapis.com:

Endpoint	Ferramenta	Custo da consulta

/mcp/v1

	

copy_file

	

50

create_file

	

50

download_file_content

	

200

get_file_metadata

	

5

get_file_permissions

	

5

list_recent_files

	

100

read_file_content

	

200

search_files

	

100

Para mais informações, consulte a referência da API MCP do Drive.

Temas relacionados
Melhore o desempenho
Limites de arquivos e pastas
Limites de arquivos e pastas em drives compartilhados
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-08-02 UTC.