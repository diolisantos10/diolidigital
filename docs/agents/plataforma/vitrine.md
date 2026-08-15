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

## ✅ `CREDENTIALS_SECRET` **JÁ ESTÁ SETADA** em produção, e setá-la foi seguro

> **Esta entrada dizia o contrário até 15/08/2026** — *"NÃO sete
> `CREDENTIALS_SECRET` agora — isso torna o cofre indecifrável"*. Aquilo deixou de
> ser verdade quando a leitura com duas chaves entrou em `lib/security/crypto.ts`,
> e a variável foi definida depois disso. **Ficou meses afirmando um perigo que já
> não existia**, e quem a lesse hoje concluiria que o cofre da produção foi
> destruído — e poderia tentar "consertar" removendo a variável, que é o único
> gesto capaz de causar o dano que a entrada descrevia.

**O estado de hoje, medido:** `CREDENTIALS_SECRET` **definida** no serviço do
Railway. Nenhum segredo se perdeu.

**Por que setá-la foi seguro** — `lib/security/crypto.ts` lê com **duas chaves**:

- **escrita** → sempre a chave nova (`CREDENTIALS_SECRET`), quando ela existe;
- **leitura** → tenta a nova; não abrindo, tenta a **legada** (derivada do
  `DATABASE_URL`). O GCM autentica, então chave errada não "quase abre": ela falha
  na verificação do `authTag`. A tentativa extra não enfraquece nada.

**A prova de que a chave legada continua reconstruível** (é ela que abre o que foi
cifrado antes): `DATABASE_URL` **não é variável do serviço** — `scripts/start.sh`
a auto-deriva do caminho do volume, e o log do deploy de 15/08/2026 imprime
`file:/data/dioli.db`, **exatamente a string que o teste simula**.
`__tests__/plataforma/cofre-de-credenciais.test.ts` roda **11/11 verde** no commit
no ar, com as duas metades: cifrado-antes continua abrindo depois de a variável
existir · trocar a chave nova por outra **não** faz o cofre abrir com chave errada.

### 🔴 O que continua ABERTO — e é o buraco real

**Segredo nunca reescrito desde então continua cifrado com a chave FRACA.** A
chave legada é `file:/data/dioli.db`, uma string adivinhável, e os backups moram
**no mesmo volume**: quem obtiver um arquivo de backup reconstrói a chave em
segundos. A migração acontece sozinha, mas só **no ritmo de cada segredo
reescrito** — um token que ninguém regravar fica preso à chave fraca para sempre.

- **Quantos ainda dependem da chave fraca:** pergunte ao instrumento —
  `GET /api/admin/censo-do-cofre` (`Authorization: Bearer <CRON_SECRET>`), sobre
  `lib/security/censo-do-cofre.ts`. Somente leitura, **não devolve o valor de
  segredo nenhum**.
- **A re-cifragem em massa NÃO existe, e é decisão do CEO** — ela reescreve dado
  de produção. Nunca foi construída de propósito.

⚠️ **O que NÃO fazer:** remover `CREDENTIALS_SECRET` do Railway. Enquanto todo
segredo estiver duplamente legível isso é inócuo; **depois de qualquer re-cifragem
é destruição de dado** — a chave legada não abre o que nasceu com a nova.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §e.3 (commit `7116cbb`)
— **corrigido em 2026-08-15 pelo PM** · origem: leitura do Railway e do log do
deploy vivo pelo Diretor + `lib/security/crypto.ts:21-31`

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

---

## "Deploy Crashed" no Railway é quase sempre FALSO POSITIVO

Os e-mails de deploy quebrado vêm de **SIGTERM no container antigo durante a troca
de deploy** — churn normal de vários agentes publicando na mesma branch.

**Não persiga OOM.** Foi investigado: a memória estava tranquila, pico de ~193 MB.
A causa real, quando havia crash de verdade, era a **corrida pelo lock do SQLite no
volume** com dois deploys simultâneos — o `set -e` matava o container. O
`start.sh` agora tem **retry no `prisma migrate deploy`** e sobrevive ao lock.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §B7 e §C (commit `465cf05`)

---

## "IA indisponível" era blip transitório — não truncamento nem rate-limit

Diagnóstico refutado por teste: a geração funciona a 1800 tokens, e 12 chamadas
Claude concorrentes passaram todas.

Era **soluço momentâneo da API**. Por isso `lib/ai/generate.ts` re-tenta erro
transitório (429/5xx/529/timeout) até 3 vezes com backoff; erro permanente passa
direto.

**Não assuma truncamento ou rate-limit sem testar.** E `run-execution.ts` engolia o
erro real da IA como "IA indisponível" — hoje loga o erro de verdade. **Se
reverterem isso, diagnosticar falha volta a custar uma hora.**

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §B6, §C e §E6 (commit `465cf05`)

---

## As chaves de IA NÃO são variáveis de ambiente

Ficam **criptografadas no banco** (`DbIntegrationConfig.apiKeyEncrypted`), setadas
pela tela de Integrações. `lib/ai/resolve-key.ts` checa o banco primeiro, o
ambiente depois.

**Um Railway sem env de IA NÃO significa "sem IA".** Confira a tela de Integrações
antes de concluir que falta chave.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §F2 (commit `465cf05`)

---

## O seed roda em TODO boot — e rotaciona senha se a env estiver setada

Faz `INSERT OR IGNORE` (não toca usuário existente), mas **rotaciona a senha do
master/staff sempre que `SEED_MASTER_PASSWORD` ou `SEED_STAFF_PASSWORD` estiverem
no ambiente**.

Para resetar a senha do master: setar a variável e re-deployar. **Deixá-la setada
depois disso rotaciona a senha em todo deploy** — remova após usar.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §E3 (commit `465cf05`)

---

## `currentRole` (o "Visualizar como") ≠ papel da sessão

`currentRole` é o seletor do Zustand para simular papéis. **Não é o papel real.**

Ação de admin gateada em `currentRole` **desaparece para um master de verdade** se
o papel simulado não for "master". O botão de excluir projeto já foi desamarrado
disso; **ainda existe em outros lugares**.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §E4 (commit `465cf05`)

---

## Vários agentes escrevem na MESMA branch — sempre `fetch` + `rebase` antes do push

O sistema é construído por **várias sessões Claude em paralelo**, todas commitando
em `claude/dioli-agency-os-architecture-kk7kp`. As fronteiras aproximadas:

| Sessão | Território |
|---|---|
| **chat da agência** | proposta, negociação pós-briefing, gatilhos de execução, `portal-data`, portão de recursos |
| **Brain-mestre** | `lib/dioli-brain/*`, refactor do `run-execution`, PM conductor, quality auditor, Radar, esteira, DeepSeek |
| **design/UX** | telas do cliente, portal, tokenização |
| **Meta** | `app/api/meta/*` e `lib/integrations/meta/*` — **já mergeado nesta branch** |

**Só um agente deve mexer no mesmo arquivo por vez.** Isso explica o churn de
deploys e por que o `git fetch` + `rebase` antes do push não é opcional aqui.

*Não confirmado:* os limites exatos de cada sessão — inferidos pelos commits.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §F1 e §E7 (commit `465cf05`)

---

## `/api/projects/[id]/execution` lê o ESCOPO, não o PRODUZIDO

A rota lê `BrainArtifact` (o escopo), não `Deliverable` (o que foi produzido). Os
deliverables foram **anexados ali de propósito** para dar visibilidade.

**Se alguém "limpar" isso achando que é duplicação, o trabalho dos agentes some da
tela de execução de novo.**

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §E5 (commit `465cf05`)
