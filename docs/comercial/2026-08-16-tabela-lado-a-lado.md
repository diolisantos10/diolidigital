# Preço — as listas lado a lado, ANTES de apagar qualquer coisa

> **Status: aguardando decisão do CEO. Nada foi removido, nada foi criado.**
>
> Ordem do Diretor Geral de 16/08/2026: aplicar o documento do conselho de
> 05/08/2026 como fonte única de preço, e **perguntar ao CEO** em vez de escolher
> sempre que algo divergir dele.
>
> Divergiu. Este documento é a pergunta.

## 1. O que o documento do conselho diz (a ordem recebida)

| Plano | Mensalidade |
|---|---|
| PRESENÇA | R$ 790 |
| CONTEÚDO | R$ 1.390 |
| CRESCIMENTO | R$ 2.590 |
| PERFORMANCE | R$ 4.990 **+ mídia** — *precificado, **não publicado*** |

- **Implantação obrigatória, escalonada:** R$ 1.290 / R$ 1.900 / R$ 2.900, em 3x.
- **Excedente:** R$ 180 por peça.
- **Mídia:** +8% sobre verba acima de R$ 15 mil.
- **Avulso:** mínimo R$ 750 para quem já tem plano.
- **Trava:** só os **24 itens verdes** entram em plano ou proposta.

## 2. O que existe no código hoje

### 2a. `lib/agency/planos.ts` — declara-se "fonte única", **tem trava**

Portão: `__tests__/comercial/preco-uma-fonte-so.test.ts` lê a tabela de
`docs/precos.md` e reprova a build se o código divergir.

| Plano | Mensalidade | Implantação | Bate com o conselho? |
|---|---|---|---|
| Pulso | R$ 49 | isenta | ❌ **não existe no documento do conselho** |
| Ritmo | R$ 297 | R$ 390 | ❌ **não existe no documento do conselho** |
| Presença | R$ 790 | R$ 1.290 | ✅ |
| Conteúdo | R$ 1.390 | R$ 1.900 | ✅ |
| Crescimento | R$ 2.590 | R$ 2.900 | ✅ |
| — | — | — | ❌ **PERFORMANCE R$ 4.990 não existe no código** |

Regras que já batem: excedente R$ 180 ✅ · avulso mínimo R$ 750 ✅.
Regra que **não existe em lugar nenhum**: o **+8% sobre mídia acima de R$ 15 mil**.

### 2b. `lib/agency/live-calculator.ts` — a terceira tabela, **SEM TRAVA**

Cinco planos com nomes em inglês, faixas min–máx, que **não constam de nenhuma
das duas tabelas oficiais**:

| Pacote | Faixa |
|---|---|
| Plano Essencial | R$ 600 – 900 |
| Plano Starter | R$ 900 – 1.400 |
| Plano Growth | R$ 1.500 – 2.400 |
| Plano Pro | R$ 2.500 – 4.000 |
| Plano Premium | R$ 4.000 – 6.500 |

Complementos em `lib/agency/service-catalog.ts`, também sem trava:
gestão de tráfego R$ 500–1.200/mês · identidade visual R$ 1.200–2.500 ·
rebranding R$ 2.000–4.000 · reel extra R$ 150–400.

> ⚠️ **Identidade visual diverge de `docs/precos.md`**, que diz R$ 2.900 (projeto).

**Esta tabela chega ao prospect.** `/briefing` é rota pública, sem login, e o
componente `PublicBriefingRoom` calcula e **exibe a faixa de preço na tela**
(`computeEstimate` → `EstimateSection`). Também alimenta o SDR, o
`prospect-engine`, o `question-engine`, o `dossie-do-lead` e o
`negotiate-proposal`.

### 2c. As outras superfícies de preço (contexto, não conflito)

- `lib/agency/self-serve-catalog.ts` — o **balcão** da vitrine (post R$ 79,
  carrossel R$ 129). É produto diferente por decisão registrada, não duplicata.
- `lib/agency/comercial/negociacao.ts` — os **pisos** de negociação, internos e
  fail-closed. Contém pisos para Ritmo (R$ 229), Presença (690), Conteúdo (1.190)
  e Crescimento (2.190) — **o piso do Ritmo cai junto se o Ritmo cair**.

## 3. O conflito que eu não posso resolver sozinho

`docs/precos.md` é datado de **05/08/2026** — o mesmo dia do documento do
conselho — e diz, com todas as letras:

> **"Por que não há plano de R$ 4.990:** ele exigiria a agência operando o Meta
> Ads todo dia dentro da conta do cliente, e a conta de anúncios da casa está
> restrita desde 03/08. Vender operação diária hoje é vender o que não se pode
> entregar."

E, sobre o próprio parecer do conselho:

> "é exatamente o erro que o parecer do conselho embutiu ao colocar 4 edições no
> plano de R$ 2.590 e 8 no de R$ 4.990."

Ou seja: **o repositório registra uma decisão do CEO que rejeitou parte do
parecer do conselho e criou dois degraus novos (Pulso e Ritmo).** O mesmo
argumento está repetido em `docs/modelo-de-negocio.md` como um dos seis "o que a
Dioli não faz".

**A ordem de hoje reconcilia metade disso** — PERFORMANCE existe, precificado e
não publicado, exatamente porque o Meta Ads está laranja. Essa metade está
resolvida e eu aplico sem perguntar.

**A outra metade não está reconciliada:** Pulso e Ritmo.

## 4. As perguntas ao CEO

### Pergunta 1 — Pulso (R$ 49) e Ritmo (R$ 297) saem ou ficam?

Eles não estão no documento do conselho. Mas não parecem esquecimento: o
`docs/precos.md` construiu uma tese inteira em cima deles ("gente entra a partir
do Presença; abaixo disso a operação é máquina, e é só por isso que R$ 49 e
R$ 297 fecham"), e eles são a porta de entrada barata da casa.

| Saída | O que acontece |
|---|---|
| **A — saem** | A tabela vira os 4 do conselho. Cai também: implantação R$ 390, piso Ritmo R$ 229, e a faixa de entrada da casa. `/planos` perde os dois cards mais baratos. |
| **B — ficam** | A tabela vira 6 degraus (Pulso, Ritmo, Presença, Conteúdo, Crescimento, Performance). O conselho passa a ser fonte dos 4, e Pulso/Ritmo ficam como decisão sua de 05/08. |

**Eu não escolho isto.** Preço é decisão do CEO, e apagar dois degraus de receita
por omissão em um documento é o tipo de erro que não se desfaz depois de o
cliente ver.

### Pergunta 2 — Qual a implantação do PERFORMANCE?

O documento traz **três** valores (1.290 / 1.900 / 2.900) para **quatro** planos.
Hoje esses três estão em Presença, Conteúdo e Crescimento. **Falta o número do
Performance** — e eu não completo valor que não está no documento.

### Pergunta 3 — Onde está a lista dos 24 itens verdes?

Ela **não existe neste repositório**. Procurei em `docs/`, `lib/` e nos testes.
Sem a lista, a trava "entregável fora dos 24 verdes quebra o build" não pode ser
escrita — ela não teria contra o que comparar. Preciso do documento do conselho
(ou da lista) anexado.

## 5. O que eu já posso responder sem perguntar nada

- **PERFORMANCE não está vazando para cliente.** Ele não existe em lugar nenhum
  do código — nem interno, nem público. Varredura feita em `app/`, `lib/` e
  `components/`: todas as ocorrências de "Performance" são outra coisa
  (nome de departamento, tipo de analytics, formato de anúncio do Google).
  **Não é P0.**
- **Existe um vazamento, mas é outro.** A terceira tabela (Essencial a Premium,
  R$ 600–6.500) aparece em `/briefing`, rota pública, para qualquer prospect —
  com números que não batem com nenhuma das duas tabelas oficiais. Este é o P0
  real, e ele já era conhecido: `docs/modelo-de-negocio.md` o registra como
  🔴 "Duas tabelas de preço vivas e divergentes".
