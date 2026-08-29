# Varredura de posse — rodada 2, lote A — 29/08/2026

> Ficha: `.fichas/rodada2-A.md`. Universo desta rodada: 188 `route.ts` reais (a
> rodada 1, `docs/diagnosticos/varredura-de-posse-no-corpo-29-08.md`, tinha
> citado 152 e examinado 45). Triagem mecânica reduziu a 46 candidatas — as que
> leem corpo/query **e** usam id — divididas em dois lotes. Este documento cobre
> **as 23 linhas de `docs/diagnosticos/varredura-de-posse-29-08/lote-A.txt`**, uma a uma, lidas inteiras.
>
> **Custo:** zero. Nada em produção, nenhuma chamada de IA real, nenhum e-mail.

## Os comandos que rodei, colados literalmente

```sh
# 1. As 23 rotas do lote, uma a uma, lidas INTEIRAS (não só a linha do grep da
#    triagem — o veredito depende do que acontece ANTES da consulta suspeita).
cat docs/diagnosticos/varredura-de-posse-29-08/lote-A.txt

# 2. Para cada furo suspeito, a função de biblioteca por trás da rota, também
#    lida inteira:
#    lib/agency/financeiro/portao-de-pagamento.ts   (admin/pagamentos)
#    lib/security/crypto.ts                          (segredoConfere, admin/reset-request)
#    lib/agency/comercial/atribuir-conversa-orfa.ts  (conversas-sem-pedido/atribuir)
#    lib/agency/escada/registro.ts                   (agency/escada)
#    lib/ai/escolha-por-cliente.ts                   (provedor-do-cliente)
#    lib/ai/generate.ts (topo)                       (os seis agents/*/generate)
#    lib/agency/esteira/avisos.ts                     (avisos)

# 3. Onde mais `marcarComoEnviado`/`dispensar` são chamadas, para medir o raio
#    do conserto antes de mudar a assinatura:
grep -rn "marcarComoEnviado\|dispensar(" app lib __tests__ --include="*.ts"

# 4. O que já existe em __tests__/seguranca/, para não duplicar padrão e usar
#    o molde já corrigido do TS2493/TS2322 (vi.hoisted sem assinatura):
find __tests__/seguranca -maxdepth 1 -type f
```

Cada arquivo da tabela abaixo foi lido por inteiro com a ferramenta de leitura
(não só a linha do grep), porque o veredito depende do que acontece **antes**
da consulta que usa o id — há posse conferida cedo? o `where` já é composto?

---

## A tabela — as 23 linhas do lote, todas

Legenda de origem: **C** = corpo (JSON), **Q** = query string, **path** =
segmento da URL (`[id]`), **T** = token/sessão (derivado, não comparado).

| # | rota | id que recebe | de onde | confere posse? | veredito |
|---|---|---|---|---|---|
| 1 | `app/api/admin/pagamentos/route.ts` | `clientRequestId` | C | **NÃO** — `registrarPagamento` faz `upsert({ where: { clientRequestId } })` sem workspace, em nenhum lugar do caminho | 🔴 **FURO — ESCALADO (toca pagamento)** |
| 2 | `app/api/admin/reset-request/route.ts` | `requestId`, `businessName` | C | sim (sessão master) — `workspaceScope` no `where` com a política de órfã já estabelecida; o atalho `x-admin-secret` bypassa por desenho (comparação em tempo constante, fail-closed sem segredo) | limpo (observação sobre o bypass, ver abaixo) |
| 3 | `app/api/agency/clients/[id]/marca/do-brand-book/route.ts` | `id` (path, cliente) | path | sim — `clienteOuNulo` local, `workspaceId` no `where`, 404 sempre | limpo |
| 4 | `app/api/agency/conversas-sem-pedido/atribuir/route.ts` | `clientId` | C | sim — `atribuirRastroAoCliente` confere `cliente.workspaceId === workspaceId` antes de gravar; `atribuidoPor`/`workspaceId` vêm da sessão | limpo |
| 5 | `app/api/agency/escada/route.ts` (ação `liberar_cliente`) | `clientId` | C | **NÃO tinha** — `liberarCliente` gravava qualquer `clientId` recebido na allowlist do próprio departamento sem checar workspace nenhum | 🔴 **FURO — FECHADO NESTA VARREDURA** |
| 6 | `app/api/agency/oportunidades/[id]/route.ts` | `id` (path) | path | sim — `updateMany({ where: { id, workspaceId } })`, 404 sempre, exemplar | limpo |
| 7 | `app/api/agency/provedor-do-cliente/route.ts` | `clientId` | C | sim — `fixarProvedor` confere `client.findFirst({ id, workspaceId })` antes de gravar | limpo |
| 8 | `app/api/agents/ads/generate/route.ts` | `clientId`, `projectId` | C | n/a — os ids só rotulam o `AIRunLog` de custo (`generate({ clientId, projectId, workspaceId: sessão })`); não leem nem escrevem nada por eles | limpo (observação) |
| 9 | `app/api/agents/brand/analyze/route.ts` | `clientId`, `projectId` | C | idem #8 | limpo (observação) |
| 10 | `app/api/agents/design/generate/route.ts` | `clientId`, `projectId` | C | idem #8 — já registrado em `docs/agents/seguranca/vitrine.md` item 3 (opcional, custo sem dono) | limpo (observação) |
| 11 | `app/api/agents/operations/generate/route.ts` | `clientId`, `projectId` | C | idem #8 | limpo (observação) |
| 12 | `app/api/agents/pm/generate/route.ts` | `clientId`, `projectId` | C | idem #8 | limpo (observação) |
| 13 | `app/api/agents/social/generate/route.ts` | `clientId`, `projectId` | C | idem #8 — já registrado na mesma vitrine | limpo (observação) |
| 14 | `app/api/ai-run-logs/route.ts` | `departmentId` (filtro) | Q | sim — `workspaceId` sempre no `where`; não há `POST` (removido de propósito) | limpo |
| 15 | `app/api/avisos/route.ts` (PATCH `enviei`/`dispensar`) | `id` (do `ClientNotice`) | C | **NÃO tinha** — `marcarComoEnviado`/`dispensar` faziam `update({ where: { id } })`, sem workspace | 🔴 **FURO — FECHADO NESTA VARREDURA** |
| 16 | `app/api/brain/auto-scope/route.ts` | `clientRequestId` | C | sim — `solicitacaoDoWorkspace`, 404 | limpo |
| 17 | `app/api/brain/client-requests/route.ts` (GET/PATCH/DELETE) | `id`, `clientId`, `workspaceId` | Q/C | sim — `solicitacaoDoWorkspace`/`clienteDoWorkspace` em todos os verbos internos; `workspaceId` do corpo é recusado por PATCH (não pode trocar dono); `POST` é público por desenho e nunca aceita `workspaceId`/`clientId` do corpo | limpo |
| 18 | `app/api/brain/orchestrate/route.ts` | `clientRequestId` | C | sim — `solicitacaoDoWorkspace`, 404 | limpo |
| 19 | `app/api/brand-updates/[id]/route.ts` | `id` (path) | path | sim — `findFirst({ id, client: { workspaceId } })` antes de mutar, 404 | limpo |
| 20 | `app/api/briefings/[id]/route.ts` | `id` (path) | path | sim — `findFirst({ id, project: { workspaceId } })` antes de mutar, 404 | limpo |
| 21 | `app/api/clients/[id]/brand-brain/route.ts` | `id` (path) | path | sim — `client.findFirst({ id, workspaceId })` antes de ler/gravar, 404 | limpo |
| 22 | `app/api/clients/[id]/route.ts` | `id` (path) | path | sim — `findFirst({ id, workspaceId })` antes de GET/PUT/DELETE, 404; DELETE também confere inventário antes de apagar | limpo |
| 23 | `app/api/deliverables/[id]/route.ts` | `id` (path) | path | sim — `findFirst({ id, project: { workspaceId } })` antes de mutar, 404 | limpo |

---

## 🔴 Furo 1 — FECHADO: `POST /api/agency/escada` (`liberar_cliente`) gravava `clientId` sem dono

**Onde:** `app/api/agency/escada/route.ts`, ação `liberar_cliente` →
`liberarCliente` em `lib/agency/escada/registro.ts`.

**O que fazia:** recebia `clientId` do corpo e adicionava direto na
`clientesLiberados` (JSON) do `DepartmentLadder` do PRÓPRIO workspace de quem
chamou — sem nunca conferir se aquele `clientId` pertencia a esse workspace.

**O que um vizinho de inquilino alcançava:** qualquer sessão `master` desta
casa conseguia gravar o `clientId` de um cliente de **outra** agência dentro
da allowlist do seu próprio departamento. Isto não lê dado da agência alheia
(a linha nasce sob o workspace de quem chamou), mas é a mesma classe de furo
que o resto da casa trava: **id de recurso vindo da requisição, sem
verificação de posse, virando escrita** — poluindo a governança da escada com
um id que não é seu e, em tese, preparando o terreno para uma peça sair
rotulada para um cliente que não existe naquele workspace.

**O conserto:** o escopo vai no `where` de `clienteDoWorkspace(clientId,
workspaceId)` (`lib/auth/posse-de-workspace.ts`, já existente e reutilizado —
nenhuma função nova), chamado ANTES de `liberarCliente`, devolvendo 404
(nunca 403) quando a posse falha. Nenhuma linha de `lib/agency/escada/registro.ts`
foi tocada — o conserto inteiro está na rota.

**Teste que mata o conserto se revertido:**
`__tests__/seguranca/o-cliente-do-vizinho-na-escada.test.ts`. Prova as duas
metades: o `clientId` alheio devolve 404 e `liberarCliente` nunca é chamado; o
`clientId` do próprio workspace continua liberando normalmente.

---

## 🔴 Furo 2 — FECHADO: `PATCH /api/avisos` marcava/dispensava aviso de outro workspace

**Onde:** `lib/agency/esteira/avisos.ts` → `marcarComoEnviado(id, quem)` e
`dispensar(id, quem)`, chamadas por `app/api/avisos/route.ts`.

**O que fazia:** `prisma.clientNotice.update({ where: { id } })` — sem
`workspaceId` em nenhuma das duas funções.

**O que um vizinho de inquilino alcançava:** qualquer sessão `master`/
`project_manager` desta casa, sabendo (ou adivinhando) o id de um
`ClientNotice` pendente de **outra** agência, marcava-o como "enviado" (com
seu próprio nome gravado em `sentBy`, mentindo sobre quem mandou o quê) ou o
dispensava — silenciando a fila que existe **exatamente** para impedir um
cliente parado sem saber que precisa fazer algo. É o mesmo padrão de dano que
a doutrina desta casa já registrou para "a falha que vira afirmação": aqui,
uma ação de outro inquilino que nunca aconteceu passa a constar como
acontecida.

**O conserto:** as duas funções passaram a exigir `workspaceId` como parâmetro
obrigatório, e a escrita virou `updateMany({ where: { id, workspaceId } })`
(o escopo no `where`, nunca uma comparação depois), devolvendo `false` quando
`count === 0` — a rota já traduzia `ok: false` em **404** (nunca 403), então
nenhuma mudança de status HTTP foi necessária, só a assinatura.

**Teste que mata o conserto se revertido:**
`__tests__/seguranca/o-aviso-do-vizinho.test.ts`. Prova as duas metades: aviso
de outro workspace não é tocado (`count: 0` → `false`) e o dono legítimo
continua marcando/dispensando normalmente. O teste pré-existente
`__tests__/esteira/avisos.test.ts` foi ajustado para a nova assinatura
(`updateMany` no lugar de `update`, `workspaceId` no meio dos argumentos) —
sem isso ele quebraria por assinatura, não por comportamento.

---

## 🔴 Furo 3 — ACHADO e NÃO CONSERTADO: `admin/pagamentos` registra pagamento em `clientRequestId` de qualquer workspace

**Onde:** `app/api/admin/pagamentos/route.ts` → `registrarPagamento` em
`lib/agency/financeiro/portao-de-pagamento.ts`.

**O que faz:** a rota exige sessão de agência (`isAgencyRole`, não-portal) e
CSRF, mas o `clientRequestId` do corpo nunca é conferido contra
`session.workspaceId` — nem na rota, nem dentro de `registrarPagamento`, que
faz `prisma.pagamentoConfirmado.upsert({ where: { clientRequestId } })` puro.

**O que um vizinho de inquilino alcança:** qualquer sessão `master`/
`project_manager` desta casa (de **qualquer** workspace) consegue registrar
uma `PagamentoConfirmado` para o `clientRequestId` de **outra** agência —
gravando "pago via manual, R$ X, confirmado por mim" na testemunha exata que
o portão de pagamento (`conferirPagamento`) usa para liberar produção. Isso
libera a produção (gasta a chave de IA e os créditos) de um pedido de outra
agência sem que ela tenha pedido nada, e a linha fica com o `registradoPor`
de quem não deveria estar mexendo ali.

**Por que eu NÃO consertei — a régua da minha própria constituição:**
`docs/kit/23-constituicao-dos-essenciais.md`, SEGURANÇA, item 3: com
autorização humana está "qualquer correção que toque **pagamento** ou
integração com parceiro". Esta rota, pelo próprio nome, cabeçalho e corpo do
arquivo-fonte ("registrar que o dinheiro entrou"), é a definição literal de
pagamento desta casa — a mesma trava que a rodada 1 já aplicou aos três furos
da família parceria (`docs/diagnosticos/varredura-de-posse-no-corpo-29-08.md`,
furos 2–4). Não é "pequeno" nem "prazo apertado": é a única classe da minha
constituição sem exceção.

**Ponto de reversão, para quando alguém autorizar o conserto:** reversível em
minutos, e o padrão já existe nesta casa — `solicitacaoDoWorkspace(clientRequestId,
session.workspaceId)` (`lib/auth/posse-de-workspace.ts`), chamado no início do
`POST` de `app/api/admin/pagamentos/route.ts`, devolvendo `naoEncontrado()`
(404, nunca 403) quando a posse falha. Nenhuma mudança em
`registrarPagamento` é necessária — a conferência é da rota, como em todas as
outras 20 rotas limpas deste lote.

**Quem consegue fazer o quê, hoje vs. depois da correção (quando autorizada):**
- Hoje: qualquer `master`/`project_manager` desta casa registra pagamento (e
  libera produção) para o `clientRequestId` de **qualquer** outra agência.
- Depois: só registra pagamento para pedido do **próprio workspace** —
  `clientRequestId` alheio responde 404, e `registrarPagamento` nunca é
  chamado.

**Escalado ao PM** (que decide se sobe ao Diretor/CEO, conforme a mesma trava
já aplicada aos furos de parceria da rodada 1).

---

## Observações registradas, não vereditos de furo

1. **`app/api/admin/reset-request/route.ts` — o atalho `x-admin-secret`.**
   Quando o cabeçalho bate (`segredoConfere`, comparação em tempo constante,
   fail-closed sem `ADMIN_TASK_SECRET` configurado), a rota roda **sem**
   `workspaceScope` — de propósito, é um bypass de administração, documentado
   no próprio arquivo como "o pior dos seis". ⚠️ Note bem: isto é DIFERENTE
   de `/api/admin/reset` (`ALLOW_PRODUCTION_RESET`, coberto por
   `__tests__/seguranca/porta-de-reset-se-denuncia.test.ts`) — são duas rotas
   de nomes parecidos e segredos diferentes; a de admin/pagamentos-secret
   (`ADMIN_TASK_SECRET`) não tem teste de segurança dedicado nesta casa até
   onde eu vi. Não é o mesmo padrão dos furos acima (id vindo da requisição
   sem posse): é um segredo de operador que, por desenho, dá acesso à casa
   inteira — o mesmo espírito do `CRON_SECRET`. Não toquei; registro para o
   PM avaliar se vale um teste de "fail-closed sem o segredo" dedicado a
   `ADMIN_TASK_SECRET`, fora do escopo desta ficha (que é posse por id, não
   inventário de segredo).

2. **Os seis `agents/*/generate` (#8–#13).** `clientId`/`projectId` só existem
   para rotular o `AIRunLog` de custo (`generate({ ..., clientId, projectId,
   workspaceId: session.workspaceId })`). `escolhaDoCliente` usa a chave
   composta `workspaceId_clientId` — um `clientId` de outro workspace nunca
   bate, cai no padrão da casa e não lê nada alheio. O risco real aqui é
   **mislabeling** (o log de custo do MEU workspace fica com um `clientId`
   que não é meu), não vazamento de dado de outro inquilino — e já está
   registrado em `docs/agents/seguranca/vitrine.md` (item 3, "custo sem
   dono") e `docs/pendencias.md` para dois deles (`social/generate`,
   `design/generate`, onde o campo é opcional). Não abri um furo novo aqui;
   deixei a observação para o PM decidir se vale endurecer (`clientId`
   presente mas de outro workspace → ignorar e logar sem dono, em vez de
   aceitar).

## O que ficou declarado e não feito

- O furo 3 (`admin/pagamentos`) — autorização humana obrigatória, sem
  exceção, conforme minha constituição.
- Não abri nenhum arquivo fora das 23 linhas do lote A (o lote B é de outra
  frente).
- Não subi o app com duas sessões reais ponta a ponta — toda prova aqui é
  leitura de código + os testes de unidade novos, com Prisma dublado.
- Não rodei `npx tsc --noEmit` nem `vitest` — a sandbox recusa (`This command
  requires approval`), e a ficha já determina que o portão e o commit são do
  PM.

---

## Resumo para o PM

- **Rotas lidas:** as 23 do lote A, todas inteiras, mais 8 arquivos de
  biblioteca por trás delas (listados nos comandos).
- **Furos achados:** 3.
- **Furos fechados:** 2 — `agency/escada` (`liberar_cliente`) e `avisos`
  (`marcarComoEnviado`/`dispensar`), cada um com teste que prova as duas
  metades.
- **Furos escalados, não consertados:** 1 — `admin/pagamentos`, toca
  pagamento, exige autorização humana pela minha própria constituição.
- **Arquivos que escrevi:**
  - `/home/user/diolidigital/app/api/agency/escada/route.ts` (conserto)
  - `/home/user/diolidigital/lib/agency/esteira/avisos.ts` (conserto)
  - `/home/user/diolidigital/app/api/avisos/route.ts` (conserto — nova assinatura)
  - `/home/user/diolidigital/__tests__/esteira/avisos.test.ts` (ajuste de assinatura, pré-existente)
  - `/home/user/diolidigital/__tests__/seguranca/o-cliente-do-vizinho-na-escada.test.ts` (novo)
  - `/home/user/diolidigital/__tests__/seguranca/o-aviso-do-vizinho.test.ts` (novo)
  - `/home/user/diolidigital/docs/diagnosticos/varredura-de-posse-rodada2-lote-A.md` (este documento)
- **O que ficou declarado e não feito, e por quê:** o furo de `admin/pagamentos`
  (autorização humana obrigatória) e as observações sobre o bypass de admin
  do `reset-request` e o mislabeling de custo nos seis `agents/*/generate`.

---

## 🔎 AUDITORIA DO PM — a colisão com o PR #169, conferida linha a linha

O Diretor mandou conferir, antes de escrever conserto novo, se os PRs abertos
**#165, #166 e #169** já traziam conserto para os mesmos furos. Conferido com o
diff completo contra a base de cada um (não só o commit do topo, que engana):

```sh
for n in 165 166 169; do
  git fetch -q origin refs/pull/$n/head
  mb=$(git merge-base FETCH_HEAD origin/claude/dioli-agency-os-architecture-kk7kp)
  git diff --stat $mb FETCH_HEAD
done
```

### 🔴 Corrijo o recado: #165 e #166 NÃO trazem conserto de posse

- **#165** é a porta da frente (alarme, fila de peças, capturas de tela, o
  `contato-do-lead`, o despertador). Nenhum arquivo de posse entre inquilinos.
- **#166** é a esteira assistida (fila da sala, recusa visível, vigilância de
  handoff) + migration + `lib/generated/prisma/*`. Nenhum arquivo de posse.

Quem olhar `git show FETCH_HEAD --stat` vê só o **último commit** do PR e tira a
conclusão errada — no #165 esse commit é "as capturas da porta voltam", 12 PNGs.
É por isso que a conferência aqui foi contra o **merge-base**, e não contra o topo.

### ✅ #169 colide de verdade — e os dois consertos são COMPLEMENTARES, não repetidos

`#169` toca `app/api/agency/escada/route.ts`, o mesmo arquivo desta rodada. Mas
as duas mudanças respondem a perguntas diferentes, e **nenhuma das duas cobre a
outra**:

| | #169 (16/08, aberto) | esta rodada (29/08) |
|---|---|---|
| Pergunta | **QUEM** pode mexer na escada | **DE QUEM É** o `clientId` que veio no corpo |
| Como | troca `getSession()` por `exigirAdministracao("/agency/escada")` | `clienteDoWorkspace(body.clientId, session.workspaceId)` → 404 |
| Deixa aberto | um `master` legítimo ainda grava o id de um cliente de OUTRA agência na allowlist do próprio departamento | um `design_staff` ainda derruba departamento para sombra |

O comentário do próprio #169 diz que `social_staff` executou `liberar_cliente`
"com um `clientId` arbitrário do corpo" — ele fechou o **papel**, e o `clientId`
arbitrário continuou arbitrário. **Mergear #169 não dispensa este conserto, e
este conserto não dispensa #169.**

**Conflito de merge esperado:** os dois editam o cabeçalho e o `import` do mesmo
arquivo. Resolução: ficam os dois — a guarda de papel de #169 no topo de cada
verbo, a conferência de posse dentro do ramo `liberar_cliente`.
