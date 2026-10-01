# Portal do Cliente - modos Basico e Avancado

Status: especificacao e prototipo aprovados pelo CEO para implementacao.

Referencia visual publicada: https://dioli-portal-cliente-basico.jaunty-hinny-1384.chatgpt.site

## Decisao central

Nao existem dois portais, duas bases ou duas regras de negocio. Existe um unico Portal do Cliente, sobre a mesma vista segura de dados, com duas camadas de apresentacao:

- **Basico**: padrao para um novo usuario. Explica o negocio em linguagem comum, mostra poucos indicadores e destaca somente decisoes reais do cliente.
- **Avancado**: leitura completa para agencias, equipes de marketing e clientes que desejem acessar todas as frentes.

O cliente pode alternar entre os modos a qualquer momento. A troca muda apenas a apresentacao; nunca altera dados, permissoes, status, aprovacoes ou arquivos.

## Ordem obrigatoria de leitura

1. `../../arquitetura-operacional-v2/02-DEPARTAMENTOS-E-AGENTES.md`
2. `../../arquitetura-operacional-v2/03-ESTEIRA-E-HANDOFFS.md`
3. `01-ESPECIFICACAO-FUNCIONAL.md`
4. `02-MAPA-DE-IMPLEMENTACAO.md`
5. `03-AUDITORIA-DE-LOGOS.md`
6. `05-CONEXAO-COM-ARQUITETURA-OPERACIONAL.md`
7. Abrir `prototype/index.html` e testar o switch Basico/Avancado.
8. Ler `04-PROMPT-PARA-O-ARQUITETO.md` antes de tocar no codigo de producao.

## O que esta neste pacote

- especificacao funcional completa;
- mapa dos arquivos atuais que serao afetados;
- conexao formal com a departamentalizacao e a esteira SDR -> entrega -> medicao;
- auditoria preliminar das logos e regra de fonte oficial;
- prototipo navegavel, responsivo e sem dependencia externa;
- componente de referencia para persistencia do modo;
- prompt pronto para delegacao ao arquiteto;
- criterios de aceite e testes obrigatorios.

## Limite desta entrega

O material desta pasta e um handoff de construcao. Ele nao substitui o portal de producao e nao deve ser publicado como rota real. A integracao deve preservar autenticacao por cookie httpOnly, allowlist do backend, aprovacoes, Brand Hub, materiais, integracoes e todos os testes de seguranca ja existentes.

## Dados do prototipo

CityJobs e os numeros exibidos sao apenas dados demonstrativos. Nenhum numero do prototipo pode ser copiado para a producao. A tela real deve continuar exibindo somente dado medido ou um estado vazio honesto.
