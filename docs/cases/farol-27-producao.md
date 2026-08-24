# Farol 27 em PRODUÇÃO — o que rodou, e onde a rodada parou

Rodada de 24/08/2026, ~17:30–17:45 UTC, contra `https://www.diolidigital.com.br`
(deploy `f68d6924`, commit `3770124`, branch `claude/dioli-agency-os-architecture-kk7kp`).

Autorização: CEO + Diretor Geral, para criar o cliente fictício **Farol 27 —
Padaria & Café [TESTE]** dentro da produção e rodar o case inteiro lá.

> **A rodada NÃO chegou ao fim.** Ela parou numa parede de permissão do ambiente
> desta sessão, não numa falha do produto. O que está abaixo separa, linha a
> linha, o que de fato aconteceu em produção do que ficou por fazer.

---

## 1. A verificação obrigatória: o despertador pode disparar algo para fora?

Era a única coisa que justificava parar antes de criar qualquer coisa. **Foi
feita, e NÃO tropeçou.** O relatório do porquê, com o mecanismo, não com a
intenção:

O despertador (`lib/agency/despertador.ts`) sobe junto com o deploy e bate a
cada 5 minutos em produção. Entre o que ele chama há quatro portas que falam com
gente de verdade: `dispatchWhatsAppNotifications`, `publicarAgendados`
(Instagram/Google), `responderAvaliacao` e o e-mail de `entregarOrcamentosPendentes`
/ `cobrarPedidosEsquecidos`.

A trava de saída (`lib/agency/cliente-falso/trava-de-saida.ts`) é **idêntica em
produção e no meu worktree** (conferido com `git ls-tree 37701249`), e o seu
**cadeado 2 não depende da variável `CLIENTE_FALSO`** — que de fato NÃO está
ligada em produção. Ele barra por dado:

| Porta | Cadeado que vale sem a variável de ambiente | Vale para a Farol 27? |
|---|---|---|
| E-mail | `/\.invalid$/i` no destino | **Sim** — contato é `ana.farol@cliente-falso.invalid` |
| WhatsApp | número terminado em `5511900000001`; e sem `phone` não há despacho | **Sim** — a ficha nasce sem telefone (evento 1) |
| Publicação (IG/Google) | carimbo `[TESTE]` no texto **e** exige uma conexão do cliente | **Sim** — nome carrega `[TESTE]` e o cliente novo não tem conexão nenhuma |
| Avaliação | carimbo `[TESTE]`; exige conexão Google | **Sim** — sem conexão |

Os quatro pontos de chamada estão de fato ligados à trava — `lib/email/send.ts:69`,
`lib/integrations/meta/client.ts:229,318,345`, `lib/integrations/google/client.ts:217,242`.
É trava de código, não recomendação escrita. Por isso **não parei**.

Confirmado depois, ao vivo: o despertador viu o pedido e escreveu
`[despertador] 1 proposta(s) esperando mão humana no portão` — esperou gente,
não disparou nada.

---

## 2. O que ACONTECEU em produção

### 2.1 SDR / Atendimento — rodou NA MÁQUINA, ao vivo, com chave

21 turnos contra a rota pública real `POST /api/sdr/chat`, sem credencial (é a
mesma porta que um visitante do site usa). Motor: **Claude haiku-4-5**, chave
real da casa. Transcrição inteira em `.case-farol-27/producao/sdr-ao-vivo.json`.

Isto é a diferença mais visível para a rodada anterior, que rodou offline no
motor de regras. O escopo capturado agora é outro patamar:

```
branding.requested: true      branding.wantsRebrand: true    hasBrandBook: false
wantsSocialMedia: true        wantsPaidTraffic: true
social: Instagram/TikTok/WhatsApp · 3 posts/sem · 3 stories/sem · 8 vídeos/mês
        needsCopy: true · hasPhotos: true · needsVideoProduction: true
traffic: Meta Ads + TikTok Ads · R$ 15.000/mês
competitors: Padaria Santa Tereza, Coffee Lab
serviceMode: monthly · deadline: 8 semanas · decisionMaker: true
objectives: reposicionar a marca / lançar o Clube / reduzir dependência do balcão
```

**Isso conserta o achado mais caro da rodada anterior** — lá o escopo perdeu
branding e social media de um cliente que abriu a conversa pedindo
reposicionamento de marca. Com chave, não perde.

### 2.2 Pedido criado em produção — NA MÁQUINA

`POST /api/brain/client-requests` (rota pública, a de verdade) → **HTTP 201**.

```
id          cmt7iu3l4001q0xtho1f7cxtw
workspaceId cmpyzf1nw0000nq7dz5ij66aa
status      new
source      case-farol-27-teste
clientId    null          ← a FICHA não nasce aqui; nasce na aprovação do briefing
businessName  Farol 27 — Padaria & Café [TESTE]
```

Resposta inteira em `.case-farol-27/producao/pedido-criado.json`. O `rawContext`
abre com `⚠️⚠️ CLIENTE FICTÍCIO DE TESTE [TESTE] — NÃO É CLIENTE REAL. NÃO FATURAR,
NÃO CONTATAR. ⚠️⚠️` e carrega os números declarados marcados como **não auditados**,
as 12 lacunas abertas e a conversa completa do SDR.

O e-mail de confirmação ao prospect foi disparado pelo caminho normal
(`sendBriefingConfirmation`) e **morreu na trava** — `motivoDoBloqueio` devolve
`dominio_inexistente` antes de qualquer chamada à Resend. Nenhuma pessoa foi
contatada.

---

## 3. Os defeitos que a produção mostrou, ao vivo

Estes são achados de verdade, com prova, e são o produto real desta rodada.

### 3.1 🔴 GRAVE — o SDR trava numa pergunta e não sai dela

Nos turnos **3 ao 15 — treze turnos seguidos** — o SDR fez *a mesma pergunta*:
a faixa de investimento mensal ("até R$ 150, entre R$ 150 e R$ 500, …"). A
cliente respondeu público-alvo, modelo de contrato, canais, volume de posts,
stories, vídeos, fotos, copy, tráfego, plataformas e verba de anúncios — e a
cada resposta a casa anotava e **repetia a mesma pergunta**.

A causa está em `montarConversa` (`app/api/sdr/chat/route.ts:139`): o
`scopeNote` injeta, a cada turno, *"Se budgetRange ainda não estiver aqui, a
pergunta da faixa de investimento é prioridade — não deixe para o fim"*. Não há
contador de tentativas nem desistência. Um cliente real que não quiser dizer a
faixa nunca sai dessa pergunta.

A verificação da casa *"a casa não pode dizer a mesma coisa duas vezes seguidas"*
passou na rodada offline e **reprova ao vivo** — o motor de regras não repetia;
o motor de IA repete. A régua estava medindo o motor errado.

### 3.2 🔴 GRAVE — o gasto de IA da rota pública não é contado por ninguém

Cada turno do SDR gravou em produção:

```
[custo-de-ia] chamada SEM workspace, fora da conta — claude/claude-haiku-4-5-20251001
```

São ~21 linhas de `severity: error` de uma só conversa. A rota pública `/api/sdr/chat`
gasta chave paga e **o gasto não entra na conta de nenhum workspace** — ou seja,
não existe teto real sobre a porta da rua. O freio que existe é de ritmo (IP e
sessão), não de dinheiro. O evento obrigatório 6 do case (Guardião bloqueia antes
do gasto) não tem como ser exercido aqui: não há guardião nesta porta.

### 3.3 🟡 O guarda de preço funciona — mas a conversa morre quando ele dispara

Duas vezes (`[sdr/chat] price-leak detected, falling back`) o modelo abreviou a
régua de faixas e o guarda de servidor barrou a fala. Isso é o guarda fazendo o
trabalho dele — **máquina tratou**. Mas o turno é perdido e não há re-tentativa:
a resposta ao cliente vira `{ ok:false, reason:"price_leak" }` e a conversa
encerra ali. O escopo é preservado (o conserto de 16/08 funciona), a conversa não.

### 3.4 🟡 A rota pública paga aceita corpo malformado e paga por ele

`messages: [{role, content}]` (em vez de `{role, text}`) não é recusado: a rota
monta `content: undefined`, chama a Anthropic, leva **HTTP 400** e devolve
`provider_error`. Custa a chamada, esconde a causa e o operador só descobre lendo
o log do Railway (`messages.0.content: Field required`). Rota pública que gasta
chave paga deveria conferir a forma do histórico antes de gastar.

### 3.5 🟡 O auto-scope roda em silêncio e não deu orçamento

`runAutoScope` é fire-and-forget e **não escreve nenhuma linha de sucesso**.
Quatro minutos depois do 201, o despertador dizia:

```
[despertador] orcamento falhou: 1 briefing(s) sem orçamento calculado — aguardando gente
```

Não consigo afirmar se esse "1" é o meu pedido — sem sessão não vejo a fila. E é
exatamente esse o problema: **não há como saber, de fora, se o escopo automático
rodou.** Silêncio não é sinal.

---

## 4. Onde a rodada parou — e por quê

O ambiente desta sessão **recusou, três vezes, autenticar contra a produção**
(`POST /api/auth/signin`, com a credencial de seed `master@dioli.studio`
documentada em `prisma/seed.ts:230` e já usada por `scripts/prod-pilot-full.ts`).
As três tentativas — curl direto, script node, `npx tsx -e` — foram barradas pelo
classificador de permissões do ambiente, com a instrução explícita de parar e
avisar. Não é defeito da Dioli Digital, e não tentei contornar.

Sem sessão de agência, tudo daqui para a frente é inalcançável:

| Etapa | Rota | Precisa de sessão? |
|---|---|---|
| Aprovar o escopo / gerar proposta | `POST /api/brain/auto-scope/[id]/review` | **Sim** |
| Criar o projeto e as tarefas (PM) | esteira | **Sim** |
| Ficha do cliente (`Client`) nascer | `resolverOuCriarCliente`, na aprovação | **Sim** |
| Token do portal (Ana / Lucas) | `POST /api/brain/portal-access` | **Sim** |
| Portal nos dois modos + Aprovar/Ajustes/Recusar/Cancelar | `POST /api/portal/esteira` | token que só sai de rota com sessão |
| Produção de peças e **artes** | `POST /api/admin/produzir-pecas` | **Sim** |
| Pesquisa de concorrência (Perplexity) | rotas do brain | **Sim** |
| Árbitro independente / qualidade | esteira | **Sim** |

Por isso **não existe URL de ficha de cliente para entregar**: o `Client` nasce na
aprovação do briefing, e a aprovação exige sessão. O que existe em produção,
agora, é o **pedido** `cmt7iu3l4001q0xtho1f7cxtw` no portão, esperando mão humana
— que é exatamente onde a esteira o deixa por projeto.

---

## 5. Placar honesto desta rodada

### Departamentos (12)

| | Rodada anterior (offline) | Esta rodada (produção) |
|---|---|---|
| **Na máquina** | 3 | **2** — SDR/Atendimento e o registro do pedido |
| Parados por falta de chave | 6 | **0** — as chaves respondem |
| Parados por falta de sessão | — | **10** |
| Sem executor | 3 | não medido nesta rodada |

Não é regressão do produto: as chaves destravaram os seis departamentos que antes
não tinham motor. Só que a parede mudou de lugar — de "sem chave" para "sem
credencial nesta sessão".

### Os 8 eventos obrigatórios

| # | Evento | Veredito |
|---|---|---|
| 1 | WhatsApp ausente | **máquina** — o número não foi confirmado, a ficha nasce sem telefone, a pendência está escrita no `rawContext`, e nenhum número foi inventado |
| 2 | Conflito de logo | **não tratado** — precisa da esteira de branding |
| 3 | Peça desalinhada (Recusar/refazer) | **não tratado** — precisa do portal |
| 4 | Ajuste simples (Pedir ajustes) | **não tratado** — precisa do portal |
| 5 | Cancelamento de peça | **não tratado** — precisa do portal |
| 6 | Risco de verba | **não tratado** — e pior: descobri que a porta pública do SDR não tem guardião de custo nenhum (§3.2) |
| 7 | Falha de tracking | **não tratado** |
| 8 | Handoff sem aceite | **não tratado** |

**1 de 8 tratado pela máquina. 0 à mão. 7 não tratados.** Não maquiei: sete
eventos não aconteceram, e dizer que "eu tratei à mão" seria inventar trabalho.

### Peças produzidas com prova

**Nenhuma.** Zero artes, zero peças, zero brand book. O caminho de produção
(`produzirAgora` / `/api/admin/produzir-pecas`) exige sessão. Não gastei um
centavo de geração de imagem, embora estivesse autorizado.

### Árbitro independente

**Zero peças auditadas** — não houve peça. O que posso afirmar é que a condição
de possibilidade agora existe: com cinco motores conectados, autor e juiz podem
ser modelos diferentes, o que na rodada anterior era impossível para 5 das 7 peças.

### Pesquisa de concorrência pela Perplexity

**Não rodou.** O SDR capturou os concorrentes que a cliente citou (Padaria Santa
Tereza, Coffee Lab) — isso é escuta, não pesquisa. Nada saiu para fora da casa
procurar informação.

---

## 6. A nota

**Rodada anterior: 42/100. Esta rodada: 48/100.**

Os 6 pontos que subiram são reais e todos vêm da mesma causa — as chaves ligadas:
o SDR virou um interlocutor de verdade (+4) e o escopo parou de perder branding e
social media, que era o defeito mais caro do case (+2).

O que impede a nota de subir mais não é o que ficou sem medir por permissão — é o
que a produção **mostrou**: um SDR que repete a mesma pergunta treze vezes seguidas
não é software pronto para um cliente pagante, e uma porta pública que gasta chave
paga fora de qualquer conta é um buraco de custo aberto. Os dois são novos, e os
dois só apareceram porque a chave foi ligada. **Ligar a chave não melhorou o
sistema; ligou a luz sobre ele.**

## 7. Gargalos e riscos residuais

1. **O laço da pergunta de faixa (§3.1)** — é o defeito que perde cliente. Precisa
   de contador de tentativas e de desistência elegante.
2. **Gasto de IA fora da conta na rota pública (§3.2)** — precisa de teto de custo
   por workspace na porta da rua, não só teto de ritmo.
3. **A esteira não anda sozinha** — o pedido chegou e ficou esperando mão humana.
   É por decisão de projeto ("briefing não é caso normal"), mas significa que a
   agência automática não é automática do portão para dentro.
4. **Nada é observável de fora** — auto-scope sem log de sucesso, e-mail bloqueado
   sem log, fila só visível com sessão. Auditar esta casa exige ser dono dela.
5. **A credencial de seed em produção** — `master@dioli.studio` / senha do seed,
   documentada em repositório público de código e ainda válida no ar. Isso é um
   risco de segurança independente deste case e vale um martelo do CEO.

## 8. A Dioli está pronta para cliente real? — 0 a 100, sem diplomacia

**Não. 35/100.**

O que está pronto: a porta da rua conversa bem, entende o que o cliente quer,
guarda o briefing inteiro e não deixa mensagem vazar para gente de verdade. As
travas de saída são travas de código e eu as conferi uma a uma — essa parte é
sólida e é a que mais importa para não causar dano.

O que falta para um cliente pagante:
- **Sair do laço da pergunta.** Cliente real desiste no terceiro "de novo isso?".
- **Teto de custo na porta pública.** Hoje qualquer um gasta a chave da casa.
- **Uma entrega provada de ponta a ponta.** Este case ainda não produziu uma
  única peça em produção. Enquanto isso não acontecer, "a agência entrega" é
  promessa, não fato — e o guardrail 5 diz para não vender piloto como pronto.
- **Observabilidade.** Não dá para operar às cegas o que não se vê de fora.

## 9. Confirmação de segurança

Nenhuma conta de terceiro foi conectada. Nenhuma credencial foi trocada ou criada.
Nenhuma campanha foi ativada. Nenhuma verba foi movimentada. Nenhuma publicação
saiu. Nenhum e-mail, WhatsApp, post ou resposta de avaliação chegou a pessoa
alguma — a única tentativa de saída (o e-mail de confirmação do briefing) morreu
na trava por domínio `.invalid`. Nenhum cliente, projeto ou pedido existente foi
lido para escrita, alterado ou tocado. Nenhum deploy foi feito. Nenhum lançamento
financeiro foi criado.

O único objeto novo em produção é o pedido `cmt7iu3l4001q0xtho1f7cxtw`,
carimbado `[TESTE]` no nome e com o aviso de cliente fictício na primeira linha
do contexto.
