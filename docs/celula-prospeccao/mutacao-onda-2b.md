# Mutação da Onda 2B — colchete, M14 e a fronteira acentuada

> **Guarda sem mutação rodada já falhou seis vezes nesta casa em dois dias.**
> Cada trava desta onda foi AFROUXADA de propósito, o teste foi rodado, e só
> conta como trava a que ficou **VERMELHA** — e vermelha **pelo motivo certo**,
> não por um motivo qualquer. Depois de cada rodada o arquivo foi restaurado e o
> sha256 conferido: **`restaurado: true` nas 21**.

**21 mutações · 21 caíram · 0 continuaram verdes** (rodada final — inclui as
duas mutações nascidas do laudo independente do essencial `qualidade`, feito
depois de este relatório ter fechado com 19; ver "O que o laudo independente
achou depois da mutação" abaixo. Das 19 originais, a primeira rodada tinha
dado 18/1 — ver "O achado desta rodada" abaixo).

**Como reproduzir**, sem depender de ninguém lembrar:
```sh
node scripts/mutacao-onda-2.mjs docs/celula-prospeccao/mutacao-onda-2b-lista.json docs/celula-prospeccao/mutacao-onda-2b.json
```
O script recusa a mutação se o alvo não aparecer **exatamente uma vez** no
arquivo (`ALVO_NAO_ENCONTRADO`) — `replace` sem `assert` não é conserto, é
esperança. E ele grava com todas as letras quando uma guarda afrouxada deixa o
teste VERDE, em vez de esconder: guarda que não derruba teste é decoração.

Suíte no fim desta onda: **840 testes verdes** em `__tests__/celula` +
`__tests__/marketplaces` (linha de base antes da onda: 438 na célula e
151/152 em marketplaces, com 1 vermelho). `npx tsc --noEmit`: limpo.

## O resultado

| mutação | a guarda que ela afrouxa | o teste ficou | os testes que caíram |
|---|---|---|---|
| `colchete/remanescente-bloqueia` | colchete nao preenchido no texto final BLOQUEIA (o [NOME] literal chegando ao cliente) | 🔴 caiu | × BLOQUEIA quando sobra [ALGO] não declarado no textoBase · × valor hostil contendo "[OUTRA]" literal não é reprocessado — é BLOQUEADO pela trava, não aceito em silêncio |
| `colchete/substitui-o-colchete` | a variavel em colchete e de fato substituida (a regex combinada conhece [MIOLO]) | 🔴 caiu | × preenche [NOME] com valor — texto correto, sem colchete no resultado · × reconhece e preenche variável de colchete com acento e espaço · × reconhece variável de colchete com vírgula no miolo · × {{chave}} continua funcionando lado a lado com [CHAVE] no mesmo texto |
| `colchete/ausencia-vs-obrigatoria` | regra de ausencia para variavel OBRIGATORIA e contradicao e BLOQUEIA | 🔴 caiu | × BLOQUEIA regra de ausência para variável que está em variaveisObrigatorias — contradição |
| `colchete/ausencia-recorte-inexistente` | regra de ausencia cujo recorte nao existe no textoBase e regra morta e BLOQUEIA | 🔴 caiu | × BLOQUEIA quando o recorte "de" da regra não existe no textoBase |
| `colchete/palavras-proibidas-globais` | as tres frases proibidas pelo CEO na raiz do JSON valem para TODO modelo | 🔴 caiu | × bloqueia o envio de um modelo que não tinha a palavra na lista própria |
| `colchete/globais-malformada-visivel` | lista global malformada aparece em invalidos, nao passa em silencio | 🔴 caiu | × malformada aparece em invalidos, e a biblioteca ainda carrega os modelos |
| `biblioteca/os-22-continuam-inenviaveis` | com os 22 textos do CEO preenchidos, estado rascunho continua BARRANDO o envio | 🔴 caiu | × modeloParaEnvio(M01) recusa citando "rascunho" · × modeloParaEnvio(M02) recusa citando "rascunho" · × modeloParaEnvio(M03) recusa citando "rascunho" · × modeloParaEnvio(M04) recusa citando "rascunho" |
| `m14/clienteRecusou` | M14 — NAO enviar se: o cliente recusou | 🔴 caiu | × cliente recusou · × "clienteRecusou" em null bloqueia · × cliente recusou + plataforma bloqueou → motivos tem os dois · × todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO |
| `m14/projetoEncerrado` | M14 — NAO enviar se: o projeto encerrou | 🔴 caiu | × projeto encerrado · × "projetoEncerrado" em null bloqueia · × todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO |
| `m14/outraPessoaContratada` | M14 — NAO enviar se: outra pessoa foi contratada | 🔴 caiu | × outra pessoa contratada · × "outraPessoaContratada" em null bloqueia · × todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO |
| `m14/clientePediuParaNaoReceber` | M14 — NAO enviar se: o cliente pediu para não receber | 🔴 caiu | × cliente pediu para não receber · × "clientePediuParaNaoReceber" em null bloqueia · × todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO |
| `m14/plataformaBloqueou` | M14 — NAO enviar se: a plataforma bloqueou | 🔴 caiu | × plataforma bloqueou · × "plataformaBloqueou" em null bloqueia · × cliente recusou + plataforma bloqueou → motivos tem os dois · × todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO |
| `m14/teto-de-um` | M14 — apenas UM acompanhamento automatico por oportunidade (>= 1 bloqueia) | 🔴 caiu | × já houve acompanhamento (acompanhamentosJaEnviados >= 1) · × : 1 bloqueia (o teto é UM, >= 1) · × já houve acompanhamento + intervalo não cumprido → motivos tem os dois · × intervalo já cumprido (nada bloqueia por tempo) + acompanhamentosJaEnviados: 1 + política sem maximo_por_oportunidade → BLOQUEIA pelo teto, e só pelo teto |
| `m14/desconhecido-bloqueia` | campo nao informado (null) BLOQUEIA — ausencia de informacao nao e informacao | 🔴 caiu | × "clienteRecusou" em null bloqueia · × "projetoEncerrado" em null bloqueia · × "outraPessoaContratada" em null bloqueia · × "clientePediuParaNaoReceber" em null bloqueia |
| `m14/intervalo-minimo` | M14 — intervalo minimo configuravel desde a ultima mensagem da agencia | 🔴 caiu | × 1 h desde a proposta bloqueia e diz quantas faltam · × 71.9 h (um tico antes do limite) ainda bloqueia · × já houve acompanhamento + intervalo não cumprido → motivos tem os dois · × intervalo indeterminado bloqueia sozinho, e o único motivo nomeado é o intervalo (não o teto, que este caso não exercita) |
| `m14/politica-fail-closed` | politica ausente cai no valor MAIS restritivo (1), nunca no mais permissivo | 🔴 caiu | × bloco {} (campo ausente) → maximoPorOportunidade === 1 · × maximo_por_oportunidade: "dois" (texto) → 1 · × maximo_por_oportunidade: null → 1 · × maximo_por_oportunidade: -3 (negativo) → 1, negativo não vira permissão |
| `m14/contagem-negativa` | acompanhamentosJaEnviados negativo e dado corrompido, nunca permissao | 🔴 caiu | × negativo bloqueia como dado corrompido, não como permissão |
| `fronteira/voce-agora-e` | o sinal de injecao 'voce agora e' dispara na forma ACENTUADA (a comum em portugues) | 🔴 caiu | × metade 1 — COM acento ("você agora é..."), como um brasileiro escreve: dispara o sinal · × o sinal é GROSSEIRO por desenho — não restringe o que vem depois de 'é', e isto é esperado: é telemetria, nunca a trava (ver docs do próprio arquivo) |
| `fronteira/ate-amanha` | a promessa de data 'ate amanha' e reconhecida na forma ACENTUADA | 🔴 caiu | × metade 1 — COM acento: dispara a promessa de data |
| `colchete/opcional-vazia-nao-some` | variavel OPCIONAL com string vazia e AUSENTE — nao some do texto deixando buraco | 🔴 caiu | × BLOQUEIA quando variável opcional é "" e não há regra de ausência — motivo cita o colchete remanescente · × BLOQUEIA quando variável opcional é "   " (só espaços) — mesmo caminho da string vazia · × metade gêmea: opcional "" COM regra de ausência — a regra aplica, texto correto, sem colchete sobrando · × obrigatória com "" bloqueia pelo motivo de "obrigatória", não pelo de colchete remanescente |
| `guardiao/permuta-sem-cedilha` | 'faco de graca' sem cedilha e barrado pelo Guardiao (o typo [cc] que deixava passar) | 🔴 caiu | × metade 1a — SEM cedilha na palavra ('faço de graca') agora é barrado · × metade 1b — SEM cedilha nas duas palavras ('faco de graca') agora é barrado |

## O que esta onda travou

- Os **22 textos literais do CEO** continuam inenviáveis: modelo em `rascunho`
  bloqueia o envio mesmo com o texto já preenchido (`biblioteca/os-22-continuam-inenviaveis`).
- O colchete `[NOME]` — e qualquer variável em colchete não preenchida — **não
  chega ao cliente**: sobra no texto final, e a trava bloqueia (`colchete/remanescente-bloqueia`,
  `colchete/substitui-o-colchete`), inclusive quando o valor é hostil e tenta
  se passar por outro colchete.
- As **seis condições do M14** — cliente recusou, projeto encerrou, outra
  pessoa contratada, cliente pediu para não receber, teto de um acompanhamento
  por oportunidade, plataforma bloqueou — cada uma barra sozinha, e campo `null`
  em qualquer uma delas BLOQUEIA em vez de deixar passar (ausência de
  informação não é informação).
- A **fronteira de palavra acentuada**: os sinais de injeção e de promessa de
  data ("você agora é...", "até amanhã") disparam na forma **com acento**, a
  forma comum em português — não só na forma ASCII.

## O achado desta rodada — o coração do relatório

A **primeira** rodada deu **18 caíram, 1 continuou VERDE**: `m14/politica-fail-closed`
— afrouxar o fallback de `maximo_por_oportunidade` de `: 1` para `: Infinity`
(ou seja: política ausente passaria a significar **acompanhamentos
ilimitados**) **não derrubou nenhum teste**.

Duas causas somadas, e as duas merecem estar escritas:

1. O `policy.json` real **tem** o campo, então o ramo do fallback nunca era
   exercitado pelos testes que usam `"99freelas"`.
2. O único teste com plataforma sem política **não isolava** o fallback: sem
   política, o intervalo também vira `Infinity` e o bloqueio de tempo dispara
   antes. **Um bloqueio escondia o outro** — o teste passava por um motivo que
   não era o que ele achava que provava.

Conserto (ficha F, despachada na mesma sessão): `configuracaoDeAcompanhamento`
virou exportada e injetável, `podeAcompanhar` ganhou um 4º parâmetro opcional
para o bloco de política, e entraram 15 testes isolando cada fallback um a um,
mais o teste de ponta em que o intervalo já passou e só o teto pode bloquear.
Na segunda rodada, **as 19 caíram**.

> A lição, e é a razão de a mutação existir: **suíte verde não prova guarda
> viva.** Aqui foi uma guarda de fail-closed que valia "um acompanhamento" contra
> "acompanhamentos ilimitados", e ela estava desprotegida sob 38 testes verdes.

## O que o laudo independente achou depois da mutação

Este relatório fechou em 19 mutações, 19 vermelhas, suíte verde. O essencial
`qualidade` (só leitura, nunca escrita) fez o laudo independente **depois**
disso e achou **dois furos reais** que as 19 mutações não cobriam. Cada furo
virou uma ficha própria (H e I) e cada conserto ganhou sua própria mutação —
as duas linhas novas da tabela acima.

**(a) Variável OPCIONAL com string vazia sumia do texto sem bloqueio.** Uma
variável opcional recebendo `""` desaparecia do texto final sem acionar a
regra de ausência e sem bloquear o envio — o cliente receberia um texto com
buraco. Causa: duas metades do código discordavam sobre o que é "ausente" —
o substituidor de colchete tratava só `null`/`undefined` como ausente; a
regra de ausência usava `trim() === ""`. Duas definições diferentes da
mesma palavra, e nenhuma das duas errada sozinha. Conserto (ficha H): uma
definição única, a função `ausente()`, usada nos 4 pontos de preenchimento.

**(b) `lib/marketplaces/99freelas/conformidade.ts`, regra
`permuta_ou_teste_gratis`.** A classe de caractere `[cc]` repetia o mesmo
caractere duas vezes em vez de trazer o par cedilha/c. Efeito: "faço de
graça" sem cedilha ("faco de graca") atravessava o Guardião em silêncio —
e essa é a regra que barra a agência oferecendo trabalho de graça, a
sanção declarada no 99Freelas. Varredura da família inteira depois disso:
**90 classes de caractere examinadas em 6 arquivos, 1 defeito** — o já
conhecido.

**A lição:** 21 mutações verdes não provaram ausência de furo — quem achou
os dois foi uma **lente diferente** (o essencial `qualidade`, só leitura),
lida **depois** do relatório fechado. Mutação prova que a trava que existe
está viva; não prova que a trava certa foi escrita.

## O que a mutação NÃO cobre desta onda

- A entrada de `acompanhamentosJaEnviados` **não existe**: o chat do 99Freelas
  está atrás de login, que é BLOCK nesta rodada. A trava do M14 decide certo
  sobre um dado que hoje **ninguém alimenta sozinho** — mecanismo existe,
  entrada não. Está escrito no topo de
  `lib/agency/celula/mensagens/acompanhamento.ts` ("🔴 O RISCO QUE ESTE ARQUIVO
  NÃO FECHA").
- Esta rodada não mede se a régua está certa (o que É "até amanhã", o que NÃO
  é) — só se a trava reage quando deveria reagir.
