# Pedido de autorização de API à Freelancer.com — texto pronto para o CEO

**Estado: ENVIADO pelo CEO em 07/08/2026. Aguardando resposta.** Quem envia é o CEO.

## 🎓 Por que este pedido é diferente do da Upwork

Na Upwork, pede-se **acesso**. Aqui, o acesso técnico já existe — a
Freelancer.com publica uma API grande, com sandbox e SDKs, e promove "automação
dos processos de negócio em escala".

**O que falta é a AUTORIZAÇÃO.** Os Termos Gerais proíbem robot, spider, scraper
ou qualquer meio automatizado de acessar o site **sem autorização expressa por
escrito** — e dizem explicitamente que isso **inclui o acesso à própria API**.

> **Ter API não é ter permissão.** É por isso que
> `docs/plataformas/freelancer/policy.json` tem `api_available: true` **e**
> `api_authorization_required: true` como campos independentes, e por que o
> Policy Engine (`lib/marketplaces/politica.ts`) trata o segundo como `true`
> quando ausente.

Então o pedido não é "podemos usar a API?" — é **"confirmem por escrito que o
uso automatizado que descrevemos está autorizado, e que isso inclui a gestão de
bids da nossa própria conta"**. Uma API key sozinha não resolve.

- **Campo que a resposta preenche:** `docs/plataformas/freelancer/policy.json →
  autorizacao_do_provedor`.

## ⚠️ A mesma regra do texto

Descrever o uso **real**, sem enfeite. Nada de *scraper*, *bot de propostas*,
*auto-bid*, *envio em massa* — não são palavras feias, é que **não é o que a
gente vai fazer**. Se a descrição honesta for negada, redesenha-se o uso; não se
maquia o pedido.

---

## O texto

> **Assunto:** Written authorisation request — automated API access for our own
> agency account
>
> Hello,
>
> We are a Brazilian digital agency with an account on Freelancer.com. We are
> building an internal system to manage opportunities across the platforms we
> work on, and we would like to do this through your official API rather than by
> any form of browser automation.
>
> Before we build anything, we want to be sure we are within your rules. Your
> General Terms state that automated means of accessing the site — explicitly
> including access to the API — require express written authorisation. So we are
> asking for that authorisation, and describing exactly what we intend to do.
>
> **What the system does:**
>
> - Retrieves project listings in the categories we work in, at a normal pace,
>   so we can shortlist the ones that are actually relevant to us.
> - Analyses the brief of each shortlisted project to assess how well it matches
>   the services we deliver, and to price it correctly.
> - Prepares an individualised bid for each project we decide to pursue —
>   written for that specific project, never a template reused across projects.
> - Tracks the status of bids we have placed, so we can respond to clients on
>   time.
>
> **Scope:** this operates only on our own account, for our own agency's work.
> We are not building a product for third parties, we are not redistributing
> your data, and we are not aggregating listings for anyone else.
>
> **What we are not asking for:** we are not asking to place bids in bulk or to
> bid on everything we can reach. Our aim is the opposite — fewer bids, each one
> specific and worth reading. Sending the same text to many projects would harm
> our own standing on the platform first.
>
> Could you please confirm:
>
> 1. whether this use is covered by an express written authorisation, and how we
>    obtain it formally;
> 2. whether the authorisation covers **automated management of bids on our own
>    account** through the API, or whether placing the bid itself must remain a
>    manual action;
> 3. any rate or volume limits we should observe.
>
> We are happy to provide details of the account and of the application.
>
> Thank you,
> Dioli Digital

---

## O que fazer com a resposta

1. Arquivar em `docs/plataformas/freelancer/fontes/resposta-<data>.md`.
2. Preencher `policy.json → autorizacao_do_provedor`: **status +
   respondido_em + escopos_concedidos + evidencia**.
3. ⚠️ **Uma resposta que só concede API key NÃO destrava o envio automático.**
   O campo `o_que_confirmar` do `policy.json` existe para isso: é preciso a
   confirmação explícita de que o uso autorizado inclui o gerenciamento
   automatizado de bids da própria conta. Sem essa frase, `proposalSubmission`
   continua `MANUAL`.
