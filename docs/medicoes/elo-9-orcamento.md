# Elo 9 — por que o pedido não vira orçamento

> Registro de medição. Não é conserto. Arquivo tem dono em voo
> (`lib/agency/esteira/orcamento-do-briefing.ts`) — decisão de correção é dele.

## A pergunta que o Diretor fez

Por que o pedido não vira orçamento?

## A resposta, em uma frase para o CEO

O pedido não vira orçamento porque a rodada processa no máximo 5 por vez,
começando pelos **mais antigos**, e os pedidos que nunca geram orçamento
também **nunca mudam de estado** — então eles ocupam as 5 vagas para sempre e
bloqueiam todos os pedidos novos, inclusive os que têm orçamento pronto.
**Isso acontece em produção.**

## O mecanismo, com caminho e linha

- `lib/agency/esteira/orcamento-do-briefing.ts:162` — `const MAX_POR_RODADA = 5`.
- `lib/agency/esteira/orcamento-do-briefing.ts:491-496` — a consulta busca
  `status IN (new, lead_incompleto, scope_ready)`, com `orderBy createdAt ASC`
  e `take MAX_POR_RODADA`.
- `lib/agency/esteira/orcamento-do-briefing.ts:504-508` — quando
  `estimativaDe()` devolve `null`, incrementa `semOrcamento` e faz `continue`:
  o pedido **fica de pé onde estava**. Não muda de status, não sai da janela,
  e volta na próxima rodada, para sempre.
- `lib/agency/esteira/orcamento-do-briefing.ts:190-210` — `estimativaDe()`
  devolve `null` por quatro motivos: sem campo `estimate` no `briefingJson`;
  `totalMin`/`totalMax` não numéricos; total `<= 0`; e a trava do CityJobs
  (`estimate.travadaPor` preenchido).

## A prova, por experimento controlado

Mesmo pedido, mesma estimativa válida, mudando só quantos pedidos sem
orçamento estão à frente:

- **(a)** com 6 pedidos velhos à frente: rodada devolveu `entregues=0,
  semOrcamento=5` — orçamento **não** gerado.
- **(b)** sem pedidos velhos à frente: rodada devolveu `entregues=1,
  semOrcamento=0` — orçamento **gerado**.

Nada foi apagado na prova: os pedidos velhos tiveram o status trocado e
devolvido ao original ao final.

## Acontece em produção? Sim

Este ambiente não tem chave de provedor de IA — distinção que importa, mas
não muda a conclusão: o entupimento **não depende de IA, nem de rede, nem de
ambiente**. É aritmética de fila. Basta haver 5 pedidos antigos que nunca
geram orçamento para a esteira parar para todo mundo.

Há candidatos reais já registrados nas pendências: os três leads parados há
51, 29 e 28 dias sem contato. Lead sem contato entra na janela de propósito
(está comentado no próprio arquivo, linhas 462-477: "faltar contato NÃO é
faltar pedido") e, sem estimativa, nunca sai dela.

## O modo de falha é silencioso — e é isso que o torna caro

A rodada devolve `entregues=0` e `semOrcamento=5` todo ciclo. Parece número
estável e inofensivo. Nada distingue "não há o que entregar" de "há, mas
nunca chego nele".

## O que NÃO é defeito

Precisa estar escrito para ninguém consertar o que está certo:

- Lead sem contato não ter orçamento está **certo**: o portão de contato de
  08/08 impede `runAutoScope`, e a esteira não inventa número ("sem número
  derivado não se inventa número", linha 205).
- A estimativa nasce na **conversa** do SDR (`lib/agency/prospect-engine.ts`,
  `briefing-conversation.ts`, `sdr-agent.ts`, `question-engine.ts`), não no
  servidor. Sem chave de IA, a conversa não roda neste ambiente — por isso os
  leads de laboratório não têm `estimate`. Isso é **limite do laboratório**,
  não defeito da esteira.

## Estado

Não foi consertado. O arquivo tem dono em voo. Medido, localizado, devolvido.

Quem consertar precisa decidir entre:

1. dar um estado terminal a quem nunca gera orçamento;
2. paginar por cursor em vez de `take` fixo;
3. separar a fila de quem tem estimativa da de quem não tem.

Não recomendo uma só — a decisão é de quem tem o arquivo.
