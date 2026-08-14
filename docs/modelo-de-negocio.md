# Modelo de negócio — Dioli Digital

> **Para que serve este arquivo.** Ordem do CEO em 14/08/2026: *"precisamos hoje
> criar o documento MODELO DE NEGÓCIO, tanto em texto quanto no canvas de modelo
> de negócio, para deixarmos em cada projeto. Assim não tem sombra de dúvida
> quando entra um diretor ou agente novo."*
>
> É o primeiro documento que um Diretor ou agente novo lê. Ele responde **o que
> esta casa vende, para quem, e por quanto** — não como o sistema funciona por
> dentro (isso é `ARCHITECTURE.md`) nem o que está aberto agora (isso é
> `docs/pendencias.md`).
>
> ## ⚖️ A REGRA DESTE ARQUIVO — leia antes de usar qualquer número
>
> **Nada aqui foi inventado.** Cada afirmação sai de documento ou código que já
> existe no repositório, com o caminho e, quando cabe, a linha e a data. Onde não
> havia fonte, está escrito **`não decidido`** ou **`não registrado`**, com a
> pergunta exata que precisa ser respondida — nunca um número plausível.
>
> **Canvas com lacuna honesta é útil; Canvas com chute é armadilha** para quem
> chega depois e não tem como saber que o número era invenção. Se você for
> atualizar este arquivo, mantenha a regra: **afirmação sem fonte não entra.**
>
> **Escrito em** 2026-08-14, contra o repositório em `6d884ce`
> (branch padrão `claude/dioli-agency-os-architecture-kk7kp`).

---

# PARTE 1 — O modelo em texto

## O que a Dioli Digital é

Uma **agência de marketing digital que roda dentro de um sistema próprio**. O
sistema se chama Dioli Agency OS: ele recebe o pedido do cliente por uma conversa
de briefing, transforma isso em proposta, projeto e tarefas, produz as peças com
agentes de inteligência artificial organizados em departamentos, mostra o
resultado ao cliente num portal onde ele aprova ou reprova, e publica nas redes
dele.

Fonte: `ARCHITECTURE.md` §1 (linhas 13–17) e `HANDOFF.md` §A.

Duas coisas a separar, porque confundir as duas é o erro mais comum de quem
chega:

- **A Dioli Digital é a agência** — quem tem cliente, cobra e entrega.
- **O Dioli Agency OS é a ferramenta dela** — o software onde o trabalho
  acontece. Hoje ele não é vendido a ninguém: é uso interno.

Nenhum documento do repositório registra venda ou licenciamento do sistema para
outra agência.

## A escolha que define tudo: a produção é 100% de máquina

**Decisão do CEO em 31/07/2026: o piloto roda 100% IA. Não existe checagem humana
antes de o entregável chegar ao cliente.** Está no `CLAUDE.md` da raiz, seção *"O
perfil de risco DESTA casa"*.

Isso não é detalhe técnico — é o modelo de negócio inteiro. É o que permite
vender um plano de R$ 49 sem dar prejuízo (`docs/precos.md`, "A conta"), e é o
que obriga a casa a ter travas em código em vez de revisores: a regra da casa é
**"prompt é aviso; código é trava"**.

A consequência escrita com todas as letras no manual: sem revisor humano, **um
dado inventado vira entregável**.

## Para quem

**O cliente típico é uma empresa**, não um consumidor final — e é uma empresa
local, de porte pequeno ou médio, que não tem quem cuide do digital dela.

Quem está registrado hoje:

| Quem | O que é | Fonte |
|---|---|---|
| **CityJobs** — plataforma de vagas do Alto Tietê | Projeto da própria casa, com **preço de transferência** (o mesmo que um cliente de fora pagaria) | `docs/projetos/cityjobs-orcamento.md` |
| **Foocci** — sistema para restaurantes | Parceiro interno, contabilizado como **a faturar** | `docs/decisoes.md`, "Todo orçamento é precificado — inclusive o de parceiro interno" (03/08/2026) |
| **Sushi Cazza**, **Camila Pereira** (Beauty Clinic), **Beatriz Gimenes** (lash designer) | Três leads que entraram pelo briefing público e **nunca foram respondidos**. Propostas escritas, nada enviado. | `docs/comercial/propostas/README.md` |

> ⚠️ **Um fato que precisa estar dito:** nenhum documento do repositório registra
> um **cliente externo pagante** já contratado. CityJobs e Foocci são projetos da
> própria casa; os três leads estão parados. O CEO tem fila de clientes esperando
> social media (`docs/ESTADO-REAL-08-08.md` §6), mas essa fila **não está
> registrada aqui**.

Existe um **segundo público, e ele é diferente**: o **balcão**. Decisão do CEO em
05/08/2026, registrada em `lib/agency/self-serve-catalog.ts`: *"a Dioli é empresa
de serviços digitais PARA TODAS AS PESSOAS. Quem chega com R$ 60 e quer um
carrossel sai com produto, não com uma recusa educada."* O balcão vende peça
avulsa barata, paga antes, a qualquer pessoa — inclusive pessoa física.

## Que problema resolve

O que o negócio do cliente sente, na linguagem dos próprios planos
(`lib/agency/planos.ts`, campo `paraQuem`):

- *"Para quem posta sozinho e não faz ideia se está funcionando."*
- *"Para quem quer conteúdo constante e publica ele mesmo."*
- *"Para o negócio que precisa aparecer no Google e não tem ninguém cuidando disso."*
- *"Para quem já vive do digital e precisa de volume e formato variado."*

O diagnóstico da própria casa sobre o que uma agência precisa entregar de fato
está em `docs/plano-de-obra.md`: **"Uma agência é julgada pelo arquivo que ela
entrega, não pelo documento que ela escreve."** Plano de mídia em vez de
campanha, conceito de marca em vez de logo, roteiro em vez de vídeo — é isso que
a casa se proibiu de fazer.

## Como o trabalho anda

A esteira, do primeiro contato à relação mensal
(`docs/CURSOGRAMA-DA-AGENCIA.md`, transcrição do documento que o CEO anexou em
01/08/2026):

```
cliente entra em contato → briefing (SDR) → precificação → proposta
   → cliente aprova a PROPOSTA → projeto nasce
   → cliente aprova a DIREÇÃO → o motor produz (cada departamento na sua ordem)
   → qualidade audita → o PM apresenta tudo de uma vez
   → cliente aprova a PEÇA → publicação → ciclo mensal (entrega, mede, fecha)
```

Por dentro, oito departamentos em cadeia sequencial, cada um produzindo um
"canvas" que alimenta o próximo: SDR → Estratégia → Social → Design → Tráfego →
Analytics, com PM e Qualidade auditando (`ARCHITECTURE.md` §2.1).

**Quem aprova é o cliente — nunca o CEO.** Ordem do CEO em 09/08/2026, registrada
em `docs/QUEM-APROVA.md`: *"a Dioli é totalmente autônoma (…) não precisa da minha
aprovação para nada (…) quem aprova os projetos ou não é o próprio cliente."*
Fila de aprovação apontando para o CEO é defeito, não fluxo.

## Onde o cliente e a equipe entram — duas superfícies, permissões diferentes

| Porta | Rota | Quem entra | Como |
|---|---|---|---|
| Briefing público | `/briefing` | Prospect | sem login |
| Vitrine (balcão) | `/vitrine` | Qualquer pessoa | sem login, paga no cartão |
| Página de planos | `/planos` | Qualquer pessoa | sem login |
| **Painel interno** | `/agency/dashboard` | Equipe | **login** |
| **Portal do cliente** | `/portal/access/[token]` | Cliente | **link com token**, não login |

Fonte: `ARCHITECTURE.md` §1.

As permissões são diferentes de propósito. No painel interno existem **seis
papéis** — master, project manager, comercial, social, design e ads — cada um com
uma lista do que pode ver e do que pode fazer (`lib/agency/roles.ts`:
`AGENCY_ROLE_OPTIONS`, `ROLE_NAV_ALLOWLIST`, `ROLE_PERMISSIONS`). O cliente
**nunca** aparece nessa lista: ele é papel só de portal.

O portal entra por **token**, validado com expiração e revogação
(`lib/agency/persistence/portal-access-service.ts:45`, `validatePortalAccess`).
Um id de cliente na URL **não** é credencial — a função que fazia isso foi
removida em 05/08/2026 justamente por entregar o portal de um cliente a qualquer
um (`lib/auth/portal-guard.ts`, linhas 3–19).

> **Ressalva honesta:** o próprio `lib/agency/roles.ts` registra, nas linhas 4–5,
> que a troca de papel no painel é um seletor de pré-visualização
> (*"No real auth — roles are simulated via a store selector"*). O login da equipe
> existe e é real; **o quanto o papel restringe de fato não foi conferido nesta
> sessão.**

## Como cobra

Quatro formas, e elas vendem coisas diferentes:

**1. Mensalidade — os cinco degraus** (`docs/precos.md`, decidido pelo CEO em
05/08/2026, e `lib/agency/planos.ts`):

| Plano | Mensalidade | Implantação | O que muda |
|---|---|---|---|
| Pulso | R$ 49 | isenta | Observa, mede e avisa. Zero peça. |
| Ritmo | R$ 297 | R$ 390 | + 8 peças/mês. **Quem publica é o cliente.** |
| Presença | R$ 790 | R$ 1.290 | + 10 peças, **nós publicamos**, Google, avaliações, **um humano no atendimento** |
| Conteúdo | R$ 1.390 | R$ 1.900 | + 14 peças, stories, roteiros de reels, plano de medição |
| Crescimento | R$ 2.590 | R$ 2.900 | + 18 peças, criativos de anúncio, campanha rodando **na conta do cliente** |

Peça além do contratado: **R$ 180** (`PECA_EXTRA`, `lib/agency/planos.ts`).
Permanência: 3 meses até o Presença, 6 do Conteúdo em diante. Reajuste anual por
IPCA (`docs/precos.md`).

**A regra que sustenta a base da tabela:** gente entra a partir do Presença.
Abaixo disso a operação é máquina, e é só por isso que R$ 49 e R$ 297 existem sem
prejuízo.

**2. Balcão — peça avulsa, paga antes** (`lib/agency/self-serve-catalog.ts`):
post para feed **R$ 79**, carrossel até 5 telas **R$ 129**. Produção 100% por
máquina, escopo fechado, sem rodada de revisão, pagamento antes da produção. É a
porta de entrada da casa.

**3. Avulso para quem já é cliente** (`docs/precos.md`, "Preço por serviço"):
post R$ 190, carrossel R$ 290, criativo de anúncio R$ 320, roteiro de reel
R$ 290, edição de vídeo de 60s R$ 350, vídeo gerado por IA de 15s R$ 690. Pedido
mínimo **R$ 750**, e só para quem já tem plano.

> Preço diferente para trabalho diferente **não é incoerência**: o balcão é
> máquina sem revisão; o avulso é equipe com direção de arte e 2 rodadas. É o que
> impede a linha barata de canibalizar a cara (`docs/precos.md`).

**4. Projeto com começo e fim**: posicionamento de marca R$ 3.900, identidade
visual R$ 2.900, pesquisa de concorrência R$ 1.200, plano de medição R$ 1.400,
estrutura de campanha R$ 1.900 (`docs/precos.md`).

**O desconto tem chão, e o chão é número.** Cada item tem um piso calculado
(`lib/agency/comercial/negociacao.ts`) — Ritmo R$ 229, Presença R$ 690, Conteúdo
R$ 1.190, Crescimento R$ 2.190. A ordem de negociação é: primeiro o que **não**
custa margem (prazo, pagamento à vista, menos rodadas, contrato mais longo,
autorização de case); só depois o preço se mexe; chegou no piso, **corta-se
escopo, nunca margem**.

> ## 🔴 A DIVERGÊNCIA DE PREÇO — leia antes de citar qualquer valor a um cliente
>
> **Há duas tabelas de preço vivas neste repositório, com nomes diferentes,
> valores diferentes e públicos que se cruzam. Nenhuma das duas está sendo
> tratada aqui como a verdade — a escolha é do CEO** (pergunta 1 da Parte 3).
>
> | | **Tabela A — os cinco degraus** | **Tabela B — o orçamento ao vivo** |
> |---|---|---|
> | Nomes | Pulso · Ritmo · Presença · Conteúdo · Crescimento | Essencial · Starter · Growth · Pro · Premium |
> | Valores | R$ 49 · 297 · 790 · 1.390 · 2.590 — **fixos** | R$ 600–900 · 900–1.400 · 1.500–2.400 · 2.500–4.000 · 4.000–6.500 — **faixas** |
> | Onde mora | `docs/precos.md` + `lib/agency/planos.ts` | `lib/agency/live-calculator.ts` (`SOCIAL_PACKAGES`) + `lib/agency/service-catalog.ts` |
> | Quem mostra | a página pública `/planos` (`app/planos/page.tsx`) | a conversa pública `/briefing` (`components/agency/briefing/PublicBriefingRoom.tsx`), o SDR, o motor de proposta e o catálogo interno `/agency/catalog` |
> | Quem diz ser a fonte única | `lib/agency/planos.ts`, linha 1: *"OS PLANOS DA CASA — fonte única"* | `lib/agency/service-catalog.ts`, linha 3: *"This is the single source of truth for what each department sells and for how much"* |
> | Decisão que a criou | CEO, **05/08/2026** (`docs/precos.md`) | `HANDOFF.md` §B, decisão 2, **27/07/2026**: *"Valores da proposta vêm do agente de orçamento (`computeEstimate`)"* |
>
> **O efeito prático, hoje:** um mesmo prospecto vê **R$ 790/mês** na página de
> planos e recebe **"Plano Starter, R$ 900–1.400"** na conversa de briefing da
> mesma casa.
>
> **O que já está resolvido, e não se reabre:** a Tabela A **está** no código e
> **está** travada por portão. `__tests__/comercial/preco-uma-fonte-so.test.ts`
> lê a tabela de `docs/precos.md`, compara com `PLANOS` e reprova a build se
> divergirem — **rodado em 14/08/2026: 7 testes verdes.** A auditoria de 08/08
> que concluiu que *"o preço não estava no código"* leu o balcão procurando os
> cinco planos, e o próprio `docs/precos.md` registra que essa leitura estava
> errada (bloco "ONDE O PREÇO MORA DE VERDADE").
>
> **O que continua aberto é outra coisa:** a Tabela B nunca foi aposentada nem
> reconciliada, e é ela que alimenta o caminho por onde o prospecto realmente
> passa. `lib/agency/pricing-margins.ts`, linhas 13–14, ainda declara: *"The
> client-facing price ranges live in live-calculator.ts."*
>
> **Um terceiro desalinhamento, menor mas do mesmo tipo:** `ARCHITECTURE.md`
> §5 descreve o preço do briefing como Starter R$ 1,2–1,8 mil · Growth R$ 2–3,2
> mil · Pro R$ 3,5–5 mil — números que **não batem com nenhuma das duas tabelas**.
> O documento envelheceu; o código andou.
>
> **E há um conflito de regra declarado no código que, conferido hoje, já não
> existe no documento** — mas ninguém apagou o aviso.
> `lib/agency/comercial/negociacao.ts`, bloco "CONFLITO CONHECIDO, DECLARADO E
> NÃO ESCONDIDO", diz que `docs/precos.md` afirma *"desconto sai do prazo ou da
> implantação, nunca da mensalidade"* e que isso briga com o piso abaixo da
> mensalidade. **Essa frase não está mais em `docs/precos.md`** (conferido em
> 14/08/2026): o documento já carrega a decisão mais nova, com os pisos escritos
> por extenso. Ou seja, o conflito parece **resolvido no papel** e o que sobrou é
> um comentário desatualizado no código, que manda o próximo Diretor procurar uma
> briga que acabou. É a pergunta 2 da Parte 3 — só falta a sua confirmação.

## O que a casa promete ao cliente — e o que ela se proíbe de prometer

**Promete:**

- O escopo numerado do plano, com o que **não** está incluído item a item — é
  essa lista que evita briga no terceiro mês (`lib/agency/planos.ts`).
- 2 rodadas de ajuste por peça (3 a partir do Conteúdo); aprovação em até 2 dias
  úteis, senão a peça segue para a data agendada (`docs/precos.md`).
- Relatório escrito **só com número medido** — o que não foi medido é declarado,
  nunca estimado (`lib/agency/planos.ts`, plano Pulso).
- Ficha do Google, conta de anúncios, pixel e domínio **no nome do cliente**
  (`docs/precos.md`).

**Se proíbe de prometer** (`.claude/agents/departamentos.md`, "Guardrails do
papel"; `docs/precos.md`):

- **Nenhum número de resultado.** Nada de percentual de aumento, alcance
  garantido ou retorno estimado que não venha de dado real do cliente.
- **Nenhum depoimento, prova social ou caso de sucesso inventado.**
- **Zero promessa de faturamento ou retorno em tráfego pago.**
- **Nenhuma lacuna preenchida por inferência.** Faltou dado do cliente →
  *"preciso confirmar"* e escala.

## O que a Dioli Digital explicitamente NÃO é

1. **Não é agência com revisor humano.** Ninguém confere antes de o entregável
   chegar ao cliente — a proteção é código, não gente (`CLAUDE.md`).
2. **Não gere a verba de mídia do cliente.** A verba nunca entra na mensalidade e
   nunca passa pela conta da Dioli. Campanha de cliente roda **na conta de
   anúncios do cliente**, com cartão e histórico no nome dele. A conta da própria
   agência serve para uma coisa só: publicidade da própria Dioli
   (`docs/decisoes.md`, "O modelo de contas na Meta", 03/08/2026 — registrado
   depois de a conta da agência ser restringida por violar exatamente isso).
3. **Não vende vídeo dentro de plano nenhum.** Gravação, edição e vídeo gerado
   por IA são compra separada, sempre — é o item de maior custo real da casa
   (`docs/precos.md`, `FORA_DE_TODO_PLANO` em `lib/agency/planos.ts`).
4. **Não vende operação diária de Meta Ads.** É por isso que não existe plano de
   R$ 4.990: *"vender operação diária hoje é vender o que não se pode entregar"*
   (`docs/precos.md`).
5. **Não é o CEO quem aprova.** Ele não é etapa da esteira
   (`docs/QUEM-APROVA.md`).
6. **Não publica em nome de cliente hoje.** A máquina está inteira e
   **fail-closed**; o parecer vigente da trava de plataforma é **NÃO PODE** até a
   Meta concluir a análise do aplicativo e a verificação do negócio
   (`docs/ESTADO-REAL-08-08.md` §2.2 e
   `lib/integrations/meta/trava-de-publicacao.ts`).
7. **Não é uma plataforma de software à venda.** O Agency OS é ferramenta
   interna; nenhum registro de licenciamento existe no repositório.
8. **Não é marketplace de freela.** O 99Freelas e afins são **canal de captação
   da agência**, não produto (`lib/marketplaces/`, `docs/plataformas/99freelas/`).

## O teto que não é da agência

Três dos dez departamentos param numa dependência externa: **tráfego pago (55%),
publicação (40%) e medição (30%)** não passam de onde estão por código próprio.
Dependem da análise do aplicativo na Meta e da verificação do negócio — que são
**atos do CEO**, não obra de engenharia (`docs/agencia-onde-estamos.md`, medição
de 12/08/2026).

Enquanto isso, a regra é: **construir a máquina inteira fail-closed e medir, em
vez de tentar.** Uma tentativa recusada pela Meta conta como tentativa contra a
reputação do aplicativo — foi assim que a conta de anúncios da casa foi
restringida em 03/08.

---

# PARTE 2 — O Canvas de Modelo de Negócio

> Como ler: **`não decidido`** = a escolha existe e ninguém a fez.
> **`não registrado`** = pode existir na cabeça de alguém, mas não está escrito
> em lugar nenhum do repositório — e, pela regra da casa, ausência de informação
> não é informação.

| Bloco | O que está registrado | Fonte | Lacuna |
|---|---|---|---|
| **1. Segmentos de Clientes** | **(a) Empresa local de pequeno/médio porte sem ninguém cuidando do digital** — é para ela que os cinco planos são escritos (`paraQuem` de cada plano). Os perfis usados nos raio-x da casa: dona de salão, padeiro, pet shop novo, restaurante. **(b) Qualquer pessoa, no balcão** — decisão do CEO 05/08/2026: *"empresa de serviços digitais PARA TODAS AS PESSOAS"*. **(c) Projetos da própria casa** — CityJobs e Foocci, com preço de transferência. **Área de atendimento é declarada pelo cliente, e o silêncio não vira "Brasil inteiro"** — é bloqueio. | `lib/agency/planos.ts`; `docs/plano-de-obra.md`; `lib/agency/self-serve-catalog.ts`; `docs/projetos/cityjobs-orcamento.md`; `docs/decisoes.md` (03/08); `lib/agency/comercial/onde-o-negocio-vende.ts` + `__tests__/comercial/onde-o-negocio-vende.test.ts` | **Nenhum cliente externo pagante contratado está registrado.** Os três leads (Sushi Cazza, Camila, Beatriz) estão parados há 28–51 dias, com proposta escrita e **nada enviado** (`docs/comercial/propostas/README.md`). **Segmento prioritário: `não decidido`** — nenhum documento diz qual setor ou porte a casa persegue primeiro. |
| **2. Proposta de Valor** | *"Uma agência é julgada pelo arquivo que ela entrega, não pelo documento que ela escreve"* — a casa se proibiu de entregar plano no lugar de campanha, conceito no lugar de logo, roteiro no lugar de vídeo. O que sustenta a oferta: **operação de máquina com preço de degrau baixo** (R$ 49 e R$ 297 existem porque não há hora humana neles), **escopo numerado com o que NÃO está incluído**, **relatório só com número medido**, **portal onde o cliente aprova peça por peça**, e **contas no nome do cliente**. | `docs/plano-de-obra.md`; `docs/precos.md`; `lib/agency/planos.ts` | **A prova de valor não existe.** Zero caso de sucesso, zero depoimento, zero número de resultado — e isso é regra, não falta: inventar qualquer um é proibido (`.claude/agents/departamentos.md`). **Condição de impressão declarada e não cumprida:** colher cinco propostas de concorrentes da mesma praça, datadas — as faixas de mercado usadas como âncora **nunca foram confirmadas com fonte auditável** (`docs/precos.md`, seção final). |
| **3. Canais** | **Entrada:** briefing público `/briefing` (sem login) · vitrine/balcão `/vitrine` (compra direta) · página de planos `/planos` · WhatsApp (número `5511989400692` em `app/planos/page.tsx`) · **Radar de oportunidades** com fontes oficiais das plataformas (`lib/agency/radar/sources.ts`, ligadas em 11/08) · **marketplaces de freela** (99Freelas com saldo de conexões medido — 237 de 240 — e política versionada por plataforma). **Entrega:** portal do cliente por token · publicação no Instagram/Facebook em nome dele · avisos automáticos (`ClientNotice`). | `ARCHITECTURE.md` §1; `app/vitrine/page.tsx`; `app/planos/page.tsx`; `lib/agency/radar/sources.ts`; `lib/marketplaces/politica.ts`; `docs/plataformas/99freelas/`; `docs/QUEM-APROVA.md` | **O canal de saída principal está fechado por terceiro:** publicar em conta de cliente é **NÃO PODE** até App Review + verificação do negócio (`docs/ESTADO-REAL-08-08.md` §2.2). **Canal de prospecção ativa: `não decidido`** — os três leads parados provam que não há rotina de abordagem; `docs/comercial/propostas/README.md` diz *"quem aborda é o CEO"*, e nada saiu. |
| **4. Relacionamento com o Cliente** | **A agência é autônoma e o cliente é quem aprova.** Ordem do CEO 09/08/2026. O ciclo: agência devolve a proposta → cliente aprova, pede ajuste ou reprova → volta. Três portões de aprovação do cliente, nesta ordem: **proposta**, **direção** (aprovar barato antes de produzir caro) e **peça**. O canal de decisão é **a sessão autenticada dele no portal** — decisão que chega por recado, conversa ou outro agente é pedido de terceiro e fica bloqueada. **Silêncio do cliente nunca é aprovação.** Uma voz só fala com ele: o PM consolida e apresenta tudo de uma vez. Humano no atendimento **só a partir do Presença**. | `docs/QUEM-APROVA.md`; `docs/CURSOGRAMA-DA-AGENCIA.md`; `.claude/agents/branding.md` ("Quem é o dono nomeado"); `app/api/portal/approvals`; `lib/agency/planos.ts` | **A régua de marca do cliente não existe ainda.** O registro de marca está em `marca_nao_constituida` para **todos** os clientes: **0 de 9 campos** preenchidos, **0 clientes com proibição registrada** (`.claude/agents/branding.md`, medido 09/08/2026). Ou seja: o que o cliente proíbe não tem onde morar. |
| **5. Fontes de Receita** | **(a) Mensalidade** — 5 planos, R$ 49 a R$ 2.590. **(b) Implantação** — uma vez, R$ 390 a R$ 2.900. **(c) Peça excedente** — R$ 180. **(d) Balcão pré-pago** — post R$ 79, carrossel R$ 129, cobrado no cartão via **Mercado Pago Checkout Pro** antes da produção. **(e) Avulso para cliente de carteira** — mínimo R$ 750. **(f) Projeto** — posicionamento R$ 3.900, identidade R$ 2.900, e outros. **(g) Preço de transferência de projeto interno** — CityJobs R$ 3.490/mês + R$ 1.290 de implantação; Foocci R$ 2.050/mês, contabilizado como *a faturar*. **A verba de mídia nunca é receita da casa** — ela nem passa pela conta da Dioli. | `docs/precos.md`; `lib/agency/planos.ts`; `lib/agency/self-serve-catalog.ts`; `app/api/self-serve/order/route.ts` + `app/api/self-serve/webhook/route.ts`; `docs/projetos/cityjobs-orcamento.md`; `docs/decisoes.md` (03/08) | 🔴 **Duas tabelas de preço vivas e divergentes** — ver o bloco vermelho da Parte 1. Pergunta 1 da Parte 3. 🔴 **Não existe cobrança recorrente no sistema.** Entre os 59 modelos do banco não há fatura, assinatura nem cobrança — só `LancamentoFinanceiro`, um lançamento contábil que alguém registra (`prisma/schema.prisma`; achado 11 de `docs/plano-de-obra.md`). O Mercado Pago cobre **só o balcão**. 🟡 **Roteiro avulso não tem preço de tabela**, e por isso todo pedido de roteiro para e espera alguém orçar à mão (`docs/pendencias.md`). |
| **6. Recursos-Chave** | **O sistema** — Next.js 16 + Prisma/SQLite em volume persistente no Railway, 59 tabelas, produção em `diolidigital.com.br`. **Os agentes de IA** — 8 departamentos em cadeia, ~22 especialistas de produto, mais 14 agentes de desenvolvimento em `.claude/agents/`. **A biblioteca de plataformas** — `docs/plataformas/` (Meta, Google, TikTok, 99Freelas), recapturada por rotina, citada linha a linha nos pareceres: é o que impede o parecer de ser opinião de memória. **As travas em código** — formato de mídia, publicação fail-closed, ativos autorizados, piso de negociação, teto de verba. **O tempo do CEO** — único humano fixo. | `ARCHITECTURE.md`; `HANDOFF.md`; `prisma/schema.prisma`; `lib/agency/execution/especialistas.ts`; `docs/plataformas/`; `lib/integrations/meta/trava-de-publicacao.ts`; `CLAUDE.md` | 🔴 **Os portões de qualidade em sua maioria ainda não protegem nada** — a maior parte das checagens declara `lacuna`, não `mecanismo`. As bloqueantes que faltam são justamente as que chegam no cliente: *respeita a marca*, *corresponde ao briefing*, *valor ao cliente claro*, *riscos verificados*. Sem revisor humano, isso é decoração (`CLAUDE.md`; `.claude/agents/qualidade.md`). **Tamanho da equipe humana: `não registrado`.** |
| **7. Atividades-Chave** | Captar (briefing, SDR, Radar, marketplaces) · precificar dentro do piso · desenhar o projeto e as tarefas · **produzir a peça** (estratégia → social → design → tráfego → analytics) · auditar antes de entregar · apresentar no portal e colher aprovação · **publicar em nome do cliente** · medir e fechar o ciclo mensal · manter a biblioteca de políticas das plataformas em dia · medir o custo de IA por agente. | `docs/CURSOGRAMA-DA-AGENCIA.md`; `ARCHITECTURE.md` §2; `docs/agencia-onde-estamos.md`; `lib/agency/financeiro/dre.ts` | **Três atividades estão travadas por terceiro** e a casa mede quanto: tráfego pago **55%**, publicação **40%**, medição **30%** (`docs/agencia-onde-estamos.md`, 12/08/2026). Ordem do CEO de 09/08: *"a gente só vai colocar a primeira peça pra produzir nessa agência quando todos esses departamentos tiverem acima de noventa por cento"* — **as três não chegam lá sem a Meta.** |
| **8. Parcerias-Chave** | **Meta** (Instagram/Facebook — publicação orgânica, Marketing API, o aplicativo em análise). **Google** (ficha do negócio, avaliações, Ads, Drive, Analytics). **TikTok**. Os três têm **especialista-trava próprio**: nenhuma ação de escrita acontece sem parecer prévio dele — regra do CEO de 03/08/2026, criada no dia em que a conta de anúncios da agência foi restringida. **Mercado Pago** (pagamento do balcão). **Railway** (hospedagem e o volume onde vive o dado do cliente). **OpenAI e Anthropic** (os provedores de IA; Gemini é stub). **99Freelas e marketplaces de freela** (captação, com política versionada e cota de conexões medida). | `CLAUDE.md`, "REGRA DA TRAVA DE PLATAFORMA"; `docs/plataformas/`; `app/api/self-serve/webhook/route.ts`; `ARCHITECTURE.md` §4 e §7; `lib/marketplaces/politica.ts` | **A parceria mais importante é a que ainda não existe formalmente:** o aplicativo da casa **não passou pela análise da Meta** e a **verificação do negócio não foi concluída** — sem ela, *"os usuários de outras empresas não poderão conceder permissões a esses apps"*. É o prazo externo mais longo e **é ato do CEO** (`docs/agencia-onde-estamos.md`; `docs/plataformas/meta/app-review.md`). |
| **9. Estrutura de Custos** | **Custo de IA por plano, contado a partir do próprio sistema** — Pulso ≈ R$ 4 · Ritmo ≈ R$ 22 · Presença ≈ R$ 28 · Conteúdo ≈ R$ 38 · Crescimento ≈ R$ 52 por mês. **Custo interno modelado por pacote** (`costBasis`), com piso de venda a ~1,6–1,8× o custo. **Hora humana** entra a partir do Presença. **O DRE existe** e consolida tudo num caixa só — todo projeto é de autoria da Dioli, então custo e faturamento de todos sobem para o mesmo lugar; nenhum projeto tem caixa próprio. Todo número carrega procedência e **zero é diferente de "não sei"**. | `docs/precos.md`, "A conta"; `lib/agency/pricing-margins.ts`; `lib/agency/financeiro/dre.ts`; `docs/decisoes.md` (07/08); `prisma/schema.prisma` (`LancamentoFinanceiro`) | 🔴 **Duas peças faltam, e o próprio `docs/precos.md` diz que sem elas o piso de margem não existe:** (1) **o custo fixo mensal da casa** e (2) **quantas contas ela atende sem hora extra**. 🟡 **A hora humana do Presença para cima é hipótese — ninguém mediu.** 🟡 **O custo de IA só é confiável a partir de 07/08/2026** (`MEDICAO_DE_IA_COMPLETA_DESDE`); antes disso mede uma fração desconhecida, e **não se extrapola o passado**. |

---

# PARTE 3 — O que só o CEO responde

> Todas as perguntas abaixo são fechadas: dá para responder cada uma em uma
> frase. Cada uma vem com **no mínimo duas saídas**, com **custo**, **risco** e
> **a recomendação por extenso** — regra de ouro da casa, 14/08/2026
> (`.claude/agents/diretor.md`, linhas 199–212).
>
> Nenhuma delas é decisão de execução. Todas são decisão de dono: preço, o que o
> produto promete, ou risco que não dá para desfazer.

## 🔴 1. Qual tabela de preço vale para o cliente: os cinco degraus ou os cinco pacotes?

**Por que sobe:** um mesmo prospecto vê R$ 790/mês na página de planos e recebe
"Plano Starter, R$ 900–1.400" na conversa de briefing. As duas nasceram de
decisões suas com datas diferentes (27/07 e 05/08) e nunca foram reconciliadas.

- **Saída A — os cinco degraus (Pulso…Crescimento) viram a única fonte.** O
  orçamento ao vivo, o SDR, a régua de negociação e o catálogo interno passam a
  ler `PLANOS`.
  *Custo:* obra em 7 arquivos que hoje consomem a outra tabela.
  *Risco:* baixo, e reversível — o portão de preço já existe e passaria a cobrir
  o caminho inteiro em vez de só a página pública.
  *O que destrava:* proposta e site passam a dizer o mesmo número.
- **Saída B — as duas convivem, com públicos declarados.** Degraus no site,
  pacotes só no orçamento sob medida.
  *Custo:* quase zero de código.
  *Risco:* alto e permanente — depende de disciplina humana numa casa que roda
  100% IA, e é o cliente que sempre acha o menor preço.
- **Saída C — os cinco pacotes viram a verdade e os degraus são aposentados.**
  *Custo:* refazer `docs/precos.md`, a página `/planos` e as três propostas já
  escritas.
  *Risco:* alto — contraria a ordem de 08/08 e o preço já publicado.

**Recomendação: Saída A.** É a única que fecha a divergência de vez, é a que a
sua ordem de 08/08 já apontava, e o mecanismo que a protege (o portão que reprova
a build) **já está construído e verde** — falta só apontá-lo para o caminho
inteiro.

## 🟡 2. Confirma que o desconto pode descer a mensalidade até o piso?

**Por que sobe:** é a regra que decide até onde o comercial pode ir sozinho, com
cliente real. O código declara que essa briga está aberta e que quem a resolve é
o CEO — mas, conferido em 14/08, **a frase que brigava já saiu do
`docs/precos.md`**: o documento hoje diz que a mensalidade pode descer até um piso
calculado (Ritmo R$ 229 · Presença R$ 690 · Conteúdo R$ 1.190 · Crescimento
R$ 2.190). Falta você dizer que é isso mesmo, para o aviso obsoleto sair do
código.

- **Saída A — confirmar: a mensalidade desce até o piso**, mantendo a ordem das
  moedas de troca (primeiro o que não custa margem: prazo, à vista, menos
  rodadas, contrato mais longo, autorização de case).
  *Custo:* zero de código; apagar um comentário desatualizado em `negociacao.ts`.
  *Risco:* médio — a carteira tende a ancorar no menor preço que alguém
  conseguiu. Já mitigado, porque o piso é número e não simpatia.
  *O que destrava:* o comercial para de operar sob uma regra que o próprio código
  chama de indefinida.
- **Saída B — voltar atrás: desconto só em prazo e implantação**, e os pisos
  viram piso de escopo, não de preço.
  *Custo:* mexer em `negociacao.ts` e reescrever a seção de descontos do
  `docs/precos.md`.
  *Risco:* perder cliente sensível a preço — justamente o degrau de baixo de que
  o modelo depende para escalar.

**Recomendação: Saída A.** É o que já está construído em código **e** em
documento, é o que atende o seu objetivo declarado de *fechar todo cliente sem
prejuízo*, e a proteção contra o leilão nunca foi a proibição — é o piso
calculado, que já existe e é fail-closed para item fora da tabela.

## 🔴 3. O que a Dioli promete sobre tráfego pago no plano Crescimento?

**Por que sobe:** é promessa ao cliente. O plano Crescimento diz *"campanha
desenhada rodando na conta do cliente"*; a auditoria da casa mede a frente em
**55%**, subir campanha e ler resultado estão em vermelho, e a conta de anúncios
da agência está restrita desde 03/08.

- **Saída A — retirar a linha de campanha do Crescimento** até a Meta liberar.
  *Custo:* o degrau de topo perde o que o diferencia do Conteúdo.
  *Risco:* baixo, e reversível.
- **Saída B — reescrever o que ele promete:** *"campanha desenhada, montada e
  entregue pausada na conta do cliente; quem liga é ele"*.
  *Custo:* uma linha de escopo.
  *Risco:* médio — o cliente pode ler "gestão de tráfego" onde está escrito
  "campanha entregue".
- **Saída C — manter como está.**
  *Risco:* alto — é vender o que não se pode entregar, exatamente o argumento que
  você já usou para **não** criar o plano de R$ 4.990.

**Recomendação: Saída B**, com a frase escrita no escopo e no contrato. É honesta,
preserva o degrau e é a única que sobrevive à pergunta do cliente *"quem liga a
campanha?"*.

## 🔴 4. A trava de publicação volta a ficar fechada até a Meta liberar?

**Por que sobe:** publicar em nome de um cliente é **irreversível**, e a chave é
sua. Medido em produção em 08/08: `PUBLICACAO_ORGANICA` estava **`liberada`** —
virada por você às ~16h44. O parecer da plataforma continua **NÃO PODE**. O
próprio registro chama isso pelo nome: *"uma trava desarmada"*. (Estado de hoje
não foi conferido nesta sessão.)

- **Saída A — devolver a chave ao estado fechado** até a análise da Meta correr.
  *Custo:* zero — nada publica hoje de qualquer forma, porque outras travas
  seguram.
  *Risco:* nenhum, e reversível com uma variável.
  *O que destrava:* a trava volta a ser trava, em vez de depender de as outras
  não caírem num conserto.
- **Saída B — manter liberada.**
  *Custo:* zero.
  *Risco:* **alto e irreversível** — se outra trava cair num conserto de rotina,
  a casa publica sozinha na conta de um cliente com aplicativo não revisado. É,
  letra por letra, o padrão que restringiu a conta de anúncios em 03/08.

**Recomendação: Saída A.** Uma chave que só protege enquanto outra trava não
falha não está protegendo nada. Você a religa em cinco segundos no dia em que a
Meta liberar.

## 🟡 5. O balcão continua aberto a pessoa física, ou a casa atende só empresa?

**Por que sobe:** define quem a marca atende. Sua decisão de 05/08 diz *"para
todas as pessoas"*; todo o resto do sistema (planos, esteira, portal) é escrito
para empresa.

- **Saída A — confirmar os dois segmentos:** balcão para qualquer pessoa, planos
  e esteira para empresa.
  *Custo:* zero — é o que está construído.
  *Risco:* baixo. Exige que a comunicação não misture os dois.
- **Saída B — fechar tudo a empresa.**
  *Custo:* mexer na vitrine e perder a porta de entrada barata.
  *Risco:* perder o funil que converte comprador avulso em cliente de plano.

**Recomendação: Saída A.** É o que já existe, é sua decisão registrada, e o
balcão é a única porta que gera receita sem depender da Meta.

## 🟡 6. Qual é o custo fixo mensal da casa?

**Por que sobe:** só você tem esse número. O `docs/precos.md` declara que, sem
ele e sem *"quantas contas a casa atende sem hora extra"*, **o piso de margem não
existe** — e o DRE hoje mede confiavelmente só o custo de IA.

- **Saída A — você informa o custo fixo** (ferramentas, hospedagem, chaves de IA,
  pró-labore, impostos) e ele entra no DRE como lançamento com procedência.
  *Custo:* uma conversa.
  *Risco:* nenhum.
  *O que destrava:* o piso de margem passa a existir, e a tabela de preço passa a
  ser defensável.
- **Saída B — seguir sem.**
  *Risco:* toda a coluna "sobra" da tabela de preço continua sendo margem de
  contribuição apresentada como lucro.

**Recomendação: Saída A**, mesmo que o número seja aproximado — desde que venha
rotulado como estimado, porque o DRE da casa **se recusa a somar estimado com
realizado sem rótulo**.

## 🟡 7. Qual é o preço de tabela do roteiro avulso?

**Por que sobe:** enquanto não existir, **todo** pedido de roteiro para na
triagem e espera alguém orçar à mão. A máquina se recusa a inventar o número — e
isso é o desenho funcionando.

- **Saída A — adotar R$ 290**, o mesmo valor que a tabela já pratica para
  *roteiro de reel*.
  *Custo:* uma linha na tabela e no catálogo.
  *Risco:* baixo — pode estar acima ou abaixo do trabalho real de um roteiro
  longo; revisável.
- **Saída B — manter sem preço e orçar caso a caso.**
  *Custo:* cada pedido de roteiro consome atenção humana.
  *Risco:* pedido parado é cliente esperando — foi assim que um roteiro seu ficou
  dois dias em `"novo"`.

**Recomendação: Saída A**, com a ressalva de que roteiro longo (acima de 60s) sai
como orçamento à parte.

## 🟡 8. O preço de transferência dos projetos da casa está confirmado?

**Por que sobe:** o registro diz *"sujeito a ajuste do CEO"* e ninguém ajustou.
São eles que aparecem no DRE como receita a faturar.

- **Saída A — confirmar como estão:** CityJobs R$ 3.490/mês + R$ 1.290 de
  implantação; Foocci R$ 2.050/mês.
  *Custo:* zero.
  *Risco:* baixo — são valores internos, não vão para cliente de fora.
- **Saída B — ajustar.**
  *Custo:* refazer os lançamentos.
  *Risco:* nenhum, desde que a procedência do novo número fique registrada.

**Recomendação: Saída A.** Os dois foram calculados contra a tabela da casa e
documentados item a item; mexer neles sem um custo medido só trocaria um número
justificado por um número novo.

---

## Como manter este arquivo

1. **Afirmação sem fonte não entra.** Se você não achar o documento ou o arquivo
   de código que sustenta a frase, escreva `não decidido` ou `não registrado` e a
   pergunta que falta.
2. **Número de preço nunca se escreve de memória.** Confira contra
   `docs/precos.md` **e** `lib/agency/planos.ts`, e rode
   `npx vitest run __tests__/comercial/preco-uma-fonte-so.test.ts`.
3. **Pergunta respondida pelo CEO sai da Parte 3 e vira registro** em
   `docs/decisoes.md`, na mesma sessão. O chat é a sala de reunião; o repositório
   é a memória.
4. **Lacuna que fechar, apaga-se com o commit que a fechou citado.** Lacuna que
   continuar aberta, fica — lacuna apagada sem ser resolvida é a única coisa pior
   do que lacuna.
