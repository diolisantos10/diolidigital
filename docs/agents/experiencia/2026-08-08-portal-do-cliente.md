# Auditoria de percurso — portal do cliente e painel da agência

> **Quem escreveu:** Essencial `experiencia` · 08/08/2026
> **Branch:** `claude/dioli-agency-os-architecture-kk7kp`
> **Método:** leitura de percurso, não de arquivo. Somente leitura — nada foi
> alterado fora desta sala.
> **Fronteira:** nada aqui é sobre estética. Cor, espaçamento e tipografia são do
> `interface`, que entra **depois** de as decisões da seção C serem tomadas.

---

## A · O VEREDITO EM TRÊS LINHAS

1. **O portal do cliente está bem melhor do que a fama dele.** As correções de
   07 e 08/08 pegaram os defeitos caros — card vazio não pede assinatura, pacote
   sem conteúdo não pede "aprovar tudo", ausência não vira erro. O que sobrou
   **não é feiura: é repetição.** A mesma pendência é anunciada em até quatro
   lugares, e o cliente não sabe se são quatro coisas ou uma.

2. **O defeito estrutural que ficou é o interruptor de dois lados, e ele está em
   três pontos do portal** — material enviado, contas autorizadas na Meta, e
   "quantas coisas dependem de você". Em todos, a tela mostra a metade que ela
   controla e cala sobre a metade que decide se aquilo funcionou.

3. **O problema grave não é o portal — é o painel da agência.** A tela inicial da
   equipe (`/agency/dashboard`) e o quadro de andamento (`/agency/pipeline`) leem
   o **localStorage do navegador**, não o banco. Arrastar um projeto de etapa ali
   não muda nada no servidor. O cliente e a equipe **não olham o mesmo dado** — é
   literalmente "uma coisa não conversa com a outra", e é onde a imagem da
   agência corre risco de verdade.

---

## B · O PERCURSO, PASSO A PASSO

Percorrido na ordem em que uma pessoa percorre, a 375px, na cabeça de quem não é
de tecnologia.

### 1. Recebi o link e abri pela primeira vez, no celular

**Funciona mal.**

O que aparece, de cima para baixo: logo Dioli · "Portal do Cliente" · o nome do
meu negócio · um chip com uma palavra de etapa · "N coisas dependem de você"
(`app/portal/access/[token]/page.tsx:828-858`). A barra de 5 abas cabe inteira a
375px — a redução de 7 para 5 **resolveu de verdade**, não escondeu: os dois
assuntos que saíram (Resultados, Integrações) continuam existindo como bloco e
como seção rotulada, e o endereço antigo não virou beco
(`page.tsx:159-172`, `1112-1120`, `1458-1463`).

**O que não existe:** uma única linha que diga o que este lugar é.
Não há saudação, não há primeira visita, não há "aqui você acompanha, aprova e
manda material" (`grep` por "bem-vindo"/"primeira vez" em `app/portal` e
`components/portal`: zero ocorrências). Quem chega sabe **que** há 3 coisas
dependendo dele antes de saber **onde está**.

**E a primeira frase que ele lê pode estar errada.** O chip de etapa
(`currentStatus`, `page.tsx:795-798`) sai de `STATUS_LABEL` — um quarto mapa de
etapa, independente da esteira. Para o cliente criado direto ele só é corrigido
se `/api/portal/projetos` responder; se essa chamada falhar, o chip diz
**"Recebido"** para um projeto em produção há três semanas.

### 2. Quero saber se meu trabalho está andando

**Funciona mal — a resposta existe, mas está no lugar errado e aparece duas vezes.**

A frase pronta que o cursograma exige ("Produção rodando — 2 de 4 entregas
prontas") **existe**: é o título + `agora` da `FaixaDaEsteira`
(`components/agency/FaixaDaEsteira.tsx:92-96`). Só que ela é o **bloco 2** do
Início, abaixo da lista de pendências — o topo da tela traz um chip de uma
palavra vindo de outra fonte. A leitura pronta chega depois do número, que é o
inverso do que o cursograma pede.

E o painel inteiro renderiza **duas vezes**: Início (`page.tsx:1035`) e Projetos
(`page.tsx:1183`), byte por byte igual, incluindo a lista de pendências e o botão
"Ver e decidir em Aprovações". Duas abas respondendo à mesma pergunta.

**A trilha e o percentual mentem quando o servidor não manda o campo.**
`progresso={estado.progresso ?? 0}` (`components/agency/portal/EsteiraDoCliente.tsx:272`)
imprime **"0% do caminho até a entrega"** quando a resposta certa é "não medido".
E `trilha={estado.trilha ?? []}` produz, no celular,
**"etapa 1 de 0"** (`FaixaDaEsteira.tsx:139-142`) — `indiceAtual+1` sobre uma
trilha vazia.

### 3. Preciso aprovar uma peça

**Funciona — é a melhor parte do portal — com um buraco de recuperação.**

Toques: Início → linha de pendência → card → **Aprovar**. Três toques, e o card
mostra a peça como ela vai ao ar, com legenda e data
(`components/portal/AprovacoesDoCliente.tsx:153-196`). As três saídas existem e
têm o mesmo peso; ajuste e dúvida exigem texto e a dúvida **pausa o prazo**
(`AprovacoesDoCliente.tsx:406-433`, `385-403`). Card sem corpo não recebe botão —
a correção de 07/08 pegou lista e detalhe (`299-300`, `369-383`).

**O que falta: desfazer.** "Aprovar" é o botão mais barato da tela — um toque,
sem confirmação, sem resumo do que está sendo aprovado quando o card é o do
pacote. E o que aparece depois é **"Registro imutável"**
(`AprovacoesDoCliente.tsx:500-505`), sem nomear nenhum caminho. As duas ações
**reversíveis** (ajuste, dúvida) custam dois passos e digitação; a
**irreversível** custa um toque. Isso está invertido.

**E a conta não fecha.** `totalAguardando` soma o card do pacote **mais** cada
entrega que ele contém (`AprovacoesDoCliente.tsx:815`). Com 2 entregas prontas a
tela escreve "Aguardando você (3)" para 2 coisas.

### 4. Me pediram material

**Funciona mal — este é o interruptor de dois lados mais caro do portal.**

Mandar é fácil e o pedido do papel na hora do envio é acerto real
(`components/portal/EnvioDeMaterial.tsx:176-246`). O problema é **depois**:

- A lista "Recebemos N arquivos" é **estado local** (`EnvioDeMaterial.tsx:67`).
  Recarregou a página, some. Não existe nenhuma lista do que já foi enviado antes
  — o cliente não tem como saber se mandou o logo semana passada.
- O servidor **sabe** se o envio destravou alguma coisa e devolve `aindaFaltam`
  (`app/api/media/route.ts:215`). A tela **ignora** e escreve, sempre, *"A equipe
  já foi avisada e pode usar este material nas suas peças"*
  (`EnvioDeMaterial.tsx:271-273`). No servidor esse mesmo envio pode ter caído em
  *"Material do cliente recebido e NÃO destravou nada… a produção continua parada
  até alguém decidir"* (`lib/agency/esteira/materiais.ts:336-338`).
- O aviso amarelo **"A produção está esperando: seu logo"** fica três dedos acima
  e **não recarrega**: em Arquivos o componente é montado sem o callback
  (`page.tsx:1351` — `<EnvioDeMaterial token={token} />`, sem `aoEnviar`). O
  cliente manda o logo, lê "recebemos", e continua lendo que a produção espera o
  logo.

**E existem duas portas para o mesmo trabalho.** "Enviar arquivos" é aba de topo;
o Google Drive (`DriveDoCliente`) mora escondido em **Sua conta → Integrações →
Seu material de marca** (`components/portal/ConexoesDoCliente.tsx:472-477`).
Nenhuma das duas menciona a outra. Com a tela de escolha de nuvem que está sendo
construída, serão três.

### 5. Está travado esperando alguma coisa

**Funciona para dizer *quem*; falha por excesso ao dizer *o quê*.**

Quem tem a bola é dito com todas as letras — "Sua vez" / "Com nosso time"
(`FaixaDaEsteira.tsx:87-89`) — e a distinção nova entre *conexão que você
resolve* e *conexão que a Dioli resolve* é excelente e honesta
(`page.tsx:753-761`, `1481-1495`).

O excesso: **um pedido de material aparece em quatro lugares na mesma sessão** —
linha do bloco 1 do Início (`page.tsx:984-993`), caixa "Esperando de você" dentro
da faixa do Início (`FaixaDaEsteira.tsx:109-120`), a mesma caixa outra vez em
Projetos, e a tarja amarela em Arquivos (`page.tsx:1340-1349`). Quatro
aparições, uma coisa. É exatamente assim que se ensina alguém a parar de ler a
lista.

E há **dois números com nomes parecidos e valores diferentes** na mesma tela: o
cabeçalho diz "N coisas dependem de você" (inclui material e conexões,
`page.tsx:786`) e o selo de Aprovações diz outro N (só decisões,
`page.tsx:790`). Estão certos por dentro; para quem lê, um deles está errado.

### 6. Quero falar com alguém

**Funciona — e promete uma coisa que ninguém mediu.**

O botão flutuante existe em todas as telas, a conversa carrega e faz polling a
cada 8s, o erro de envio explica o caso 409 em vez de repetir "tente de novo"
(`components/agency/portal/PortalChat.tsx:161-215`). Estado vazio nomeia o que
fazer. Isso está bom.

**O que mente:** o ponto verde. Ele é fixo no cabeçalho da conversa
(`components/agency/portal/FloatingChat.tsx:37`) e no botão flutuante
(`page.tsx:1560` e `1563`). Nada mede presença. Domingo 23h o cliente vê verde,
manda mensagem e espera resposta que não vem. Ponto verde é a convenção universal
de "tem gente aí agora" — é a única promessa do portal que o produto não pode
cumprir.

---

## C · O QUE FICA, O QUE SAI, O QUE SE FUNDE

Uma linha por decisão. Sem "por um lado / por outro" — isto é para o `interface`
executar.

### Portal do cliente

| Tela / bloco | Decisão | Motivo |
|---|---|---|
| Barra de 5 abas (Início · Projetos · Aprovações · Enviar arquivos · Sua conta) | **FICA como está** | Cabe a 375px, medido. A redução resolveu; não mexer. |
| Painel da esteira no **Início** | **FICA** — é a leitura principal | É a frase pronta que o cursograma exige. |
| Painel da esteira em **Projetos** | **SAI** (`page.tsx:1183`) | Duplicata byte-a-byte. Projetos passa a mostrar só cartões de projeto, pedidos e calendário. |
| Caixa "Esperando de você" dentro da faixa | **SAI** (`FaixaDaEsteira.tsx:109-120`, só no público `cliente`) | O bloco 1 do Início já é a lista de pendências, e é o lugar certo. Na tela da equipe a caixa **fica**. |
| Tarja "A produção está esperando" em Arquivos | **FICA** (`page.tsx:1340-1349`) | É o único lugar onde ela é acionável. É a 3ª cópia que morre, não esta. |
| Bloco "Seus números" no Início | **FICA** | Só renderiza com número real. Desenho correto. |
| Bloco 4 "Decisões registradas" no Início | **SAI** | Aprovações já tem "Decididas por você (N)", com mais contexto. Histórico não é assunto de tela inicial. |
| "Ver todos os seus pedidos em Projetos →" no Início | **SAI** (`page.tsx:1127-1135`) | Link de rodapé para uma aba que está a um toque na barra. |
| Tarja "N itens esperam sua decisão" em Projetos | **SAI** (`page.tsx:1152-1169`) | O selo da aba Aprovações já diz o mesmo, sempre visível. Terceiro anúncio da mesma decisão. |
| **Google Drive** (`DriveDoCliente`) | **MUDA DE CASA**: de *Sua conta → Integrações* para **Enviar arquivos** | Da cabeça do cliente, "de onde vem meu logo" e "para onde mando meu logo" são a mesma pergunta. Em Integrações ele fica invisível para quem foi mandar material. |
| Aba **Enviar arquivos** | **GANHA** uma lista persistente "O que você já mandou" | Sem ela o cliente não tem como saber se já enviou. É o buraco do passo 4. |
| Card do pacote em Aprovações | **FICA**, mas **para de somar** na contagem quando as entregas dele já estão listadas | "Aguardando você (3)" para 2 entregas ensina a desconfiar do número. |
| Botão **Aprovar** (entrega e pacote) | **GANHA** um passo de confirmação com o que está sendo aprovado, e um "aprovei sem querer → falar com seu PM" no card decidido | A ação irreversível é hoje a mais barata da tela. |
| Ponto verde de "online" (chat e botão flutuante) | **SAI** | Nada mede presença. Substituir por prazo de resposta declarado ("respondemos em até X horas úteis") ou por nada. |
| Seção "Em breve" (Google Ads / Analytics / TikTok) | **FICA** | Diz com todas as letras que não há nada a fazer. Promessa honesta. |
| Aba **Sua conta** (Seus dados + Integrações) | **FICA fundida** | A fusão está certa e os dois assuntos mantêm nome próprio. |

### Painel da agência

| Tela | Decisão | Motivo |
|---|---|---|
| `/agency/dashboard` e `/agency/pipeline` lendo do `agency-store` | **MUDAM DE FONTE** para o banco | Hoje leem `localStorage` (`store/agency-store.ts:1854`). É a raiz de "uma coisa não conversa com a outra". |
| `/agency/pipeline` (arrastar de etapa) | **SAI**, ou passa a gravar no servidor | `moveProjectStage` (`store/agency-store.ts:1215-1226`) não chama API nenhuma. Quadro que finge que moveu o projeto. |
| `/agency/escada` | **ENTRA no menu** | Existe para alguém ver o estado dos degraus e **não tem nenhum link** no produto inteiro. Tela de governança inalcançável é governança que não existe. |
| `/agency/brand-hub-agent`, `/agency/operations-agent` | **SAEM** | Zero referências no código. Consoles órfãos de departamento, com texto em inglês, que a esteira já faz sozinha. |
| Selo "DB / Local" em `/agency/deliverables` | **SAI junto com a causa** | O selo é a casa admitindo na tela que há duas verdades. Some quando houver uma. |

---

## D · OS CONTROLES QUE MENTEM

Um por linha: o que a pessoa acredita × o que acontece de fato.

| # | Onde | A pessoa acredita | O que acontece |
|---|---|---|---|
| 1 | `store/agency-store.ts:1215-1226` · `/agency/pipeline` | "Movi o projeto para Produção." | Mudou só o `localStorage` **deste navegador**. O servidor não soube. O colega ao lado vê o projeto onde estava. |
| 2 | `app/agency/dashboard/page.tsx:130` | "Esta é a fila da agência hoje." | É a fila derivada do `localStorage` deste navegador, priorizada por `p.stage` — o campo escrito à mão que a própria doutrina da casa (`lib/agency/esteira/fases.ts:12-17`) manda não usar. |
| 3 | `components/portal/EnvioDeMaterial.tsx:271-273` | "Mandei o logo; a equipe já pode usar." | Pode não ter casado com pedido nenhum. O servidor sabe (`materiais.ts:336-338`), devolve `aindaFaltam` (`api/media/route.ts:215`), e a tela descarta. |
| 4 | `page.tsx:1351` + `page.tsx:740` | "Mandei — o aviso vai sumir." | A lista de pendências não recarrega após o envio. A tarja continua pedindo o arquivo que acabou de chegar. |
| 5 | `components/agency/portal/EsteiraDoCliente.tsx:272` | "Meu projeto está em 0%." | O servidor não mandou o campo. A resposta certa era "não medido". Zero e não-sei viraram a mesma coisa. |
| 6 | `components/agency/FaixaDaEsteira.tsx:139-142` | "Etapa 1 de 0." | Trilha vazia. O rótulo é impossível e denuncia bug para quem lê. |
| 7 | `components/portal/ConexoesDoCliente.tsx:152-175` | "Pronto. A Dioli passa a acessar só o que marquei." | O `POST` e os `DELETE` não checam `res.ok`. Falhando os dois, a frase de sucesso aparece igual. |
| 8 | `components/portal/ConexoesDoCliente.tsx:147` | "Está conectado, então está funcionando." | Se `/api/portal/meta-ativos` falhar, o bloco "Falta autorizar quais contas" **não renderiza** (catch mudo). Conexão "Funcionando" com zero contas autorizadas = a Dioli não lê nada, e ninguém no portal diz isso. |
| 9 | `components/agency/portal/FloatingChat.tsx:37` · `page.tsx:1560,1563` | "Tem alguém online agora." | Ponto verde fixo. Nada mede presença. |
| 10 | `components/portal/AprovacoesDoCliente.tsx:815` | "Tenho 3 coisas para decidir." | Duas. O card do pacote é somado junto das entregas que ele contém. |
| 11 | `page.tsx:795-798` | "Meu projeto está em 'Recebido'." | Só porque `/api/portal/projetos` não respondeu. O trabalho pode estar em produção há semanas. |
| 12 | `components/portal/SolicitarAlgo.tsx:398-412` vs `AprovacoesDoCliente.tsx:722-726` | O mesmo orçamento devolvido com apontamentos | Em Projetos o selo cai em `statusLegivel` (ex.: "Em análise"); em Aprovações diz "Devolvido para revisão". Mesmo objeto, dois rótulos, duas telas. |
| 13 | `components/portal/ConexoesDoCliente.tsx:436-440` | (lendo o cartão de erro) | Recebe a **resposta crua da Meta em inglês, com código numérico**. Log vazado na tela de quem paga. |
| 14 | `components/portal/ConexoesDoCliente.tsx:337` | (lendo a lista de contas) | Recebe o `externalId` da Meta — um número de 17 dígitos que não significa nada para ele. |

### O teste de jargão: ele existe, e cobre menos de um décimo do que precisa

O cursograma promete: *"No portal, jargão interno é barrado por teste, não por
boa vontade de quem escreve a próxima frase."*

**O teste é `__tests__/esteira/fases.test.ts:137-150.**
Lista proibida: `entregável|deliverable|canvas|briefingJson|executionStatus|agentId|departamento|API|endpoint`.

**O que ele cobre:** as três strings que a função `lerFase` produz
(`paraCliente.titulo / agora / oQueEsperamosDeVoce`), em 3 dos 12 estados possíveis.

**O que ele não cobre — e tudo isto chega ao cliente:**

- **nenhum arquivo** de `app/portal/` ou `components/portal/`;
- `ap.department`, que vira **título e subtítulo** do card de aprovação. O mapa
  `CLIENT_SAFE_DEPARTMENTS` (`app/api/brain/portal-data/route.ts:31-42`) termina
  em `?? ap.department`: chave nova = palavra crua na tela. E mesmo o mapa entrega
  **"Analytics"** e **"Revisão de Qualidade"** — nomes do organograma da Dioli,
  não do que o cliente comprou;
- `etapaLegivel` em `/api/portal/projetos` (`route.ts:30-38`) — frases escritas à
  mão que o cliente lê, sem nenhum teste;
- `trilhaDoProjetoDireto` em `/api/portal/esteira` (`route.ts:51-87`) — idem;
- a resposta crua da Meta e o `externalId` (itens 13 e 14 acima);
- a etiqueta `v1`/`v2` em fonte monoespaçada (`AprovacoesDoCliente.tsx:259-266`).

**Conclusão:** a trava existe, protege uma função, e o resto do portal escreve
para o cliente sem nenhum barramento. Isso não é "boa vontade de quem escreve" —
é a boa vontade valendo para 95% das frases.

### A mesma verdade dos dois lados — o estado real

O cursograma exige que a tela da agência e o portal **chamem a mesma função**.

| Onde | Fonte da etapa | Cumpre? |
|---|---|---|
| `/agency/projects/[id]` (`EsteiraDoProjeto`) | `lerFase` → `paraEquipe` | **Sim** |
| Portal, painel da esteira | `lerFase` → `paraCliente` (via `/api/portal/esteira`) | **Sim** |
| Portal, cartão de projeto e chip do cabeçalho | `etapaLegivel`, escrita à mão em `/api/portal/projetos:30-38` | **Não** |
| Portal, cliente sem briefing | `trilhaDoProjetoDireto`, escrita à mão em `/api/portal/esteira:51-87` | **Não** |
| Portal, chip do cabeçalho (fallback) | `STATUS_LABEL`, um 4º mapa em `page.tsx:181-187` | **Não** |
| `/agency/dashboard` e `/agency/pipeline` | `p.stage` do `localStorage` | **Não — e é o pior dos cinco** |

São **quatro leituras independentes de "em que etapa estamos"**, e até três delas
podem aparecer na mesma tela do cliente ao mesmo tempo.

### Os interruptores de dois lados no portal — os três

1. **Material.** A tela mostra "enviei"; cala sobre "destravou".
   (`EnvioDeMaterial.tsx:271-273` × `materiais.ts:336-338`)
2. **Meta.** A tela mostra "conectado"; cala sobre "nenhuma conta autorizada, a
   Dioli não lê nada". (`ConexoesDoCliente.tsx:286-312`, invisível quando a
   chamada de ativos falha em silêncio, `:147`)
3. **Aprovação.** A tela mostra "aprovado por você"; cala sobre "e agora
   publica?" — nada no portal diz que publicar depende de conexão viva e de
   liberação da Meta, que hoje **não existe** (o produto não publica). O cliente
   aprova e fica esperando ver no ar.

O terceiro é o mais caro dos três, porque é o único em que o silêncio dura
semanas antes de virar pergunta.

---

## E · O DESENHO QUE PROPONHO

Não é pixel. É estrutura, ordem e a primeira frase.

### A regra que organiza tudo

> **O portal responde três perguntas, nesta ordem: *o que preciso fazer*, *como
> está indo*, *como falo com vocês*. Cada pergunta tem UM lugar. Nada que
> responda a uma delas aparece em duas telas.**

Foi a regra "um único lugar para decidir" (CEO, 07/08) que salvou Aprovações. Ela
precisa valer também para *anunciar* — não só para *decidir*.

### As 5 seções, a ordem e o que cada uma passa a ser

| Ordem | Seção | O que é, e só isso |
|---|---|---|
| 1 | **Início** | A leitura pronta + o que depende de você + a porta de pedir. Nada mais. |
| 2 | **Projetos** | O que a Dioli está construindo: cartões de projeto, calendário do mês, seus pedidos. **Sem painel de esteira, sem tarja de decisão.** |
| 3 | **Aprovações** | Onde se decide. Já está certo. |
| 4 | **Enviar arquivos** | Tudo que é material: envio direto, **Google Drive**, e a lista do que já chegou. |
| 5 | **Sua conta** | Quem você é + as contas que você conecta. Já está certo. |

### O que aparece primeiro ao abrir, na ordem exata

```
┌─────────────────────────────────────────────┐
│ dioli · Portal do Cliente                   │  ← discreto, já está bom
│ Estética Bella                              │
│                                             │
│ Produção rodando — 2 de 4 entregas prontas. │  ← A FRASE. Uma. Da esteira.
│ 1 coisa depende de você.                    │  ← o número, DEPOIS da frase
├─────────────────────────────────────────────┤
│ [Início][Projetos][Aprovações¹][Enviar][Conta]│
├─────────────────────────────────────────────┤
│ 1 · O QUE DEPENDE DE VOCÊ                   │
│   ✍️ Carrossel de agosto aguarda sua aprovação│
│      Prazo: 12/08         → Decidir         │
├─────────────────────────────────────────────┤
│ + Precisa de alguma coisa?                  │
├─────────────────────────────────────────────┤
│ 2 · ONDE ESTAMOS                            │
│   [faixa da esteira — trilha e progresso]   │
└─────────────────────────────────────────────┘
```

**A frase que abre a tela** vem de `esteira.etapa` + `esteira.agora`, encurtada
para uma linha, **da mesma função que alimenta a faixa** — não de um quinto mapa.
Enquanto ela não puder ser lida, a linha é *"Estamos organizando o começo do seu
trabalho"*, nunca "Recebido" e nunca 0%.

### Cada corte, e por quê

- **Painel da esteira sai de Projetos.** Ele é a resposta de *como está indo*, e
  essa pergunta tem uma casa: o Início. Repetido, ensina que as duas abas são a
  mesma coisa — e foi por isso que o CEO disse "totalmente perdido".
- **Tarja "N itens esperam sua decisão" sai de Projetos.** O selo laranja da aba
  Aprovações está sempre visível, em todas as telas. Um anúncio permanente e um
  anúncio dentro de uma aba são dois; sobra um.
- **"Decisões registradas" e "Ver todos os pedidos" saem do Início.** Histórico
  não é o que traz alguém ao portal. Aprovações e Projetos já os têm, melhor.
- **Caixa "Esperando de você" sai da faixa, no portal.** A lista de pendências do
  bloco 1 é a mesma informação, com destino clicável. Na tela da equipe a caixa
  fica — lá ela não compete com nada.
- **Drive muda para Enviar arquivos.** "Sua conta" é *quem eu sou*; mandar o logo
  é *o que preciso fazer*. Duas portas em pontas opostas da navegação para o
  mesmo trabalho é a definição de "muita coisa misturada".
- **Ponto verde sai.** Não custa nada e é a única promessa falsa que sobrou.

### O que precisa ganhar tela, e não tem

1. **"O que você já mandou"**, em Enviar arquivos, vindo do servidor. Sem isso o
   passo 4 não fecha.
2. **A devolutiva do envio**: usar o `aindaFaltam` que a rota já devolve. Duas
   frases possíveis — *"recebemos, e isso destrava a produção"* ou *"recebemos, e
   ainda falta X"* — em vez de uma frase que vale para os dois casos.
3. **Uma linha de primeira visita**, uma única vez: *"Aqui você acompanha o
   trabalho, aprova as peças e manda material. Quando algo depender de você,
   aparece no topo desta tela."* Some depois da primeira aprovação.
4. **Confirmar antes de aprovar**, com o que está sendo aprovado escrito, e um
   caminho de recuperação no card já decidido.
5. **O terceiro interruptor**: depois de "aprovado por você", dizer o que falta
   para ir ao ar — e se falta algo do lado da Dioli, dizer isso, com todas as
   letras, como já se faz em Integrações (`page.tsx:1481-1495`, que é o melhor
   texto do portal inteiro e deve virar o padrão).

### Painel da agência — a única frente que importa antes das outras

Ligar `/agency/dashboard` e `/agency/pipeline` ao banco. Enquanto a tela inicial
da equipe for `localStorage`, qualquer conserto de portal é conserto de metade:
a equipe olha um estado, o cliente olha outro, e é a agência que descobre por
último. É a **frente 3 do CEO** ("toda tela mostra os dois lados do
interruptor") aplicada ao lugar onde ela custa mais caro.

---

## F · NÃO VERIFICADO

O que exigiria banco de produção, navegador ou execução — e o que fecharia cada um.

| Item | Por que não fechei | O que fecha |
|---|---|---|
| Renderização real a 375/768/1280 | Não abri navegador; a auditoria foi de percurso e de código | Playwright nas 5 seções, nos 3 tamanhos, com um cliente que tenha pendência, aprovação e material em aberto |
| "Etapa 1 de 0" e "0% do caminho" na tela | Dependem de o servidor omitir `trilha`/`progresso` | Reproduzir com a rota respondendo sem esses campos, ou revisar `statusPelaSolicitacao` para saber se pode omitir |
| Se o envio de material realmente deixa a tarja de pé | Precisa de um `MaterialRequest` `pending` em produção + um upload real | Um envio de teste no portal de um cliente com pedido aberto |
| Se alguma Página em produção hoje está "Funcionando" com zero ativos autorizados | Precisa do banco | `SELECT` em `MetaAsset`/conexões por cliente, cruzando `autorizado` |
| Se `?? ap.department` já vazou palavra crua para algum cliente | Precisa do banco | Distinct de `ApprovalRequest.department` cruzado com as 10 chaves de `CLIENT_SAFE_DEPARTMENTS` |
| Se alguém já usou `/agency/pipeline` para mover projeto | Precisa de `ActivityEvent` em produção | Contar `type = "project_stage_changed"` — se houver, houve trabalho perdido |
| Quantos clientes veem hoje o chip "Recebido" com projeto em produção | Precisa do banco | Cruzar `ClientRequest.status = "new"` com `Project` existente por `clientId` |
| Tempo real de resposta do chat | Não medido | Diferença entre `createdAt` da mensagem do cliente e a primeira resposta da equipe, por conversa — é o número que substitui o ponto verde |

**Nota de método:** onde não pude medir, não escrevi "não acontece". Ausência de
informação não é informação — e os oito itens acima estão como *não verificado*,
não como *não existe*.
