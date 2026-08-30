# FICHA DE DESPACHO — conserto de dois defeitos da Onda 1 · especialista `plataforma`

Eu (PM) rodei o portão: `npx tsc --noEmit` limpo, 38 testes verdes, e as **9
mutações ficaram vermelhas pelo motivo certo**. O trabalho está bom. Achei DOIS
defeitos na inspeção, os dois nos seus arquivos. **NÃO rode `npm`/`npx`/`git`.**
Conserte e devolva; eu rodo o portão de novo.

## DEFEITO 1 — `as OrigemDaTransicao` cru sobre dado do banco

Em `lib/agency/celula/trilha.ts`, dentro de `trilhaDoFunil`:

```ts
origem: linha.origem as OrigemDaTransicao,
```

Isto é exatamente o cast cego que a casa proíbe — a mesma postura que
`capacidadeDeclarada()` existe para impedir. Note que na linha de cima você já
fez a coisa certa com o estado (`estadoAtualOuInicial(linha.estadoAnterior)`,
com a nota de "defesa em profundidade"), e depois abandonou a postura na origem.
`funil.ts` já exporta `origemDeclarada(valor): OrigemDaTransicao | null` — use.

Decida e **justifique no comentário** o que fazer quando o banco tiver uma origem
ilegível. Minha orientação: **não invente** um default (`'sistema'` seria mentir
sobre quem agiu) e **não jogue fora a linha** (sumir com uma linha da trilha
append-only é pior que mostrá-la imperfeita). Proponho `origem: OrigemDaTransicao
| null` em `RegistroDeTransicao`, com `null` significando "gravado com origem que
não sei mais ler" — ausência de informação não é informação. Se discordar,
argumente; a decisão é sua, mas o cast cru não fica.

**Acrescente as duas metades ao teste** (em
`__tests__/celula/trilha-e-append-only.test.ts` ou no de reinício, você escolhe):

- metade negativa: uma linha inserida direto no SQLite com `origem = 'xpto'`
  (grave-a por `$executeRawUnsafe`, simulando corrupção/versão antiga) **não**
  volta como `'sistema'` nem derruba a leitura da trilha inteira;
- metade positiva: as 4 origens legítimas voltam intactas.

## DEFEITO 2 — `vi.hoisted` e `vi.mock` fora do topo do módulo

O vitest avisou, e o aviso diz que **vai virar erro** em versão futura:

```
Warning: A vi.hoisted() call in ".../__tests__/celula/trilha-e-append-only.test.ts"
is not at the top level of the module.
Warning: A vi.mock("@/lib/db/client") call in ".../trilha-e-append-only.test.ts"
is not at the top level of the module.
```

Em `__tests__/celula/trilha-e-append-only.test.ts` os dois estão **dentro** do
`describe("a metade positiva…")`. Suba-os para o topo do arquivo, junto dos
imports. Confira também
`__tests__/celula/trilha-sobrevive-ao-reinicio.test.ts` — se lá estiver igual,
conserte também. Mantenha a anotação de tipo do `vi.hoisted` (`{ prisma: null as
unknown as PrismaClient }`): é ela que impede a família de erro `TS2322` /
`TS2493` que já barrou três PRs desta casa.

## O QUE NÃO FAZER

Não toque em `lib/agency/celula/funil.ts` (é de outro especialista), nem em
`lib/agency/celula/mensagens/`, nem em `lib/marketplaces/`, nem em
`docs/plataformas/` — há **outra frente viva no mesmo worktree agora**, e o que
está lá não é seu nem meu.

## DEFINIÇÃO DE PRONTO

Os dois defeitos consertados, testes acrescentados, nenhum arquivo fora do
escopo tocado. Devolva em bullets, incluindo a decisão que tomou sobre origem
ilegível e o porquê.
