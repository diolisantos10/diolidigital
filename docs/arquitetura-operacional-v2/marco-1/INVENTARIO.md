# Marco 1 — Inventário completo do sistema atual (15/08/2026)

> Varredura feita contra o código no commit da base da V2. Nada foi alterado.
> Regra de leitura: isto é o que EXISTE, não o que deveria existir.

## 1. Catálogos de departamentos — existem SEIS definições concorrentes

| # | Fonte | Conteúdo | Papel real hoje |
|---|---|---|---|
| 1 | `lib/dioli-brain/departments.ts` (`BRAIN_DEPARTMENTS`) | **9** deps: client-service-sdr, strategy, social-media, design, paid-traffic, analytics, project-management, quality, **financeiro** — cada um com mission, responsibilities, permissions, forbiddenActions, tools, qualityGate, humanApprovalTriggers | Catálogo do Brain. **Por determinação do CEO (15/08): o Brain fica como camada de inteligência; ESTA departamentalização é a que migra para o canônico** |
| 2 | `lib/agency/organizacao/departamentos.ts` (`DEPARTAMENTOS`) | **11** deps: client-service-sdr, project-management, strategy, **brand-hub**, social-media, design, paid-traffic, analytics, quality, financeiro, **operations** | Régua de permissão real (autoridade × departamento). **É o catálogo mais próximo da V2** — 11 áreas, incluindo branding e operations |
| 3 | `lib/agency/execution/especialistas.ts` (`DEPARTAMENTOS`) | Departamentos **que produzem**, com especialistas de entregável (strategy, social-media, design, paid-traffic, analytics, financeiro…) | Motor de produção da esteira |
| 4 | `lib/agency/portal/vista-do-cliente.ts` (`DEPARTAMENTOS`) | 5 chaves de exibição: social, trafego, branding, design, pm | O que o cliente vê no portal |
| 5 | `lib/agency/escada/degraus.ts` (`departamentosDaCasa()`) | União de 1+3 + `prospeccao` (sem especialista de entregável) | Universo da escada de exposição |
| 6 | `.claude/agents/` | **14 agentes de engenharia (a OBRA)** — diretor, pm, 6 essenciais, 6 especialistas | **Fora do escopo da V2 por determinação do CEO: engenharia permanece separada da operação** |

**Conclusão do inventário:** o catálogo canônico da V2 substitui as fontes 1–5
por UMA (gerada do `architecture.manifest.json`), com adaptadores de slug. A
fonte 2 é a base natural do RBAC (já implementa autoridade × departamento com
menu, página e API lendo a mesma regra — derivada, não lista à mão). A fonte 6
não é tocada.

## 2. Papéis e autenticação atuais

- **`AgencyRole` (7):** master, diretor, project_manager, executivo_comercial,
  social_staff, design_staff, ads_staff. Papel → perfil (autoridade ×
  departamentos onde ESCREVE) em `PERFIL_DO_PAPEL`; leitura é global para
  perfil interno. `Record<AgencyRole,…>` faz papel novo sem perfil reprovar no
  TypeScript.
- **Autoridade:** master, director, coordenação transversal (PM), staff.
- **Cliente:** NUNCA é AgencyRole — entra pelo portal com token
  (`PortalAccess`), guardas em `lib/auth/portal-guard.ts`.
- **Sessão:** JWT (`lib/auth/session.ts`), sem middleware — checagem por
  layout/handler; `api-guard.ts` e `organizacao/guarda.ts` centralizam.
- **Lacunas vs V2:** falta `organization_id`/`client_scope` explícitos por
  requisição; falta trilha de impersonação; falta capability por FUNÇÃO (hoje é
  por departamento); auditoria de mutação sensível é parcial (`ActivityEvent`,
  `tentativas` em travas — não uniforme).

## 3. Superfícies (páginas) — 52 páginas

- **Agência (41):** dashboard (+operacao), clients (lista+id), projects
  (lista+id), tasks, deliverables, approvals, requests (+scope), pipeline,
  planner, inbox, whatsapp, leads, oportunidades, radar, brain, catalog,
  escada, execution/[id], financeiro, integrations, settings, agents,
  orchestrator, control-room, simulations/training, brand-assets,
  desempenho-pago, google + 8 páginas de "agente" (ads-agent, brand-hub-agent,
  design-agent, operations-agent, pm-agent, social-media-agent, strategy-agent)
  + sem-permissao.
- **Público (8):** home, briefing, vitrine (+sucesso), contato, planos,
  privacidade, termos, exclusao-de-dados.
- **Portal (1):** `/portal/access/[token]`.
- **Auth (1):** signin.
- **Nota V2:** as 8 páginas de "agente" são exatamente o que D-02 manda
  eliminar (agente como página); viram funções do catálogo dentro das
  superfícies canônicas (Central de Trabalho, Departamento, PM Command Center).

## 4. Estados hoje (banco: 59 models; campos de status são TEXTO livre com default)

| Entidade | Campo | Valores observados/default |
|---|---|---|
| `Project` | `executionStatus`+fases | fluxo da esteira de 29/07 (fases/marcos/ciclos em `lib/agency/esteira/fases.ts`, `marcos.ts`, `ciclos.ts`, `mes.ts`) |
| `AdCampaign` | `status` | default `paused` |
| `GoogleReview` | `status` | default `pendente` |
| `Cycle` | `status` | default `aberto` |
| `ClientNotice` | `status` | default `pendente` |
| `Deliverable` | `status` | default `draft` |
| `MaterialRequest` | `status` | default `pending` |
| `ContentRequest` | `status` | default `novo` (o pedido que ficou 2 dias parado em 06/08 estava aqui) |
| `SocialPost` | `status` | draft / scheduled / published (+lastError) |
| `Task` | `status` | default `pending` |
| `ClientRequestDb` | `status` | default `new` |
| `ApprovalRequest` | `status` | default `pending` |
| `BrainChangeRequest` | `status` | default `pending_review` |
| `Oportunidade` | `status` | default `nova` |
| `DepartmentLadder` | `degrau` | sombra / allowlist / wide (fail-closed: lixo→sombra) |
| `WhatsAppOutbox` | fila própria | outbox de mensagem já existe |
| Outros | `status` string | StrategyRoom `generating`, Briefing `pending_analysis`, BrandUpdate `pending`, TrainingAlert `active`, DbAgentSuggestion `pending`, EvidenceItem `pending`, BrainArtifact `approved`, GoogleDriveConnection `connected` |

**Conclusão:** não há enum nem máquina central — cada entidade tem vocabulário
próprio em string. A máquina canônica de 20 estados entra como **camada
derivada + coluna aditiva**, com mapa valor a valor (ver MAPA-LEGADO-V2).

## 5. Relógios, filas e efeitos externos

- **Crons (`app/api/cron/`):** caixa-de-entrada, execute (o despertador da
  esteira), radar, raio-x, recompra, training. Proteção `CRON_SECRET`.
- **Filas existentes:** `WhatsAppOutbox` (outbox real), `FilaDeAvisos`
  (exceções de aviso ao cliente), `fila-que-se-cobra.ts` (cobrança interna),
  `pacote-travado.ts`. **Não existe DLQ, heartbeat de scheduler, nem chave de
  idempotência generalizada** — é o que o M6 constrói.
- **Webhooks de entrada:** `self-serve/webhook` (checkout). Meta: rotas de
  API (connect, publish, config, ativos, prontidao, desempenho…), assinatura
  HMAC em `lib/integrations/meta/webhooks.ts`.
- **Integrações:** Meta (OAuth, publish, ads, cotas/freios/ritmo — 6 models),
  Google (Business Profile OAuth, avaliações com robô 4–5⭐ e escalada 1–3⭐,
  Drive), e-mail, WhatsApp Cloud, provedores de IA via `provider-registry`
  (Claude→fallbacks), self-serve checkout. TikTok: **não existe código**.

## 6. As proteções que a V2 PRESERVA (determinação do CEO, 15/08)

1. **Escada** sombra→allowlist→wide (`DepartmentLadder` + decisões do dono
   versionadas com fala literal; fail-closed).
2. **Travas de plataforma**: parecer PODE/NÃO PODE (meta/google/tiktok) +
   bibliotecas capturadas com URL/data/hash.
3. **Publicação fail-closed** (`PUBLICACAO_ORGANICA` + trava de formato
   JPEG) e **App Review** (parecer vigente da Meta: NÃO PODE).
4. **Lei 2 do Brain** (IA plugável, nunca inventa, nunca aplica sozinha,
   rule-based como fallback) — o Brain inteiro fica como camada de
   inteligência: `reason.ts`, `cognitive-flow`, `client-snapshot`,
   `governance-service`, knowledge, evidence, treinos, históricos.

## 7. Dados vivos que a migração NÃO pode perder (nominal)

- **Clientes/projetos:** CityJobs (preço de transferência), Foocci (a
  faturar) + workspaces e ciclos existentes.
- **3 leads reais nunca respondidos:** Sushi Cazza, Camila Pereira (Beauty
  Clinic), Beatriz Gimenes (lash designer) — propostas escritas em
  `docs/comercial/propostas/`.
- **14 SocialPosts** (6 scheduled, 8 draft) com 36 telas de carrossel.
- **Campanha Foocci pausada dentro da Meta** (`120251488825740613`) + 36
  imagens já subidas; conta de anúncios da agência restringida (03/08).
- **Token Meta no cofre** (validade 02/10/2026) e chaves de IA cifradas no
  banco (`DbIntegrationConfig`, busca por workspace).
- **Brain:** BrainVersion, BrainChangeRequest, BrainArtifact, EvidenceItem,
  TrainingBatch, AIRunLog, MarketInsight — **preservação integral
  determinada.**
- Históricos: PortalMessage, ActivityEvent, TimelineEvent, ApprovalRequest/
  Comment, GoogleReview, WhatsAppMessage, LancamentoFinanceiro, EmailDoRadar,
  MetricaDePost.

## 8. Decisão técnica do M1 — banco e filas

**Fica o SQLite (adapter libsql, volume persistente) para a V2 inteira**, com
filas como tabelas + despertador (padrão que `WhatsAppOutbox` já usa), pelos
motivos: um único processo Next no Railway (sem escrita concorrente
multi-nó), migração aditiva mais simples, e o rollback continua sendo
git+flag. **Limite declarado:** se a casa um dia rodar mais de um nó de
escrita, a promoção a Postgres vira obra própria — as tabelas novas nascem
portáveis (sem recurso exclusivo de SQLite). Isso cumpre a Q6 sem mudar
infraestrutura agora.
