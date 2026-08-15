# Marco 1 — Arquitetura de dados da V2 e plano de migração/rollback

> Desenho aprovado tecnicamente para o M2/M3. Regras de ouro: aditivo sempre,
> flag em toda escrita nova, portável (nada exclusivo de SQLite), Brain
> preservado integralmente.

## 1. O catálogo canônico (código, não banco)

- `lib/agency/catalogo-v2/catalogo.ts` — **gerado do
  `architecture.manifest.json`**: 11 departamentos, 62 funções executoras,
  workflow de 9 marcos, 20 estados, 9 bloqueios, 4 decisões do cliente.
- **Teste de contrato**: um teste compara código ↔ manifesto; divergiu,
  CI reprova. O manifesto é a fonte; ninguém edita o catálogo à mão.
- Adaptadores: `deSlugLegado()` (`financeiro`→`finance`, `brand-hub`→
  `branding`, chaves do portal, `prospeccao`→função) e `paraSlugLegado()` —
  ambos totais e testados nos dois sentidos.
- Cada função carrega: id, departamento, capacidades declaradas (o que pode
  ler/escrever/executar), se está ativa, e referência da ficha
  (descrição de cargo, template mestre D-003).

## 2. Tabelas novas (todas aditivas, criadas no M2/M3)

| Tabela | Para quê | Campos-chave |
|---|---|---|
| `ExecucaoV2` | **Registro de toda execução — determinação do CEO**: humana ou IA | ator (`humano`\|`ia`), userId?, funcaoId, departamentoId, modelo?, versaoModelo?, custoUsd?, ferramentas (json), inicio/fim, resultado, correlationId. Complementa `AIRunLog` (que fica; backfill liga os dois) |
| `TransicaoDeEstado` | Auditoria de toda transição da máquina canônica | entidadeTipo, entidadeId, de, para, atorTipo, atorId, motivo, origem, versaoLida, chaveIdempotencia (única), correlationId, criadoEm |
| `BloqueioV2` | Bloqueios tipados com dono e SLA | entidadeRef, tipo (9 canônicos), donoFuncaoId, abertoEm, slaAte, evidencia, acaoRecomendada, escalonadoPara?, resolvidoEm? |
| `OutboxV2` | Todo efeito externo (mensagem, webhook, publicação, aprovação) | tipo, payload, status (`pending`/`sent`/`failed`/`dead`), tentativas, proximaTentativaEm, chaveIdempotencia (única), correlationId. Generaliza o padrão do `WhatsAppOutbox` (que fica e é adaptado) |
| `HeartbeatDoRelogio` | Prova de vida do scheduler (M6) | relogio, ultimaBatida, alertadoEm? |
| `FlagV2` | Feature flags da migração | chave, ligada, escopo (`global`\|workspace\|cliente), motivo, decididoPor, em |
| `ReconciliacaoV2` | Relatórios de leitura dupla (M3) | entidadeTipo, execucaoEm, total, divergentes, amostra (json), veredito |

Colunas aditivas em entidades existentes (M3): `estadoCanonico` (derivado,
nunca digitado), `correlationId` onde faltar. **Nenhuma coluna/tabela legada é
removida na V2** — remoção só depois da janela de estabilidade, com aprovação
do CEO, fora deste escopo.

## 3. RBAC de quatro camadas

Base: **estender `lib/agency/organizacao/`** (autoridade × departamento, que
já serve menu, página e API pela mesma regra) com:

- `client_scope` e `organization_id` verificados no servidor em toda
  consulta/mutação de dados de cliente (portal já tem guarda por token; a
  camada interna ganha escopo explícito);
- capacidade por FUNÇÃO (do catálogo), negada por padrão;
- trilha de impersonação (Master/Diretor + motivo + registro em
  `TransicaoDeEstado` com origem `impersonacao`);
- audit log uniforme para mutação sensível.

A matriz do `04-PERMISSOES-RBAC.md` vira teste: cada célula da tabela é um
caso (papel × área × ação → permitido/negado), rodado contra a API real.

## 4. Máquina de estados

- `lib/agency/estados-v2/maquina.ts`: os 20 estados e as transições legais do
  diagrama do `05`; transição exige as 6 condições (permissão, entrada,
  versão, idempotência, evento persistido, efeito via outbox).
- **Estado é derivado**: `derivarEstado(entidade)` calcula do fato legado
  (tabela do MAPA-LEGADO-V2); a coluna `estadoCanonico` é cache auditado, e a
  leitura dupla compara os dois até divergência zero.
- Portal e painel interno leem a MESMA função de estado; muda só o rótulo
  (o teste de jargão no portal continua valendo).

## 5. Sequência de migração e rollback (M3)

1. Migration aditiva (tabelas novas + colunas nulas) — reversível por não uso.
2. Backfill idempotente (re-rodável; marca d'água por entidade).
3. Leitura dupla ligada (flag `v2_leitura_dupla`): toda leitura calcula
   canônico e compara com legado; divergência vira linha em
   `ReconciliacaoV2`, nunca exceção para o usuário.
4. Escrita nova atrás de `v2_escrita` (por workspace) — desligar a flag =
   rollback imediato de comportamento, sem tocar dado.
5. Reconciliação final com relatório zero-divergência antes de promover.
6. Rollback demonstrado em teste: liga → escreve → desliga → estado legado
   intacto e operação segue como antes.

## 6. O Brain na V2 (determinação do CEO, 15/08 — literal no que importa)

Preserva-se integralmente: dados, memórias, prompts, regras, aprendizados,
históricos, integrações e capacidades úteis (`reason.ts`, fluxo cognitivo,
snapshot, governança CR, evidence, knowledge, treinos, AIRunLog, versões).
Elimina-se a departamentalização paralela: `BRAIN_DEPARTMENTS`, papéis,
permissões e estados próprios do catálogo do Brain são mapeados e migrados
para o canônico via adaptador — o Brain consulta o catálogo, nunca o
contrário. Nada é apagado antes de backfill, leitura dupla, reconciliação e
rollback comprovados; a remoção física de `BRAIN_DEPARTMENTS` só acontece
quando o adaptador estiver em produção estável e nenhum código o importar.

## 7. Decisão de banco (fechada no M1)

SQLite (libsql, volume persistente) atende a V2: um processo, filas em
tabela com despertador, outbox com retentativa. Tabelas novas 100% portáveis
para Postgres. Gatilho de promoção futura: mais de um nó de escrita ou
contenção medida de lock — decisão de negócio fora deste escopo.
