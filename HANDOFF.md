# HANDOFF — Integração Meta (Instagram / Facebook / WhatsApp)

> Documento de transferência. Escrito pelo agente responsável pela camada de
> integração com a Meta. Foca no que essa camada faz, nas decisões e nas
> armadilhas — inclusive coisas que **não estão escritas em nenhum outro lugar**.

- **Repositório:** `diolisantos10/dioli-agency-os-1`
- **Branch de desenvolvimento desta camada:** `claude/meta-integration-axrlf3`
- **Branch que o Railway realmente publica:** `claude/dioli-agency-os-architecture-kk7kp`
  (o deploy sai DAQUI, não da branch de dev — ver Armadilhas).
- **Última atualização:** 2026-07-26

---

## a) O que é o projeto e a stack REAL

Sistema operacional de uma agência de marketing (Next.js). A camada Meta pluga
nele para conectar contas, publicar, ler métricas, receber webhooks e enviar
WhatsApp.

Stack real (lida do `package.json`, não de memória):

- **Next.js `16.2.1`** (App Router) + **React `19.2.4`**. É Next 16 — há mudanças
  de API vs. versões anteriores. Ler `AGENTS.md` e `node_modules/next/dist/docs/`
  antes de codar.
- **Prisma `^7.8`** com **`@prisma/adapter-libsql`** — banco **SQLite** (via libsql).
  Cliente gerado em `lib/generated/prisma` (versionado no git).
- **Auth:** `jose` (JWT em cookie `dioli-session`), `bcryptjs`.
- **UI:** `@base-ui/react` + shadcn + Tailwind (v4, via `@tailwindcss/postcss`) +
  `tw-animate-css`; estado com `zustand`.
- **Testes:** `vitest` (`npm test`). **Playwright** para screenshots.
- **Build:** `npm run build` = `prisma generate && next build && cp -r .next/static
  .next/standalone/.next/static && cp -r public .next/standalone/public`.
- **Deploy:** Railway, automático a cada push na branch de deploy. Entrypoint
  `scripts/start.sh`.

### Onde vive a camada Meta (pastas "minhas")
- `lib/integrations/meta/*` — lógica (config, graph, oauth, discovery,
  connections, client=publicar/insights/whatsapp, templates, notifications,
  inbox, webhooks).
- `app/api/meta/*` — rotas: `config`, `connect`, `callback`, `connections`,
  `whatsapp`, `whatsapp/messages`, `templates`, `dispatch`, `webhooks`, `publish`.
- `components/agency/MetaConnectManager.tsx` — card na tela de Integrações.
- `app/agency/whatsapp/page.tsx` — caixa de entrada do WhatsApp.
- Interface pública (o "contrato" que Planner/Social Agent/motor chamam):
  `import { publishPost, getInsights, sendWhatsAppMessage } from "@/lib/integrations/meta"`.

### Modelos Prisma adicionados por esta camada
- `MetaConnection` — contas conectadas (IG/FB/WhatsApp) + token **criptografado**.
- `WhatsAppOutbox` — ledger anti-duplicado dos avisos (1 linha por ActivityEvent).
- `WhatsAppMessage` — histórico da caixa de entrada (in/out).
- As credenciais do App (App ID/Secret) NÃO têm modelo próprio: reusam
  `DbIntegrationConfig` com `integrationId = "int-meta"` (App Secret em
  `apiKeyEncrypted`, App ID em `accountId`).

---

## b) DECISÕES (com data e PORQUÊ)

- **2026-07-24 — Guardar credenciais no mesmo cofre das chaves de IA
  (`DbIntegrationConfig` + `lib/security/crypto`), não inventar tabela nova.**
  Porquê: o repo já tem um padrão de cofre (AES-256-GCM) usado pelas chaves de
  IA. Seguir o padrão = menos superfície de erro e o operador (não-técnico)
  já conhece a tela. Custo de desfazer: reescrever criptografia e UI.

- **2026-07-24 — Credenciais também resolvíveis por variável de ambiente
  (`resolveMetaAppCredentials`: DB → env).** Porquê: o dono não é técnico e quis
  "zero manual"; setar env no Railway (que eu consigo por API) evita depender de
  ele colar na UI. O DB continua tendo prioridade se alguém preferir a UI.

- **2026-07-24 — `redirect_uri` do OAuth montado a partir do host da requisição
  (não de env fixa).** Porquê: funciona igual em localhost, preview e produção
  sem variável extra. Espelha o fluxo Google que já existia no repo.

- **2026-07-25 — WhatsApp enviado com corpo JSON (`graphPostJson`), não
  form-encoded.** Porquê: a WhatsApp Cloud API rejeita `template.components`
  aninhado em form-url-encoded. O resto do Graph aceita form; o WhatsApp não.

- **2026-07-25 — Resolver o telefone do cliente pelo **token do portal** dentro
  do `portalPath` do evento, não pelo `businessName`.** Porquê: o produtor do
  evento (`app/api/admin/reset-request/route.ts`, feito por outro agente) NÃO
  manda `clientRequestId`. Mas manda `portalPath = /portal/access/<token>`, e
  `PortalAccess.token → clientRequestId → briefingJson.prospectPhone`. Assim a
  resolução é **determinística sem exigir mudança no produtor**.

- **2026-07-26 — "Um número só" para o cliente → construir uma caixa de entrada
  no sistema (`WhatsAppMessage` + webhook grava + `/agency/whatsapp` responde).**
  Porquê: decisão do dono. Ele quer que o cliente veja UM contato; então
  respostas manuais e avisos automáticos saem do mesmo número da API, e a
  conversa é lida/respondida dentro do sistema (não no app do celular).

- **2026-07-2x — Merge para a branch de deploy via fast-forward, verificando
  `merge-base --is-ancestor` antes de cada push.** Porquê: vários agentes
  escrevem na branch de deploy ao mesmo tempo; fast-forward só quando seguro
  evita sobrescrever o trabalho deles.

---

## c) O QUE FOI TENTADO E NÃO FUNCIONOU

- **Descobrir a WhatsApp Business Account (WABA) só com o App Access Token**
  (`GET /{app-id}/client_whatsapp_business_accounts` e `/whatsapp_business_accounts`)
  → erro `#100 nonexisting field`. Não dá para listar WABAs com token de app;
  precisa do WABA ID vindo do painel (tela "Configuração da API" do WhatsApp).

- **Confiar no exit code de `npm run build 2>&1 | tail -N`** → **enganoso**. O
  código de saída do pipeline é do `tail` (sempre 0), não do build. Um build que
  FALHOU aparece como "exit 0". Use `set -o pipefail` (ou rode o build sem pipe) e
  cheque se `.next/standalone/server.js` existe. Perdi tempo achando que estava
  verde quando não estava.

- **Buildar logo após um merge que trouxe dependências novas, sem reinstalar** →
  falhou com `Can't resolve 'tw-animate-css'`. O merge trouxe deps novas no
  `package.json` (shadcn), mas o `node_modules` local era anterior. Rodar
  `npm install` de novo resolve. (No Railway não acontece — lá o install é limpo.)

---

## d) O QUE FICOU ABERTO (com "o que quebra se ninguém mexer")

- **Template `proposta_pronta` PENDENTE de aprovação na Meta.**
  Se ninguém acompanhar: os avisos de proposta **não são enviados** (WhatsApp
  bloqueia mensagem proativa sem template aprovado). Ao aprovar, passa a funcionar.

- **Não há agendador chamando `/api/meta/dispatch`, e `CRON_SECRET` não está
  setado no Railway.** Se ninguém ligar isso: mesmo com template aprovado, o
  poll **nunca roda sozinho** e nenhum aviso sai. Ou setar `CRON_SECRET` + apontar
  um cron/uptime para a rota, OU chamar via sessão master manualmente. (O repo tem
  `.github/workflows/cron-*.yml` e `app/api/cron/*` de outra frente — não confirmado
  se cobrem esta rota; hoje **não** cobrem.)

- **Token do WhatsApp é o do NÚMERO DE TESTE e expira em ~24h.**
  Se ninguém trocar: o envio para de funcionar quando o token vence. Para valer,
  gerar um token permanente de System User e trocar `<credencial em variável de
  ambiente>`.

- **OAuth de IG/FB construído mas NÃO testado ponta a ponta.** Depende de o dono
  clicar "Conectar conta Meta" e de o app estar em modo dev / com as contas do
  próprio admin (App Review ainda não feito). Se ninguém testar: publicação em
  IG/FB continua não-verificada em produção.

- **App da Meta sem App Review / verificação de negócio.** Sem isso: só funciona
  com as contas do próprio admin e com limites baixos de WhatsApp; não atende
  contas de clientes em produção. Pendências do painel: ícone 1024×1024, URL de
  Política de Privacidade, Categoria.

- **Migração do número real da agência para a API.** Um número só pode estar no
  app WhatsApp OU na Cloud API (ver Armadilhas). A caixa de entrada já está
  pronta; falta plugar o número real (decisão do dono).

---

## e) ARMADILHAS deste repositório (parece certo e não é)

1. **Produção só aplica schema via `prisma migrate deploy` (`scripts/start.sh`).**
   Toda mudança de schema PRECISA de um arquivo de migração versionado em
   `prisma/migrations/`. Se você editar `schema.prisma` e só rodar `db push`, o
   build passa mas **produção quebra em runtime** (tabela/coluna não existe). Sempre
   `npx prisma migrate dev --name ...` e commitar a migração.

2. **A branch de deploy NÃO é a `main` nem a sua branch de dev.** O Railway
   publica de `claude/dioli-agency-os-architecture-kk7kp`. Commitar só na sua
   branch = nada vai ao ar. Faça merge (fast-forward quando possível) para a
   branch de deploy. Vários agentes escrevem nela — verifique antes.

3. **`CREDENTIALS_SECRET` NÃO está setado em produção (de propósito).** A cripto
   (`lib/security/crypto.ts`) cai num fallback derivado do `DATABASE_URL`. **Não
   basta setar `CREDENTIALS_SECRET` agora:** isso muda a chave e torna
   **indecifrável tudo que já foi criptografado** (chaves de IA, tokens Meta). Se
   for endurecer, tem que ser re-criptografando os segredos existentes, não só
   setando a env. (por isso não foi setado nesta frente.)

4. **Banco é SQLite num Volume do Railway (`/data`), sem `DATABASE_URL` explícito**
   (o `start.sh` monta sozinho a partir do volume). Postgres é **rejeitado** de
   propósito pelo `start.sh` (o adapter é libsql). Não "conserte" trocando por
   Postgres — quebra o boot.

5. **Webhook: verificar assinatura ANTES de parsear.** Em `app/api/meta/webhooks`,
   lê-se `request.text()` (corpo cru) e valida `X-Hub-Signature-256` com o App
   Secret ANTES de `JSON.parse`. Se alguém trocar por `request.json()` primeiro, a
   verificação de assinatura fica impossível (o corpo cru se perde). Ordem importa.

6. **WhatsApp: texto livre só dentro de 24h da última mensagem do cliente.** Fora
   disso, só template aprovado. O código faz as duas coisas, mas se você mandar
   texto livre proativo, a Meta rejeita — não é bug do código.

7. **Um número de telefone só existe no app WhatsApp Business OU na Cloud API,
   nunca nos dois.** Migrar o número real para a API o remove do app do celular.

8. **Next 16:** `context.params` em route handlers é **Promise** (`await`). Route
   handlers não são cacheados por padrão, mas confirme `export const dynamic =
   "force-dynamic"` em webhooks/dispatch (já está).

---

## f) O QUE EU SEI E NÃO ESTÁ ESCRITO EM LUGAR NENHUM

- **O produtor do evento de aviso é `app/api/admin/reset-request/route.ts`**
  (feito por outro agente, na branch de deploy), na ação "send-proposal". Ele
  emite `ActivityEvent` com `type="whatsapp_notify"` e
  `message = {kind:"proposal_sent", businessName, portalPath}`. **Não manda
  `clientRequestId`.** Meu consumidor (`lib/integrations/meta/notifications.ts`)
  depende do `portalPath` conter o token do portal. **Se alguém mudar esse
  formato (tirar o portalPath ou mudar o path), o telefone deixa de ser
  encontrado e nada é enviado — silenciosamente.** Há fallback por `clientId` e
  por `businessName`, mas o `businessName` é frágil (nomes repetidos).

- **A resolução de credenciais é sempre "DB (cofre) → env".** Hoje, em produção,
  está valendo o caminho **env** (variáveis `META_*` no Railway), não o cofre no
  banco. Quem for depurar "por que está pegando essa credencial" precisa saber
  que a env vence só quando não há linha no DB — e que os valores atuais foram
  postos via API do Railway, não pela UI.

- **Todo o WhatsApp hoje aponta para o NÚMERO DE TESTE da Meta**, cujas variáveis
  (`META_WHATSAPP_*`) estão no Railway. Número de teste **só envia para
  destinatários pré-cadastrados** no painel — não envia para qualquer cliente.
  Isso engana: o disparo "funciona" mas não chega em ninguém não-cadastrado.

- **A caixa de entrada resolve o workspace de uma mensagem recebida pelo
  `phone_number_id`; se não achar conexão no DB, cai no PRIMEIRO workspace.**
  Ok para uma agência só (o caso atual). Se um dia virar multi-tenant, isso
  entrega mensagens ao workspace errado — trocar por resolução explícita.

- **Verificação de build honesta:** rode `set -o pipefail`, cheque
  `.next/standalone/server.js`, e rode `npm test` (hoje ~109 testes). Não confie
  no verde de um `| tail`.

- **⚠️ SEGREDOS COLADOS NESTA CONVERSA — TROCAR (não estão neste doc):** durante a
  sessão, foram colados no chat: o **App Secret** da Meta, um **token de projeto
  do Railway** e o **token de acesso do WhatsApp** (número de teste). Eles estão
  guardados como `<credencial em variável de ambiente>` no Railway, mas como
  transitaram por texto, **recomendo forte regenerar os três** (o do WhatsApp
  expira sozinho em ~24h). Não estão reproduzidos aqui de propósito.

---

## Como rodar / verificar (rápido)

```sh
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'JWT_SECRET=dev-secret-local-only' >> .env
npx prisma migrate deploy        # aplica migrações (NÃO use db push em prod)
npm install                      # reinstale após merges que mudam package.json
npm run build                    # verifique .next/standalone/server.js
npm test                         # ~109 testes
```

Endpoints úteis (todos exigem sessão master, exceto webhook/dispatch por segredo):
`/api/meta/config`, `/api/meta/connect`, `/api/meta/whatsapp`,
`/api/meta/whatsapp/messages`, `/api/meta/templates`, `/api/meta/dispatch`,
`/api/meta/webhooks`, e a tela `/agency/whatsapp`.
