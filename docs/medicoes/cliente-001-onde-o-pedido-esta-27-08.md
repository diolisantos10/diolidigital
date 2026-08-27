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
