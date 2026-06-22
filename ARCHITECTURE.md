# Dioli Agency OS — Arquitetura

> Raio-X verificado do sistema. Este documento descreve **como o projeto funciona de verdade** —
> a arquitetura do Brain, os departamentos, o motor de briefing, a camada de IA e o mecanismo de
> "treinamento". Foi escrito relendo o código, não de memória. Mantenha atualizado quando a
> arquitetura mudar.

**Stack:** Next.js 16 (versão com breaking changes — leia `node_modules/next/dist/docs/` antes de
codar) · Prisma 7 + `@prisma/adapter-libsql` (SQLite) · Deploy no Railway com volume persistente.

---

## 1. O que é o sistema

Um **sistema operacional interno de agência**. Em uma frase: capta leads por uma conversa de
briefing, transforma isso em estratégia → execução → análise através de "departamentos"
inteligentes, e gerencia projetos, entregas, aprovações e o portal do cliente.

### Portas de entrada

| Porta | Rota | Quem usa |
|---|---|---|
| **Briefing público** | `/briefing` | Prospect (sem login) — conversa de orçamento |
| **Dashboard da agência** | `/agency/dashboard` | Equipe (login) — centro de comando |
| **Portal do cliente** | `/portal/access/[token]` | Cliente (link com token) |
| **Login** | `/auth/signin` | Equipe |

`/` redireciona para `/agency/dashboard`. Não há `middleware.ts` — a sessão é validada no nível de
layout (páginas) e nos handlers de API.

---

## 2. O "Brain" — o coração intelectual

**O Brain NÃO é um modelo de IA.** É um **framework de raciocínio** com três camadas. Código em
`lib/dioli-brain/`.

### 2.1 Os 8 departamentos (`lib/dioli-brain/departments.ts`)

Cadeia sequencial — cada departamento produz um **canvas** que alimenta o próximo:

```
SDR/Atendimento → Estratégia → Social → Design → Tráfego → Analytics
                                     (+ PM e Qualidade auditando tudo)
```

| Departamento | id | Entrada → Saída |
|---|---|---|
| Client Service / SDR | `client-service-sdr` | mensagem do cliente → Client Request + Briefing |
| Estratégia | `strategy` | contexto → `StrategyCanvas` |
| Social Media | `social-media` | StrategyCanvas → `SocialCanvas` |
| Design | `design` | SocialCanvas → `DesignCanvas` |
| Tráfego Pago | `paid-traffic` | Strategy+Social+Design → `TrafficCanvas` |
| Analytics | `analytics` | todos os canvases → `AnalyticsCanvas` |
| Project Management | `project-management` | orquestra tarefas (paralelo) |
| Qualidade | `quality` | audita toda saída |

**Por que essa ordem?** Estratégia guia tudo. Social (conteúdo) vem antes de Design (visual).
Design (criativos) vem antes de Tráfego (anúncios). Analytics lê tudo para medir. Qualidade audita
antes do handoff ao cliente.

### 2.2 Fluxo Cognitivo de 12 passos (`lib/dioli-brain/cognitive-flow.ts`)

*Todo* departamento passa pela mesma sequência de raciocínio (muda só o escopo e as ferramentas):

1. Intenção real do cliente
2. Contexto necessário
3. O que sei com certeza
4. O que não sei (gaps)
5. Escopo e departamento
6. Ação permitida
7. Respeito à marca
8. Alinhamento com o objetivo
9. Verificação de risco
10. Necessidade de aprovação humana
11. Potencial de aprendizado
12. Medição do resultado

Vários passos têm **gatilhos de aprovação humana** (ex.: risco legal/financeiro, publicação externa,
mudança no Brain).

### 2.3 Canvases (saídas dos departamentos)

`StrategyCanvas`, `SocialCanvas`, `DesignCanvas`, `TrafficCanvas`, `AnalyticsCanvas` —
em `lib/dioli-brain/*-canvas.ts`. Cada um carrega metadados base (id, requestId, clientName,
status, `qualityGateResult`, `cognitiveFlowTrace`) e depende do canvas anterior na cadeia.

### 2.4 Quality Gates

Checklists (globais + por departamento) que **bloqueiam** entregas fora do padrão. Regras globais:
sem alucinação, respeita a marca, atende ao briefing, valor claro ao cliente, risco verificado,
necessidade de aprovação sinalizada.

---

## 3. Lei 2 — "a IA dá PENSAMENTO, não PODER"

Princípio central, cravado no código. Onde é cumprido:

- **IA é plugável** — `BRAIN_AI_PROVIDER` escolhe `openai` | `claude` | `gemini`
  (`lib/ai/provider-registry.ts`). OpenAI e Claude implementados; Gemini é stub.
- **IA nunca inventa** — `ClientKnowledgeSnapshot` (`lib/dioli-brain/client-snapshot.ts`)
  transforma campo nulo do banco em `undefined` e registra em `missingFields`. Nunca preenche.
  PII (email/telefone) nunca entra no snapshot.
- **IA nunca aplica sozinha** — toda mudança no Brain passa por
  `BrainChangeRequest → revisão → aprovação → aplicação versionada`
  (`governance-service.ts`, `brain-director.ts`). Aprovar e aplicar são transições separadas.
- **Rule-based é o fallback universal** — IA off, falha ou output inválido → motor determinístico
  assume sem crashar. Toda chamada de IA é "advisory": propõe, humano dispõe.

---

## 4. A camada de IA (`lib/ai/`)

| Arquivo | Papel |
|---|---|
| `provider-registry.ts` | Seleciona o provider via `BRAIN_AI_PROVIDER` (default `openai`) |
| `openai-provider.ts` | `callOpenAI()` — chat completions, `response_format: json_object` |
| `claude-provider.ts` | `callClaude()` — Anthropic Messages API, faz strip de fences ```json``` |
| `gemini-provider.ts` | Stub (não implementado) |

**Variáveis de ambiente:**

| Var | Efeito |
|---|---|
| `BRAIN_AI_PROVIDER` | `openai` \| `claude` \| `gemini` (default `openai`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Auth OpenAI (default `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | Auth Claude (default `claude-haiku-4-5-20251001`) |
| `BRAIN_AI_DEPARTMENTS` | Lista de departamentos com IA ligada (default: nenhum) |

> **Segurança:** as API keys ficam **só no servidor** (lidas de `process.env` dentro dos route
> handlers). Nunca são retornadas a nenhum cliente. Não cole valores de chave em logs ou relatórios.

O gateway central de raciocínio é `POST /api/brain/reason`: roda o motor rule-based **sempre** e
sobrepõe campos narrativos com IA **apenas** quando configurada, validada e coerente. Nunca
sobrescreve campos numéricos/estruturais (preço, alocação de budget) — isso é garantido por testes.

---

## 5. O briefing público (`/briefing`)

A conversa é **100% rule-based (regex no navegador)**. Arquivos:

- `lib/agency/prospect-engine.ts` — orquestra; `processProspectMessage()` é o entrypoint
- `lib/agency/question-engine.ts` — sequência de perguntas de escopo
- `lib/agency/sdr-agent.ts` — inteligência comercial (objeção, budget, negociação, qualificação)
- `lib/agency/live-calculator.ts` — preço por pacotes
- `lib/agency/briefing-conversation.ts` — tipos

### Ordem das perguntas

1. **Identidade** (primeiro): nome/negócio → email → WhatsApp. Email e telefone são **validados**;
   resposta inválida é rejeitada e re-perguntada (nunca grava lixo).
2. **Serviço**: social media / tráfego pago / identidade visual.
3. **Escopo**: modalidade → plataformas → posts/semana → stories → reels → fotos → copy → tráfego →
   verba de ads → orçamento → prazo.

### Preço ao vivo (`computeEstimate`)

Pacote de social escolhido por posts/mês: **Starter** (≤8 → R$1.2–1.8k) · **Growth** (9–15 →
R$2–3.2k) · **Pro** (16+ → R$3.5–5k). Add-ons: reels (R$300–700/un), tráfego (R$700–1.8k +
verba de mídia separada), branding (R$2.5–5k). Confiança da estimativa = quão completos os dados.

### Inteligência SDR

Detecta 8 tipos de objeção; objeções de preço disparam **renegociação de escopo** (ex.: "tá caro" →
cai para Starter). Pontuação de qualificação 0–10. **Gate de submissão** (`canSubmitProposal`):
identidade completa + serviço escolhido + sem objeção ativa + ≥3 perguntas de escopo respondidas.

### Camada de IA no briefing (adicionada)

`POST /api/brain/briefing-extract` (público, sem auth) roda **em paralelo** ao rule-based:
- Usa Claude Haiku para extrair campos que o regex perdeu (nome, negócio, email, telefone, segmento,
  serviços, objetivos).
- **Só preenche campos vazios** do escopo — nunca sobrescreve dado confirmado (Lei 2).
- Valida cada campo (email com `@`+domínio, telefone ≥8 dígitos) antes de devolver.
- Sem `ANTHROPIC_API_KEY` → retorna `{ok:false, reason:"not_configured"}` e a conversa segue
  rule-based sem crash.

---

## 6. "Treinamento" — simulação + governança (NÃO é ML)

"Treinamento" aqui é um **loop de simulação + governança**, não machine learning. Código em
`lib/agency/training/` e `lib/dioli-brain/training-policy.ts`.

### O loop

1. **Simula** conversas de SDR com personas sintéticas (`scenarios.ts`,
   `dynamic-scenario-generator.ts`) usando o mesmo motor do `/briefing`.
2. **Avalia** cada conversa em 8 critérios (identidade capturada, objeção resolvida, escopo viável…),
   nota 0–85, veredito **pass** (≥65) / **warning** (50–64) / **fail** (<50).
3. **Sugere** melhoria quando ≥2 runs falham o mesmo critério — gera uma `AgentImprovementSuggestion`
   (texto descritivo, não código).
4. **Governa** — a sugestão fica `pending` no banco até um humano aprovar via
   `PATCH /api/admin/training/sdr/suggestions/[id]`. Quality gate obrigatório antes de aprovar.

### Estado atual

- **Piloto: só o SDR** (`client-service-sdr`). Estratégia/social/design/tráfego = "planejados".
- Cron diário em `/api/cron/training/sdr` (requer `CRON_SECRET` + `TRAINING_ENABLED=true`),
  teto de 200 runs/dia, guarda até 500 runs.
- Trigger manual: `POST /api/admin/training/sdr/run` (master-only).
- ⚠️ **A fase de "aplicar" não existe ainda.** Sugestões aprovadas ficam no banco; nenhum código lê
  uma sugestão e edita o motor automaticamente. A aplicação é manual (humano edita o código e marca
  `applied`).

---

## 7. Dados e persistência

### Banco (fonte da verdade)

SQLite via Prisma 7 + `@prisma/adapter-libsql`, em **volume persistente do Railway** em produção
(`DATABASE_URL`). Em dev: `prisma/dev.db`. Client em `lib/db/client.ts` (singleton).

**~27 tabelas** (`prisma/schema.prisma`). Grupos principais:

- **Workspace/Auth:** `AgencyWorkspace`, `User`
- **Operacional:** `Client`, `Project`, `Deliverable`, `Task`, `Briefing`, `MaterialRequest`,
  `TimelineEvent`, `ActivityEvent`
- **Marca:** `BrandBrain` (1:1 com Client), `BrandUpdate`
- **Pipeline do Brain:** `ClientRequestDb` (+ `BrainArtifact`, `ApprovalRequest`, `ApprovalComment`,
  `EvidenceItem`, `PortalAccess`)
- **Treinamento:** `TrainingBatch`, `DbSimulationRun`, `DbAgentSuggestion`, `TrainingAlert`
- **Governança:** `BrainChangeRequest`, `BrainVersion`, `BrainUpdate`
- **Config/Logs:** `DbIntegrationConfig`, `DbAgentProviderConfig`, `AIRunLog`

**PII** vive em: `User` (email, nome, hash), `Client` (email, telefone, nome),
`ClientRequestDb` (businessName, rawContext), `ApprovalComment` (authorName).

### localStorage

Guarda **apenas** estado de tour de UI (`lib/onboarding/storage.ts`). **Não é fonte de dados.**
(Zustand existe como camada de protótipo legada, superada pelo `ClientRequestDb`.)

### Migrations (`prisma/migrations/`)

`init` → `add_task_timeline_models` → `training_v3` → `foundation_sprint_persistence` →
`add_brain_update`.

### Contas semeadas (`prisma/seed.ts`)

| Email | Senha | Papel |
|---|---|---|
| `master@dioli.studio` | `dioli2025` | master |
| `pm@dioli.studio` | `staff2025` | project_manager |
| `social@dioli.studio` | `staff2025` | social_staff |
| `design@dioli.studio` | `staff2025` | design_staff |
| `cliente@diolidigital.com.br` | `cliente2025` | client |

Mais workspace "Dioli Agência", cliente piloto "Dioli Digital", projeto piloto e 12 entregas demo.

---

## 8. Pontos de atenção conhecidos

Não bloqueiam o piloto interno, mas devem ser resolvidos antes de cliente externo de verdade:

1. **Senha semeada `dioli2025` hardcoded** — trocar antes de qualquer cliente externo.
2. **Rota legada `/portal/client/[id]` ainda existe** — a oficial é `/portal/access/[token]`.
3. **`GET /api/brain/client-requests`** isola workspace por query param, não pela sessão — vira
   problema em cenário multi-cliente.
4. **Fase "aplicar" do treinamento não existe** — sugestões ficam `pending`, aplicação é manual.

---

## 9. Regras invioláveis (do projeto)

- Não criar novos departamentos.
- Não refatorar a arquitetura do Brain.
- Não enfraquecer segurança; mutações de estado precisam de aprovação humana.
- Não deletar usuários de auth / master / admin / migrations / config de sistema.
- Não usar a rota legada `/portal/client/[id]`.
- Não enviar nada para clientes reais automaticamente.
- Sem PII em snapshots; campo ausente → `missingContext`, nunca inventado.
- Rule-based é o fallback universal: IA off ou falha → rule-based, sem crash.
