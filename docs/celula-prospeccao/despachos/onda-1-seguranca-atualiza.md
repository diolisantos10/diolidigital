# FICHA DE DESPACHO — atualizar o relatório de mutação · especialista `seguranca`

**NÃO rode `npm`/`npx`/`git`.** Eu (PM) rodei tudo de novo.

## O QUE MUDOU DESDE O SEU RELATÓRIO

Você escreveu `docs/celula-prospeccao/mutacao-onda-1.md` sobre uma rodada de **9
guardas / linha de base 38 verdes**. Aquela rodada **envelheceu no mesmo dia**:

1. A inspeção do PM achou dois defeitos em `lib/agency/celula/trilha.ts` (cast
   cego `linha.origem as OrigemDaTransicao`, e `vi.hoisted`/`vi.mock` fora do
   topo do módulo). O `plataforma` consertou os dois.
2. O conserto trouxe uma guarda NOVA — `trilhaDoFunil` agora lê a origem com
   `origemDeclarada`, e origem ilegível volta como `null`, nunca `'sistema'`. O
   tipo de `RegistroDeTransicao.origem` virou `OrigemDaTransicao | null`.
3. Eu acrescentei ao script a mutação **M10** para essa guarda nova, porque
   conserto sem mutação rodada é a mesma promessa escrita que a mutação existe
   para não aceitar.

**Os números correntes, e são estes que o relatório tem de dizer:** linha de base
**40 testes verdes** (eram 38), **10 guardas mutadas** (eram 9), **10 ficaram
vermelhas**, **0 seguiram verdes**.

## O ENTREGÁVEL

Reescreva `docs/celula-prospeccao/mutacao-onda-1.md` a partir do JSON
**regravado** em `docs/celula-prospeccao/mutacao-onda-1.json` (ele já é da rodada
nova — confira o campo `rodadoEm`). Leia também
`scripts/mutacao-onda-1.mjs` para a M10.

- Mantenha a estrutura que você já montou; ela está boa.
- Acrescente a linha da **M10** à tabela, com os testes que caíram, pelo nome.
- Atualize **todos** os números (38 → 40, 9 → 10). Número em prosa que não
  acompanha o número real é o defeito que esta casa já pagou por meses.
- Acrescente um parágrafo curto contando **como a M10 nasceu**: da inspeção do
  PM, não de um teste que já existia. É informação de processo que vale mais que
  o resultado — mostra que o portão pegou algo que o especialista tinha deixado
  passar, e que o conserto nasceu com a mutação junto.
- **Preserve integralmente** a sua seção `## Laudo de segurança — texto de
  terceiro é dado, nunca ordem`. Os três achados dela continuam válidos.
  Acrescente só uma nota ao achado da `origem`: agora que a leitura devolve
  `null` para origem ilegível, quem consumir `RegistroDeTransicao.origem` na
  tela precisa **mostrar a lacuna**, não escondê-la com um rótulo genérico — é
  dívida da onda que criar a tela.

## DEFINIÇÃO DE PRONTO

Um arquivo reescrito, nenhum código tocado, nada fora de
`docs/celula-prospeccao/`. Devolva em bullets.
