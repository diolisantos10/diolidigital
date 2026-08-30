# A carta — preço por serviço, 30/08/2026

> Despacho: `.despachos/D1-tabela-unitaria.md`. Ordem do CEO: *"Cadê a tabela de
> preços dos serviços que a gente presta? [...] o que o cliente pedir tem que
> ter preço. Quem manda é o cliente."*
>
> **Este documento não decide preço nenhum — decide o CEO.** Todo número abaixo
> tem procedência: arquivo e linha, ou a conta que o produziu.

## ⚠️ Como este documento foi feito — leia antes dos números

Esta sessão **não conseguiu executar nenhum comando** (`node`, `npx tsx`, `npm
test`) — o ambiente recusa com *"This command requires approval"*, inclusive
com a flag de bypass. **Nada abaixo saiu de rodar `CATALOGO_VENDAVEL` ou os
testes; tudo foi derivado LENDO a régua linha por linha** (`capacidade-de-
producao.ts`, `self-serve-catalog.ts`) e conferido à mão contra o que os
testes afirmam (`__tests__/financeiro/tabela-de-precos.test.ts`,
`__tests__/comercial/*`). **Antes de imprimir a carta, rode:**

```
npx vitest __tests__/comercial/so-vende-o-que-produz.test.ts __tests__/financeiro/tabela-de-precos.test.ts __tests__/comercial/a-tabela-e-uma-so.test.ts
```

---

## 🔴 ACHADO 1 — já existe um Departamento Financeiro nesta casa, e ele não é o da Control Room

O despacho pedia para eu declarar que o Financeiro **não existe** neste
repositório, citando as branches `financeiro/celulas-e-sala-v1` e
`arquitetura/departamento-financeiro-control-room-v1` (essas, de fato, não
existem aqui — conferido). **Mas existe outra coisa, já mesclada, já testada,
com ordem própria do CEO:** `lib/agency/financeiro/tabela-de-precos.ts`, datado
de **27/08/2026** — três dias antes deste despacho.

É exatamente o que a ordem original pedia: *"tabela de preço com todos os
serviços [...] preço de custo, preço final, margem de desconto — até onde eu
posso dar de desconto [...] o SDR não pode oferecer abaixo do piso."* O módulo:

- Lê os 3 planos de `planos.ts` — **não os redigita** (`tabela-de-precos.ts:191-203`).
- Mede o único custo que a casa mede (IA, ~US$0,17/peça) e declara os outros
  cinco como `nao_medido`, cada um com motivo e dono (`tabela-de-precos.ts:115-150`).
- Trava o piso de desconto em **0%** enquanto o custo tiver buraco — *"margem
  calculada sobre custo incompleto é pior que margem nenhuma"* (`tabela-de-
  precos.ts:225-260`).
- Fixa o chão de lucro em **10% do preço** (não 10% em cima do custo — a leitura
  que protege, `tabela-de-precos.ts:268-297`).
- **Está em produção**: `lib/agency/comercial/negociacao-da-proposta.ts` (a
  negociação da página de orçamento, ordem do CEO de 27/08) e
  `lib/agency/comercial/negociacao.ts` (o piso dos 3 planos) já leem daqui.

**Isto muda a resposta da lacuna declarada no despacho:** não falta Financeiro
— falta **achar** o que já foi construído antes de escrever "não existe" de
novo. Recomendo: da próxima vez que alguém for declarar `SEM_FINANCEIRO`,
grep primeiro em `lib/agency/financeiro/`.

## 🔴 ACHADO 2 — duas verdades vivas para "a peça além do contratado"

E é aqui que o achado 1 vira problema de preço, não só de organização.

| Fonte | O que é | Valor | Onde |
|---|---|---|---|
| `planos.ts` | **Peça extra** — "a peça além do contratado", mostrada **na página pública** `/planos` | **R$ 90** | `planos.ts:64` (`PECA_EXTRA`), exibida em `app/planos/page.tsx:203-205` |
| `financeiro/tabela-de-precos.ts` | **Post avulso** / **Carrossel avulso** — "avulso para quem já é cliente: com direção de arte e 2 rodadas" | **R$ 190** / **R$ 290** | `tabela-de-precos.ts:211-212` (`avulso_post`, `avulso_carrossel`) |

São descrições que apontam para a **mesma situação de negócio** — cliente de
plano pedindo uma peça a mais — com preços **2,1× a 3,2× diferentes**. Hoje o
risco é **latente, não ativo**: `avulso_post`/`avulso_carrossel` estão
declarados na tabela financeira mas **nenhuma rota ou componente os chama** por
esse nome (conferido: só aparecem no próprio arquivo e no teste dele). O R$ 90
é o único que um cliente vê hoje, porque é o único ligado a uma tela pública.

**Mas o R$ 190/290 não é lixo nem erro de digitação** — o comentário de quem
escreveu (`tabela-de-precos.ts:174-178`) diz que eles vieram da seção "Preço
por serviço" de `docs/precos.md` (05/08/2026), a MESMA tabela que existia
**antes** de `PECA_EXTRA` consolidar tudo num número só (26/08/2026,
`planos.ts:66-133`). Isto é: **o número velho nunca foi apagado, só ficou
esperando dentro de um arquivo mais novo.** No dia em que alguém construir uma
tela que itera `TABELA_DE_PRECOS` inteira (um catálogo interno, por exemplo),
ela vai mostrar R$ 190 para o mesmo item que a vitrine pública vende a R$ 90 —
sem ninguém decidir isso.

**Isto é a pergunta central do documento, com um número a mais do que o
despacho original sabia.** Ver "O que decide o CEO", item 1.

## Achado 3 (menor, sem risco ativo) — um piso órfão

`self-serve-catalog.ts:194-197` guarda `precoMinimo: Math.round(RITMO.preco *
0.78)` = **R$ 226** para o item "Pacote mês" do balcão — o Ritmo vendido pelo
balcão. Esse campo é o resíduo do desconto de 22% que o CEO **revogou** em
27/08/2026 (*"desconto que a casa não autorizou não existe"*,
`negociacao.ts:303-317`) — e a negociação real do plano Ritmo já foi corrigida
para usar o piso certo (R$ 290, zero desconto — `negociacao.ts:318-323`).
Conferido: `PISO_BALCAO`/`dentroDoPiso` (que leriam esse 226) não são chamados
em lugar nenhum do app. **Não quota errado hoje, mas mente se alguém ler o
código sem saber disso.** Não é bloqueante; listo para o PM decidir se limpa.

---

## 1. A carta — o que a casa vende hoje, com preço e procedência

### 1.1 — Os quatro planos (mensalidade, fonte: `planos.ts`)

*Não altero preço de plano nenhum — só derivo o preço por peça, que não
existia escrito em lugar nenhum.*

| Plano | Preço/mês | Peças/mês | Preço por peça (preço ÷ peças) | Fonte |
|---|---:|---:|---:|---|
| Pulso | R$ 49 | 0 (não entrega peça) | — | `planos.ts:138,152` |
| Ritmo | R$ 290 | 12 | **R$ 24,17** | `planos.ts:159,183` |
| Presença | R$ 490 | 20 | **R$ 24,50** | `planos.ts:189,216` |
| Conteúdo | R$ 790 | 36 (`CAPACIDADE_MENSAL`) | **R$ 21,94** | `planos.ts:224,248,57` |

**Peça extra (além do contratado, em qualquer plano): R$ 90** — `planos.ts:64`,
mostrada ao cliente em `app/planos/page.tsx:203-205`. ⚠️ Ver Achado 2: existe um
segundo número (R$ 190/290) para o mesmo conceito, ainda não ativo.

### 1.2 — Balcão (público, 100% máquina, pago antes de produzir, sem revisão)

Fonte: `self-serve-catalog.ts`, filtrado pela régua de capacidade
(`capacidade-de-producao.ts`) — só entra o que tem **caminho de produção real
no código**, conferido item a item abaixo (não executei `CATALOGO_VENDAVEL`;
segui a régua na mão, ver aviso no topo).

| Item | Preço | Piso de negociação | Entrega | Vendável? | Por quê |
|---|---:|---:|---|:---:|---|
| Post para feed | R$ 79 | R$ 49 | 2d úteis | ✅ | usa `arte-estatica-jpeg` + `texto-de-marca`, as duas com ponto de produção (`capacidade-de-producao.ts:84-99`) — `self-serve-catalog.ts:71-85` |
| Carrossel até 5 telas | R$ 129 | R$ 79 | 2d úteis | ✅ | idem — `self-serve-catalog.ts:87-102` |
| 1 story | R$ 35 | R$ 25 | 1d útil | ✅ | idem — `self-serve-catalog.ts:109-123` |
| 4 stories | R$ 99 | R$ 59 | 2d úteis | ✅ | idem — `self-serve-catalog.ts:125-139` |
| Legenda / copy avulsa | R$ 39 | R$ 29 | 1d útil | ✅ | só `texto-de-marca` — `self-serve-catalog.ts:141-155` |
| Pacote mês (= plano Ritmo, vendido no balcão) | R$ 290 | — (ver Achado 3) | mensal | ✅ | `self-serve-catalog.ts:184-202`, deriva de `RITMO` |
| Setup Meta Ads | R$ 380 | — | 3d úteis | ✅ | `campanha-de-trafego-meta` tem ponto (`lib/integrations/meta/ads.ts:criarCampanhaPausada`) — `self-serve-catalog.ts:297-306` |
| Auditoria de perfil | R$ 149 | R$ 99 | 3d úteis | ⛔ **NÃO** | exige `relatorio-de-auditoria-de-perfil`, `ponto: null` — "a esteira produz PEÇA; não há produtor de relatório de diagnóstico em lugar nenhum" (`capacidade-de-producao.ts:166-174`) |
| Banner Digital | R$ 120 | — | 1d útil | ⛔ **NÃO** | promete PDF (`arquivo-pdf`, `ponto: null`) — "não existe gerador de PDF no repositório" (`capacidade-de-producao.ts:157-165`) |
| Identidade Básica | R$ 480 | — | 5d úteis | ⛔ **NÃO** | exige `logotipo-de-cliente`, `ponto: null` — "a casa só deriva um monograma das iniciais" (`capacidade-de-producao.ts:145-156`) |
| 1 Reel | R$ 350 | — | 4d úteis | ⛔ **NÃO** | exige `legenda-animada-em-video`, `ponto: null` — "a edição corta o material do cliente e tira uma capa; não escreve nem anima texto" (`capacidade-de-producao.ts:136-144`) |
| Pack 2 Reels | R$ 620 | — | 6d úteis | ⛔ **NÃO** | mesma falta acima |

**Sobreposição já registrada no código, decisão pendente do CEO** (não deste
despacho): `pack-4-stories` (R$ 150) e `pack-8-stories` (R$ 270),
`pack-4-posts` (R$ 220) e `pack-8-posts` (R$ 400) — categoria "social", legado
— **passam** na régua de capacidade (mesmas duas capacidades do balcão) e por
isso continuam tecnicamente vendáveis, entregando quase a mesma coisa que
`balcao-4-stories` (R$ 99) por preço diferente. O próprio código já sinaliza
isto como pendência (`self-serve-catalog.ts:204-208`) — eu **não** decido qual
fica; só confirmo que a pendência é real e ainda está aberta.

### 1.3 — Avulso para quem já é cliente de plano (fonte: `financeiro/tabela-de-precos.ts`)

⚠️ **Ver Achado 2 antes de usar esta tabela** — estes dois valores conflitam
com o R$ 90 (peça extra) que a página pública mostra hoje.

| Item | Preço | Produção | Fonte |
|---|---:|---|---|
| Post avulso | R$ 190 | máquina + direção de arte, 2 rodadas | `tabela-de-precos.ts:211` |
| Carrossel avulso | R$ 290 | máquina + direção de arte, 2 rodadas | `tabela-de-precos.ts:212` |

### 1.4 — O que fica fora de todo plano (decisão do CEO, não deste documento)

Vídeo (gravação, edição, geração), posicionamento/identidade de marca, site e
página de captura, verba de mídia — `planos.ts:270-290` (`FORA_DE_TODO_PLANO`).
Tráfego pago (gestão mensal) e identidade visual/rebranding aparecem em
`service-catalog.ts:47-85` com **faixas** (R$ 500–1.200, R$ 1.200–2.500,
R$ 2.000–4.000), mas **não são cotados com número fixo em proposta nenhuma**:
`live-calculator.ts:396-440` sempre escreve *"orçado à parte"* para os dois,
sem número — confirmado, `ORCADO_A_PARTE` não carrega preço. Além disso,
identidade visual não tem capacidade de produção real (Achado da tabela 1.2,
`logotipo-de-cliente`), então mesmo que alguém cotasse um número, a casa não
teria como entregar hoje.

---

## 2. A conta dos combos — cada plano como soma dos itens menos desconto

**A régua usada:** o único preço unitário que a casa já declara para "uma peça
avulsa dentro do mesmo motor de produção do plano" é a **peça extra, R$ 90**
(`planos.ts:64`) — não os R$ 190/290 do Achado 2, que descrevem um produto com
direção de arte humana, possivelmente diferente do que sai dentro do plano.
Uso R$ 90 porque é o número que a própria casa já publica para este cálculo; se
o CEO decidir no Achado 2 que o número certo é outro, esta tabela recalcula.

| Plano | Peças × R$ 90 | Preço cobrado | Desconto em R$ | Desconto em % |
|---|---:|---:|---:|---:|
| Ritmo | 12 × 90 = R$ 1.080 | R$ 290 | R$ 790 | **73,1%** |
| Presença | 20 × 90 = R$ 1.800 | R$ 490 | R$ 1.310 | **72,8%** |
| Conteúdo | 36 × 90 = R$ 3.240 | R$ 790 | R$ 2.450 | **75,6%** |

⚠️ **Esta conta é incompleta, e é honesto dizer onde:** Presença e Conteúdo
incluem itens que **não têm preço avulso nenhum na carta** — publicação no
Instagram/Facebook, gestão de avaliações, atendimento humano por WhatsApp,
sequências de stories, pesquisa de concorrência, plano de medição, reunião
mensal (`planos.ts:193-199,228-235`). O desconto real desses dois planos é
**maior** que a tabela acima mostra, porque o numerador (o que se somaria)
está subestimado — falta o preço desses itens, e ele não existe hoje em lugar
nenhum da casa.

**Se em vez disso alguém usar os R$ 190/290 do Achado 2** (a leitura que
`financeiro/tabela-de-precos.ts` sustenta), o desconto do Conteúdo passa de
75,6% para **~89%** (36 × uma média ponderada de 190/290 ≈ R$ 8.500 contra
R$ 790). É a mesma pergunta do Achado 2 aparecendo de novo, agora como
diferença de 14 pontos percentuais de "desconto do combo" — outra razão para
resolver os dois números como um só antes de este documento virar carta oficial.

---

## 3. A pergunta central: R$ 90 (avulso) vs ~R$ 22–24 (dentro do plano) — e o caso real

**A régua do plano** entrega a peça a R$ 22–24. **A régua do avulso** cobra
R$ 90 — quase 4×. Quem manda é o cliente (ordem do CEO), então as duas réguas
precisam existir; a pergunta é **qual usar quando o pedido não bate limpo com
nenhum plano**.

### O caso real: 28–30 posts/mês + 3 carrosséis/semana

Usando a convenção que a própria casa já usa para converter semana↔mês
(`live-calculator.ts:128`, 4 semanas/mês): 3 carrosséis/semana × 4 = **12
carrosséis/mês**. Post e carrossel são **peças diferentes** dentro do mesmo
teto (`planos.ts` conta os dois como "peça"), então:

**Total pedido: 28–30 (posts) + 12 (carrosséis) = 40–42 peças/mês.**

🔴 **Isto passa do teto de produção da casa por cliente: 36 peças/mês**
(`planos.ts:53-57`, `CAPACIDADE_MENSAL`; confirmado em
`financeiro/tabela-de-precos.ts:64`, `TETO_DE_PECAS_POR_MES`, com teste que
trava o número — `__tests__/financeiro/tabela-de-precos.test.ts:218-230`). O
plano mais alto (Conteúdo, 36) **não cobre** o pedido como está descrito. Isto
é uma decisão de **capacidade**, separada da de preço — ver item 3 de "o que
decide o CEO".

A boa notícia: a própria casa já escreveu o caminho para isto.
`contrato-de-quantidade.ts:134-144` recusa pedido acima do teto **com a
instrução gêmea**: *"se X for essencial pra você, a gente conversa sobre uma
segunda frente antes de fechar"* — ou seja, o código já prevê que um cliente
grande vira **dois contratos**, não um contrato estourado.

**Quatro contas para o mesmo pedido, dependendo de qual régua e qual caminho:**

| Caminho | Conta | Total/mês |
|---|---|---:|
| A. Conteúdo (36) + excedente (4–6 peças) na peça extra (R$ 90) | 790 + 4×90 a 790 + 6×90 | **R$ 1.150 – R$ 1.330** |
| B. Tudo avulso, peça extra (R$ 90) | 40×90 a 42×90 | **R$ 3.600 – R$ 3.780** |
| C. Tudo avulso, R$ 190 post / R$ 290 carrossel (Achado 2) | (28–30)×190 + 12×290 | **R$ 8.800 – R$ 9.180** |
| D. "Segunda frente": Conteúdo (36) + Ritmo (12) em contrato à parte | 790 + 290 | **R$ 1.080** (mas entrega 48, acima do pedido) |

**A distância entre R$ 1.080 (caminho D) e R$ 9.180 (caminho C) é 8,5×, para o
mesmo pedido de cliente.** Isto não é uma tabela pronta para imprimir — é a
prova de que o Achado 2 precisa fechar antes desta proposta sair.

---

## 4. O que decide o CEO

1. **Achado 2 — qual é o preço da peça além do plano: R$ 90 ou R$ 190/290?**
   Hoje os dois existem no código, para o mesmo conceito. **Recomendação:**
   manter R$ 90 como fonte única (é o que já está na página pública e no que o
   cliente já pode ter lido) e apagar `avulso_post`/`avulso_carrossel` de
   `financeiro/tabela-de-precos.ts` — ou, se a intenção era mesmo cobrar mais
   caro por direção de arte humana, declarar isso por escrito e criar um
   segundo campo explícito (`pecaExtraComDirecaoDeArte`), não um chave paralela
   que ninguém liga a nada ainda.

2. **O caso dos 28–30 posts + 3 carrosséis/semana — qual dos quatro caminhos
   da seção 3?** Recomendação: **caminho D** (segunda frente, Conteúdo + Ritmo,
   R$ 1.080/mês, 48 peças) — é o único que respeita o teto de 36/contrato sem
   inventar preço, e sobra 6–8 peças de folga em vez de faltar. Se o parceiro
   quer exatamente 40–42 e não 48, a alternativa é caminho A (R$ 1.150–1.330).

3. **O teto de 36 peças/cliente/mês — vale para este parceiro, ou ele é
   especial?** Se a casa tem produção sobrando (não medido nesta sessão — ver
   §5), dá para autorizar uma exceção pontual de teto para um cliente só.
   Quem decide isso é o CEO ou o dono do projeto, nunca a esteira sozinha.

4. **Os itens da carta sem quem produza** (Auditoria de perfil, Banner
   Digital, Identidade Básica, 1 Reel, Pack 2 Reels — seção 1.2) — hoje o
   próprio código já os bloqueia na vitrine. Recomendação: manter bloqueados,
   não reativar preço sem antes existir o produtor.

5. **A sobreposição pack-4/8-stories vs balcao-4-stories** (mesmo produto,
   dois preços, seção 1.2) — pendência já aberta no código desde 26/08/2026,
   ainda sem veredito. Não é deste despacho resolver; só registro que segue
   aberta.

6. **Achado 3 (o piso órfão de R$ 226)** — sem risco ativo hoje. Recomendação:
   PM agenda a limpeza quando mexer em `self-serve-catalog.ts` de novo; não é
   urgente.

---

## 5. O que eu não consegui apurar

- **Nenhum comando foi executado nesta sessão** (ver aviso no topo). Os
  vereditos de "vendável/não vendável" da seção 1.2 foram feitos lendo a régua
  à mão — recomendo rodar os testes citados antes de imprimir a carta oficial.
- **Custo real de cada serviço, fora IA.** `financeiro/tabela-de-precos.ts`
  declara cinco parcelas como `nao_medido` (taxa de gateway, infraestrutura,
  domínio/e-mail, hora humana, impostos), cada uma com dono (`CEO` na maioria)
  — sem isso, **nenhum piso abaixo do preço de tabela pode ser autorizado**,
  por construção.
- **Se a casa tem produção sobrando** para atender uma exceção de teto
  (decisão 3 acima) — não medido nesta sessão.
- **Se "nós publicamos" (Presença/Conteúdo) está realmente entregável hoje.**
  Fora do escopo de preço, mas relevante: por conhecimento de domínio desta
  esteira, a publicação em nome do cliente depende do App Review da Meta, e o
  registro mais recente em `docs/pendencias.md` (linha ~3321) ainda o mostra
  pendente. Isto não muda o preço do plano — muda se a promessa "nós
  publicamos" é cumprível agora. Não investiguei a fundo porque é assunto do
  especialista `meta`, não desta tabela.
- **As "cinco propostas de concorrentes da mesma praça, datadas"** que
  `docs/precos.md` (linha 190-194) já registrava como pendente — segue
  pendente; não é escopo deste despacho.
