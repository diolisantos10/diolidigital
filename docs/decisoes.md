# O corredor — decisões que atravessam domínios

> Decisão que afeta mais de um especialista não mora na sala de nenhum deles.
> Mora aqui. **Só o PM escreve neste arquivo.**
>
> Decisão que serve a **mais de um projeto** não mora aqui: vai como proposta ao
> **Diretor Geral do Cérebro**, no `dioli-brain-kit`.

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
