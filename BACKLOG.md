# 🗄️ ARQUIVADO — Backlog de 22/06/2026

> # ⛔ O MAPA DA CASA É `docs/ESTADO-REAL-08-08.md`.
> Este arquivo **parou em 22/06/2026** e foi aposentado por ordem do CEO em
> 08/08/2026. Ele **não descreve o estado atual do sistema** e não deve ser
> usado para decidir o que fazer a seguir.
>
> **Fica como HISTÓRICO** — é o registro de onde a agência partiu, e várias
> decisões só se entendem lendo daqui. Memória não se apaga; ela se data.
>
> **Cuidado específico:** a "Situação atual" abaixo descreve um pipeline
> quebrado (tarefa não aciona agente, portal vazio). **Isso foi consertado.**
> A corrente está ligada de ponta a ponta desde 01/08 — ver
> `docs/ESTADO-REAL-08-08.md` §4.

---

## O que este documento era (contexto original, 22/06/2026)

> Escrito com base em auditoria do código em 22/06/2026. Cada item tem
> diagnóstico real (o que existe, o que falta) e estimativa honesta.
>
> **Meta:** 4 departamentos com agente de IA real (Strategy · Social · Design · Traffic),
> aprovação humana antes de chegar ao cliente, 3 clientes internos como piloto.

---

## Situação atual (diagnóstico real)

| O que funciona hoje | O que está simulado/ausente |
|---|---|
| Conversa de briefing (SDR) — rule-based + Claude extração | Produção de conteúdo nos agentes (templates, zero IA) |
| Geração de imagem (DALL-E) no Design Agent | Copys, posts, legendas, estratégia em texto — IA real |
| Motor de canvases existe por departamento | Canvas nunca vira documento entregável ao cliente |
| Projeto + tarefas criados após briefing | Tarefa não dispara execução do agente correspondente |
| Portal do cliente existe | Portal só mostra conteúdo se Deliverable foi criado manualmente |
| Aprovação de deliverables existe | Fluxo approvar → publicar no portal não foi testado ponta a ponta |

**Ponto de quebra do pipeline:**
```
Briefing → Proposta → Projeto + Tarefas   ✅ conectado
   → [QUEBRA] tarefa não aciona agente → canvas não salva como deliverable → portal vazio   ❌
```

---

## Como organizar o trabalho

Os itens estão em 4 camadas. Cada camada desbloqueia a próxima:

```
CAMADA 0 — Configuração (env vars, sem código)
CAMADA 1 — SDR completo e briefing → projeto funcionando
CAMADA 2 — Cada agente produz IA real e salva como entregável
CAMADA 3 — Aprovação humana → portal do cliente vê o resultado
```

---

## CAMADA 0 — Configuração de ambiente
**Esforço: 2h | Responsável: você (Railway)**
**Desbloqueia: tudo.**

| # | Tarefa | Como fazer |
|---|---|---|
| C0-1 | Adicionar `ANTHROPIC_API_KEY` no Railway | Painel Railway → Variables → adicionar chave da Anthropic Console |
| C0-2 | Ativar IA para todos os departamentos | `BRAIN_AI_DEPARTMENTS=strategy,social,design,traffic,analytics,quality` |
| C0-3 | Ativar piloto do PM | `BRAIN_PM_AUTOPILOT=true` (orquestrador propõe projeto automaticamente) |
| C0-4 | (Opcional) configurar `OPENAI_API_KEY` | Só se quiser manter DALL-E. Se usar Claude para tudo, não é obrigatório. |

> **Após C0-1 + C0-2:** os canvases do `/api/brain/reason` passam a chamar Claude de verdade.
> Teste imediato: POST `/api/brain/reason` com `{ dept: "strategy", context: { businessName: "Sushi Cazza", segment: "Restaurante / Alimentação", services: ["Social Media"] } }`.

---

## CAMADA 1 — SDR e pipeline briefing → projeto
**Esforço: ~6h de desenvolvimento**
**Objetivo: um prospect faz o briefing e o projeto já nasce no dashboard.**

### B1-1 · Verificar extração Claude no briefing (1h)
**Status atual:** código existe, mas `ANTHROPIC_API_KEY` não está configurada em produção.
**O que falta:**
- [ ] Configurar a chave (C0-1 acima)
- [ ] Fazer um briefing real no `/briefing` e confirmar que o painel direito preenche nome/negócio/e-mail automaticamente
- [ ] Verificar logs do servidor para confirmar que `/api/brain/briefing-extract` está retornando `ok:true`

---

### B1-2 · Teste ponta a ponta: briefing → ClientRequestDb → proposta → projeto (2h)
**Status atual:** cada passo existe, mas nunca foram testados em sequência.
**O que falta:**
- [ ] Submeter um briefing no `/briefing` e confirmar que aparece em `/agency/requests`
- [ ] Acionar o orquestrador no painel de requests (botão "Gerar proposta")
- [ ] Confirmar que cria Projeto + Tarefas no banco (`/agency/projects`)
- [ ] Se o botão de orquestrar não aparecer → identificar o componente e expor a ação

---

### B1-3 · Garantir que as tarefas criadas mostram o departamento correto (1h)
**Status atual:** `proposeProjectRuleBased()` cria tarefas com `agentId` (ex.: `a2`, `a3`, `a4`). Verificar se o mapeamento `DEPT_TO_DEF` em `orchestrate/apply/route.ts` aponta para os agentes certos.
**O que falta:**
- [ ] Verificar mapeamento agentId → departamento → página do agente
- [ ] Corrigir se necessário

---

### B1-4 · Página de requests: mostrar status do SDR handoff (2h)
**Status atual:** requests aparecem em `/agency/requests` mas a coluna de qualificação SDR (score, budget fit, stage) pode não estar visível.
**O que falta:**
- [ ] Mostrar `qualificationScore`, `budgetFitStatus`, `negotiationStage` na linha de cada request
- [ ] Botão "Gerar proposta" claramente acessível

---

## CAMADA 2 — Agentes de IA real por departamento
**Objetivo: cada agente chama Claude/OpenAI de verdade e salva o resultado como Deliverable.**
**Princípio: a IA produz rascunho → humano aprova → cliente vê. Nunca auto-publica.**

---

### ESTRATÉGIA (B2-STRATEGY)
**Esforço total: ~10h**

#### B2-S1 · Página "Strategy Agent" ou aba no projeto que chama `/api/brain/reason` (4h)
**Status atual:** existe `/api/brain/reason?dept=strategy` com motor real. Não existe página de agente para estratégia — é o único departamento sem interface de execução.
**O que criar:**
- [ ] Criar `/agency/strategy-agent/page.tsx` (ou integrar na aba "Estratégia" do projeto)
- [ ] Formulário: selecionar projeto, confirmar contexto (businessName, segment, services, objectives)
- [ ] Botão "Gerar Estratégia" → POST `/api/brain/reason` com `{ dept: "strategy", context: {...} }`
- [ ] Exibir canvas retornado (posicionamento, territórios, canais, roadmap)

#### B2-S2 · Exportar StrategyCanvas → documento entregável (4h)
**Status atual:** canvas existe em JSON, nunca vira texto legível.
**O que criar:**
- [ ] Função `exportStrategyDocument(canvas: StrategyCanvas): string` em `lib/dioli-brain/`
- [ ] Saída: markdown com seções: Diagnóstico · Posicionamento · Público · Territórios de Conteúdo · Roadmap · Riscos/Oportunidades · Canais recomendados
- [ ] Renderizar na página do agente para revisão humana

#### B2-S3 · Salvar como Deliverable no banco (2h)
**Status atual:** schema existe, falta chamar o POST.
**O que fazer:**
- [ ] Após geração aprovada (clique "Salvar estratégia"): POST `/api/deliverables` com `{ projectId, name: "Estratégia Digital — [Negócio]", type: "strategy_document", content: markdownText, status: "in_review" }`

---

### SOCIAL MEDIA (B2-SOCIAL)
**Esforço total: ~10h**

#### B2-SM1 · Substituir `generateMockOutput()` por chamada real ao Claude (5h)
**Status atual:** `social-media-agent/page.tsx` chama `generateMockOutput()` — 250 linhas de templates hardcoded, zero IA.
**O que fazer:**
- [ ] Criar endpoint `POST /api/agents/social/generate` (server-side)
  - Recebe: `{ businessName, objective, channels, toneOfVoice, visualStyle, postsPerWeek, strategyCanvas? }`
  - Chama `callClaude()` ou `/api/brain/reason?dept=social`
  - Prompt em português: pede 4 posts completos (legenda + sugestão visual + hashtags), calendário editorial com tema/formato por dia, e direção de comunicação mensal
  - Retorna JSON estruturado (posts[], calendar[], summary)
- [ ] Na página do agente: substituir geração local pelo fetch ao novo endpoint
- [ ] Mostrar "gerando com IA…" durante a chamada (streaming é nice-to-have)

#### B2-SM2 · Salvar posts como Deliverables separados (3h)
**Status atual:** a página já tem lógica de salvar deliverables (posts, calendar, stories) — só precisa conectar com a saída real.
**O que fazer:**
- [ ] Mapear saída da IA para os mesmos tipos de Deliverable que a versão mock criava
- [ ] Garantir que status = `"in_review"` (nunca `"approved"` automático)

#### B2-SM3 · Garantir que o calendário editorial é legível (2h)
**Status atual:** calendário gerado pelo motor rule-based existe em JSON. Precisa de visualização.
**O que fazer:**
- [ ] Renderizar tabela semana × dia × tema × formato × canal na UI do agente
- [ ] Botão de download CSV (nice-to-have para piloto)

---

### DESIGN (B2-DESIGN)
**Esforço total: ~8h**

#### B2-D1 · Substituir geração de briefs por chamada ao Claude (4h)
**Status atual:** briefs são gerados por `generateVisualBriefs()` — templates de string, sem IA.
**O que fazer:**
- [ ] Criar endpoint `POST /api/agents/design/generate-briefs` (server-side)
  - Recebe: `{ businessName, segment, themes[], socialCanvas? }`
  - Chama Claude: pede brief criativo completo por tema (conceito visual, mensagem-chave, tom, do/don't, referências de estilo)
  - Retorna `briefs[]` com textos reais
- [ ] Substituir `generateVisualBriefs()` na página pelo fetch ao endpoint

#### B2-D2 · Manter e testar geração de imagens DALL-E (2h)
**Status atual:** já funciona — precisa de `OPENAI_API_KEY`. Validar que:
- [ ] O fluxo "Gerar Imagem" funciona quando `OPENAI_API_KEY` está configurada no Railway
- [ ] Imagem gerada é salva/linkada ao Deliverable correspondente
- [ ] Fallback claro quando a chave não está presente (mensagem de erro amigável, não crash)

#### B2-D3 · Salvar briefs + imagens como Deliverables (2h)
**Status atual:** existe lógica de salvar deliverables na página — validar que salva com status `"in_review"` e conteúdo correto.

---

### TRÁFEGO PAGO (B2-TRAFFIC)
**Esforço total: ~10h**

#### B2-T1 · Substituir `generateAdsPlan()` por chamada ao Claude (5h)
**Status atual:** `ads-agent.ts` gera tudo com templates locais. Header da página já diz `"v1 · planejamento (sem API)"`.
**O que fazer:**
- [ ] Criar endpoint `POST /api/agents/traffic/generate` (server-side)
  - Recebe: `{ businessName, segment, budget, channels, strategyCanvas? }`
  - Chama `/api/brain/reason?dept=traffic` (motor já existe) + Claude para copy de anúncios
  - Retorna: estrutura de campanhas, audiências, copies (3 variações por formato), criativos necessários
- [ ] Substituir geração local na página pelo fetch ao endpoint
- [ ] Exibir o `TrafficCanvas` retornado de forma legível (abas: Estrutura, Audiências, Copies, Criativos)

#### B2-T2 · Exportar plano de mídia como documento (3h)
**O que criar:**
- [ ] Função `exportTrafficDocument(canvas: TrafficCanvas): string`
- [ ] Saída markdown: Objetivo · Budget breakdown (fee separado da verba) · Campanhas · Audiências · Copies · Projeções (CAC/ROAS estimados) · Riscos

#### B2-T3 · Salvar como Deliverables (2h)
- [ ] Plano de mídia (documento markdown) → Deliverable tipo `"traffic_plan"`, status `"in_review"`
- [ ] Copies de anúncio → Deliverable tipo `"ad_copy"`, status `"in_review"`

---

## CAMADA 3 — Aprovação humana → portal do cliente
**Esforço: ~8h**
**Objetivo: equipe aprova deliverable → cliente vê no portal.**

### B3-1 · Testar fluxo de aprovação ponta a ponta (2h)
**Status atual:** o schema de aprovação existe (`ApprovalRequest`, status `in_review` → `approved`). Nunca foi testado de verdade com deliverables gerados por IA.
**O que fazer:**
- [ ] Criar um Deliverable via agente → confirmar que aparece em `/agency/approvals`
- [ ] Aprovar → confirmar que status muda para `"approved"`
- [ ] Abrir o portal do cliente e confirmar que o deliverable aprovado aparece

---

### B3-2 · Garantir que o portal mostra deliverables por tipo (3h)
**Status atual:** portal existe, mas pode não estar filtrando/agrupando os novos tipos (`strategy_document`, `traffic_plan`, `ad_copy`).
**O que fazer:**
- [ ] Verificar `app/portal/client/[id]/page.tsx` — quais tipos de deliverable são renderizados
- [ ] Adicionar seções para: Estratégia · Plano de Conteúdo · Criativos · Plano de Mídia
- [ ] Cada seção mostra apenas deliverables com `status: "approved"` linkados ao projeto do cliente

---

### B3-3 · Gerar link de acesso ao portal para cliente interno (1h)
**Status atual:** `/api/brain/portal-access` gera tokens. Testar com os 3 clientes internos.
- [ ] POST `/api/brain/portal-access` com `{ clientRequestId }` → recebe token
- [ ] Enviar link `/portal/access/[token]` para o cliente (WhatsApp, e-mail)
- [ ] Confirmar acesso e visualização

---

### B3-4 · Página de aprovação mostra o conteúdo real (2h)
**Status atual:** aprovação pode mostrar só metadados, não o conteúdo do deliverable.
**O que fazer:**
- [ ] Em `/agency/approvals`, renderizar o `content` do deliverable (markdown) antes de aprovar
- [ ] Botão "Aprovar e publicar no portal" bem visível

---

## Resumo do backlog

| Camada | Itens | Esforço estimado | Desbloqueia |
|---|---|---|---|
| C0 · Configuração | 4 env vars | 2h (sem código) | Toda IA real |
| C1 · SDR + pipeline | 4 itens | ~6h | Briefing → projeto funciona |
| C2 · Agentes IA real | 12 itens (4 deptos) | ~38h | Cada depto produz conteúdo real |
| C3 · Aprovação + portal | 4 itens | ~8h | Cliente vê o resultado |
| **TOTAL** | **24 itens** | **~54h** | **Primeiro teste completo** |

---

## Sequência recomendada para ir mais rápido

Se quiser fazer o primeiro teste em **2 semanas** trabalhando focado:

**Semana 1:**
1. C0 — configurar env vars (2h)
2. B1-2 — testar briefing → projeto ponta a ponta (2h)
3. B2-S1 + B2-S2 — Social Media com IA real (8h) ← **maior impacto visual para o cliente**
4. B2-D1 + B2-D2 — Design com briefs reais + imagem (6h)
5. B3-1 + B3-3 — aprovação + portal funcionando (3h)

**Primeira demo possível:** cliente faz briefing → você aprova o conteúdo social + imagem → cliente vê no portal.

**Semana 2:**
6. B2-S1 (Strategy Agent página) + B2-S3 (10h)
7. B2-T1 + B2-T2 + B2-T3 — Traffic (10h)
8. B3-2 + B3-4 — portal completo com todos os tipos (5h)

**Ao final da semana 2:** todos os 4 departamentos entregam via IA, aprovação humana, portal completo.

---

## O que NÃO está no escopo deste backlog (próxima fase)

- Analytics com dashboard real (integração Google Analytics/Meta)
- Quality com auditoria cruzada real entre departamentos
- PM com execução automática de tarefas (task → auto-trigger do agente)
- Treinamento/simulação aplicado automaticamente
- Multi-workspace / isolamento completo para clientes externos
- Rotação de senha semeada `dioli2025`
- Remoção da rota legada `/portal/client/[id]`

---

## Pontos críticos que podem travar o piloto

1. **ANTHROPIC_API_KEY ausente** → zero IA funciona. É a C0-1. Deve ser feita primeiro.
2. **OPENAI_API_KEY ausente** → DALL-E falha com HTTP 500 (sem fallback). Configurar ou remover botão de imagem temporariamente.
3. **Proposta não aprovada bloqueia os agentes** — as páginas de agente verificam `proposal.status === "approved"`. No piloto com clientes internos, garantir que o projeto tenha proposta aprovada antes de tentar executar.
4. **Portal token** — o cliente precisa receber o link certo. Testar antes do primeiro cliente.
