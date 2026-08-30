# FICHA — a trava do congelamento de preço NÃO protege nada. Medido.

## O QUE EU MEDI, RODANDO (não raciocinando)

O relato anterior afirmou que esta mutação ficaria VERMELHA. **Ficou VERDE.**

    # em lib/agency/esteira/caminho-automatico.ts:323-324
    -  precoAceitoJson = COALESCE(precoAceitoJson, ?),
    -  precoAceitoEm   = COALESCE(precoAceitoEm, ?)
    +  precoAceitoJson = ?,
    +  precoAceitoEm   = ?

    npx vitest run __tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts
    → Tests  8 passed (8)      ← DEVERIA TER FICADO VERMELHO

As outras três mutações foram medidas e ficaram vermelhas de verdade
(persistência removida → 6 vermelhos; teto `<`→`<=` → 3 vermelhos; texto do card
deixando de derivar da fonte → 1 vermelho). **Só esta não protege.**

## POR QUE ISTO É O PONTO MAIS CARO DO BLOCO

É **literalmente** o que o CEO escreveu ao aprovar:

> "E o valor que o cliente aprovou tem que ficar registrado no momento da
> aprovação, **senão uma renegociação depois reescreve o passado**."

Uma régua verde sobre isso, que não pega a regressão, é **pior que régua nenhuma**:
ela dá a alguém a confiança de mexer no `COALESCE` achando que o teste avisa.
*Trava que nunca ficou vermelha não é trava — é decoração.*

## A CAUSA PROVÁVEL (confirme antes de consertar)
O teste exercita o congelamento com **Prisma falso**. Um mock de
`$executeRawUnsafe`/`$queryRawUnsafe` **não implementa `COALESCE`** — ele não é um
banco. Então tirar o `COALESCE` do SQL não muda nada que o mock consiga observar.

**MEÇA e confirme antes de escrever.** Se a causa for outra, siga a sua medição e
me diga.

## O CONSERTO — a trava tem de tocar a semântica real
Ordem de preferência, escolha a mais alta que der e **justifique**:

1. **Banco SQLite de verdade, descartável** (arquivo temporário ou `:memory:`),
   com a tabela real, exercitando `marcarAceite` duas vezes com valores
   diferentes e conferindo que **o segundo NÃO sobrescreve**. É a única forma que
   prova a semântica do `COALESCE`. Esta casa já roda script como processo contra
   recurso descartável — veja
   `__tests__/plataforma/seed-recusa-antes-de-destruir.test.ts` e
   `__tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts` como molde.
2. Se (1) for inviável, uma trava que **afirme sobre o SQL emitido** — que a
   instrução de escrita do preço aceito contém `COALESCE` nas duas colunas. É mais
   fraca (não prova a semântica, prova a forma), mas **pega a remoção**, que é a
   regressão real. Se escolher esta, **diga no código que ela é a segunda melhor e
   por quê**.

⛔ **Não relaxe nada para ficar verde.** Não remova o teste do congelamento. Não
troque a asserção por uma mais frouxa.

## CRITÉRIO DE ACEITE — inegociável
1. **Aplique a mutação do `COALESCE` de novo e mostre o VERMELHO**, com a saída
   colada. Sem esse vermelho medido, o conserto não vale e eu não aceito.
2. Depois de restaurar: **8+ verdes**, com a saída colada.
3. `npx tsc --noEmit` limpo, rodado **depois** do teste.
4. **Se você não conseguir rodar `npx`/`node`/`vitest`** (recusa
   `This command requires approval`), **DIGA ISSO NO TOPO DO RELATO** e **não
   apresente resultado raciocinado como se fosse medido** — foi exatamente assim
   que esta trava falsa passou. Escreva o teste, declare que não rodou, e eu rodo.
5. **Declare o que não conseguiu provar.**

## RESTRIÇÕES
- Toque em `__tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts` e, se
  precisar, num arquivo de teste novo ao lado. Em produção, só se a medição
  revelar defeito real — dizendo qual.
- ⛔ **NÃO escreva regra de cancelamento, multa, devolução ou reembolso** — vedado
  pelo CEO até ele falar com advogado. Cruzou com o assunto: anote e siga.
- Não toque em `app/api/portal/approvals/route.ts`, `lib/agency/comercial/`,
  `app/api/piloto/`, `scripts/`.
- **Não commite. O Diretor commita.**
