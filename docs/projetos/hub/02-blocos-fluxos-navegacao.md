# Hub do Cliente — Fase 2: Blocos, Fluxos e Navegação (v1)

> **Especificação executável.** A Fase 3 (protótipo navegável) monta a partir
> deste documento sem perguntar nada. Base: briefing
> (`docs/projetos/hub-do-cliente-briefing.md`), auditoria
> (`docs/projetos/hub/00-auditoria.md`) e modelo/visibilidade
> (`docs/projetos/hub/01-modelo-e-visibilidade.md`). Toda referência ao sistema
> atual vem com arquivo. Escrito em 03/08/2026.
>
> **Convenção:** "objeto novo da Fase 1" = ficha da seção 1 de
> `01-modelo-e-visibilidade.md` (`DeliverableVersion`, `Decision`, `Milestone`,
> `Contract`, `ServiceModule`). Nada aqui cria objeto que a Fase 1 não fichou.

---

## Leitura de 1 minuto

- **6 blocos fechados** montam toda a tela do cliente. Bloco que não responde a
  uma das três perguntas (o que preciso fazer / em que pé está / o que estou
  ganhando) não renderiza. **Os 4 tiles "—" da Visão Geral morrem.**
- **Aprovação ganha o 3º caminho** ("Tenho uma dúvida"), comentário obrigatório
  no ajuste e **versão preservada** via `DeliverableVersion` — hoje o `content`
  é sobrescrito (auditoria, cap. 2 do MVP).
- **Menu do cliente: exatamente 6 itens.** As ~10 abas atuais viram estados
  internos dos 6. Início abre com pendências; métrica sem dado real não sobe.
- **Duas portas internas:** fila (evolução de `app/agency/tasks/page.tsx`) e
  mural (evolução de `app/agency/clients/[id]/page.tsx`). Achado honesto: as
  telas internas hoje rodam sobre **store mock** (`useAgencyStore`,
  `MOCK_AGENTS`, `lib/agency/mock-data`) — a Fase 3 prototipa em cima delas,
  mas a ligação ao banco real é dívida declarada.
- **Notificação ao cliente: lista fechada de 4 eventos.** Todo o resto é
  silencioso ou vai no resumo agrupado.
- **A4 corrigido por requisito:** token de portal sai da query string na
  primeira resposta (troca por cookie httpOnly).

---

## 1. Biblioteca de Blocos v1 — as 6 fichas

Regra geral (briefing, "Como saber que ficou pronto"): **cada bloco na tela do
cliente responde a UMA das três perguntas** — ① o que preciso fazer · ② em que
pé está · ③ o que estou ganhando. Bloco que não responde a nenhuma **não
renderiza** (regra de exclusão por ficha, abaixo). A filtragem do que entra no
bloco é sempre backend (contrato de visibilidade, `01-modelo-e-visibilidade.md`
seção 2).

### 1.1 Bloco de Aprovação

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | `ApprovalRequest` + `ApprovalComment` (`prisma/schema.prisma`) — o objeto mais maduro do schema (Fase 1, 1.10). Conteúdo aprovado: `DeliverableVersion` (objeto novo da Fase 1, 1.9), **nunca** o casamento por sobra de fila de `deliverableContentFor` (achado A2 da auditoria — esse mecanismo morre; ver 2.2). |
| **Estados** | `pending` (aguardando o cliente) · `approved` · `revision_requested` · `rejected` (valores reais, `app/api/portal/approvals/route.ts:20–24`) + estado derivado `expirada` (quando `expiresAt < agora` e `status = pending`; não é coluna nova — é derivação na leitura). |
| **Ações do cliente** | **Aprovar** · **Solicitar ajustes** (comentário obrigatório) · **Tenho uma dúvida** (nova — ver seção 2). |
| **Conteúdo obrigatório do card** | o que exatamente está sendo aprovado (nome + conteúdo da versão) · número da versão · prazo (`expiresAt`) · impacto da demora (frase derivada: o que fica parado enquanto não decide) · histórico de comentários `isClientVisible`. |
| **Pergunta que responde** | ① o que preciso fazer (quando `pending`) · vira insumo do bloco de Decisão quando decidida. |
| **Regra de exclusão** | Só renderiza `clientVisible: true` (já é assim, `app/api/brain/portal-data/route.ts` linhas 139–143). Aprovação sem conteúdo apresentável (sem `DeliverableVersion` vinculada e sem descrição própria) **não renderiza** — cliente nunca aprova card vazio. |

### 1.2 Bloco de Entrega

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | `Deliverable` (+ `Deliverable.cycleId` para "entrega do mês") + `DeliverableVersion` (objeto novo, Fase 1 1.9) + `MediaAsset` `kind: deliverable` vinculado à versão. Hoje o portal só mostra entrega como texto dentro do card de aprovação (auditoria, cap. 3) — este bloco cria a entrega **navegável**: nome, tipo, versão atual, arquivos, data. |
| **Estados** | Vocabulário unificado da Fase 1 (3.2): `rascunho` → `revisão interna` → `pronto para o cliente` → `publicado` · `rejeitado`. Cliente **só vê** `pronto para o cliente` e `publicado` — os dois primeiros são internos por contrato. |
| **Ações do cliente** | Abrir/baixar (via link assinado de `lib/agency/media/armazenamento.ts`) · ver versões apresentadas (v2 atual, v1 preservada) · perguntar (mensagem ancorada `anchorType: "deliverable"`) · quando houver aprovação pendente ligada, atalho para o Bloco de Aprovação. |
| **Pergunta que responde** | ② em que pé está (lista de entregas e datas) e ③ o que estou ganhando (a entrega é o valor). |
| **Regra de exclusão** | Entrega em `rascunho`/`revisão interna` **não renderiza** (fail-closed — Fase 1, 2.2). Versão intermediária nunca apresentada ao cliente não aparece no histórico dele. |

### 1.3 Bloco de Marco

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | **Decisão declarada (a Fase 1 mandou decidir aqui, 1.6): a trilha derivada BASTA para o v1.** Fonte: os 3 carimbos de `Project` (`directionApprovedAt`, `presentedAt`, `clientApprovedAt`) + fase derivada em `lib/agency/esteira/fases.ts` + `Cycle` (`reference`, `presentedAt`, `closedAt`) — já exposto ao portal em `app/api/portal/esteira/route.ts` (`trilha`, `progresso`). A tabela `Milestone` (ficha Fase 1) **não entra no v1**; entra quando o primeiro projeto precisar de data-alvo fora do fluxo padrão (ex.: "site no ar em 20/09") — gatilho registrado, não reflexo. |
| **Estados** | `previsto` · `atual` (a etapa em curso) · `atingido` (com data). Derivados, não digitados — princípio que já é o melhor do schema (Fase 1, 1.4). |
| **Ações do cliente** | Nenhuma ação direta — marco é leitura. Quando o próximo marco depende do cliente, o bloco aponta para a pendência correspondente (Bloco 1.5). |
| **Pergunta que responde** | ② em que pé está. |
| **Regra de exclusão** | Marco sem data e sem posição na trilha não renderiza. A trilha nunca mostra nome de agente, erro de execução ou contagem interna (regra já implementada em `app/api/portal/esteira/route.ts`, linhas 60–61 — manter). |

### 1.4 Bloco de Métrica

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | `Cycle.resultsJson` (números do fechamento do mês — o único dado real de resultado da casa, Fase 1 1.14) + embed de relatório externo (decisão firme do briefing: renderização embedada no MVP, não nativa). Sem tabela `Metric` no v1 — decisão da Fase 1 mantida. |
| **Estados** | `com dado` (único estado renderizável) — não existe estado "aguardando conexão" visível como tile. |
| **Ações do cliente** | Ver detalhe do ciclo · abrir embed do relatório · agir sobre a **ação recomendada** (quando a ação é do cliente, ela vira Pendência — bloco 1.5). |
| **Conteúdo obrigatório** | **REGRA DURA DO BRIEFING: métrica sem META + COMPARAÇÃO + AÇÃO RECOMENDADA não entra.** Cada métrica renderizada carrega: valor · meta do ciclo · comparação (ciclo anterior ou meta) · uma frase de ação recomendada (da agência, revisada pelo fluxo de estados da Fase 1 seção 3). Faltou qualquer um dos três → a métrica não renderiza. |
| **Pergunta que responde** | ③ o que estou ganhando. |
| **Regra de exclusão + sentença de morte** | **Os 4 `MetricTile` da Visão Geral atual morrem.** Evidência: `app/portal/access/[token]/page.tsx` linhas 415–418 ("Alcance —", "Seguidores —", "Engajamento —", com `locked` e "Conecte o Instagram") e linha 529 (tiles "—" por aba de serviço). São exatamente o "gráfico decorativo no topo" que o briefing veta e o risco "métricas sem meta impressionam na demo e pioram a compreensão". **Não são substituídos por placeholder melhor: enquanto não houver dado real com meta+comparação+ação, a seção Resultados mostra o estado honesto "Resultados chegam no fechamento do 1º ciclo" — um parágrafo, não tiles.** "Conecte o Instagram" não é métrica: é pendência, e muda de bloco (1.5). |

### 1.5 Bloco de Pendência do cliente

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | União de 3 fontes reais, num bloco único (a auditoria apontou que hoje vivem espalhadas): **(a)** `MaterialRequest` com `askedClientAt` preenchido (filtro `jaFoiPedido`, `app/api/portal/esteira/route.ts`) — envio de material; **(b)** `ApprovalRequest` `pending` + `clientVisible` — aprovações; **(c)** conexão necessária ausente/expirada — `MetaConnection`/`GoogleConnection` com `status` ∈ {`expired`, `revoked`, `error`} ou exigida pelo serviço e inexistente (`app/api/portal/conexoes/route.ts` como fonte). `ClientNotice` continua como veículo de aviso persistente. |
| **Estados** | `aberta` · `resolvida` (com data) · `vencida` (quando tiver prazo). |
| **Ações do cliente** | Resolver na hora, sem trocar de tela quando possível: enviar arquivo (`app/api/media/route.ts`) · ir para a aprovação · reconectar conta (fluxo OAuth de `app/api/meta/connect-parceiro/route.ts`). |
| **Conteúdo obrigatório** | O que é · por que trava (que etapa/entrega fica parada) · prazo quando houver. |
| **Pergunta que responde** | ① o que preciso fazer — **é o bloco nº 1 da casa; abre a tela Início.** |
| **Regra de exclusão** | Pendência já resolvida sai do topo (vai para o histórico dentro do contexto de origem). Microetapa interna **nunca** vira pendência do cliente (restrição do briefing). Zero pendências → o bloco renderiza o estado positivo "Nada depende de você agora" (uma linha) — não some, porque a ausência de pendência É a informação. |

### 1.6 Bloco de Decisão registrada

| Campo da ficha | Especificação |
|---|---|
| **Dado de origem** | `Decision` (objeto novo, Fase 1 1.11), nascendo **derivada**: toda `ApprovalRequest` que sai de `pending` gera uma linha (quem decidiu = `reviewedBy`, quando = `reviewedAt`, o quê = resumo do card + versão decidida, resultado = `approved`/`revision_requested`/`rejected`); os 3 carimbos de `Project` também geram linha ("Direção aprovada em…"). Espelho automático primeiro, tabela vazia nunca (posição da Fase 1). |
| **Estados** | Imutável — decisão não tem transição; revoga-se criando outra (Fase 1, 1.11). |
| **Ações do cliente** | Ler · abrir o contexto de origem (a aprovação, a versão). Nenhuma edição. |
| **Pergunta que responde** | ② em que pé está — e a função de negócio: os dois lados param de rediscutir o que já foi decidido. |
| **Regra de exclusão** | Só decisões com `visibility: compartilhado` (default da ficha). Decisão interna da agência (ex.: troca de provedor IA) não renderiza. Lista vazia → bloco não renderiza (diferente da Pendência: aqui a ausência não informa nada). |

---

## 2. Fluxo de Aprovação v1 — ponta a ponta

O coração do portal (briefing: "se só uma coisa funcionar bem, é esta"). Base
real: `app/api/portal/approvals/route.ts` (posse checada antes da visibilidade —
manter) + `lib/agency/esteira/refacao.ts` (refação disparada por pedido do
cliente — manter).

### 2.1 Os três caminhos

**Caminho A — Aprovar.**
1. Cliente abre o card (conteúdo = `DeliverableVersion` vinculada, versão N).
2. Ação `approve` → `status: approved`, grava `reviewedBy` (nome do cliente,
   derivado do token — nunca digitado), `reviewedAt` (já existe hoje).
3. Efeitos mantidos do sistema atual: aprovação de proposta cria projeto;
   última aprovação do pacote chama `aprovarPacote`
   (`lib/agency/esteira/publicacao.ts`); posts vão a `scheduled`.
4. Gera linha de `Decision` (bloco 1.6) + evento de auditoria estruturado
   (ator, alvo, transição — Fase 1, 3.3, regra de registro).
5. Comentário opcional no aprovar (elogio/observação vira `ApprovalComment`
   `isClientVisible: true`).

**Caminho B — Solicitar ajustes.**
1. Ação `request_revision` **exige comentário**: validação no backend em
   `app/api/portal/approvals/route.ts` — requisição sem `comment` não-vazio
   retorna 400 com mensagem clara. Hoje o código aceita ajuste sem comentário
   (Fase 1, 1.10) — isso fecha.
2. UI reforça antes do backend: botão desabilitado até haver texto; placeholder
   "O que precisa mudar? Seja específico — a equipe refaz a partir disto."
3. `status: revision_requested` + `ApprovalComment` visível + dispara
   `refazerPorPedidoDoCliente` (`lib/agency/esteira/refacao.ts`).
4. **Nova versão preservando a anterior — a correção do furo provado na Fase 1
   (1.9: "o `content` é sobrescrito"):** a refação NÃO regrava
   `Deliverable.content` por cima. Sequência obrigatória:
   a. Se ainda não existe, cria `DeliverableVersion` nº N com o conteúdo ATUAL
      (retrofit da versão apresentada — imutável a partir daqui);
   b. Executor produz o novo conteúdo → cria `DeliverableVersion` nº N+1
      (`content`, `mediaAssetIds`, `createdBy` = executor, `note` = resumo do
      que mudou em resposta a qual comentário);
   c. `Deliverable.version = N+1` e `Deliverable.content` passa a ser cache da
      versão corrente (leitura sempre pela versão);
   d. Nova `ApprovalRequest` (ou reabertura da mesma com vínculo à versão N+1 —
      decisão de implementação da Fase 3; o requisito é: **a decisão registra
      QUAL versão foi decidida**, coisa que hoje "não é registrável" (Fase 1,
      1.10)).
5. O card da nova rodada mostra: versão N+1, o comentário que a originou, e
   link "ver versão anterior" (v1 preservada, navegável).

**Caminho C — Tenho uma dúvida (não existe hoje — especificação completa).**
1. Terceira ação no card, mesmo peso visual dos outros dois botões.
2. **Não muda o status.** A aprovação continua `pending` — dúvida não é decisão.
3. Exige texto (mesma validação do ajuste). Cria `PortalMessage` **ancorada**:
   campos novos `anchorType: "approval"`, `anchorId: <approvalRequest.id>`
   (a extensão de ancoragem que a Fase 1 pediu em 1.12). Alternativa aceitável
   de implementação: `ApprovalComment` com `kind: "question"` — o requisito é
   que a dúvida fique **presa ao card**, visível no histórico dele, e não numa
   thread geral desconectada (o problema de hoje, Fase 1 1.10).
4. A resposta da agência chega no mesmo card (e notifica o cliente — evento 1
   da política, seção 5, porque devolve a bola para ele).
5. O card em estado "dúvida aberta" mostra selo "Aguardando resposta da
   agência" — o prazo (`expiresAt`) **pausa** enquanto houver dúvida sem
   resposta: o relógio não pode correr contra o cliente enquanto a bola está
   com a agência.

### 2.2 Regra de integridade do conteúdo (mata o A2)

O card de aprovação só exibe conteúdo **vinculado por FK à versão**
(`ApprovalRequest` → `DeliverableVersion`). O casamento heurístico por agente
dono + `leftoverContent.shift()` de `app/api/brain/portal-data/route.ts`
(linhas 160–170, achado A2: cliente pode aprovar lendo conteúdo errado) **é
removido**: aprovação sem vínculo explícito renderiza sem corpo de entregável
(e cai na regra de exclusão 1.1 se não tiver descrição própria). Integridade
acima de completude.

### 2.3 Tabela de transições

| # | De | Evento | Para | Quem move | Efeitos obrigatórios |
|---|---|---|---|---|---|
| T1 | — | Agência publica para aprovação (`clientVisible: true`) | `pending` | agência (após revisão interna — máquina da Fase 1, 3.3) | vínculo à `DeliverableVersion` N; `expiresAt` definido; notificação evento 1 (seção 5); evento de auditoria "tornou visível" |
| T2 | `pending` | Cliente aprova | `approved` | **só o cliente** (via token) | `reviewedBy`/`reviewedAt`; `Decision` derivada; efeitos de esteira (projeto/pacote); auditoria |
| T3 | `pending` | Cliente pede ajuste **com comentário** | `revision_requested` | só o cliente | comentário obrigatório (400 sem ele); refação; versão N preservada, N+1 nasce; nova rodada vinculada a N+1; `Decision`; auditoria |
| T4 | `pending` | Cliente rejeita | `rejected` | só o cliente | comentário obrigatório (mesma regra do ajuste — rejeição sem motivo não ensina nada à refação); `Decision`; auditoria; escala ao Diretor (mural, seção 4.2) |
| T5 | `pending` | Cliente pergunta | `pending` (inalterado) | cliente | mensagem ancorada ao card; selo "dúvida aberta"; **prazo pausado**; notifica a agência (interno) |
| T5b | `pending` + dúvida aberta | Agência responde | `pending` | agência | resposta no card; prazo despausa; notifica o cliente (evento 1) |
| T6 | `pending` | `expiresAt` vence | `pending` + derivado `expirada` | relógio (derivação na leitura, não job que muda status) | ver exceção E1 |
| T7 | `revision_requested` | Refação entrega N+1 | nova rodada `pending` | executor (automático, `esteira/refacao.ts`) | T1 se aplica de novo (nova rodada = nova publicação) |
| T8 | qualquer | Cliente tenta agir em aprovação não-visível ou de outro dono | — (404) | — | manter o desenho atual: posse antes de visibilidade, sem vazar existência (`app/api/portal/approvals/route.ts`) |

**Trava dura (herdada da Fase 1, 3.3):** nenhum caminho leva conteúdo a
`publicado` sem decisão do cliente registrada (T2) — e nenhum chega a `pending`
sem ter passado por revisão interna (gate executável). NINGUÉM move essas duas
por fora; é constraint, não prompt.

### 2.4 Exceções

- **E1 — Prazo vencido (`expiresAt < agora`, ainda `pending`):**
  **nunca auto-aprova e nunca some.** O card ganha estado visual `expirada`
  ("prazo venceu em DD/MM — a entrega está aguardando você"), a pendência sobe
  para o topo do Início com destaque, e o vencimento dispara: 1 lembrete ao
  cliente (evento 4 da política de notificação) + item na fila do Diretor
  (mural, "aprovações vencidas") para decidir contato humano. Silêncio do
  cliente **não é decisão** — princípio "ausência de informação não é
  informação" (CLAUDE.md).
- **E2 — Aprovador ausente (cliente não entra no portal há N dias com
  pendência aberta):** `PortalAccess.lastAccessedAt` (já existe,
  `lib/agency/persistence/portal-access-service.ts`) é a evidência. Regra v1:
  pendência aberta + sem acesso há 5 dias → entra no resumo agrupado (seção 5)
  e na fila do Diretor como "cliente ausente"; o follow-up humano (WhatsApp,
  `WhatsAppMessage`) é decisão do Diretor, não automática — trava de plataforma
  do CLAUDE.md vale para mensagem ativa.
- **E3 — Aprovação parcial ("aprovo 8 dos 10 posts"):** **não existe estado
  parcial no v1** — decisão declarada, não omissão. O objeto de aprovação é
  indivisível; parcialidade se expressa como **Solicitar ajustes** com
  comentário citando os itens ("aprovo todos menos o post 3 e o 7: …"), que
  gera rodada N+1 só do que mudou. Racional: estado parcial dobra a máquina de
  transições e o `aprovarPacote` (`esteira/publicacao.ts`) é tudo-ou-nada hoje.
  Se o teste com o CEO (seção 7) mostrar que parcial é a dor nº 1, vira ficha
  de mudança para a Fase 4 — com evidência, não por reflexo.
- **E4 — Dúvida aberta sem resposta da agência > 24h:** item automático na
  fila do Diretor com prioridade alta. A pausa do prazo (T5) protege o cliente;
  esta exceção protege o fluxo de morrer em silêncio.

---

## 3. Mapa de navegação do cliente — exatamente 6 itens

Teto do briefing (restrição): **6 itens, nenhum entra sem remover outro.**
Estado atual: até 10 abas (`app/portal/access/[token]/page.tsx`, `navTabs`,
linhas 317–325 — auditoria, cap. 3).

### 3.1 De ~10 abas para 6 itens

| Aba atual (portal real) | Vira | Como |
|---|---|---|
| Visão Geral | **Início** | Reordenada por completo (3.2); deixa de acumular métrica vazia e "sobre o negócio" |
| Social Media (aba dinâmica) | **Projetos** | Estado interno do projeto/módulo Social: calendário, posts, entregas do módulo |
| Tráfego Pago (aba dinâmica) | **Projetos** | Estado interno do módulo Tráfego: campanha, teto aprovado, status |
| Identidade Visual (aba dinâmica) | **Projetos** | Estado interno do módulo Identidade: kit de marca, peças |
| Calendário | **Projetos** | Vista de calendário dentro do módulo Social (não é destino de topo — é um recorte do projeto) |
| Aprovações | **Aprovações** | Mantida — vira a lista de Blocos de Aprovação (1.1) + histórico de decididas (Bloco 1.6 filtrado por aprovações) |
| Materiais | **Arquivos** | Renomeada + ganha o que falta (auditoria): **listagem** do que o cliente já enviou (`MediaAsset kind: inbound`) e do que recebeu (`kind: deliverable`), além do envio |
| Conexões | **Conta** | Item do checklist de integrações (seção 6) |
| Integrações | **Conta** | Fundida com Conexões — "duas abas para a mesma ideia" (auditoria) viram uma seção |
| — (não existe hoje) | **Resultados** | Nasce com a regra dura do Bloco de Métrica (1.4): só renderiza ciclo fechado com meta+comparação+ação; embed de relatório externo; antes disso, o estado honesto de uma linha |

Itens cortados não somem: viram estados dentro de Projetos e Conta (critério do
briefing, seção 6 dele).

### 3.2 Tela Início — ordem exata dos blocos

Regra inegociável do briefing: **pendências ACIMA de qualquer métrica.** Hoje o
banner de aprovações é o ÚLTIMO bloco da tela e os tiles vazios são o 2º
(auditoria, cap. 3, `page.tsx` linhas 398–508 — inversão exata do desenho).

| Posição | Bloco | Fonte | Nota |
|---|---|---|---|
| 1 | **Pendência do cliente (1.5)** — unificado: aprovações pendentes + materiais pedidos + conexões quebradas | união da seção 1.5 | O banner "N itens aguardam sua aprovação" (hoje linha 502, no fim) sobe para cá e se funde ao bloco. Zero pendências → "Nada depende de você agora" |
| 2 | **Marco (1.3)** — "onde estamos e o que vem" | trilha derivada + `Cycle` | O embrião certo já existe: `EsteiraDoCliente` vem primeiro hoje de propósito (comentário nas linhas 400–403) — mantém-se, agora em 2º, atrás só da ação |
| 3 | **Entregas recentes (1.2)** — últimas N publicadas | `Deliverable` + versões | Não existe hoje no Início (auditoria aponta a falta) |
| 4 | **Decisões registradas (1.6)** — últimas decisões | `Decision` derivada | Curto: 3 itens + "ver todas" (em Aprovações) |
| 5 | **Resultado do ciclo (1.4)** — só se houver ciclo fechado com dado completo | `Cycle.resultsJson` | Com meta+comparação+ação, senão o parágrafo honesto. **Nunca acima da posição 5** |

**O que sai do Início:** os 4 tiles "—" (morrem, 1.4) · "Serviços contratados"
e "Sobre o negócio" (viram estado dentro de Projetos/Conta — são contexto, não
resposta a nenhuma das três perguntas no dia a dia).

---

## 4. As duas portas internas

Decisão do briefing (2 de 3): fila por pessoa/departamento para quem executa,
mural por cliente para quem coordena — dois recortes dos mesmos dados, nenhum
obrigatório para todos.

**Achado prévio (vale para as duas portas):** as telas internas atuais rodam
sobre estado mock — `useAgencyStore` + `MOCK_AGENTS` + `lib/agency/mock-data`
(evidência: `app/agency/dashboard/page.tsx` linha 171, `app/agency/tasks/page.tsx`
linha 120, `app/agency/pipeline/page.tsx` importa `ProjectStage` de
`lib/agency/mock-data`). A Fase 3 pode prototipar em cima; a ligação ao banco
real (Prisma) é dívida declarada da Fase 4, não deste documento.

### 4.1 Porta 1 — Fila por pessoa/departamento (tela padrão do executor/agente)

**Base real a evoluir:** `app/agency/tasks/page.tsx` ("Central de Tarefas") —
já tem o esqueleto certo: abas por recorte (ativas/atrasadas/bloqueadas/
prioridade/concluídas, linhas 154–167) e filtros por projeto, prioridade, dono
e busca (linhas 171–175). `app/agency/control-room/page.tsx` (grade
projeto × departamento com modo 100% IA/híbrido/humano e botão "Rodar")
complementa como visão de disparo por departamento.

| Aspecto | Especificação v1 |
|---|---|
| **Linha da fila** | Tarefa (`Task`) ou item de trabalho derivado: refação pedida (T3/T7), dúvida de cliente sem resposta (E4), aprovação vencida (E1), gate reprovado. Cada linha: título · cliente · projeto · departamento · executor (`agentId`) · estado · prazo · idade |
| **Filtros** | por departamento (os slugs reais de `DEPTS` em `control-room/page.tsx`: strategy, social-media, design, paid-traffic, project-management) · por executor · por cliente · por estado (vocabulário unificado da Fase 1, 3.1) · por origem (produção / refação / dúvida / vencida) |
| **Ordenação** | default: **bloqueia-cliente primeiro** (item que segura pendência externa no topo), depois prazo, depois idade. Alternativas: por prazo, por cliente, por chegada |
| **Ações em lote** | selecionar N linhas → reatribuir executor · mudar prioridade · disparar execução (o "Rodar todos" de `control-room/page.tsx` linha 24, `runAll`, generalizado para seleção) · marcar concluído. **Fora do lote, sempre:** qualquer ação que publique para o cliente (T1) ou toque plataforma externa — a primeira por trava de revisão (Fase 1, 3.3), a segunda pela TRAVA DE PLATAFORMA do CLAUDE.md (parecer prévio meta/google/tiktok) |
| **Para agente IA** | a fila é a MESMA: agente é executor identificável (Fase 1, 1.2 — hoje é string solta; a fila exibe o rótulo e o `AIRunLog` da última execução como rastro) |

### 4.2 Porta 2 — Mural por cliente (tela padrão do Diretor)

**Base real a evoluir:** `app/agency/clients/[id]/page.tsx` (a "casinha" do
cliente já existe como página de 1.107 linhas com link seguro do portal —
`SecurePortalLinkButton`, linha 309) + `app/agency/dashboard/page.tsx` (blocos
de ação do dia, saúde por departamento) + `app/agency/pipeline/page.tsx`
(kanban de estágios) como visões transversais que apontam PARA o mural.

Seções do mural v1, de cima para baixo:

| Seção | Fonte | Conteúdo |
|---|---|---|
| 1. Estado e alarmes | trilha derivada + exceções E1–E4 | fase atual, aprovações vencidas, dúvidas sem resposta, cliente ausente — o que exige o Diretor HOJE |
| 2. Timeline | `TimelineEvent` (existe no schema e **nenhuma rota expõe** — auditoria, MVP-4; o mural é onde ele passa a ser lido) + `ActivityEvent` | linha do tempo interna datada, com departamento |
| 3. Entregáveis | `Deliverable` + `DeliverableVersion` | todos os estados, inclusive `rascunho`/`revisão interna` que o cliente nunca vê; versão a versão |
| 4. Aprovações | `ApprovalRequest` | as do cliente + as internas (`clientVisible: false`) |
| 5. Comunicação | `PortalMessage` + `WhatsAppMessage` + `ClientNotice` | thread do portal, inbox WhatsApp, avisos com garantia de entrega |
| 6. Métricas | `Cycle` (todos, com `resultsJson` bruto) | o que o cliente vê em Resultados + o que ainda não fechou |
| 7. Integrações | `MetaConnection`/`GoogleConnection` do cliente | saúde, escopos, última sync — versão interna do checklist da seção 6 |
| 8. **Área interna — marcada** | notas internas, custos, margens (campos que a Fase 1 declarou sem lugar — 1.1 "Falta") | **visualmente demarcada** ("🔒 Interno — nunca vai ao portal") e, mais importante, estruturalmente: tudo aqui nasce `visibility: interno`, e a camada única de leitura do portal (Fase 1, 2.2) nem consulta esses campos. Marcação visual é lembrete; a trava é o backend |

### 4.3 O que acontece com as telas internas atuais

| Tela | Destino |
|---|---|
| `app/agency/tasks/page.tsx` | evolui para a **Fila** (4.1) |
| `app/agency/clients/[id]/page.tsx` | evolui para o **Mural** (4.2) |
| `app/agency/control-room/page.tsx` | vira a vista "por departamento" DENTRO da fila (grade de disparo) |
| `app/agency/pipeline/page.tsx` | mantida como vista transversal de estágios; cards linkam ao mural |
| `app/agency/dashboard/page.tsx` | mantida como abertura do dia do Diretor; cada item de ação linka para fila ou mural |

---

## 5. Política de Notificação ao Cliente

Restrição do briefing: o cliente só é acionado quando a decisão depende dele;
microetapa interna não gera notificação. Risco combatido: fadiga de aprovação →
abandono do portal → cobrança de volta no WhatsApp.

### 5.1 Lista FECHADA — só estes 4 eventos acionam o cliente na hora

| # | Evento | Gatilho técnico | Por que aciona |
|---|---|---|---|
| 1 | **Aprovação pronta para você** (inclui nova rodada pós-ajuste e resposta a dúvida) | T1 / T7 / T5b da tabela 2.3 | a bola passou para o cliente |
| 2 | **Projeto bloqueado por você** — material pedido ou conexão quebrada | `MaterialRequest.askedClientAt` gravado · conexão `expired`/`revoked`/`error` que o serviço exige | sem ele, a produção para |
| 3 | **Entrega publicada** | `Deliverable` → `publicado` (pós-decisão do cliente, T2) | é o valor chegando; fecha o ciclo da aprovação |
| 4 | **Prazo de aprovação vencendo/vencido** | `expiresAt` − 24h e E1 no vencimento (1 vez cada, não recorrente) | proteção do prazo combinado |

**Fechada significa fechada:** evento fora desta lista não notifica o cliente.
Adicionar um 5º evento é decisão de CEO registrada em `docs/decisoes.md`, não
ajuste de código.

### 5.2 Tudo o mais é silencioso ou agrupado

- **Silencioso (nunca notifica):** transição interna de estado, execução de
  agente, gate, refação em andamento, comentário interno, mudança de fase que
  não pede nada do cliente, novo arquivo interno.
- **Resumo agrupado (digest):** 1 mensagem semanal, no máximo — "o que
  aconteceu no seu projeto": entregas da semana, marcos atingidos, decisões
  registradas, pendências ainda abertas (inclui o caso E2, cliente ausente).
  Sem novidade → sem resumo (digest vazio não existe).
- **Agrupamento no dia:** se 2+ eventos da lista fechada ocorrem no mesmo dia
  para o mesmo cliente (ex.: 3 aprovações criadas), viram UMA notificação
  ("3 itens aguardam você"), não três.
- **Canal:** aviso persistente no portal via `ClientNotice` (já existe, com
  garantia de entrega — Fase 1, 1.12) sempre; canal externo (e-mail/WhatsApp) é
  o mesmo evento, nunca um evento a mais. Mensagem ativa por WhatsApp respeita
  a TRAVA DE PLATAFORMA (CLAUDE.md): parecer do especialista antes de qualquer
  automação de envio.

---

## 6. Checklist de integrações dentro de Conta

Decisão do briefing: conectar/monitorar é da plataforma (função nossa);
renderizar analytics é embed (seção 1.4). Conexões + Integrações (duas abas
hoje) viram **uma seção de Conta**, em formato checklist.

### 6.1 O card de cada conexão

Fonte: `MetaConnection` / `GoogleConnection` (`prisma/schema.prisma`), lidas
pelo padrão da rota-modelo `app/api/portal/conexoes/route.ts` (select explícito,
sem credencial — a auditoria a chamou de rota-modelo; é o template).

| Campo do card | Fonte | Nota |
|---|---|---|
| Plataforma + nome da conta | `platform`, `name` | |
| **Quem conectou** | **campo novo `connectedBy`** — a Fase 1 (1.15) registrou que não existe | gravado no callback do OAuth (nome do portador do token de portal ou do usuário de sessão); exibido como "Conectado por X em DD/MM" |
| Permissões | `scopes` | traduzidas para linguagem de cliente ("publicar posts", "ler resultados") — nunca o slug cru sozinho |
| Última sincronização | `lastSyncedAt` | relativa ("há 2 horas") |
| Saúde | derivada de `status` (connected · expired · revoked · error) + `tokenExpiresAt` | 3 faixas: OK · atenção (expira em < 7 dias) · quebrada (expired/revoked/error). Quebrada de serviço ativo → vira Pendência (bloco 1.5) e evento 2 da notificação |
| Ação | **Reconectar** (refaz o OAuth) · Desconectar | reconectar usa o fluxo existente `app/api/meta/connect-parceiro/route.ts` → `app/api/meta/callback/route.ts` (state CSRF, re-derivação do dono, `client_mismatch` — manter intacto) |

O checklist também lista o que **falta** conectar para os serviços contratados
("Tráfego pago precisa da conta de anúncios — Conectar"), estado `pendente`.

### 6.2 Credencial: OAuth/cofre como ÚNICO caminho

- **Já é o padrão da casa — citado como referência obrigatória:**
  `lib/integrations/meta/connections.ts` — token cifrado antes de tocar o banco
  (`saveConnection`: `encryptSecret` + `keyHint`), decifrado só quando uma
  chamada Graph precisa (`loadConnectionToken`), e a view **nunca** expõe o
  token (`toView`, comentário "never exposes the token"). Toda integração nova
  copia este desenho; nenhuma inventa outro.
- Restrição do briefing, agora regra da seção: **credencial e token nunca
  trafegam em tarefa, mensagem, comentário ou prompt.** Cliente nunca digita
  senha/token em campo nosso — se a plataforma não tem OAuth, a conexão não
  existe no v1.
- `DbIntegrationConfig` (chaves de IA da agência) é 100% interno: **jamais**
  aparece em Conta (Fase 1, 1.15).

### 6.3 Requisito de correção — achado A4 da auditoria (token em query string)

O token de portal é credencial única, sem expiração default, e hoje viaja em
URL (`app/portal/access/route.ts`, e todos os fetches `?token=` de
`app/portal/access/[token]/page.tsx`) — fica em log de servidor/proxy e
histórico de navegador (A4, severidade média, sistêmico).

**Requisito v1 (entra no protótipo da Fase 3 como fluxo, e na Fase 4 como
código):**

1. O link enviado ao cliente continua sendo o link único com token — a UX de
   "um link, sem senha" não muda.
2. **No primeiro acesso, o servidor troca o token por cookie de sessão de
   portal** (`httpOnly`, `Secure`, `SameSite=Lax`, escopo `/portal`) **e
   redireciona para URL limpa** (sem token no caminho nem na query).
3. Todas as chamadas de API do portal passam a autenticar pelo cookie;
   `?token=` deixa de ser aceito nas rotas de dados (`app/api/portal/*`,
   `app/api/brain/portal-data`, `app/api/social-posts` ramo token,
   `app/api/media/*`) após período de transição.
4. O token original permanece válido para novos acessos (revalidação de
   dispositivo) — revogação e auditoria continuam onde estão
   (`lib/agency/persistence/portal-access-service.ts`: `lastAccessedAt`,
   `accessCount`, 256 bits — mitigantes reais citados pela auditoria, mantidos).
5. `PortalAccess.expiresAt` ganha default (proposta: 180 dias, renovado a cada
   acesso) — "sem expiração" deixa de ser o padrão silencioso.

---

## 7. Roteiro do teste com o CEO

**Adaptação declarada:** o briefing pede teste com 5 funcionários e 5 clientes.
Esta casa roda **100% IA** (decisão do CEO, 31/07/2026, CLAUDE.md) — não há 5
funcionários, e não há 5 clientes disponíveis para o protótipo. **O substituto
é o CEO executando o papel de cliente**, sem treinamento e sem ajuda do
Diretor durante as tarefas. Limite honesto: 1 usuário não valida como 10 — o
teste com clientes reais continua devido antes de código de produção (restrição
do briefing) e fica registrado como pendência da Fase 4.

**Setup:** protótipo navegável da Fase 3, com dados realistas de 1 cliente
fictício (1 aprovação pendente com prazo, 1 material pedido, 1 conexão
quebrada, 2 entregas publicadas, 1 ciclo fechado com métrica completa). CEO no
**celular** (375px — prioridade declarada no CLAUDE.md). Ninguém aponta a tela.
Cronômetro em cada tarefa. O condutor só lê o enunciado da tarefa, nada mais.

### 7.1 As tarefas que o CEO executa

| # | Tarefa (enunciado lido ao CEO) | Sucesso operacional (mensurável, sem interpretação) | Meta |
|---|---|---|---|
| 1 | "Você é o cliente. Abra o portal e me diga o que está esperando por você." | Encontra o bloco de Pendências e enumera as 3 pendências plantadas (aprovação, material, conexão) sem clicar em mais de 1 item de menu | ≤ 30 s, 0 ajudas |
| 2 | "Em que pé está o seu projeto?" — o **teste dos 30 segundos** do briefing, definido operacionalmente | Em ≤ 30 s a partir do Início, diz em voz alta: (a) a fase atual, (b) a próxima coisa que acontece, (c) se algo depende dele — **as 3 respostas batendo com o dado plantado** = sucesso; 2 de 3 = parcial; ≤ 1 = falha | ≤ 30 s |
| 3 | "Essa entrega não ficou boa: peça um ajuste no texto." | Completa o caminho B: acha a aprovação, escolhe Solicitar ajustes, escreve comentário (o sistema deve tê-lo impedido de enviar vazio), envia, e **verbaliza que a versão anterior continua acessível** | ≤ 2 min, 0 erros de caminho |
| 4 | "Agora aprove a outra peça pendente." | Completa o caminho A; a decisão aparece registrada (bloco 1.6) e ele a encontra quando perguntado "onde ficou registrado o que você decidiu?" | ≤ 1 min |
| 5 | "Você não entendeu para que serve essa peça. Pergunte." | Usa **Tenho uma dúvida** (não o chat geral, não o ajuste); a dúvida aparece presa ao card | ≤ 1 min |
| 6 | "O Instagram desconectou. Resolva." | Chega ao card da conexão (via pendência do Início OU via Conta) e aciona Reconectar | ≤ 1 min |
| 7 | "Me diga o que você está ganhando com o projeto." | Chega a Resultados e cita a métrica COM a meta e a ação recomendada (se citar só o número, parcial — o bloco falhou em comunicar) | ≤ 1 min |
| 8 | (pergunta-armadilha) "Quanto a agência está gastando para produzir isso?" | **NÃO encontra** custo/margem/nota interna em lugar nenhum do portal. Encontrar qualquer dado interno = **falha crítica do teste inteiro**, independente das outras tarefas | — |

**Regra de ajuda:** cada dica do condutor conta como 1 ajuda; tarefa com 2+
ajudas = falha dela. **Critério de aprovação do protótipo:** tarefas 1–4 todas
em sucesso pleno + tarefa 8 sem falha crítica + nenhuma tarefa com falha total.
Tarefas 5–7 em parcial geram iteração, não reprovação.

### 7.2 Planilha de coleta

Preencher uma linha por tarefa, durante o teste (não de memória):

| Tarefa | Tempo (s) | Ajudas (n) | Erros de caminho (cliques fora da rota esperada) | Sucesso (pleno / parcial / falha) | Fala do CEO (citação literal) | Correção proposta |
|---|---|---|---|---|---|---|
| 1 — localizar pendências | | | | | | |
| 2 — estado em 30 s | | | | | | |
| 3 — ajuste com comentário | | | | | | |
| 4 — aprovar + decisão | | | | | | |
| 5 — tenho uma dúvida | | | | | | |
| 6 — reconectar conta | | | | | | |
| 7 — resultados com meta | | | | | | |
| 8 — armadilha de vazamento | | | | (sem falha crítica / **FALHA CRÍTICA**) | | |

Métricas agregadas ao fim (as do briefing, adaptadas a 1 usuário): tempo até a
pendência (tarefa 1) · taxa de conclusão sem ajuda (tarefas concluídas com 0
ajudas ÷ 8) · erros de permissão (tarefa 8: 0 ou falha) · retrabalho (tarefas
refeitas) · mensagens necessárias para entender uma entrega (contagem de
perguntas espontâneas do CEO fora da tarefa 5).

---

## Pendências que este documento abre (para as Fases 3–4)

1. **Fase 3 (protótipo):** montar as telas exatamente como especificado — Início
   (ordem 3.2), Aprovações (três caminhos + comentário obrigatório + versões),
   os 6 itens de menu, o card de conexão, e as duas portas internas sobre as
   telas existentes de `app/agency/`.
2. **Fase 4 (código):** `DeliverableVersion` + vínculo aprovação↔versão (mata
   A2) · validação de comentário obrigatório no backend · ancoragem de
   mensagem (`anchorType`/`anchorId`) · `connectedBy` nas conexões · troca
   token→cookie (A4) · default de `expiresAt` no `PortalAccess` · evento de
   auditoria estruturado nas transições da tabela 2.3.
3. **Decisões declaradas aqui que o CEO pode reverter:** trilha derivada em vez
   de tabela `Milestone` (1.3) · sem aprovação parcial no v1 (E3) · lista
   fechada de 4 notificações (5.1) · CEO como único testador do protótipo (7).
4. **Continua devido de fases anteriores:** teste dinâmico de vazamento
   (Fase 4) · travas A1 (regex de preço) e A3 (`scriptJson`) da auditoria ·
   teste com clientes reais antes de código de produção.

_Fase 2 do Hub do Cliente · 03/08/2026 · fontes: `docs/projetos/hub-do-cliente-briefing.md`, `docs/projetos/hub/00-auditoria.md`, `docs/projetos/hub/01-modelo-e-visibilidade.md`, `prisma/schema.prisma`, `app/api/portal/`, `app/portal/access/[token]/page.tsx`, `app/agency/{tasks,clients,control-room,pipeline,dashboard}/`, `lib/agency/esteira/`, `lib/integrations/meta/connections.ts`._

---

## Devolutiva do CEO — 03/08/2026 (teste do protótipo)

**APROVADO** ("achei ótimo... gostei bastante desse layout, pode seguir"),
com UMA adição obrigatória:

- **Chat com o PM no portal do cliente** — gaveta lateral, sempre acessível,
  para dúvidas e assuntos gerais. O PM é a ponte única entre o cliente e todos
  os departamentos: o cliente nunca fala com um departamento direto, fala com
  o PM (que na prática é a IA da casa, com escalada ao humano quando preciso).
  Entra na construção como parte do Lote de portal, com as regras da casa:
  resposta ancorada em verdade, sem prometer prazo/valor sem fonte, e
  mensagem que exija decisão vira Pendência.
