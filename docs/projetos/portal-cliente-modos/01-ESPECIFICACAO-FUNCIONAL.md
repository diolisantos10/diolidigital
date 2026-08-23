# Especificacao funcional

## 1. Objetivo

Permitir que uma pessoa com pouca familiaridade digital entenda o estado do seu negocio em menos de 30 segundos, sem retirar profundidade de uma agencia ou equipe de marketing experiente.

## 2. Regra de arquitetura

O modo pertence ao usuario do portal, nao ao cliente, projeto ou contrato.

```text
mesma autenticacao -> mesma VistaDoCliente -> mesma regra de permissao
                                      |-> apresentacao Basica
                                      |-> apresentacao Avancada
```

Regras:

- `VistaDoCliente` continua sendo a unica fronteira de dados externos.
- O backend nao recebe um modo para decidir quais dados sao secretos. Seguranca continua sendo definida por allowlist e papel.
- Os componentes de dominio continuam unicos: aprovacao, entrega, arquivo, integracao, projeto e conversa nao ganham copias basicas.
- O modo apenas escolhe hierarquia, quantidade de detalhe inicial, microcopia e agrupamento.
- Acao iniciada no Basico deve abrir o mesmo fluxo real usado no Avancado.

## 3. Comportamento do switch

- Novo usuario abre em **Basico**.
- A escolha fica persistida por usuario autenticado. Preferencia no servidor e a fonte definitiva; `localStorage` pode ser fallback temporario.
- Chave recomendada no fallback: `dioli.portal.view-mode.v1`.
- Valores aceitos: `basic` e `advanced`.
- Valor invalido volta para `basic`.
- O switch permanece visivel nas duas experiencias.
- Trocar o modo preserva a aba semanticamente equivalente quando existir; caso contrario, volta para Inicio/Visao Geral.
- A troca e imediata, sem reload e sem perder formulario em andamento.

## 4. Modo Basico

### Navegacao principal

1. Inicio
2. Resultados
3. Projetos
4. Aprovacoes
5. Materiais

As onze areas avancadas nao desaparecem. Elas sao resumidas ou absorvidas:

| Area avancada | Onde aparece no Basico |
| --- | --- |
| Visao Geral | Inicio |
| Social Media | Inicio + Resultados |
| Trafego Pago | Inicio + Resultados |
| Resultados | Resultados |
| Projetos | Projetos |
| Aprovacoes | Aprovacoes |
| Entregas | Projetos + Materiais |
| Brand Hub | Materiais + entrevista contextual |
| Solicitacoes | Acao contextual e Project Manager |
| Integracoes | Materiais/Conta quando houver pendencia real |
| Minha conta | Menu do perfil |

### Inicio

Ordem:

1. saudacao e explicacao curta;
2. switch Basico/Avancado;
3. resumo "Seu negocio em um minuto";
4. tres numeros no maximo, sempre com contexto;
5. "O que esta acontecendo" por frente contratada;
6. "Precisa de voce" apenas quando houver decisao real;
7. proximos passos;
8. canal permanente com o Project Manager.

### Linguagem

- Preferir "Pessoas alcancadas" a "Reach".
- Preferir "Novos contatos" a "Leads" quando o contexto permitir.
- Explicar a variacao: "24% a mais que antes".
- Nao destacar que o trabalho e feito por IA.
- Nao usar sigla sem explicacao na primeira ocorrencia.
- Frases curtas; um conceito por bloco.

### Densidade e acessibilidade

- texto de corpo: minimo 16 px no desktop e no celular;
- texto auxiliar: minimo 14 px;
- alvos de toque: minimo 44 x 44 px;
- contraste WCAG AA;
- foco de teclado sempre visivel;
- icone nunca substitui rotulo essencial;
- nenhuma acao critica depende apenas de cor;
- maximo de tres KPIs no primeiro impacto;
- "Precisa de voce" nao domina a tela quando nao ha urgencia.

## 5. Modo Avancado

Mantem a arquitetura atual de onze areas:

1. Visao Geral
2. Social Media
3. Trafego Pago
4. Resultados
5. Projetos
6. Aprovacoes
7. Entregas
8. Brand Hub
9. Solicitacoes
10. Integracoes
11. Minha conta

O modo Avancado pode exibir mais KPIs, tabelas por frente, saude de integracoes, detalhamento de departamentos e historico. Ele ainda deve usar linguagem clara; avancado significa mais profundidade, nao jargao desnecessario.

## 6. Estados obrigatorios

Cada modo deve tratar:

- carregando;
- sem dados ainda;
- sem integracao;
- integracao caiu;
- nenhuma pendencia;
- uma ou varias pendencias;
- erro de rede recuperavel;
- acesso expirado ou revogado;
- cliente sem projeto;
- cliente sem servico de uma determinada frente.

Estado vazio nunca recebe numero inventado nem promessa automatica.

## 7. Responsividade

- Desktop: largura util maxima proxima do portal atual, com cards em grade.
- Tablet: duas colunas somente quando cada card conservar leitura confortavel.
- Celular: uma coluna, switch imediatamente apos a saudacao, navegacao Basica sem rolagem horizontal sempre que couber.
- O Avancado pode usar setas laterais na navegacao horizontal; barra de rolagem visual continua escondida.
- O botao do Project Manager nao pode cobrir conteudo ou botoes.

## 8. Criterios de aceite

- Usuario novo entra no Basico.
- Usuario alterna para Avancado e a preferencia sobrevive a nova sessao.
- Os dois modos leem exatamente a mesma `VistaDoCliente`.
- Uma aprovacao aberta no Basico e a mesma aprovacao aberta no Avancado.
- Nenhum campo interno passa a ser retornado ao portal.
- O Basico mostra no maximo tres KPIs no primeiro impacto.
- Texto de corpo nao fica abaixo de 16 px.
- O logo da Dioli e carregado de um asset aprovado; nao existe `O°`, `Oo` ou circulo desenhado como texto.
- O portal funciona a 375 px sem corte lateral.
- Os testes de portal, autenticacao, aprovacao e vazamento continuam verdes.
- O prototipo visual e usado como referencia de hierarquia, nao como fonte de numeros.

## 9. Teste de usabilidade antes do rollout

Rodar com pelo menos cinco pessoas:

- duas com baixa familiaridade digital;
- uma pessoa com TDAH ou alta sensibilidade a excesso de informacao;
- uma pessoa de marketing;
- uma pessoa que represente agencia ou cliente avancado.

Tarefas:

1. dizer em ate 30 segundos como o negocio esta;
2. encontrar uma aprovacao;
3. enviar um Brand Book ou logo;
4. alternar para o Avancado e localizar Trafego Pago;
5. voltar ao Basico;
6. falar com o Project Manager.

Reprovar o rollout se qualquer participante nao localizar aprovacao ou envio de materiais sem ajuda.
