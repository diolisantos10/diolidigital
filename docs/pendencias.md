# Pendências — o que está aberto

> Última atualização: 01/08/2026.

---

## 🧹 Limpeza executada em produção — 01/08/2026

A casa foi zerada a pedido do CEO, no modo **Opção A** (`keep-clients`).

**Apagado:** 1 projeto, 2 entregas, 4 tarefas, 26 artefatos, 11 aprovações,
14 evidências, 10 acessos de portal, 4 conversas do portal, 4 aprendizados
pendentes do Brain, 2 eventos de atividade.

**Preservado:** os 2 cadastros de cliente, as **7 solicitações** (todas de volta
ao status `new`), os 182 insights do Radar, as 3 integrações e o login.

**Observação de quem executou:** não havia **nenhum** `BrandBrain` em produção —
o que a Opção A prometia preservar de mais valioso (cores, tom de voz, público
aprendidos) simplesmente não existia. Ou seja: **o sistema nunca gravou marca de
cliente nenhum.** Vale investigar por que, porque o motor de produção lê dali
(`run-execution.ts:211-219`) e cai para vazio sem avisar.

**Duas das 7 solicitações preservadas são lixo de teste** —
`UI Bridge Test 1781835336580` e `Dioli Digital Studio` (a própria agência).
Ficaram de pé porque a ordem foi preservar as solicitações; apagá-las é decisão
do CEO, e o modo `everything` ou uma exclusão pontual resolve.

`ALLOW_PRODUCTION_RESET` foi ligada para a operação e **desligada em seguida**.

---

## ✅ AÇÃO DE SEGURANÇA — RESOLVIDA em 01/08/2026

**As três credenciais expostas foram revogadas pelo CEO** — confirmado no
`HANDOFF.md` rev.2 (commit `465cf05`). Fica o registro do que aconteceu e do que
foi rotacionado:

| Credencial | Onde regenerar | Urgência |
|---|---|---|
| **App Secret da Meta** | painel Meta for Developers → Configurações básicas | **alta** — assina os webhooks |
| **Token de projeto do Railway** | Railway → Account Settings → Tokens | **alta** — dá acesso ao deploy e às envs |
| **Token do WhatsApp** (número de teste) | painel Meta → WhatsApp → API Setup | média — expira sozinho em ~24h |

Depois de regenerar, atualizar as variáveis `META_*` no Railway.

> Por que isso é grave e não burocracia: o App Secret é o que valida a assinatura
> dos webhooks. Quem o tiver pode forjar evento entrando no sistema como se fosse
> a Meta. O token do Railway dá acesso ao deploy e a todas as variáveis de
> ambiente — inclusive às outras credenciais.
>
> Origem: `HANDOFF.md` §f da branch `claude/meta-integration-axrlf3`
> (commit `7116cbb`).

---

## 🔴 P0 — o piloto roda sem rede embaixo

**Decisão do CEO (31/07/2026): o piloto roda 100% IA, sem revisão humana.** Nada
disto abaixo é teórico — é o que está entre um erro do modelo e um cliente pagante.

### 1. Os quality gates não protegem nada
Das **31** checagens em `lib/dioli-brain/quality-gates.ts`, **28 são
`autoCheckable: false`** — texto descrevendo o que um humano deveria conferir.
**Só 3 rodam.**

Com revisão humana era um checklist. Sem revisão humana é **decoração** — e as
quatro desligadas que mais importam são exatamente as falhas que chegam no
cliente: *sem alucinação*, *respeita a marca*, *corresponde ao briefing*, *riscos
verificados*.

**O que precisa existir:**
1. Piso determinístico — afirmação conferida contra `ClientKnowledgeSnapshot`
   (nome, número, prazo, serviço contratado)
2. LLM-judge para os subjetivos, com reprovação **bloqueante** e indisponibilidade
   **não-bloqueante**
3. Default do registry invertido — departamento sem gate executável = **REPROVADO**
4. Escada por departamento — sombra até haver evidência

> **Nota de procedência:** esta pendência esteve arquivada por engano no
> repositório do Foocci até 01/08/2026. Conferido: o Foocci não tem nenhuma
> ocorrência de `autoCheckable`. Uma pendência na casa errada não é etiqueta
> trocada — é uma pendência que ninguém pega.

### 2. A verdade do cliente é montada no cliente
`reason.ts` ainda depende de contexto entregue de fora — o próprio cabeçalho diz
*"Phase 2 will add ClientKnowledgeSnapshot"*. Enquanto o servidor não ler a verdade
do banco por conta própria, o raciocínio confia no que lhe entregam.

### 3. Escada por departamento não existe
Departamento novo deveria nascer em SOMBRA e subir com evidência. Rodar 100% IA
**não** significa pular a escada — significa que a escada é a única proteção que
sobrou.

---

## 🟠 A agência NÃO roda 100% no automático — auditoria de 01/08/2026

Pergunta do CEO, respondida contra o código (não contra este documento). O
diagnóstico antigo do `BACKLOG.md` — *"a tarefa não aciona o agente"* — **está
desatualizado**: o motor existe, produz com IA de verdade e dispara sozinho.
O problema mudou de lugar.

**O trecho que roda sozinho, hoje, de verdade:**
cliente aprova a proposta no portal → `app/api/portal/approvals/route.ts:125`
dispara `runProjectExecution` → o PM ordena os departamentos → Social, Design,
Tráfego e Analytics produzem com IA (`lib/agency/execution/run-execution.ts:268`)
→ um auditor LLM lê cada peça e manda refazer uma vez se reprovar → a entrega é
gravada e a tarefa fecha ligada a ela. Faltando material, o agente abre o pedido e
o PM cobra o cliente numa mensagem só.

**Os cinco furos que impedem o "100% automático":**

| # | Furo | Onde se comprova |
|---|---|---|
| 1 | **A peça pronta não chega ao cliente sozinha.** A aprovação nasce com `clientVisible: false` de propósito — quem apresenta é o PM, de uma vez. Só que esse PM é uma pessoa. A agência produz automático e o trabalho **fica parado dentro de casa**. | `run-execution.ts:339` |
| 2 | **"Material chegou → produz sozinho" não existe.** O `MaterialRequest` só muda por ação da agência e **nada redispara a produção** quando é atendido. Projeto travado por material fica travado para sempre. | `app/api/material-requests/[id]/route.ts` — nenhum `runProjectExecution` |
| 3 | **A rede de segurança está armada e ninguém puxa o gatilho.** `CRON_SECRET` **está** definida no Railway (conferido no painel em 01/08) — o endpoint responde. O que não existe é o **agendador**: `cronSchedule` do serviço está vazio, não há serviço de cron, e o `railway.json` não agenda nada. **O que falha na primeira passada nunca é re-tentado.** | `app/api/cron/execute/route.ts:18` + painel Railway |
| 4 | **A produção não começa sem alguém aprovar a direção.** É proteção deliberada e boa — mas é um passo humano. | `run-execution.ts:171` |
| 5 | **Nada impede uma peça errada de sair.** O auditor que roda **não bloqueia**: reprovou depois da revisão, publica assim mesmo com etiqueta `quality_flag`. Somado aos 28 de 31 portões desligados do P0 acima, a operação não tem freio. | `run-execution.ts:321-327` |

**Veredito:** roda sozinha de *"cliente aprovou"* até *"peça pronta na mesa"*. Não
roda antes, não roda depois, e não tem freio.

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Gemini é stub | `lib/ai/gemini-provider.ts` não está implementado — o registry oferece um provedor que não existe |
| Canvas nunca vira documento entregável | O motor produz, o cliente não recebe |
| Sem `middleware.ts` | Sessão validada em cada layout e handler — fácil esquecer um |

---

## 🧍 Fora do código — depende de gente

- **Compilar e arquivar os chats antigos.** Ver `docs/arquivo/README.md` para o
  protocolo. **Nenhum chat é fechado antes de exportado e minerado.**
- **Definir se o piloto sobe antes ou depois do P0 acima.** É decisão do CEO, e
  hoje a resposta honesta é: sem os gates, sobe sem proteção.
- **A senha do master mora no Railway — e é o único lugar onde ela existe.**
  Conferido no painel em 01/08/2026: `SEED_MASTER_PASSWORD` e `SEED_STAFF_PASSWORD`
  **estão definidas** em produção, e o login com elas funciona. A senha `dioli2025`
  dos scripts do repositório é rejeitada — ela não vale nada, e quem tentar por ali
  vai concluir errado que perdeu o acesso.

  Vale saber por quê, porque é frágil: o `seed-db.mjs` usa `INSERT OR IGNORE` (não
  toca usuário existente) e gera senha **aleatória a cada boot** quando a env não
  está definida. Se alguém apagar essas duas variáveis, a única via de recuperação
  é redefini-las e reiniciar — **não existe fluxo de "esqueci minha senha"** no
  sistema (`app/api/auth/` só tem `signin`, `signout` e o Google do briefing, que
  nem cria sessão).

  > A mensagem que o próprio seed imprime — *"use o fluxo de redefinição de
  > senha"* — **está errada**: esse fluxo não existe. Corrigir a mensagem, ou
  > construir o fluxo, é fila normal; sem isso a próxima pessoa perde uma hora
  > procurando uma tela que não está lá.

---

## ⏳ Aguardando terceiro — nada a configurar

### HTTPS do domínio raiz `diolidigital.com.br`
O `www` está no ar e responde HTTP/2 200. O **apex** (sem www) depende do Railway
emitir o certificado Let's Encrypt, automático depois de o DNS estabilizar.

Já feito no painel de DNS: `A` do apex → `69.46.46.22`, `MX` legado **removido**,
`TXT` de verificação adicionado, `CNAME` `www` → `g68qzvs8.up.railway.app`.

**Como confirmar** — de uma máquina normal, **não de dentro de um ambiente de
agente**: abrir `https://diolidigital.com.br` e ver o cadeado, ou
`curl -I https://diolidigital.com.br` devolver `HTTP/2 200`.

Se passar de ~2h, conferir no painel do Railway se o apex e o `www` estão listados
como **duas entradas separadas** de custom domain.

> Origem: `HANDOFF.md` §7.1 e §8.1 (commit `3f888f1`), minerado em 01/08/2026.

---

## 📡 Integração com a Meta — nada dispara sozinho hoje

Minerado do `HANDOFF.md` da branch `claude/meta-integration-axrlf3`
(commit `7116cbb`), em 01/08/2026. A camada está construída; o que falta é
ligação e aprovação de terceiro.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Template `proposta_pronta` PENDENTE na Meta** | Aviso de proposta **não é enviado** — o WhatsApp bloqueia mensagem proativa sem template aprovado |
| **Não há agendador chamando `/api/meta/dispatch`** (o `CRON_SECRET` **está** setado — conferido no Railway em 01/08; o que falta é quem chame) | Mesmo com template aprovado, o poll **nunca roda sozinho** e nada sai |
| **Token do WhatsApp é do número de teste, expira em ~24h** | O envio para de funcionar quando vencer. Para valer: token permanente de System User |
| **OAuth de IG/FB construído e NÃO testado ponta a ponta** | Publicação em IG/FB segue não verificada em produção |
| **App da Meta sem App Review nem verificação de negócio** | Só funciona com contas do próprio admin e com limite baixo. Falta ícone 1024×1024, URL de política de privacidade e categoria |
| **Número real da agência ainda não migrado para a API** | A caixa de entrada está pronta e vazia. **Decisão do dono** — migrar o número o remove do app do celular |

> **Armadilha que engana:** hoje tudo aponta para o **número de teste** da Meta,
> que só envia para destinatários pré-cadastrados no painel. O disparo "funciona"
> e não chega em ninguém de fora da lista.

---

## 🔧 A esteira comercial — o que está construído e o que trava

Minerado do `HANDOFF.md` rev.2 (commit `465cf05`), da sessão "chat da agência",
em 01/08/2026.

**O fluxo completo já existe ponta a ponta:**
`SDR briefing → auto-scope → agência envia proposta → cliente aprova no portal →
createProjectFromRequest → PORTÃO DE RECURSOS → runProjectExecution → entregas no
portal → cronograma`

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **"Material chegou → produz sozinho" não existe** | O portão segura a produção quando falta material, mas **nada retoma** quando o cliente envia. Projeto com material faltante fica **travado para sempre** |
| **O SDR está sendo refeito pelo Brain-mestre** | Se for reescrito sem cuidado, somem 3 regras já implantadas: espelhar a linguagem do cliente, perguntar recursos por serviço, e capturar canal + telefone. O front já grava `preferredChannel`/`prospectPhone` |
| **Aba "Entregas" lê do Zustand, não do banco** | Em `app/agency/projects/[id]/page.tsx`. Para projeto real de banco a aba aparece **vazia** — o trabalho existe e só é visto em `/agency/execution/[projectId]`. `/api/deliverables?projectId=` já devolve o conteúdo certo |
| **Entregas sem data — o Planner não é alimentado** | `/agency/planner` e o modelo `SocialPost` existem, mas o conteúdo produzido não entra com data. O cliente recebe conteúdo sem saber **quando vai ao ar** |
| **`ADMIN_TASK_SECRET` foi removido do Railway** | Está certo assim. **Se alguém re-adicionar, vira backdoor** que apaga e dispara dados de produção sem sessão |

**✅ Resolvido no caminho:** o envio real do WhatsApp. O gatilho
`ActivityEvent type="whatsapp_notify"` desenhado por esta sessão **agora é
consumido** pela camada Meta (`lib/integrations/meta/notifications.ts` + cron
`POST /api/meta/dispatch`, com outbox anti-duplicata). Falta só confirmar que o
cron está agendado de fato e que o telefone chega do briefing.
