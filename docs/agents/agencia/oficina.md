# Oficina — agencia (esteira de agência)

> Append-only. O especialista escreve; **quem promove para a vitrine é o Diretor**.
> Sala aberta em 13/08/2026 — não havia `docs/agents/agencia/` neste repositório.
> A sala vizinha do mesmo assunto é `docs/agents/departamentos/` (social-media +
> design), que é de outro agente e **não foi tocada**.

---

## 2026-08-13 — A arte do CityJobs não conversa com a vaga: onde o sinal se perde

**Despacho:** item 19 da lista do CEO. Palavras dele: *"as vagas não têm muito a
ver com a arte que ele está criando. Então só dá essa direção pra ele."*
Elogio + desalinhamento. Nada foi produzido e nada foi publicado.

### O padrão do erro, com a peça na mão

Comparei as quatro peças físicas do repositório
(`docs/entregas/cityjobs-08-08/`, aprovadas e reprovadas) com o texto que cada
uma carrega e com a tabela das seis de 07/08
(`docs/projetos/cityjobs-registro-07-08.md:139-186`).

**A arte prova O CLIENTE; ela nunca prova A PEÇA.** Em toda peça do CityJobs a
imagem responde *"quem é o anunciante?"* — uma plataforma de vagas do Alto Tietê:
estação, avenida, comércio de rua, skyline. Nenhuma responde *"o que está sendo
oferecido aqui?"* — este cargo, neste setor, nesta cidade.

Nas duas aprovadas de 08/08 **isso está certo**, e é por isso que o CEO gostou:
as duas são institucionais (bastidor da região · vaga validada), e institucional
prova a região mesmo. O erro aparece quando **a mesma direção é aplicada a uma
peça que anuncia uma vaga**: sobra cidade e falta trabalho.

O sintoma extremo já estava medido: quando o tema tocava vaga de verdade, o
modelo, sem nenhuma direção sobre o trabalho anunciado, **preencheu o vazio
inventando** — `VAGA $3,500`, `R$6.000`, `Assistents Administrativo · R$ 2000 per
wes`. Três em seis. A trava certa foi feita (`pilares-bloqueados.ts`) e é de
recusa; ela impede o dano e **não** faz a arte conversar com a vaga.

### De onde vem a decisão da imagem — e onde o sinal se perde

Duas portas, e só uma tem a régua da marca:

| | Porta do TEXTO | Porta da IMAGEM |
|---|---|---|
| quem monta | `especialistas.ts:272` ← `run-execution.ts:347` | `artes.ts:1247` (`montarPrompt`) |
| o que recebe da marca | `contratoDeMarca()` inteiro (proibições, léxico, voz, limites) | nada disso |

Na porta da imagem, o post avulso e o **story** recebiam oito sinais: seis são
constantes do CLIENTE (nome, segmento, cores, tom, estilo do feed, estilo visto)
e só dois variam por peça (legenda e pilar). O carrossel recebia mais dois —
`papelDaTela` e `amplitude` (`artes.ts:1568-1569`) — e o post simples **não**.

Consequência exata, medida: o cérebro criativo do CityJobs já dizia, escrito, com
procedência, `NUNCA: banco de imagem genérico sem relação com a região` e
`NUNCA: estética de escritório de tecnologia — coworking, tablet, mármore, café`
(`repertorio-registrado.ts`) — e **essa frase nunca chegou ao gerador de uma peça
avulsa**. Regra escrita que não atravessa a porta.

A escolha da foto REAL (`escolha-de-foto.ts:277`) também não olha a vaga: ela casa
palavra do NOME DO ARQUIVO com a legenda. Está certo para o que ela é, e não
resolve isto — o CityJobs não tem material no Drive.

**NÃO VERIFICADO:** o gerador dos stories que o CEO elogiou é da **plataforma do
CityJobs**, não deste repositório (o contrato exclui stories —
`cityjobs-orcamento.md:43`). Não há uma linha desse gerador aqui, e não há
nenhum campo de vaga no sistema: `SocialPost` tem `caption`, `pillar`, `format` e
nada de cargo, setor ou cidade (`prisma/schema.prisma:1224`). A direção abaixo
vale para as duas produções, mas só a nossa foi ligada em código.

### A direção, escrita como regra

1. Peça que anuncia **uma vaga** prova a vaga: a cena é **o lugar onde aquele
   trabalho acontece**, na **cidade da vaga**.
2. Peça **institucional, de comunidade ou de bastidor** prova a **região** —
   estação, avenida, comércio de rua. É o que o CEO aprovou e continua valendo.
3. Nunca: cidade/estação/skyline em peça de cargo específico · escritório,
   coworking, notebook ou reunião quando o cargo não é de escritório · clichê de
   contratação (currículo na mão, aperto de mão, confete) · pessoa sorrindo sem
   lugar de trabalho reconhecível em volta.
4. Continua valendo: cargo, salário ou nome de empresa **dentro dos pixels** é
   reprovação (`pilares-bloqueados.ts`).

### Onde ela mora, e por quê

No **contrato de marca do CityJobs** — `cerebroDoCityJobs()` em
`lib/agency/design/repertorio-registrado.ts`, como um eixo de amplitude novo
(*"o que a imagem tem de provar"*), com procedência do CEO.

Escolhido por eliminação verificável: as **proibições do cliente** leem TEXTO
(`trava-de-texto.ts`, `regua-do-texto.ts`) e este defeito não está no texto — não
disparariam nunca. Um **documento de manual** é a doença que o próprio despacho
nomeou. O cérebro da marca é o único dos três que a máquina que desenha a peça lê
por peça, via `lerMarca` → `marca.cerebro` → `direcaoDeAmplitude` → prompt.

### O que mudou em código (regra, não peça)

- `lib/agency/execution/artes.ts` — o caminho do post simples e do **story**
  passa a mandar `amplitude: direcaoDeAmplitude(marca.cerebro)` ao `montarPrompt`.
  Uma linha; é a porta que faltava. Vale para **toda marca com cérebro**, não só
  o CityJobs. Cérebro sem amplitude devolve vazio e o prompt não menciona nada.
- `lib/agency/design/repertorio-registrado.ts` — o eixo novo no cérebro do
  CityJobs. Dado, não `if`.
- `__tests__/design/a-arte-conversa-com-a-vaga.test.ts` — 7 testes. Conferido que
  os 2 da fiação **falham sem a correção** (`git stash` do `artes.ts`, 2 vermelhos
  de 7). Suíte inteira: 213 arquivos, 3479 verdes; `tsc --noEmit` limpo.

### O que fica aberto

- **A regra precisa chegar ao gerador de stories do CityJobs**, que é externo.
  Nada neste repositório alcança aquele código. Enquanto não chegar, a metade que
  o CEO reclamou continua igual — o que consertei foi a nossa porta.
- **O sinal da vaga não existe no nosso modelo.** Para a arte conversar com a
  vaga de verdade, `SocialPost` precisaria carregar cargo/setor/cidade. Não
  inventei o campo: sem produtor para ele, seria mais um portão de decoração.
- `conferenciaDePixelDisponivel()` continua `false` — os pilares de vaga seguem
  bloqueados, e com razão.

---

## 2026-08-14 — As 6 peças do CityJobs não saem porque o ARQUIVO é velho, não o código

**Despacho:** `/api/meta/prontidao` rodou contra produção em 2026-08-14T21:43Z —
6 posts do CityJobs agendados, os 6 com `pronto:false`, todos parando no portão
8 (**Formato do arquivo**). Reconverter e religar, sem publicar nada.

### O que eu medi, e onde

Não confiei no resumo do despacho; li a corrente inteira.

**Como um post agendado referencia a mídia** (`prontidao-de-publicacao.ts:362-365`
e `esteira/publicacao.ts`): peça única guarda `SocialPost.mediaUrl`; carrossel
guarda as N telas em `SocialPost.mediaUrlsJson`. Nos dois casos a string é
`/api/media/<id>`, e o `<id>` é a chave de `MediaAsset`.

**O que o portão de formato lê** (`prontidao-de-publicacao.ts:372-386`): ele
recorta esses ids, busca `MediaAsset.mimeType` no banco e entrega a
`conferirFormatoDeMidia` (`integrations/meta/formato-de-midia.ts:83`), que é a
MESMA função que o publicador chama em `publicacao.ts:679`. Ele lê o `mimeType`
gravado — nunca os bytes. Peça sem mídia guardada nesta casa **passa** no portão
8 (`:369`), o que está certo: não medimos o que não é nosso.

**A causa está consertada há uma semana.** `design/renderizar.ts` rasteriza com
`SAIDA_DA_PECA = { type: "jpeg", quality: 92 }` e exporta
`MIME_DA_PECA_RENDERIZADA`; `comporComMolde` devolve esse MIME e quem grava
obedece (`artes.ts:891`, `:452`). O defeito não é do código de hoje — é
**estoque**: peças rasterizadas em 08/08 pelo motor velho, ainda penduradas nos
posts. Nenhum deploy as desbloqueia, porque o arquivo antigo continua sendo o
arquivo do post.

**E nenhum dos dois consertos que já existiam as alcançava.** `sem-molde`
procura uma marca em `lastError` que elas não têm (nasceram certas para o motor
da época); `marca-nova` compara a data da arte com a do material de marca, e
nelas essa comparação está certa. Elas são invisíveis para os dois — a única
testemunha é o `mimeType` do arquivo.

### O caminho escolhido: REGERAR, não converter o binário

Regerar é viável e não passa perto de publicar. `recomporPecas`
(`artes.ts:1022`) lê a foto **já paga** de `fundo-<postId>.png`, roda o
rasterizador de hoje (que sai JPEG), grava arquivo novo e troca só o `mediaUrl`.
Custa ≈1s de rasterização e zero de fatura. Converter o binário por fora foi
descartado: entregaria um JPEG recomprimido a partir de um PNG que já perdeu a
camada de marca daquela época, sem passar pela trava de letra — e a régua de
texto (`trava-de-texto.ts`) é justamente o que separa peça de arquivo.

### O que mudou em código

- `lib/agency/execution/reconversao-de-formato.ts` — **novo, somente leitura.**
  A seleção e o retrato. Chama `conferirFormatoDeMidia`, não copia a régua.
  Lista à parte os carrosséis recusados, que são de outra mão
  (`recomporCarrosseis`), para o relatório não parecer completo calando.
- `lib/agency/execution/artes.ts` — modo `formato-recusado` em `recomporPecas`,
  usando aquela seleção. E um **portão de saída** antes de gravar
  (`conferirFormatoDeMidia` sobre a peça recomposta): hoje é impossível falhar,
  e é por isso que ele custa nada e transforma "sai JPEG porque eu li o código"
  em "sai JPEG porque foi medido antes de gravar".
- `app/api/admin/recompor-pecas/route.ts` — `?modo=formato-recusado`. Lista de
  modos continua FECHADA.
- `scripts/reconverter-pecas-para-jpeg.mts` — o comando de operação.
  **Padrão é MEDIR**; só escreve com `--aplicar`; `--carrosseis` chama a outra
  função. Mede antes E depois — conserto que não remede é portão de decoração,
  que é a pendência P0 desta sala.
- `package.json` — `npm run reconverter:jpeg` e `npm run prontidao`.
- `__tests__/execution/reconverter-para-jpeg.test.ts` — 17 testes.

### O que a prova cobre (e como sei que ela vale)

A camada que importa anda a corrente inteira com o **Chromium de verdade**: a
peça em PNG entra, o rasterizador roda, o arquivo é gravado, o post passa a
apontar para ele, e a MESMA trava que recusou o PNG é chamada sobre o resultado.
Confere os **bytes** (assinatura JPEG), não só a etiqueta.

**Mutação conferida:** troquei `SAIDA_DA_PECA` para `png` em `renderizar.ts` e
rodei — **2 vermelhos**, e o portão de saída novo recusou gravar. Restaurado.
Suíte inteira: 217 arquivos, 3523 verdes, 1 pulado; `tsc --noEmit` limpo.

### Nada publica, e isso é mecanismo

A data marcada não é tocada (um teste exige que a escrita no post tenha
EXATAMENTE `mediaUrl` e `lastError`). `PUBLICACAO_ORGANICA` não é lida nem
mencionada em código — um teste reprova `process.env.PUBLICACAO_ORGANICA`,
`publicacaoOrganicaLiberada` e o módulo da trava dentro do script. Reagendar ≠
publicar, e aqui nem reagendar acontece: o que muda é o arquivo.

### O que fica aberto

- **Não rodei contra produção.** Este ambiente não tem o `DATABASE_URL` de
  produção (o `.env` local aponta para um sqlite). O comando existe e foi rodado
  em modo medição contra o banco local; quem tiver a credencial roda com
  `--aplicar`. Não afirmo o estado dos 6 posts depois — afirmo que a máquina
  que os conserta está provada, e que ela remede sozinha e imprime o depois.
- **O formato é 1 portão de 12.** Passar nele não faz o post sair: o portão 11
  (`PUBLICACAO_ORGANICA`) segue desligado por decisão declarada do CEO, e o 12
  (o que a Meta concedeu) fica `nao_medido` sem `--meta`. Isso está certo.
- Peça cuja foto de fundo sumiu do armazenamento cai em `semFundo` e **não** é
  regerada: regerar exigiria comprar imagem nova e entregaria outra foto num
  calendário já aprovado. Continua sendo decisão que custa, e não é do script.
## 2026-08-14 · A terceira pergunta: quem aprova a peça é o cliente dela

**Pedido:** transformar em código a ordem do CEO — *"quem libera, quem aprova,
são os clientes"* — trocando o interruptor geral por um portão peça por peça.

### O que medi antes de escrever (e mudou o desenho)

A casa **já registrava aprovação**, e registrava bem. Achei o mecanismo inteiro
antes de encostar em qualquer arquivo:

- `ApprovalRequest` (prisma/schema.prisma:1299) — o card que o cliente decide;
- `sourcePostIdsJson` (schema.prisma:1335) — **quais peças aquele card decide**.
  Era exatamente a peça que faltava para "peça por peça" existir sem inventar
  tabela;
- `app/api/social-posts/aprovacao/route.ts` — a equipe transforma N posts do
  calendário em UM card, com `clientId` derivado DOS POSTS;
- `app/api/portal/approvals/route.ts:174` — o cliente decide, e grava
  `reviewedBy = "client:<nome>"` depois de conferir a posse do token do portal.

**Nada disso era consultado antes de publicar.** O registro existia e o
publicador não o lia. Não era falta de mecanismo — era falta de pergunta.

### A descoberta que quase me fez escrever a trava errada

`reviewedBy` tem **três grafias vivas**, e elas não valem o mesmo:

| Grafia | Quem grava | Vale? |
|---|---|---|
| `client:<nome>` | `/api/portal/approvals` (token do portal) | **sim** |
| `cliente` (seco) | `marcos.aprovarPacote:394` | **não** |
| `equipe:<email>` / `internal` | rotas de sessão da agência | **não** |

O `"cliente"` seco parece aprovação do cliente e **não é**: `aprovarPacote` é
alcançável por `app/api/projects/[id]/esteira/route.ts:76`, que é rota de sessão
da **agência**. Alguém da casa clicando "aprovar tudo" pelo cliente grava a mesma
string que o cliente gravaria. Se eu tivesse aceitado essa grafia — e ela é a
mais óbvia de aceitar, porque literalmente diz "cliente" — a trava passaria a
carimbar como consentimento do cliente aquilo que a agência decidiu por ele.
**Autoria ambígua não é autoria.** Há teste travando exatamente esse caso.

### Onde a trava mora, e por que não em `esteira/publicacao.ts`

Pus a conferência dentro de `conferirPublicacao` (o caminho único de
`publishPost`) e levei `postId` até lá via `PublishInput`. A alternativa fácil
era conferir em `esteira/publicacao.ts`, onde o post já está na mão — mas isso
cobriria o despertador e deixaria `/api/meta/publish` descoberta. **É o mesmo
desenho que deixou PUBLICAR de fora da trava de ativos em 06/08**: a trava na
rota, e não onde o dado passa.

Efeito colateral que virou decisão: `/api/meta/publish` recebe legenda e mídia
**arbitrárias**. Aceitar `postId` junto deixaria alguém apontar uma peça aprovada
e publicar outra coisa por baixo dela — a aprovação do cliente viraria senha, não
consentimento. Então a rota **descarta `postId` de propósito** e passa a ser
recusada pela trava, com frase que ensina o caminho certo.

### O que mudou em código

- `lib/agency/esteira/aprovacao-da-peca.ts` (novo) — só LÊ. Nunca aprova nada.
- `lib/integrations/meta/trava-de-publicacao.ts` — de duas para **três**
  perguntas, do mais específico ao mais geral. `PUBLICACAO_ORGANICA` reescrita
  como **freio de emergência**, com a data e a ordem do CEO no cabeçalho.
- `lib/agency/esteira/prontidao-de-publicacao.ts` — portão 11 vira "Aprovação do
  cliente (peça por peça)" e **nomeia quem precisa aprovar**; freio vira 12;
  Meta vira 13. `QuemResolve` ganha `cliente_aprova` e troca `ceo_decide` por
  `freio_da_casa`.
- `lib/integrations/meta/{types,client}.ts`, `lib/agency/esteira/publicacao.ts`,
  `app/api/meta/publish/route.ts` — a fiação do `postId`.

Suíte: **216 arquivos, 3523 verdes**, `tsc --noEmit` limpo. Commit `b8809bd`.

### O que fica aberto (não inventei solução)

- **Ninguém abre o card sozinho.** `/api/social-posts/aprovacao` é rota de sessão
  master/PM: as peças do CityJobs só chegam ao cliente se alguém da equipe
  abrir o card. Não existe gatilho automático, e eu não criei um — criar seria
  decidir que a agência escolhe quando pedir aprovação, o que é desenho de
  produto, não de trava.
- **Peça já publicada antes desta mudança** não tem aprovação registrada e
  também não precisa: a trava só olha para a frente.
- **O freio segue puxado** por App Review e verificação do negócio — razões da
  plataforma, que nenhum cliente pode aprovar.

---

## 2026-08-14 (2) — O redesenho é o conserto ERRADO para estas 6 peças

**Despacho:** as duas passadas contra produção voltaram `0` recompostas. A
primeira porque as 6 peças são carrosséis; a segunda achou as 6 e **falhou nas
6**, sem `semFundo`.

### O que eu NÃO confirmei, e por que digo isso

**Não consigo alcançar o banco de produção daqui**, então não confirmei a causa
por medição. O que fiz foi enumerar, no código, TODOS os caminhos de
`recomporCarrosseis` que produzem `falhas` — e o despacho supunha um só:

| # | Caminho | Frase que ele grava |
|---|---|---|
| 1 | `cenas.length < 2` (`recompor-carrossel.ts:83`) | "o carrossel não tem telas descritas" |
| 2 | `comporComMolde` devolve infra | "não há Chromium para rasterizar o molde…" |
| 3 | `guardarArquivo` recusa | cota estourada / arquivo grande demais / mime |
| 4 | `urls.length !== telas.length` | "não consegui redesenhar todas as telas" |

**O caminho 2 produz EXATAMENTE o mesmo placar** (`recompostas:0, semFundo:0,
falhas:6`) e é uma hipótese viva: `recomporPecas` tem a guarda
`renderizadorDisponivel()` desde 08/08 e **`recomporCarrosseis` não tinha**.
Sem Chromium, o laço ia até o molde, levava `sem_navegador` em cada tela e
gravava seis falhas de CONTEÚDO — infra travestida de defeito de peça, que manda
o operador para o lugar errado com confiança. Isso agora está fechado: a guarda
existe e a passada devolve `semRenderizador` sem tocar em peça nenhuma.

E o `jq` do workflow **escondia a resposta**: ele imprimia a contagem de falhas e
nunca o motivo, e `semRenderizador` não estava na lista de campos. Uma passada em
produção foi gasta sem responder a pergunta. Agora ele imprime **os motivos
distintos, sem ids** (o texto do erro é frase de sistema, não carrega id de post
nem de cliente) e sobe `::error::` quando falta rasterizador.

### A resposta ao item 2: SIM, dá para reconverter sem redesenhar

E é mais do que possível — é o caminho **certo**, por um motivo que não estava no
despacho e que achei lendo `esteira/aprovacao-da-peca.ts`:

> **A aprovação do cliente fica presa ao POST (`ApprovalRequest.sourcePostIdsJson`),
> não ao arquivo.** Trocar os pixels de uma peça já aprovada **não invalida
> nada** — ela simplesmente passa a valer para uma imagem que o cliente nunca
> viu. Redesenhar não é só "mexer mais": é furar, em silêncio, a trava que o CEO
> mandou criar hoje.

Somando: redesenhar **precisa** do `scenesJson` (que é justamente o que falta),
**muda** a peça do calendário e **engana** a aprovação. Reconverter o contêiner
não precisa de roteiro nenhum, não muda um pixel e não cria nada para reaprovar.

### O que mudou em código

- `lib/agency/media/para-jpeg.ts` — **novo.** Os mesmos pixels, noutro
  contêiner. Dois caminhos: `sharp` (que é **transitivo**, vem do `next` — não é
  dependência declarada, e depender disso em silêncio é a armadilha do
  `playwright` de 07/08) e, na falta dele, **o próprio rasterizador da casa**,
  desenhando a imagem no tamanho natural e recortando o retângulo exato. Sem os
  dois, a porta fecha e a recusa **nomeia as duas metades**.
- `lib/agency/execution/reconverter-arquivos.ts` — **novo.** A passada:
  carrosséis e peças únicas, tudo-ou-nada por post, portão de saída pela régua da
  publicação antes de gravar. A escrita é **`mediaUrl` (+ `mediaUrlsJson`) e mais
  nada** — `scheduledFor`, `status` e até `lastError` ficam intocados.
- `lib/agency/execution/recompor-carrossel.ts` — a guarda de navegador que
  faltava.
- `app/api/admin/recompor-pecas/route.ts` — `?modo=so-o-arquivo`.
- `.github/workflows/reconverter-pecas-jpeg.yml` — motivos distintos sem ids,
  `semRenderizador` visível, `so-o-arquivo` como opção **padrão** do botão.
- `scripts/reconverter-pecas-para-jpeg.mts` — `--aplicar` passa a fazer o gesto
  mínimo; redesenhar exige `--redesenhar`, com aviso.
- Testes: `__tests__/media/para-jpeg.test.ts` (12) e
  `__tests__/execution/reconverter-arquivos.test.ts` (14), mais a guarda nova em
  `recompor-carrossel.test.ts`.

### Como sei que a conversão vale

Medida nos **bytes**, não na etiqueta: PNG real de 12×9 entra, sai com
assinatura JPEG e **nas mesmas medidas** (um `object-fit` ou escala errada
apareceria como outra dimensão). Arquivo que já é JPEG volta **idêntico** —
idempotência de verdade. E o caminho de reserva é **exercitado**: com o `sharp`
mockado como ausente, a conversão sai pelo rasterizador de verdade (479 ms de
Chromium na rodada), porque plano B que ninguém roda é decoração.

Suíte: 219 arquivos, 3570 verdes, 1 pulado. `tsc --noEmit` limpo.

### O que fica aberto (não decidi sozinho)

- **A aprovação não acompanha a arte.** Hoje trocar o arquivo de uma peça
  aprovada é invisível para `ApprovalRequest`. Reconverter não explora isso
  (a imagem é a mesma), mas **redesenhar explora** — e o modo `carrossel` e o
  `formato-recusado` continuam existindo e continuam podendo. O conserto seria
  invalidar a aprovação quando a arte muda, e isso é decisão de produto: obriga
  o cliente a reaprovar.
- **`sharp` não é dependência declarada.** O caminho de reserva cobre, e o campo
  `caminhos` da resposta diz qual dos dois a produção realmente usou — mas
  declarar a dependência é uma decisão de deploy que não tomei sozinho.

---

## 2026-08-14 · O card de aprovação que faltava, e o botão para abri-lo

### O que eu vim medir

*"Existe card de aprovação para as 6 peças do CityJobs?"* — a trava nova
(`lib/agency/esteira/aprovacao-da-peca.ts`) exige `ApprovalRequest` com
`sourcePostIdsJson` contendo o id da peça, `status: "approved"` **e** `reviewedBy`
começando em `client:`. Sem sessão de master não havia como olhar isso em
produção: `/api/meta/prontidao` exige sessão, e o painel só mostra a contagem
agregada ("Aprovações 15 · 7 aguardando revisão"), que **não diz de qual cliente
nem de quais peças**. Contagem agregada respondendo pergunta específica é como se
conclui errado com número certo.

### O que eu fiz

Um botão que **mede antes de escrever**, e que **abre o pedido sem aprovar nada**.

- `lib/agency/esteira/cards-de-aprovacao.ts` — a regra (triagem + corpo do card).
- `app/api/admin/cards-de-aprovacao/route.ts` — POST, `Bearer CRON_SECRET`,
  segredo ausente → 503, **leitura pura por padrão**, `?criar=1` para gravar.
- `.github/workflows/abrir-cards-de-aprovacao.yml` — `workflow_dispatch`, com
  `medir` como opção padrão.
- `__tests__/esteira/cards-de-aprovacao.test.ts` — 22 testes.

### A régua saiu da rota, e por quê

O corpo do card morava dentro de `/api/social-posts/aprovacao`, que **exige
sessão**. A alternativa a extrair era uma segunda cópia — e a divergência
apareceria no que **o cliente lê**: `reviewNote` é o que o portal renderiza
("título na primeira linha, peças no resto"). Duas réguas produziriam cards que o
cliente lê diferente conforme quem os abriu. Mesmo remédio de
`links-do-portal.ts`, pelo mesmo motivo: uma implementação, dois donos.

O que **não** saiu da rota, de propósito: o guard de sessão, a posse por
`workspaceId` e o rigor. Lá alguém escolheu as peças a dedo, então peça
inelegível é erro HTTP; aqui ninguém escolheu peça nenhuma, então ela é excluída
com motivo. Isso é contrato de rota, não regra de negócio. O teste de contrato
que já existia (`__tests__/portal/aprovacao-cliente-direto.test.ts`) passou sem
uma linha alterada — é ele que prova que a extração não mudou comportamento.

### A sutileza que faz o módulo valer

Card `approved` cujo `reviewedBy` **não** é `client:` — o `cliente` seco de
`aprovarPacote`, ou `equipe:<email>` — **não conta como aprovado**, e a peça
continua elegível para um card novo. Tem que ser assim porque `aprovacaoDaPeca`
recusa esse carimbo: se eu o tratasse como pronto, a peça ficaria num limbo
silencioso — ninguém abriria o card e a trava nunca abriria a porta. Está travado
em teste, com os quatro carimbos.

### O que aprendi lendo a fila até o fim

**Aprovar não empurra a data destas 6 peças, e isso muda o desfecho.**
`agendarPecasAprovadas` só promove `ESTADOS_PROMOVIVEIS = ["draft","approved"]`
(`lib/agency/esteira/publicacao.ts:177`). As 6 do CityJobs estão em `scheduled`,
então caem em `ignorados` e **a data original fica de pé**. Como essas datas já
passaram, o relógio as pega **na passada seguinte de 5 minutos** — e
`MAX_PUBLICACOES_POR_RODADA = 10` deixa as 6 saírem **juntas**. Ninguém pediu
rajada; ela é o efeito de um caminho que foi escrito para peça em `draft` e está
sendo usado por peça em `scheduled`.

### Verificação

`npx tsc --noEmit` limpo. Suíte: 220 arquivos, 3589 verdes, 1 pulado.

### O que fica aberto (não decidi sozinho)

- **A rajada acima.** Duas saídas: (a) `agendarPecasAprovadas` passa a empurrar
  data também de peça `scheduled` — vira uma peça por dia às 10h, previsível,
  mas mexe no calendário que o cliente acabou de ver e aprovar; (b) deixar como
  está e soltar o freio só quando a rajada for aceitável. É decisão de produto:
  a (a) muda a data que o cliente aprovou, e mudar o que ele aprovou depois do
  sim é o tipo de coisa que não se faz em silêncio.
- **`ignorados` só vai para `console.error`.** Peça aprovada que não vira
  calendário fica visível apenas no log do servidor. Aqui não machuca (a peça já
  está `scheduled`), mas o alerta não tem testemunha.
