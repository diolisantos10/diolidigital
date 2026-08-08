# Parecer `plataforma` — SUBSTITUIR O GOOGLE DRIVE como porta de material

**Data:** 08/08/2026
**Produzido por:** especialista `plataforma` (Dioli Digital), por despacho do Diretor.
**Pergunta do CEO:** *"Conhece outro sistema em que a gente consiga ter acesso aos
drives, algum repositório online, que possa substituir o Google Drive?"* — com o
desenho declarado: **a agência aponta para uma pasta e o sistema pega tudo que
está lá dentro, inclusive o que entrar depois, sem ninguém escolher arquivo por
arquivo.**

**Objeto avaliado:** Dropbox (principal), OneDrive/Microsoft Graph e armazenamento
próprio (S3 / Cloudflare R2), comparados contra a tela de envio que a casa **já
tem**.

> ### ✅ Procedência
> Este parecer foi produzido pelo especialista `plataforma`, lendo **documentação
> oficial dos próprios fornecedores**, conferida ao vivo em 08/08/2026. Nada foi
> instalado, nenhuma conta foi criada, nenhuma chamada foi feita a API de
> terceiro além de leitura de página pública. **Nenhum segredo foi lido ou
> impresso.**
>
> ⚠️ **Ressalva de procedência, declarada por honestidade e não por formalidade:**
> as fontes deste parecer foram **conferidas ao vivo, e NÃO capturadas com hash**
> em `docs/plataformas/<fornecedor>/fontes/`, como manda o padrão da casa para o
> Google. Cada afirmação tem link e citação, mas **não tem cópia datada na
> biblioteca**. Isso é um débito de procedimento, listado nas lacunas. Ele **não**
> invalida o parecer — o veredito final não depende de nenhuma frase disputável —,
> mas quem for **implementar** Dropbox tem que capturar as fontes antes.
>
> 🛑 **Uma página oficial não pôde ser lida e isso vale um aviso separado:** a
> referência HTTP da API do Dropbox
> (`www.dropbox.com/developers/documentation/http/documentation`) é uma página que
> só monta no navegador; a leitura devolveu apenas a navegação. **Todas as
> citações de `files/list_folder`, `recursive`, `cursor` e `longpoll` neste
> parecer vêm dos GUIAS oficiais do Dropbox, não da referência do endpoint.** Onde
> isso muda o grau de certeza, está marcado no texto.

---

## VEREDITO, em uma linha

🟡 **Tecnicamente, SIM — o Dropbox faz o que o Google Drive não faz** (uma pasta
inteira, com o que entrar depois, sem seletor, sem escopo restrito e sem
revisão enquanto só a agência usar); 🛑 **mas trocar de nuvem NÃO resolve nenhum
problema que a tela de envio em lote do portal já não resolva mais barato — e por
isso a recomendação é NÃO trocar agora.**

---

## A tabela, para o CEO ler primeiro

| | **Dropbox** | **OneDrive / Graph** | **S3 / Cloudflare R2** | **Portal da casa (já existe)** |
|---|---|---|---|---|
| Aponta numa pasta e pega tudo, inclusive o que entrar depois | ✅ **Sim, documentado** | ✅ Sim (`delta`) | ✅ Sim (é a nossa pasta) | ➖ Não é pasta: é uma tela de arrastar vários |
| Precisa escolher arquivo por arquivo | ❌ Não | ❌ Não | ❌ Não | ⚠️ Não escolhe arquivo — **declara o que cada arquivo é** |
| Revisão/aprovação da plataforma | Só ao passar de **50 contas conectadas** | Nenhuma revisão da Microsoft; app-only exige **admin de um tenant pago** | **Nenhuma** | **Nenhuma** |
| Prazo dessa aprovação | Dias úteis *(pista, ver §2)* | n/a | n/a | n/a |
| Avaliação de segurança de terceiro (tipo CASA do Google) | **Não documentada** | **Não documentada** | Não existe | Não existe |
| Reverificação anual | **Não documentada** | Não | Não | Não |
| CEO arrasta arquivo numa pasta do computador | ✅ Sim (app de desktop) | ✅ Sim | ❌ Só com cliente de terceiro + chave de acesso | ❌ Arrasta **na tela**, não no Finder |
| Avisa quando entra arquivo novo | ✅ Webhook + longpoll | ✅ Webhook (não conferido aqui) | ✅ Evento de bucket (não conferido aqui) | ✅ É o próprio ato do envio |
| Traz o **papel** do arquivo (logo? foto de produto?) | ❌ **Não. Traz bytes.** | ❌ Não | ❌ Não | ✅ **Sim — é o ponto inteiro** |
| Custo de dinheiro | Plus **US$ 9,99/mês** (2 TB) · Standard **US$ 15/usuário/mês** | Exige plano Microsoft 365 para app-only | R2 **US$ 0,015/GB-mês, egresso grátis** | **R$ 0 a mais** |
| Custo de código novo | Integração inteira nova | Integração inteira nova | Troca do `caminhoAbsoluto` | **Zero — está no ar** |

**Como ler a tabela:** as três nuvens ganham nas quatro primeiras linhas e
**perdem na linha que decide** — nenhuma delas sabe dizer se um arquivo é o logo
ou a foto da fachada. Ver §7.

---

# PARTE 1 — DROPBOX

## 1. Existe um modo em que o app enxerga uma PASTA INTEIRA e tudo que entrar depois?

### Resposta: **SIM — e é literal na fonte, não inferido.** Este é exatamente o ponto onde o Google falhou em 07–08/08.

O Dropbox tem **dois tipos de permissão**, escolhidos na criação do app
([Reference Guide](https://www.dropbox.com/developers/reference/developer-guide)):

**App folder:**

> *"A dedicated folder named after your app is created within the Apps folder of a
> user's Dropbox. Your app gets read and write access to this folder only **and
> users can provide content to your app by moving files into this folder**."*

**Full Dropbox:**

> *"You get full access to all the files and folders in a user's Dropbox."*

> ### ⭐ Por que esta frase é a resposta à pergunta do CEO
> *"users can provide content to your app by **moving files into this folder**"* é
> **exatamente** o desenho que ele descreveu, escrito pelo próprio fornecedor. A
> unidade de acesso do Dropbox é a **pasta**; a do escopo `drive.file` do Google é
> o **arquivo**, e por isso a pasta compartilhada não funcionava lá. **Não é a
> mesma pergunta com resposta diferente — é um modelo de permissão diferente.**
> Aqui não existe "lista interna de arquivos abertos com o app" que só o Picker
> alimenta; existe uma pasta, e o que está dentro dela é do app.

**A diferença que o CEO precisa saber, e que não é detalhe:** no modo **App
folder**, quem cria a pasta é o Dropbox, com o nome do app, dentro de `Apps/` —
**o app não escolhe qual pasta**. As cinco pastas por cliente que ele já criou
viveriam como **subpastas** dentro dela (`Apps/Dioli Digital/<cliente>/`).
Apontar para uma pasta que **já existe em outro lugar** do Dropbox exige **Full
Dropbox**, que é acesso a *tudo* da conta — e aí vale o aviso do próprio Dropbox:

> *"Your app should use the least privileged permission it can. When applying for
> production, we'll review that your app doesn't request an unnecessarily broad
> permission based on the functionality provided by the app."*

> ### 🚪 A porta que alguém vai perguntar, e que já está fechada: *"o Google não tem uma pasta de app também?"*
> **Tem — e ela não serve, por um motivo documentado.** A tabela de escopos **não
> sensíveis** do Drive
> (`docs/plataformas/google/fontes/drive-api-escopos.md`, capturada em 07/08)
> traz `drive.appdata` / `drive.appfolder`: *"Ver e gerenciar os próprios dados de
> **configuração** do app no Google Drive."* É escopo **não sensível** — sem
> verificação restrita, sem CASA. Parece a resposta. Não é:
> [o guia oficial dessa pasta](https://developers.google.com/workspace/drive/api/guides/appdata)
> diz que ela é *"a special **hidden** folder that your app can use to store
> application-specific data, such as configuration files"* e que *"is only
> accessible by your app and its contents are **hidden from the user** and from
> other Google Drive apps"*. **O CEO não consegue ver essa pasta, nem arrastar
> nada para dentro dela.** Ela existe para o app guardar as próprias
> configurações — não para receber material de gente.
>
> **É essa a diferença de fundo entre as duas plataformas, em uma frase:** o
> Google tem uma pasta de app que **o usuário não enxerga**; o Dropbox tem uma
> pasta de app que **o usuário abre e usa**. Só a segunda responde à pergunta do
> CEO.

**Como o app lê a pasta** (guias oficiais):

- Listar:
  [DBX File Access Guide](https://developers.dropbox.com/dbx-file-access-guide) —
  *"You can list contents of a Dropbox folder with the `/files/list_folder`
  endpoint, which accepts a folder's path and returns the content of that folder
  in an entries array"*.
- Subpastas: *"Using the **recursive** argument will return content of subfolders,
  which simplifies traversal."* (mesma fonte)
- Paginação: *"When listing folder content, you should always check the
  `has_more` flag. If it's true, then your results have been paginated and you'll
  need to call `/files/list_folder/continue` with the **cursor** from your
  response."* (mesma fonte)
- **O que entra depois:**
  [Detecting Changes Guide](https://developers.dropbox.com/detecting-changes-guide)
  — *"Storing the cursor value allows you to poll for changes to the target
  directory."* e *"Folder cursors are long-lived, but may expire if unused for an
  extend time. Thus, while polling, be sure to **always update to the latest
  returned cursor** - even if no results are returned."*

Ou seja: o mesmo `cursor` serve para (a) terminar de listar o que já existe e (b)
ser guardado e reapresentado depois para saber **só o que mudou**. É o análogo
direto do `changes.list`/`pageToken` do Google, e o Dropbox o documenta
explicitamente para pasta.

🔴 **LACUNA de grau, não de conclusão:** as três frases acima vêm dos **guias**
oficiais, não da **referência do endpoint** (que não abriu — ver ressalva no
cabeçalho). A descrição literal do argumento `recursive` e o formato exato de
`cursor`/`has_more` na resposta **não foram lidos na fonte primária**. A conclusão
não depende disso; a implementação sim.

---

## 2. Qual é a revisão exigida para produção, e quanto tempo leva?

### Resposta: **teto de 50 contas conectadas para o gatilho, 500 como limite duro — e a revisão nem é feita antes das 50.**

Do [Reference Guide](https://www.dropbox.com/developers/reference/developer-guide):

> *"When you first create a Dropbox API app, it's given development status and can
> only be connected to **your own account**."*

> *"Once your app links **50 Dropbox users**, you will have **two weeks** to apply
> for and receive production status approval before your app's ability to link
> additional Dropbox users will be **frozen**."*

> *"While you may submit your request for production status anytime, **it will not
> be reviewed until your app has linked with at least 50 Dropbox users**."*

> *"Some apps may be eligible for production status review before reaching 50
> linked Dropbox users"* — há um campo *Request early review* no formulário.

E do [Getting Started](https://www.dropbox.com/developers/reference/getting-started):

> *"By default, all apps are created in the development state, which limits the
> total number of users who can access your app during early development."*
> *"Initially, your new app will only be authorized for you. Clicking 'Enable
> additional users' will allow a limited number of additional users to link to
> you application for testing or internal use."*

**Os dois números:** **500** contas é o teto do estado de desenvolvimento; **50**
é o gatilho que abre a janela de duas semanas. *(O número 500 aparece na leitura
da página; ele **não** foi reproduzido como citação literal em todas as
releituras — trato-o como número lido, e o número que decide é o **50**, esse sim
citado literalmente.)*

**O que a aprovação avalia:** que o app não pede permissão mais ampla do que a
função exige (citação da §1), além de aderência ao *Branding Guide* e aos *Terms
and Conditions*.

🟡 **PISTA, não fato:** a frase *"Dropbox responds to nearly all production
requests within a few business days"* apareceu numa busca atribuída ao mesmo
Reference Guide, mas **não foi reproduzida na minha leitura direta da página**.
Trato como **pista**, não como fonte. **Prazo confirmado documentalmente: apenas
as "duas semanas" que a casa tem para conseguir a aprovação depois de bater 50
usuários.**

### Comparação honesta com o Google

| | Google (`drive.readonly`) | Dropbox |
|---|---|---|
| Escopo restrito | **Sim** | Conceito não existe |
| Verificação do app | **Obrigatória** | Só ao chegar em 50 contas |
| Avaliação de segurança de terceiro (CASA), porque a casa guarda os bytes | **Sim** | **Não documentada em fonte nenhuma** |
| Reverificação | **Anual** | **Não documentada** |
| Prazo | **Semanas a meses** | Duas semanas de janela, a partir das 50 contas |
| Custa para a agência usar no próprio Drive/Dropbox? | **Sim** — a isenção "somente dados de propriedade do serviço" **falha** porque a pasta pertence a uma Conta do Google (ver `google/pareceres/2026-08-08-drive-conta-de-servico.md`, §3) | **Não** — 1 conta conectada nunca chega perto de 50 |

**A diferença é estrutural, não de grau.** No Google, o custo de conformidade
nasce do **escopo** e existe desde a primeira chamada. No Dropbox, o custo nasce
da **escala** e não existe enquanto a agência for a única conta ligada.

🔴 **LACUNA:** não encontrei, na documentação capturada, nenhuma menção a
avaliação de segurança de terceiro, questionário de segurança ou reverificação
periódica no Dropbox. **Pela regra da casa, ausência de fonte dizendo "sim" é um
NÃO** — então registro como *"não documentado"*, e não como *"comprovadamente não
existe"*. Quem submeter à produção um dia pode descobrir um passo que a página
pública não descreve.

---

## 3. A isenção vale para uso próprio da agência?

### Resposta: **na prática, sim — mas por MECANISMO, não por uma cláusula de isenção. E a distinção importa, porque foi exatamente aqui que o Google enganou a casa.**

**O que é documentado, literalmente:**

1. *"When you first create a Dropbox API app, it's given development status and
   can only be connected to your own account."*
2. *"...it will not be reviewed until your app has linked with at least 50 Dropbox
   users."*

**A conclusão:** um app ligado **apenas à conta Dropbox da agência** tem **1
usuário conectado**. Um usuário nunca dispara o gatilho de 50, e abaixo de 50 a
revisão **não é sequer executada**. Portanto, para o desenho "a agência mantém as
pastas e o sistema lê", **não há revisão, não há prazo e não há custo de
conformidade.**

> ⚠️ **Marco isto explicitamente como INFERÊNCIA de duas frases documentadas, não
> como citação.** Nenhuma página do Dropbox diz *"uso próprio é isento"*. O que
> existe é um limiar numérico que o uso próprio nunca alcança. É uma inferência
> muito mais segura do que a que quebrou ontem — lá a casa **presumiu** um
> comportamento que a fonte **nunca** afirmou; aqui as duas frases estão escritas
> e o raciocínio entre elas é aritmética. Mas continua sendo raciocínio, e o
> parecer não vai fingir o contrário.

### 🛑 O gatilho que muda tudo, e o CEO precisa ouvir isto agora

**Se o desenho virar "cada cliente conecta o Dropbox dele"** — que é o desenho que
o CEO pediu para o Google em 07/08 —, o número de contas conectadas passa a ser o
**número de clientes**. Aos 50 clientes, a casa tem **duas semanas** para ser
aprovada, ou o app **congela** e o cliente 51 não consegue conectar.

**Os dois desenhos têm preços de conformidade opostos:**

| Desenho | Contas conectadas | Revisão |
|---|---|---|
| **Pasta da agência** (o CEO mantém tudo) | 1 | Nunca |
| **Cada cliente conecta o dele** | = nº de clientes | Obrigatória no cliente 50 |

Isso é **decisão de dono do negócio**, não escolha técnica: define se o teto de
crescimento da agência tem um portão de plataforma no meio.

---

## 4. Sincronização de pasta local — o CEO arrasta arquivo numa pasta do computador?

### Resposta: **SIM para a sincronização; a ligação com a pasta do app é inferência de duas fontes.**

Da [Ajuda oficial do Dropbox — Sync overview](https://help.dropbox.com/sync/sync-overview):

> *"automatic sync, which is real-time synchronization of files between the files
> on your computer and dropbox.com"*
> *"Files in the Dropbox folder on your computer automatically sync everywhere you
> access your files in Dropbox, including dropbox.com and the mobile app."*
> *"If you added a file to the Dropbox folder on your computer, you must keep the
> Dropbox app running to sync it to the rest of your Dropbox account."*

E de [Uploading to Dropbox](https://help.dropbox.com/create-upload/add-files):
*"drag and drop, or copy and paste them into the open Dropbox folder"*.

**A ponte lógica:** a pasta do app fica *"within the Apps folder of a user's
Dropbox"* (Reference Guide, §1) → está **dentro** da pasta Dropbox do usuário →
*"Files in the Dropbox folder on your computer automatically sync everywhere"* →
o que o CEO arrasta em `Dropbox/Apps/Dioli Digital/<cliente>/` chega à conta, e a
API lê a conta.

🔴 **LACUNA declarada:** **nenhuma frase única** diz *"a pasta do app sincroniza
com o desktop e a API enxerga o que foi sincronizado"*. São duas fontes
combinadas. A combinação é sólida — sincronizar é, por definição, o mesmo sistema
de arquivos —, mas é inferência, e a casa não finge que não é. **O que fecharia a
lacuna:** um teste real com uma conta descartável (arrastar → esperar → listar
pela API). Não foi feito: este parecer não cria conta em lugar nenhum.

⚠️ **Armadilha operacional a travar em código, se um dia isto for construído:**
o Dropbox tem **sincronização seletiva** e **arquivos somente on-line**
([Selective sync](https://help.dropbox.com/sync/selective-sync-overview)). O
sentido perigoso não é o do CEO para a nuvem — é a expectativa de que a máquina
dele seja a cópia completa. **O que vale para o sistema é sempre o que a API vê,
nunca o que aparece no Finder dele.** Nenhuma rotina pode confiar em "o CEO disse
que está na pasta".

---

## 5. Webhook ou varredura?

### Resposta: **Existem os dois, e o webhook é oficial — mas ele NÃO diz qual arquivo mudou.**

Da [Webhooks Reference](https://www.dropbox.com/developers/reference/webhooks):

> *"Webhooks are a way for web apps to get real-time notifications when users'
> files change in Dropbox."*

> 🛑 *"Note that the payload of the notification request **does not include the
> actual file changes**. It only informs your app of **which users have
> changes**."*

> *"If your app is scoped, webhooks require your app to have `files.metadata.read`
> authorized by the user in order to receive webhook notifications."*

> *"Your app only has **ten seconds** to respond to webhook requests."*

> Handshake de ativação: *"an HTTP `GET` request with a query parameter called
> `challenge`"*, devolvido no corpo com `Content-Type: text/plain` e
> `X-Content-Type-Options: nosniff`.

> *"Note that if there are no accounts connected to your app, your webhook URI
> will not receive any webhook notifications."*

Do [Detecting Changes Guide](https://developers.dropbox.com/detecting-changes-guide):

> *"With webhooks configured, Dropbox sends an HTTP POST with the user IDs when
> changes occur."*
> ⚠️ *"Note that webhooks will trigger for **any** changes to files the application
> has access to - so if your cursor is to a specific sub folder, not all
> notifications may be relevant to your app."*
> Alternativa sem endereço público: *"Passing your cursor to the call will simply
> **block until a change is detected** (or its timeout occurs). Once long poll
> signals change, you can use `/files/list_folder_continue` to list the updates."*
> (`/files/list_folder/longpoll`)

**O desenho correto, portanto, é sempre em duas etapas:** o webhook (ou o
longpoll) só diz *"mexeram"*; quem descobre **o quê** é o `cursor` guardado +
`/files/list_folder/continue`. **Não existe caminho em que a casa possa pular
guardar o cursor.**

### Cota e cadência, se for varredura

Do [DBX Performance Guide](https://developers.dropbox.com/dbx-performance-guide):

> *"The Dropbox API enforces rate limits on the number of API calls issued over a
> period of time on a **per-authorization basis**"*
> *"the API call will return an **HTTP 429** error, returning the reason of
> **`too_many_requests`**"*
> *"Rate limited responses **always include a `Retry-After` header** that provides
> the limit in seconds"*
> ⚠️ *"**Rate limited requests themselves also count towards rate limits**"*
> Para escrita: `too_many_write_operations`, que *"returns a Retry-After of zero"*.

E o guia de mudanças recomenda webhook em vez de varredura: *"Instead of rapidly
polling - which would be **very** inefficient if done 24/7 - Dropbox can instead
notify applications when users' filesystems change."*

🔴 **LACUNA importante:** **o Dropbox NÃO publica os números da cota.** Não há
tabela de "X chamadas por minuto" como a do Google. Só existe o mecanismo (429 +
`Retry-After`). Consequência prática: **a cadência segura não pode ser derivada
de fonte** — ela tem que ser a regra da casa. Mantenho a mesma que já vale para o
Google e que está na cartilha: **mínimo 15 minutos entre varreduras, `cursor`
incremental (nunca listagem cheia repetida), recuo exponencial obedecendo o
`Retry-After`, e nunca uma chamada disparada por renderização de tela.**

🔴 **LACUNA:** o intervalo de timeout aceito pelo `/files/list_folder/longpoll`
está na referência do endpoint, que **não abriu**. Não afirmo número nenhum.

---

## 6. Limites que mordem

| Item | Valor | Fonte |
|---|---|---|
| Tamanho máximo de arquivo no Dropbox | **2 TB** (*"2,199,019,061,248 bytes"*) | [help.dropbox.com/sync/upload-limitations](https://help.dropbox.com/sync/upload-limitations) |
| Envio por API em uma chamada | *"The `/files/upload` endpoint is designed to work with files that are **under 150 MBs**"* | [Performance Guide](https://developers.dropbox.com/dbx-performance-guide) |
| Acima de 150 MB | *"should be uploaded in chunks"* via `upload_session/start` → `append_v2` → `finish` | idem |
| Tamanho do pedaço | *"Consider uploading chunks in **multiples of 4 MBs**"* | idem |
| Cota de chamadas | **Não publicada.** Só o mecanismo: 429 `too_many_requests` + `Retry-After` | idem |
| Token de acesso | *"Dropbox access tokens are **short lived**, and will expire after a short period of time. **The exact expiry time of a token is returned by the token endpoint**."* | [OAuth Guide](https://developers.dropbox.com/oauth-guide) |
| Acesso de longo prazo | Exige `token_access_type=offline` na URL de autorização, que devolve `refresh_token`; renova em `/oauth2/token` com `grant_type=refresh_token` | idem |
| Token morre | **401** → *"your application may simply re-authenticate"* ou renovar pelo refresh token | idem |
| Revogação pelo dono | Settings → Apps → **Disconnect**, a qualquer momento | [help.dropbox.com/integrations/third-party-apps](https://help.dropbox.com/integrations/third-party-apps) |
| Espaço da conta | Basic **2 GB grátis** · Plus **US$ 9,99/mês, 2 TB** · Standard **US$ 15/usuário/mês** · Advanced **US$ 24/usuário/mês** | [dropbox.com/plans](https://www.dropbox.com/plans) |

**O que morde de verdade, dito sem enfeite:**

1. **O tempo de vida exato do token não é documentado** — é devolvido em tempo de
   execução. Consequência de projeto: **nada pode assumir uma duração**; a casa
   guarda o valor que veio e renova antes dele. Um número escrito em constante
   seria uma mentira com prazo de validade.
2. **Não existe cota numérica publicada.** Quem for implementar não pode
   "calcular a folga" — só obedecer `Retry-After` e manter ritmo baixo.
3. **A revogação é do dono e é total**, exatamente como no Google. Uma conta
   desconectada derruba **todo** o material que dependia dela. É o mesmo risco
   que a casa já viveu — e é por isso que `origem: "envio_direto"` existe:
   material que já está no disco da casa **não depende de conexão nenhuma**.
4. **A conta grátis tem 2 GB** — menos que a cota de um único workspace da casa
   (`COTA_BYTES_POR_WORKSPACE` = 2 GB). Dropbox como porta de material é, na
   prática, uma **assinatura mensal**, e isso é gasto de dinheiro, ou seja,
   decisão do CEO.

🔴 **LACUNA:** não confirmei se o **refresh token** do Dropbox expira sozinho, nem
se existe teto de refresh tokens por conta/app (o Google documenta 100 e invalida
o mais antigo **em silêncio**). Nenhuma das páginas lidas trata disso. Se um dia
isto for construído, é a primeira pergunta a fechar — porque a falha é
silenciosa.

🔴 **LACUNA:** os preços acima foram lidos em **US$**, em 08/08/2026, sem
confirmação de valor em real, de cobrança anual vs. mensal, nem de qual plano
permite quantos usuários de equipe.

---

# PARTE 2 — ONEDRIVE / MICROSOFT GRAPH

**Consegue ler pasta inteira?** ✅ **Sim, e o mecanismo é excelente.**
[`driveItem: delta`](https://learn.microsoft.com/en-us/graph/api/driveitem-delta) —
*"Track changes in a driveItem and **its children** over time."* O app chama
`delta` sem parâmetro, pagina com `@odata.nextLink` até receber um
`@odata.deltaLink`, e guarda esse link para saber depois só o que mudou. A
Microsoft é enfática:

> *"If you are trying to maintain a full local representation of the items in a
> folder or a drive, **you must use `delta` for the initial enumeration**. Other
> approaches, such as paging through the `children` collection of a folder, are
> **not guaranteed to return every single item** if any writes take place during
> the enumeration."*

Existe até o equivalente ao "App folder" do Dropbox:
[`Files.ReadWrite.AppFolder`](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference)
— *"(Preview) Allows the app to read, create, update, and delete files in the
application's folder"*, acessada por `/me/drive/special/approot`. **Mas:**
*"The Files.ReadWrite.AppFolder delegated permission is **only valid for personal
accounts**"* — e a própria tabela oficial a marca **`(preview)`**. 🛑 **A casa não
constrói sobre "preview".** Isso descarta o caminho mais elegante do OneDrive.

**Qual o custo de aprovação?** **A Microsoft não tem revisão de app para usar o
Graph.** O custo está em outro lugar:

- **Permissões delegadas** (`Files.Read`, `Files.ReadWrite`, `Files.Read.All`,
  `Files.ReadWrite.All`): **"Admin Consent Required: No"** — o próprio dono
  consente. Valem *"on both personal Microsoft accounts and work or school
  accounts"*. Mas note o alcance: `Files.Read` é **a OneDrive inteira do usuário**
  — não existe "só esta pasta" fora do `AppFolder` (que é preview).
- **Permissões de aplicativo** (app-only, sem usuário logado): `Files.Read.All` /
  `Files.ReadWrite.All` com **"Admin Consent Required: **Yes**"**, e
  [só um administrador consente](https://learn.microsoft.com/en-us/graph/permissions-overview):
  *"Only Privileged Role Administrator and Global Administrator can consent to
  application permissions."* A tabela de `signInAudience` da mesma página lista
  permissões de aplicativo para `AzureADMyOrg`, `AzureADMultipleOrgs` e
  `AzureADandPersonalMicrosoftAccount` — e **não** para `PersonalMicrosoftAccount`.
  Traduzindo: **app-only exige um tenant Microsoft Entra**, ou seja, um plano
  corporativo pago. Não serve para "a conta pessoal da agência".

**O que muda para o CEO no dia a dia?** Sincronização de pasta local existe e é
nativa no Windows. Mas o desenho realista para a agência seria **delegado**, com o
CEO (ou o cliente) autorizando uma permissão que dá acesso a **toda a OneDrive**
dele — mais amplo do que o App folder do Dropbox — ou pagar um plano corporativo
para usar app-only. **Mais permissão, e mais fatura, pelo mesmo resultado.**

🔴 **LACUNA:** não conferi se a Microsoft exige *publisher verification* para app
multi-inquilino usado por contas de fora da organização, nem os limites de cota do
Graph para OneDrive. Também não conferi o webhook do Graph (*change
notifications*) — o `delta` já resolve, mas a comparação da tabela ficou
incompleta nesse ponto e está marcada como tal.

---

# PARTE 3 — ARMAZENAMENTO PRÓPRIO (S3 / CLOUDFLARE R2)

**Consegue ler pasta inteira?** ✅ **Trivialmente — porque a pasta é nossa.**
Não há OAuth, não há consentimento, não há seleção de arquivo. Listar um prefixo
devolve tudo que está lá, inclusive o que subiu um segundo atrás.

**Qual o custo de aprovação?** **Zero.** Não existe revisão, escopo, verificação
nem reverificação. Isto não é uma plataforma com portaria — é infraestrutura.

**Preço** (capturado 08/08/2026):

| | **Cloudflare R2** | **AWS S3 (Standard, EUA)** |
|---|---|---|
| Armazenamento | *"$0.015 / GB-month"* | *"$0.023 per GB"* (50 TB iniciais) |
| Escrita/listagem | Class A *"$4.50 / million requests"* | PUT/COPY/POST/LIST *"$0.005 per 1,000 requests"* |
| Leitura | Class B *"$0.36 / million requests"* | GET *"$0.0004 per 1,000 requests"* |
| **Saída para a internet** | **"Free"** | ***"$0.09 per GB"*** |

Fontes: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) ·
[S3 pricing](https://aws.amazon.com/s3/pricing/). Para material de marca — que é
**lido muitas vezes** para montar peça — o egresso grátis do R2 é a diferença que
importa, não o centavo do GB.

**O que muda para o CEO no dia a dia?** 🛑 **Nada de bom, e uma coisa ruim.**
Não existe app de desktop nativo em que se arrasta um arquivo: seria preciso
instalar um cliente de terceiro (rclone, Cyberduck, Mountain Duck) **e entregar
uma chave de acesso** a quem usa. Para o CEO isso é pior que hoje. Para a dona do
salão, é inviável — e ela é o outro lado desta ponte.

### 🎯 Mas o S3/R2 responde a OUTRA pergunta — e é uma pergunta que a casa tem em aberto

**S3/R2 não substitui o Google Drive. Substitui o volume do Railway.** São
problemas diferentes, e confundi-los é a armadilha desta comparação. O que está
escrito no cabeçalho de `lib/agency/media/armazenamento.ts`, pela mão de quem
construiu:

> *"É o MESMO volume do banco. Disco cheio derruba o banco junto"* ·
> *"Não há CDN: todo byte passa pelo processo Node."* ·
> *"A MÍDIA continua sem cópia: são gigabytes"* ·
> *"Quando migrar para armazenamento externo, **só `caminhoAbsoluto` muda**."*

Ou seja: o desenho **já foi feito prevendo esta migração**, e ela custa uma
função. Ela resolve três defeitos reais e medidos — mídia sem backup, cota de 2 GB
por workspace num volume de 4,6 GB compartilhado com o banco, e ausência de CDN.
**Nenhum desses três é o que o CEO perguntou**, e por isso isto não é o veredito —
mas é o único item desta análise em que trocar de armazenamento resolve um
problema que a casa tem hoje.

---

# PARTE 4 — O CONTRAPONTO, QUE É O CORAÇÃO DESTE PARECER

## Trocar de nuvem resolve algum problema que a tela de envio em lote do portal não resolveria mais barato?

### **NÃO.** E respondo isto sabendo que é o contrário do que a pergunta do CEO sugeria.

**A tela já existe, e já faz mais do que qualquer uma das três nuvens faria.**
`components/portal/EnvioDeMaterial.tsx` (278 linhas, no ar desde 02/08, completada
em 08/08):

- aceita **vários arquivos de uma vez** (`multiple` no seletor, com arrastar e
  soltar);
- **sugere** o papel de cada arquivo pelo nome e pelo tipo (`sugerirPapel`);
- **trava o envio** enquanto algum arquivo estiver sem papel declarado — trava, não
  aviso;
- manda para `POST /api/media`, que grava o `MediaAsset` (`guardarArquivo`) e
  chama `registrarMaterialEnviado`, criando a linha de material com
  `origem: "envio_direto"`;
- e `materiaisDeMarca()` — a **única** porta de material para dentro de uma peça —
  já lê essa origem **sem depender de conexão nenhuma com o Google**.

**A ponte está inteira.** O que faltava em 07/08 (os bytes chegavam e o papel não)
foi fechado em 08/08.

### O que uma pasta na nuvem NÃO traz, e é justamente o que a peça precisa

Uma pasta entrega **bytes**. A peça precisa de **significado**: isto é o logo,
aquilo é a fachada, aquilo ali é referência e não pode ir ao ar. Aponte o sistema
para uma pasta com 200 arquivos e a casa fica com exatamente duas saídas:

- **(a) adivinhar** o que cada arquivo é — **proibido pelo Guardrail 1**, e já
  escrito com todas as letras em `material-do-drive.ts`: *"A casa não adivinha se
  'IMG_2831.jpg' é o produto, a fachada ou o cachorro do dono — peça com a foto
  errada é pior que peça sem foto, porque parece que alguém olhou e escolheu
  aquilo."*
- **(b) abrir uma tela pedindo o papel de cada arquivo** — que é, palavra por
  palavra, **a tela que já está no ar**.

**Trocar de nuvem move o trabalho de lugar. Não o elimina.** E move para pior: em
vez de o papel ser declarado no instante do envio, por quem sabe o que mandou,
ele passaria a ser declarado depois, numa fila de 200 arquivos, por quem não
mandou.

### E o incômodo real do CEO?

Ele não era "arquivo por arquivo". Ele era **"não quero ficar autorizando"** — a
tela de consentimento do Google reaparecendo, o Picker exigindo seleção, a
conexão morrendo. **O portal não pede autorização nenhuma.** Não há OAuth, não há
consentimento, não há token para expirar, não há conexão para revogar. O CEO
arrasta, diz o que é, e acabou.

**O que separa o portal do desenho que ele descreveu é uma coisa só:** arrastar no
**Finder do computador** em vez de arrastar **numa tela do navegador**. Essa é a
diferença inteira. Ela é real, e é de conforto — não de capacidade.

### Se o objetivo for encurtar esse conforto, o mais barato NÃO é trocar de nuvem

Três coisas mais baratas que uma integração inteira, em ordem de preço:

1. **"Aplicar este papel a todos"** na fila de envio — um controle, num arquivo já
   existente. Resolve o caso comum ("mandei 30 fotos de produto de uma vez").
2. **Aceitar pasta arrastada** (`webkitdirectory`) na mesma tela: o CEO arrasta a
   pasta do computador inteira, e a fila se enche sozinha. Fica a um passo do
   Finder, sem nuvem nenhuma no meio.
3. **Só então**, se ainda incomodar, Dropbox — que é a nuvem certa entre as três,
   pelas razões da Parte 1.

*(Os itens 1 e 2 são propostas de trabalho para `interface`/`experiencia`, não
implementação deste parecer — nada foi construído aqui.)*

---

# LACUNAS DECLARADAS

1. **Débito de procedimento:** nenhuma fonte deste parecer foi **capturada com
   hash** na biblioteca da casa. Todas foram conferidas ao vivo em 08/08/2026,
   com link e citação, mas sem cópia datada. **O que fecha:** capturar as ~10
   páginas em `docs/plataformas/dropbox/fontes/` + `fontes.json`, antes de
   qualquer implementação.
2. **A referência HTTP da API do Dropbox não abriu** (página que só monta no
   navegador). Tudo sobre `list_folder`, `recursive`, `cursor`, `has_more` e
   `longpoll` vem dos **guias** oficiais, não da referência do endpoint. **O que
   fecha:** captura com navegador (Playwright), como foi feito com o Google.
3. **Prazo de aprovação de produção do Dropbox:** só as **duas semanas** de janela
   estão documentadas. O "poucos dias úteis" é **pista**, não fonte.
4. **Avaliação de segurança de terceiro / reverificação periódica no Dropbox:**
   nenhuma fonte menciona. Registrado como *"não documentado"* — **não** como
   *"não existe"*.
5. **A pasta do app sincronizando com o desktop** é inferência de duas fontes
   (a pasta fica dentro da pasta Dropbox do usuário + tudo na pasta Dropbox
   sincroniza). **O que fecha:** um teste com conta descartável — arrastar,
   esperar, listar pela API. Não foi feito: este parecer não cria contas.
6. **Cota numérica de chamadas do Dropbox: não publicada.** Só o mecanismo (429 +
   `Retry-After`). A cadência segura é regra da casa, não número de fonte.
7. **Timeout aceito pelo `/files/list_folder/longpoll`:** está na referência que
   não abriu. Nenhum número foi afirmado.
8. **Expiração e teto de refresh tokens no Dropbox:** sem fonte. É a falha
   silenciosa mais provável de uma integração dessas — primeira pergunta a fechar
   se for construída.
9. **Preços do Dropbox** lidos em US$, sem confirmar valor em real, ciclo de
   cobrança ou quantos usuários cada plano cobre.
10. **Microsoft:** não conferi *publisher verification* para app multi-inquilino,
    cotas do Graph para OneDrive, nem as *change notifications* (webhook) do
    Graph. A linha "avisa quando entra arquivo novo" da tabela, para OneDrive e
    para S3/R2, está marcada como **não conferida aqui**.
11. **Nenhuma medida de tempo de implementação** aparece neste parecer, para
    nenhuma das opções. Estimar prazo sem desenhar a integração seria inventar
    número — e número inventado em documento vira fato citado depois.

---

# RECOMENDAÇÃO

**1. Não trocar de nuvem agora.** A porta de material que a casa precisa **já está
no ar**, ela não pede autorização nenhuma, e ela faz a única coisa que nenhuma
nuvem faz: perguntar o que cada arquivo é.

**2. Se o incômodo do "arrastar no computador" persistir**, o caminho mais barato
é a tela (aplicar papel em lote + aceitar pasta arrastada), não a integração.

**3. Se, ainda assim, o CEO quiser a nuvem, o Dropbox é a escolha certa** entre as
três — pelo modo *App folder*, com a pasta da **agência**, nunca no desenho "cada
cliente conecta a dele" (que traz o portão dos 50 na frente do crescimento). E
mesmo então: **fecha-se antes a lacuna 5** (o teste da conta descartável) e
capturam-se as fontes. A casa não constrói sobre inferência de duas páginas — foi
isso que custou um dia inteiro do CEO em 08/08.

**4. S3/R2 continua na mesa, mas para outra pergunta:** tirar a mídia do volume
que ela divide com o banco, ganhar backup e ganhar CDN. Isso é decisão de
engenharia, custa uma função (`caminhoAbsoluto`), e não tem nada a ver com de
quem é a pasta.

---

## Fontes consultadas (todas oficiais, conferidas ao vivo em 08/08/2026)

**Dropbox**
- https://www.dropbox.com/developers/reference/developer-guide
- https://www.dropbox.com/developers/reference/getting-started
- https://developers.dropbox.com/oauth-guide
- https://developers.dropbox.com/dbx-file-access-guide
- https://developers.dropbox.com/detecting-changes-guide
- https://developers.dropbox.com/dbx-performance-guide
- https://www.dropbox.com/developers/reference/webhooks
- https://help.dropbox.com/sync/sync-overview
- https://help.dropbox.com/sync/upload-limitations
- https://help.dropbox.com/integrations/third-party-apps
- https://www.dropbox.com/plans
- 🛑 https://www.dropbox.com/developers/documentation/http/documentation — **não
  abriu** (ver lacuna 2)

**Microsoft**
- https://learn.microsoft.com/en-us/graph/api/driveitem-delta
- https://learn.microsoft.com/en-us/graph/permissions-overview
- https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference
- https://learn.microsoft.com/en-us/graph/api/resources/onedrive

**Google (para a comparação da §1)**
- https://developers.google.com/workspace/drive/api/guides/appdata

**Armazenamento próprio**
- https://developers.cloudflare.com/r2/pricing/
- https://aws.amazon.com/s3/pricing/

**Da própria casa (lidos para o contraponto)**
- `lib/agency/media/armazenamento.ts`
- `app/api/media/route.ts`
- `lib/agency/esteira/material-do-drive.ts`
- `components/portal/EnvioDeMaterial.tsx`
- `docs/plataformas/google/pareceres/2026-08-08-drive-conta-de-servico.md`
- `docs/plataformas/google/pareceres/2026-08-08-escrita-no-drive-saida-b.md`
- `docs/plataformas/google/fontes/drive-api-escopos.md`
