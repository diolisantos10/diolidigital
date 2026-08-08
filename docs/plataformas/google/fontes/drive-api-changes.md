---
titulo: "Google Drive API — rastrear mudanças (changes.list / pageToken)"
url: https://developers.google.com/workspace/drive/api/guides/manage-changes
capturado_em: 2026-08-08
hash: f28811484ce44cf5
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

O Google usa tecnologia de IA na tradução de conteúdos para seu idioma de preferência. As traduções com IA podem ter erros.
Envie comentários
Recuperar alterações

Para apps do Google Drive que precisam rastrear mudanças em arquivos, a coleção changes oferece uma maneira eficiente de detectar todas as mudanças, incluindo as compartilhadas com um usuário. Se o arquivo mudou, a coleção fornece o estado atual de cada arquivo.

Receber token da página inicial

Para solicitar o token da página do estado atual da conta, use o changes.getStartPageToken. Armazene e use esse token na sua chamada inicial para changes.list.

Para recuperar o token da página atual:

Java
Python
PHP
.NET
Node.js
drive/snippets/drive_v3/src/main/java/FetchStartPageToken.java
Ver no GitHub
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.http.HttpRequestInitializer;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.DriveScopes;
import com.google.api.services.drive.model.StartPageToken;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.util.Arrays;

/* Class to demonstrate use-case of Drive's fetch start page token */
public class FetchStartPageToken {

  /**
   * Retrieve the start page token for the first time.
   *
   * @return Start page token as String.
   * @throws IOException if file is not found
   */
  public static String fetchStartPageToken() throws IOException {
        /*Load pre-authorized user credentials from the environment.
        TODO(developer) - See https://developers.google.com/identity for
        guides on implementing OAuth2 for your application. */

    GoogleCredentials credentials = GoogleCredentials.getApplicationDefault()
        .createScoped(Arrays.asList(DriveScopes.DRIVE_FILE));
    HttpRequestInitializer requestInitializer = new HttpCredentialsAdapter(
        credentials);

    // Build a new authorized API client service.
    Drive service = new Drive.Builder(new NetHttpTransport(),
        GsonFactory.getDefaultInstance(),
        requestInitializer)
        .setApplicationName("Drive samples")
        .build();
    try {
      StartPageToken response = service.changes()
          .getStartPageToken().execute();
      System.out.println("Start token: " + response.getStartPageToken());

      return response.getStartPageToken();
    } catch (GoogleJsonResponseException e) {
      // TODO(developer) - handle error appropriately
      System.err.println("Unable to fetch start page token: " + e.getDetails());
      throw e;
    }
  }

}
Receber mudanças

Para recuperar a lista de mudanças do usuário conectado, envie uma solicitação GET para a coleção changes, conforme detalhado em changes.list.

As entradas na coleção changes estão em ordem cronológica (as mudanças mais antigas aparecem primeiro). Os parâmetros de consulta includeRemoved e restrictToMyDrive determinam se a resposta deve incluir itens removidos ou compartilhados.

Java
Python
PHP
.NET
Node.js
drive/snippets/drive_v3/src/main/java/FetchChanges.java
Ver no GitHub
import com.google.api.client.googleapis.json.GoogleJsonResponseException;
import com.google.api.client.http.HttpRequestInitializer;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.DriveScopes;
import com.google.api.services.drive.model.ChangeList;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.util.Arrays;

/* Class to demonstrate use-case of Drive's fetch changes in file. */
public class FetchChanges {
  /**
   * Retrieve the list of changes for the currently authenticated user.
   *
   * @param savedStartPageToken Last saved start token for this user.
   * @return Saved token after last page.
   * @throws IOException if file is not found
   */
  public static String fetchChanges(String savedStartPageToken) throws IOException {

        /*Load pre-authorized user credentials from the environment.
        TODO(developer) - See https://developers.google.com/identity for
        guides on implementing OAuth2 for your application.*/
    GoogleCredentials credentials = GoogleCredentials.getApplicationDefault()
        .createScoped(Arrays.asList(DriveScopes.DRIVE_FILE));
    HttpRequestInitializer requestInitializer = new HttpCredentialsAdapter(
        credentials);

    // Build a new authorized API client service.
    Drive service = new Drive.Builder(new NetHttpTransport(),
        GsonFactory.getDefaultInstance(),
        requestInitializer)
        .setApplicationName("Drive samples")
        .build();
    try {
      // Begin with our last saved start token for this user or the
      // current token from getStartPageToken()
      String pageToken = savedStartPageToken;
      while (pageToken != null) {
        ChangeList changes = service.changes().list(pageToken)
            .execute();
        for (com.google.api.services.drive.model.Change change : changes.getChanges()) {
          // Process change
          System.out.println("Change found for file: " + change.getFileId());
        }
        if (changes.getNewStartPageToken() != null) {
          // Last page, save this token for the next polling interval
          savedStartPageToken = changes.getNewStartPageToken();
        }
        pageToken = changes.getNextPageToken();
      }

      return savedStartPageToken;
    } catch (GoogleJsonResponseException e) {
      // TODO(developer) - handle error appropriately
      System.err.println("Unable to fetch changes: " + e.getDetails());
      throw e;
    }
  }
}

A coleção changes na resposta pode conter um nextPageToken. Se o nextPageToken estiver listado, ele poderá ser usado para coletar a próxima página de mudanças. Se não estiver listado, o aplicativo cliente vai armazenar o newStartPageToken na resposta para uso futuro. Com o token de página armazenado, o aplicativo cliente está preparado para consultar novamente as mudanças futuras.

Receber notificações

Use o método changes.watch para se inscrever nas atualizações do registro de alterações. As notificações não contêm detalhes sobre as mudanças. Em vez disso, eles indicam que novas mudanças estão disponíveis. Para recuperar as mudanças reais, faça uma pesquisa no feed de mudanças conforme descrito em Receber mudanças.

Observação: embora não esteja documentado em changes.watch, o método exige um parâmetro pageToken semelhante a changes.list. Isso pode ser recuperado de changes.getStartPageToken.

Para mais informações, consulte Notificações de mudanças em recursos.

Isso foi útil?
Envie comentários

Exceto em caso de indicação contrária, o conteúdo desta página é licenciado de acordo com a Licença de atribuição 4.0 do Creative Commons, e as amostras de código são licenciadas de acordo com a Licença Apache 2.0. Para mais detalhes, consulte as políticas do site do Google Developers. Java é uma marca registrada da Oracle e/ou afiliadas.

Última atualização 2026-05-13 UTC.