# Dossiê de submissão — App Review da Meta

> **App:** Dioli Digital Studio · `1824373765214116`
> **Montado em:** 06/08/2026, pelo especialista-trava da Meta.
> **Status:** pronto para enviar **depois** dos 4 itens da lista do CEO no fim
> deste documento. Enviar antes deles é queimar o envio.
>
> **Regra deste documento:** toda afirmação abaixo é (a) medida ao vivo por API
> em 06/08/2026, (b) citada da biblioteca capturada em
> `docs/plataformas/meta/fontes/`, ou (c) marcada como **LACUNA** quando não deu
> para confirmar. Nada aqui é memória de modelo.
>
> **Trava respeitada:** tudo que foi feito contra a Meta na montagem deste
> dossiê foi **LEITURA** (`GET` no nó do app com app access token). Nenhuma
> escrita. Submeter é ato do CEO.

---

## 1. O estado real do app hoje — medido, não suposto

Lido em 06/08/2026 com app access token (`{APP_ID}|{APP_SECRET}`), credenciais
resolvidas das variáveis do Railway.

| Campo | Valor lido |
|---|---|
| `name` | Dioli Digital Studio |
| `id` | 1824373765214116 |
| `category` / `subcategory` | Business / General |
| `created_time` | 2026-07-24T14:25:55+0000 |
| `link` / `website_url` | `https://www.diolidigital.com.br/` |
| `privacy_policy_url` | `https://www.diolidigital.com.br/privacidade` ✅ responde 200 |
| `terms_of_service_url` | `https://www.diolidigital.com.br/termos` ✅ responde 200 |
| `user_support_email` | diolisantos10@gmail.com |
| `contact_email` | agenciadioli@gmail.com |
| `app_domains` | `diolidigital.com.br`, `www.diolidigital.com.br`, `dioli-agency-os-1-production.up.railway.app` |
| `supported_platforms` | `["WEB"]` |
| `restrictions` | `{"age":"13+"}` |
| `icon_url` | `static.xx.fbcdn.net/rsrc.php/yI/r/CClW7OrbvHV.webp` — **o ícone genérico da Meta. A casa não subiu ícone.** |
| `roles` | **1 administrador** (usuário `2530864464003134`). Nenhum testador, nenhum desenvolvedor. |
| `permissions` (edge) | `{"data":[]}` — vazio |
| `subscriptions` | 5 objetos ativos (`application`, `instagram`, `whatsapp_business_account`, `page`, `permissions`), todos em **v25.0**, todos apontando para `https://dioli-agency-os-1-production.up.railway.app/api/meta/webhooks` |

### O que **NÃO** é legível por API — LACUNA declarada

Testei campo a campo. A Graph API responde `(#100) Tried accessing nonexisting
field` para todos estes:

- `is_in_dev_mode` / `dev_mode` — **o modo do app (dev vs. Ativo) não é legível
  por API.** Confere com a fonte: a troca é "uma alternância na barra do Painel
  de Apps, feita por administrador — não existe API para isso"
  (fonte: `fontes/app-modos-dev-vs-live.md`).
- `app_review_status`, `business_verification_status`, `verification_status` —
  **status de análise e de verificação de negócio não são legíveis por API.**
- `ads_api_access_tier` — **o nível da Marketing API não é legível no nó do
  app.** A cartilha aponta onde ver: *Painel de Apps > Análise do app >
  Permissões e recursos* (fonte: `fontes/marketing-api-autorizacao-e-niveis.md`).
- `/{app-id}/authorized_adaccounts` com app token → `(#102) A user access token
  is required`.

> **Portanto:** "o app está em modo de desenvolvimento" continua sendo o que a
> casa registrou em 03/08 e o que o comportamento indica (1 admin, 0
> permissões), **não** um fato relido hoje. Quem confirma em 30 segundos é o CEO
> abrindo o Painel de Apps. Está na lista dele.

### Versão da Graph: divergência real

`META_GRAPH_VERSION` **não está definida** no Railway, então o código roda em
`v21.0` (padrão de `lib/integrations/meta/config.ts`). Os **webhooks já estão
assinados em v25.0**. Não é bloqueio de submissão, mas é uma inconsistência que
um revisor atento pode citar, e v21.0 é versão velha para um envio de agosto de
2026.

---

## 2. Permissões: o que a casa USA de verdade

**A regra que governa esta seção:** "Como parte do processo de análise,
testaremos o app para verificar se ele realmente usa as permissões e os recursos
que você está solicitando. (…) Se pudermos testar o app, mas não conseguirmos
testar a funcionalidade que requer uma permissão ou um recurso específico
solicitado por você, não aprovaremos o acesso a essa permissão"
(fonte: `fontes/app-review-processo.md`).

Auditei cada permissão pedida em `DEFAULT_SCOPES` contra as chamadas Graph que
existem no código.

### ✅ VÃO NA SUBMISSÃO — 9 permissões com uso real

| Permissão | Onde é exercida no código | Tela do produto |
|---|---|---|
| `pages_show_list` | `me/accounts` — `ativos-autorizados.ts:10`, `connections.ts:60`, `discovery.ts:43`, `escolha-de-ativos.ts:12` | `/agency/integrations` (`MetaConnectManager.tsx`) |
| `pages_read_engagement` | metadados da Página vindos de `me/accounts`; dependência declarada de `instagram_*` e `ads_management` | `/agency/integrations` |
| `instagram_basic` | `{ig}/media`, perfil — `leitura.ts:292` | `/agency/clients/[id]` (`RedesDoCliente.tsx`) |
| `instagram_content_publish` | `{ig}/media` + `{ig}/media_publish` — `client.ts:115,127,133,170,178` | `/agency/planner` → `/api/meta/publish` |
| `instagram_manage_insights` | `{ig}/insights`, `{media}/insights` — `leitura.ts:526,546,651` | `/agency/clients/[id]`, portal do cliente |
| `ads_read` | `me/adaccounts`, `{conta}/campaigns`, `{conta}/insights` — `ads-leitura.ts:182,343,469` | **`/agency/desempenho-pago`** (criada hoje — ver §4) |
| `ads_management` | `{conta}/campaigns`, `/adsets`, `/adcreatives`, `/ads` — `ads.ts:212,363,412,427` | `/agency/ads-agent` + esteira `lib/agency/esteira/trafego.ts` |
| `whatsapp_business_management` | `{waba}/message_templates` — `templates.ts:44,71` | `/api/meta/templates`; demo pelo Gerenciador do WhatsApp (permitido — ver §3) |
| `whatsapp_business_messaging` | `{phone_id}/messages` — `client.ts:263` | `/agency/whatsapp`, `/agency/inbox` |

### ❌ RECOMENDO TIRAR — 3 permissões sem uso em código

Pedir permissão que não se usa é motivo de reprovação, e a Meta pergunta onde
cada uma é exercida.

| Permissão | Por que sai |
|---|---|
| **`instagram_manage_comments`** | **Zero código.** Não existe nenhuma chamada a `{ig-media}/comments`, nem leitura, nem resposta, nem ocultar. O que existe é `comments_count` (`leitura.ts:235,266`) — um **número** que vem nos campos de mídia via `instagram_basic`, não a moderação. O webhook `instagram/comments` está assinado, mas assinar webhook não é exercer a permissão, e o revisor pede para VER a moderação na tela. Não há tela. |
| **`pages_manage_metadata`** | **Zero código.** A permissão serve para "inscrever-se para receber webhooks da Página" e "atualizar configurações da Página" (fonte: `fontes/permissoes-referencia.md`). Não existe **nenhuma** chamada a `{page-id}/subscribed_apps` no repositório inteiro — conferido por busca. As assinaturas que existem são de nível de APP, que não precisam desta permissão. |
| **`business_management`** | **Zero código.** Uso permitido: "gerenciar ativos comerciais, como uma conta de anúncios" e "reivindicar contas de anúncios" (fonte: `fontes/permissoes-referencia.md`). Não há nenhuma chamada a `/{business-id}/…`, `owned_ad_accounts` ou `client_ad_accounts`. A casa lê contas por `me/adaccounts`, que é `ads_read`/`ads_management`. |

> **A ressalva honesta sobre `business_management`, dita com todas as letras:**
> ela **não** é dependência de `ads_management` na referência da Meta (as
> dependências listadas são `pages_read_engagement` + `pages_show_list`). Mas se
> a agência for, no futuro, ler contas que moram no **Business Manager do
> cliente** e precisar reivindicá-las, esta é a permissão. Hoje não faz isso.
> **Decisão recomendada: tirar agora e pedir num segundo envio quando existir o
> código** — permissão negada por falta de uso mancha o histórico do app; pedir
> de novo depois, com código pronto, não.

### ⚠️ O buraco inverso: código que existe e permissão que NÃO foi pedida

`lib/integrations/meta/client.ts:201,207` publica em **Página do Facebook**
(`{page-id}/photos` e `{page-id}/feed`). Isso exige **`pages_manage_posts`** —
e essa permissão foi **removida** de `DEFAULT_SCOPES` em 06/08/2026 porque o
diálogo de Login para Empresas respondeu `Invalid Scopes: email,
pages_manage_posts, read_insights` (registrado em `config.ts:40-54`).

**Consequência real:** publicação orgânica em Página do Facebook é **código
morto hoje** — vai falhar em produção com token válido e tudo no lugar. Duas
saídas, e é decisão do CEO:

1. **Adicionar `pages_manage_posts` à configuração do Login para Empresas** no
   painel (é lá que a lista vive nesse produto de login, não no `scope`) e
   incluí-la na submissão — o screencast dela pede criar, editar e excluir um
   post de Página na plataforma do app; **essa tela não existe**, teria de ser
   construída.
2. **Não pedir agora** e aceitar que o produto publica no Instagram, não no
   Facebook. Menos superfície, envio mais limpo.

**Recomendação: opção 2 neste envio.** O envio já tem 9 permissões; acrescentar
uma décima que exige uma tela nova é atrasar tudo por um canal secundário.

---

## 3. Texto de justificativa por permissão — **em inglês, pronto para colar**

> Cole no campo *Use case description* de cada permissão. Cada texto diz **o que
> o app faz, para quem, e onde na interface** — que é exatamente o que o revisor
> procura.

### `pages_show_list`

```
Dioli Digital is a marketing agency operating system. Our clients are small
restaurants and local businesses in Brazil that hire our agency to run their
social media and paid advertising.

We request pages_show_list as a dependency of instagram_basic,
instagram_content_publish, instagram_manage_insights and ads_management. After a
business owner connects their account through Facebook Login for Business, our
app calls GET /me/accounts to show them the list of Facebook Pages they manage,
so they can pick which Page (and its linked Instagram professional account) our
agency is authorized to work on. Without this list the business owner would have
to type Page IDs by hand, and we would have no way to verify they actually
manage the Page they are asking us to publish to.

Where to see it: sign in, go to "Ferramentas & Integrações" (Tools &
Integrations) in the left sidebar, open the Meta card and click "Conectar".
After the Facebook login flow, the app displays every Page the user manages,
each with a checkbox to authorize it.
```

### `pages_read_engagement`

```
Dioli Digital is a marketing agency operating system used by small businesses in
Brazil to have their social media managed by our agency.

We request pages_read_engagement to read the metadata of the Facebook Pages our
business clients authorize: Page name, ID, profile picture and the Page's link
to its Instagram professional account. This metadata is what lets our app show
the client "this is the Page and Instagram account Dioli is publishing to", and
it is what resolves which Instagram Business Account ID to target when the
client approves a post. It is also a required dependency of
instagram_content_publish, instagram_manage_insights and ads_management, which
are the core of our product.

We do not read follower personal data and we do not store Page follower
information.

Where to see it: sign in, go to "Ferramentas & Integrações" → Meta. Connected
Pages are listed with their name, picture and linked Instagram account. The same
data appears on each client's page under "Clientes" → (a client) → "Redes".
```

### `instagram_basic`

```
Dioli Digital is a marketing agency operating system. Small businesses in Brazil
hire our agency; they connect their Instagram professional account so our team
and our AI agents can plan, publish and measure content on their behalf.

We request instagram_basic to read the profile metadata of the connected
Instagram professional account (ID, username, profile picture, followers count)
and the account's own published media (caption, media type, permalink,
timestamp, like_count, comments_count). We need the account ID to target every
publishing and insights call. We display the username and profile picture so the
business owner can confirm the correct account is connected, and we display the
recent media grid so the agency can see what is already published before
planning new content.

Where to see it: sign in, go to "Clientes" → select a client → the "Redes"
(Networks) section shows the connected Instagram username, profile picture and
the grid of recent posts read from the Instagram Graph API.
```

### `instagram_content_publish`

```
Dioli Digital is a marketing agency operating system. Our business clients are
small restaurants and local retailers in Brazil who hire our agency to run their
Instagram. They do not have time or staff to post; delegating publication to us
is the service they are paying for.

We request instagram_content_publish so that, after the business client approves
a post inside our app, our app publishes that photo or video to the client's own
Instagram professional feed on their behalf. The flow is: our team (assisted by
our AI agents) drafts the content → the content appears in the client's approval
queue → the client approves it → our server calls POST /{ig-user-id}/media to
create the container and POST /{ig-user-id}/media_publish to publish it. We also
support carousels and stories through the same container flow. Nothing is
published without the client's explicit approval inside the product, and we
respect the Instagram publishing rate limit.

Where to see it: sign in, go to "Planner" in the left sidebar, open a scheduled
post for a client with a connected Instagram account, and click "Publicar". The
post appears on the client's Instagram feed.
```

### `instagram_manage_insights`

```
Dioli Digital is a marketing agency operating system. Our business clients pay
our agency for social media management and expect a monthly report proving what
the work produced.

We request instagram_manage_insights to read the performance of the connected
Instagram professional account and of the media we published on its behalf:
account-level reach, views, accounts_engaged and total_interactions, and
media-level reach, views, likes, comments, saved, shares, total_interactions
(plus ig_reels_avg_watch_time for Reels and the story-specific set). We turn
those numbers into the performance report the business client reads in their
portal. Without insights our agency can only tell a client "we posted", never
"this is what it produced" — which is the entire value of hiring an agency.

We never invent a metric: when the API does not return a value we display it as
"not measured", never as zero.

Where to see it: sign in, go to "Clientes" → select a client → the "Redes"
section shows account reach and engagement for the period, and per-post metrics
for each published item. The same numbers are shown to the business client in
their own client portal.
```

### `ads_read`

```
Dioli Digital is a marketing agency operating system. Our business clients hire
our agency to run their Meta ad campaigns, and they grant our app access to
their ad account so we can report on how their advertising budget is performing.

We request ads_read to pull ad reporting data from the ad accounts our business
clients authorize: GET /me/adaccounts to list the accounts they granted us,
GET /{ad-account}/campaigns to list active campaigns, and
GET /{ad-account}/insights for spend, impressions, reach, frequency, clicks,
CTR, CPC, CPM and results per campaign over the reporting period. Our app turns
those numbers into a plain-language read of where budget is being wasted and
where it is working, which is what our client is paying the agency to know.

This permission is used strictly for reading. All write operations go through
ads_management.

Where to see it: sign in, go to "Desempenho pago" (Paid performance) in the left
sidebar. The page lists every authorized ad account with total spend,
impressions, reach and clicks, and a per-campaign table with spend, impressions,
reach, clicks, CTR, CPC, CPM and results.
```

### `ads_management`

```
Dioli Digital is a marketing agency operating system. Small businesses in Brazil
hire our agency to plan and run their Meta advertising. They do not operate Ads
Manager themselves — delegating campaign setup and management to our agency is
the service they buy.

We request ads_management so our app can build and manage campaigns inside the
ad accounts our business clients authorize. Our media planner produces a
campaign plan (objective, budget, audience, placements, creatives); after the
client approves the plan and the budget inside our product, our server creates
the campaign with POST /{ad-account}/campaigns, the ad set with
POST /{ad-account}/adsets, the creative with POST /{ad-account}/adcreatives and
the ad with POST /{ad-account}/ads, and can later pause or resume the campaign
from our app. We also read performance through the same permission to decide
what to pause or scale.

Two safeguards we enforce in code: every object is created PAUSED and only a
human activation inside our app can set it live, and we enforce a per-ad-account
spend ceiling that the client agreed to.

Where to see it: sign in, go to "Desempenho pago" to see performance of managed
campaigns, and "Ads Agent" for the campaign plan that is submitted to the ad
account.
```

### `whatsapp_business_management`

```
Dioli Digital is a marketing agency operating system. Our business clients — and
our own agency — use WhatsApp as the main channel to talk to their customers in
Brazil, where WhatsApp is the default way a customer contacts a business.

We request whatsapp_business_management to manage the WhatsApp business assets
our clients grant us access to: reading and creating message templates on the
WhatsApp Business Account (GET and POST /{waba-id}/message_templates), reading
the WABA's phone numbers, and subscribing to webhooks for message delivery and
template status changes. Templates are what let a business legitimately re-open
a conversation outside the 24-hour customer service window, so managing them is
required for our messaging feature to comply with WhatsApp policy.

Where to see it: templates for the connected WABA are created and listed by our
app; the same templates are visible in WhatsApp Manager for the account.
```

### `whatsapp_business_messaging`

```
Dioli Digital is a marketing agency operating system that includes a shared
WhatsApp inbox. Our agency and our business clients answer their customers from
inside our product instead of from a personal phone, so the conversation history
belongs to the business and not to whichever employee happened to reply.

We request whatsapp_business_messaging so our app can send WhatsApp messages
from the business phone number to the customer who wrote in, and retrieve media
attached to those messages. Inbound messages arrive through our webhook and are
stored against the business's workspace; the operator reads the thread in our
inbox screen and replies from there, and the reply is sent with
POST /{phone-number-id}/messages.

We comply with WhatsApp messaging policy: we only message people who contacted
the business first or gave opt-in, free-form replies are only sent inside the
24-hour window (outside it we use an approved template), and every automated
reply offers an immediate path to a human operator.

Where to see it: sign in and open "WhatsApp" in the left sidebar. Select a
conversation and send a reply — it is delivered to the customer's WhatsApp.
```

---

## 4. Artefatos obrigatórios — o que já existe e o que falta

| Artefato | Estado | Onde |
|---|---|---|
| **Política de privacidade** | ✅ **PRONTA e no ar** (HTTP 200) | `app/privacidade/page.tsx` → `https://www.diolidigital.com.br/privacidade` |
| **Termos de serviço** | ✅ **PRONTOS e no ar** (HTTP 200) | `app/termos/page.tsx` → `https://www.diolidigital.com.br/termos` |
| **Instruções de exclusão de dados (página)** | ✅ **PRONTA**, e trata o `?codigo=` que a Meta confere | `app/exclusao-de-dados/page.tsx` |
| **Callback de exclusão de dados (endpoint)** | ✅ **PRONTO**, valida assinatura HMAC, responde `{url, confirmation_code}` | `app/api/meta/exclusao-de-dados/route.ts` |
| **Tela de desempenho de anúncios** | ✅ **CRIADA HOJE** (não existia) | `app/agency/desempenho-pago/page.tsx` |
| **Ícone 1024×1024** | ❌ **FALTA** — `icon_url` é o genérico da Meta | upload manual no Painel de Apps |
| **`META_LOGIN_CONFIG_ID`** | ❌ **FALTA** — variável ausente no Railway | ver §6, risco nº 1 |
| **Categoria / descrição do app** | ⚠️ **LACUNA** — `category=Business`, `subcategory=General` estão lidos, mas o campo de **descrição** do envio não é legível por API | Painel de Apps |
| **Verificação de negócio** | ⚠️ **LACUNA** — não legível por API (§1) | Painel de Apps → Central de Empresas |
| **Vídeos de demonstração** | ❌ **FALTAM** — roteiros prontos em §5 | gravação é do CEO |

### 🔴 O bug que eu encontrei e consertei hoje

O callback de exclusão de dados **devolvia à Meta um link morto**. Conferido ao
vivo contra produção antes do conserto:

```
POST /api/meta/exclusao-de-dados
→ {"url":"https://diolidigital.com.br/exclusao-de-dados?codigo=f05cd…"}
```

`diolidigital.com.br` — o domínio **apex** — **não tem registro de DNS**
(`curl` devolve `000`, `getent hosts` não resolve). O código montava a URL a
partir de `RAILWAY_PUBLIC_DOMAIN`, que vale exatamente esse apex, porque
`PUBLIC_BASE_URL` nunca foi definida.

É o link que o revisor da Meta clica para confirmar que o callback funciona. E a
regra é dura: *"Se não conseguirmos acessar seu app para a execução de testes,
**todo o seu envio será rejeitado**"* (fonte: `fontes/app-review-processo.md`).

**Consertado** em `app/api/meta/exclusao-de-dados/route.ts`: a origem passa a
sair do endereço em que a Meta nos chamou (`x-forwarded-host`, via
`origemPublica()`), caindo em `NEXT_PUBLIC_APP_URL` (o `www`, que resolve). O
apex saiu da corrente.

### 🟡 A segunda correção no mesmo arquivo: uma frase falsa no log

A função `apagarDadosDoUsuario` gravava no histórico *"conexões Meta associadas
removidas"* — **e não removia nada**. O motivo é estrutural: `MetaConnection`
guarda o ID do ATIVO (conta do Instagram, Página, número), **não** o ID do
usuário da Meta que autorizou; sem essa coluna não há como ligar o `user_id` do
`signed_request` a uma linha do banco.

Trocado por um registro honesto de "pendente de ação humana", que é o que de
fato acontece — e que casa com o que a página promete ao usuário (conclusão em
até 15 dias por e-mail). Para automatizar de verdade: persistir o `user_id` da
Meta em `metaJson` na hora da conexão (cabe sem migration).

---

## 5. Roteiros de vídeo de demonstração — passo a passo

**Regras que valem para todos os vídeos** (fonte: `fontes/permissoes-referencia.md`):

- **Todo** screencast começa mostrando o **fluxo completo de login do Facebook**
  na plataforma do app, incluindo a tela onde o usuário concede a permissão.
- Grave em tela cheia, com a barra de endereço visível (o revisor precisa ver
  que é o domínio submetido).
- Sem cortes no meio de um fluxo — corte parece coisa escondida.

### Abertura comum a todos os vídeos (grave uma vez, reaproveite)

1. Abrir `https://www.diolidigital.com.br/auth/signin`.
2. Entrar com a **credencial de teste** criada para a Meta (§6).
3. Menu lateral → **Ferramentas & Integrações**.
4. No cartão Meta, clicar **Conectar**.
5. Mostrar o diálogo do Facebook **inteiro**: a escolha do negócio, a escolha da
   Página e da conta do Instagram, a lista de permissões, e o clique em
   continuar.
6. De volta ao app, mostrar a Página, a conta do Instagram e a conta de anúncios
   agora listadas como conectadas.

### Vídeo A — `pages_show_list` + `pages_read_engagement`

- Abertura comum.
- Na tela de Integrações, apontar a **lista de Páginas que o usuário gerencia**,
  cada uma com nome e foto — mostrando que veio do login, não digitada.
- Marcar uma Página como autorizada.
- Ir em **Clientes → (cliente) → Redes** e mostrar os metadados da Página e a
  conta do Instagram vinculada exibidos na plataforma.

### Vídeo B — `instagram_basic` + `instagram_manage_insights`

*(a Meta pede, para `instagram_manage_insights`, que se mostre acesso a insights
de metadados, publicações, fotos e vídeos da conta profissional)*

- Abertura comum.
- **Clientes → (cliente) → Redes**: mostrar username, foto e a grade de posts
  recentes lidos da conta (isto é `instagram_basic`).
- Na mesma tela, mostrar as métricas da conta no período (alcance, views,
  contas engajadas, interações).
- Abrir **um post** e mostrar as métricas daquela mídia (alcance, views,
  curtidas, comentários, salvamentos, compartilhamentos).
- Falar em voz alta que uma métrica não devolvida aparece como "não medido", e
  mostrar isso se houver.

### Vídeo C — `instagram_content_publish`

*(a Meta pede: "Demonstre como criar um post com foto e publicá-lo no feed do
Instagram do usuário comercial")*

- Abertura comum.
- **Planner** → criar um post novo para o cliente: escolher a imagem, escrever a
  legenda, escolher a conta do Instagram de destino.
- Mostrar o post na fila de aprovação e **aprovar**.
- Clicar em **Publicar**.
- **Sem cortar o vídeo**, abrir o Instagram (app ou web) na conta do cliente e
  mostrar o post publicado, com a mesma imagem e a mesma legenda.

### Vídeo D — `ads_read` + `ads_management` (um vídeo serve para os dois)

*(a Meta pede, para ambos: "Mostre que os dados de desempenho dos anúncios (como
impressões, conversões, gastos, cliques e alcance) são exibidos na plataforma do
app")*

- Abertura comum, **garantindo que a conta de anúncios apareça na tela de
  autorização**.
- Menu lateral → **Desempenho pago**.
- Mostrar, com o cursor, os quatro números do topo da conta: **Gasto,
  Impressões, Alcance, Cliques**.
- Descer para a **tabela por campanha** e percorrer as colunas: gasto,
  impressões, alcance, cliques, CTR, CPC, CPM e resultado.
- Mostrar os "achados" e a recomendação em texto.
- **Para `ads_management` especificamente:** ir a **Ads Agent**, gerar o plano de
  campanha para o cliente, e mostrar a criação da campanha no ad account —
  destacando que ela nasce **PAUSADA** e que a ativação é um segundo clique
  humano. Depois, mostrar a campanha recém-criada aparecendo em Desempenho pago.

> ⚠️ **O vídeo D depende da conta de anúncios estar liberada.** A conta da
> agência (`act_3416644181895443`) estava RESTRINGIDA desde 03/08/2026. Se ainda
> estiver, grave o vídeo D com **outra conta de anúncios sem restrição**, ou
> espere a análise. Gravar mostrando uma conta restrita é entregar ao revisor a
> prova de que a casa já foi punida por automação.

### Vídeo E — `whatsapp_business_messaging`

*(a Meta aceita: "Seu app enviando uma mensagem para um número do WhatsApp, e
demonstre o cliente do WhatsApp recebendo e exibindo a mensagem enviada")*

- Abertura comum.
- Menu lateral → **WhatsApp**.
- Mostrar uma conversa existente (mensagem que o cliente mandou).
- Digitar uma resposta e enviar **de dentro do app**.
- **Sem cortar**, mostrar o celular/WhatsApp Web do destinatário recebendo e
  exibindo a mensagem.

### Vídeo F — `whatsapp_business_management`

*(a Meta aceita explicitamente: "Como o usuário do seu app cria um modelo de
mensagem nele **ou no Gerenciador do WhatsApp**")*

- Abertura comum.
- Criar um **modelo de mensagem** para a WABA conectada — pode ser no
  Gerenciador do WhatsApp, que a Meta aceita como alternativa.
- Mostrar o modelo criado e seu status.

---

## 6. O caminho que a Meta vai percorrer — e ele funciona hoje?

### Conferido ao vivo em 06/08/2026

| URL | Resultado |
|---|---|
| `https://www.diolidigital.com.br/` | **200** ✅ |
| `https://www.diolidigital.com.br/privacidade` | **200** ✅ |
| `https://www.diolidigital.com.br/termos` | **200** ✅ |
| `https://www.diolidigital.com.br/exclusao-de-dados` | **200** ✅ |
| `https://www.diolidigital.com.br/auth/signin` | **200** ✅ |
| `https://diolidigital.com.br/` (**apex**) | **000 — SEM DNS** ❌ |
| `https://dioli-agency-os-1-production.up.railway.app/` + as 4 rotas | **200** ✅ |

### Veredito sobre o DNS quebrado

**Não é bloqueante, mas tem uma ponta solta.** O `www` — que é o host de TODAS
as URLs registradas no app (`link`, `website_url`, `privacy_policy_url`,
`terms_of_service_url`) e o valor de `NEXT_PUBLIC_APP_URL` — **funciona
perfeitamente**. O que está morto é só o **apex**.

As duas pontas soltas, nomeadas:

1. `app_domains` lista `diolidigital.com.br` (apex). A Meta não testa resolução
   de `app_domains`, mas é sujeira no envio. **Recomendo: ou criar o registro
   apex, ou tirar o apex de `app_domains`.**
2. O apex já causou um bug real hoje (§4, callback de exclusão). Consertado no
   código, mas outros dois pontos ainda usam a mesma cadeia quebrada —
   `lib/agency/esteira/trafego.ts:513` e `lib/agency/esteira/publicacao.ts:529`.
   São links internos de aviso, não afetam a submissão, mas geram link morto
   para quem os receber.

### 🔴 O que **NÃO** funciona hoje: o login que o revisor precisa completar

**`META_LOGIN_CONFIG_ID` não está definida no Railway.** Conferido: a variável
não existe entre as 31 do serviço.

Sem ela, `buildLoginUrl` (`lib/integrations/meta/oauth.ts:39-48`) cai no fluxo
clássico de `scope`. E este é um app **tipo Business**, que usa **Login do
Facebook para Empresas** — produto em que o diálogo **não aceita `scope`**, e
sim `config_id`. O diagnóstico da própria casa já diz isso, em português, na
rota `/api/meta/diagnostico`:

> *"ATENÇÃO: sem META_LOGIN_CONFIG_ID, o diálogo vai pelo fluxo clássico de
> `scope`. Em app do tipo Business isso faz a Meta recusar o usuário com
> mensagem enganosa."*

E foi exatamente o que aconteceu com o CEO em 06/08: `Invalid Scopes: email,
pages_manage_posts, read_insights` (registrado em `config.ts:43`).

**Tradução:** hoje o revisor da Meta **não consegue completar o passo 5 da
abertura comum de todos os vídeos**. Todos os screencasts começam pelo login, e
o login está quebrado. Isso não reprova uma permissão — **reprova o envio
inteiro**.

### A credencial de teste

A Meta exige credenciais de teste para entrar na plataforma. **Não entregue a
conta `master`**: ela dá acesso a configurações, integrações e reset de dados de
produção.

**Crie um usuário dedicado com papel `project_manager`** — ele alcança tudo o
que os vídeos precisam (Integrações, Clientes, Planner, Desempenho pago,
WhatsApp) e não alcança as chaves da casa. Entregue e-mail e senha nos campos de
credencial de teste do formulário.

---

## 7. Fontes usadas neste dossiê

Da biblioteca capturada (`docs/plataformas/meta/fontes/`):

- `app-review-processo.md` — o gatilho da análise, e a regra de que app não
  testável = envio inteiro rejeitado.
- `permissoes-referencia.md` — dependências, uso permitido, texto do campo de
  justificativa e requisitos de screencast, permissão por permissão.
- `app-modos-dev-vs-live.md` — o que o modo do app trava, e que não há API.
- `marketing-api-autorizacao-e-niveis.md` — onde se lê o nível da Marketing API.
- `app-review-publicacao.md`, `verificacao-de-negocio.md` — processos paralelos.

Medições ao vivo (06/08/2026): nó `/{app-id}` e edges `permissions`, `roles`,
`subscriptions` com app access token; DNS e HTTP dos domínios; `POST` de teste
no próprio callback de exclusão da casa.

**Lacunas declaradas neste dossiê:** modo do app, status de App Review,
verificação de negócio, nível da Marketing API e descrição do app **não são
legíveis por API** — todos precisam de um olhar do CEO no Painel de Apps. O
passo a passo do FORMULÁRIO de envio segue como lacuna da biblioteca (a página
`/documentation/development/release/app-review` não rende para o capturador).

---

## 8. 🎯 A lista do CEO — o que só ele pode fazer

Em ordem. Nada abaixo é código; é tudo clique, gravação ou decisão.

| # | O que fazer | Onde | Tempo |
|---|---|---|---|
| 1 | **Criar a configuração do Login para Empresas** e copiar o ID para a variável `META_LOGIN_CONFIG_ID` no Railway. Sem isso o revisor não consegue logar e o envio é reprovado inteiro. Na configuração, incluir as 9 permissões da §2. | Painel de Apps → Login do Facebook para Empresas → Configurações; depois Railway → Variables | **20 min** |
| 2 | **Subir o ícone do app 1024×1024.** Hoje é o ícone genérico da Meta. | Painel de Apps → Configurações básicas | **5 min** |
| 3 | **Conferir e me dizer 4 coisas** que não são legíveis por API: (a) o app está em modo de desenvolvimento ou Ativo? (b) a verificação de negócio está concluída? (c) qual o nível da Marketing API? (d) alguma permissão já aparece como aprovada? | Painel de Apps → Análise do app → Permissões e recursos | **10 min** |
| 4 | **Criar o usuário de teste para a Meta** (papel `project_manager`, senha própria) e me passar e-mail e senha para entrarem no formulário. | Painel da Dioli → Configurações | **5 min** |
| 5 | **Decidir sobre as 3 permissões que recomendo TIRAR** (`instagram_manage_comments`, `pages_manage_metadata`, `business_management`) e sobre `pages_manage_posts` (recomendo não pedir agora). | decisão | **5 min** |
| 6 | **Gravar os 6 vídeos** com os roteiros da §5. O vídeo D depende de uma conta de anúncios sem restrição. | gravação de tela | **2 a 3 h** |
| 7 | **Criar o registro DNS do apex** `diolidigital.com.br` (ou tirar o apex de `app_domains`). Não é bloqueante — o `www` funciona. | provedor de DNS | **15 min** |
| 8 | **Enviar.** Colar os textos da §3, anexar os vídeos, informar a credencial de teste. | Painel de Apps → Análise do app | **40 min** |

> **Não faça o item 8 antes dos itens 1, 4 e 6.** O número de envios não é
> infinito e reprovação entra no histórico do app.
