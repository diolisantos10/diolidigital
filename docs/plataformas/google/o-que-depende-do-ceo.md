# Google — o que depende do CEO, passo a passo

> Escrito em 08/08/2026, no dia em que o CEO pediu "a integração das ferramentas
> do Google nas páginas do admin urgentemente". Cada item aqui é **um clique ou
> um pedido formal que só ele pode fazer** — nenhum agente desta casa tem acesso
> ao Google Cloud Console nem à conta de administrador do Google Ads.

## O que JÁ está feito (não precisa refazer)

Conferido em 08/08/2026, declarado pelo próprio CEO:

- Projeto **`dioli-digital`**, número **`87784856270`** — credencial da AGÊNCIA,
  não mais emprestada do projeto da Foocci.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` e
  `GOOGLE_PROJECT_NUMBER` **em produção**.
- App OAuth **PUBLICADO** (status "Em produção") — então o refresh token do
  cliente **não morre mais em 7 dias**, que era o furo declarado em 07/08.
- Escopos concedidos: `openid email profile`, `drive.file`, `business.manage`.
- APIs ativadas: Drive, Picker, My Business Account Management, My Business
  Business Information.
- Redirects registrados nos dois domínios.
- **O Drive do cliente conecta e funciona** — provado com a Foocci em 08/08.

---

## 1. Google Analytics (GA4) — 15 minutos, sem prazo externo

**O que falta, exatamente.** Nada de aprovação. São duas coisas:

### 1.1 Ativar a API

Google Cloud Console → projeto **`dioli-digital`** → *APIs e serviços* →
*Biblioteca* → ativar as duas:

| API | Para quê |
|---|---|
| **Google Analytics Data API** (`analyticsdata.googleapis.com`) | ler relatórios: sessões, usuários, conversões, origem do tráfego |
| **Google Analytics Admin API** (`analyticsadmin.googleapis.com`) | descobrir QUAIS propriedades a conta alcança — sem ela, alguém digita o ID da propriedade à mão e digita errado |

### 1.2 Declarar o escopo na tela de consentimento

Google Cloud Console → *Tela de permissão OAuth* → *Escopos* → **Adicionar
escopo** →

```
https://www.googleapis.com/auth/analytics.readonly
```

> **Confirmado em 08/08/2026** lendo o documento de descoberta oficial da API
> (`https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta`), que
> declara exatamente dois escopos: `.../auth/analytics` (ver **e gerenciar**) e
> `.../auth/analytics.readonly` (só ver).
>
> **Pedir o `.readonly`, e não o amplo.** A casa só vai LER. Escopo maior do que
> o uso é o que faz a tela de consentimento assustar o cliente e é o que
> transforma um erro nosso em estrago na conta dele.

### 1.3 A parte que NÃO é clique, e é o gargalo de verdade

**Cada cliente precisa autorizar a agência na propriedade GA4 dele.** Sem isso,
o escopo concedido não alcança dado nenhum — alcance nunca é autorização.
Isso é conversa com cliente, não configuração.

### ⚠️ O que não fazer

`analytics.readonly` **é escopo sensível** — com o app já publicado, acrescentar
escopo sensível **reabre a verificação do app pelo Google**. Isso não quebra o
que já funciona (Drive e Perfil de Empresa seguem no ar), mas é o motivo de
**não pedir os dois escopos de Analytics** e de não pedir Ads junto "já que
está mexendo".

---

## 2. Google Ads — pedido formal, prazo EXTERNO de dias a semanas

**Texto pronto para enviar: `pedido-de-token-de-desenvolvedor-ads.md`.**

Resumo do que ele diz:

- Sem **token de desenvolvedor**, nenhuma chamada à Google Ads API funciona —
  nem leitura.
- O token **nasce restrito** (nível Explorador, ou conta de teste se o Google
  não conseguir analisar automaticamente). Tirar as restrições é um **segundo**
  pedido, e é esse que leva dias ou semanas.
- **Um token por empresa.** Se a Dioli já tem um, é para reutilizar.
- Exige **conta de administrador (MCC)** do Google Ads, **site no ar** e
  **e-mail de contato que alguém lê** — os três são motivo declarado de recusa.
- Depois do token ainda faltam duas coisas: o escopo
  `https://www.googleapis.com/auth/adwords` na tela de consentimento, e cada
  cliente vincular a conta dele à conta de administrador da agência.

> **O Planejador de Palavras-chave vive dentro da Google Ads API** (serviço
> `KeywordPlanIdeaService`). Não tem API própria. Quem quiser pesquisa de
> palavra-chave passa pelo mesmo token — é o mesmo pedido.

---

## 3. Google Search Console — 10 minutos, sem prazo externo

- **API oficial, madura, gratuita.** Confirmado em 08/08/2026 no diretório de
  descoberta do Google (`searchconsole:v1`).
- **Ativar** a *Google Search Console API* na Biblioteca do projeto.
- **Escopo a declarar:** `https://www.googleapis.com/auth/webmasters.readonly`
  (confirmado no documento de descoberta oficial; o par que existe é
  `.../auth/webmasters`, que também escreve — **não pedir esse**).
- **O gargalo é o mesmo do Analytics:** o cliente precisa dar acesso à
  propriedade dele no Search Console. Sem isso, o escopo não alcança nada.
- **É escopo sensível** — mesma observação de reabertura de verificação.

---

## 4. Google Trends — ⚠️ LEIA ANTES DE PEDIR

**Existe API oficial, e ela NÃO está aberta.** Medido em 08/08/2026:

- O anúncio oficial é de **24/07/2025** e diz, com estas palavras: *"The API
  will be available only to a very limited number of testers. If you're
  interested in testing, apply to be an alpha tester."*
  (capturado em `fontes/trends-api-alpha.md`).
- O endpoint de descoberta **`https://trends.googleapis.com/$discovery/rest?version=v1beta`
  responde 200** — a API existe de verdade, em `v1beta`.
- **A página de documentação pública NÃO existe** (`developers.google.com/search/docs/monitor-debug/trends-api`
  → 404 em 08/08/2026), e `trends` **não aparece** no diretório público de APIs
  do Google (`googleapis.com/discovery/v1/apis?name=trends` volta vazio).
- **Não confirmei** se o alpha continua fechado hoje, se há preço, nem qual é a
  cota. O anúncio de 2025 é a fonte mais recente que a casa conseguiu ler.

**O que isso significa na prática:** o caminho é **entrar na lista de espera**
(o link "Apply to be an alpha tester" do próprio anúncio). É um formulário, não
um contrato — barato de mandar, e o relógio só começa quando alguém manda.

### 🔴 O que NÃO fazer, com todas as letras

Toda biblioteca de "Google Trends" que se acha pronta (`pytrends` e
equivalentes) é **não oficial**: bate no endpoint interno do site do Trends, sem
contrato, sem cota publicada, e o Google bloqueia por IP quando entende como
abuso. **Isso é exatamente o gesto que custou a conta de anúncios da agência na
Meta em 03/08/2026.**

**Regra da casa: nenhuma biblioteca não oficial de Trends entra neste
repositório sem parecer PODE do especialista `google`.** E o parecer, com o
texto do anúncio na mão, muito provavelmente é NÃO PODE.

---

## 5. Perfil de Empresa (Business Profile) — o que trava é PARECER, não o CEO

Já está tudo ligado do lado do Google: escopo `business.manage` concedido, as
duas APIs ativadas, e o código de ler ficha, ler avaliação, responder avaliação
e publicar post **existe** em `lib/integrations/google/client.ts`.

**O que falta é decisão nossa, não dele:**

- **Responder avaliação e publicar post são ESCRITA em plataforma.** A regra do
  CEO de 03/08/2026 exige parecer prévio do especialista `google`, e a pasta
  `pareceres/` só tem o do Drive. Enquanto não houver, a tela do admin é só
  leitura — e diz isso, na tela.
- **A resposta automática já é fail-closed.** `GoogleConnection.autoReplyConsentAt`
  nulo = nada sai sozinho, tudo vira rascunho escalado. Está nulo em todos os
  locais, e há teste que reprova o contrário
  (`__tests__/esteira/avaliacoes.test.ts`). A política do próprio Google exige
  consentimento prévio e específico para resposta automatizada
  (`fontes/business-profile-api-politicas.md`).
- **Ninguém conectou um Perfil de Empresa ainda.** A rota `/api/google/conectar`
  existe, funciona e **não tem botão em lugar nenhum** — nem no admin nem no
  portal. É trabalho nosso, e é pequeno; entra depois do parecer, porque um
  botão de conectar sem saída para o que fazer com a conexão é meio caminho.
