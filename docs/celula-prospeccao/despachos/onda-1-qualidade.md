# FICHA DE DESPACHO — laudo de aceite da Onda 1 · essencial `qualidade`

Você é **somente leitura**, por construção. **Não conserte nada.** Se achar
defeito, descreva-o com arquivo e linha e eu despacho o conserto para quem tem a
mão. **Não rode `npm`/`npx`/`git`** — os números do portão já foram medidos por
mim e estão abaixo.

## O QUE FOI CONSTRUÍDO (Onda 1 da Célula de Prospecção)

- `lib/agency/celula/funil.ts` — conjunto fechado de estados do funil de
  prospecção, tabela de transições, juiz puro `avaliarTransicao`.
- `lib/agency/celula/trilha.ts` — armazém Prisma: lê o estado do banco, julga,
  grava linha + trilha numa `$transaction`.
- `prisma/schema.prisma` — dois models novos no fim do arquivo (`LinhaDoFunil`,
  `TransicaoDoFunil`), puramente aditivos.
- `prisma/migrations/20260830150000_o_funil_da_celula_de_prospeccao/migration.sql`
- `__tests__/celula/funil.test.ts`,
  `__tests__/celula/trilha-sobrevive-ao-reinicio.test.ts`,
  `__tests__/celula/trilha-e-append-only.test.ts`
- `scripts/mutacao-onda-1.mjs` + `docs/celula-prospeccao/mutacao-onda-1.json` +
  `docs/celula-prospeccao/mutacao-onda-1.md`

**Não olhe** `lib/agency/celula/mensagens/`, `lib/marketplaces/` nem
`docs/plataformas/`: é outra frente, de outra sessão, viva no mesmo worktree.
Não é o que estou pedindo para julgar.

## OS NÚMEROS QUE EU MEDI (não os remeça; use-os)

- `npx tsc --noEmit` → **limpo**, saída vazia.
- `npx vitest run` nos três arquivos → **40 passados, 0 falhados**.
- `node scripts/mutacao-onda-1.mjs` → linha de base verde, **10 guardas mutadas,
  10 ficaram vermelhas, 0 sobreviveram**.

## O CRITÉRIO DE ACEITE DO CEO — julgue um a um, com veredicto explícito

1. `tsc --noEmit` limpo.
2. Testes verdes **e** relatório de mutação mostrando cada guarda falhando **pelo
   motivo correto**. Esta é a parte cara: não basta ficar vermelho, tem que ficar
   vermelho *no teste certo*. Confira a coluna de nomes de teste do
   `mutacao-onda-1.json` contra a guarda de cada linha e diga se alguma caiu por
   efeito colateral em vez de pelo motivo alegado.
3. Transição inválida rejeitada **com motivo legível**. Leia os `motivo` de
   `avaliarTransicao` e diga se um gerente que não programa entenderia.
4. Transição sem justificativa rejeitada.
5. Trilha sobrevive a reinício (teste que reabre o cliente do banco). Confira se
   o reinício é **honesto** — cliente novo sobre o MESMO arquivo, não um mock que
   finge reiniciar.
6. Um parágrafo dizendo o que foi reaproveitado de `lib/agency/estados-v2/` e do
   model `TransicaoDeEstado`, e por quê — ou por que não deu. Está no cabeçalho
   de `funil.ts` e num comentário `///` do schema. Julgue se o argumento **se
   sustenta**, lendo `lib/agency/estados-v2/maquina.ts`, ou se é justificativa
   escrita depois para não reaproveitar.

## AS PERGUNTAS QUE EU QUERO QUE VOCÊ FAÇA, ALÉM DO ACEITE

- **A tabela de transições faz sentido de negócio?** Esta é a pergunta que a
  mutação NÃO responde: se um par errado estiver na tabela, todos os testes
  concordam com ele. Leia `PARES_POR_ORIGEM` em `funil.ts` e diga: falta algum
  caminho que uma oportunidade real percorreria? Sobra algum que nunca deveria
  existir? Em particular — `aprovada → ganha` é a única entrada em `ganha`; um
  cliente que paga sem aprovar formalmente fica preso? E `contratada` só sai para
  `em_producao`: e o contrato que é cancelado depois de assinado?
- **Os 4 terminais estão certos?** `duplicada`,
  `recusada_pela_qualificacao`, `ganha`, `perdida` não têm saída. `perdida` sem
  saída, com `retomar` como o caminho de reengajamento, funciona — ou cria um
  beco para a oportunidade que já foi marcada perdida e volta a responder?
- **A divergência 22 × 23 estados** está declarada em código
  (`TOTAL_DECLARADO_PELO_CEO = 23` contra `ESTADOS.length === 22`). Você
  consegue, lendo a lista, apontar qual estado provavelmente falta na enumeração
  do CEO? Se não conseguir, diga que não conseguiu — **não invente um**.
- **O que esta onda promete e não entrega?** Não há rota HTTP, não há tela, não
  há chamador real de `avancarFunil` fora de teste. Isso está declarado com todas
  as letras em algum lugar, ou alguém que ler o relatório vai achar que o funil
  está em operação?

## DEFINIÇÃO DE PRONTO

Devolva o laudo **na resposta**, em bullets, em português do Brasil. Não escreva
arquivo nenhum. Separe: **aprovado · reprovado · precisa de decisão do CEO**.
Cada reprovação com arquivo e linha.
