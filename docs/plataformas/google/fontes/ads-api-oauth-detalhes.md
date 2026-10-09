---
titulo: "Google Ads API — OAuth: refresh token e detalhes internos"
url: https://developers.google.com/google-ads/api/docs/oauth/internals?hl=pt-br
capturado_em: 2026-10-09
hash: 809f99e1ba64354c
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Internos do OAuth 2.0 para a API Google Ads
Observação: as bibliotecas de cliente da API Google Ads processam automaticamente os detalhes abordados neste guia. Leia este guia se quiser entender o que acontece nos bastidores ou se não estiver usando uma biblioteca de cliente.

Esta seção é destinada a usuários avançados que já conhecem a especificação do OAuth 2.0 e sabem como usar o OAuth 2.0 com as APIs do Google.

Escopo

Um único token de acesso pode conceder vários graus de acesso a várias APIs. Um parâmetro variável chamado scope controla o conjunto de recursos e operações que um token de acesso permite. Durante a solicitação do token de acesso, o app envia um ou mais valores no parâmetro scope.

O escopo da API Google Ads é:

https://www.googleapis.com/auth/adwords

Acesso off-line e ciclo de vida do token

É comum que um app cliente da API Google Ads solicite acesso off-line. Por exemplo, o app pode querer executar trabalhos em lote quando o usuário não estiver on-line navegando no site. Os tokens de acesso têm uma vida útil de 3.600 segundos (1 hora). Depois disso, seu app precisa trocar um token de atualização por um novo token de acesso.

Para solicitar acesso off-line a um tipo de app da Web, defina o parâmetro access_type como offline. É possível encontrar mais informações no Guia do OAuth 2.0 do Google.

Para o tipo de app para computador, o acesso off-line é ativado por padrão. Não é necessário solicitar explicitamente.

Cabeçalhos de solicitação

Todas as solicitações à API Google Ads precisam incluir o token de acesso OAuth 2.0 no cabeçalho da solicitação. As seções a seguir descrevem como transmitir essas credenciais usando gRPC e REST.

Cabeçalhos gRPC

Ao usar a API gRPC, inclua o token de acesso em cada solicitação. Você pode vincular um Credential a um Channel para uso em todas as solicitações nesse canal. Você também pode enviar uma credencial personalizada para cada chamada. O guia de autorização do gRPC contém mais detalhes sobre como lidar com a autorização.

Cabeçalhos REST

Ao usar a API REST, transmita o token de acesso pelo cabeçalho HTTP Authorization: Bearer <ACCESS_TOKEN>. Um exemplo de solicitação HTTP é mostrado:

# Returns the resource names of customers directly accessible by the user
# authenticating the call.
#
# Variables:
#   API_VERSION,
#   OAUTH2_ACCESS_TOKEN:
#     See https://developers.google.com/google-ads/api/rest/auth#request_headers
#     for details.
#
curl -f --request GET \
"https://googleads.googleapis.com/v${API_VERSION}/customers:listAccessibleCustomers" \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${OAUTH2_ACCESS_TOKEN}" \

Anterior
Requisitos de segurança
Avançar
Configurar um projeto do Console de APIs do Google para autorização
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-30 UTC.