# FICHA DE DESPACHO — fechamento da Onda 1 · especialista `seguranca`

**NÃO rode `npm`/`npx`/`git`.** Duas correções pequenas no
`docs/celula-prospeccao/mutacao-onda-1.md`, as duas vindas do laudo do
`qualidade`. Os números NÃO mudaram: linha de base **40 verdes**, **10 guardas**,
**10 vermelhas**, **0 sobreviveram**.

## CORREÇÃO 1 — a narrativa da M10 estava imprecisa, e o `qualidade` pegou

O `qualidade` achou que o campo `espera` da M10 descrevia um comportamento que a
mutação não produzia: o trecho mutado era
`(linha.origem as OrigemDaTransicao) ?? "sistema"`, e o `??` **só dispara para
`null`/`undefined`** — nunca para uma string inválida como `'xpto'`. A guarda
estava provada (o teste exige `origem` nula, e o cast fazia `'xpto'` vazar), mas
a prosa dizia outra coisa.

Eu já corrigi o script: a mutação da M10 agora é o **cast cego puro**
(`origem: linha.origem as OrigemDaTransicao`), sem `??`, e o `espera` passou a
ser *"origem corrompida ('xpto') vaza como se fosse origem válida, em vez de
virar null"*. Rodei de novo: continua **VERMELHO**, e o
`docs/celula-prospeccao/mutacao-onda-1.json` já está regravado com o texto novo
(confira `rodadoEm`).

Atualize a linha da M10 na tabela do relatório para refletir o trecho mutado
correto e o motivo correto. **E acrescente um parágrafo curto sobre isto**, com
esta lição, que é o achado mais útil do dia: *uma mutação pode ficar vermelha
pelo motivo certo e ainda assim ser descrita errado; quem lê o relatório sem
reler o script herda a descrição, não o comportamento.* Foi o `qualidade` — que
não escreve, só lê — quem pegou. É a divisão de papéis funcionando, e vale estar
escrito.

## CORREÇÃO 2 — três perguntas de negócio, na seção de lacunas

O `qualidade` levantou três buracos de **desenho**, não de código, que a mutação
por construção não pega (se um par errado estiver na tabela, os testes concordam
com ele). Acrescente-os à seção "o que a mutação NÃO cobre", como **decisões
pendentes do CEO**, com esta redação de conteúdo:

1. **`perdida` é terminal e não há `perdida → retomar`.** Uma oportunidade
   marcada `perdida` que volta a responder **não tem caminho legal de volta ao
   funil** — só nascendo uma oportunidade nova, ou alguém editando o banco por
   fora, que é exatamente o que a trilha auditável existe para impedir. O
   comentário de `funil.ts` descreve `retomar` como reengajamento **antes** de
   `perdida`, não depois.
2. **`contratada` só sai para `em_producao`.** Contrato assinado e depois
   cancelado só chega a `perdida` em três saltos
   (`contratada → excecao_operacional → negociacao → perdida`), passando por
   estados que não descrevem o que aconteceu.
3. **`aprovada → ganha` é a única entrada em `ganha`.** Pode ser deliberado
   (nunca fechar sem aprovação formal registrada); precisa de confirmação.

Escreva as três como **perguntas ao CEO**, não como defeitos — nenhuma é errada
hoje, são lacunas de especificação. E deixe claro que a **divergência 22 × 23
continua aberta**: o `qualidade` leu a lista inteira e **não conseguiu** apontar
qual seria o 23º estado, e se recusou a inventar um. Registre isso como
"não verificável", com todas as letras — é informação, não silêncio.

## O QUE NÃO FAZER

Não toque em código, não toque em `lib/`, `prisma/` nem `scripts/`. Só
`docs/celula-prospeccao/mutacao-onda-1.md`. Não mexa em
`lib/agency/celula/mensagens/`, `lib/marketplaces/` nem `docs/plataformas/` —
outra frente viva no mesmo worktree.

## DEFINIÇÃO DE PRONTO

Um arquivo atualizado. Devolva em bullets.
