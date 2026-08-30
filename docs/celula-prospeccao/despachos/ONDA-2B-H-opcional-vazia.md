# ONDA 2B — FICHA H · A VARIÁVEL OPCIONAL VAZIA QUE SOME DO TEXTO

## O achado — do laudo do essencial `qualidade`, 30/08/2026
Em `lib/agency/celula/mensagens/preencher` (arquivo
`lib/agency/celula/mensagens/biblioteca.ts`), uma variável **opcional** cujo
valor é **string vazia** (`""`, diferente de `null`/`undefined`) atravessa sem
bloqueio e **sem acionar a regra de ausência**: o substituidor devolve `""`, o
placeholder simplesmente desaparece e o texto vai ao cliente com um buraco —
`"Olá, . Li seu projeto sobre ..."`.

Por que passou: `preencher` trata `null`/`undefined` (devolve o casamento
original, que depois é barrado pela trava de remanescente), mas `""` é um valor
"presente" para o `if`, e é devolvido como está. Já a checagem de **regra de
ausência** usa `valor.trim() === ""` — ou seja, **as duas metades do código
discordam sobre o que é "ausente"**, e é dessa discordância que nasce o buraco.

**Hoje o furo é latente**, não vivo: as duas únicas variáveis opcionais da casa
(`NOME` em M01 e M14) têm `regrasDeAusencia`, e a regra é aplicada antes. Mas
latente sem teste é exatamente o que esta casa chama de decoração — a próxima
opcional que nascer sem regra cai nele em silêncio.

## Objetivo em uma frase
Fazer `""` significar **ausente** em todo o caminho de `preencher`, uma
definição só, e provar com teste que o texto com buraco não sai.

## Arquivos que são SEUS (e só estes)
1. `lib/agency/celula/mensagens/biblioteca.ts`
2. `__tests__/celula/placeholder-de-colchete.test.ts`

## O que fazer
1. **Uma definição só de "ausente"**, usada em todos os pontos: uma função
   pequena, exportada ou não, do tipo
   `function ausente(v: string | null | undefined): boolean { return v === null || v === undefined || v.trim() === ""; }`.
   Substitua **todos** os lugares de `preencher` que hoje decidem isso por conta
   própria — o teste de variável obrigatória, o das regras de ausência e o
   substituidor. Se sobrar um lugar com a regra escrita à mão, o furo volta.
2. No substituidor: variável **opcional** ausente ⇒ devolve o **casamento
   original** (o `[MIOLO]` ou `{{chave}}` intactos), para que a trava de
   remanescente barre. Nunca devolva `""`.
3. Regra de ausência continua rodando antes, e continua tratando `""` como
   ausente — agora pela mesma função.

## O TESTE — as duas metades, sempre
- Opcional com `""` e **sem** regra de ausência ⇒ **BLOQUEIA**, e o motivo cita o
  colchete remanescente. (Metade 1.)
- Opcional com `"   "` (só espaços) ⇒ **BLOQUEIA** pelo mesmo caminho.
- Opcional com `""` e **com** regra de ausência ⇒ a regra é aplicada, o texto
  fica correto e **não** sobra colchete. (Metade 2 — o conserto não inventa
  problema onde a casa já tinha solução.)
- Obrigatória com `""` ⇒ continua bloqueando pelo motivo de **obrigatória**, não
  pelo de remanescente. Afirme QUAL motivo: a diferença é o que diz ao operador
  o que fazer.
- Caso limpo, com todos os valores preenchidos ⇒ continua passando.
- `{{chave}}` opcional com `""` ⇒ mesmo comportamento do colchete. Os dois
  formatos não podem divergir.

## O que você NÃO pode fazer
- **NÃO toque em** `__tests__/celula/biblioteca-de-mensagens.test.ts`,
  `__tests__/celula/os-22-textos-do-ceo.test.ts`, `tipos.ts`, `mensagens.json`,
  `policy.json`, `acompanhamento.ts`, `ponte/`, `excecoes/`, `funil.ts`,
  `prisma/schema.prisma`.
- **NÃO afrouxe** nenhuma guarda existente. Todas as suítes atuais têm de
  continuar verdes sem edição.
- Não rode npm/npx/node/git — o portão e a mutação são do PM.

## Critério de aceite
- Existe UMA definição de "ausente" e todos os pontos a usam.
- Os seis testes acima existem, cada trava com as duas metades.
- Sem `any`.

## O que devolver
Bullets curtos: o que ficou pronto · qualquer lugar em que "ausente" ainda esteja
escrito à mão e você não pôde unificar · o que exige decisão.
