# Varredura de posse — rodada 2, lote B — 29/08/2026

> Continuação de `docs/diagnosticos/varredura-de-posse-no-corpo-29-08.md`, que
> examinou 45 arquivos de um universo de 152 `route.ts` levantado por grep e
> deixou 143 rotas não citadas. Uma triagem mecânica (id no corpo/query + uso
> de id) reduziu o universo a 46 candidatas, divididas em dois lotes de 23.
> Este documento é o **lote B**, listado em `docs/diagnosticos/varredura-de-posse-29-08/lote-B.txt`.
>
> **Custo: zero.** Nada em produção, nenhuma chamada de IA real, nenhum e-mail.

## O método

Os 23 arquivos foram **lidos inteiros** (não só a linha do grep da triagem),
porque o veredito depende do que acontece ANTES da consulta — há posse
conferida cedo? o id já chega derivado de um token/sessão verificada? o
`where` já é composto? Onde a rota chamava uma função de biblioteca com o id,
a função também foi lida, e — quando a biblioteca tocava outra rota (portal)
que lê a mesma tabela — essa segunda rota também foi lida, para confirmar que
o par `(workspaceId, clientId)` é conferido em TODOS os lugares que leem o
dado, não só onde ele nasce.

### Os comandos que rodei, colados literalmente

```sh
# A lista das 23 rotas do lote (já vem da triagem da rodada 2, não recalculada)
cat docs/diagnosticos/varredura-de-posse-29-08/lote-B.txt

# Para cada função de biblioteca chamada por uma rota do lote, achar a
# implementação e ler por dentro (exemplos reais desta rodada):
grep -n "export async function materialRecebido" -A 20 lib/agency/esteira/materiais.ts
grep -n "export async function responderPergunta" -A 40 lib/agency/esteira/porta-da-pergunta.ts
grep -n "export async function deleteConnection" -A 6 lib/integrations/meta/connections.ts

# Para cada tabela envolvida (MetaConnection, ExecucaoV2), achar TODO OUTRO
# lugar do repositório que a lê — é aqui que mora o "vaza para onde depois",
# não só "esta rota confere direito".
grep -rln "metaConnection.find" app lib --include=*.ts | grep -v node_modules
grep -n "model ExecucaoV2" -A 25 prisma/schema.prisma
grep -n "model RecusaV2" -A 15 prisma/schema.prisma

# Confirmar se o mesmo padrão (id sem workspace na segunda consulta) se repete
# em outros três candidatos óbvios do lote:
grep -n "clientRequestDb.findFirst\|clientRequestDb.findUnique\|clientRequestDb.findMany" \
  app/api/portal/pedidos/orcamento/route.ts app/api/portal/vista/route.ts app/api/sdr/chat/route.ts
```

---

## 🔴 O furo — FECHADO: `loadClientContext` lia o briefing do cliente do vizinho

**Onde:** `app/api/social-posts/generate/route.ts` (agora extraída para
`lib/agency/social-posts/contexto-do-cliente.ts` — motivo abaixo).

**O que fazia:** a função monta o contexto que vira PROMPT da IA (legenda,
ideias de calendário ou roteiro de vídeo) a partir dos dados reais do
cliente. Ela rodava DUAS consultas em paralelo:

```ts
const [client, request] = await Promise.all([
  prisma.client.findFirst({ where: { id: clientId, workspaceId }, ... }),
  prisma.clientRequestDb.findFirst({ where: { clientId }, ... }), // ⚠️ sem workspaceId
]);
if (!client && !request) return null;
```

A busca do `Client` conferia o workspace corretamente. A busca do
`ClientRequestDb` (o **briefing**: nome do negócio, segmento, público-alvo,
serviços contratados, objetivos) **não levava `workspaceId` nenhum** — filtrava
só por `clientId`. Com um `clientId` de outro inquilino, `client` voltava
`null` (barrado, certo) mas `request` vinha preenchido com o briefing ALHEIO,
e `!client && !request` deixava passar porque bastava um dos dois existir.

**O que um vizinho de inquilino alcançava:** qualquer sessão `master`,
`project_manager` ou `social_staff` de QUALQUER workspace, chamando
`POST /api/social-posts/generate` com um `clientId` de outra agência (por
enumeração ou por tê-lo visto em algum outro lugar), recebia de volta uma
legenda, um lote de ideias de calendário ou um roteiro de vídeo **grounded no
briefing real daquele cliente alheio** — nome do negócio, segmento, público-
alvo, serviços contratados e objetivos, todos usados para montar o prompt e
influenciar o texto que a IA devolvia. Não é o briefing bruto na tela, mas é
leitura de conteúdo interno de outro inquilino sem erro nenhum — e o mesmo
texto (`businessName`) vaza de forma ainda mais direta quando o modelo o cita
na peça gerada.

### O conserto

1. As duas consultas deixaram de rodar em paralelo. A busca do `ClientRequestDb`
   só acontece **depois** de confirmar `client` (isto é, depois de provar que
   `clientId` é deste workspace) — `Client.workspaceId` é obrigatório, então
   achar o `client` já é a prova. Sem essa prova, a segunda consulta nem roda.
2. **A função saiu de `route.ts` e foi para
   `lib/agency/social-posts/contexto-do-cliente.ts`.** Não é só arrumação:
   `route.ts` é um arquivo de rota do Next, e o plugin de tipos do framework
   reprova no **BUILD** qualquer export que não seja um dos reconhecidos
   (`GET`/`POST`/…, `dynamic`, etc.) — um `export function loadClientContext`
   ali passaria limpo em `tsc --noEmit` e em `npm test`, e só quebraria em
   `next build`. É a mesma armadilha documentada no cabeçalho de
   `lib/agency/comercial/prompt-do-sdr.ts`, e o critério de aceite desta ficha
   roda os três portões (`tsc`, `vitest`, `npm run build`) — então a função
   teve de sair de lá para poder ser testada de verdade.

### O teste que mata o conserto se ele for revertido

`__tests__/seguranca/o-contexto-do-cliente-do-vizinho.test.ts` (novo). Prova
as duas metades: com um `clientId` de outro workspace, o vizinho recebe `null`
e a segunda consulta (`clientRequestDb.findFirst`) **nunca é chamada**
(mesmo com o registro existindo no banco dublado); o dono legítimo continua
recebendo o próprio contexto — nome, segmento, serviços e objetivos —
normalmente.

---

## A tabela completa — as 23 linhas do lote

Legenda de origem: **C** = corpo (JSON), **Q** = query string, **P** = path
(`[id]`), **T** = token de portal (derivado, nunca comparado), **S** = sessão
(sem id externo relevante).

| Rota | id que recebe | de onde | confere posse? | veredito |
|---|---|---|---|---|
| `app/api/financeiro/route.ts` | `clientId`, `projectId` (POST) | C | não confere antes de gravar, mas só RÓTULA a própria linha (a linha em si já nasce com `workspaceId: session.workspaceId`); nenhuma leitura da casa busca `LancamentoFinanceiro` só por `clientId` sem `workspaceId` — não há caminho de leitura alheia | limpo (observação: rotular com `clientId` de outro workspace é possível e não é conferido; não é vazamento hoje porque não há leitor que confie só no `clientId`) |
| `app/api/integration-configs/route.ts` | `integrationId`, `accountId` (PUT) | C | sim — chave composta `workspaceId_integrationId` no `where` do upsert | limpo |
| `app/api/material-requests/[id]/route.ts` | `id` (path) | P | sim — `findFirst({ where: { id, project: { workspaceId } } })` antes de qualquer escrita; `materialRecebido(id)` reusa o MESMO id já verificado | limpo |
| `app/api/media/[id]/route.ts` | `id` (path) | P | sim — busca sem escopo, mas a resposta só sai depois de comparar contra assinatura, token de portal (`clientId`/`clientRequestId`) ou `session.workspaceId === registro.workspaceId`; nunca deriva uma segunda consulta do dado achado | limpo — trava correta, não mexer |
| `app/api/meta/config/route.ts` | `appId` (POST, texto livre, não é id de recurso) | C | sim — upsert por chave composta `workspaceId_integrationId` | limpo |
| `app/api/meta/connect/route.ts` | `clientId` (Q) | Q | não grava nada nesta rota — o `clientId` só vai para um cookie httpOnly de 10 min, lido pelo `/api/meta/callback` (fora deste lote e fora de `lib/integrations/meta/`, que é frente restrita) | limpo (dentro do arquivo desta rota; a gravação real acontece no callback, não examinado aqui) |
| `app/api/meta/token/route.ts` | `clientId` (C) | C | não confere antes de gravar a `MetaConnection`, mas TODO leitor conhecido de `MetaConnection` (`/api/meta/connections`, `/api/meta/contas-de-anuncio`, `/api/portal/conexoes`, `/api/portal/meta-ativos`) filtra por `(workspaceId, clientId)` juntos — uma conexão gravada com `clientId` alheio fica invisível para todo mundo, inclusive para o próprio workspace que a criou (a não ser que ele já saiba o id exato) | limpo (observação: mesma classe do `financeiro` — rotulagem sem verificação, sem leitor que vaze) |
| `app/api/meta/whatsapp/messages/route.ts` | `contactWaId` (Q/C) | Q/C | sim — `listMessages`/`recordOutbound`/`sendWhatsAppDirect` sempre levam `workspaceId` junto de `contactWaId` (`lib/integrations/meta/inbox.ts`, lido por dentro) | limpo |
| `app/api/meta/whatsapp/route.ts` | `connectionId` (DELETE, C) | C | sim, mas por COMPARAÇÃO depois da busca: `deleteConnection` (`lib/integrations/meta/connections.ts`) faz `findUnique({ where: { id } })` e só apaga se `row.workspaceId === workspaceId`; não devolve dado, só booleano | limpo — trava correta, fora do padrão preferido (comparação, não `where` composto) mas sem vazamento; arquivo é `lib/integrations/meta/`, frente restrita, não editado |
| `app/api/portal/messages/suggest/route.ts` | `clientId`, `clientRequestId` (C) | C | sim — `clientId` via `client.findFirst({ where: { id, workspaceId } })`; `clientRequestId` via `solicitacaoDoWorkspace` ANTES de usar `req.businessName` | limpo |
| `app/api/portal/pedidos/orcamento/route.ts` | `pedidoId` (C) | C | sim — `dono.clientId` (derivado do TOKEN) entra no `where` da busca do pedido | limpo — trava correta, não mexer |
| `app/api/portal/pedidos/responder/route.ts` | `pedidoId` (C) | C | sim — `responderPergunta` (`lib/agency/esteira/porta-da-pergunta.ts`) faz `where: { id: pedidoId, clientId: dono.clientId }`, `clientId` derivado do TOKEN | limpo (observação: essa função devolve **403**, não 404, para "não é seu"/"não existe" — colapsados na MESMA resposta, então não vira oráculo de enumeração; mesmo assim é desvio da convenção "nunca 403" desta casa. Não consertado — é código pré-existente fora do escopo desta rodada, registrado abaixo) |
| `app/api/portal/vista/route.ts` | — (tudo vem do token) | T | sim — `dono.clientId` de `donoDoPortal(token)` entra em TODOS os `where` (`client`, `project`, `adCampaign`, `socialPost`, `clientRequestDb`) | limpo |
| `app/api/produto-tecnologia/cadeia/route.ts` | `correlationId` (C, opcional) | C | **não há `workspaceId` na tabela** (`ExecucaoV2`/`RecusaV2` — schema conferido, sem coluna de workspace) — qualquer `master`/`project_manager` de QUALQUER workspace autenticado (ou o segredo `PILOTO_SECRET`/`CRON_SECRET`) pode ler `status` (as últimas execuções/recusas do departamento, de TODOS os workspaces) e reusar um `correlationId` para ler o `resultado` (artefato já pago) de uma demanda de OUTRO workspace | 🔴 **estrutural — ESCALADO** (não é conserto de rota: exigiria migração de schema; ver abaixo) |
| `app/api/projects/[id]/esteira/route.ts` | `id` (path) | P | sim — `ehDoWorkspace(id, session.workspaceId)` antes de GET e de POST; `aprovarDirecao`/`apresentar`/`aprovarPacote`/`runProjectExecution` reusam o MESMO id já verificado | limpo |
| `app/api/projects/[id]/route.ts` | `id` (path) | P | sim — GET/PUT/DELETE todos conferem `findFirst({ where: { id, workspaceId } })` antes de qualquer leitura/escrita/exclusão | limpo |
| `app/api/sdr/chat/route.ts` | `sessionId`, `clientRequestId` (C) | C | rota **pública, sem sessão, sem fronteira de inquilino por design** (regra explícita da ficha para `sdr/*`); `clientRequestId` só é gravado no diário (`registrarTurnoDoSdr`) como identificador do fio da conversa, nunca usado para ler/escrever recurso de outro cliente nesta rota — não abri `registro-da-conversa.ts` por completo | escalado (classe diferente — a própria ficha manda escalar achados em rota pública, não consertar) |
| `app/api/self-serve/webhook/route.ts` | `dataId`, `external_reference` | webhook (HMAC) | sim — `external_reference` é lido de volta da API do Mercado Pago (autenticada com `mpToken`), nunca do corpo do chamador; é o valor que a PRÓPRIA casa gravou no checkout, não um id que um atacante escolhe | escalado (webhook de pagamento — família excluída por constituição, mesmo sem furo encontrado) |
| `app/api/social-posts/[id]/download/route.ts` | `id` (path) | P | sim — posse conferida DUAS vezes (`SocialPost` e cada `MediaAsset`), `condicaoDoDono` monta o `where` a partir do dono já derivado (sessão → `workspaceId`; portal → `clientId`/`clientRequestId` do TOKEN, nunca do corpo) | limpo — trava correta, não mexer (referência de bom padrão) |
| `app/api/social-posts/[id]/route.ts` | `id` (path), `clientId` (C) | P/C | sim — `existing` checado por `workspaceId`; `clientId` do corpo é conferido contra `workspaceId` ANTES de gravar (conserto de furo anterior, comentado no próprio arquivo) | limpo |
| `app/api/social-posts/aprovacao/route.ts` | `postIds` (C, lista) | C | sim — `findMany({ where: { id: { in: postIds }, workspaceId } })` e confere `posts.length === postIds.length` (nenhum id "sumiu" por pertencer a outro workspace) | limpo |
| `app/api/social-posts/generate/route.ts` | `clientId` (C) | C | **NÃO conferia** na segunda consulta (o furo desta rodada) — **agora sim** | 🔴 **FURO — FECHADO NESTA RODADA** |
| `app/api/tasks/[id]/route.ts` | `id` (path) | P | sim — `findFirst({ where: { id, project: { workspaceId } } })` antes de PATCH/DELETE | limpo |

---

## O furo estrutural, não consertado: `produto-tecnologia/cadeia` sem coluna de workspace

**Por que não é um conserto de rota como o de `social-posts/generate`:**
`ExecucaoV2` e `RecusaV2` (conferido em `prisma/schema.prisma`) não têm
`workspaceId` — nem obrigatório, nem nulável, nem nenhum campo equivalente.
Só existe `clienteId` (opcional, "de que cliente é este trabalho — `null` =
interno"). O padrão desta ficha (`clienteDoWorkspace`/`solicitacaoDoWorkspace`
no `where`) pressupõe uma coluna para filtrar; aqui ela não existe, e criá-la
é migração de schema — fora do "custo zero, nada em produção" desta rodada, e
fora da minha alçada decidir sozinho se este departamento (que conserta a
própria PLATAFORMA, código compartilhado por todos os workspaces) deveria ou
não ser particionado por workspace.

**O que um vizinho alcança hoje:** qualquer `master`/`project_manager`
autenticado de QUALQUER workspace — a `exigirAdministracao` desta rota confere
só o CARGO, nunca QUAL workspace — pode:
1. Chamar `{ acao: "status" }` e ler as últimas 30 execuções e recusas do
   departamento `product-technology` **de todos os workspaces juntos**
   (`funcaoId`, `ator`, `modelo`, `custoUsd`, `correlationId`, tempos).
2. Reusar (adivinhar ou reaproveitar) um `correlationId` de outra demanda e
   receber de volta, em `jaFeitos`, o `resultado` (o artefato/patch já
   produzido) daquela demanda — mesmo sem ter pago por ela.

**Ponto de reversão, para quando alguém decidir:** se a decisão for
particionar por workspace, o caminho é reversível em minutos — a migration
soma uma coluna nulável `workspaceId` a `ExecucaoV2`/`RecusaV2`, o `deps`
desta rota passa a gravá-la, e os dois `findMany` (status e `jaGravadas`)
ganham `workspaceId` no `where`. Se a decisão for "este departamento é da
CASA, não do cliente, e não deveria mesmo ser particionado" — aí o achado
vira "comportamento pretendido, documentar e fechar", não furo.

**Quem consegue o quê, hoje vs. depois (se particionado):**
- Hoje: qualquer direção de qualquer workspace lê o histórico de auto-conserto
  da plataforma inteira e pode reciclar resultado pago por outro workspace.
- Depois: cada workspace só vê e reusa as próprias execuções.

Escalo ao PM esta decisão — não é conserto de segurança que eu deva tomar
sozinho, é decisão de modelo de dados do departamento.

---

## O que ficou declarado e não feito

1. **`app/api/portal/pedidos/responder/route.ts`** devolve `codigo: 403` para
   "pedido não encontrado OU não é seu" (`lib/agency/esteira/porta-da-pergunta.ts`,
   função `responderPergunta`). Não é furo de posse — a busca já leva
   `clientId` no `where`, e as duas causas (não existe / não é seu) saem com a
   MESMA mensagem e o MESMO código, então não é oráculo de enumeração. Mas é
   desvio da convenção "nunca 403, sempre 404" desta casa. Já era assim antes
   desta rodada; registrado, não consertado — mesma decisão que a rodada 1
   tomou para `portal/materiais` e `portal/approvals`.
2. **`app/api/meta/connect/route.ts`** só grava um cookie; a gravação de
   verdade acontece em `/api/meta/callback`, que não está neste lote nem no
   lote A (fora do universo dos 46 candidatos da triagem mecânica). Não
   examinado.
3. **`app/api/meta/whatsapp/route.ts` DELETE** usa comparação-depois-da-busca
   (`deleteConnection`, dentro de `lib/integrations/meta/`) em vez de `where`
   composto. Não é furo — não devolve dado, só um booleano — mas é o padrão
   que esta casa evita. Arquivo fora do meu alcance nesta frente (restrição
   explícita da ficha: `lib/integrations/meta/` é frente de outra pessoa
   agora). Registrado, não tocado.
4. Não subi o app com duas sessões reais — toda prova aqui é leitura de código
   mais o teste de unidade novo, com Prisma dublado.

---

## Resumo para o PM

- **Rotas lidas por completo:** as 23 do lote B, mais 3 arquivos de biblioteca
  chamados por elas (`materiais.ts`, `porta-da-pergunta.ts`,
  `connections.ts` — este último só leitura, é frente restrita) e 4 leitores
  de `MetaConnection` fora do lote, para confirmar que o rótulo sem
  verificação de `meta/token` não tem para onde vazar.
- **Furos achados:** 2. Um de rota (`social-posts/generate`), fechado com
  teste. Um estrutural (`produto-tecnologia/cadeia`), sem coluna de workspace
  para filtrar — escalado.
- **Furos fechados:** 1 — `app/api/social-posts/generate/route.ts` /
  `lib/agency/social-posts/contexto-do-cliente.ts`, com teste que mata o
  conserto se revertido.
- **Furos escalados, e por quê:**
  - `produto-tecnologia/cadeia` — falta coluna de workspace no schema; decisão
    de modelo de dados, não conserto de segurança isolado.
  - `sdr/chat` — rota pública sem fronteira de inquilino por design; a própria
    ficha manda escalar, não consertar.
  - `self-serve/webhook` — família pagamento (webhook de gateway); mesmo sem
    furo encontrado, está fora da minha alçada por constituição.
- **Arquivos que escrevi:**
  - `/home/user/diolidigital/lib/agency/social-posts/contexto-do-cliente.ts` (novo — o conserto)
  - `/home/user/diolidigital/app/api/social-posts/generate/route.ts` (ajustado — importa a função em vez de defini-la)
  - `/home/user/diolidigital/__tests__/seguranca/o-contexto-do-cliente-do-vizinho.test.ts` (novo)
  - `/home/user/diolidigital/docs/diagnosticos/varredura-de-posse-rodada2-lote-B.md` (este documento)
- **O que ficou declarado e não feito:** os quatro itens da seção acima, e o
  furo estrutural do `produto-tecnologia/cadeia` (decisão de schema, não
  minha para tomar sozinho).
