# HANDOFF — Dioli Agency OS

> **Repositório:** `diolisantos10/dioli-agency-os-1` (confirmado via `git remote -v`)
> **Branch de trabalho:** `claude/dioli-agency-os-architecture-kk7kp` (é onde este documento foi commitado)
> **Deploy:** Railway → `dioli-agency-os-1-production.up.railway.app`
> **Escrito por:** sessão "chat da agência" (uma de várias — ver seção F), Jul–Ago/2026.

> ⚠️ **SEM SEGREDOS AQUI.** Este arquivo pode ser público. Nenhuma chave, token, senha, telefone, e-mail ou nome de cliente real está escrito. Onde algo sensível seria citado, use `<em variável de ambiente>`.

---

## A) O que é o projeto + stack REAL (lida do `package.json`)

**Dioli Agency OS** — um sistema operacional de agência de marketing com IA: recebe o briefing do cliente (SDR conversacional), gera proposta, o cliente aprova no portal, e agentes de IA produzem as entregas por departamento.

Stack (confirmada no `package.json`):
- **Next.js `16.2.1`** (App Router) · **React `19.2.4`**
- **Prisma** com `provider = "sqlite"` + **`@prisma/adapter-libsql`** + **`@libsql/client`** — aceita URLs `file:` e `libsql://` **APENAS** (ver Armadilhas).
- **Zustand** (estado do cliente/UI) · **bcryptjs** (hash de senha) · **jose** (sessão JWT, `lib/auth/session.ts` + `middleware.ts`)
- **Tailwind** + **shadcn** (Base UI, `@base-ui/react`)
- Testes: **Vitest**. E2E/screenshots: **Playwright**. Node **>= 22**.
- Scripts-chave: `npm run dev`, `npm run build` (roda `prisma generate && next build && cópia dos estáticos p/ standalone`), `npm start` (`sh scripts/start.sh`), `npm run db:seed`.

---

## B) DECISÕES (com data e PORQUÊ — o porquê importa mais)

1. **Quem aprova a proposta é o CLIENTE, não o dono** *(2026-07-27)*
   Fluxo: agência **cria e envia** a proposta → cliente aprova **no portal** → isso cria o projeto e dispara os agentes.
   **Porquê:** decisão de produto do dono — "meu único botão é aprovar/reprovar; quem decide é o cliente". *Custo de desfazer:* volta a aprovação pro lado da agência e quebra o modelo inteiro "o cliente decide".

2. **Valores da proposta vêm do agente de orçamento (`computeEstimate`), a IA só EXPLICA** *(2026-07-27)*
   `lib/agency/live-calculator.ts` produz os números (itens + totais). A IA reescreve só a descrição, com explicação inline dos termos.
   **Porquê:** números não podem ser alucinados. *Custo de desfazer:* se deixar a IA gerar preço, ela inventa valor.

3. **Explicação de termos INLINE, não toggle de linguagem** *(2026-07-27)*
   Ex.: "3 criativos/semana (3 artes novas por semana)". Automático, sem botão.
   **Porquê:** o dono rejeitou toggle/acordeão manual ("coisa dos anos 90"); quer que sirva os dois públicos de uma vez, sem clique.

4. **Portão de recursos ANTES de produzir** (`lib/agency/execution/assess-resources.ts`) *(2026-07-27)*
   Na aprovação: "temos o material pra criar o que o cliente pediu?" SIM → produz. NÃO → abre `MaterialRequest` por item faltante + avisa o cliente no portal + **segura a produção**.
   **Porquê:** regra explícita do dono — não produzir no escuro. *Custo de desfazer:* agentes produzem sem base e a entrega sai confusa.

5. **SDR captura `preferredChannel` + `prospectPhone`** *(2026-07-27)*
   Mudei a regra do prompt que PROIBIA pedir contato.
   **Porquê:** o aviso por WhatsApp precisa do telefone (o login Google só dá e-mail).

6. **`generate()` re-tenta erro transitório (429/5xx/529/timeout)** *(2026-07-27, `lib/ai/generate.ts`)*
   Até 3 tentativas com backoff; erro permanente passa direto.
   **Porquê:** um soluço momentâneo da API derrubava uma entrega inteira — provado transitório (re-disparo com mesmo input funcionou).

7. **`start.sh`: retry no `prisma migrate deploy` (anti-lock)** *(2026-07-25)*
   **Porquê:** dois deploys simultâneos brigavam pelo lock do SQLite no volume e o `set -e` matava o container ("Deploy Crashed"). O retry sobrevive ao lock.

8. **Idempotência na criação de projeto + DELETE de projeto** *(2026-07-20)*
   A rota de review criava projeto duplicado (sem guarda); projetos de DB não tinham como ser apagados.
   **Porquê:** um reenvio criava 2 projetos idênticos.

---

## C) O QUE FOI TENTADO E NÃO FUNCIONOU (economiza o próximo)

- **Diagnosticar os "Deploy Crashed" como falta de memória (OOM) ou bug de código → ERRADO.** A memória estava tranquila (pico ~193 MB). A causa era **SIGTERM no container antigo durante a troca de deploy** (churn de vários agentes deployando) + a **corrida de lock do SQLite** (decisão B7). Não persiga OOM.
- **Achar que "IA indisponível" era truncamento de tokens OU rate-limit → REFUTADO por teste.** A geração do social funciona a 1800 tokens; 12 chamadas Claude concorrentes passaram todas. Era **blip transitório** da API. Não assuma truncamento/rate-limit sem testar.
- **Toggle/acordeão de linguagem manual → rejeitado** pelo dono. A solução certa foi explicação inline automática (decisão B3).

---

## D) O QUE FICOU ABERTO (com "o que quebra se ninguém mexer")

1. **Envio real do WhatsApp** — o gatilho já existe (emito um `ActivityEvent` com `type = "whatsapp_notify"` contendo o link do portal), mas **nada envia**. *Se ninguém construir:* o cliente nunca recebe o aviso "sua proposta está no portal". Dono: **agente da Meta** (chat/branch separado `claude/meta-integration`). Contrato: consumir esse ActivityEvent, pegar o telefone do briefing, enviar, e controlar já-enviados num outbox próprio.

2. **"Material chegou → produz sozinho"** — o portão de recursos (decisão B4) **segura** a produção quando falta material, mas **não há gatilho** que retome a produção quando o cliente envia os materiais (aba "Materiais"). *Se ninguém wirar:* projetos com material faltante ficam **travados pra sempre**.

3. **SDR sendo refeito pelo Brain-mestre** — o dono pediu ao Brain-mestre pra refazer o SDR (`app/api/sdr/chat/route.ts`). *Se ele reescrever sem cuidado:* somem 3 regras que adicionei — (a) espelhar a linguagem do cliente, (b) perguntar recursos por serviço, (c) capturar canal + telefone. E o front já grava `preferredChannel`/`prospectPhone`.

4. **Aba "Entregas" do projeto lê do Zustand, não do banco** — em `app/agency/projects/[id]/page.tsx`, `projectDeliverables` filtra `deliverables` do store (vazio pra projetos reais de DB). *Se ninguém corrigir:* a aba "Entregas" parece vazia; as entregas produzidas só aparecem em `/agency/execution/[projectId]`. (`/api/deliverables?projectId=` já devolve o conteúdo real.)

5. **Datas nas entregas (calendário editorial)** — as entregas não têm data de postagem. O **Planner** existe (`/agency/planner`, modelo `SocialPost`) mas o conteúdo produzido não o alimenta com datas. *Se ninguém ligar:* o cliente recebe conteúdo sem "quando vai ao ar".

6. **Admin headless** — o endpoint `app/api/admin/reset-request` aceita sessão master OU um header-secret (`ADMIN_TASK_SECRET`). O secret **foi removido do Railway** no fim da sessão. *Se alguém re-adicionar:* vira um backdoor que apaga/dispara dados de produção — trate como sensível.

---

## E) ARMADILHAS deste repositório (parece certo e não é)

1. **Prisma é `sqlite` + adapter libsql → só `file:` e `libsql://`.** Um `DATABASE_URL` PostgreSQL **falha**. `scripts/start.sh` rejeita URLs `postgres://` de propósito. **O serviço Postgres do Railway NÃO pode ser usado por este app.**
2. **DB de produção = SQLite num Railway Volume (`/data`).** Um `file:` fora do volume é apagado a cada deploy (filesystem efêmero). O `start.sh` garante o volume; não troque isso sem entender.
3. **O seed roda em TODO boot.** Ele faz `INSERT OR IGNORE` (não toca usuário existente) e só ROTACIONA a senha do master/staff quando `SEED_MASTER_PASSWORD`/`SEED_STAFF_PASSWORD` estão setados no ambiente. **Pra resetar a senha do master:** setar `SEED_MASTER_PASSWORD` `<em variável de ambiente>` e re-deployar.
4. **`currentRole` (o seletor "Visualizar como" do Zustand) ≠ papel da sessão.** Ações de admin gateadas em `currentRole` **somem** de um master real se o papel simulado não for "master". (Desamarrei o botão de excluir projeto disso, mas ainda existe em outros lugares.)
5. **`/api/projects/[id]/execution` lê `BrainArtifact` (o ESCOPO), não `Deliverable` (o PRODUZIDO).** Anexei os deliverables produzidos ali pra dar visibilidade. Se alguém "limpar" isso, o trabalho dos agentes some da tela de execução de novo.
6. **`run-execution.ts` engolia o erro real da IA** como "IA indisponível". Troquei pra logar o erro de verdade (linha ~250). Se reverterem, diagnosticar falha vira investigação de 1h.
7. **Só um agente deve mexer no mesmo arquivo por vez.** Vários chats commitam nesta mesma branch (ver F). **Sempre `git fetch` + `rebase` antes de `push`.** Deploys frequentes geram e-mails "Deploy Crashed" que são **falso-positivo** (SIGTERM na troca de container) — não é bug.

---

## F) O QUE EU SEI E NÃO ESTÁ ESCRITO EM LUGAR NENHUM

1. **O sistema é construído por VÁRIAS sessões Claude paralelas, na MESMA branch.** Isso explica o churn, os merges e as fronteiras de dono:
   - **"Chat da agência"** (esta sessão): proposta, negociação pós-briefing do SDR, gatilhos de execução, `portal-data`, portão de recursos, visibilidade das entregas.
   - **"Brain-mestre"**: o núcleo de raciocínio (`lib/dioli-brain/*`), o refactor do `run-execution` (PM conductor, quality auditor, Radar/insights, esteira, DeepSeek), commits "Fase 0–6" e "Merge #N".
   - **Agente de "design/UX"**: as telas do cliente (portal, páginas de projeto, "tokeniza páginas").
   - **Agente da "Meta"** (branch separada `claude/meta-integration`): Instagram/Facebook/WhatsApp.
   *Não confirmado:* os nomes/limites exatos de cada sessão — inferido pelos commits.

2. **As chaves de IA NÃO são variáveis de ambiente.** Ficam **criptografadas no banco** (`DbIntegrationConfig.apiKeyEncrypted`), setadas pela tela de Integrações. `lib/ai/resolve-key.ts` checa o banco primeiro, o ambiente depois. **Um Railway sem env de IA NÃO significa "sem IA" — cheque as Integrações.**

3. **"Camila"/piloto existe em DOIS sistemas diferentes** e isso já causou confusão entre sessões: o simulador de restaurante (Foocci — feature de treino/simulação, onde nomes de pessoa são exemplos sorteados) E o cliente-piloto real da agência. Não confunda os dois.

4. **O conteúdo (proposta e entregas) é exibido via o campo `reviewNote` do `ApprovalRequest`.** Reaproveitei `reviewNote` pra carregar o texto da proposta E, no `portal-data`, juntei o conteúdo do `Deliverable` a ele. **Não há FK formal entre `ApprovalRequest` e `Deliverable`** — o "join" é por agente-dono, com fallback por ORDEM (frágil). Um link real (ex.: `artifactId`/`deliverableId`) seria mais robusto.

5. **Existem DOIS caminhos que criam um projeto:** (a) a rota de review da agência (`/api/brain/auto-scope/[id]/review`) na aprovação da agência, e (b) o cliente aprovando a proposta no portal → `createProjectFromRequest`. Ambos têm guarda de idempotência. *Não confirmado:* se o caminho (a) ainda é usado pela UI depois da decisão B1 — vale checar antes de remover qualquer um.

6. **O fluxo comercial completo, ponta a ponta (o que foi construído e testado nesta sessão):**
   `SDR briefing → auto-scope → agência cria/envia proposta → cliente aprova no portal → createProjectFromRequest → PORTÃO DE RECURSOS (tem material? produz : pede) → runProjectExecution → entregas no portal p/ o cliente aprovar → cronograma pós-aprovação`.
