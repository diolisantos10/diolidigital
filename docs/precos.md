# Tabela de preços da Dioli Digital — v2, 16/08/2026 (era v1, 05/08/2026)

> ## 💰 ONDE O PREÇO MORA DE VERDADE
>
> **O código é a fonte executável; este documento é a explicação.**
>
> | O quê | Onde |
> |---|---|
> | Os **6** planos: nome, preço, implantação, **piso**, escopo, exposição | **`lib/agency/planos.ts`** |
> | Moedas de troca e a régua de faixas do SDR | `lib/agency/comercial/negociacao.ts` (**deriva** de `planos.ts`) |
> | A cotação do briefing | `lib/agency/live-calculator.ts` (**deriva** de `planos.ts`) |
> | Custo e margem, uso interno | `lib/agency/pricing-margins.ts` (**deriva** de `planos.ts`) |
> | Os adicionais (reel, tráfego, marca) | **`lib/agency/adicionais.ts`** |
> | O balcão (post R$ 79, carrossel R$ 129) | **`lib/agency/self-serve-catalog.ts`** |
>
> ### 🔴 EM 16/08/2026 EXISTIAM **SETE** FONTES DE PREÇO, NÃO UMA
>
> Não uma fonte e um documento: sete lugares de código declarando preço, vivos
> ao mesmo tempo. **A 1ª rodada do conserto achou quatro e declarou o problema
> resolvido; a camada de dúvida achou mais três.** A contagem está aqui porque
> ela é o argumento — mas o que protege não é este parágrafo, é o portão.
>
> | Onde | O que declarava | Chegava a quem |
> |---|---|---|
> | `lib/agency/planos.ts` | os 5 planos oficiais | site `/planos` |
> | `comercial/negociacao.ts` | `cheio`/`piso` digitados + preço em frases de venda | fala do SDR |
> | `live-calculator.ts` | **5 planos que não existem** (Essencial, Starter, Growth, Pro, Premium), em FAIXAS: R$ 600–900 · 900–1.400 · 1.500–2.400 · 2.500–4.000 · 4.000–6.500 | **briefing PÚBLICO** |
> | `pricing-margins.ts` | um **segundo piso** (520 · 820 · 1.300 · 2.200 · 3.600) que contradizia o primeiro | painel de margem do dono |
>
> | `sdr-agent.ts` + `question-engine.ts` | 🔴 o **"Plano Starter (R$ 1.200–1.800/mês)"** — plano que nunca existiu, preço que não está escrito em lugar nenhum | **a fala do SDR ao prospect** |
> | `self-serve-catalog.ts` + `negociacao.ts` | os 5 itens de balcão, os mesmos dez números, nos dois | vitrine + SDR |
> | `live-calculator.ts` + `pricing-margins.ts` | os adicionais: o `maxPrice` de um era o `targetPrice` do outro, número por número | briefing + painel do dono |
>
> A terceira linha era o dano mais visível: `/planos` dizia **Crescimento
> R$ 2.590** e, no mesmo dia e na mesma casa, o prospect que preenchia o briefing
> recebia **"Plano Growth — R$ 1.500 a R$ 2.400"**.
>
> **A pior, porém, foi a que só a 2ª rodada pegou:** o SDR oferecia ao prospect,
> na conversa, um plano inexistente a **quatro vezes** o preço real do degrau
> equivalente (R$ 1.200 contra os R$ 297 do Ritmo, ambos "8 peças/mês"). Nenhuma
> varredura de preço tinha visto, porque **o número não era preço de plano de
> ninguém** — e era exatamente isso que os detectores procuravam.
>
> Todas foram **ELIMINADAS como fonte** e passaram a **derivar**. Não foram
> sincronizadas: duplicata sincronizada volta a divergir no primeiro dia de pressa.
>
> ### 🔴 A LIÇÃO DA 2ª RODADA: DETECTOR CALIBRADO CONTRA CÓPIA NÃO PEGA DIVERGÊNCIA
>
> O primeiro portão montava a lista de números a caçar a partir dos seis preços
> oficiais. **O incidente que originou tudo tinha números diferentes** — 600, 900,
> 1.400, 2.400, 1.200. Se o portão de então existisse antes, ele teria passado
> **verde por cima do próprio incidente**. Hoje ele detecta **FORMA**: três ou
> mais preços declarados fora das fontes é catálogo, tenha os números que tiver.
>
> **Mudou um preço? Muda em `planos.ts` e aqui, no mesmo commit.** Não é
> disciplina, é portão: `__tests__/comercial/preco-uma-fonte-so.test.ts` lê a
> tabela "Os seis degraus" daqui, compara com `PLANOS`, **varre o código atrás de
> preço de plano solto** e **reprova a build**.
>
> **São TRÊS fontes, e nenhuma duplica a outra:** planos, adicionais e balcão são
> produtos diferentes. Qualquer quarto lugar que declare preço reprova a build.
>
> ⚠️ **O balcão NÃO contém os 6 planos, e isso é de propósito** — são produtos
> diferentes (ver "Preço por serviço", abaixo). Uma auditoria já leu o balcão
> procurando os planos e concluiu, errado, que o preço não estava no código.

> Decidida pelo CEO em 05/08/2026: **primeiro a tabela**, planos e serviços.
> Vitrine: `https://claude.ai/code/artifact/ac47e688-4584-4555-ac74-fe15bea339bf`
>
> Regra de origem: **só serviço com código rodando em produção** aparece como
> entregável de plano. O que está "quase lá" ou "a construir" tem preço interno e
> não vai para proposta.

## A decisão estrutural: vídeo e marca ficam FORA de todo plano

O CEO decidiu, e a conta confirma: **vídeo não entra em plano nenhum**. O roteiro
sim (é texto, custa centavos); a gravação, a edição e o vídeo gerado por IA são
compra separada, sempre. Diluir o item de maior custo real da casa dentro da
mensalidade é o jeito mais rápido de a tabela inteira ficar no prejuízo — e é
exatamente o erro que o parecer do conselho embutiu ao colocar 4 edições no
plano de R$ 2.590 e 8 no de R$ 4.990.

Também ficam fora, pelo mesmo motivo (custo que não é conteúdo): **posicionamento
e identidade visual** (projeto com começo e fim), **site e landing** e a **verba
de mídia**.

## Os seis degraus

| Plano | Preço | Implantação | Piso | O que muda em relação ao degrau de baixo |
|---|---|---|---|---|
| **Pulso** | R$ 49/mês | isenta | **preciso confirmar** | Observa, mede e avisa. Zero peça, zero hora humana. |
| **Ritmo** | R$ 297/mês | R$ 390 | R$ 229 | **+ 8 peças/mês** prontas e aprovadas no portal. **Você publica.** Ainda zero hora humana. |
| **Presença** | R$ 790/mês | R$ 1.290 | R$ 690 | + 10 peças, **nós publicamos**, Google gerenciado, avaliações e **um humano no atendimento**. |
| **Conteúdo** | R$ 1.390/mês | R$ 1.900 | R$ 1.190 | + 14 peças, stories, **roteiros de reels**, plano de medição, reunião mensal. |
| **Crescimento** | R$ 2.590/mês | R$ 2.900 | R$ 2.190 | + 18 peças, criativos de anúncio e a campanha desenhada — rodando **na conta do cliente**. |
| **Performance** 🔴 | R$ 4.990/mês **+ mídia** | **preciso confirmar** | **preciso confirmar** | 🔴 **NÃO VENDÁVEL.** Escopo não escrito. Ver abaixo. |

**Pulso e Ritmo são decisão consciente do CEO** — pacotes de entrada para quem
tem menos dinheiro. Não são resíduo de tabela velha e não se removem.

**A regra que sustenta a base da tabela, e ela é inegociável: gente entra a
partir do Presença.** Abaixo disso a operação é máquina, e é só por isso que
R$ 49 e R$ 297 podem existir sem dar prejuízo. Se a publicação do Ritmo virar
nossa, o degrau quebra.

A implantação é **parcelável em até 3x**.

### 🔴 O PERFORMANCE É PRECIFICADO E NÃO É VENDÁVEL

Ele existe em `PLANOS` para a casa saber quanto custa, e **não** em
`PLANOS_PUBLICOS`. Não vai ao site, ao briefing, à vitrine, à proposta nem ao
portal — **nem como bônus, beta ou cortesia.** Dois motivos, e cada um sozinho
já basta:

1. **A gestão de Meta Ads operada dia a dia dentro da conta do cliente está
   LARANJA.** A conta de anúncios da agência está restrita desde 03/08/2026.
   Nada laranja, vermelho ou horizonte é vendável. Vender operação diária hoje é
   vender o que não se pode entregar.
2. **Só o preço deste degrau foi decidido.** Escopo, implantação, piso, cadência
   e permanência não foram escritos por ninguém — nem no parecer do conselho de
   05/08, nem depois. Não há o que colocar num contrato, e preencher por analogia
   com o Crescimento seria inventar contrato.

A trava é código, não este parágrafo: `exposicao: "interno"` em `planos.ts`, e
teste que reprova qualquer superfície de cliente que importe `PLANOS` em vez de
`PLANOS_PUBLICOS`.

### 🔴 O QUE FALTA, COM NOME (nenhum destes se completa por inferência)

| Falta | Onde some hoje | Quem decide |
|---|---|---|
| **Piso do reel avulso** | `live-calculator` dizia mínimo R$ 150 e `pricing-margins` dizia piso R$ 200 — o piso ACIMA do mínimo cotável. Nenhum tem procedência. Hoje `piso: null`: o reel não fecha automático | CEO |
| **Identidade Visual: R$ 2.900 (este documento) × faixa R$ 1.200–2.500 (código)** | o teto do código fica ABAIXO do preço do documento | CEO |
| **Piso do Pulso** | não existe em lugar nenhum. O SDR **não consegue fechar Pulso** — `podeFechar("pulso", …)` devolve `false` com o motivo escrito | CEO |
| **Implantação do Performance** | o parecer escalonou 3 faixas (1.290/1.900/2.900) e nenhuma foi atribuída a ele | CEO |
| **Piso, escopo, cadência e permanência do Performance** | nunca escritos | CEO |
| **Custo de atendimento de qualquer plano** | `costBasis` é `null` nos seis. A margem **não é afirmada** | medição |

O escopo numerado de cada plano, com o que NÃO está incluído item a item, está
na vitrine.

## Preço por serviço

**Duas tabelas, e elas não se contradizem — vendem coisas diferentes:**

| | **Balcão** (vitrine) | **Avulso** (cliente de plano) |
|---|---|---|
| Post | R$ 79 | R$ 190 |
| Carrossel | R$ 129 | R$ 290 |
| Quem produz | máquina, sem revisão humana | equipe, com direção de arte |
| Revisões | nenhuma | 2 rodadas |
| Pagamento | antes da produção, no cartão | na fatura do plano |
| Para quem | qualquer pessoa, primeira compra | quem já é cliente |

O balcão é a porta de entrada da casa: barato porque é 100% automático e pago
antes. O avulso é serviço de agência para quem já está dentro. **Preço
diferente para trabalho diferente não é incoerência — é o que impede a linha
barata de canibalizar a cara.**

**Conteúdo avulso só para quem já tem plano**, pedido mínimo R$ 750. Serviço de
projeto pode ser a primeira compra.

| Serviço | Preço | Observação |
|---|---|---|
| Carrossel até 6 telas | R$ 290 | R$ 180 como excedente dentro do plano |
| Post único com arte e legenda | R$ 190 | |
| Sequência de stories (3 telas) | R$ 190 | incluída a partir do Conteúdo |
| Criativo de anúncio | R$ 320 | 3/mês no Crescimento |
| Roteiro de reel | R$ 290 | 4/mês a partir do Conteúdo |
| **Edição do vídeo do cliente (60s)** | **R$ 350** | sempre à parte · pacote de 4: R$ 1.200 |
| **Vídeo gerado por IA (15s)** | **R$ 690** | sempre à parte · pacote de 4: R$ 2.400 |
| Leitura do perfil do cliente | R$ 690 | incluída na entrada de todo plano |
| Posicionamento de marca | R$ 3.900 | projeto, 3x |
| Identidade visual | R$ 2.900 | projeto, 3x |
| Pesquisa de concorrência | R$ 1.200 | |
| Plano de medição | R$ 1.400 | |
| Configuração da ficha do Google | R$ 890 | |
| Estrutura de campanha (setup) | R$ 1.900 | |
| Relatório mensal avulso | R$ 690 | |

**Preço interno (não vai para proposta):** manual de marca R$ 3.500 · diagnóstico
de presença R$ 1.500 · consultoria mensal R$ 1.200 · landing R$ 2.400 · site
R$ 6.900 · treinamento R$ 2.900 · impresso R$ 890 · atendimento automático no
WhatsApp do cliente R$ 490/mês · SEO local R$ 690/mês.

## As regras sem as quais o preço não sobrevive

- **Excedente:** peça além do contratado R$ 180; pedido avulso mínimo R$ 750.
- **Mídia:** **+8% sobre a verba acima de R$ 15 mil/mês**, e só sobre o
  excedente — 8% sobre a verba inteira criaria um degrau de R$ 1.200 num real a
  mais. A verba nunca passa pela conta da agência.
- **Ajustes:** 2 rodadas por peça (3 a partir do Conteúdo). Aprovação em até 2
  dias úteis; passado isso a peça segue para a data agendada.
- **Permanência:** 3 meses até o Presença, 6 do Conteúdo em diante. Pausa máxima
  de 30 dias por ciclo. Reajuste anual por IPCA.
- **Desconto tem chão, e o chão é número.** Decidido em 05/08/2026, quando o CEO
  definiu que o objetivo do comercial é FECHAR todo cliente sem prejuízo: cada
  item tem um piso calculado (`lib/agency/comercial/negociacao.ts`), e a
  mensalidade pode descer até ele — Ritmo R$ 229, Presença R$ 690, Conteúdo
  R$ 1.190, Crescimento R$ 2.190. **O piso do Pulso não existe**, e por isso o
  Pulso não é fechável pelo SDR: ausência de piso não é piso zero, é ausência de
  autorização.
  **A ordem das moedas de troca continua valendo, e ela é a proteção real:** a
  primeira coisa que se oferece é o que NÃO custa margem — prazo maior,
  pagamento à vista, menos rodadas de ajuste, contrato mais longo, autorização
  de case. Só depois disso o preço se mexe. Chegou no piso, corta-se ESCOPO,
  nunca margem.
- **Tráfego pago:** conta do cliente, verba fora da mensalidade, zero promessa de
  faturamento ou retorno. Ficha do Google, conta de anúncios, pixel e domínio no
  nome dele.
- **Avaliações:** elogio só é respondido sozinho com consentimento registrado;
  **reclamação nunca** — vira rascunho e chama gente.

## A conta

| Plano | Custo de IA/mês | Hora humana | Sobra antes da hora humana |
|---|---|---|---|
| Pulso R$ 49 | ≈ R$ 4 | nenhuma | R$ 45 |
| Ritmo R$ 297 | ≈ R$ 22 | nenhuma | R$ 275 |
| Presença R$ 790 | ≈ R$ 28 | a medir | R$ 762 |
| Conteúdo R$ 1.390 | ≈ R$ 38 | a medir | R$ 1.352 |
| Crescimento R$ 2.590 | ≈ R$ 52 | a medir | R$ 2.538 |
| Performance R$ 4.990 | não estimado | **não vendável** | — |

**Fechado:** o custo de IA, contado por peça a partir do próprio sistema.
**Hipótese:** a hora humana do Presença para cima — ninguém mediu.

> ### 🔴 O RISCO QUE PULSO E RITMO TORNAM DEZESSEIS VEZES MAIOR
>
> O parecer do conselho fez a conta de margem tratando o **Presença de R$ 790
> como a entrada**, e registrou o risco em uma frase: *"o plano de entrada atrai
> o cliente que paga menos e exige mais, ocupando capacidade que valia três vezes
> mais"*. Com o Pulso a **R$ 49**, a mesma hora de atendimento custa
> proporcionalmente **dezesseis vezes mais**.
>
> **Isto não bloqueia a venda** — os dois degraus são decisão do CEO e continuam
> abertos. O que muda é que o custo passa a ser **medido desde o primeiro
> cliente**: horas humanas por conta, separadas por atividade
> (`lib/agency/medicao/custo-de-atendimento.ts`). O número tem que chegar ao CEO
> **antes** de a carteira encher, não depois.
**Falta:** o custo fixo mensal da casa e quantas contas ela atende sem hora
extra. Sem esses dois, o piso de margem não existe. Plano que não fechar o piso
**perde escopo, nunca preço**.

## O que ainda não foi feito e é condição de impressão

Colher **cinco propostas de concorrentes da mesma praça**, datadas. As faixas de
mercado usadas como âncora vieram do parecer do conselho, e o próprio parecer
declara que nenhuma foi confirmada com fonte auditável.
