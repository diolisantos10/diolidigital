# A saída de emergência que não abre — `--forcar` gravado e ignorado

> **Origem:** ficha de despacho PM → `plataforma`, 28/08/2026 ("a saída que
> abre"). O defeito foi medido rodando o código real, não lido em prosa.

---

## 1. O defeito

`--forcar --motivo "<texto>"` é a saída de emergência do sistema de
reivindicação (`npm run reivindicar -- abrir`): quando uma colisão é real mas
a sessão precisa seguir mesmo assim, ela força e o motivo fica registrado em
`forcadaPor` no JSON da reivindicação.

O registro sempre funcionou: `forcadaPor` é gravado em `comandoAbrir`
(`scripts/reivindicar.mts:967`, antes do conserto), validado em
`validarReivindicacao` (`lib/coordenacao/reivindicacoes.ts:534-546`, antes do
conserto) e impresso pelo comando `listar`
(`scripts/reivindicar.mts:1304`, antes do conserto).

O que nunca funcionou: os dois lugares que **decidem se a colisão bloqueia**
— `conferirColisao` (o que o gancho pre-push chama) e `conferirRegistro` (o
sentinela dentro de `npm test`) — nunca liam `forcadaPor`. A força era
gravada, mas **não valia nada** na hora que importava.

## 2. Os dois becos, reproduzidos executando o código real

**BECO (a) — sentinela dentro de `npm test`, via `conferirRegistroNoDisco`:**

```
ok: false
PROBLEMA: "coordenacao/sentinela-vs-forcada-2" (ses-EU) x
  "coordenacao/sentinela-vs-forcada" (ses-OUTRA-SESSAO): mesma
  responsabilidade ... => suite VERMELHA
```
(a minha reivindicação tinha `forcadaPor` com motivo escrito; foi ignorado.)

**BECO (b) — gancho pre-push, via `conferirColisao` com responsabilidade-isca:**

```
colide: true
MOTIVO: arquivo "lib/coordenacao/reivindicacoes.ts" ja reivindicado por
  ses-OUTRA-SESSAO => `conferir` faz process.exit(1) => PUSH BARRADO
```

Quem força fica preso dos dois lados: deixar a reivindicação aberta reprova a
suíte inteira; tentar empurrar o commit é barrado pelo gancho. **A saída de
emergência não tinha saída.**

## 3. O conserto

`abrir --forcar` já funcionava — desvia da trava sozinho, e essa lógica não
foi tocada. O buraco era só nos dois consumidores.

### 3.1 Escopo da força — `forcadaPor` ganha `contra`

`forcadaPor?: { quem: string; motivo: string; em: string; contra?: string[] }`
(`lib/coordenacao/reivindicacoes.ts`). `contra` são os `quem` contra os quais a
força foi exercida. Em `comandoAbrir`
(`scripts/reivindicar.mts:967`, agora com `contra: resultado.quemColidiu`),
`contra` é preenchido com o valor que a própria conferência de colisão já
calculou — nunca recalculado, nunca digitado.

`contra` é **opcional** — retrocompatível com as 4 reivindicações legadas que
têm `forcadaPor` sem `contra` no registro real. E é uma regra dura: **força
sem `contra` nunca é honrada** — mantém o comportamento de hoje. Honrar força
sem alvo nomeado desculparia colisão contra terceiros que nunca foram
forçados; isso seria afrouxar a trava, não abrir a saída de emergência.

### 3.2 `conferirRegistro` — o sentinela do `npm test`

Para cada par `(a, b)` em colisão, `honraForcada(r, contraQuem)` confere se
`r.forcadaPor.motivo` é não-vazio e `r.forcadaPor.contra` inclui `contraQuem`
— checado nos dois sentidos (`a` contra `b` e `b` contra `a`), porque a ordem
do par no laço não pode decidir o veredito. Honrada não vira `problemas` —
vira uma linha no canal novo `forcadas: string[]`, com o prefixo
`⚠️  FORÇADA E HONRADA —`, nomeando quem forçou, contra quem, o motivo e desde
quando. `ok` continua `true` quando só há `forcadas`.

### 3.3 `conferirColisao` — o que o gancho pre-push chama

Ganhou um quinto parâmetro opcional, ao final:
`forcadasDoAutor: Reivindicacao[] = []` — assinatura antiga preservada, nenhum
chamador existente muda de comportamento. No pre-push a "nova" é uma
proposta-isca sem `forcadaPor` (a força não está nela — está no registro
remoto). `comandoConferir` monta `forcadasDoAutor` a partir de
`existentes.filter(quem === <esta sessão> && forcadaPor && viva)` e passa
adiante. Colisão com `existente` é honrada se alguma reivindicação de
`forcadasDoAutor` documenta força contra `existente.quem`. Honrada não entra
em `motivos`, não conta para `colide`, não entra em `quemColidiu`, e vai para
`forcadas` (mesmo formato nomeado). `comandoConferir` imprime
`resultado.forcadas` **antes do desfecho**, colidindo ou não.

## 4. Por que a proteção não afrouxou

- Colisão **não forçada** continua em `motivos`, continua vermelha, continua
  barrando o push — sem exceção; os testes 1 e 3 do arquivo novo provam isso.
- `--forcar` sem `--motivo` continua recusado
  (`scripts/reivindicar.mts:824`, inalterado).
- `motivo` vazio ou só espaço nunca honra (`honraForcada`) — teste 6.
- Força **sem `contra`** (legada) nunca honra — teste 5. As 4 reivindicações
  reais de antes de 28/08/2026 continuam bloqueando exatamente como hoje.
- `contra` que **não nomeia o outro lado do par** nunca honra — teste 4.
- Reivindicação velha continua em `avisos`; encerrada continua ignorada —
  nenhum dos dois caminhos foi tocado.
- `--no-verify` dentro de `abrir` não foi removido — é deliberado e já
  documentado em outro lugar.

## 5. Testes

`__tests__/coordenacao/forcada-honrada.test.ts` — um bloco por caminho da
ficha de despacho: colisão comum, colisão forçada e honrada (nos dois sentidos
do par), o mesmo caminho no pre-push, força com `contra` errado, força legada
sem `contra`, motivo vazio/espaço, e a validação de `forcadaPor.contra`
malformado.

### 5.1 A prova de que o teste vê o conserto — medida, não afirmada

Uma versão anterior deste documento dizia que **cada** teste falha se o
conserto for revertido. **Isso está errado, e a medição é o que corrige.** O
PM desligou o conserto na fonte (`honraForcada` passando a devolver sempre
`undefined`, que é exatamente "o conserto fora") e rodou o arquivo:

```
 × conferirRegistro: ok true, problemas vazio, forcadas nomeia quem/contra/motivo
 × a mesma checagem funciona não importa a ORDEM do par (a, b) no laço
 × colide false, e forcadas nomeia tudo
 Test Files  1 failed (1)
      Tests  3 failed | 12 passed (15)
```

**3 de 15 ficam vermelhos, e são os 3 certos** — os que afirmam que a força é
HONRADA. Os outros 12 continuam verdes de propósito: eles afirmam que a
colisão **continua bloqueando** (comum, `contra` errado, força legada, motivo
vazio), e esse é o comportamento de antes *e* de depois do conserto. Teste de
não-afrouxamento que ficasse vermelho sem o conserto estaria medindo outra
coisa. Os 12 são a METADE 2 da trava — a que prova que ela não inventa
problema no caso limpo.

### 5.2 Os dois becos, DEPOIS do conserto — mesma reprodução, mesmo código

```
── BECO (a) — o sentinela que roda dentro de `npm test` ──
ok: true
   ⚠️  FORÇADA E HONRADA — ses-EU forçou contra ses-OUTRA-SESSAO: "frente
   alheia parada ha 13 dias, sessao dona nao existe mais" (desde
   2026-08-29T11:00:00Z).
   => suite VERDE

── BECO (b) — o gancho pre-push (`conferir`, canal de arquivo) ──
colide: false
   ⚠️  FORÇADA E HONRADA — ses-EU forçou contra ses-OUTRA-SESSAO: "frente
   alheia parada ha 13 dias, sessao dona nao existe mais" (desde
   2026-08-29T11:00:00Z).
   => push liberado
```

Os dois becos fecham, e nos dois a força continua **nomeada**: quem forçou,
contra quem, o motivo e desde quando. Forçar deixou de ser beco sem deixar de
ser dado contra a régua de quem forçou.

### 5.3 O portão, rodado pelo PM

`npx tsc --noEmit` limpo (depois dos testes escritos, não antes);
`npm test` verde — **536 arquivos, 7458 testes**, 1 pulado.

---

## 5.4 Dois achados de lado, encontrados ao reproduzir

**(i) Esta frente já tinha sido reivindicada — e abandonada há 13 dias.**
`reivindicacoes/coordenacao-sentinela-vs-forcada.json` estava aberta desde
`2026-08-16T20:59:46.519Z` por `ses-e83d64678d`, com a frente *"sentinela
reprova reivindicacao FORCADA com motivo: decisao registrada deve virar aviso,
nunca reprovacao"* — exatamente este conserto — e **nunca encerrada nem
entregue**. O mecanismo se comportou como projetado: 13 dias é muito além do
teto de 24h, então ela entrou como aviso e não bloqueou a reabertura:

```
⚠️  [reivindicação velha, não bloqueia] mesma responsabilidade
"coordenacao/sentinela-vs-forcada" já reivindicada por ses-e83d64678d
— aberta em 2026-08-16T20:59:46.519Z.
```

O registro dizia, desde 16/08, que este beco era conhecido. Ninguém o leu.

**(ii) `--forcar` dentro do texto de `--frente` é lido como flag.** Ao abrir
esta reivindicação, uma primeira tentativa com a frase *"honrar `--forcar`:
…"* fez o parser tratar o `--forcar` do meio da frase como a flag de forçar.
Não foi consertado aqui (está fora deste beco, e a ficha manda não ampliar) —
fica registrado: **o parser de argumentos não separa valor de flag**, e uma
frente cujo texto cite qualquer nome de flag pode ligar essa flag sem querer.

---

## 6. Workflows com histórico raso — registro para decisão do CEO

> Seção copiada como veio na ficha de despacho, sem alteração de nenhum
> workflow.

Todos os `actions/checkout` desta casa clonam histórico RASO. Nenhum foi
alterado — a decisão é do CEO. Sem `fetch-depth` (default = 1):
`.github/workflows/ci.yml:71`, `cliente-falso-ao-vivo.yml:68`,
`kit-espelho.yml:61`, `sentinela-do-deploy.yml:61`,
`biblioteca-diaria.yml:39`, `raio-x-noturno.yml:36`.
Com `fetch-depth: 1` explícito e justificado:
`redisparar-deploy.yml:55-58` ("`git ls-remote` precisa do remoto; o histórico
raso basta"). O que mudaria: `fetch-depth: 0` nos que precisam comparar
histórico. Contexto: o "histórico órfão" que condenou 7 PRs por engano nasceu
de clone raso; a trava do PR #388 recusa a conclusão, mas a causa segue no
ambiente.
