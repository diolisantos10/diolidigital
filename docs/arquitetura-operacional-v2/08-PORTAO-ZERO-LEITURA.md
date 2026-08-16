# Portão Zero — Ler, Explicar e Só Depois Construir

## Regra

O Diretor e o Arquiteto devem ler integralmente esta pasta e o PDF em `source/`. **É proibido alterar código, banco, permissões ou interface antes de o CEO aprovar a devolutiva.**

## Entrega obrigatória do arquiteto

Criar um documento chamado `RELATORIO-DE-ENTENDIMENTO.md` contendo:

1. explicação do projeto com suas próprias palavras;
2. desenho do fluxo ponta a ponta, do contato ao ciclo mensal;
3. papel de cada um dos 12 departamentos;
4. lista dos agentes e fronteiras que não devem ser misturadas;
5. explicação do PM como única voz com o cliente;
6. diferença entre cliente, projeto, campanha, tarefa, entrega e ciclo;
7. funcionamento das permissões e da visualização transversal de clientes;
8. estados, bloqueios, aprovações e recuperação;
9. estruturas atuais que conflitam com o novo modelo;
10. plano de migração, rollback e testes;
11. dúvidas e decisões que dependem do CEO;
12. riscos que o arquiteto acredita que ainda não foram cobertos.

## Demonstração oral/escrita esperada

O arquiteto deve conseguir responder, sem copiar frases dos documentos:

- O que acontece quando falta um Brand Book?
- Quem conversa com o cliente e como pedidos são consolidados?
- Quem pode editar Branding e quem apenas consulta?
- O que acontece quando Qualidade reprova?
- Qual é a diferença entre pedir ajuste, recusar/refazer e cancelar?
- Como impedir produção duplicada?
- Como recuperar uma tarefa parada?
- Como substituir os catálogos antigos sem perder dados?
- Como o ciclo mensal devolve aprendizado aos departamentos?

## Critério de liberação

O CEO responde explicitamente: **“Entendimento aprovado. Pode iniciar o Marco 1.”**

Qualquer outra resposta mantém a implementação bloqueada. Após a autorização, cada marco seguinte continua exigindo evidência e aceite definidos no backlog.
