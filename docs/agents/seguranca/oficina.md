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

## 2026-08-29 — posse no CORPO e na QUERY STRING (continuação da varredura de 28/08)

**Origem:** ficha `.fichas/posse-no-corpo.md`, despachada pelo PM depois de a
varredura de 28/08 declarar que só cobriu path params. **Documento completo:**
`docs/diagnosticos/varredura-de-posse-no-corpo-29-08.md`.

### O achado que estava DECLARADO e eu fechei

`historicoDaPeca(postId)` (`lib/agency/esteira/reprovacao.ts`) buscava a peça
sem workspace e depois lia o `workspaceId` **do próprio post alheio** para
filtrar os eventos — o filtro de posse existia, mas a fonte dele era o dado
que deveria estar protegido. Passou a exigir `workspaceId` obrigatório, no
`where` da busca da peça. Teste novo:
`__tests__/seguranca/o-historico-da-peca-do-vizinho.test.ts`.

### O achado que NÃO fechei, e por que isso é o ponto certo desta entrada

Três rotas da família "parceria" (`agency/parcerias`,
`agency/convites-de-parceria`, `admin/isencoes-de-parceria`) recebem
`clientId`/`clientRequestId` pelo corpo ou pela query e **não conferem
workspace nenhum**, em lugar algum — nem antes, nem no `where`. Qualquer
`master`/`project_manager` de qualquer workspace desta casa concede, revoga
ou isenta parceria (leia-se: isenção de pagamento + teto de gasto de IA) de
cliente de **outra agência**.

Eu tenho escrita. Eu não consertei. A minha própria constituição
(`docs/kit/23-constituicao-dos-essenciais.md`, SEGURANÇA §3 e §8) exige
autorização humana para "qualquer correção que toque pagamento ou integração
com parceiro" — sem exceção por achado ser pequeno ou por eu já ter a mão no
arquivo ao lado. Registro isto na oficina, e não só no documento, porque é o
primeiro caso real (não hipotético) em que a trava da minha própria régua me
parou — e é exatamente esse o comportamento que a régua existe para produzir.

### O que aprendi, e vale para a próxima varredura

1. **A família "parceria/isenção/convite" nasceu em 27/08 sob pressão de
   "seis travas sem fechadura em 24 horas"** — o foco de quem escreveu era
   fazer a porta EXISTIR (ver os cabeçalhos dos três arquivos). Posse entre
   workspaces não estava na lista de preocupação daquele dia. **Toda vez que
   uma trava nasce resolvendo "isto nunca pôde ser acionado", vale conferir
   se ela também resolveu "e por quem".**
2. **`findUnique`/`upsert` por uma chave que não é `workspaceId` (aqui,
   `clientId` como chave primária de `ParceriaDoCliente`) é o mesmo padrão de
   sempre, com uma cara nova**: a chave única do modelo (`@unique` no schema)
   tenta a escrever `where: { clientId }` sozinho, porque "funciona" — e
   funciona para qualquer `clientId`, de qualquer casa.
3. **Nem todo furo fechado é meu para fechar.** A régua "faço sozinho quando é
   reversível" tem uma exceção que não é sobre reversibilidade: é sobre
   **domínio do dano** (pagamento, parceiro). Isto já estava escrito; esta
   entrada é a primeira vez que apareceu um caso real para testá-la.

### Irmãos do mesmo defeito, medidos e NÃO varridos (fora do tempo desta rodada)

Ver a seção "O QUE NÃO VARRI" do documento — em resumo: as rotas
`app/api/admin/*` restantes (reverter-aprovação, refazer-com-direção,
produzir-peças, recompor-peças, cards-de-aprovação, reconciliar-drive,
training/sdr), `self-serve/assinatura` e `self-serve/order` (públicas, sem
workspace — mas também tocam pagamento, mesma trava), o resto de
`app/api/meta/*` e `app/api/google/*`, `ai-keys`, `financeiro`, `capacidades`,
`pulso`, `top-down`, `produto-tecnologia`.
