# Oficina — interface

> Registro de trabalho do especialista de interface. O que foi mexido, por quê,
> e o que ficou aberto. Quem promove para a vitrine é o Diretor.

---

## 2026-08-05 · madrugada de melhoria — os três blocos do raio-x

Território: `app/agency/**` (exceto `planner/`), `app/briefing/**`,
`app/vitrine/**`, `components/**` (exceto `components/agency/planner/`),
`app/globals.css`, `DESIGN.md`, mais os pontos de `app/portal/access/[token]`
nomeados no pedido. Três outras frentes trabalhavam em `app/api/**` e `lib/**`
ao mesmo tempo.

---

### BLOCO 1 — o que quebrava na mão de quem usa

#### 1. As quatro listas do painel eram cortadas, não roláveis

Tabela de 5 a 9 colunas dentro de um pai com `overflow-hidden`, e o `<main>` do
shell com `overflow-x-hidden`: as últimas colunas **sumiam e não havia gesto
que chegasse nelas**. Em Tarefas eram Prioridade, Status, Prazo, Origem e
**todas as ações**.

**A decisão foi cartão, não rolagem lateral** — e a justificativa é a segunda
metade do problema. `overflow-x-auto` conserta o *corte*; não conserta a
*tela*. Rolar 880px de tabela numa janela de 375px é navegação às cegas: o
cabeçalho sai de vista junto com o dado, então a coluna que você finalmente
alcançou não tem mais rótulo. É por isso que Linear e Attio viram lista no
celular, e é o que a Caixa de Entrada desta casa já fazia.

Padrão aplicado nas quatro (`tasks`, `projects`, `deliverables`, `clients`):
abaixo de `md`, `<ul>` de cartões — título 14px, contexto 12px, selos de estado
em linha, ações como botões reais de 32px; de `md` para cima, a tabela dentro de
`overflow-x-auto` com `min-w-[…]` explícito. Virou §6.3 do `DESIGN.md`.

Também consertado no caminho: a faixa de abas de Tarefas vazava a tela a 375px
(`overflow-x-auto scrollbar-none` + sangria casada com o padding do shell).

#### 2. Briefing público — a barra de conversão cobria o fim do conteúdo

O defeito da §6.1, na tela onde ele custa mais caro: exatamente no
"Sim, quero meu orçamento". A regra nasceu no portal, foi levada ao painel — e
o briefing ficou de fora por quatro dias.

Aplicado o trio que já existia (`.acao-shell` / `.acao-reserva` / `.acao-barra`)
com `useReservaDeBarra`, que **mede** a altura em vez de digitá-la.

**Prova, medida a 375px rolando até o fim com `behavior: "instant"`:**

| | altura da barra | reserva aplicada | linhas de conteúdo cruzadas |
|---|---|---|---|
| antes | 72px | *nenhuma* | **1 coberta por inteiro** |
| depois | 72px (medida) | **96px** | **0** |

E a §6.1 ganhou o que faltava: uma **tabela de varredura das superfícies, com
data**. Regra sem varredura das outras superfícies é regra pela metade — e
agora linha sem data é linha não conferida.

#### 3. Pipeline sangrava e era cortado

`-mx-8 px-8` contra um shell que é `px-4` no celular: 16px de vazamento e a
primeira coluna cortada. Virou `-mx-4 px-4 md:-mx-8 md:px-8`.

Achado no caminho, visível ao usuário: projeto sem prazo mostrava literalmente
**"NaNd"** no cartão. Agora mostra "Sem prazo".

#### 4. Ações que não existiam no toque

`opacity-0 group-hover:opacity-100` não é discrição no celular — é
funcionalidade ausente, porque `:hover` nunca dispara. Os botões de mover etapa
do Pipeline eram inalcançáveis por aparelho.

Nasceu `.acao-revelada` (`globals.css`): visível por padrão, escondida **apenas**
dentro de `@media (hover: hover) and (pointer: fine)`, revelada também por
`:focus-within`. O breakpoint não serve para isso — tablet de 768px é toque com
largura de desktop. Virou §6.4.

#### 5. Contraste — medido antes e depois, na página renderizada

Não foi estimativa: uma auditoria roda no DOM, lê a cor computada e o fundo
efetivo de cada elemento com texto próprio e calcula a razão WCAG.

**Tokens** (sobre `--bg` · `--card` · `--accent`, os três agora ≥ 4.5:1):

| Token | antes | depois |
|---|---|---|
| `--text-secondary` | 6.02:1 | **7.11:1** (`#4B5563`) |
| `--text-muted` | **2.85:1** (`#8B95A3`, 1.104 usos) | **5.32:1** (`#5E6875`) |
| `--text-subtle` | **1.73:1** (`#B8C0CA`, 113 usos) | **4.55:1** (`#6B7280`) |
| `--success` (sobre o tint) | 3.00:1 | **4.57:1** (`#15803D`) |
| `--warning` (tint) | 2.86:1 | **4.66:1** (`#A45A05`) |
| `--danger` (tint) | 4.41:1 | **5.91:1** (`#B91C1C`) |
| link do portal | 2.40:1 (`#12B5AC`) | **4.62:1** (`--teal-text` `#0F7E79`) |
| rótulos da sidebar | 1.91:1 (branco 22%) | **6.23:1** (branco 55%) |

**Reprovações AA por tela, medidas a 375px dentro do `<main>`:**

| Tela | antes | depois |
|---|---|---|
| `/agency/tasks` | 62 | **3** |
| `/agency/projects` | 6 | **0** |
| `/agency/clients` | 13 | **0** |
| `/agency/pipeline` | 23 | **0** |
| `/agency/dashboard` | 84 | **14** |
| `/agency/deliverables` | — | **0** |

As 17 que sobraram **não estão no meu território**: são hex "na mão" dentro de
`lib/` (ver I-20 no `DESIGN.md`). O token já está certo; falta a troca.

Um par de tokens novos: `--teal` (superfície) e `--teal-text` (texto/link). E
uma decisão que **não** tomei: o botão de fundo `--teal` com texto branco dá
2.55:1 — mudar preenchimento é identidade visual, e identidade é do CEO.

#### 6. O `DESIGN.md` discordava do `globals.css` em 7 de 12 tokens

`--bg`, `--bg-elevated`, os quatro de texto e `--border`. Quem lesse a "fonte
única de verdade visual" e digitasse o hex escrevia a cor errada. §2 conferida
linha a linha contra o CSS e corrigida, com aviso do que aconteceu.

---

### BLOCO 2 — confiança

#### 7. Cinco telas entregavam conteúdo de reserva como se fosse a IA

`pm-agent`, `ads-agent`, `design-agent`, `social-media-agent` e
`brand-hub-agent` caíam no gerador por regras com um `console.warn` — que
ninguém lê — e entregavam o texto com a mesma cara do resultado real. É o pior
defeito de confiança do produto: o CEO abre a tela na frente do cliente e
apresenta como raciocínio da IA uma tabela de regras.

Molde extraído do `operations-agent` (a única que já fazia certo) para
`components/agency/ui/AvisoModoAlternativo.tsx`, e as seis passaram a usá-lo —
com o motivo técnico como **detalhe**, nunca como manchete.

#### 8. Erro cru e em inglês na cara do usuário

Nasceu `components/agency/ui/mensagemDeErro.ts`: traduz falha técnica em frase
em português que diz **o que houve e o que fazer**, e separa o texto cru em
`detalhe`. Aplicado em `brain`, `settings`, `design-agent`
("Generation failed." → "Não conseguimos gerar a imagem…"), `whatsapp` e — o
mais grave — no portal, onde `Falha HTTP 500` chegava ao **cliente pagante**.

#### 9. Erro sem "tentar de novo"

O portão de erro do portal e o bloco "Não consegui carregar agora" pediam para o
cliente recarregar a página. Agora têm botão — e o de projetos tem também
"Falar com seu PM". Link expirado/revogado continua sem botão de repetir, de
propósito: ali não há o que tentar.

---

### BLOCO 3 — as duas rotas órfãs

`/agency/whatsapp` (caixa completa e funcional) e o Radar (serviço + cron + três
rotas de API) **não tinham um único link na interface**. Ambos entram no menu.

- **WhatsApp** estava em estado de uso, mas engolia falha de carga em silêncio —
  "sem conversas" e "API fora do ar" tinham a mesma cara. Ganhou os três estados
  e passou a usar o `AgencyHeader` da casa.
- **Radar** não tinha tela nenhuma: o robô varria o mercado, gravava tendências
  como `pending` à espera de um humano, e nenhum humano tinha por onde chegar
  nelas. É o quarto estado da §7.4 — trabalho feito que o destinatário não vê.
  Nasceu `/agency/radar`: fila de validação com "Colocar em vigor" / "Recusar",
  "Buscar agora", e os três estados obrigatórios.

---

### O que ficou aberto

1. **17 reprovações AA em `lib/`** — I-20 do `DESIGN.md`, com arquivo e linha.
2. **Fontes de 9px e 9.5px** fora da escala da §3 — I-21.
3. **Botão de fundo `--teal` com texto branco a 2.55:1** — precisa da decisão do
   CEO, porque mexe em identidade.
4. **Control Room e Orchestrator** continuam órfãos na navegação.
5. A suíte tinha **43 falhas** ao fim da madrugada, **todas** em
   `__tests__/{brain,esteira,media,radar}` e **todas** exercitando `lib/**` —
   trabalho em voo de outras frentes. Nenhum dos meus arquivos é importado por
   elas. Typecheck limpo.

---

## 2026-08-05 · Radar de oportunidades — a mesa de decisão do comercial

Território: `app/agency/oportunidades/page.tsx`, `components/agency/comercial/*`,
o item de menu em `AgencySidebar.tsx` e uma linha em `lib/agency/roles.ts`.
A frente de plataforma escrevia `lib/agency/comercial/oportunidade.ts` e
`/api/agency/oportunidades` **ao mesmo tempo** — nenhum arquivo dela foi tocado.

### O que a tela é

Fila de triagem ordenada pela nota. Fechado, o cartão responde "vale a pena?"
(nota 0–100 com faixa, serviço, valor, o porquê em uma linha); aberto, responde
"o que eu mando?" (o anúncio de um lado, a **proposta pronta** do outro).

**O produto da tela é o botão de copiar, não o cadastro.** Envio por robô em
marketplace de freela é conta banida — a mesma lição que gerou a trava de
plataforma da casa. Então a tela termina em "Copiado ✓" e o envio é da mão do
operador, dentro do site deles. Por isso "Aprovar e copiar" é **uma** ação:
separar em dois cliques é onde a proposta aprovada fica sem ser enviada.

### Contrato lido com tolerância, escrito com rigor

`components/agency/comercial/contratoDeOportunidade.ts` normaliza a leitura
(apelidos de campo, `{oportunidades}` ou array, status em pt/en) e devolve **um**
tipo. Com as duas frentes escrevendo em paralelo, ler `json.oportunidades[0].nota`
direto significaria a tela inteira caindo por um nome de campo — e o operador
veria "erro" onde havia trabalho pronto. Campo ausente vira `null`, e a tela diz
"a definir": ausência de informação não é informação.

Dois pontos onde a tolerância parou de propósito: a chave de plataforma "outra"
virou **`desconhecida`**, porque o catálogo do backend é fechado; e
`orcamentoInformado` (o que o anunciante declarou) tem campo **próprio**, nunca
o de `valorSugerido` — trocar um pelo outro é proposta enviada com o preço do
cliente.

### Três achados de interface que valem além desta tela

1. **`line-clamp-1` no celular é meia frase.** "O raciocínio em uma linha" é
   verdade no desktop e mentira a 375px, onde uma linha são ~30 caracteres.
   Ficou `line-clamp-2 lg:line-clamp-1`. *(E `block` na mesma classe cancela o
   clamp: os dois disputam `display`.)*
2. **Fade de rolagem só quando transborda — e transbordo se mede.** Fade fixo
   desbota a última linha de uma proposta que estava inteira na tela, e o
   operador acha que o sistema cortou o texto que ele vai mandar ao cliente.
   `CaixaRolavel` mede com `ResizeObserver`.
3. **Filtro zerado é controle morto.** Com a fila vazia (ou erro), as cinco abas
   somem: cinco botões que não fazem nada logo acima da mensagem que importa.

### Prova

- 375 / 768 / 1440 nos cinco estados: cheio, cartão aberto, carregando, vazio,
  erro — mais "Copiado ✓" com leitura real da área de transferência nos dois
  extremos.
- §6.2 medida a 375px, rolando de 200 em 200px com `behavior: "instant"`:
  **0 recortes parciais** em 9 posições. A tela não introduz elemento fixo; a
  reserva do `.agency-shell` continua bastando.
- `npx tsc --noEmit` e `npx eslint` limpos nos arquivos desta frente.

### O que ficou aberto

1. **`valorSugerido`, `raciocinio` e `propostaTexto` ainda não são produzidos**
   pelo motor — hoje a tela mostra "a definir" e "sem raciocínio registrado".
   Honesto, mas metade do valor da tela depende disso existir.
2. **Sem contador no menu.** "Oportunidades" entrou sem badge, porque o número
   exigiria buscar a fila em toda página do painel. Quando o volume justificar,
   segue o padrão de `useCaixaDeEntrada`.
3. **Hex solto em borda de tint** (`#BBF7D0`, `#FCA5A5`, `#FDE68A`, `#BFEFEC`) —
   os mesmos valores que `/agency/radar` já usava. Não existe token de *borda*
   para os tints semânticos; criar um mexe em tela demais para caber aqui.

---

## 2026-08-06 · O microfone que não depende de saldo (nativo primeiro)

### O pedido

CEO: *"não tem como usar algum microfone sem usar OpenAI?"*. Contexto: a conta
do provedor ficou sem crédito e o ditado morreu ao mesmo tempo no **portal do
cliente**, no **briefing público** e no chat. Um campo de texto que depende de
fatura não é funcionalidade, é promessa.

### O que passou a existir

1. **Caminho 1 — nativo** (`lib/ai/ditado-nativo.ts`): `SpeechRecognition` /
   `webkitSpeechRecognition`. Grátis, sem chave, texto durante a fala, e o áudio
   **não passa pelo nosso servidor** (a rota paga não é chamada — está no teste).
2. **Caminho 2 — envio**, como antes, mas com **provedor substituível**
   (openai · groq · gemini) e cadeia de fallback em `lib/ai/transcricao-servidor.ts`.
3. **Nenhum dos dois = a tela diz.** `GET` nas duas rotas responde só
   `{ disponivel }`; sem provedor, em vez de um botão que grava meio minuto para
   depois falhar, sai uma frase: *"O ditado por voz não está disponível neste
   navegador. Escreva no campo acima — nada se perde."*

### As três decisões que valem para a próxima tela

1. **Suporte não é constante — pode CAIR no meio.** O nativo do Chrome depende
   de um serviço remoto; sem rede ele morre com `network`. Por isso existe
   *rebaixamento*: o módulo passa a responder `false`, avisa por assinatura
   (`useSyncExternalStore` com instantâneo de servidor `false`, que continua
   sendo o que evita erro de hidratação) e a tela cai sozinha para o caminho 2.
2. **Só falha TÉCNICA rebaixa.** Permissão negada é escolha legítima do usuário:
   vira frase e **não** troca de caminho — trocar não mudaria a resposta do SO.
3. **Estado ativo se lê de longe.** O selo de 24px/10px rosa claro do briefing
   ("Parar") virou vermelho cheio com a palavra **Ouvindo** em 12px/32px. Quem
   está falando faz uma pergunta só: *está ouvindo?*

### Prova

- 375 / 768 / 1440 nos três estados do botão (repouso · **Ouvindo** com eco do
  parcial · caminho indisponível), com `SpeechRecognition` falso injetado —
  o Chromium do ambiente não tem o serviço do Google, e o estado que importa é
  justamente o do iPhone.
- Testes: `__tests__/ai/ditado-nativo.test.ts` (18) e
  `__tests__/ai/transcricao-provedores.test.ts` (13). As duas metades: com
  suporte, `fetch` **nunca** é chamado; sem suporte, o envio continua inteiro.
- Portão à mão (Actions em pane): `npx tsc --noEmit`, `npx vitest run`
  (139 arquivos · 2206 testes) e `npm run build` — verdes.

### O que ficou aberto

1. **Groq só por env** (`GROQ_API_KEY`). O cofre das Integrações lista provedores
   de *raciocínio*; enquanto Groq não tiver linha lá, ele não é configurável pela
   tela — território da plataforma.
2. **Gemini com áudio `webm`** é o caminho menos testado dos três: a lista oficial
   de mimes do Google não cita webm. Se recusar, cai como `audio_recusado` e a
   cadeia segue — mas o ideal é medir com áudio real do iPhone (mp4) e do Chrome.
3. **`BriefingRoomV2` (painel interno)** tinha a linha de erro do microfone em
   10px — não foi tocado naquela frente para não ampliar o escopo. O arquivo
   foi apagado em 16/08/2026 (760 linhas sem nenhum importador); o item fica
   resolvido pela remoção, não pelo conserto.

---

## 2026-08-14 · Portal do cliente V12: o que faltava não eram as abas, eram os blocos

**Frente:** implantar a referência aprovada (`CLAUDE_HANDOFF_2` + ZIP V12) no
portal real. Clone isolado, branch `claude/portal-cliente-v12`.

### O achado que mudou o trabalho

O despacho dizia que o design "nunca foi implantado" e que a página do cliente
continuava a antiga. **Não era isso.** Na branch padrão já estavam as 11 abas, o
cabeçalho da regra do CEO com trava (`cabecalhoDoPortal`), a fronteira por
allowlist e — medido com `python3`, byte a byte — a folha `portal-cliente.css`
com os **66.162 caracteres do ZIP como prefixo exato**, mais um apêndice nosso.

O que faltava era outra coisa, e ninguém tinha nomeado: os **blocos** da
referência que a implantação suprimiu por não ter número para pôr dentro.
`cp-dashboard-primary`, `cp-channel-panels`, `cp-results-grid`,
`cp-paid-dashboard`, `cp-social-dashboard`, `cp-integration-layout` — nenhum
existia. A tela tinha a gramática certa e metade das frases.

**A lição:** "o design não subiu" e "o design subiu sem os blocos do meio" dão a
MESMA impressão para quem abre a tela — a de que não é o que foi aprovado. Só
que a segunda não se resolve implantando de novo. Antes de recomeçar do zero
porque alguém disse que não existe, **medir o que existe** custou 20 minutos e
salvou reescrever 700 linhas boas.

### A regra que guiou cada bloco restaurado

O bloco volta; o número inventado, não. Onde a demonstração cravava "438
contatos, +31,7%", entra ou a **contagem do cadastro dele** (publicações no ar e
programadas, campanhas no ar, teto aprovado, verba diária — tudo já no banco e
nunca estimado), ou o **estado vazio dizendo por quê**. A moldura aprovada é do
CEO; o conteúdo é do cliente.

Dois casos em que isto exigiu escolha, e não regra automática:

- **A "Análise da Dioli"** (cartão escuro, coluna direita da Visão Geral) não
  tem equivalente honesto: ninguém apurou uma leitura para este cliente. No
  lugar dela foi a **operação por departamento**, que é medida — e que estava
  numa grade `.cp-departamentos` inventada por nós. O cartão da referência
  tinha exatamente a forma dela (ícone · rótulo · valor). Ganhou-se fidelidade
  e sumiu uma invenção.
- **O funil do Tráfego Pago** (impressões → cliques → contatos) depende de
  leitura da plataforma que não está ligada. A coluna virou **o dinheiro dele**:
  teto aprovado e verba diária no ar. É o que ele mais quer saber e é verdade.

### O "0" que parecia fracasso

Cliente recém-criado abria a Visão Geral com um **`0` em corpo 26** onde vai o
alcance. Zero medido é honesto e ainda assim mentiroso na leitura: quem abre lê
resultado ruim onde só existe começo. Manchete passou a exigir o que
manchetear; sem nada, quem fala é o vazio com a saída na mão.

### Defeitos de tela que a própria referência carregava

Vieram no ZIP e teriam ido para produção iguais:

1. **Botão ciano em cartão escuro sem `color`** — herdava o branco do cartão e o
   rótulo sumia. A referência declara a marinho em `.cp-insights > button` e
   esquece em quatro irmãos.
2. **`> span { flex: 1 }` pegando a etiqueta** — "AMBIENTE SEGURO" virava uma
   pílula da largura da faixa.
3. **`min-height` de gráfico com estado vazio dentro** — meia tela em branco,
   que o cliente lê como "não carregou".

Todos no apêndice, marcados, com o porquê. Nenhum é redesenho.

### Conferido

`npx tsc --noEmit` limpo · **3.506 testes verdes (216 arquivos)** · varredura de
estouro horizontal nas **11 abas × 375/768/1280** sem uma sobra · dois clientes
de prova (um com dados, um recém-criado) abrindo tela que faz sentido.

Aprovação medida de ponta a ponta no navegador: o corpo enviado passou a levar
`authorName`, e o banco gravou `client:Foocci` no lugar de
`client:portal:<hash>`. **Sem isso a aprovação passava na trava e ficava sem
nome de gente** — e é a aba onde o CEO vai decidir.

### O que ficou aberto

1. **`reviewedBy` não volta da leitura.** `app/api/brain/portal-data/route.ts`
   mapeia `reviewedAt` e não `reviewedBy`; a tela já sabe mostrar "Decisão
   registrada **por Fulano**" e só espera o campo. Uma linha — em arquivo fora
   do meu despacho, então foi reportada, não tocada.
2. **Métrica por post** (o "melhor conteúdo") e **desempenho de anúncio** (gasto,
   contatos, custo por contato) seguem em estado vazio: dependem de leitura da
   plataforma, não de tela.
3. **O funil da referência** volta a caber no dia em que essa leitura existir —
   a classe `cp-funnel-card` está lá, usada só pela metade (o `footer`).

---

## 2026-08-15 · O material de marca no Brand Hub (branch `claude/materiais-no-brand-hub`)

**Pedido:** o cliente não tinha como enviar, consultar ou substituir o Brand Book
no Brand Hub. O envio existia — no fim da aba Entregas.

### O que eu achei que não estava no despacho

1. **A caixa "Marca" gravava o Brand Book como `logo`.** Ela dizia aceitar "seu
   logo, e o manual da marca" e mandava os dois para o mesmo destino. Como `logo`
   é `entraNaPeca: true`, o PDF entrava na fila de arquivos que uma arte pode
   desenhar — e quem procura o manual procura `manual_de_marca`, que nunca
   existia. Duas caixas agora, e nunca mais uma.

2. **Duas categorias não tinham onde pousar.** "Fontes" e "Vídeos" não existiam
   na lista fechada de papéis. Despejá-las em `outro` faria o cliente soltar o
   .otf em "Fontes" e a lista devolver "Outro material" — a categoria sumindo no
   momento em que ela vira prova. Viraram papéis próprios.

3. **O recado técnico da equipe vazava para a tela do cliente.** Achado
   APERTANDO O BOTÃO, não lendo código: subi um PDF com a chave de IA ausente e
   o cliente leu *"Nenhuma chave Claude conectada. Configure em Integrações."* —
   uma instrução que só a agência pode executar, ao lado de um arquivo que está
   guardado e inteiro. Recado de equipe e recado de cliente são dois.

### O erro de tela que só a captura pegou

Agrupei os botões por categoria dentro de uma `<div>`. O V12 estiliza a linha
por **filho direto** (`.cp-delivery-list>button`), então a linha inteira perdeu o
desenho: nome, data e etiqueta viraram uma frase corrida. `<Fragment>` resolveu.

E em 375 as linhas se sobrepunham: a linha do V12 tem **altura fixa (68px)** e a
frase de estado ocupa três linhas no celular. Encurtar a frase consertaria o
desenho e estragaria o recado — que é o que o cliente precisa ler. A linha
continua sendo a do V12; a explicação ganhou o espaço dela embaixo.

> **A lição, e ela é do meu cargo:** altura fixa herdada da referência é uma
> aposta de que o texto cabe. Todo texto que vem do servidor pode não caber. Ou o
> texto entra na linha, ou sai dela — nunca "provavelmente cabe".

### O portão que me reprovou, e estava certo

Pus a leitura do brand book em `lib/agency/brand/`. O portão do cérebro único
reprovou: arquivo novo falando com a IA por fora de `lib/ai/`. **A saída não foi
acrescentar uma exceção** — foi pôr o código onde ele devia estar, ao lado de
`visao.ts`. A lista congelada de dívida encolheu em um item.

### O que continua aberto (e é caro)

Ordem do CEO no meio do bloco: *"o upload precisa ser capaz de ler qualquer coisa
na íntegra."* Hoje o PDF entrega texto e visual, e **nenhum byte de imagem**. Não
tratei como pronto: `DeclaracaoDeLeitura` declara, por formato, o que entrou e o
que ficou de fora, e isso chega à tela. Arquivo aberto pela metade não é dado por
lido.

---

## 2026-09-27 · W3 — Pacote da marca, Modo de aprovação e Aprovação do CEO

**Ficha:** `.despacho/W3-telas.md`. Território: componentes novos em
`components/agency/clients/*`, `components/agency/planner/*`, um ponto cirúrgico
em `components/portal/AprovacoesDoCliente.tsx` e `app/portal/access/[token]/page.tsx`
(campo opcional). A plataforma escrevia `app/api/agency/clients/[id]/pacote`,
`.../modo-aprovacao` e `app/api/social-posts/aprovacao-ceo` **ao mesmo tempo** —
só li esses arquivos (contrato), não toquei em nenhum.

### O que entrou

1. **`PacoteDaMarca.tsx` e `ModoDeAprovacao.tsx`** (novos, em
   `components/agency/clients/`) — montados dentro da aba Social Media, sempre
   visíveis (`.ccNativo`, junto de `RedesDoCliente`), porque a decisão que eles
   guardam ("o que se produz" e "quem aprova") não é de um submódulo, é da marca
   inteira. Segui o padrão nativo já estabelecido por `RedesDoCliente`/`BrandHub`
   (Tailwind + tokens, não a folha de referência do workspace).
2. **`AprovarSemanaCeoModal.tsx`** (novo, no Planner) — a mesma decisão que, numa
   marca em Semanal, seria do cliente. Reusa o contrato de `modo-aprovacao` para
   um aviso adiantado ("esta marca não está em APROVACAO_CEO") — o servidor
   continua sendo quem decide de verdade (409).
3. **O aviso antes de "Aprovar tudo"** no portal — `AvisoDeModoDoCliente`, dentro
   de `AprovacoesDoCliente.tsx`, dois lugares: o atalho (`DecisaoEmMassa`) e a
   confirmação de fato (`ConfirmacaoEmMassa`, o clique que não tem volta).
4. **`GerarCalendarioModal`**: "Posts por semana" saiu do formulário (o pacote
   manda agora), entrou o link para o pacote e o tratamento das duas novas
   formas de recusa/aviso (`preciso do pacote da marca`, `pendentes`).
5. **`STATUS_ORDEM_EDITAVEL`** — o Composer parou de oferecer
   `publishing`/`publish_unknown` no dropdown manual (a API já recusava; a tela
   é quem faltava consertar).

### O achado que não estava no despacho: pilares são OBRIGATÓRIOS

Escrevi o formulário do pacote com `pilares: []` como estado válido e "opcional"
na tela. Só ao ler `PacoteDaMarcaSchema` (a origem, escrita em paralelo) descobri
que o contrato exige `.min(1)` — pacote sem nenhum pilar é 400. Um formulário que
deixa salvar vazio e estoura no servidor é pior que um que nunca deixou: o
operador perde o trabalho de preencher tudo o resto. Corrigido antes de entregar:
padrão nasce com um pilar (`"Geral"`), `validarDraft` espelha a mesma régua do
schema (incluindo `postsPorSemana ≤ postsPorDia × dias`) para o erro aparecer
**antes** do round-trip, e a UI para de chamar isso de "opcional".

### O alvo de toque, revisado depois de escrito

A primeira versão copiou a densidade de `BrandHub`/`RedesDoCliente` (botões de
28–36px) sem checar contra o item 6 da própria ficha ("alvo de toque ≥44px no
celular"). Segunda passada: todo controle principal (Editar, Definir pacote,
Salvar, Cancelar, os 7 toggles de dia, os campos de pilar) virou `h-11 sm:h-{7,8,9}`
— 44px no celular, densidade de volta a partir de `sm`. Ficou um alvo abaixo de
44px, **de propósito e documentado no código**: o "×" de remover um horário
dentro do chip compacto — aumentá-lo até 44px trocaria densidade por espaço
vazio numa lista que pode ter vários horários; o botão que decide de verdade
(Salvar) continua ≥44px. Mesma passada corrigiu `text-[10px]`/`text-[11px]`
copiados de `RedesDoCliente` para o piso de 12px da §3 — copiar um vizinho não
copia a licença dele para violar o próprio DESIGN.md.

### O que ficou aberto — e é do PM, não meu

1. **Screenshots não tirados.** A ficha manda o PM rodar
   `node scripts/shot.mjs` — não rodei `node` nem `npm`. Rotas: `/agency/clients/<id>?tab=social`
   (Pacote da marca / Modo de aprovação, precisa master + cliente semeado),
   `/agency/planner` (botão "Aprovar semana (CEO)", precisa `currentRole=master`
   no seletor da sidebar), `/portal/access/<token>` aba Aprovações (o aviso só
   aparece quando a rota `/api/portal/esteira` devolver `modoAprovacao`/`prazo`
   — ver item 2).
2. **`/api/portal/esteira` ainda não devolve `modoAprovacao`/`prazo`.** Escrevi
   o componente para recebê-los opcionais e ficar mudo sem eles (nunca um aviso
   genérico inventado) — mas o aviso não aparece a ninguém até a rota devolver.
   Campo que falta, exato: `esteira.modoAprovacao` (string) e `esteira.prazo`
   (string, já formatado — ex. "sexta-feira, 18h"), no corpo de
   `GET /api/portal/esteira`.
3. **A checagem "esta marca está em APROVACAO_CEO?" no modal do CEO é palpite
   adiantado**, não trava — ela chama `/modo-aprovacao` client-side e, se a
   rede falhar, deixa passar (quem trava de verdade é o 409 do POST). Está
   documentado no código; não é a mesma garantia de um `fail-closed` no
   servidor, e não precisa ser — o servidor já é.
4. **`tsc`/`vitest`/`lint` não rodados por mim** (ficha: "Você ESCREVE; o PM
   roda"). Uma coisa que sei que quebraria sem conserto e já consertei: o teste
   `__tests__/agency/workspace-do-cliente/casco-e-navegacao.test.tsx` constrói
   `BLOCOS` à mão — adicionei `pacoteDaMarca`/`modoDeAprovacao: null` nele,
   senão o tipo novo de `BlocosDaCasa` reprovaria o `tsc` na hora.

---

## 2026-09-27 · W6 — acertos das telas do W3, vindos de screenshot do PM (375px) + laudo da `experiencia`

Ficha: `.despacho/W6-acertos-tela.md`. Território: os 4 arquivos abaixo, sem
tocar `lib/` nem `app/api/`, sem rodar `npm`/`npx`/`git` (mesma régua do W3).

1. **Jargão no estado vazio — `PacoteDaMarca.tsx:49-54, 235`.** `lerPacote`
   devolve o motivo técnico "…ainda não tem pacote definido (postsPorDia,
   formatos, dias, horários, pilares)" para a recusa PADRÃO (marca que nunca
   teve pacote). A tela repetia esse vocabulário de rota para o CEO. Agora só
   mostra o `motivo` cru quando ele **não** é essa recusa padrão (ex.: JSON
   corrompido/gravado inválido — aí o detalhe ainda ajuda). Constante
   `MOTIVO_AUSENCIA_PADRAO` faz o filtro por substring, sem tocar `lib/`.

2. **Contraste do botão desabilitado — `ModoDeAprovacao.tsx:184` e
   `PacoteDaMarca.tsx:484`.** As duas telas desabilitavam o botão primário
   (`bg-[var(--navy)] text-white`) com `disabled:opacity-40`/`disabled:opacity-50`.
   Opacidade aplicada ao elemento inteiro esmaece bg **e** texto pelo mesmo
   fator antes de compor com o fundo branco por trás — o resultado medido é
   texto quase branco sobre um azul-acinzentado claro, **~2.3–2.7:1**, abaixo do
   piso AA de 4.5:1 da §2.2. Troquei a dimerização por opacidade por um estado
   desabilitado **sólido**: `disabled:bg-[var(--border)]
   disabled:text-[var(--text-muted)]` — mesmo par que a §2.2 já documenta como
   AA (~5.3:1), only muda de cor, nunca de opacidade.
   - **Não reproduzi** o contraste relatado no botão "Definir pacote" e nos
     toggles de dia selecionados (`PacoteDaMarca.tsx:241, 281, 373`): o código
     já usa exatamente o par `bg-[var(--navy)] text-white` do variant `primary`
     de `components/agency/ui/Button.tsx` (a mesma referência que o "+ Novo
     post" do Planner usa via `--primary`/`--primary-foreground`), sem opacidade
     nem override. Não achei nenhum outro caminho de código que produzisse o
     efeito descrito. Registro como não verificado, não como corrigido —
     precisa do screenshot real (`node scripts/shot.mjs`) para confirmar se
     ainda existe.

3. **Recusa sem link — `AprovarSemanaCeoModal.tsx:287-299`.** "Troque o modo na
   página da marca, se for o caso" virou link de fato:
   `Abrir modo de aprovação da marca →` → `/agency/clients/${clientId}?tab=social`,
   no mesmo estilo botão-de-aviso (`bg-[var(--warning)]`, texto branco, `h-8`)
   que `GerarCalendarioModal.tsx:264-271` já usava para a recusa irmã (pacote).

4. **Falha de leitura disfarçada de sucesso — `AprovarSemanaCeoModal.tsx`.**
   `EstadoDoModo.fase` já tinha `"erro"` no tipo, mas o `fetch` nunca o usava —
   `!r.ok` e `catch` caíam em `"nenhum"`, o mesmo estado de "cliente ainda não
   escolhido", e a tela renderizava a contagem de peças como se o modo tivesse
   sido confirmado. Agora falha de rede/500 seta `fase: "erro"` e a tela mostra
   um terceiro texto, nem sucesso nem aviso de fora-do-modo: "Não consegui
   confirmar o modo desta marca agora — a aprovação ainda vai conferir na hora
   de gravar." Não bloqueia o botão "Revisar e aprovar" — quem trava de
   verdade continua sendo o 409 do POST (comentário já existente no arquivo).

5. **Subtítulo falso — `GerarCalendarioModal.tsx:111`.** Dizia "a equipe revisa
   e o cliente aprova pelo portal", mas a peça real (decidida em 27/09/2026)
   sai em rascunho de texto no mês inteiro, ganha arte/legenda final toda
   quinta para a semana seguinte, e quem aprova depende do modo da marca (CEO,
   piloto automático, cliente semanal ou mensal) — nunca sempre "o cliente".
   Texto novo: "Sai o mês em texto (tema, formato, pilar e rascunho de
   legenda). A arte e a legenda final saem toda quinta, para a semana
   seguinte. Quem aprova depende do modo da marca."

**Auto-revisão (0–10):** hierarquia 8 · tipografia 9 (nenhum tamanho novo fora
da escala) · espaçamento 9 (reaproveitei os containers existentes, sem novo
padding) · consistência 9 (o link de recusa agora espelha o padrão do modal
irmão; o disabled sólido é o mesmo par de tokens que a §2.2 já calibrou).

**Screenshots: não tirados** (ficha proíbe `npm`/`npx`/`git` nesta rodada,
mesma régua do W3) — é o motivo do achado 2 (Definir pacote/toggles) ter ficado
"não verificado" em vez de "corrigido". PM roda `node scripts/shot.mjs
/agency/clients/<id>?tab=social pacote-modo-w6` para fechar a dúvida.

---

## 2026-09-27 · W13 — o formulário do Pacote da Marca ganha os campos novos

Ficha: `.despacho/W13-form-pacote.md`. Território: só
`components/agency/clients/PacoteDaMarca.tsx` — sem tocar `lib/`, `app/api/`,
sem rodar `npm`/`npx`/`git`/`node` (mesma régua do W3/W6; tentei subir o
`next dev` de duas formas diferentes para tirar os três screenshots e as duas
foram recusadas com "This command requires approval" — a régua do subagente
vale de verdade, não só em prosa).

### O que entrou

O componente não tinha **nenhum** dos seis blocos novos do schema
(`lib/agency/esteira/pacote-da-marca.ts`, lido como fonte — não importado).
Todos entraram como seção **recolhível** (`SecaoRecolhivel`, `:1411`), a saída
para não empilhar seis blocos novos como um paredão no celular — a régua da
própria ficha. Um único mapa `abertas` (`:275`) é compartilhado entre leitura
e edição: abrir "Cardápio" na leitura mantém aberto ao clicar "Editar".

1. **Stories** (`:360-389` os handlers · `:914-1015` a UI de edição) — nota
   fixa na seção: *"Promoção, queda de preço e combo promocional só em
   stories. O feed é vitrine da marca."* Atrás de "+ Configurar stories"
   (objeto inteiro, não afeta pacotes sem stories); `porDiaMin/Max`,
   `aPartirDe`, intervalo, combos mín./dia, mistura (combo/reciclado/terceiro
   autorizado) e derivados (capa do post do dia/reel do acervo) como
   checkboxes.
2. **Cardápio** (`:391-403` · `:1020-1075`) — nota: *"O preço do combo vem
   daqui — nunca é inventado. Sem combo cadastrado, o story de combo não
   sai."* Lista simples (nome/preço/descrição), sem gate de "configurar"
   porque é só uma lista que nasce vazia.
3. **Fontes de prova** (`:405-417` · `:1077-1131`) — nota: *"Número em post só
   com fonte cadastrada aqui."* Mesma forma de lista (afirmação/fonte/data).
4. **Carrossel "de sempre"** (`:419-458` · `:1149-1240`) — cards mín./máx.,
   carrosséis por dia (opcional), sequência de intenção (checkboxes na mesma
   lista fechada do schema, espelhada em `SequenciaDoCard`), CTA e o toggle
   "usar o horário do DNA da marca" vs. horário próprio.
5. **Séries** (`:1242-1271`) — **só leitura nesta versão**, como a ficha
   mandou: mostra nome, dias, cards min/máx, "Exige fonte" e horário; nenhum
   controle de adicionar/editar/remover. Nota explica que a edição completa
   fica para depois.
6. **Colaboradores** (`:442-461` · `:1273-1317`) — **sempre visível**, nunca
   atrás de um "+ Configurar" (a seção existe para comunicar o estado
   "desligado", não para escondê-lo). Checkbox "Ativo" **sempre desabilitado e
   sempre falso**, sem nenhum caminho de código para ligá-lo por aqui — nota:
   *"Liga no 1C, depois do parecer da Meta."* A lista de contas (máx. 3) é
   editável, porque cadastrar quem *pode* colaborar não é a mesma decisão que
   ligar a função.

`validarDraft` (`:225-262`) ganhou a régua espelhada dos seis blocos —
`porDiaMax ≥ porDiaMin`, mistura não-vazia, preço no formato `R$ 59,90`
(`PRECO_REGEX`, `:214`), nome/fonte obrigatórios em cardápio/fontes,
`cardsMax ≥ cardsMin`, sequência não-vazia, máx. 3 colaboradores — mesma razão
de sempre: o erro aparece antes do round-trip, o servidor continua sendo quem
decide de verdade.

### O achado que não estava na ficha: 11px por toda parte

Escrevi os sub-rótulos ("Mistura", "Derivados", "Sequência de intenção") e os
badges (contagem, "Exige fonte", "Desligado") em 11px — copiando o hábito
visual de badge pequeno de outras telas, sem checar contra a §3 do
`DESIGN.md` ("mínimo de 12px para qualquer texto legível"). Segunda passada:
todo `text-[11px]` do arquivo virou `text-[12px]` (10 ocorrências) — inclusive
o glifo decorativo do chevron da seção, por consistência, embora ele seja
`aria-hidden`.

### O alvo de toque

Os novos botões ("+ Configurar stories", "+ Combo", "+ Fonte", "+ Conta") e o
cabeçalho de cada `SecaoRecolhivel` seguem o mesmo `h-11 sm:h-{7,8,9}` /
`min-h-[44px]` já estabelecido no W3. Os únicos alvos abaixo de 44px são os
"×" de remover item de lista dentro de uma seção aberta (combo, fonte, conta,
mistura/derivados são checkbox, não têm "×") — mesma concessão **já
documentada no arquivo** para o chip de horário, não uma exceção nova.

### O que ficou aberto — e é do PM, não meu

1. **Screenshots não tirados.** Tentei `npm run dev` e `node
   node_modules/.bin/next dev` — as duas recusadas com "This command requires
   approval", com e sem tentativa de rodar em background. PM roda `node
   scripts/shot.mjs /agency/clients/<id>?tab=social pacote-w13` nos três
   estados relevantes: vazio (cliente sem pacote), leitura com as seis seções
   fechadas e abertas, e edição com "Stories"/"Carrossel" configurados. Sem
   isso a nota de 0–10 abaixo é autoavaliação de código, não de tela
   renderizada — reportando como tal, não como "verificado".
2. **`tsc`/`vitest`/`lint` não rodados por mim** (mesma régua: "Você ESCREVE;
   o PM roda"). Conferi o arquivo à mão (chaves e parênteses balanceados,
   narrowing de `draft.stories`/`draft.carrossel` dentro do próprio ramo
   truthy do ternário) mas isso não substitui o portão de verdade. Pontos que
   merecem atenção do `tsc`: os genéricos `atualizarStories<K>`/
   `atualizarCarrossel<K>` (indexação por `keyof`) e o padrão
   `const { x: _x, ...resto } = d; return resto;` (já usado em
   `app/api/meta/publish/route.ts` e em testes da casa, então deve passar,
   mas é o tipo de coisa que só o portão confirma).
3. **Nenhum cliente semeado tem pacote com os seis blocos preenchidos** — não
   há como screenshotar o estado "cheio" sem o PM (ou o `master`, na tela)
   configurar um pacote de teste primeiro, ou eu mesmo rodar o seed — que
   também está fora do meu alcance nesta rodada.
4. **`porDia` do carrossel** existe no schema e no schema mirror do
   componente, mas não tinha campo próprio na primeira versão do formulário —
   corrigido antes de fechar (fica em "Carrosséis por dia (opcional)"), mas
   registro porque é o tipo de campo que some fácil quando a ficha lista seis
   blocos de uma vez.

**Auto-revisão (0–10), a partir da leitura do código — não de screenshot,
ver item 1 acima:** hierarquia 8 (seis seções novas entram recolhidas por
padrão, então a tela não cresce para quem não mexe nelas; dentro de cada
seção o padrão é o mesmo do resto do formulário — rótulo em cima, campo
embaixo) · tipografia 8 (piso de 12px respeitado depois da correção; segue a
mesma escala do resto do arquivo, sem tamanho novo) · espaçamento 8 (reusa
`space-y-*`/`gap-*` em múltiplos de 4 já em uso no arquivo, nenhum padding
novo inventado) · consistência 8 (mesmos tokens, mesmo padrão de chip/badge,
mesma concessão documentada de alvo <44px no "×"). Nenhuma nota abaixo de 8,
mas as quatro ficam **condicionadas ao screenshot real** — código limpo e
tela limpa nem sempre coincidem (foi exatamente o caso do achado do 11px:
só apareceu relendo o arquivo inteiro, não olhando cada seção isolada).

### Proposta de vitrine

**"Seções recolhíveis com estado de abertura compartilhado entre leitura e
edição"** — o padrão veio para caber os seis blocos novos do Pacote da Marca,
mas serve qualquer formulário que ganha campos opcionais aditivos ao longo do
tempo sem poder crescer para sempre no celular: um único mapa
`Record<string, boolean>` chaveado pelo nome do bloco, não pelo modo
(leitura/edição), para o usuário não perder o lugar onde estava ao trocar de
modo. Candidato a `docs/agents/interface/vitrine.md` — quem promove é o PM.
