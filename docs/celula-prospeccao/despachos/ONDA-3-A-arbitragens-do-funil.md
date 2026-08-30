# DESPACHO A — as 4 arbitragens do funil (agente: `esteira`)

**Leia primeiro:** `docs/celula-prospeccao/despachos/ONDA-3-COMUM.md`.

## Objetivo em uma frase
Aplicar em `lib/agency/celula/funil.ts` quatro decisões que o Diretor já tomou —
não reabrir nenhuma delas — e provar cada uma com as duas metades no teste.

## SEUS ARQUIVOS — e só eles
- `lib/agency/celula/funil.ts` (editar)
- `__tests__/celula/funil.test.ts` (editar)

**NÃO toque** em `lib/agency/celula/trilha.ts`, em `prisma/schema.prisma`, nem em
nenhum outro teste. Não crie arquivo novo.

## AS QUATRO DECISÕES — já tomadas, aplique como estão

### 1. São 22 estados. O erro de contagem era do Diretor, não do CEO.
O Diretor recontou a enumeração da ordem em 30/08/2026: são **22** nomes, e
`encontrada` JÁ É o estado de entrada, já contado na lista. A ficha original
dizia "22 + o estado de entrada" e estava errada.

- **Remova `TOTAL_DECLARADO_PELO_CEO`** de `funil.ts` e o teste que exige a
  divergência (`expect(ESTADOS.length).not.toBe(TOTAL_DECLARADO_PELO_CEO)`),
  além do import correspondente no teste.
- **Troque o bloco de comentário "⚠️ DIVERGÊNCIA ABERTA" do topo** por um bloco
  que registre o histórico, não que o apague: a ordem do CEO diz "23"; a
  enumeração escrita por ele tem 22 nomes; o Diretor recontou em 30/08/2026 e
  **confirmou 22** — a divergência era de contagem na ficha do Diretor, não
  estado faltando. Escreva isso com essas letras. **Não apague o histórico.**
- O teste `expect(ESTADOS.length).toBe(22)` FICA, e a lista literal
  `OS_22_ESTADOS_DA_FICHA` FICA (ela é o que impede o teste de comparar a
  implementação consigo mesma).

### 2. `perdida` DEIXA DE SER TERMINAL. `perdida → retomar` passa a ser LEGAL.
O motivo é mecânico, e escreva-o no arquivo: **a dedup impede o renascimento.**
`Oportunidade` tem `@@unique([workspaceId, impressaoDigital])` — o MESMO projeto
do 99Freelas não pode ser reingerido, então "nasce outra oportunidade" não é uma
saída que exista. Sobra editar o banco por fora, que é exatamente o que a trilha
append-only existe para impedir. E cliente que some no 99Freelas e reaparece é o
caso COMUM, não o excepcional.

- `perdida: ["retomar", "excecao_operacional"]` em `PARES_POR_ORIGEM`.
- Tire `"perdida"` de `ESTADOS_TERMINAIS` (ficam `duplicada`,
  `recusada_pela_qualificacao`, `ganha`).
- Ajuste o `Exclude<...>` do tipo de `PARES_POR_ORIGEM` (hoje exclui `perdida`).
- Reescreva a nota de `ESTADOS_TERMINAIS` sobre `perdida`: ela hoje diz o
  contrário ("Reengajar não é reabrir perdida"). A nota nova explica que a porta
  de volta existe, é `retomar`, e que **a justificativa obrigatória cobre o
  resto** — ninguém ressuscita nada em silêncio.
- O desenho de `retomar` que já está lá **fica igual**: reengajamento normal
  continua entrando por `retomar` vindo de `abordada`, `briefing_em_coleta`,
  `proposta_enviada`, `negociacao`. O que muda é só a porta de volta de quem já
  foi dado como perdido.

### 3. `contratada → perdida` e `em_producao → perdida` passam a ser LEGAIS.
Contrato cancelado é real, e esta casa já tratou disso (commit `9dddc18`,
"cancelar avisa os dois lados e PARA a produção", ordem C2 do CEO). Chegar a
`perdida` em três saltos por estados que não descrevem o que aconteceu **mente
na trilha** — e a trilha é a prova. Escreva esse porquê no arquivo.

### 4. `aprovada → ganha` como ÚNICA entrada em `ganha`: CONFIRMADO, é deliberado.
`ganha` é dinheiro reconhecido; só se chega lá por aprovação explícita do
cliente. **Mantenha como está e escreva o porquê no arquivo** — sem o comentário,
o próximo leitor vai achar que é esquecimento e "consertar".

## O QUE OS TESTES PRECISAM PROVAR — as duas metades, sempre
Acrescente (e ajuste os existentes que quebrarem por causa das mudanças acima):
1. `transicaoPermitida("perdida","retomar") === true` **e**
   `transicaoPermitida("perdida","ganha") === false` — a porta de volta existe,
   e ela não é atalho para dinheiro reconhecido.
2. `perdida → excecao_operacional` legal (`perdida` agora é não-terminal e a
   fila de exceção alcança todo estado não-terminal — o teste que varre isso já
   existe e passa a cobrir `perdida`).
3. `contratada → perdida` e `em_producao → perdida` legais; **e a metade
   negativa**: `contratada → ganha` continua ILEGAL, `em_producao → aprovada`
   continua ILEGAL (não se pula entrega).
4. `ESTADOS_TERMINAIS` tem exatamente 3, e nenhum deles tem saída.
5. `aprovada` é a **única** origem que alcança `ganha` — derive de
   `TRANSICOES_PERMITIDAS` (`filter(([,para]) => para === "ganha")` tem
   comprimento 1 e o `de` é `"aprovada"`).
6. Uma transição `perdida → retomar` SEM justificativa continua sendo rejeitada
   por `avaliarTransicao` com o código `justificativa_ausente` — é isso que
   sustenta "ninguém ressuscita em silêncio".
7. **A metade limpa:** `perdida → abordagem_preparada` continua ILEGAL (a volta
   passa obrigatoriamente por `retomar`, que é onde o porquê fica registrado).

## CRITÉRIO DE ACEITE
- `funil.test.ts` inteiro verde, sem nenhum teste apagado por conveniência —
  teste que mudou de veredicto tem que ter comentário dizendo POR QUE mudou.
- `TOTAL_DECLARADO_PELO_CEO` não existe mais em lugar nenhum (nem no teste).
- Cada uma das 4 decisões tem o porquê escrito NO ARQUIVO, em português.

## O QUE NÃO FAZER
- Não invente um 23º estado. Não renomeie estado. Não reordene o array `ESTADOS`.
- Não mexa em `trilha.ts` nem no schema.
- Não crie rota nem tela.
