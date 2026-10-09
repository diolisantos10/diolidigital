---
titulo: "WhatsApp — modelo de cobrança por conversa/mensagem"
url: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
capturado_em: 2026-10-09
hash: 18a3be255e1b8eeb
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Esta página foi traduzida do inglês para outro idioma usando IA. O conteúdo traduzido por IA pode conter erros, omissões ou divergências de sentido. Como a tradução automática pode ser imprecisa ou pouco clara, consulte o conteúdo original em inglês desta página para validar as orientações corretas.
Isso foi útil?
Preços na plataforma do WhatsApp Business
Updated: 30 de set de 2026
Copiar para LLM
Ver como Markdown
Esta página abrange os preços da API de Nuvem e da API de Mensagens de Marketing para o WhatsApp, para as seguintes categorias de mensagens: marketing, utilidade, autenticação, serviço e Meta Business Agent.
Esta página reflete as atualizações de preços que entraram em vigor em 1º de outubro de 2026, por fuso horário da conta de mensagens. Veja os detalhes completos sobre essas atualizações abaixo.
Como a Meta cobra pelas mensagens
Em vigor a partir de 1º de julho de 2025: a Meta cobra por mensagem, conforme os padrões do setor. A Meta cobra por categoria e mercado, e apenas por mensagens de empresas para usuários. A Meta não cobra pelas mensagens de usuários para empresas.
As empresas só serão cobradas quando uma mensagem for entregue. A Meta não cobra pelas mensagens enviadas.
As taxas para mensagens variam com base em dois fatores: a. a categoria da mensagem ("categoria") e b. o código telefônico do país ("mercado") do número de telefone do destinatário no WhatsApp.
Categorias de mensagem
Com a introdução do Meta Business Agent a partir de 1º de julho de 2026, a Meta terá cinco categorias de mensagens diferentes na Plataforma do WhatsApp Business. Uma mensagem de uma empresa para um usuário tem apenas uma das cinco categorias. Portanto, ela pode incorrer em até uma cobrança, de acordo com a categoria da mensagem.
Mensagens de modelo
As empresas podem usar modelos de mensagem para alcançar os usuários – Os modelos de mensagem ("type":"template") podem ser entregues a qualquer momento. As mensagens de modelo são categorizadas em 3 categorias, conforme mostrado a seguir. Consulte categorização de modelos para saber como os modelos de mensagens são categorizados.
Marketing: modelos de mensagens para objetivos promocionais.
Utilidade: mensagens de modelo para objetivos informativos ou de transação.
Autenticação: modelo de mensagens para objetivos de verificação de identidade.
Mensagens que não são de modelo
As empresas só podem usar mensagens que não são de modelo para responder aos usuários – Mensagens que não são de modelo ("type":"text", "type":"image" e assim por diante) só podem ser enviadas em uma janela de atendimento ao cliente aberta de 24 horas, que é aberta e redefinida a cada mensagem do usuário. Observe que a empresa também pode optar por usar mensagens de modelo para responder aos usuários; no entanto, mensagens que não são de modelo não podem ser usadas para entrar em contato com os usuários.
Serviço – Qualquer mensagem que não seja um modelo não fornecida pela Plataforma do Meta Business Agent. Esses recursos podem ser alimentados por uma solução de IA de terceiros ou por pessoas (como representantes de atendimento ao cliente). Os tipos de mensagens (descritos em Enviar mensagens) incluem mensagens de endereço, mensagens de áudio, mensagens interativas de solicitação de localização e muito mais.
Meta Business Agent – Qualquer mensagem sem modelo com tecnologia da Plataforma do Meta Business Agent.
Cobranças por categoria de mensagem
Cobranças por mensagens de marketing, utilidade, autenticação e serviço
Cobrança por: mensagem entregue.
Medidor: por mensagem.
Taxa: varia de acordo com o mercado, alinhada aos padrões do setor. As taxas por categoria também variam. Por isso, as taxas variam por mercado e categoria.
Custo por mensagem:
Utilidade, autenticação e serviço: fixo, de acordo com as taxas publicadas.
Marketing: para a API de Nuvem, fixo, de acordo com as taxas publicadas. Para a API de Mensagens de Marketing para o WhatsApp, pode variar por mensagem se as empresas optarem por usar o recurso de preço máximo.
Níveis de volume: somente para mensagens de autenticação e utilidade. Saiba mais sobre níveis de volume.
Frequência de atualizações: por calendário de preços publicado.
Mensagens gratuitas: Duas instâncias (todas as mensagens na janela de ponto de entrada gratuito; nível gratuito de mensagens de serviço mensais). Saiba mais sobre quando a Meta não cobra.
Cobranças por mensagens do Meta Business Agent
Cobrança por: mensagem entregue.
Medição: por mensagem, com base em uma cobrança por token que abrange o processamento do agente de IA (consumo de token) e a entrega da mensagem. A Meta cobra apenas pelos tokens de entrada e saída e não cobra por tokens de cache.
Taxa: uma taxa global de US$ 2,00 por 1 milhão (M) de tokens. Uma mensagem normalmente consome entre 20.000 e 25.000 tokens, o que equivale a aproximadamente 4 a 5 centavos de dólar por mensagem.
Custo por mensagem: varia de acordo com a complexidade. Respostas simples consomem menos tokens e custam menos; respostas complexas consomem mais tokens e custam mais.
Níveis de volume: não se aplica.
Mensagens gratuitas: não se aplica.
Exemplo de preços
Veja a seguir um exemplo de interação entre uma empresa e um usuário. Começa com a empresa entrando em contato com um modelo de marketing, usando o Meta Business Agent para responder às perguntas do usuário, encaminhando para um representante de atendimento ao cliente e, por fim, enviando uma confirmação do pedido, tudo isso em até uma hora. Leve em consideração o seguinte:
A Meta cobra por cada mensagem da empresa para o usuário. Como há 5 mensagens entregues, há 5 cobranças.
Cada mensagem é cobrada apenas uma vez, conforme a categoria dela. As colunas de "categoria de mensagem" e "cobranças incorridas" sempre se alinham.
Se o usuário iniciasse a conversa com a empresa a partir de um anúncio de clique para o WhatsApp (ocorrendo, portanto, na janela de ponto de entrada gratuito), três das cinco mensagens não seriam cobradas. O Meta Business Agent continua cobrado.
Conteúdo da mensagem
	
Remetente
	
Tipo de mensagem
	
Categoria da mensagem
	
Cobranças incorridas

Lembrete de abandono de carrinho
	
Empresas
	
	
Marketing
	
Marketing

"Vocês têm isso em tamanho pequeno?"
	
Usuário
	
–
	
–
	
–

Resposta com tecnologia da Meta à pergunta do usuário
	
Empresas
	
Sem modelo
	
Meta Business Agent
	
Meta Business Agent

“Você tem isso em branco?”
	
Usuário
	
–
	
–
	
–

Resposta com tecnologia da Meta à pergunta do usuário
	
Empresas
	
Sem modelo
	
Meta Business Agent
	
Meta Business Agent

“Tudo pronto para finalizar a compra, mas meu cartão expirou.”
	
Usuário
	
–
	
–
	
–

Meta Business Agent transfere para o representante de atendimento ao cliente
	
–

O representante do atendimento ao cliente responde à pergunta do usuário
	
Empresas
	
Sem modelo
	
Serviço
	
Serviço

Confirmação do pedido
	
Empresas
	
	
Utilidade
	
Utilidade

	
	
	
Cobrança total
	
5 cobranças
Mercados
A partir de 1º de outubro de 2026: a Meta tem 47 mercados na tabela de tarifas. Desses, 39 representam países nomeados (como Brasil, México e Índia) e 8 representam regiões (como Outros países da América Latina). Um mapeamento desses códigos com os códigos telefônicos dos países está disponível abaixo. Se a empresa enviar uma mensagem a um usuário em um país que é...
Nomeado na tabela de tarifas → a Meta cobra a tarifa desse mercado
Em uma região "Outros" → a Meta cobra a taxa da região em todos os mercados
Quanto a Meta cobra pelas mensagens
A Meta publica taxas para garantir a transparência em todas as 5 categorias e 47 mercados. Consulte nossas tabelas de taxas e níveis de volume.
Tabelas de taxas e níveis de volume
As tabelas de taxas abaixo refletem as taxas e os níveis de volume atuais, que entrarão em vigor a partir de 1º de outubro de 2026, com base no fuso horário da sua conta de mensagens. As taxas também estão disponíveis no site do WhatsApp Business⁠.
Moeda	Lançamento em 2026?	Taxas de lista (CSV)	Níveis de volume para mensagens de autenticação e utilidade (CSV)	Taxas da lista e níveis de volume (PDF)

USD
	
Já disponível
	
Taxas da lista em USD
	
Níveis de volume em USD
	
Taxas e níveis de volume em USD

AED
	
1º de abril de 2026
	
Taxas da lista em AED
	
Níveis de volume em AED
	
Taxas e níveis de volume em AED

ARS
	
1º de abril de 2026
	
Taxas da lista em ARS
	
Níveis de volume em ARS
	
Taxas e níveis de volume em ARS

AUD
	
Já disponível
	
Taxas da lista em AUD
	
Níveis de volume em AUD
	
Taxas e níveis de volume em AUD

BRL
	
1º de julho de 2026
	
Taxas da lista em BRL
	
Níveis de volume em BRL
	
Taxas e níveis de volume em BRL

CLP
	
1º de abril de 2026
	
Taxas da lista em CLP
	
Níveis de volume em CLP
	
Taxas e níveis de volume em CLP

COP
	
1º de abril de 2026
	
Taxas de lista em COP
	
Níveis de volume em COP
	
Taxas e níveis de volume em COP

EUR
	
Já disponível
	
Taxas da lista em EUR
	
Níveis de volume em EUR
	
Taxas e níveis de volume em EUR

GBP
	
Já disponível
	
Taxas de lista em GBP
	
Níveis de volume em GBP
	
Taxas e níveis de volume em GBP

IDR
	
Já disponível
	
Taxas da lista em IDR
	
Níveis de volume em IDR
	
Taxas e níveis de volume em IDR

INR
	
Já disponível
	
Taxas da lista em INR
	
Níveis de volume em INR
	
Taxas e níveis de volume em INR

MXN
	
1º de janeiro de 2026
	
Taxas da lista em MXN
	
Níveis de volume em MXN
	
Taxas e níveis de volume em MXN

MYR
	
1º de abril de 2026
	
Taxas da lista em MYR
	
Níveis de volume em MYR
	
Taxas e níveis de volume em MYR

PEN
	
1º de abril de 2026
	
Taxas da lista em PEN
	
Níveis de volume em PEN
	
Taxas e níveis de volume em PEN

SAR
	
1º de abril de 2026
	
Taxas da lista em SAR
	
Níveis de volume em SAR
	
Taxas e níveis de volume em SAR

SGD
	
1º de abril de 2026
	
Taxas da lista em SGD
	
Níveis de volume em SGD
	
Taxas e níveis de volume em SGD
Moedas
A partir de 1º de julho de 2026: a Meta tem 16 moedas habilitadas na Plataforma do WhatsApp Business, após ter introduzido mais 10 moedas em 2026, conforme descrito na tabela acima. A seleção de moeda faz parte do processo de criação da conta de mensagens. Depois de selecionada, uma moeda não pode ser alterada. As empresas podem usar nossas APIs de Migração de Moeda para escolher outra moeda com mais facilidade.
Comparação entre o Meta Business Agent e as mensagens de serviço
Veja a seguir uma comparação lado a lado do custo esperado para enviar 10 mil mensagens com tecnologia de IA em resposta a usuários no Brasil por meio de modelos de IA de alta complexidade em relação ao Meta Business Agent. As estimativas para soluções de IA de terceiros são baseadas em informações e referências disponíveis publicamente.
Categoria da mensagem
	
Serviço
	
Meta Business Agent

Desempenho do agente de IA
	
Maior complexidade
	
Maior complexidade

Custo do agente de IA
	
~9 ¢ por mensagem
(estimativa de custo de terceiros)
	
~4-5 ¢ por mensagem
US$ 2,00/1 milhão de tokens
x ~25 mil tokens
(estimativa)

Entrega de mensagens1
	
US$ 0,68 ¢ por mensagem1

Total
	
~9 a 10 ¢ por mensagem
	
~4-5 ¢ por mensagem

Total para 10 mil mensagens
	
~ $968
	
~ $400 - $500

1 Com base na taxa atual da Meta para mensagens de utilidade e autenticação para usuários no Brasil.
Além disso, o preço por mensagem do Meta Business Agent pode variar de acordo com a complexidade, em conformidade com as normas do setor. A tabela a seguir mostra exemplos de interações com tecnologia do Meta Business Agent e os respectivos custos estimados.
Tipo de interação
	
Exemplo de mensagem do usuário
	
# mensagens para o usuário na interação
	
Tokens consumidos
	
Est. Custo do Meta Business Agent

Consulta simples
	
"A que horas vocês abrem?"
	
4
	
~80 mil → ~20 mil/mensagem
	
~ 16-20 ¢

Interação complexa
	
"Não consigo passar da etapa 3 desta montagem. Você pode me ajudar?"
	
10
	
~250 mil → ~25 mil/mensagem
	
~ 40 - 50 ¢
Quando a Meta pode atualizar os preços
Calendário de preços
A partir de setembro de 2025, a Meta publicará um calendário de preços para fornecer orientações claras e futuras e permitir que as empresas se planejem e se preparem melhor para atualizações de preços:
A Meta atualizará os preços apenas no 1º dia de cada trimestre, ou seja, até quatro vezes por ano: 1º de janeiro, 1º de abril, 1º de julho e/ou 1º de outubro.
A Meta fornecerá um aviso prévio mais adequado ao esforço necessário para implementar diferentes tipos de atualizações de preços, conforme descrito abaixo:
Tipo de atualização de preços
	
Exemplos
	
Aviso prévio mínimo

Atualização da tabela de tarifas
	
Atualização da taxa para determinada categoria de mercado
Atualização dos níveis de volume para determinado mercado ou categoria (apenas utilidade e autenticação)
Migrar um mercado de uma região de preços (por exemplo, "Outro") para outra OU torná-lo independente na tabela de tarifas
	
1 mês

Complemento do modelo de precificação
	
1º de julho de 2025: lançamento dos novos limites de volume para mensagens de utilidade e autenticação
	
3 meses

Alteração no modelo de precificação
	
1º de julho de 2025: atualização do nosso modelo de precificação, de cobrança por conversa para cobrança por mensagem
	
6 meses
Quando a Meta não cobra
Existem dois casos em que a Meta não cobra por uma mensagem que a empresa envia a um usuário do WhatsApp:
Najanela de ponto de entrada gratuito – Nessa janela, a Meta não cobra por mensagens de marketing, utilidade, autenticação ou serviço. As mensagens do Meta Business Agent continuam sendo cobradas.
Nas primeiras 1.000 mensagens de serviço de cada mês – Para cada número de telefone comercial, a Meta fornece 1.000 mensagens de serviço gratuitas por mês. Esse limite não acumula os dados não utilizados e é redefinido a cada mês. Portanto, a Meta só cobra a partir da 1.001ª mensagem de serviço para cada número de telefone comercial.
Além disso, como observado acima, a Meta não cobra pelas mensagens de um usuário do WhatsApp para uma empresa.
Como a Meta fornece valor por meio dos preços
Janela com ponto de entrada gratuito (FEP, pelas iniciais em inglês)
Se um usuário do WhatsApp enviar uma mensagem para você por meio de um anúncio de clique para o WhatsApp (CTWA, pelas iniciais em inglês) usando um dispositivo com o nosso app para Android ou iOS (não há compatibilidade com os apps para desktop e web):
Uma janela de atendimento ao cliente será aberta.
Se você responder à mensagem do cliente dentro da janela de atendimento com uma mensagem de marketing, utilidade, autenticação ou serviço:
Essa mensagem não é cobrada e abre uma janela de ponto de entrada gratuito ("FEP") a partir do momento da sua resposta.
O período pode ficar aberto por até 7 dias.
Enquanto estiverem abertas, a Meta não cobrará por mensagens de marketing, utilidade, autenticação ou serviço. A Meta continuará cobrando pelas mensagens do Meta Business Agent na janela FEP.
No exemplo abaixo, todas as mensagens da empresa para o usuário são não cobradas porque abriram ou estavam na janela FEP.
Conteúdo da mensagem
	
Remetente
	
Tipo de mensagem
	
Categoria da mensagem
	
Cobranças incorridas

Mensagens de usuários de um anúncio CTWA:
“Você tem isso em branco?”
	
Usuário
	
–
	
–
	
–

Mensagem de carrossel de mídia interativa para mostrar as cores disponíveis do produto
	
Empresas
	
	
Marketing
	
Sem cobrança
Abre janela de FEP

"Vocês têm isso no tamanho pequeno?"
	
Usuário
	
–
	
–
	
–

O representante do atendimento ao cliente responde à pergunta do usuário
	
Empresas
	
Sem modelo
	
Serviço
	
Sem cobrança na janela FEP aberta

Confirmação do pedido
	
Empresas
	
	
Utilidade
	
Não há cobrança na janela aberta do ponto de entrada gratuito

	
	
	
Cobrança total
	
0 cobranças
Janelas de ponto de entrada gratuito com várias contas de mensagens
Assim como as janelas de atendimento ao cliente, a janela de ponto de entrada gratuito é rastreada para o par de usuários comerciais e do WhatsApp, não para uma conta de mensagens individual. Quando várias contas de mensagens enviam usando o mesmo número de telefone comercial, elas compartilham a mesma janela de FEP:
Qualquer conta de mensagens que envia usando esse número de telefone poderá enviar mensagens gratuitas enquanto a janela de FEP estiver aberta.
A conta de mensagens que financiou o anúncio de clique para o WhatsApp não tem uso exclusivo da janela.
Caso uma conta de mensagens diferente responda ao usuário do WhatsApp, e não aquela que financiou o anúncio, as mensagens ainda serão gratuitas enquanto a janela estiver aberta.
Nível gratuito de mensagens de serviço mensais
Isso se aplica apenas a mensagens de serviço, a partir da meia-noite no fuso horário da conta de mensagens em 1º de outubro de 2026.
A Meta retomou a cobrança pelas mensagens de serviço, oferecendo a cada número de telefone comercial um nível gratuito de mil mensagens desse tipo por mês.
Cada número de telefone comercial tem um nível gratuito de mil mensagens de serviço entregues por mês. A Meta cobra a partir da 1.001ª mensagem de serviço por mês, após o nível gratuito ser usado.
As mensagens de serviço não utilizadas no nível gratuito não são transferidas para o mês seguinte. O limite de conversas gratuitas é restaurado a cada mês para todos os números de telefone comerciais. Por exemplo, 1.000 conversas em outubro sem acumulação; 1.000 para novembro sem acumulação). Essa redefinição acontece à meia-noite, de acordo com o fuso horário da conta de mensagens.
Caso as empresas não tenham uma forma de pagamento para as contas de mensagens, a Meta entregará mensagens de serviço dentro do nível gratuito. No entanto, elas não serão entregues depois que o nível gratuito for usado. Para garantir a continuidade das mensagens de serviço a partir de 1º de outubro de 2026, verifique se você tem uma forma de pagamento na Central de Cobrança⁠.
Quando a Meta começar a cobrar a partir da 1.001ª mensagem de serviço de cada mês, o tipo de preço (<PRICING_TYPE>) no objeto de preço dos webhooks de status de mensagens com uma categoria de preço (<PRICING_CATEGORY>) de serviço mudará de free_customer_service para regular, conforme descrito abaixo:
Quais mensagens de serviço
	
Até 30 de setembro 30, 2026
	
A partir de 1º de outubro de 2026

type
	
Carregado
	
type
	
Carregado

Mensagens de serviço no nível gratuito por número de telefone comercial
	
free_customer_service
	
Não
	
free_customer_service
	
Não

Mensagens de serviço após o uso do nível gratuito por número de telefone comercial
	
free_customer_service
	
Não
	
regular
	
Sim
Mensagem de serviço no nível mensal gratuito – Para uma mensagem de serviço entregue enquanto o número de telefone comercial está no nível gratuito:
"pricing": {
  "billable": false,
  "pricing_model": "PMP",
  "type": "free_customer_service",
  "category": "service"
}

Mensagem de serviço que é cobrada – Para uma mensagem de serviço entregue após o nível gratuito do número de telefone comercial ter sido usado:
"pricing": {
  "billable": true,
  "pricing_model": "PMP",
  "type": "regular",
  "category": "service"
}

Níveis de volume para mensagens de autenticação e utilidade
Os níveis de volume se aplicam somente a mensagens de autenticação e utilidade.
As empresas podem obter taxas de autenticação e utilidade mais baixas com base no número de mensagens enviadas em um mês, por mercado e categoria.
Acúmulo de níveis
As mensagens são agregadas no nível do portfólio empresarial, abrangendo todas as contas de mensagens pertencentes ao portfólio: para definir quais níveis podem ser aplicados em determinado mês para cada combinação de mercado e categoria, a Meta agrega mensagens são somadas entre todas as contas de mensagens do portfólio empresarial, conforme o par mercado-categoria (por exemplo, Brasil-autenticação, Brasil-utilidade, Índia-autenticação e assim por diante).
Apenas as mensagens cobradas contam para a definição dos níveis. Por isso, as mensagens de utilidade ou autenticação enviadas na janela de ponto de entrada gratuito não são contabilizadas para os níveis de volume.
Os níveis de volume serão determinados exclusivamente pela Meta: todos os dados de insights são aproximados devido a pequenas variações no processamento das informações. Não se deve depositar confiança excessiva nos dados de insights.
Como funcionam os níveis de volume
Os níveis são específicos por mercado e categoria: os níveis de volume seguem nossas tabelas de taxas e variam conforme o mercado (por exemplo, Brasil ou Outros países da América Latina) e a categoria (utilidade, autenticação).
As taxas são específicas para cada nível: quando uma empresa envia mensagens suficientes em uma determinada combinação de mercado e categoria para atingir o próximo nível, ela ganha acesso à taxa correspondente, aplicada às mensagens do nível em questão. Essa taxa se aplica a todas as contas de mensagens da empresa.
Os níveis são redefinidos todo mês: no início de cada novo mês (meia-noite no fuso horário da conta de mensagens), a contagem de mensagens é zerada, e as empresas começam a acumular mensagens para aquele mês.
Exemplos de níveis de volume
A tabela abaixo é apenas ilustrativa e destaca a dinâmica dos níveis de volume. Consulte nossas tabelas de tarifas para conferir os valores cobrados.
Índia x mensagens de autenticação (mercado específico x categoria de mensagem)

Mensagens por mês
	
O que a Meta cobra (ilustrativo)
	
Como funciona

From
	
Para
	
Taxa
	
vs. Taxa da lista

0
	
A
	
Taxa da lista
	
0%
	
As primeiras mensagens A são cobradas por taxa de lista

A + 1
	
B
	
Taxa do nível 1
	
– 5%
	
Apenas as mensagens de A+1 a B são cobradas pela taxa de nível 1.

B + 1
	
C
	
Taxa do nível 2
	
– 10%
	
Apenas as mensagens de B+1 a C são cobradas pela taxa de nível 2.

C + 1
	
∞
	
Taxa do nível 3
	
– 15%
	
Apenas as mensagens C+1 posteriores serão cobradas pela taxa de nível 3.
Veja abaixo vários exemplos para destacar como os níveis funcionam e o que será cobrado em determinado mês para uma combinação específica de mercado e categoria. Os exemplos referem-se à tabela ilustrativa exibida acima:
Exemplo 1: uma empresa que envia um total de mensagens de autenticação B em um mês para a Índia será cobrada da seguinte forma:
Taxa da lista para as primeiras mensagens A
Taxa do nível 1 para as mensagens de A+1 até B
Cálculo total para o mês = taxa por nível 𝗑 mensagens em cada nível
Exemplo 2: uma empresa que começa a ser cobrada pelas nossas taxas internacionais de autenticação no 15º dia do mês:
Dias 1 a 14 do mês: os níveis de volume são aplicados à taxa de autenticação.
Do dia 15 em diante do mês: os níveis de volume passam a ser aplicados à taxa internacional de autenticação, com as mensagens continuando a acumular no mesmo mês. Por exemplo, se uma empresa já tiver alcançado o nível 2, ela será cobrada pela taxa internacional de autenticação correspondente a esse nível.
Exemplo 3: uma empresa com 3 contas de mensagens que enviam mensagens de autenticação para a Índia. Para a conta de mensagens A, ainda é 31 de julho, de acordo com o fuso horário local. Nas contas de mensagens B e C, já é 1º de agosto, conforme o fuso horário local. No mês de julho, a empresa já está sendo cobrada pela taxa do nível 1.
O portfólio empresarial estará acumulando mensagens para os níveis tanto de julho (por meio da conta de mensagens A) quanto de agosto (por meio das contas de mensagens B e C) durante um determinado período.
A empresa poderá atingir o próximo nível em julho, por meio da conta de mensagens A. Se isso acontecer, as mensagens da conta de mensagens A serão cobradas conforme a taxa do nível 2 no que resta de julho.
Exemplo 4: uma empresa possui 3 contas de mensagens integradas em 2 parceiros. O provedor 1 envia as primeiras mensagens B em um determinado mês, e o provedor 2 começa a enviar mensagens quando a empresa já está no 3º nível. A empresa não envia mensagens suficientes naquele mês para atingir o próximo nível. O que a Meta cobra de cada fornecedor:
Provedor 1: taxa da lista para as primeiras mensagens A, depois, taxa do nível 1 para as mensagens de A+1 até B e taxa do nível 2 para as mensagens de B+1 até C
Provedor 2: taxa do nível 2 aplicada a todas as mensagens enviadas por ele
Webhooks sobre níveis
A partir de 1º de outubro de 2025, um webhook account_update com event definido como VOLUME_BASED_PRICING_TIER_UPDATE será disparado quando sua conta de mensagens atingir um novo nível de volume, em qualquer mercado, em um determinado mês. Isso complementa nosso endpoint pricing_analytics, que continuará fornecendo o progresso do nivelamento ao longo do mês e informações sobre o nível para mensagens entregues.
Exemplo de webhook:
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "time": 1743451903,
      "changes": [
        {
          "value": {
            "volume_tier_info": {
              "tier_update_time": 1743451903,
              "pricing_category": "UTILITY",
              "tier": "25000001:50000000",
              "effective_month": "2025-11",
              "region": "India"
            },
            "event": "VOLUME_BASED_PRICING_TIER_UPDATE"
          },
          "field": "account_update"
        }
      ]
    }
  ]
}

tier_update_time indica quando sua conta de mensagens alcançou um nível de volume maior (registro de data e hora Unix).
pricing_category indica a categoria de modelo (UTILITY ou AUTHENTICATION) à qual a taxa do seu novo nível de volume se aplica.
tier informa os limites mínimo e máximo do novo nível de volume.
effective_month indica o mês em que a tarifa do seu novo nível de volume entra em vigor.
region indica o país ou a região dos usuários do WhatsApp onde se aplica a tarifa do seu novo nível de volume.
É possível que vários webhooks account_update sejam acionados para descrever o mesmo evento de mudança de nível. Nesses casos, use o webhook com o menor registro de data e hora tier_update_time Unix como o webhook oficial.
Análises de nível
Confira informações sobre os níveis de volume por meio da análise de preços.
Outros tipos de mecânica de preços
Janela de atendimento ao cliente (CSW, pelas iniciais em inglês)
Quando você recebe uma mensagem ou uma ligação de um usuário do WhatsApp, uma janela de atendimento de 24 horas é aberta. Se o usuário entrar em contato com você novamente antes que esse tempo acabar, o temporizador será redefinido para 24 horas. As empresas só podem enviar mensagens que não são de modelo aos usuários quando essa janela está aberta. Se não estiver aberta, as empresas só poderão enviar modelos de mensagem para alcançar os usuários.
Só é possível fazer envios a usuários que aceitaram receber suas mensagens. Saiba mais sobre as janelas de atendimento ao cliente.
Tarifas de autenticação internacionais
Mercados específicos estão sujeitos a uma taxa internacional de autenticação. Nossas tabelas de tarifas refletem essas taxas, para os mercados onde elas se aplicam. Consulte Taxas internacionais de autenticação para saber mais sobre essas taxas e entender se elas se aplicam à sua empresa.
Regiões de preços na tabela de tarifas (códigos telefônicos de países)
As cobranças por categoria de mensagem variam de acordo com o código telefônico do país do número de telefone do destinatário no WhatsApp ("mercado"). A tabela abaixo mostra como a Meta associa códigos de ligação de países e códigos de país ISO 3166 Alpha-2 a países ou regiões. Os países não listados abaixo são categorizados como "Outro".
Independente nas tabelas de tarifas – 39 mercados
Argentina (AR): 54
Bangladesh (BD): 880
Brasil (BR): 55
Chile (CL): 56
Colômbia (CO): 57
Egito (EG): 20
França (FR): 33
Alemanha (DE): 49
Hong Kong (HK): 852
Hungria (HU): 36
Índia (IN): 91
Indonésia (ID): 62
Israel (IL): 972
Iraque (IQ): 964
Itália (IT): 39
Cazaquistão (KZ): 7
Kuwait (KW): 965
Malásia (MY): 60
México (MX): 52
Marrocos (MA): 212
Nepal (NP): 977
Países Baixos (NL): 31
Nigéria (NG): 234
Omã (OM): 968
Paquistão (PK): 92
Peru (PE): 51
Polônia (PL): 48
Catar (QA): 974
Romênia (RO): 40
Rússia (RU): 7
Arábia Saudita (SA): 966
Singapura (SG): 65
Sri Lanka (LK): 94
África do Sul (ZA): 27
Espanha (ES): 34
Turquia (TR): 90
Ucrânia (UA): 380
Emirados Árabes Unidos (AE): 971
Reino Unido (GB): 44
Cobrança com base em taxas regionais – 8 regiões de preços
América do Norte – 2 mercados
Canadá (CA): 1
Estados Unidos (EUA) – 1
Outros países da África – 40 mercados
Argélia (DZ): 213
Angola (AO): 244
Benin (BJ): 229
Botsuana (BW): 267
Burkina Faso (BF): 226
Burundi (BI): 257
Camarões (CM): 237
Chade (TD): 235
República do Congo (CG): 242
Eritreia (ER): 291
Etiópia (ET): 251
Gabão (GA): 241
Gâmbia (GM): 220
Gana (GH): 233
Guiné-Bissau (GW): 245
Costa do Marfim (CI): 225
Quênia (KE): 254
Lesoto (LS): 266
Libéria (LR): 231
Líbia (LY): 218
Madagascar (MG): 261
Malaui (MW): 265
Mali (ML): 223
Mauritânia (MR): 222
Moçambique (MZ): 258
Namíbia (NA): 264
Níger (NE): 227
Ruanda (RW): 250
Senegal (SN): 221
Serra Leoa (SL): 232
Somália (SO): 252
Sudão do Sul (SS): 211
Sudão (SD): 249
Suazilândia (SZ): 268
Tanzânia (TZ): 255
Togo (TG): 228
Tunísia (TN): 216
Uganda (UG): 256
Zâmbia (ZM): 260
Zimbábue (ZW): 263
Outros países da Ásia Pacífico – 16 mercados
Afeganistão (AF): 93
Austrália (AU): 61
Camboja (KH): 855
China (CN): 86
Japão (JP): 81
Laos (LA): 856
Mongólia (MN): 976
Nova Zelândia (NZ): 64
Papua-Nova Guiné (PG): 675
Filipinas (PH): 63
Taiwan (TW): 886
Tadjiquistão (TJ): 992
Tailândia (TH): 66
Turcomenistão (TM): 993
Uzbequistão (UZ): 998
Vietnã (VN): 84
Outros países da Europa Central e Leste Europeu – 16 mercados
Albânia (AL): 355
Armênia (AM): 374
Azerbaijão (AZ): 994
Bielorrússia (BY): 375
Bulgária (BG): 359
Croácia (HR): 385
República Tcheca (CZ): 420
Geórgia (GE): 995
Grécia (GR): 30
Letônia (LV): 371
Lituânia (LT): 370
Moldávia (MD): 373
Macedônia do Norte (MK): 389
Sérvia (RS): 381
Eslováquia (SK): 421
Eslovênia (SI): 386
Outros países da Europa Ocidental – 9 mercados
Áustria (AT): 43
Bélgica (BE): 32
Dinamarca (DK): 45
Finlândia (FI): 358
Irlanda (IE): 353
Noruega (NO): 47
Portugal (PT): 351
Suécia (SE): 46
Suíça (CH): 41
Outros países da América Latina – 15 mercados
Bolívia (BO): 591
Costa Rica (CR): 506
República Dominicana (DO): 1 (809, 829, 849)
Equador (EC): 593
El Salvador (SV): 503
Guatemala (GT): 502
Haiti (HT): 509
Honduras (HN): 504
Jamaica (JM): 1 (658, 876)
Nicarágua (NI): 505
Panamá (PA): 507
Paraguai (PY): 595
Porto Rico (PR): 1 (787, 939)
Uruguai (UY): 598
Venezuela (VE): 58
Outros países do Oriente Médio – 4 mercados
Bahrein (BH): 973
Jordânia (JO): 962
Líbano (LB): 961
Iêmen (YE): 967
Outro – Todos os outros mercados
Atualizações anteriores de preços e taxas
Contínua
Esta seção descreve as atualizações contínuas de preços ou cobranças da Plataforma do WhatsApp Business.
Localização de cobrança para o Brasil
Para o Brasil, a implementação gradual começou conforme o planejado em 1º de julho de 2026. A partir de 16 de julho de 2026, todos os Provedores de soluções qualificados e empresas diretamente integradas poderão criar novas contas de mensagens em BRL.
A partir de 1º de julho de 2026, às 9h PT: somente provedores de soluções e empresas integradas diretamente com país de venda no Brasil na Central de Cobrança⁠ (clientes qualificados) poderão criar novas contas de mensagens em BRL (reais brasileiros). Saiba mais sobre a localização de cobranças para o Brasil⁠.
As taxas por mensagem em BRL são publicadas nas nossas tabelas de tarifas e níveis de volume. As cobranças de qualquer conta de mensagens em BRL serão faturadas em BRL pela entidade local da Meta no Brasil, o Facebook Brasil.
Lembramos que os clientes qualificados precisam migrar todas as contas de mensagens no portfólio empresarial para BRL até 30 de junho de 2027 para evitar interrupções, já que a partir de 1º de julho de 2027, a Meta não entregará mais mensagens de contas que não sejam de BRL de clientes qualificados. Para tornar esse processo de migração mais fácil e rápido, use a API de Migração de Moeda, que está disponível a partir de 1º de junho de 2026.
Localização de cobrança para a Índia
A localização de cobrança foi lançada em 1º de janeiro de 2026 para provedores de soluções e empresas diretamente integradas com país de venda na Índia na Central de Cobrança⁠ (clientes qualificados). Saiba mais sobre localização de cobrança na Índia⁠.
Os clientes qualificados devem garantir que todas as contas de mensagens no portfólio empresarial sejam migradas para INR até 31 de dezembro de 2026 para evitar interrupções, já que a partir de 1º de janeiro de 2027 a Meta não entregará mais mensagens de contas que não sejam de INR de clientes qualificados. Para tornar esse processo de migração mais fácil e rápido, use a API de Migração de Moeda, que está disponível a partir de 1º de junho de 2026.
Atualizações anteriores
Esta seção descreve as atualizações anteriores de preços ou cobranças da Plataforma do WhatsApp Business nos últimos 12 meses.
Em vigor a partir de 1º de outubro de 2026
1. Cobrar por mensagens que eram gratuitas anteriormente
Para empresas integradas diretamente ou provedores de soluções que não tiverem uma forma de pagamento registrada até 30 de setembro de 2026, a Meta deixará de entregar mensagens de serviço a partir de 1º de outubro de 2026, quando a cobrança dessas mensagens começará. Para evitar interrupções nas mensagens de serviço, adicione uma forma de pagamento⁠ às suas contas de mensagens até 30 de setembro de 2026.
Mensagens de serviço, que se tornaram gratuitas em 1º de novembro de 2024. Saiba como a Meta cobra por essas mensagens acima. Além disso, a Meta lançou um nível mensal gratuito por número de telefone comercial.
Mensagens de utilidade enviadas em resposta aos usuários (ou seja, em uma janela de atendimento ao cliente aberta), que se tornaram gratuitas a partir de 1º de julho de 2025. Veja acima como a Meta cobra por essas mensagens. Para mensagens com uma categoria de preço (<PRICING_CATEGORY>) de utilidade que são enviadas em uma janela de atendimento ao cliente aberta, o tipo de preço (<PRICING_TYPE>) no objeto de preço dos webhooks de mensagens de status mudará de free_customer_service para regular.
2. 15 de outubro de 2025 atualizações da tabela de tarifas de 2026
A Meta atualizou 40 taxas, conforme resumido e na tabela abaixo:
Mercados movidos de suas respectivas regiões "Rest Of" para serem nomeados na tabela de tarifas – 9 mercados.
Em todas as categorias de mensagens – Até 30 de setembro de 2026, as mensagens para usuários nesses mercados eram cobradas pelas respectivas taxas regionais (por exemplo, Outros países do Oriente Médio para Kuwait). Esses mercados foram retirados da definição de preços regionais para serem nomeados nas tabelas de tarifas, com taxas específicas do mercado.
Para mensagens de utilidade e autenticação – Os níveis de volume desses mercados se tornaram específicos do mercado. Por exemplo, as mensagens que as empresas enviam a usuários no Kuwait a/ não são mais contabilizadas nos níveis de volume do "Outros países do Oriente Médio" e b/ passam a ser contabilizadas nos níveis de volume do Kuwait.
Elemento de preços
	
Até 18 de setembro de 2024, as 30, 2026
	
A partir de 1º de outubro de 2026

Taxa cobrada
	
Taxa da respectiva região de preços do "Resto do mundo"
	
Taxa de mercado independente

Acréscimo para níveis de volume
	
Em direção aos níveis de volume da respectiva região de preços de "Outros"
	
Em direção aos níveis de volume específicos do mercado independente

Exemplo
	
A taxa do "Resto da África" era cobrada no Marrocos.
As mensagens para usuários no Marrocos contribuíram para os níveis de volume do "Resto da África".
	
A taxa do Marrocos é cobrada
As mensagens para usuários no Marrocos contam para os níveis de volume do país
Marketing: 7 mercados, com 7 aumentos e 0 reduções.
Utilidade, autenticação: 12 mercados, com 8 aumentos e 4 reduções.
Autenticação internacional: 9 mercados com novas taxas (consulte a seção 3 abaixo).
Data de vigência
	
Mercado
	
Categoria
	
Mudança de tarifa
	
Observação

1º de outubro de 2026
	
Bangladesh
	
Utilidade
Autenticação
	
Diminuição
	
Removidos da região "Outros países da Ásia-Pacífico"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Iraque
	
Utilidade
Autenticação
	
Diminuição
	
Mudou-se do Oriente Médio

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Cazaquistão
	
Utilidade
Autenticação
	
Aumentar
	
Mudou da região "Outro"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Kuwait
	
Marketing
	
Aumentar
	
Mudou-se do Oriente Médio

Utilidade
Autenticação
	
Aumentar

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
México
	
Marketing
	
Aumentar
	
–

1º de outubro de 2026
	
Marrocos
	
Marketing
Utilidade
Autenticação
	
Aumentar
	
Mudou da região "Outros países da África"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Nepal
	
Utilidade
Autenticação
	
Diminuição
	
Removidos da região "Outros países da Ásia-Pacífico"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Omã
	
Utilidade
Autenticação
	
Aumentar
	
Mudou-se do Oriente Médio

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Paquistão
	
Utilidade
Autenticação
	
Aumentar
	
–

1º de outubro de 2026
	
Peru
	
Utilidade
Autenticação
	
Aumentar
	
–

1º de outubro de 2026
	
Outros países da Ásia-Pacífico
	
Marketing
	
Aumentar
	
–

1º de outubro de 2026
	
Outros países do Oriente Médio
	
Marketing
	
Aumentar
	
–

1º de outubro de 2026
	
Arábia Saudita
	
Marketing
	
Aumentar
	
–

1º de outubro de 2026
	
África do Sul
	
Utilidade
Autenticação
	
Aumentar
	
–

1º de outubro de 2026
	
Sri Lanka
	
Utilidade
Autenticação
	
Diminuição
	
Mudança da região "Outros países da Ásia-Pacífico"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Ucrânia
	
Utilidade
Autenticação
	
Aumentar
	
Mudou-se da região "Outros países da Europa Central e Leste Europeu"

Autenticação internacional
	
Novidade

1º de outubro de 2026
	
Emirados Árabes Unidos
	
Marketing
	
Aumentar
	
–
Depois de receber essas informações, poderemos analisar isso para você. Novas tarifas de autenticação internacional em 9 mercados
Esses valores são superiores às taxas de utilidade e autenticação nesses mercados, estando alinhados aos padrões do setor. Isso significa:
A Meta continua determinando a elegibilidade para as taxas internacionais de autenticação da mesma forma. Saiba mais sobre a qualificação para a taxa internacional de autenticação.
A partir de 1º de setembro de 2026 – A Meta determina a qualificação com base em mensagens de autenticação entregues em 18 mercados (não 9) com taxas internacionais de autenticação, incluindo os 9 mercados adicionais com uma nova taxa internacional de autenticação a partir de 1º de outubro de 2026.
1º de outubro de 2026: a empresa poderá ser cobrada pelas taxas internacionais de autenticação em até 9 mercados ou começar a ser cobrada pelas taxas internacionais de autenticação de acordo com a tabela abaixo.
A partir de 30 de agosto de 2026
	
A partir de 19 de setembro de 2024, as 1, 2026
	
A partir de 1º de outubro de 2026

Qualificado para taxas de autenticação internacional.
Assim, são cobradas taxas de autenticação internacional em até 9 mercados 1.
	
Sem alteração; a qualificação atual se aplica a novos mercados com taxas de autenticação internacional
	
Cobrança de taxas internacionais de autenticação em até 9 mercados adicionais, totalizando até 18 mercados

A conta ainda não se qualifica para as taxas de autenticação internacional.
Assim, não são cobradas taxas de autenticação internacional em nenhum mercado
	
Qualificação para taxas internacionais de autenticação, por mensagens em 18 mercados, e não 92
	
Cobrança de taxas de autenticação internacional em até 18 mercados
1 De acordo com o ponto comercial principal, as empresas podem continuar a ser cobradas pela taxa de autenticação em um destes 18 mercados
2 A Meta continua oferecendo um aviso de qualificação de 30 dias a todos os administradores de contas de mensagens qualificadas antes do início da cobrança das taxas internacionais de autenticação. Assim, as empresas terão tempo para definir o ponto comercial principal.
Em vigor a partir de 1º de julho de 2026
A Meta atualizou as 16 taxas, conforme resumido e na tabela abaixo:
Mercados movidos de suas respectivas regiões "Outros" para serem nomeados na tabela de tarifas – 6 mercados.
Em todas as categorias de mensagens – Até 30 de junho de 2026, as mensagens para usuários nesses mercados eram cobradas pelas respectivas taxas regionais (por exemplo, Outros países da Europa Central e Oriental para a Polônia). Esses mercados foram retirados da definição de preços regionais para serem nomeados nas tabelas de tarifas, com taxas específicas do mercado.
Para mensagens de utilidade e autenticação – Os níveis de volume para esses mercados se tornaram específicos do mercado. Por exemplo, as mensagens que as empresas enviam a usuários na Polônia a/ não contam mais para os níveis de volume do restante da Europa Central e Oriental e, em vez disso, b/ contam para os níveis de volume da Polônia.
Elemento de preços
	
Até 26 de junho 30, 2026
	
A partir de 1º de julho de 2024, 1, 2026

Taxa cobrada
	
Taxa da respectiva região de preços do "Resto do mundo"
	
Taxa de mercado independente

Acréscimo para níveis de volume
	
Em direção aos níveis de volume da respectiva região de preços de "Outros"
	
Em direção aos níveis de volume específicos do mercado independente

Exemplo
	
A taxa de "Outros países da Ásia-Pacífico" era cobrada de Singapura.
As mensagens para usuários em Singapura contribuíram para os níveis de volume do "Resto da Ásia-Pacífico".
	
A taxa de Singapura é cobrada
As mensagens para usuários em Singapura contam para os níveis de volume de Singapura.
Marketing: 4 mercados, com 3 aumentos e 1 redução.
Utilidade e autenticação: 6 mercados, com 5 aumentos e 1 redução.
Autenticação internacional: não há alterações.
Data de vigência
	
Mercado
	
Categoria
	
Mudança de tarifa
	
Observação

1º de julho de 2026
	
Hong Kong
	
Utilidade
Autenticação
	
Mais alto
	
Não está mais na região "Outros países da Ásia-Pacífico"

1º de julho de 2026
	
Hungria
	
Utilidade
Autenticação
	
Mais alto
	
Mudou-se da região "Outros países da Europa Central e Leste Europeu"

1º de julho de 2026
	
Itália
	
Marketing
	
Mais alto
	
–

1º de julho de 2026
	
Polônia
	
Marketing
Utilidade
Autenticação
	
Mais baixo
	
Mudou-se da região "Outros países da Europa Central e Leste Europeu"

1º de julho de 2026
	
Catar
	
Utilidade
Autenticação
	
Mais alto
	
Mudou-se do Oriente Médio

1º de julho de 2026
	
Romênia
	
Utilidade
Autenticação
	
Mais alto
	
Mudou-se da região "Outros países da Europa Central e Leste Europeu"

1º de julho de 2026
	
Cingapura
	
Utilidade
Autenticação
	
Mais alto
	
Não está mais na região "Outros países da Ásia-Pacífico"

1º de julho de 2026
	
Espanha
	
Marketing
	
Mais alto
	
–

1º de julho de 2026
	
Reino Unido
	
Marketing
	
Mais alto
	
–
Em vigor a partir de 1º de abril de 2026
A Meta atualizou as seis taxas, conforme resumido e na tabela abaixo:
Marketing: 1 mercado, com 1 aumento.
Utilidade, autenticação: 2 mercados, com 1 aumento e 1 redução.
Autenticação internacional: 1 mercado, com 1 aumento.
Data de vigência
	
Mercado
	
Categoria
	
Mudança de tarifa

1º de abril de 2026
	
Índia
	
Autenticação internacional
	
Mais alto

1º de abril de 2026
	
Paquistão
	
Utilidade
Autenticação
	
Mais alto

1º de abril de 2026
	
Arábia Saudita
	
Marketing
	
Mais alto

1º de abril de 2026
	
Turquia
	
Utilidade
Autenticação
	
Mais baixo
Em vigor a partir de 1º de janeiro de 2026
A Meta atualizou as 5 taxas, conforme resumido e na tabela abaixo:
Marketing: 3 mercados, com 1 aumento e 2 reduções.
Utilidade, autenticação: 1 mercado, com 0 aumentos e 1 redução.
Autenticação internacional: não há alterações.
Data de vigência
	
Mercado
	
Categoria
	
Mudança de tarifa

1º de janeiro de 2026
	
Egito
	
Marketing
	
Mais baixo

1º de janeiro de 2026
	
França
	
Marketing
	
Mais baixo

1º de janeiro de 2026
	
Índia
	
Marketing
	
Mais alto

1º de janeiro de 2026
	
América do Norte
	
Utilidade
Autenticação
	
Mais baixo
Em vigor a partir de 1º de outubro de 2025
Em setembro de 2025, junto com o anúncio das atualizações da tabela de tarifas de 1º de outubro de 2025, a Meta publicou o calendário de preços, que será válido a partir dessa data.
A Meta atualizou as 13 taxas, conforme resumido e na tabela abaixo:
Marketing: 2 mercados, com 1 aumento e 1 redução.
Utilidade, autenticação: 4 mercados, com 1 aumento e 3 reduções.
Autenticação internacional: não há alterações.
Mudamos mercados para uma "Outros" diferente: 1 mercado
Data de vigência
	
Mercado
	
Categoria
	
Mudança de tarifa
	
Observação

1º de outubro de 2025
	
Argentina
	
Utilidade
Autenticação
	
Mais baixo
	
–

1º de outubro de 2025
	
Colômbia
	
Utilidade
Autenticação
	
Mais alto
	
–

1º de outubro de 2025
	
Egito
	
Utilidade
Autenticação
	
Mais baixo
	
–

1º de outubro de 2025
	
México
	
Marketing
	
Mais baixo
	
–

1º de outubro de 2025
	
Arábia Saudita
	
Utilidade
Autenticação
	
Mais baixo
	
–

1º de outubro de 2025
	
Emirados Árabes Unidos
	
Marketing
	
Mais alto
	
–

1º de outubro de 2025
	
Zimbábue
	
Todos
	
–
	
Alterado de "Outro" para a região "Outros países da África".1
1 Portanto, as mensagens entregues a usuários do WhatsApp com o código de país +263 (Zimbábue) serão cobradas com base nas taxas da região "Outros países da África".
Em vigor a partir de 1º de julho de 2025 ou antes
A partir de 1º de julho de 2025: as taxas de mensagens de utilidade e autenticação em diversos mercados serão reduzidas para garantir que nossos preços estejam alinhados com os de canais alternativos para esses casos de uso. As taxas de conversas de marketing se transformaram em taxas de mensagens de marketing.
A partir de 1º de abril de 2025: redução das taxas de conversas internacionais de autenticação no Egito, na Nigéria, no Paquistão e na África do Sul.
A partir de 1º de fevereiro de 2025: reduzimos as taxas de conversas de autenticação para Egito, Malásia, Nigéria, Paquistão, Arábia Saudita, África do Sul e Emirados Árabes Unidos.
A partir de 1º de novembro de 2024: as conversas de serviço agora são gratuitas para todas as empresas.
A partir de 1º de outubro de 2024: atualizamos as taxas de conversas de marketing para Índia, Arábia Saudita, Emirados Árabes Unidos e Reino Unido.
A partir de 1º de agosto de 2024: reduzimos as taxas de conversas de utilidade.
Outros tópicos sobre preços
Marketing – Novo recurso de preço máximo na API de Mensagens de Marketing para o WhatsApp
A partir de 2026, as empresas integradas à API de Mensagens de Marketing para o WhatsApp poderão definir um preço máximo por entrega de mensagem de marketing. Quando um preço máximo for definido, a Meta cobrará esse valor ou um valor menor pela entrega.
Serviço – Política de preços para Provedores de IA que usam a Plataforma do WhatsApp Business
Veja a política de preços para Provedores de IA, que entrará em vigor em 16 de fevereiro de 2026 e será atualizada em 12 de maio de 2026. As atualizações de preços para mensagens de serviço que entrarão em vigor em 1º de outubro de 2026 não se aplicam a Provedores de IA. Consulte a política de preços para Provedores de IA para saber como a Meta cobra por mensagens de serviço.
Serviço – Política de preços para organizações governamentais e sem fins lucrativos qualificadas que usam a Plataforma do WhatsApp Business
A partir de 1º de outubro de 2026: as mensagens de serviço permanecerão gratuitas além do nível mensal gratuito apenas para organizações governamentais e sem fins lucrativos qualificadas que usam a Plataforma do WhatsApp Business. Esta política de preços entrará em vigor em 31 de dezembro de 2027.
A Meta continua apoiando organizações governamentais e sem fins lucrativos. Essa atualização permite que governos e organizações sem fins lucrativos qualificados mantenham uma presença sempre ativa no WhatsApp para responder e interagir com os usuários do app. As coortes qualificadas incluem:
Departamentos e agências governamentais; organizações intergovernamentais
Organizações sem fins lucrativos da comunidade, incluindo as de saúde pública, resposta a crises, ajuda a desastres e engajamento cívico não partidário
Para organizações que a Meta já identificou como qualificadas, essa política será aplicada a partir da meia-noite, horário da conta de mensagens, em 1º de outubro de 2026. Paralelamente, a Meta está investindo para criar maneiras programáticas para Provedores de Soluções e/ou essas organizações a/ entenderem se são qualificados e b/ solicitarem uma análise da sua qualificação para a Meta. A Meta fornecerá uma atualização assim que essas informações estiverem disponíveis.
Ligações – Preços da API de Ligações Comerciais do WhatsApp
A API de Ligações Comerciais do WhatsApp tem preços diferentes. Veja nosso documento de preços da API de Ligações para saber mais.
Preços baseados em conversa
Os preços baseados em conversa estão obsoletos. Ele foi substituído pelo modelo de preços por mensagem em 1º de julho de 2025.
Análise
Use o campo pricing_analytics para gerar detalhamentos de preços por mensagem e informações sobre níveis para mensagens entregues.
Webhooks de preços
As mensagens faturáveis ​​têm type definido como regular no objeto de preços dos webhooks messages de status:
"pricing": {
  "billable": true,
  "pricing_model": "PMP",
  "type": "regular",
  "category": "<PRICING_CATEGORY>"
}
A <PRICING_CATEGORY> indica qual taxa foi aplicada (por exemplo, marketing). Consulte a referência do webhook de mensagens de status para ver uma lista de valores possíveis.
No momento, não incluímos informações sobre níveis em nenhum webhook. Use o campo pricing_analytics para gerar informações sobre os níveis de mensagens entregues.
Cobrança
As cobranças e ações relacionadas são gerenciadas pelo Meta Business Suite. Para mais informações, consulte Sobre a cobrança da sua conta do WhatsApp Business⁠.
Atribuição de cobrança com várias contas de mensagens
Quando várias contas de mensagens enviam usando o mesmo número de telefone comercial, as cobranças são atribuídas à conta de mensagens específica que enviou cada mensagem. A messaging_account_id — transmitida na chamada de API de envio de mensagem ou resolvida a partir do token do seu app — determina qual conta de mensagens será cobrada por uma determinada entrega de mensagem de modelo.
Cada conta de mensagens mantém o próprio relacionamento de cobrança, forma de pagamento e limites de gastos, independentemente de quantas outras contas de mensagens enviam usando o mesmo número de telefone.
Os níveis de volume são calculados no nível do portfólio empresarial em todas as contas de mensagens que pertencem ao portfólio, e não por número de telefone.
Os provedores de soluções serão cobrados apenas pelas mensagens enviadas por meio da própria conta de mensagens. As mensagens enviadas por outros parceiros no mesmo número de telefone não aparecem na fatura.
Você achou esta página útil?