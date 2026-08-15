# Plano de Migração

## Objetivo

Substituir as estruturas departamentais e de acesso conflitantes sem perder clientes, tarefas, entregas, aprovações, ciclos, mensagens ou integrações.

## Fase 0 — compreensão

Executar o Portão Zero. Nenhum código é alterado.

## Fase 1 — inventário

- localizar todos os catálogos de departamentos, agentes, papéis e menus;
- localizar todas as leituras e mutações de status;
- mapear tabelas, enums, filas, crons, webhooks e integrações;
- registrar divergências entre código, interface e banco;
- produzir mapa `origem -> destino` para cada valor legado.

## Fase 2 — núcleo compatível

- criar catálogo canônico único;
- criar adaptadores para slugs e papéis legados;
- centralizar autorização no servidor;
- centralizar derivação de estado;
- adicionar eventos, idempotência, outbox e auditoria;
- manter leitura compatível durante a transição.

## Fase 3 — migração aditiva

- adicionar novos campos/tabelas sem apagar os antigos;
- fazer backfill idempotente e verificável;
- rodar leitura dupla para comparação;
- ativar escrita nova por feature flag;
- medir divergências antes de promover.

## Fase 4 — superfícies

- Central de Trabalho por função;
- visão transversal de Clientes;
- departamentos com edição própria;
- PM Command Center;
- portal do cliente e Brand Hub;
- Diretoria/Master com todas as páginas atuais.

## Fase 5 — corte e desativação

- congelar estruturas antigas;
- realizar reconciliação final;
- promover V2 por grupos internos e clientes piloto;
- manter rollback testado;
- remover legado somente após janela de estabilidade e aprovação do CEO.

## Proibições

- não criar um terceiro catálogo de departamentos;
- não editar dados de produção manualmente para “encaixar” a V2;
- não reutilizar slug legado sem mapear significado;
- não apagar campo/tabela na primeira migração;
- não publicar todos os clientes de uma vez;
- não ligar automação sem idempotência e trilha de auditoria.

## Rollout recomendado

1. ambiente de teste com massa sintética;
2. equipe interna;
3. um cliente piloto;
4. três clientes de perfis distintos;
5. restante da base por lotes.

