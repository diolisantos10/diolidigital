# Célula de Prospecção 99Freelas — Relatório de Entendimento

> **Para o CEO.** Escrito pelo Project Manager em 30/08/2026, a pedido do Diretor.
> Branch `claude/celula-prospeccao-99freelas-v1`. Nada foi enviado, publicado nem
> mesclado.

---

## AS CINCO LINHAS

1. **Não está pronto, e não está perto do fim.** O que existe é o **cérebro** da
   célula — as regras de decisão, de segurança e de registro — construído e
   testado. O que **não** existe é o **corpo**: nenhuma tela, nenhuma rota,
   nenhum navegador ligado, nenhuma sessão do 99Freelas.
2. **Nada da célula fala com o 99Freelas.** Ela não abre o site, não lê o chat,
   não envia proposta, não recebe arquivo de cliente de verdade. Hoje ela só
   decide "o que eu faria se pudesse", e quem a exercita são os testes.
3. **A jornada ponta-a-ponta que o senhor pediu — de projeto encontrado a
   arquivo entregue com auditoria — NÃO foi comprovada.** Nenhuma vez, nem em
   simulação completa. Ver seção 9.
4. **`seguranca` BLOQUEIA operar sua sessão autenticada**, e o motivo não é o
   99Freelas: é o agente poder alcançar seu e-mail e seu banco pelo mesmo
   navegador. A trava que resolveria isso (perfil de navegador isolado) é
   parágrafo de especificação, não código.
5. **Duas coisas estão vermelhas agora nesta branch** e eu as pus com todas as
   letras na seção 8: quatro tabelas do banco sem migration, e três frentes de
   trabalho colidindo no mesmo arquivo de schema.

> **Como ler os rótulos deste documento.** `MEDIDO` = eu rodei o comando ou abri
> o arquivo nesta sessão, e digo qual. `SUPOSTO` = inferência, opinião ou
> parágrafo de especificação. `null` = **não medido** — nunca virou zero para a
> tabela ficar bonita.

---

## 1. O que foi pedido

- **A ordem original**, em `docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md`:
  um **agente operacional**, não um raspador. Ele observa a tela, decide, age no
  navegador, observa de novo — até completar o objetivo.
- **A definição de "100% automático" que o senhor escreveu** (§41): *"Diego não
  precisa abrir o 99Freelas diariamente."* O sistema abre o site, procura
  projetos, analisa, descarta os ruins, precifica, escreve propostas, envia,
  registra, acompanha respostas e atualiza o CRM. Humano só entra em **CAPTCHA,
  2FA, sessão expirada, negociação fora das regras, erro inesperado e questão
  comercial excepcional**.
- **O critério de aceite do MVP** (§42): quinze passos sem intervenção humana,
  começando em *"abrir uma sessão autenticada do 99Freelas"* e terminando em
  *"não duplicar proposta"*.
- **A ordem recente, desta rodada:** as **22 provas** (tabela adiante) e a
  **jornada ponta-a-ponta** (seção 9). E a régua com que o senhor mandou este
  relatório ser escrito: *não descrever intenção como entrega*.
- **O que eu NÃO interpretei para o lado que dá menos trabalho:** o senhor disse
  que não é concluído porque existe tela, documentação, build verde ou
  oportunidade no banco. **Este relatório não usa nenhuma dessas quatro coisas
  como prova de conclusão.**

> ⚠️ **Uma divergência de rumo que precisa ser dita.** A especificação de §42 e
> §43 nomeia **OpenAI Agents SDK + Responses API + ComputerTool + Playwright**. A
> ordem desta rodada fala em **Claude in Chrome**. São duas tecnologias
> diferentes, e **nenhuma das duas está implementada**. Não é detalhe técnico: é
> uma decisão sua que ainda não foi tomada por escrito, e ela muda o que precisa
> ser construído.

---

## 2. O que foi reaproveitado — com arquivo e linha

Apurado pelo especialista `esteira`, com verificação minha por amostragem.
**Reaproveitamento aqui significa import ou chamada real de código, não
semelhança de nome.**

### O que a Célula REALMENTE consome

| O que já existia | Onde estava | Onde a Célula usa |
|---|---|---|
| Impressão digital de texto (dedup) e leitura de prazo | `lib/agency/comercial/oportunidade.ts:119`, `:124`, `:348` | `lib/agency/celula/mensagens/trava-de-conversa.ts:67`, `mensagens/anti-generico.ts:35` |
| Tabela de preços e piso da casa | `lib/agency/financeiro/tabela-de-precos.ts:215`, `:225` | via `lib/agency/comercial/negociacao.ts:41` |
| Regra de "pode fechar por este valor?" e piso | `lib/agency/comercial/negociacao.ts:220`, `:359` | `lib/agency/celula/mensagens/objecoes.ts:25`, `:251-252`, `:327` |
| Motor de preço com o regime de taxa do 99Freelas | `lib/marketplaces/99freelas/preco.ts:121` | `lib/agency/celula/mensagens/proxima-mensagem.ts:91`, `:351` |
| Catálogo de serviços vendáveis | `lib/agency/self-serve-catalog.ts:53`, `:391`, `:396` | **por baixo**, através de `preco.ts:30` — a Célula não o importa direto |
| Guardião de conteúdo (bloqueia link, contato, pagamento por fora) | `lib/marketplaces/99freelas/conformidade.ts` | usado em toda saída de texto da Célula |
| Matriz de política por canal, fail-closed | `lib/marketplaces/politica.ts:47` | leitura de política do 99Freelas |
| Texto das perguntas de descoberta do SDR | `lib/agency/comercial/pergunta-repetida.ts` | `mensagens/perguntas-por-servico.ts` (texto reaproveitado), `trava-de-conversa.ts:68` (funções importadas) |
| Lista fechada de tipos de arquivo aceitos | `lib/agency/media/armazenamento.ts:51-75` | `lib/agency/celula/ponte/quarentena.ts:19-20` |

### O que existia e NÃO foi reaproveitado — reconstruído do zero

- **CRM (`model Client`, `prisma/schema.prisma:52`)** — a Célula não cria nem
  atualiza cliente. Só carrega um `clienteId` solto, sem relação de banco
  (`prisma/schema.prisma:3119`).
- **Briefing Room** (`lib/agency/briefing-conversation.ts`,
  `question-engine.ts`, `briefing-extractor.ts`) — **zero import**. Os estados
  `briefing_em_coleta`/`briefing_completo` (`lib/agency/celula/funil.ts:73-74`)
  são só nomes de estado; a sala de briefing real não é chamada.
- **Motor de qualificação já existente** (`lib/agency/comercial/pipeline.ts`,
  `qualificar.ts`) — **não é chamado** por nenhum arquivo da Célula, apesar de
  operar sobre a mesma tabela `Oportunidade`.
- **Agentes / departamentos / `dioli-brain`** — zero import. Nenhum dos cinco
  Essenciais entra no caminho de execução da Célula.
- **`sdr-agent.ts`** — o motor de objeção da casa não é chamado; a Célula tem o
  seu próprio (`mensagens/objecoes.ts`).
- **Auditoria genérica (`model ActivityEvent`, `prisma/schema.prisma:1065`)** —
  a Célula construiu três tabelas de trilha próprias, com trava append-only que
  a genérica não tem. A recusa está documentada em `prisma/schema.prisma:3011-3052`.

> **Leitura de negócio:** a Célula reaproveitou **preço, catálogo e as travas de
> conteúdo** — que é onde estava o dinheiro e o risco. Reconstruiu **funil,
> mensagens, exceções e trilha**. E **deixou de fora o CRM, o Briefing Room e o
> motor de qualificação** — as três peças que fariam a Célula virar parte do
> produto em vez de um módulo isolado.

---

## 3. O que já foi construído — o que existe de fato nesta branch

| Peça | O que faz, em uma frase | Guarda o dado onde | Testes |
|---|---|---|---|
| **Funil da oportunidade** | 22 estados, de "encontrada" a "ganha"/"perdida", com as transições legais e a proibição de pular etapa | **Banco**, com migration real (`prisma/migrations/20260830150000_.../migration.sql`) | 52 |
| **Trilha de auditoria** | Todo movimento vira linha nova; nada é alterado nem apagado | **Banco**, mesma migration | incluída acima |
| **Fila de exceções** | 14 tipos de problema que exigem gente, com prazo (15 min / 2 h / 24 h), dono e "exceção vencida grita" | **Banco — SEM MIGRATION** (ver seção 4) | 49 |
| **Ponte de arquivos** | Recebe arquivo do cliente com quarentena; envia ao cliente com trava de destinatário e de vazamento de endereço interno | **Banco — SEM MIGRATION** | 71 |
| **Biblioteca de mensagens (M01–M22)** | Os 22 textos que o senhor ditou, validados, com preenchimento de variáveis e bloqueio se sobrar lacuna | Arquivo JSON versionado | 48 |
| **Objeções** | Classifica 11 objeções do cliente e decide se pode conceder — sempre exigindo autorização registrada | Arquivo JSON | 36 |
| **Perguntas por serviço** | Escolhe a próxima pergunta de briefing, uma por vez | Arquivo JSON | 16 |
| **Entrada hostil** | Texto do cliente é dado, nunca ordem; tentativa de manipulação é registrada, nunca obedecida | Memória | 24 |
| **Anti-genérico** | Barra mensagem repetida, parecida ou com variável vazia/genérica | Memória | 10 |
| **Trava de conversa / de promessa** | Impede dois agentes na mesma conversa e promessa de data sem dono | ⚠️ **Nem memória nem banco — só o desenho.** É uma tomada sem fio | 46 |
| **Motor da próxima mensagem** | O orquestrador que costura tudo acima na ordem certa | Depende das duas travas acima, que não têm implementação real | 28 |

**MEDIDO (rodei agora):** `npx vitest run __tests__/celula` → **26 arquivos, 687
testes, todos verdes**, em 5,5 s.

### As travas que já são mecanismo de verdade

Fora da pasta da Célula, no portão que qualquer ação de plataforma atravessa
(`lib/marketplaces/portao.ts`):

- **Login por senha digitada pelo agente: BLOQUEADO** sempre (`:162-171`).
- **Contornar CAPTCHA / anti-bot: BLOQUEADO** sempre (`:69`, `:150`).
- **Enviar proposta ou mensagem: exige clique humano** (`:202-221`), lendo o
  status da autorização do suporte no `policy.json`. **Não há interruptor de
  ambiente para desligar isso** — há teste que prova a ausência do interruptor.
- **Cota de conexões: fail closed** — custo desconhecido vale infinito, nunca
  zero (`:259-277`).
- **Texto repetido entre propostas: BLOQUEADO** por similaridade (`:223-257`).

---

## 4. O que falta — a lista honesta

- 🔴 **Quatro tabelas do banco existem no schema e NÃO têm migration:**
  `ArquivoDaCelula`, `EventoDoArquivoDaCelula`, `ExcecaoDaCelula`,
  `EventoDaExcecaoDaCelula`. **MEDIDO** — a suíte da casa já pega isso e está
  vermelha (seção 8). Em produção, isso quebra na hora de gravar.
- 🔴 **Nenhuma tela e nenhuma rota.** Nada em `app/` importa a Célula.
  **MEDIDO** por busca exaustiva. Ninguém — nem o senhor, nem a equipe —
  consegue operar essa máquina hoje.
- 🔴 **Nenhuma execução de navegador ligada à Célula.** Zero `fetch`, zero
  Playwright dentro de `lib/agency/celula/`. **MEDIDO.**
- 🔴 **As duas travas de conversa (não repetir, não prometer data) não têm
  implementação de produção** — só a interface e um substituto de teste. O motor
  da próxima mensagem, portanto, **não roda de verdade nem isolado**.
- 🔴 **Trava sem fechadura:** o limite de acompanhamentos (M14 e
  `lib/marketplaces/99freelas/follow-up.ts`) exige um dado — quantos
  acompanhamentos já saíram — que **nada preenche**. Não existe nem a coluna no
  banco (**MEDIDO**: zero ocorrência de "acompanhamento" em
  `prisma/schema.prisma`). Como o desenho é fail-closed, ele **bloqueia sempre**.
  A dívida está registrada em código com prazo (30/09/26).
- 🔴 **Os 22 modelos de mensagem estão em rascunho e são ineviáveis.** Há teste
  que trava isso: *"nenhum dos 22 modelos M01–M22 é entregável hoje"*. Quem
  aprova é o Gerente de Atendimento e o SDR — que **não existem como papel
  operável**: não há login, tela, permissão nem fila visível para eles.
- 🟠 **O catálogo real só sustenta social media.** Site, branding e vídeo estão
  suspensos ou sem capacidade de produção. As perguntas de briefing desses três
  serviços são marcadas `PLACEHOLDER_CEO` e **não saem** — há teste garantindo.
- 🟠 **Sessão autenticada, envio de proposta, leitura do chat, download real de
  arquivo: nada disso existe.** O "download" que existe **registra o evento de
  auditoria e não move byte nenhum** — o próprio código declara isso.
- 🟠 **Sem limitador de ritmo em código.** A disciplina de esperar entre
  requisições foi aplicada **à mão** na captura de documentação. Quando a Célula
  operar, não há nada que segure o ritmo.

---

## 5. Limitações reais do Claude in Chrome

> 🔴 **Leia este aviso antes da tabela.** **Nenhuma linha de código de Claude in
> Chrome existe nesta casa, e ninguém desta agência mediu esse produto.** O
> parecer do Essencial `seguranca`
> (`docs/plataformas/99freelas/pareceres/2026-08-30-seguranca-sessao-do-titular.md`)
> afirma textualmente que **não existe execução de navegador implementada** para
> sessão autenticada. Portanto **quase tudo desta seção é `SUPOSTO`**, e está
> escrito assim. Não é modéstia: é a diferença entre um relatório e uma promessa.

| Pergunta | Resposta | Rótulo |
|---|---|---|
| O Claude in Chrome consegue operar o 99Freelas logado? | **não medido** (`null`) | `SUPOSTO` — ninguém testou |
| Ele isola perfil de navegador? | **não medido** (`null`) | `SUPOSTO` |
| Ele restringe navegação a um domínio por configuração? | **não medido** (`null`) | `SUPOSTO` |
| Quantas ações por hora ele sustenta? | **não medido** (`null`) | `SUPOSTO` |
| Ele resiste a manipulação por texto de terceiro (briefing malicioso)? | **não medido** (`null`) | `SUPOSTO` |
| Custo por rodada? | **não medido** (`null`) | `SUPOSTO` |
| Existe alguma integração dele nesta casa? | **NÃO — zero linha** | `MEDIDO` |

### O que É medido nesta seção

- ✅ **`MEDIDO`: existe navegador real no repositório, mas não é o da sessão
  autenticada.** `playwright@1.61.1` está declarado em `package.json:58` (em
  `dependencies`, não em desenvolvimento) e instalado; `lib/marketplaces/navegador.ts:207-210`
  abre um Chromium de verdade.
  - Ele abre um contexto **efêmero** (`chromium.launch()` + `newContext()`, linha
    213). **Não** usa perfil persistente, **não** carrega cookie de ninguém,
    **não** faz login — logo, **não é** a sessão autenticada do titular.
  - **Ele não tem chamador em produção**, e há teste que **exige** que continue
    sem chamador (`__tests__/marketplaces/a-junta-do-caminho-vivo.test.ts:366-375`).
- ⚠️ **Correção que devo ao senhor, porque o relatório existe para isso:** o
  parecer de `seguranca` de 30/08 afirma que "não encontrou Playwright" no
  repositório. **Isso está errado, e eu conferi** (`MEDIDO`, comandos acima). O
  que o parecer acerta e continua valendo: **não há perfil isolado, não há
  diretório `browser-profiles/`, e não há sessão autenticada.** A conclusão de
  bloqueio dele **não muda**; a premissa, sim.
- ⚠️ **Segunda correção, sobre saída de rede.** Foi-me passado como `MEDIDO` que
  "nenhum agente desta casa tem saída de rede". **Não se confirma neste
  ambiente:** rodei `curl https://www.99freelas.com.br/projects` agora e recebi
  **HTTP 200**. A própria medição técnica de 30/08
  (`docs/plataformas/99freelas/fontes/medicao-tecnica-2026-08-30.md`) registra 15
  capturas bem-sucedidas por rede. **O que é verdade é outra coisa, e ela
  importa mais:** existe saída de rede para **leitura pública**; o que não existe
  é **navegador com sessão autenticada e o isolamento que o torna seguro**.

---

## 6. Dependências para operar a sessão autenticada — e QUEM faz cada uma

| # | O que precisa existir | Quem faz | Existe hoje? |
|---|---|---|---|
| 1 | **Perfil de navegador isolado**, só com o 99Freelas dentro — sem Gmail, sem banco, sem outra aba | **Agência** (construir) | ❌ **Não.** Só parágrafo em `docs/projetos/99freelas/00-ESPECIFICACAO-DO-CEO.md` §4. `MEDIDO`: nenhum diretório `browser-profiles/`, nenhum `launchPersistentContext` |
| 2 | **Login único e manual, feito pelo senhor.** O agente nunca digita senha | **CEO** | ✅ Garantido em código: `lib/marketplaces/portao.ts:162-171` bloqueia login incondicionalmente |
| 3 | **Escopo de domínio travado por configuração** (só `99freelas.com.br` e o Zendesk deles) | **Agência** | ❌ Não. Recomendação em parecer, sem mecanismo |
| 4 | **Portão de conformidade** barrando envio automático e ação de risco | **Agência** | ✅ Existe e funciona (`lib/marketplaces/portao.ts`) |
| 5 | **Autorização escrita do suporte do 99Freelas** | **99Freelas** | ⏳ Pedido enviado, **23 dias sem resposta**, marcado `sem_resposta`. **Não trava nem destrava**: o modo supervisionado não depende dela |
| 6 | **Limitador de ritmo em código** para leitura de projetos | **Agência** | ❌ Não. Hoje é disciplina manual |
| 7 | **Regra escrita de retenção e uso do dado de terceiro** lido num briefing | **Agência** | ❌ Não codificada |
| 8 | **Decisão de tecnologia:** OpenAI+Playwright (a especificação) **ou** Claude in Chrome (a ordem desta rodada) | **CEO** | ❌ **Não tomada por escrito.** Bloqueia o desenho do item 1 |
| 9 | **A ferramenta de navegador em si funcionar como se supõe** | **Anthropic (fornecedor)** | `null` — **não medido nesta casa** |
| 10 | **Migration das 4 tabelas** | **Agência** | ❌ Não (seção 4) |
| 11 | **Tela e rota** para alguém operar a Célula | **Agência** | ❌ Não existe nenhuma |
| 12 | **Papel operável de Gerente de Atendimento e SDR** — quem aprova mensagem e trata exceção | **Agência** | ❌ São só duas palavras aceitas num campo de texto |

**🔴 O bloqueio formal, e ele é do Essencial `seguranca`:** *"enquanto o perfil
isolado não existir em código, bloqueio qualquer operação de sessão autenticada
real, inclusive supervisionada, inclusive só leitura."* A condição para
destravar são os itens 1, 6 e 7 desta tabela, **nesta ordem**.

---

## 7. Riscos — inclusive os que ninguém sabe resolver

### Os que não têm mitigação em código hoje

- 🔴 **O agente alcançar seu e-mail, seu banco ou seu WhatsApp Web pelo mesmo
  navegador.** Um projeto publicado no 99Freelas é texto escrito por
  desconhecido. Se o agente ler esse texto dentro do seu Chrome pessoal, um
  briefing desenhado para manipular IA tem, em tese, superfície para tentar
  pivotar para as outras abas. **É este o risco que gerou o bloqueio — não o
  99Freelas.** Mitigação: perfil isolado. Não existe.
- 🔴 **Banimento alcança outras contas do mesmo titular.** Cláusula explícita nos
  Termos (`fontes/termos-de-uso-2026-08-30.md`, linha 95), **sem cláusula de
  apelação**. Perde-se acesso definitivo, o plano Premium pago (240 conexões/mês,
  taxa de 10%) sem reembolso, e a reputação acumulada. **Saldo já ganho é
  preservado** — é a única proteção que os Termos dão. **Ninguém mitiga isso por
  engenharia. É apetite de risco seu, e a conta é a sua conta pessoal.**
- 🟠 **Os Termos são SILÊNCIO, não autorização.** Duas leituras independentes em
  30/08, sobre 15 fontes recapturadas com URL e data: os Termos **não proíbem e
  não autorizam** automação. Veredito: 🟠 **PODE COM AJUSTE**, mantendo o clique
  de envio humano. **Isto é risco em aberto, não problema resolvido** — silêncio
  não protege ninguém no dia em que a plataforma decidir interpretar.
- 🟠 **Os Termos não têm cláusula de titularidade nem de procurador.** A tese "o
  titular está autorizando a própria sessão" é razoável, mas **não está escrita
  no documento**. É `LACUNA`, não fato. E ela **não reduz o risco**: a cláusula de
  Sanções já pune "práticas que descumpram as regras" independentemente de quem
  operou.
- 🟠 **Ritmo de leitura vira sondagem contínua** e dispara a defesa anti-bot. Sem
  limitador em código. A Central de Ajuda deles saiu de "429 depois de 14
  leituras" (07/08) para "403 com desafio na 1ª leitura" (30/08): a postura
  anti-bot **está apertando**.
- 🟠 **Dado de terceiro lido num briefing** sem regra de retenção codificada.
- 🟠 **Nenhum scanner automático de segredo** antes de um commit. Hoje não há
  vazamento (`MEDIDO` por busca), mas o que protege é disciplina, não trava.

### Os que já são mecanismo

Login com senha digitada, contornar CAPTCHA, envio sem clique humano, estouro de
cota e texto repetido: **todos bloqueados em código**, com testes.

---

## 8. Testes realizados — os que foram RODADOS, com resultado

**Tudo abaixo foi executado por mim (PM) nesta sessão, em 30/08/2026.**

| O que rodei | Resultado |
|---|---|
| `npx vitest run __tests__/celula` | ✅ **26 arquivos, 687 testes, 100% verdes** (5,5 s) |
| `npx vitest run` (suíte inteira da casa) | 🔴 **8.218 testes: 8.215 verdes, 1 pulado, 2 VERMELHOS** |
| `ls`/`grep` em `prisma/migrations/` | ✅ Confirmado: nenhuma migration cria as 4 tabelas da ponte e da fila |
| `npx tsc --noEmit` | ✅ **Limpo, zero erro.** O senhor foi explícito: **build verde não é prova de conclusão.** Está aqui só para dizer que o código compila |
| `curl https://www.99freelas.com.br/projects` | ✅ **HTTP 200** — há saída de rede pública neste ambiente |
| Leitura de `package.json` + `lib/marketplaces/navegador.ts` | ✅ Playwright 1.61.1 declarado e instalado; Chromium é aberto em `:207-210`, em contexto efêmero, sem chamador em produção |

### 🔴 Os dois vermelhos, com todas as letras

1. **`__tests__/plataforma/schema-sem-migration.test.ts`** — quatro tabelas
   criadas nesta branch (`ArquivoDaCelula`, `EventoDoArquivoDaCelula`,
   `ExcecaoDaCelula`, `EventoDaExcecaoDaCelula`) estão no schema **sem migration
   que as crie**. A casa tem um portão para exatamente isso, e ele está pegando.
2. **`__tests__/coordenacao/registro-de-reivindicacao.test.ts`** — **três frentes
   de trabalho vivas colidindo no mesmo arquivo** (`prisma/schema.prisma`): a
   Célula de Prospecção, a conta de serviço do Diretor Geral e a Mesa de Comando
   do SDR. É exatamente o defeito que a regra de reivindicação existe para
   impedir, e ele está acontecendo agora.

### Mutação — a prova de que as travas barram de verdade

Guarda sem mutação é promessa escrita. A mutação afrouxa a trava de propósito e
confere que a suíte reage.

| Onda | Guardas afrouxadas | Vermelhas | Sobreviventes | Procedência |
|---|---|---|---|---|
| Onda 1 — funil e trilha | 10 | **10** | **0** | ✅ rodada e conferida pelo **Diretor** |
| Onda 3 — ponte e exceções | 13 | **13** | **0** | ✅ rodada e conferida pelo **Diretor** |
| Onda 2 — mensagens | 31 | — | — | ⚠️ **relatado pelo PM, NÃO verificado pelo Diretor** |
| Onda 2B — os 22 textos | 21 | — | — | ⚠️ **relatado pelo PM, NÃO verificado pelo Diretor** |

> A distinção acima é deliberada. O senhor pediu honestidade sobre a
> **procedência** do número, não só sobre o número. Onda 2 e 2B relataram 346 e
> 840 testes respectivamente; **ninguém acima do PM conferiu esses dois.**

### O que NÃO foi testado — declarado, não deduzido

- **Zero teste com o 99Freelas de verdade.** Nenhum login, nenhuma proposta,
  nenhuma leitura de chat, nenhum arquivo real trocado com cliente.
- **Zero teste do Claude in Chrome.** `null` — não medido.
- **Zero teste de ponta a ponta** da jornada da seção 9.
- **Zero teste com gente usando** — não há tela para usar.

---

## 9. Critérios ainda NÃO comprovados

### 9.1 As 22 provas

Legenda: **PROVADO** = achei o teste e li o que ele afere. **PARCIAL** = o
mecanismo existe mas não fecha o ciclo, ou o teste prova menos do que o nome
sugere. **NÃO PROVADO** = não achei teste.

| # | Prova | Veredito | Onde |
|---|---|---|---|
| 1 | Captura de oportunidade | 🟠 **PARCIAL** | `__tests__/esteira/oportunidade.test.ts:376` prova a **ingestão por texto colado / e-mail encaminhado**, com banco simulado. **A captura na plataforma não existe** e há teste que proíbe o navegador de ter chamador (`__tests__/marketplaces/a-junta-do-caminho-vivo.test.ts:366-375`) |
| 2 | Duplicidade | 🟢 **PROVADO** | `__tests__/esteira/oportunidade.test.ts:85` — texto já registrado devolve a existente, sem criar de novo. Ressalva: banco simulado, e é o Radar da casa, não a Célula |
| 3 | Qualificação | 🟠 **PARCIAL** | `__tests__/esteira/qualificar.test.ts:20` prova que a nota é calculada e que o preço nunca vem do modelo. **Não há teste de desqualificação por nota**: "abaixo de 40 recusa" é instrução de prompt (`qualificar.ts:130`), sem checagem determinística nem transição automática |
| 4 | Mensagem personalizada | 🟢 **PROVADO** | `__tests__/celula/anti-generico.test.ts` — 10 casos, incluindo a metade limpa. **Ressalva grave:** os 22 modelos estão em rascunho e nenhum é enviável hoje |
| 5 | Bloqueio de WhatsApp | 🟢 **PROVADO** | `__tests__/celula/proxima-mensagem.test.ts:433` — telefone e "zap" no modelo são barrados pelo Guardião real |
| 6 | Bloqueio de link | 🟢 **PROVADO** | `__tests__/celula/proxima-mensagem.test.ts:454` — mesma trilha, `link_externo` |
| 7 | Briefing pelo chat | 🟠 **PARCIAL** | `__tests__/celula/perguntas-por-servico.test.ts:70` prova a pergunta única, com dependência e sem repetir. **Mas não há chat**: o chat do 99Freelas está atrás do login, e site/branding/vídeo têm perguntas `PLACEHOLDER_CEO` que não saem |
| 8 | Persistência após reinício | 🟢 **PROVADO** | `__tests__/celula/trilha-sobrevive-ao-reinicio.test.ts:85` — grava, derruba a conexão, relê do SQLite real, 5 campos intactos |
| 9 | Download | 🟠 **PARCIAL** | `__tests__/celula/ponte-download.test.ts:117` prova o **registro de auditoria** do download. O próprio código declara que **não lê byte nem serve arquivo**. O download em si não existe |
| 10 | Entrada segura | 🟢 **PROVADO** | `__tests__/celula/ponte-quarentena.test.ts` — 13 casos plantados: extensão dupla, travessia de diretório, executável disfarçado, NUL byte, inversão de texto |
| 11 | Imagem ao cliente certo | 🟢 **PROVADO** | `__tests__/celula/ponte-versoes.test.ts:338`, contra banco real: destinatário errado bloqueia, certo envia. Ressalva: a trava não distingue tipo de arquivo, e a amostra usada é PDF |
| 12 | PDF | 🔴 **NÃO PROVADO** | `application/pdf` aparece só como um dos tipos **aceitos na entrada** (`lib/agency/media/armazenamento.ts:61`). Nenhum teste garante entregável em PDF |
| 13 | Editável | 🔴 **NÃO PROVADO** | `docx`/`pptx` idem — aceitos na entrada, nunca provados como formato de entrega |
| 14 | Destinatário divergente | 🟢 **PROVADO** | `__tests__/celula/ponte-destinatario.test.ts:59` — o teste é literalmente nomeado "prova nº 14"; bloqueia divergência em 3 eixos. Confirmado por mutação (Onda 3) |
| 15 | Versionamento | 🟢 **PROVADO** | `__tests__/celula/ponte-versoes.test.ts:116` e `:166` — versão nova é linha nova, e o banco recusa sobrescrever |
| 16 | Conexão consumida | 🟠 **PARCIAL** | `__tests__/marketplaces/a-junta-do-caminho-vivo.test.ts:263` é **varredura do código-fonte**, não execução: confirma que a rota chama `registrarGasto` antes de marcar enviada. Não há teste que execute o contador contra banco, e nada da Célula chama essa rota |
| 17 | Sessão expirada | 🟠 **PARCIAL** | `__tests__/celula/excecoes-interrompe-automacao.test.ts` prova a **consequência** (se a exceção está aberta, para). **Não há detecção**: o desenho atual nunca faz login, logo não há sessão para expirar |
| 18 | Parada no CAPTCHA | 🟢 **PROVADO** | `__tests__/marketplaces/99freelas.test.ts:471` — o desafio é reconhecido e o agente PARA; reforçado pela fila de exceções. Ressalva: o navegador que faz isso não tem chamador em produção |
| 19 | Arquivo recusado | 🟢 **PROVADO** | `__tests__/celula/ponte-quarentena.test.ts` — tipo fora da lista fechada é recusado e abre exceção `arquivo_recusado` |
| 20 | Trilha de auditoria | 🟢 **PROVADO** | `__tests__/celula/trilha-e-append-only.test.ts:37` (varre o código: não existe alterar nem apagar) + `:94` (grava e relê do banco real). **Ressalva: 2 das 3 tabelas de trilha não têm migration** |
| 21 | Fila de exceções | 🟢 **PROVADO** | `__tests__/celula/excecoes-fila.test.ts:319` — abre com responsável e prazo, grava e relê do banco real. **Ressalva: sem migration, sem tela, e os responsáveis não existem como papel** |
| 22 | Nenhuma credencial exposta | 🟠 **PARCIAL** | A busca do Essencial `seguranca` em 30/08 não achou nenhuma credencial do 99Freelas no repositório. **Mas não existe teste que varra segredo** — é disciplina observada, não trava que roda |

**Contagem:** 🟢 **12 provadas** · 🟠 **8 parciais** · 🔴 **2 não provadas**.

> **A leitura que importa mais que a contagem:** três provas verdes dependem de
> mecanismos que não fecham o ciclo real — o download não move byte, a conexão
> consumida é varredura de código e não execução, e "sessão expirada" não tem
> detecção porque não há sessão. **São verdes que não são prova**, e este
> relatório existe para separá-los do resto.

### 9.2 A jornada ponta-a-ponta — **NÃO COMPROVADA**

| Etapa da jornada | Comprovada? |
|---|---|
| PROJETO ENCONTRADO | 🔴 Não, na plataforma. Só ingestão manual por cola/e-mail |
| QUALIFICAÇÃO | 🟠 Nota calculada; recusa automática não |
| ABORDAGEM SEGURA | 🟠 As travas de conteúdo funcionam; **os 22 textos são inenviáveis** |
| RESPOSTA | 🔴 Não. Não há leitura do chat |
| BRIEFING INTERNO | 🟠 Motor de perguntas existe; sem chat e sem sala de briefing ligada |
| PROPOSTA | 🔴 Não. Envio exige clique humano numa tela que não existe |
| CONTRATAÇÃO REPRESENTADA | 🔴 Não |
| ARQUIVO RECEBIDO | 🟠 Quarentena e registro provados; **o recebimento real não existe** |
| PRODUÇÃO REPRESENTADA | 🔴 Não. A Célula não fala com nenhum departamento |
| ARQUIVO ENTREGUE | 🟠 Trava de destinatário e versionamento provados; **entrega real não existe** |
| AUDITORIA COMPLETA | 🟠 Trilha append-only provada; **2 tabelas sem migration** |

**🔴 Zero etapas comprovadas ponta a ponta. Nenhuma oportunidade real percorreu
essa jornada, nem em simulação completa.**

### O que falta para comprovar a jornada, na ordem

1. Migration das 4 tabelas (é o vermelho de hoje).
2. Decisão sua de tecnologia de navegador (item 8 da seção 6).
3. Perfil de navegador isolado em código — sem ele, `seguranca` bloqueia.
4. Implementação real das duas travas de conversa.
5. Tela e rota para operar a Célula, e o papel operável de quem aprova.
6. Aprovação dos 22 modelos de mensagem.
7. Um teste de jornada completa, com o 99Freelas simulado, que reprove sozinho
   quando qualquer etapa quebrar.

---

## 10. O que precisa de decisão SUA

| # | Assunto | O que eu preciso do senhor |
|---|---|---|
| 1 | **Tecnologia do navegador** | A especificação diz OpenAI + Playwright; a ordem desta rodada diz Claude in Chrome. **Nenhuma existe.** Decidir por escrito destrava o item 3 abaixo |
| 2 | **Apetite de risco da sua conta pessoal** | Banimento alcança **outras contas do mesmo titular**, sem apelação. Nenhuma engenharia resolve. É sua conta, sua reputação, sua decisão |
| 3 | **Autorizar a construção do perfil isolado** | Enquanto não existir, `seguranca` bloqueia qualquer sessão real, inclusive supervisionada |
| 4 | **O catálogo** | Só **social media** é produzível hoje. Site, branding e vídeo estão suspensos. Ou o senhor libera capacidade, ou a Célula prospecta um serviço só |
| 5 | **A taxa da plataforma diverge da própria plataforma** | `/como-funciona` diz 5–20%, mínimo R$10. Os Termos dizem 10–20%, mínimo R$5. **Qual vale?** Isso muda o preço que sai na proposta |
| 6 | **Insistir com o suporte do 99Freelas** | 23 dias sem resposta, marcado `sem_resposta`. **Não trava nada** — o modo supervisionado não depende dela. Mas por canal mais forte, mudaria de 🟠 para 🟢 |
| 7 | **Quem é o Gerente de Atendimento e o SDR** | Hoje são duas palavras num campo de texto. Sem pessoa e sem tela, os 22 modelos não saem do rascunho e a fila de exceções não tem quem a olhe |

---

## 11. Uma nota sobre este relatório

Duas afirmações que me foram passadas como medidas **não se confirmaram** quando
eu as reconferi, e estão corrigidas no corpo do texto (seção 5): a ausência de
Playwright no repositório, e a ausência de saída de rede. Nenhuma das duas muda a
conclusão — mas registrar a correção é o único jeito de este relatório valer
alguma coisa da próxima vez.

**O número da Onda 2 e da Onda 2B eu não conferi pessoalmente**, e está escrito
assim na seção 8. Preferi um relatório com lacuna declarada a um relatório
redondo.
