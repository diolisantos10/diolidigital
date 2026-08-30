# FICHA — o preço negociado passa a ser O preço

**Ordem do CEO, aprovada em 29/08/2026.** Isto MEXE NO QUE O CLIENTE PAGA. Leia
tudo antes de escrever uma linha.

## O DEFEITO, JÁ MEDIDO PELO DIRETOR — não refaça o diagnóstico

Quando o cliente pede ajuste, `lib/agency/execution/negotiate-proposal.ts`:
- calcula `newTotal` (linhas 38-40, com piso: `>= floor` e `< est.totalMax`);
- monta `priceLine` (52-53) e escreve o valor **apenas** dentro do texto
  `reviewNote` do `ApprovalRequest`;
- **nunca grava nada em `briefingJson.estimate`**.

Mas a página que o cliente abre lê outra coisa:
`app/api/portal/briefing/proposta/route.ts:35,112` → `estimativaEntregue(pedido)`
e `textoDoOrcamento(...)`, que saem de `lib/agency/esteira/orcamento-do-briefing.ts`.

**Resultado: o card de aprovação mostra o preço negociado e a página da proposta
mostra o preço ANTIGO.** Duas verdades sobre dinheiro.

## O QUE O CEO APROVOU
> "O preço negociado vira o preço da proposta, e é ele que o cliente vê e aprova."

E, com todas as letras, o que ele vai olhar:
> "Quero **UMA** fonte do preço, lida por todos os leitores — não um segundo campo
> que 'geralmente' bate com o primeiro. *Verdade escrita em dois lugares já está
> errada num deles.* E o valor que o cliente aprovou tem que ficar registrado no
> momento da aprovação, senão uma renegociação depois reescreve o passado."

## AS DUAS METADES — as duas são obrigatórias

### Metade A — fonte única
O valor negociado passa a viver **na mesma fonte que `estimativaEntregue` lê**.
Todo leitor — a página da proposta, o texto do card, o e-mail se houver, o portão
de pagamento, o financeiro — passa a ler **daquela fonte**.

⛔ **NÃO crie um campo paralelo** (`precoNegociado` ao lado de `estimate`) que
alguém precise lembrar de sincronizar. Isso é o defeito com outro nome.
⛔ **NÃO faça o texto do card ser a fonte.** Texto não é dado.
✅ O `priceLine` do card deve passar a ser **derivado** da fonte, não escrito em
paralelo com ela. Se hoje ele é montado antes de a fonte existir, inverta a ordem:
**grava primeiro, renderiza a partir do gravado.**

**Antes de escolher onde gravar, MEÇA:** varra quem lê o preço
(`estimativaEntregue`, `textoDoOrcamento`, `briefingJson.estimate`, o portão de
pagamento, a assinatura recorrente, o financeiro) e **liste os leitores no
relato**. A fonte escolhida tem de servir a **todos**. Se algum leitor não puder
ler dela, **pare e relate** — não grave em dois lugares.

### Metade B — o aceite congela o valor
No momento em que o cliente **aprova**, o valor aprovado fica **registrado junto
do aceite**, com data. Uma renegociação posterior **não pode reescrever o
passado**: o que ele aceitou naquele dia continua legível depois.

Isto é registro histórico, e é diferente da metade A: A é "qual é o preço agora",
B é "qual era o preço quando ele disse sim". As duas coexistem sem se contradizer,
porque **B é imutável e A é corrente**.

Onde gravar B é sua decisão de projeto — proponha e justifique. Se exigir mudança
de schema (`prisma/schema.prisma`), **pode**, mas diga no relato com todas as
letras e mantenha a migração compatível com o que já está gravado.

## ⛔ VEDADO NESTE BLOCO
- **NÃO escreva regra de cancelamento, multa, devolução ou reembolso.** O CEO
  mandou consultar o jurídico e a casa não tem jurídico. **Se cruzar com esse
  assunto no código, ANOTE E SIGA.** Não construa nada.
- Não mexa no caminho do cancelamento — outra frente está nele.
- Não toque em `lib/agency/comercial/`, `app/api/piloto/`, `scripts/`.
- ⛔ Nenhuma cobrança de verdade. Nenhuma mensagem a pessoa real.

## O TESTE — e a régua aqui é literal
**O teste tem de conferir A PÁGINA DA PROPOSTA — o que o cliente LÊ — e não a
função interna.** Palavras do CEO: *"régua verde sobre o componente errado é pior
que régua nenhuma."*

Mínimo:
1. cliente pede ajuste → `negotiateProposal` roda → **a rota
   `GET /api/portal/briefing/proposta` passa a devolver o preço NEGOCIADO**, não o
   antigo. Este é o teste que fecha a ordem do CEO.
2. o texto do **card** e a **página** mostram o **mesmo** número — prove que são a
   mesma fonte, não dois caminhos que casualmente coincidem.
3. o cliente aprova → o valor aprovado fica registrado; **renegociar depois NÃO
   altera** o valor registrado no aceite anterior.
4. o piso continua valendo: `newTotal` abaixo do piso ou acima do teto **não** vira
   preço (a trava de `>= floor` e `< totalMax` não pode ser afrouxada por este
   conserto).

## CRITÉRIO DE ACEITE
1. **Quem CHAMA o que você escreveu** — arquivo e linha de cada leitor.
2. **A lista dos leitores do preço** que você varreu, e a prova de que todos leem
   da fonte única.
3. **Quebre cada trava nova de propósito e veja VERMELHO**, uma por uma, e relate.
   Em especial: reverta a persistência e prove que a página volta a mostrar o preço
   antigo — é a reprodução do defeito original.
4. `npx tsc --noEmit` limpo, rodado **depois** de escrever o teste. Mock com
   `vi.hoisted(() => vi.fn())` sem assinatura já barrou o CI desta casa cinco
   vezes: **anote o tipo de retorno**.
5. `npx vitest run` verde nos arquivos tocados.
6. **Declare o que NÃO conseguiu provar.**
7. Se algum comando for recusado no seu ambiente, **cole a mensagem exata**.

**Não commite. O Diretor commita.**
