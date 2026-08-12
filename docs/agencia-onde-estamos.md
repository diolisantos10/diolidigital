# A agência, departamento por departamento — medição corrente

> **Para que serve este arquivo:** a ordem do CEO de 09/08/2026 é *"a gente só
> vai colocar a primeira peça pra produzir nessa agência quando todos esses
> departamentos tiverem acima de noventa por cento"*. Este é o placar dessa
> ordem, e é **memória de trabalho do Diretor** — não é o relatório do CEO.
>
> **Regra deste arquivo:** cada nota é medida **contra o código**, nunca contra a
> intenção nem contra um documento. Nota que não disser *onde* foi medida não
> vale.
>
> **Última medição:** 2026-08-11

---

## O placar

| # | Departamento | Nota | O que ainda falta |
|---|---|---|---|
| 1 | **Cérebro de marca** | 90% | Régua de marca chega ao produtor e ao verificador; portão de entrega recusa marca não constituída. |
| 2 | **Relacionamento com o cliente** | 90% | Portal, fila que se cobra sozinha, avisos. |
| 3 | **Preço** | 90% | Fonte única de preço, verba de mídia separada do honorário. |
| 4 | **Entrada de material** | 90% | Caixas pré-classificadas ligadas ponta a ponta, com a triagem tendo destino real. SVG aceito e higienizado. |
| 5 | **Produção de peça** | 90% | Molde rasteriza JPEG de qualidade de agência (conferido no pixel em 11/08) e as **três composições por função** existem e funcionam (conferidas em 12/08). |
| 6 | **Captação** | 90% | Proposta parada é contada, e **a porta da frente passou a ser varrida** — quem entrou e não foi respondido aparece, separado de quem não deixou como falar. |
| 7 | **Aprovação** | 90% | O mês vira sozinho (`despertador.ts:291`) e **o card parado passou a ser contado** — separando o que espera o cliente do que espera a agência. |
| 8 | **Tráfego pago** | 55% | Campanha nasce pausada, com teto, e **não sai mais para o Brasil inteiro por omissão** (11/08). ⛔ Ligar de verdade depende da Meta. |
| 9 | **Publicação** | 40% | Máquina inteira pronta e fail-closed. ⛔ Depende da Meta. |
| 10 | **Medição** | 30% | Máquina pronta, porta declarada fechada. ⛔ Depende da Meta. |

---

## Prioridade um — a casa

| # | Item | Estado |
|---|---|---|
| 1 | Artes saírem em JPEG | ✅ feito |
| 2 | Enviar a análise do aplicativo na Meta | ⏳ **ato do CEO** |
| 3 | Produtor receber proibições e referências da marca | ✅ feito |
| 4 | A reprovação de dentro de casa virar dado | ✅ **feito 11/08** (`esteira/reprovacao.ts`) |
| 5 | Toda tela mostrar os dois lados do interruptor | 🔄 parcial |
| 6 | Falar com os três leads parados | ⏸️ **parado por ordem do CEO** |
| 7 | Varredura de segurança | ✅ feito |
| 8 | Ligar as fontes do Radar | ✅ **feito 11/08** (`radar/sources.ts`) |
| 9 | Não mexer no Drive | 🚫 regra, não tarefa |

---

## ⛔ O teto que não é meu: três departamentos param na Meta

**Isto é o achado que governa o cronograma inteiro, e ele mudou em 11/08.**

Os departamentos 8, 9 e 10 **não são três problemas — são um**. Nenhum deles
passa de onde está por código nosso. O parecer assinado do especialista `meta`
(11/08) apurou, com fonte oficial citada linha a linha:

- **Acesso padrão não basta.** O teste da Meta não é *"o ativo está no nosso
  Business Manager"* — é *"a conta foi adicionada ao app no Painel de Apps"*
  mais quem concede ter **função no app**.
- **Há um segundo portão, antes do App Review:** sem **verificação do negócio**
  concluída, *"os usuários de outras empresas não poderão conceder permissões a
  esses apps, e todos os recursos ficarão inativos"*. Ou seja: **nem o "mas o
  cliente autorizou" funciona** antes dela. É o prazo externo mais longo.

**Consequência honesta, escrita para não se perder:** enquanto a análise da Meta
não correr, o teto de 8/9/10 é onde estão. **A meta de "todos acima de 90%" tem
uma dependência que não é minha** — ela é ato do CEO (verificação do negócio,
envio da análise, gravação dos vídeos, configuração do login). Está registrado em
`docs/decisoes.md` e detalhado em `docs/plataformas/meta/app-review.md`.

**O que se faz enquanto isso, e é o que está sendo feito:** construir a máquina
inteira **fail-closed** e **medir** em vez de tentar. Ver
`lib/integrations/meta/permissoes-do-token.ts` — a casa agora sabe o que um token
pode, ativo por ativo, sem gastar uma tentativa contra a conta de um cliente.

---

## O método, e por que ele mudou em 11/08

Os quatro primeiros passos são os do raio-X de 02/08 (cliente concreto e difícil,
jornada elo por elo, conferir no repositório, nota pelo elo mais fraco). **Ganhou
um quinto, e ele já pagou:**

> **5. OLHAR A SAÍDA.** Rasterizar a peça e abrir o arquivo.

A suíte tinha 3.303 testes verdes quando a peça de um cliente saía assinada
**"PD"** em vez de **"PJ"** — o monograma pegava a inicial de *"do"*. Nenhum
teste pegou porque **nenhum teste olha o pixel**, e o defeito era pequeno demais
para gritar e grande demais para aceitar: ele assinava **toda** entrega sem logo.

Achado, corrigido e conferido no pixel no mesmo dia (commit `7ad9386`). Um teste
da casa até **carimbava** o defeito, esperando `"PD"`.

**A lição que fica:** verde não é sinônimo de certo. Onde o produto é visual, a
prova final é o olho — e ela tem de ser feita, não presumida.

---

## Nota sobre as próprias notas

Duas linhas deste placar já nasceram erradas e foram corrigidas **no mesmo dia**,
por conferência contra o código:

- **Aprovação** estava marcada como *"falta o fechamento automático do mês"*.
  **Já existe** e é perna do relógio (`despertador.ts:291`). A anotação vinha de
  um raio-X de 02/08 e envelheceu sem que ninguém a reconferisse.
- **Tráfego pago** estava em 20% com *"não há uma linha de Marketing API"*.
  **Havia** — campanha, conjunto, anúncio e guarda de verba existem.

**Por que isto está escrito aqui em vez de apagado:** número velho num arquivo
que os agentes leem como verdade faz a casa **consertar o que já está
consertado** — foi exatamente o defeito que aposentou `docs/pendencias.md` como
fonte de verdade em 08/08. A regra deste arquivo, então: **antes de repetir uma
nota, reconferir contra o código.** Nota herdada não é nota medida.
