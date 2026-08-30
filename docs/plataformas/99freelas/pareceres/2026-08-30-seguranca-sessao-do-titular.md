# Parecer — SEGURANÇA: operar a sessão autenticada do titular no 99Freelas

**Data:** 30/08/2026 · **Autor:** Essencial `seguranca` · **Solicitante:** PM da
Dioli Digital, a mando do Diretor, a mando do CEO.
**Sem rede nesta sessão — tudo lido em disco**
(`docs/plataformas/99freelas/pareceres/2026-08-30-operacao-da-sessao-autenticada.md`,
`fontes/medicao-tecnica-2026-08-30.md`, `policy.json`,
`fontes/termos-de-uso-2026-08-30.md`, `fontes/politica-de-privacidade-2026-08-30.md`,
`docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md`, `lib/marketplaces/portao.ts`).

---

> ## 🟠 PODE COM AJUSTE
>
> **Em uma frase:** a leitura de hoje via API do Zendesk **não** contornou
> proteção nenhuma e as 12 capturas ficam de pé; mas o modo de operação que a
> ficha descreve — "Claude in Chrome, sessão autenticada do titular" — **não
> tem hoje o único mecanismo que o torna seguro** (perfil de navegador
> isolado), e esse mecanismo **não existe em código, só em especificação**.
> Enquanto não existir, este parecer **bloqueia** qualquer operação de sessão
> autenticada — não por causa do 99Freelas, por causa do que mais mora no
> Chrome do titular.

---

## Pergunta 1 — a captura de hoje burlou proteção? (decisão minha, sem meio-termo)

**Veredito: NÃO CONTORNOU. Acesso legítimo a outra interface publicada.**

**O teste que apliquei:** "burlar" exige um controle técnico *derrotado* —
credencial falsificada, desafio resolvido, identidade forjada. Nenhum dos três
aconteceu:

- O desafio Cloudflare ficou de pé, intocado, na URL onde apareceu (HTML da
  Central de Ajuda). Ninguém tentou resolvê-lo, contorná-lo ou escondê-lo.
- O que foi usado é **outra porta, publicada pelo mesmo operador**
  (`99freelas.zendesk.com/api/v2/help_center/...`), **sem** desafio, **sem**
  autenticação, com o **mesmo** user-agent honesto que levou 403 na primeira.
  Isso não é uma porta secreta descoberta por engenharia reversa — é a API
  pública padrão do produto Zendesk, documentada pelo fornecedor, feita para
  ser consumida por terceiros.
- O `robots.txt` de `99freelas.zendesk.com` **autoriza explicitamente** esse
  prefixo (`fontes/medicao-tecnica-2026-08-30.md`, §5) — e `robots.txt` é
  exatamente o canal pelo qual um operador expressa "pode entrar aqui de
  forma automatizada". Não há silêncio aqui: há sinal positivo.
- O conteúdo em si é **não sensível e de leitura pública por natureza** —
  artigo de central de ajuda que qualquer freelancer lê sem login. Não há
  escalada de privilégio, não há dado de terceiro exposto, não há segredo.

**A ressalva que fica registrada, e que não muda o veredito:** o operador pode
não ter *pensado* nessa combinação específica (challenge no HTML, API aberta)
quando configurou a proteção. "Não pensou nisso" é diferente de "proibiu" — e
ausência de proibição, aqui, soma-se a um sinal *positivo* (`robots.txt`), não
a um silêncio isolado. É essa soma que separa este caso do caso geral
"silêncio não é autorização" que governa a pergunta 2. **As 12 capturas de
hoje ficam.** Nada a desfazer.

**Isto vale para o futuro como rotina da célula de prospecção? NÃO — não do
jeito que a pergunta propõe.**

- Vale como **captura ocasional de documentação de política** (o que foi feito
  hoje: reconfirmar Termos/Central de Ajuda), no mesmo ritmo humano de hoje
  (`sleep` entre requisições, 12 artigos, uma vez). A própria tabela
  `updated_at` devolvida pela API mostra que nenhum dos 12 artigos mudou desde
  07/08 — não há motivo para reler isso com frequência.
- **NÃO vale** como caminho padrão para `/projects`, para o chat, para
  qualquer superfície com dado de cliente, nem para contornar um desafio
  futuro em qualquer outra parte do site. O veredito de hoje é estreito por
  desenho: conteúdo público + interface documentada + robots.txt positivo. Um
  desafio em `/projects` (que tem dado de negócio real, não documentação
  genérica) **não** herda esta liberação — ver pergunta 2.
- **Recomendação de mecanismo, não de prosa:** a ação `contornarAntiBot` já é
  `SEMPRE_BLOQUEADAS` em código (`lib/marketplaces/portao.ts:69`). Recomendo
  que o comentário dessa constante passe a citar este parecer como o
  precedente **negativo por padrão**: qualquer novo "achei outra porta"
  precisa de parecer novo, não herda este.

---

## Pergunta 2 — `/projects`: ler a listagem por automação é seguro?

**Veredito: PODE, no ritmo de hoje — com um mecanismo que ainda não existe em
código.**

- `robots.txt` não proíbe `/projects`; `sitemap.xml` o inclui com prioridade
  0.80 (`fontes/medicao-tecnica-2026-08-30.md`, §2). É o único sinal positivo
  da plataforma para automação, e é o que já sustenta
  `capabilities.discovery: "AUTHORIZED_BROWSER"` em `policy.json`.
- **O que a tabela mostra, e por que isso importa mais do que parece:** a
  Central de Ajuda foi de 429-depois-de-14-leituras (07/08) para
  403-com-desafio-na-1ª-leitura (30/08) em 23 dias
  (`fontes/medicao-tecnica-2026-08-30.md`, §4). Isso não é medida de
  `/projects` — **não foi medido hoje, declarado como tal** (§7 da mesma
  medição) — mas é evidência de que a postura anti-bot deste operador (ou da
  infraestrutura Cloudflare que ele usa) está **apertando com o tempo**, não
  estável. `/projects` fica no domínio principal (`99freelas.com.br`), que é o
  produto em si — o operador tem incentivo maior para proteger a listagem de
  projetos do que artigos de ajuda genéricos.
- **Diferença que muda a resposta se `/projects` também endurecer:** para a
  Central de Ajuda existe uma API alternativa pública e documentada. Para
  `/projects` **não existe** — `policy.json` já registra
  `api_available: false`, `api_motivo: "Nenhum host de API/desenvolvedor
  resolve no DNS"`. Se `/projects` passar a devolver 403/desafio, **não há
  porta lateral legítima** como a de hoje — a única resposta correta é parar
  e escalar, exatamente como `anti_bot.ao_encontrar_desafio` já determina em
  `policy.json`.
- **Ritmo que a casa deve impor a si mesma:** o que a plataforma convida
  (`sitemap.xml`) é indexação — cadência de motor de busca, não sondagem
  contínua. Recomendo tratar `/projects` com o mesmo ritmo humano já praticado
  hoje (múltiplos segundos entre requisições, nunca paralelo, nunca em loop
  fechado de repescagem) e **nunca** reinterpretar um 403 futuro em
  `/projects` como "vamos procurar uma API" — essa busca já foi feita e o
  resultado está registrado: não existe.
- **Mecanismo que falta, com todas as letras:** `lib/marketplaces/portao.ts`
  bloqueia `contornarAntiBot` como *ação*, mas eu não encontrei em disco
  nenhum limitador de **taxa** (rate limiter) para as ações `descobrir` e
  `lerProjeto` — a disciplina de hoje (o `sleep` entre requisições) foi
  aplicada **à mão pelo PM na captura de política**, não é código que vai
  rodar quando a célula de prospecção operar de verdade. Isso é `LACUNA`, não
  `mecanismo`: sem um teto de requisições por minuto **em código**, a proteção
  de ritmo depende de o agente "lembrar" — e a doutrina desta casa já nomeou
  isso: prompt é aviso, código é trava. Recomendo ao PM abrir esta como item
  de construção antes de `descobrir`/`lerProjeto` operarem fora de captura
  manual supervisionada.

---

## Pergunta 3 — operar a sessão autenticada do titular: o raio de dano

### A lacuna contratual (intransferibilidade) — o que ela significa para o risco

- Confirmado: zero ocorrência de `intransfer`, `terceiro` (no sentido de
  operação de conta), `procurador`, `represent` no texto de hoje
  (`pareceres/2026-08-30-operacao-da-sessao-autenticada.md`, pergunta 3). Isto
  é `LACUNA`, não permissão — e aqui a lacuna **não reduz** o risco, porque o
  mecanismo de punição da plataforma não depende dela. Os Termos não
  precisam de uma cláusula "só o titular pode operar a conta" para punir
  comportamento automatizado mal comportado: a cláusula de Sanções já cobre
  "quaisquer outras práticas que descumpram os termos e regras de utilização"
  e nomeia "propagação de spams" e "prática de fraudes"
  (`fontes/termos-de-uso-2026-08-30.md`, linha 83). **O risco não é "delegar a
  conta", é "o que a sessão delegada faz" — e isso já está coberto.**
- A única cláusula real sobre múltiplas contas reforça o risco, não o mitiga:
  *"A sanção de banimento encerra definitivamente o acesso ao usuário na
  plataforma, incluindo outras contas do mesmo usuário"*
  (`fontes/termos-de-uso-2026-08-30.md`, linha 95).

### O blast radius de um banimento — o que o CEO perde

- **Acesso definitivo e permanente** à conta pessoal — e a qualquer outra
  conta ligada à mesma identidade, hoje ou (não confirmado, `LACUNA`) no
  futuro, se o método de correlação da plataforma for por CPF/telefone/meio
  de pagamento e não só por e-mail.
- **O plano Premium pago** (`policy.json →
  limites_da_plataforma.plano_declarado_da_conta: "premium"`) e o que ele
  garante — 240 conexões/mês, taxa de 10% em vez de 20%, repasse em 2 dias
  úteis — sem reembolso previsto para banimento (o único caminho de reembolso
  de assinatura exige pedido em até 7 dias corridos da compra,
  `fontes/termos-de-uso-2026-08-30.md`, linha 263 — não é o caso de um
  banimento meses depois).
- **Bônus de medalha e reputação acumulada** — histórico de "Talent"/"Top
  Freelancer" (se houver — `medalha_declarada: null` em `policy.json`, `LACUNA`
  hoje) some junto.
- **Saldo já ganho é preservado** — a única mitigação que os Termos garantem:
  *"o usuário Freelancer poderá receber o pagamento pelo projeto executado"*
  mesmo banido (`fontes/termos-de-uso-2026-08-30.md`, linha 97). Isto é o
  único fato a favor do CEO neste bloco inteiro.
- **Fora da carta dos Termos, mas é o dano real:** é a identidade profissional
  pessoal dele numa plataforma que ele usa por conta própria. A perda é
  permanente e não tem recurso descrito nos Termos (não há cláusula de
  apelação de banimento no texto capturado — `LACUNA`).

### Higiene de credencial e sessão — este é o meu domínio, e é onde está o achado real

**Aqui está o ponto que decide o veredito deste parecer.**

- A ficha descreve "Claude in Chrome, sessão autenticada do titular". Existem
  dois desenhos possíveis por trás dessa frase, e eles têm risco muito
  diferente:
  1. **O desenho que já está especificado nesta casa**
     (`docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md`, seção 4): um
     **contexto de navegador persistente e dedicado**
     (`chromium.launchPersistentContext("./browser-profiles/99freelas", ...)`),
     login único manual do CEO, cookies reaproveitados depois — um perfil que
     **só tem o 99Freelas dentro**, sem e-mail, sem banco, sem outra sessão.
  2. **O desenho que a frase "Claude in Chrome com a sessão dele" sugere
     isoladamente**, se lida ao pé da letra: o agente operando dentro do
     **Chrome pessoal e cotidiano do CEO** — o mesmo perfil onde ele já está
     logado no Gmail (confirmado: é o canal usado para o e-mail ao suporte,
     `policy.json → autorizacao_do_suporte.remetente`), possivelmente banco,
     WhatsApp Web, e o que mais ele usa todo dia.
  - **O primeiro desenho é seguro por construção — o segundo não é, e o
    motivo não é o 99Freelas: é tudo o mais que mora naquele navegador.**
    Um projeto publicado por um "cliente" no 99Freelas é texto de fonte
    externa e não confiável passando pelo campo de visão de um agente com
    ferramenta de navegador. Se esse agente estiver operando dentro de um
    perfil que também enxerga e-mail e banco, um briefing malicioso desenhado
    para manipular um agente de IA (prompt injection via conteúdo de
    terceiro) tem, em tese, superfície para tentar pivotar para as outras
    abas do mesmo perfil — não porque o 99Freelas seja hostil, mas porque
    **quem entrou numa aba alcançaria o que não é dele nas outras.** Isto é
    exatamente o padrão 2 da minha tabela (posse/alcance), só que o "recurso
    de outro dono" aqui não é outro cliente da agência — é a vida pessoal do
    próprio CEO.
- **O que precisa ser isolado, como mecanismo, não como instrução:**
  1. **Perfil de navegador dedicado**, usado exclusivamente para o 99Freelas —
     o desenho da própria especificação da casa já resolve isto; falta
     construí-lo.
  2. **Escopo de aba/domínio**: a ferramenta de navegador do agente restrita,
     por configuração (não por prompt), a `99freelas.com.br` e
     `99freelas.zendesk.com` — nenhuma navegação para fora permitida pela
     própria ferramenta.
  3. **Zero outra sessão no mesmo perfil**: sem Gmail, sem banco, sem gerenciador
     de senha destravado, sem extensão ativa que carregue cookie de outro
     site.
  4. **Login único e manual do CEO** para semear a sessão, como a
     especificação já prevê — o agente nunca digita usuário/senha (e isso já
     está garantido por código: `lib/marketplaces/portao.ts:162-171` bloqueia
     a ação `login` incondicionalmente hoje).
- **Verificado em disco, e é o achado que muda o veredito:** `git grep`-nível
  de busca não encontrou `playwright`, nenhum diretório `browser-profiles/`,
  nenhuma implementação do que a especificação descreve. **O mecanismo de
  isolamento existe só como parágrafo em
  `docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md` — é plano, não trava.**
  Pela regra desta casa ("prompt é aviso; código é trava"), isto conta como
  `LACUNA`, não como controle. **Não há hoje nenhuma execução real rodando —
  então não há vulnerabilidade ativa —, mas também não há nada que impeça a
  próxima pessoa de ligar "Claude in Chrome" dentro do perfil errado no dia em
  que isto for implementado.**
- **Minha condição para trocar 🟠 por 🟢 nesta pergunta:** o perfil isolado
  precisa existir em código e ser a **única** forma pela qual qualquer agente
  toca uma sessão autenticada do 99Freelas, antes de qualquer operação real
  de sessão acontecer — sombra ou não. Isto não é sobre confiar no CEO ou no
  PM; é sobre não depender de ninguém lembrar de abrir o perfil certo.

### Credencial em arquivo do repositório

- **Confirmado, busca feita nesta sessão:** nenhuma senha, token ou segredo do
  99Freelas está escrito em nenhum arquivo do repositório. O que existe são
  **nomes de variável** (`RADAR_GMAIL_USER`, `RADAR_GMAIL_APP_PASSWORD`, em
  `docs/plataformas/99freelas/gmail-senha-de-app.md`) — nunca o valor — e essa
  é uma credencial de **outro** mecanismo (leitura do Gmail da agência para
  radar de oportunidades), não do login no 99Freelas. Nenhuma credencial de
  login do 99Freelas foi encontrada em lugar nenhum do disco.
- **A regra que impede:** SEGURANÇA §9 da constituição — *"nunca imprimir o
  valor de um segredo, em lugar nenhum"* — e a prática desta casa de referenciar
  segredo por **nome de variável de ambiente** (Railway Variables), nunca por
  valor colado em markdown.
- **O que é `LACUNA`, não mecanismo:** não encontrei nenhum gancho de
  pré-commit ou scanner automático que impeça alguém de colar um segredo por
  engano no futuro — o que existe hoje é disciplina observada, não trava.
  Registro como recomendação de reforço, não como bloqueio: um scanner de
  segredo no pré-commit (o mesmo padrão do gancho de reivindicação que já se
  instala sozinho no `npm install`) fecharia essa `LACUNA` sem custo de
  processo.

---

## Pergunta 4 — PII de terceiros (clientes que publicam projetos)

- **O que a Política de Privacidade de hoje permite, lido literalmente:**
  *"Os dados pessoais expostos na descrição do perfil do usuário são públicos
  e acessíveis para qualquer visitante da página. A plataforma não se
  responsabiliza pelo uso de terceiros dos dados expostos nesta página"*
  (`fontes/politica-de-privacidade-2026-08-30.md`, linha 63). Isso cobre a
  **leitura** de briefing público — qualquer visitante, automatizado ou não,
  pode ler o que está publicado.
- **Achado a favor, e não estava na pergunta:** os Termos de Uso já obrigam a
  própria 99Freelas a **remover** dado de contato antes de publicar o
  projeto: *"Também serão omitidas do projeto informações de contato (número
  de telefone, endereço, links externos, etc)"* (`fontes/termos-de-uso-2026-08-30.md`,
  linha 123). Isso reduz — não zera — a exposição de PII real que chegaria até
  nós ao ler `/projects`: o que resta é nome de exibição, texto livre do
  briefing e o que a moderação eventualmente deixar passar.
- **O que a Política NÃO diz — `LACUNA`, declarada como tal:**
  - Não fala de leitura por automação especificamente (nem proíbe, nem
    autoriza — mesmo silêncio da pergunta 2, aplicado a dado de terceiro).
  - Não impõe (nem à 99Freelas nem a quem lê) regra de retenção, log ou
    reuso do que for lido de um perfil/projeto público.
  - Não trata do caso "um freelancer lê o perfil de um cliente com
    ferramenta automatizada e guarda isso fora da plataforma".
- **A regra que a casa deve adotar, na ausência de regra da plataforma —
  ancorada em Termos, não inventada:**
  - **Retenção:** manter o texto do briefing só enquanto o projeto estiver
    ativo no funil de qualificação/candidatura; não replicar para outro
    produto ou finalidade fora da candidatura àquele projeto.
  - **Log:** registrar qual projeto foi lido e quando, para a própria
    auditoria de cota e ritmo — não é preciso reter PII além do texto
    público em si.
  - **O que NÃO pode ser copiado para fora:** qualquer dado de contato que
    escapar da moderação (nome incomum, e-mail, telefone) não pode virar
    lead para outro canal (ex.: prospecção fora da plataforma a partir de um
    dado visto num briefing). Isso não é uma regra nova minha — é a mesma
    proibição que os Termos já fazem ao freelancer: *"Não se pode solicitar
    ou compartilhar dados de contato"* e *"Não se pode solicitar ou aceitar
    pagamentos por fora da plataforma"* (`fontes/termos-de-uso-2026-08-30.md`,
    linhas 57 e 59). Usar um dado de contato visto num projeto para abordar o
    cliente por fora é a mesma violação com outro verbo.
  - **Mecanismo hoje:** nenhum — é `AVISO`, e fica registrado como tal.
    Recomendo ao PM incluir esta regra no texto de `politica.ts` /
    `policy.json` quando a leitura de `/projects` sair de captura manual para
    operação real — não é deste parecer aplicar.

---

## Pergunta 5 — trava ou aviso, risco por risco

| Risco | Hoje é | Onde |
|---|---|---|
| Login automatizado com credencial digitada pelo agente | **Mecanismo** | `lib/marketplaces/portao.ts:162` — `BLOCK` incondicional |
| Contornar CAPTCHA/desafio/proxy/fingerprint | **Mecanismo** | `lib/marketplaces/portao.ts:69,150` — `SEMPRE_BLOQUEADAS` |
| Envio de proposta/mensagem sem autorização do suporte | **Mecanismo** | `lib/marketplaces/portao.ts:202-221` — força `HUMAN_GATE` lendo `policy.json` |
| Estouro de cota de conexões | **Mecanismo** | `lib/marketplaces/portao.ts:259-277` — fail closed (`Infinity` quando desconhecido) |
| Spam por texto repetido/proibido | **Mecanismo** | `lib/marketplaces/portao.ts:223-257` — `validarTexto`/`similaridade` |
| **Isolamento do perfil de navegador da sessão do titular** | **AVISO (lacuna)** | só existe em `docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md` §4 — nenhum código encontrado |
| Ritmo/limite de leitura em `descobrir`/`lerProjeto` | **AVISO (lacuna)** | disciplina manual do PM hoje; nenhum rate limiter em código |
| Retenção/uso de PII de terceiros lida em briefing | **AVISO (lacuna)** | nenhuma regra codificada |
| Escaneamento automático de segredo em commit | **AVISO (lacuna)** | nenhum gancho encontrado; disciplina manual até agora, sem furo observado |
| A "uma linha" que troca `HUMAN_GATE` por `ALLOW` no envio (`autorizacao_do_suporte.status`) | **Mecanismo forte, mas dado é alto valor** | recomendo revisão dupla nomeada para qualquer PR que toque essas três linhas de `policy.json` |

**Nenhum destes é P0 de sistema em produção hoje** — não encontrei código de
execução de navegador rodando (`playwright`, `browser-profiles/` ausentes).
**É P0 de pré-condição para ir ao ar:** os três `AVISO` marcados acima —
isolamento de perfil, ritmo de leitura e retenção de PII — precisam virar
mecanismo **antes**, não depois, de qualquer sessão autenticada real do
titular ser operada. "Sem alerta" aqui não significa "sem risco": significa
que ninguém tentou ainda.

---

## O que muda hoje nos artefatos da casa

- **Nenhum arquivo fora deste foi tocado** — não editei `policy.json`
  (proibido pela ficha), nem `lib/marketplaces/**`, nem `fontes/**`.
- Recomendações de mudança em `policy.json` ficam registradas aqui para o PM
  aplicar: (a) comentário em `anti_bot` explicando que o precedente da
  pergunta 1 é estreito e não se estende a `/projects` nem a autenticado; (b)
  campo novo, se o PM concordar, para condicionar `capabilities.discovery`
  a um rate limiter real antes de sair de `AUTHORIZED_BROWSER` supervisionado
  para operação sem supervisão.

---

## Devolutiva ao Diretor

- **Pergunta 1 (captura de hoje): não houve contorno.** As 12 capturas ficam.
  Não é precedente para rotina automatizada — só para recaptura ocasional de
  documentação pública, no mesmo ritmo de hoje.
- **`/projects`: pode ler, no ritmo humano de hoje.** Se travar (403/desafio),
  não existe API alternativa como a de hoje — a resposta certa é parar e
  escalar, não procurar outra porta.
- **🔴 O achado que decide o veredito:** a frase "Claude in Chrome com a
  sessão do titular" só é segura se rodar dentro de um **perfil de navegador
  isolado**, dedicado só ao 99Freelas — e esse isolamento **existe apenas
  como parágrafo de especificação**, não como código. Enquanto não for
  construído, **bloqueio operar qualquer sessão autenticada real**, mesmo
  supervisionada — o risco não é o 99Freelas banir a conta; é o agente
  alcançar e-mail ou banco do CEO pelo mesmo navegador se algo no conteúdo de
  um projeto tentar manipulá-lo.
- **Banimento alcança outras contas do mesmo titular** — confirmado de novo
  hoje, sem cláusula de apelação nos Termos. Perda é permanente.
- **Nenhuma credencial do 99Freelas está no repositório.** Confirmado por
  busca nesta sessão.
- **Quem consegue fazer o quê, hoje vs. depois da correção:**
  - **Hoje:** ninguém — não existe execução de navegador implementada. A
    célula de prospecção só qualifica (`portaoDeConformidade` libera
    `qualificar` sozinho, porque isso não toca a plataforma).
  - **Depois da correção (perfil isolado construído + rate limiter em
    `descobrir`/`lerProjeto` + regra de retenção de PII escrita):** o agente
    pode descobrir e ler projetos publicamente, de forma supervisionada, com
    o clique final de envio sempre humano — exatamente o modo que o CEO já
    pediu em 07/08, sem afrouxar nenhuma trava existente.
- **Decisões que pedem o CEO, fora do meu domínio:** a divergência de taxa
  (10–20% vs. 5–20%) e insistir com o suporte por canal mais forte — já
  registradas no parecer do PM, não são segurança.

**Registro de oficina e proposta de vitrine:** ver `docs/agents/seguranca/oficina.md`.
