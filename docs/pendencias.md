# Pendências — o que está aberto

## 🔴 07/08/2026 — FRENTE DE VÍDEO: **CapCut NÃO PODE ser conectado.** Dono: PM de vídeo

Pedido do CEO: *"vídeo, vamos conectar o CapCut"*. O especialista-trava do
TikTok/ByteDance entrou antes de qualquer código, como manda a regra de 03/08.
**Parecer completo, com fontes: `docs/plataformas/tiktok/pareceres/2026-08-07-capcut.md`.**

**Veredito: NÃO PODE**, por dois motivos independentes, cada um suficiente:

1. **Não existe API pública do CapCut.** Medido em 07/08: `developer.capcut.com`,
   `open.capcut.com` e `api.capcut.com` **não têm registro de DNS**; o rodapé do
   capcut.com não tem link de desenvolvedor; o catálogo da TikTok for Developers
   não tem produto de edição. `capcut.com/business` **redireciona para
   `pippit.ai`** — "CapCut for Business" virou Pippit, que também não publica API.
2. **Os Termos do CapCut proíbem automação, com todas as letras.** §5, *"You may
   not: use automated scripts or other technologies to collect information from
   or **otherwise interact with** the Services"*
   (`fontes/capcut-termos-de-servico.md`, atualizado em 15/04/2026). Não é
   proibição de scraping — é proibição de *interagir* por automação.

**O que os Termos NÃO proíbem:** um **humano** da agência operar o CapCut em nome
de um cliente que a autorizou. Isso é expressamente previsto no §1. A linha que
separa pode de não pode é **automação**, não "em nome de terceiro".

**O único caminho oficial de edição programável da casa ByteDance** é o
**BytePlus Video Editor SDK** (`fontes/byteplus-video-editor-sdk.md`) — e ele
**não serve**: é SDK **iOS/Android**, 100% no dispositivo, para embutir um editor
na tela de um humano dentro de **um app que a Dioli teria que construir**. Não é
API de servidor. Licença anual sob consulta comercial, sem preço público.

> **Lacunas declaradas, não deduzidas:**
> - **A versão BRASILEIRA dos Termos não foi lida.** O CapCut serve o documento
>   por geo-IP; este ambiente sai por IP dos EUA e as 5 tentativas de forçar
>   região devolveram o mesmo texto ("All United States Users", contraparte
>   TikTok USDS Joint Venture LLC). Não afirmo que o texto brasileiro é idêntico.
> - **A página `pippit.ai/developer` (HTTP 200) não pôde ser lida** — é SPA em
>   JavaScript e este ambiente não tem navegador. É a **única** coisa que
>   poderia mudar o parecer, e fecha em 30 segundos com o CEO logado.

### O estado REAL do vídeo nesta casa, conferido (não repetido)

- **11 roteiros prontos e ENTREGUES**, em `docs/projetos/foocci/roteiros-video.md`
  (641 linhas): 6 reels + 1 vídeo longo + 4 vídeos de SDR. Já estão no card de
  aprovação da Foocci desde 06/08.
- **O editor de vídeo EXISTE e RODA.** `lib/agency/media/video.ts`, ligado ao
  pipeline em `lib/agency/execution/artes.ts:160` (`format === "reel" |
  "video"` → `montarReel`). `ffmpeg` está na imagem de produção
  (`railpack.json → deploy.aptPackages`). **`__tests__/media/video.test.ts`:
  13/13 verde, rodando ffmpeg de verdade nesta sessão.**
- **O que ele faz:** corte, enquadramento 9:16 sem distorcer, normalização de
  áudio (−16 LUFS), capa, `+faststart`.
- **O que ele NÃO faz:** legenda queimada, trilha, transição, cartela. Nenhuma
  dessas existe hoje — todas são construíveis com o ffmpeg que já está lá.
- **O gargalo NÃO é a ferramenta, é o MATERIAL.** `montarReel` só produz se o
  cliente já tiver enviado vídeo bruto (`MediaAsset kind: "inbound"`,
  `mimeType: video/*`). Sem vídeo, ele devolve *"o cliente ainda não enviou
  nenhum vídeo para editarmos"* e **não gasta tentativa** — corretamente. Em
  produção a única porta de entrada de vídeo bruto é `/api/media`; a do Google
  Drive existe em código mas está **travada** (ver seção do Drive abaixo).
- **Não confirmei que um único reel tenha sido produzido em produção.** Não há
  acesso ao banco de produção desta sessão. O que se sabe é coerente com zero:
  em 07/08 a fila foi medida vazia (0 pedidos abertos, 0 chamadas de IA em 24 h).

### 🔴 O QUE DEPENDE DO CEO

1. **Aceitar que CapCut vira fluxo HUMANO, não integração.** A agência monta o
   template à mão e o cliente aplica. É trabalho de gente, não escala com o
   relógio de 5 minutos. Se ele quiser volume, o caminho é o ffmpeg, não o CapCut.
2. **Legenda queimada: decisão de risco, não de engenharia.** Texto dentro do
   pixel **escapa do piso de verdade desta casa**, que lê texto e não enxerga
   imagem (está escrito no cabeçalho de `lib/agency/media/video.ts`). Num piloto
   100% IA sem revisão humana, ligar isso sem conferir o texto contra fonte
   declarada é regressão de segurança. **Não construir antes de decidir.**
3. **Transcrição custa dinheiro** (Whisper/OpenAI, por minuto de áudio) e é
   pré-requisito de legenda automática. Ferramenta paga = decisão dele.
4. **Material do cliente.** Sem vídeo bruto no portal, o editor não tem o que
   editar. É o furo que trava a frente inteira, e é pedido, não código.

### O que vem a seguir nesta frente (a fazer, com dono)

- [ ] `pm` de vídeo — fechar a lacuna do `pippit.ai/developer` com o CEO logado.
- [ ] `pm` de vídeo — reconferir a §5 dos Termos por IP brasileiro quando houver
      como. Enquanto não houver, a citação vale para o contrato dos EUA.
- [ ] `departamentos` — biblioteca de templates de CapCut montados à mão,
      por campanha, entregues como link ao cliente.
- [ ] `departamentos` + `qualidade` — cartela de abertura/fim via ffmpeg
      `concat` reaproveitando `lib/agency/design/renderizar.ts` (HTML→imagem já
      existe e já confere o texto no DOM — é o caminho que **não** cega o gate).
- [ ] `qualidade` — **antes** de qualquer legenda queimada: a trava que confere
      o texto do pixel contra fonte declarada. Sem ela, não construir.

**Nenhuma escrita em plataforma nenhuma nesta frente. Nada foi integrado.**

## ✅ 07/08/2026 — FECHADO: o molde da marca nunca rodou em produção

**A consequência, primeiro:** de quando o motor de molde entrou até 07/08/2026,
**toda peça de todo cliente saiu como foto crua de IA** — sem tipografia, sem
selo, sem assinatura. E o sistema relatou isso como entrega bem-sucedida, peça
por peça.

**A causa:** `playwright` estava em `devDependencies`. Produção instala com
`--omit=dev`, então `await import("playwright")` falhava sempre;
`renderizarHtml` devolvia `sem_navegador`; e `comporComMolde` tratava isso como
"degradação declarada", gravando a foto crua com a explicação em `lastError` —
campo que ninguém lê antes de publicar.

> ### ⚠️ O MEIO-CONSERTO QUE A CASA PRECISA SABER QUE ACONTECEU
>
> **Mover `playwright` para `dependencies` NÃO era o conserto.** Foi o primeiro
> commit desta frente e, sozinho, teria dado sensação de resolvido sem resolver:
> o npm passa a instalar a BIBLIOTECA, mas **não baixa o binário do Chromium**.
> Sem binário, `chromium.launch()` continua falhando e a peça continua saindo
> crua — exatamente a consequência que se queria matar.
>
> Um conserto de dependência que não provisiona o executável é meio conserto.
> Foram precisas **três** partes:
>
> 1. **A biblioteca** — `playwright` em `dependencies` (conferido: ela chega em
>    `.next/standalone/node_modules/playwright`).
> 2. **O BINÁRIO** — `railpack.json → deploy.aptPackages` passa a instalar
>    `chromium`, ao lado do `ffmpeg` que já estava lá. Escolhido em vez de
>    `npx playwright install chromium` no build porque o pacote apt faz parte da
>    IMAGEM: sobrevive a redeploy sem depender de cache e não acrescenta ~500MB
>    de download por build. `renderizar.ts` acha `/usr/bin/chromium` **sem exigir
>    variável de ambiente** — pedir configuração para a peça sair certa é a
>    armadilha do ffmpeg, que some em silêncio.
> 3. **A PORTA FECHADA** — sem as duas acima, o código voltaria a entregar foto
>    crua chamando aquilo de sucesso. Agora falha de INFRA (`sem_navegador`,
>    `erro_do_navegador`, `timeout`) devolve `ok: false`: a peça não é gravada
>    nem publicada, e a causa sobe nomeada. Falha de CONTEÚDO (texto que não
>    cabe, sem frase utilizável) segue degradando declarado.
>
> **A lição, que vale além desta frente:** havia um teste VERDE afirmando que a
> peça sem molde deve ser publicada (`__tests__/execution/artes.test.ts`). O
> fail-open não estava só no código — estava protegido por prova. Quando a
> checagem descreve o defeito como se fosse o contrato, consertar o código não
> basta: o teste tem de mudar de lado, e o commit tem de dizer por quê.

**Dívida declarada que sobrou:** `/usr/bin/chromium` (apt) é um Chromium de
sistema, não o build que o Playwright baixa. A combinação é suportada via
`executablePath`, mas **não foi exercitada em produção ainda** — a primeira peça
produzida depois do deploy é a prova que falta. Se falhar, o erro agora aparece
como falha nomeada em vez de peça crua silenciosa, que é o ponto.

## ✅ 07/08/2026 — FECHADO: porta de emergência do deploy, e as 6 rotas fora da conta

- **A porta de emergência não abria.** Falhou nas DUAS emergências reais (06 e
  07/08) com "Bad Access": o token de PROJETO do Railway recusa
  `environmentTriggersDeploy` e `deploymentTriggerUpdate`. Na segunda, com o
  GitHub Actions em pane e o portal do cliente quebrado, o conserto subiu à mão.
  `dispararDeploy()` passa a usar `serviceInstanceDeployV2(serviceId,
  environmentId, commitSha)` — que o mesmo token aceita. Ganho extra: ela **não
  passa pelo "Wait for CI"**, então o script não precisa mais desligar o portão
  para disparar e religar depois. Aquela janela deixava a produção sem CI e
  ficava aberta **para sempre** se o processo morresse no meio.
- **As 6 rotas de `app/api/agents/*` contornavam o motor de IA.** Montavam o
  `fetch` para a Anthropic na mão. Perdiam a CONTA (nenhum `AIRunLog` — o gasto
  existia na fatura e não no relatório), a ESCOLHA DE PROVEDOR POR CLIENTE
  (`ClientAiProvider` ignorado: cliente fixado no Gemini era atendido pelo
  Claude) e a RESERVA. Todas passam por `generate()` agora, com trava em
  `__tests__/plataforma/rotas-passam-pelo-motor.test.ts` para a 7ª rota.

**Furo declarado, NÃO resolvido:** `social/generate` e `design/generate` aceitam
`clientId`/`projectId` como opcionais porque as telas ainda podem não mandá-los.
Quando não vêm, o custo entra na conta **sem cliente**. Ausência de informação
não é informação: está anotado, não preenchido por inferência. Quem for mexer
nessas duas telas fecha isto junto.

## 🟡 07/08/2026 — GOOGLE DRIVE DO CLIENTE: **EM PRODUÇÃO**, feature TRAVADA no CEO

O material de marca do cliente (logo em arquivo, fotos reais, manual, captura de
tela) já tem caminho: portal → escolha do cliente → esteira.

**Subiu em 07/08/2026, commit `d0985b6`** — merge de `claude/dioli-pm-role-pow56e`
na branch de produção, pelo caminho normal (push → CI verde → Railway). O portão
"Wait for CI" estava LIGADO e funcionou: a implantação esperou o workflow
`quality` concluir antes de subir. **A porta de emergência não foi usada.**

Prova em produção, não "deploy verde": `/api/health` responde `commit: d0985b6`,
e as rotas que só existem neste commit respondem —
`/api/portal/drive` **401** (viva e fechada, exige sessão do portal),
`/api/portal/drive/conectar` e `/api/google/drive/callback` **200**. Rota
inexistente devolveria 404; é isso que separa "subiu" de "foi disparado".

**O card "Google Drive" saiu de "EM BREVE"** — `DriveDoCliente` está montado em
`ConexoesDoCliente.tsx:369` e não há mais nenhum "EM BREVE" em
`components/portal/`.

**O que trava, e é do CEO:**

1. **Publicar o app OAuth** no Google Cloud Console (Tela de permissão OAuth →
   "PUBLICAR APP"). Com o app em "Teste", o refresh token do cliente **morre em
   7 dias** e a conexão quebra sozinha parecendo defeito nosso
   (fonte: `docs/plataformas/google/fontes/oauth2-tokens-e-expiracao.md`).
   Como o escopo é `drive.file` (não sensível), **não há verificação
   obrigatória** — é um clique.
2. **Registrar o redirect URI** `https://www.diolidigital.com.br/api/google/drive/callback`.
3. **Ativar Drive API + Picker API** e criar uma chave de API de navegador
   (`GOOGLE_PICKER_API_KEY`) + anotar o número do projeto (`GOOGLE_PROJECT_NUMBER`).

Sem (3), o portal já diz a verdade: botão de escolher arquivos indisponível com
"avise a agência — não é problema da sua conta". Nada finge funcionar.

> ⚠️ **Não conferi as variáveis do Railway nesta sessão** — não havia token do
> Railway neste ambiente. Então **não sei dizer se `GOOGLE_CLIENT_ID`,
> `GOOGLE_PICKER_API_KEY` e `GOOGLE_PROJECT_NUMBER` já existem em produção.**
> O código está no ar e é fail-closed: sem elas o cliente vê a mensagem honesta,
> não um botão quebrado. Ausência de informação não é informação — quem tiver o
> token confere antes de dizer ao CEO que o Drive "está funcionando".

Parecer completo, com fontes: `docs/plataformas/google/pareceres/2026-08-07-drive-do-cliente.md`.

**Dívidas declaradas do mesmo bloco:**
- O par foto→peça continua sendo escolha explícita (`montarArteComFotoDoCliente`),
  como manda a lição de 04/08 ("sobra não é evidência de correspondência"). A
  oferta existe (`fotosReaisDoCliente`); quem casa arquivo com peça, não.
- `BrandBrain` e `ClientKnowledgeSnapshot` ainda não são alimentados pelo
  material do Drive — o manual de marca entra como arquivo, não como cor/fonte
  extraída.
- `__tests__/esteira/passagem-do-pedido.test.ts` falha por data fixa no teste
  (falha JÁ em `c48d635`, antes deste trabalho).

## 🔵 07/08/2026 (madrugada) — O RELÓGIO ESTAVA CERTO; QUEM ESTAVA ERRADO ERA O DIAGNÓSTICO

Ordem do CEO: *"amanhã quando eu voltar eu quero essa agência produzindo, sem
parar."* O diagnóstico que entrou na sessão dizia que a produção roda pelo cron
do GitHub e que ele dispara de 64 a 203 minutos em vez de 10. **Os dois fatos
são verdadeiros e a conclusão não era.**

**O relógio de produção desta casa NÃO é o GitHub.** É o `despertador`
(`lib/agency/despertador.ts`), que roda DENTRO do servidor, a cada 5 minutos,
ligado no boot pelo `instrumentation.ts`. Conferido em produção: `DESPERTADOR`
não está setada (logo, ligado) e o log do container traz
`[despertador] ligado — … a cada 5 min`. O workflow `cron-execute.yml` é o
REFORÇO de fora, e é ele — só ele — que roda 12× menos do que está escrito.
Trocar o GitHub por um cron do Railway não melhoraria nada e pioraria uma coisa:
`cronSchedule` no Railway transforma o serviço num job que **roda e sai** — ligá-lo
no serviço web tiraria o site do ar.

### O buraco que existia mesmo: o relógio batia SEM TESTEMUNHA

Uma rodada em que nada acontecia não escrevia uma linha — e é exatamente isso
que "o relógio morreu" também produz. Os dois estados eram indistinguíveis de
fora. Pior: cada perna da rodada engole o próprio erro num `console.log` (certo,
para não derrubar as outras), e o log do container é rotativo, some no deploy
seguinte e ninguém o lê às 7 da manhã.

- **`lib/agency/pulso.ts`** — uma linha por batida no volume: o que a rodada
  moveu e o que quebrou. Nunca lança: o registro do relógio não pode ser o que
  para o relógio.
- **`GET /api/pulso`** — bateu? moveu? quebrou? Protegida (sessão ou
  `CRON_SECRET`). `/api/health` responde se o PROCESSO vive, que é outra pergunta.
- **Faixa `PulsoDaAgencia` no topo de `/agency/dashboard`** — e ela **não some
  quando está verde**, ao contrário da fila de avisos. Aqui o silêncio é o que
  precisa ser desmentido.
- **`lib/agency/vigia-da-madrugada.ts`** — às 03h de São Paulo fecha a noite em
  `ActivityEvent`: um vermelho por falha e por achado grave, e um fechamento que
  **sai também na noite limpa**. Mora dentro do relógio da casa, e não no
  `raio-x-noturno.yml`, porque o Actions estava em **pane declarada** — alarme
  hospedado no provedor que cai não toca no dia em que faria falta.
- **Falha de publicação virou notícia.** `lastError` era um campo dentro de um
  post: para vê-lo era preciso já suspeitar. Agora o primeiro erro (e só a
  MUDANÇA de motivo, senão seriam 288 linhas iguais por dia) vira
  `ActivityEvent`.

### 🔴 A NOTÍCIA QUE O CEO PRECISA OUVIR: a fila está VAZIA

Medido em produção (`POST /api/cron/raio-x`, só leitura, 07/08 00:10 UTC):
`pedidosDoClienteAbertos: 0`, `postsRascunho: 0`, `chamadasDeIA24h: **0**`.
**A casa não fez uma única chamada de IA em 24 h.** O gargalo não é o relógio:
é que **não há trabalho na esteira**. Agência acionada sem fila produz zero, e
zero com o relógio perfeito continua sendo zero.

### 🔴 Os 6 carrosséis da Foocci vão FALHAR hoje às 07h — e é o certo

Os 6 posts estão `scheduled` (o primeiro em `2026-08-07T10:00Z` = 07h BRT) e
**`mediaUrls` está vazio nos 6** — as 36 telas nunca foram ligadas aos posts
(o backfill continua dependendo do CEO). `publicarAgendados` vai parar em
"o carrossel ainda não tem as artes das telas", **antes de qualquer chamada à
Meta**, e re-tentar a cada 5 min sem nunca ir ao ar. Até agora isso seria
silencioso; a partir deste commit vira linha no painel.

> ⚠️ **Achado que vale por si:** `publishPost` (`lib/integrations/meta/client.ts`)
> **não consulta `MetaAtivoAutorizado`**. A trava de ativos cobre leitura de ads,
> gravação de conexão e escrita de anúncio — **não cobre publicação orgânica**.
> Hoje o que segura os 6 posts é a falta das telas, não uma trava. Com o backfill
> aplicado, a casa publicaria sozinha no @foocci_ — contra a ordem "nada publica
> na Meta sozinho". **Não foi consertado nesta sessão** (mexer na publicação
> exige parecer do especialista `meta`); fica como a próxima trava a construir.

**Portão rodado À MÃO** (Actions em pane): `npx tsc --noEmit` limpo,
`npx vitest run` **2308/2308** em 146 arquivos, `npm run build` limpo.
Conferido nos 3 tamanhos (375/768/1440) com o painel renderizado de verdade.

## 🟢 06/08/2026 — Decisões do CEO, fechadas em conversa

- **As 19 conexões de terceiros: MANTIDAS.** São produtos do próprio CEO em
  stand-by (Sushi Cazza, Dilee, Kero Shop, Acesso Beleza, santioh_, dilix.br,
  queise, Santioh Europe, Spa da Mente, City Jobs SP). Elas entraram em 03/08
  pelo fluxo de token colado, que gravava tudo o que o token alcançava.
  **A porta já foi fechada** (`lib/integrations/meta/escolha-de-ativos.ts`): hoje
  nada é gravado sem marcação explícita. As 19 seguem no banco **sem
  autorização** — o sistema não lê nenhuma delas. Apagar destruiria o token e
  exigiria colar de novo caso virem clientes; manter é reversível, apagar não.
- **A campanha parada da Foocci foi DELETADA pelo CEO.** Era "Nova campanha de
  Leads — Cópia", ativa com R$ 25/dia e zero entrega em 30 dias (`start_time`
  voltava como epoch zero — nunca começou). Risco de R$ 750/mês encerrado.
- **Configuração de Login para Empresas criada** — id `1985152182184882`, já em
  `META_LOGIN_CONFIG_ID` na produção. É o que tira o diálogo do fluxo clássico
  de `scope`, causa do "Invalid Scopes" que o CEO levou na cara em 06/08.
- **Deploy só com CI verde: AUTORIZADO**, com porta de emergência registrada.
  Falta o CEO ligar "Wait for CI" no painel do Railway — conferido por API que
  o campo **não é exposto** em `ServiceInstanceUpdateInput`; é clique de painel,
  não falta de acesso.


> Última atualização: 05/08/2026 (raio-x noturno virou mecanismo — os achados
> abaixo saíram da primeira coleta e cada um tem dono).

---

## 🔴 06/08/2026 (noite) — O PORTÃO DO DEPLOY ESTÁ CONSTRUÍDO E **NÃO ESTÁ LIGADO**

Ordem do CEO: *deploy só com CI verde, com porta de emergência declarada.*
O mecanismo está pronto, testado e documentado (`docs/deploys/portao.md`).
**Falta um clique — e ele não é meu.**

**O caminho escolhido, conferido na documentação do Railway** (não de memória):
o recurso **"Wait for CI"** do próprio Railway (`checkSuites` no
`DeploymentTrigger`, `docs.railway.com/deployments/github-autodeploys`). Com ele,
o push cria a implantação em **WAITING**, ela vira **SKIPPED** se algum workflow
falhar, e só sobe com tudo verde. Preferido ao caminho "desligar o autodeploy e
deployar de dentro de um workflow" porque este último **não funciona no dia da
pane** — workflow que deploya só deploya se o Actions estiver de pé, e foi
justamente o Actions que caiu.

### 🔴 O QUE DEPENDE DO CEO — e sem isso nada disto protege

1. **Ligar o portão.** Railway → projeto Dioli Digital → serviço `diolidigital`
   → Settings → Source → **Wait for CI**. Ou, com um token de conta:
   `RAILWAY_TOKEN=<token> npm run portao -- --ligar`.
2. **Um token de CONTA do Railway.** O token de projeto que eu tinha **só lê**.
   Ele recusou com `Bad Access` as três mutações que importam:
   `deploymentTriggerUpdate` (ligar o portão),
   `serviceInstanceAutoDeployUpdate` e `environmentTriggersDeploy` (disparar o
   deploy — a porta de emergência). **Sem esse token a porta de emergência não
   abre**, e é ela que garante subir num dia de pane.

**Enquanto o item 1 não acontecer, o Railway continua subindo todo push sem
olhar a CI — exatamente como hoje de manhã.** `npm run portao` responde isso em
uma linha, e sai vermelho.

### O que foi construído

- **Uma régua só de "o que conta como verde"** (`julgarProva`, em
  `lib/plataforma/sentinela-do-deploy.ts`). O sentinela e a porta de emergência
  usam a mesma — duas cópias é como "sem prova" volta a contar como verde de um
  lado só. `success` aprova; cancelada, estourada, pulada, em andamento e
  **inexistente** caem em `SEM_PROVA`, e a mensagem diz qual dos casos é.
- **A porta de emergência** (`npm run deploy:emergencia`, com `--ensaio`).
  Não abre sem `--quem`, sem `--motivo` de 20+ caracteres e sem `--confirmo`;
  **recusa** quando o commit já tem CI verde (porta usada com o portão aberto é
  como ela vira o caminho normal); e **grava o registro ANTES de disparar** — se
  não deu para registrar, não sobe. O rastro fica em
  `docs/deploys/emergencias.md`.
- **O sentinela saiu da frente do deploy.** Ele rodava no push; com o portão
  ligado, workflow vermelho descarta a implantação — e o sentinela fica vermelho
  justamente quando a produção está ruim. Isso trancaria o conserto do lado de
  fora. Agora ele roda de hora em hora e denuncia por issue. **Custo declarado:**
  a conferência pós-deploy deixa de ser imediata.
- **`ci.yml` passou a nomear a branch de produção** no `on: push`. O Railway só
  reconhece como portão um workflow cujo `branches:` ele consegue casar; portão
  ligado sem workflow para esperar aprova tudo com cara de trava. `npm run portao`
  sai vermelho nesse estado.

### O que ficou provado, e o que não

- ✅ **A régua, contra o GitHub real:** commit `0ce8ea2` (o que está em produção)
  tem CI verde e sai `APROVADO` — com SHA curto **e** completo. Com o Actions em
  **major outage neste momento**, CI verde continua verde: a pane não apaga prova
  que existe.
- ✅ **As duas metades da porta**, com o script rodando de verdade: sem motivo →
  recusa e sai 1; motivo curto → recusa; commit já aprovado → recusa e ensina o
  caminho normal; com quem+motivo+confirmação num dia de pane → **libera**.
  36 testes verdes em `__tests__/plataforma/porta-de-emergencia.test.ts`.
- 🔴 **NÃO ficou provado que o portão segura de verdade** — não consegui ligá-lo
  (token só lê). O comportamento do "Wait for CI" está afirmado pela
  documentação do Railway, não medido nesta casa.
- 🔴 **NÃO ficou provado o disparo do deploy.** `environmentTriggersDeploy`
  recusou. A produção **não foi tocada** nesta sessão.
- 🟠 **Defeito achado testando de verdade, e corrigido:** o registro era gravado
  antes do disparo (certo) e nunca voltava para dizer que o disparo **falhou** —
  ficava no arquivo uma linha com cara de subida que não aconteceu. Agora toda
  entrada termina com o resultado. A entrada do teste em
  `docs/deploys/emergencias.md` está anotada com todas as letras.

---

## 🔴 06/08/2026 — App Review da Meta: dossiê pronto, 1 bloqueio no colo do CEO

Dossiê completo em **`docs/plataformas/meta/app-review.md`**: estado do app
medido por API, auditoria permissão-a-permissão contra o código, textos de
justificativa em inglês prontos para colar, roteiros dos 6 vídeos e o caminho
que o revisor percorre.

**O bloqueio nº 1, e ele reprova o envio INTEIRO:** `META_LOGIN_CONFIG_ID` não
existe no Railway. App tipo Business usa Login para Empresas, que exige
`config_id` e recusa `scope` — o revisor não consegue completar o login, e
"app não testável = envio rejeitado" (fonte: `fontes/app-review-processo.md`).

**Consertado nesta sessão:**
- O callback de exclusão de dados devolvia à Meta `https://diolidigital.com.br/…`
  — o **apex, que não tem DNS**. Conferido ao vivo em produção antes do
  conserto. É o link que o revisor clica. Agora sai do host da requisição.
- O mesmo arquivo gravava "conexões Meta associadas removidas" **sem remover
  nada**. Virou registro honesto de pendência humana (o banco não guarda o
  `user_id` da Meta; cabe em `metaJson`, sem migration).
- **Tela nova `/agency/desempenho-pago`**: a leitura de tráfego pago existia só
  como rota de API. Sem tela, a Meta não consegue exercitar `ads_read` /
  `ads_management` e reprova as duas.

**3 permissões recomendadas para TIRAR** (zero uso em código):
`instagram_manage_comments`, `pages_manage_metadata`, `business_management`.

**Buraco inverso:** `client.ts:201,207` publica em Página do Facebook e exige
`pages_manage_posts`, que **não é pedida** — publicação orgânica em Página é
código morto hoje.

**Portão rodado À MÃO** (GitHub Actions em pane): `vitest` 139/139 arquivos,
2206/2206 testes; `tsc --noEmit` limpo; eslint sem erro novo.

## ✅ 06/08/2026 (noite) — As duas rotinas órfãs ganharam agendamento

Código sem agendamento é promessa, não mecanismo. Duas rotinas existiam e
**ninguém as chamava**:

- **Raio-X noturno — `03:00 BRT` (06:00 UTC)**, `.github/workflows/raio-x-noturno.yml`.
  Foi afirmado ao CEO que ele rodava toda noite; **não rodava** — a única coleta
  em `docs/raio-x/coletas/` era a de 05/08, feita à mão. Agora roda as duas
  metades (código no repositório + dados da produção) e **commita a coleta**.
- **Régua de recompra 30/60/90 — `07:00 BRT` (10:00 UTC)**,
  `.github/workflows/cron-recompra.yml` → `POST /api/cron/recompra`. Idempotente:
  segundo disparo no mesmo dia devolve `registrados: 0`. Não manda WhatsApp —
  produz rascunho em `/api/avisos`.

**Dois defeitos consertados nos workflows que já existiam** (`cron-radar`,
`cron-execute`):

1. `CRON_SECRET` ausente saía com **exit 0** ("pulei") — workflow que nunca
   chamou nada se declarando saudável. Agora é vermelho.
2. **503 passava verde.** As quatro rotas de cron só devolvem 503 quando
   `CRON_SECRET` não existe **no servidor** — morte silenciosa do cron, não
   instabilidade. Agora 503 com a frase de configuração é vermelho; 503 do edge
   (deploy em curso) fica em aviso.

**Lacuna declarada:** o `workflow_dispatch` manual não pôde ser executado desta
sessão — o token desta integração não tem `actions: write`
(403 "Resource not accessible by integration"). O que foi provado: as rotas de
produção respondem (401 com segredo errado = viva e fechada), os dois caminhos
de falha do workflow saem 1, e o guarda do raio-x acende com a metade de dados
cega. **A primeira execução real é a agendada.**

## 🟠 06/08/2026 (noite) — A AGÊNCIA ESTAVA ORÇANDO TRABALHO QUE JÁ TINHA ENTREGUE

Dois defeitos pegos pelo CEO no portal do celular. O segundo é de dinheiro.

**1. O cartão escondia o que o cliente escreveu.** Aparecia só o título
truncado; o texto dele não aparecia em lugar nenhum. Agora o cartão mostra
**"O QUE VOCÊ PEDIU"** com o texto inteiro (recolhido a 3 linhas, com "ver
mais") **acima** da resposta da agência — é assim que ele confere se foi
entendido, e é o que torna o preço auditável por quem paga. Mesma correção na
caixa de entrada da agência: a lista mostra as palavras do cliente, não o
título derivado.

**2. A triagem lia o ASSUNTO e não lia o VERBO.** O pedido
`cmsg7anke00030ps260acx43s` dizia "**preciso do roteiro com as falas** para
produzir os videos" e voltou como **"1 Reel — R$ 350"**. Três erros de uma vez:
insumo classificado como peça final, quantidade no plural virando 1, e o
roteiro **já entregue** (`docs/projetos/foocci/roteiros-video.md`) sendo
cobrado. O que mudou, em mecanismo:

- **A carta de atendimentos declara o que sai.** Cada linha tem `entrega`
  (`insumo` | `peca`) e `cobre` (`1` | `pacote`). "Roteiro de vídeo" e "Reel
  produzido" viraram atendimentos **separados** — antes eram o mesmo id, com o
  preço do reel.
- **Leitura léxica do texto do cliente, sem IA**
  (`lib/agency/esteira/leitura-do-pedido.ts`). Pediu INSUMO e o modelo escolheu
  PEÇA FINAL → `precisa_decisao`. Texto ambíguo (pede os dois) →
  `precisa_decisao`. A trava não depende de o modelo acertar: foi ele que errou.
- **Quantidade não contada NÃO vira 1.** Plural sem número, ou duas contagens
  diferentes, ou número maior que o item de tabela → para e pergunta, com as
  palavras dele na mensagem.
- **Roteiro avulso não tem preço de tabela — e preço que não existe não se
  inventa.** O atendimento tem `itemDeCatalogo: null`, o que **para** e manda a
  equipe orçar.
- **Rota nova para consertar triagem que já saiu errada** (`PATCH
  /api/messages/pedidos`): `cancelar_orcamento` (tira o número da frente do
  cliente, com motivo obrigatório) e `entregar` (peça feita fora da máquina vira
  entrega visível no portal). Antes não havia caminho: `triado` não volta para
  `novo` e "recusar" apagaria o pedido legítimo junto com o erro.

As duas metades testadas: "preciso do roteiro" **não** vira reel; "quero um reel
pronto" continua virando reel, sem atrito, com o preço da tabela. Conferido nos
3 tamanhos (375/768/1440) com o portal renderizado de verdade.

**Corrigido em PRODUÇÃO, e conferido pelo próprio portal do cliente:** o pedido
`cmsg7anke00030ps260acx43s` está `entregue`, com `preco: null` e sem botão de
aprovar orçamento; os roteiros (26 KB, os mesmos de
`docs/projetos/foocci/roteiros-video.md`) estão no card de aprovação da Foocci,
esperando a leitura dele. Nenhuma escrita em plataforma nenhuma.

### 🔴 O QUE DEPENDE DO CEO

1. **Preço de tabela do ROTEIRO avulso.** Enquanto não existir, todo pedido de
   roteiro para em `precisa_decisao` e alguém orça à mão. É decisão comercial,
   não de código — por isso não inventei o número.
2. **Os outros 10 pedidos de vídeo do texto dele** (6 reels + longo + 4 do SDR):
   a triagem agora pergunta em vez de orçar 1. Alguém precisa fechar o escopo.

---

## ✅ 06/08/2026 (noite) — A PORTA DA AGÊNCIA FECHOU. O vetor das 19 está morto.

A perícia da tarde disse que o fluxo do CLIENTE estava fechado e o da AGÊNCIA
não — e que foi o da agência (token colado, 03/08 às 14:05) que pôs no banco as
19 conexões de terceiros. **Essa porta está fechada agora.**

- **`saveConnection` não tem mais exceção para a agência.** `clientId` nulo era
  passe-livre; hoje a agência é um dono como qualquer outro, e ativo sem
  marcação **não vira conexão** — lança, não grava, não cifra o token.
- **Tela de escolha do master construída** (`/api/meta/ativos` +
  seção "3. O que a agência administra" em `MetaConnectManager.tsx`). Colou o
  token → lista o que o token alcança → o operador marca → só o marcado é
  gravado. Desmarcar apaga a lista **e** a conexão.
- **Um mecanismo, não dois.** O alcance/escolha/gravação saíram das rotas e
  viraram `lib/integrations/meta/escolha-de-ativos.ts`, usado pelo portal do
  cliente, pela tela da agência, pelo callback do OAuth e pelo token colado.
  Copiar teria criado o segundo mecanismo que diverge e reabre o incidente.
- **O ramo `fluxo_master` do callback foi apagado.** Ele auto-autorizava tudo
  que o token alcançava — "alcance = autorização" escrito em outro lugar do
  código.
- **A tela parou de mentir.** Colar um token devolve `precisaEscolher` e a
  mensagem é âmbar ("falta escolher"), não verde ("conectado ✓").
- **A metade que não pode atrapalhar:** o token de USUÁRIO continua passando
  (é a credencial, não um ativo) e o número de WhatsApp digitado à mão continua
  funcionando — a rota o registra como escolha explícita antes de gravar.
- Verde: `npx tsc --noEmit` limpo, **2017 testes**, 129 arquivos.
  Provas novas em `__tests__/integrations/meta-escolha-da-agencia.test.ts`
  (lista vazia ⇒ 0 gravadas e 6 "falta escolher"; marcar uma não abre as outras;
  banco fora do ar ⇒ nada gravado).
- Conferido nos 3 tamanhos (375 / 768 / 1440) com o painel renderizado de
  verdade, nos dois estados. **Dívida declarada:** a Meta foi stubada na camada
  de rede para a captura — a tela é real, os dados são fixture.

### 🔴 O QUE CONTINUA DEPENDENDO DO CEO

1. **Apagar ou não as 19 linhas de terceiros.** Continua sem decisão, e
   continua sendo dele: parte desses negócios (Santioh, Dilix, Queise, Dilee) é
   do próprio CEO, e apagar destrói o token cifrado. **A diferença é que agora a
   limpeza não é desfeita pelo próximo token colado.**
2. **Marcar o que a agência administra.** A lista nasce vazia: até o operador
   abrir Integrações e marcar, nenhum ativo novo é gravado. As conexões que já
   existem no banco continuam de pé (nada foi apagado) — mas não são renovadas
   por uma colagem nova enquanto não forem marcadas.
3. **Reautorização da Foocci** — inalterado, ver a seção da tarde.

---

## ✅ 06/08/2026 (tarde) — Onda 0 do P0, o portão do PM, o microfone e a coleta de produto

Quatro frentes fechadas. O que mudou de verdade, sem prosa:

- **O portão do PM ganhou leitor.** `pm_task_owner` e `pm_deadline` estavam
  `autoCheckable: true` sem um único chamador. Agora `criarTarefas`
  (`lib/agency/tarefas/criar-tarefas.ts`) é o **ponto único** de gravação de
  Task: sem dono ou sem prazo, a tarefa **não é gravada**, e o bloqueio vira
  `ActivityEvent`. Um teste de guarda reprova `prisma.task.create` novo fora
  dali. O prazo sai do `estimatedDays` do próprio PM — sem estimativa, barra.
- **Onda 0: os dois registros viraram um.** Ids unificados pela lista que
  ROdava (a de `quality-canvas.ts`), `projections_anchored` incorporado, e o
  tipo agora obriga cada checagem a declarar `mecanismo` (caminho de arquivo,
  conferido por teste) ou `lacuna` (motivo, dono, prazo).
  **O default NÃO foi invertido** — isso para 8 de 8 departamentos e só entra
  junto com a escada (Onda 1).
- **O número do P0 parou de ser escrito em prosa.** A contagem antiga ("31, 3
  executáveis") mentia nas duas direções: faltava `projections_anchored` e
  `quality_audit_impartial` estava construído e declarado como não executável.
  **A partir daqui o número corrente sai de `retratoDosPortoes()`**
  (`lib/dioli-brain/quality-gates.ts`), com trava em
  `__tests__/brain/o-numero-do-p0.test.ts` — número em prosa envelhece errado e
  vira afirmação falsa sem ninguém mexer numa linha. Seguem descobertas as 4
  bloqueantes globais que importam: marca, briefing, valor ao cliente e riscos.
- **O microfone do portal.** A causa raiz **NÃO está fechada** — falta a linha
  de log da produção. O que foi fechado é a cegueira: 401/402/403 →
  `chave_recusada`, 429 → `ritmo`, 4xx → `audio_recusado`, 5xx →
  `provedor_indisponivel`. O log leva `status` + `error.code` + `error.type`
  (enum fechado); `error.message` e o corpo continuam fora, porque podem ecoar
  a fala do cliente. `chave_recusada` vira `ActivityEvent`.
- **A esteira passou a pedir o produto do cliente**
  (`lib/agency/esteira/material-de-produto.ts`), no nascimento do projeto.
  SaaS recebe pedido de captura de tela; padaria não recebe. Sem sinal nenhum,
  a casa **pergunta** — silêncio não vira "não tem".
- **Biblioteca de mockup + assinatura como token** (`lib/agency/design/mockup.ts`).
  Os quatro blocos, e a trava junto: **captura real ou selo de ilustração na
  peça**, e número sem origem declarada não vira pixel. Todo texto do mockup
  entra na lista que o renderizador confere no DOM.

**Não deu, e o motivo exato:**

- **Contadores de Instagram/WhatsApp para o banco** — não encostei.
  `prisma/schema.prisma` está sendo editado por outro agente nesta mesma
  árvore; migration nova aqui colidiria com a dele.
- **Régua de recompra 30/60/90** — depende da triagem
  (`lib/agency/esteira/triagem.ts`) pousar. Ainda não pousou.

---

## 🔴 06/08/2026 (tarde) — PERÍCIA EM PRODUÇÃO: o script ia apagar a casa inteira

Rodada contra PRODUÇÃO com protocolo (dry-run → conferir → aplicar). **A etapa
`--apply` NÃO foi executada, e isso foi a decisão certa.** O que a perícia achou:

### 1. O dry-run marcou 25 de 25 conexões de ativo para exclusão

Incluindo **as 2 legítimas da Foocci** (`@foocci_`, Página `Foocci`) e as 4 da
própria Dioli. É exatamente o caso em que o protocolo manda **PARAR**. Causa
dupla, as duas consertadas em `82dc075`:

- **"Sem cliente" tinha duas grafias.** O callback grava `clientId` `null`;
  `/api/meta/token` gravava `""`. As **24 conexões de nível agência que estão em
  produção nasceram com `""`**, em 03/08. Toda guarda desta casa pergunta
  `clientId === null` — com `""`, o fluxo da AGÊNCIA caía no ramo do CLIENTE.
  Agora existe `donoDe()` (`lib/integrations/meta/ativos-autorizados.ts`), a
  forma canônica, aplicada em toda fronteira.
  > **Isto também teria quebrado o deploy em silêncio:** sem o conserto,
  > `saveConnection` passaria a LANÇAR em todo `/api/meta/token`, e o laço de
  > Páginas engole a exceção — o fluxo de token colado gravaria **zero** Páginas
  > sem uma linha de erro.
- **"Sem autorização" não é "gravado indevidamente".** `MetaAtivoAutorizado`
  nasce vazia de propósito, então **toda** conexão de cliente parece não
  autorizada — inclusive a que o cliente concedeu de verdade. Deduzir exclusão
  de uma lista vazia é tratar ausência de informação como informação.
  **`--apply` agora EXIGE `--ids=<...>`**, a lista que uma pessoa conferiu.
  Sem ids, recusa e sai 1. As duas metades testadas.

### 2. O dano real em produção é MAIOR e MAIS ANTIGO do que o registrado

O incidente foi atribuído ao clique de 06/08 no portal da Foocci. **Os
carimbos do banco dizem outra coisa:**

- O clique de 06/08 (12:55) tocou **3 linhas**: o token de usuário da Foocci,
  `@foocci_` e a Página `Foocci`. **Nenhum ativo de terceiro foi gravado nesse
  dia** — a tela de consentimento por Página da Meta limitou o alcance.
- **19 conexões de terceiros estão gravadas desde 03/08 às 14:05**, pelo fluxo
  de **token colado** (`/api/meta/token`, o "Plano B" do OAuth) — 10 negócios
  que **não são clientes da agência**: Sushi Cazza, Dilee, Kero Shop, Acesso
  Beleza, santioh_, dilix.br, queise, Santioh Europe, Spa da Mente, City Jobs SP.
- Elas estão com `clientId = ""`, e por isso o script as classificava como
  **"conta da própria agência"** e as **preservava**. Ficaram três dias
  invisíveis sob esse rótulo. A perícia agora **imprime** as de nível agência.

**O que essas 19 dão acesso, medido pelo escopo gravado** (`pages_show_list`,
`pages_read_engagement`, `instagram_basic`, `business_management`,
`ads_management`, `ads_read`): **leitura** do engajamento das Páginas e do
Instagram desses negócios. **Não têm `pages_manage_posts` nem
`instagram_content_publish` — não publicam.** As que publicam são as 2 da
**Foocci** (13 escopos, com `instagram_content_publish`), que são legítimas.

### 3. A trava está no ar — mas só fecha metade do caminho

Promovido `82dc075` para produção (CI verde, fast-forward, 27 conexões antes e
27 depois — nada perdido, nada criado).

- ✅ **Fluxo do CLIENTE (callback do OAuth) fechado.** É o que dispararia no
  próximo clique de "Conectar" em qualquer portal.
- 🔴 **Fluxo da AGÊNCIA continua aberto — e foi ele que produziu as 19.**
  `clientId` nulo é exceção declarada em `saveConnection`: quem colar um token
  novo em `/api/meta/token` **regrava as 19 Páginas de terceiros**. A "lacuna
  do fluxo master" já estava declarada; o que a perícia acrescenta é que ela
  **não é teórica — é o vetor do dano que está no banco.**

### 🔴 O QUE DEPENDE DO CEO

1. **Apagar ou não as 19 linhas de terceiros.** Não apaguei por conta própria:
   parte desses negócios (Santioh, Dilix, Queise, Dilee) é do próprio CEO, e
   apagar destrói o token cifrado — reconectar exige colar token de novo.
   Os ids estão prontos; o comando é um só, com `--ids=`.
2. **Fechar o fluxo master** (tela de escolha para a agência). Sem isso, apagar
   as 19 é limpeza que o próximo token colado desfaz.
3. **Reautorização da Foocci:** as 2 conexões legítimas continuam no banco, mas
   a lista nasce vazia — a Foocci precisa marcar na tela dela o que a Dioli pode
   ler. Até lá o portal dela diz "falta autorizar", que é a trava funcionando.

**Nenhuma escrita na Meta. Nenhum token revogado. Nada apagado em produção.**

---

## 🔴 06/08/2026 — FALHA DE PRIVACIDADE NA META: alcance tratado como autorização

**O CEO pegou; devia ter sido o sistema.** Ele clicou "Conectar
Facebook/Instagram" no portal do cliente **Foocci**. A Meta devolveu um token do
**usuário** dele, e a casa tratou "o que o token alcança" como "o que a agência
pode usar":

- `me/adaccounts` devolveu **14 contas de anúncio** — Santioh, Dilix, Queise,
  DileeBags e pessoais — e as 14 subiram para a tela;
- **pior, e não estava no pedido:** o callback do OAuth varreu `me/accounts` e
  **gravou como conexões da Foocci todas as Páginas e Instagram** que o token
  alcançava, **com o token de Página junto** — token que PUBLICA. A leitura foi
  de passagem; isso ficou no banco.

### O que foi construído (fail-closed, com as duas metades testadas)

| Peça | Onde |
|---|---|
| Lista explícita de ativos autorizados, por cliente | `MetaAtivoAutorizado` + `lib/integrations/meta/ativos-autorizados.ts` |
| Trava na leitura (contas, campanhas, insights) | `lib/integrations/meta/ads-leitura.ts` |
| Trava na gravação de conexão | `lib/integrations/meta/connections.ts` (`saveConnection` LANÇA) |
| Trava na escrita de anúncios | `lib/integrations/meta/ads.ts` |
| Callback não grava mais o que não foi marcado | `app/api/meta/callback/route.ts` |
| A escolha, na tela do cliente | `app/api/portal/meta-ativos/route.ts` + `components/portal/ConexoesDoCliente.tsx` |
| Perícia + limpeza do que ficou gravado | `scripts/meta-pericia-alcance.mts` |

**A regra em uma frase:** a lista é consultada pelo dono **derivado** do token
(portal ou linha de conexão), e conta fora dela não é lida nem perguntada à Meta
— sem lista, nada.

### 🔴 O QUE DEPENDE DO CEO

1. **Rodar a perícia contra PRODUÇÃO** (deste ambiente não há acesso ao banco de
   produção — o script rodou só contra o `dev.db`):
   `DATABASE_URL=<prod> npx tsx scripts/meta-pericia-alcance.mts` → conferir →
   `--apply`. Ele lista e apaga as conexões de Páginas/Instagram de terceiros
   gravadas como da Foocci e as linhas de cota (`MetaAdCota`) das contas não
   autorizadas.
2. **Efeito do deploy, declarado:** a tabela nasce **vazia**. No primeiro boot
   **nenhuma** conexão de cliente está autorizada — inclusive as legítimas da
   Foocci. É fail-closed funcionando. Preencher por inferência a partir das
   conexões existentes seria inventar o consentimento que o incidente provou não
   existir. **Cada cliente marca na tela dele** (portal → Conexões).
3. **Lacuna declarada:** o fluxo **master** (a agência conectando a conta dela
   própria, `clientId` nulo) ainda **não tem tela de escolha** — ele
   auto-autoriza e registra na lista. Fecha o buraco do cliente, não o da
   agência sobre si mesma.

---

## 🔴 06/08/2026 — A recaptura diária da biblioteca NÃO está rodando

Fato verificado, não suspeita: `docs/plataformas/CHANGELOG.md` ficou **três
dias sem uma linha** (03/08 → 06/08), e não existe agendamento algum no
repositório — nenhum workflow em `.github/workflows/` (só `cron-radar` e
`cron-execute`, ambos de produto), nenhum cron de sistema, nenhum arquivo de
Routine. O texto de 03/08 abaixo diz "recaptura diária agendada (rotina às
06:00 BRT)"; **esse agendamento não tem artefato em lugar nenhum**.

- **Consequência:** a biblioteca que serve de fonte aos pareceres-trava
  envelheceu em silêncio. Na recaptura de hoje, **7 fontes de política já
  tinham mudado** desde 03/08 sem ninguém saber.
- **Decisão do CEO necessária** (não faço por conta própria, exige criar
  agendamento): a rotina diária vive como **Routine do Claude** (sessão nova
  que roda a captura, lê o diff, escreve o CHANGELOG e commita) ou como
  **workflow do GitHub Actions** no molde de `cron-radar.yml`? A segunda é
  auditável no repositório e não depende de nenhuma sessão estar de pé — mas
  não sabe resumir a mudança em linguagem de negócio.
- Enquanto não houver rotina, **a data de `capturado_em` do arquivo é o único
  atestado de frescor** — o especialista precisa olhá-la antes de citar.

---

## 🟡 06/08/2026 — O token de SANDBOX da Meta não existe (bloqueia a prova final)

`scripts/meta-sandbox.ts` já monta a estrutura inteira (campanha → conjunto →
criativo → anúncio, tudo PAUSADO), com catálogo fechado e cota por pontuação.
**Falta o token.** As variáveis do Railway (projeto Dioli Digital) têm
`META_APP_ID`, `META_APP_SECRET` e o token do WhatsApp — **nenhum token de
usuário com `ads_management` para `act_1072627681961050`**.

- Testado hoje, com uma ÚNICA leitura (é assim que se testa acesso, nunca com
  create/delete): o app access token é recusado com
  `(#200) Ad account owner has NOT grant ads_management or ads_read permission`.
- **O que o CEO precisa fazer:** gerar no Explorer um token de usuário com
  `ads_management` + `ads_read` que enxergue a conta de sandbox e entregá-lo
  como variável de ambiente da execução (não commitado, não em arquivo).
- Sem isso, a estrutura completa **não está provada na Meta** — só no código e
  nos testes.

## 🟢 06/08/2026 — Cota da Marketing API: número corrigido e contador no banco

O código limitava por "300 + 40 × anúncios ativos por HORA", por processo. A
Marketing API usa **pontuação**: leitura 1, escrita 3, teto 60 por conta a cada
300s no nosso nível — **20 escritas travam a conta por 5 minutos**
(fonte capturada: `docs/plataformas/meta/fontes/marketing-api-limites-de-taxa.md`).
Contador agora em `MetaAdCota`/`MetaAdFreio` (banco), por conta de anúncios,
com incremento atômico e freio persistente. **O que continua aberto:** os
baldes de Instagram/WhatsApp de `ritmo.ts` e os caches de `leitura.ts`/`ads.ts`
ainda são memória de processo (lacuna 8 da cartilha).

---

## 🔵 05/08/2026 — Achados do raio-x, com dono

Saíram da coleta de 05/08 (`docs/raio-x/relatorios/2026-08-05.md`). O raio-x
diagnostica; o conserto é frente com dono e verificação.

- **`plataforma` — 4 rotas aceitam id sem provar posse.**
  `admin/backfill-carrossel`, `admin/training/sdr/suggestions/[id]`,
  `brain/changes/[id]`, `self-serve/order`. A fronteira única já existe
  (`lib/auth/posse-de-workspace.ts`); falta passar por ela.
- **`plataforma` — `/api/self-serve/order` grava no banco sem guarda nenhuma.**
  Pública, sem sessão, sem assinatura e sem limite por IP.
- **`plataforma` — 4 rotas públicas pagas defendidas só por contador em memória.**
  `sdr/chat`, `sdr/transcribe`, `sdr/upload`, `brain/briefing-extract`. O
  contador some no deploy e não atravessa réplica — mesma família da rota de
  imagem que estava aberta.
- **`esteira` — 6 estados gravados que ninguém lê.** `archived`, `dispensado`,
  `enviado`, `respondida`, `skipped_running`, `superseded`. Cada um é um botão
  que não faz nada ou uma tela que não filtra.
- **`qualidade` — o P0 da casa, agora com número que anda:** a maioria das
  checagens de `lib/dioli-brain/quality-gates.ts` segue sem mecanismo. Número
  corrente em `retratoDosPortoes()` / `__tests__/brain/o-numero-do-p0.test.ts` —
  não em prosa, que envelhece errado.
- **Diretor — cobrir a metade de DADOS.** Ela ficou CEGA na primeira noite (a
  rota `/api/cron/raio-x` ainda não estava em produção). Enquanto isso, o raio-x
  não enxerga o que está preso AGORA no banco.

---

## 🔴 AÇÃO DO CEO — autorizar o backfill das 36 telas da Foocci

**Sem isso, o carrossel no portal continua mostrando só a capa.** As 36 telas
estão nos Arquivos do cliente; o que falta é ligá-las aos 6 posts.

O protocolo é obrigatório e nesta ordem (`scripts/backfill-carrossel-foocci.mjs`):

1. **dry-run** (sem flag nenhuma) — imprime o plano;
2. **conferir o log**: quantas casaram, quantas foram excluídas e quantas sobraram;
3. só então **`--apply`**.

**Sem `--force`** (sobrescreve carrossel já montado) e **sem `--por-ordem`** (o
passe posicional, que monta carrossel com logo e material bruto). Se o dry-run
deixar sobra, a sobra é para o CEO olhar — não para o script resolver.

---

## 🟠 04/08/2026 (manhã e tarde) — Três pedidos do CEO entregues em 4 ondas

O CEO pediu três coisas. As três estão no ar, depois de **4 auditorias
adversariais — 3 delas reprovando o próprio trabalho**.

**1. O card de aprovação virou visual.** O cliente vê imagem e legenda peça por
peça, no estilo do planner da Meta, em vez de um bloco de texto. O calendário
ficou clicável, e o carrossel abre num modal navegável.

**2. A agência passou a mostrar resultado real.** Métricas vindas da Meta —
alcance e engajamento da conta com série no tempo, e desempenho por post —
aparecem na seção Resultados do portal e na ficha do cliente
(`lib/integrations/meta/leitura.ts`).

**3. Ninguém produz antes de ler o cliente.** Antes de qualquer especialista
escrever uma linha, o sistema lê o Instagram real do cliente e sintetiza o que
achou (`lib/agency/execution/leitura-do-cliente.ts`). Essa leitura entra no
contexto de **todos** os especialistas e também do auditor.

### O que a auditoria reprovou 3 vezes — e por quê importa

O piso que impede a agência de afirmar ao cliente algo que ela não observou foi
**reprovado três vezes pelo mesmo defeito**: ele media um pedaço do texto e
publicava o texto inteiro. Na prática, bastava o cliente ter escrito uma palavra
verdadeira para uma frase inventada em volta dela sair rotulada como *"observado
no feed"*. Hoje a exigência é **total**: se um único pedaço do termo não estiver
no texto real do cliente, o termo inteiro cai
(`lib/agency/execution/leitura-do-cliente.ts:311`).

**Isso construiu o item 1 dos 4 do P0 da casa** (o piso determinístico). Os
outros três continuam abertos — ver a seção do P0 abaixo.

### 🔴 A dívida que fica, com todas as letras

| O que | Por que importa | Custo de fechar |
|---|---|---|
| **A trava confere PALAVRA, não FRASE** | Recombinar palavras verdadeiras do próprio cliente pode afirmar algo falso: *"bancada de mármore"* + *"bolo rosa"* → *"bancada de mármore rosa"*, entregue como observado. | Depende do LLM-judge que não existe. **Contenção barata já nomeada:** parar de rotular composição como "observado" — o mesmo tratamento que o `tom` já recebe (`leitura-do-cliente.ts:739`). |
| **Excesso de rigor tem preço** | O tamanho mínimo de palavra é 5 (`leitura-do-cliente.ts:291`): "bolo", "pão", "café", "doce" no singular não casam com o plural, e sob exigência total um pedaço derruba o termo todo. **O piloto vai dizer "não consegui observar o estilo" com frequência alta.** | Baixar para 4 — **não para 3**, senão "coros" ancoraria "cor". Baixo risco, com os testes de colisão verdes. |
| **O teto de chamadas à Meta é por PROCESSO, não por conta** | Com mais de uma instância o teto real multiplica; depois de um deploy, zera. Foi a Meta restringindo a conta em 03/08 que criou essa regra. (`lib/integrations/meta/leitura.ts:84` — a limitação está escrita no próprio código.) | Contador no banco. |
| **O `tom` da síntese não tem piso** | Tom é interpretação, e hoje é declarado como hipótese **no prompt** — isso é sugestão, não trava. | Fica como resíduo da onda; `run-execution` já foi consertado. |
| **Fail-open no TEXTO do card de aprovação** | A mídia foi fechada; o texto vindo de entrega interna ainda passa (`app/api/brain/portal-data/route.ts:218`). | O conserto seco apagaria o corpo de cards **já em voo** — precisa de um passe de dados antes. |
| **A leitura do feed não é visual** | O "estilo" é lido das legendas, não dos pixels. Se o cliente não descreve o que fotografa, a agência não vê. | Exige provedor com visão. |

---

## 🟠 04/08/2026 (madrugada) — Carrosséis V3 no portal, aguardando decisão do CEO

CEO confirmou que o material está completo (briefing, brand book, IG de
referência) e cobrou a entrega. Produzida a **V3 das 36 telas**, fiel ao
padrão real do feed @foocci_ (V1/V2 reprovadas):

- Sobre a V2: logo recortada com alpha (sem caixa cinza), TODAS as telas com
  fotografia cinematográfica (6 fotos novas geradas pelo design engine de
  produção), exposição corrigida, ícones SVG de linha no lugar de emoji,
  **mockup de conversa WhatsApp** (assinatura do feed) em C2T3 e C4T5,
  capitalização de frase como o feed usa.
- Auto-revisão por amostragem (12/36 telas): ≥8 em hierarquia, tipografia,
  espaçamento e consistência com o feed real.
- Produção: capas dos 6 posts trocadas (mediaUrl novos, 200 confirmado no
  portal) e as 36 telas subidas aos Arquivos do cliente Foocci.
- **Aguardando: decisão do CEO no card "Carrosséis de lançamento — 6 peças"**
  (Aprovar · Solicitar ajustes · Tenho uma dúvida) no portal.
- Publicação continua MANUAL (trava de plataforma). Token de publicação
  orgânica segue pendente com o CEO; nada sobe à Meta por API.
- Corrigido de passagem no portal: o texto do card de aprovação renderiza
  negrito de verdade (antes aparecia `**asterisco**` cru).

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

### 1. A maioria dos quality gates ainda não protege nada
O registro é `lib/dioli-brain/quality-gates.ts`. **A maior parte das checagens
declara `lacuna`, não `mecanismo`** — texto descrevendo o que um humano deveria
conferir.

> **O número não fica escrito aqui, de propósito.** Este parágrafo dizia "31
> checagens, 28 sem mecanismo, só 3 rodam" muito depois de os três números terem
> mudado: prosa que descreve um número não muda junto com o número, e ninguém
> lembra de atualizar. A fonte é `retratoDosPortoes()`, e
> `__tests__/brain/o-numero-do-p0.test.ts` quebra quando o número anda — é ele
> que obriga a prosa a acompanhar.

Com revisão humana era um checklist. Sem revisão humana é **decoração** — e as
bloqueantes globais ainda descobertas são exatamente as falhas que chegam no
cliente: *respeita a marca*, *corresponde ao briefing*, *valor ao cliente claro*,
*riscos verificados*. (*Sem alucinação* saiu dessa lista — ganhou mecanismo. O
buraco encolheu; não fechou.)

**O que precisa existir:**
1. ✅ **Construído em 04/08/2026** — piso determinístico: afirmação conferida
   contra o texto real do cliente antes de virar "observado"
   (`lib/agency/execution/leitura-do-cliente.ts`). **Confere palavra, não frase**
   — ver a dívida no topo deste documento.
2. 🔴 LLM-judge para os subjetivos, com reprovação **bloqueante** e indisponibilidade
   **não-bloqueante**
3. 🔴 Default do registry invertido — departamento sem gate executável = **REPROVADO**
4. 🔴 Escada por departamento — sombra até haver evidência

> **As checagens desligadas continuam desligadas.** Um dos quatro itens ficou
> de pé; três não. Quem ler só o item 1 e concluir "o P0 andou" está lendo errado:
> o piso protege *uma* afirmação de *uma* fonte, não o entregável.

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
