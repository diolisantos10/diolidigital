# ONDA 4A · FICHA C — A DÍVIDA DA ENTRADA DO M14, IMPOSSÍVEL DE IGNORAR

**Agente:** `plataforma` · **Despachado pelo:** PM · **Ordem do:** Diretor Geral, 30/08/2026

## O achado, nas palavras de quem o achou
> *"Nada alimenta `acompanhamentosJaEnviados` sozinho. O mecanismo existe; a
> entrada dele, não."*

E `lib/marketplaces/99freelas/follow-up.ts` **já esperava a mesma entrada**.

## A ordem do Diretor, literal
> *"Isto é a doença crônica desta casa — **trava sem fechadura** — e agora são
> DOIS mecanismos esperando a mesma entrada inexistente. Não conserte (depende
> do login, que é BLOCK). **Torne impossível de ignorar.** Teste vermelho
> declarado é honesto; comentário no topo do arquivo é esquecível."*

## Objetivo em uma frase
A dívida vira **registro tipado, com dono e prazo**, e um teste que **grita
quando o prazo vence** ou quando alguém **mexe na dívida em silêncio** — dos
dois lados: quem apagar o registro sem construir a entrada, e quem construir a
entrada sem fechar o registro.

## ARQUIVOS QUE SÃO SEUS (ninguém mais escreve neles nesta onda)
- NOVO `lib/agency/celula/divida-declarada.ts`
- NOVO `__tests__/celula/divida-da-entrada-do-m14.test.ts`
- EDITA **só o cabeçalho de comentário** de `lib/agency/celula/mensagens/acompanhamento.ts`
  (a seção `🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA`) para apontar ao registro.
  **Não altere uma linha de código desse arquivo.**
- EDITA **só o cabeçalho de comentário** de `lib/marketplaces/99freelas/follow-up.ts`,
  pelo mesmo motivo e com a mesma restrição.

## PROIBIDO TOCAR
`lib/agency/celula/ponte/`, `lib/agency/celula/excecoes/` (**importe; NÃO edite**),
`lib/agency/celula/funil.ts`, `prisma/schema.prisma`,
`docs/plataformas/99freelas/mensagens.json`, `lib/agency/celula/mensagens/*`
(exceto o cabeçalho de `acompanhamento.ts`), `docs/plataformas/99freelas/regras-editoriais.json`.

---

## 1. LEIA ANTES DE ESCREVER — e é aqui que está o desenho
| Arquivo | O que importa |
|---|---|
| `lib/agency/celula/mensagens/acompanhamento.ts` | o cabeçalho `🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA` e `EstadoDaOportunidade.acompanhamentosJaEnviados` |
| `lib/marketplaces/99freelas/follow-up.ts` | o segundo mecanismo esperando a mesma entrada |
| `lib/agency/celula/excecoes/fila.ts` | **`excecoesVencidas` / `gritoDaFila`** — *"exceção vencida GRITA"*. **É este o mecanismo que você vai espelhar.** |
| `lib/agency/celula/excecoes/tipos.ts` | `RESPONSAVEIS` (`gerente_de_atendimento`, `sdr`) e `PRAZO_EM_MINUTOS_POR_PRIORIDADE` |
| `lib/dioli-brain/quality-gates.ts` | o padrão `lacuna` — motivo, **dono** e **prazo** de uma ausência declarada |

## 2. A DECISÃO DE DESENHO — já tomada pelo PM, não a refaça
O Diretor pediu *"um teste que FALHA enquanto a entrada não existir"*, e mandou
usar o mecanismo de dívida declarada que a casa já tiver — **e, se não houver,
avisar em vez de inventar**.

**Varredura feita pelo PM: esta casa não tem mecanismo para segurar um teste
permanentemente vermelho.** Não há `it.fails`, não há registro de dívida no
`vitest`, e `lib/agency/escada/` é sobre exposição de departamento, não sobre
dívida de construção. Um vermelho permanente no `npm test` ensinaria a casa a
ignorar o CI — que é exatamente a doença que esta ficha combate.

**O que a casa TEM é o mecanismo certo, com outro nome: `excecoesVencidas` /
`gritoDaFila` — "exceção vencida GRITA".** Espelhe-o. A dívida nasce com
**prazo**; o teste é verde até o prazo e **vermelho depois dele**. Não é
vermelho permanente: é vermelho **datado**, que ninguém consegue ignorar
porque estoura sozinho.

⚠️ **Isto é interpretação do PM sobre uma ordem do Diretor.** Escreva no
relatório, com todas as letras, que o vermelho é **datado** e não permanente, e
que o Diretor pode mandar o contrário. Não esconda na entrelinha.

## 3. `lib/agency/celula/divida-declarada.ts`
Registro **como dado**, não como comentário. Conjunto fechado, tipado, sem `any`.

Cada dívida carrega, no mínimo:
- `id` — ex.: `"entrada-de-acompanhamentos-ja-enviados"`
- `oQueFalta` — uma frase: quem produz `acompanhamentosJaEnviados`, e não existe
- `quemDependeDisso` — **os dois caminhos de arquivo reais**
  (`lib/agency/celula/mensagens/acompanhamento.ts`,
  `lib/marketplaces/99freelas/follow-up.ts`). Confira que os dois existem.
- `porQueNaoFoiFeito` — o chat do 99Freelas está atrás do login, e login é BLOCK
- `donos` — **tipado por `Responsavel` de `excecoes/tipos.ts`**, os dois:
  `gerente_de_atendimento` e `sdr`. **Importe o tipo; não redigite a lista.**
  (O CEO não opera esta fila — a mesma trava vale aqui.)
- `prazo` — ISO. **Proposta do PM: `2026-09-15`.** Marque no relatório que a
  data é palpite do PM e precisa de confirmação do Diretor. Palpite declarado
  como palpite é a régua desta casa.
- `comportamentoHojeSemAEntrada` — literal: `null` BLOQUEIA o acompanhamento
  (confirme lendo `acompanhamento.ts` antes de afirmar).

Mais as funções de leitura, puras e com `agora` **injetado** (nunca `new Date()`
dentro — a régua de `avaliarAberturaDeExcecao`):
- `dividasAbertas()`
- `dividasVencidas(agora: Date)`
- `gritoDasDividas(agora: Date)` — o texto para o humano, nomeando id, dono e
  há quantos dias venceu. **Nunca string vazia quando há dívida vencida.**

## 4. `__tests__/celula/divida-da-entrada-do-m14.test.ts` — a fechadura dos dois lados
1. **Vence e grita:** com `agora` depois do prazo, `dividasVencidas` devolve a
   dívida e `gritoDasDividas` cita id, os dois donos e os dois arquivos.
2. **🔴 O relógio real:** com `new Date()` de verdade, se a dívida estiver
   vencida o teste **FALHA**, e a mensagem de falha diz **exatamente** o que
   falta construir e quem são os donos. Este é o teste que estoura sozinho no
   dia 16/09 se ninguém agir. Escreva a mensagem de falha para ser lida por
   quem nunca leu esta ficha.
3. **Não some em silêncio:** a dívida `"entrada-de-acompanhamentos-ja-enviados"`
   **existe** no registro. Quem a apagar sem construir a entrada fica vermelho.
4. **Não fica esquecida quando for resolvida:** os dois arquivos de
   `quemDependeDisso` **existem no disco** e ainda contêm a marca do risco no
   cabeçalho. Quem construir a entrada e limpar o cabeçalho sem fechar a dívida
   fica vermelho. (Leia o disco com `node:fs` a partir da raiz do repo.)
5. **Fail closed continua valendo:** `acompanhamentosJaEnviados = null` bloqueia
   o acompanhamento, com motivo nomeando o campo. Prove chamando
   `podeAcompanhar` — sem alterar `acompanhamento.ts`.

## 5. O QUE VOCÊ **NÃO** VAI FAZER, e é ordem
- **Não abra exceção na fila da Onda 3 com um dos 14 casos.** O PM conferiu:
  **nenhum dos 14 descreve "dívida de construção"**, e `excecoes/tipos.ts` diz
  literalmente *"Faltou um 15º caso? Escreva no relatório, não no código."*
  Forçar um caso errado seria falsificar o registro para fechar um item de
  ficha. **Escreva o pedido do caso novo no relatório** — o PM leva ao Diretor.
- **Não construa a entrada.** Depende do login, que é BLOCK nesta rodada.
- **Não edite código de `acompanhamento.ts` nem de `follow-up.ts`** — só o
  cabeçalho de comentário.

## 6. CRITÉRIO DE ACEITE
1. Dívida declarada como dado tipado, com dono, prazo e os dois dependentes.
2. Teste que **falha sozinho** quando o prazo vence, com mensagem autoexplicativa.
3. Teste vermelho se alguém apagar a dívida em silêncio.
4. Teste vermelho se alguém limpar a marca do risco nos dois arquivos sem fechar a dívida.
5. `podeAcompanhar` continua fail-closed com `null`.
6. Nenhuma linha de código de `acompanhamento.ts`/`follow-up.ts` alterada.
7. Suíte da célula continua verde HOJE (o vermelho é datado, não imediato).

## FORMATO DA ENTREGA (bullets curtos — o destino é o CEO)
- o que ficou pronto · o que quebrou · o que exige decisão do Diretor
- **o pedido do 15º caso da fila**, com o nome sugerido e a justificativa
- **a data do prazo**, marcada como palpite do PM a confirmar
- **os alvos de mutação**: arquivo, linha, afrouxamento e o teste que DEVE ficar
  vermelho. (O PM roda a mutação; você entrega o catálogo.)

## Não faça
- Não rode `npm`, `npx`, `node` nem `git` — o portão e o commit são do PM.
- Não escreva relatório em `.md` novo: devolva no texto da resposta.
- Não toque em arquivo fora da sua lista.
