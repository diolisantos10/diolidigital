# A aprovação parada — capturas de 16/08/2026

Tela: `/agency/approvals` (Centro de Aprovações), autenticada, em **375 / 768 /
1440**, nos **quatro** estados que importam — cheio, vazio, erro e **carregando**.

## 🔴 SEGUNDA LEVA. A primeira mostrava um número errado, e o número era o ponto.

A faixa imprimia `resumo.paradas` sob o rótulo **"esperando a decisão dele"** — e
`paradas` é o TOTAL, que **inclui** `bolaConosco`. Nas capturas antigas isso
aparecia com todas as letras: *"2 ele perguntou e não respondemos"* logo ao lado
de *"3 esperando a decisão dele — a mais antiga há 6 dias"*, quando só **1**
esperava o cliente e os 6 dias eram de um card cujo relógio o schema declara
**pausado**.

É o alarme que o cabeçalho do próprio componente jura impedir: **um que cobra o
cliente pelo atraso da própria casa.** A separação estava feita na prosa e não
estava feita no número.

O conserto mora no servidor (`esperandoOCliente`, `maisAntigoDeleEmDias`,
`maisAntigoNossoEmDias`): tela que faz conta é a segunda cópia da regra.

## 🔴 E OS IDS DO FIXTURE NÃO TINHAM A FORMA QUE A PRODUÇÃO GRAVA

A faixa mostra os **últimos 6 caracteres** do id do card como localizador — é o
que distingue duas linhas "Social Media", que antes eram indistinguíveis. Com
ids legíveis (`fx_ap_duvida2`) a captura saía com `#uvida2` e `#_velho`: pedaços
de palavra que não existem em produção nenhuma, onde o id é um cuid.

Mesma lição do fixture da porta da frente, no mesmo dia: **fixture que produz o
que a produção não produz valida o desenho e esconde o produto.**

## 🔴 COMO CADA ESTADO FOI PRODUZIDO

| Estado | Como foi produzido | O que prova, e o que NÃO prova |
|---|---|---|
| **cheio** | banco SQLite local, semeado por `scripts/fixture-aprovacao-parada.mjs`, lido pela rota de verdade | ✅ **ponta a ponta**: banco → `lerAsAprovacoesParadas` → rota → tela |
| **vazio** | 200 com fila vazia, **injetado por interceptação HTTP** | ✅ a tela desenha o vazio · ❌ **não** prova que a fila zero chega até ela |
| **erro** | 503 na faixa **e** nas três rotas das filas vizinhas, por interceptação | ✅ a tela desenha a falha, e agora **denuncia as quatro filas mudas** · ❌ não prova o caminho da falha |
| **carregando** | a rota é **suspensa** e nunca responde | ✅ o esqueleto existe e é anunciado (`role="status"`) |

> Quem prova o que a interceptação não prova são os testes:
> `__tests__/esteira/aprovacoes-paradas-rota.test.ts` derruba o banco de verdade
> e exige **503 · `medido: false`**, e
> `__tests__/esteira/aprovacao-parada-no-relogio.test.ts` exige que a mesma
> falha entre no log da rodada pelo nome da perna.

## O que cada arquivo prova

| Arquivo | O que prova |
|---|---|
| `aprovacao-cheio-{mobile,tablet,desktop}.png` | **Os dois baldes separados e a conta declarada:** "2 são dívida nossa e 3 esperam o cliente: 5 cards parados ao todo". Departamento em **português**, código do card como localizador, prazo estourado à parte |
| `aprovacao-vazio-{…}.png` | **Vazio é boa notícia**, e a faixa diz isso em vez de sumir |
| `aprovacao-erro-{…}.png` | **Dois avisos, não um.** O da faixa (`role="alert"`) e o novo, que nomeia **as três filas vizinhas que não vieram do banco** — antes elas imprimiam "Nenhuma…" em silêncio, ao lado de um erro honesto |
| `aprovacao-carregando-{…}.png` | **O esqueleto anuncia que está carregando** (§7.1) |

## Como reproduzir

```sh
npx prisma db push
SEED_MASTER_PASSWORD=<sua senha local> node scripts/seed-db.mjs
node scripts/fixture-aprovacao-parada.mjs   # recusa rodar fora de SQLite local
npm run dev
```

O roteiro de captura autenticada é descartável e mora no scratchpad da rodada.
Ele loga **uma vez** e reusa a sessão nos três tamanhos (o teto de tentativas de
`/api/auth/signin` é real), e marca `role_guide_seen_master` no `localStorage`,
porque o guia de papel abre um modal em cima da tela na primeira visita.

**Nenhum dado de produção foi tocado, lido ou copiado.**

## 🔴 A DECISÃO QUE NÃO É MINHA: a faixa não diz de QUE CLIENTE é a peça

Duas linhas "Social Media" eram indistinguíveis, e ninguém conseguia ir
responder. O localizador (`#uvid24`) resolve *"qual card"*; **não** resolve
*"cobrar quem"*.

**O fato que a decisão precisa:** as quatro filas vizinhas desta MESMA tela já
imprimem nome de cliente e de projeto para a MESMA audiência (`/agency/approvals`
é `todos_internos` no inventário). Mostrar o cliente aqui, portanto, **não abre
uma classe de exposição nova** — mas é decisão de quem manda, não de quem
executa, e está com o CEO.
