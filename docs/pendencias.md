# Pendências — o que está aberto

> Última atualização: 03/08/2026 (dia do lançamento da Foocci).

---

## ✅ 03/08/2026 (tarde) — Os três especialistas-trava entregues e auditados

Ordem do CEO cumprida: `meta`, `google` e `tiktok` integrados com biblioteca
REAL capturada das plataformas — **51 documentos oficiais** (Meta 17, Google
19, TikTok 15), cada um com URL, data e hash; cartilha por plataforma com
citação afirmação-por-afirmação; recaptura diária agendada (rotina às 06:00
BRT: recaptura → diff → CHANGELOG → commit). Auditoria adversarial da
qualidade: **APROVADO** — 51/51 hashes íntegros, nenhuma afirmação inventada,
o agente meta barraria o incidente de hoje com 4 âncoras citáveis.

**As 3 correções obrigatórias da auditoria — feitas na mesma tarde:**
1. **Trava mecânica de consentimento em `avaliacoes.ts`**: a política da API
   do Business Profile proíbe resposta automática a avaliação sem
   "consentimento prévio e específico do usuário". Nova coluna
   `autoReplyConsentAt` na conexão; nula → nem elogio sai sozinho, tudo vira
   rascunho escalado. Testes provam os dois lados. **Pendência do CEO: o
   consentimento precisa entrar no contrato/onboarding do cliente** e ser
   registrado na conexão antes de ligar resposta automática.
2. Lacunas de meta/google registradas nos manifestos (recaptura tenta fechá-las).
3. Piso do capturador mede conteúdo útil, não tamanho bruto.

**Fragilidade declarada (não escondida):** a trava dos especialistas é
procedural — regra no manual de bordo, não mecanismo no código. Nada impede
`ads.ts`/`publishPost` de rodarem sem parecer. Mecanizar o parecer (registro
obrigatório antes de escrita externa) é o próximo degrau, a decidir com o CEO.

---

## 🔴 03/08/2026 (noite) — Recurso NEGADO; restrição mantida e se espalhando

- "Análise concluída — **Não removemos as restrições**" no mesmo dia: decisão
  automatizada, mantida. Pela fonte da biblioteca
  (`docs/plataformas/meta/fontes/recorrer-de-restricao.md`), o número de
  recursos é limitado e a decisão pode ser definitiva.
- **Efeito em cadeia confirmado:** o painel lista "The Face Store" (conta que
  nem aparecia na nossa listagem por API) como **Restrito** no mesmo
  portfólio — exatamente o risco que motivou a regra de não repetir automação.
- **Caminho limpo de hoje:** tráfego da Foocci MANUAL, por gente, na conta
  própria da Foocci (decisão que o CEO já tinha tomado). **NUNCA criar conta
  nova para contornar** — "contornar sistemas" é violação literal e derruba o
  portfólio inteiro.
- Recuperação de longo prazo da conta da agência: verificação de negócio +
  App Review + operação humana-primeiro; reavaliar com o especialista `meta`.

---

## 🔴 03/08/2026 (meio-dia) — Meta RESTRINGIU a conta de anúncios "Dioli Agencia"

E-mail da Meta às 11:32: conta `act_3416644181895443` desativada
(`account_status 2`, motivo: integridade — "criada ou usada com uma automação
que não segue nossas regras"). **Gatilho mais provável: a minha própria
operação por API** — campanha de teste criada e apagada + 36 uploads + campanha
em sequência rápida, num app em modo de desenvolvimento. Responsabilidade do
Diretor, registrada com todas as letras.

**Estado no momento da restrição:** campanha Foocci PAUSADA já criada
(`120251488825740613`), conjunto único BR criado, 36 imagens carregadas.
Anúncios ainda não criados (bloqueio anterior: app em modo dev).

**Caminho de recuperação (ação do CEO):** botão "Corrigir problema" do e-mail
ou Qualidade da Conta (business.facebook.com/accountquality) → Solicitar
análise. Falso positivo costuma voltar em horas/dias.

**Decisão de prudência:** NÃO repetir automação em outra conta de anúncios
enquanto a análise corre — flag em cadeia derrubaria as contas dos clientes.
Posts orgânicos não são afetados.

**Lição para o kit (proposta ao Diretor Geral):** operação de Marketing API em
conta nova exige aquecimento — sem create/delete de sondagem, ritmo lento,
app em modo Ativo antes do primeiro objeto real.

---

## 🟢 03/08/2026 — TRÁFEGO PAGO DESTRAVADO (fim da novela do OAuth)

O popup de OAuth da Meta recusou o admin do app o dia inteiro ("domínio não
incluído") mesmo com tudo gravado. Saída: **Plano B — token do Graph API
Explorer colado pelo CEO** no `POST /api/meta/token` (rota criada para isso,
com as três fechaduras: `debug_token` prova que é do nosso app, `is_valid`,
só o master cola; o token nunca volta na resposta).

**Provado em produção, na sequência, tudo por API:**
1. Token validado — todos os 6 escopos concedidos (`ads_management`,
   `business_management` etc.) — e trocado por um de **60 dias (até 02/10)**.
2. **25 conexões descobertas e salvas** (páginas FB + Instagram), incluindo
   FB Foocci e @foocci_.
3. **13 contas de anúncio visíveis**; "Dioli Agencia" (`act_3416644181895443`)
   ativa, BRL, cartão vinculado.
4. **Escrita provada**: campanha de teste criada PAUSADA na conta da agência e
   apagada em seguida (`120251488279600613`). Modo dev + admin dispensa App
   Review para operar.

**Nota honesta:** o edge `/{app-id}/authorized_adaccounts` recusou o POST
("Unsupported post request") — e **não fez falta**: a escrita direta funciona.
A rota `/api/meta/contas-de-anuncio` precisa dessa correção quando sobrar tempo.

**Falta para a campanha da Foocci rodar (insumos do CEO):** verba/mês,
cidade+raio, destino (site ou wa.me). Campanha nasce PAUSADA; ele liga.

**Renovação:** token expira 02/10 — colar um novo antes disso (2 min) ou
destravar o OAuth de vez (config_id do Login para Empresas).

---

## ✅ Itens 8 a 11 do backlog — entregues em 02/08/2026

| # | O que era | O que ficou |
|---|---|---|
| 8 | Carrossel não existia | Formato completo: fluxo próprio na Meta, **uma arte por tela** |
| 9 | Story não existia | Nasce **vertical**, com prompt que protege as bordas da interface |
| 10 | Só existia Meta | **Google Meu Negócio**: locais, posts e avaliações |
| 11 | Calendário enterrado na aba de Social | **Aba própria**, com miniatura, agrupado por mês |

**A regra que mais importa no item 10:** elogio a agência responde sozinha;
**reclamação, nunca.** Resposta automática a cliente irritado é lida como
deboche por quem está com raiva, é pública, permanente, e notifica a pessoa na
hora. 4–5 estrelas sai sozinho; 1–3 vira rascunho pronto e escalado.

**Dois defeitos achados conferindo a tela nos 3 tamanhos** (regra da casa):
- `capitalize` do CSS escrevia "Julho **De** 2026" — errado em português.
- O topo do portal mostrava **`in_production` cru** ao cliente. Faltavam três
  rótulos e o fallback vazava o nome do banco.

**Ainda depende do Google:** a API do Meu Negócio exige aprovação, como o App
Review da Meta. O código está pronto e o erro já vem traduzido.

---

## 🎯 Rodada 90+ — os quatro serviços passaram de 90

Ordem do CEO: **nada abaixo de 90**. Entregue na mesma noite.
Detalhe em `docs/plano-90.md`.

| Serviço | Era | Ficou |
|---|---|---|
| Operação contínua | 80 | **92** |
| Social Media | 75 | **92** |
| Tráfego Pago | 55 | **92** |
| Identidade Visual | 50 | **92** |

**O que sustenta cada nota**, em uma linha:

- **Tráfego:** campanha sem conjunto e sem anúncio é um envelope com verba —
  liga e não entrega nada. Agora tem os dois, mais um guardião que freia sozinho
  quem gasta sem entregar.
- **Identidade:** o logo sai em arquivo. Símbolo pela IA, **nome da marca
  composto por nós em SVG** — modelo de imagem erra letra, e letra errada no
  logo é o erro mais visível que existe.
- **Social:** o vídeo do celular vira reel de verdade. Áudio de −47 dB
  (inaudível) para −15 dB, provado com ffmpeg nos testes.
- **Operação:** "agosto foi melhor que julho". A conta é feita em **código**, e
  a IA é proibida de recalcular.

**Novo:** `/api/capacidades` diz se esta instância consegue trabalhar — ffmpeg,
chave de imagem, domínio público. `/api/health` só diz se está viva.

### ✅ As três pendências do CEO — medidas em produção (02/08, manhã)

**1. Chave de imagem — NÃO ERA PENDÊNCIA. Erro meu.**
A chave da OpenAI já existia (no cofre cifrado do banco, não no env — por isso
não apareceu na listagem de variáveis do Railway). Testada em produção via
`POST /api/generate-image`: **gerou a arte em 20s**, 1024×1024, sem texto na
imagem. O Design está funcionando hoje.

**2. Meta — a causa do "ineligible for submission" foi encontrada.**
Perguntando ao próprio app pela Graph (`GET /{app-id}`), com app access token:

| Campo | Estado |
|---|---|
| ícone, logo | ✅ preenchidos |
| `privacy_policy_url` | ❌ vazio |
| `terms_of_service_url` | ❌ aponta para facebook.com |
| `website_url`, `app_domains`, `user_support_email` | ❌ vazios |

As páginas legais **já existem e respondem 200** (`/privacidade`, `/termos`,
`/exclusao-de-dados`). Só não foram coladas no painel.
Tentei preencher por API e a Meta recusou:
`(#10) Changing app settings through API calls has been disabled for this app`.
→ **Um toggle em Configurações → Avançado libera, e aí eu preencho tudo.**

**3. Domínio sem `www` — diagnóstico exato.**
O Railway espera um CNAME na **raiz** apontando para `wu7600kq.up.railway.app`,
e o valor atual está **vazio** — o registro não existe. O `www` está correto e
propagado. É criar um registro no DNS; CNAME na raiz exige ALIAS/ANAME (ou
redirecionar apex → www no registrador).

**Novo:** agente dedicado à Meta recriado em `.claude/agents/meta.md`, a pedido
do CEO, com o estado real do app documentado.

---

### ⚠️ Dois achados que só apareceram CONFERINDO o deploy

**1. O Railway constrói com RAILPACK, não com Nixpacks.**
Escrevi um `nixpacks.toml` para instalar o ffmpeg. Ele foi **ignorado sem um
único aviso no log**: o build passou, o app subiu, os testes ficaram verdes — e
o editor de vídeo teria devolvido "ffmpeg não disponível" para todo cliente, em
silêncio. Corrigido com `railpack.json` (`deploy.aptPackages`), e confirmado no
boot: `▶ ffmpeg presente (5.1.9)`.
*Lição registrada no código:* arquivo de configuração que diz fazer algo e não
faz é pior do que arquivo nenhum. Por isso `start.sh` agora imprime a presença
do ffmpeg em todo boot.

**2. `diolidigital.com.br` (sem www) devolve 404 — PENDÊNCIA DO CEO.**
- `www.diolidigital.com.br` → **200, funcionando**
- `diolidigital.com.br` → **404 "Application not found"** do edge do Railway
- É configuração de DNS/domínio no painel, não código. Quem digitar o endereço
  sem `www` não acha a agência.

---

## 🏗️ Obra concluída — 02/08/2026: os 7 blocos do plano

Os sete blocos de `docs/plano-de-obra.md` estão construídos, testados e no ar.
439 testes verdes, typecheck e build limpos, migrações conferidas contra o
schema.

**O que a agência passou a conseguir fazer, e não conseguia antes:**

| Antes | Agora |
|---|---|
| O cliente não tinha como mandar arquivo (a aba prometia "em breve") | Upload real no portal, com cota e link assinado |
| A entrega virava texto e morria ali | Vira calendário com data, o cliente aprova, o relógio publica |
| **Não existia mês 2** — a idempotência era vitalícia | O mês vira sozinho: mede, relata, fecha e produz o próximo |
| Reprovação do cliente gravava um status e mais nada | Refaz na hora, com as palavras dele |
| O Design entregava a *descrição* da peça | Entrega a imagem, guardada no mesmo storage |
| Tráfego pago parava no plano de mídia | Campanha criada **pausada**, com teto do cliente |

**Os três achados que só apareceram construindo:**

1. `fecharCiclo` existia e **não tinha um único chamador automático** no
   repositório inteiro. O ciclo de agosto ficava aberto em dezembro.
2. A esteira dizia a todo cliente com ciclo aberto *"Seu conteúdo está no ar"* —
   inclusive a quem nunca conectou uma rede. Falso por construção, e o cliente
   não tinha como saber.
3. O portal tinha os três botões de aprovação e **só o de proposta fazia
   efeito**. O cliente pedia revisão e ninguém ficava sabendo.

**O que sobrou depende do CEO** — está listado no fim de
`docs/plano-de-obra.md`. Nada ali é código.

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

## 📡 A camada Meta: orgânico pronto, ANÚNCIOS não existem

Auditado em 02/08/2026 a pedido do CEO, que perguntou se a integração está
completa dos dois lados. **Está pela metade — e a metade que falta é tráfego
pago, que é justamente onde o dinheiro do cliente passa.**

### ✅ O que está construído e funciona

| Frente | Estado |
|---|---|
| **Login pelo Facebook (OAuth)** | ✅ com troca por token de longa duração |
| **Conexão POR CLIENTE** | ✅ `?clientId=` → o token é salvo **cifrado** e amarrado àquele cliente. O desenho já é multi-cliente. |
| **Descobrir páginas do usuário** | ✅ |
| **Publicar no Instagram e Facebook** | ✅ (`publishPost`) |
| **Métricas ORGÂNICAS** | ✅ (`getInsights`) |
| **WhatsApp** | ✅ enviar, receber, caixa de entrada, webhooks, criar template |

### ❌ O que NÃO existe — e não é detalhe

**Anúncios (Meta Ads) são impossíveis hoje. Dois motivos somados:**

1. **As permissões nunca foram pedidas.** A lista em `DEFAULT_SCOPES`
   (`lib/integrations/meta/config.ts`) tem páginas, Instagram, business_management
   e WhatsApp — **não tem `ads_management` nem `ads_read`**. Sem elas a Meta
   recusa qualquer chamada de anúncio, com token válido e tudo.
2. **Não há uma linha de código da Marketing API.** Zero ocorrências de conta de
   anúncio, campanha, conjunto ou verba em `lib/integrations/meta/`. O
   `getInsights` que existe lê desempenho **orgânico**, não de campanha.

**A consequência prática, e ela é séria:** o departamento de Tráfego Pago produz
o *plano* de campanha — estrutura, públicos, ângulos, copy — e **a agência não
consegue criar, pausar, ler nem otimizar campanha nenhuma**. Alguém sobe tudo à
mão no Gerenciador de Anúncios. Vender tráfego pago prometendo automação, hoje,
seria vender o que a casa não tem.

### ⚠️ Outros dois pontos honestos

- **Quem conecta é a agência, não o cliente.** A rota exige sessão `master`
  (`app/api/meta/connect/route.ts`). O cliente não autoriza pelo portal dele — é
  o dono da agência que conecta em nome dele. Funciona (é o padrão do Business
  Manager), mas contradiz o desenho de "a autorização é do cliente" registrado na
  seção de integrações acima.
- **Nunca testado ponta a ponta em produção.** Publicação em IG/FB segue não
  verificada com conta real — só o WhatsApp foi exercitado.

### O que precisa ser feito, na ordem

1. Somar `ads_management` e `ads_read` aos escopos. **Muda o App Review** — é
   permissão avançada, exige justificativa e vídeo de demonstração.
2. Construir a camada de Marketing API: conta de anúncio, campanha, conjunto,
   anúncio, verba e métricas de campanha.
3. Testar publicação orgânica ponta a ponta com uma conta real.
4. Decidir se o cliente autoriza pelo portal dele ou se a agência segue
   conectando por ele.

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
