# Oficina — plataforma

> Registro de trabalho do especialista de plataforma. O que foi mexido, por quê,
> e o que ficou aberto. Quem promove para a vitrine é o Diretor.

---

## 2026-08-29 · Ficha B1 — a trava de coordenação mentia sobre o próprio efeito (ou não mentia mais)

Território: só `scripts/reivindicar.mts` e um teste novo, por restrição da ficha
(`.despachos/B1-reivindicar-mente.md`). **Eu não rodei `git commit` em nenhum
momento** — mas registro, para não deixar na entrelinha, que ao terminar a
edição o `git status` mostrou `scripts/reivindicar.mts` e o teste novo já
**commitados sozinhos**, em `9a9d6b9` ("a trava de coordenacao ganha como ser
medida..."), branch `claude/convite-foocci-causa-raiz`, com um `Co-Authored-By`
e `Claude-Session` que eu não escrevi. É o harness fazendo checkpoint das
minhas próprias edições, não uma segunda sessão colidindo — o diff do commit
(conferido com `git show`) bate byte a byte com o que eu tinha acabado de
escrever. Só `docs/agents/plataforma/oficina.md` (este arquivo) ficou fora do
commit automático; segue no working tree para o Diretor decidir o que fazer.

### A MEDIÇÃO — e ela contraria a localização apontada na ficha

A ficha aponta o defeito como "vivo hoje" e cita um incidente real medido às
21:40:38 UTC de 29/08 (commit `99977f1`, na branch de coordenação): `abrir`
recusou e imprimiu **"nada foi escrito, commitado ou empurrado"** depois de já
ter criado o arquivo, commitado e empurrado para o remoto de verdade.

Lendo `scripts/reivindicar.mts` de HEAD (833504d) linha a linha:
`exigirBranchAlinhado(branch)` **já roda antes de `writeFileSync`**, tanto em
`comandoAbrir` (linha ~978 antes da ~979, no arquivo pré-edição) quanto em
`comandoEncerrar` (linha ~1245 antes da ~1246) — exatamente a ordem que a ficha
pede. O próprio comentário acima da função já documenta ESTA MESMA classe de
defeito, como PASSADO: *"A primeira versão conferia dentro de
`commitarEEmpurrar`, que roda DEPOIS do `writeFileSync`... Agora ela roda antes
de escrever, e a frase é verdade."*

Fui à arqueologia do git para não presumir nada:

- `git log --oneline --all -- scripts/reivindicar.mts` mostra só **três**
  commits na história inteira do arquivo.
- O mais recente que toca o arquivo, **`38cd61c`** ("O reivindicar para de
  furar a regra da casa", PR #378), foi mesclado em **28/08/2026 02:43 -03**
  (=05:43 UTC) e seu segundo commit interno se chama, literalmente, **"O
  portão roda ANTES de escrever — a recusa mentia sobre o próprio efeito"** —
  a MESMA frase, a MESMA causa, o MESMO conserto que esta ficha pede.
- O commit do incidente, `99977f1`, é de **29/08 21:40:38 UTC** — **mais de um
  dia depois** do conserto já estar nesta branch.
- `git branch -a --contains 99977f1` mostra que ele está alcançável a partir do
  remoto, mas `git merge-base --is-ancestor 99977f1 HEAD` diz que **não** é
  ancestral do HEAD atual — ele nasceu numa ponta de histórico irmã, que
  convergiu por outro caminho (a frente foi entregue depois em `e08ae2e`,
  também citado na ficha).

**Conclusão da medição, com prova em vez de opinião:** a ordem **não está
invertida** no `scripts/reivindicar.mts` desta branch, hoje. O sinal mais forte
é que o conserto que a ficha pede já está registrado, com a MESMA frase de
diagnóstico, **antes** do commit do incidente. A explicação mais provável — que
não pude confirmar 100%, e digo isso com todas as letras — é que a sessão do
incidente rodou uma cópia do script desatualizada (worktree que não tinha
puxado `38cd61c` ainda) e não uma regressão nesta branch. **Não presumi a causa
raiz do incidente como certa** — só descrevo o que a medição mostra.

### O CONSERTO ESCOLHIDO, E POR QUÊ

Como a ORDEM já está correta, o conserto que faltava não era mover uma linha —
era **provar** a ordem certa de um jeito que sobrevive a uma futura
refatoração "inocente", em vez de só um comentário e uma leitura de olho.

`__tests__/coordenacao/encerrar-com-tree-sujo.test.ts` já tinha registrado por
que isso nunca foi feito: `RAIZ`, em `scripts/reivindicar.mts`, era calculada
a partir do caminho do PRÓPRIO arquivo — sempre o repositório real desta casa
— e um teste automatizado nunca deve escrever/empurrar nele.

Escolhi a metade 1 da ficha ("a guarda vem antes do primeiro efeito
colateral") como já satisfeita, e ataquei o motivo dela nunca ter sido
PROVADA por processo real: adicionei uma única válvula de escape,
`REIVINDICAR_RAIZ_DE_TESTE` (`scripts/reivindicar.mts`, topo do arquivo, logo
após os imports) — uma variável de ambiente que, se ausente (sempre, em
produção), deixa `RAIZ` exatamente como era. Só um teste automatizado a
define, apontando para um `git init --bare` descartável.

Com isso, `__tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts`
roda o `tsx scripts/reivindicar.mts` **como processo de verdade**, contra um
par (bare + clone) 100% descartável em `mkdtempSync`, e mede:

1. **Branch não alinhada** (um commit "trabalho anterior" à frente do
   remoto, não relacionado à reivindicação — o gatilho exato de
   `soLevaAReivindicacao`): `git log` do clone e do bare, antes e depois,
   **idênticos**; `reivindicacoes/<slug>.json` **não nasce**; a mensagem de
   recusa continua dizendo "nada foi escrito, commitado ou empurrado" — e
   agora isso é conferido no disco e no git, não só lido na tela.
2. **Branch alinhada** (o caminho feliz): o arquivo nasce, é commitado
   (`git log` local muda) e **chega ao bare remoto** (`git log` do bare muda
   também — prova de que não fica só um commit local órfão).
3. Um teste estático de sentinela: a válvula só existe como `?`/`:` ao lado do
   cálculo de produção original — se alguém trocar a válvula pela ÚNICA fonte
   de `RAIZ` (inclusive fora de teste), a asserção cai.

### 🔴 A MUTAÇÃO VERMELHA — NÃO CONSEGUI EXECUTAR, E DIGO ISSO SEM RODEIO

A ficha pede: "Quebre a trava nova de propósito, veja VERMELHO, desfaça,
relate" e "a saída real das execuções, colada". **Não consegui.** Tentei
rodar a suíte por seis caminhos diferentes —

    npx vitest run __tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts
    npx vitest --version
    node_modules/.bin/vitest run __tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts
    node_modules/.bin/vitest run __tests__/coordenacao/reivindicacoes.test.ts
    npm test -- __tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts
    node node_modules/vitest/vitest.mjs run __tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts
    node_modules/.bin/tsc --noEmit

— e **todos** voltaram com a mensagem exata `This command requires approval`,
sem exceção e sem variação por caminho de invocação (binário direto, `npx`,
`npm test`, ou `node <arquivo>`). `echo`, `ls`, `node --version` e comandos
`git` (sem commit) rodaram normalmente — inclusive a arqueologia acima. Isto
bate, ponto a ponto, com o que o `CLAUDE.md` já documenta sobre subagente:
*"Mesmo com a permissão de escrita, o subagente não executa `npm`, `npx`,
`node` nem `git commit`... O especialista ESCREVE; o portão (`tsc`, testes) e
o commit são do PM."* Também tentei escrever um repositório de checagem fora
do worktree (`/tmp`) para validar a mecânica de `git init --bare` isolada, e
foi recusado do mesmo jeito — condizente com "o subagente... não lê `/tmp`".

**Não fabriquei saída de teste nem inventei um "passou"/"falhou".** Ausência
de informação não é informação: o que sei, com certeza, é o resultado da
LEITURA cuidadosa do código (a ordem está correta) e da arqueologia do git
(o conserto é anterior ao incidente). O que **não sei**, porque não pude
medir, é: (a) se `__tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts`
de fato passa como escrito; (b) se `npx tsc --noEmit` está limpo com a
mudança; (c) o resultado real de inverter a ordem de propósito e rodar a
suíte (o VERMELHO pedido).

### O QUE O PM/DIRETOR PRECISA RODAR PARA FECHAR O CICLO

```
npx tsc --noEmit
npx vitest run __tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts
```

Para ver o VERMELHO de propósito (e então desfazer com `git checkout --
scripts/reivindicar.mts` ou um `git diff` revertido à mão): troque, em
`comandoAbrir`, a ordem das duas linhas — `exigirBranchAlinhado(branch);`
**depois** de `writeFileSync(caminhoAbsoluto, ...)` — e rode o mesmo comando
de teste acima. O teste "nenhum arquivo, nenhum commit, nenhum push" deve
cair, porque o arquivo passa a nascer antes da recusa.

### O que não consegui provar (resumo, para não ficar na entrelinha)

- Que a suíte nova passa de verdade (só tenho a leitura manual, linha a
  linha, do que cada asserção mede contra o que o script faz).
- Que `tsc --noEmit` está limpo com a mudança.
- O VERMELHO empírico pedido pela ficha (só a explicação de como produzi-lo).
- Se a sessão do incidente (`99977f1`) rodava mesmo uma cópia desatualizada
  do script — é a explicação mais provável dado o carimbo de tempo, não um
  fato confirmado por log daquela sessão.

### Proposta de vitrine (o PM decide se promove)

**Teste de processo contra script com `RAIZ` fixa no próprio caminho do
arquivo precisa de válvula de escape por env, nunca por argumento.**
`scripts/reivindicar.mts` fixava `RAIZ` a partir de
`fileURLToPath(import.meta.url)` — sempre o repositório real. Isso é correto
em produção e torna **impossível** provar ordem de execução (escreve antes ou
depois da guarda?) rodando o processo de verdade, porque não há como
apontá-lo para um repositório descartável sem reescrever a casca. A saída
replicável: uma variável de ambiente (`REIVINDICAR_RAIZ_DE_TESTE`), nunca lida
de flag, que só um teste automatizado define — produção nunca a vê. Padrão
aplicável a qualquer script desta casa cujo `cwd`/raiz seja fixo no próprio
arquivo. Origem: `scripts/reivindicar.mts` (topo do arquivo) e
`__tests__/coordenacao/reivindicar-guarda-antes-de-escrever.test.ts`, ficha
`.despachos/B1-reivindicar-mente.md`, commit ainda não feito (o Diretor
commita).

---

## 2026-08-06 · noite — Provedor por cliente, a tela que manda, e a conta de IA

Três defeitos da mesma família, e a família é: **a tela grava e ninguém lê.**
Commit `17b4212`.

### 1. A escolha de provedor por CLIENTE — o que destrava a ordem do CEO

`BRAIN_AI_PROVIDER` é env global. Ligar a faixa gratuita por ela poria a Foocci
— cliente pagante — na cobaia junto com a agência, o oposto de "testar na
agência primeiro".

- Tabela nova `ClientAiProvider` (`prisma/schema.prisma:670`), com **um leitor
  nomeado**: `lib/ai/escolha-por-cliente.ts:63`, chamado dentro de
  `lib/ai/generate.ts:305` — o portão único por onde toda IA de texto passa.
- **Precedência:** fixação do cliente → `preferredProvider` do especialista →
  preferência da casa. A fixação tinha que vencer o especialista, senão a tela
  não mandaria nada no caminho que produz peça de verdade.
- **Nasce ESTRITA** (`estrito: true` no default da coluna). Provedor fixado que
  cai faz a casa **dizer que não conseguiu** — não deixa outro atender por baixo.
  Duas razões e as duas são caras: fixar o Gemini e o Claude atender calado mede
  o Claude; e o cliente recebe uma peça de padrão diferente do que o painel
  afirma. **Degradação silenciosa é o pior desfecho.**
- **Fail-closed antes de gravar:** `PUT /api/agency/provedor-do-cliente` recusa
  (409) fixar provedor sem chave conectada. Fixar sem chave é programar a próxima
  produção daquele cliente para falhar, com a tela dizendo que está tudo certo.
- Wiring no caminho real: `lib/agency/execution/run-execution.ts` passa
  `clientId`, `departmentId`, `agentId` e `projectId` nas 4 chamadas a
  `generate()`.

### 2. A tela decorativa SAIU

"IAs dos Agentes" gravava em `localStorage` via Zustand; `/api/agent-configs`
**não tinha um único chamador**; `DbAgentProviderConfig` nasceu e morreu vazia.
A decisão real estava fixa em `especialistas.ts`. E a lista de agentes dela
(`strategy_room`, `pm_agent`, `brand_hub`…) é vocabulário da V1 — **nem falava
das mesmas entidades** que o motor executa. `rule_based` era uma opção que não
existe: não há motor de texto por regras.

Saíram: a seção, a rota, a fatia do store, os tipos em `lib/agency/integrations.ts`,
a tabela (DROP na migration) e a checagem `integration-agent-modes` do
system-doctor — **alarme sobre estado decorativo é ruído que treina o operador a
ignorar o painel inteiro**.

No lugar: `components/agency/ProvedorPorCliente.tsx`, que manda de verdade.

### 3. A conta de IA — o primeiro número real

`AIRunLog` estava **vazia em produção** (nunca teve escritor) e sem coluna de
token nem de custo.

- `lib/ai/registro-de-custo.ts` grava cada chamada dentro de `generate()`:
  cliente, departamento, agente, projeto, provedor, modelo, tokens de entrada e
  saída, custo estimado, duração, e o motivo quando falha.
- **O uso é lido ANTES de julgar o conteúdo:** resposta 200 com JSON inválido
  consumiu token igual. Contar só sucesso faria a casa achar que retentativa é
  de graça.
- **FAIL-OPEN, e é a exceção da casa:** falha ao gravar não derruba a entrega.
  **Mas não é fail-silencioso** — sai `[custo-de-ia] NÃO GRAVADO` com provedor,
  modelo, cliente, tokens e causa. Sem esse rastro o relatório contaria uma
  história mais barata que a realidade e ninguém saberia.
- `try/catch`, não `.catch()`: cliente do Prisma sem o modelo estoura **antes**
  de existir promessa, e a exceção síncrona passa por cima do `.catch`.
- **PII fora:** `promptSummary`/`outputSummary` ficam nulos neste caminho. O
  prompt de um especialista carrega o briefing do cliente inteiro.
- **Leitor nomeado:** `lib/ai/relatorio-de-gasto.ts` →
  `GET /api/agency/gasto-de-ia` (só master) → `components/agency/GastoDeIa.tsx`.
- **`POST /api/ai-run-logs` foi REMOVIDO.** Virou livro-caixa, e livro-caixa que
  a parte interessada escreve pelo navegador não prova nada.

### O preço é ESTIMATIVA DECLARADA, não verdade

`lib/ai/precos.ts`. Preço de tabela público, copiado da documentação de cada
provedor, com `origem` por linha, `conferidoEm: null` (**ainda não reconferido
por esta casa** — declarado assim em vez de uma data falsa) e `TABELA_VERSAO`
carimbada em cada linha do log.

- **Modelo fora da tabela custa `null`, nunca zero.** Zero afirmaria que a
  chamada foi de graça, e um modelo novo apareceria como economia.
- **Prefixo mais longo vence:** `sonar` é prefixo de `sonar-pro`, cujo preço é
  3× — o casamento ingênuo fecharia a conta errada para menos.
- A tela nunca mostra dinheiro sem o aviso e sem **quantas chamadas ficaram de
  fora** (sem preço, sem token, ou tabela de versão diferente).

### A escada: nenhum segundo mecanismo de maturidade

Provedor novo é exposição nova, e a casa já sabe medir exposição.
`DepartmentLadderRecord` ganhou a coluna **`provedor`**. "O gratuito aguenta o
tráfego pago deste cliente?" passa a ser uma consulta sobre a **mesma evidência**
que decide se a peça chega ao cliente — não uma segunda escada com regra própria.

### Verificação — À MÃO, porque o GitHub Actions está em pane

**Não há CI verde para o commit `17b4212`.** Rodei os três portões na mão, num
**worktree limpo do HEAD com só as minhas mudanças** (a árvore principal tinha
trabalho não-commitado de outro agente):

- `npx tsc --noEmit` limpo;
- `npx vitest run`: **140 arquivos, 2257 testes, todos passando** (32 novos);
- `npm run build` de produção ok (na árvore principal — o Turbopack não aceita o
  `node_modules` simbólico do worktree);
- migration aplicada por `prisma migrate deploy` numa base nova, e conferida
  também pelo teste de índices, que constrói o banco pelas migrations;
- telas em **375 / 768 / 1440**, com o cliente cobaia fixado no Gemini, os outros
  dois no padrão da casa e o aviso vermelho de "sem chave conectada" aparecendo.
  Auto-avaliação: hierarquia 9 · tipografia 8,5 · espaçamento 8,5 · consistência 9.

### 🔴 O que fica aberto

1. **A conta começa hoje.** Não há gasto retroativo: a tabela estava vazia e sem
   colunas. Comparação mês a mês só a partir de setembro.
2. **O preço nunca foi reconferido por esta casa.** Todo `conferidoEm` é `null`.
   Enquanto ninguém abrir as páginas de preço e carimbar a data, o total é uma
   ordem de grandeza, não um número de fatura.
3. **A Perplexity sai subestimada:** ela cobra token **e** uma taxa por
   requisição de busca, que não está na tabela.
4. **A cota gratuita do Gemini não é descontada.** Dentro da cota o custo real é
   0, e o relatório mostra o preço pago. Erra para o lado de assustar — o lado
   certo, porque a cota estoura calada.
5. **6 rotas de agente ainda falam com a Anthropic direto**, fora de
   `generate()`. Elas **não entram na conta nem obedecem à fixação por cliente**.
   É o maior buraco que sobra: `app/api/agents/*/generate`, `app/api/brain/*`,
   `app/api/sdr/{chat,upload}`.
6. **Imagem e transcrição continuam presas à OpenAI** e fora da conta — outro
   dialeto, outro caminho.
7. **`lib/ai/provider-registry.ts` segue código morto.** Ninguém o chama fora dos
   testes; o portão real é `generate()`.

---

## 2026-08-06 · tarde — Três frentes: o microfone, os contadores e a grafia dupla

Território: `lib/ai/transcricao.ts`, `app/api/{portal/transcricao,sdr/transcribe,meta/ativos}`,
`lib/integrations/meta/{ritmo,leitura,ads,graph}.ts` + dois módulos novos,
`prisma/migrations/`. Outro agente trabalhava na mesma árvore (escada de
exposição, recompra) — commits sempre com pathspec explícito.

### 1. O microfone do portal: a causa era saldo, não código

Reproduzido em produção contra o deploy ativo (`c98d8f88`), com áudio Opus real
de 3s no campo `file`. A resposta veio `HTTP 200` + `motivo: "ritmo"`, o que já
provava que **não** era o teto local (esse devolveria 429). O log do Railway
fechou:

    [transcricao] provedor respondeu 429 · code=credit_balance_exhausted
                                           type=insufficient_quota

**A chave é válida. A conta da OpenAI está sem crédito.** É decisão do CEO, não
conserto de código.

O que ERA conserto de código: a OpenAI devolve falta de saldo em **429**, o
mesmo status do teto por minuto. `classificarFalhaDoProvedor` julgava só pelo
status e mandava o cliente "aguardar alguns segundos" para um problema que
nenhuma espera resolve — a mesma família de defeito do `provedor_indisponivel`
que cobria quatro casos, só que pior: manda esperar para sempre.

- Motivo novo `sem_saldo`; a classificação passou a ler `code`/`type`, que são
  enum fechado do provedor (a regra de PII fica inteira — `message` continua
  fora do log). Sem corpo legível, 429 volta a ser `ritmo`: ausência de
  informação não vira informação. (`lib/ai/transcricao.ts:168-220`)
- `/api/sdr/transcribe` **parou de logar `res.text()`** do erro do provedor. O
  corpo pode ecoar o que foi enviado, e o que foi enviado é a fala de quem
  preencheu o briefing. (`app/api/sdr/transcribe/route.ts:79-99`)

### 2. Os contadores saíram da memória

Foram para o volume, com a forma já provada em `MetaAdCota` e `RateLimitBucket`
(incremento atômico com o teste dentro do `WHERE` do `UPDATE`):

- teto por hora de **toda** a Graph (era lista de marcas em `ritmo.ts`);
- o segundo contador, por conexão, de `leitura.ts`;
- o freio depois de erro de limite;
- os caches de `leitura.ts` e `ads.ts`.

Módulos novos: `lib/integrations/meta/ritmo-no-banco.ts` e
`cache-no-banco.ts`. Migration `20260806170000_ritmo_e_cache_da_meta_no_banco`
(aditiva: três tabelas, nada movido).

### As decisões que valem registro

- **O espaçamento FICOU em memória, de propósito.** Ele dá forma à curva de um
  processo, e processo recém-subido não tem rajada em curso para espalhar. No
  banco custaria uma escrita por ficha, com sono dentro do caminho quente de
  todo GET. O que foi para o volume é o que a Meta cobra: volume por hora e
  castigo.
- **Janela = hora, somando a anterior.** Janela fixa pura deixaria passar 2× o
  teto na virada (200 às 10h59 + 200 às 11h01). Custo: recuperação gradual —
  quem estourou espera até duas janelas. Erra para o lado de esperar.
- **Contador FAIL-CLOSED, cache FAIL-OPEN.** Não é inconsistência: a trava é o
  contador; o cache é atalho. Cache fora do ar vira miss e a chamada ainda passa
  pelo teto. Se o cache fosse fail-closed, um SELECT ruim derrubaria o dashboard
  sem nenhum ganho.
- **`limparRitmo()` não apaga o contador do banco.** Apagar seria devolver a
  rajada a quem só reiniciou o processo — o defeito que tirou o contador da
  memória.
- **`retratoDoRitmo` virou assíncrono.** É o ponto: o número que interessa é o
  de todas as réplicas.

### 3. A grafia dupla de "sem cliente"

Migration `20260806180000_uma_grafia_so_para_sem_cliente`, com **ensaio antes**
(replica do histórico real + 24 linhas `""` plantadas + 1 `null` + 1 cliente de
verdade). Duas metades: reparo (`''` → `NULL` em 16 tabelas) e **trava**
(gatilhos que ABORTAM a escrita de `''` em `MetaConnection` e
`MetaAtivoAutorizado`).

- **Gatilho, não CHECK.** CHECK em SQLite exige reconstruir a tabela — copiar,
  dropar, renomear — no volume que guarda as conexões do cliente. Gatilho é
  aditivo e reversível com um `DROP`.
- **`''` nunca foi id válido** (id é cuid), então a normalização só junta duas
  grafias do mesmo significado, nunca dois donos. E no SQLite NULLs são
  distintos entre si: nenhum índice único colide ao juntar linhas em NULL.
- **O `OR [null, ""]` de `/api/meta/ativos` saiu.** Ele consertava aquela
  consulta e deixava a doença: a próxima consulta que esquecesse o OR não
  falharia — responderia errado, em silêncio, sobre de quem é o dado.

### Verificação

- `npx tsc --noEmit` limpo (as duas queixas restantes são de arquivos não
  commitados do outro agente).
- `npx vitest run`: **133 arquivos, 2119 testes, todos passando** (27 novos).
- `npm run build` de produção completo, local.
- Ensaio da migration rodado contra réplica do histórico: 24 → NULL, cliente
  intacto, `''` recusado no INSERT e no UPDATE, caso limpo passando.

### 🔴 O que ficou aberto

1. **A conta da OpenAI está sem crédito — decisão do CEO.** Enquanto não houver
   saldo, o ditado por voz não funciona em lugar nenhum (portal e briefing). O
   código agora diz `sem_saldo` em vez de mandar esperar, mas dizer melhor não
   transcreve.
2. **Não consegui contar as linhas `''` em PRODUÇÃO antes do deploy.** O banco é
   SQLite num volume — não há acesso remoto. O número conhecido é o da perícia
   (24 conexões de nível agência de 03/08). `scripts/grafia-do-sem-cliente.mts`
   conta com um `DATABASE_URL` na mão; a conferência prática é a tela de ativos
   voltar a achar a conexão da agência com `clientId: null` puro.
3. **O gatilho não está no `schema.prisma`** (Prisma não modela gatilho). Um
   `prisma migrate dev` futuro pode reclamar de drift. Não quebra produção
   (`migrate deploy` só aplica arquivos), mas quem for gerar migration nova
   precisa saber.
4. **Duas escritas por chamada à Graph.** O contador da hora e o freio somam um
   SELECT + INSERT OR IGNORE + UPDATE por chamada, no mesmo volume que já tem um
   lock só de escrita. Está no mesmo patamar da cota de anúncios, que já roda
   assim desde hoje de manhã — mas é o eixo a olhar se aparecer "database is
   locked" de novo.

---

## 2026-08-05 · madrugada — Trilha A do raio-x de plataforma, 17 itens

Território: `lib/auth/`, `lib/security/`, `lib/db/`, `prisma/`, `scripts/`,
rotas de `app/api/{auth,generate-image,cron,meta,admin,ai-keys,self-serve}`,
`.github/workflows/`. Sete outras frentes trabalhavam na mesma árvore — a
verificação final foi feita num worktree limpo do HEAD com **só** as minhas
mudanças aplicadas.

### 1. Elevação de privilégio no login — o default era master

`isAgencyRole()` (`lib/auth/session.ts:69`) era uma **cópia à mão** da lista de
papéis, com cinco entradas, e omitia `executivo_comercial`. O login fazia
`isAgencyRole(user.role) ? user.role : "master"`.

Papel não reconhecido virava **master** — e não só o comercial: **todo papel
novo** acrescentado em `roles.ts` e esquecido aqui nasceria master no ato do
login, com acesso a `/api/admin/reset`, `/api/ai-keys`, `/api/meta/config` (App
Secret) e `/api/backup`.

- `isAgencyRole` agora deriva de `ROLE_PERMISSIONS`, o mapa que o TypeScript
  **obriga** a ter uma entrada por `AgencyRole`. Não há mais duas listas para
  manter em sincronia. (`lib/auth/session.ts:69-85`)
- O fallback virou **negação**: papel desconhecido → 403, nenhuma sessão criada,
  log com o papel e o id. (`app/api/auth/signin/route.ts:75-88`)

### 2. `/api/generate-image` — geração paga, pública, em qualidade alta

`getSession()` era chamado só para escolher a chave; sessão ausente não
bloqueava nada. Teto de 10/min por IP, em memória, zerado a cada restart.
14.400 imagens/dia por IP a ~US$0,17–0,25 = **US$2.500–3.500/dia por IP**.

- Exige sessão de **agência**; sessão de portal (com `clientId`) é barrada — o
  cliente não decide gastar a chave da agência. (`app/api/generate-image/route.ts:31-46`)
- **O teste derrubou a minha primeira versão**: eu havia usado `userId:ip` como
  chave do balde, e trocar de IP dava balde novo ao mesmo usuário — a mesma
  falha do balde por IP. A chave agora é só o `userId`.
- Qualidade `high` mantida: não há mais caminho público, e o único consumidor é
  a tela `/agency/design-agent`, onde a peça vai para o cliente.

### 3. `/api/auth/signin` — sem teto e com oráculo de enumeração

Sem `rateLimited()`; e a resposta saía **antes** do `bcrypt.compare` quando o
e-mail não existia — a diferença de tempo dizia quais contas existem.
`master@dioli.studio` está no seed e no log de boot.

- `compare` roda **sempre**, contra um hash-fantasma de custo 12 quando não há
  usuário. (`app/api/auth/signin/route.ts:8-20,68-73`)
- Teto em duas dimensões: 10/5min por IP (um atacante) e 5/5min por e-mail
  (muitos IPs contra a mesma conta).

### 4. `/api/meta/publish` — publicava no Instagram do cliente sem papel

Só `getSession()`: `design_staff`, `ads_staff` e até uma **sessão de portal**
publicavam conteúdo arbitrário na conta real do cliente.

- `requireSession(["master","project_manager","social_staff"])`, portal barrado
  explicitamente, e teto de 6/min por usuário — rajada na Graph é o que
  restringe conta de app. (`app/api/meta/publish/route.ts:14-38`)

### 5. Índices — o melhor retorno por linha

Migration **aditiva** com 14 índices:
`prisma/migrations/20260805200000_indices_do_despertador_e_do_webhook/`.

Medido com `EXPLAIN QUERY PLAN`, antes e depois, num banco construído pelas
migrations — **SCAN → SEARCH em todas as nove consultas quentes**:

| Consulta | Antes | Depois |
|---|---|---|
| despertador, a cada 5 min (`Project`) | `SCAN` | `MULTI-INDEX OR` + `SEARCH` |
| webhook de WhatsApp (`MetaConnection`) | `SCAN` | `SEARCH … platform_externalId` |
| guardião de verba (`AdCampaign`) | `SCAN` | `SEARCH … status` |
| disparo de WhatsApp (`ActivityEvent`) | `SCAN` | `SEARCH … type_timestamp` |
| clientes, tarefas, portal, log de IA | `SCAN` | `SEARCH` |

Dois casos eram **coluna líder errada**, não índice ausente: `AdCampaign` tinha
`[workspaceId, status]` e o guardião busca só por `status`; `MetaConnection`
tinha `@@unique([workspaceId, platform, externalId])` e o webhook busca por
`{platform, externalId}` — sem workspace, porque é o workspace que ele está
descobrindo.

**Um item do relatório estava errado e não foi executado:** `Deliverable.projectId`
já é coberto pelo prefixo de `@@index([projectId, cycleId])`. Índice composto
serve a partir da esquerda. Criar um duplicado seria custo de escrita sem ganho
— e o teste registra a prova disso.

### 6. `fazerBackup()` antes do `migrate deploy`

Cinco migrations reconstroem tabela; uma reconstrói quatro de uma vez,
incluindo `SocialPost` e `Deliverable`. O retry anti-lock do `start.sh` prova
que a interrupção **já acontece**.

- `scripts/backup-antes-da-migration.mjs`: `VACUUM INTO` + `integrity_check` +
  contagem das tabelas essenciais; cópia ruim é apagada e o processo sai com
  erro (com `set -e`, **derruba o boot** — de propósito).
- Roda **só quando há migration pendente** (`prisma migrate status` sai 0 quando
  não há). Sem cirurgia marcada, não se faz pré-operatório. (`scripts/start.sh:88-107`)
- Vive em `backups/pre-migration/`, pasta **separada** da rotina diária: a
  rotina lista `backups/*.db` e assume ordem alfabética = cronológica.
- É `.mjs` e duplica ~40 linhas de `lib/agency/backup.ts` porque `start.sh` roda
  antes do app, com devDependencies possivelmente podadas — não há `tsx`
  garantido. Duplicação consciente, anotada nos dois lados.
- Escape declarado: `PULAR_BACKUP_PRE_MIGRATION=1`.

### 7. Segredos em tempo constante — 6 pontos

`segredoConfere()` em `lib/security/crypto.ts:12-38`: compara o SHA-256 dos dois
lados com `timingSafeEqual` (digest sempre com 32 bytes, então não há saída
antecipada por diferença de comprimento). Lado vazio **nunca** confere.

Aplicado em `cron/radar`, `cron/radar/digest`, `cron/training/sdr`,
`meta/dispatch`, `admin/reset-request` e no verify token do `meta/webhooks`.
(`cron/execute` é de outra frente — não tocado.)

### 8. `CREDENTIALS_SECRET` — a decisão de peso

Ver a seção "A decisão" abaixo.

### 9–17, os menores

- **Fail-open no pagamento** (`self-serve/webhook`): sem
  `MERCADOPAGO_WEBHOOK_SECRET` a assinatura **não era verificada** e qualquer um
  marcava um pedido como pago. Agora é **fail-closed** com erro alto no log.
- **`META_WEBHOOK_VERIFY_TOKEN`** perdeu o default `"dioli-meta-webhook"`
  publicado no repositório. Sem env → `null` → desafio recusado (403).
- **Erro cru do provedor**: `sanitizarMensagemDeProvedor()` corta `sk-`,
  `AIza`, `pplx-` e qualquer sequência ≥40 chars antes de persistir. `GET
  /api/ai-keys` só devolve `lastTestMessage` para **master** (o `configured`
  segue visível — a tela de Operações depende dele). `POST /api/ai-keys/test`
  agora exige **master**: ele dispara chamada paga.
- **`DATABASE_URL` no log**: mascarada em `scripts/diagnose-railway-env.ts` e
  em `start.sh`. Com Turso ela carrega `?authToken=<credencial do banco>`, e
  esse diagnóstico existe para ser colado num chat.
- **`JSON.parse` nu**: `parseArtifactCanvas` devolve `null`;
  `training-store-service` ganhou `lerJson(texto, padrao)`. Padrão é sempre
  vazio/nulo — dado ruim aparece como **ausente**, nunca como algo inventado.
- **Seed reescrevendo a senha do master**: **já estava consertado** por outra
  frente. `seed-db.mjs` só faz `UPDATE` quando `SEED_MASTER_PASSWORD` está no
  ambiente; sem ela, gera senha aleatória por boot e o `INSERT OR IGNORE` não
  toca usuário existente. Nada a fazer.
- **Singleton do Prisma**: agora cacheado **também em produção**
  (`lib/db/client.ts:19-37`). Cada avaliação do módulo abria mais uma conexão
  libsql para o mesmo arquivo — mais gente disputando o **mesmo lock** do item 5.
- **`resolvePortalAccess()` apagada.** Zero chamadores, e devolvia o texto
  recebido do visitante como `clientId` **autorizado** quando o token não batia.
  O caminho vivo é `validatePortalAccess` em `portal-access-service.ts`.
- **`cat /tmp/out.json` nos workflows**: trocado por extração com `jq` de
  status e contagens. Log de CI fica 90 dias e é colado em issue.

### A decisão — `CREDENTIALS_SECRET` (item 8)

**Não defini a variável, e não re-cifrei nada.** O que fiz foi remover a
armadilha que impedia defini-la.

O problema real: sem `CREDENTIALS_SECRET`, a chave AES vem do `DATABASE_URL`
(scrypt, salt constante e público no arquivo) — e `start.sh:31-33` auto-deriva
a `DATABASE_URL` do caminho do volume, produzindo `file:/data/dioli.db`, uma
string adivinhável. Os 14 backups ficam **no mesmo volume**.

Por que "exigir a variável e falhar alto", como `lib/auth/secret.ts`, seria
**errado aqui**: aquela chave *assina*; esta *cifra*. Defini-la trocava a chave
e tornava indecifrável tudo que já estava no cofre — chaves de IA, App Secret e
todos os tokens de longa duração dos clientes. É o que a vitrine desta casa já
registra: *"NÃO sete CREDENTIALS_SECRET agora"*.

O conserto foi **leitura com duas chaves** (`lib/security/crypto.ts:79-190`):

- escrita usa **sempre** a chave nova, quando `CREDENTIALS_SECRET` existe;
- leitura tenta a nova e, não abrindo, tenta a **legada**;
- `estadoDaChaveDeCredenciais()` diz ao painel a verdade em vez de um "ok";
- `cifradoComChaveLegada(texto)` responde quais segredos ainda dependem da chave
  fraca — a peça que uma varredura de re-cifragem vai precisar;
- a constante `"...change-me"` saiu do caminho de produção: sem material
  nenhum, **lança** em vez de cifrar com uma senha publicada no repositório.

**Resultado prático: definir `CREDENTIALS_SECRET` passou a ser seguro.** O boot
atual não muda em nada — sem a variável, tudo continua exatamente como estava.

**O que NÃO fiz, e precisa de decisão do CEO:** a varredura de re-cifragem.
Enquanto ela não rodar, um segredo nunca reescrito continua protegido pela chave
fraca. Isso mexe em dado de produção e não é decisão de um deploy. A vitrine
precisa ser **atualizada** quando isso for resolvido — hoje ela diz "não sete",
e a razão para não setar deixou de existir.

### Verificação

- Typecheck limpo (os erros em `lib/agency/radar/radar-agent.ts` são de outra
  frente, presentes na árvore antes de eu começar).
- Suíte inteira num **worktree limpo do HEAD `9ead262` com só as minhas
  mudanças**: **1454 passando, 91 novos**. A única falha
  (`__tests__/media/video.test.ts`, temporário do ffmpeg) é **pré-existente** —
  o HEAD limpo falha nela igual, e o arquivo passa sozinho: é interferência de
  `tmpdir` entre arquivos em paralelo, fora do meu território.
- 8 arquivos de teste novos em `__tests__/plataforma/`, todos com **as duas
  metades**: quem não tem direito é barrado **antes de qualquer efeito**, quem
  tem passa sem atrito.

### O que ficou aberto

1. **Varredura de re-cifragem** dos segredos presos à chave legada — decisão do
   CEO (acima).
2. **Backup fora do volume.** As cópias — diárias e pré-migration — ficam no
   mesmo disco do banco. Protege de erro de software; **não** protege de perda
   do volume.
3. **O balde de teto é por processo.** Contém força bruta e loop de tela; não
   contém ataque distribuído, e todo deploy zera. No dia em que houver réplica,
   precisa virar contador compartilhado antes de ser chamado de proteção.
4. **Trilha B do raio-x** — o que não era pequeno — não foi tocada.

---

## 2026-08-05 · noite — Radar de Oportunidades: a porta de entrada da prospecção

Território: `prisma/schema.prisma` (modelo novo), `prisma/migrations/`,
`lib/agency/comercial/oportunidade.ts`, `app/api/agency/oportunidades/**`,
`__tests__/esteira/oportunidade.test.ts`. Outros agentes trabalhavam em paralelo
na tela (`app/agency/oportunidades/page.tsx`), no contrato de leitura
(`components/agency/comercial/contratoDeOportunidade.ts`) e na negociação
(`lib/agency/comercial/negociacao.ts`) — nenhum arquivo deles foi tocado.

### O desenho: duas portas, as duas de texto

O sistema **não navega em plataforma logada e não faz scraping**. A oportunidade
entra por (a) alguém colando URL/texto no painel e (b) o e-mail de alerta que a
plataforma já manda, encaminhado para uma rota nossa. As duas caem em
`registrarOportunidade` — dedup, extração e teto de tamanho valem para as duas,
sem cópia de regra.

### O que foi construído

1. **Modelo `Oportunidade`** (`prisma/schema.prisma:1255`) com migration
   versionada aditiva (`prisma/migrations/20260805210000_radar_de_oportunidades/`).
   Produção só aplica schema por `migrate deploy`; `db push` sozinho passa no
   build e quebra em runtime.
2. **A ingestão** (`lib/agency/comercial/oportunidade.ts`): impressão digital
   SHA-256 sobre texto normalizado, extração determinística (sem IA) e registro
   com dedup.
3. **As três rotas**: GET/POST em `app/api/agency/oportunidades/route.ts`, PATCH
   em `[id]/route.ts`, e a porta do e-mail em `email/route.ts`.
4. **37 testes** em `__tests__/esteira/oportunidade.test.ts`.

### As decisões que valem registro

- **Dedup em três camadas, porque uma não basta.** Impressão do texto (o caso
  comum); dedup pelo **link normalizado** (o caso real: o e-mail vem em HTML
  com carimbo `utm_*`, o texto colado vem limpo — textos diferentes, mesma
  vaga); e o `catch` do `P2002` (a corrida entre as duas portas no mesmo
  segundo). Cada uma pega um buraco que as outras não pegam.
- **Faixa de orçamento grava o PISO.** "de R$ 1.000 a R$ 2.000" vira 1000. A
  coluna guarda um inteiro; escolher o teto contaria à agência uma história
  melhor que a do anúncio, e é assim que nasce proposta cara e lead morto.
- **Moeda estrangeira fica NULA.** "$500 USD" no Upwork não vira 500. A cotação
  não está no anúncio — converter seria inventar.
- **A porta do e-mail NÃO cai no primeiro workspace.** Exige
  `x-radar-workspace` (id ou slug) e confirma no banco; sem isso, 400. O atalho
  do "primeiro workspace" já existe na caixa de entrada do WhatsApp e está na
  vitrine como bomba-relógio de multi-tenant — não repeti aqui.
- **Sem `RADAR_EMAIL_SECRET` a rota responde 503**, antes de ler um byte do
  corpo. Configuração faltando é porta fechada.
- **`textoBruto` não sai em resposta de API.** Fica fora de `CAMPOS_DE_LEITURA`:
  anúncio de marketplace traz contato de terceiro com frequência — PII que não é
  nossa e que não pedimos. Não vai para log em nenhum caminho.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run --fileParallelism=false`: **113 arquivos, 1785 testes, todos
  passando** (37 novos).
- `npx eslint` limpo nos arquivos novos.
- `npx prisma db push` + `npx prisma generate` aplicados na base local.

### 🔴 O que ficou aberto — e um achado que não é meu

1. **DRIFT DE SCHEMA PRÉ-EXISTENTE, fora do meu território.** As colunas
   `quotedPrice`, `quoteStatus`, `quoteNote` e `quoteDecidedAt` de
   `ContentRequest` estão no `schema.prisma` desde o commit `8f79b0a` e **não
   têm migration nenhuma**. Produção só aplica `migrate deploy` — logo essas
   colunas **não existem no volume do Railway**, e qualquer consulta que as toque
   estoura em runtime. Não escrevi a migration porque o modelo é de outro
   departamento e um `ADD COLUMN` errado derruba o deploy de todo mundo. O SQL é
   trivial (quatro `ALTER TABLE ... ADD COLUMN`, nulos, aditivos) — falta a
   decisão de quem é o dono.
2. **A nota e a proposta ainda não existem.** O Radar ingere e devolve `nota`,
   `servicoSugerido`, `raciocinio` e `propostaTexto` nulos. Quem avalia é a etapa
   seguinte, e ela **precisa** tratar `textoBruto` como conteúdo citado — nunca
   concatenado direto em prompt.
3. **A porta do e-mail não tem teto por remetente.** Tem teto de corpo (512 KB)
   e de texto (60k chars), mas quem tiver o segredo pode inserir em ritmo livre.
   No dia em que o segredo vazar, isso enche o volume do Railway.

---

## 06/08/2026 · A caixa de e-mail cheia de alarme — o que era defeito e o que era ruído

Frente aberta pelo CEO: alertas de falha em série (CI, cron, "Deployment
crashed"). Pedido: **descobrir a verdade e consertar a causa**.

### O que os e-mails eram de verdade

**Contexto que explica quase tudo: o GitHub Actions estava em PANE.** Incidente
aberto às 15:22Z, ainda não resolvido às 21:30Z; webhooks estrangulados a ~15%,
capacidade de runner limitada (`githubstatus.com/api/v2/summary.json` →
componente `Actions` em `major_outage`).

1. **CI de 17:38 (`c605fbd`) — "All jobs have failed".** Não foi teste nenhum.
   O job ficou **30 min na fila**, rodou 45 min, registrou **zero passos** e o
   log nem existe (`BlobNotFound`). Casualidade da pane. E `c605fbd` **nem está
   na branch**: é commit órfão de uma corrida entre dois agentes empurrando na
   mesma branch (mesma mensagem de `d9c4232`, pai diferente).
2. **"All jobs were cancelled" em série.** A hipótese do `concurrency` estava
   **errada**: não havia `concurrency` em workflow nenhum. Quem matava os jobs
   era a infraestrutura — e job morto por infraestrutura fecha o *run* como
   `failure`, por isso virou e-mail vermelho.
3. **Duas falhas de CI que eram REAIS** — 12:21 (`5f39ce0`) e 12:22 (`4f62ce2`),
   passo `Tests`. Já consertadas no mesmo dia (`e37a60d` em diante). O único
   defeito de código do dia inteiro, e foi o que menos apareceu na caixa.
4. **Cron "recuperar produção travada" FALHOU 2x.** Também a pane: o job, que é
   **um `curl`**, ficou **83 minutos** pendurado antes de ser morto.
5. **"Deployment crashed" (15:55).** **Nunca houve crash.** O log do deployment
   `2ff2df14` mostra boot limpo, migrations aplicadas, `Ready`, atendendo por 20
   min — e então `SIGTERM` às 18:55:07, que é o Railway trocando o container
   pelo deploy seguinte. Ver a seção abaixo.

### 🔴 O achado que ninguém tinha visto: produção sem prova

**`7724050` — o commit que está em produção — não tem NENHUM run de CI.** Zero.
Com o Actions estrangulado, o push não gerou run; o Railway faz deploy **por
push, não por CI verde**; e subiu.

Rodei o portão à mão neste commit: `tsc` limpo, **2146 testes passando**, `npm
run build` ok, com o Chromium presente (a prova do pixel rodou de verdade, não
foi pulada). **O código está bom** — mas isso foi descoberto por perícia, não
pelo processo.

O buraco é o processo: **"a CI não rodou" e "a CI passou" produzem o mesmo
efeito na caixa de entrada — nenhum e-mail vermelho.** Silêncio virou aprovação.

### O outro achado: o cron de socorro roda 12x menos do que está escrito

`cron-execute.yml` diz `*/10` (6x por hora). Medido nos runs reais dos 3 dias
anteriores, o intervalo **entre disparos** foi de **64 a 203 minutos** — mediana
perto de 100. `schedule` do GitHub é best-effort e o descarte é silencioso.
A rede de segurança da produção roda ~1x por hora e meia. Registrado no próprio
arquivo, para ninguém mais acreditar no "de 10 em 10 minutos".

### O que foi consertado

- **`instrumentation.ts` + `scripts/start.sh` — parada não é queda.** O servidor
  standalone do Next sai com `process.exit(143)` no SIGTERM
  (`node_modules/next/dist/server/lib/start-server.js:375`). 143 é != 0, e é
  assim que a hospedagem reconhece defeito — por isso **todo deploy** gerava
  "Deployment crashed". Agora `start.sh` exporta `NEXT_MANUAL_SIG_HANDLE=true`
  e `pararSemParecerQueda()` sai **0**. Queda de verdade (exceção, OOM, falha de
  boot) segue != 0 — não chega por SIGTERM.
  **Provado no servidor real, não no papel:** mesmo binário, mesmo SIGTERM —
  `EXIT=143` sem a variável, `EXIT=0` com ela.
- **`lib/plataforma/sentinela-do-deploy.ts` + `scripts/sentinela-do-deploy.mts`
  (`npm run sentinela`).** Pergunta à produção qual commit está no ar
  (`/api/health`), ao GitHub se aquele commit tem CI verde, e ao status page se
  o Actions está de pé. **Distingue três coisas que o e-mail confunde:**
  REPROVADO, SEM_PROVA e APROVADO. Ausência de informação não é informação.
  Rodando agora, ele acusa exatamente o buraco, em uma linha.
- **`.github/workflows/sentinela-do-deploy.yml`.** Roda a cada push na branch de
  produção e de hora em hora, e **abre issue** quando a produção está sem prova
  — issue notifica por e-mail e fica aberta cobrando, ao contrário de um job
  vermelho no meio de trinta.
- **`concurrency` na CI** (o cancelamento passa a ser deliberado, fecha como
  `cancelled`, que o GitHub não manda por e-mail) e **`timeout-minutes`** na CI
  (30) e nos dois crons (10) — o job de 83 min não se repete.

### Verificação

- `npx tsc --noEmit` limpo.
- `npx vitest run`: **136 arquivos, 2168 testes, todos passando** (22 novos).
- `npm run build` ok.
- YAML dos 6 workflows validado.

### 🔴 O que fica aberto — precisa de decisão

1. **O Railway não pergunta pela CI.** Ele faz deploy por push. O sentinela
   **detecta e denuncia** depois do fato; ele não impede. Trava de verdade seria
   deploy só por CI verde (Railway Deployment Triggers / deploy via workflow) —
   é mudança de processo de deploy, não cabia nesta frente.
2. **Dois agentes empurrando na mesma branch** produziram `c605fbd` órfão. O
   `concurrency` reduz o desperdício de runner, mas não resolve a corrida de
   push.
3. **A pane do Actions ainda estava aberta** ao fim desta frente: nenhum run foi
   criado entre 19:22Z e 21:40Z. Enquanto durar, o sentinela vai acusar
   `SEM_PROVA_PLATAFORMA_FORA` — que é o veredito correto, não um falso positivo.

---

## 2026-08-06 · O mapa da dependência de conta paga e a troca para a faixa gratuita

**Pedido do CEO:** *"troca pro gratuito, vamos testar na agência; se der certo, replica."*
Premissa dada: a conta da OpenAI está sem crédito.

### A premissa não se confirmou — e o buraco era outro

Rodei geração real em produção antes de trocar qualquer coisa. **A OpenAI gera
normalmente** (`gpt-4o`, 9/9 execuções). Quem estava morto era **o Gemini**, a
faixa gratuita, e ninguém sabia porque a tela mentia.

`app/api/ai-keys/test/route.ts` testava OpenAI e Gemini com `GET /models` — uma
listagem que responde 200 com a conta zerada **e** com o modelo aposentado. A
configuração de produção apontava para `gemini-1.5-pro`, aposentado pela Google.
Resultado: cinco provedores verdes na tela, um deles incapaz de produzir um
caractere. **Verde falso é pior que vermelho:** manda procurar o defeito em
qualquer lugar menos onde ele está.

Sondagem nome a nome contra a chave desta casa (06/08/2026): `gemini-1.5-pro`,
`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-2.5-flash`,
`gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-3-flash` → **todos 404**.
Geram: `gemini-flash-latest`, `gemini-pro-latest`, `gemini-flash-lite-latest`.

### O mapa

| Camada | Onde | Provedor | Quebra se a conta zerar |
|---|---|---|---|
| Texto (motor único) | `lib/ai/generate.ts` | 5 provedores, cadeia de reserva | Não — passa para o próximo com chave |
| Texto (6 rotas de agente) | `app/api/agents/*/generate`, `app/api/brain/*`, `app/api/sdr/{chat,upload}` | **Claude, no braço, sem reserva** | Sim, com aviso |
| Visão | `lib/ai/visao.ts` | claude → openai → gemini | Não — degradação declarada |
| Transcrição | `lib/ai/transcricao.ts` | **OpenAI Whisper, exclusivo** | Sim (outra frente cuida) |
| **Imagem** | `lib/ai/design-engine.ts` | **OpenAI `gpt-image-1`/`dall-e-3`, exclusivo** | Sim, com erro marcado na peça |
| Embedding | — | não existe | — |

### O que descobri que ninguém sabia

- **`AIRunLog` está VAZIO em produção e nunca teve dono.** O único escritor é
  `save()` em `lib/hooks/useDbAIRunLogs.ts:56` — **nenhum arquivo o chama**. E a
  tabela não tem coluna de token nem de custo (`prisma/schema.prisma:741`).
  **Não dá para estimar custo pelo log**, hoje nem retroativamente.
- **A tela de "provedor por agente" é decorativa.** `DbAgentProviderConfig` é
  gravada por `app/api/agent-configs/route.ts` e **lida por ninguém no servidor**.
  A escolha real está *hardcoded* em `lib/agency/execution/especialistas.ts`
  (`provedor: "claude"` na maioria).
- **Não existe como trocar o provedor só de um cliente.** `BRAIN_AI_PROVIDER` é
  env global, e os 4 clientes (Foocci, Dioli Digital Studio, 2× Camila Pereira)
  vivem no **mesmo workspace**. Ligar o gratuito por env põe cliente pagante na
  cobaia — o oposto da ordem.
- **`lib/ai/provider-registry.ts` é código morto.** O cabeçalho afirma que a rota
  de raciocínio e o orquestrador o chamam; **ninguém chama** (só os testes). O
  portão único de verdade é `lib/ai/generate.ts`, guardado por
  `__tests__/brain/no-parallel-brain.test.ts`.

### O que foi feito

- `app/api/ai-keys/test/route.ts:33` e `:98` — OpenAI e Gemini passam a **gerar**
  no modelo escolhido, e sabem nomear 429 (sem saldo) e 404 (modelo morto).
- `lib/ai/generate.ts:157` — `modeloPadrao()` virou função (era const de módulo:
  trocar `GEMINI_MODEL` no Railway não surtia efeito até reiniciar) e o default
  do Gemini virou apelido móvel. Mesmo conserto em `lib/ai/visao.ts:214`.
- `lib/ai/generate.ts` — nova opção **`apenasOPreferido`**: sem reserva. A
  reserva é virtude em produção e mentira na medição.
- `app/api/ai/run/route.ts` — deixou de ter cérebro paralelo, passa por
  `generate()`, aceita os 5 provedores, aceita `estrito` e devolve `ms`.
  **Saiu da lista congelada** do portão único: a lista diminuiu.
- `app/api/ai-keys/route.ts` — `PATCH` troca só o modelo (antes era impossível
  sem recolar a chave, que ninguém tem à mão depois de salva).
- Listas de modelo do Gemini corrigidas em `components/agency/AiKeyManager.tsx`
  e `app/agency/integrations/page.tsx`.
- `__tests__/plataforma/troca-para-provedor-gratuito.test.ts` — 7 testes: modelo
  vivo, o gratuito produz, e **o gratuito indisponível PARA** (prova de que
  nenhuma chamada vaza para o provedor pago no modo estrito).

### O teste na agência — número, não impressão

Cobaia: **Dioli Digital Studio** (`cmsayxrdq00050po7mdeg6kvw`). Nenhuma execução
tocou Foocci ou Camila Pereira. Modo estrito, produção real, portão = o
validador de departamento que já existia.

**45 execuções — 3 departamentos × 5 provedores × 3 rodadas:**

| provedor | passou o portão | mediana | pior caso |
|---|---|---|---|
| claude | 9/9 | 9,8 s | 16,1 s |
| openai | 9/9 | 8,2 s | 11,1 s |
| **gemini (grátis)** | **8/9** | 10,0 s | 11,1 s |
| deepseek | 9/9 | 12,7 s | 39,5 s |
| perplexity | 9/9 | 9,5 s | 14,7 s |

**Aprofundamento Claude × Gemini (36 execuções) + rajada de 15 sequenciais:**

- Gemini no total medido: **36/39 = 92,3%**. Claude: **27/27 = 100%**.
- Todas as 3 falhas do Gemini foram `JSON inválido` **depois de 3 tentativas**, e
  todas em **tráfego pago** — o esquema mais complexo. Custam ~37 s antes de
  desistir.
- Riqueza da saída (mediana de caracteres): estratégia **3.078 (Claude) × 2.122
  (Gemini)** — o gratuito entrega ~31% menos texto. Social: 1.877 × 2.466
  (Gemini maior). Tráfego pago: 3.532 × 3.042.
- 15 chamadas sequenciais no Gemini: **15/15**, sem estouro de cota.

### Imagem — com todas as letras

**Não troquei, e não recomendo trocar às cegas.** `design-engine.ts` fala o
dialeto de imagens da OpenAI; o Gemini exigiria adaptador novo. Sondei a chave
desta casa: `gemini-2.5-flash-image` e `gemini-3-pro-image-preview` **existem e
respondem**. Mas *existir não é ter a qualidade do feed*, e **eu não medi
qualidade de arte** — medir isso é comparação visual, não `curl`. Rebaixar a
peça calado seria exatamente a degradação silenciosa que a ordem proíbe.

### Verificação — À MÃO, porque não há CI

GitHub Actions em pane. Rodei os três portões na mão, nas duas entregas:
`npx tsc --noEmit` limpo · `npx vitest run` **139 arquivos, 2206 testes, todos
passando** · `npm run build` ok. **Não há CI verde para estes commits.**

### 🔴 O que fica aberto — precisa de decisão do CEO/Diretor

1. **A troca por cliente não existe.** Ligar `BRAIN_AI_PROVIDER=gemini` põe
   Foocci na cobaia. Falta um seletor por cliente (ou fazer
   `DbAgentProviderConfig` finalmente ser lido) — decisão de arquitetura, não
   minha.
2. **Custo é imensurável hoje.** Sem instrumentar `AIRunLog` com tokens, nenhuma
   conversa sobre economia passa de palpite.
3. **Tráfego pago é o ponto fraco do gratuito** (2 falhas em 6). Se o gratuito
   entrar, entra por departamento, não de uma vez.
4. **6 rotas de agente ainda falam com a Anthropic direto**, sem reserva. São o
   que sobra da lista congelada; migrar para `generate()` é ganho de robustez
   independente de provedor.
