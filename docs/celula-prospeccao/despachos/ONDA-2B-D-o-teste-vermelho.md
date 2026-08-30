# ONDA 2B — FICHA D · O TESTE VERMELHO DE `__tests__/marketplaces`

## Objetivo em uma frase
Deixar `__tests__/marketplaces` verde **sem afrouxar uma linha de política**, e
dizer com todas as letras qual dos dois lados estava errado — o teste ou o
`policy.json`.

## O sintoma, medido
```
FAIL __tests__/marketplaces/a-junta-do-caminho-vivo.test.ts
  > o registro da pergunta ao suporte bate com o que aconteceu
  > o CEO PERGUNTOU em 07/08 — e o registro não diz mais que ele não perguntou
AssertionError: expected 'sem_resposta' to be 'perguntado'
  __tests__/marketplaces/a-junta-do-caminho-vivo.test.ts:396
```
1 falha em 152. As outras 151 passam.

## O meu diagnóstico — confira antes de aceitar, não depois
Na recaptura de 30/08, `docs/plataformas/99freelas/policy.json` mudou
`autorizacao_do_suporte.status` de `"perguntado"` para `"sem_resposta"`, com
justificativa escrita no próprio arquivo (`status_atualizado_em_2026_08_30`):
23 dias corridos sem resposta do suporte, `sem_resposta` **já constava** em
`status_valores`, e a mudança **não destrava nada** (`respondido_em` e
`evidencia` seguem `null`, `auto_submission_allowed` segue `false`).

Se isso se confirmar, então **a política está certa e o TESTE estava
sobre-especificado**: o nome do teste promete provar que *"o registro não diz
mais que ele NÃO perguntou"*, mas a asserção prendeu a string exata
`"perguntado"` em vez do invariante. Teste que prende a letra em vez da regra
quebra quando a regra evolui de forma legítima — e o custo é a casa ser
empurrada a mexer no registro para o teste passar. **Isso não pode acontecer aqui.**

**Você confere isso de verdade** antes de mudar qualquer coisa: abra o
`policy.json`, leia o bloco `autorizacao_do_suporte` inteiro, e confirme os
três pontos (justificativa escrita · valor já previsto · nada destravado). Se
QUALQUER um deles não se confirmar, **pare e relate** — nesse caso o errado é o
`policy.json`, e o conserto é outro.

## O conserto, se o diagnóstico se confirmar
O teste passa a provar o **invariante**, e a provar MAIS do que provava:

1. `status` **nunca** é `"nao_perguntado"` — este é o fato que o CEO corrigiu em
   08/08 e que não pode regredir. Prove pela negativa, não por uma string fixa.
2. `status` está dentro de `status_valores` do próprio arquivo (registro que
   inventa estado fora da própria lista é registro quebrado).
3. `status` pertence ao conjunto que significa "a pergunta foi feita":
   `["perguntado", "sem_resposta", "autorizado", "negado"]`.
4. `perguntado_em === "2026-08-07"` e `canal` continua preenchido.
5. **A metade 2, que é a que importa:** o gate continua FECHADO.
   `autorizacaoDoSuporte(politicaDe("99freelas")).valeParaOGate === false`,
   `respondido_em === null`, `evidencia === null`,
   `auto_submission_allowed === false`.
6. **Novo, e é o que impede a próxima quebra boba:** se `status` mudar para
   `"autorizado"`, o gate SÓ pode abrir com `respondido_em` **e** `evidencia`
   preenchidos. Prove isso com um objeto de política construído no teste (não
   editando o arquivo real) — se `autorizacaoDoSuporte` não aceitar entrada
   injetada, diga isso no relatório em vez de forçar.
7. Deixe um comentário no teste explicando **por que a asserção deixou de ser
   uma string fixa**, citando a data e o motivo. Sem isso, o próximo a ler acha
   que alguém afrouxou o teste.

## O que você NÃO pode fazer
- **NÃO edite `docs/plataformas/99freelas/policy.json`.** Se o seu diagnóstico
  disser que o errado é ele, **relate e pare** — quem decide sou eu.
  (Outro despacho está ACRESCENTANDO um bloco novo nesse arquivo agora; não
  encoste nele.)
- **NÃO afrouxe** nada: `auto_submission_allowed`, `valeParaOGate`, os `null`
  de `respondido_em`/`evidencia` e as travas de Upwork/Freelancer ficam como estão.
- **NÃO toque em**: `lib/agency/celula/`, `prisma/schema.prisma`,
  `docs/plataformas/99freelas/mensagens.json`.
- Se para deixar verde você precisar apagar uma asserção **sem** pôr outra mais
  forte no lugar, você já saiu do caminho. Pare e relate.

## Arquivos que são SEUS
1. `__tests__/marketplaces/a-junta-do-caminho-vivo.test.ts` — editar apenas o
   bloco `describe("o registro da pergunta ao suporte bate com o que aconteceu")`.

## O que devolver
Bullets: **qual dos dois lados estava errado e por quê** (é a pergunta central
do despacho) · o que ficou provado a mais · o que exige decisão.
