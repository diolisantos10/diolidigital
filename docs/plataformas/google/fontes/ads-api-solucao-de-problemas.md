---
titulo: "Google Ads API — solução de problemas"
url: https://developers.google.com/google-ads/api/docs/best-practices/troubleshooting?hl=pt-br
capturado_em: 2026-09-26
hash: 865db7c7830d9c7b
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Solução de problemas

Os erros podem ser causados por uma configuração incorreta do ambiente, um bug no software ou uma entrada inválida de um usuário. Não importa a origem, você precisará resolver o problema e corrigir o código ou adicionar lógica para lidar com o erro do usuário. Este guia discute algumas práticas recomendadas para resolver erros da API Google Ads.

Garantir a conectividade

Verifique se você tem acesso à API Google Ads e uma configuração correta. Se a resposta retornar erros HTTP, resolva-os com cuidado e verifique se você está acessando os serviços que pretende usar no seu código.

Suas credenciais são incorporadas à sua solicitação para que os serviços façam a autenticação. Familiarize-se com a estrutura das solicitações e respostas da API Google Ads, principalmente se você for processar chamadas sem usar as bibliotecas de cliente. Cada biblioteca de cliente é enviada com instruções específicas sobre como incluir suas credenciais no arquivo de configuração. Consulte o README da biblioteca de cliente.

Verifique se você está usando as credenciais corretas. Nosso guia de início rápido mostra como adquirir o conjunto correto de que você precisa. Por exemplo, a falha de resposta a seguir mostra que o usuário enviou credenciais de autenticação inválidas:

{
  "error": {
    "code": 401,
    "message": "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. Visit https://developers.google.com/identity/sign-in/web/devconsole-project.",
    "status": "UNAUTHENTICATED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.DebugInfo",
        "detail": "Authentication error: 2"
      }
    ]
  }
}

Se você seguiu essas etapas e ainda está com problemas, é hora de resolver os erros da API Google Ads.

Determinar o problema

Em geral, a API Google Ads informa erros como um objeto de falha JSON, que contém uma lista de erros na resposta. Esses objetos fornecem um código de erro e uma mensagem explicando por que ele ocorreu. Eles são os primeiros sinais de qual pode ser o problema.

{
  "errors": [
    {
      "errorCode": { "fieldMaskError": "FIELD_NOT_FOUND" },
      "message": "The field mask contained an invalid field: 'keyword.match_type'.",
      "location": {
        "fieldPathElements": [
          { "fieldName": "operations", "index": 1 }
        ]
      }
    }
  ]
}

Todas as nossas bibliotecas de cliente geram exceções que encapsulam erros na resposta. Capturar essas exceções e imprimir as mensagens em um registro ou em uma tela de solução de problemas é uma ótima maneira de começar. Integrar essas informações aos outros eventos registrados no aplicativo oferece uma boa visão geral do que pode estar causando o problema. Depois de identificar o erro nos registros, você precisa descobrir o que ele significa.

Pesquisar o erro

Consulte nossa documentação de erros comuns, que aborda os erros mais frequentes. Ele descreve a mensagem de erro, as referências de API relevantes e como evitar ou lidar com o erro.

Se a documentação de erros comuns não mencionar especificamente o erro, consulte nossa documentação de referência e procure a string de erro.

Pesquise nossos canais de suporte para acessar outros desenvolvedores que compartilham experiências com a API. Outra pessoa pode ter encontrado e resolvido o problema que você está enfrentando.

Acesse a Central de Ajuda do Google Ads para resolver problemas de validação ou limites da conta. A API Google Ads herda as regras e limitações do produto principal do Google Ads.

Às vezes, as postagens do blog são uma boa referência para resolver problemas do aplicativo.

Se você encontrar erros que não estão documentados, entre em contato com o suporte.

Depois de pesquisar o erro, é hora de determinar a causa raiz.

Localizar a causa

Verifique a mensagem de exceção para determinar a causa do erro. Depois de analisar a resposta, verifique a solicitação para encontrar uma possível causa. Algumas mensagens de erro da API Google Ads incluem fieldPathElements no campo location do GoogleAdsError, indicando onde o erro ocorreu na solicitação. Exemplo:

{
  "errors": [
    {
      "errorCode": {"criterionError": "CANNOT_ADD_CRITERIA_TYPE"},
      "message": "Criteria type can not be targeted.",
      "trigger": { "stringValue": "" },
      "location": {
        "fieldPathElements": [
          { "fieldName": "operations", "index": 0 },
          { "fieldName": "create" },
          { "fieldName": "keyword" }
        ]
      }
    }
  ]
}

Ao resolver um problema, você pode descobrir que o aplicativo está fornecendo informações erradas para a API. Recomendamos usar um depurador de ambiente de desenvolvimento integrado (IDE) para definir pontos de interrupção, percorrer o código linha por linha e inspecionar os payloads de solicitação construídos antes de serem enviados.

Verifique se a solicitação corresponde às entradas do aplicativo. Por exemplo, o nome da campanha pode não estar chegando à solicitação. Envie uma máscara de campo que corresponda às atualizações que você quer fazer. A API Google Ads aceita atualizações esparsas. Omitir um campo da máscara de campo em uma solicitação de mutação indica que a API não deve fazer nada com ele. Se o aplicativo recuperar um objeto, fizer uma mudança e o enviar de volta, talvez você esteja inserindo valores em um campo que não aceita atualizações. Confira a descrição do campo na documentação de referência para saber se há restrições sobre quando ou se é possível atualizar o campo.

Como conseguir ajuda

Nem sempre é possível identificar e resolver o problema por conta própria. Você pode entrar em contato com o suporte para receber ajuda.

Tente incluir o máximo de informações possível nas suas consultas. Os itens recomendados incluem:

Solicitação e resposta JSON higienizadas. Remova informações sensíveis, como seu token de acesso OAuth, token de atualização, token de desenvolvedor (se ainda estiver incluído em cabeçalhos de solicitação legados) e IDs de cliente.
Snippets de código. Se você estiver com um problema específico de um idioma ou precisar de ajuda para trabalhar com a API, inclua um snippet de código para explicar o que você está fazendo.
request-id. Isso permite que os membros da equipe de relações com desenvolvedores do Google localizem sua solicitação se ela for feita no ambiente de produção. Recomendamos registrar o request-id incluído nos cabeçalhos de resposta ou exceções que encapsulam erros de resposta, além de mais contexto do que o request-id sozinho.
Outras informações, como a versão do ambiente de execução ou do interpretador e a plataforma, também podem ser úteis na solução de problemas.
Corrigir o problema

Agora que você já descobriu qual é o problema e chegou a uma solução, é hora de fazer alterações e testar a correção em uma conta de teste (de preferência) ou de produção (se o bug só se aplicar aos dados de uma conta de produção específica).

Próximas etapas

Agora que esse problema já está resolvido, você descobriu formas de melhorar seu código para evitar que ele ocorra?

Criar um bom conjunto de testes de unidade ajuda a melhorar consideravelmente a qualidade e a confiabilidade do código. Ele também acelera o processo de teste de novas mudanças para garantir que elas não prejudiquem a funcionalidade anterior. Uma boa estratégia de tratamento de erros também é fundamental para mostrar todos os dados necessários para a solução de problemas.

Anterior
Limites do sistema
Avançar
Testes
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-09-24 UTC.