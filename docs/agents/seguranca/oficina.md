# Oficina — seguranca

> Append-only. O agente escreve aqui. Ao virar o mês, vira `oficina/AAAA-MM.md`.

## 2026-08-07 — sala criada

Sala aberta pelo PM na divisão do elenco (doutrina 21 do `dioli-brain-kit`).
Nenhuma entrada de trabalho ainda: **não medido**, e não zero.

---

## 2026-08-15 — a posse do criativo do anúncio (P0, produção viva)

**Commits:** `209b504` (torniquete) e o do conserto, branch
`claude/posse-no-criativo`. **Origem:** auditoria do Diretor em
`lib/agency/esteira/trafego.ts`.

### O achado

`montarCriativo` escolhia **Página sem `clientId`** e **arte sem dono nenhum**
(`findFirst({ mediaUrl: { not: null } })`, o post mais recente da base inteira).
O `pageId` ia cru para `object_story_spec.page_id`; só a conta de anúncios
passava por `MetaAtivoAutorizado`. Anúncio do cliente A podia nascer assinado
pela Página de B, com a arte de B. Gatilho: o cliente aprovar o pacote.

**Padrão 2 da minha tabela** — *id aceito sem conferir de quem é* — na versão
mais escorregadia dele: aqui o id nem vinha de fora. Ele era **escolhido pelo
próprio código**, e "escolhido por mim" pareceu confiável para quem escreveu.
Registro isto porque a minha tabela procurava id que CHEGA, e este nasceu dentro
de casa.

### O que aprendi, e vale para a próxima varredura

1. **`findFirst` sem dono é a versão silenciosa de "o primeiro restaurante
   ativo"** — o furo que já estava na minha lista de origem, com outra roupa.
   Varredura nova começa por: `findFirst` em modelo que tem `clientId` no
   schema, cuja `where` não tem `clientId` nem id único. Foi assim que os
   irmãos apareceram (abaixo).
2. **Teste que passa com o código defeituoso não é teste da porta.** O que
   existia (`trafego.test.ts:241`) provava "sem Página, sem anúncio" — a
   AUSÊNCIA. O defeito não era a falta da Página, era a Página ERRADA. Refutação
   exige **dois donos no fixture e um banco falso que honre o `where`**: com
   mock que devolve sempre a mesma linha, este defeito é invisível por
   construção.
3. **A trava vai onde o id é USADO, não onde ele é passado.** Repeti a lição de
   06/08 (`publishPost` ficou fora da trava porque a conferência morava no
   chamador) e cobri a segunda porta do mesmo arquivo
   (`promoted_object.page_id`) antes de existir chamador para ela.
4. **Mentira de diagnóstico anda junto com furo de posse.** Toda ausência de
   anúncio virava *"a Meta recusou o criativo"*: culpar a plataforma por defeito
   nosso apaga o rastro e manda o operador esperar por quem nunca vem. Fechei a
   porta e consertei a frase no mesmo commit.
5. **Torniquete com ponto de reversão declarado** (`POSSE_DO_CRIATIVO_CONFERIDA
   = false`, uma constante) permitiu subir a contenção sozinha. Ele saiu junto
   com o conserto — torniquete que vira parte da anatomia é gangrena.

### Irmãos do mesmo defeito, medidos e NÃO consertados (não é meu escopo hoje)

- `lib/agency/esteira/avisos.ts:70` — `metaConnection.findFirst({ workspaceId,
  platform: "whatsapp" })`, **sem `clientId` e sem `status`**: o aviso da
  agência sai pela primeira conexão de WhatsApp do workspace. Latente enquanto
  só existe a WABA da agência; no dia em que um cliente conectar a dele, a
  agência fala pelo número do cliente.
- `app/api/meta/whatsapp/route.ts:22`, `app/api/meta/whatsapp/messages/route.ts:19`,
  `app/api/meta/templates/route.ts:20` — mesma pergunta ("o primeiro WhatsApp do
  workspace") no painel da agência.
- `lib/integrations/meta/inbox.ts:27` — sem `workspaceId`, mas a chave é o
  `externalId` do número, que é único. **Não é furo**, e está documentado no
  próprio arquivo. Anoto para não ser reaberto toda varredura.

### Ferramenta que ficou

`scripts/pericia-posse-do-criativo.mts` — somente leitura, **sem uma única
chamada à Meta**. Reconstrói a escolha determinística do código antigo a partir
de `MetaConnection` e `SocialPost` e classifica cada anúncio já criado em
limpo / com ativo de outro / **ambíguo**. Ambíguo não vira limpo: vira "não
medido" e conferência à mão.

---

## 2026-08-30 — a sessão do titular no 99Freelas: contorno de proteção e o
perfil de navegador que não existe

**Despacho:** `DESPACHO-99FREELAS-SEGURANCA.md`. **Parecer entregue:**
`docs/plataformas/99freelas/pareceres/2026-08-30-seguranca-sessao-do-titular.md`.
**Sem rede** — tudo julgado a partir do que já estava em disco.

### As duas decisões

1. **A captura de hoje (12 artigos de ajuda lidos pela API pública do Zendesk
   depois de 403/Cloudflare no HTML) não é contorno.** O teste que usei:
   "burlar" exige um controle técnico *derrotado* — nenhum foi. O que houve
   foi outra porta, publicada pelo mesmo operador, sem desafio, sem
   autenticação, **autorizada pelo `robots.txt` do próprio host**. Silêncio +
   sinal positivo é diferente do silêncio isolado que rege a pergunta de
   automação — por isso o veredito muda de pergunta para pergunta na mesma
   ficha, e isso é o esperado, não inconsistência.
   - **O que aprendi, e vale para a próxima vez que alguém achar "outra
     porta":** legitimidade de um caminho alternativo não é transitiva.
     Funcionar para documentação pública genérica não autoriza o mesmo
     truque em `/projects` (dado de negócio) ou em qualquer coisa
     autenticada — cada superfície precisa do próprio teste (existe API
     alternativa? é documentada pelo operador? o conteúdo é público por
     natureza? há sinal positivo de `robots.txt`?). Registrei isso como
     recomendação de comentário em `lib/marketplaces/portao.ts` para quem
     mexer depois.

2. **Bloqueei a operação de sessão autenticada, mesmo supervisionada —
   não pelo 99Freelas, pelo Chrome do titular.** A ficha pedia julgamento
   sobre "Claude in Chrome com a sessão dele". Encontrei DOIS desenhos
   possíveis atrás da mesma frase: (a) o que a própria especificação da casa
   já descreve — perfil de navegador **dedicado e isolado**, só com o
   99Freelas dentro (`docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md`
   §4); (b) o Chrome pessoal e cotidiano do CEO, onde ele também está
   logado em e-mail. Busquei por `playwright` e `browser-profiles/` no disco
   inteiro: **não existe implementação nenhuma.** O isolamento é parágrafo de
   especificação, não trava. Pela regra desta casa ("prompt é aviso, código é
   trava"), isso é `LACUNA`, e uma lacuna dessa classe — agente com
   ferramenta de navegador exposto a conteúdo de terceiro não confiável
   (briefing de projeto) dentro do MESMO perfil que tem e-mail/banco — é
   exatamente "quem entrou alcança o que não é dele", só que o dono do
   recurso não é outro cliente da agência: é a vida pessoal do CEO.
   - **Por que isto não virou "vulnerabilidade ativa" no laudo:** não existe
     execução de navegador rodando hoje (nem `playwright`, nem
     `lib/agency/celula/**` toca o 99Freelas de verdade — só monta
     mensagem/funil). Sem execução, não há ataque possível hoje. Registrei
     como **pré-condição de ir ao ar**, não como incidente — mas com a
     mesma força de um P0, porque "ninguém tentou ainda" não é "está
     seguro".

### O que também descobri no caminho, e não é o escopo direto da pergunta

- `lib/marketplaces/portao.ts` já é um bom exemplo de trava desta casa:
  `login` é `BLOCK` incondicional em código, `contornarAntiBot` é
  `SEMPRE_BLOQUEADAS`, cota e spam são fail-closed. Registro para a vitrine:
  é outro exemplo de mecanismo que barra o caso plantado sem inventar
  problema no caso limpo — `qualificar` (nada toca a plataforma) sai `ALLOW`
  sozinho, sem fricção.
- **Achado sobre a "uma linha" que destrava tudo:** `autorizacao_do_suporte`
  em `policy.json` é, por desenho, o único campo que troca `HUMAN_GATE` por
  `ALLOW` no envio de proposta. Isso é intencional e documentado
  (`portao.ts`, comentário de topo) — mas também significa que quem puder
  editar essas três linhas de `policy.json` controla o portão inteiro.
  Recomendei revisão dupla nomeada para qualquer mudança nessas linhas
  especificamente, não travei — travar edição de dado de política não é meu
  escopo aqui, é registro para o PM decidir processo.
- Busquei credencial de 99Freelas em todo o disco: **zero encontrada.** O que
  existe são nomes de variável (`RADAR_GMAIL_APP_PASSWORD`), nunca valor.
  Nenhum gancho de pré-commit escaneia segredo hoje — disciplina manual sem
  furo observado, registrado como reforço recomendado, não bloqueio.

### Proposta de vitrine (para o PM avaliar)

- **"Legitimidade de caminho alternativo não é transitiva"** — o teste de
  quatro perguntas (existe API alternativa documentada pelo operador? é
  publicada pelo mesmo operador? o conteúdo é público por natureza? há sinal
  positivo de `robots.txt`?) usado para decidir a pergunta 1 deste parecer é
  reaproveitável em qualquer futura "achei outra porta" de qualquer
  plataforma — Meta, Google, TikTok inclusive.
- **"Especificação não é trava"** — a mesma frase da constituição
  (`23-constituicao-dos-essenciais.md` §3) aplicada a um caso concreto:
  perfil de navegador isolado estava desenhado, documentado, com nome de
  função e caminho de diretório — e mesmo assim não protegia nada porque
  ninguém tinha escrito o código. Vale para toda futura leitura de
  especificação como se fosse estado atual do sistema.

---

## 2026-08-30 — o meio-termo do Guardião: consertar a ação, não a palavra

**Origem:** laudo do `qualidade` sobre a Onda 2, ficha
`docs/celula-prospeccao/despachos/I-o-meio-termo-do-guardiao.md`. **Parecer:**
`docs/plataformas/99freelas/pareceres/2026-08-30-guardiao-perfil-fora-da-plataforma.md`.

### O achado

Meu próprio conserto anterior (Onda 2, ficha B — tirar `instagram`/`insta`/
`linkedin` da regra `dado_de_contato` para não barrar "posts para Instagram")
resolveu o falso positivo e abriu um meio-termo: `"me segue no insta"` e
`"meu perfil no linkedin"` passaram a **passar**, porque nem citam `@handle`
nem a palavra da rede sozinha. O `qualidade` pegou certo: **acertei o
problema e errei o tamanho do conserto**, numa tacada só.

### O que aprendi, e vale para a próxima trava que eu mexer

1. **Remover uma palavra de uma régua de conteúdo é sempre um conserto de dois
   passos, não um.** Passo 1: tirar o que causava o falso positivo. Passo 2:
   perguntar "o que essa palavra ESTAVA cobrindo, e por que verbo isso pode
   ser dito sem ela?" — pular o passo 2 é deixar a régua estreita de novo, só
   que agora com um buraco no lugar exato de onde a palavra saiu.
2. **A trava certa mira a AÇÃO, não o substantivo.** "Instagram" é ambíguo —
   é rede (proibida citar para contato) e é entrega (produto da casa). O
   verbo ("segue", "acha", "perfil no") não é ambíguo: ninguém escreve "me
   segue no" vendendo gestão de conteúdo. Trocar o alvo do regex do
   substantivo para o verbo é o que permitiu não reintroduzir "instagram" na
   lista e ainda assim fechar o buraco.
3. **Guardião compartilhado exige parecer mesmo em conserto de uma linha.**
   A ficha B mexeu neste mesmo arquivo sem parecer — a trava de 03/08 vale
   também para "consertar um regex". Escrevi o parecer retroativo para B e o
   da ficha I juntos, para a próxima pessoa não achar que foi descuido.

### As duas metades, de novo — e por que a segunda é a que importa mais

Testei nomeadamente as três frases que a Onda 2 tinha usado como prova do
falso positivo ("gestão de Instagram e TikTok", "reels para o Instagram",
"12 posts para Instagram") contra os novos padrões, **antes** de considerar
o conserto pronto — não bastava rodar as quatro frases hostis novas, era
preciso reconfirmar que elas não regrediram. As duas metades continuam de
pé em `__tests__/celula/entrada-hostil.test.ts`.

### Proposta de vitrine (para o PM avaliar)

- **"Remover palavra de régua é conserto de dois passos"** — o padrão acima:
  toda vez que uma trava de conteúdo perde uma palavra por falso positivo,
  a pergunta seguinte obrigatória é "que ação essa palavra cobria, e existe
  verbo para ela que sobrevive sem a palavra?". Aplica a qualquer guardião de
  conteúdo desta casa, não só ao 99Freelas.

---

## 2026-09-02 — o papel na Célula saiu do header, mas a porta nova reabre uma
trava antiga por outro lado

**Despacho:** parecer sobre a correção do furo do header `x-papel-na-celula`
(commit em curso, branch `claude/celula-prospeccao-99freelas-v1`).

### O achado principal — o furo do header está fechado, e bem fechado

`lib/agency/celula/papel-do-usuario.ts` move a fonte do papel do header
(forjável por qualquer sessão válida) para `User.papelNaCelula`, gravado só
por `master`, lido fail-closed. `grep` exaustivo confirma zero caminho de
código vivo lendo o header para decidir permissão; os testes provam as duas
metades — inclusive o caso "banco diz sdr, header alega gerente" continua
barrado. Isto é a trava certa, no padrão desta casa.

### O achado que a ficha pediu para procurar, e que apareceu

Item (b) da ficha perguntava nomeadamente: *"alguém consegue atribuir um
papel MAIOR que o próprio — releia a combinação 'sou master, mas o corpo
pode conter dados de outro ator'?"* A resposta é sim, por uma porta que não
é a auto-atribuição em si: `atribuirPapelNaCelula` não impede
`alvoUserId === atorUserId`, e `lib/agency/celula/papeis.ts` — arquivo **não
tocado neste despacho** — bloqueia `master`/`director` de
`operar_fila_de_excecoes` e `aprovar_modelo`/`pausar_modelo` só
**condicionalmente** (`papel === null`, ou `papel !== "gerente_de_atendimento"`),
não incondicionalmente por autoridade. Master que se auto-atribui
`gerente_de_atendimento` — que é literalmente o exemplo de uso documentado em
`scripts/atribuir-papel-celula.mjs:19` — atravessa os dois bloqueios que a
ordem do CEO de 30/08 desenhou por nome ("o CEO não opera a fila", "direção
não aprova a própria fala").

### O que aprendi, e vale para a próxima varredura de permissão em camadas

1. **Fechar a fonte de um dado não fecha a trava que consome esse dado.**
   O conserto de hoje corrigiu **de onde vem** o papel; não conferiu **o que
   o papel destrava** do outro lado, num arquivo mais antigo que ninguém
   tocou nesta rodada. Toda vez que uma "fonte de verdade" muda de lugar
   (header → banco, config → banco, etc.), a pergunta seguinte obrigatória é:
   *quem consome este dado, e as travas de lá foram escritas assumindo que
   ele nunca chegaria a certos valores?*
2. **Comentário que promete uma ordem de checagem ("autoridade não destrava,
   e não deve nem ser consultada") e código que não cumpre essa ordem é o
   pior tipo de achado — porque o próprio arquivo já documenta a intenção
   certa.** `papeis.ts:150-152` é exatamente isso. Vale procurar esse padrão
   — comentário-promessa vs. `if` que não entrega — em outras travas da casa.
3. **Teste que cobre `{ autoridade: "master", departamentos: [] }` sem o
   papel declarado não cobre o caso real** — a credencial de produção sempre
   tem `departamentos: ["client-service-sdr"]` hard-coded. O teste existente
   testava um shape que a rota nunca produz.

### Proposta de vitrine (para o PM avaliar)

- **"Fechar a fonte não fecha o consumidor"** — ao mover uma fonte de dado
  sensível (header → banco, etc.), auditar também as travas que já
  consumiam esse dado antes da mudança, especialmente as que têm bloqueio
  condicional em vez de incondicional para papéis de maior autoridade.
  Reaproveitável em qualquer futura migração de fonte de permissão desta
  casa.
