# FICHA F2 — CONSERTO: a trava de promessa NÃO reconhece "até amanhã"

Você escreveu `lib/agency/celula/mensagens/compromisso.ts`. O PM rodou o portão
e **dois testes seus estão VERMELHOS**. Não é ruído de teste: é um buraco na
trava, e é exatamente o buraco do defeito de 29/08.

```
× reconhece as formas da ordem do CEO combinadas com verbo de entrega
  AssertionError: deveria achar promessa em: "Até amanhã eu te mando o valor.":
  expected 0 to be greater than 0
× compõe com o irmão de 27/08 ("Já encaminho o orçamento até amanhã.")
  expected 0 to be greater than 0
```

## A CAUSA — já diagnosticada, não procure outra
`\b` em JavaScript é **ASCII**. Em `/\bat[ée]\s+amanh[ãa]\b/i`, o `\b` FINAL vem
logo depois de **"ã"**, que não é caractere de palavra para o motor de regex.
"ã" seguido de espaço ou de ponto são **dois não-palavra** ⇒ não existe
fronteira ⇒ o padrão nunca casa. A frase mais óbvia de promessa em português
("até amanhã") passava batido pela trava.

Isto vale para **toda** forma sua que termine em letra acentuada ou em "ç".
Varra `FORMAS_DE_DATA` inteira e conserte todas — não só as duas que os testes
pegaram. Trava com furo conhecido em um lugar tem o mesmo furo em três.

## O QUE FAZER
- Troque o `\b` final por uma fronteira que entenda acento (ex.: um
  lookahead de fim/não-letra com `\p{L}` e a flag `u`, ou `(?![\p{L}\p{N}])`).
  Confira **cada** entrada de `FORMAS_DE_DATA` e cada verbo de
  `VERBOS_DE_ENTREGA`.
- Acrescente à sua própria suíte um teste `it.each` que roda **todas** as formas
  de `FORMAS_DE_DATA` com um verbo de entrega e prova que **todas** disparam.
  Nenhuma forma pode existir sem prova de que funciona — foi assim que esta
  passou.
- A metade gêmea continua obrigatória: a data do CLIENTE ("preciso até
  amanhã") e o passado ("mandei ontem") continuam NÃO barrados. Confira que o
  conserto não os barrou.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/compromisso.ts`
- `__tests__/celula/trava-de-promessa.test.ts`
NÃO toque em mais nada. Outros cinco especialistas estão no mesmo worktree.
Você não roda npm/npx/node/git — o PM roda o portão.
