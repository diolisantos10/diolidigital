# Vitrine — departamentos

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## Ninguém produz antes de ler o cliente de verdade

Antes de qualquer especialista escrever uma linha, o sistema lê o **Instagram real
do cliente** e sintetiza o que achou:
`lib/agency/execution/leitura-do-cliente.ts`, alimentado por
`lib/integrations/meta/leitura.ts`.

Essa leitura entra no contexto de **todos os especialistas e também do auditor** —
os dois lados olham a mesma verdade, senão o auditor reprova por um padrão que o
produtor nunca viu.

**Custo de desfazer:** sem isso, cada departamento produz a partir do briefing e
da própria imaginação, e "conhece o cliente" vira uma frase de prompt.

— promovido em 2026-08-04 pelo Diretor · origem: onda 2a de 04/08/2026
(commit `571e4f8`)

---

## Número por CÓDIGO, subjetivo por IA — e interpretação nunca é "observado"

A síntese do cliente é feita em duas metades, de propósito:

- **O que é contável** (frequência de postagem, formatos, engajamento) é calculado
  em código. A IA não recalcula.
- **O que é subjetivo** (estilo, tom) passa pela IA — e então enfrenta o **piso de
  ancoragem**: só vira afirmação se cada palavra tiver lastro no texto real do
  cliente. Sem lastro, a linha "Estilo visual observado" **não é escrita** e no
  lugar dela entra a lacuna.

E há uma fronteira explícita: **`tom` não passa pelo piso porque tom é
interpretação** ("próximo e cotidiano"), não observação. Por isso ele é declarado
como **hipótese**, nunca como fato observado (`leitura-do-cliente.ts:739`).

**A regra por trás:** rotular como "observado" só o que foi observado. Ausência de
informação não é informação — e nesta casa, sem revisor humano, um dado inventado
vira entregável.

> **Resíduo conhecido:** a declaração de hipótese do `tom` está no **prompt**.
> Prompt é sugestão, não trava.

— promovido em 2026-08-04 pelo Diretor · origem: onda 2a e as 4 auditorias de
04/08/2026

---

## Métrica que muda de significado precisa mudar de nome ou de versão

O alcance passou de "um dia" para "o mês inteiro" **mantendo o campo, o rótulo e a
linha de comparação**. O relatório teria anunciado **+2694%** ao primeiro cliente
pagante — número tecnicamente calculado, comercialmente uma mentira.

O conserto é estrutural, não cosmético: a medição carrega **versão**
(`lib/agency/esteira/mes.ts:187`, `versaoDaMedicao`); quando as versões divergem,
a métrica sai da comparação e o cliente é avisado com todas as letras em vez de
receber uma variação percentual.

**Custo de desfazer:** remover a versão faz a comparação voltar a funcionar
silenciosamente — e é justamente o silêncio que produz o número falso.

— promovido em 2026-08-04 pelo Diretor · origem: onda 3 de 04/08/2026
(commit `22b9c0d`)

---

## Sobra não é evidência de correspondência

Quando N arquivos sobram e N peças estão vazias, a tentação é casar por ordem.
**Casamento posicional é decisão humana, atrás de flag explícita, nunca o
default.** No caso real (as 36 telas da Foocci), o passe por ordem montaria
carrossel com o **logo** e com **material bruto** dentro.

Dois corolários do mesmo achado:

- O índice de "já tem dono" precisa ler **onde o dono realmente mora**. O logo não
  era referenciado por post nenhum, e por isso entrava na fila de candidatos como
  se estivesse livre.
- Todo script de backfill nasce com **dry-run**, imprime **casados / excluídos /
  sobras**, e só grava com `--apply` depois de alguém ler o log
  (`scripts/backfill-carrossel-foocci.mjs`).

— promovido em 2026-08-04 pelo Diretor · origem: auditoria de 04/08/2026
(commit `ded432a`)

---

## O card de aprovação é VISUAL — o cliente aprova o que ele vê

O card lê `pecas` estruturadas e mostra **imagem + legenda por peça**, no estilo do
planner da Meta, com o carrossel abrindo num modal navegável. Não é preferência
estética: **texto descrevendo a arte não é a arte**, e o cliente estava aprovando
uma descrição.

> **Buraco conhecido e não fechado:** a mídia foi travada, mas o **texto** vindo de
> entrega interna ainda passa por fail-open (`app/api/brain/portal-data/route.ts:218`).
> Não foi consertado porque o conserto seco **apagaria o corpo de cards já em
> voo** — precisa de um passe de dados antes.

— promovido em 2026-08-04 pelo Diretor · origem: onda 2b de 04/08/2026
(commits `763d7a4`, `2dfdc23`)

---

## ⚠️ O teto de chamadas à Meta é POR PROCESSO, não por conta

O limitador de ritmo da Graph vive na memória do processo. Portanto:

- com N instâncias no ar, o teto efetivo **na mesma conta da Meta** é N × o valor;
- **depois de um deploy, o contador zera.**

Está escrito com todas as letras no próprio código
(`lib/integrations/meta/leitura.ts:84`). **Foi a Meta restringindo a conta de
anúncios da agência em 03/08 que criou essa regra** — tratar este teto como
garantia de conta é otimismo, não engenharia.

**Conserto certo:** contador no banco. Enquanto não existir, ninguém pode dizer ao
CEO que a leitura de métricas "não corre risco de ritmo".

— promovido em 2026-08-04 pelo Diretor · origem: onda 3 de 04/08/2026 e o
incidente de 03/08/2026

---

## A leitura do feed é de LEGENDA, não de PIXEL

O "estilo visual" do cliente é inferido do **texto das legendas**, não das imagens.
Se o cliente fotografa mármore e nunca escreve "mármore", a agência não vê o
mármore.

Isso limita o que qualquer departamento de Design pode honestamente afirmar sobre
o visual do cliente. Fechar exige um provedor com visão — não é ajuste de prompt.

— promovido em 2026-08-04 pelo Diretor · origem: onda 2a de 04/08/2026
