# FICHA — o teste do preço reprova por defeito DELE, não do código

O trabalho de `C1-preco-negociado.md` está no disco e o **código parece certo**.
O que está quebrado é o **fixture do teste**. O Diretor rodou o portão (o PM
estourou o tempo antes de rodar) e mediu:

    npx vitest run __tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts
    → Tests 4 failed | 4 passed (8)

## A CAUSA, MEDIDA — uma só, e as outras três são cascata

    FAIL > piso/teto da faixa negociável — sanidade do fixture
          > N1 e N2 são válidos (>= piso, < teto) e DIFERENTES entre si
    AssertionError: expected 290 to be less than 290
    __tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts:162

**`N1` foi escolhido IGUAL ao teto (290), e a regra é `newTotal < est.totalMax`.**
Com `N1 === CEILING`, `negotiateProposal` **rejeita** o valor (corretamente!), o
preço nunca muda, e por isso os outros três caem junto:
- "a ROTA que o cliente abre mostra o preço NOVO";
- "uma segunda rodada com valor DIFERENTE muda os dois textos JUNTOS";
- "newTotal NO TETO OU ACIMA também não vira preço".

⚠️ **A trava do teto está CERTA e é do CEO.** O piso e o teto (`>= floor` e
`< totalMax`) **não podem ser afrouxados** para o teste passar. O fixture é que
tem de escolher valores dentro da faixa.

## O QUE FAZER

1. **Conserte o FIXTURE, nunca a trava.** Escolha `N1` e `N2` estritamente dentro
   de `[floor, totalMax)`, diferentes entre si, e de forma que a faixa do fixture
   tenha folga de verdade. Se a faixa do fixture for estreita demais para caber
   dois valores distintos, **alargue o fixture** — não mexa na regra.
2. **Deixe a sanidade do fixture como primeiro teste do arquivo** (ela já está lá,
   e foi ela que denunciou — é boa, mantenha).
3. Rode e traga o verde.

## E O QUE O DESPACHO ANTERIOR NÃO ENTREGOU — isto é obrigatório agora

**A prova por mutação não foi feita.** Sem ela a régua não vale. Faça, uma a uma,
desfazendo cada uma depois e conferindo o arquivo:

| Mutação | O que tem de acontecer |
|---|---|
| remover a persistência em `briefingJson` de `negotiate-proposal.ts` (voltar a gravar só `status`) | **VERMELHO** no teste da rota — tem de reproduzir o defeito original: a página volta a mostrar o preço ANTIGO |
| fazer o `priceLine` do card usar um número próprio em vez de derivar de `novaEstimativa` | **VERMELHO** no teste que prova que card e página mostram o MESMO número |
| deixar a renegociação sobrescrever o preço congelado no aceite | **VERMELHO** no teste do congelamento |
| afrouxar a trava do teto (`<` vira `<=`) | **VERMELHO** — a trava do CEO tem de estar defendida |

**Se alguma dessas mutações NÃO ficar vermelha, o teste correspondente não protege
nada — diga isso com todas as letras em vez de maquiar.**

## RESTRIÇÕES
- Toque **somente** em `__tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts`
  — e no código de produção **apenas** se a mutação revelar defeito real, dizendo
  qual e por quê.
- ⛔ **NÃO escreva regra de cancelamento, multa, devolução ou reembolso.** Vedado
  pelo CEO até ele falar com advogado. Cruzou com o assunto: **anote e siga**.
- Não toque em `app/api/portal/approvals/route.ts` (frente do cancelamento vem a
  seguir), nem em `lib/agency/comercial/`, `app/api/piloto/`, `scripts/`.
- **Não commite. O Diretor commita.**

## CRITÉRIO DE ACEITE
1. `npx vitest run __tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts` →
   **8 verdes**.
2. `npx tsc --noEmit` limpo, rodado **depois** do teste.
3. **As quatro mutações, com o resultado de cada uma**, coladas.
4. **Declare o que não conseguiu provar.**
5. Se algum comando for recusado, **cole a mensagem exata**.
