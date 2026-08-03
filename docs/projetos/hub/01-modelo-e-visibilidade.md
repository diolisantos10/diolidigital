# Hub do Cliente — Fase 1: Modelo de Objetos e Contrato de Visibilidade (v1)

> **Documento para abrir a cabeça de quem vai construir.** Base: o schema REAL
> (`prisma/schema.prisma`) e o código REAL (`lib/agency/`, `app/api/portal/`),
> não um modelo imaginário. Escrito em 03/08/2026 como entregável da Fase 1 do
> projeto Hub do Cliente (`docs/projetos/hub-do-cliente-projeto.md`).
>
> **Regra deste documento: lacuna declarada vale mais que invenção.** Onde o
> sistema não tem o objeto, está escrito "NÃO EXISTE" com a ficha do que precisa
> nascer. Onde a filtragem de visibilidade não acontece, está escrito "não
> acontece".

---

## Leitura de 1 minuto

- Dos 16 objetos do briefing, **10 têm correspondente real no schema** (alguns
  parciais), **3 existem só como fragmento dentro de outro objeto** (Versão,
  Marco, Métrica) e **3 não existem como objeto** (Contrato, Módulo de serviço,
  Decisão).
- **Nenhum objeto do schema tem campo de visibilidade de três estados**
  (interno / aguardando publicação / compartilhado com o cliente). O que existe
  hoje são dois booleanos (`ApprovalRequest.clientVisible`,
  `ApprovalComment.isClientVisible`) e filtragem por *seleção de campos* nas
  rotas do portal — dependente da disciplina de cada rota, não do modelo.
- O maior risco de vazamento hoje: **objetos sem flag nenhuma** (Deliverable,
  MediaAsset, SocialPost, TimelineEvent) chegam ao portal porque a rota escolhe
  o que mandar. Uma rota nova escrita sem esse cuidado vaza por padrão.
- A máquina de estados pedida (rascunho → revisão interna → pronto para o
  cliente → publicado → rejeitado) **já existe espalhada e com nomes diferentes**
  em `Deliverable.status`, `SocialPost.status` e `ApprovalRequest.status`. O
  trabalho é unificar o vocabulário, não inventar o fluxo.

---

## 1. Modelo de Objetos v1 — os 16 objetos mapeados no schema real

Convenção das fichas: **Existe** (modelo Prisma correspondente) · **Campos que
já cobrem** · **Falta** · quando não existe, **ficha do objeto novo**.

### 1.1 Cliente

- **Existe:** `Client` (+ `BrandBrain` 1:1 como extensão de conhecimento de marca).
- **Já cobre:** identidade (`name`, `industry`, `email`, `phone`, `website`),
  acesso ao portal (`portalToken`), vínculo com workspace, projetos, avisos
  (`ClientNotice`), marca (`BrandBrain`, `BrandUpdate`).
- **Falta:**
  - Campo de visibilidade não se aplica ao objeto em si, mas **campos internos
    sobre o cliente não têm onde morar**: não existe "nota interna sobre o
    cliente", margem, saúde da conta. Se nascerem, precisam nascer já marcados
    como internos.
  - `ClientRequestDb` duplica o conceito ("cliente que pediu" vs "cliente
    cadastrado") — hoje um cliente real vive metade em `Client`, metade em
    `ClientRequestDb` (via `clientId` opcional). O Hub precisa decidir que
    `Client` é a âncora e `ClientRequestDb` é um *pedido* do cliente, não outro
    cliente.

### 1.2 Usuário

- **Existe:** `User`.
- **Já cobre:** auth (`email`, `passwordHash`), papel (`role`: master |
  project_manager | social_staff | design_staff | ads_staff | client), vínculo
  `clientId` para usuário-cliente.
- **Falta:**
  - **Agente de IA não é um `User`.** Agentes são strings soltas
    (`Project.agents` JSON, `Task.agentId`, `Deliverable.ownerAgentId`,
    `MediaAsset.uploadedBy`). O briefing exige executor identificável — hoje a
    identidade do executor IA não é um objeto, é um rótulo. Mínimo: uma tabela
    (ou convenção fechada) de identidade de executor, humano ou IA, referenciável
    por todos os objetos que registram autoria.
  - O acesso do cliente ao portal **não passa por `User`** na prática: passa por
    `PortalAccess.token` / `Client.portalToken`. Duas portas de autenticação
    paralelas — o contrato de visibilidade precisa valer para as duas.

### 1.3 Contrato

- **NÃO EXISTE como objeto.** O que há são fragmentos: `Project.proposalStatus`
  / `proposalPricing` / `proposalScope` / `proposalSentAt` (a proposta colada no
  projeto) e a aprovação de proposta via `ApprovalRequest` com
  `department: "proposal"`.
- **Ficha do objeto novo — `Contract`:**
  - Campos mínimos: `id`, `clientId`, `status` (rascunho | enviado | aceito |
    encerrado), `scopeJson` (módulos contratados), `pricing`, `startsOn`,
    `endsOn`, `acceptedAt`, `acceptedBy` (registro da decisão do cliente),
    `visibility` (padrão: **compartilhado** — o cliente vê o próprio contrato;
    margem e custo NUNCA moram aqui, moram no lado interno).
  - Relações: `Client` 1:N `Contract`; `Contract` 1:N `Project` (hoje projeto
    nasce de pedido, não de contrato — o contrato é o que liga "o que foi
    vendido" a "o que está sendo feito").
  - Ciclo: rascunho → enviado → aceito → encerrado (aceite move só o cliente;
    encerramento move só coordenador/master).
  - Observação honesta: nada no sistema hoje quebra sem esse objeto — mas o
    módulo de serviço (1.5) e o portal ("o que eu contratei?") não têm âncora
    sem ele.

### 1.4 Projeto

- **Existe:** `Project` (+ `ClientRequestDb` como origem, + `Cycle` como
  operação mensal).
- **Já cobre:** identidade, `stage` (default "briefing"), prioridade, prazo,
  proposta embutida, execução durável (`executionStatus`: idle | pending |
  running | done | failed), e os **três carimbos de decisão** que são a melhor
  ideia do schema atual: `directionApprovedAt`, `presentedAt`,
  `clientApprovedAt` — momentos, não status (a fase é derivada em
  `lib/agency/esteira/fases.ts`).
- **Falta:** campo de visibilidade (todo projeto é implicitamente visível ao
  seu cliente); a dualidade `Project` × `ClientRequestDb` — o portal ancora em
  `ClientRequestDb` (mensagens, aprovações, artefatos) e a produção ancora em
  `Project` (entregas, tarefas, ciclos), ligados por `Project.clientRequestId`.
  O Hub precisa apresentar UM "Projeto" ao cliente; a costura hoje é feita rota
  a rota.

### 1.5 Módulo de serviço

- **NÃO EXISTE como objeto de dados.** Existe como catálogo em código:
  `lib/agency/service-catalog.ts`, `self-serve-catalog.ts`,
  `production-templates.ts`, e como strings em `ClientRequestDb.services`
  (JSON) e `Project.type`.
- **Ficha do objeto novo — `ServiceModule`:**
  - Campos mínimos: `id`, `slug` (fechado, ex.: `social`, `paid-traffic`),
    `name`, `description`, `defaultDeliverables` (JSON: tipos de entregável que
    o módulo produz), `defaultApprovals` (JSON), `defaultMetrics` (JSON),
    `active`.
  - Relações: `Contract` N:M `ServiceModule` (o que foi vendido);
    `Project`/`Cycle` referenciam módulos (o que está sendo executado).
  - Visibilidade: **compartilhado** (nome e descrição); preço interno de custo,
    se existir, é interno.
  - Ver seção 4 — módulos v0 derivados do que o sistema JÁ opera.

### 1.6 Marco

- **Existe como fragmento, não como tabela.** Os marcos reais do sistema são:
  os três carimbos de `Project` (`directionApprovedAt`, `presentedAt`,
  `clientApprovedAt` — movidos por `lib/agency/esteira/marcos.ts`), a trilha de
  fases derivada (`esteira/fases.ts`, exposta ao cliente em
  `/api/portal/esteira` como `trilha`), e `Cycle.presentedAt`/`closedAt`.
- **Falta:** marco arbitrário com data-alvo ("entrega do site em 20/09") não
  tem onde morar. **Ficha — `Milestone`:** `id`, `projectId`, `label`,
  `dueOn`, `reachedAt`, `visibility` (padrão: **compartilhado** — marco é
  exatamente o que o cliente quer ver), ordem. Ciclo: previsto → atingido (ou
  reprogramado, com histórico). Decisão de projeto: talvez a trilha derivada
  baste para o MVP — declarar isso na Fase 2 em vez de criar tabela por
  reflexo.

### 1.7 Tarefa

- **Existe:** `Task` (+ `MaterialRequest` como "tarefa do cliente").
- **Já cobre:** `projectId`, `title`, `agentId` (executor), `status` (default
  "pending"), `dueDate`, vínculo a entregável (`deliverableId`).
- **Falta:** visibilidade (tarefa é o objeto MAIS interno da casa — padrão tem
  que ser **interno**, e hoje não há campo dizendo isso); os campos de execução
  por IA do briefing (instrução, fonte usada, responsável humano) — hoje só
  `agentId`. `MaterialRequest` já é, na prática, a "Pendência do cliente" do
  briefing (com `askedClientAt` controlando o que já foi pedido — o portal
  filtra por `jaFoiPedido` em `/api/portal/esteira`): é o embrião correto do
  Bloco de Pendência.

### 1.8 Entregável

- **Existe:** `Deliverable` (conteúdo produzido) + `BrainArtifact` (canvas de
  departamento aprovado) — dois objetos para o mesmo conceito, em camadas
  diferentes do pipeline.
- **Já cobre:** `status` (valores reais em uso: **draft | in_review | approved
  | delivered** — evidência em `lib/agency/deliverables.ts` e
  `execution/run-execution.ts`), `version` (Int), `revisionHistory` (JSON),
  `clientFeedback`, `ownerAgentId`, `cycleId` (entrega do mês).
- **Falta:**
  - **Campo de visibilidade — o furo mais grave do modelo.** O portal decide o
    que mostrar cruzando `ApprovalRequest.clientVisible` com o departamento
    (`app/api/brain/portal-data/route.ts` monta `deliverableContentFor` por
    `ownerAgentId`); o `Deliverable` em si não sabe se é visível.
  - Estado "pronto para o cliente" distinto de "em revisão interna" — hoje
    `in_review` significa "aguardando aprovação do cliente" (comentário em
    `deliverables.ts:106`), ou seja, **não existe estado de revisão interna**
    no vocabulário do Deliverable. Ver seção 3.
  - Campos de execução por IA: instrução e fonte usada (há `AIRunLog`, mas sem
    chave para o Deliverable — o rastro existe e não se liga à peça).

### 1.9 Versão

- **Existe como fragmento:** `Deliverable.version` (Int) +
  `Deliverable.revisionHistory` (JSON string) + `BrainArtifact.version`.
- **Falta:** versão como registro de primeira classe. JSON dentro de coluna não
  dá query ("quais entregas foram reprovadas 2x?"), não preserva o CONTEÚDO de
  cada versão (o histórico guarda notas, não o corpo anterior — a exigência do
  briefing "gera nova versão sem apagar a anterior" não é cumprível hoje: o
  `content` é sobrescrito).
- **Ficha — `DeliverableVersion`:** `id`, `deliverableId`, `number`,
  `content`, `mediaAssetIds`, `createdBy` (executor), `createdAt`, `note`.
  Imutável após criada. Visibilidade herdada do Deliverable: cliente vê as
  versões que lhe foram apresentadas, nunca rascunhos intermediários.

### 1.10 Aprovação

- **Existe — e é o objeto mais maduro do schema:** `ApprovalRequest` +
  `ApprovalComment`. O briefing pede aprovação como objeto próprio; a casa já
  tem.
- **Já cobre:** `status` (valores reais: **pending | approved |
  revision_requested | rejected**, mapeados em `app/api/portal/approvals/route.ts`),
  `clientVisible` (a ÚNICA flag de visibilidade de verdade no schema),
  `reviewedBy`/`reviewedAt` (autor e data da decisão), `expiresAt` (prazo),
  comentários com `isClientVisible`, e efeitos reais da decisão (aprovar
  proposta cria projeto; rejeitar dispara refação via `esteira/refacao.ts`;
  última aprovação chama `aprovarPacote`).
- **Falta:** vínculo forte ao que está sendo aprovado — `artifactId` é string
  solta, não FK, e não há vínculo a `Deliverable` nem a versão específica
  ("aprovado a versão 3" não é registrável); os três caminhos do briefing são
  dois e meio (`request_revision` cumpre "Solicitar ajustes"; "Tenho uma
  dúvida" não existe — hoje viraria `PortalMessage` desconectada da aprovação);
  comentário obrigatório no ajuste não é imposto (o código aceita
  `revision_requested` sem `comment`).

### 1.11 Decisão

- **NÃO EXISTE como objeto do cliente.** O que há de parecido serve à
  governança interna do cérebro (`BrainChangeRequest`, `BrainVersion`,
  `DbAgentSuggestion`) ou são carimbos (`directionApprovedAt` etc.). "Decisão
  registrada" — o bloco que o briefing pede — não tem tabela.
- **Ficha — `Decision`:** `id`, `clientId`, `projectId?`, `summary` (uma
  frase), `context`, `decidedBy` (cliente ou agência, nominal), `decidedAt`,
  `sourceType`/`sourceId` (aprovação, mensagem, reunião — de onde a decisão
  veio), `visibility` (padrão: **compartilhado** — decisão registrada existe
  para os dois lados pararem de rediscutir). Imutável; revoga-se criando outra.
  No MVP pode nascer DERIVADA: toda `ApprovalRequest` decidida gera uma linha
  de decisão — melhor um espelho automático que uma tabela vazia.

### 1.12 Mensagem

- **Existe:** `PortalMessage` (thread cliente ↔ equipe por `clientRequestId`,
  com `authorRole`, flags de leitura) + `WhatsAppMessage` (inbox WhatsApp) +
  `ClientNotice` (aviso com garantia de entrega).
- **Falta:** **ancoragem em contexto** — o MVP do briefing pede "mensagens
  ancoradas"; `PortalMessage` só ancora no pedido inteiro, não em entregável,
  aprovação ou versão (adicionar `anchorType`/`anchorId`). Visibilidade:
  `PortalMessage` é por construção compartilhada (não há mensagem interna na
  thread — nota interna da equipe não tem onde morar; se nascer, nasce com
  visibilidade `interno` e o campo passa a ser obrigatório).

### 1.13 Arquivo

- **Existe:** `MediaAsset` — e com a melhor segurança da casa (dono gravado,
  download resolve dono a partir do token, caminho derivado do id).
- **Já cobre:** dono (`clientRequestId`/`clientId`/`projectId`), `kind`
  (**inbound | generated | deliverable** — já é meia visibilidade: inbound é do
  cliente, generated é interno, deliverable vai ao cliente), dedupe (`sha256`),
  autoria (`uploadedBy`).
- **Falta:** o `kind` insinua visibilidade mas não a formaliza — um `generated`
  que a agência decide mostrar não tem transição registrada; falta vínculo a
  `Deliverable`/versão (a arte da v2 não sabe que é da v2).

### 1.14 Métrica

- **Existe como fragmento:** `Cycle.resultsJson` (números do fechamento do mês,
  JSON), `SocialPost.externalPostId` (chave para pedir métricas à Meta),
  leitura de desempenho pago em `esteira/trafego.ts` (`lerDesempenho`),
  `lib/agency/reporting.ts`. **Não há tabela de métrica.**
- **Posição honesta:** o briefing decidiu que renderização de analytics no MVP
  é EMBEDADA, não nativa. Portanto **não criar tabela de métrica agora é a
  decisão certa**, desde que declarada. O que o Hub precisa: o `Cycle` como
  portador do resultado do mês (já existe) + a ficha futura — `Metric`:
  `moduleSlug`, `name`, `value`, `target` (obrigatório: métrica sem meta é
  decoração, risco listado no projeto), `period`, `source`, visibilidade padrão
  **compartilhado**.

### 1.15 Integração

- **Existe — três tabelas por ciclo de vida, de propósito:** `MetaConnection`
  (IG/FB/WhatsApp), `GoogleConnection` (Business Profile, com
  `autoReplyConsentAt` — consentimento como dado, não como prosa) e
  `DbIntegrationConfig` (chaves de provedores IA da agência).
- **Já cobre:** `status` (connected | expired | revoked | error),
  `lastSyncedAt`, escopos, dono (`clientId` nulo = conta da própria agência),
  criptografia dos tokens.
- **Falta para o checklist de Conta do briefing:** "quem conectou" (não há
  campo de autor da conexão); saúde agregada/última verificação como conceito
  de UI; e o contrato de visibilidade explícito: o cliente vê **status e nome**
  da própria conexão, NUNCA token (nem criptografado), NUNCA conexão de outro
  cliente, NUNCA `DbIntegrationConfig` (que é 100% interno). Hoje
  `/api/portal/conexoes` seleciona campos à mão — funciona, mas é disciplina de
  rota, não regra de modelo.

### 1.16 Evento de auditoria

- **Existe parcialmente:** `ActivityEvent` (workspace-wide, `type` + `message`
  livre), `TimelineEvent` (por projeto, com `dept`), `AIRunLog` (execuções de
  IA — o rastro executor/provedor/aviso mais próximo do que o briefing pede).
- **Falta para ser auditoria de verdade:** ator (quem fez — nenhum dos três
  grava userId/agente de forma estruturada), objeto-alvo (`targetType` +
  `targetId` — hoje é prosa em `message`), imutabilidade garantida, e o evento
  de MUDANÇA DE VISIBILIDADE (quando algo passou de interno a compartilhado,
  quem publicou). A métrica de sucesso do projeto — "conteúdo de IA publicado
  sem estado de revisão registrado = zero" — **só é medível com esse evento
  estruturado**; hoje não é medível.

### Resumo do mapeamento

| # | Objeto do briefing | Schema real | Situação |
|---|---|---|---|
| 1 | Cliente | `Client` (+`BrandBrain`) | existe |
| 2 | Usuário | `User` | existe; agente IA não é identidade |
| 3 | Contrato | — (fragmentos em `Project.proposal*`) | **não existe** |
| 4 | Projeto | `Project` + `ClientRequestDb` + `Cycle` | existe, duplicado em 2 âncoras |
| 5 | Módulo de serviço | — (catálogo em código) | **não existe como dado** |
| 6 | Marco | carimbos de `Project` + trilha derivada | fragmento |
| 7 | Tarefa | `Task` + `MaterialRequest` | existe |
| 8 | Entregável | `Deliverable` + `BrainArtifact` | existe, sem visibilidade |
| 9 | Versão | `Deliverable.version` + JSON | fragmento; conteúdo anterior se perde |
| 10 | Aprovação | `ApprovalRequest` + `ApprovalComment` | **existe e é o mais maduro** |
| 11 | Decisão | — | **não existe** |
| 12 | Mensagem | `PortalMessage` (+WhatsApp, +`ClientNotice`) | existe, sem ancoragem |
| 13 | Arquivo | `MediaAsset` | existe, `kind` ≈ meia visibilidade |
| 14 | Métrica | `Cycle.resultsJson` + integrações | fragmento (decisão: embed no MVP) |
| 15 | Integração | `MetaConnection`/`GoogleConnection`/`DbIntegrationConfig` | existe |
| 16 | Evento de auditoria | `ActivityEvent`/`TimelineEvent`/`AIRunLog` | parcial; sem ator/alvo |

---

## 2. Contrato de Visibilidade v1

**Os três estados do briefing:** `interno` · `aguardando_publicacao` ·
`compartilhado`. **Regra inegociável: filtragem no backend, nunca só na tela.**

**Personas desta casa** (adaptação declarada: o briefing lista "prestador";
esta agência não tem prestador externo hoje — roda 100% IA):

- **cliente** — entra por token de portal (`PortalAccess`/`portalToken`);
- **executor** — agente de IA (e staff: social_staff, design_staff, ads_staff);
- **coordenador** — project_manager / o Diretor;
- **master** — vê tudo, sempre.

### 2.1 Tabela objeto × persona × padrão

Legenda: ✅ vê tudo do objeto · 👁 vê versão filtrada (campos/linhas) · ❌ não vê.

| Objeto | Padrão | cliente | executor | coordenador | master | Onde a filtragem acontece HOJE |
|---|---|---|---|---|---|---|
| Cliente | compartilhado (o próprio) | 👁 só o próprio, campos de contato | ✅ | ✅ | ✅ | `portal-data` resolve por token; **não há noção de campo interno de cliente** |
| Usuário | interno | ❌ (vê só a si) | 👁 | ✅ | ✅ | rotas com `requireSession`; sem filtragem por papel fina |
| Contrato | compartilhado (sem custo/margem) | 👁 | ❌ | ✅ | ✅ | **não acontece — objeto não existe**; proposta vai ao portal via approval `department:"proposal"` |
| Projeto | compartilhado (leitura do cliente) | 👁 tradução em `/api/portal/esteira` (etapa, pendências, trilha — nada de erro de execução ou agente) | ✅ | ✅ | ✅ | `app/api/portal/esteira/route.ts` (seleção explícita de campos, comentado: "Só o que é do cliente") |
| Módulo de serviço | compartilhado | 👁 | ✅ | ✅ | ✅ | **não acontece — catálogo em código, sem dado** |
| Marco | compartilhado | 👁 trilha em linguagem de cliente | ✅ | ✅ | ✅ | derivado em `esteira/fases.ts`, traduzido na rota do portal |
| Tarefa | **interno** | ❌ (exceto `MaterialRequest` já pedido) | ✅ as suas | ✅ | ✅ | portal não expõe `Task`; `MaterialRequest` filtrado por `askedClientAt` (`jaFoiPedido`) na rota da esteira |
| Entregável | **aguardando_publicacao** | 👁 só quando o approval do dept é `clientVisible` | ✅ | ✅ | ✅ | `app/api/brain/portal-data/route.ts` — cruza `ApprovalRequest.clientVisible` + casa conteúdo por `ownerAgentId`. **O Deliverable em si não tem flag: a visibilidade é emprestada da aprovação** |
| Versão | herda do entregável | 👁 só versões apresentadas | ✅ | ✅ | ✅ | **não acontece — conteúdo anterior é sobrescrito; histórico JSON não vai ao portal** |
| Aprovação | compartilhado quando `clientVisible` | 👁 linhas `clientVisible:true`; comentários `isClientVisible:true` | 👁 | ✅ | ✅ | **o único caso completo:** `portal-data` (linhas 139–143) e `portal/approvals` (nega ação em approval não visível — checagem no backend, linha 81) |
| Decisão | compartilhado | 👁 | 👁 | ✅ | ✅ | **não acontece — objeto não existe** |
| Mensagem | compartilhado (a thread do portal) | ✅ a própria thread | 👁 | ✅ | ✅ | `app/api/portal/messages/route.ts` por token; **não há mensagem interna na thread — se criarem, vaza por padrão** |
| Arquivo | por `kind`: inbound=compartilhado, generated=**interno**, deliverable=compartilhado | 👁 | ✅ | ✅ | ✅ | rota de mídia resolve o DONO pelo token (segurança por derivação, `MediaAsset` header) — mas **não filtra por `kind`: formalizar** |
| Métrica | compartilhado (com meta) | 👁 resumo do ciclo (`/api/portal/esteira` → `ciclo`) | ✅ | ✅ | ✅ | rota da esteira manda só `referencia` + `resumo`; `resultsJson` bruto não vai |
| Integração | 👁 status da própria conexão | 👁 nome+status, nunca token | 👁 | ✅ | ✅ | `app/api/portal/conexoes/route.ts` (seleção manual de campos); `DbIntegrationConfig` é ❌ para cliente sempre |
| Evento de auditoria | **interno** | ❌ (vê timeline traduzida, não o log) | 👁 | ✅ | ✅ | portal não expõe `ActivityEvent`/`AIRunLog`; timeline do cliente é a trilha derivada |

### 2.2 O que a tabela revela

1. **Só a Aprovação tem visibilidade como dado.** Todo o resto é filtragem por
   seleção de campos dentro de cada rota — correta hoje, frágil amanhã: a
   próxima rota escrita sem o mesmo cuidado vaza. A regra do briefing (campo
   obrigatório em cada objeto + filtro no backend) pede que a flag more no
   MODELO e o filtro more numa camada única de leitura do portal, não em cada
   handler.
2. **Padrão perigoso a corrigir por design:** objeto novo sem campo de
   visibilidade deve nascer **interno** (fail-closed). Hoje o "padrão" é o que
   a rota esquecer de filtrar — fail-open.
3. **Duas portas de autenticação** (sessão + token de portal) exigem que o
   contrato seja aplicado na leitura dos dados, não no tipo de login.
4. O teste de vazamento da Fase 4 do projeto (endpoint a endpoint com
   credencial de cliente) é o critério de aceite deste contrato — este
   documento lista onde ele vai reprovar hoje: versões, arquivos `generated`
   sem filtro por `kind`, e qualquer campo novo em rotas de portal.

---

## 3. Máquina de estados da execução por IA

**Alvo do briefing:** `rascunho → revisão interna → pronto para o cliente →
publicado → rejeitado`, com a regra dura: **nenhum caminho chega a "publicado"
sem passar por "revisão interna"** — e, nesta casa 100% IA, "revisão interna"
significa hoje **gate executável**, não humano olhando (e os gates executáveis
são 3 de 31 — buraco declarado no CLAUDE.md; a máquina de estados não conserta
isso, só torna o buraco visível e auditável).

### 3.1 Estados reais que o schema usa hoje

| Modelo.campo | Valores reais em uso (evidência) |
|---|---|
| `Deliverable.status` | **draft · in_review · approved · delivered** (`lib/agency/deliverables.ts:80–108`; `run-execution.ts` cria direto em `in_review`) |
| `SocialPost.status` | **draft · scheduled · approved · published · failed** (comentário do schema; fluxo em `esteira/publicacao.ts`: agendar=draft → aprovar pacote=scheduled → relógio publica) |
| `ApprovalRequest.status` | **pending · approved · revision_requested · rejected** (`app/api/portal/approvals/route.ts:20–24`) |
| `Project.executionStatus` | idle · pending · running · done · failed |
| `Cycle.status` | aberto · entregue · fechado |
| `GoogleReview.status` | pendente · respondida · escalada · ignorada |
| `BrainArtifact.status` | approved (default) |
| `MarketInsight.status` | active · pending · archived · rejected |

### 3.2 Mapeamento estado-alvo × estado-real

| Estado do briefing | Deliverable hoje | SocialPost hoje | Furo |
|---|---|---|---|
| rascunho | `draft` | `draft` | ok |
| **revisão interna** | **não existe** — `in_review` já significa "aguardando o CLIENTE" (`deliverables.ts:106`) | não existe (o gate roda antes de gravar, sem estado) | **o furo central: a peça pula da produção direto para o cliente sem estado intermediário registrado** |
| pronto para o cliente | `in_review` (com `ApprovalRequest.clientVisible=true` como o ato de "publicar para aprovação") | `scheduled` (após `aprovarPacote`) | o ato de tornar visível não gera evento de auditoria |
| publicado | `approved` / `delivered` | `published` (+ `publishedAt`, `externalPostId`) | dois vocabulários para o mesmo conceito |
| rejeitado | `draft` + `clientFeedback` (volta ao rascunho via `esteira/refacao.ts`) | `failed` (falha técnica ≠ rejeição — conceitos misturados) | rejeição não é estado terminal registrado; vira rascunho e o histórico fica no JSON |

### 3.3 Quem pode mover cada transição (proposta v1)

| Transição | Quem move | Mecanismo hoje |
|---|---|---|
| rascunho → revisão interna | executor (agente IA) ao terminar | não existe; hoje `run-execution.ts` grava direto `in_review` |
| revisão interna → pronto para o cliente | **gate de qualidade executável** (piso determinístico; LLM-judge quando existir) ou coordenador | parcial: `qualityGateJson` em `BrainArtifact`; `conferirPisoDeVerdade` em avaliações |
| revisão interna → rascunho (reprovado no gate) | gate, automático | parcial |
| pronto para o cliente → publicado | **só decisão do cliente** (`ApprovalRequest` aprovada) ou, para posts, o relógio APÓS `aprovarPacote` (que é decisão do cliente) | existe: `portal/approvals` + `esteira/publicacao.ts` — este é o desenho certo, manter |
| pronto para o cliente → rejeitado | cliente (`reject` / `request_revision`) | existe; dispara `refazerPorPedidoDoCliente` |
| rejeitado → rascunho (refação) | executor, automático | existe (`esteira/refacao.ts`) |
| qualquer → publicado **pulando revisão interna** | **NINGUÉM. Trava de modelo, não prompt.** | **não existe a trava** — é o que a Fase 2 do projeto deve especificar como constraint |

**Regra de registro:** toda transição grava evento de auditoria estruturado
(ator, objeto, de→para, quando). Sem isso a métrica "zero conteúdo IA publicado
sem revisão" continua não-medível (seção 1.16).

---

## 4. Módulos de serviço — v0, derivados da operação real

**Declaração obrigatória: NÃO TEMOS 12 meses de faturamento.** O briefing manda
derivar módulos da receita real de ago/2025–jul/2026; a agência não tem esse
histórico (operação começou em 2026; a planilha de receita da Fase 0 do projeto
não existe ainda). **Derivar de faturamento hoje seria inventar dado.**

Em vez disso, os módulos v0 saem do que o sistema **já opera de verdade**, com
evidência em código — e ficam marcados para **re-derivação obrigatória quando
houver 12 meses de faturamento** (gatilho: planilha da Fase 0 preenchida, ou
revisão trimestral, o que vier primeiro).

| Módulo v0 | Evidência de operação real | O que produz hoje |
|---|---|---|
| **Social / Conteúdo** | `esteira/conteudo.ts`, `esteira/publicacao.ts`, `SocialPost` (agendar→aprovar→publicar na Meta), `portal-data` (`social-media`) | calendário, posts, carrosséis, publicação real via Graph API |
| **Tráfego pago** | `esteira/trafego.ts` (campanha criada PAUSADA com teto aprovado), `AdCampaign`, `ads-agent.ts` | plano de mídia + campanha Meta pausada aguardando "pode ir" do cliente |
| **Identidade / Design** | `run-execution.ts` (kit de marca, `design-kit-de-marca`), `BrandBrain`, `MediaAsset kind:generated`, `/api/generate-image` | kit de marca, artes das peças |
| **Avaliações Google (reputação local)** | `esteira/avaliacoes.ts` (4–5★ automático; 1–3★ escalado — nunca sozinho), `GoogleReview`, `GoogleConnection` | resposta a avaliações com trava de consentimento |
| **Estratégia** | `strategy-room.ts`, `StrategyRoom`, `Briefing`, canvases de departamento (`BrainArtifact`) | diagnóstico, direção, proposta |
| **Relacionamento/atendimento (WhatsApp)** | `WhatsAppMessage`, `ClientNotice`, `sdr-agent.ts` | inbox único, avisos com garantia de entrega, SDR |

**O que NÃO entra no v0** (existe no catálogo em código — `service-catalog.ts`,
`self-serve-catalog.ts` — mas sem motor operando de ponta a ponta): site/landing,
SEO, aplicativo, CRM/automação, audiovisual. Listar módulo sem motor seria
vender casinha sem casa — entram quando houver esteira OU faturamento que
justifique construí-la.

> **Nota de honestidade ao critério de aceite da Fase 1 do projeto** ("cada
> módulo aponta para pelo menos um serviço faturado nos últimos 12 meses"):
> este critério é **incumprível hoje** por ausência do dado. O substituto
> declarado é "aponta para um motor que opera de verdade, com arquivo-fonte
> nomeado". Quem decide se o substituto vale é o dono do projeto — não este
> documento.

---

## 5. Pendências que este documento abre (para as fases seguintes)

1. Decidir a âncora única do "Projeto" do cliente (`Project` × `ClientRequestDb`).
2. Especificar o campo `visibility` (3 estados, obrigatório, default `interno`)
   e a camada única de leitura do portal que o aplica.
3. Criar os objetos ausentes na ordem de dor: `DeliverableVersion` (a exigência
   de versão preservada é incumprível hoje) → evento de auditoria estruturado
   (ator+alvo+transição) → `Decision` (pode nascer derivada de approvals) →
   `ServiceModule`/`Contract`.
4. Unificar o vocabulário de status (seção 3.2) sem migração big-bang: mapear
   primeiro, renomear depois.
5. "Tenho uma dúvida" na aprovação + comentário obrigatório no ajuste.
6. Re-derivar módulos quando a planilha de faturamento da Fase 0 existir.

_Fase 1 do Hub do Cliente · escrito em 03/08/2026 · fontes: `prisma/schema.prisma`, `lib/agency/`, `app/api/portal/`, `app/api/brain/portal-data/`._
