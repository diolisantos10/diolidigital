# Dioli Agency OS — Arquitetura Operacional V2

**Status:** aprovado conceitualmente pelo CEO; implementação bloqueada até o Portão Zero.

Esta pasta é a fonte de verdade para reconstruir a departamentalização da Dioli e conectá-la à esteira operacional. O novo modelo **substitui** departamentos, permissões e fluxos conflitantes; não deve ser adicionado como uma terceira estrutura paralela.

## Ordem obrigatória de leitura

1. `08-PORTAO-ZERO-LEITURA.md`
2. `01-ARQUITETURA-MESTRA.md`
3. `02-DEPARTAMENTOS-E-AGENTES.md`
4. `03-ESTEIRA-E-HANDOFFS.md`
5. `04-PERMISSOES-RBAC.md`
6. `05-ESTADOS-E-RECUPERACAO.md`
7. `06-PLANO-DE-MIGRACAO.md`
8. `07-CRITERIOS-DE-ACEITE.md`
9. `10-BACKLOG-DE-CONSTRUCAO.md`
10. `09-PROMPT-DIRETOR-E-ARQUITETO.md`

## Conteúdo do pacote

| Arquivo | Função |
|---|---|
| `01-ARQUITETURA-MESTRA.md` | Princípios, organograma e decisões não negociáveis |
| `02-DEPARTAMENTOS-E-AGENTES.md` | 11 departamentos, agentes e fronteiras de responsabilidade |
| `03-ESTEIRA-E-HANDOFFS.md` | Conexão entre a esteira e os departamentos |
| `04-PERMISSOES-RBAC.md` | Acessos por departamento e papel |
| `05-ESTADOS-E-RECUPERACAO.md` | Máquina de estados, bloqueios, retentativas e auditoria |
| `06-PLANO-DE-MIGRACAO.md` | Como substituir o modelo atual sem perder dados |
| `07-CRITERIOS-DE-ACEITE.md` | Condições objetivas para considerar a V2 segura |
| `08-PORTAO-ZERO-LEITURA.md` | Leitura e explicação obrigatórias antes de programar |
| `09-PROMPT-DIRETOR-E-ARQUITETO.md` | Ordem pronta para delegação |
| `10-BACKLOG-DE-CONSTRUCAO.md` | Sequência de execução por marcos |
| `architecture.manifest.json` | Contrato canônico legível pelo sistema |
| `visual/dioli-operating-model.html` | Referência visual interativa |
| `source/A-esteira-da-Dioli-construida.pdf` | Documento original usado como base |

## Regra de precedência

Em caso de conflito: decisão escrita nesta pasta → `architecture.manifest.json` → código atual. O código atual não prevalece automaticamente porque contém definições departamentais concorrentes que esta reconstrução pretende eliminar.

## Resultado esperado

Uma única arquitetura, um único catálogo de departamentos, uma única máquina de estados, uma única política de permissões e o Project Manager como voz central entre cliente e especialistas.

