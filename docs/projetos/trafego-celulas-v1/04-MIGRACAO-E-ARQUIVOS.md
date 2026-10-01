# Migração e Arquivos Afetados

## Regra de migração

A estrutura atual possui sete funções de Tráfego: um gerente e seis agentes genéricos. A V1 preserva o gerente, substitui a execução genérica por duas células e acrescenta oito funções líquidas ao catálogo.

Não apagar IDs, tarefas ou registros históricos. Os seis IDs genéricos devem ganhar tratamento de legado compatível:

- registros concluídos permanecem vinculados ao ID original;
- tarefas abertas exigem classificação explícita como Meta/WhatsApp ou TikTok;
- tarefa sem plataforma não é migrada silenciosamente;
- adaptadores de leitura mantêm histórico acessível;
- novas tarefas usam apenas os IDs especializados.

## Arquivos e superfícies que o arquiteto deve localizar e atualizar

### Fonte de verdade

- `docs/arquitetura-operacional-v2/02-DEPARTAMENTOS-E-AGENTES.md`
- `docs/arquitetura-operacional-v2/03-ESTEIRA-E-HANDOFFS.md`
- `docs/arquitetura-operacional-v2/04-PERMISSOES-RBAC.md`
- `docs/arquitetura-operacional-v2/architecture.manifest.json`
- `docs/arquitetura-operacional-v2/visual/dioli-operating-model.html`

### Catálogo e fichas

- catálogo canônico em `lib/agency/catalogo-v2/`;
- fichas em `agentes/linha/paid-traffic/`;
- parser e contrato das fichas em `lib/agency/catalogo-v2/specs.ts`;
- adaptadores de IDs legados;
- testes estruturais das fichas e do catálogo.

Cada nova função deve ter ficha completa no mesmo esquema operacional atual: entradas obrigatórias, saída, ferramentas permitidas e proibidas, dados acessíveis e proibidos, handoff, SLA, timeout, retentativas, métrica, golden set normal/recusa/escalada, modelo e fallback, teto de custo, autonomia, gatilhos humanos e índice operacional.

### Roteamento e execução

- triagem e classificação de plataforma;
- executor V2 e negação por padrão;
- handoffs e aceite de recebimento;
- orçamento, tracking e observabilidade;
- filas e superfícies do departamento;
- guards de acesso e RBAC;
- relatórios e visão consolidada do gerente.

## Compatibilidade obrigatória

- manter `paid-traffic` como ID do departamento;
- manter `manager-trafego` como gerente único;
- não alterar a chave pública `trafego` sem adaptador;
- não quebrar dados históricos, portal, relatórios ou permissões existentes;
- agentes e coordenadores novos nascem `ativa: false`;
- a flag `v2_execucao` continua desligada;
- nenhuma credencial real entra em fixture, teste, documentação ou commit.

## Entrega esperada

Um PR próprio, sem merge automático, contendo documentação atualizada, catálogo, 15 fichas válidas, migração/adaptadores, permissões, handoffs, observabilidade, testes e evidências. Nenhuma campanha real deve ser criada ou modificada.
