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
