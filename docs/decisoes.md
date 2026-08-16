# O corredor — decisões que atravessam domínios

> Decisão que afeta mais de um especialista não mora na sala de nenhum deles.
> Mora aqui. **Só o PM escreve neste arquivo.**
>
> Decisão que serve a **mais de um projeto** não mora aqui: vai como proposta ao
> **Diretor Geral do Cérebro**, no `dioli-brain-kit`.

---

## O CONTATO DO LEAD É COLUNA, E PEDIR CONTATO É CONVERSA — NUNCA FORMULÁRIO

**Decidido em** 2026-08-16 · **por** o Diretor, executado pelo `pm` ·
**PR** #170, branch `claude/contato-com-coluna` ·
**origem:** a pergunta do CEO sobre o aviso do orçamento

**O que estava aberto.** O contato do lead morava dentro de `briefingJson`, um
blob de texto — escolha declarada em 08/08, com o preço escrito junto: *sem
coluna, não dá para filtrar nem indexar por contato no banco*. E o pedido de
contato, no passo de confirmação, era um formulário de três campos com o botão
apagado até tudo preenchido.

**As três decisões, e a terceira NÃO foi tomada aqui.**

1. **A coluna existe, e é PROJEÇÃO — não entrada.** `contatoNome`,
   `contatoEmail`, `contatoWhatsapp` e `contatoEm` são escritos pelo serviço de
   persistência a partir de `lerContato`, o leitor único. Ninguém os digita.
   Se um segundo lugar decidisse o que é contato, a consulta do banco e a tela
   do operador passariam a falar de conjuntos diferentes — é o defeito das duas
   verdades adjacentes, que esta casa já pagou no Drive e na fila do briefing.
   **A coluna vence o blob na leitura, mas passa pela MESMA validação:** coluna
   com lixo é ignorada e a leitura cai para a origem seguinte.

2. **Pedir contato conversando é legítimo — no PASSO DE CONFIRMAÇÃO.** O motivo
   escrito do incidente do "só isso" é mais estreito do que "não capturar
   contato": ele proíbe **pedir durante a descoberta, com validação de formato**.
   Uma pergunta de cada vez, no fim, sem validação agressiva, com pular sempre
   visível, **não reabre o incidente** — e as 4 asserções de
   `identity-capture.test.ts` continuam passando sem uma vírgula alterada.
   A trava `EMAIL_HALLUCINATION` da rota do SDR **fica intacta**, e a distinção
   entre pedido legítimo e alucinação é ESTRUTURAL: a captura não passa por
   modelo nenhum nem por `/api/sdr/chat`. Há teste que reprova o dia em que
   passar.

3. 🔴 **PEDIR CONTATO NO MEIO DA CONVERSA: NÃO FOI FEITO, e sobe ao CEO.** Isso
   exigiria INVERTER as 4 asserções do contrato da descoberta — o mesmo teste
   que registra por que o bot travava o prospect antes de saber o que ele queria.
   Inverter um contrato que nasceu de incidente medido não é decisão de quem
   executa.

**A lei que não foi afrouxada:** ausência de informação não é informação.
`pistasDeContato` continua sem fazer `temComoFalar` virar `true`, nome sozinho
continua não sendo contato (e não sobe para a coluna), e recusar continua
gravando `lead_incompleto` com a conversa inteira.

---

## O ANÚNCIO SÓ NASCE COM ATIVO QUE SE PROVA DO DONO — PÁGINA E ARTE

**Decidido em** 2026-08-15 · **por** `seguranca`, a pedido do Diretor ·
**commits** `209b504` (torniquete) e este · **origem:** auditoria de
`lib/agency/esteira/trafego.ts`

**O que estava aberto, em produção viva.** `montarCriativo` escolhia a Página
com `findFirst({ workspaceId, platform: "facebook" })` — **sem `clientId`** — e
a arte com `findFirst({ mediaUrl: { not: null } })` — **sem dono nenhum**. O
`pageId` seguia cru para `object_story_spec.page_id` sem passar pela lista de
ativos autorizados, que desde 06/08 já barrava a conta de anúncios. Num
workspace com mais de um cliente isso significa: **o anúncio do cliente A nasce
assinado pela Página do cliente B, com a arte de B**. O gatilho é o cliente
aprovar o pacote (`lib/agency/esteira/marcos.ts`).

**A decisão, em uma frase: id recebido não é id provado.** Vale para os três
ativos do criativo, e nenhum deles chega por parâmetro de quem chama:

1. **Página pelo `clientId` do projeto**, derivado do banco dentro de
   `montarCriativo` — não recebido do chamador.
2. **Arte pelas peças DESTE projeto** (entregas do projeto ou o pedido que o
   originou), com `workspaceId` e `clientId` junto. Nunca "o post mais recente
   do banco". Sem vínculo possível, não se consulta: a resposta certa é "nada".
3. **A Página passa por `ativoAutorizado(..., "page", ...)` DENTRO de
   `criarAnuncioPausado`** — onde o id é usado, não no chamador. Conferir no
   chamador é o que deixou `publishPost` de fora da trava em 06/08. A mesma
   trava entra na segunda porta do arquivo (`promoted_object.page_id`, objetivo
   "conversas"), **antes** de existir chamador que a use.

**Consequência aceita, e ela é uma escolha:** cliente cuja Página não estiver
marcada em `MetaAtivoAutorizado` **não ganha anúncio** — ganha uma pendência que
diz qual ativo falta e onde marcar. Fail-closed: não conseguir provar a posse
nunca vira permissão. Preferimos uma campanha sem anúncio a um anúncio assinado
pela marca de outro cliente, que é dano que nenhum código desfaz.

**E a frase parou de mentir.** Toda ausência de anúncio virava *"a Meta recusou
o criativo"*. A Meta não recusava nada — era defeito nosso. Recusa real da Meta
agora chega com o texto dela; recusa nossa se identifica como nossa e ensina o
gesto.

**Como se mede o passado sem chamar a Meta:**
`scripts/pericia-posse-do-criativo.mts` — somente leitura, só banco. Reconstrói
a escolha determinística do código antigo e classifica cada anúncio já criado em
limpo / nasceu com ativo de outro / ambíguo. **Ambíguo não é limpo — é "não
medido"**, e vai para conferência à mão no Gerenciador.

---

## QUEM APROVA A PEÇA É O CLIENTE DELA — PEÇA POR PEÇA, NUNCA EM BLOCO

**Decidido em** 2026-08-14 · **por** Dioli (CEO) · **registrado pelo** Diretor ·
**commit** `b8809bd`

A frase dele, repetida várias vezes até virar ordem:

> *"Quem libera, quem aprova, são os clientes. Quem é o dono da CityJobs sou eu,
> então eu vou aprovar. Se entrar um cliente novo, quem aprova é ele."*

**O modelo de aprovação da casa passa a ser:** a peça só vai ao ar depois que **o
cliente daquela peça a aprovou**. Não é aprovação global, não é interruptor de
dono da agência, e não é o Diretor decidindo por ele.

**O que estava errado.** `trava-de-publicacao.ts` fazia duas perguntas: o perfil
está na lista de ativos autorizados, e `PUBLICACAO_ORGANICA` está liberada. A
segunda é um **interruptor geral cego** — ligado, TODA peça agendada sai sozinha
pelo despertador de 5 minutos, aprovada ou não. Foi esse formato que quase
publicou os 6 carrosséis da Foocci em 07/08. Um interruptor geral não pode ser a
resposta a uma ordem que é peça por peça: ele responde *"a casa pode publicar
hoje?"*, e a ordem pergunta *"ESTE cliente liberou ESTA peça?"*.

**O que mudou:**

1. **Terceira pergunta, fail-closed, antes de qualquer chamada de rede** —
   `lib/agency/esteira/aprovacao-da-peca.ts`. Sem aprovação registrada do cliente
   dono, não publica. Ausência de aprovação nunca vira permissão (guardrail 1).
2. **Reaproveita o registro que já existia**, não cria um segundo:
   `ApprovalRequest` + `sourcePostIdsJson` (quais peças o card decide) +
   `reviewedBy` + `reviewedAt`. É o mesmo registro que alimenta o "Aprovações" do
   painel. Um segundo mecanismo começaria idêntico e divergiria no primeiro
   ajuste.
3. **Só conta a decisão tomada no portal do cliente** — `reviewedBy` começando em
   `client:`, que é o que `/api/portal/approvals` grava depois de conferir a
   posse do token. O carimbo seco `"cliente"` de `marcos.aprovarPacote` **não
   vale**: ele não tem autor e é alcançável por rota de sessão da agência
   (`/api/projects/[id]/esteira`). **Aprovação sem autor não é aprovação**, e
   carimbo da agência em nome do cliente não é consentimento do cliente.
4. **`PUBLICACAO_ORGANICA` continua existindo, com outro papel:** deixa de ser o
   portão que decide e vira o **freio de emergência da casa** — a alavanca que
   para tudo de uma vez, sem reabrir card por card. **Solto não é autorização:**
   ele apenas devolve a decisão a quem ela pertence. Puxado, nem peça aprovada
   sai. Ele segue puxado enquanto o App Review e a verificação do negócio não
   saírem — essas razões são da plataforma, e nenhum cliente pode aprová-las.
5. **O diagnóstico acompanhou.** O portão 11 de `prontidao-de-publicacao.ts`
   dizia "Decisão do CEO (PUBLICACAO_ORGANICA)" e passou a dizer **"Aprovação do
   cliente (peça por peça)"**, nomeando quem precisa aprovar aquela peça. O freio
   virou o 12 e as permissões da Meta, o 13. Relatório que descreve o modelo
   antigo é pior que relatório nenhum: ele é acreditado.

**A consequência que vale dita:** publicação avulsa no perfil de um cliente
(`/api/meta/publish` com legenda e mídia arbitrárias) **não tem quem a tenha
aprovado, por construção** — e por isso a rota descarta `postId` de propósito.
Aceitar a dupla deixaria alguém apontar uma peça aprovada e publicar outra coisa
por baixo dela, transformando o consentimento do cliente numa senha.

---

## O QUE TRAVA PUBLICAÇÃO, MEDIÇÃO E TRÁFEGO É **UM** PORTÃO SÓ: ACESSO AVANÇADO

**Decidido em** 2026-08-11 · **apurado pelo** especialista `meta` (parecer
assinado) · **registrado pelo** Diretor · **commit** `cbf3d60`

Três departamentos estavam parados e a casa tratava isso como três problemas.
**É um.** A pergunta que decidia o cronograma — *"se o ativo do cliente estiver
atribuído ao nosso Business Manager, o acesso padrão basta?"* — tem resposta
publicada, e é **não**:

| Capacidade | Permissões | Basta acesso padrão? |
|---|---|---|
| Publicar no Instagram do cliente | `instagram_basic` · `instagram_content_publish` · `pages_read_engagement` · `pages_show_list` | **Não** — App Review |
| Ler desempenho do Instagram | `instagram_basic` · `instagram_manage_insights` · `pages_read_engagement` | **Não** — App Review |
| Campanha na conta do cliente | `ads_management` · `ads_read` (+ Marketing API Access Tier) | **Não** — App Review, e a Meta é explícita |

O teste da Meta não é "está no nosso Business Manager": é **"adicionada ao app no
Painel de Apps"** mais quem concede ter **função no app**
(`fontes/instagram-insights.md:57`, `fontes/instagram-visao-geral.md:99-101`).

**E há um segundo portão que quase ninguém vê:** sem **verificação do negócio**
concluída, *"os usuários de outras empresas não poderão conceder permissões a
esses apps, e todos os recursos ficarão inativos"*
(`fontes/verificacao-de-negocio.md:20`). Ele morde no cenário em que todo mundo
confia — *"mas o cliente autorizou"* — e é o **prazo externo mais longo** do
cronograma.

**O que muda no trabalho da casa, e é o ponto:**

1. **Nenhuma das três é destravável por código.** Continuar construindo em cima
   delas esperando "ligar" um dia é construir sobre uma porta trancada.
2. **A casa constrói a máquina fail-closed enquanto a análise corre** — que é o
   que já existe em `trava-de-publicacao.ts` e `formato-de-midia.ts`, e ganhou
   `permissoes-do-token.ts` para **medir** a concessão em vez de descobri-la
   tentando.
3. **É ato do CEO, não do Diretor:** verificação do negócio, envio da análise,
   gravação dos vídeos e a configuração do login exigem a conta pessoal dele.
   Eu preparo; não finjo que executei.

**A regra que fica, e ela é a lição do 03/08:** *"a API deixou"* nunca foi
sinônimo de *"pode"*. O escopo estar no token prova que a chamada passaria — não
que ela é permitida.

---

## A ESCADA GANHOU UMA SEGUNDA PORTA: A DECISÃO DO DONO, DECLARADA EM CÓDIGO

**Decidido em** 2026-08-08 · **por** Dioli (CEO), executado pelo `pm` ·
**mecanismo:** `lib/agency/escada/decisoes-do-dono.ts`

**A fala, literal, que é a procedência:**

> *"Solta, óbvio, tem que soltar tudo, tem que dar autonomia pra essa agência
> funcionar, gente. O fluxo eu já te dei completo de como deve funcionar. Eu te
> dei os agentes, te dei interface, te dei autonomia só pra comandar. Você tem
> vinte e seis agentes pra fazer um monte de coisa e dois posts não estão
> saindo."*

Até hoje a escada subia por **um** caminho só: evidência (`subirDegrau`). O caso
"quem manda na casa mandou" não tinha onde ser escrito a não ser num campo de
texto preenchido à mão por alguém **logado em produção** — e nenhuma rodada de
agente tem sessão de produção. **A decisão existia; o caminho, não.** Foi assim
que duas peças do CityJobs ficaram um dia inteiro em `interno`.

**A decisão do dono agora é código versionado, aplicado pelo relógio da agência
a cada rodada.** Consequência prática, que é o ponto inteiro: **deploy = a
escada solta.** Sem humano no meio, sem segredo para carregar, sem sessão para
conseguir.

**O que ela recusa, e cada recusa tem motivo:**

- **Nunca leva a `wide`** — o alvo é sempre `allowlist` com clientes nomeados,
  auditáveis e revogáveis um a um. `wide` continua se conquistando com número.
- **Nunca desce ninguém** e **nunca publica nada.** Soltar a escada leva a peça
  ao **card de aprovação** do cliente; o clique de publicar continua sendo dele.
- **Sem procedência (data + quem + a FALA literal, mín. 20 caracteres) a decisão
  é RECUSADA por inteiro** e a recusa vira falha de rodada. "O CEO mandou" sem a
  frase é memória de alguém, e memória não é registro.
- **Sem `process.env`, sem `{ forcar: true }`, sem parâmetro de degrau.** Há
  teste que reprova o arquivo que ganhar qualquer um dos três, e teste que
  reprova a decisão que soltar `paid-traffic` ou `prospeccao`.

**O que foi solto por esta decisão:** `social-media` e `design` — os dois
departamentos que uma peça de feed atravessa — para os **clientes com projeto**.

⚠️ **FURO DE DADO DECLARADO:** *"cliente ativo"* **não existe nesta casa.** Não
há coluna `status` em `Client`. O escopo se chama `clientes_com_projeto` porque
é isso que o banco sabe dizer — batizar o proxy com o nome do fato é como se
inventa dado.

**O que NÃO foi solto, e é decisão que sobe ao Diretor/CEO:** `paid-traffic`
(escreve em Meta/Google — depende do parecer do especialista da plataforma, a
trava de 03/08), `prospeccao` (sai em nome da agência para terceiros, não é peça
de cliente) e `analytics` · `strategy` · `financeiro` (relatório, plano e
proposta não são "peça" — a fala do CEO não os cobre com todas as letras).

---

## O CAMINHO C DO DRIVE (CONTA DE SERVIÇO) FOI DERRUBADO PELO ESPECIALISTA — NADA FOI CONSTRUÍDO

**Decidido em** 2026-08-08 · **por** `google` (parecer), aceito pelo `pm` ·
**origem:** `docs/plataformas/google/pareceres/2026-08-08-drive-conta-de-servico.md`

O CEO autorizou o **Caminho C** — uma conta de serviço da agência recebe a
pasta-raiz `Dioli Digital - Material Agencia` por compartilhamento, uma vez, e
passa a ler tudo que entrar depois, sem seletor. A autorização veio **sob a
premissa de que C era barato** ("uma pergunta ao Google, dias"), premissa escrita
no parecer anterior (`2026-08-08-drive-da-agencia.md`), que **foi produzido pelo
`pm`, não pelo especialista** — a trava de plataforma de 03/08 rodou sem quem ela
manda ouvir, e o próprio parecer declarou o furo.

**Este despacho corrigiu o furo: o `google` foi acionado de verdade** (via
`claude --agent google`) e **derrubou o C**. Nenhuma conta de serviço foi criada,
nenhum escopo foi acrescentado ao app, nenhuma chamada de escrita saiu.

### Por que C caiu

- **Tecnicamente C funciona** (pergunta 1): conta de serviço com a pasta
  compartilhada lê a árvore inteira, inclusive o que entrar depois. Isso **não** é
  o caso do Picker + `drive.file` de 07/08 — lá o obstáculo era o escopo, não a
  credencial.
- **Mas o escopo necessário é `drive.readonly`, e ele é RESTRITO.** Não existe
  escopo não-sensível que leia conteúdo por ACL.
- **A isenção de verificação NÃO cobre este caso** — e isto é **citação, não
  inferência**: a isenção "somente dados de propriedade do serviço" exige
  *"acessar apenas os próprios dados"* **e** *"não acessar dados do usuário
  (vinculados a uma Conta do Google)"*. A pasta é de `agenciadioli@gmail.com`,
  que é uma Conta do Google. As duas condições falham.
- **Logo C custa o mesmo que a Saída A** (`drive.readonly` direto): verificação de
  escopo restrito, avaliação de segurança (a casa guarda os bytes) e
  reverificação anual. **A única coisa que muda entre C e A é quem segura a
  credencial — não o preço.**

### A correção que o `pm` arrancou na auditoria, e que ficou registrada

O parecer afirmava que declarar `drive.readonly` no projeto **aciona** a
verificação também para conta de serviço. Cobrado com o contra-argumento de que a
verificação se prende à **tela de consentimento OAuth** — que conta de serviço
nunca vê —, o especialista **rebaixou a própria afirmação a inferência não
confirmada**, com fonte: no compartilhamento direto de pasta o escopo entra em
código (`createScoped`), fora da página "Acesso a dados".

> **O veredito NÃO mudou, e é importante entender por quê.** Ele nunca dependeu
> daquele mecanismo: dependia da isenção, que é citação direta. **Mesmo que o
> Google não barre tecnicamente o token, usar escopo restrito não verificado põe
> o app em descumprimento da Política de dados do usuário** — risco de revogação
> por auditoria, não 403 imediato. *A casa não aposta em comportamento não
> documentado.*

### O que atravessa domínios, e por isso mora aqui

1. **A trava de plataforma vale para o `pm`, principalmente para o `pm`.** Foi um
   parecer sem especialista que produziu a premissa errada que subiu ao CEO. Não
   houve dano — o custo foi um despacho —, mas o mecanismo que o evitaria é
   **acionar o especialista, não escrever no lugar dele**.
2. **Autorização do CEO é sobre o DESTINO, não sobre o preço.** Ele autorizou C
   por ser barato. Barato caiu ⇒ a autorização não se transfere para A, que é o
   caminho caro. **Quem decide pagar semanas de verificação é ele.**
3. **A cota da Drive API deixou de ser lacuna** — `fontes/drive-api-cotas.md`
   capturada. E a conclusão é que **cota não é o limite**: o limite é o padrão de
   rajada (15 min mínimo, backoff, nada de chamada a partir de renderização),
   a mesma assinatura que restringiu a conta da Meta em 03/08.
4. **A Saída B segue sendo a única sem custo de verificação** (a casa cria os
   arquivos via `drive.file`, upload por tela da Dioli) — e ela **é escrita no
   Drive**, então exige parecer próprio do `google`, que **ainda não existe**.

---

## O FINANCEIRO É O DONO ÚNICO DE TODO DINHEIRO DA CASA

**Decidido em** 2026-08-07 · **por** CEO · **origem:** `lib/agency/financeiro/dre.ts`,
`app/agency/financeiro/page.tsx`, `lib/ai/donos.ts`

As palavras do CEO:

> *"Em tese todos os projetos são de autoria da Dioli Digital. Então todos os
> custos de todos os projetos, e também o faturamento, tudo, eu vou colocar
> dentro do financeiro da agência. […] quem mede tudo em relação a dinheiro vai
> ser o departamento de finanças — inclusive isso que você está me
> questionando, de quem vai medir quanto cada IA gasta. É o financeiro."*

Isso fecha uma pergunta que estava aberta (item 4 de
`docs/perguntas-ao-diretor-geral.md`): **o dono da medição de custo de IA por
agente é o financeiro**, não a Plataforma e não a Qualidade.

O que atravessa domínios, e por isso mora aqui:

1. **Consolidação por autoria, não por contrato.** Foocci, CityJobs, Dioli
   Digital — todos os projetos são de autoria da Dioli, logo custo e
   faturamento de todos sobem para o mesmo DRE. Nenhum projeto tem caixa
   próprio.
2. **A tela responde DUAS perguntas ao mesmo tempo:** *"como está a agência?"*
   (o consolidado) e *"este projeto se paga?"* (a linha por centro de custo,
   **ordenada do pior para o melhor**). Consolidado sozinho é média, e média
   esconde o projeto que consome mais IA do que fatura.
3. **Zero e "não sei" são valores DIFERENTES, e o tipo obriga a distinção.**
   `Dinheiro` tem três estados (`medido`, `nao_medido`, `nao_lancado`) e a soma
   se recusa a somar: uma parcela não medida contamina o total em vez de virar
   zero. É a Lei da casa (*ausência de informação não é informação*) escrita em
   tipo, não em disciplina.
4. **Todo número em tela de dinheiro carrega procedência** — registro de chamada
   de IA, lançamento manual, contrato, extrato. Número sem origem num DRE é o
   que faz um dono decidir errado com cara de dado.
5. **Estimado nunca se soma a realizado**, e **moeda não se converte sem câmbio
   declarado**. O custo de IA sai em dólar, fora do resultado, com a ressalva —
   escolher uma taxa por conta própria mudaria o número mais consequente da tela
   por um chute.
6. **O histórico não volta.** A medição de custo de IA só é completa a partir de
   07/08/2026 (`MEDICAO_DE_IA_COMPLETA_DESDE`). Período anterior sai marcado
   como amostra de tamanho desconhecido. **Não se extrapola o passado.**

> **Proposto ao Diretor Geral do Cérebro como regra de companhia:** os itens 3 e
> 4. "Zero não é 'não sei'" já vale para métrica de cliente nesta casa; em
> dinheiro ela precisa de tipo, não de lembrança. E "número em painel carrega
> procedência" é a mesma família da verdade ancorada, aplicada a relatório em
> vez de a texto.

---

## TODA CHAMADA DE IA DECLARA O DONO — e o compilador é quem cobra

**Decidido em** 2026-08-07 · **por** PM · **origem:** `lib/ai/donos.ts`,
`__tests__/ai/todo-gasto-tem-dono.test.ts`

`AIRunLog.agentId` existia desde 06/08. **Medido em 07/08: das 32 chamadas a
`generate({…})` do repositório, 10 declaravam o dono e 22 não.** O departamento
financeiro nasceria medindo cerca de um terço do gasto — e sem saber qual terço.

O que fica como regra:

1. **`agentId` é OBRIGATÓRIO na assinatura.** Chamada nova sem dono **não
   compila**. Optional dependia de lembrança, e lembrança foi exatamente o que
   falhou nas 22.
2. **O id vem de um registro fechado** (`DONOS_DE_CHAMADA`). String livre
   reabre o buraco por outra porta: `"social"` num arquivo e `"social-media"`
   noutro partem o custo do mesmo especialista em duas linhas do relatório sem
   ninguém errar visivelmente.
3. **O departamento que paga é DERIVADO do dono**, não repetido em cada
   chamada. Quem lembrava do `agentId` esquecia do `departmentId` e o gasto caía
   em `"desconhecido"` com dono declarado.
4. **Duas travas, porque o tipo sozinho não basta.** O teste estático varre o
   repositório e reprova (a) chamada sem `agentId` e (b) dono fora do registro —
   é o que pega `as never`, string montada em runtime e
   `// @ts-expect-error` posto para destravar o build.
5. **Nada disso pode derrubar a entrega.** Dono desconhecido em produção é
   gravado como veio e denunciado no log; contabilidade não para a agência.

---

## OS CINCO ESSENCIAIS ENTRARAM NESTA CASA — 07/08/2026

**Ordem do CEO**, doutrina 21 do `dioli-brain-kit`: todo projeto passa a ter,
obrigatoriamente e sem poder apagar, cinco Essenciais — `qualidade`, `cerebro`,
`interface`, `experiencia`, `seguranca`.

**O elenco não foi instalado por cima do que existia.** Dois agentes respondendo
a mesma pergunta = nenhum dono de verdade, que é o defeito que a doutrina existe
para matar. O cruzamento, agente por agente:

| Agente que existia | Pergunta que ele responde | Saída |
|---|---|---|
| `qualidade` | "isto está conforme o prometido?" | **É o Essencial.** Já era só leitura (`Read, Grep, Glob, Bash`) — mantido |
| `cerebro` | "podemos afirmar isto, e com base em quê?" | **É o Essencial.** Papel confere com a constituição |
| `interface` | forma **e** percurso | **DIVIDIDO EM DOIS** — ver abaixo |
| `plataforma` | fundação **e** segurança | **Segurança SEPARADA** — ver abaixo |
| `pm` | "quem faz o quê, e quando?" | **Mantido de domínio.** É a camada de direção, não um Essencial |
| `departamentos`, `esteira` | o que o produto faz | **Mantidos de domínio** |
| `meta`, `google`, `tiktok` | o que a plataforma externa permite | **Mantidos de domínio** — as travas de 03/08 continuam de pé |

**Nenhum agente foi apagado. Nenhuma memória foi movida ou destruída.**
`docs/agents/interface/` e `docs/agents/plataforma/` seguem intactos.

### Por que `interface` virou DOIS

Ele fazia forma e percurso. **Quem responde pelos dois nunca faz a pergunta cara
— "esta tela deveria existir?" — porque ela invalida o trabalho que ele acabou
de fazer.** A prova é desta casa, não do manual: a nota de 0 a 10 de aparência
não pegou o **card de aprovação vazio**, o Drive dizendo "conectado" e "não
conectado" no mesmo cartão, nem o orçamento com **duas saídas** quando o cliente
precisava de três (a devolutiva do CEO ficou dois dias sem destino). **Nenhum
desses é feio.**

- **`interface`** — mover, alinhar, renomear, estilizar, completar estado.
- **`experiencia`** — eliminar passo, trocar ordem, criar ou apagar tela.
  **Sem `Write` e sem `Edit`**, como manda a constituição.

> *Botão com a cor errada é do `interface`. Botão que promete o que não faz é do
> `experiencia`.*

### Por que `seguranca` saiu de dentro de `plataforma`

Segurança dividia fila com deploy, migration e banco — **e perdia todo dia**.
Deploy caindo é urgente e visível; rota aberta é urgente e invisível. Em 07/08
esta casa teve três frentes de urgência no mesmo dia (Drive, portal, deploy) e
**nenhuma varredura de superfície exposta aconteceu**. Não por negligência: por
fila.

`plataforma` continua dono da fundação. `seguranca` é dono da porta, **tem
escrita**, e correção que toca pagamento ou parceiro passa por humano.

### As travas, não os avisos

`__tests__/agentes/elenco-obrigatorio.test.ts` (38 asserções, verde) reprova:
apagar qualquer um dos cinco · perfil de Essencial que não aponte para a
constituição · `Write`/`Edit` aparecendo no perfil do `qualidade` ou do
`experiencia`. **A constituição NÃO foi copiada para cá** — é apontada. Cópia
espalhada diverge em três meses.

---

## A SALA DOS AGENTES ESTÁ NO AR — 07/08/2026

Item **próprio** no menu do admin (`/agency/agents`), não dentro de
Configurações — ordem explícita do CEO. Duas abas: **Agentes** e
**Configurações** (as IAs contratadas).

**A tela que estava lá rodava em `MOCK_AGENTS`: mostrava um time inventado como
se fosse o elenco real.** Ela mentia exatamente sobre a pergunta que o CEO faz.

**A regra que governa cada número dela:** o cartão nunca escreve zero quando a
resposta é "não sei". O tipo `Medida`
(`lib/agency/sala-dos-agentes/tipos.ts`) tem **três** casos — `medido`,
`zeroMedido`, `naoMedido` (com motivo obrigatório) — e a tela desenha os três
diferentes. Não existe `number` cru: `number | null` viraria `?? 0` no primeiro
`.tsx` distraído, e aí "não medido" e "trabalhou zero" voltariam a parecer a
mesma coisa.

**O elenco é declarado em TypeScript versionado, não varrido do disco.** Em
produção o servidor roda a partir de `.next/standalone`, sem `.claude/` nem
`docs/` — uma varredura devolveria lista vazia, que a tela leria como "este
projeto não tem agentes".

---

## 99FREELAS — A REGRA OFICIAL DO CEO: **ENVIO SUPERVISIONADO**

**Decidida em** 2026-08-07 · **por** DIOLI (CEO), com as palavras dele ·
**executada por** PM da frente 99Freelas · **registro de máquina:**
`docs/plataformas/99freelas/policy.json`

> 🟠 **MODO ATUAL: envio supervisionado.**
>
> O agente pode localizar projetos, ler briefings, eliminar oportunidades ruins,
> calcular score, precificar, criar uma proposta individualizada e preencher a
> candidatura.
>
> **Antes do clique final em "Enviar proposta", deve parar para aprovação
> humana.**
>
> Os termos públicos atuais do 99Freelas não trazem proibição explícita de
> bots/automação, mas também não fornecem autorização expressa para automação de
> candidaturas. Como spam e violações podem resultar inclusive em banimento de
> outras contas do mesmo usuário, não liberar submissão automática até obter
> autorização formal do 99Freelas.
>
> **Importante:** não assumir limite de 10 propostas mensais. O plano Free possui
> 10 conexões/mês; os planos pagos possuem limites maiores. O sistema deve
> consultar/configurar o plano real da conta antes de definir o limite
> operacional.

### 🔴 A IMPRECISÃO QUE O CEO CORRIGIU — e que estava nos nossos documentos

O Diretor resumiu a cota ao CEO como **"10 propostas por mês"**. Está errado por
**generalizar**: 10 é a cota do plano **Free**. A régua oficial, que o CEO
conferiu na fonte do próprio 99Freelas (blog oficial, março/2025, e a Central de
Ajuda):

| Plano | Conexões/mês |
|---|---|
| Free | 10 |
| Pro | até 120 |
| Premium | 240 |

**E o nome certo é `conexões`, não "propostas".** É o termo da plataforma, e a
diferença é operacional: conexão é consumida **também por pergunta ao cliente**,
e **projeto disputado consome mais de uma**. Chamar de "proposta" faz a casa
planejar 240 propostas com 240 conexões e descobrir na 80ª que a cota acabou.
**"Conexões" no código, na tela e nos documentos.** Nome errado vira regra
errada seis meses depois.

**O plano da conta é PREMIUM**, declarado pelo CEO em 07/08/2026 — logo a cota
operacional é **240**. A procedência está gravada no `policy.json`: foi
declarado em conversa, **não foi lido da tela** (nenhum login foi feito).

**O fail closed segue intacto:** o padrão, na ausência de declaração, continua
sendo Free (10). Apagar `plano_declarado_da_conta` devolve o sistema a 10
sozinho, sem tocar em código. Piso, nunca teto otimista.

### 🔴 A SEGUNDA CORREÇÃO — esta é NOSSA, e é de dinheiro

A casa vinha dizendo: **"embuta a taxa de 10–20%, senão a margem é corroída em
toda proposta."** A leitura da fonte diz o contrário, e em dois lugares
independentes:

- **Termos de Uso:** *"Nós **adicionamos** uma taxa de 10% a 20% (R$ 5,00 no
  mínimo) **na sua oferta** enviada ao Cliente"*.
- **Central de Ajuda, "Como enviar propostas?":** *"Sua oferta … é o valor que
  **será recebido pelo freelancer**"* / *"Oferta final: a oferta final **inclui**
  uma taxa de intermediação"*.

Ou seja: **o que se digita é o líquido da agência.** A taxa é acrescentada por
cima e quem paga é o cliente. **Embutir não protege margem — ela já está
protegida — e só encarece a oferta final em 11% a 25%, derrubando a chance de
ganhar sem aparecer em relatório nenhum.**

**O que protege a margem é o PISO:** `max(piso da casa, piso da categoria da
plataforma)`. É isso que o Pricing Engine trava.

**A taxa por plano, confirmada na fonte** (`fontes/ajuda-planos-de-freelancers.md`):
Básico **20%**, Pro **15%**, Premium **10%**. Sem plano declarado, o motor usa a
**mais cara (20%)** — fail closed também no preço, porque errar para menos faz a
oferta final surpreender o cliente para cima.

**Se a primeira proposta real mostrar o contrário**, muda-se
`precificacao.taxa_incide_sobre` no `policy.json` e o motor passa a fazer o
gross-up. É dado, não código.

### O que ficou construído

| Peça | Onde | O que trava |
|---|---|---|
| Platform Policy Engine | `lib/marketplaces/politica.ts` | política é dado versionado; plataforma sem `policy.json` = BLOCK |
| Compliance Gate | `lib/marketplaces/portao.ts` | `ALLOW` / `HUMAN_GATE` / `BLOCK` por ação |
| Compliance Validator | `lib/marketplaces/99freelas/conformidade.ts` | link, contato, pagamento fora, **referência à comissão**, comissionado, permuta, spam por repetição |
| Cota de conexões | `lib/marketplaces/99freelas/conexoes.ts` | plano configurável, fail closed em Free, custo desconhecido = `Infinity` |
| Contador no volume | `lib/marketplaces/99freelas/contador.ts` + `ConexaoGasta` | conexão gasta não volta; leitura que falha = mês esgotado |
| Pricing Engine | `lib/marketplaces/99freelas/preco.ts` | `max(piso da casa, piso da categoria)`; taxa relatada, não embutida |
| BrowserComputer | `lib/marketplaces/navegador.ts` | só https, só o domínio, só área pública, ritmo humano, CAPTCHA = parar |
| Loop do agente | `lib/marketplaces/99freelas/agente.ts` | elimina antes de gastar; para no clique |
| Follow-up | `lib/marketplaces/99freelas/follow-up.ts` | cliente esperando além do prazo **freia** o envio de novas propostas |

### A UMA LINHA DE DADO que destrava o envio

`policy.json → autorizacao_do_suporte`. Quando o suporte responder por escrito:
`status: "autorizado"` **+** `respondido_em` **+** `evidencia` (o arquivo com a
resposta arquivada). **As três metades juntas, ou não vale** — status sozinho é
a parte fácil de escrever com otimismo.

**Não existe flag escondida:** nenhum `process.env`, nenhum `{ forcar: true }`,
nenhum `case` no gate. Há teste que reprova o arquivo que voltar a ter qualquer
um dos três.

### 🟠 O E-MAIL AO SUPORTE — o remetente da casa NÃO SERVE

Texto congelado em `docs/plataformas/99freelas/pergunta-ao-suporte.md`.
**Medido em 07/08/2026, por DNS público:**

- `diolidigital.com.br` — **nenhum TXT, nenhum MX, nenhum `resend._domainkey`**.
  Não está verificado no Resend.
- `dioli.studio` (o domínio do exemplo em `lib/email/send.ts`) — **NXDOMAIN**.
  O domínio não existe.

Consequência: mesmo com `RESEND_API_KEY` presente, o `RESEND_FROM` não pode
estar num domínio verificado da agência. `sendEmail` cairia em
`Dioli Studio <onboarding@resend.dev>` — o remetente compartilhado do Resend,
que **só entrega para o dono da conta Resend**. **O e-mail não chegaria ao
99Freelas**, e sairia de um endereço que não é da agência.

**Não confirmei se `RESEND_API_KEY` e `RESEND_FROM` existem em produção** — não
há token do Railway neste ambiente e nenhuma rota expõe variáveis. Ausência de
informação não é informação: está declarado, não deduzido. **Mas isso não muda a
conclusão**, porque a verificação de domínio falha por DNS, que é público.

**Recomendação: o CEO manda do Gmail dele.** A resposta cai na caixa dele e o
suporte reconhece o titular da conta.

### 🟠 Risco aberto declarado: a ENTRADA do follow-up não existe

O mecanismo está construído e testado. **A alimentação dele, não:** o chat do
99Freelas fica atrás do login, e login é `BLOCK` nesta rodada. Hoje a fila de
follow-up só enche à mão ou por e-mail de notificação encaminhado. Enquanto for
assim, a sanção de "não responder a tempo" **está mitigada em código e exposta
na operação**.

---

## 99FREELAS: PODE COM AJUSTE — e o ajuste é COTA, não texto de contrato

**Decidido em** 2026-08-07 · **por** PM da frente 99Freelas, sob a trava de
plataforma de 03/08 · **origem:**
`docs/plataformas/99freelas/pareceres/2026-08-07-agente-autonomo-de-prospeccao.md`
(15 fontes capturadas em `docs/plataformas/99freelas/fontes/`)

O CEO pediu um agente autônomo que opera o 99Freelas por navegador e envia **10
propostas por dia**. O parecer-trava saiu **antes de qualquer código**, como ele
mesmo escolheu.

**O que os Termos NÃO dizem:** não existe a palavra automação, robô, bot,
script ou crawler — nem nos Termos, nem na Central de Ajuda (0 resultado para
cada termo). Diferente do CapCut, que proíbe automação com todas as letras.
**Ausência de proibição não é permissão:** também não existe autorização. É o
silêncio do contrato, e no silêncio quem julga é a moderação, olhando conduta.

**O que os Termos dizem, e nos alcança:** *"propagação de spams … e quaisquer
outras práticas que descumpram os termos"* → Violação (30 dias de propostas
rebaixadas) → Penalização (bloqueio de enviar proposta) → **Banimento
permanente, que alcança outras contas do mesmo usuário**. É o mesmo formato do
ban da Meta em 03/08: a regra violada é de CONDUTA, não de tecnologia.

**O ajuste que redefine o projeto — e é aritmética, não opinião:** o 99Freelas
cobra cada proposta **e cada pergunta** em "conexões", com cota **MENSAL**:
gratuito 10/mês, Pro 120/mês, Premium 240/mês. **10 por dia = 300 por mês**,
acima do teto do plano mais caro. Projeto disputado custa **mais de uma**
conexão, e conexão gasta **não volta**.

As três regras que ficam para qualquer plataforma de marketplace desta casa:

1. **Teto de ritmo é lido da plataforma, nunca fixado no `.env`.** Número
   escrito à mão descola do saldo real e queima cota que não se recupera.
2. **Ausência de proibição explícita rebaixa o veredito, não o promove.**
   Silêncio contratual = 🟠 PODE COM AJUSTE, com as condições viradas requisito.
   Só vira 🟢 com resposta escrita da plataforma.
3. **Onde há CAPTCHA, o robô para e escala.** reCAPTCHA e Cloudflare Turnstile
   estão confirmados no login do 99Freelas. Contornar é fraude na lista de
   sanções — e nesta casa é proibição, não custo/benefício.

**A quarta, que é de dinheiro:** a plataforma tira **10% a 20%** da oferta
digitada, e impõe piso por categoria (R$ 30 a R$ 100). O Pricing Engine aplica
`max(piso da casa, piso da categoria)` **e** embute a taxa — senão a margem some
sem aparecer em relatório nenhum.

---

## DEPLOY SÓ COM CI VERDE — e "sem CI" nunca conta como verde

**Decidido em** 2026-08-06 · **por** CEO · **origem:** `docs/deploys/portao.md`,
`lib/plataforma/sentinela-do-deploy.ts`, `lib/plataforma/porta-de-emergencia.ts`

Às 12h22 o GitHub Actions entrou em pane, nenhum workflow rodou, e a produção
recebeu um commit **sem nenhum resultado de CI** — não vermelho: inexistente.
Deu certo porque o portão foi rodado à mão. **A proteção era alguém lembrar.**

A regra que fica, e ela vale para qualquer esteira desta casa:

1. **Prova vem ANTES da entrega, não ao lado dela.** Checagem que roda em
   paralelo com o deploy não é portão — é comentário.
2. **Ausência de prova não é aprovação.** Cancelada, estourada, pulada, ainda
   rodando ou inexistente são todas a mesma coisa: ninguém provou nada. É a Lei
   da casa (*ausência de informação não é informação*) aplicada à esteira.
3. **A régua é UMA.** Quem confere depois e quem decide antes usam a mesma
   função (`julgarProva`). Duas cópias é como um dos lados volta a ler ausência
   como verde.
4. **Toda trava de entrega precisa de porta de emergência declarada** — senão,
   no dia da pane, a trava impede o conserto e alguém a desliga para sempre.
5. **Porta de emergência sem rastro é o caminho normal com outro nome.** O
   registro (quem, quando, por quê, sobre qual commit, e o estado da prova
   naquele instante) é gravado **antes** da subida: não deu para registrar, não
   sobe.
6. **Alarme não pode ser tranca.** O sentinela saiu do gatilho de push porque,
   com o portão ligado, um alarme vermelho descartaria justamente o deploy que
   conserta o motivo do alarme.

**Escolha de mecanismo, para o registro:** a trava mora **na plataforma de
deploy** (o "Wait for CI" do Railway), não num workflow do GitHub. Trava que
depende do sistema que caiu não é trava.

---

## ALCANCE ≠ AUTORIZAÇÃO — lista explícita por cliente, fail-closed

**Decidido em** 2026-08-06 · **por** CEO (incidente que ele mesmo pegou) ·
**origem:** `lib/integrations/meta/ativos-autorizados.ts`

O CEO clicou "Conectar Facebook/Instagram" no portal do cliente **Foocci**. A
Meta devolveu um token do **usuário** dele. Com esse token, a casa leu **14
contas de anúncio** (Santioh, Dilix, Queise, DileeBags e pessoais) e **gravou
como conexões da Foocci todas as Páginas/Instagram que o token alcançava** —
com o token de Página junto, que publica. Palavras dele: *"eu só autorizei as
contas do Foocci no projeto."*

**A regra, para qualquer plataforma (Meta, Google, TikTok, e as que vierem):**
o que uma credencial **ALCANÇA** e o que a agência **PODE USAR** são dois
conjuntos. Tratá-los como um só é a falha. O segundo conjunto:

1. **é explícito** — uma lista por cliente, gravada, com quem marcou e quando;
2. **é do cliente** — ele marca na tela dele; a agência não marca por ele;
3. **é fail-closed** — lista vazia libera **nada**, e banco indisponível
   também libera nada. Ausência de lista nunca vira permissão;
4. **é derivado** — o dono vem do token do portal ou da própria linha de
   conexão cujo token está em uso, **nunca de um `clientId` vindo do pedido**;
5. **mora onde o dado nasce** — em `saveConnection` e na camada de leitura, não
   na rota. Trava que mora na rota é trava que a rota seguinte não tem;
6. **revogar APAGA** — desmarcar remove a linha **e** a conexão. Deixar o token
   guardado depois de revogado é manter o dano.

**Corolário que veio junto:** conectar não é autorizar. O popup do OAuth passou
a distinguir três desfechos — conectado, **falta escolher** e erro. Dizer
"Conta conectada ✓" quando nada foi liberado é mentir para o dono do negócio
sobre o que a agência passou a enxergar.

---

## Regra que mede um TRECHO tem de emitir só o TRECHO que mediu

**Decidido em** 2026-08-04 · **por** Diretor, após 3 reprovações da auditoria
adversarial · **origem:** `lib/agency/execution/leitura-do-cliente.ts:311`
(`COBERTURA_MINIMA_DE_LASTRO = 1`)

O piso que separa "observei no feed do cliente" de "inventei" foi reprovado três
vezes **pelo mesmo defeito de forma, não de regra**: ele conferia um pedaço do
texto e publicava o texto inteiro em volta.

**A consequência que faz disso regra de companhia:** limiar fracionário é fração
de texto inventado entregue sob o rótulo de observado — e **o adversário calibra
o enchimento na primeira tentativa**. Com meio de lastro exigido, escreve-se meia
frase falsa de propósito. Hoje a exigência é total, pedaço por pedaço.

**O que muda para todos:** qualquer trava que valide uma parte e libere o todo
está errada por construção, em qualquer domínio — preço, prazo, nome de cliente,
métrica. Ou a régua cobre o que sai, ou o que sai encolhe até caber na régua.

**Corolários que vieram junto, no mesmo dia:**

- **Todo teste de trava precisa de um caso em que o ADVERSÁRIO escolhe a
  formatação da entrada.** O teste passava porque **o próprio teste escrevia as
  vírgulas** que o modelo não escreve. Duas vezes o teste foi ajustado para baixo
  do bug — o que é o mesmo que apagar o bug do relatório.
- **Telemetria de trava é parte da trava.** O log do piso descrevia a regra
  antiga; um operador lendo aquele log auditaria um mecanismo que não existia
  mais (`leitura-do-cliente.ts:515`).
- **Assimetria deliberada entre afirmar e negar.** Derrubar uma afirmação
  negativa pode usar régua mais frouxa do que autorizar uma positiva. Não é
  inconsistência — é o custo do erro sendo diferente nos dois sentidos.

---

## Frase de guarda no fim de um texto que será truncado é frase que some

**Decidido em** 2026-08-04 · **por** Diretor · **origem:** `leitura-do-cliente.ts:665`
(`blocoComGuarda`, de manhã) e `lib/agency/esteira/mes.ts:284`
(`trechoComRessalva`, à tarde)

A ressalva mora no fim do texto porque é ali que ela se lê. O corte para caber
num limite começa pelo fim — **então o corte come exatamente a ressalva**. O
documento interno avisava; a mensagem que chegava ao cliente, não.

**O que muda para todos:** onde houver ressalva e limite de tamanho na mesma
superfície, quem trunca reserva o espaço da guarda antes de cortar o corpo. Vale
para portal, WhatsApp, card de aprovação e relatório.

> **Proposto ao Diretor Geral do Cérebro como regra de companhia.** O motivo de
> subir: a lição foi aprendida de manhã num arquivo e **repetida à tarde em
> outro**, por outro caminho. Lição que não atravessa o corredor sozinha é lição
> que precisa morar no kit — não escrita lá por conta própria.

---

## Métrica que muda de significado precisa mudar de nome ou de versão

**Decidido em** 2026-08-04 · **por** Diretor · **origem:** `lib/agency/esteira/mes.ts:45`
e `mes.ts:187` (`versaoDaMedicao`)

O alcance passou de "um dia" para "o mês inteiro" **mantendo o campo, o rótulo e
a linha de comparação**. O relatório teria anunciado **+2694%** ao primeiro
cliente pagante — número tecnicamente calculado, comercialmente uma mentira.

**O que muda para todos:** medição carrega versão. Comparar números de versões
diferentes é proibido, e quando a base muda o cliente é avisado com todas as
letras em vez de receber uma variação percentual bonita.

---

## Estar logado não é ser dono

**Decidido em** 2026-08-04 · **por** Diretor · **origem:** auditoria da onda de
métricas (`app/api/meta/insights/route.ts:40`)

Rota que aceita um id por query string precisa checar **posse por workspace**,
mesmo estando atrás de sessão. Sessão prova quem é; não prova de quem é a coisa
pedida.

**O que muda para todos:** vale para toda rota nova. O sintoma da falta engana —
tudo funciona perfeitamente enquanto existir uma agência só.

---

## Sobra não é evidência de correspondência

**Decidido em** 2026-08-04 · **por** Diretor · **origem:**
`scripts/backfill-carrossel-foocci.mjs`

Quando N arquivos sobram e N peças estão vazias, a tentação é casar por ordem.
**Casamento posicional é decisão humana, atrás de flag explícita, nunca o
default** — no caso real, o passe por ordem montaria carrossel com o logo e com
material bruto dentro.

**Corolário do mesmo achado:** o índice de "já tem dono" tem de ler **onde o dono
realmente mora**. O logo não era referenciado por post nenhum e por isso entrava
na fila de candidatos como se estivesse livre.

**O que muda para todos:** todo script de backfill nasce com dry-run, imprime
casados / excluídos / sobras, e só grava com `--apply` depois de alguém ler o log.

---

## Todo orçamento é precificado — inclusive o de parceiro interno

**Decidido em** 2026-08-03 · **por** CEO

Nenhum projeto roda "de graça invisível". Projeto de parceiro interno (Foocci
é o primeiro) recebe preço pela tabela da casa e entra **contabilizado como
A FATURAR** — "fica como se estivesse devendo" — para prestação de contas ao
financeiro. Onde mora: `Project.proposalPricing` (itens, fonte da tabela,
total) + `proposalStatus: aprovada_interna_a_faturar`.

**O que muda para todos:** projeto sem preço registrado não é aprovado.
Primeiro aplicado: Foocci a R$ 2.050/mês (social ritmo profissional R$ 1.200 +
gestão de tráfego R$ 850, pontos médios da tabela), sujeito a ajuste do CEO.

---

## O modelo de contas na Meta: agência recebe parceiros, verba roda no cliente

**Decidido em** 2026-08-03 · **por** CEO (reiterado — a instrução era esta desde
o primeiro momento; a execução do Diretor no lançamento a violou)

- O **Business (portfólio) da agência** é a casa que **recebe os parceiros**:
  cada cliente conecta o negócio dele como parceiro da agência.
- **Campanha de cliente roda na conta de anúncios DO CLIENTE** — verba, cartão
  e histórico no nome dele. A Foocci é a primeira.
- A **conta de anúncios da própria agência** serve para UMA coisa: publicidade
  da própria Dioli. Nunca para veicular campanha de cliente.

**Por que ficou registrado com esta ênfase:** em 03/08, o Diretor montou a
campanha da Foocci na conta de anúncios da agência — contrariando a instrução —
e a conta da agência foi restringida no mesmo dia. O modelo do CEO também é o
que isola o dano: restrição num lado não derruba o outro.

---

## Especialistas-trava de plataforma: Meta, Google e TikTok

**Decidido em** 2026-08-03 · **por** CEO · **origem:** restrição da conta de
anúncios da agência pela Meta, no dia do lançamento da Foocci

Três especialistas fixos — `meta`, `google`, `tiktok` — "como se fossem
funcionários dessas empresas dentro da agência". O papel deles não é
consultoria: é **trava**. Nenhuma escrita em nenhuma das três plataformas sem
parecer prévio (PODE / NÃO PODE / PODE COM AJUSTE).

**O que muda para todos:**
- O parecer cita a **biblioteca capturada** em `docs/plataformas/` — documentos
  oficiais das plataformas, com data, URL e hash — ou declara a lacuna. Parecer
  de memória não vale.
- A biblioteca é **recapturada diariamente** por rotina agendada; mudança vira
  linha no `docs/plataformas/CHANGELOG.md` e ajuste na cartilha.
- A trava vale para o Diretor. O ban de 03/08 foi ação do próprio Diretor sem
  ninguém no papel de dizer "isso derruba conta".

---

## O piloto roda 100% IA, sem revisão humana

**Decidido em** 2026-07-31 · **por** CEO

Não existe pessoa conferindo antes de o entregável chegar ao cliente.

**O que muda para todos:** esta casa passa a ter um perfil de risco **mais
exposto que o do Foocci**. Lá o erro de um agente é uma frase numa conversa; aqui
é uma peça, um plano de mídia ou um post publicado em nome de um cliente pagante.

Consequência direta e não negociável: **rodar 100% IA não significa pular a
escada.** Significa que a escada é a única proteção que sobrou. Departamento novo
nasce em sombra e sobe com evidência — sem exceção "só pra esse cliente".

---

## A fonte das regras de IA é o kit, não este repositório

**Decidido em** 2026-07-31 · **por** CEO · **origem:** commit `af3c96f`

As regras de agentes moram no `dioli-brain-kit`. Este repositório **aponta**, não
copia.

**O que muda para todos:** aprendeu algo que serve a mais de um produto? **Não
escreva no kit por conta própria** — proponha ao Diretor Geral. Cópia espalhada
diverge: atualiza-se um repositório, esquecem-se os outros, e em três meses
ninguém sabe qual versão vale.

---

## A IA dá pensamento, não poder

**Decidido em** 2026-06/07 · **por** CEO · **origem:** `ARCHITECTURE.md` §3

Quatro consequências cravadas no código:

1. **IA é plugável** — `BRAIN_AI_PROVIDER`. Nunca chame um SDK direto.
2. **IA nunca inventa** — campo nulo vira `undefined` e entra em `missingFields`.
   Nunca é preenchido por inferência.
3. **IA nunca aplica sozinha** — aprovar e aplicar são transições **separadas**.
4. **Rule-based é o fallback universal** — IA off, falhando ou inválida → o motor
   determinístico assume sem derrubar nada.

**O que muda para todos:** se você escrever um caminho onde a falha da IA quebra a
aplicação, você quebrou esta lei.

---

## Um PM por projeto; o chat deixa de ser a memória

**Decidido em** 2026-08-01 · **por** CEO · **origem:** a reestruturação
CEO → PM → especialistas

Esta casa passa a ter **uma porta**: o PM. Assuntos deixam de virar abas
separadas — viram despacho para especialista, e o resultado vira registro no
repositório **na mesma sessão**.

**O que muda para todos:** nenhum aprendizado durável pode existir só na conversa.
E **nenhum chat antigo é fechado antes de exportado e minerado** — ver
`docs/arquivo/README.md`. Conversa apagada não volta.

---

## Dado real ou estado honesto — nunca número inventado

**Decidido em** 2026-08-01 · **por** PM da sessão de design · **origem:**
`HANDOFF.md` §5.1 (commit `3f888f1`)

A Inteligência de Marketing devolve `null` ou vazio e a tela mostra *"não
informado"* / *"conecte"* em vez de preencher com estimativa. Motivo: é um painel
de **decisão de marketing** — número inventado é pior que ausência, porque ausência
o dono vê e corrige, e número inventado ele usa.

**O que muda para todos:** vale em toda superfície que mostra dado de cliente, não
só nessa aba. Campo ausente vira estado honesto na UI, nunca preenchimento.

> **Proposto ao Diretor Geral como regra de companhia.** É a contraparte de
> interface do guardrail "ausência de informação não é informação" — o mesmo
> princípio, aplicado à tela em vez da conversa.

---

## Verdade se lê no servidor, não se monta no cliente

**Decidido em** 2026-08-01 · **por** PM da sessão de design · **origem:**
`HANDOFF.md` §5.2

O endpoint de marketing faz o fan-out no backend (`Promise.all` sobre request,
artifacts, brandBrain, connections, posts) e entrega um shape já normalizado. O
componente fica burro e testável, e o parsing de JSON fica num lugar só.

**O que muda para todos:** esta decisão é a **mesma** do P0 aberto em
`docs/pendencias.md` — *"a verdade do cliente é montada no cliente"* em
`reason.ts`. O padrão certo já existe e já está em produção num endpoint. Quem for
fechar aquele P0 deve copiar este desenho, não inventar outro.

Registrar isso aqui é o ponto do corredor: sem ele, o especialista `cerebro`
resolveria de um jeito e o `esteira` de outro, e em um mês haveria dois padrões
brigando.

---

## O reset da casa preserva a porta de entrada

**Decidido em** 2026-08-01 · **por** CEO, na sessão do PM · **origem:** pedido
direto de "começar do zero"

Zerar a operação apaga cliente, projeto, entregas, aprovações, portal e o cérebro
de marca — mas **não** apaga as solicitações de novos clientes. Elas voltam ao
estado `new`, desligadas do cliente que foi apagado, e são o ponto de partida da
operação seguinte.

Motivo: a solicitação é a única coisa no banco que **veio de fora**. Cliente,
projeto e entrega o sistema refaz sozinho a partir dela; a solicitação, não —
quem a escreveu foi um prospect, e ela não se reconstrói.

**O que muda para todos:** `DELETE /api/admin/reset` passa a ter dois modos, e o
**padrão é preservar** (`keep-requests`). Apagar a porta de entrada exige pedir
`mode: "everything"` de propósito. Junto veio um `GET /api/admin/reset` — auditoria
somente-leitura que mostra o que seria apagado e o que seria preservado, **sem
apagar nada**. Regra: nunca se roda o reset sem rodar a auditoria antes.

O que nenhum modo toca: workspace, usuários e login, chaves de IA e integrações,
contas conectadas da Meta, o Radar de mercado, a governança do Brain e o histórico
de treino do SDR. Isso é a agência, não é dado de cliente.

---

## O raio-x noturno vira mecanismo desta casa

**Decidido em** 2026-08-05 · **por** CEO, como protocolo da companhia ·
**origem:** `dioli-brain-kit`, `docs/16-raio-x-noturno.md`

Todo projeto passa um raio-x no próprio sistema toda madrugada. **Cada Diretor
faz no seu** — ninguém faz pelo outro, porque o valor está na tradução dos
padrões para o código de cada produto, não no ritual.

**O que muda aqui:** existe `npm run raio-x`. A coleta é código puro
(`lib/raio-x/`), zero IA, persistida em `docs/raio-x/coletas/` e comparada com a
noite anterior. A IA entra só depois, para ler a coleta e escrever o relatório do
CEO.

**As três regras que vieram junto, e que não são negociáveis:**

1. **Pedido por padrão nomeado.** Nunca "veja o que dá para melhorar" — isso
   volta com opinião de estilo. São cinco padrões, e cada um está traduzido para
   este código em `docs/raio-x/README.md`.
2. **A coleta não pode usar IA.** IA erra diferente toda noite, e aí "piorou
   desde ontem" deixa de significar alguma coisa — e a comparação com ontem é
   metade do valor.
3. **Varredura que não rodou devolve "não sei", nunca "está tudo bem".**
   Achado que sumiu porque a varredura quebrou entra em `desconhecidos`, nunca em
   `resolvidos`.

O raio-x é somente leitura, e isso é trava com teste
(`__tests__/raio-x/raio-x-nao-escreve.test.ts`), não promessa em comentário.

**O que NÃO muda:** o raio-x diagnostica; o conserto continua sendo uma frente
com dono e verificação. Diagnóstico sem dono vira lista, e lista ninguém lê.

---

## O especialista estuda todo dia, não só quando precisa executar

**Decidido pelo CEO em** 2026-08-05 · **registrado pelo** Diretor

> *"Quanto mais coisas eles souberem e absorverem, mais avançados eles vão ficar.
> Você precisa fazer eles criarem uma rotina de aprendizado, autoaprendizado."*

A biblioteca de plataformas nasceu em 03/08 como resposta a incêndio: a conta de
anúncios foi restrita, e capturou-se **política**. Foi o que apagou o fogo, e
ficou assim por três dias. O defeito disso tem nome: **o especialista que só sabe
o que NÃO pode fazer não sabe fazer.**

**A regra, em uma frase: conhecimento não se captura sob demanda.** Aprender no
momento em que a tarefa chega significa aprender com pressa, aprender o mínimo, e
descobrir a regra que faltava depois de já ter agido.

**O que muda para todo especialista da casa:**

1. **Cobertura é meta, não sobra.** O manifesto de cada especialista busca o
   máximo do conhecimento público do seu domínio — referência de API inteira, não
   só a página do endpoint que ele vai chamar hoje.
2. **A rotina é diária e é código.** Recaptura todo dia, hash por fonte, `[MUDOU]`
   quando muda. Aprendizado que depende de alguém lembrar não é rotina.
3. **Lacuna é declarada, com data.** Fonte que não capturou vira lacuna escrita no
   manifesto e linha no CHANGELOG. **Biblioteca que finge cobertura é pior que
   biblioteca pequena** — o parecer sai confiante e errado.
4. **Parecer cita fonte capturada ou declara a lacuna.** Especialista que responde
   de memória está inventando, mesmo quando acerta.
5. **O manifesto cresce, não encolhe.** Tirar uma fonte exige motivo no CHANGELOG.

**Por que isso é decisão de corredor e não de plataforma:** vale para Meta,
Google e TikTok hoje, e para todo especialista que a casa criar amanhã. O ativo
da agência não é o código que cada agente executa — é o que cada agente sabe
antes de executar.

---

## Escolha do cliente é dado crítico: nunca se perde em silêncio

**Descoberto em produção em** 2026-08-08 · **registrado pelo** Project Manager

O CEO escolheu material no seletor do Google, no portal da Foocci, e a tela
respondeu **"Sem material — a Dioli não alcança NENHUM arquivo seu"**. Medido
pelo diagnóstico de conexões, em produção: **1 arquivo ao alcance do app no
Google, 0 linhas em `DriveMaterial`.** O Google concedeu; a casa perdeu a escolha
sem um erro, sem um aviso, sem um registro.

**A regra, em uma frase: escrita de dado do cliente que falha tem que aparecer na
tela do cliente.** Não basta não perder — tem que ser impossível perder calado.

**O que produzia o silêncio, e eram dois lugares no mesmo caminho:**

1. **Navegador.** O callback do seletor fazia `await fetch(...)` e
   `await res.json()` sem `try/catch`. Rede oscilando, servidor reiniciando num
   deploy, ou 502 do proxy devolvendo HTML rejeitavam a promessa e o callback
   morria ali — nada no banco, nada na tela.
2. **Servidor.** O `upsert` era `.catch(() => null)` (o erro real nunca chegava
   nem ao log), e a rota devolvia **HTTP 200** com zero gravados, no campo que a
   tela pinta de **verde**, dizendo "Você escolheu apenas pastas" — para um PNG.

**O que fica, como mecanismo:**

- `vereditoDaEscolha` é o único lugar que decide status e frase da gravação.
  **Zero gravado nunca é 200 e nunca é frase verde**; gravação parcial nomeia o
  arquivo que ficou de fora, em vermelho. Função pura, portão nas duas metades.
- O `catch` do servidor loga o motivo real com `clientId` e `fileId`, e a frase
  de erro vai para a tela do cliente sem culpá-lo.
- `POST /api/admin/reconciliar-drive` é o par do diagnóstico: ele já sabia
  DETECTAR (`escolhaPerdida`), agora a casa CONSERTA — todo arquivo que o Google
  concede e a casa não tem entra **pendente de triagem**, com papel NULO.
  **Reconciliar não é declarar:** quem diz o que um arquivo é continua sendo o
  cliente, senão a imagem errada entra numa peça entregue.

**Por que é decisão de corredor:** o Drive é onde doeu, mas a classe é toda
escrita nascida de um ato do cliente — envio de material, aprovação, resposta de
briefing, pedido. Falha calada é o defeito, mesmo quando a causa é outra.
