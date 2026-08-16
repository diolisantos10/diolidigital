# A aprovação parada — capturas de 16/08/2026

Tela: `/agency/approvals` ("Centro de Aprovações"), autenticada, em
**375 / 768 / 1440**, nos três estados que importam.

**Todos os dados são fictícios** (`scripts/fixture-aprovacao-parada.mjs`, que se
recusa a rodar fora de SQLite local). A faixa nova não mostra nome de cliente em
lugar nenhum — só departamento e dias —, e mesmo assim o cliente do fixture se
chama "Cliente Exemplo". Nenhum dado de produção foi tocado, lido ou copiado.

| Arquivo | O que prova |
|---|---|
| `aprovacao-cheio-*.png` | A faixa nova em cima das quatro filas internas. **Os dois números não se somam** e a dívida NOSSA vem primeiro, em vermelho, com o aviso de que o prazo do cliente está pausado. O card sem dono é contado à parte. A lista tem teto; a contagem não |
| `aprovacao-vazio-*.png` | **Vazio é boa notícia**, numa linha — e ela existe em vez de sumir, porque sumir deixaria quem lê sem saber se a fila está vazia ou se ninguém olhou |
| `aprovacao-erro-*.png` | **"Esta fila NÃO é zero, é desconhecida"**, e o cabeçalho da página **para de dizer "tudo em dia"**: ele passa a dizer que a fila do cliente não pôde ser medida |

## 🔴 O defeito que a captura pegou, e a leitura não

Com a faixa nova posta, o cabeçalho da página continuava dizendo **"Nenhum item
pendente — tudo em dia"** — porque ele contava só as quatro filas internas — com
**cinco peças paradas listadas dois centímetros abaixo**. Duas afirmações
opostas na mesma tela: é o defeito do cartão do Drive de 07/08 ("conectado" e
"não conectado" ao mesmo tempo) outra vez.

O cabeçalho passou a receber a contagem da faixa, e `null` (não medido) é
tratado como diferente de zero — dizer "tudo em dia" sobre fila que não foi lida
é a pior das três respostas.

## Auto-revisão a 375px (0–10)

hierarquia **8,5** · tipografia **9** · espaçamento **8,5** · consistência **9**
(o placar reusa o padrão e os tokens da faixa de `/agency/leads`, de propósito:
são a mesma pergunta — "o que está parado e de quem é a vez").

## Como reproduzir

```sh
npx prisma db push
SEED_MASTER_PASSWORD=<sua senha local> node scripts/seed-db.mjs
node scripts/fixture-aprovacao-parada.mjs
npm run dev
```
