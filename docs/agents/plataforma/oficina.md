# Oficina — plataforma

> Registro de trabalho do especialista de plataforma. O que foi mexido, por quê,
> e o que ficou aberto. Quem promove para a vitrine é o Diretor.

---

## 2026-08-05 · madrugada — Trilha A do raio-x de plataforma, 17 itens

Território: `lib/auth/`, `lib/security/`, `lib/db/`, `prisma/`, `scripts/`,
rotas de `app/api/{auth,generate-image,cron,meta,admin,ai-keys,self-serve}`,
`.github/workflows/`. Sete outras frentes trabalhavam na mesma árvore — a
verificação final foi feita num worktree limpo do HEAD com **só** as minhas
mudanças aplicadas.

### 1. Elevação de privilégio no login — o default era master

`isAgencyRole()` (`lib/auth/session.ts:69`) era uma **cópia à mão** da lista de
papéis, com cinco entradas, e omitia `executivo_comercial`. O login fazia
`isAgencyRole(user.role) ? user.role : "master"`.

Papel não reconhecido virava **master** — e não só o comercial: **todo papel
novo** acrescentado em `roles.ts` e esquecido aqui nasceria master no ato do
login, com acesso a `/api/admin/reset`, `/api/ai-keys`, `/api/meta/config` (App
Secret) e `/api/backup`.

- `isAgencyRole` agora deriva de `ROLE_PERMISSIONS`, o mapa que o TypeScript
  **obriga** a ter uma entrada por `AgencyRole`. Não há mais duas listas para
  manter em sincronia. (`lib/auth/session.ts:69-85`)
- O fallback virou **negação**: papel desconhecido → 403, nenhuma sessão criada,
  log com o papel e o id. (`app/api/auth/signin/route.ts:75-88`)

### 2. `/api/generate-image` — geração paga, pública, em qualidade alta

`getSession()` era chamado só para escolher a chave; sessão ausente não
bloqueava nada. Teto de 10/min por IP, em memória, zerado a cada restart.
14.400 imagens/dia por IP a ~US$0,17–0,25 = **US$2.500–3.500/dia por IP**.

- Exige sessão de **agência**; sessão de portal (com `clientId`) é barrada — o
  cliente não decide gastar a chave da agência. (`app/api/generate-image/route.ts:31-46`)
- **O teste derrubou a minha primeira versão**: eu havia usado `userId:ip` como
  chave do balde, e trocar de IP dava balde novo ao mesmo usuário — a mesma
  falha do balde por IP. A chave agora é só o `userId`.
- Qualidade `high` mantida: não há mais caminho público, e o único consumidor é
  a tela `/agency/design-agent`, onde a peça vai para o cliente.

### 3. `/api/auth/signin` — sem teto e com oráculo de enumeração

Sem `rateLimited()`; e a resposta saía **antes** do `bcrypt.compare` quando o
e-mail não existia — a diferença de tempo dizia quais contas existem.
`master@dioli.studio` está no seed e no log de boot.

- `compare` roda **sempre**, contra um hash-fantasma de custo 12 quando não há
  usuário. (`app/api/auth/signin/route.ts:8-20,68-73`)
- Teto em duas dimensões: 10/5min por IP (um atacante) e 5/5min por e-mail
  (muitos IPs contra a mesma conta).

### 4. `/api/meta/publish` — publicava no Instagram do cliente sem papel

Só `getSession()`: `design_staff`, `ads_staff` e até uma **sessão de portal**
publicavam conteúdo arbitrário na conta real do cliente.

- `requireSession(["master","project_manager","social_staff"])`, portal barrado
  explicitamente, e teto de 6/min por usuário — rajada na Graph é o que
  restringe conta de app. (`app/api/meta/publish/route.ts:14-38`)

### 5. Índices — o melhor retorno por linha

Migration **aditiva** com 14 índices:
`prisma/migrations/20260805200000_indices_do_despertador_e_do_webhook/`.

Medido com `EXPLAIN QUERY PLAN`, antes e depois, num banco construído pelas
migrations — **SCAN → SEARCH em todas as nove consultas quentes**:

| Consulta | Antes | Depois |
|---|---|---|
| despertador, a cada 5 min (`Project`) | `SCAN` | `MULTI-INDEX OR` + `SEARCH` |
| webhook de WhatsApp (`MetaConnection`) | `SCAN` | `SEARCH … platform_externalId` |
| guardião de verba (`AdCampaign`) | `SCAN` | `SEARCH … status` |
| disparo de WhatsApp (`ActivityEvent`) | `SCAN` | `SEARCH … type_timestamp` |
| clientes, tarefas, portal, log de IA | `SCAN` | `SEARCH` |

Dois casos eram **coluna líder errada**, não índice ausente: `AdCampaign` tinha
`[workspaceId, status]` e o guardião busca só por `status`; `MetaConnection`
tinha `@@unique([workspaceId, platform, externalId])` e o webhook busca por
`{platform, externalId}` — sem workspace, porque é o workspace que ele está
descobrindo.

**Um item do relatório estava errado e não foi executado:** `Deliverable.projectId`
já é coberto pelo prefixo de `@@index([projectId, cycleId])`. Índice composto
serve a partir da esquerda. Criar um duplicado seria custo de escrita sem ganho
— e o teste registra a prova disso.

### 6. `fazerBackup()` antes do `migrate deploy`

Cinco migrations reconstroem tabela; uma reconstrói quatro de uma vez,
incluindo `SocialPost` e `Deliverable`. O retry anti-lock do `start.sh` prova
que a interrupção **já acontece**.

- `scripts/backup-antes-da-migration.mjs`: `VACUUM INTO` + `integrity_check` +
  contagem das tabelas essenciais; cópia ruim é apagada e o processo sai com
  erro (com `set -e`, **derruba o boot** — de propósito).
- Roda **só quando há migration pendente** (`prisma migrate status` sai 0 quando
  não há). Sem cirurgia marcada, não se faz pré-operatório. (`scripts/start.sh:88-107`)
- Vive em `backups/pre-migration/`, pasta **separada** da rotina diária: a
  rotina lista `backups/*.db` e assume ordem alfabética = cronológica.
- É `.mjs` e duplica ~40 linhas de `lib/agency/backup.ts` porque `start.sh` roda
  antes do app, com devDependencies possivelmente podadas — não há `tsx`
  garantido. Duplicação consciente, anotada nos dois lados.
- Escape declarado: `PULAR_BACKUP_PRE_MIGRATION=1`.

### 7. Segredos em tempo constante — 6 pontos

`segredoConfere()` em `lib/security/crypto.ts:12-38`: compara o SHA-256 dos dois
lados com `timingSafeEqual` (digest sempre com 32 bytes, então não há saída
antecipada por diferença de comprimento). Lado vazio **nunca** confere.

Aplicado em `cron/radar`, `cron/radar/digest`, `cron/training/sdr`,
`meta/dispatch`, `admin/reset-request` e no verify token do `meta/webhooks`.
(`cron/execute` é de outra frente — não tocado.)

### 8. `CREDENTIALS_SECRET` — a decisão de peso

Ver a seção "A decisão" abaixo.

### 9–17, os menores

- **Fail-open no pagamento** (`self-serve/webhook`): sem
  `MERCADOPAGO_WEBHOOK_SECRET` a assinatura **não era verificada** e qualquer um
  marcava um pedido como pago. Agora é **fail-closed** com erro alto no log.
- **`META_WEBHOOK_VERIFY_TOKEN`** perdeu o default `"dioli-meta-webhook"`
  publicado no repositório. Sem env → `null` → desafio recusado (403).
- **Erro cru do provedor**: `sanitizarMensagemDeProvedor()` corta `sk-`,
  `AIza`, `pplx-` e qualquer sequência ≥40 chars antes de persistir. `GET
  /api/ai-keys` só devolve `lastTestMessage` para **master** (o `configured`
  segue visível — a tela de Operações depende dele). `POST /api/ai-keys/test`
  agora exige **master**: ele dispara chamada paga.
- **`DATABASE_URL` no log**: mascarada em `scripts/diagnose-railway-env.ts` e
  em `start.sh`. Com Turso ela carrega `?authToken=<credencial do banco>`, e
  esse diagnóstico existe para ser colado num chat.
- **`JSON.parse` nu**: `parseArtifactCanvas` devolve `null`;
  `training-store-service` ganhou `lerJson(texto, padrao)`. Padrão é sempre
  vazio/nulo — dado ruim aparece como **ausente**, nunca como algo inventado.
- **Seed reescrevendo a senha do master**: **já estava consertado** por outra
  frente. `seed-db.mjs` só faz `UPDATE` quando `SEED_MASTER_PASSWORD` está no
  ambiente; sem ela, gera senha aleatória por boot e o `INSERT OR IGNORE` não
  toca usuário existente. Nada a fazer.
- **Singleton do Prisma**: agora cacheado **também em produção**
  (`lib/db/client.ts:19-37`). Cada avaliação do módulo abria mais uma conexão
  libsql para o mesmo arquivo — mais gente disputando o **mesmo lock** do item 5.
- **`resolvePortalAccess()` apagada.** Zero chamadores, e devolvia o texto
  recebido do visitante como `clientId` **autorizado** quando o token não batia.
  O caminho vivo é `validatePortalAccess` em `portal-access-service.ts`.
- **`cat /tmp/out.json` nos workflows**: trocado por extração com `jq` de
  status e contagens. Log de CI fica 90 dias e é colado em issue.

### A decisão — `CREDENTIALS_SECRET` (item 8)

**Não defini a variável, e não re-cifrei nada.** O que fiz foi remover a
armadilha que impedia defini-la.

O problema real: sem `CREDENTIALS_SECRET`, a chave AES vem do `DATABASE_URL`
(scrypt, salt constante e público no arquivo) — e `start.sh:31-33` auto-deriva
a `DATABASE_URL` do caminho do volume, produzindo `file:/data/dioli.db`, uma
string adivinhável. Os 14 backups ficam **no mesmo volume**.

Por que "exigir a variável e falhar alto", como `lib/auth/secret.ts`, seria
**errado aqui**: aquela chave *assina*; esta *cifra*. Defini-la trocava a chave
e tornava indecifrável tudo que já estava no cofre — chaves de IA, App Secret e
todos os tokens de longa duração dos clientes. É o que a vitrine desta casa já
registra: *"NÃO sete CREDENTIALS_SECRET agora"*.

O conserto foi **leitura com duas chaves** (`lib/security/crypto.ts:79-190`):

- escrita usa **sempre** a chave nova, quando `CREDENTIALS_SECRET` existe;
- leitura tenta a nova e, não abrindo, tenta a **legada**;
- `estadoDaChaveDeCredenciais()` diz ao painel a verdade em vez de um "ok";
- `cifradoComChaveLegada(texto)` responde quais segredos ainda dependem da chave
  fraca — a peça que uma varredura de re-cifragem vai precisar;
- a constante `"...change-me"` saiu do caminho de produção: sem material
  nenhum, **lança** em vez de cifrar com uma senha publicada no repositório.

**Resultado prático: definir `CREDENTIALS_SECRET` passou a ser seguro.** O boot
atual não muda em nada — sem a variável, tudo continua exatamente como estava.

**O que NÃO fiz, e precisa de decisão do CEO:** a varredura de re-cifragem.
Enquanto ela não rodar, um segredo nunca reescrito continua protegido pela chave
fraca. Isso mexe em dado de produção e não é decisão de um deploy. A vitrine
precisa ser **atualizada** quando isso for resolvido — hoje ela diz "não sete",
e a razão para não setar deixou de existir.

### Verificação

- Typecheck limpo (os erros em `lib/agency/radar/radar-agent.ts` são de outra
  frente, presentes na árvore antes de eu começar).
- Suíte inteira num **worktree limpo do HEAD `9ead262` com só as minhas
  mudanças**: **1454 passando, 91 novos**. A única falha
  (`__tests__/media/video.test.ts`, temporário do ffmpeg) é **pré-existente** —
  o HEAD limpo falha nela igual, e o arquivo passa sozinho: é interferência de
  `tmpdir` entre arquivos em paralelo, fora do meu território.
- 8 arquivos de teste novos em `__tests__/plataforma/`, todos com **as duas
  metades**: quem não tem direito é barrado **antes de qualquer efeito**, quem
  tem passa sem atrito.

### O que ficou aberto

1. **Varredura de re-cifragem** dos segredos presos à chave legada — decisão do
   CEO (acima).
2. **Backup fora do volume.** As cópias — diárias e pré-migration — ficam no
   mesmo disco do banco. Protege de erro de software; **não** protege de perda
   do volume.
3. **O balde de teto é por processo.** Contém força bruta e loop de tela; não
   contém ataque distribuído, e todo deploy zera. No dia em que houver réplica,
   precisa virar contador compartilhado antes de ser chamado de proteção.
4. **Trilha B do raio-x** — o que não era pequeno — não foi tocada.
