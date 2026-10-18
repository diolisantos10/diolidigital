# Prompt pronto para o arquiteto

Copie e envie o bloco abaixo integralmente.

---

Voce vai implementar o Portal do Cliente com modos Basico e Avancado no repositorio `diolisantos10/diolidigital`.

Antes de tocar no codigo, leia integralmente esta pasta, na ordem:

1. `docs/arquitetura-operacional-v2/02-DEPARTAMENTOS-E-AGENTES.md`
2. `docs/arquitetura-operacional-v2/03-ESTEIRA-E-HANDOFFS.md`
3. `docs/arquitetura-operacional-v2/visual/dioli-operating-model.html`
4. `docs/projetos/portal-cliente-modos/00-LEIA-PRIMEIRO.md`
5. `docs/projetos/portal-cliente-modos/01-ESPECIFICACAO-FUNCIONAL.md`
6. `docs/projetos/portal-cliente-modos/02-MAPA-DE-IMPLEMENTACAO.md`
7. `docs/projetos/portal-cliente-modos/03-AUDITORIA-DE-LOGOS.md`
8. `docs/projetos/portal-cliente-modos/05-CONEXAO-COM-ARQUITETURA-OPERACIONAL.md`
9. abra `docs/projetos/portal-cliente-modos/prototype/index.html` e teste os dois modos;
10. leia `docs/projetos/portal-cliente-modos/implementation-example/PortalModeSwitch.tsx` apenas como referencia, nao como codigo para copiar sem adaptar.

Referencia visual aprovada pelo CEO:
https://dioli-portal-cliente-basico.jaunty-hinny-1384.chatgpt.site

Sua primeira entrega nao e codigo. Responda com um relatorio de entendimento contendo:

- por que existe um portal unico e duas apresentacoes;
- como os departamentos e os nove marcos da esteira alimentam o portal sem expor a operacao interna;
- quais dados e componentes atuais serao reutilizados;
- como o modo sera persistido por usuario;
- como o Basico absorve as onze areas sem apagar capacidade;
- como autenticacao, allowlist e `VistaDoCliente` permanecem intactas;
- quais arquivos voce pretende alterar;
- quais testes acrescentara;
- quais logos atuais estao erradas e qual asset mestre sera usado.

Depois da aprovacao desse entendimento, implemente do inicio ao fim, sem pausar entre microetapas.

Requisitos inegociaveis:

- modo Basico e padrao para usuario novo;
- o cliente alterna para Avancado quando quiser;
- mesmo dado, mesma permissao e mesmos fluxos nos dois modos;
- nenhuma duplicacao de portal, endpoint ou regra de negocio;
- Basico com Inicio, Resultados, Projetos, Aprovacoes e Materiais;
- Avancado preserva as onze areas atuais;
- texto de corpo minimo de 16 px e alvos de toque de 44 px;
- linguagem compreensivel do dono de padaria ao gerente de marketing;
- nao enfatizar IA;
- nenhuma metrica ficticia em producao;
- aprovacoes, recusa/refacao/cancelamento, upload de Brand Book, logos e assets continuam funcionais;
- Project Manager continua sendo o elo de comunicacao;
- integracoes continuam editaveis somente pelo cliente e visiveis internamente conforme a regra atual;
- substituir qualquer `O°` ou logo em texto por asset oficial;
- nao redesenhar os dois circulos da Dioli;
- aguardar os assets mais recentes do CEO se houver divergencia;
- preservar o Brain e toda a arquitetura operacional existente;
- preservar os handoffs, os donos de etapa, o aceite do recebedor e o `correlation_id` definidos na esteira;
- nao fazer merge com CI vermelho;
- abrir PR separado e auditavel, sem misturar refatoracoes alheias.

Validacao obrigatoria:

- suite atual completa;
- novos testes dos dois modos;
- build de producao;
- teste de vazamento com credencial de cliente;
- teste manual a 375, 768, 1280 e 1440 px;
- demonstracao do switch e da persistencia;
- demonstracao de aprovacao e upload de materiais nos dois modos;
- inventario de logos antes/depois.

Ao concluir, entregue o link do PR, lista de arquivos alterados, testes executados, resultado do CI, riscos restantes e instrucoes de rollback. Nao ative rollout nem faca merge sem autorizacao do diretor.

---
