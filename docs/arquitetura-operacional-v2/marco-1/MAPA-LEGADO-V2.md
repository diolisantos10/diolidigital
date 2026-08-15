# Marco 1 — Mapa legado → V2, valor a valor

> Regra: nenhum slug legado é reutilizado sem mapa; nenhum valor é apagado.
> IDs canônicos = `architecture.manifest.json` (regra de precedência do 00).

## 1. Departamentos (todas as fontes → canônico)

| Valor legado | Fonte(s) | Canônico V2 | Adaptação |
|---|---|---|---|
| `client-service-sdr` | Brain, organizacao | `client-service-sdr` | direto |
| `project-management` | Brain, organizacao | `project-management` | direto |
| `strategy` | Brain, organizacao, especialistas | `strategy` | direto |
| `brand-hub` | organizacao | `branding` | **adaptador de slug** |
| `branding` (chave do portal) | vista-do-cliente | `branding` | direto |
| `social-media` | Brain, organizacao, especialistas | `social-media` | direto |
| `social` (chave do portal) | vista-do-cliente | `social-media` | adaptador de exibição |
| `design` | Brain, organizacao, especialistas | `design` | direto |
| `paid-traffic` | Brain, organizacao, especialistas | `paid-traffic` | direto |
| `trafego` (chave do portal) | vista-do-cliente | `paid-traffic` | adaptador de exibição |
| `analytics` | Brain, organizacao, especialistas | `analytics` | direto |
| `quality` | Brain, organizacao | `quality` | direto |
| `financeiro` | Brain, organizacao, especialistas, escada | `finance` | **adaptador de slug** |
| `operations` | organizacao | `operations` | direto |
| `prospeccao` | escada (sem especialista) | `client-service-sdr` → função `prospecting` | vira FUNÇÃO, não departamento |
| `pm` (chave do portal) | vista-do-cliente | `project-management` | adaptador de exibição |

## 2. Papéis (AgencyRole → papel estrutural V2)

| Legado | V2 | Nota |
|---|---|---|
| `master` | Master/CEO | direto |
| `diretor` | Diretor | direto |
| `project_manager` | Project Manager | direto |
| `executivo_comercial` | Membro de `client-service-sdr` | escrita no próprio dep. |
| `social_staff` | Membro de `social-media` | idem |
| `design_staff` | Membro de `design` + `branding` | hoje escreve nos dois; na V2, capacidade explícita por função |
| `ads_staff` | Membro de `paid-traffic` | idem |
| — (não existe) | Membro de `quality` / `finance` / `operations` / `strategy` / `analytics` | papéis novos nascem com o catálogo; sem usuário atribuído até existir gente/função ativa |
| `client` (portal/token) | Cliente | escopo `organization_id` |

## 3. Estados (vocabulários atuais → 20 estados canônicos)

| Entidade.campo | Valor legado | Estado canônico |
|---|---|---|
| Oportunidade.status | `nova` | `intake` |
| ClientRequestDb.status | `new` | `intake` |
| ContentRequest.status | `novo` | `intake` |
| Briefing.status | `pending_analysis` | `briefing_incomplete` |
| Briefing analisado + lacunas zeradas | (derivado) | `briefing_ready` |
| Proposta emitida (esteira) | fase proposta | `proposal` / `negotiation` |
| Aceite (esteira) | fase aceita | `accepted` |
| Portão de direção (esteira 29/07) | aguardando aval | `direction_pending` |
| Direção avalizada | aval registrado | `direction_approved` |
| Task.status `pending` | fila | `production` (tarefa na fila do estado) |
| Task produzindo/em revisão/entregue | fluxo do motor | `production` / `internal_review` |
| Bloqueio por material (esteira) | tarefa bloqueada | `blocked_materials` (motivo `missing_asset`/`missing_client_information`) |
| ApprovalRequest.status `pending` | card no portal | `client_approval` |
| Pedido de ajuste do cliente | `request_revision` | `revision` |
| Aprovação do cliente | `approve` | `implementation` |
| SocialPost `draft` | rascunho | `production` |
| SocialPost `scheduled` | aprovado p/ publicar | `implementation` |
| SocialPost `published` | publicado | `measurement` |
| Cycle.status `aberto` | ciclo corrente | `measurement` (dentro do ciclo) |
| Cycle fechado | fechamento mensal | `cycle_closed` |
| Recusa definitiva / cancelamento | `reject` + auditoria | `cancelled` |
| Oportunidade sem aderência | encerrada | `closed` |
| Deliverable.status `draft` | pacote em produção | `production` |
| MaterialRequest.status `pending` | pedido de material | alimenta `blocked_materials` |

**Regra do M3:** a coluna `estadoCanonico` nasce ADITIVA e derivada por esta
tabela; leitura dupla compara derivação × legado até divergência zero; o
legado não é apagado.

## 4. Bloqueios existentes → bloqueios tipados

| Situação atual | Tipo canônico |
|---|---|
| Falta material do cliente (esteira) | `missing_asset` |
| Falta informação do briefing | `missing_client_information` |
| Chave de IA ausente no workspace | `missing_credential` |
| Meta/Google indisponível ou 403 | `integration_unavailable` |
| Reprovação no portão | `quality_rejected` |
| Card aguardando cliente | `client_decision_pending` |
| (novo na V2) | `financial_hold` |
| Parecer NÃO PODE / App Review | `policy_or_security_risk` |
| lastError de publicação, falha de job | `technical_failure` |

## 5. O que NÃO entra no mapa (preservado como está)

Escada (`DepartmentLadder`), decisões do dono, travas de plataforma e
publicação, bibliotecas capturadas, Lei 2 e todo o conteúdo do Brain (dados,
memórias, prompts, regras, aprendizados, históricos, integrações) — o Brain
segue como camada de inteligência; só o catálogo dele é substituído, por
adaptador, sem apagar nada antes de backfill + leitura dupla + reconciliação
+ rollback provados (determinação do CEO, 15/08).

## 6. Funções executoras (62) — origem de cada uma

- **34 já têm ancestral direto** nos especialistas de execução, agentes de
  página ou motores do Brain (ex.: `copywriter` ← social-copy;
  `graphic-designer` ← design-criativo; `campaign-builder` ← ads.ts+trafego;
  `qa-orchestrator` ← quality-engine; `billing` ← LancamentoFinanceiro/self-serve).
- **28 nascem novas** (ex.: `brand-interviewer`, `tone-of-voice`,
  `motion-designer`, `attribution-and-funnel`, `collection`,
  `credentials-and-access`, `backup-and-continuity`).
- Todas as 62 entram no catálogo canônico **desligadas por padrão** (a escada
  decide exposição; ligar função nova = decisão registrada), cada uma com
  ficha do template mestre (Control Room, D-003).
