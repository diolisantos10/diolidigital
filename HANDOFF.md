# HANDOFF — Dioli Agency OS

> Documento de transferência de sessão. Escrito para que **outra instância do Claude**
> (ou qualquer dev) continue o trabalho **sem precisar de explicação prévia**.
>
> - **Repositório:** `diolisantos10/dioli-agency-os-1`
> - **Branch de trabalho:** `claude/design-ux-ui-mfkhyl`
> - **Data:** 2026-08-01
> - **Marca pública:** Dioli Digital — *estúdio digital com IA* (sistema de design "HUMANTECH")

---

## 0. Leia isto primeiro (regras que NÃO são opcionais)

Antes de escrever qualquer código, leia, nesta ordem:

1. **`AGENTS.md`** — ⚠️ **Este NÃO é o Next.js que você conhece.** A versão aqui
   (`next@16.2.1`, React 19) tem breaking changes vs. o seu conhecimento de treino.
   **Leia o guia relevante em `node_modules/next/dist/docs/` antes de codar** e respeite
   avisos de deprecação. Ex.: `params` de rotas de API é `Promise` e precisa de `await`
   (veja o padrão em `app/api/projects/[id]/marketing/route.ts`).
2. **`CLAUDE.md`** — regras permanentes de design/UX/UI (resumidas na seção 3 abaixo).
3. **`DESIGN.md`** — fonte única de verdade visual (tokens, cores, tipografia,
   componentes, estados obrigatórios). O **brand book** em
   `docs/brand/Dioli_Digital_Brand_Book_v1.pdf` vence em caso de conflito.

Outros docs de contexto no repo: `ARCHITECTURE.md`, `DEPLOYMENT.md`, `BACKLOG.md`, `README.md`.

---

## 1. Contexto do projeto

**O que é:** um "Agency OS" — sistema operacional interno de uma agência digital (Dioli),
que orquestra o fluxo de um projeto de cliente do briefing à entrega, com "agentes" por
departamento (estratégia, design, social, ads, PM, brand hub etc.), um **portal do cliente**
para aprovação de entregáveis, e um cérebro ("Dioli Brain") que gera/scopa trabalho com IA.

**Stack (real, do `package.json`):**

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 16.2.1** (App Router), **React 19.2** |
| Linguagem | TypeScript |
| ORM / DB | **Prisma 7** com adapter **libsql** (`@prisma/adapter-libsql`, `@libsql/client`). **SQLite** local (`dev.db`); libsql/Turso em produção |
| Auth | JWT com **`jose`** + `bcryptjs` (sessão via `lib/auth`) |
| UI | **shadcn/ui sobre Base UI** (`@base-ui/react`), **Tailwind CSS 4**, `lucide-react`, `class-variance-authority`, `tailwind-merge` |
| Estado | **zustand** |
| IA | Provedores plugáveis (inclui **DeepSeek**); chaves geridas em tela (`AiKeyManager`) e resolvidas em `lib/ai/resolve-key.ts` |
| Testes | **vitest** (`__tests__/`) |
| Screenshots | **Playwright** (`scripts/shot.mjs`) |
| Deploy | **Railway** (`railway.json`); build standalone do Next |

**Node:** `>=22`.

**Estrutura de pastas relevante:**

- `app/agency/*` — telas internas da agência (dashboard, projects, execution, approvals,
  pipeline, agentes por departamento, integrations, settings…).
- `app/portal/*`, `app/briefing`, `app/vitrine`, `app/contato` — superfícies voltadas ao cliente.
- `app/api/*` — rotas de API (auth, projects, brain, portal, deliverables, briefings,
  ai-keys, health, marketing…).
- `components/agency/*` — componentes de UI da agência (inclui a Esteira e a Inteligência de Marketing).
- `lib/*` — domínio (auth, db, ai, dioli-brain, agency/execution…).
- `scripts/*` — utilitários (`seed-db.mjs`, `shot.mjs`, `start.sh`, diagnósticos Railway…).

---

## 2. Como rodar localmente (copiar e colar)

```sh
# 1. Banco local (uma vez): cria .env, provisiona SQLite e semeia
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'JWT_SECRET=dev-secret-local-only' >> .env
npx prisma db push && node scripts/seed-db.mjs   # login seed: master@dioli.studio

# 2. Servidor de desenvolvimento
npm run dev            # http://localhost:3000

# 3. Screenshots em 3 tamanhos (celular 375 / tablet / desktop)
node scripts/shot.mjs /auth/signin signin

# Testes
npm test               # vitest run
```

---

## 3. Regras de design (obrigatórias em TODA mudança visual)

Do `CLAUDE.md` + `DESIGN.md`:

1. **Seguir o `DESIGN.md`.** Usar **tokens**, nunca hex "na mão" quando existe token;
   nunca recriar componente que já existe.
   - Paleta oficial: Navy `#070A1F` (ação primária, sidebar, títulos), Cyan/mint `#9AF5F0`
     (assinatura visual — item ativo/foco, com parcimônia), Graphite `#1F2937` (texto),
     Off-white `#F7F8FA` (fundo — **nunca branco puro no fundo**), White `#FFFFFF` (cartões).
   - Tema aplicado em `app/globals.css`.
2. **Responsivo obrigatório.** Verificar em **3 tamanhos** (celular **375px** = prioridade,
   tablet, desktop) com screenshot Playwright (`node scripts/shot.mjs <rota> <nome>`).
3. **Auto-revisão obrigatória.** Após mudança visual: screenshot → auto-nota 0–10 em
   **hierarquia, tipografia, espaçamento, consistência**. Só apresentar ao usuário com
   **8+ em todas**; abaixo disso, iterar sozinho. Mostrar **antes/depois**.
4. Adicionar primitiva shadcn: `npx shadcn@latest add <nome>`.

---

## 4. O que foi feito nesta sessão

### 4.1 Design / UX / UI (Fases 1–6 — todas concluídas)

| Fase | Escopo |
|---|---|
| 1 | Fundação — tokens + componentes base |
| 2 | Idioma + rotas + correção de cores off-brand |
| 3 | Telas núcleo |
| 4 | Telas restantes |
| 5 | Portal do cliente + fluxo de aprovação (UX) |
| 6 | Passada mobile + QA final (tokeniza páginas de cliente: login, briefing, vitrine) |

### 4.2 "A Esteira" (fluxo do projeto que anda sozinho)

Introduzida uma esteira que faz o projeto avançar por fases e **conta a verdade na tela**,
avisando o cliente. Componentes novos: `EsteiraDoProjeto.tsx`, `FaixaDaEsteira.tsx`,
`FilaDeAvisos.tsx`, `portal/EsteiraDoCliente.tsx`. APIs: `app/api/avisos/route.ts`,
`app/api/projects/[id]/esteira/route.ts`, `app/api/portal/esteira/route.ts`. Coberta por
testes em `__tests__/esteira/*`.

### 4.3 Inteligência de Marketing por projeto (feature principal de dados)

Nova aba que **consolida numa tela só** tudo que a agência sabe do cliente: brand board,
personas (marca + comprador), território de conteúdo, posicionamento, redes/social e plano
de tráfego, além de KPIs e posts.

- **Backend:** `app/api/projects/[id]/marketing/route.ts` (GET).
  - **Regra de ouro:** liga **somente dado REAL** — parseado das canvases aprovadas do
    Brain (`BrainArtifact` por `clientRequestId`), do `BrandBrain` do cliente, das conexões
    Meta e dos posts. **Nada é inventado.** Campo ausente volta `null`/`[]` para a UI mostrar
    estado honesto ("não informado" / "conecte").
- **Frontend:** `components/agency/MarketingIntelligence.tsx` (client component) — consome
  o endpoint e renderiza os blocos com estados honestos.
- **Entradas:** aba dentro de `app/agency/projects/[id]/page.tsx`; e os **cards de
  departamento na Visão Geral** linkam para a aba de Inteligência.

### 4.4 IA / integrações (correções de fundo)

- **DeepSeek conectável** e o PM passou a **usar de fato a chave que está na tela**
  (`AiKeyManager.tsx`, `lib/ai/generate.ts`, `lib/ai/resolve-key.ts`,
  `lib/dioli-brain/pm-orchestrator.ts`).
- **Resource gate:** só produzir quando há material; senão, perguntar ao cliente
  (briefing do SDR com perguntas de recurso obrigatórias por serviço).
- **`/api/health`** passou a informar **qual versão está no ar**.

---

## 5. Decisões técnicas tomadas (e o porquê)

1. **"Dado real ou estado honesto" na Inteligência de Marketing.** Preferimos devolver
   `null`/vazio e mostrar "não informado / conecte" a inventar números. Motivo: é um painel
   de decisão de marketing — número inventado é pior que ausência.
2. **Consolidar leitura no backend, não no cliente.** O `route.ts` faz o fan-out
   (`Promise.all` sobre request, artifacts, brandBrain, connections, posts) e entrega um
   shape já normalizado. Mantém o componente burro e testável, e centraliza o parsing de JSON.
3. **Tokenizar tudo (fechar "deriva do raio-X").** Componentes novos da Esteira foram
   passados para tokens do `DESIGN.md` em vez de hex solto, para não abrir divergência visual.
4. **Chave de IA vinda da tela como fonte de verdade.** O PM/orchestrator agora resolve a
   chave via `resolve-key.ts` a partir do que o usuário configurou, não de env hardcoded.
5. **Padrão Next 16 respeitado.** `params` como `Promise` + `await` nas rotas; sessão via
   `requireSession()` (`lib/auth/api-guard`) com checagem de `workspaceId` (multi-tenant).

---

## 6. Arquivos alterados nesta sessão (principais) e por quê

| Arquivo | Por quê |
|---|---|
| `app/api/projects/[id]/marketing/route.ts` | **Novo.** Endpoint consolidado de inteligência de marketing (só dado real). |
| `components/agency/MarketingIntelligence.tsx` | **Novo.** Aba de UI que consome o endpoint acima. |
| `app/agency/projects/[id]/page.tsx` | Aba de Inteligência no projeto + entradas na Visão Geral (cards de departamento linkando). |
| `components/agency/EsteiraDoProjeto.tsx`, `FaixaDaEsteira.tsx`, `FilaDeAvisos.tsx`, `portal/EsteiraDoCliente.tsx` | Esteira do projeto + tokenização (fechar deriva visual). |
| `app/api/avisos/route.ts`, `app/api/projects/[id]/esteira/route.ts`, `app/api/portal/esteira/route.ts` | APIs da Esteira (avisos e fases, lado agência e portal). |
| `app/api/health/route.ts` | Passou a reportar a versão em produção. |
| `components/agency/AiKeyManager.tsx`, `lib/ai/generate.ts`, `lib/ai/resolve-key.ts`, `lib/dioli-brain/pm-orchestrator.ts` | DeepSeek conectável + PM usando a chave da tela. |
| `lib/agency/integrations.ts`, `app/api/ai-keys/*` | Suporte às integrações/chaves. |
| `__tests__/esteira/*`, `__tests__/execution/*`, `__tests__/brain/*` | Cobertura da Esteira, execução e provedores de IA. |
| Páginas de cliente (login, briefing, vitrine) | Tokenização no QA final da Fase 6. |

> Para ver o diff exato de um commit: `git show <hash>`. Histórico resumido na seção 9.

---

## 7. Problemas encontrados e como foram resolvidos

### 7.1 Domínio `diolidigital.com.br` não subia no apex (Railway)

**Sintoma:** `www.diolidigital.com.br` funcionava, mas o domínio **raiz** (sem www) não
carregava com HTTPS.

**Causa raiz:** DNS do apex apontando para o lugar errado e um registro **MX** legado
sobrando; além disso o registro **A** antigo tinha TTL de 4h, demorando a propagar.

**Resolução aplicada (no painel de DNS do usuário):**
- **A** (apex): `diolidigital.com.br → 69.46.46.22` (Railway). ✅
- **MX**: **removido**. ✅
- **TXT** de verificação: adicionado. ✅
- **CNAME** `www → g68qzvs8.up.railway.app`. ✅ (www no ar, HTTP/2 200).

**Como foi verificado:** DNS-over-HTTPS (`cloudflare-dns.com/dns-query`) confirmou A/MX/CNAME;
`curl` no apex retornou **301 → HTTPS** com header `x-railway` (Railway já recebe o tráfego).

> ⚠️ **Armadilha de diagnóstico deste ambiente:** o proxy de egress do ambiente de execução
> **intercepta o TLS** (o cert observado tem issuer "Anthropic Egress Gateway"). Por isso,
> checar certificado com `curl`/`openssl` daqui é **enganoso**. O sinal confiável de que o
> apex "só falta o cert emitir" (e não é config) é que o **`www` responde perfeito pelo mesmo
> proxy** — apenas o apex falha no cert. Não confie no erro de cert local; confie na comparação
> www vs apex e nos headers `x-railway`.

---

## 8. Pendências e próximos passos

### 8.1 Pendência aberta

| # | Pendência | Depende de | Ação |
|---|---|---|---|
| 1 | **HTTPS do domínio raiz** `diolidigital.com.br` (sem www) | Railway emitir o certificado (Let's Encrypt, automático após DNS estabilizar) | **Só aguardar** (minutos até ~2h). Nada a configurar. |

**Como confirmar que resolveu (do lado do usuário/produção real, não deste ambiente):**
abrir `https://diolidigital.com.br` no navegador e ver o cadeado; ou de uma máquina sem o
proxy: `curl -I https://diolidigital.com.br` deve dar `HTTP/2 200` com cert válido cobrindo o apex.

### 8.2 Próximos passos sugeridos

- Confirmar o cert do apex e, se demorar >2h, revisar no painel do Railway se o domínio raiz
  está listado como *custom domain* (às vezes precisa adicionar `diolidigital.com.br` e
  `www.diolidigital.com.br` como duas entradas).
- Continuar o backlog em `BACKLOG.md`.
- Manter a regra de screenshots 3 tamanhos + auto-nota 8+ em qualquer nova tela.

### 8.3 Estado do repositório no fim da sessão

- Branch `claude/design-ux-ui-mfkhyl`: **working tree limpa**, tudo commitado e enviado
  (antes deste HANDOFF).
- DNS: A/MX/www corretos. `www` no ar. Fases 1–6 e Inteligência de Marketing: concluídas.

---

## 9. Histórico de commits recentes (para orientação)

```
50450b2 Cards de departamento (Visão Geral) linkam pra aba de Inteligência
f36babf Ponto de entrada da Inteligência de Marketing na Visão Geral do projeto
d067a78 Tokeniza os 4 componentes novos da Esteira (fecha deriva do raio-X)
6335ad4 Aba "Inteligência de Marketing" no projeto (dados reais)
29b407e /api/health diz qual versão está no ar (#3)
7dccb09 DeepSeek conectável, e o PM finalmente usa a chave que está na tela (#2)
cb3bde7 A esteira: o projeto anda sozinho, a tela conta a verdade, e o cliente é avisado (#1)
b664000 Resource gate: only produce when we have the material, else ask the client
d2e6a67 SDR briefing: mandatory resource questions per service
f33bedb Agency execution view: show the produced deliverables, not just the scope
e680237 Portal: show the produced deliverable content on the approval card
aec6e6a Deploy Fase 6 (QA final + tokeniza páginas de cliente)
```

---

## 10. Onde procurar cada coisa (mapa rápido)

- **Inteligência de Marketing:** `app/api/projects/[id]/marketing/route.ts` +
  `components/agency/MarketingIntelligence.tsx` + aba em `app/agency/projects/[id]/page.tsx`.
- **Esteira:** `components/agency/EsteiraDoProjeto.tsx` (+ Faixa/Fila/Cliente) e APIs
  `esteira`/`avisos`.
- **Auth/sessão:** `lib/auth/*` (`requireSession`, `api-guard`), `jose` para JWT.
- **IA/chaves:** `lib/ai/*` (`generate.ts`, `resolve-key.ts`), `components/agency/AiKeyManager.tsx`.
- **DB:** `lib/db/client.ts`, `prisma/` (schema), seed em `scripts/seed-db.mjs`.
- **Design:** `DESIGN.md`, tokens em `app/globals.css`, screenshots via `scripts/shot.mjs`.
- **Deploy:** `railway.json`, `DEPLOYMENT.md`, `scripts/start.sh`, diagnósticos em `scripts/diagnose-railway-env.ts`.
