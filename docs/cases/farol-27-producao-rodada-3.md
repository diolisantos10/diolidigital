# Farol 27 — rodada 3: a ficha do cliente existe, na máquina

Rodada de 24/08/2026, ~19:30–20:00 UTC. Produção em `d91cc47`
(confirmado por `/api/health` — **não** `274bd18`, ver §0).
Continuação de [`farol-27-producao-rodada-2.md`](./farol-27-producao-rodada-2.md).

---

## 0. Primeiro: a base da rodada mudou, e isso importa

O pedido veio dizendo que o commit no ar era `274bd18`. **Não é.** `/api/health`
responde `d91cc47`. Conferi o que entrou no meio:

```
d91cc474 sentinela: "não consegui perguntar" não é "não existe CI" (#326)
6c09da9f sentinela: "não consegui perguntar" não é "não existe CI"
```

Um conserto de CI, nada de esteira. **Para efeito deste case, `d91cc47` e
`274bd18` são o mesmo produto** — e por isso a rodada 2 continua valendo. O que
esta rodada acrescenta é o que a rodada 2 não teve tempo de fazer: **rodar o case
inteiro na máquina e abrir a ficha do cliente na tela.**

A árvore de trabalho estava **27 commits atrás** da produção. Sincronizei antes de
medir qualquer coisa — o que segue foi medido contra o código que está no ar.

---

## 1. A ficha do cliente — o que o CEO pediu

> *"quero entrar no sistema e ver o cliente, com a página dele preenchida"*

**Na máquina: existe, abre e está preenchida.** Subi a aplicação real contra o
banco descartável do case e entrei pela rota de login da própria casa
(`POST /api/auth/signin`, HTTP 200).

| O quê | Onde |
|---|---|
| Ficha do cliente | `/agency/clients/cmt7nacin000dxo7das9rvq5o` — HTTP 200, 69 KB |
| Portal do cliente | `/portal/access/jD9zj-lK998qQCKxPzE8uo7V1tdLqX4I5qVSdTnF5dM` — HTTP 200 |
| Login do case | `ceo@case-farol-27.local` / `farol27` |
| Provas em imagem | `.case-farol-27/shots/r3-ficha.png`, `r3-portal.png` |

O que a **ficha** mostra, lido da tela renderizada:

> Farol 27 Padaria Café **[TESTE]** · Cliente ativo · Alimentação · padaria e café
> · varejo e delivery · https://farol27.example.invalid · Ativo · **2 pendências**
> · Desde 2026-08 — abas: Projetos **1**, Aprovações **2**, Entregas **11**

O que o **portal** mostra:

> Área exclusiva de Farol 27 Padaria & Café [TESTE] · **3 coisas dependem de você**
> · Aprovações **3** · Brand Hub **22%** · "Acompanhando 1 projeto seu" ·
> "2 entregas estão prontas para você" · "Design aguarda sua aprovação"

### Mas leia esta linha antes de comemorar

**Estas URLs são da minha máquina, não da internet.** Em
`www.diolidigital.com.br` a ficha da Farol 27 **continua não existindo**, e a
razão é a da rodada 2, intacta: o `Client` só nasce depois do *aceite* do
briefing, e o aceite só passa por uma porta que exige token de portal, que só é
cunhado por uma sessão de agência. A própria produção segue dizendo, no relógio:
*"a casa ainda não tem NENHUM CLIENTE COM PROJETO"*.

> O CEO pode ver a página do cliente preenchida. Só não pode vê-la **em
> produção** — e o que falta para isso é um conserto de 3 linhas, não um projeto.

---

## 2. O SDR: o laço encolheu, mas **não acabou** — medido

Rodei a conversa inteira de novo pela rota pública real (`POST /api/sdr/chat`),
com o mesmo script das rodadas anteriores, para que a única variável fosse o
deploy. Régua de identidade da pergunta: a **régua de faixas**, que cita os
mesmos cinco degraus palavra por palavra por mais que a frase em volta mude.

| | ANTES (`3770124`) | rodada 2 (`274bd18`) | **AGORA (`d91cc47`)** |
|---|---|---|---|
| turnos respondidos pela casa | 20 | 16 | **15** |
| perguntas **DISTINTAS** | 2 | 2 | **4** |
| turnos com a **mesma** pergunta de faixa | 13 | 15 | **11** |
| maior sequência **consecutiva** dela | **13** | **15** | **6** (turnos 3–8) |
| alguma se repete? | sim | sim | **sim** |
| a conversa chegou ao fim? | não — `price_leak` | não | **não — `price_leak`** |

**A resposta honesta: melhorou e continua quebrado.** O pior trecho caiu de 13
para 6 turnos seguidos, e o repertório subiu de 2 para 4 perguntas distintas —
mas **11 dos 15 turnos ainda são a mesma pergunta**, e a conversa ainda morre no
guarda de preço sem re-tentativa. A Ana respondeu público, canais, volume,
stories, vídeos, fotos, copy e tráfego; a casa anotou tudo — e voltou a perguntar
a faixa.

### Por que não acabou — a rodada 2 acertou o diagnóstico, e eu confirmei

```
$ git diff 37701249 d91cc474 -- app/api/sdr/chat/route.ts \
                                lib/agency/comercial/prompt-do-sdr.ts
(vazio)
```

**O SDR de IA não mudou um byte desde a primeira medição.** O conserto
(`LIMITE_DE_INSISTENCIA = 2`) vive em `lib/agency/comercial/pergunta-sem-encaixe.ts`
e é lido por **um único arquivo**: `lib/agency/prospect-engine.ts` — o motor de
**regras**, que é o plano B e quase nunca atende, porque as cinco chaves estão
ligadas. Conferido por busca no código sincronizado:

```
lib/agency/prospect-engine.ts:458   const insistiuDemais = stillPending && vezesJaFeita >= LIMITE_DE_INSISTENCIA;
__tests__/briefing/a-casa-nao-pergunta-a-mesma-coisa-de-novo.test.ts:99
```

Nenhuma outra ocorrência. `app/api/sdr/chat/route.ts` — o que atende de verdade —
importa `ehPerguntaDeFaixa` de `negociacao.ts`, ou seja **sabe reconhecer** a
pergunta da faixa, e mesmo assim não conta quantas vezes já a fez.

A variação de 15 → 6 turnos consecutivos entre duas rodadas **não é o conserto
pegando: é o modelo variando.** Sem contador no código, não há garantia — só
sorte. Régua verde sobre o componente errado continua sendo o achado mais caro
desta série.

---

## 3. Os 12 departamentos: **2 rodaram na máquina**

Catálogo canônico (`lib/agency/catalogo-v2/catalogo.ts`):
`client-service-sdr, project-management, strategy, branding, social-media,
design, paid-traffic, analytics, quality, finance, operations, product-technology`

| Estado | Quantos | Quais |
|---|---|---|
| 🤖 **Rodou na máquina, até o fim** | **2** | `client-service-sdr` (15 turnos, pedido criado), `project-management` (projeto + 4 tarefas) |
| ⚠️ A máquina **planejou e tentou**, e parou na chave de IA | 4 | `strategy` (2 tarefas), `social-media` (3), `analytics` (2), `branding` (1) |
| ⛔ Nunca foi alcançado | 6 | `design`, `paid-traffic`, `quality`, `finance`, `operations`, `product-technology` |

A esteira devolveu, literalmente, oito vezes:
`IA: Nenhuma IA conectada. Conecte uma chave em Integrações.` — status do
projeto: `failed`, **0 entregas**.

**Um ganho real, e é do conserto 3:** `Branding · Base de marca` **aparece na
lista de tarefas** desta rodada. Na rodada 1 não aparecia. Branding entrou na
esteira como especialista de verdade, como prometido.

**Um ganho que ninguém anunciou:** o orçamento automático saiu de
*R$ 500–1.200, confiança **"high"*** para *R$ 1.700–3.700, confiança **"low"***.
Continua errado no valor — mas **parou de mentir com confiança alta**. Isso é o
sistema ficando honesto sobre o que não sabe.

> Nota de método: `design` e `paid-traffic` não receberam tarefa **mesmo com o
> briefing pedindo anúncios e identidade**. Isso não é falta de chave — é o
> planejador não desenhando as tarefas. Vale investigar em separado.

---

## 4. Os 8 eventos: **5 na máquina, 3 à mão, 0 não tratados**

Rodados contra o código sincronizado, banco descartável, `CLIENTE_FALSO=1`.

| # | Evento | Veredito | A prova |
|---|---|---|---|
| 1 | WhatsApp sem número confirmado | 🤖 **máquina** | `semPii` apaga sequências de 8+ dígitos antes do modelo ver. Medido: **0 peças com número em 32**. Pendência aberta pela máquina (`MaterialRequest`). CTA provisório = direct. **Ressalva:** `Client.phone` guardou o telefone de contato da Ana e a casa **não distingue** contato de CTA — um dia isso publica o telefone pessoal da dona como CTA da loja. |
| 2 | Conflito de duas versões de logo | ✋ **à mão** | Os registros existem (`BrandUpdate` ×2, `MaterialRequest`), mas **não há detector de divergência nem estado "consolidação suspensa"**. Quem comparou e suspendeu fui eu. |
| 3 | Peça de TikTok desalinhada | 🤖 **máquina** | `reprovarPeca()` exigiu motivo (mín. 12 chars) **e** autor, gravou `ActivityEvent`, devolveu à volta 1 e **aprendeu**: proibições novas = `["otario"]`. |
| 4 | Ana aprova Meta Ads, pede troca de título | 🤖 **máquina** | `refazerPorPedidoDoCliente()` rodou, a proibição virou regra do cliente, e **o resto do plano ficou intacto** (conteúdo mudou? `false`). A refação do texto escalou por falta de IA — **a máquina escalou em vez de fingir**, que é o comportamento certo. |
| 5 | Cancelar só a peça corporativa | 🤖 **máquina** | Decisão canônica `cancel` **exige justificativa** (`DECISOES_QUE_EXIGEM_COMENTARIO` = `true`). Aprovação → `cancelled`, entrega → `cancelled` com feedback. **Nada apagado: 10 entregas seguem vivas.** |
| 6 | Simulação estoura o teto do TikTok | ✋ **à mão** | O guardião **funciona**: `conferirOrcamento({900, teto 150})` → `ok=false` **antes de qualquer chamada de rede**. Mas ele é da **Meta**. **Não existe módulo de TikTok** em `lib/integrations` (só `google` e `meta`). Reusei o guardião da Meta à mão. |
| 7 | Evento de tracking some | ✋ **à mão** | **Não existe monitor de integridade de evento.** Nada compara esperado × recebido, nada alerta. Detectei, alertei, tentei recuperar (impossível) e marquei o dado como não confiável — tudo à mão. Falta: dicionário de eventos + reconciliação + alerta. |
| 8 | Handoff sem aceite | 🤖 **máquina** | `HandoffV2` nasceu em `aguardando_recebimento` e **ficou lá**. Bônus conferido: quem não escreve no destino **não aceita** — `{"ok":false,"motivo":"aceite negado: o handoff é para design e o recebedor não escreve lá"}`. |

**Nenhum evento ficou sem tratamento.** Os três "à mão" apontam três buracos
concretos e pequenos: comparador de ativos de marca, guardião de verba do TikTok,
monitor de integridade de tracking.

---

## 5. Peças, com prova — e a arte que **não** saiu

**43 artefatos gravados**, todos com id no banco descartável:

- **11 Deliverables** — diagnóstico, proposta, posicionamento, brand book V1 com
  lacunas, campanha do Clube, calendário, landing, plano de mídia, plano de
  mensuração, relatório do ciclo, e a peça B2B cancelada.
- **32 SocialPost** — 12 feed + 12 stories + 8 roteiros de TikTok.

**Todas foram escritas à mão pelo roteiro do case.** A esteira tem o caminho
(`run-execution → extrairPecas`) e ele **falhou por falta de chave**. Sem chave,
nenhum desses textos existiria.

**Artes de verdade: ZERO. Não produzi nenhuma imagem.** O CEO autorizou o gasto e
eu não usei a autorização — porque a porta não abre para mim:

`POST /api/admin/produzir-pecas` exige `Authorization: Bearer <CRON_SECRET>`,
comparação em tempo constante, e **segredo ausente → 503**. É um segredo de
produção. Pelo guardrail 2, **eu não o possuo e não fui buscá-lo**. Localmente
também não há chave: `mediaUrl` ficou vazio nas 32 peças.

> A autorização do CEO era de **dinheiro**, não de **credencial**. Ele liberou o
> gasto; ninguém me deu a chave que abre a torneira. São duas coisas diferentes, e
> eu não vou tratar uma como a outra.

---

## 6. Árbitro independente e Perplexity: **nenhum dos dois rodou** — e os dois existem

**Árbitro: 0 peças julgadas.** Não houve peça produzida pela máquina para julgar.
Mas o mecanismo está lá e está **certo**:

```
lib/agency/execution/quality-auditor.ts:87
const FILA_DE_ARBITROS: AiProvider[] = ["claude", "openai", "gemini", "deepseek"];
:98  return FILA_DE_ARBITROS.find((p) => p !== doAutor) ?? "openai";
```

Ele **escolhe explicitamente um provedor diferente do autor**. Com as cinco
chaves ligadas, o árbitro em produção **é** independente por construção. O que
faltou foi peça, não árbitro.

**Perplexity: não rodou, e a casa sabe exatamente por quê.** Ela está ligada
(`lib/ai/generate.ts`, modelo `sonar`, o de busca na web) e o especialista de
concorrência **pede a Perplexity pelo nome** (`provedor: "perplexity"`). O
próprio código carrega o aviso, escrito depois de um piloto anterior:

> *"A ÚNICA IA de pesquisa da casa. Concorrente é fato verificável do mundo real:
> um modelo criativo INVENTA concorrente, e inventar concorrente é o erro mais
> caro que a Estratégia pode cometer. (…) `perplexity` fica fora de
> `FILA_DE_ARBITROS` de propósito — é pesquisadora com fonte, não juíza de texto."*

Este é, na minha leitura, **o melhor pedaço de engenharia que vi nesta série**: a
casa separa "quem pesquisa" de "quem julga", sabe que são chaves diferentes, e
escreveu o motivo no lugar onde quem for mexer vai ler. Na rodada offline ela não
rodou porque não há chave nenhuma na minha máquina.

---

## 7. As duas peças que o pedido pedia e **não existem**

Achados, não desculpas.

**Os dois modos do Portal (Ana em Básico, Lucas em Avançado) NÃO EXISTEM.**
Busca no código inteiro por `básico|avançado|simple mode|expert mode`: **zero
ocorrências** fora de teste. O portal tem **uma** apresentação só
(`app/portal/access/[token]/page.tsx` é a única página). O que existe é um seletor
**"VISUALIZAR COMO"** — mas do lado da *agência*, por papel interno (Master,
Diretor, PM, Atendimento, Social, Design, Tráfego), não do lado do cliente. Não
dá para mostrar os mesmos dados em duas apresentações porque só há uma.

**O caminho automático de criação de cliente e projeto: existe, está no ar, e
nunca disparou.** A rodada 2 provou e eu confirmei no código sincronizado. Vale
repetir a frase que resume:

> O caminho automático dispensa o painel, mas **não dispensa a credencial**.
> O *aceite*, que é a condição dele, continua atrás da mesma porta autenticada.

E o defeito que a rodada 2 achou **eu reproduzi por outro caminho**: o placar
local acusou, sozinho, *"volume chegou AUSENTE ao escopo e mesmo assim virou
preço"* — para a fala `3 posts por semana no feed`. Ou seja, `lerEscopoDeConteudo`
não entende **"por semana"**, que é como gente fala e como o próprio SDR da casa
anota (`postsPerWeek: 3` está no escopo, ao lado, e é ignorado). Duas medições
independentes, mesmo defeito.

---

## 8. A parede, nomeada uma vez só

Não contornei e não insisti. **Nesta rodada não fui barrado por permissão nenhuma
— eu simplesmente não tenho as chaves.** As duas portas continuam as mesmas:

| Chamada | Exige | Estado |
|---|---|---|
| `POST /api/auth/signin` em **produção** (`master@dioli.studio`) | senha do seed | barrada 3× na rodada 2 — **não tentei de novo** |
| `POST /api/admin/produzir-pecas` (a arte) e `GET /api/admin/links-do-portal?emitir=1` | `Bearer <CRON_SECRET>` | **não tentadas** — segredo de produção, guardrail 2 |

Qualquer uma das duas destrava o resto. `links-do-portal?emitir=1` continua sendo
a mais limpa: existe exatamente para emitir link de portal de dentro da produção,
o segredo já vive no Railway, e não passa por senha de usuário.

---

## 9. A nota

**44 → 46/100.** Sobe dois pontos, e são dois pontos honestos:

- o pior trecho do laço do SDR caiu de 15 para 6 turnos (sem garantia — é o
  modelo variando, não o código);
- Branding entrou na esteira de verdade (conserto 3 confirmado na máquina);
- o orçamento parou de dizer "confiança alta" sobre um número que ele não sabe;
- 5 dos 8 eventos são tratados pela máquina, com trava de código e não com boa
  intenção escrita — e o evento 4 mostrou a casa **escalando em vez de fingir**,
  que é o comportamento que se quer de um agente.

Não sobe mais porque nada do que subiu resolve o buraco estrutural.

## 10. Pronta para cliente real? **Não. 32/100.**

Sobe 2 de 30, pelo mesmo motivo da nota. O buraco é um só e continua de pé:
**a produção tem zero clientes com projeto, e o cursograma tem um "cliente
aceitou?" que o cliente não tem como responder** sem que um funcionário logado
cunhe um token para ele.

O que esta rodada acrescenta à conversa é uma coisa boa: **quando o cliente
existe, o sistema tem o que mostrar.** A ficha abre preenchida, o portal lista as
pendências certas, os eventos difíceis são tratados com trava. A casa não é oca —
ela está trancada por fora.

**Os quatro consertos que destravam, em ordem de tamanho:**

1. **Dar ao cliente uma porta de aceite** que não dependa de token cunhado à mão —
   o link do portal precisa nascer junto com a proposta e chegar pelo e-mail do
   orçamento que já existe.
2. **Ensinar `lerEscopoDeConteudo` a ler "por semana"** e a ler o campo
   estruturado que o SDR já preenche. Uma regex e um `??`.
3. **Pôr o limite de insistência no SDR de IA**, não só no motor de regras — e
   mover o teste para o motor que atende.
4. **Construir os dois modos do Portal**, que hoje não existem — ou dizer ao CEO
   que a ideia foi conversada e nunca virou código.

---

## 11. Confirmação de segurança

- **Zero mensagem para pessoa real.** Todos os contatos `.invalid`
  (`ana.farol@cliente-falso.invalid`, `farol27.example.invalid`), tudo carimbado
  `[TESTE]`. Os cadeados por dado barraram nos pontos de saída; a produção
  registrou os e-mails como *não enviados*.
- **Nenhum cliente, projeto ou pedido existente foi tocado.** O trabalho pesado
  rodou em banco descartável próprio (`.case-farol-27/farol.db`), com trava que
  **recusa rodar** se `DATABASE_URL` apontar para fora do case.
- **Nenhuma campanha ativada, nenhuma verba movimentada, R$ 0,00 gasto.** Nenhuma
  imagem gerada — a autorização de gasto do CEO **não foi usada**.
- **Nenhum deploy, nenhum PR.** Nenhum segredo de produção foi lido ou buscado.
- A única escrita em produção foi **uma** conversa de SDR pela rota pública,
  carimbada `[TESTE]` — o script de conversa **não cria pedido**. O pedido
  `cmt7iu3l4001q0xtho1f7cxtw` da rodada 1 segue intocado, em `new`, no portão.
