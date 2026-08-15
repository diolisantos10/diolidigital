# Preço, lado a lado — o que o documento diz e o que o código vende

> **Para o CEO · 15/08/2026 · levantamento, não decisão.**
> Nenhum preço foi criado, alterado ou apagado para escrever isto.
> Onde as duas fontes discordam, as duas estão escritas. **Escolher qual vale é
> decisão sua** — é a única coisa que este documento não faz.

---

## A conclusão em quatro linhas

1. **Você estava certo.** Existem **duas listas de cinco planos** no código, e
   **nenhum dos cinco nomes de uma aparece na outra**.
2. A lista oficial (`docs/precos.md`) alimenta **uma única tela**: a página
   pública de planos.
3. A **outra** lista alimenta **a proposta que o cliente lê no portal**, o
   dossiê do lead e os painéis internos.
4. A trava criada em 08/08 é **real e funciona**, mas protege só a primeira
   lista. Ela **não enxerga** a segunda.

> **Correção honesta de uma leitura anterior:** concluiu-se em 08/08 que a
> "segunda tabela" era o **balcão** (post R$ 79, carrossel R$ 129) e que,
> portanto, não havia contradição. **O balcão de fato não é o problema.** Mas a
> segunda lista de planos existe, em outro arquivo, e ninguém tinha olhado para
> ele. A conclusão de 08/08 foi arquivada como "resolvido" e não estava.

---

## 1. A tabela oficial × o código que a espelha — **sem divergência**

`docs/precos.md` ("Os cinco degraus") contra a lista de planos do código.

| Plano | Preço — documento | Preço — código | Implantação — documento | Implantação — código | Confere? |
|---|---|---|---|---|---|
| Pulso | R$ 49/mês | R$ 49/mês | isenta | isenta | ✅ |
| Ritmo | R$ 297/mês | R$ 297/mês | R$ 390 | R$ 390 | ✅ |
| Presença | R$ 790/mês | R$ 790/mês | R$ 1.290 | R$ 1.290 | ✅ |
| Conteúdo | R$ 1.390/mês | R$ 1.390/mês | R$ 1.900 | R$ 1.900 | ✅ |
| Crescimento | R$ 2.590/mês | R$ 2.590/mês | R$ 2.900 | R$ 2.900 | ✅ |

Escopo, permanência e valor da peça extra também conferem: 8 / 10 / 14 / 18
peças, permanência de 3 meses até o Presença e 6 do Conteúdo em diante, peça
excedente R$ 180.

**Estes dois estão casados e há uma trava automática que impede que se
descasem** — se alguém mudar o preço em um só, a build para. Isso foi conferido
hoje, na prática: trocamos o Ritmo para R$ 349 só no documento e a trava
reprovou, nomeando o plano e os dois números. O teste foi desfeito em seguida.

---

## 2. A OUTRA lista de cinco planos — **é aqui que mora o problema**

O mesmo código traz uma segunda família de planos, com outros nomes, outros
preços e outro escopo. Ela não é o balcão. É uma **tabela de planos mensais
concorrente**, e é ela que o aparelho comercial usa.

| # | Lista OFICIAL (a sua tabela) | Lista que o sistema usa na conversa |
|---|---|---|
| 1 | **Pulso** — R$ 49/mês | **Plano Essencial** — R$ 600 a R$ 900/mês |
| 2 | **Ritmo** — R$ 297/mês | **Plano Starter** — R$ 900 a R$ 1.400/mês |
| 3 | **Presença** — R$ 790/mês | **Plano Growth** — R$ 1.500 a R$ 2.400/mês |
| 4 | **Conteúdo** — R$ 1.390/mês | **Plano Pro** — R$ 2.500 a R$ 4.000/mês |
| 5 | **Crescimento** — R$ 2.590/mês | **Plano Premium** — R$ 4.000 a R$ 6.500/mês |

**Nenhum nome coincide. Nenhum preço coincide. O degrau de entrada da segunda
lista (R$ 600) é mais caro que o terceiro degrau da sua (R$ 790 é o terceiro, e
R$ 600 já passa Pulso e Ritmo inteiros).**

### As três diferenças que mudam o negócio, não só o número

**a) A segunda lista põe vídeo dentro de todo plano.** Ela promete 2, 4, 6, 10 e
16 **reels por mês**, inclusos na mensalidade — do degrau mais barato ao mais
caro. A sua tabela decidiu o contrário, com todas as letras: *"vídeo não entra
em plano nenhum"*, porque é o item de maior custo real da casa. A sua tabela
inclusive registra que esse foi **o erro do parecer do conselho, que você
recusou**. Esse parecer recusado continua vivo no código e é o que está sendo
oferecido.

**b) A segunda lista não tem o degrau de R$ 49 nem o de R$ 297.** Quem chega
pelo briefing público nunca é oferecido o Pulso nem o Ritmo — a porta de entrada
mais barata que o sistema conhece é R$ 600. A regra que sustenta a base da sua
tabela ("gente entra a partir do Presença; abaixo disso é máquina") não existe
nessa lista.

**c) A segunda lista vende por faixa, a sua vende por preço fechado.** A sua diz
"R$ 790". A dela diz "de R$ 1.500 a R$ 2.400" — e quem fecha dentro da faixa é a
conversa, não a tabela.

### Onde cada lista é usada de verdade

| Lista | Onde ela aparece |
|---|---|
| **Oficial** (Pulso…Crescimento) | **Só** a página pública `/planos` |
| **A outra** (Essencial…Premium) | **A proposta que o cliente lê no portal** · o dossiê do lead ("Quem procurou") · o painel interno "Catálogo de Planos & Preços" · a sala de briefing da equipe · a simulação do SDR |

**É esta a linha mais importante do documento.** A sua tabela é a que está
publicada; a outra é a que chega escrita ao cliente.

### O caso concreto, ponta a ponta

Quando um cliente recebe uma proposta no portal e clica em **"recusar"** ou
**"pedir revisão"**, a casa monta sozinha uma proposta nova e a publica no
portal dele. O texto sai assim:

```
Proposta ajustada — [nome do cliente]

✨ O QUE VOCÊ RECEBE
• Plano Growth — 7 posts + 10 stories/semana · 6 reels/mês

💰 INVESTIMENTO
Total: R$ 1.500 a R$ 2.400 / mês
```

**"Plano Growth" e "R$ 1.500 a R$ 2.400" não existem na sua tabela.** E os
"6 reels/mês" contrariam a decisão de manter vídeo fora de todo plano. Isso é
escrito, gravado como proposta aprovável e mostrado ao cliente **sem ninguém
revisar** — a casa roda 100% IA.

> **Duas coisas que eu achava e conferi que estavam erradas, e vale registrar:**
> na página pública de briefing, os dois blocos que mostrariam **preço** ao
> interessado (a "estimativa" e o "cartão de proposta") **estão no código mas
> nunca são exibidos** — código morto, já anotado pela casa em 08/08. O
> interessado vê o **nome** do plano ("Plano Growth"), não o valor. A exposição
> de preço acontece **no portal**, com cliente já dentro, no caminho descrito
> acima. Menos gente vê do que eu supus; quem vê é quem mais importa.

---

## 3. O balcão — produto diferente, e isto **não** é contradição

Este é o ponto em que a leitura de 08/08 estava certa e vale registrar para não
se refazer o erro ao contrário.

| | **Balcão** | **Plano** |
|---|---|---|
| O que é | peça única, comprada avulsa | mensalidade |
| Quem produz | máquina, sem revisão humana | equipe |
| Pagamento | no cartão, **antes** de produzir | fatura mensal |
| Para quem | qualquer pessoa, primeira compra | cliente de carteira |

Post R$ 79 e carrossel R$ 129 **não** são versões baratas do Ritmo: são outro
produto, com outro custo e outra promessa. A sua tabela já diz isso
explicitamente. **O balcão não deve conter os cinco planos, e não contém.**

### Mas há três itens do balcão que precisam de uma palavra sua

| Item vendido hoje | Preço | Está em `docs/precos.md`? |
|---|---|---|
| Post para feed | R$ 79 | ✅ sim |
| Carrossel até 5 telas | R$ 129 | ✅ sim |
| 4 stories | R$ 99 | ❌ não |
| Legenda / copy avulsa | R$ 39 | ❌ não |
| Auditoria de perfil | R$ 149 | ❌ não |
| **Pacote mês — 8 peças** | **R$ 297/"mensal"** | ❌ **não** |

**O último é o que merece atenção.** "Pacote mês — 8 peças" custa R$ 297, é
marcado como **mensal**, é marcado como **"Popular"** na vitrine, e entrega
*pauta do mês + 8 peças + calendário + aprovação peça a peça no portal*. Isso é,
item por item, **o plano Ritmo** — mesmo preço, mesmo escopo.

Ele é vendido **sem a implantação de R$ 390** e **sem os 3 meses de
permanência** que a sua tabela exige do Ritmo.

> ⚠️ **E há um detalhe de cobrança que é preciso dizer com todas as letras:** o
> item diz "mensal" na tela, mas **a casa não tem cobrança recorrente em lugar
> nenhum**. O comprador paga **uma vez** e recebe um mês. Não existe segunda
> cobrança automática. Se a intenção era assinatura, ela não existe; se a
> intenção era um mês avulso, a palavra "mensal" na vitrine promete o que não
> acontece.

**Este é o único caminho da casa em que um valor sai direto para o cartão do
cliente**, sem ninguém no meio: a vitrine manda o preço do item para o Mercado
Pago e o cliente paga. Tudo o mais — inclusive os cinco planos — é fechado à
mão, por WhatsApp.

> **Ressalva honesta:** o balcão só cobra se a chave do Mercado Pago estiver
> configurada no servidor. Sem ela, a casa **recusa** o pedido do balcão em vez
> de gravá-lo (comportamento correto e deliberado). **Não consigo verificar
> daqui se a chave está ativa em produção** — se estiver, o "Pacote mês" está
> comprável agora.

---

## 4. Outros pontos onde os preços não batem

Achados de passagem, todos fora dos planos. Nenhum foi alterado.

| Serviço | `docs/precos.md` | O que o código traz |
|---|---|---|
| Identidade visual | R$ 2.900 | **três** preços: R$ 480 (vitrine) · R$ 1.200–2.500 (painel interno) |
| Posicionamento / rebranding | R$ 3.900 (manual de marca R$ 3.500, interno) | R$ 2.000–4.000 (painel interno) |
| Estrutura de campanha (setup) | R$ 1.900 | R$ 380 ("Setup Meta Ads", na vitrine) |
| Gestão de tráfego mensal | **não existe** — tráfego está dentro do Crescimento | R$ 500–1.200/mês, como item vendável |
| 4 stories | balcão não lista · avulso R$ 190 (3 telas) | R$ 99 (balcão) **e** R$ 150 ("Pack 4 Stories") |

O último já era conhecido: o próprio código registra que "Pack 4 Stories"
(R$ 150) e "4 stories" (R$ 99) entregam quase a mesma coisa, e que **a decisão
de qual é qual é sua** e está pendente.

---

## 4b. "Nenhuma tela mostra a divergência" — **verdade, e é pior que isso**

Você escreveu isso e está certo: **não existe nenhuma tela, interna ou pública,
que ponha as duas listas lado a lado.** Ninguém abrindo o sistema descobriria
que há duas.

E há um agravante. O painel interno chama-se **"Catálogo de Planos & Preços"** —
o lugar onde qualquer pessoa da casa iria conferir o preço de um plano. Ele
mostra **apenas** Essencial / Starter / Growth / Pro / Premium. Quem for lá
confirmar quanto custa o Ritmo **não encontra o Ritmo**, e sai achando que os
planos da casa são os outros cinco.

Enquanto as duas listas existirem, esse painel é a fonte errada com o nome certo.

---

## 5. O que precisa de decisão sua — e nada anda sem ela

**Pergunta 1 — qual lista de planos é a verdadeira?**
Não dá para fundir as duas: os nomes, os preços e o escopo são incompatíveis.
Uma delas tem de deixar de existir no código.

- Se valem **Pulso…Crescimento**: o briefing, a estimativa e a proposta passam a
  falar em R$ 49 a R$ 2.590, e o vídeo sai de dentro do plano.
- Se valem **Essencial…Premium**: sua tabela de preços muda, e a decisão de
  "vídeo fora de todo plano" precisa ser reaberta.

**Pergunta 2 — o "Pacote mês — 8 peças" de R$ 297 continua à venda?**
Se sim, ele precisa entrar na tabela oficial com o nome, o preço e a condição
(com ou sem implantação, com ou sem permanência). Se não, sai da vitrine.
E a palavra "mensal" precisa virar verdade ou sair da tela.

**Pergunta 3 — identidade visual custa R$ 2.900, R$ 1.200–2.500 ou R$ 480?**
Três números para o mesmo serviço, em três telas diferentes.

**Enquanto a pergunta 1 não for respondida, nada disso pode ser consertado por
quem não decide preço.** Apagar uma das listas é escolher um preço, e preço é seu.

---

## 6. O que já foi feito, sem tocar em número nenhum

- A trava de 08/08 foi **conferida na prática** e reprova de verdade.
- Foi eliminada **uma duplicata de preço** que ninguém tinha visto: a régua de
  negociação do SDR redigitava à mão os preços dos planos e do balcão. Ela agora
  **lê** os valores da fonte, em vez de guardar uma cópia. **Nenhum número mudou**
  — mudou só de onde ele vem.
- Foi criada uma trava nova que reprova a build se alguém voltar a redigitar
  preço de plano nessa régua.

**O que ainda não tem trava, e é deliberado:** a segunda lista de planos
(Essencial…Premium) continua no código, porque removê-la exige a sua resposta à
pergunta 1. Criar uma trava para ela hoje quebraria a build sem que ninguém
pudesse consertá-la — a única saída seria uma decisão sua.
