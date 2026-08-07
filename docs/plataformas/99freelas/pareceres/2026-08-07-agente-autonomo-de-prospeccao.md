# Parecer-trava do 99Freelas — agente autônomo de prospecção

**Data:** 07/08/2026 · **Solicitante:** PM da frente 99Freelas (pedido do CEO)
**Fonte do pedido:** `docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md`
**Ação avaliada:** um agente autônomo que loga na conta da agência no 99Freelas
por navegador real (Playwright + Computer Use), varre projetos, qualifica,
precifica, escreve e **envia proposta** — 10 por dia, sem revisão humana.

Não existia especialista-trava de 99Freelas nesta casa e não existia biblioteca
em `docs/plataformas/99freelas/`. Este parecer e as 15 fontes em `fontes/`
nascem juntos, pela regra da trava de plataforma de 03/08/2026.

---

## Veredito

> ## 🟠 PODE COM AJUSTE
>
> **Os Termos de Uso do 99Freelas não proíbem automação, robô, script ou
> navegador automatizado — o texto inteiro foi lido e capturado, e a palavra não
> está lá.** O que a plataforma proíbe é **conduta**: spam, contato fora da
> plataforma, link externo, pagamento por fora, referência à comissão. Um agente
> que respeita a conduta não viola nenhuma cláusula que exista hoje.
>
> **O ajuste que muda o projeto não é jurídico, é de cota:** o 99Freelas cobra
> cada proposta em "conexões", e a cota é **mensal**. Gratuito = **10 por MÊS**.
> Premium = 240 por mês. **"10 propostas por dia" é 300 por mês** — acima do
> teto do plano mais caro. Na conta gratuita, o robô gastaria a cota do mês
> inteiro no primeiro dia e ficaria 29 dias mudo.

### Resumo por pergunta (cada uma com fonte)

| Pergunta | Resposta | Fonte |
|---|---|---|
| Automação de navegador / bot é proibida? | **NÃO** há proibição escrita. Não há a palavra "automação", "robô", "bot", "script" ou "crawler" nos Termos nem na Central de Ajuda. | `fontes/termos-de-uso.md`; `fontes/medicao-tecnica-2026-08-07.md` §5 |
| Login automatizado é proibido? | **NÃO** há proibição escrita. Mas há **reCAPTCHA e Cloudflare Turnstile** na tela de login — desafio que não se resolve por robô e que a especificação do CEO já manda respeitar (§5). | `fontes/medicao-tecnica-2026-08-07.md` §3 |
| Envio automatizado de proposta é proibido? | **NÃO** por ser automatizado. **SIM** se o conteúdo violar as regras de proposta, e **SIM na prática** se virar volume repetitivo — "propagação de spams" é sancionável com banimento. | `fontes/termos-de-uso.md` (Regras para Freelancers; Sanções) |
| Existe API oficial ou caminho autorizado? | **NÃO.** Nenhum host de API/desenvolvedor resolve no DNS; a Central de Ajuda tem 0 resultado para "API". **Navegador é o único caminho que existe.** | `fontes/medicao-tecnica-2026-08-07.md` §1 |
| Penalidade prevista? | Três degraus, nesta ordem: **Violação** (ícone de alerta no perfil + propostas rebaixadas para o fim da fila, 30 dias corridos) → **Penalização** (bloqueio de enviar proposta, prazo definido pela plataforma) → **Banimento** (permanente, **e alcança outras contas do mesmo usuário**). Saldo já ganho é preservado: mesmo banido, o freelancer recebe pelo projeto executado. | `fontes/termos-de-uso.md` (Sanções); `fontes/ajuda-violacao-freelancer.md` |
| Detecção (rate limit, fingerprint, CAPTCHA)? | **CAPTCHA: confirmado** (reCAPTCHA + Turnstile no login). **Cloudflare na frente do site: confirmado.** **Rate limit e fingerprint: NÃO CONFIRMADO** — não há documento público e não fizemos login. | `fontes/medicao-tecnica-2026-08-07.md` §3 e §5 |

---

## 1. O que os Termos dizem, literalmente

O texto integral está em `fontes/termos-de-uso.md`
(https://www.99freelas.com.br/termos, capturado em 07/08/2026). As **Regras
para Freelancers** são estas nove, na íntegra:

- Não se pode adicionar dados de contato e/ou links ao seu perfil ou portfólio.
- Não se pode solicitar ou compartilhar dados de contato ao enviar proposta,
  pergunta ou no chat de projeto.
- Não se pode solicitar ou aceitar pagamentos por fora da plataforma.
- **Não se pode fazer referência à comissão da 99Freelas.**
- Não se pode enviar conteúdo ofensivo a outro usuário.
- Deve-se cumprir com o trabalho acordado.
- Deve-se cumprir com o prazo acordado.
- Não se pode cometer plágio.
- Não se pode solicitar pagamento comissionado.

**Nenhuma delas menciona automação.** E a lista de Sanções abre assim:

> "A quebra das regras citadas acima, **propagação de spams**, prática de
> fraudes, criação de projetos falsos, atividades ilegais e quaisquer outras
> práticas que descumpram os termos e regras de utilização, estarão sujeitos às
> seguintes penalidades…"

**Esta é a cláusula que nos alcança.** Não pela via "robô", e sim pela via
"spam" e pela via aberta "quaisquer outras práticas". É exatamente o formato do
incidente da Meta em 03/08: não havia regra dizendo "não use API rápido demais"
— havia uma regra de conduta, e a operação em ritmo de máquina caiu nela.

> ### A diferença que importa em relação ao CapCut
>
> No parecer do CapCut (07/08) o veredito foi NÃO PODE porque os Termos
> proibiam **literalmente** "use automated scripts … to otherwise interact with
> the Services". **O 99Freelas não tem essa frase.** A ausência é fato
> verificado no texto capturado, não suposição. Mas ausência de proibição
> explícita **não é permissão explícita**: não existe documento do 99Freelas
> autorizando automação. Estamos no silêncio do contrato, e no silêncio quem
> decide é a moderação da plataforma, caso a caso, olhando conduta.

## 2. O ajuste que redefine o projeto: CONEXÕES

Este é o achado que o CEO precisa ver antes de qualquer código.

Cada proposta **ou pergunta** enviada a um projeto consome "conexões", e a cota
é **mensal, não diária** (`fontes/ajuda-o-que-sao-conexoes.md`,
`fontes/ajuda-minhas-conexoes.md`):

| Plano | Conexões/mês | Equivalente por dia |
|---|---|---|
| Gratuito | **10** | 0,33 |
| Pro | 120 | 4 |
| Premium | 240 | 8 |

Medalhas somam: Talent +30, Top Freelancer +60, Top Freelancer Plus +120 por
mês — e medalhas se **conquistam** com histórico, não se compram no dia 1.

Quatro consequências duras:

1. **10 propostas/dia = 300/mês.** Só é alcançável com Premium (240) **mais**
   a medalha máxima (+120 = 360), que uma conta nova não tem. **Com o plano
   gratuito, o ritmo pedido esgota o mês inteiro no primeiro dia.**
2. **Um projeto pode custar MAIS de uma conexão.** "Essa quantidade será
   calculada com base no quão disputado costuma ser aquele tipo de projeto" —
   e projetos de marketing/design são os disputados. O teto real é **menor** que
   os números da tabela.
3. **Pergunta ao cliente também gasta conexão.** O "tirar dúvida antes de
   propor" da especificação não é grátis (`fontes/ajuda-tirando-duvida-com-o-cliente.md`).
4. **Conexão gasta não volta.** "Após utilizar uma conexão, não é mais possível
   reavê-la." Proposta enviada por engano é dinheiro queimado, não só ruído.
   É o argumento mais forte a favor do `DRY_RUN` e da idempotência do §27.

**E mais:** no plano gratuito o freelancer **só pode propor depois de 24 h** da
publicação do projeto — as primeiras 24 h são exclusivas de assinantes
(`fontes/ajuda-como-enviar-propostas.md`,
`fontes/ajuda-plano-gratuito-nao-consigo-enviar-proposta.md`). O scanner de 15
em 15 minutos, na conta gratuita, encontra projetos que ele ainda não pode
responder. Ou o CEO assina Pro/Premium, ou o scanner precisa mirar a janela
de 24 h+.

## 3. Piso de preço: a plataforma também tem o dela

A especificação manda o preço sair da tabela da casa (§13/§14) — correto. Mas o
99Freelas impõe um piso **por categoria**, e a proposta é recusada abaixo dele
(`fontes/ajuda-valor-minimo.md`):

| Categoria | Mínimo |
|---|---|
| Administração & Contabilidade | R$ 50 |
| Advogados & Leis | R$ 100 |
| Atendimento ao Consumidor | R$ 100 |
| Design & Criação | R$ 50 |
| Educação & Consultoria | R$ 50 |
| Engenharia & Arquitetura | R$ 70 |
| Escrita | R$ 30 |
| Fotografia & AudioVisual | R$ 50 |
| Suporte Administrativo | R$ 30 |
| Tradução | R$ 40 |
| Vendas & Marketing | R$ 60 |
| Web, Mobile & Software | R$ 50 |

Não há valor máximo. Na prática o piso da casa (muito maior) manda sempre — mas
o Pricing Engine tem de aplicar **`max(piso da casa, piso da categoria)`** e
nunca o contrário.

**A taxa é nossa, não do cliente.** "Nós adicionamos uma taxa de 10% a 20%
(R$ 5,00 no mínimo) na sua oferta" — a oferta digitada é o que a agência
**recebe**; o cliente vê a oferta final, já com a taxa. Precificar sem embutir
isso corrói de 10% a 20% da margem, silenciosamente, em toda proposta.

## 4. Compliance — o que a especificação já previu e o que FALTOU

A §16/§17 da especificação acerta o essencial (nada de link, telefone,
WhatsApp, e-mail, Instagram). Os Termos confirmam, e acrescentam **quatro
regras que a especificação não tem**:

1. **Não fazer referência à comissão da 99Freelas.** Regra explícita, e é fácil
   de violar sem querer: "esse valor já considera a taxa da plataforma" é
   violação. **Precisa entrar no validador.**
2. **Não solicitar pagamento comissionado** (nem aceitar projeto comissionado —
   estes, aliás, nem deveriam ser aprovados pela plataforma).
3. **Nada de dados de contato no PERFIL e no PORTFÓLIO**, não só na proposta.
   O CEO diz que o perfil já está montado — **alguém precisa conferir o perfil**
   antes de o robô começar a chamar atenção para ele.
4. **A proibição de contato vale até a garantia de pagamento**, e o chat é onde
   a disputa é julgada: "comunicações e acordos … realizados preferencialmente
   no chat da plataforma" (`fontes/ajuda-usando-o-chat-freelancer.md`,
   `fontes/termos-de-uso.md`, Disputa). Combinar por fora não é só proibido —
   é perder a disputa.

**Risco de dinheiro que a especificação não trata:** a sanção de Violação (30
dias, propostas rebaixadas) é aplicada por **não cumprir escopo, não cumprir
prazo ou não responder o cliente a tempo**. Um agente que envia 10 propostas por
dia e **não responde** as respostas (o `AUTO_REPLY = false` do §23) constrói
exatamente esse cenário. **Follow-up não é fase 11 — é condição de não tomar
punição.**

### 4.1 A emenda do CEO de 07/08/2026 — conferida na fonte, não aceita de palavra

O CEO escreveu, no mesmo dia, corrigindo o desenho antigo:

> "**NÃO mandar o link da página de briefing da agência pelo 99Freelas.** O
> regulamento atual proíbe links externos e dados de contato em proposta,
> pergunta e chat, e prevê penalidade por spam. O agente converte o cliente
> DENTRO da plataforma."

**Procedência: afirmado pelo CEO em 07/08/2026.** E **confere com o texto
oficial**, ponto a ponto — palavra do CEO é boa procedência, mas é este texto
que decide o parecer:

| O que o CEO afirmou | O que os Termos dizem |
|---|---|
| proíbe link externo em proposta, pergunta e chat | *"Não se pode solicitar ou compartilhar dados de contato ao enviar proposta, pergunta ou no chat de projeto"* + *"Não se pode adicionar dados de contato e/ou links ao seu perfil ou portfólio"* |
| proíbe dados de contato | idem acima; e o chat reforça: *"Não é permitido compartilhar ou solicitar informações de contato antes que o cliente faça a garantia do seu pagamento"* (`fontes/ajuda-usando-o-chat-freelancer.md`) |
| prevê penalidade por spam | *"A quebra das regras citadas acima, **propagação de spams**, prática de fraudes … estarão sujeitos às seguintes penalidades"* (Violação / Penalização / Banimento) |

**Confirmado nos três pontos.** A regra do link entra no Compliance Validator
como trava bloqueante, não como aviso — inclusive contra o link do próprio
briefing inteligente da casa, que é o caso que o CEO nomeou.

**A pergunta que ele acrescentou — "e sobre automação e robô?" — está
respondida no §1: o regulamento NÃO fala nisso.** Nem para permitir, nem para
proibir. É o silêncio do contrato, e é por isso que este parecer é 🟠 e não 🟢.

## 5. As condições do PODE — cada uma vira requisito, não rodapé

| # | Condição | Vira |
|---|---|---|
| C1 | Nunca resolver ou contornar CAPTCHA, Turnstile, 2FA ou qualquer anti-bot. Desafio ⇒ para e escala (`HUMAN_AUTH_REQUIRED`). | Já é §5 da especificação. Vira trava, não instrução de prompt. |
| C2 | Login humano, sessão reaproveitada. Credencial nunca em prompt. | §5 da especificação. |
| C3 | **Teto diário derivado da COTA REAL da conta**, lida na plataforma — não um número fixo no `.env`. Cota esgotada ⇒ para. | Requisito novo. Sem isto o robô queima o mês em um dia. |
| C4 | Uma proposta por projeto, para sempre. `UNIQUE(platform, platform_project_id)`. | §27 da especificação. Aqui vale **dinheiro**, não só etiqueta. |
| C5 | Proposta demonstravelmente individual. Texto repetido entre projetos = spam = sanção. | §15/§20 da especificação. **Precisa de gate executável de similaridade**, que a especificação não pede. |
| C6 | Validador de compliance bloqueante, com as 4 regras da §4 acima somadas às da §17. | Requisito ampliado. |
| C7 | Ritmo humano: intervalo mínimo entre ações, sem paralelismo na mesma conta (`99freelas_browser_lock`). | §35 da especificação. |
| C8 | Respeitar o piso de categoria da plataforma e embutir a taxa de 10–20%. | Requisito novo. |
| C9 | Responder o cliente dentro do prazo, ou não enviar proposta nenhuma. | Requisito novo — é o que evita a sanção de Violação. |
| C10 | Nascer em SOMBRA (`DRY_RUN=true`), com envio destravado por evidência. | §40 da especificação + escada da casa. |

## 6. O que NÃO PODE, mesmo aqui

- Resolver CAPTCHA/Turnstile por serviço de terceiro ou por modelo. É contornar
  mecanismo de segurança, e cai em "fraude" na lista de Sanções.
- Criar segunda conta, por qualquer motivo. O banimento **alcança outras contas
  do mesmo usuário** — abrir outra é o gesto que transforma suspensão em
  banimento definitivo.
- Enviar proposta a projeto acadêmico, de teste não remunerado, comissionado ou
  vaga de emprego. São reprovados pela própria plataforma
  (`fontes/ajuda-projetos-nao-permitidos.md`) — propor neles é queimar conexão
  e chamar atenção da moderação.
- Qualquer link, contato ou menção à comissão no texto da proposta, na pergunta
  ou no chat.
- Ler/raspar `/termos/`, `/privacidade/`, `/faq/` e `/freelancer-premium/` em
  ritmo de robô: o `robots.txt` os proíbe. (A biblioteca acima foi capturada uma
  vez, à mão; `/termos` sem barra final não é o padrão bloqueado, mas **não
  vamos recapturar em rotina diária** — fica fora do
  `scripts/biblioteca/capturar.mjs` automático.)

## 6.1 O que o parecer implica para o desenho HÍBRIDO (emenda §37 do CEO)

O CEO fixou a arquitetura híbrida — Playwright determinístico onde é previsível,
Computer Use onde é imprevisível. Do ponto de vista de **trava de plataforma**,
os dois caminhos **não têm o mesmo risco**, e isso decide o padrão:

- **Determinístico é o padrão, e não só por custo.** Cada ação por seletor é uma
  ação: previsível, contável, com ritmo controlável. Computer Use trabalha em
  ciclos de screenshot→ação e **multiplica o número de interações** com a
  plataforma para o mesmo resultado — é o que se parece com ritmo de máquina.
- **Computer Use é a exceção declarada**, para tela nova, layout mudado ou
  recuperação de fluxo. Toda ação precisa registrar por qual caminho foi e por
  quê (§28 da especificação, campo de auditoria).
- **Screenshot de página do 99Freelas é entrada NÃO CONFIÁVEL, igual ao texto**
  (§31). O briefing do cliente aparece dentro do pixel que o modelo lê: injeção
  de prompt por imagem é o mesmo ataque com outra roupa. **O Computer Use não
  pode ter acesso à ferramenta de submissão** — quem clica "enviar" é o código,
  depois do compliance, nunca o modelo olhando a tela.
- **O caminho do envio é determinístico, sempre.** Preço, prazo e texto entram
  por seletor conhecido, conferidos no DOM antes do submit (§18). Deixar o
  modelo digitar valor em campo que ele localizou visualmente é como o preço sai
  errado sem ninguém ver.

## 6.2 🔴 A SEGUNDA ESPECIFICAÇÃO DO CEO REBAIXA ESTE VEREDITO NA PRÁTICA

`docs/projetos/99freelas/01-ESPECIFICACAO-DO-CEO-marketplaces.md` chegou depois
que este parecer começou, e ela **decide sozinha o ponto que o contrato do
99Freelas deixou em silêncio**. O CEO escreveu, com as palavras dele:

> **§6 — REGRA FUNDAMENTAL.** "Não utilizar: Playwright, Selenium, Puppeteer,
> Computer Use, browser bots, scrapers, session cookies, RPA, auto refresh, DOM
> crawling **em plataformas que não autorizem expressamente esse tipo de
> acesso**. A existência do OpenAI Computer Use NÃO concede autorização para
> automatizar uma plataforma de terceiros. **Compliance da plataforma sempre
> prevalece sobre capacidade tecnológica.**"

> **§60 — FAIL CLOSED.** "Quando houver dúvida sobre autorização: DO NOT
> EXECUTE. Nunca: *'provavelmente pode'*."

> **§61.** "Se a plataforma não autorizar automação: **use HUMAN_GATE**."

**O 99Freelas não autoriza expressamente.** É o achado central deste parecer: o
regulamento não proíbe, mas também não autoriza — é silêncio. E silêncio, pela
régua que o próprio CEO acabou de fixar, **não é autorização**. "Provavelmente
pode" é exatamente o nome do que teríamos se marcássemos
`browser_automation_allowed: true`.

**A conclusão operacional, então, é esta — e ela não é minha, é a regra dele
aplicada ao fato que eu medi:**

| Operação | Decisão | Por quê |
|---|---|---|
| Descoberta e leitura de projetos | navegador próprio, **área pública**, ritmo humano | `/projects` **não** é `Disallow` no robots.txt e está no `sitemap.xml` com prioridade 0.80 — a plataforma **pede** que seja indexado. É o único ponto com sinal positivo do 99Freelas. |
| Qualificar, pontuar, precificar, escrever, priorizar, CRM | **ALLOW**, 100% automático | Não toca a plataforma. É o §51 inteiro: "o objetivo continua sendo automatizar … mesmo quando o clique final pertence ao usuário". |
| **Enviar proposta** | **HUMAN_GATE** | §60 + §61. Sem autorização expressa, o clique é humano. |
| Responder mensagem no chat | **HUMAN_GATE** | idem. |
| Resolver CAPTCHA, atraso que imita gente, rodízio de proxy, fingerprint, extrair cookie | **BLOCK** | §61, e a lista de Sanções ("fraude"). |

**Isto não mata o projeto — reposiciona o clique.** Tudo o que a especificação
`00` descreve continua sendo construído: o loop OBSERVE→REASON→ACT, o
`BrowserComputer`, os sete papéis, a proposta individual, o preço da tabela.
O que muda é que a última ação, hoje, é do CEO — e vira automática no dia em que
existir autorização expressa, **trocando uma linha de dado** no
`platform_policies`, não reescrevendo o sistema.

> **E há um efeito colateral que joga a favor:** com 10 conexões/mês no plano
> gratuito, o gargalo real nunca foi o clique — era a cota. Um humano clicando
> 10 vezes por mês não é gargalo de nada. **O HUMAN_GATE custa quase zero no
> cenário atual e compra a segurança inteira.**

## 6.3 A primeira linha do `platform_policies` (§46/§47 da especificação `01`)

Este parecer não é documento solto: é o dado. Gravado, em formato de máquina,
em **`docs/plataformas/99freelas/policy.json`** — e é dali que o Compliance Gate
lê, nunca de um prompt (§48: *"Nunca codificar policy diretamente no prompt"*).

## 7. Lacunas declaradas — o que este parecer NÃO sabe

- **Não fizemos login.** Nada do lado autenticado foi medido: nem rate limit,
  nem fingerprint, nem se há termo adicional aceito no cadastro. **Não confirmei.**
- **Não sei qual plano a conta do CEO tem.** Todo o cálculo de cota acima muda
  conforme a resposta. **Pergunta obrigatória antes de definir ritmo.**
- **Não sei quantas conexões cada categoria de projeto custa.** A plataforma diz
  que varia e não publica a tabela. Só se descobre operando.
- **Não há posição pública do 99Freelas sobre automação.** Se o CEO quiser certeza
  em vez de silêncio contratual, o caminho é uma pergunta escrita a
  `suporte@99freelas.com.br` — e a resposta vira fonte nesta biblioteca. É a
  única coisa que transforma este 🟠 num 🟢.
- **Não sei se o perfil da conta contém link ou contato** (proibido pelas Regras
  para Freelancers). Precisa de conferência humana antes de operar.

---

## Recomendação ao Diretor, em uma linha

**Construir, sim — mas o ritmo de "10 por dia" precisa voltar ao CEO antes de
virar código**, porque ele é maior que a cota mensal de qualquer plano que uma
conta nova possa ter, e cada proposta errada é conexão perdida sem estorno.
