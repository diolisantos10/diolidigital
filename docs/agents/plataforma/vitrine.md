# Vitrine — plataforma

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## `params` de rota de API é uma Promise e precisa de `await`

Next.js **16.2.1** tem breaking changes em relação ao que a maioria dos modelos
aprendeu. O caso que mais morde: em rotas de API, `params` **não é mais um objeto
síncrono** — é uma `Promise`.

O padrão correto está em `app/api/projects/[id]/marketing/route.ts`. Copie de lá.

Antes de escrever qualquer rota nova, leia o guia em `node_modules/next/dist/docs/`.
O `AGENTS.md` avisa isso na primeira linha do repositório por este motivo.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §0 e §5.5 (commit `3f888f1`)

---

## A chave de IA da tela é a fonte de verdade, não a variável de ambiente

O PM/orchestrator resolve a chave via `lib/ai/resolve-key.ts`, a partir do que o
usuário configurou em `AiKeyManager.tsx`. **Não de env hardcoded.**

Isso existe porque houve um furo real: a chave era salva na tela e o orquestrador
continuava lendo do ambiente — o usuário configurava e nada acontecia, sem
mensagem de erro.

Vale para todo provedor, inclusive o DeepSeek.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §4.4 (commit `3f888f1`)

---

## ⚠️ O proxy deste ambiente intercepta TLS — não confie no erro de certificado

Ao diagnosticar HTTPS **de dentro de um ambiente de agente**, `curl` e `openssl`
**enganam**: o certificado observado tem issuer *"Anthropic Egress Gateway"*,
porque o proxy de saída intercepta o TLS. Um erro de certificado aqui **não prova
nada** sobre o mundo real.

**O sinal confiável** é a comparação: se o `www` responde perfeito pelo mesmo
proxy e só o apex falha, o problema é emissão de certificado pendente — não
configuração. Confirme pelos headers `x-railway` e por DNS-over-HTTPS
(`cloudflare-dns.com/dns-query`), não pelo cadeado local.

Verificação de verdade se faz de uma máquina sem o proxy.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §7.1 (commit `3f888f1`)

---

## Produção só aplica schema por `prisma migrate deploy` — `db push` quebra em runtime

`scripts/start.sh` roda `prisma migrate deploy`. Toda mudança de schema **precisa**
de um arquivo versionado em `prisma/migrations/`.

Editar `schema.prisma` e rodar só `db push` faz **o build passar e a produção
quebrar em runtime** — tabela ou coluna que não existe, com o erro aparecendo longe
da causa. Sempre `npx prisma migrate dev --name ...` e commite a migração.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.1 (commit `7116cbb`)

---

## ⚠️ NÃO sete `CREDENTIALS_SECRET` agora — isso torna o cofre indecifrável

A variável **não está setada em produção, de propósito**.
`lib/security/crypto.ts` cai num fallback derivado do `DATABASE_URL`.

Setá-la agora **muda a chave** e torna indecifrável **tudo que já foi
criptografado** — chaves de IA e tokens da Meta inclusive. Parece endurecimento de
segurança e é perda de dado.

Se for endurecer: **re-criptografar os segredos existentes** na mesma operação,
nunca só setar a env.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.3 (commit `7116cbb`)

---

## O banco é SQLite num volume do Railway — Postgres é rejeitado de propósito

`start.sh` monta o `DATABASE_URL` sozinho a partir do volume em `/data` e
**rejeita Postgres** deliberadamente: o adapter é libsql.

Não "conserte" trocando por Postgres — quebra o boot.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.4 (commit `7116cbb`)

---

## Webhook: verificar a assinatura ANTES de parsear. A ordem é o mecanismo.

Em `app/api/meta/webhooks`, lê-se `request.text()` (corpo cru) e valida
`X-Hub-Signature-256` com o App Secret **antes** de qualquer `JSON.parse`.

Trocar por `request.json()` primeiro **destrói o corpo cru** e torna a verificação
de assinatura impossível — o endpoint passa a aceitar evento forjado. Parece
refatoração inocente e é a remoção da única trava de autenticidade do webhook.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.5 (commit `7116cbb`)

---

## Regras do WhatsApp que parecem bug e não são

- **Texto livre só dentro de 24h** da última mensagem do cliente. Fora disso, só
  template aprovado. Envio proativo de texto livre rejeitado **não é bug do
  código** — é a regra da Meta.
- **Um número existe no app WhatsApp Business OU na Cloud API, nunca nos dois.**
  Migrar o número real para a API **o remove do celular**. É decisão do dono.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.6 e §e.7 (commit `7116cbb`)

---

## O aviso de proposta depende do `portalPath` — e falha em silêncio

O produtor do evento é `app/api/admin/reset-request/route.ts`, ação
`send-proposal`: emite `ActivityEvent` com `type="whatsapp_notify"` e
`message = {kind:"proposal_sent", businessName, portalPath}` — **sem
`clientRequestId`**.

O consumidor (`lib/integrations/meta/notifications.ts`) depende de o `portalPath`
conter o token do portal para achar o telefone. **Mudar esse formato faz o telefone
deixar de ser encontrado e nada ser enviado — sem erro, sem log, sem nada.**

Há fallback por `clientId` e por `businessName`, mas `businessName` é frágil:
nomes repetidos colidem.

**É um acoplamento entre duas frentes escritas por agentes diferentes.** Quem mexer
num lado precisa saber do outro.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §f (commit `7116cbb`)

---

## Credencial resolve cofre → env, e hoje quem vence é a env

A ordem é: procura no cofre do banco; **não achando, cai na variável de ambiente**.

Hoje, em produção, vale o caminho **env** (`META_*` no Railway) — e os valores
foram postos pela **API do Railway**, não pela UI. Quem for depurar "por que está
pegando essa credencial" precisa saber que a env só vence quando não há linha no
banco.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §f (commit `7116cbb`)

---

## A caixa de entrada cai no PRIMEIRO workspace quando não acha a conexão

Mensagem recebida resolve o workspace pelo `phone_number_id`. Não achando conexão
no banco, **cai no primeiro workspace**.

Está ok enquanto houver uma agência só — o caso de hoje. **No dia em que virar
multi-tenant, entrega mensagem de um cliente no workspace errado.** Trocar por
resolução explícita antes de vender para o segundo.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §f (commit `7116cbb`)
