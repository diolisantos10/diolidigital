# Pedido de token de desenvolvedor da Google Ads API — pronto para o CEO enviar

**Estado: NÃO ENVIADO.** Quem envia é o CEO. Nenhum agente desta casa mandou
nada, e nenhum agente pode: o formulário exige login numa conta de
administrador do Google Ads.

> **Por que a pressa, se ainda não existe uma linha de código de Ads nesta
> casa:** porque **o prazo é EXTERNO e o relógio só começa quando alguém pede.**
> A própria documentação do Google diz que a análise "pode levar dias ou
> semanas" e recomenda pedir o nível de acesso "bem antes de precisar dos
> limites de cota aumentados"
> (fonte: `fontes/ads-api-niveis-de-acesso.md`). Construir primeiro e pedir
> depois é escolher esperar duas vezes.

---

## O que é isto, em uma frase

Sem token de desenvolvedor, **nenhuma chamada à Google Ads API funciona** —
nem de leitura. Ele é um pré-requisito, não uma otimização
(fonte: `fontes/ads-api-token-de-desenvolvedor.md`, "um token de desenvolvedor
é um pré-requisito para fazer chamadas da API Google Ads").

## Os três fatos que mudam o planejamento — todos da fonte oficial

1. **O token nasce restrito.** O nível concedido na inscrição costuma ser
   **Explorador** (chamadas a contas de produção, com restrições) — e, quando o
   Google **não consegue analisar automaticamente**, o token nasce em **conta de
   teste**, que só fala com contas de teste. Para tirar as restrições é preciso
   **pedir separadamente** o nível Básico ou Padrão, e essa segunda análise é a
   que leva dias ou semanas.
2. **Um token por EMPRESA, não por projeto.** "O Google geralmente concede um
   token de desenvolvedor por empresa." Se a Dioli já tiver um token de qualquer
   trabalho anterior, **é para reutilizar** — pedir outro sem justificar o caso
   de uso é o caminho para a recusa.
3. **A API é gratuita** nos níveis Explorador, Básico e Padrão. **Mas** quem cai
   nos Recursos Mínimos Obrigatórios (RMF — só nível Padrão) passa por auditoria
   da equipe de análise do Google, e **não conformidade tem taxa**
   (fonte: `fontes/ads-api-niveis-de-acesso.md`).

## ⚠️ Os pré-requisitos que reprovam a inscrição antes de ela ser lida

Conferir ANTES de enviar — cada um destes é motivo declarado de recusa na fonte
oficial (`fontes/ads-api-token-de-desenvolvedor.md`):

- [ ] **Conta de ADMINISTRADOR (MCC) do Google Ads**, e não uma conta de
      anunciante. `https://ads.google.com/aw/apicenter` mostra *"A Central de
      API está disponível apenas para contas de administrador"* quando o login
      está errado. Não pode ser conta de administrador **de teste**.
- [ ] **O site da empresa precisa estar NO AR.** "Se o site não estiver ativo, o
      Google poderá não processar sua inscrição e rejeitá-la."
      → `https://www.diolidigital.com.br` — **conferir que responde** no dia do
      envio. URLs genéricos (`test.com`, `example.com`) são recusados.
- [ ] **O e-mail de contato da API precisa ser uma caixa que alguém LÊ.** A
      equipe de conformidade escreve para lá durante a análise e, "se não for
      possível entrar em contato com você, o Google poderá não continuar com sua
      inscrição". **Recomendação da casa: usar o Gmail do CEO, não um endereço
      `@diolidigital.com.br`** — em 07/08/2026 medimos por DNS público que o
      domínio `diolidigital.com.br` não tem MX nem TXT de verificação, então não
      há garantia de que e-mail enviado para ele chegue a alguém.
- [ ] **Se a Dioli já tem token**, reutilizar. Só pedir novo explicando o caso.

## Onde

`https://ads.google.com/aw/apicenter` → formulário de acesso à API → aceitar os
Termos e Condições.

## O texto — para o campo de descrição do caso de uso

> **Company name:** Dioli Digital
> **Company URL:** https://www.diolidigital.com.br
>
> **What we are building, in plain terms:** an internal management system for
> our own digital marketing agency. It consolidates, in a single internal
> dashboard, the performance of the advertising accounts of the clients who
> have contracted us and have explicitly authorised us to manage their
> accounts.
>
> **How we intend to use the API:**
>
> - **Read campaign, ad group and ad performance** (impressions, clicks, cost,
>   conversions) for the client accounts linked to our manager account, so our
>   team sees one consolidated view instead of logging into each account
>   separately.
> - **Read keyword and search term reports** to inform the recommendations we
>   present to each client.
> - **Generate the monthly performance reports** we deliver to our clients,
>   built from the same numbers the client sees in their own account.
>
> **Access model:** every client account we read is linked to our manager
> account by the client's own explicit authorisation. We do not access accounts
> we do not manage, and we do not resell API access or expose the API to third
> parties. The tool is used only by our own staff.
>
> **Pace:** our reporting runs on a schedule, a few times per day, at
> account level, using batched reporting queries rather than one request per
> object. We implement client-side rate limiting and back off on
> `RESOURCE_TEMPORARILY_EXHAUSTED`.

### ⚠️ A regra do texto: descrever o uso REAL, sem enfeite

A mesma do pedido da Upwork (`docs/plataformas/upwork/pedido-de-api.md`): nada
de *automação em massa*, *bot*, *criação automática de campanha*. **Não porque
sejam palavras feias — porque não é o que a gente vai fazer.** E o contrário
também vale: **se a descrição honesta for negada, a resposta é redesenhar o uso,
nunca maquiar o pedido.**

O texto acima descreve **LEITURA**. Está assim de propósito: nesta casa não há
uma linha de código que escreva no Google Ads, e nenhum parecer do especialista
`google` autorizando escrita. Pedir permissão para o que não se vai fazer é o
que produz o RMF e a auditoria.

## O que a resposta preenche

Quando o token chegar, ele entra como **variável de ambiente**
(`GOOGLE_ADS_DEVELOPER_TOKEN`) — nunca no repositório — e o **nível concedido**
(`explorador` | `conta_de_teste` | `basico` | `padrao`) vira dado declarado, do
mesmo jeito que o plano do 99Freelas. Motivo: o nível determina a cota diária, e
um sistema que não sabe o próprio teto o estoura.

## O que este pedido NÃO resolve

- **Não conecta nada sozinho.** Além do token, cada cliente precisa autorizar a
  agência na conta dele (vínculo com a conta de administrador) e o app precisa
  do escopo `https://www.googleapis.com/auth/adwords` **declarado na tela de
  consentimento** — que hoje só tem `openid email profile`, `drive.file` e
  `business.manage`.
- **Não muda o veredito sobre ESCRITA.** Ler é uma decisão; criar, pausar ou
  alterar campanha em conta de cliente é outra, e exige parecer próprio do
  especialista `google` antes de existir código.
