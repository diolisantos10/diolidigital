# A jornada do parceiro, medida de ponta a ponta

> **Pedido:** Diretor Geral (`control-room-d4`), 28/08/2026 — *"monte a travessia
> inteira num banco de teste, com o modelo de IA dublado, e me diga onde ela quebra."*
> **Executado por:** Diretor da Dioli Digital (sessão `diolidigital-f0`).
> **Custo:** zero. Nenhuma chamada de IA, nada em produção, nenhum e-mail enviado,
> nenhum pagamento registrado. A IA está dublada e o banco é um SQLite descartável.

**A medição é executável, não é leitura:** `__tests__/comercial/a-jornada-do-parceiro.test.ts`
— 14 testes, banco real, **10 mutações rodadas**.

---

## ⛔ A RESPOSTA CURTA: um defeito bloqueia, e ele é o mesmo de 27/08

**O parceiro AINDA vai ser perguntado sobre a verba mensal.** É a pergunta que
travou a conversa do primeiro cliente real às 13:43 de 27/08, e ela continua de pé.

A jornada **não morre** por causa disso — existe uma via de recuperação que salva
o pedido em até 5 minutos. Mas o Marcos vai viver a mesma cena que travou o
FOOCCI: responder uma pergunta sobre dinheiro que a parceria torna irrelevante, e
ver o botão de fechar o pedido continuar cinza.

---

## Os seis pontos, um a um

### 1. O `?convite=` chega ao servidor em todo turno? ✅ **SIM**

| Elo | Arquivo e linha |
|---|---|
| Lê da URL | `PublicBriefingRoom.tsx:1053` (`conviteDaUrl`) |
| Viaja no corpo de **todo** turno | `PublicBriefingRoom.tsx:1088` |
| Servidor resolve | `app/api/sdr/chat/route.ts:766` (`resolverConviteDeParceria`) |

**Sobrevive a recarregamento no meio do briefing.** A função lê
`window.location.search` **a cada turno** — não é estado guardado na memória da
sala, que se perderia no reload. E **nada na sala reescreve a URL**: varri
`replaceState`, `pushState`, `router.replace` e `router.push` em
`PublicBriefingRoom.tsx` e em `app/briefing/page.tsx` — **zero ocorrências**. O
`?convite=` continua na barra de endereço e continua sendo lido.

**Medido:** teste 1 (o token resolve e devolve o cliente) e 1b (token inventado
vale o mesmo que nenhum).

### 2. `budget_range` sai da fila? 🔴 **NÃO — este é o defeito**

`dispensadoDeVerba` (`question-engine.ts:1030`) lê `state.parceriaDeclarada`.
Esse campo:

- **existe** no tipo — `briefing-conversation.ts:292`
- **é lido** — `question-engine.ts:1031`
- tem um comentário ao lado dizendo *"o SERVIDOR preenche a partir de
  `IsencaoDeParceria`"* — `question-engine.ts:767`
- **e nenhuma linha de produção escreve nele.**

Varri o repositório inteiro: `parceriaDeclarada` aparece em **5 lugares** — a
declaração do tipo, o comentário, a leitura, e **duas linhas de um teste que
monta o estado à mão**. Produção: zero.

**Por que ele nunca é preenchido, mecanicamente:** quem decide a fila de perguntas
é o `question-engine`, e ele **roda no navegador** (a sala é client component — o
próprio `parceria-declarada.ts` documenta isso no topo, foi o que reprovou um
build). O servidor resolve o convite, mas devolve apenas
`{ok, reply, needsClarification, scope}` (`sdr/chat/route.ts`, retorno final) — a
parceria que ele descobriu **nunca volta** para quem decide a pergunta. O
`ConvState` é remontado em `PublicBriefingRoom.tsx:1676` sem o campo.

O convite, no servidor, alimenta só duas coisas: o **bloco de prompt**
(`route.ts:771`) e o **rastro** (`route.ts:917`). *Prompt é sugestão; a fila de
perguntas é mecanismo — e o mecanismo não foi ligado.*

**Consequência para o Marcos, amanhã:**
- ele é perguntado *"qual faixa de orçamento mensal você tem em mente?"*
- o botão de fechar o pedido **fica travado** (`canSubmitProposal` exige fila
  vazia, `sdr-agent.ts:374`)
- **o pedido nasce assim mesmo**, pela via de recuperação — em até 5 minutos

**Medido:** testes 🔴2 e 🔴2b. Eles **afirmam o defeito de hoje** de propósito:
quando o conserto chegar, eles falham, e é assim que avisam.

> **A boa notícia dentro da má:** a régua da promoção
> (`regua-da-conversa-completa.ts:73`) **não exige verba**. Por isso o pedido
> nasce apesar da pergunta. Se ela exigisse, a jornada estaria morta.

### 3. O e-mail sai para o contato do briefing? ✅ **SIM**

O cadastro do parceiro **nasce sem e-mail** — então o único endereço que existe é
o que ele digita na conversa. Ele chega ao pedido: a promoção grava
`contato: rastro.contato` no `briefingJson`
(`promover-conversas-paradas.ts:210`), e `lerContato` o lê de lá.

**A trava contra contato falso não barra endereço legítimo.** Ela testa
`/\.invalid$/i` — o **TLD no fim**, não a palavra no meio
(`cliente-falso/trava-de-saida.ts:156`). Conferido nos três casos:

| Endereço | Resultado |
|---|---|
| `marcos@foocci.com.br` | ✅ passa |
| `qualquer@cliente-falso.invalid` | 🔒 barrado (é para isso que ela existe) |
| `fulano@x.invalid.com.br` | ✅ passa — domínio real não é censurado |

**Medido:** testes 5b e 5c.

> ⚠️ **Sem contato declarado o pedido nasce `lead_incompleto`** — e isso é
> desenho, não defeito: faltar canal impede AVISAR, nunca ATENDER. Mas significa
> que **se o Marcos não digitar um e-mail na conversa, nenhum e-mail sai.** O
> orçamento fica no portal e ninguém o avisa.

### 4. A proposta mostra a isenção antes do número? ✅ **SIM**

- A seção da isenção é renderizada **antes** do texto e do valor —
  `app/proposta/[token]/page.tsx:276`, com o comentário explicando que a posição
  É a ordem.
- **O botão não convida a pagar:** sob isenção o rótulo vira *"Aceitar o escopo e
  começar"* em vez de *"Aceitar e começar"* — `page.tsx`, no bloco do botão.
- A rota **preenche** a isenção de verdade:
  `app/api/portal/briefing/proposta/route.ts:100` chama `parceriaVivaDoCliente`.
  Fail-closed: todo `null` vira pagante.
- A frase que ele lê: *"Este orçamento está 100% isento por parceria."* + *"nada
  será cobrado"* + o prazo. **Sem preço na frase** — ordem do CEO de 27/08.

**Medido:** teste 6b (alcança o TEXTO que o cliente lê, não a estrutura).

### 5. A esteira anda sem pagamento? ✅ **SIM**

Travessia executada, com escrita real em SQLite:

1. rastro carimbado com o cliente do convite (`clienteDoConvite`)
2. o relógio promove o rastro a **pedido do parceiro** — `promovidos[0].clientId`
   é o cadastro certo
3. a **isenção nasce derivada** da parceria, com os mesmos termos (teto e peças
   conferidos contra a autorização), e a observação diz *"derivada da parceria"*
4. o portão devolve **`parceria_isenta`** — liberado
5. ⛔ **zero linhas em `PagamentoConfirmado`** — nenhum pagamento falso de R$ 0

**Medido:** testes 3, 4, 5, 6 e 7.

### 6. Quantos empurrões manuais? **ZERO depois que ele entra. QUATRO antes.**

**Depois que o Marcos abre o link, ninguém clica em nada.** A conversa vira
rastro sozinha, o relógio promove sozinho (`despertador.ts:1014`), a isenção
deriva sozinha, o portão abre sozinho.

**Antes, quatro atos — e os quatro exigem decisão humana, não são defeito:**

| # | Ato | Defeito da casa ou decisão humana? |
|---|---|---|
| 1 | Criar o cadastro do cliente | **decisão humana** |
| 2 | Autorizar a parceria (dono nominal, validade, teto) | **decisão humana** — e tem de ser: parceria sem dono é buraco |
| 3 | Cunhar o convite | **decisão humana** — é a entrega de uma credencial |
| 4 | Entregar o link ao Marcos | **decisão humana** |

**Nenhum dos quatro é defeito.** São exatamente os atos que a casa decidiu que
uma pessoa assina. O que é defeito é o ponto 2 — e ele não é empurrão manual, é
uma pergunta a mais na cara do parceiro.

---

## As 10 mutações rodadas — o que o teste realmente morde

Commitei **antes** de mutar. Cada mutação foi **executada**, não raciocinada.

| # | A mutação | Derrubou |
|---|---|---|
| 1 | o portão para de derivar a isenção | ⚠️ **NADA — sobreviveu** |
| 2 | a promoção para de derivar a isenção | teste 5 |
| 3 | **as duas** derivações somem | testes 5 e 6 |
| 4 | o rastro deixa de carimbar o cliente do convite | testes 3, 4, 5, 6 |
| 5 | a validade da parceria deixa de valer | ⚠️ **sobreviveu na 1ª rodada** |
| 5' | idem, depois de eu fechar o buraco | teste 1c |
| 6 | revogação deixa de matar o convite | testes 1c, 1d, 4, 5, 6 |
| 7 | a promoção deixa de levar o contato | teste 5b |
| 8 | a trava `.invalid` vira `includes` | teste 5c |
| 9 | a frase da isenção passa a carregar preço | teste 6b |
| 10 | a rota da proposta esquece a parceria | ⚠️ **NADA — sobreviveu** |

**As duas sobrevivências que importam, e o que elas significam:**

- **Mutação 1 sobreviveu porque as duas derivações são redundantes** — a promoção
  já derivou. A mutação 3 (remover as duas) mata. Isso não é buraco do teste: é
  o desenho da casa aparecendo na medição. Uma via cobre a outra.
- **Mutação 5 sobreviveu** porque minha primeira versão só exercitava o caminho
  feliz — a parceria nascia viva, então apagar a checagem de validade não mudava
  nada. **Consertei**: os testes 1c (parceria vencida) e 1d (parceria revogada)
  entraram e matam o mutante. *Teste que só roda o caminho feliz não prova a
  trava; prova o contrário dela.*
- **Mutação 10 sobreviveu e NÃO consertei** — ver a dívida abaixo.

---

## ✅ ADENDO DE 28/08/2026 — as dívidas foram fechadas

O diagnóstico abaixo foi escrito ANTES do conserto e das dívidas fechadas. O que
mudou desde então, e vale mais que o texto original onde os dois divergirem:

### O defeito do ponto 2 foi CONSERTADO (PR #372, mergeado)

A rota do SDR passou a devolver `parceria` (derivada do token, nunca do corpo),
`lerParceriaDoServidor` virou a fronteira que converte e recusa o ilegível, e a
sala escreve o campo via `comParceria` — em `useRef`, porque `runTurn` é um
`useCallback` sem esse valor nas dependências.

### As três dívidas declaradas, e o que aconteceu com cada uma

| Dívida original | Estado |
|---|---|
| a mutação 10 sobreviveu (a rota da proposta) | ✅ **fechada** — `a-proposta-do-parceiro-atravessa-a-rota.test.tsx` chama a rota real contra banco real e **mata a mutação (4 testes caem)** |
| nada foi renderizado | ✅ **fechada** — o HTML é renderizado com `renderToStaticMarkup` a partir do **corpo que a rota devolveu**, nunca de objeto montado à mão |
| a perna do e-mail não foi disparada | ✅ **fechada sem enviar** — `sendEmail` dublado, a rodada roda inteira e o que passaria pela porta é **medido**: destinatário e corpo |

### A mutação que me pegou nesta rodada

Inverti a ordem dos blocos na tela e **meu próprio teste continuou verde**. A
causa: a frase da isenção aparece **duas vezes** no HTML — na seção destacada e
dentro do corpo do orçamento (`textoDoOrcamento` também a inclui). O `indexOf`
pegava a de dentro do texto, que vem antes do número de qualquer jeito, e eu
media a ordem do **texto** em vez da ordem da **tela**.

Corrigido para medir o `aria-label` da seção, que existe uma vez só. *Régua
verde sobre o componente errado é pior que régua nenhuma.*

### A mutação que sobreviveu por REDUNDÂNCIA, e fica assim

"O portão para de derivar a isenção" sobrevive porque a promoção já derivou;
remover as duas mata. **É desenho redundante aparecendo na medição, não buraco
de teste** — avaliado e aceito pelo Diretor Geral em 28/08. Não gastar tempo nela.

### O que CONTINUA não provado

- **Que o Resend aceita a mensagem e que ela chega à caixa de entrada.** Só se
  prova enviando, e enviar a pessoa real é proibido.
- **A sala de briefing não foi renderizada** (a da proposta foi). Renderizar um
  componente COM ESTADO exigiria `@testing-library/react` + jsdom, que este repo
  não tem — o vitest roda em `environment: "node"`. É decisão de
  infraestrutura, não de esforço.
- **Nenhuma conversa real foi rodada**: a IA está dublada em toda parte.

---

## 🚩 O que eu NÃO consegui provar

Ponto fraco declarado é dívida; silencioso é armadilha.

1. **O ponto 4 não passa pela rota.** Meu teste 6b chama `parceriaVivaDoCliente` e
   `textoDaIsencao` **do mesmo jeito que a rota chama** — mas não chama a rota. A
   mutação 10 (a rota esquecer a parceria) **sobreviveu**, e isso é exatamente a
   doença que esta casa mediu dez vezes: duas metades provadas e nada ligando as
   duas. **A ligação entre a rota da proposta e a tela continua não medida.**
2. **Nada foi renderizado.** A ordem visual (isenção antes do número) e o rótulo
   do botão foram lidos no JSX, **não vistos**. Não rodei Playwright nesta frente.
3. **A sala não foi exercitada no navegador.** Os testes 2 e 2b chamam o motor de
   regras direto (`initProspectConvState` + `processProspectMessage`), que é o
   mesmo código que a sala roda — mas não é a sala com o `fetch` de verdade.
4. **A perna do e-mail não foi disparada.** Provei que o endereço **chega ao
   pedido** e que a trava **não o barra**. Não provei que `orcamento-do-briefing.ts`
   efetivamente monta e envia — isso mandaria e-mail, e era proibido.
5. **A IA está dublada e devolve falha.** Se o SDR depender do modelo para
   extrair algo que o motor de regras não extrai, esta travessia não veria.
6. **Não medi tempo real.** "Até 5 minutos" é a cadência declarada do despertador,
   lida no código — não cronometrada.

---

## O que precisa acontecer antes de amanhã de manhã

**A frente 1 é a única que muda o que o Marcos vive.** As outras são dívida.

| # | Frente | Efeito |
|---|---|---|
| 1 | 🔴 **Fazer o servidor devolver a parceria à sala** e a sala preencher `parceriaDeclarada` | o parceiro para de ser perguntado sobre verba, e o botão destrava |
| 2 | Teste que atravessa a **rota** da proposta (mata a mutação 10) | fecha a dívida 1 |
| 3 | Screenshot da proposta isenta em 375px | fecha a dívida 2 |

**Se a frente 1 não for feita até amanhã**, a jornada **funciona assim mesmo** —
com uma pergunta constrangedora e uma espera de até 5 minutos entre o fim da
conversa e o pedido nascer. É feio, não é fatal. **Essa é a lista honesta.**
