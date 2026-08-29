# Varredura de posse — id no CORPO ou na QUERY STRING — 29/08/2026

> Continuação da varredura de 28/08 (`docs/diagnosticos/varredura-de-posse-28-08.md`),
> que varreu só **path params** (`[id]` na URL) e declarou o buraco: corpo e
> query ficaram de fora. É esse buraco que esta varredura fecha.
> **Custo:** zero. Nada em produção, nenhuma chamada de IA real.

## O método

A pergunta: **que rota (ou função de biblioteca por trás dela) recebe um id
pelo CORPO ou pela QUERY STRING e o usa numa consulta sem escopo de
workspace/dono DENTRO do `where`?**

## Os comandos que rodei, colados literalmente

```sh
# 1. Todas as rotas de API da casa (152 arquivos route.ts)
find app/api -name "route.ts" | sort

# 2. Todo `where: { id }` bruto — o sinal mais forte de furo (findUnique não
#    aceita escopo composto a menos que exista índice composto)
rg -n 'where: \{ id' app lib --type=ts -g '!node_modules' -g '!.next'
rg -n 'where: \{ id' app/api --type=ts -g '!node_modules' -g '!.next'

# 3. Leitura de corpo e de query nas rotas de API
rg -n 'searchParams.get\(['"'"'"\].*[Ii]d' app/api --type=ts -g '!node_modules'
rg -n 'await req(uest)?\.json\(\)|await request\.json\(\)' app/api --type=ts

# 4. Query string com nome de id explícito (clientId, projectId, postId,
#    briefingId, clientRequestId, workspaceId, taskId, deliverableId,
#    campaignId, connectionId, insightId, approvalRequestId)
rg -n 'searchParams.get\(.(clientId|projectId|postId|briefingId|clientRequestId|conversationId|workspaceId|taskId|deliverableId|campaignId|connectionId|insightId|approvalRequestId).\)' app/api --type=ts -g '!node_modules'

# 5. updateMany / deleteMany em rotas de API (mutação em massa é o segundo
#    sinal mais forte — updateMany sem workspace no where afeta várias linhas
#    de uma vez, de qualquer inquilino)
rg -n 'updateMany\(\{|deleteMany\(\{' app/api --type=ts -g '!node_modules' -A3

# 6. Quem ainda chama a função declarada aberta em 28/08
rg -n "historicoDaPeca" app __tests__ lib --type=ts -g '!node_modules' -g '!.next'
```

Cada arquivo que apareceu nesses comandos foi **lido inteiro** (não só a
linha do grep) antes de entrar na tabela abaixo, porque o veredito depende do
que acontece ANTES da consulta suspeita (há posse conferida cedo? é sempre o
mesmo tipo de dado, ou o `where` já é composto?).

---

## 🔴 Furo 1 — FECHADO: `historicoDaPeca` lia o histórico de reprovação do vizinho

Este era o item **já declarado aberto** na varredura de 28/08 (item 2 da seção
"O que ficou de fora"), com prazo, não permanente.

**Onde:** `lib/agency/esteira/reprovacao.ts` → `historicoDaPeca(postId)`.

**O que fazia:** `prisma.socialPost.findUnique({ where: { id: postId } })` —
sem workspace — e em seguida usava o `workspaceId` **lido do próprio post
alheio** para buscar os eventos (`activityEvent.findMany({ where:
{ workspaceId: post.workspaceId, ... } })`). Ou seja: o filtro de posse
existia, mas a fonte da verdade do filtro era o dado que deveria estar sendo
protegido.

**O que um vizinho de inquilino alcançava:** qualquer sessão autenticada de
qualquer workspace, sabendo (ou adivinhando) o id de uma peça de outro
inquilino, lia o histórico completo de reprovações daquela peça — quem
reprovou, quando, e o texto inteiro do motivo (`oQueDisseram`), que
frequentemente contém trecho de briefing ou de crítica interna à marca do
cliente alheio.

**Hoje nenhuma rota chama esta função** (só o teste antigo a exercitava
diretamente) — é dívida fechada antes de virar rota, e não incidente em
produção.

### O conserto

`historicoDaPeca` passou a exigir `workspaceId` como **parâmetro obrigatório**
(nunca opcional — parâmetro opcional deixaria um chamador futuro esquecer),
vindo da sessão de quem chama. O escopo foi para o `where` da PRÓPRIA busca da
peça (`findFirst({ where: { id: postId, workspaceId } })`), nunca lido de
volta do registro encontrado. Sem o escopo na busca da peça, nunca se chega ao
`workspaceId` alheio — porque a peça alheia nunca é encontrada.

### O teste que mata o conserto se ele for revertido

`__tests__/seguranca/o-historico-da-peca-do-vizinho.test.ts` (novo). Prova as
duas metades: o vizinho recebe lista vazia (nunca 403 — a função não tem
código de HTTP, mas o equivalente dela, "nada", nunca "encontrado e negado"),
e o `where` da busca leva o workspace; o dono legítimo continua lendo
normalmente.

`__tests__/esteira/reprovacao.test.ts` foi ajustado: o dublê de `findUnique`
saiu (a função não o usa mais), e a chamada de `historicoDaPeca` passou a
levar o `workspaceId`.

---

## 🔴 Furo 2, 3 e 4 — ACHADOS e NÃO CONSERTADOS: a família "parceria" não confere workspace nenhum

**Três rotas, o mesmo padrão, nas três:** recebem `clientId` ou
`clientRequestId` **pelo corpo ou pela query** e chamam uma função de
biblioteca que grava ou apaga direto pelo id, **sem NENHUMA conferência de
workspace** — nem antes, nem dentro do `where`.

| Rota | Verbo | Campo | Função chamada | `where` da escrita |
|---|---|---|---|---|
| `app/api/agency/parcerias/route.ts` | POST | `body.clientId` | `autorizarParceriaDoCliente` (`lib/agency/financeiro/parceria-do-parceiro.ts`) | `prisma.parceriaDoCliente.upsert({ where: { clientId } })` — só `clientId`, sem workspace |
| `app/api/agency/parcerias/route.ts` | DELETE | `?clientId=` | `revogarParceriaDoCliente` | `prisma.parceriaDoCliente.updateMany({ where: { clientId, revogadaEm: null } })` — idem |
| `app/api/agency/convites-de-parceria/route.ts` | POST | `body.clientId` | `cunharConviteDeParceria` (`lib/agency/comercial/convite-de-parceria.ts`) | cunha convite apontando para a `clientId` recebida, sem checar dono |
| `app/api/admin/isencoes-de-parceria/route.ts` | POST | `body.clientRequestId` | `concederIsencaoDeParceria` (`lib/agency/financeiro/conceder-isencao.ts`) | concede isenção pela `clientRequestId` recebida, sem checar dono |

**O que um vizinho de inquilino alcançava:** qualquer sessão `master` ou
`project_manager` **de qualquer workspace** desta casa consegue:

1. **Conceder** — para um `clientId`/`clientRequestId` de outra agência —
   uma parceria com **isenção de pagamento** e um **teto de gasto de IA em
   dólar** à escolha de quem chama (POST `/agency/parcerias`), e depois cunhar
   um convite (POST `/agency/convites-de-parceria`) que dispensa a pergunta
   de verba do cliente alheio — sem que a agência dona daquele cliente saiba
   ou tenha pedido.
2. **Revogar** (DELETE `/agency/parcerias`) uma parceria **legítima** que
   outra agência concedeu a um cliente dela, cortando a isenção de pagamento
   que ele estava usando de boa fé.
3. **Isentar** (POST `/admin/isencoes-de-parceria`) o pagamento de um pedido
   (`clientRequestId`) de outra agência, liberando a produção dele sem
   cobrança — o portão de pagamento passa a devolver `parceria_isenta` para um
   pedido que não é da agência que concedeu.

**Por que eu NÃO consertei — a régua da minha própria constituição:**
`docs/kit/23-constituicao-dos-essenciais.md`, SEGURANÇA, item 3: *"Com
autorização humana: qualquer correção que toque **pagamento** ou
**integração com parceiro**"* — e o item 8 (escala): *"Para o Diretor em tudo
que toca pagamento ou parceiro."* As três rotas são, pelo próprio nome e pelo
próprio cabeçalho do código-fonte (`"esta rota libera produção de graça"`,
`"isto libera gasto real"`), a definição literal de **pagamento** (isenção de
cobrança) e de **parceiro** (parceria comercial) desta casa. Mesmo sendo eu
quem tem a escrita, esta classe específica não é minha para tocar sozinho —
é a única trava da minha constituição sem exceção por prazo apertado ou por
achado ser "pequeno".

**Ponto de reversão, para quando alguém autorizar o conserto:** reversível em
minutos — o padrão já existe nesta casa e é o mesmo das outras 30+ rotas
limpas desta varredura: `clienteDoWorkspace(clientId, session.workspaceId)` /
`solicitacaoDoWorkspace(clientRequestId, session.workspaceId)`
(`lib/auth/posse-de-workspace.ts`), chamado ANTES de `autorizarParceriaDoCliente`
/ `revogarParceriaDoCliente` / `cunharConviteDeParceria` /
`concederIsencaoDeParceria`, devolvendo 404 (nunca 403) quando a posse falha.

**Quem consegue fazer o quê, hoje vs. depois da correção (quando autorizada):**
- Hoje: qualquer `master`/`project_manager` de qualquer workspace desta casa
  concede, revoga ou isenta parceria de cliente de QUALQUER outra agência.
- Depois: só concede/revoga/isenta parceria de cliente **do próprio
  workspace** — cliente alheio responde 404.

---

## A tabela completa — toda rota examinada, inclusive as limpas

Legenda de origem: **C** = corpo (JSON), **Q** = query string, **T** = token
de portal (derivado, não comparado — nunca é o dono da checagem), **—** = a
rota não recebe id de recurso pelo corpo/query (só sessão ou nenhum id).

| Rota / função | id que recebe | de onde | confere posse? | veredito |
|---|---|---|---|---|
| `lib/agency/esteira/reprovacao.ts` → `historicoDaPeca` | `postId` | função (chamador decide) | **NÃO tinha** — agora sim, no `where` | 🔴 **FURO — FECHADO NESTA VARREDURA** |
| `app/api/agency/parcerias/route.ts` POST/DELETE | `clientId` | C/Q | não | 🔴 **FURO — ESCALADO (toca pagamento/parceiro)** |
| `app/api/agency/convites-de-parceria/route.ts` POST/DELETE | `clientId` (POST) | C | não | 🔴 **FURO — ESCALADO (mesma família)** |
| `app/api/admin/isencoes-de-parceria/route.ts` POST | `clientRequestId` | C | não | 🔴 **FURO — ESCALADO (mesma família)** |
| `app/api/social-posts/publicar-agora/route.ts` POST | `postId` | C | sim — busca, confere `workspaceId`, 404 | limpo |
| `app/api/campanhas/route.ts` POST | `campanhaId` | C | sim — confere `workspaceId` antes de ligar/desligar | limpo |
| `app/api/meta/connections/route.ts` DELETE/PATCH | `connectionId`, `clientId` | C | sim — `findFirst` com `workspaceId` no `where` | limpo |
| `app/api/messages/pedidos/route.ts` POST/PATCH | `pedidoId`, `corpo.projectId` | C | sim — busca, confere cliente dono contra `workspaceId` antes de qualquer escrita | limpo |
| `app/api/clients/[id]/fundir/route.ts` POST | `absorvidoId` (path), `sobreviventeId` (C) | path+C | sim — os DOIS conferidos contra `workspaceId` | limpo |
| `app/api/portal/materiais/route.ts` GET/POST | `pedidoId` | C | sim — `dono.clientId` do TOKEN no `where` | limpo (nota: usa 403 em não-encontrado; ver observações) |
| `app/api/portal/drive/route.ts` GET/POST/PATCH/DELETE | `id` (do arquivo), `fileId` | C/Q | sim — `dono.clientId`+`workspaceId` do TOKEN no `where` | limpo |
| `app/api/portal/approvals/route.ts` POST | `approvalRequestId` | C | sim — `pertenceAoToken` (posse por OR, função pura testável) | limpo (nota: usa 403; ver observações) |
| `app/api/portal/esteira/route.ts` GET/POST | — (token resolve tudo) | T | sim — derivado do token | limpo |
| `app/api/portal/briefing/aceite/route.ts` POST | `clientRequestId` (opcional, comparado) | C | sim — comparado contra o do TOKEN, diverge → 404 | limpo |
| `app/api/portal/briefing/proposta/route.ts` GET | — (token resolve tudo) | T | sim | limpo |
| `app/api/brain/orchestrate/apply/route.ts` POST | `clientRequestId` | C | sim — `solicitacaoDoWorkspace` | limpo |
| `app/api/brain/auto-scope/[id]/review/route.ts` POST | `clientRequestId` (= path `id`) | path | sim — `solicitacaoDoWorkspace` | limpo |
| `app/api/brain/artifacts/route.ts` GET/POST | `clientRequestId` | Q/C | sim — `solicitacaoDoWorkspace`/`posseDaSolicitacao` | limpo |
| `app/api/media/route.ts` POST | `clientRequestId`, `clientId` | C (form) | sim — token deriva; lado equipe confere `workspaceId` | limpo |
| `app/api/messages/conversa.ts` (lib) | `clientId`/`clientRequestId` | função | sim — nunca lê `{ clientId: null }` cru | limpo |
| `app/api/briefings/route.ts` GET/POST | `projectId`, `clientId` | Q/C | sim — `workspaceId` sempre no `where` composto | limpo |
| `app/api/strategy-rooms/route.ts` GET/POST | `projectId` | Q/C | sim — projeto conferido antes do upsert | limpo |
| `app/api/material-requests/route.ts` GET/POST | `projectId`, `clientId` | Q/C | sim | limpo |
| `app/api/tasks/route.ts` GET/POST | `projectId` | Q/C | sim — projeto conferido antes de criar | limpo |
| `app/api/activity-events/route.ts` GET/POST | `clientId`, `projectId` | Q/C | sim — `workspaceId` sempre no `where` | limpo |
| `app/api/brain/evidence/route.ts` GET/POST | `clientRequestId`, `artifactId` | Q/C | sim — `solicitacaoDoWorkspace`/`artefatoDoWorkspace` | limpo |
| `app/api/brain/portal-access/route.ts` POST/GET | `clientRequestId`, `clientId` | C/Q | sim — a CHAVE-MESTRA do portal; posse antes de cunhar E antes de listar | limpo |
| `app/api/brain/portal-data/route.ts` GET | `clientRequestId`, `clientId` | Q (ou token) | sim — token deriva; explícito confere `solicitacaoDoWorkspace`/`clienteDoWorkspace` | limpo |
| `app/api/brain/approvals/route.ts` GET/PATCH/POST | `clientRequestId`, `id`, `approvalRequestId`, `artifactId` | Q/C | sim — `aprovacaoDoWorkspace`/`solicitacaoDoWorkspace`/`artefatoDoWorkspace` | limpo |
| `app/api/brain/updates/route.ts` GET | `clientRequestId` | Q | sim — `solicitacaoDoWorkspace` + filtro de donos quando sem filtro | limpo |
| `app/api/meta/prontidao/route.ts` GET | `clientId` | Q | sim — passado com `workspaceId` para `conferirProntidao` | limpo (não entrei na lib, restrita) |
| `app/api/meta/contas-de-anuncio/route.ts` GET/POST | `clientId` | Q/C | sim — `metaConnection.findFirst` com `workspaceId` | limpo (não editei — `lib/integrations/meta/` é restrito) |
| `app/api/deliverables/route.ts` GET/POST | `projectId` | Q/C | sim | limpo |
| `app/api/projects/route.ts` GET/POST | `clientId` | Q/C | sim — `workspaceId` sempre no `where` | limpo |
| `app/api/brand-updates/route.ts` GET/POST | `clientId` | Q/C | sim | limpo |
| `app/api/portal/messages/route.ts` GET/POST | `clientId`, `clientRequestId` | Q/C (equipe) ou T (cliente) | sim — `clienteDoWorkspace`/`solicitacaoDoWorkspace` no lado equipe | limpo |
| `app/api/social-posts/route.ts` GET/POST | `clientId`, `clientRequestId` | Q/C | sim — `workspaceId` sempre no `where`, cliente/pedido conferidos antes de gravar | limpo |
| `app/api/agency/material-de-marca/route.ts` GET | `clientId` | Q | sim | limpo |
| `app/api/admin/backfill-carrossel/route.ts` GET/POST | `clientId` | Q/C | sim — `client.findFirst` com `workspaceId`, 404 | limpo |
| `app/api/radar/insights/route.ts` GET/POST | — (workspace da sessão) | — | sim | limpo |
| `app/api/google/conectar/route.ts` GET | `clientId` | Q | **parcial** — grava `clientId` recebido como dono da NOVA conexão sem checar que aquele cliente é do workspace do operador | ⚠️ observação (não é vazamento de dado de outro inquilino: a conexão nasce no workspace de quem chama; o risco é a conexão ficar mal-rotulada, não vazar) — não consertado, ver "não varri" |
| `app/api/v2/assistido/route.ts`, `app/api/v2/retomar/route.ts`, `app/api/cron/v2/route.ts`, `lib/agency/v2-recovery/retomar.ts` | vários | C/Q | — | **já coberto por PR #161/#162, aberto e não mergeado — não mexi** |
| `app/api/v2/rollout/route.ts` | (nenhum — ids vêm de listagem interna, não da requisição) | — | n/a — admin-only, batch global por design | limpo (fora do escopo: não recebe id de fora) |

---

## O QUE NÃO VARRI — honesto

1. **As rotas `app/api/admin/*` que não entraram na tabela** —
   `reverter-aprovacao-do-pacote`, `refazer-com-direcao`, `produzir-pecas`,
   `recompor-pecas`, `cards-de-aprovacao`, `reconciliar-drive`,
   `training/sdr/*`. São todas gated por `master`/administração, mas eu não li
   nenhuma linha por dentro — não sei se algum `clientId`/`projectId` do corpo
   delas escapa do `where`. Fica para a próxima rodada.
2. **`app/api/self-serve/assinatura/route.ts` e `app/api/self-serve/order/route.ts`**
   — são rotas **públicas**, sem sessão nem conceito de workspace (fluxo de
   checkout de autoatendimento). O `clientRequestId` do corpo não é conferido
   contra workspace nenhum porque não existe fronteira de inquilino nesse
   fluxo específico. Não tratei como furo de posse (não há "vizinho de
   workspace" nesse caminho), mas também não confirmei que não há OUTRA
   classe de problema ali (ex.: um `clientRequestId` de outro *cliente* sendo
   usado para assinar em nome dele) — e por ser rota de **cobrança**, qualquer
   mudança aí cai na mesma trava humana do achado 2/3/4 acima. Declarado, não
   examinado a fundo.
3. **`lib/agency/execution/artes.ts`** — dezenas de `where: { id }`, mas são
   funções internas do pipeline de produção, chamadas com ids que o próprio
   motor já resolveu (nunca vindos direto de uma requisição HTTP). Não segui
   cada cadeia de chamada até a origem para confirmar isso em 100% dos casos.
4. **As rotas de `app/api/meta/*` e `app/api/google/*` restantes**
   (`meta/publish`, `meta/dispatch`, `meta/feed`, `meta/desempenho`,
   `meta/insights`, `meta/webhooks`, `meta/whatsapp/*`, `meta/templates`,
   `google/drive/callback`) — não li por dentro. `lib/integrations/meta/` está
   fora do meu alcance nesta frente por instrução direta da ficha (outra
   frente está lá agora); as rotas em si eu não abri.
5. **`app/api/ai-keys/*`, `app/api/ai-run-logs/*`, `app/api/integration-configs/*`,
   `app/api/financeiro/*`, `app/api/capacidades/*`, `app/api/pulso/*`,
   `app/api/top-down/*`, `app/api/produto-tecnologia/*`** — não abertas.
6. **Não subi o app com duas sessões reais.** Toda prova de posse aqui é
   leitura de código + os testes de unidade que escrevi/herdei, com Prisma
   dublado — não uma requisição HTTP ponta a ponta com dois logins.
7. **Não conferi os 403 pré-existentes que deveriam ser 404.**
   `app/api/portal/materiais/route.ts` (POST, pedido não encontrado) e
   `app/api/portal/approvals/route.ts` (várias respostas de posse) devolvem
   **403** para casos em que a posse já é conferida corretamente no `where` —
   ou seja, não são furo de posse (o dado já está escopado), mas violam a
   convenção "nunca 403" desta casa em código PRÉ-EXISTENTE que eu não
   escrevi e não toquei. Registro para o PM decidir se vale um conserto à
   parte — não mexi para não introduzir risco num arquivo de 700 linhas com
   múltiplas auditorias anteriores (`portal/approvals`) fora do escopo desta
   ficha.

---

## Resumo para o PM

- **Arquivos varridos por leitura completa:** 45 rotas/arquivos de biblioteca
  (tabela acima), a partir de um universo de 152 arquivos `route.ts`
  levantados no passo 1 dos comandos.
- **Furos achados:** 4 (1 função de biblioteca + 3 rotas da família parceria).
- **Furos fechados:** 1 (`historicoDaPeca`), com teste que mata o conserto.
- **Furos escalados, não consertados:** 3 (`agency/parcerias`,
  `agency/convites-de-parceria`, `admin/isencoes-de-parceria`) — todos na
  mesma família, todos tocam pagamento/parceiro, todos exigem autorização
  humana pela minha própria constituição (SEGURANÇA §3 e §8).
- **Arquivos que escrevi:**
  - `/home/user/diolidigital/lib/agency/esteira/reprovacao.ts` (conserto)
  - `/home/user/diolidigital/__tests__/esteira/reprovacao.test.ts` (ajuste de chamada)
  - `/home/user/diolidigital/__tests__/seguranca/o-historico-da-peca-do-vizinho.test.ts` (teste novo)
  - `/home/user/diolidigital/docs/diagnosticos/varredura-de-posse-no-corpo-29-08.md` (este documento)
- **O que ficou declarado e não feito, e por quê:** os 3 furos da família
  parceria (autorização humana obrigatória, sem exceção) e os seis itens da
  seção "O QUE NÃO VARRI" (tempo — a casa tem 152 rotas e eu priorizei
  escrita antes de leitura, como o método sugerido pedia).
