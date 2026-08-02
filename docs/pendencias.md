# Pendências — o que está aberto

> Última atualização: 01/08/2026.

---

## 🧹 Limpeza executada em produção — 01/08/2026

A casa foi zerada a pedido do CEO, no modo **Opção A** (`keep-clients`).

**Apagado:** 1 projeto, 2 entregas, 4 tarefas, 26 artefatos, 11 aprovações,
14 evidências, 10 acessos de portal, 4 conversas do portal, 4 aprendizados
pendentes do Brain, 2 eventos de atividade.

**Preservado:** os 2 cadastros de cliente, as **7 solicitações** (todas de volta
ao status `new`), os 182 insights do Radar, as 3 integrações e o login.

**Observação de quem executou — e virou conserto no mesmo dia:** não havia
**nenhum** `BrandBrain` em produção. O que a Opção A prometia preservar de mais
valioso (cores, tom de voz, público) simplesmente não existia: **o sistema nunca
gravou marca de cliente nenhum.**

A causa: o `BrandBrain` só era escrito por formulário manual da agência ou por
aprendizado que alguém precisava aprovar — e numa agência sem gente olhando,
isso significa nunca. O motor lia a marca, encontrava vazio, **não avisava nada**
e produzia peça genérica.

✅ **Resolvido em `42d284d`:** o briefing do cliente vira `BrandBrain` no momento
em que o projeto nasce. Nunca sobrescreve ajuste manual, e nunca inventa — campo
que o cliente não contou fica vazio, e vazio é o que faz o especialista pedir o
material em vez de chutar.

**Duas das 7 solicitações preservadas são lixo de teste** —
`UI Bridge Test 1781835336580` e `Dioli Digital Studio` (a própria agência).
Ficaram de pé porque a ordem foi preservar as solicitações; apagá-las é decisão
do CEO, e o modo `everything` ou uma exclusão pontual resolve.

`ALLOW_PRODUCTION_RESET` foi ligada para a operação e **desligada em seguida**.

---

## ✅ AÇÃO DE SEGURANÇA — RESOLVIDA em 01/08/2026

**As três credenciais expostas foram revogadas pelo CEO** — confirmado no
`HANDOFF.md` rev.2 (commit `465cf05`). Fica o registro do que aconteceu e do que
foi rotacionado:

| Credencial | Onde regenerar | Urgência |
|---|---|---|
| **App Secret da Meta** | painel Meta for Developers → Configurações básicas | **alta** — assina os webhooks |
| **Token de projeto do Railway** | Railway → Account Settings → Tokens | **alta** — dá acesso ao deploy e às envs |
| **Token do WhatsApp** (número de teste) | painel Meta → WhatsApp → API Setup | média — expira sozinho em ~24h |

Depois de regenerar, atualizar as variáveis `META_*` no Railway.

> Por que isso é grave e não burocracia: o App Secret é o que valida a assinatura
> dos webhooks. Quem o tiver pode forjar evento entrando no sistema como se fosse
> a Meta. O token do Railway dá acesso ao deploy e a todas as variáveis de
> ambiente — inclusive às outras credenciais.
>
> Origem: `HANDOFF.md` §f da branch `claude/meta-integration-axrlf3`
> (commit `7116cbb`).

---

## 🔴 P0 — o piloto roda sem rede embaixo

**Decisão do CEO (31/07/2026): o piloto roda 100% IA, sem revisão humana.** Nada
disto abaixo é teórico — é o que está entre um erro do modelo e um cliente pagante.

### 1. Os quality gates não protegem nada
Das **31** checagens em `lib/dioli-brain/quality-gates.ts`, **28 são
`autoCheckable: false`** — texto descrevendo o que um humano deveria conferir.
**Só 3 rodam.**

Com revisão humana era um checklist. Sem revisão humana é **decoração** — e as
quatro desligadas que mais importam são exatamente as falhas que chegam no
cliente: *sem alucinação*, *respeita a marca*, *corresponde ao briefing*, *riscos
verificados*.

**O que precisa existir:**
1. Piso determinístico — afirmação conferida contra `ClientKnowledgeSnapshot`
   (nome, número, prazo, serviço contratado)
2. LLM-judge para os subjetivos, com reprovação **bloqueante** e indisponibilidade
   **não-bloqueante**
3. Default do registry invertido — departamento sem gate executável = **REPROVADO**
4. Escada por departamento — sombra até haver evidência

> **Nota de procedência:** esta pendência esteve arquivada por engano no
> repositório do Foocci até 01/08/2026. Conferido: o Foocci não tem nenhuma
> ocorrência de `autoCheckable`. Uma pendência na casa errada não é etiqueta
> trocada — é uma pendência que ninguém pega.

### 2. A verdade do cliente é montada no cliente
`reason.ts` ainda depende de contexto entregue de fora — o próprio cabeçalho diz
*"Phase 2 will add ClientKnowledgeSnapshot"*. Enquanto o servidor não ler a verdade
do banco por conta própria, o raciocínio confia no que lhe entregam.

### 3. Escada por departamento não existe
Departamento novo deveria nascer em SOMBRA e subir com evidência. Rodar 100% IA
**não** significa pular a escada — significa que a escada é a única proteção que
sobrou.

---

## 🟠 A agência NÃO roda 100% no automático — auditoria de 01/08/2026

Pergunta do CEO, respondida contra o código (não contra este documento). O
diagnóstico antigo do `BACKLOG.md` — *"a tarefa não aciona o agente"* — **está
desatualizado**: o motor existe, produz com IA de verdade e dispara sozinho.
O problema mudou de lugar.

**O trecho que roda sozinho, hoje, de verdade:**
cliente aprova a proposta no portal → `app/api/portal/approvals/route.ts:125`
dispara `runProjectExecution` → o PM ordena os departamentos → Social, Design,
Tráfego e Analytics produzem com IA (`lib/agency/execution/run-execution.ts:268`)
→ um auditor LLM lê cada peça e manda refazer uma vez se reprovar → a entrega é
gravada e a tarefa fecha ligada a ela. Faltando material, o agente abre o pedido e
o PM cobra o cliente numa mensagem só.

**Três dos cinco furos foram FECHADOS em 01/08/2026** (ver commits `0c78044`,
`d1cbbe2`, `4b0e953`). O que sobrou e o que caiu:

| # | Furo | Estado |
|---|---|---|
| 1 | **A peça pronta não chegava ao cliente sozinha.** O pacote ficava pronto dentro da agência esperando alguém clicar. | ✅ **FECHADO** — `runProjectExecution` chama `apresentar` quando o pacote fecha. Só apresenta o pacote inteiro; metade não vai. |
| 2 | **"Material chegou → produz sozinho" não existia.** | ✅ **FECHADO** — `lib/agency/esteira/materiais.ts`. "Recebido" re-enfileira a produção, zera o contador de tentativas, e o cliente nunca é cobrado duas vezes pelo mesmo material. |
| 3 | **A rede de segurança estava desligada.** Nada re-tentava o que falhava. | ✅ **FECHADO** — o despertador (`lib/agency/despertador.ts`), ligado pelo `instrumentation.ts`, roda dentro do app a cada 5 min. Sobe junto com o deploy. |
| 4 | **A produção não começa sem alguém aprovar a direção** (`run-execution.ts`). | 🟡 **ABERTO POR ESCOLHA** — é proteção deliberada. Aprovar direção é barato; refazer um mês, não. Só vira furo se o CEO decidir que o cliente não precisa avalizar o rumo. |
| 5 | **Nada impedia uma peça errada de sair.** | 🟠 **METADE FECHADA** — a apresentação automática agora é **barrada** quando a Qualidade deixa ressalva, e o bloqueio vira `ActivityEvent`. Mas os 31 portões formais seguem com 28 desligados (P0 acima), e o auditor continua sendo um LLM sem piso determinístico. |

**Veredito novo (01/08, fim do dia):** a agência roda sozinha de *"cliente
aprovou a direção"* até *"pacote apresentado no portal do cliente"*, 24h, se
recuperando de falhas e destravando quando o material chega. O que ainda exige
gente é **antes** (avalizar a direção — de propósito) e o **piso de qualidade**,
que continua sendo o P0 da casa.

---

## 🔌 Integrações: escopo separado ✅ · tela do cliente ainda aberta

Levantado pelo CEO em 01/08/2026, e conferido no catálogo: **das 17 integrações,
5 estão na tela errada.**

A pergunta dele resume o problema: *"o que eu vou conectar aqui o Google
Analytics? De quem?"*

**Existem dois grupos, e eles não têm o mesmo dono:**

| Grupo | Quem é o dono da conta | Onde deve ser conectado |
|---|---|---|
| **Ferramentas DA AGÊNCIA** — provedores de IA (6), Canva/Gamma/CapCut (3), Drive (1), Zapier/Make (2) | a Dioli, uma assinatura só, serve todos os clientes | ✅ onde está hoje: `/agency/integrations` |
| **Ferramentas DO CLIENTE** — Meta Ads, Google Ads, Instagram/Facebook, GA4, Search Console | **cada cliente**, com a conta dele | ❌ hoje estão na tela da agência; deveriam estar **no painel daquele cliente** |

**Por que isto não é organização de tela — é impedimento operacional:**

- Conectar "Google Analytics" numa tela global **não tem significado**: analytics
  de qual negócio? A tela pede uma credencial que não existe em nível de agência.
- Com 5 clientes entrando, cada um tem o próprio Instagram, o próprio Google Ads
  e o próprio GA4. Uma conexão global só consegue atender **um** deles.
- O cliente precisa poder **autorizar e revogar** o acesso da agência às contas
  dele. Isso é exigência da Meta e do Google, e é o mínimo de respeito com quem
  paga: a autorização é dele, não nossa.

**A boa notícia — o banco já está certo, só a tela não está.** `MetaConnection`
já tem `clientId` (nulo = conta da própria agência, preenchido = conta do
cliente). O desenho de dados já previa a separação; a interface é que juntou
tudo numa lista só.

**Feito** (commit `e7b2c37`):

1. ✅ `IntegrationScope` separa `agencia` de `cliente`, derivado da categoria.
2. ✅ A tela da agência mostra só as 12 dela; as 5 do cliente aparecem em seção
   própria, marcadas "no painel do cliente", **com a explicação do porquê** —
   sumir sem dizer nada faria a próxima pessoa procurar função perdida.
3. ✅ Teste de regressão: nada com "google ads", "analytics", "search console"
   ou "meta ads" no nome pode cair na lista da agência.

**Ainda aberto:**

4. As 5 do cliente **têm o lugar certo marcado, mas ainda não têm a tela** no
   painel dele — nem a autorização pelo próprio portal, que é o desenho certo.
5. Na tela da agência, mostrar por cliente **o que falta conectar** — hoje não
   há como saber que o cliente X está sem GA4 até alguém procurar.

> Google Ads, GA4 e Search Console **ainda não têm código de conexão nenhum** —
> estão no catálogo como intenção. Meta é a única do grupo do cliente que está
> realmente construída.

---

## ✅ A solicitação órfã de workspace — RESOLVIDA em 01/08/2026

Descoberto em 01/08/2026 ao tentar apagar as solicitações de teste: **6 das 7
solicitações em produção estavam com `workspaceId` NULO.**

**Por que acontece, e é legítimo:** quem preenche o briefing público não está
logado e não tem como saber a que workspace pertence. A solicitação entra sem
dono.

**O que isso quebrava, e era bem maior que a limpeza:** as rotas de admin
filtravam por workspace e respondiam *"Solicitação não encontrada"* para
briefings que **existiam e apareciam na tela** — atingindo `status`, `fire`,
`send-proposal`, `diag-ai` e `delete`. Um briefing real ficava invisível para
quem tentasse agir sobre ele pelo caminho administrativo.

**Remendo aplicado** (commit `e1fa120`): a rota aceita `workspaceId` nulo junto
com o da sessão. Não afrouxa o escopo — solicitação órfã não pertence a *outro*
workspace, ela não pertence a nenhum.

**Conserto de raiz feito** (commit `99e93c6`):

1. ✅ O serviço de criação resolve o workspace quando o formulário não informa —
   com uma agência só, existe um e é aquele. **Quando houver mais de uma, a
   escolha volta a ser obrigatória e explícita** (link, subdomínio ou token do
   formulário): adivinhar entre duas seria pior que o nulo, porque mandaria o
   briefing de um cliente para a caixa de entrada de outra agência.
2. ✅ As 3 órfãs que restavam foram adotadas em produção. As 4 solicitações vivas
   têm dono.
3. Fica o alerta para quem vier: **rota nova que filtre por workspace deve
   lembrar que o sintoma engana** — parece dado inexistente, e é dado escondido.

---

## ✅ Solicitações de teste apagadas — 01/08/2026

Ordem do CEO. Sobraram **4**, todas em `new`: Beatriz, Camila Pereira,
Dioli Digital Studio e Sushi Cazza.

Apagadas: `Diego` (Restaurante, 28/07), `Diego` (Agência, 23/06) e
`UI Bridge Test 1781835336580`. Nenhuma tinha projeto, entrega ou tarefa.

> **Decisão junto:** a própria agência entra como **cliente normal**, sem caso
> especial. Caso especial vira segundo caminho no código, e o menos testado
> quebra primeiro. De quebra, a Dioli passa pela própria esteira — se o pacote
> que ela produz para si é ruim, isso aparece antes de um cliente pagante ver.

---

## 🧪 O PRIMEIRO PROJETO RODOU DE PONTA A PONTA — 01/08/2026

Rodado em **produção**, com a própria Dioli como cliente. Não é simulação: é o
caminho inteiro, com IA de verdade, no banco de verdade.

**O que funcionou sozinho, sem ninguém clicar:**

| # | Etapa | Resultado |
|---|---|---|
| 1 | Agência envia a proposta | ✅ proposta gerada com IA, portal criado, aviso na fila |
| 2 | Cliente aprova no portal | ✅ **projeto criado e produção disparada automaticamente** |
| 3 | Portão de direção | ✅ segurou a produção até o cliente avalizar — como desenhado |
| 4 | Cliente aprova a direção | ✅ produção rodou |
| 5 | Produção | ✅ **6 entregas** por 6 especialistas de 3 departamentos |
| 6 | Qualidade audita | ✅ 4 aprovadas, **2 reprovadas com crítica específica e justa** |
| 7 | Apresentar ao cliente | ⛔ **BARRADO pela Qualidade** — e registrado |

**O freio funcionou.** As duas ressalvas não são implicância: *"operacionalização
fraca, nomenclatura imprecisa"* e *"carece de profundidade técnica, fontes
documentadas"*. Um humano assinaria embaixo.

### ✅ O buraco que isto revelou — FECHADO no mesmo dia

**Era: o pacote travado e ninguém sabia.**

- A Qualidade barrou, o bloqueio virou `ActivityEvent`… e **nenhuma tela mostra
  isso**. Conferido: nenhum componente lê `apresentacao_bloqueada` nem
  `quality_flag`.
- **Nada tenta resolver.** O motor é idempotente: re-rodar pula quem já produziu,
  então a entrega reprovada nunca é refeita. O despertador também não mexe nela.
- Resultado: o projeto fica **vivo no papel e parado na prática**, exatamente o
  mesmo padrão do buraco do material que fechamos hoje de manhã — só que um
  passo adiante na esteira.

**Decidido pelo CEO em 01/08/2026: refaz sozinha até 2 tentativas, depois chama.**
As outras duas saídas foram recusadas com motivo — chamar direto põe o CEO no
caminho de todo projeto (com 5 clientes, é ele olhando pacote todo dia), e
apresentar com ressalva anula o único freio da casa.

Construído em `lib/agency/esteira/pacote-travado.ts` + `GET /api/pacotes-travados`,
rodando pelo despertador.

**E o destravamento revelou mais um furo, também fechado:** com as peças
refeitas, a passada seguinte **não produzia nada** (tudo já existia, o motor é
idempotente) — e a apresentação exigia "algo produzido nesta passada". O pacote
ficava pronto e mudo. A pergunta certa não é *"produzi agora?"*, é *"o pacote
está inteiro?"*.

### 🏁 O ciclo fechou — verificado em produção

Estado final do projeto piloto, conferido no banco:

- 6 entregas, **todas aprovadas pela Qualidade** (as 2 reprovadas foram refeitas
  sozinhas e passaram na versão 3)
- **`presentedAt` preenchido**, execução `done`
- O cliente vê **7 itens no portal** e recebeu a mensagem do gerente:
  *"Terminamos! 🎉 Preparei as suas 6 entregas e revisei tudo antes de te mostrar"*
- **Zero pacotes travados**

**Do briefing ao pacote no portal do cliente, sem um clique humano no meio** —
exceto os dois avais que o cliente dá de propósito (proposta e direção).

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Gemini é stub | `lib/ai/gemini-provider.ts` não está implementado — o registry oferece um provedor que não existe |
| Canvas nunca vira documento entregável | O motor produz, o cliente não recebe |
| Sem `middleware.ts` | Sessão validada em cada layout e handler — fácil esquecer um |

---

## 🧍 Fora do código — depende de gente

- **Compilar e arquivar os chats antigos.** Ver `docs/arquivo/README.md` para o
  protocolo. **Nenhum chat é fechado antes de exportado e minerado.**
- **Definir se o piloto sobe antes ou depois do P0 acima.** É decisão do CEO, e
  hoje a resposta honesta é: sem os gates, sobe sem proteção.
- **A senha do master mora no Railway — e é o único lugar onde ela existe.**
  Conferido no painel em 01/08/2026: `SEED_MASTER_PASSWORD` e `SEED_STAFF_PASSWORD`
  **estão definidas** em produção, e o login com elas funciona. A senha `dioli2025`
  dos scripts do repositório é rejeitada — ela não vale nada, e quem tentar por ali
  vai concluir errado que perdeu o acesso.

  Vale saber por quê, porque é frágil: o `seed-db.mjs` usa `INSERT OR IGNORE` (não
  toca usuário existente) e gera senha **aleatória a cada boot** quando a env não
  está definida. Se alguém apagar essas duas variáveis, a única via de recuperação
  é redefini-las e reiniciar — **não existe fluxo de "esqueci minha senha"** no
  sistema (`app/api/auth/` só tem `signin`, `signout` e o Google do briefing, que
  nem cria sessão).

  > A mensagem que o próprio seed imprime — *"use o fluxo de redefinição de
  > senha"* — **está errada**: esse fluxo não existe. Corrigir a mensagem, ou
  > construir o fluxo, é fila normal; sem isso a próxima pessoa perde uma hora
  > procurando uma tela que não está lá.

---

## ⏳ Aguardando terceiro — nada a configurar

### HTTPS do domínio raiz `diolidigital.com.br`
O `www` está no ar e responde HTTP/2 200. O **apex** (sem www) depende do Railway
emitir o certificado Let's Encrypt, automático depois de o DNS estabilizar.

Já feito no painel de DNS: `A` do apex → `69.46.46.22`, `MX` legado **removido**,
`TXT` de verificação adicionado, `CNAME` `www` → `g68qzvs8.up.railway.app`.

**Como confirmar** — de uma máquina normal, **não de dentro de um ambiente de
agente**: abrir `https://diolidigital.com.br` e ver o cadeado, ou
`curl -I https://diolidigital.com.br` devolver `HTTP/2 200`.

Se passar de ~2h, conferir no painel do Railway se o apex e o `www` estão listados
como **duas entradas separadas** de custom domain.

> Origem: `HANDOFF.md` §7.1 e §8.1 (commit `3f888f1`), minerado em 01/08/2026.

---

## 📡 Integração com a Meta — nada dispara sozinho hoje

Minerado do `HANDOFF.md` da branch `claude/meta-integration-axrlf3`
(commit `7116cbb`), em 01/08/2026. A camada está construída; o que falta é
ligação e aprovação de terceiro.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Template `proposta_pronta` PENDENTE na Meta** | Aviso de proposta **não é enviado** — o WhatsApp bloqueia mensagem proativa sem template aprovado |
| **Não há agendador chamando `/api/meta/dispatch`** (o `CRON_SECRET` **está** setado — conferido no Railway em 01/08; o que falta é quem chame) | Mesmo com template aprovado, o poll **nunca roda sozinho** e nada sai |
| **Token do WhatsApp é do número de teste, expira em ~24h** | O envio para de funcionar quando vencer. Para valer: token permanente de System User |
| **OAuth de IG/FB construído e NÃO testado ponta a ponta** | Publicação em IG/FB segue não verificada em produção |
| **App da Meta sem App Review nem verificação de negócio** | Só funciona com contas do próprio admin e com limite baixo. Falta ícone 1024×1024, URL de política de privacidade e categoria |
| **Número real da agência ainda não migrado para a API** | A caixa de entrada está pronta e vazia. **Decisão do dono** — migrar o número o remove do app do celular |

> **Armadilha que engana:** hoje tudo aponta para o **número de teste** da Meta,
> que só envia para destinatários pré-cadastrados no painel. O disparo "funciona"
> e não chega em ninguém de fora da lista.

---

## 🔧 A esteira comercial — o que está construído e o que trava

Minerado do `HANDOFF.md` rev.2 (commit `465cf05`), da sessão "chat da agência",
em 01/08/2026.

**O fluxo completo já existe ponta a ponta:**
`SDR briefing → auto-scope → agência envia proposta → cliente aprova no portal →
createProjectFromRequest → PORTÃO DE RECURSOS → runProjectExecution → entregas no
portal → cronograma`

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **"Material chegou → produz sozinho" não existe** | O portão segura a produção quando falta material, mas **nada retoma** quando o cliente envia. Projeto com material faltante fica **travado para sempre** |
| **O SDR está sendo refeito pelo Brain-mestre** | Se for reescrito sem cuidado, somem 3 regras já implantadas: espelhar a linguagem do cliente, perguntar recursos por serviço, e capturar canal + telefone. O front já grava `preferredChannel`/`prospectPhone` |
| **Aba "Entregas" lê do Zustand, não do banco** | Em `app/agency/projects/[id]/page.tsx`. Para projeto real de banco a aba aparece **vazia** — o trabalho existe e só é visto em `/agency/execution/[projectId]`. `/api/deliverables?projectId=` já devolve o conteúdo certo |
| **Entregas sem data — o Planner não é alimentado** | `/agency/planner` e o modelo `SocialPost` existem, mas o conteúdo produzido não entra com data. O cliente recebe conteúdo sem saber **quando vai ao ar** |
| **`ADMIN_TASK_SECRET` foi removido do Railway** | Está certo assim. **Se alguém re-adicionar, vira backdoor** que apaga e dispara dados de produção sem sessão |

**✅ Resolvido no caminho:** o envio real do WhatsApp. O gatilho
`ActivityEvent type="whatsapp_notify"` desenhado por esta sessão **agora é
consumido** pela camada Meta (`lib/integrations/meta/notifications.ts` + cron
`POST /api/meta/dispatch`, com outbox anti-duplicata). Falta só confirmar que o
cron está agendado de fato e que o telefone chega do briefing.
