# DESPACHO D2 — o catálogo e o corredor de mutação da Onda 3 (agente: `seguranca`)

**Contexto:** `docs/celula-prospeccao/despachos/ONDA-3-COMUM.md` e as fichas
`ONDA-3-A-arbitragens-do-funil.md`, `ONDA-3-B-ponte-de-arquivos.md`,
`ONDA-3-B2-conserto-da-ponte.md`, `ONDA-3-C-fila-de-excecoes.md`.

O código JÁ EXISTE e JÁ PASSOU no portão do PM. Sua entrega aqui é **a prova de
que as travas travam** — nada mais.

## Por que este despacho existe
Uma guarda que nenhum teste observa é decoração. Um teste que só confirma que o
código está *como foi escrito* não prova que ele **barra** alguma coisa. Só a
mutação prova: afrouxa a guarda de propósito, roda o teste, exige vermelho,
restaura. Guarda sem mutação rodada já falhou nesta casa seis vezes em dois dias.

## SEUS ARQUIVOS — e só eles
- `scripts/mutacao-onda-3.mjs` (novo)
- `docs/celula-prospeccao/mutacao-onda-3-catalogo.json` (novo)

**Você não edita código de produção nem teste nesta rodada.** Se achar um furo,
**escreva no relatório** — quem conserta é o `plataforma`, num despacho à parte.
**Não rode `npm`/`npx`/`node`/`git`** — o PM roda a mutação e commita.
**Não edite `scripts/mutacao-onda-2.mjs`** (é de outra frente que está em voo).

## TAREFA 1 — O CATÁLOGO (o entregável mais importante)
`docs/celula-prospeccao/mutacao-onda-3-catalogo.json`: um array de objetos, no
formato que `scripts/mutacao-onda-1.mjs` já consome (leia aquele script antes):

```json
[{ "guarda": "M11 · destinatário divergente bloqueia o envio",
   "arquivo": "lib/agency/celula/ponte/saida.ts",
   "teste": "__tests__/celula/ponte-destinatario.test.ts",
   "de": "<trecho EXATO, copiado do arquivo, que aparece UMA única vez>",
   "para": "<o mesmo trecho AFROUXADO — a guarda desligada>",
   "espera": "<que teste deve ficar vermelho, e por quê>" }]
```

**Regras do catálogo, e não são negociáveis:**
- O `de` tem que existir **exatamente uma vez** no arquivo. Confira contando.
  Alvo com 0 ou 2 ocorrências faz o script abortar aquela guarda.
- A mutação **afrouxa a guarda**, nunca quebra a sintaxe. Guarda que cai por
  erro de compilação não prova nada.
- O `espera` nomeia o teste que deve ficar vermelho. É a coincidência entre "o
  que se esperava quebrar" e "o que quebrou" que prova que a guarda caiu pelo
  motivo certo, e não por efeito colateral.
- **Numere a partir de M11.** M1–M10 são da Onda 1
  (`docs/celula-prospeccao/mutacao-onda-1.md`) — leia para não repetir.

**As guardas OBRIGATÓRIAS, por ordem do Diretor:**

| # | A guarda | Onde ela mora |
|---|---|---|
| 1 | destinatário divergente bloqueia o envio (**prova nº 14**) | `ponte/saida.ts` |
| 2 | o endereço interno nunca sai numa mensagem ao cliente | `ponte/endereco-interno.ts` |
| 3 | arquivo suspeito vai para quarentena e não entra no projeto | `ponte/quarentena.ts` |
| 4 | versão nova não sobrescreve a anterior | `ponte/armazem.ts` |
| 5 | confirmação de recebimento exige integridade conferida | `ponte/entrada.ts` |
| 6 | `caminhoInterno` é derivado do id, nunca vem de fora | `ponte/armazem.ts` |
| 7 | CAPTCHA / sessão expirada / bloqueio param a automação | `excecoes/fila.ts` |
| 8 | exceção vencida grita | `excecoes/fila.ts` |
| 9 | o CEO não pode ser responsável na fila | `excecoes/fila.ts` |
| 10 | os 5 campos obrigatórios de uma exceção não têm default | `excecoes/fila.ts` |
| 11 | a trilha de eventos é append-only (as duas: arquivo e exceção) | os dois `armazem.ts` |
| 12 | `perdida → retomar` legal e `perdida → ganha` ilegal | `funil.ts` (alvo: a linha `perdida: [...]` da tabela) |

Você **não edita** `funil.ts` — mas **pode mutá-lo pelo script**, que restaura
sozinho. Mire **12 a 16** guardas: menos deixa trava sem prova, mais vira
catálogo que ninguém lê.

## TAREFA 2 — O CORREDOR
`scripts/mutacao-onda-3.mjs`, no molde de `scripts/mutacao-onda-1.mjs`:

1. Confere a **linha de base verde** ANTES da primeira mutação, e **aborta** se
   já estiver vermelha — mutação sobre suíte vermelha não prova nada.
2. Para cada guarda: confere no disco que o `de` existe **uma vez** → aplica →
   **confere no disco que o `para` entrou** (`replace` sem `assert` não é
   conserto, é esperança) → roda `npx vitest run <teste>`.
3. **Restaura o arquivo em `finally`**, inclusive se o passo 2 estourar, e
   confere **byte a byte** (sha256 antes × depois) que voltou ao original.
4. Grava o resultado em JSON no caminho passado como segundo argumento, com:
   `guarda`, `arquivo`, `teste`, `estado`
   (`VERMELHO_COMO_ESPERADO` | `CONTINUOU_VERDE_A_GUARDA_E_DECORATIVA` |
   `ALVO_NAO_ENCONTRADO`), `porqueCaiu` (as linhas de falha), `contagem`,
   `restaurado`.
5. **Guarda que continua verde é gravada com todas as letras**, nunca escondida
   — é o achado mais valioso que o script pode produzir.

⚠️ **Cuidado que só existe nesta onda:** há 3 testes vermelhos de OUTRA frente
(`trava-de-conversa`, `trava-de-promessa`). A linha de base **só pode rodar os
10 arquivos de teste da Onda 3**, nunca a suíte inteira — senão o script aborta
por defeito que não é nosso. Deixe essa lista escrita no topo do script, com o
porquê.

## ENTREGA
Bullets curtos: quantas guardas no catálogo e quais · quais alvos você teve
dificuldade de isolar em uma única ocorrência · **qualquer trava que você
suspeite ser decorativa antes mesmo de rodar** (escreva, não some com isso).
