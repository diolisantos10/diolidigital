# ONDA 2B — FICHA I · A CLASSE `[çç]` QUE NÃO É CLASSE

## O achado — escalado pela sua própria varredura (ficha E) e confirmado pelo laudo
`lib/marketplaces/99freelas/conformidade.ts`, regra `permuta_ou_teste_gratis`:

```js
/\b(?:permuta|escambo|teste\s+gr[áa]tis|amostra\s+gr[áa]tis|fa[çc]o\s+de\s+gra[çç]a|sem\s+custo\s+inicial)\b/gi
```

A classe `[çç]` **repete o mesmo caractere** — quase certamente era para ser
`[çc]`, como o `fa[çc]o` três caracteres antes, na mesma alternativa. Efeito: o
Guardião reconhece *"faço de graça"* mas **não** reconhece *"faço de graca"*,
*"faco de graca"* nem *"faco de graça"* — e escrever sem cedilha é rotina em
teclado mal configurado e em celular.

Isto **não** é a família do `\b`. Você fez certo em escalar em vez de mexer. É
por isso que existe esta ficha: o achado ganha dono em vez de virar linha num
documento que ninguém reabre.

## O que isto custa, para dimensionar
`permuta_ou_teste_gratis` é a regra que barra a agência oferecendo trabalho de
graça — pagamento por permuta e teste grátis são motivo declarado de sanção no
99Freelas. Uma escrita sem cedilha atravessa o Guardião **em silêncio**.

## Arquivos que são SEUS (e só estes)
1. `lib/marketplaces/99freelas/conformidade.ts`
2. `__tests__/celula/fronteira-de-palavra-acentuada.test.ts` (acrescente um
   `describe` novo — **não altere** os testes que já estão nele)
3. `docs/celula-prospeccao/varredura-do-b.md` (atualize a linha desta regex:
   de "escalado, sem dono" para o que de fato aconteceu)

## O que fazer
1. Conserte `[çç]` → `[çc]`.
2. **Varra a família inteira antes de fechar**, porque classe de caractere com
   membro repetido ou com membro faltando é um defeito de digitação, e defeito de
   digitação raramente é único. Percorra **todas** as classes de caractere de
   `lib/marketplaces/99freelas/conformidade.ts`, `agente.ts`, `preco.ts`,
   `contador.ts`, `conexoes.ts`, `follow-up.ts` e de
   `lib/agency/celula/mensagens/*.ts`, procurando:
   - classe com **caractere repetido** (`[çç]`, `[aa]`, `[éé]`);
   - classe com a variante **acentuada sem a irmã sem acento**, ou o contrário
     (`[á]`, `[ç]` sozinhos) — o padrão da casa é sempre o par (`[áa]`, `[çc]`,
     `[ée]`, `[ãa]`, `[óo]`, `[êe]`, `[íi]`, `[õo]`, `[úu]`);
   - palavra com acento escrita **fora** de classe, sem a variante sem acento.
   Acrescente à tabela de `docs/celula-prospeccao/varredura-do-b.md` uma seção
   nova, **"Família 5 — classes de caractere malformadas"**, com uma linha por
   ocorrência examinada, incluindo as que estavam corretas. Diga o total examinado.
3. **Se achar mais defeitos, conserte-os** — cada um com teste.

## O TESTE — as duas metades por conserto
- **Metade 1:** a forma que hoje escapa é BARRADA. Para este caso: `"faço de
  graca"`, `"faco de graça"`, `"faco de graca"` — as três.
- **Metade 2:** a forma que já era barrada continua barrada (`"faço de graça"`) e
  um texto limpo e legítimo **não** é barrado. Escolha uma frase limpa que
  contenha palavras vizinhas (ex.: algo com "graça" em sentido inocente, se
  existir) e diga no teste o que ela prova.
- Se o conserto tornar a regra ampla demais a ponto de gerar falso positivo,
  **relate em vez de escolher sozinho** entre barrar demais e barrar de menos.

## O que você NÃO pode fazer
- **NÃO toque em** `lib/agency/celula/mensagens/biblioteca.ts`,
  `acompanhamento.ts`, `tipos.ts`, `mensagens.json`, `policy.json`, `ponte/`,
  `excecoes/`, `funil.ts`, `prisma/schema.prisma`, `__tests__/marketplaces/`.
- **NÃO afrouxe** nenhuma detecção do Guardião. Toda mudança sua entra na tabela
  com motivo — mudança sem linha na tabela é mudança que ninguém pediu.
- Não rode npm/npx/node/git — o portão e a mutação são do PM.

## O que devolver
Bullets: quantas classes examinadas · quantos defeitos achados e quais ·
o que consertou · o que achou suspeito e NÃO consertou, com o porquê.
