# FICHA — o congelamento do preço quebrou 5 testes que já existiam

## O QUE EU MEDI, RODANDO

    npx vitest run __tests__/esteira __tests__/portal
    → Test Files 2 failed | 149 passed (151)
    → Tests 5 failed | 2004 passed (2009)

    TypeError: prisma.$executeRawUnsafe is not a function
      ❯ marcarAceite lib/agency/esteira/caminho-automatico.ts:320
      ❯ Module.POST app/api/portal/briefing/aceite/route.ts:145

Vermelhos:
- `__tests__/portal/a-decisao-nao-se-decide-duas-vezes.test.ts` — 3 casos
  (`proposal_pending`, `proposal`, `negotiation`: "o aceite passa e o projeto nasce")
- `__tests__/esteira/o-ajuste-da-proposta-nao-vira-beco.test.ts` — 2 casos

**Os dois arquivos são travas de valor**: o primeiro guarda "a porta aberta
continua abrindo"; o segundo é o conserto do beco de quem negocia preço, entregue
hoje. Nenhum dos dois pode ficar vermelho.

## A CAUSA
`marcarAceite` passou a escrever o preço congelado com **SQL cru**
(`$executeRawUnsafe` + `COALESCE`). Os testes existentes montam um Prisma falso que
não tem esse método — e nunca precisaram ter.

## ⛔ O CONSERTO ERRADO, E É O TENTADOR
**NÃO saia acrescentando `$executeRawUnsafe` aos mocks dos testes alheios.** Isso
espalha o conhecimento de um detalhe de implementação para arquivos que não têm
nada a ver com preço, e transforma cada mock futuro numa dívida. *Consertar o
sintoma em cinco arquivos em vez da causa em um é como a casa acumula peso.*

## O CONSERTO CERTO — MEÇA E ESCOLHA, com argumento escrito
A intenção do `COALESCE` é **"grava só se ainda não tiver valor"**. Isso se
expressa na API do Prisma, atomicamente e sem SQL cru:

    prisma.clientRequestDb.updateMany({
      where: { id: clientRequestId, precoAceitoJson: null },
      data:  { precoAceitoJson: ..., precoAceitoEm: ... },
    })

`updateMany` com a condição no `where` é **uma única instrução** — mantém a
atomicidade que o `COALESCE` dava, sem depender de dialeto.

**Avalie e decida**, escrevendo o porquê:
1. Isso preserva **exatamente** a semântica de "não sobrescreve"? Prove.
2. O `status` continua sendo escrito no **mesmo** ato lógico? Se virarem duas
   escritas, diga qual é o risco e como você o fecha — **não deixe a porta de
   "status gravado sem preço congelado" aberta em silêncio**.
3. Se você concluir que o SQL cru é mesmo necessário, **diga por quê** e então
   conserte os mocks — mas essa é a segunda opção, não a primeira.

⚠️ Nota de segurança, para constar: o SQL atual **é** parametrizado (`?`), então
não há injeção. O problema aqui é acoplamento e dialeto, não injeção. Não troque
por concatenação de string em hipótese nenhuma.

## CRITÉRIO DE ACEITE
1. `npx vitest run __tests__/esteira __tests__/portal` → **zero vermelhos**.
2. `__tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts` → **9 verdes**.
3. **A mutação do congelamento continua VERMELHA.** Depois do seu conserto,
   quebre "não sobrescreve" de propósito (tire a condição do `where`, ou o
   `COALESCE`) e o bloco 5 tem de cair. **Se ficar verde, você trocou uma trava
   real por uma decorativa** — foi exatamente esse o defeito de duas rodadas atrás.
4. `npx tsc --noEmit` limpo.
5. ⚠️ **Se você não conseguir rodar `npx`/`node`/`vitest`** (`This command requires
   approval`), **DIGA NO TOPO DO RELATO** e não apresente raciocínio como medição.
   Eu rodo. Isso não é demérito — apresentar raciocínio como medida é.
6. **Declare o que não conseguiu provar.**

## RESTRIÇÕES
- ⛔ **NÃO escreva regra de cancelamento, multa, devolução ou reembolso** — vedado
  pelo CEO até ele falar com advogado. Cruzou: anote e siga.
- Não toque em `app/api/portal/approvals/route.ts`, `lib/agency/comercial/`,
  `app/api/piloto/`, `scripts/`.
- **Não commite. O Diretor commita.**
