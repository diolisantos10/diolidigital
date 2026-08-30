# 9ª volta do cliente oculto — 26/08/2026

> Produção `https://www.diolidigital.com.br`. Cliente oculto **CANTO DO GRAO
> NOME TESTE** (Rafael, `rafael@cantodograo-teste.invalid`). Turnos de SDR
> **novos**, nada reaproveitado. **Três** passadas completas, em três commits
> diferentes — cada uma depois do deploy do conserto que a anterior produziu.
> Nenhuma publicação, nenhuma mensagem a pessoa real, nenhum recurso real
> tocado. O WhatsApp usado é fictício e o e-mail é `.invalid`.

---

## 1. O que esta volta foi

Ela não repetiu a jornada inteira da 8ª — ela **mediu os consertos da 8ª no ar**,
com turnos novos, e no caminho achou **dois defeitos novos, os dois nossos**.

A parte da esteira que depende de produzir peça **não foi exercitada**: as contas
de OpenAI e Anthropic continuam zeradas (`SEM SALDO na conta do provedor`, lido
no Pulso durante a volta, para os dois provedores). **Nenhuma imagem saiu da
casa.** Isso é bloqueio do CEO, não defeito de código, e nada aqui conta "sem
imagem" como falha.

---

## 2. As medições, uma a uma, com o que sustenta cada uma

Commit medido na 1ª passada: `0f4d890`. Na 2ª: `6b02ec3`. Na 3ª: **`6ada12e`**,
que é o que está no ar agora.

| defeito da 8ª volta | medição no ar | veredito |
|---|---|---|
| **Faixa gravada um degrau abaixo** (PR #344) | o cliente disse *"Entre R$ 500 e R$ 1.500"* → `budgetRange: "entre R$ 500 e R$ 1.500"`, e **sobreviveu até a solicitação gravada** | ✅ fechou |
| **Retratação não propaga** | *"esquece o WhatsApp, prefiro e-mail"* → `prospectPhone` sumiu, `canaisRetratados: ["whatsapp"]`, `preferredChannel: "email"` | ✅ fechou |
| **…e a 3ª memória** | o `contato` da PORTA foi enviado **com o WhatsApp preenchido de propósito** — o caminho exato pelo qual o número voltou na 8ª. Gravado: `contato.whatsapp = null`, `scope.prospectPhone` ausente, coluna vazia | ✅ fechou |
| **Repergunta o respondido** | nenhuma fala do SDR saiu duas vezes igual nas duas passadas | ✅ nesta volta |
| **Fala do cliente em 3ª pessoa** | 1ª passada: limpa. **2ª passada: FALHOU** (ver §3.2). 3ª passada: limpa | ⚠️ ver a ressalva em §3.2 |
| **Proposta parada sem dono** | a perna nova aparece no Pulso e **achou parada de verdade** — ver §3.3 | ✅ fechou |

O que **não foi exercitado nesta volta**, e por isso não tem nota: o portal do
cliente (a barra de andamento e o `proposal_pending`), o ajuste/recusa/cancelamento
de peça, a produção e a apresentação do pacote. Os dois consertos de portal têm
prova de teste e prova de mutação, **não prova de ar**. Está declarado como
dívida, não como verde.

---

## 3. Os dois defeitos novos — os dois meus

### 3.1 🔴 "Vou seguir sem esse dado" sobre o dado que acabara de chegar

Uma hora depois de eu escrever a trava que o produziu. O cliente escreveu:

> "Já temos fotos boas do café e dos doces, tiradas por um amigo fotógrafo."

e a casa respondeu:

> "Entendi, Rafael — e tudo bem. **Anotei isso do seu jeito e vou seguir sem esse
> dado por enquanto**; a equipe confirma com você depois."

`social.hasPhotos: true` estava no patch **daquele mesmo turno**. É o "remédio
virou a doença" da 6ª volta voltando por uma porta que eu abri.

**A causa é ordem, não régua.** `perguntaDaVez` é calculada da fala ORIGINAL do
modelo. A trava nova trocava a fala inteira pela próxima pergunta em aberto — e o
contador de insistência, logo abaixo, continuava agindo sobre a pergunta da fala
**que já não existia mais**, sobrescrevendo a substituição com o fecho.

Consertado (PR #349), provado por mutação com a frase exata da produção, e
**medido no ar na 2ª passada**: o mesmo turno, com a mesma fala do cliente,
devolveu a próxima pergunta em aberto e nenhum fecho.

### 3.2 🔴 O "ele" na cara do cliente era NOSSO, não do modelo

Na 2ª passada, com o conserto acima já no ar:

> "Deixa eu tentar de outro jeito: você consegue me dizer se **ele** já tem
> fotos, vídeos ou logo prontos?"

A frase que a 8ª volta mediu, palavra por palavra — e **não é do modelo**.
`segundaFormulacao` costurava a fala com `O_QUE_A_PERGUNTA_DE_IA_COLHE`, que é
escrito para a **lacuna**: um texto da casa para a casa, sobre um terceiro, onde
a terceira pessoa está certa.

**Uma tabela, duas plateias, e uma delas recebendo a voz errada.** É a irmã do
defeito que esta casa mais repete ("verdade escrita em dois lugares"), com o
sinal trocado: **um texto só usado em duas vozes**.

Minha trava anterior não pegou porque ela roda sobre a fala do MODELO, e esta
fala é a que a CASA escreve depois. Consertado (PR #350): duas colunas, uma
fonte.

⚠️ **RESSALVA, e ela importa.** A 3ª passada (commit `6ada12e`, com o conserto
no ar) saiu limpa — **mas o modelo não repetiu pergunta nenhuma naquela passada**,
então o caminho da reformulação **não foi exercitado**. Verde por ausência não é
verde: o que está provado é o teste (que exige segunda pessoa em TODAS as
reformulações e que as duas colunas cubram as mesmas perguntas), não o ar.
Declarado como dívida.

### 3.3 ✅ O olho novo achou dois clientes parados há DEZ DIAS

A perna `proposta-parada` não achou só a parada de teste. Ela achou, em
produção, duas solicitações reais paradas:

```
Diego (cmsv416m8…): proposal_pending há 14.388 min COM número calculado
  — 1 mensagem(ns) ao cliente, porta de aceite AUSENTE.
  Dono: Atendimento. Próxima ação: ENTREGAR a proposta de Diego:
  não existe porta de aceite. Sem isso ele não tem como responder nem que queira.
Diego (cmsvsqwf8…): proposal_pending há 14.332 min — idem.
```

**14.388 minutos são dez dias.** Duas propostas escritas, com número, e sem porta
de aceite — o cliente não tinha botão para responder nem que quisesse. Ninguém
sabia: não havia consulta que fizesse essa pergunta. É exatamente o que a perna
foi construída para achar, e ela achou na primeira batida.

⚠️ **Dono: o Atendimento.** Não resolvi aqui — a perna OLHA e não age, de
propósito (ver o cabeçalho de `proposta-parada.ts`).

---

## 4. Empurrões

| empurrão | classe |
|---|---|
| nenhum | — |

**Zero empurrões por defeito da casa nas três passadas.** A 8ª teve um
(`action:"send-proposal"`); esta não precisou de nenhum, porque a jornada parou
antes da produção — e parou por **bloqueio do CEO** (conta zerada), não por
defeito.

⚠️ **E zero paradas lidas não seria verde, seria vazio.** Não é o caso aqui: as
paradas foram lidas, são 137 linhas no Pulso, e duas delas são as de §3.3.

---

## 5. Custo

| passada | chamadas de IA | provedor |
|---|---|---|
| 1ª (6 turnos de SDR) | 6 | Gemini (fallback — Claude e OpenAI sem saldo) |
| 2ª (6 turnos de SDR) | 6 | idem |
| 3ª (6 turnos de SDR) | 6 | idem |

**US$ 0,00 nas contas bloqueadas** (elas recusam antes de cobrar). O custo real
da volta foi de 18 chamadas ao Gemini, dentro da reserva — a casa registra o
gasto por chamada no `AIRunLog` e o Pulso não acusou nenhuma cobrança nova nas
contas zeradas. Nenhuma imagem foi gerada, então **zero custo de arte**.

---

## 6. O que continua não medido, e o que depende só do CEO

**Depende só do CEO:**

* **crédito de OpenAI e Anthropic.** Enquanto zerado, nenhuma imagem sai. O
  alarme agora dispara e diz o motivo com todas as letras (`SEM SALDO na conta do
  provedor — só uma pessoa resolve`), o que é o conserto de 24/08 finalmente
  funcionando;
* **a tabela de preços.** Três preços que a esteira COTA não existem em
  `/planos`. A casa grita sozinha, com dono e próxima ação, 85 vezes no Pulso.
  **Não mexi** — a escolha é dele.

**Não medido no ar (dívida minha, declarada):**

* os dois consertos do **portal** (a barra que regredia e o `proposal_pending`):
  provados por teste e por leitura do código, não por uma tela de cliente em
  produção. A jornada não chegou até lá porque não há como produzir peça hoje;
* o conserto do **título** ("PRECISO CONFIRMAR: nome do negócio") e o do
  **Gerente Geral**: os dois dependem de um projeto NASCER, que depende de aceite
  e de produção;
* o **ajuste completando** sobre a peça apontada — a dívida que a 8ª volta já
  havia declarado, e que continua de pé pelo mesmo motivo;
* a fala em **segunda pessoa** (PR #350) — no ar, mas o caminho da reformulação
  não foi exercitado na passada que a mediu (ver a ressalva em §3.2);
* **o SDR não reconhece a retratação em voz alta.** Nas três passadas, ao ouvir
  *"esquece o WhatsApp, prefiro e-mail"*, o dado foi corretamente apagado das três
  memórias — e a FALA seguinte não disse uma palavra sobre isso, foi direto para a
  próxima pergunta. O dano está fechado; a cortesia não. É defeito de conversa,
  não de dado, e fica declarado em vez de silencioso.
