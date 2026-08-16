# A porta da frente — capturas de 16/08/2026

Tela: `/agency/leads` ("Quem bateu na porta"), autenticada, em **375 / 768 /
1440**, nos quatro estados que importam.

## 🔴 ESTAS CAPTURAS FORAM REFEITAS. As primeiras tinham NOME DE PESSOA REAL.

A primeira leva foi tirada com um fixture que reproduzia os três interessados
medidos em produção em 08/08 **com os nomes deles**. Nome de negócio e de pessoa
real dentro de um PNG commitado é PII que **nenhum `grep` encontra depois**: não
sai numa varredura de texto, não sai num `git grep`, e quem for procurar em
cinco meses não acha. Texto se corrige com um commit; imagem se corrige
reescrevendo histórico.

Agora a captura sai de `scripts/fixture-porta-da-frente.mjs`, e **todos os nomes
são inventados**. Os DIAS são os mesmos dos casos reais de propósito — a prova
que estas imagens carregam é a **distinção entre as duas filas**, não a
identidade de ninguém.

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

## O que cada arquivo prova

| Arquivo | O que prova |
|---|---|
| `porta-{mobile,tablet,desktop}.png` | **A fila cheia.** Placar com os dois baldes separados e explicitamente não somados, as duas filas não misturadas, o selo de quem passou do prazo |
| `porta-aberto-{mobile,tablet,desktop}.png` | **Pista NÃO é contato**, e o contato **como se lê**. Cartão aberto: canal, o que a pessoa pediu, nas palavras dela, escopo pela tabela da casa e "preciso confirmar" |
| `porta-vazio-{mobile,tablet,desktop}.png` | **Vazio é boa notícia**, e o texto diz isso. O placar de zeros some de propósito |
| `porta-erro-{mobile,tablet,desktop}.png` | **"Esta fila NÃO é zero, é desconhecida."** O 503 foi injetado por interceptação |

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

**Nenhum dado de produção foi tocado, lido ou copiado.** O banco local saiu de
`prisma db push` + `scripts/seed-db.mjs` + o fixture acima.
