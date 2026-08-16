# A porta da frente — capturas de 16/08/2026

Tela: `/agency/leads` ("Quem bateu na porta"), autenticada, em **375 / 768 /
1440**, nos **quatro** estados que importam — cheio, vazio, erro e **carregando**.

## 🔴 ESTA É A TERCEIRA LEVA. As duas primeiras eram inválidas por motivos diferentes.

### 1ª leva — tinha NOME DE PESSOA REAL

Tirada com um fixture que reproduzia os três interessados medidos em produção em
08/08 **com os nomes deles**. Nome de negócio e de pessoa real dentro de um PNG
commitado é PII que **nenhum `grep` encontra depois**: não sai numa varredura de
texto, não sai num `git grep`, e quem for procurar em cinco meses não acha.
Texto se corrige com um commit; imagem se corrige reescrevendo histórico.

### 2ª leva — 🔴 MOSTRAVA UM ESTADO QUE PRODUÇÃO NENHUMA TEM

O fixture plantava `status: "new"` em linhas **sem contato nenhum** — e essa
combinação **a rota pública não sabe produzir**: o gate de contato de 08/08
decide o status no servidor, e sem canal ele grava `lead_incompleto`.

As nove capturas ficaram bonitas provando o DESENHO da tela e **nenhuma delas
mostrava o que a fila de verdade exibia**. Pior: era essa combinação inventada
que fazia os cartões "sem como falar" aparecerem numa fila que, em produção, não
os continha — o defeito da lista de status, escondido pelo próprio fixture feito
para exibi-lo.

**Agora o status é DERIVADO do briefing**, pela mesma pergunta que o servidor
faz, e o script **para** se alguém declarar um estado impossível
(`scripts/fixture-porta-da-frente.mjs`). Um caso novo entrou de propósito:
`scope_ready` — o lead com proposta pronta e ninguém que falou com ele, que até
16/08 caía fora da fila em segundos e era exatamente o que ninguém via.

> ⚠️ Os nomes reais **continuam** nos cabeçalhos de
> `lib/agency/comercial/quem-bateu-na-porta.ts` e `app/agency/leads/page.tsx`,
> onde estão desde 08/08. Apagá-los de lá é outra decisão e é do CEO — e, ao
> contrário da imagem, texto em código **é** encontrável por busca.

## 🔴 E TINHAM UM "N" ESCURO EM CIMA DO CARTÃO

A captura de 375px trazia um círculo escuro marcado "N" flutuando na borda
esquerda, **tapando a linha de preço do primeiro cartão**. Não era avatar, não
era badge de sessão e não era defeito do `AgencySidebar`: era o **indicador de
devtools do Next.js**, que o `next dev` injeta no canto inferior esquerdo. Ele é
`position: fixed`, então numa captura `fullPage` não fica no rodapé — fica
ancorado à altura do viewport (812px) e cai no meio da página comprida.

Não existe em produção e nenhum ajuste de layout o move. O conserto foi na
**ferramenta de captura** (`scripts/shot.mjs` agora esconde o overlay antes do
disparo), porque quem olha a imagem depois não tem como saber que aquilo era do
framework.

## 🔴 COMO CADA ESTADO FOI PRODUZIDO — e isto precisa estar escrito

Capturar um estado por um caminho e apresentá-lo como o estado do produto é a
mesma classe de erro do fixture acima. O método de cada um:

| Estado | Como foi produzido | O que ISSO prova, e o que NÃO prova |
|---|---|---|
| **cheio** | banco SQLite local, semeado por `scripts/fixture-porta-da-frente.mjs`, lido pela rota de verdade | ✅ prova a **ponta a ponta**: banco → `lerAPorta` → rota → tela |
| **vazio** | resposta 200 com fila vazia, **injetada por interceptação HTTP** no navegador | ✅ prova que a tela desenha o vazio · ❌ **não** prova que a fila zero chega até ela |
| **erro** | 503 **injetado por interceptação HTTP** | ✅ prova que a tela desenha a falha · ❌ **não** prova que a falha do banco chega até aqui |
| **carregando** | a rota é **suspensa** pela interceptação e nunca responde | ✅ prova que o esqueleto existe e é anunciado (`role="status"`) |

> **Quem prova o que a interceptação não prova são os testes**, e é por isso que
> eles existem: `__tests__/comercial/porta-rota.test.ts` derruba o banco de
> verdade e exige **503 · `medido: false`**, e
> `__tests__/comercial/porta-no-relogio.test.ts` exige que a mesma falha entre
> no log da rodada pelo nome da perna. Captura mostra; teste garante.

## O que cada arquivo prova

| Arquivo | O que prova |
|---|---|
| `porta-cheio-{mobile,tablet,desktop}.png` | **A fila cheia, com os status que a produção grava.** Placar com os três degraus (dívida da casa em vermelho, dado que falta em âmbar), as duas filas não misturadas, o `scope_ready` presente |
| `porta-vazio-{…}.png` | **Vazio é boa notícia**, e o texto diz isso. O placar de zeros some de propósito |
| `porta-erro-{…}.png` | **"Esta fila NÃO é zero, é desconhecida."** Bloco `role="alert"` com o botão da casa |
| `porta-carregando-{…}.png` | **O esqueleto anuncia que está carregando** (`role="status"` + `aria-live`), em vez de uma barra cinza muda |

## Como reproduzir

```sh
npx prisma db push
SEED_MASTER_PASSWORD=<sua senha local> node scripts/seed-db.mjs
node scripts/fixture-porta-da-frente.mjs     # recusa rodar fora de SQLite local
npm run dev
```

O roteiro de captura autenticada é descartável e mora no scratchpad da rodada —
ele loga **uma vez** e reusa a sessão nos três tamanhos, porque o teto de
tentativas de `/api/auth/signin` é real e bloqueou a máquina no meio da primeira
tentativa (12 logins numa janela). O teto está certo; o roteiro é que estava.
Ele também marca `role_guide_seen_master` no `localStorage`: o guia de papel abre
um modal em cima da tela na primeira visita e tapa a fila inteira.

**Nenhum dado de produção foi tocado, lido ou copiado.** O banco local saiu de
`prisma db push` + `scripts/seed-db.mjs` + o fixture acima.
