# O ESTADO REAL DA CASA — 08/08/2026

> **Este é o mapa da agência.** Ordem do CEO em 08/08/2026, a partir de uma
> auditoria externa feita **contra o código em produção**, não contra os nossos
> registros.
>
> **Ele VENCE qualquer documento que o contradiga.** Documento que discordar
> daqui está errado e é corrigido na mesma sessão — não o contrário.
>
> Ele substitui, como fonte de verdade sobre o estado da casa:
> `.claude/agents/esteira.md` · `BACKLOG.md` · `docs/pendencias.md`.

---

## 1. O DIAGNÓSTICO CENTRAL — e ele explica o dia inteiro

**O CEO age num lugar; o código lê outro; nenhuma tela diz qual metade falta.**

Três ocorrências medidas, o mesmo defeito nas três:

| Assunto | Onde ele agiu | Onde o código lê |
|---|---|---|
| **Publicação** | marcou o ativo na tela | **também** exige `PUBLICACAO_ORGANICA` do ambiente, **sem tela nenhuma** |
| **Preço** | tabela dos 5 planos em `docs/precos.md` | `SELF_SERVE_CATALOG` em `lib/agency/self-serve-catalog.ts` — **nenhum dos 5 nomes existe lá** |
| **Material** | organizou pastas no Drive | `material-do-drive.ts` exige `mediaAssetId` **e** `papelConfirmadoEm`; **pasta nem é pedida ao Google** |

### A REGRA QUE RESOLVE OS TRÊS

> **Toda tela mostra o estado dos DOIS lados do interruptor, nunca só o lado que
> ela controla. Faltando a outra metade, ela diz QUAL e ONDE.**

É a única mudança de arquitetura que importa nesta rodada. Um interruptor com
duas metades e uma tela que só desenha uma delas não é uma tela incompleta — é
uma tela que **mente por omissão**, porque o operador conclui do silêncio que a
metade que ele vê é a única que existe.

---

## 2. O QUE FOI MEDIDO EM PRODUÇÃO EM 08/08/2026

Medido pelo PM contra `https://www.diolidigital.com.br`, com sessão de admin.
Números, não intenção.

### 2.1 Publicação — **0 posts publicados**, e o interruptor NÃO era a causa

| Fato | Valor medido |
|---|---|
| `PUBLICACAO_ORGANICA` em produção | **`liberada`** (virado pelo CEO ~16h44 de 08/08) |
| Posts no workspace | 14 (6 `scheduled`, 8 `draft`) |
| `scheduled` com hora **já vencida** | **2** (07/08 10:00Z e 08/08 10:00Z) |
| **Publicados** | **0** |
| `lastError` dos dois vencidos | `Only photo or video can be accepted as media type.` |
| MIME das 36 telas dos carrosséis | **`image/png`** (conferido pelo `content-type` de `/api/media/<id>`) |

**A causa raiz:** o Instagram **só aceita JPEG** na publicação por API.

> *"O único formato de imagem compatível é o JPEG. Não há compatibilidade com
> formatos derivados de JPEG, como MPO e JPS."*
> — `docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md`, linha 82

A casa gera **PNG**. Não havia trava conferindo isso: a casa **descobria o
formato errado perguntando à Meta**, e como um post que falha continua
`scheduled` de propósito, o despertador retentava **a cada 5 minutos, para
sempre** — ~24 criações de container recusadas por hora, contra a conta de um
**cliente**, com o app em modo de desenvolvimento e **sem App Review**.

**Isso é, letra por letra, o padrão que restringiu a conta de anúncios da
agência em 03/08.** A Meta audita a atividade do app e pune o **APP**;
tentativa recusada conta como tentativa (`fontes/termos-da-plataforma.md`).

**Conserto entregue nesta rodada:** `lib/integrations/meta/formato-de-midia.ts`
— trava fail-closed, **antes de qualquer byte sair**, com a frase nomeando as
duas metades (o que o arquivo é · o que a Meta exige · que o conserto é a arte,
não a conexão). Provada nas duas metades em
`__tests__/meta/formato-de-midia.test.ts` (14 testes).

### 2.2 O parecer da trava de plataforma — **NÃO PODE**

A regra de 03/08 exige parecer do especialista `meta` antes de qualquer escrita.
**O parecer é NÃO PODE**, e ele vale mesmo depois do PNG virar JPEG:

- **Foocci é CLIENTE** — pessoa **sem função no app**. A cartilha é explícita:
  *"se o app se destina a ser usado por pessoas sem função nele, ele precisa
  passar pela análise"* (`cartilha.md`, "App Review — quando é obrigatório").
- **O App Review não foi enviado.** Está bloqueado desde 06/08 por
  `META_LOGIN_CONFIG_ID` ausente no Railway — *"app não testável = envio
  rejeitado"* (`docs/plataformas/meta/app-review.md`).
- **O escopo estar no token não é permissão.** Ele está lá porque quem clicou
  "Conectar" foi o CEO, que é admin do app. Confundir "a API deixou" com "pode"
  é o que custou a conta em 03/08.

> **Consequência que precisa estar dita com todas as letras:** hoje, em
> produção, a **única** coisa que impede a casa de publicar no Instagram de um
> cliente é o bug do PNG. Consertar o PNG sem resolver o App Review **liga a
> publicação automática** na conta de um cliente, com um app não revisado.
> `PUBLICACAO_ORGANICA=liberada` é, neste momento, uma trava desarmada.

---

## 2.5 🟢 16/08/2026 — A ESTEIRA COMERCIAL PASSOU A ANDAR SOZINHA

**A consequência, primeiro:** briefing que entra pela porta pública é levado à
cadeia **pelo relógio**, sem ninguém empurrar, e termina em card de aprovação
humana. Enquanto não anda, ele **aparece** — com motivo em português, dono e
idade — em vez de sumir.

**O que estava quebrado, e as duas causas eram silenciosas:** a allowlist de
execução era por `clientId` e morria no reset; e **não existia correia** entre
`POST /api/brain/client-requests` e `executarCicloAssistido` — o motor só
rodava por chamada à mão. Registro completo em `docs/decisoes.md`.

**O que passou a existir:**

| Frente | Onde |
|---|---|
| Autorização por AGÊNCIA (sobrevive ao reset e a cliente novo) | `lib/agency/esteira-assistida/autorizacao.ts` |
| A porta aciona a esteira, a cada passada do relógio | `varredura.ts` + `varredura-no-banco.ts`, perna nova no `despertador.ts` |
| Recusa com motivo, dono e idade — inclusive antes de o motor abrir | `recusa-visivel.ts`, `RecusaV2`, e a sala do PM |
| Handoff com PRAZO (da ficha de quem recebe) e cobrança do que estourou | `cadeia.ts` + `vigilancia-de-handoff.ts` + `vigilancia-no-banco.ts` |
| A ficha inteira chega ao agente em execução (inclusive os gatilhos humanos) | `adaptador-de-ia.ts` → `fichaComoPrompt` |
| O interruptor virou BOTÃO, não `curl` | `components/agency/LigarAEsteira.tsx` |

**As travas de dinheiro, porque isto gasta sozinho:** teto por rodada ·
fail-closed na autorização · reserva condicional antes de gastar (`updateMany`
com `status: "new"` no filtro, não ler-e-depois-escrever) · retomada
idempotente pelo registro · recusa repetida não regrava (regravar zeraria a
idade, que é a informação).

**Teste de aceite, rodado ponta a ponta contra banco de verdade:** o briefing
do CityJobs sai de `ClientRequestDb`, atravessa
`pm-orchestrator → brand-architect → social-strategist → editorial-planner →
copywriter → graphic-designer`, cria os handoffs com prazo e chega ao card de
aprovação. Na **mesma passada**, o Sushi Cazza (sem canal, 51 dias) é
**recusado sem gastar nada**, com o motivo escrito.

### 🔴 O QUE NÃO FOI FEITO, E POR QUÊ

- 🔴 **O briefing do CityJobs em PRODUÇÃO não foi movido.** Daqui só há HTTP e
  `POST /api/v2/assistido` responde **401** (medido). Não há `CRON_SECRET` nem
  sessão de admin neste ambiente. **É o mesmo padrão do último metro** já
  registrado cinco vezes — a diferença é que agora o último metro é **um clique
  no botão da sala do PM**, não um `curl`.
- 🔴 **A esteira nasce DESLIGADA, e isso é deliberado.** Ligar é decisão
  registrada do dono. Enquanto o CEO não clicar, o deploy **não muda
  comportamento nenhum** — a fila só passa a ser visível.
- ⚠️ **A qualidade do artefato depende de provedor de IA.** Sem chave, o
  adaptador degrada para o rascunho determinístico declarado (Lei 2). Neste
  ambiente não há chave, então o aceite provou **o caminho**, não o texto final.
- ⚠️ **Aceite de handoff continua sendo do recebedor.** O gavião **cobra**; ele
  não aceita no lugar de ninguém (há teste que reprova quem lhe der o verbo).
- ⚠️ **`Client` continua sem `@@unique(workspaceId, name)`.** A varredura
  deduplica por nome em código — melhor que as duas rotas que não deduplicam
  nada —, mas a trava de banco continua sem dono.

---

## 3. AS OITO FRENTES DESTA RODADA

Ordem de execução decidida pelo CEO. **Na ordem, 1 a 8.**

1. **Destravar o que já está pronto.** → *ver §2.1 e §2.2. Resultado: **0
   publicados**; a trava de formato entrou; publicar continua **NÃO PODE** até o
   App Review.*
2. **O preço vira UMA fonte só.** Os 5 planos de `docs/precos.md` (Pulso 49 ·
   Ritmo 297 · Presença 790 · Conteúdo 1.390 · Crescimento 2.590, com
   implantação e avulso) entram no código; o documento passa a apontar para lá.
   Hoje há **duas verdades sobre dinheiro** e nenhuma tela mostra a divergência.
3. **Toda tela mostra os dois lados do interruptor.** A correção do diagnóstico
   central. Vale para publicação, preço e material.
4. **Material: pare de pedir pasta, peça ARQUIVO.** Ler pasta do Drive foi
   **descartado** em 08/08. O caminho é portal → **"Enviar arquivos"** →
   declarar o papel. **Comece pelo logo:** sem arquivo de logo declarado, toda
   peça do cliente sai com o nome em fonte comum. A Foocci tem **1 arquivo
   recuperado, sem papel declarado** — a tela precisa cobrar isso de forma
   óbvia.
5. **Dê ao produtor o que falta para acertar.** Ele recebe **7 linhas**
   (`lib/agency/execution/run-execution.ts:48-58`): nome, segmento, público,
   tom, serviços, objetivos, headline. **Nenhuma proibição, nenhuma referência
   visual.** E não há onde guardar: `BrandBrain` tem 11 campos de texto e
   **nenhum** de proibição ou referência — *"nunca escreva o nome em texto
   gigante"* **não tem endereço**. Criar os campos **e fazer o produtor
   recebê-los**. É a causa raiz da peça reprovada em 08/08.
6. **A reprovação vira dado.** Não há contador de voltas nem histórico por peça
   — por isso a peça 3 repete o erro da peça 1.
7. **Alinhe a economia de imagem ao que foi pedido.** O CEO pediu reaproveitar
   por **~7 dias**; o código usa **14** e dispara com 36h. E **cai em fundo
   chapado em silêncio** quando não há chave — ninguém sabe se a peça saiu feia
   por economia ou por falha. **Sem chave, a peça reprova e avisa.** Economia
   que destrói o produto é defeito de desenho.
8. **Aposente os três documentos que mentem.** → *§4.*

---

## 4. OS TRÊS DOCUMENTOS APOSENTADOS

Não se apaga memória: **arquiva-se o que é histórico**, e cada um passa a
apontar para cá **na primeira linha**.

| Documento | Por que mente |
|---|---|
| `.claude/agents/esteira.md` | **O mais urgente.** Manda o especialista *"repetir sem medo"* três frases falsas desde 01/08 — cada despacho de esteira nascia envenenado. |
| `BACKLOG.md` | Parado em 22/06. |
| `docs/pendencias.md` | 3.476 linhas, 29 seções já concluídas. |

### As três frases falsas de `.claude/agents/esteira.md`

Ficam registradas aqui para que ninguém as reintroduza de boa-fé:

1. ~~"O portal **só** mostra conteúdo se alguém criou o Deliverable **na mão**."~~
2. ~~"O fluxo aprovar → publicar no portal **nunca foi testado ponta a ponta**."~~
3. ~~"Vários departamentos produzem por **template, com zero IA**."~~

O que é verdade em 08/08: a esteira agenda sozinha
(`agendarPostsDaEntrega`), a aprovação do cliente promove a peça a `scheduled`
(`app/api/portal/approvals`), e o relógio publica (`publicarAgendados`). A
corrente está ligada de ponta a ponta — **o que a segura hoje é o formato da
imagem e o App Review, não a falta de código.**

---

## 5. COMO SE FALA COM O CEO

- **Sobe a ele SÓ decisão de dono:** preço, o que o produto promete, gastar
  dinheiro, risco irreversível, prioridade entre blocos.
- **NÃO sobe:** merge, deploy, teste, defeito de tela, achado de segurança.
  Isso **conserta-se** e informa-se **o que foi consertado**.
- **Antes de pedir qualquer coisa a ele, PROCURE.** Em 08/08 ele foi perguntado
  três vezes por coisas que já existiam no repositório.
  **Silêncio da sua memória não é ausência de informação.**
- Relatório em quadro **FEITO / EM ANDAMENTO / NÃO INICIADO**, sem prosa.

### Duas perguntas que estão PROIBIDAS, porque já foram respondidas

- **Preço:** os 5 planos de `docs/precos.md` são a verdade. O trabalho é
  trazê-los para o código, **não perguntar de novo**.
- **Material:** portal → "Enviar arquivos" → declarar o papel. **Ler pasta do
  Drive foi descartado.** Não peça pasta.

---

## 6. CONTEXTO DE URGÊNCIA

**O CEO tem fila de clientes esperando social media e ainda não chegou em
tráfego pago.** Cada dia parado é cliente não atendido.
