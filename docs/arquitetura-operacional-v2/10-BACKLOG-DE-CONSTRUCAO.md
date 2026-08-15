# Backlog de Construção

## Marco 0 — Entendimento

- ler todo o pacote;
- criar `RELATORIO-DE-ENTENDIMENTO.md`;
- aguardar aprovação explícita do CEO.

**Saída:** entendimento aprovado. **Código:** zero alterações.

## Marco 1 — Inventário e desenho técnico

- mapear departamentos, agentes, papéis, menus e permissões atuais;
- mapear estados, crons, filas, integrações e webhooks;
- criar tabela de conflitos e mapa legado → V2;
- apresentar arquitetura de dados e plano de migração/rollback.

**Gate:** aprovação do Diretor/CEO antes de migrations.

## Marco 2 — Núcleo canônico

- implementar catálogo único de departamentos/agentes;
- implementar capabilities e RBAC no servidor;
- implementar máquina de estados e contratos de handoff;
- implementar audit log, idempotência e outbox;
- criar adaptadores para legado.

**Gate:** testes unitários e de autorização verdes.

## Marco 3 — Migração aditiva

- migrations sem exclusão;
- backfill idempotente;
- leitura dupla e relatório de divergência;
- feature flags e rollback.

**Gate:** reconciliação sem perda e rollback demonstrado.

## Marco 4 — Operação interna

- Central de Trabalho por função;
- Clientes com overview transversal;
- páginas departamentais;
- PM Command Center;
- visão Master/Diretor completa.

**Gate:** permissões UI + API + servidor comprovadas.

## Marco 5 — Portal do cliente

- resultados como primeiro impacto;
- projetos, aprovações e entregas;
- solicitar, ajustar, recusar/refazer e cancelar;
- Brand Hub, entrevista e upload de Brand Book/assets;
- integrações editáveis pelo cliente e visíveis internamente;
- chat centralizado com PM.

**Gate:** isolamento entre organizações e usabilidade testada.

## Marco 6 — Automação e recovery

- scheduler heartbeat;
- filas, retentativas e dead-letter;
- detector de processos parados;
- recovery manual idempotente;
- alertas e dashboards operacionais.

**Gate:** testes de falha e retomada.

## Marco 7 — Piloto e rollout

- massa sintética;
- equipe interna;
- um cliente piloto;
- três clientes diferentes;
- rollout por lotes.

**Gate final:** critérios de aceite integralmente comprovados e autorização do CEO.

