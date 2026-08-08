---
titulo: "Google Drive API — acesso limitado vs. expansivo (limited vs. expansive access)"
url: https://developers.google.com/workspace/drive/api/guides/limited-expansive-access
capturado_em: 2026-08-08
hash: 3fc074aca9661ff7
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Gerenciar pastas com acesso limitado e amplo
Notas da versão

Todos os usuários com acesso a uma pasta também têm acesso a todos os itens dentro dela. Isso facilita a compreensão de quem tem acesso aos itens em uma hierarquia, o que é chamado de acesso expansivo. Esse comportamento de acesso existe no Meu Drive e nos drives compartilhados.

Depois que as pastas com acesso limitado foram lançadas, elas se tornaram a única exceção que permite restringir o acesso a uma subpasta específica no Meu Drive e nos drives compartilhados.

Este documento explica como gerenciar pastas com acesso limitado e amplo no Google Drive.

Sobre as pastas com acesso limitado

Com as pastas de acesso limitado, você pode restringir o acesso a usuários específicos. Somente as pessoas que você adicionar diretamente às permissões da pasta podem abrir e acessar o conteúdo dela. Os usuários com acesso herdado à pasta compartilhada do Meu Drive ou do drive compartilhado (por acesso de uma pasta mãe) podem ver a pasta restrita no Drive, mas não podem abri-la. Esse recurso alinha melhor o comportamento de compartilhamento de itens no Meu Drive e nos drives compartilhados, permitindo que você organize pastas com conteúdo sensível ao lado de conteúdo compartilhado de forma mais ampla.

As pastas com acesso limitado estão disponíveis no Meu Drive e nos drives compartilhados. As funções de owner no Meu Drive e de organizer nos drives compartilhados sempre podem acessar pastas com acesso limitado. Para modificar a lista de usuários da pasta, não são necessárias permissões especiais. As funções que podem compartilhar pastas também podem atualizar as listas de membros. Para saber mais sobre papéis e permissões, consulte Papéis e permissões e Visão geral dos unidades compartilhadas.

Note que embora pastas sejam um tipo de arquivo, o acesso limitado não está disponível para arquivos.

Definir acesso limitado a uma pasta

Embora os usuários com permissões diretas de pasta possam acessar uma pasta com acesso limitado, apenas a função owner no Meu Drive e a função organizer nos drives compartilhados podem ativar ou desativar o acesso limitado.

Além disso, se um usuário com a função writer no Meu Drive tiver o campo booleano writersCanShare no recurso files definido como true, ele também poderá ativar ou desativar o recurso.

Para limitar o acesso a uma pasta, defina o campo booleano inheritedPermissionsDisabled no recurso files como true. Quando true, somente a função owner, a função organizer e os usuários com permissões diretas de pasta podem acessar.

Para reativar as permissões herdadas, defina inheritedPermissionsDisabled como false.

Verificar a permissão para limitar o acesso a uma pasta

Para verificar se é possível limitar o acesso a uma pasta, inspecione os valores booleanos dos campos capabilities.canDisableInheritedPermissions e capabilities.canEnableInheritedPermissions no recurso files. Essas configurações confirmam se você tem permissão para limitar o acesso a uma pasta pelo campo inheritedPermissionsDisabled.

Para mais informações sobre capabilities, consulte Entender os recursos de arquivo.

Listar filhos de uma pasta com acesso limitado

Para verificar se é possível listar os filhos de uma pasta, use o campo booleano capabilities.canListChildren.

O valor retornado é sempre false quando o item não é uma pasta ou se o acesso do solicitante ao conteúdo da pasta foi removido ao definir inheritedPermissionsDisabled como false.

Se o acesso ao conteúdo da pasta foi removido, você ainda pode acessar os metadados da pasta com os métodos files.get() e files.list(). Para confirmar se o acesso é limitado, verifique o corpo da resposta para saber se o item é uma pasta com o tipo MIME application/vnd.google-apps.folder e se o campo capabilities.canListChildren está definido como "false". Se você tentar listar os filhos de uma pasta assim, o resultado será sempre vazio.

Acessar metadados de pastas com acesso limitado

Com as pastas de acesso limitado, é possível ver os metadados da pasta mesmo sem acesso ao conteúdo dela.

Ao usar o recurso permissions para determinar o acesso de um usuário, as pastas do Meu Drive e do drive compartilhado que concedem acesso apenas aos metadados contêm os seguintes valores no corpo da resposta: inheritedPermissionsDisabled=true e view=metadata. O papel é sempre definido como reader. O campo view só é preenchido para permissões que pertencem a um view. Para mais informações, consulte Visualizações.

Todas as entradas no campo permissionDetails têm o campo inherited definido como true para indicar que a permissão é herdada e que o acesso direto ao conteúdo da pasta não foi concedido.

Para conceder acesso ao conteúdo e aos metadados da pasta, defina o campo inheritedPermissionsDisabled como false ou atualize a função para reader ou superior.

Por fim, se uma permissão foi limitada primeiro desativando a herança em uma pasta (inheritedPermissionsDisabled=true) e depois adicionada diretamente a ela, os valores no corpo da resposta se tornam inheritedPermissionsDisabled=true com o campo view não definido. Se a pasta estiver em um drive compartilhado, a lista permissionDetails terá uma entrada com o campo inherited definido como false para indicar que a permissão não é herdada. Essa permissão concede acesso ao conteúdo da pasta e aos metadados, como qualquer outra permissão.

Excluir pastas com acesso limitado

É possível excluir pastas com acesso limitado usando o método files.delete() no recurso files.

No Meu Drive, apenas o proprietário pode excluir uma hierarquia de pastas. Se um usuário excluir uma hierarquia com pastas de acesso limitado que pertencem a outros usuários, essas pastas vão ser movidas para o Meu Drive do proprietário.

Se o usuário tiver a função owner, toda a hierarquia será excluída.

Em drives compartilhados, a função organizer pode excluir hierarquias, mesmo que elas contenham pastas com acesso limitado. Se a função fileOrganizer excluir uma hierarquia que contenha pastas com acesso limitado, o resultado vai depender de se ela foi adicionada novamente como fileOrganizer nas pastas com acesso limitado. Se sim, toda a hierarquia será excluída. Caso contrário, as pastas com acesso limitado serão movidas para a pasta raiz do drive compartilhado.

Temas relacionados
Compartilhar arquivos, pastas e drives
Como funciona o acesso a arquivos em drives compartilhados
Saiba mais sobre as pastas com acesso limitado
Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-06-03 UTC.