# Relatório Final — Arquitetura Operacional V2 construída

> Entrega exigida pela autorização do CEO (15/08/2026): "ao concluir o Marco 7,
> entregue um relatório final com tudo o que foi construído, testes executados,
> migrações, divergências corrigidas, riscos remanescentes, rollback e
> evidências de funcionamento." Executor: o arquiteto da V2 (Agente de Fichas,
> Control Room), sob execução contínua autorizada — um PR por marco, gates
> técnicos, sem pausa entre marcos.

---

## 1. O que foi construído, marco a marco

| Marco | PR | Entrega |
|---|---|---|
| Portão Zero | #138 | Leitura integral + `RELATORIO-DE-ENTENDIMENTO.md`; aprovação explícita do CEO |
| M1 Inventário | #139 | 6 catálogos concorrentes mapeados; 52 páginas, 59 models, todos os vocabulários de estado; mapa legado→V2 valor a valor; arquitetura de dados; dados vivos nominais; decisão de banco |
| M2 Núcleo | #140 | Catálogo canônico derivado do manifesto (11 departamentos, **62 funções** — a conta é teste); adaptadores de slug totais; capacidade por função negada por padrão; máquina de 20 estados com 6 condições; **registro humano/IA** (ator, modelo, versão, custo, data, ferramentas); 7 tabelas aditivas |
| M3 Migração | #141 | `estadoCanonico` em 10 entidades (ALTER puro — o diff gerado propunha cirurgia e foi recusado); backfill idempotente; leitura dupla com reconciliação; flags fail-closed com procedência; **ensaio geral em banco real com rollback provado** |
| M4 Operação | #142 | PM Command Center canônico (bloqueios/SLA, outbox, reconciliações, execuções humano×IA); API na mesma linha do inventário; fila da Central recortada pelo perfil. Central/Clientes/departamentais existentes **aproveitados** — sem terceira estrutura |
| M5 Portal | #143 | A quarta decisão (**cancelar com ressalva**) + recusar/refazer na tela; contrato único das 4 decisões; posse pura com isolamento provado à exaustão; rastro canônico idempotente de toda decisão |
| M6 Recovery | #144 | Outbox com retentativa exponencial e fila morta; heartbeat com detector de ausência; detector de parados por estado+SLA; **retomar processo** idempotente (PM/Diretor) com botão + motor juntos; relógio `/api/cron/v2` |
| M7 Piloto | este PR | Os **15 cenários do 07-CRITERIOS como teste executável** em massa sintética + motor de rollout pela direção (`/api/v2/rollout`) com flags, backfill, reconciliação e veredito |

## 2. Testes executados (evidência)

- **Suíte inteira: 4.392 testes, 277 arquivos, 100% verde** (linha de base
  pré-V2: 4.285/262 — a V2 somou 107 testes novos sem quebrar nenhum existente).
- `tsc --noEmit` limpo · eslint limpo · `next build` compilando em todos os marcos.
- **Os 15 cenários obrigatórios** (`__tests__/v2/criterios-de-aceite.test.ts`),
  em banco SQLite real e descartável, massa 100% sintética: aprovação dupla
  simultânea → 1 produção; relógio 2× → 1 execução; falha pós-persistência →
  reprocessada; material libera só dependentes; reprova volta com motivo;
  auditor mudo ≠ aprovado; pacote vazio não pede decisão; cancelamento preserva
  versões; capacidade cruzada negada; id trocado negado; ciclo reabre sem
  duplicar; cobrança dupla barrada pela chave única; flag sem procedência não
  entra; rollout+rollback sem perda de vínculo.
- **Ensaio geral da migração** (`migracao-rollback.integracao.test.ts`):
  migrate deploy do zero → semeadura → backfill (2ª rodada = zero escrita) →
  reconciliação `promovivel` → rollback por flag → **legado byte a byte intacto**.

## 3. Migrações

- `20260815180000_v2_nucleo_canonico` — 7 tabelas novas (ExecucaoV2,
  TransicaoDeEstado, BloqueioV2, OutboxV2, FlagV2, ReconciliacaoV2,
  HeartbeatDoRelogio), 14 índices.
- `20260815190000_v2_estado_canonico_aditivo` — `estadoCanonico TEXT` nulo em
  10 entidades, `ALTER TABLE ADD COLUMN` puro.
- **Nada legado alterado ou removido.** Deploy completo provado em banco limpo;
  compatível com o `start.sh` de produção (backup pré-migration + retry anti-lock).

## 4. Divergências corrigidas no caminho

1. **Corrida de idempotência real** (achado do cenário 1): dois pedidos
   simultâneos passavam juntos pelo pré-cheque; a chave única era a barreira
   final mas o motor tratava a violação como erro. Corrigido no motor: perdedor
   da corrida = sucesso idempotente; qualquer outra falha sobe.
2. **`migrate diff` propôs reconstrução de tabela** (o padrão-cirurgia que o
   `start.sh` teme) — recusado; migração escrita à mão, aditiva pura.
3. **Dois testes da casa** quebrados pelo refactor do M5 — ajustados com
   fidelidade (lookup preguiçoso restaurado; verificação de fonte apontada ao
   contrato no novo endereço).
4. **Catálogo do Brain com 9 vs código com catálogos de 9/11/5** — unificado
   pelo canônico com adaptadores; Brain preservado integralmente como camada de
   inteligência (determinação do CEO), departamentalização dele mapeada.

## 5. As determinações do CEO — status

| Determinação | Status |
|---|---|
| Catálogo com 62 funções | ✅ derivado do manifesto; a conta é teste de CI |
| Engenharia separada da operação | ✅ `.claude/agents` intocados; catálogo V2 é só operação |
| Registro humano/IA (ator, modelo, versão, custo, data, ferramentas) | ✅ `ExecucaoV2` + validação que recusa registro incompleto; visível no PM Command Center |
| Escada sombra→allowlist→wide preservada | ✅ intocada; funções novas nascem desligadas no mesmo espírito fail-closed |
| Travas Meta/Google/TikTok, App Review, publicação fail-closed | ✅ intocadas; nenhum executor de efeito externo com consequência real foi ligado |
| Governança CEO→DG→Diretores; operação Cliente↔PM↔Departamentos | ✅ RBAC apoiado na organizacao/ + PM como voz única no contrato do portal |
| Dados sintéticos e ambiente controlado | ✅ todo teste em banco descartável; produção não tocada |
| Migração aditiva, flags, leitura dupla, rollback | ✅ provados em ensaio |
| Um PR por marco | ✅ PRs #139–#145 |
| Nunca avançar com teste falhando | ✅ suíte verde em todo merge |

## 6. Rollback — como se desfaz cada coisa

- **Comportamento**: desligar a flag (`FlagV2`) — provado em teste; sem flag
  ligada, nada da V2 escreve.
- **Código**: reverter o merge do marco (PRs isolados por marco).
- **Dados**: colunas novas nulas e tabelas novas sem uso ficam inertes; nenhuma
  remoção de legado aconteceu — não há o que restaurar.

## 7. Riscos remanescentes (honestos, com dono)

1. **O rollout de produção NÃO foi executado.** O motor está pronto
   (`/api/v2/rollout`, restrito à direção, com procedência obrigatória), mas
   ligá-lo exige sessão de direção em produção — credencial que só o CEO possui
   (condição de parada nº 2 da autorização). **Próximo passo físico: a direção
   chama o rollout com escopo piloto (um workspace), lê o veredito da
   reconciliação e promove por lotes.**
2. **App Review da Meta segue sendo o bloqueio real de publicação** — parecer
   vigente NÃO PODE; nenhum marco resolve porque é calendário e posse.
3. **Executores de efeito externo com consequência real** (mensagem, publicação)
   não foram ligados de propósito — cada um entra quando o fluxo que o enfileira
   for ligado por flag, para nenhuma automação nascer antes da trilha dela.
4. **SLA por estado é régua inicial** — ajustável por decisão registrada; o
   detector lista estados sem régua em vez de fingir que não existem.
5. **Superfícies legadas continuam as fontes visíveis** até a promoção; a V2
   convive por baixo (leitura dupla) até a reconciliação global dizer
   `promovivel`. Corte final do legado: janela de estabilidade + palavra do CEO
   (fase 5 do plano de migração — fora desta autorização, por escrito).
6. **Fichas das 62 funções**: o catálogo carrega a estrutura; as descrições de
   cargo (template mestre D-003) existem para os 14 da obra e ficam pendentes
   para as funções da linha — trabalho contínuo do Agente de Fichas, fora do
   caminho crítico da V2.

## 8. Evidências de funcionamento — onde olhar

- PRs #139–#145, cada um com gate registrado no corpo.
- `__tests__/v2/` — 16 arquivos, 107 testes (contrato, adaptadores,
  capacidades, máquina, registro, derivação, flags, backfill, leitura dupla,
  ensaio de migração, superfícies, isolamento do portal, decisões, recovery,
  critérios de aceite).
- PM Command Center (`/agency/pm-command`) — a sala onde a operação V2 se vê:
  bloqueios, outbox, reconciliações, execuções humano×IA, retomar.
- `docs/arquitetura-operacional-v2/marco-1/` — inventário, mapa e arquitetura.

*15/08/2026 — construção dos Marcos 1 a 7 concluída sob a autorização de
execução contínua. A V2 está mergeada, testada e desligada por flag,
aguardando o clique de rollout da direção.*
