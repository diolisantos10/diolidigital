# 10ª volta — 26/08/2026

> Produção `https://www.diolidigital.com.br`. Commit no ar ao fechar: **`e3a1a43`**.
> Clientes ocultos **PONTO DO PAO NOME TESTE** e **FORNO DA VILA NOME TESTE**
> (e-mails `.invalid`). Nenhuma publicação, nenhuma mensagem a pessoa real,
> nenhum recurso real tocado. **As duas propostas reais paradas há dez dias
> continuam intocadas** — o CEO não autorizou responder.

---

## 1. O bloqueio que definiu a volta

**A porta pública do SDR está FECHADA por teto de gasto da casa**, lido no Pulso
às 14:26:

> A PORTA DA FRENTE está fechada — o SDR de IA não atende visitante nenhum:
> `teto_do_workspace_estourado` (gasto **US$ 27,11 de US$ 25,00**).

E as contas de **Claude e OpenAI estão zeradas** (`SEM SALDO na conta do
provedor`, as duas, no mesmo Pulso). Consequência direta e declarada:

* **nenhum turno novo de SDR foi possível** nesta volta. A cortesia da
  retratação e a reformulação em segunda pessoa ficam **não medidas no ar**;
* **nenhuma imagem nasceu.** A fila de imagem nova está no ar e **não foi
  exercitada em produção**.

Os dois são **bloqueio do CEO**, não defeito de código — e a casa disse os dois
sozinha, com motivo e dono.

O que **deu** para exercitar sem IA: a entrega de orçamento (o texto sai da
estimativa derivada, sem modelo), a porta de aceite, o portal do cliente e a
tabela de preços. Foi até onde o texto alcança, e é onde parou.

---

## 2. Os consertos, medidos no ar

### 🔴 A porta de aceite que não existia — **fechada, medida duas vezes**

A origem não era o token: era `entregarOrcamentosPendentes` seguir em frente com
`link = null`. `linkDaProposta` nunca lança, então uma falha ao cunhar produzia,
**em silêncio**, o estado exato das duas propostas reais: mensagem escrita,
pedido fora de `new`, nenhuma porta. E fora de `new` o relógio nunca mais o
alcança — o silêncio virava definitivo.

Agora a entrega **para**: o pedido fica na fila (falha transitória se cura na
batida seguinte), nada é escrito ao cliente, e vira alarme com dono e ação.

**Medido em produção, duas vezes:**

| pedido | porta cunhada | mensagem escrita | link no corpo |
|---|---|---|---|
| `cmta3msiq…` (PONTO DO PAO) | 13:01:43.161 | 13:01:43.334 | ✅ `/proposta/Od5t…` |
| `cmta6n08j…` (FORNO DA VILA) | 14:26:15.955 | 14:26:16 | ✅ |

A porta nasce **0,2 s antes** da mensagem, que é o que o código diz que faz.

⚠️ **As duas propostas reais NÃO foram consertadas, de propósito.** Elas são
legado (anteriores a 24/08, quando `linkDaProposta` nasceu). Cunhar token para
elas agora as jogaria na fila de reenvio — ou seja, mandaria e-mail a cliente
real. **Isso é decisão do CEO.** O que este trabalho fecha é a ORIGEM: nenhuma
proposta nova nasce sem porta.

### 🔴 O portal — metade medida, metade não

**Medido no ar** (`GET /api/portal/esteira`, pedido em `proposal_pending` com a
proposta escrita):

```
"etapa": "Proposta na sua mão"   "progresso": 13   "aBolaEstaComVoce": true
```

A 8ª volta mediu, no mesmo estado, **"Conhecendo o seu negócio · 0%"** por 27
minutos. ✅ **Fechado, no ar.**

**NÃO medido:** a barra que regredia (50% → 25%). Ela vive no ramo de PRODUÇÃO,
que exige projeto com peça — e peça exige imagem. Continua com prova de teste e
de mutação, **não de tela**. Dívida declarada.

### 🔴 O gerador que não cumpria o contrato — **fechado no código, não no ar**

`contratoDasLegendas` cobra `format` e `pillar` item a item. O esquema JSON que
os prompts de conserto pediam ao modelo **não citava nenhum dos dois** — a casa
exigia na saída o que nunca pediu na entrada. É o defeito de `cenas` de 25/08, na
mesma constante, reescrito em vez de lido.

Afrouxar o portão devolveria peça sem pilar ao calendário do cliente, que é o
defeito de 07/08 (salário inventado no pixel). Consertado o gerador. E o número
de itens passou a ir no prompt (`quantosItens`): *"muda só o gancho do primeiro"*
fazia o modelo devolver um item e os outros sumirem.

⚠️ Não exercitado no ar: refação exige peça, peça exige imagem.

### 🟠 Feed e carrossel — **o diagnóstico recebido não se confirmou**

Verificado: `PRODUTOS_CANONICOS` **já tem dois** (story e feed), e o chamador
único de `conferirArquivoDoProduto` é a corrente única, escrita contra
`ProdutoCanonico` — `producao-de-pedido` a chama por **presença** de produto
(`if (produto)`), nunca por id. O carrossel é venda **fechada**, com motivo
escrito e sem preço.

O que faltava era a catraca do amanhã: produto novo fora da corrente, ou desvio
por id, reabre o buraco de 25/08. Instalada e provada por mutação.

### 🟠 A cortesia da retratação — **no código, não no ar**

Nas três passadas da 9ª volta o dado saía das três memórias (certo) e a fala
seguinte não dizia uma palavra. Agora a casa diz, **na segunda pessoa**, e só no
turno em que o cliente pediu (a marca é acumulativa; a cortesia não pode ser).

⚠️ Não exercitado no ar: porta do SDR fechada por teto. E a reformulação em
segunda pessoa (PR #350) **continua verde por ausência** — mesmo motivo.

### 🟠 O Gerente Geral — **já estava fechado; a catraca é que era literal**

O conserto de classe (não de roteamento) está de pé e o auditor anterior deixou
o erro dele declarado no código. O que faltava: todas as réguas conferiam o
literal `"project-management"`. O que produziu a recusa foi a **propriedade** —
o gerente daquele departamento ser o próprio GG. Catraca genérica instalada.

---

## 3. A fila de imagem (ordem nova do CEO)

Só a OpenAI gerava arte; ela cair parava a produção inteira. O texto não parou na
volta passada porque a fila escorregou para o Gemini. A arte passou a ter a mesma
disciplina.

* **escorrega:** sem saldo, 429, 5xx, timeout, rede, resposta sem imagem;
* **NÃO escorrega:** falta de chave — é configuração, e para com dono e ação;
* **fila esgotada:** para com o motivo **mais grave** dos que caíram, no rótulo
  da casa (`SEM SALDO na conta do provedor…`), nunca "não consegui gerar a tela
  1 de 4";
* **freio 1:** nenhuma régua de peça pergunta quem produziu — provado por teste
  sobre o código das réguas;
* **freio 3:** o arquivo carrega o produtor (`uploadedBy: design (gemini/…)`), e
  o livro-caixa grava o provedor real em vez de `"openai"` fixo.

**Prova por mutação, literal:** desligue a OpenAI (sem chave, ou sem saldo) e a
casa continua produzindo — pelo Gemini. `__tests__/design/a-fila-da-imagem.test.ts`.

**Achado no caminho:** uma chave inválida da OpenAI devolve *"Incorrect API key
provided"* — **sem o 401 e sem a palavra "invalid api key"**.
`classificarFalhaDeProvedor` devolvia `null`, e `null` escorrega: uma chave
errada faria a casa trocar de produtor em silêncio, que é exatamente o que a
ordem proíbe. O status passou a entrar na mensagem, nos dois provedores.

⚠️ **NÃO MEDIDO NO AR.** Com o teto da casa estourado, nenhuma chamada de IA
passa. A fila está no ar e não foi exercitada em produção.

---

## 4. A tabela de preços — fechada

Delegação expressa do CEO. Régua: agência nova, sem fama, preço de entrada,
abaixo do mercado por decisão.

### Todas as tabelas que existiam

| # | Onde | O que guardava |
|---|---|---|
| 1 | `lib/agency/planos.ts:59` | 5 planos: 49 · 297 · 790 · 1.390 · 2.590 (+ implantações), `PECA_EXTRA = 180` |
| 2 | `lib/agency/live-calculator.ts:114` | `SOCIAL_PACKAGES`: 590 · 990 · 1.790 — **o que a esteira COTAVA** |
| 3 | `lib/agency/live-calculator.ts:187` | `P`: reel 150–400, tráfego 500–1.200, branding 1.200–2.500 e 2.000–4.000 |
| 4 | `lib/agency/pricing-margins.ts:49` | `SOCIAL_MARGINS`: alvos 590 · 990 · 1.790 + `ADDON_MARGINS` |
| 5 | `lib/agency/comercial/negociacao.ts:188` | `TABELA_DE_PISO`: `cheio`/`piso` de 5 avulsos **e** de 4 planos |
| 6 | `lib/agency/self-serve-catalog.ts:47` | balcão: `price` + `precoMinimo` de 15 itens, incluindo `balcao-pacote-mes` (R$ 297 / 8 peças) |
| 7 | `docs/precos.md` | o documento, com uma terceira tabela "por serviço" |

**Nenhum dos três preços que a esteira cotava existia na vitrine.** Medido de
novo hoje, às 13:01, num pedido real de teste: *"Plano Essencial — R$ 590/mês"*.

### A tabela nova

| Plano | Preço | Implantação | Peças/mês | Mercado (ago/2026) |
|---|---|---|---|---|
| Pulso | R$ 49 | isenta | 0 | não existe |
| Ritmo | R$ 290 | isenta | 12 | R$ 800–1.500 (básico) |
| Presença | R$ 490 | R$ 390 | 20 | R$ 800–1.500 |
| Conteúdo | R$ 790 | R$ 690 | **36** | R$ 2.000–4.000 (esse volume) |

Peça extra **R$ 90** (mercado R$ 120–190).

**O teto da tabela (R$ 790) fica abaixo do PISO do mercado (R$ 800).** Não é um
degrau barato: é a tabela inteira posicionada abaixo do menor preço praticado.

**Crescimento (R$ 2.590) saiu.** É faixa de média empresa — preço de quem já tem
nome, e a tabela inteira diria o contrário sobre quem esta casa é. Tráfego pago
continua como projeto orçado à parte.

### Capacidade

3 levas × 12 = **36 peças/mês**. Ritmo 12, Presença 20, Conteúdo 36 — o teto
encosta na capacidade e nenhum plano passa. Vídeo e reel seguem fora, sem
produtor.

### A conta

| Plano | Peças | IA de imagem/mês | Receita | % |
|---|---|---|---|---|
| Ritmo | 12 | ~R$ 11 | R$ 290 | 3,8% |
| Presença | 20 | ~R$ 19 | R$ 490 | 3,9% |
| Conteúdo | 36 | ~R$ 33 | R$ 790 | 4,2% |

⚠️ **Hora humana NÃO está nesta conta** — o Presença e o Conteúdo têm
atendimento humano, e esta casa não mede hora. Dívida declarada.

### O que morreu

Não bastava concordar os números: **dois lugares que concordam ainda são dois
lugares.** Passaram a ser DERIVADOS de `planos.ts` — `SOCIAL_PACKAGES`, os
cortes de volume de `detectPackage`, `SOCIAL_MARGINS`, o `cheio`/`piso` dos
planos e dos avulsos, e `balcao-pacote-mes` (que era o Ritmo com preço próprio).
Os adicionais (`P`, `ADDON_MARGINS`) morreram sem herdeiro: **a esteira parou de
cotar o que a vitrine não precifica** — tráfego e identidade entram na proposta
com escopo e sem preço, nunca como R$ 0.

### Prova por mutação

`__tests__/comercial/a-tabela-e-uma-so.test.ts` quebra quando: um preço cotado
não existe na vitrine · um plano passa de 36 peças · vídeo/reel volta a um plano
· o teto passa do piso do mercado · um campo de preço recebe literal · a página
digita um número. Exercitado: `minPrice: 590` de volta → **3 asserções caem**.

### Medido no ar

| hora | pedido | proposta escrita |
|---|---|---|
| 13:01 (`72ea902`) | PONTO DO PAO | **"Plano Essencial — R$ 590/mês"** ← o defeito |
| 14:26 (`e3a1a43`) | FORNO DA VILA | **"Plano Ritmo — R$ 290/mês"** ← na vitrine |

E `/planos` no ar: **"Quatro degraus"**, 49 · 290 · 490 · 790.

E o alarme de preço do relógio **ficou calado na batida das 14:26** — silêncio
por ausência de defeito, não por alguém tê-lo desligado. A trava mudou de lugar,
como a ordem mandou: é código.

**Defeito meu, achado no ar:** minutos depois do deploy, a página servia a tabela
nova e o subtítulo dizia **"Cinco degraus"**, com a meta-descrição prometendo
"ao R$ 2.590 que cresce". Não foi a tabela: foi o texto em volta, que ninguém
derivava. Consertado e travado.

---

## 5. Empurrões

| empurrão | classe |
|---|---|
| nenhum por defeito da casa | — |
| turnos de SDR impossíveis (teto da casa estourado: US$ 27,11 / US$ 25,00) | **bloqueio do CEO** |
| nenhuma imagem (OpenAI e Anthropic zeradas) | **bloqueio do CEO** |
| as duas propostas reais seguem sem porta | **decisão do CEO pendente** |

⚠️ **Zero paradas lidas não seria verde, seria vazio.** Não é o caso: o Pulso foi
lido inteiro na batida de 14:26 e as paradas estão nomeadas acima.

---

## 6. Custo

**US$ 0,00 nesta volta.** Nenhuma chamada de IA foi feita — o teto da casa já
estava estourado quando ela começou, e ele recusa antes de gastar. As duas
propostas de teste saíram de estimativa **derivada em código**, sem modelo.
Zero custo de arte, zero de texto.

---

## 7. O que continua não medido, e o que depende só do CEO

**Depende só do CEO:**

* **crédito de OpenAI e Anthropic.** Zeradas. Sem elas não há arte e não há
  Claude — o Gemini atende o texto e, agora, a arte também (quando houver teto);
* **o teto de gasto da casa (US$ 25/dia).** Estourado desde antes desta volta.
  Enquanto estiver, a porta pública do SDR fica fechada e o visitante cai no
  motor de regras sem aviso na tela dele;
* **as duas propostas reais de dez dias.** O mecanismo está fechado; elas são
  legado e responder a elas é decisão dele.

**Não medido no ar (dívida minha, declarada):**

* a **fila de imagem** inteira — código no ar, nenhuma imagem gerada;
* a **barra de andamento** que regredia;
* o **contrato do gerador** na refação e a **conferência do arquivo**;
* a **cortesia da retratação** e a **reformulação em segunda pessoa**;
* a jornada de **aprovar · ajustar · recusar · cancelar** com peça na mão.

**Notas por departamento** (nota só se exercitou):

| Departamento | Nota | O que sustenta |
|---|---|---|
| Comercial | **9** | duas propostas entregues no ar, com porta de aceite, número certo e a tabela nova |
| Portal | **8** | `proposal_pending` lido como "Proposta na sua mão · 13%" no ar; a barra da produção não foi exercitada |
| Operações | **8** | relógio batendo a cada 5 min, paradas nomeadas com dono e ação, e-mail a `.invalid` corretamente barrado |
| Financeiro / Preço | **8** | tabela única, derivada, abaixo do mercado, com margem mostrada e travada por teste |
| Design | *não exercitado* | conta zerada — nenhuma imagem |
| Qualidade · PM · Estratégia · Branding · Social · Analytics | *não exercitado* | dependem de projeto com peça |
