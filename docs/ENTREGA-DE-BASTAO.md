# Entrega de bastão — Diretor da Dioli Digital → Diretor do Foocci

> Escrito em 08/08/2026, no encerramento do Diretor da Dioli Digital.
> Produção no momento da escrita: commit `50434f5`, branch
> `claude/dioli-agency-os-architecture-kk7kp`.
>
> **A seção B é a mais importante deste documento.** Ela é a razão do meu
> encerramento. Leia-a antes de confiar em qualquer coisa que eu disse.

---

## A. O QUE É VERDADE, COM PROVA

Só entra aqui o que eu conferi executando ou lendo a fonte. Cada linha tem
endereço.

| Afirmação | Prova |
|---|---|
| O Instagram só aceita **JPEG**; as artes da casa são PNG | `docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md:82` — fonte oficial capturada. Trava em `lib/integrations/meta/formato-de-midia.ts:1` |
| `PUBLICACAO_ORGANICA` é a chave que libera publicação orgânica | `lib/integrations/meta/trava-de-publicacao.ts:101` (`CHAVE_DA_DECISAO`) e `:109` (comparação literal, minúscula) |
| **Eu desliguei essa trava** (`liberada` → `travada`) em 08/08, sem pedir ao CEO | Railway, variável `PUBLICACAO_ORGANICA`. Motivo na seção G |
| `BrandBrain` **não tem** campo de proibição nem de referência visual | `prisma/schema.prisma:676-690` — 9 campos, todos de texto descritivo |
| O navegador existe em produção | `/api/capacidades` respondeu `montar-molde: pronta:true`, `onde_achei_o_navegador: /usr/bin/chromium`; e `?lancar=1` subiu o Chromium de verdade (`ok:true, bytes:5719`) |
| A causa do navegador ausente **não era** o Chromium | O `apt` do `railpack.json` sempre funcionou. O que quebrava era o `playwright`: o `output: "standalone"` não copiava `playwright-core/browsers.json`. Conserto em `next.config.ts` (`outputFileTracingIncludes`) |
| O logo da Dioli e os 6 SVGs do CityJobs **estão no repositório** | `public/brand/` e `public/brand/cityjobs/` (6 SVGs + `LEIA-ME.md`) |
| A escolha de arquivo do Drive se perdia em silêncio | Medido em produção antes do conserto: `HTTP 200 {"gravados":[]}` com frase verde. Depois: Foocci 1/1, `escolhaPerdida:false` |
| O CityJobs **não caiu** na Meta | Instagram `@cityjobs.sp` lido (perfil + último post 01/08); conta de anúncios `act_1355986106660251` viva. Só a Página falha, com **código 10** |
| Os 5 planos já estavam no código | `lib/agency/planos.ts`, que se declara fonte única, batendo com `docs/precos.md` |
| Retrato de produção (raio-x de 08/08) | 5 clientes · 3 projetos · 14 posts (6 agendados, 8 rascunho, **0 publicados**) · 8 aprovações pendentes · 3 solicitações de briefing paradas há +1 dia · 3 pedidos esperando decisão · 9 chamadas de IA/24h, 0 falhas |

---

## B. O QUE EU ASSUMI E NUNCA CONFERI

**Esta seção é o meu maior valor para você, e é o meu pior retrato.** O padrão
se repetiu o dia inteiro: **eu converti "não consegui ver" em "não existe", e
memória em fato.**

1. **"O Chromium não está no contêiner."** Escrevi isso no `pendencias.md` como
   P0. Era falso: o navegador sempre esteve lá. Eu tinha a medida
   (`pronta:false`) e **deduzi a causa** sem olhar o disco. Os três caminhos de
   conserto que eu sugeri não teriam consertado nada.

2. **"`drive.file` sobre uma pasta libera o conteúdo dela."** Nunca fui à fonte.
   Construí a saga inteira do Drive em cima disso — e mandei o CEO criar projeto,
   publicar app, gerar chave e organizar pastas. Quando o especialista `google`
   finalmente olhou, derrubou.

3. **"O caminho da conta de serviço é barato, uma pergunta ao Google."** Levei
   isso ao CEO como recomendação e ele autorizou **por ser barato**. Era falso:
   custa o mesmo que o caminho caro — escopo restrito, semanas de verificação.
   O parecer em que me baseei tinha ressalva de procedência e **eu não conferi a
   assinatura**.

4. **"O CityJobs caiu, precisa reconectar."** Repeti mais de uma vez. O acesso
   estava vivo. O CEO reconectou por nada.

5. **"O CityJobs nunca mandou o logo."** Repassei do agente. Os 6 SVGs estavam
   versionados no repositório.

6. **"Não temos o logo da Dioli."** Cobrei o CEO por dias. Estava em
   `public/brand/`. O código só sabia procurar no Drive do cliente.

7. **"Ninguém precifica."** Respondi isso ao CEO. **Ele mesmo tinha decidido em
   07/08** que o financeiro é o dono de tudo que diz respeito a dinheiro. Eu
   tratei silêncio da minha memória como ausência de informação.

8. **"As peças estão prontas."** Aceitei a autoavaliação de 8/10 de um agente e
   repassei ao CEO **sem olhar a imagem**. Era clipart. É a regra que eu mais
   cobro dos outros e a que eu quebrei.

9. **"O preço não está no código."** Repassei da auditoria externa sem conferir.
   Estava em `lib/agency/planos.ts` desde sempre.

10. **"O `META_LOGIN_CONFIG_ID` está ausente e trava o App Review."** Repassei de
    um agente. A variável estava definida.

**A regra que eu deixo escrita, e que eu não cumpri:** medida não é causa;
parecer sem assinatura do especialista não é parecer; e antes de dizer "não
existe", procure — inclusive no próprio repositório.

---

## C. OS 8 ITENS (do `docs/ESTADO-REAL-08-08.md`)

| # | Item | Estado real | Onde está |
|---|---|---|---|
| 1 | Destravar publicação | **FEITO E CONFERIDO NO AR** — mas o número é **0 posts publicados**. O interruptor não era a causa; era o PNG | `lib/integrations/meta/formato-de-midia.ts`, `__tests__/meta/formato-de-midia.test.ts` (14 testes) |
| 2 | Preço numa fonte só | **FEITO** — o preço já estava no código; faltava o portão que reprova divergência | `lib/agency/planos.ts`, `__tests__/comercial/preco-uma-fonte-so.test.ts` |
| 3 | Tela mostra os dois lados do interruptor | **NÃO INICIADO** | — |
| 4 | Material: pedir arquivo, não pasta | **NÃO INICIADO** como tela. O caminho técnico existe (coluna `origem`, `envio_direto`) | `prisma/migrations/20260808150000_origem_do_material`, `lib/agency/esteira/material-do-drive.ts` |
| 5 | Proibições/referências ao produtor | **NÃO INICIADO**. Causa confirmada: `BrandBrain` não tem onde guardar | `prisma/schema.prisma:676-690`, `lib/agency/execution/run-execution.ts` |
| 6 | Reprovação vira dado | **NÃO INICIADO** | — |
| 7 | Economia de imagem | **NÃO INICIADO**. Premissa parcialmente vencida: `trava-de-fundo.ts` já reprova fundo chapado | `lib/agency/design/trava-de-fundo.ts` |
| 8 | Aposentar os 3 documentos | **FEITO** — `esteira.md` teve as 3 frases falsas convertidas em lista de "não reintroduzir"; `BACKLOG.md` e `pendencias.md` apontam para o mapa novo | `.claude/agents/esteira.md`, `docs/ESTADO-REAL-08-08.md` |

**Não conferido em produção:** itens 2 e 8 foram verificados por teste e por
leitura, **não** por execução em produção.

---

## D. O QUE EU PEDI AO CEO E NÃO SERVIU PARA NADA

Lista literal. **Nada disto deve ser pedido de novo.**

| O que eu pedi | O que ele fez | Por que não serviu |
|---|---|---|
| Criar projeto no Google Cloud | Criou o projeto `dioli-digital` | **Serviu em parte** — vale para Perfil de Empresa, Ads e login. **Não** serviu para material |
| Publicar o app OAuth | Publicou (status "Em produção") | Idem: necessário para o resto, **inútil para ler pasta** |
| Criar a chave da API do Picker | Criou e mandou | O Picker entrega **arquivo a arquivo**. Não resolve material em volume |
| Criar 5 pastas no Drive (Marca, Produtos, Fotos, Referências, Provas) | Criou e organizou | **Pasta não conta.** `drive.file` não lê conteúdo de pasta. Trabalho perdido |
| Mover as imagens para as pastas | Moveu | Mesmo motivo. Os arquivos que já estavam lá **não são alcançáveis** pelo app |
| Mandar o logo da Dioli em SVG | Procurou, não tinha | **Estava no repositório.** Eu não procurei |
| Mandar o logo da Foocci | Cobrado por dias | Legítimo — esse realmente não existe. Mas foi pedido junto com os outros, num pacote em que a maioria era erro meu |
| Reconectar o CityJobs na Meta | Reconectou | **Não tinha caído.** Diagnóstico meu, errado |
| Conta de serviço no Drive (caminho C) | Autorizou | Derrubado pelo especialista antes de executar. **Nada foi feito no Drive dele** — o único pedido que não custou tempo |

**Padrão:** eu pedi ação humana antes de esgotar o que a casa já tinha. A ordem
dele de 08/08 — *"só me pede em último caso"* — nasceu disto.

---

## E. OS PARECERES

| Parecer | Arquivo | Assinatura | Veredito |
|---|---|---|---|
| CapCut / ByteDance | `docs/plataformas/tiktok/pareceres/2026-08-07-capcut.md` | `tiktok` (despacho real) | **NÃO PODE** — sem API, e os termos proíbem interação automatizada |
| 99Freelas — agente autônomo | `docs/plataformas/99freelas/pareceres/2026-08-07-agente-autonomo-de-prospeccao.md` | `pm` aplicando a carta do especialista | 🔴 **RESSALVA DE PROCEDÊNCIA** — PODE COM AJUSTE, envio em `HUMAN_GATE`. Conclusão provavelmente correta, **mas não é parecer de especialista** |
| Drive do cliente | `docs/plataformas/google/pareceres/2026-08-07-drive-do-cliente.md` | `google` | Lacuna declarada sobre pasta — a lacuna estava certa |
| Drive da agência | `docs/plataformas/google/pareceres/2026-08-08-drive-da-agencia.md` | 🔴 **PM, não o especialista** | **NÃO VALE COMO PARECER.** Foi ele que produziu a premissa falsa do "caminho barato" que subiu ao CEO |
| Drive por conta de serviço | `docs/plataformas/google/pareceres/2026-08-08-drive-conta-de-servico.md` | `google` (despacho real) | **DERRUBA o caminho C** — `drive.readonly` é restrito, isenção não cobre |
| Escrita no Drive (saída B) | `docs/plataformas/google/pareceres/2026-08-08-escrita-no-drive-saida-b.md` | `google` (despacho real) | 🟡 **PODE COM AJUSTE**. Falta um spike: `files.create` com `parents` numa pasta feita à mão **não tem fonte** que confirme nem negue |

**Regra que fica:** parecer com ressalva de procedência **não é parecer**.
Confira a assinatura antes de agir.

---

## F. OS AGENTES DA CASA (12)

| Agente | Para que serve | Uso real |
|---|---|---|
| `pm` | Porta de entrada de todo trabalho; distribui, cobra, consolida | **Muito usado.** Praticamente todo despacho do dia |
| `qualidade` | ESSENCIAL — "isto está bom para o cliente?". Somente leitura | **Pouco usado.** Não foi despachado hoje |
| `cerebro` | ESSENCIAL — "a base sustenta o que foi afirmado?" | **Não despachado hoje** |
| `interface` | ESSENCIAL — forma: token, tipografia, espaço, responsivo | **Usado** (portal, Sala dos Agentes) |
| `experiencia` | ESSENCIAL — "esta tela deveria existir?". Somente leitura | **Usado uma vez** (auditoria do portal). Nasceu em 07/08 |
| `seguranca` | ESSENCIAL — "quem entra sem convite?". Pode abrir P0 e barrar merge | 🔴 **NUNCA FOI DESPACHADO.** Nasceu em 07/08 e não trabalhou um dia. É enfeite até que alguém o use |
| `departamentos` | Os 8 departamentos e o que produzem | **Usado** (cérebro criativo, kit de logo) |
| `esteira` | Briefing → proposta → projeto → deliverable → portal | **Usado**. ⚠️ O manual dele continha 3 frases falsas até hoje |
| `plataforma` | Auth, banco, integrações, deploy, provedores de IA | **Usado indiretamente**; raramente despachado por nome |
| `meta` | Trava da Meta | **Usado, e salvou a casa** — decifrou o código 10 do CityJobs |
| `google` | Trava do Google | **Usado, e evitou semanas de trabalho perdido** |
| `tiktok` | Trava do TikTok/ByteDance | **Usado uma vez** (CapCut) |

**Nunca despachado:** `seguranca`. **Quase nunca:** `qualidade` e `cerebro` — os
dois Essenciais cuja função é duvidar. **Uma casa que não despacha quem duvida
não tem quem duvide.**

---

## G. O ESTADO DO AR

**Produção:** commit `50434f5`, branch `claude/dioli-agency-os-architecture-kk7kp`.
O último commit (`d47e5aa`, o cursograma) foi empurrado e ainda não deployou.

### O que está quebrado

1. 🔴 **Publicação no Instagram: 0 posts publicados, e o motivo é duplo.**
   - **O PNG.** As 36 telas são `image/png`; o Instagram só aceita JPEG
     (`docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md:82`).
   - **O agravante, e é o pior achado do dia:** o post que falhava continuava
     `scheduled`, e o despertador retentava **a cada 5 minutos, para sempre** —
     ~24 criações de container recusadas por hora **contra a conta de um
     cliente**, com o app sem App Review. É o padrão que restringiu a conta de
     anúncios em 03/08. **Estancado:** a recusa agora acontece antes de qualquer
     byte sair (`lib/integrations/meta/formato-de-midia.ts`).

2. 🔴 **Permissão faltando no aplicativo da Meta.** A Página do Facebook do
   CityJobs devolve **código 10**: *"requires the `pages_read_engagement`
   permission or the Page Public Content Access feature"*. **Nome exato:
   `pages_read_engagement` + Page Public Content Access.** Não é token vencido;
   **reconectar não resolve.** Destrava as Páginas de CityJobs, Foocci e Dioli
   Digital Studio de uma vez. Exige App Review, que **nunca foi submetido**.

3. 🔴 **`PUBLICACAO_ORGANICA` — eu desliguei.** O CEO havia definido `liberada`.
   Com a trava liberada, a **única** coisa impedindo a casa de publicar sozinha
   na conta de um cliente com app não revisado era o bug do PNG. Consertar o
   formato sem o App Review ligaria a publicação automática. Voltei para
   `travada` e informei. **Decisão pendente do CEO.**

4. 🟡 **O material da Foocci está pendente de triagem.** 1 arquivo recuperado,
   `papel` nulo, nome `ChatGPT Image 7_08_2026...`. Não entra em peça nenhuma até
   alguém dizer o que ele é. Carimbar por conveniência poria a imagem errada numa
   peça entregue.

5. 🟡 **Duas fichas de "Camila Pereira".** Duas rotas criam cliente sem conferir
   se já existe (`create-project-from-request.ts:49`,
   `orchestrate/apply/route.ts:103`), e `Client` não tem
   `@@unique(workspaceId, name)`.

6. 🟡 **Sem alarme de "produção não está no commit da branch".** Três deploys
   foram engolidos hoje e ninguém teria sido avisado.

7. 🟡 **O domínio raiz `diolidigital.com.br` não responde.** Só o `www`.

---

## H. AMBIENTE

Nome e estado apenas. **Nenhum valor é impresso.**

| Variável | O que liga | Onde é lida | Estado |
|---|---|---|---|
| `PUBLICACAO_ORGANICA` | Publicação orgânica no Instagram | `lib/integrations/meta/trava-de-publicacao.ts:101` | **DEFINIDA — em `travada`, por mim** |
| `CRON_SECRET` | Rotas de cron e admin (`Authorization: Bearer`) | `app/api/cron/*/route.ts` | DEFINIDA |
| `RADAR_EMAIL_SECRET` | Porta de e-mail do Radar de oportunidades | `app/api/agency/oportunidades/email` | DEFINIDA |
| `RADAR_GMAIL_USER` · `RADAR_GMAIL_APP_PASSWORD` | Leitura IMAP do Gmail da agência | `lib/agency/comercial/caixa-de-entrada/` | DEFINIDAS — **nunca exercitadas**: este ambiente não faz IMAP |
| `RADAR_SOURCES` | Fontes do Radar de mercado | `lib/raio-x/` | DEFINIDA |
| `META_APP_ID` · `META_APP_SECRET` | App da Meta | `lib/integrations/meta/config.ts` | DEFINIDAS |
| `META_LOGIN_CONFIG_ID` | Login do Facebook para Empresas | `lib/integrations/meta/` | DEFINIDA |
| `META_WEBHOOK_VERIFY_TOKEN` | Desafio do webhook da Meta | `lib/integrations/meta/config.ts:151` | DEFINIDA |
| `META_WHATSAPP_PHONE_ID` · `_TOKEN` · `_WABA_ID` | WhatsApp Cloud API | `lib/integrations/meta/config.ts:133` | DEFINIDAS |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | OAuth do Google (projeto **próprio** da agência) | `lib/integrations/google/client.ts` | DEFINIDAS |
| `GOOGLE_PICKER_API_KEY` · `GOOGLE_PROJECT_NUMBER` | Seletor de arquivos do Drive | `app/api/portal/drive/route.ts:81-82` | DEFINIDAS |
| `GOOGLE_*_DIOLI` (3) | Cópias estacionadas da migração de credencial | — | DEFINIDAS — **resíduo, podem ser removidas** |
| `AUTH_SECRET` | Sessão | `lib/auth/session.ts` | DEFINIDA |
| `SEED_MASTER_PASSWORD` · `SEED_STAFF_PASSWORD` | Semente de usuários | `scripts/seed-db.mjs` | DEFINIDAS |
| `NEXT_PUBLIC_APP_URL` | Endereço público | `lib/http/endereco-publico.ts` | DEFINIDA |
| `MARKETING_PREVIEW_PASSWORD` | Prévia da vitrine | — | DEFINIDA |
| `BACKFILL_CARROSSEL_CLIENT_ID` | Backfill de carrossel | — | **VAZIA** |
| `REABRIR_CARD_APROVACAO` | Reabertura de card | `lib/agency/esteira/reabrir-aprovacao.ts` | **VAZIA** |
| `BRAIN_AI_PROVIDER` | Ordem de provedor de IA | `lib/ai/generate.ts:51` | **NÃO DEFINIDA** — a casa usa a ordem padrão (Claude → OpenAI → Gemini → DeepSeek → Perplexity) |
| Chaves de IA (`OPENAI_API_KEY` etc.) | Provedores | `lib/ai/resolve-key.ts` | **NÃO DEFINIDAS no ambiente** — vivem no cofre do banco (`DbIntegrationConfig`), e funcionam: 9 chamadas/24h, 0 falhas |

---

## I. OS CLIENTES

**5 clientes, 3 projetos em produção.**

| Cliente | Estado | Esperando | Há quanto tempo |
|---|---|---|---|
| **CityJobs** | Ativo. Contrato: 60 peças/mês, 2/dia, feed, sem carrossel | 2 peças no card de aprovação (produzidas hoje, refeitas com fotografia real). 6 peças antigas recompostas. **2 posts agendados para 07/08 nunca publicados** | 1 dia |
| **Foocci** | Ativo | 1 arquivo no Drive **sem papel declarado** · logo real **não existe em lugar nenhum** · Página do Facebook bloqueada pelo código 10 | Desde 07/08 |
| **Dioli Digital Studio** | Cliente da própria casa | Sem calendário. 3 pedidos em `precisa_decisao` | +1 dia |
| **Sushi Cazza** | **Lead, nunca respondido** | Proposta montada em `/agency/leads`. Briefing rico (rodízio R$ 99, paleta, público). **Sem contato** — só `@sushicazzaoficial` no texto | **51 dias** |
| **Camila Pereira** (Beauty Clinic) | **Lead, nunca respondido.** Ficha duplicada | Quer muito conteúdo em vídeo. **Sem contato** | **29 dias** |
| **Beatriz Gimenes** (lash designer) | **Lead, nunca respondido** | Social + tráfego + identidade. **Sem contato** | **28 dias** |

**O buraco que produziu os três leads perdidos:** o briefing público coletava a
conversa inteira e **nunca pedia contato**. Consertado hoje (`ce6ea9b`): contato
é condição para fechar, e a fila entrou no raio-x com alarme de 24h.

---

## J. O QUE EU FARIA SE CONTINUASSE

Em ordem, com o motivo.

**1. Converter as artes para JPEG — e só depois disso decidir a trava.**
É o que separa a casa de publicar. Mas **não ligue `PUBLICACAO_ORGANICA` antes
do App Review**: hoje o bug do PNG é a única coisa segurando a publicação
automática numa conta de cliente com app não revisado.

**2. Submeter o App Review da Meta, com `pages_read_engagement` e Page Public
Content Access.** O prazo é externo e o relógio só começa quando alguém pedir.
Destrava as Páginas dos três clientes e é pré-requisito de tudo em publicação.

**3. Dar ao produtor as proibições e as referências da marca.**
`BrandBrain` (`prisma/schema.prisma:676-690`) não tem onde guardar *"nunca
escreva o nome em texto gigante"*, e o produtor recebe 7 linhas. **É a causa raiz
da peça que o CEO reprovou**, e nenhuma trava resolve enquanto o produtor não
souber o que é proibido. Maior retorno da lista.

**4. Fazer a reprovação do CEO virar dado.** Não há contador de voltas nem
histórico por peça — por isso a peça 3 repete o erro da peça 1, e repetiu hoje.
Sem isso, o item 3 melhora uma peça e não a casa.

**5. Toda tela mostra os dois lados do interruptor.** É o defeito estrutural que
explica o dia inteiro: o CEO age num lugar, o código lê outro, e nenhuma tela diz
qual metade falta. Vale para publicação, preço e material.

**6. Falar com os três leads.** 51, 29 e 28 dias. É o único item desta lista que
gera receita hoje, e o Sushi Cazza tem `@sushicazzaoficial` como caminho real.
**Quem aborda é o CEO** — a máquina só prepara.

**7. Despachar o `seguranca`, uma vez que seja.** Ele existe desde 07/08 e nunca
trabalhou. Uma varredura de superfície exposta numa casa que ganhou 4 rotas
administrativas hoje não é opcional.

**8. Ligar as fontes do Radar.** `RADAR_SOURCES` está definida mas a tela de
mercado mostra o que um modelo lembra. Custa zero e é o melhor custo/benefício
que sobrou.

**9. Não tocar no Drive.** Três pareceres já foram gastos nisso. O caminho é
portal → "Enviar arquivos" → declarar o papel. Se alguém propuser ler pasta de
novo, leia `docs/plataformas/google/pareceres/2026-08-08-drive-conta-de-servico.md`
antes de gastar um dia.

---

## O que ficou fora do commit, e por quê

Nada. `git status` está limpo. O último trabalho pendente (`d47e5aa`, o
cursograma) foi empurrado.

**Branches vivas:** `claude/dioli-agency-os-architecture-kk7kp` (a que deploya),
`subida-07-08` (onde o dia foi trabalhado, empurrada para a de deploy),
`claude/dioli-pm-role-pow56e` (histórica). **Nenhum PR aberto.**

⚠️ **Armadilha que custou horas hoje:** commitar em `subida-07-08` e achar que
subiu. **A branch que deploya é `claude/dioli-agency-os-architecture-kk7kp`.**
Confira sempre em `/api/health` que o commit no ar é o seu.
