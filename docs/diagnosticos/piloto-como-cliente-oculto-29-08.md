# O piloto percorrido como cliente oculto — 29/08/2026

> **O que este documento é.** A esteira comercial percorrida ponta a ponta com um
> cliente fictício, **em banco local**, com olho de dono e sem aprovar tudo:
> pedir ajuste, recusar, cancelar, e errar de propósito.
>
> **Cliente de teste:** `[TESTE] Padaria do Vale` — criado **só no `dev.db` local**
> deste worktree. Nada em produção. Nenhuma mensagem a pessoa real. Nenhuma
> chamada a Meta, Google ou TikTok. Nenhuma cobrança.
>
> **Frente reivindicada:** `piloto/cliente-oculto-29-08`
> (`reivindicacoes/piloto-cliente-oculto-29-08.json`).

---

## 0. Primeiro, a honestidade: o app SUBIU, e o que quebrou antes dele

O app subiu e foi percorrido de verdade — HTTP real contra `localhost:3000`,
screenshots reais em 375px. Mas **a receita de boot que está no `CLAUDE.md` não
funciona como está escrita**, e isso é o primeiro defeito do percurso, porque é o
primeiro que qualquer pessoa nova encontra.

```
$ node scripts/seed-db.mjs
🌱 Seeding Dioli Agency OS…
✓ Demo data removed
✓ Workspace
Error: SEED_MASTER_PASSWORD não está definida. O seed NÃO inventa senha e NÃO cai
num padrão. (scripts/seed-db.mjs:19)
```

Duas coisas:

1. **A instrução no `CLAUDE.md` está incompleta.** Ela manda rodar
   `node scripts/seed-db.mjs` e prometer `login: master@dioli.studio`. O script
   exige **duas** variáveis que a instrução não menciona: `SEED_MASTER_PASSWORD`
   e `SEED_STAFF_PASSWORD` (`scripts/seed-db.mjs:87` e `:88`). A recusa em si
   está **certa** — seed que inventa senha é buraco de segurança. Errado é o
   manual.
2. **O script apaga antes de conferir.** `✓ Demo data removed` sai **antes** da
   validação das senhas. Ou seja: rodar o comando documentado destrói o banco e
   só então falha. Conferir as variáveis é barato e tem de vir primeiro.

Comando que funciona de verdade:

```sh
SEED_MASTER_PASSWORD='...' SEED_STAFF_PASSWORD='...' node scripts/seed-db.mjs
```

Nenhum comando (`npm`, `npx`, `node`) foi recusado pelo ambiente.

---

## 1. A bateria que já existe — rodada, não reconstruída

`npm run cliente-falso` foi executada (offline, R$ 0,00). **Placar real, sem
maquiagem:**

> ## 🚫 A casa quebrou em 2 de 18 verificações.

| | |
|---|---|
| **Passou** | 12 verificações |
| **Quebrou** | 2 — `nasce-sem-painel` e `execucao-anda` |
| **Não medido** | 4, declarados com o porquê |
| **Fora do escopo por decisão do CEO** | 1 (publicar no Instagram/Google não é etapa desta esteira) |

**O que quebrou, na letra do placar:**

- *"O briefing aceito pelo cliente tem de virar projeto sozinho"* → **a porta do
  aceite recusou (409)**.
- *"A execução do projeto tem de PRODUZIR"* → *"direção aprovada e a execução não
  produziu NADA (projeto em `idle`, 0 tentativa(s), 0 entregas)"*.

**O que a bateria declara NÃO medido** (recusa declarada, e ela vale):

- o guarda do SDR (10ª verificação) — exige `--ao-vivo` e `ANTHROPIC_API_KEY`.
  **Não forcei.** Continua não medido.
- a rota autenticada de aprovação de escopo — *"a função foi chamada direto — a
  camada de autenticação NÃO foi exercida"*.
- projeto chegar a `done` e a peça ser aprovada pelo cliente — sem chave de IA
  não há peça produzida.

> **É exatamente esse buraco que este bloco preencheu.** A bateria chama
> **funções**; ninguém tinha percorrido as **rotas HTTP** como o cliente. Tudo da
> seção 3 em diante é rota real, com `curl`, contra o app rodando.

---

## 2. 🔴 O ACHADO PRINCIPAL: as duas portas da proposta mentem, e mentem coisas opostas

O `409: sem motivo` da bateria não era um mistério — era um **instrumento cego**.
A porta do aceite devolve o motivo no campo `mensagem`; a bateria lia só
`error`, e imprimia "sem motivo" sobre uma resposta que tinha motivo.

**Consertei isso** (é pequeno, local e obviamente certo — ver seção 8) e re-rodei.
O motivo real apareceu:

```
a porta do aceite recusou (409): Esta proposta já foi respondida.
Se você mudou de ideia, é só escrever na conversa aqui do portal — a equipe
retoma com você. [solicitação em "scope_ready"]
```

E aí o defeito de verdade ficou visível. **Medido ao vivo, com o cliente de teste
em `scope_ready`:**

```
$ curl ".../api/portal/briefing/proposta?token=$TOK"
HTTP 200
{"negocio":"[TESTE] Padaria do Vale","decidivel":false,"status":"scope_ready",
 "motivo":"a proposta ainda está sendo montada"}

$ curl -X POST ".../api/portal/briefing/aceite" -d '{"token":"'$TOK'","decisao":"aceito"}'
HTTP 409
{"ok":false,"jaDecidido":true,"status":"scope_ready",
 "mensagem":"Esta proposta já foi respondida. ..."}
```

**Sobre o MESMO estado, as duas portas dizem coisas opostas — e as duas são
mentira:**

| Porta | Arquivo | O que diz sobre `scope_ready` | Verdade |
|---|---|---|---|
| lê | `app/api/portal/briefing/proposta/route.ts` (via lista compartilhada) | *"a proposta ainda está sendo montada"* → `decidivel: false`, **tela não desenha botão** | o orçamento **já está na mão do cliente** |
| escreve | `app/api/portal/briefing/aceite/route.ts:118-128` | *"Esta proposta já foi respondida"* → **409** | o cliente **nunca respondeu** |

**A raiz, com arquivo e linha:**

`lib/agency/esteira/caminho-automatico.ts:277-279`
```ts
export const ESPERANDO_DECISAO_DA_PROPOSTA: readonly string[] = [
  "proposal_pending", "proposal", "negotiation",
];
```

`scope_ready` **não está na lista**. E `scope_ready` é um estado em que o cliente
chega com a proposta na tela, por pelo menos três caminhos:

- **`lib/agency/execution/negotiate-proposal.ts:68`** — este é o pior. É o
  caminho de **quem pede ajuste na PROPOSTA** (`app/api/portal/approvals/route.ts:477`).
  A função monta a proposta ajustada com preço, cria um card visível cujo texto
  termina em *"✅ Se ficar bom pra você, é só aprovar aqui embaixo que a gente
  começa."* — e grava a solicitação em `scope_ready`.
- `lib/dioli-brain/run-auto-scope.ts:86`
- `app/api/admin/reset-request/route.ts:245`

> **Traduzindo para o dono do negócio: o cliente que NEGOCIA o preço cai num
> beco.** A casa manda a proposta nova dizendo "é só aprovar aqui embaixo", e a
> porta de aceitar responde que ele já respondeu. **O projeto não nasce.** É a
> etapa em que a esteira vira dinheiro.

Existe um promotor de estado — `entregarOrcamentosPendentes()`
(`lib/agency/esteira/orcamento-do-briefing.ts:958` lê `scope_ready`, `:1085`
grava `proposal_pending`) — mas ele só cobre **um** dos caminhos de entrada. Os
outros dois deixam o cliente parado num estado que as duas portas leem errado.

O conserto de 6ª rodada (*"a lista é UMA, e quem lê e quem escreve leem a mesma"*)
unificou a lista — e com isso fez as **duas** portas errarem de forma consistente.
Unificar sem completar a lista trocou uma divergência por um erro em dueto.

**Não consertei.** Mexer nessa lista tem consequência de contrato e de pagamento;
é decisão da esteira, não de quem mede.

---

## 3. A tabela do percurso — passo a passo, o que funcionou

Legenda: ✅ funciona · ⚠️ funciona com furo · 🔴 quebra · ⛔ não percorrido

| # | Passo | ? | O que a pessoa vê | O que falta |
|---|---|---|---|---|
| 1 | Briefing público `/briefing` | ✅ | Formulário limpo em 375px, com saída honesta: *"Prefiro não deixar contato agora"* + *"Sem contato, a resposta só aparece aqui no portal — não temos como te avisar"* | nada |
| 2 | Conversa com o SDR | ⚠️ | Bateria offline: 14 perguntas, sem repetição, nome e documento respeitados | **guarda do SDR não medido** — exige chave paga |
| 3 | Extração do briefing | ✅ | Volume (14/semana) e verba (R$ 500) chegam ao orçamento | verba é guardada como frase crua (`"Nosso orçamento é de R$ 500 por mês."`), não como número |
| 4 | Orçamento com preço | ✅ | R$ 790–790/mês, confiança "high", e a diferença contra a verba é nomeada na cara | nada |
| 5 | **Aceite da proposta** | 🔴 | **409 "Esta proposta já foi respondida"** sobre `scope_ready`; e a tela nem desenha botão | **seção 2** |
| 6 | Projeto e tarefas | 🔴 | Projeto não nasce (consequência do 5) | — |
| 7 | Departamento produz | ⛔ | *"execução não produziu NADA — projeto em `idle`, 0 tentativas"* | **sem `ANTHROPIC_API_KEY`. PAREI aqui, como manda a ficha.** |
| 8 | Portal do cliente | ✅ | Ver §5 — a melhor tela da casa | ver §6 |
| 9 | **Aprovar** | ✅ | `200` · card vira "Aprovado por você" · rastro em `TransicaoDeEstado` | nada |
| 10 | **Pedir ajuste** | ✅ | `200` · a refação não pôde entregar e a casa **devolve a decisão**: card reabre em `pending` com aviso gêmeo | ver §4 (o corpo da resposta mente) |
| 11 | **Recusar** | ✅ | `200` · mensagem no portal: *"recusa registrada, e eu NÃO vou publicar nada disso 🛑 ... alguém da equipe vai falar com você"* · `ActivityEvent: refacao_escalada` | nada — é o caminho mais bem-feito dos quatro |
| 12 | **Cancelar** | ⚠️ | `200` · card vira "Cancelado por você" — **e mais nada acontece** | ver §6.1 |
| 13 | Dúvida | ✅ | `200` · card fica `pending`, "Dúvida aberta", "prazo pausado" | não gera evento para a agência |

---

## 4. Onde o percurso quebra — com arquivo, linha e prova

### 4.1 🔴 As duas portas da proposta — §2 acima
`lib/agency/esteira/caminho-automatico.ts:277-279` · provado por `curl` ao vivo.

### 4.2 🔴 O cliente lê "Não consegui registrar sua resposta" quando a casa sabe exatamente o que houve

`app/proposta/[token]/page.tsx:406-410`
```ts
const corpo = (await res.json()) as { mensagem?: string; error?: string };
if (!res.ok) {
  setErro(corpo.error ?? "Não consegui registrar sua resposta. Tente de novo.");
```
O 409 do aceite **nunca** preenche `error` — ele preenche `mensagem`
(`app/api/portal/briefing/aceite/route.ts:119-127`). Logo `corpo.error` é sempre
`undefined` nesse ramo e a tela cai no genérico. **A casa tem a frase certa
escrita e joga fora na última linha.** É o mesmo defeito que cegou a bateria, na
tela de verdade.

### 4.3 🔴 Link de portal sem token cai num 404 em inglês, sem marca e sem volta

```
$ curl -o /dev/null -w '%{http_code} -> %{redirect_url}' /portal/access
307 -> http://localhost:3000/portal/invalid
$ curl /portal/invalid   →  HTTP 404
```
`app/portal/access/route.ts:37` redireciona para `/portal/invalid`, **que não
existe**. Não existe `app/portal/invalid/page.tsx` nem `app/not-found.tsx`
(conferido: `find app -iname "not-found*" -o -iname "*invalid*"` → vazio).

**Prova visual:** `shots/portal-invalid-404-mobile.png` — tela branca, *"404 ·
This page could not be found."*, em inglês, sem logo, sem botão. É onde cai quem
recebeu o link truncado ou copiado pela metade.

### 4.4 ⚠️ Erro cru em inglês na tela mais cara da casa

`app/portal/access/[token]/page.tsx:398-401` (decisão) e `:421-423` (orçamento)
fazem `throw new Error(j.error ?? \`HTTP ${res.status}\`)` — **descartam o
`res.status`**. O tradutor `components/agency/ui/mensagemDeErro.ts:22` só
reconhece o status se a string for literalmente `"HTTP 403"`; como virou
`"Access denied"`, cai no ramo `:55-57` ("mensagem já escrita para humano") e
devolve **"Access denied" em inglês**.

Cenário real, não hipotético — medido ao vivo:
```
token VENCIDO   → HTTP 403 {"error":"Access denied","reason":"expired"}
token REVOGADO  → HTTP 403 {"error":"Access denied","reason":"revoked"}
```
O cliente que deixa a aba aberta e volta depois do prazo clica em **Aprovar** e
lê **"Access denied"**. Sem tradução, sem "peça um link novo", no celular.
E o `reason` — que diria exatamente qual das três coisas aconteceu — chega à tela
e é descartado.

### 4.5 ⚠️ O corpo da resposta do "pedir ajuste" contradiz o banco

`app/api/portal/approvals/route.ts:688-693` devolve `updated.status`, capturado
**antes** da devolução da decisão de `:611-617`. Medido:

| | valor |
|---|---|
| resposta HTTP | `{"status":"revision_requested"}` |
| banco, no mesmo instante | `pending` |

**A tela do portal não é enganada** — `page.tsx:403` ignora o corpo e chama
`carregarPortalData()`, relendo do servidor. Mas qualquer outro consumidor da API
(parceiro, integração, agente de IA representando a marca) lê que a peça está "em
ajuste" quando na verdade a decisão voltou para o cliente. Contrato mente; tela
não. Registro pela honestidade da medição, não como incêndio.

### 4.6 ⚠️ 500 por entrada malformada — fora do caminho do cliente

`app/api/briefings/route.ts:28` e `app/api/briefings/[id]/route.ts:20` fazem
`await request.json()` **sem `try/catch`** → JSON malformado vira 500, não 400.
**Ressalva honesta:** as duas estão atrás de `getSession()`, são rotas de staff.
Não estão no percurso do cliente oculto. Fica registrado porque é dívida real,
não porque este percurso a alcançou.

---

## 5. Onde a pessoa fica sem próximo passo

### 5.1 🔴 `/portal/invalid` — 404 genérico
Ver §4.3. É beco no sentido literal: nenhuma palavra, nenhum botão, nenhuma marca.

### 5.2 🔴 Cancelar não tem depois
Ver §6.1.

### 5.3 🔴 Link expirado é um beco educado

**Prova:** `shots/portal-vencido-mobile.png`
> **Link expirado** — *"Este link de acesso expirou. Peça um novo à equipe Dioli."*

Está em português e explica o que houve — o que já é melhor que a maioria. Mas
**"peça um novo" não é um próximo passo, é uma tarefa jogada no colo do cliente
sem ferramenta.** Não há botão de WhatsApp, e-mail, formulário ou "reenviar meu
link". A tela sabe quem é o cliente (o token identifica) e não oferece nada.
Mesma coisa em `shots/portal-invalido-mobile.png` (*"Link inválido"*).

### 5.4 ⚠️ `/proposta/[token]` sem botão de tentar de novo
`app/proposta/[token]/page.tsx:422-428`: quando a carga falha, mostra um
parágrafo e nada mais. A única saída é o F5, que a tela não ensina. É o único
lugar do percurso pago que perdeu esse hábito — `EsteiraDoCliente.tsx:199-225` e
`app/error.tsx:43-92` já fazem certo.

### 5.5 ⚠️ Cinco cards com o mesmo título e nada que os distinga
**Prova:** `shots/portal-aprovacoes-mobile.png` — "AGUARDANDO VOCÊ (3)" mostra
duas linhas **idênticas**: *"Post de lancamento · Social Media · v1"*. Parte é
artefato do meu fixture (cards sobre a mesma versão), mas o defeito é da tela:
**ela não tem campo nenhum para desempatar** dois cards do mesmo departamento
sobre a mesma peça. O cliente não sabe em qual clicar.

---

## 6. Os caminhos ruins, um por um

### 6.1 🔴 CANCELAR: o cliente cancela e a casa fica muda

Medido, com os quatro caminhos rodados no mesmo cliente:

| Decisão | HTTP | `TransicaoDeEstado` | Mensagem ao cliente | `ActivityEvent` p/ a agência |
|---|---|---|---|---|
| aprovar | 200 | ✅ `implementation` | — (auto-evidente) | — |
| pedir ajuste | 200 | ✅ `revision` | ✅ aviso gêmeo no card | ✅ `refacao_escalada` |
| recusar | 200 | ✅ `revision` | ✅ mensagem completa com próxima ação | ✅ `refacao_escalada` |
| **cancelar** | 200 | ✅ `cancelled` | ❌ **nenhuma** | ❌ **nenhum** |

O cancelamento grava o status do card e uma linha de transição que **nenhuma tela
lê**, e para por aí. `app/api/portal/approvals/route.ts` não toca `Project` nem
`Deliverable` no `cancel` (conferido: as únicas cinco ocorrências de "cancel" no
arquivo são o mapa de status e comentários). O projeto do meu cliente de teste
seguiu em `stage: production` depois do cancelamento.

**Consequência com todas as letras:** o cliente desiste de uma entrega que talvez
tenha pago, **ninguém na agência é avisado**, o projeto continua vivo, e o
`[despertador]` — que roda a cada 5 minutos — continua tratando aquilo como
trabalho. Compare com a recusa, que faz tudo certo. O cancelar é a irmã pobre das
quatro decisões.

### 6.2 ✅ PEDIR AJUSTE: o beco de 25/08 está fechado — e bem fechado

Quando a refação não consegue entregar, o card **reabre** em `pending`
(compare-and-set, `route.ts:611-617`) e o cliente lê, no próprio card:

> ⚠️ **ESTE AJUSTE PRECISOU IR PARA UMA PESSOA.** Eu não consegui fazer a mudança
> sozinho e não vou te entregar uma peça pior do que a que você já tem. Seu
> pedido está guardado, com as suas palavras. **Quem está com isso:** a nossa
> equipe. **Próxima ação:** alguém te responde aqui com a peça ajustada.
> A peça abaixo continua a ANTERIOR. E esta peça continua SUA para decidir,
> agora, sem esperar ninguém: aprovar, pedir outro ajuste, recusar ou cancelar.

Isso é o padrão-ouro da casa: diz o que houve, quem está com a bola, qual é a
próxima ação, e **devolve o poder de decidir**. Funcionou na primeira tentativa,
pela rota HTTP real.

**A ressalva que o `esteira` levantou e eu NÃO consegui provar aqui:** o laudo
dele aponta que, quando o card nasce **sem posts vinculados**
(`sourcePostIdsJson` vazio), o bloco que refaz a **arte** é pulado em silêncio, e
a casa afirma ter refeito sem mudar um pixel — medido em produção em 26/08 por
sha256. **Não reproduzi isso**: sem `ANTHROPIC_API_KEY` nenhuma arte é produzida
neste ambiente, então não tenho arquivo para comparar. Fica como **achado
herdado, não confirmado por mim**.

### 6.3 ✅ RECUSAR: o melhor dos quatro

`200` · peça vira `revisionStatus: recusado_pelo_cliente` · `clientFeedback`
gravado com as palavras do cliente · mensagem completa no portal · PM escalado
com motivo, dono e próxima ação. Terminal por desenho, e **a tela diz que é
terminal** — não promete refação automática que não vai acontecer.

### 6.4 ❌ CANCELAR O PROJETO INTEIRO: NÃO EXISTE

Vasculhado `app/api/portal/*` inteiro. A ação `cancel` cancela **uma peça**, nunca
o pedido, a proposta ou o projeto. O único caminho de desistência é
`POST /api/portal/briefing/aceite` com `decisao: "recusado"`
(`aceite/route.ts:130-133`) — e ele **só funciona antes de o projeto nascer**.
Depois disso, **não existe porta nenhuma** para o cliente cancelar o contrato.

---

## 7. Erro de propósito — a boa notícia deste bloco

Todas as rotas do portal foram atacadas com entrada ruim, ao vivo. **A camada de
API é sólida e não tem uma recusa muda:**

| Ataque | Resposta |
|---|---|
| JSON malformado | `400 {"error":"Invalid JSON"}` |
| corpo vazio `{}` | `400 {"error":"token, approvalRequestId, action required"}` |
| ação inexistente | `400 {"error":"Invalid action. Valid: approve, request_revision, reject, cancel, question"}` |
| ajuste **sem comentário** | `400 "Comentário obrigatório: conte o que precisa mudar..."` |
| comentário só com espaços | `400` (mesma frase — o `trim()` pega) |
| token vencido | `403 {"error":"Access denied","reason":"expired"}` |
| token revogado | `403 {"error":"Access denied","reason":"revoked"}` |
| token inexistente | `403 {"error":"Access denied","reason":"not_found"}` |
| id de aprovação inexistente | `404 {"error":"Approval not found"}` |
| card **não visível ao cliente** | `403 {"error":"Approval is not client-visible"}` |
| `Origin` de outro site | `403 {"error":"Origem não confiável para esta ação."}` |
| duplo clique na recusa | `409 {"error":"Approval already decided (rejected)"}` |
| aprovar o que já foi cancelado | `409 {"error":"Approval already decided (cancelled)"}` |
| `GET /pedidos` sem token | `400 {"error":"token é obrigatório"}` |

**Nenhum 500 no caminho do cliente.** Nenhum corpo vazio. A trava de CSRF barra
inclusive requisição **sem** `Origin` — endurecida, e corretamente.

O furo não está na API: está no **último metro**, entre a resposta boa e a tela
(§4.2 e §4.4), e no `reason` que a maioria dos wrappers achata para
`"Acesso negado"` antes de responder
(`lib/agency/persistence/portal-access-service.ts` — `donoDoPortal` e
`resolvePortalClient` colapsam `not_found`/`expired`/`revoked`; só
`POST /portal/session` e `POST /portal/approvals` repassam o motivo).

---

## 8. Os três estados obrigatórios — o que falta

| Tela | Arquivo | Carregando | Vazio | Erro | Próximo passo |
|---|---|---|---|---|---|
| `/briefing` — porta | `components/agency/briefing/LeadNaPorta.tsx` | n/a | n/a | ✅ inline pt-BR (`:52-53`) | ✅ |
| `/briefing` — conversa | `components/agency/briefing/PublicBriefingRoom.tsx` | ✅ | n/a | ✅ separa 429 de 503 (`:946-1168`) | ✅ |
| `/proposta/[token]` | `app/proposta/[token]/page.tsx` | ✅ `:430-434` | ✅ `:293-297` | ⚠️ **sem retry** `:422-428` | ⚠️ |
| `/portal/access` sem token | `app/portal/access/route.ts:37` | — | — | 🔴 **404 do Next, em inglês** | 🔴 **beco** |
| Portal — carga | `app/portal/access/[token]/page.tsx` | ✅ `:615-616` | ✅ por aba | ✅ `:618-637` com retry | ✅ |
| Portal — decisão | `page.tsx:398-401` + `AprovacoesDoCliente.tsx` | ✅ | n/a | 🔴 **"Access denied" cru** | 🔴 |
| Portal — orçamento | `page.tsx:421-423` | ✅ | n/a | 🔴 mesmo defeito ("Not found") | 🔴 |
| Portal — esteira | `components/agency/portal/EsteiraDoCliente.tsx` | ✅ | ✅ `:171-195` | ✅ `:199-225` retry + "Falar com seu PM" | ✅ |
| Portal — chat do PM | `components/agency/portal/PortalChat.tsx` | ✅ | ✅ | ✅ nunca vaza erro cru | ✅ |
| Erro de render | `app/error.tsx:43-92` | — | — | ✅ pt-BR + retry + código | ✅ |
| **404 de rota** | **não existe `app/not-found.tsx`** | — | — | 🔴 | 🔴 |

**Os estados vazios do portal são exemplares** e merecem ser ditos: *"Ainda não
há série medida para desenhar"* + botão **Ir para Integrações**; *"Nenhuma
publicação no seu calendário ainda"* + **Conectar em Integrações**; *"Nenhuma
campanha montada ainda"* + **Quero anunciar**. Vazio com próximo passo é raro, e
esta casa acertou. `shots/portal-bom-mobile.png`.

---

## 9. Screenshots em 375px

Em `/tmp/claude-0/-home-user-diolidigital/d9c8a358-bd4b-55cd-bbc7-c8d858b73a93/scratchpad/shots/`
(mobile 375 · tablet 768 · desktop 1440 de cada):

| Arquivo | O que prova |
|---|---|
| `briefing-publico-mobile.png` | porta do briefing — limpa, com saída honesta |
| `portal-bom-mobile.png` | portal completo, vazios com próximo passo |
| `portal-aprovacoes-mobile.png` | as 4 decisões de volta na tela: "Cancelado / Recusado / Aprovado por você", "Dúvida aberta", "prazo pausado" |
| `portal-vencido-mobile.png` | *"Link expirado"* — explica, mas não dá ferramenta |
| `portal-invalido-mobile.png` | *"Link inválido"* — idem |
| **`portal-invalid-404-mobile.png`** | **o beco: 404 em inglês, sem marca, sem volta** |

---

## 10. O que NÃO consegui percorrer, e por quê

Recusa declarada vale mais que verde inventado.

| Não percorrido | Por quê |
|---|---|
| **Produção real da peça** (passo 7) | exige `ANTHROPIC_API_KEY`. Gasta recurso pago. **PAREI, como manda a ficha.** A execução ficou em `idle`, 0 tentativas, 0 entregas — a própria bateria declara. |
| **Guarda do SDR** (10ª verificação) | exige `--ao-vivo` + chave. Não forcei. |
| **Aprovação de peça produzida pela IA** | sem peça, não há o que aprovar. |
| **Ajuste que não alcança a arte** (§6.2) | precisa de arte gerada para comparar sha256. Achado herdado do laudo do `esteira`, medido em produção em 26/08, **não confirmado por mim**. |
| **Qualquer coisa em Meta/Google/TikTok** | ação de escrita exige parecer prévio do especialista. **Não fiz, nem tentei.** |
| **Pagamento no Mercado Pago** | nenhuma cobrança real. O portal mostrou corretamente *"Este projeto está aguardando o pagamento"*. |
| **Os `[TESTE]` em PRODUÇÃO** | ver §12 — não tenho acesso ao banco de produção neste worktree. |

---

## 11. O que consertei — um item só

**`lib/agency/cliente-falso/percurso.ts:907-916`** — o instrumento lia o campo
errado e imprimia "sem motivo" sobre uma resposta que tinha motivo.

```diff
-const motivo = `a porta do aceite recusou (${res.status}): ${corpo.error ?? "sem motivo"}`;
+const dito = corpo.error ?? corpo.mensagem ?? "sem motivo";
+const estado = corpo.status ? ` [solicitação em "${corpo.status}"]` : "";
+const motivo = `a porta do aceite recusou (${res.status}): ${dito}${estado}`;
```

Pequeno, local e obviamente certo: as **outras duas** leituras do mesmo arquivo
(linhas ~758 e ~1032) já liam `error ?? mensagem`. Esta era a única fora do
padrão. É o conserto que **revelou o achado da §2** — sem ele, o defeito mais
caro da esteira continuaria escondido atrás da frase "sem motivo".

**Nada mais foi tocado.** Os arquivos vedados
(`app/api/piloto/diagnostico/route.ts`, `lib/agency/persistence/cliente-vinculos.ts`,
`lib/agency/comercial/convite-de-parceria.ts`,
`lib/agency/comercial/retrato-dos-convites.ts`) aparecem modificados no
`git status` deste worktree — **é a outra frente, não eu.**

---

## 12. Achado próprio: lixo de teste em produção

O coordenador reportou, do log de produção, clientes `[TESTE]`/`NOME TESTE`
**reais**: *Cantina Oculta, GRAO DO BECO, CANTINA DO PORTO, OFICINA FAROL,
Padaria & Cafe R5, Farol 27* — processados todo dia pelo `[despertador]`.

**O que eu posso afirmar por medição própria:**

- **No banco LOCAL não há nenhum deles.** Depois do seed havia **0 clientes**.
  Os únicos que existem aqui são os que eu criei: `[TESTE] Padaria do Vale` e
  `Cantina da Prova [TESTE]` (da bateria, em `.cliente-falso/teste.db`, banco
  descartável). **Não confirmo a lista de produção — não tenho acesso a ela.**
- **`Farol 27` e `NOME TESTE` são clientes de teste INSTITUCIONAIS**, com trava
  no CI que recusa rodar em qualquer outro nome:
  `.github/workflows/prova-da-mira.yml:68-69` e
  `.github/workflows/cliente-oculto-do-titulo.yml:85-87`. Esses dois têm dono e
  motivo. Os outros quatro, não achei registro nenhum no repositório.
- **O `[despertador]` sobe junto com o app** — visto no log de boot local:
  `[despertador] ligado — a agência vai olhar se há trabalho parado a cada 5 min`.
  Ele não distingue cliente de teste de cliente real.

**Não consertei**, como mandado. Mas o buraco de processo é claro e é meu dever
nomeá-lo: **a casa tem trava de nome no CI e não tem trava nenhuma no banco.**
O `cliente-falso` roda em `.cliente-falso/teste.db` descartável — certo. As
rodadas manuais em produção não têm equivalente.

---

## 13. Ranking — do que mais dói ao que menos dói

| # | Dor | Onde | Custo |
|---|---|---|---|
| **1** | **O cliente aceita a proposta e ouve "você já respondeu". O projeto não nasce.** Pior no caminho de quem **negocia o preço**. | `lib/agency/esteira/caminho-automatico.ts:277-279` · `lib/agency/execution/negotiate-proposal.ts:68` | **Dinheiro.** É a etapa em que a esteira fatura. |
| **2** | O ajuste diz que refez a arte e não refez um pixel. | `app/api/portal/approvals/route.ts:186-213` — **herdado, não confirmado por mim** | Cliente aprova a peça velha sem saber. Pior que travar. |
| **3** | Erro cru **"Access denied"** em inglês na hora de aprovar. | `app/portal/access/[token]/page.tsx:398-401` · `mensagemDeErro.ts:22` | Decisão travada, no celular, sem entender por quê. |
| **4** | O cliente cancela e **ninguém é avisado**; o projeto continua vivo. | `app/api/portal/approvals/route.ts` (cancel não toca `Project`) | Trabalho pago que ninguém sabe que morreu. |
| **5** | Link truncado → **404 em inglês, sem marca, sem volta**. | `app/portal/access/route.ts:37` (destino inexistente) | Primeiro contato perdido, sem sequer poder pedir ajuda. |
| **6** | "Link expirado / inválido": explica e não oferece nada. | `app/portal/access/[token]/page.tsx` | Cliente sabe o problema e não tem ferramenta. |
| **7** | A tela da proposta engole a frase certa que o servidor mandou. | `app/proposta/[token]/page.tsx:406-410` | Genérico onde havia explicação. |
| **8** | Cancelar o **projeto** não existe. | — | Doloroso, mas é silêncio honesto: nenhuma porta promete e falha. |
| **9** | Cards indistinguíveis na lista de aprovações. | `AprovacoesDoCliente.tsx` | Cliente não sabe em qual clicar. |
| **10** | Sem retry na proposta; 500 por JSON malformado em rota de staff. | `app/proposta/[token]/page.tsx:422-428` · `app/api/briefings/route.ts:28` | Menor; a de staff está fora do caminho do cliente. |
| **11** | O manual de boot destrói o banco e só então falha. | `CLAUDE.md` · `scripts/seed-db.mjs:19,87,88` | Custa a primeira hora de quem chega. |

---

## 14. Como reproduzir

```sh
SEED_MASTER_PASSWORD='...' SEED_STAFF_PASSWORD='...' node scripts/seed-db.mjs
npm run dev
npm run cliente-falso                      # placar em .cliente-falso/placar.md
export SHOT_DIR=<pasta>; node scripts/shot.mjs /portal/invalid portal-invalid-404
```

As rotas foram atacadas com `curl` **sempre com `-H 'Origin: http://localhost:3000'`** —
sem esse cabeçalho a trava de CSRF (`route.ts:81-83`) barra tudo com `403` antes
de qualquer validação, e o percurso inteiro parece quebrado quando não está.
Vale registrar: foi a primeira coisa em que este bloco tropeçou.
