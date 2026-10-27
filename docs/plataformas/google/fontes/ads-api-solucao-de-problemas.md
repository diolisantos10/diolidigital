---
titulo: "Google Ads API — solução de problemas"
url: https://developers.google.com/google-ads/api/docs/best-practices/troubleshooting?hl=pt-br
capturado_em: 2026-10-27
hash: bbd971fc54b156b8
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Solução de problemas

Os erros podem ser causados por uma configuração incorreta do ambiente, um bug no software ou uma entrada inválida de um usuário. Não importa a origem, você precisará resolver problemas e corrigir o código ou adicionar lógica para lidar com o erro do usuário. Este guia discute algumas práticas recomendadas ao solucionar problemas da API Google Ads.

Garantir a conectividade

Verifique se você tem acesso à API Google Ads e uma configuração correta. Se a resposta retornar erros de HTTP, resolva-os com cuidado e verifique se você está acessando os serviços que pretende usar no código.

Suas credenciais estão incorporadas à sua solicitação para que os serviços possam autenticar você. Familiarize-se com a estrutura das solicitações e respostas da API Google Ads, principalmente se você for processar chamadas sem usar as bibliotecas de cliente. Cada biblioteca de cliente é enviada com instruções específicas sobre como incluir suas credenciais no arquivo de configuração. Consulte o README da biblioteca de cliente.

Verifique se você está usando as credenciais corretas. Nosso guia de início rápido orienta você no processo de aquisição do conjunto correto de credenciais. Por exemplo, a falha de resposta a seguir mostra que o usuário enviou credenciais de autenticação inválidas:

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

Se você seguiu estas etapas e ainda está com problemas, é hora de solucionar os erros da API Google Ads.

Determinar o problema

A API Google Ads geralmente informa erros como um objeto de falha JSON, que contém uma lista de erros na resposta. Esses objetos fornecem um código do erro e uma mensagem que explica por que ele ocorreu. Eles são seus primeiros sinais de qual pode ser o problema.

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

Todas as nossas bibliotecas de cliente geram exceções que encapsulam erros na resposta. Capturar essas exceções e imprimir as mensagens em um registro ou tela de solução de problemas é uma ótima maneira de começar. A integração dessas informações com os outros eventos registrados no aplicativo oferece uma boa visão geral do que pode estar causando o problema. Depois de identificar o erro nos registros, você precisará descobrir o que ele significa.

Pesquisar o erro

Consulte nossa documentação de erros comuns, que aborda os erros mais frequentes. Ela descreve a mensagem de erro, as Referências da API relevantes e como evitar ou lidar com o erro.

Se a documentação de erros comuns não mencionar especificamente o erro, consulte nossa documentação de referência e procure a string de erro.

Pesquise nossos canais de suporte para ter acesso a outros desenvolvedores que compartilham suas experiências com a API. Alguém pode ter encontrado e resolvido o problema que você está enfrentando.

Acesse a Central de Ajuda do Google Ads para receber ajuda na solução de problemas de validação ou de limite de conta. A API Google Ads herda as regras e limitações do produto principal do Google Ads.

Os posts de blog podem ser uma boa referência ao solucionar problemas do aplicativo.

Se você encontrar erros que não estão documentados, entre em contato com o suporte.

Depois de pesquisar o erro, é hora de determinar a causa raiz.

Localizar a causa

Verifique a mensagem de exceção para determinar a causa do erro. Depois de analisar a resposta, verifique a solicitação para encontrar uma possível causa. Algumas mensagens de erro da API Google Ads incluem fieldPathElements no location campo de GoogleAdsError, indicando onde o erro ocorreu na solicitação. Exemplo:

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

Ao resolver problemas, você pode descobrir que o aplicativo está fornecendo informações incorretas para a API. Recomendamos o uso de um depurador de ambiente de desenvolvimento integrado (IDE, na sigla em inglês) para definir pontos de interrupção, percorrer o código linha por linha e inspecionar os payloads de solicitação construídos antes de serem enviados.

Verifique se a solicitação corresponde às entradas do aplicativo. Por exemplo, o nome da campanha pode não estar chegando à solicitação. Envie uma máscara de campo que corresponda às atualizações que você quer fazer. A API Google Ads oferece suporte a atualizações esparsas. Omitir um campo da máscara de campo em uma solicitação de mutação indica que a API deve deixá-lo sozinho. Se o aplicativo recuperou um objeto, fez uma mudança e o retornou, talvez você esteja gravando em um campo que não oferece suporte à atualização. Verifique a descrição do campo na documentação de referência para saber se há restrições sobre quando ou se você pode atualizar o campo.

Como conseguir ajuda

Nem sempre é possível identificar e resolver o problema por conta própria. Você pode entrar em contato com o suporte para receber ajuda.

Tente incluir o máximo de informações possível nas consultas. Os itens recomendados incluem:

Solicitação e resposta JSON higienizadas. Remova informações sensíveis, como o token de acesso OAuth, o token de atualização e os IDs do cliente.
Snippets de código. Se você estiver com um problema específico do idioma ou precisar de ajuda para trabalhar com a API, inclua um snippet de código para explicar o que você está fazendo.
request-id. Isso permite que os membros da equipe de relações com o Google Developers localizem sua solicitação se ela for feita no ambiente de produção. Recomendamos registrar o request-id incluído nos cabeçalhos de resposta ou exceções que encapsulam erros de resposta, bem como mais contexto do que o request-id sozinho.
Outras informações, como a versão do ambiente de execução ou do interpretador e a plataforma, também podem ser úteis ao solucionar problemas.
Corrigir o problema

Agora que você já descobriu qual é o problema e chegou a uma solução, é hora de fazer alterações e testar a correção em uma conta de teste (de preferência) ou de produção (se o bug só se aplicar aos dados de uma conta de produção específica).

Próximas etapas

Agora que esse problema já está resolvido, você descobriu formas de melhorar seu código para evitar que ele ocorra?

A criação de um bom conjunto de testes de unidade ajuda a melhorar consideravelmente a qualidade e a confiabilidade do código. Ele também acelera o processo de teste de novas mudanças para garantir que elas não tenham quebrado a funcionalidade anterior. Uma boa estratégia de tratamento de erros também é fundamental para apresentar todos os dados necessários para a solução de problemas.

Anterior
Limites do sistema
Avançar
Testes
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-10-14 UTC.