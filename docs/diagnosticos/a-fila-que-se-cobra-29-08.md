# A fila que se cobra — 29/08/2026

> Quem despachou: Diretor Geral. Quem executou: PM (`coordenacao/fila-que-se-cobra`),
> com `plataforma` construindo em duas rodadas. Reivindicação:
> `reivindicacoes/coordenacao-fila-que-se-cobra.json`.

## O defeito — quatro ocorrências no mesmo dia, sempre a mesma doença

O problema **estava registrado**, e ninguém leu o registro.

- A reivindicação `coordenacao/sentinela-vs-forcada` foi aberta em **16/08** e
  descreve com todas as letras um conserto que só saiu **hoje** — 13 dias.
- O PR **#166** carrega desde 16/08 a coluna que falta em `RecusaV2`, furo de
  vazamento entre agências achado pela segurança — 13 dias parado.
- **Onze PRs abertos nunca foram julgados por ninguém**; três se anunciam P0.
- Um alarme de aprovação parada existe no código
  (`lib/agency/esteira/aprovacao-parada.ts`) e **não é chamado por arquivo vivo
  nenhum** — o PR que o ligaria é o #168, parado há 13 dias.

Havia **sete rotinas agendadas** nesta casa e **nenhuma** varria reivindicação
velha nem PR parado. Escrever no manual "o PM deve varrer a fila" já tinha sido
tentado, e produziu 13 dias de silêncio. Prompt é sugestão; isto é mecanismo.

## 1. A medição — os números de hoje, antes de construir

### Reivindicações — 76 arquivos, 11 abertas

```sh
node -e 'const fs=require("fs");const agora=new Date();
const rs=fs.readdirSync("reivindicacoes").filter(f=>f.endsWith(".json"))
  .map(f=>JSON.parse(fs.readFileSync("reivindicacoes/"+f,"utf8")));
const ab=rs.filter(r=>!r.encerradaEm);
console.log("total",rs.length,"abertas",ab.length);
for(const r of ab.sort((a,b)=>new Date(a.abertaEm)-new Date(b.abertaEm)))
  console.log(((agora-new Date(r.abertaEm))/864e5).toFixed(1)+"d", r.id);'
```

| idade | estado | reivindicação |
|---|---|---|
| 12.4d | **VENCIDA** | `docs-alarme-que-mente` |
| 12.3d | **VENCIDA** | `piloto/chave-do-diagnostico` |
| 12.3d | **VENCIDA** | `plataforma-cadencia-de-entrega` |
| 1.0d | **VENCIDA** | `triagem-prs-parados` |
| 0.7d | viva | `pedido-relatorio-do-ceo` |
| 0.6d | viva | `varredura-de-posse` |
| 0.1d | viva | `p0-convite-e-promessa` |
| 0.0d | viva | `seguranca/posse-pagamento-parceria` |
| 0.0d | viva | `comercial/promessa-cumprida-fila` |
| 0.0d | viva | `consertos-presos/porte-de-furos-vivos` |
| 0.0d | viva | `coordenacao/fila-que-se-cobra` (esta) |

**4 vencidas** contra o teto de 24h que a casa já escreve
(`TETO_HORAS_PADRAO`, `lib/coordenacao/reivindicacoes.ts:134`). Três delas há
mais de 12 dias.

### PRs — 34 abertos

```sh
curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/diolisantos10/diolidigital/pulls?state=open&per_page=100"
# e, por PR: /pulls/{n}/commits, /pulls/{n}/reviews, /issues/{n}/comments
```

Dias desde o último commit de cada PR, em ordem:

```
0.0 0.0 0.0 0.0 0.1 0.1 0.1 0.1 0.1 0.6 0.7 4.2 4.5 5.4 │ 12.9 12.9 12.9 12.9
13.0 13.0 13.0 13.0 13.2 13.2 13.3 13.3 13.3 13.3 13.3 13.3 13.3 13.3 14.0 25.4
```

- **34 abertos**, 6 rascunhos.
- **20 sem commit novo há mais de 7 dias** (todos com 12.9d ou mais).
- **34 de 34 têm ZERO review formal** (`APPROVED`/`CHANGES_REQUESTED`).
- **Só 3 PRs têm qualquer comentário**: #10, #170, #324. Os outros **31 nunca
  receberam julgamento nenhum de ninguém.**

## 2. O limiar: 7 dias — justificado no dado, não no gosto

A distribuição acima é **bimodal**, e a barra `│` marca o motivo: **existe uma
faixa vazia de 5.4d a 12.9d — 7,5 dias sem um único PR dentro.** Ou o PR foi
tocado nesta semana, ou está parado há quase duas.

Qualquer limiar dentro dessa faixa produz **o mesmo veredito hoje**: 14 PRs de
um lado, 20 do outro. **7 foi escolhido por ter folga dos dois lados** — 1,6d
acima do último PR vivo (5.4d) e 5,9d abaixo do primeiro PR parado (12.9d).

- Abaixo de 5.4d, a rotina passaria a cobrar trabalho em andamento.
- Acima de 12.9d, ela deixaria o backlog inteiro de 13 dias passar em silêncio
  — exatamente o que aconteceu.

O teto das reivindicações **não foi inventado**: são as 24h que a casa já
escreveu, reusadas de `TETO_HORAS_PADRAO`.

## 3. Duas calibrações contra o alarme que todo mundo aprende a ignorar

O defeito que estamos matando é registro que ninguém lê. Alarme que dispara
sempre vira a mesma coisa. Duas travas contra isso:

**a) "PR sem veredito" exige idade.** Sem a qualificação de 7 dias, a lista
sairia com os 34 PRs todo santo dia — inclusive os abertos há 20 minutos.
E **comentário conta como veredito**, porque esta casa julga PR em comentário,
não em review formal (0 de 34 têm review; os 3 que foram julgados, foram em
comentário).

**b) PR pode declarar que está parado de propósito.** Título com marcador
(`não mesclar`, `não mergear`, `não fechar`, `WIP`) entra na lista
`estacionados` — **aparece no relatório, nunca conta no total**. Sem isso, o
#10 (`📮 CANAL DOS DIRETORES — não mergear, não fechar`, que o CEO mandou
deixar aberto) deixaria a rotina vermelha para sempre.

**c) O total conta coisas distintas a perseguir.** Um PR velho e nunca julgado
cai nas duas listas. Somar as listas inflaria a manchete de ~23 para ~41.
`totalCobravel` deduplica por número do PR — número inflado é como um alarme
perde a confiança.

## 4. O mecanismo — e quem chama cada peça

| peça | o que é | **quem a chama** |
|---|---|---|
| `.github/workflows/fila-parada.yml` | agendamento diário | `cron: "41 7 * * *"` (linha 24) = 04:41 BRT + `workflow_dispatch` |
| `package.json` → `"varrer-fila"` (linha 39) | o atalho | `.github/workflows/fila-parada.yml:59` — `run: npm run varrer-fila` |
| `scripts/varrer-fila-parada.mts` | o I/O (disco + API do GitHub) | `package.json:39` |
| `lib/coordenacao/fila-parada.ts` | a régua pura | `scripts/varrer-fila-parada.mts:181` (`retratoDaFila(...)`) e `__tests__/coordenacao/fila-parada.test.ts` (22 testes, dentro de `npm test`) |
| `docs/relatorios/fila-parada.md` | o relatório | escrito e comitado pelo workflow a cada corrida |

**O horário:** 04:41 BRT, madrugada e longe do topo da hora. Os slots já
ocupados eram `0 6`, `17 6`, `0 9`, `0 9`, `0 10`, `17 * * * *` e `*/10`.

**A branch:** `claude/dioli-agency-os-architecture-kk7kp`. ⚠️ Note que
`raio-x-noturno.yml` aponta para `claude/dioli-pm-role-pow56e`, **branch
morta** — é o defeito do PR #152, parado há 13 dias. Não foi repetido aqui.

**Reuso, não construção paralela:** a régua reusa `estaViva` e
`TETO_HORAS_PADRAO` de `lib/coordenacao/reivindicacoes.ts`; o script reusa
`lerReivindicacoesDoDisco` de `lib/coordenacao/leitura-do-registro.ts` e
`cabecalhosDoGitHub`/`comTempoLimite`/`REPO_PADRAO` de
`lib/plataforma/consulta-de-ci.ts` (o mesmo módulo que o sentinela do deploy já
usa). Nenhuma segunda implementação de "idade de reivindicação" nem de
"chamada autenticada ao GitHub".

**Duas metades de saída, de propósito:** o relatório versionado é o canal
durável (dá para ler amanhã, e o diff mostra o que mudou); o job vermelho na
aba Actions é o canal alto. Mecanismo que ninguém lê é o defeito que esta
rotina existe para consertar.

**Ausência de informação não é informação:** sem `GITHUB_TOKEN`, ou com a API
do GitHub fora do ar, o script **não escreve relatório** — ele grita que a
metade de PRs ficou CEGA e sai com código ≠ 0. Mesma doutrina do passo "A
metade de DADOS não pode ficar cega em silêncio" do `raio-x-noturno.yml`.

## 5. As provas — executadas, não afirmadas

### O teste visto VERMELHO com a lógica fora

Quatro mutações na régua, uma de cada vez, restaurando entre elas:

| mutação | resultado |
|---|---|
| vencimento de reivindicação desligado (`=== "velha"` → `false`) | **2 falhas** de 22 |
| limiar de PR parado ignorado (`d > limiar` → `d > 0`) | **3 falhas** de 22 |
| fronteira de palavra fora (regex → `.includes`) | **1 falha** de 22 |
| dedup do total fora (volta a somar as 3 listas) | **3 falhas** de 22 |
| **arquivo restaurado** (`diff -q` byte a byte) | **22 passaram** |

### A rodada 1 foi RECUSADA pelo PM — dois defeitos, medidos por execução

A primeira entrega do especialista saiu **vermelha: 5 de 17 testes**. Os dois
defeitos, os dois consertados na rodada 2:

1. **`totalCobravel` contava o mesmo PR duas vezes.** Estava registrado como
   decisão consciente. Nos dados reais a manchete diria 41 quando as coisas a
   perseguir são 23.
2. **`"wip"` isentava em silêncio quem não pediu isenção.** `.includes("wip")`
   casa dentro de outra palavra. Executado:

   ```
   true  <- "Portal: gesto de swipe no carrossel"
   true  <- "Corrige o wiper"
   true  <- "Nova tela de wipe"
   ```

   Um PR de carrossel com "swipe" no título ficaria **isento para sempre**, sem
   nunca aparecer como cobrável e sem ninguém saber por quê. Isenção silenciosa
   é a pior falha possível numa rotina de cobrança — pior que não existir,
   porque parece funcionar. Corrigido com fronteira de palavra Unicode, e com o
   par completo de testes (barra o plantado **e** não inventa no caso limpo).

### A rotina rodada ponta a ponta, contra a API real

Só leitura, custo zero, nenhum efeito colateral. Saída:

```
Relatório escrito em docs/relatorios/fila-parada.md — totalCobravel=23.
::error::Fila parada: 23 item(ns) cobrável(is).
EXIT=1
```

**23 = 4 reivindicações vencidas + 19 PRs distintos** (20 parados menos o #10
estacionado; os 18 sem veredito são subconjunto). O relatório da primeira
corrida está em `docs/relatorios/fila-parada.md`, versionado.

> Detalhe que fecha o círculo: um dos PRs que a rotina acusa é o **#159 —
> "Quadro do CEO 15/08: fonte única de preço, logo e régua de marca, **e a
> fila que se cobra**"**. O CEO pediu isto em 15/08. O PR está parado há 13,3
> dias, sem um comentário.

### Os portões

| portão | resultado |
|---|---|
| `npx vitest run __tests__/coordenacao/fila-parada.test.ts` | 22 passaram |
| `npx tsc --noEmit` (rodado **depois** dos testes) | limpo, exit 0 |
| `npx vitest run` (suíte inteira) | **536 arquivos, 7465 passaram**, 1 pulado, 0 falhas |
| `npm run build` | verde |

## 6. Declarado e NÃO feito

- **Histórico completo não é necessário, e por isso `fetch-depth` não foi
  tocado.** A rotina lê arquivos do working tree e a API do GitHub — nenhum
  `git log`, nenhum ancestral. A trava `lib/coordenacao/historico-completo.ts`
  (PR #388) **não existe nesta branch** e **não** foi importada nem reescrita.
  Está escrito no cabeçalho do script e do workflow para ninguém depois achar
  que faltou.
- **A rotina RELATA, não limpa.** Nenhuma reivindicação foi encerrada, apagada
  ou editada — nem as 4 vencidas. Nenhum PR foi fechado, comentado ou alterado.
  Limpeza automática apagaria trabalho vivo de quem está lento, não morto.
- **A varredura não pôde ser provada com `npm run varrer-fila` puro neste
  ambiente.** O sandbox só alcança a API do GitHub pelo proxy do agente, e o
  `fetch` do node 22 não honra `HTTPS_PROXY` (o `curl` honra): a chamada direta
  volta **401**. A prova ponta a ponta acima foi feita injetando um
  `ProxyAgent` do `undici` só no processo local, **sem tocar no script**. No
  GitHub Actions não há proxy e o `fetch` vai direto — mas **isso é dedução,
  não medição**: a primeira corrida real do workflow é o que confirma.
- **`secrets.GITHUB_TOKEN` do Actions tem permissão de leitura de PR por
  padrão neste repositório?** Assumido que sim (`permissions: contents: write`
  no job, e a leitura de PR é do escopo padrão). Se a primeira corrida voltar
  403, é ajuste de `permissions: pull-requests: read` — não de código.
- **A rotina vai nascer VERMELHA e ficar vermelha** enquanto os 23 itens não
  forem tratados. Isso é verdadeiro positivo, não ruído: são 4 reivindicações
  de 12 dias e 19 PRs de 13 dias, reais. Se a casa preferir que o vermelho
  comece só depois de uma limpeza, é decisão do CEO, não do mecanismo.
- **Não foi construída rota de notificação a pessoa** (e-mail, WhatsApp).
  Custo zero era restrição da ficha. O canal é o arquivo versionado + a aba
  Actions.
