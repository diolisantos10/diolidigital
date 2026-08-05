# Parecer do especialista Meta — o que a API faz sozinha e o que só existe no painel

> Pedido do CEO em 05/08/2026: *"Eu achei que o agente da Meta, que tem acesso ao
> aplicativo com token, poderia fazer tudo isso. Eu não sei por que sou EU que
> estou fazendo essas configurações."*
>
> Emitido por: especialista Meta (a trava de plataforma).
> Base: `docs/plataformas/meta/cartilha.md` + fontes capturadas, mais conferência
> AO VIVO nas páginas oficiais em 05/08/2026 (as URLs estão citadas item a item).
> **Onde a biblioteca não cobre, está escrito "LACUNA" — não completei de memória.**

---

## Resposta curta, antes do detalhe

O CEO tem razão em ~70% do que está clicando: **a maior parte do que ele fez à
mão é chamada de API que esta casa ainda não escreveu.** Assinar webhook,
autorizar conta de anúncio no app, descobrir Página/Instagram, trocar e revogar
token — tudo isso é API, e é trabalho meu.

O que sobra para ele é curto e tem um padrão só: **as três coisas que a Meta
deliberadamente não deixa um programa fazer** —
1. **atestar identidade** (verificação de negócio, App Review, ícone do app),
2. **dar consentimento** (o cliente aceitando o acesso aos ativos dele),
3. **mudar o nível de confiança do app** (virar o app para Live).

E existe um teto duro que nenhuma linha de código contorna: **enquanto o app
estiver em modo de desenvolvimento e sem App Review, ele não alcança dados de
cliente nenhum.** Toda a engenharia abaixo funciona; ela só funciona sobre os
ativos de quem tem papel no app. Por isso o App Review não é "burocracia
pendente": é a chave que liga o produto.

---

## 1. Assinar campos de webhook (Ad Account, Permissions, Instagram, Page, WhatsApp)

### **PODE COM AJUSTE** — a assinatura é API; a ENTREGA das notificações não é.

**O clique produto-por-produto no painel é redundante.** A referência oficial do
endpoint diz, com todas as letras:

> "An app access token is required to add new subscriptions for that app."
> Parâmetros: `object` (obrigatório), `callback_url` (obrigatório), `fields`
> (obrigatório), `verify_token` (obrigatório), `include_values` (opcional).
> POST, GET e DELETE são suportados.
> — <https://developers.facebook.com/docs/graph-api/reference/v23.0/app/subscriptions>

E o guia de webhooks confirma o caminho programático:

> "If you are using the Graph API's `/app/subscriptions` endpoint to configure the
> Webhooks product, the API will indicate success or failure with a response."
> — <https://developers.facebook.com/docs/graph-api/webhooks/getting-started>

Ou seja: `callback_url` + `verify_token` + lista de campos — exatamente os
campos que ele preencheu na mão em cinco produtos diferentes — são um `POST` com
o app access token (`{app-id}|{app-secret}`), que esta casa já sabe montar.

**Mas a assinatura tem DOIS níveis, e o segundo é por ativo:**

| Nível | Chamada | Token exigido |
|---|---|---|
| App (uma vez por objeto) | `POST /{app-id}/subscriptions` | app access token |
| Página do Facebook | `POST /{page-id}/subscribed_apps` + `subscribed_fields` | Page access token de quem tem `CREATE_CONTENT`/`MANAGE`/`MODERATE`, com `pages_manage_metadata` **e** `pages_show_list` |
| Instagram | `POST /{ig-user-id}/subscribed_apps` (ou `/me/subscribed_apps`) | IG User token ou Page token |
| WhatsApp (WABA) | `POST /{waba-id}/subscribed_apps` | token com `whatsapp_business_management` |
| Conta de anúncios | `POST /{ad-account-id}/subscribed_apps` | token de **admin da conta de anúncios** |

Fontes: <https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/>
(citação literal: *"A Page access token requested by a person who can perform
`CREATE_CONTENT`, `MANAGE`, or `MODERATE` task on the Page"*) e
<https://developers.facebook.com/docs/instagram-platform/webhooks>.

**A trava real, que precisa ser dita antes de alguém comemorar:**

> "Your app must be set to **Live** in the App Dashboard for Meta to send webhook
> notifications." — <https://developers.facebook.com/docs/instagram-platform/webhooks>

E, no modo de desenvolvimento, notificação só sai para quem tem papel no app
(admin/desenvolvedor/testador). Traduzindo: **eu posso assinar tudo hoje, e não
vai pingar nada de cliente até o app virar Live.** Assinar agora não é inútil —
deixa a configuração pronta e versionada em código, em vez de morar na memória de
quem clicou —, mas não é o que destrava o produto.

**LACUNA declarada:** a página de referência genérica de `/{app-id}/subscriptions`
lista o enum de `object` como `{user, page, permissions, payments}` — **sem**
`instagram`, `whatsapp_business_account` ou `ad_account`, que as páginas de
produto tratam como objetos válidos. Não consegui reconciliar as duas na fonte
oficial, e **não há credencial da Meta neste ambiente para eu confirmar com uma
chamada real** (o `.env` local não tem `META_APP_ID`/`META_APP_SECRET`). O
primeiro `POST` de cada objeto tem que ser feito com o retorno da Meta na tela.
A biblioteca capturada em `docs/plataformas/meta/fontes/` **não cobre webhooks** —
não há fonte de webhook no manifesto. Vale adicionar na próxima recaptura.

**Trabalho meu:** `lib/integrations/meta/subscriptions.ts` (assinar, listar,
remover, reconciliar) + uma rota que mostre o estado real das assinaturas. Não
existe hoje — conferi: `grep` por `subscriptions`/`subscribed_apps` em
`lib/integrations/meta/` e `app/api/meta/` não devolve nada.

---

## 2. Conectar a conta de anúncios de um CLIENTE (para LER)

### **NÃO PODE** hoje — e a lista de `authorized_adaccounts` NÃO resolve.

Esta é a resposta que o CEO não vai gostar, e é a mais importante do parecer.

A autorização da Marketing API é explícita:

> "If your app is managing other people's ad accounts, you need **advanced
> access** to the `ads_read` and/or `ads_management` permissions."
> — <https://developers.facebook.com/docs/marketing-api/overview/authorization>

E o modo do app fecha o cerco:

> "Apps in Development mode can request permissions from **role users only**...
> Any data generated while an app is in Development mode ... can only be seen by
> role users." — <https://developers.facebook.com/docs/development/build-and-test/app-modes>

**Conta de cliente ≠ conta de quem tem papel no app.** Não existe truque de API
que contorne isso; é a fronteira que a Meta desenha entre "você testando" e "você
operando o negócio dos outros".

**Sobre a lista de contas autorizadas (`authorized_adaccounts`, o contador
"0/100" no painel):** ela é a permissão do lado do APP para tocar numa conta —
não é a permissão do lado do CLIENTE para o app existir na vida dele. As duas
precisam existir. Autorizar a conta do cliente na lista, com o app em
desenvolvimento, não faz a Meta liberar o dado: ela responde erro de permissão do
mesmo jeito.

**LACUNA declarada, e é séria:** `authorized_adaccounts` **não aparece na
documentação oficial** que consegui abrir nesta sessão (busca e leitura direta —
nenhuma página de referência da Meta descreve a edge). O que sustenta o uso hoje
é: (a) o contador visível no painel e (b) o código que esta casa já escreveu em
`app/api/meta/contas-de-anuncio/route.ts` (`POST /{app-id}/authorized_adaccounts`
com `adaccount_id` sem o prefixo `act_` e **token de usuário** — token de app
responde `(#102) A user access token is required`). **Não tenho evidência de que
esse POST já tenha retornado sucesso em produção.** Antes de tratar como
resolvido, precisa de uma execução com o retorno da Meta registrado.

**O que É preciso hoje, na ordem real:**

1. O **cliente** aceita a solicitação de parceiro no Business Manager dele (ou
   adiciona a Dioli como parceira, ou dá acesso de admin à conta de anúncios).
   **Isso é clique dele, e é irredutível** — é o consentimento.
2. Alguém **com papel no nosso app** (o CEO, hoje) precisa ser admin daquela conta
   de anúncios e passar pelo nosso OAuth, para o token alcançar a conta.
3. A conta entra na lista `authorized_adaccounts` — **isso eu faço por API**.
4. **Com o app em desenvolvimento, isso só funciona enquanto o operador for
   role user.** Não escala para 10 clientes. Escala depois do App Review.

**LACUNA declarada:** os endpoints de Business Manager para pedir acesso de
parceiro por API (`client_ad_accounts`, edge `agencies`) — a página oficial que
tentei (`/docs/marketing-api/business-manager/guides/assets`) devolveu **404**. A
afirmação "o outro lado precisa aceitar" está sustentada apenas por fontes de
terceiros ([Leadsie](https://www.leadsie.com/blog/request-facebook-ad-account-access),
[AdAmigo](https://www.adamigo.ai/blog/meta-business-manager-partner-access-setup-guide)),
não por documento da Meta. **Não afirmo como regra verificada.** Precisa ser
conferido na Business Management API antes de a esteira depender disso.

---

## 3. Ler campanhas que já rodam na conta de um cliente (insights, gasto, resultado)

### **PODE COM AJUSTE** — a permissão é a menor possível, mas o teto do app é o mesmo do item 2.

- **Permissão exigida: `ads_read`.** Só leitura de campanha, gasto e desempenho
  não precisa de `ads_management`. Regra da casa: pedir o menor escopo que
  resolve — `ads_management` é para pausar/criar, e ele carrega risco de escrita.
- **Mas `ads_read` para conta de terceiro é acesso AVANÇADO** (mesma citação do
  item 2). Sem App Review, leitura de conta de cliente não acontece.
- **O que funciona HOJE, em modo de desenvolvimento:** leitura de conta onde o
  dono do token tem papel no app e é admin da conta — foi exatamente o que
  provamos com a sandbox `act_1072627681961050` (campanha pausada criada e lida
  de volta). A sandbox prova o **mecanismo**, não a **licença**.
- **A conta da agência está restrita desde 03/08** — nela não se lê nem se
  escreve enquanto a análise correr, e a fonte é clara: análise em geral em 48h,
  **número de pedidos limitado e decisão final definitiva**
  (`docs/plataformas/meta/fontes/recorrer-de-restricao.md`).

**Teto de ritmo em modo de desenvolvimento** (`fontes/graph-api-limites-de-taxa.md`,
via cartilha seção (d)):

| Caso de uso | Development | Advanced |
|---|---|---|
| Gerenciamento de anúncios | 300 + 40 × anúncios ativos /h | 100.000 + 40 × ativos /h |
| Insights de anúncios | 600 + 400 × ativos − 0,001 × erros /h | 190.000 + 400 × ativos /h |

O nível do app muda a cota em ~300×. Enquanto isso, o balde desta casa
(`lib/integrations/meta/ritmo.ts`) opera abaixo desses tetos de propósito — e
**esse balde continua valendo depois do App Review**, porque o que derrubou a
conta em 03/08 foi rajada, não estouro de cota (cartilha, Lacuna 7).

**ALERTA de política, que ninguém pediu mas é meu dever:** a leitura contínua de
uma conta de cliente é justamente o tipo de tráfego que precisa parecer humano.
Dashboard de cliente custa ~28 chamadas. Dez clientes com atualização automática
de hora em hora é um padrão de máquina numa conta que a Meta já marcou. **Leitura
de conta de cliente entra com cache e com janela, não com polling.**

---

## 4. Conectar o Instagram de um cliente e ler feed/insights

### **PODE COM AJUSTE** — quase tudo é API depois do OAuth; três coisas são dele.

**O que já é API hoje** (`lib/integrations/meta/discovery.ts`, escrito e no ar):
uma chamada a `GET /me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`
devolve, de uma vez, todas as Páginas do cliente, o **token de Página de cada
uma** e o Instagram Business vinculado. **Não existe "escolher o Instagram na
mão" depois do OAuth** — isso é descoberta automática, e já está feito. Leitura
de feed e insights depois disso é `GET` puro.

**O que é clique DELE, e não tem contorno:**

1. A conta do Instagram precisa ser **Business ou Creator** (conta pessoal não
   tem API) — mudança no app do Instagram, dele.
2. Precisa estar **vinculada a uma Página do Facebook** — vínculo feito no app.
3. Ele precisa passar pelo **diálogo de OAuth** e marcar os ativos que libera.
   Isso é o consentimento; é o ponto inteiro do OAuth existir.
4. Se a Página tiver **PPA (Autorização de Publicação na Página)** pendente, não
   se publica até ele concluir (`fontes/instagram-publicacao-de-conteudo.md`).

**Permissões:** `instagram_basic` + `instagram_manage_insights` (+ `read_insights`
para a Página). As duas de insights são **avançadas** — mesma trava do App
Review, mesma citação de app-modes. Já estão em `DEFAULT_SCOPES` e já estão
marcadas em `SCOPES_QUE_EXIGEM_APP_REVIEW` (`lib/integrations/meta/config.ts`).

**Pegadinha de métrica, registrada como Lacuna 6 da cartilha e conferida ao vivo
em 04/08:** `impressions` está **DESCONTINUADA** na conta (v22.0) e na mídia
criada após 02/07/2024. Quem pedir `impressions` recebe erro ou zero. As vigentes
são `reach`, `views`, `accounts_engaged`, `total_interactions`. **"Não medi" não
é "deu zero"** — regra 5 da casa.

**Teto de publicação:** 100 posts/24h por conta (a doc de carrossel menciona 50;
a casa trata 50 como teto prudente). Consultável em
`GET /<IG_ID>/content_publishing_limit` (`fontes/instagram-publicacao-de-conteudo.md`).

**Estado real:** o token no cofre **não tem** `instagram_content_publish` nem
`pages_manage_posts`. Publicação orgânica espera token novo — que é OAuth novo,
que é clique. Leitura, não.

---

## 5. Rotacionar / invalidar token

### **PODE COM AJUSTE** — quase tudo por API; a renovação silenciosa é que não está documentada.

**O que é API, hoje, sem clique nenhum:**

| Ação | Chamada | Token |
|---|---|---|
| Ver validade, escopos e dono do token | `GET /debug_token?input_token=X` | app access token |
| Curto → longo (~60 dias) | `GET /oauth/access_token?grant_type=fb_exchange_token` | app id + secret |
| **Revogar** o app inteiro para um usuário | `DELETE /{user-id}/permissions` | user ou app token |
| Revogar **uma** permissão | `DELETE /{user-id}/permissions/{permission-name}` | idem |

Citação literal: *"You can revoke a specific permission by making a call to a
Graph API endpoint: DELETE /{user-id}/permissions/{permission-name} ... This
request must be made with a user access token or an app access token for the
current app."* —
<https://developers.facebook.com/docs/graph-api/reference/v23.0/user/permissions>

Duração: *"Short-lived tokens typically last about one to two hours, while
long-lived tokens last about 60 days"*, com o aviso *"Do not depend on these
lifetimes remaining the same — they may change without warning or expire early."*
— <https://developers.facebook.com/docs/facebook-login/guides/access-tokens>

**LACUNA declarada, e não vou inventar:** a página oficial **não afirma** que um
token longo pode ser renovado sozinho, sem o usuário voltar ao login. Circula a
ideia de "reciclar o token longo com `fb_exchange_token` a cada 60 dias" — **não
confirmei isso na fonte e não afirmo**. Precisa ser testado com um token real e o
retorno registrado.

**O caminho que ELIMINA a rotação, e é o certo para uma agência:**
- **Token de Página** derivado de um token de usuário longo — não expira do mesmo
  jeito que o de usuário. Já capturamos esses tokens no `discovery.ts` e já os
  guardamos cifrados. **Para leitura de Página/Instagram, é o token que deve ser
  usado, não o do usuário.**
- **System User do Business Manager** — a doc de access tokens confirma que na
  geração se *"choose a token expiration preference"*. É a resposta definitiva
  para "por que eu tenho que colar token de novo a cada 60 dias". **O primeiro
  system user é criado à mão em Business Settings** (5 minutos, uma vez na vida) —
  isso está na lista de cliques.

**App Secret: NÃO PODE por API.** Rotação de app secret é painel. (Declaro:
não achei página oficial que descreva rotação por API — a ausência de endpoint é
consistente com o modelo de segurança, mas trato como não verificado.)

**Trabalho meu:** rotina que roda `debug_token` em todos os tokens do cofre,
avisa o CEO **antes** de vencer (não no dia), e faz a troca longa
automaticamente. Hoje isso não existe — é por isso que ele descobre o vencimento
quando algo quebra.

---

## 6. App Review e verificação de negócio

### **NÃO PODE por API. É humano por desenho, e é o gargalo do produto inteiro.**

Citações oficiais:

> App Review é obrigatório se *"your app will be used by anyone without a Role on
> the app"* — <https://developers.facebook.com/docs/app-review>

> *"As of February 1, 2023, if your app requires advanced level access to
> permissions, you might need to complete Business Verification."*
> — <https://developers.facebook.com/docs/development/release/business-verification>

> *"only switch it to Live mode after you have completed app development and have
> completed App Review."*
> — <https://developers.facebook.com/docs/development/build-and-test/app-modes>

Extra que ninguém pediu e que morde depois: **Data Protection Assessment** é
*"an annual requirement for apps accessing certain types of data"*, e o admin tem
*"60 days to complete the assessment or risk losing platform access"*
— <https://developers.facebook.com/docs/resp-plat-initiatives/data-protection-assessment>.
Ou seja: mesmo depois de aprovado, o app tem uma obrigação anual com prazo que
derruba o acesso se for ignorada. Isso vira lembrete no calendário desta casa.

**Quanto tempo leva: EU NÃO SEI, e não vou chutar.** Nenhuma das páginas oficiais
que li publica prazo de App Review nem de verificação de negócio. A biblioteca
capturada **também não cobre o processo de App Review** — está registrado como
**Lacuna 3** da cartilha. O único prazo com fonte nesta casa é o de recurso de
restrição de conta: **48 horas, podendo demorar mais**
(`fontes/recorrer-de-restricao.md`).

**O que é irredutivelmente humano aqui, e por quê:** o App Review pede um
**screencast do produto funcionando** e instruções para um analista da Meta
reproduzir o uso de cada permissão. É uma pessoa da Meta assistindo o nosso
produto. Não existe API para isso, e não deveria existir.

---

# 🖐️ A LISTA MÍNIMA DE CLIQUES HUMANOS

**Só o CEO consegue fazer estes. Na ordem. Tudo que NÃO estiver nesta lista é
trabalho meu, por API.**

| # | O que | Onde | Tempo | Por que não tem API |
|---|---|---|---|---|
| 1 | **Recorrer da restrição** da conta da agência | business.facebook.com/accountquality → Pedir análise | 10 min + **48h** de espera (fonte) | Só o admin da conta pede; **recurso limitado, decisão definitiva** — não gastar antes de a causa estar corrigida |
| 2 | **Ícone do app 1024×1024** | Painel do app → Configurações básicas | 2 min | Único campo do painel que não preenchemos por API. Bloqueia o envio do App Review |
| 3 | **Vincular o app a um Business + verificação de negócio** (documento da empresa) | Painel do app → Configurações → Verificação | 15 min de envio + prazo da Meta **desconhecido** | Atestado de identidade jurídica. Pré-requisito de acesso avançado |
| 4 | **Enviar o App Review** — `ads_read`, `ads_management`, `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_*`, `business_management` | Painel do app → Análise do app | Gravação + texto: **2 a 4 h** (estimativa NOSSA, não da Meta) + prazo da Meta **desconhecido** | Um analista humano assiste o produto funcionando |
| 5 | **Virar o app para Live** | Chave no topo do painel | 1 clique | Só depois do item 4. Sem isso, **webhook não entrega e dado de cliente não sai** |
| 6 | **Criar um System User + token no Business Manager** | Business Settings → Usuários do sistema | 5 min, **uma vez na vida** | Elimina a rotação de token de 60 dias para sempre |
| 7 | **Por cliente:** o CLIENTE aceita o acesso de parceiro e passa pelo nosso OAuth | Business Manager do cliente + link que eu gero | 3 min **do lado dele** | É o consentimento. O CEO não faz nada aqui — eu gero o link, o cliente clica |

**Itens 1–6 são finitos e acontecem uma vez.** O item 7 é do cliente, não dele.

## O que passa a ser meu, por API (e hoje ele faz à mão)

1. **Assinar todos os webhooks** — app + Página + Instagram + WhatsApp + conta de
   anúncios, em código versionado, em vez de cinco telas do painel. *(Não existe
   ainda: nenhum `subscriptions` no repositório.)*
2. **Autorizar contas de anúncio no app** (`authorized_adaccounts`) — a rota já
   existe em `app/api/meta/contas-de-anuncio/route.ts`; falta provar em produção.
3. **Descobrir Páginas, tokens de Página e Instagram** após o OAuth — já feito
   (`discovery.ts`). Ele nunca mais escolhe conta na mão.
4. **Vigiar e trocar token** — `debug_token` em rotina, aviso ANTES de vencer,
   troca longa automática, revogação por `DELETE /permissions`.
5. **Ler campanha, gasto, desempenho e insights** — com balde de ritmo e cache,
   dentro dos tetos da fonte.
6. **Diagnóstico honesto do estado do app** — o que está pronto, o que a Meta
   ainda recusa, e por quê, em português.

## O que continua PROIBIDO, App Review ou não

- Escrita na conta da agência **enquanto a restrição estiver em análise**.
- Repetir a automação em outra conta durante a análise — flag em cadeia atinge
  contas do mesmo BM, mesmo cartão, mesmo admin (`fontes/comunidade-comportamento-inautentico.md`).
- Rajada de escrita em conta que voltou de restrição: conta que volta, volta em
  observação (`fontes/qualidade-da-conta.md`).
- Anúncio nascendo `ACTIVE`.

---

*Parecer emitido em 05/08/2026 pelo especialista Meta. As afirmações marcadas
como LACUNA não são parecer: são o que ainda precisa ser conferido, e estão
listadas como tal de propósito.*
