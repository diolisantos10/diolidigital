# Hub do Cliente — Fase 0: auditoria do que existe

**Adaptação decidida pelo CEO:** já temos portal construído. A Fase 0 deixa de ser
trial de ferramentas ("comprar vs. construir") e vira auditoria do sistema atual
contra o checklist do MVP. Toda afirmação abaixo tem arquivo como evidência;
o que não foi verificado está declarado como tal.

- Fontes: `docs/projetos/hub-do-cliente-projeto.md` · `docs/projetos/hub-do-cliente-briefing.md`
- Método: leitura estática de código (sem executar o app, sem requisições reais)
- Data: 03/08/2026

---

## 1. As 6 capacidades do MVP contra o sistema atual

| # | Capacidade | Veredito | Evidência |
|---|---|---|---|
| 1 | Projetos e marcos | **PARCIAL** | `prisma/schema.prisma` — `model Project` tem os três carimbos de marco (`directionApprovedAt`, `presentedAt`, `clientApprovedAt`) e `model Cycle` (ciclo mensal com `reference`, `planJson`, `resultsJson`). A fase é DERIVADA do dado real em `lib/agency/esteira/fases.ts` (não digitada). **Falta:** não existe objeto `Marco`/`Milestone` genérico com data prevista e prazo — os marcos são 3 carimbos fixos do fluxo, não marcos configuráveis por template de projeto. |
| 2 | Entregáveis versionados | **PARCIAL** | `prisma/schema.prisma` — `model Deliverable` tem `version Int` e `revisionHistory String @default("[]")` (JSON), e `model BrainArtifact` tem `version`. **Falta:** não há objeto `Versão` de primeira classe preservando o arquivo/conteúdo anterior navegável; no portal o cliente nunca vê versão nem histórico — o conteúdo do Deliverable só aparece como texto dentro do card de aprovação (`app/api/brain/portal-data/route.ts`, fallback `deliverableContentFor`). Pedir ajuste dispara refação (`lib/agency/esteira/refacao`, chamado em `app/api/portal/approvals/route.ts`), mas o cliente não vê "v1 preservada, v2 nova". |
| 3 | Aprovações | **EXISTE** (com lacunas contra o desenho) | Objeto próprio: `model ApprovalRequest` + `model ApprovalComment` (`prisma/schema.prisma`). Rota de decisão do cliente: `app/api/portal/approvals/route.ts` — 3 ações (`approve`, `request_revision`, `reject`), registra autor/data/decisão (`reviewedBy`, `reviewedAt`), comentário vira `ApprovalComment` cliente-visível, aprovação de proposta cria projeto e dispara execução. Tela: seção `approvals` em `app/portal/access/[token]/page.tsx`. **Lacunas vs. briefing:** não existe a ação "Tenho uma dúvida"; o card não mostra versão, prazo nem impacto da demora; comentário no "Pedir ajuste" é opcional (o briefing exige comentário obrigatório no ajuste). |
| 4 | Timeline | **PARCIAL** | `app/api/portal/esteira/route.ts` devolve `trilha` (etapas com estado, derivadas) e `progresso`; `app/portal/access/[token]/page.tsx` renderiza "Andamento da entrega" (DEPT_ORDER + pipeline de `BrainArtifact.approvedAt`). Existe `model TimelineEvent` no schema (`prisma/schema.prisma`), mas **nenhuma rota do portal o expõe** — a timeline do cliente é a trilha de fases, não uma linha do tempo de eventos datados do projeto. |
| 5 | Mensagens ancoradas no contexto | **PARCIAL** | `app/api/portal/messages/route.ts` + `model PortalMessage`: 1 thread por `clientRequestId`, com flags de leitura. `ApprovalComment` é a única mensagem ancorada em objeto (a aprovação). **Falta:** o chat é UM fio geral por solicitação (`ChatDrawer` em `app/portal/access/[token]/page.tsx`) — não há mensagem ancorada em entregável, marco ou arquivo específico, que é o que "ancorada no contexto" significa no briefing. |
| 6 | Permissões de visibilidade | **PARCIAL** | O backend filtra de verdade nos caminhos por token: dono derivado do token (`lib/agency/persistence/portal-access-service.ts`, `resolvePortalClient` — "derivação, não comparação"), `clientVisible` em `ApprovalRequest` e `isClientVisible` em `ApprovalComment` (default `false`, seguro). **Falta:** o campo de visibilidade obrigatório em CADA objeto (decisão [3 de 3] do briefing) não existe — `Deliverable`, `SocialPost`, `MediaAsset`, `TimelineEvent`, `Cycle` não têm campo de visibilidade; o que o cliente vê deles é decidido rota a rota, por convenção, não por contrato de modelo. |

**Leitura de negócio:** nenhuma capacidade está ausente por completo; nenhuma está
completa contra o desenho do CEO. O núcleo forte é Aprovações + derivação de dono
por token. Os furos estruturais são: versão visível ao cliente, marco como objeto,
mensagem ancorada por objeto e campo de visibilidade universal.

---

## 2. Teste de vazamento (estático, por leitura de código)

Escopo: todas as rotas em `app/api/portal/*` mais **toda** rota que aceita token de
portal (grep por `validatePortalAccess` / `resolvePortalClient` / `get("token")`).
9 rotas encontradas e auditadas. Limite do método: leitura de código, sem
requisições reais contra staging — o teste dinâmico do plano (Fase 4 do projeto)
continua devido.

### Rota por rota

| Rota | O que devolve ao portador do token | Dono derivado do token? | Veredito |
|---|---|---|---|
| `app/api/portal/esteira/route.ts` (GET/POST) | GET: `projeto` (nome), `etapa`, `agora`, `oQueEsperamosDeVoce`, `progresso`, `trilha`, `pendencias` (só as `jaFoiPedido`), `ciclo.{referencia,resumo}`. POST: `aprovar_direcao` / `aprovar_pacote`. | Sim — `solicitacaoDoToken()`; POST resolve o projeto a partir da solicitação do token. | **OK.** Campos curados; o próprio código exclui contagem interna, nome de agente e erro de execução (comentário nas linhas 60–61). |
| `app/api/portal/approvals/route.ts` (POST) | `{id, status, reviewedAt}` (+ `projectId` quando aprova proposta). | Sim — carrega a aprovação e confere `clientRequestId`/`clientId` do token antes de qualquer efeito; exige `clientVisible` e `pending`. | **OK.** Checagem de posse antes da checagem de visibilidade (não vaza existência de aprovação alheia). |
| `app/api/portal/messages/route.ts` (GET/POST) | Thread inteira de `PortalMessage` do `clientRequestId` do token: `id, authorRole, authorName, body, createdAt`. | Sim — `resolveTokenRequestId()`. | **OK** para vazamento. Ressalva operacional: POST sem rate-limit (o de upload tem, `app/api/media/route.ts` linha 24) e sem filtro — qualquer nota que a equipe escrever no chat É visível ao cliente por definição. |
| `app/api/portal/messages/suggest/route.ts` (POST) | Rascunho de mensagem gerado por IA. | N/A — **não aceita token**; exige sessão da equipe (`requireSession([...])`). | **OK.** Rota interna, fora da superfície do cliente. |
| `app/api/portal/conexoes/route.ts` (GET) | `conexoes[]: {id, platform, name, status, connectedAt}`. | Sim — `resolvePortalClient(token)`; `where` inclui `workspaceId` E `clientId`. | **OK — é a rota-modelo.** `select` explícito exclui `accessTokenEncrypted`/`tokenHint`/`externalId`; pseudo-conexão `user` (token de usuário Meta) filtrada da resposta. |
| `app/api/brain/portal-data/route.ts` (GET, ramo token) | `businessName, status, segment, targetAudience, socialPlatforms, services, objectives, departments{headline,bullets}, pipeline, approvals{id,department,status,reviewedAt,reviewNote,comments}`. | Sim — `clientRequestId` do token (ou última solicitação do `clientId` do token). Comments filtrados por `isClientVisible: true`; approvals por `clientVisible: true`. | **ATENÇÃO — 2 achados** (abaixo: A1, A2). |
| `app/api/social-posts/route.ts` (GET, ramo token) | Posts do `clientRequestId` do token: `id, clientId, clientRequestId, caption, networks, format, pillar, mediaUrl, script (scriptJson inteiro), scheduledFor, status`. | Sim — `resolveTokenRequestId()`. | **ATENÇÃO — 1 achado** (A3). Não devolve `lastError`, `externalPostId`, `scenesJson` (bom). |
| `app/api/media/route.ts` (POST upload) | `{ok, arquivo}` do arquivo enviado. | Sim — "O DONO VEM DO TOKEN" (linhas 54–56); cliente não escolhe dono do arquivo. Rate limit 20/min por IP. | **OK.** |
| `app/api/media/[id]/route.ts` (GET) | Bytes do arquivo. | Sim — autoriza só se `clientRequestId`/`clientId` do token = os do registro; sessão da equipe só vê o próprio workspace; 404 (não 403) quando é de outro dono; link assinado HMAC com expiração e comparação em tempo constante (`lib/agency/media/armazenamento.ts`, `assinaturaValida`); SVG nunca inline. | **OK — desenho de segurança acima da média.** |
| `app/portal/access/route.ts` (GET redirect) | Redirect para `/portal/access/<token>`. | N/A. | **OK**, mas ver achado sistêmico A4 (token na URL). |
| `app/api/meta/connect-parceiro/route.ts` + `app/api/meta/callback/route.ts` | Início/fim do OAuth Meta do parceiro. | Sim — `resolvePortalClient(token)` nos dois pontos; callback RE-deriva o dono do token no cookie e aborta em `client_mismatch`; state CSRF; token Meta cifrado em repouso (`saveConnection`). | **OK.** Nenhum token de acesso volta ao navegador. |

### SELECTs conferidos campo a campo (rotas que devolvem objetos)

- `portal/conexoes`: `select {id, platform, name, status, connectedAt}` — sem credencial. **Limpo.**
- `brain/portal-data` → `brainArtifact`: `select {id, department, canvasId, canvasJson, version, status, approvedAt}` — o `canvasJson` INTEIRO entra no servidor, mas só `headline`+`bullets` resumidos saem (ver A1).
- `brain/portal-data` → `approvalRequest`: `include comments (select {id, authorName, authorRole, body, createdAt})` com filtro `isClientVisible`. O objeto `ApprovalRequest` é mapeado à mão (não vai cru) — `requestedBy`, `artifactId`, `expiresAt` não saem. **Limpo.**
- `brain/portal-data` → `deliverable`: `select {name, content, ownerAgentId}` — `content` inteiro pode sair como `reviewNote` (ver A2).
- `brain/portal-data` → `clientRequestDb`: `findUnique` sem select (traz `rawContext`, `briefingJson`, `sdrHandoffJson` para a memória), mas a resposta é mapeada campo a campo — do briefingJson só saem `scope.segment`, `scope.targetAudience`, `scope.social.platforms`. `rawContext` e `sdrHandoffJson` **não** saem. **Limpo na resposta.**
- `portal/messages`: `findMany` sem select — modelo `PortalMessage` não tem campo interno além de flags de leitura; DTO explícito. **Limpo.**
- `social-posts` (token): `findMany` sem select, DTO explícito — mas o DTO inclui `script` (ver A3) e os ids internos `clientId`/`clientRequestId` (baixo risco).
- `media/[id]`: devolve bytes + `fileName`/`mimeType` do próprio registro. **Limpo.**

### Achados

- **A1 — filtro de preço por regex é heurística, não trava** (`app/api/brain/portal-data/route.ts`, `summarizeCanvas`, linha 96): o portal promete "nunca mostra valores", mas a proteção é `/r\$\s*\d|\d+\s*(reais|\/m[êe]s)/i` sobre headline/bullets extraídos do `canvasJson` interno dos departamentos. "USD 500", "custo estimado: 2.400", "orçamento 3k" passam. É exatamente o padrão "aviso, não trava" que o brain-kit proíbe para dano real. Severidade: **média** (custo/margem interno pode aparecer na tela do cliente se um canvas o contiver).
- **A2 — conteúdo de entregável casado com aprovação por sobra de fila** (`app/api/brain/portal-data/route.ts`, linhas 160–170): `deliverableContentFor()` casa entregável→aprovação por agente dono e, quando não casa, faz `leftoverContent.shift()` — o conteúdo de QUALQUER entregável restante do mesmo cliente vira o `reviewNote` de uma aprovação de outro departamento. Não cruza cliente (o project vem do `clientRequestId` do token), mas o cliente pode aprovar um card lendo o conteúdo errado. Severidade: **média** (integridade do que está sendo aprovado, não vazamento entre clientes).
- **A3 — `scriptJson` inteiro entregue ao cliente** (`app/api/social-posts/route.ts`, `toDTO`): o roteiro de produção da IA (hook, cenas, cta, áudio) sai completo no ramo token. É material de trabalho interno do agente, sem campo de visibilidade e sem revisão — se um roteiro contiver instrução interna ou observação sobre o cliente, chega nele. Severidade: **média-baixa** (mesmo cliente, mas conteúdo não curado para ele).
- **A4 — token de portal trafega em query string** (todas as rotas; `app/portal/access/route.ts`, `page.tsx` fetches `?token=`): o token é a credencial única e vitalícia (sem expiração default — `PortalAccess.expiresAt` é opcional, `prisma/schema.prisma` linha ~922) e viaja em URL — fica em log de servidor/proxy e histórico de navegador. Mitigantes reais: 256 bits (`portal-access-service.ts`, `randomBytes(32)`), revogável, `lastAccessedAt`/`accessCount` auditáveis. Severidade: **média** (sistêmico, aceito por desenho "link único", mas deve constar do contrato de visibilidade).
- **Nenhum vazamento entre clientes encontrado** nas 9 rotas: todos os caminhos por token derivam o dono do token e embutem o dono na consulta (`where` com `clientRequestId`/`clientId`/`workspaceId` do token). Nenhuma rota aceita `clientId` de query/corpo no caminho público.
- **Não verificado (declarado):** comportamento em runtime (só leitura estática); rotas de sessão da agência fora do escopo do portal; o conteúdo real dos `canvasJson`/`scriptJson` em produção (o risco de A1/A3 depende do que os agentes escrevem lá); componentes client-side (`EsteiraDoCliente`, `ChatDrawer`, `CalendarioDoMes`, `ConexoesDoCliente`, `EnvioDeMaterial`) foram conferidos apenas quanto a QUAIS APIs chamam, não linha a linha.

---

## 3. Distância até o desenho do CEO

### Menu atual vs. mapa de 6 itens

Abas reais do portal (`app/portal/access/[token]/page.tsx`, `navTabs`, linhas 317–325):
**Visão Geral · [1 a 3 abas dinâmicas por serviço: Social Media, Tráfego Pago, Identidade Visual] · Calendário · Aprovações · Materiais · Conexões · Integrações** — 7 abas fixas + até 3 dinâmicas = **até 10 itens**, contra o teto de 6 do briefing ("nenhum item entra sem remover outro").

| Briefing (6 itens) | Hoje | Distância |
|---|---|---|
| Início (pendências no topo) | "Visão Geral" | Existe, mas ordem errada (abaixo) |
| Projetos | Não existe como aba — o portal é mono-projeto (última solicitação do token) | Criar; absorve as abas dinâmicas por serviço e o Calendário como estados internos |
| Aprovações | "Aprovações" | Existe |
| Resultados | Espalhado: tiles travados na Visão Geral + métricas por aba de serviço — tudo placeholder "—" | Consolidar; hoje é decoração sem dado |
| Arquivos | "Materiais" (só envio; sem listagem do que já foi enviado/entregue) | Renomear + adicionar listagem de arquivos |
| Conta | Dividido em "Conexões" + "Integrações" (duas abas para a mesma ideia) | Fundir dentro de Conta como checklist, como manda o briefing |

Excesso a absorver: abas por serviço → estados de Projetos; Calendário → estado de Projetos/Social; Conexões+Integrações → Conta.

### "Início abre com pendências acima de qualquer gráfico"

Ordem atual da Visão Geral (`page.tsx`, seção `overview`, linhas 398–508):
1. `EsteiraDoCliente` (traz "a bola está com você" + pendências pedidas — **isso já é o embrião certo**, e vem primeiro de propósito, comentário nas linhas 400–403);
2. "Seus resultados" — 4 tiles de métrica **placeholder** ("—", "Conecte o Instagram");
3. "Andamento da entrega" (barra de progresso);
4. Serviços contratados; 5. Sobre o negócio;
6. Banner "N itens aguardam sua aprovação" — **por último**.

**O que falta:** subir o banner de aprovações pendentes para o topo (hoje a pendência mais acionável do portal é o último bloco da tela) e tirar os tiles de métrica vazios da 2ª posição — é exatamente o "gráfico decorativo ocupando o topo" que o briefing veta. A tela também não mostra "próximos marcos" nem "entregas recentes" no Início.

### Onde mora cada bloco universal

| Bloco (briefing) | Onde mora hoje | Estado |
|---|---|---|
| **Aprovação** | Objeto: `ApprovalRequest`/`ApprovalComment` (`prisma/schema.prisma`). Fluxo: `app/api/portal/approvals/route.ts`. Tela: seção `approvals` de `page.tsx`. | **Existe.** Faltam: "Tenho uma dúvida", prazo/impacto, versão no card, comentário obrigatório no ajuste. |
| **Entrega** | Objeto: `Deliverable` (com `version`/`revisionHistory`). No portal, só como texto dentro do card de aprovação (`portal-data`, `reviewNote`) e indiretamente como post no Calendário. | **Parcial.** Não há bloco de Entrega navegável (nome, tipo, versão, arquivo). |
| **Marco** | Carimbos `directionApprovedAt`/`presentedAt`/`clientApprovedAt` em `Project` + trilha derivada (`lib/agency/esteira/fases.ts`) exibida pela `EsteiraDoCliente`. | **Parcial.** Marcos fixos do fluxo; sem objeto Marco com data prevista, sem "próximos marcos" no Início. |
| **Métrica** | `MetricTile` em `page.tsx` — hardcoded "—"/"Conecte o Instagram". `Cycle.resultsJson` existe no schema mas só `ciclo.resumo` chega ao portal (`api/portal/esteira`). | **Não existe** como bloco com dado real, meta e comparação. Placeholder decorativo — o risco exato que o briefing manda remover. |
| **Pendência do cliente** | `MaterialRequest` (schema) + `pendencias` na resposta da esteira + `oQueEsperamosDeVoce`/`aBolaEstaComVoce` (`api/portal/esteira`, renderizado por `EsteiraDoCliente.tsx` linhas 129–134) + `ClientNotice` (aviso que não se perde). | **Parcial — o mais próximo do desenho.** Falta unificar num bloco único no topo do Início (aprovações pendentes vivem noutro lugar da tela). |
| **Decisão registrada** | `ApprovalRequest.reviewedBy/reviewedAt/reviewNote` + `ApprovalComment` + carimbos de marco. | **Parcial.** Decisão de aprovação é registrada; não existe objeto Decisão genérico nem um lugar onde o cliente reveja as decisões tomadas. |

### Resumo da distância

- A fundação de segurança (dono derivado do token, filtragem no backend) está de pé e é melhor que o esperado para a fase.
- O portal atual é bom em: aprovações, esteira/pendências, upload, conexões Meta.
- A distância está em: (1) arquitetura de informação — 10 abas vs. 6, Início com métrica vazia acima da ação; (2) três blocos sem forma (Entrega navegável, Métrica real, Decisão); (3) contrato de visibilidade por objeto — hoje é convenção por rota, não campo obrigatório no modelo; (4) as travas A1–A3 do teste de vazamento.
