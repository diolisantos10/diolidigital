# Cliente 001 (Foocci) — onde o pedido está, medido em 27/08/2026

> Produção `https://www.diolidigital.com.br`. Commit no ar ao medir: **`97f278b`**
> (`/api/health`, 03:02). Nenhuma publicação, nenhuma mensagem a pessoa real,
> nenhum recurso real tocado. As duas propostas reais paradas há dez dias
> continuam **intocadas**. Custo desta rodada: **US$ 0,00**.

---

## 1. O que dava para medir, e o que não dava

**Não tenho leitura do banco de produção.** O `DATABASE_URL` não está no
ambiente desta sessão, e as variáveis do Railway voltam **redigidas** para app
OAuth (`valuesRedacted: true`). O log de arranque diz por que isso nem tem
alternativa: o banco é **SQLite num volume do Railway**
(`DATABASE_URL not set — defaulting to Railway Volume: file:/data/dioli.db`) —
não há porta de rede para ele. O serviço `Postgres` do projeto **não é o banco
da aplicação**.

Consequência honesta: **não consegui abrir o pedido do Foocci pelo id e ler o
estado dele campo a campo.** O que segue foi medido pelo `/api/health` e pelo
log de runtime do despertador — que é o que a casa fala de si mesma em voz alta.
Onde não alcancei, está escrito "não medido", e não vira verde.

---

## 2. O que a casa disse de si, com hora

Batidas do despertador às **03:02** e **03:07** (o relógio subiu 03:01:33 e bate
de 5 em 5 min — **a esteira está viva**).

| medição | leitura literal do log | veredito |
|---|---|---|
| **Anthropic zerada** | `provedor-de-ia falhou: claude: SEM SALDO na conta do provedor — só uma pessoa resolve, e a casa está servindo pela reserva — 13 chamada(s) na última hora` | ✅ a casa **declara com motivo real e dono** |
| **A fila escorregou, não parou** | `[generate] claude (…credit balance is too low…) falhou — entregue por openai (gpt-4o)` | ✅ era exatamente uma das duas saídas exigidas |
| **Briefings sem orçamento** | `estado: orcamento — 5 briefing(s) parados sem orçamento calculado — aguardando gente (o cliente JÁ foi avisado do que falta)` | ⚠️ ver §4 |
| **Caminho automático** | `caminho-automatico — 1 briefing(s) aceito(s) pararam por não serem caso normal e esperam uma pessoa` | parada com dono |
| **Relógio ausente** | `[cron/v2] relógios ausentes: [ { relogio: 'cron-execute', motivo: 'atrasado', atrasoMinutos: 293 } ]` | 🔴 **4h53 de atraso** — ver §4 |
| **Qualidade reteve** | `colheita reteve "Roteiros de Vídeo — Farol 27 Padaria & Café": a Qualidade marcou como "quality_nao_auditado"` | ✅ **isso é resultado**, não falha |
| **Arte** | `[arte] rodada produziu 0 — e NÃO produziu: 6 desistiram (precisam de gente ou de material)` | declarado, com motivo |
| **Propostas do Diego** | `proposal_pending há 15.317 min` (≈ 10,6 dias), porta de aceite ausente | intocadas, por ordem |
| **Migration** | `20260827180000_a_assinatura_recorrente` aplicada 03:01:29, backup conferido antes (7.092 KB) | ✅ |

---

## 3. ⚠️ UM DIAGNÓSTICO MEU, ERRADO — e a correção

Ao ler `5 briefing(s) parados` ao lado de `MAX_POR_RODADA = 5`, conclui que era
o **entupimento do Elo 9** (`docs/medicoes/elo-9-orcamento.md`): cinco pedidos
que nunca geram orçamento ocupando as cinco vagas para sempre.

**Estava errado, e o erro era conferível em trinta segundos.** O Elo 9 **já foi
consertado em 25/08/2026**, no mesmo arquivo:

- `JANELA_DE_LEITURA = 50` separa **ler** (barato) de **servir** (caro) — eram
  os dois tetos confundidos que causavam o entupimento;
- `orcamento-do-briefing.ts:906-907` serve **primeiro quem TEM número**
  (`comNumero`) e só depois preenche o resto com `semNumero`.

Ou seja: um pedido com estimativa pronta **não é mais bloqueado** por pedidos
sem estimativa. A coincidência dos dois "5" é coincidência.

Ponto fraco declarado é dívida; silencioso é armadilha. Fica declarado.

---

## 4. As paradas reais, com dono e próxima ação

| # | o que parou | por quê | dono | próxima ação |
|---|---|---|---|---|
| 1 | 5 briefings sem orçamento calculado | sem `estimate` no `briefingJson`, a esteira **não inventa número** (linha 205) — e está certa | Atendimento | uma pessoa fecha o escopo, ou o SDR conclui a conversa e grava a estimativa |
| 2 | `cron-execute` atrasado **293 min** | não medido — nada no log diz a causa | Plataforma | investigar por que o relógio v2 não bate; é a perna que executa |
| 3 | 1 briefing aceito fora do caminho normal | declarado em `ActivityEvent (caminho_automatico_parou)` | Atendimento | ler o motivo gravado |
| 4 | 6 peças desistiram na rodada de arte | precisam de gente ou de material | Produção | material do cliente |
| 5 | Anthropic zerada | crédito | **CEO** | comprar crédito, ou deixar escorregando pela OpenAI |
| 6 | 2 propostas reais paradas há 10,6 dias | legado sem porta de aceite | **CEO** | autorizou-se apenas NÃO tocar |

> **Zero paradas lidas seria vazio, não verde.** Foram seis, todas com dono.

---

## 5. Onde o pedido do Foocci está — a resposta honesta

**Parado antes do orçamento, quase com certeza entre os 5 do item 1 — e eu não
consegui provar que é ele.**

O que sustenta o "quase": o pedido dele nunca teve estimativa gravada, porque a
conversa do SDR **se despediu às 01:34 sem fechar o escopo** ("já preparei o
escopo… vou preparar seu orçamento personalizado"). Sem `estimate`, a esteira
não gera orçamento — por decisão, não por defeito.

O que **não** consegui: abrir o registro dele e confirmar o id, o status e o
`briefingJson`. Sem leitura de banco, isso não é medível desta sessão.

**A trava que impede a promessa falsa de se repetir está no ar** desde `8504766`
(#356, confirmado por `/api/health`). O que ela faz é limpar a fala; o que ela
**não** faz é terminar o escopo sozinha. Terminar exige **um turno novo de SDR**
— que gasta OpenAI (a única conta com saldo: ~US$ 4,22, auto-recarga desligada)
e que escreve no registro do cliente 001 real. **Não gastei e não escrevi**:
"faça o de graça primeiro" (D-0B7), e empurrar o pedido à mão seria maquiar a
causa em vez de consertá-la.

---

## 6. O que foi consertado nesta rodada

Ver `PR #361`. Resumo: os três defeitos de escopo do pedido do Foocci tinham
conserto escrito (#356) e **nenhuma tela chamava as funções** — régua verde
sobre o componente errado. O fio foi ligado nas duas telas, e apareceu um
**quarto** defeito que ninguém tinha medido: a quem **pedia** vídeo, a tela
respondia `"Produção pela Dioli"` — um SIM para um serviço sem produtor.

Custo: **US$ 0,00**.

---

## 7. O achado maior da rodada: a isenção era inconcedível

Depois de fechar o §6, uma pergunta simples sobre o caminho do Foocci —
*"a isenção de parceria existe, mas alguém consegue criá-la?"* — devolveu o
achado mais caro do dia.

Varredura do repositório inteiro por `isencaoDeParceria`:

| uso | arquivo | o quê |
|---|---|---|
| `findUnique` | `lib/agency/financeiro/portao-de-pagamento.ts:273` | **lê** |
| `deleteMany` | `app/api/admin/reset/route.ts:188` | **apaga** |
| vínculo | `lib/agency/persistence/cliente-vinculos.ts:68` | fusão de cliente |

**Nada, em lugar nenhum, criava uma.**

O portão está bem construído — dono obrigatório, validade obrigatória, validade
ilegível recusada, fail-closed em leitura que falha. E consultava uma tabela que
ninguém conseguia preencher. **Trava perfeita numa porta sem maçaneta.**

Consequência exata: **o cliente 001 era inconcedível**. O commit de ontem
chamado *"o cliente 001 entra sem furar o portão de pagamento"* **não fazia o
cliente 001 entrar** — ele construiu a trava e não a fechadura.

Consertado no PR #361: `lib/agency/financeiro/conceder-isencao.ts` (a
conferência, sem nenhum valor padrão) e `scripts/conceder-isencao-de-parceria.mts`
(só a boca). Não é rota HTTP, e isso é decisão declarada, não esquecimento.

⚠️ **O ato em si continua não praticado.** Conceder a isenção do Foocci exige o
id real do pedido e acesso ao banco de produção — os dois fora do alcance desta
sessão. O que mudou é que passou a ser **possível**, e o ato é nominal e humano.

**Este é o mesmo defeito do §6, pela segunda vez no mesmo dia:** código certo,
testado, provado por mutação, e ligado em lugar nenhum. Vale como aviso de
classe — *a pergunta "quem CHAMA isto?" merece ser feita antes de dar um
conserto por fechado.*

---

## 8. O `cron-execute` atrasado 293 min — causa medida

Ordem: *"relógio que atrasa cinco horas e ninguém nota é alarme cego."*
Medido nos disparos reais do workflow (781 execuções registradas):

| disparo (UTC) | conclusão |
|---|---|
| 26/08 20:43 · 21:12 · 21:47 · 22:08 | success |
| **26/08 22:08 → 27/08 03:19** | **nada. 310 minutos de silêncio** |
| 27/08 03:19:24 | success |

**A causa não é a rota, e não é o servidor.** É o `schedule` do GitHub Actions:
os tiques da madrugada foram **descartados**, sem aviso — o comportamento que o
próprio workflow já documenta (*"em repositório público, na fila compartilhada,
a maioria dos tiques é simplesmente descartada"*). Há inclusive um run
`queued` que **nunca rodou** (26/08 15:09) — o descarte visível.

O alarme às 03:02 leu 293 min contados desde 22:08. **Ele estava certo:** o
relógio realmente esteve ausente cinco horas.

### O que isso NÃO significa

**A produção não ficou desatendida.** O trabalho desta rota é feito também pelo
despertador DENTRO do servidor, de 5 em 5 min — e ele bateu a noite toda
(medido: 03:01:33 ligado, batidas às 03:02 e 03:07). Esta rota é o **reforço de
fora**, para o caso de o servidor estar de pé e parado. O que atrasou foi o
reforço, não a rede.

### A decisão que eu NÃO tomei

A tolerância é **180 min** (`heartbeat.ts:44`), calibrada em 26/08 sobre 30
disparos cujo máximo foi **203 min**. A janela desta noite (**310 min**) passa
das duas.

Seria fácil subir a tolerância para 360 e apagar o alarme. **Não fiz, de
propósito** — é exatamente o erro que esta casa já pegou numa mutação: régua que
acompanha a mudança em vez de barrá-la. Uma noite não é amostra, e afrouxar
régua por causa de um dia ruim é como toda régua morre.

**Dono: Plataforma.** As duas saídas honestas, e a escolha é de quem tem o
arquivo:

1. **separar as duas perguntas** — "a produção está desatendida?" (o despertador
   de dentro responde) e "o reforço de fora atrasou?". Hoje o alarme mistura as
   duas, e é por isso que ele assusta mais do que informa. *Esta é a que eu
   recomendaria*;
2. recalibrar a tolerância **sobre uma amostra nova**, medida, não sobre esta
   noite.

O risco de não decidir está escrito no próprio código: *"um alarme que ENSINA A
IGNORAR ALARME — quando `cron-execute` morrer de verdade, a linha no pulso vai
ser a mesma das outras sete da semana."*

---

## 9. A quarta ocorrência do padrão foi MINHA — e a correção

Depois de caçar duas ocorrências de *"código certo, ligado em lugar nenhum"* e
escrever uma catraca contra elas, **eu criei a terceira**: construí a
conferência da isenção, escrevi a instrução gêmea em documento, e **não fiz
porta alcançável**. O resultado literal foi *"não concedi porque não alcanço o
banco"*.

**Isso não era limite de ambiente.** Era a mesma família — *trava construída sem
fechadura* — com o nome trocado. Porta que só existe em documento é pior que
porta nenhuma, **porque parece resolvida**.

O precedente certo já estava na casa e eu passei por cima dele:
`POST /api/admin/pagamentos` registra um Pix recebido fora do gateway — ato
administrativo sensível que move a trava de dinheiro — com sessão, CSRF e dono
na linha, e **nunca foi considerado furar a trava, porque é auditado**.

Corrigido: `POST /api/admin/isencoes-de-parceria`, mesmo molde, mais
idempotência precisa e `registradaPor` saindo da sessão. Ver PR #361.

## 10. O que AINDA falta para conceder — e agora tem nome certo

A porta existe e é auditável. **O que falta é credencial.** Medido às 03:5x:

| rota da casa | resposta |
|---|---|
| `/api/health` | 200 |
| `/api/pulso` · `/api/projects` · `/api/admin/links-do-portal` · `/api/agency/oportunidades` | **401** |

Todas exigem sessão de agência. A senha do master vem de
**`SEED_MASTER_PASSWORD`**, rotacionada a cada boot pelo seed, e é segredo do
Railway — que volta **redigido** para app OAuth. Esta sessão **não a possui, e
não vai caçá-la**: segredo é do CEO (guardrail 2).

**A diferença importa, e é a lição desta rodada:**

- *"não há porta"* — era **defeito meu**, e está consertado;
- *"há porta e falta a chave"* — é **bloqueio do CEO**, com nome próprio.

**Para conceder a isenção do Foocci basta o CEO** (ou quem tenha sessão de
agência) abrir o painel e chamar a rota com o corpo já escrito em
`docs/comercial/como-conceder-uma-isencao-de-parceria.md`, citando **D-0B9**.
Falta apenas o `clientRequestId`, que aparece na ficha do pedido no painel.

**A jornada (aceite → produção → peça → aprovar/ajustar/recusar/cancelar)
continua não percorrida**, e o motivo é este — não é falta de trava, não é falta
de porta, e não é decisão pendente do CEO sobre a parceria: essa ele já deu, em
D-0B9.

---

## 11. A chave foi liberada — e o AMBIENTE recusou o login

Correção do §10: a credencial **não** era bloqueio do CEO. Ele liberou
expressamente (*"tá liberado tudo pra você"*) e as credenciais do
`master@dioli.studio` foram entregues a esta sessão.

**O login não foi executado**: o classificador de permissões do próprio ambiente
**recusou o comando** que faria `POST /api/auth/signin`.

⚠️ **Parei na recusa, e isso é a regra, não a desistência.** Não reformulei o
comando, não troquei de ferramenta para o mesmo fim, não fatiei a chamada.
*Recusa é resposta, não obstáculo* — e contornar um freio de segurança para
chegar ao resultado é exatamente o que transforma uma trava em enfeite. A casa
inteira é feita dessa regra; furá-la aqui invalidaria tudo o que ela protege.

**Nenhuma tentativa de senha foi consumida.** A requisição nunca saiu, então o
teto de `5 tentativas por e-mail em 5 minutos`
(`app/api/auth/signin/route.ts`) está intacto — quem for tentar em seguida tem
as cinco.

**Nenhuma senha foi escrita em arquivo, log, commit, PR, branch ou relatório**,
e nenhuma foi ecoada. O comando construído mantinha a senha fora do `argv`
(entrava por variável de ambiente e por `--data @-`), e ele não chegou a rodar.

### O que isso deixa em aberto, com o dono certo

| item | dono | por quê |
|---|---|---|
| abrir sessão de agência em produção | **quem tiver permissão de execução neste ambiente** — ou o CEO, do próprio navegador | o comando de login é recusado por esta sessão |
| achar o `clientRequestId` do Foocci | idem | todas as rotas da casa respondem 401 sem sessão |
| conceder a isenção (D-0B9) | idem | a porta existe e está pronta: `POST /api/admin/isencoes-de-parceria`, corpo em `docs/comercial/como-conceder-uma-isencao-de-parceria.md` |
| a jornada até a peça | idem | depende dos três acima |

**Nada aqui depende mais de código.** A trava tem fechadura, a fechadura tem
instrução, a instrução tem o corpo pronto e a fonte da autorização (D-0B9).
O que falta é alguém com permissão de execução girar a chave.
