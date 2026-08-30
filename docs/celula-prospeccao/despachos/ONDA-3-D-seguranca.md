# DESPACHO D — revisão de segurança + a mutação da Onda 3 (agente: `seguranca`)

**Contexto:** `docs/celula-prospeccao/despachos/ONDA-3-COMUM.md`, e as fichas
`ONDA-3-A-arbitragens-do-funil.md`, `ONDA-3-B-ponte-de-arquivos.md`,
`ONDA-3-C-fila-de-excecoes.md` (o que foi pedido a cada especialista).

O código JÁ EXISTE e JÁ PASSOU no portão do PM (158 testes verdes,
`tsc --noEmit` limpo, `prisma generate` rodado). Você não está construindo do
zero: está **auditando superfície de ataque e provando que as travas travam**.

## Por que VOCÊ entra aqui
A ponte de arquivos é **superfície de ataque nova**: ela recebe bytes de um
desconhecido da internet, guarda, e depois entrega bytes a um cliente pagante.
Errar o destinatário vaza arquivo de um cliente para outro. Vazar o endereço
interno entrega o mapa do armazém. Confirmar recebimento sem verificar
integridade mente para o cliente.

## SEUS ARQUIVOS
**Pode escrever:**
- `scripts/mutacao-onda-3.mjs` (novo — copie o desenho de
  `scripts/mutacao-onda-1.mjs`; **não edite o `mutacao-onda-2.mjs`, é de outra frente**)
- `docs/celula-prospeccao/mutacao-onda-3-catalogo.json` (a ENTRADA do script)
- `lib/agency/celula/ponte/*.ts` e `lib/agency/celula/excecoes/*.ts` — **só se
  achar um furo REAL**, e cada conserto seu tem que caber numa mutação nova.
- `__tests__/celula/ponte-*.test.ts` e `__tests__/celula/excecoes-*.test.ts` —
  idem: só para provar furo que você achou.

**NÃO toque:** `lib/agency/celula/funil.ts`, `trilha.ts`, `prisma/schema.prisma`,
`lib/agency/celula/mensagens/**`, `lib/marketplaces/99freelas/conformidade.ts`,
`docs/plataformas/99freelas/**`, nem em teste de outra frente.
**NÃO rode `npm`/`npx`/`node`/`git`** — o PM roda a mutação e commita.

## TAREFA 1 — O LAUDO DE SEGURANÇA (leia o código, não o relatório de quem o escreveu)
Leia inteiros: `lib/agency/celula/ponte/*.ts` e `lib/agency/celula/excecoes/*.ts`.
Responda, com número de linha, e **sem inventar conforto**:

1. **Destinatário divergente.** `conferirDestinatario` cobre os três eixos? Existe
   algum caminho que chegue a `enviarAoCliente` SEM passar por ela? Campo ausente
   ou vazio bloqueia mesmo, ou passa por `undefined === undefined`?
2. **Endereço interno.** `contemEnderecoInterno` é chamado em TODO caminho de
   saída? O tipo de retorno ao cliente tem algum campo por onde uma URL escape?
   O HMAC do link temporário usa comparação em tempo constante? O segredo tem
   origem declarada, ou tem default embutido?
3. **Entrada hostil.** Alguma função lê CONTEÚDO de arquivo recebido para decidir
   estado, destinatário, prioridade ou autorização? Nome de arquivo com `../`,
   NUL byte, unicode de direção (RTL override), ou extensão dupla — todos barrados?
   Nome original vai para log em algum lugar? (é PII).
4. **Confirmação antes da integridade.** Existe caminho que confirme ao cliente
   com o arquivo ainda em `recebido`/`em_quarentena`?
5. **Versões.** Existe algum `update`/`upsert` que sobrescreva uma versão? O
   cálculo da próxima versão está dentro da MESMA transação que grava (corrida
   entre dois envios simultâneos)?
6. **Append-only.** Alguma escrita destrutiva sobre `EventoDoArquivoDaCelula` ou
   `EventoDaExcecaoDaCelula`?
7. **A fila.** `podeSeguirAutomatizando` é fail-closed com lista ilegível? Dá para
   fazer a automação seguir sob CAPTCHA por algum caminho (estado `descartada`,
   prioridade rebaixada, caso ilegível)?
8. **O que NÃO está protegido** — o bullet mais importante. Diga com todas as
   letras o que esta onda NÃO cobre (antivírus real, gate de Qualidade não
   verificado, costura com a fila inexistente, cota por workspace, retenção que
   ninguém executa). **Lacuna declarada é informação; lacuna omitida é mentira.**

Achou furo real? **Conserte** no arquivo certo e escreva um teste que prova o
furo — e a mutação correspondente entra no catálogo da Tarefa 2.

## TAREFA 2 — O CATÁLOGO DE MUTAÇÃO (é o entregável mais importante)
`docs/celula-prospeccao/mutacao-onda-3-catalogo.json`: um array de objetos, no
formato que `scripts/mutacao-onda-1.mjs` consome:

```json
[{ "guarda": "M11 · destinatário divergente bloqueia o envio",
   "arquivo": "lib/agency/celula/ponte/saida.ts",
   "teste": "__tests__/celula/ponte-destinatario.test.ts",
   "de": "<trecho EXATO, copiado do arquivo, que aparece UMA única vez>",
   "para": "<o mesmo trecho AFROUXADO — a guarda desligada>",
   "espera": "<que teste deve cair, e por quê>" }]
```

**Regras do catálogo, e elas não são negociáveis:**
- O `de` tem que existir **exatamente uma vez** no arquivo. Confira contando.
  Alvo com 0 ou 2 ocorrências faz o script abortar aquela guarda.
- A mutação **afrouxa a guarda**, nunca quebra a sintaxe. Guarda que cai por
  erro de compilação não prova nada.
- O `espera` nomeia o teste que deve ficar vermelho. É a coincidência entre
  "o que se esperava quebrar" e "o que quebrou" que prova que a guarda caiu
  pelo MOTIVO CERTO, e não por efeito colateral.

**Numere a partir de M11** (M1–M10 são da Onda 1, em
`docs/celula-prospeccao/mutacao-onda-1.md` — leia para não repetir).

**As mutações OBRIGATÓRIAS por ordem do Diretor** (as outras são sua escolha):
- destinatário divergente bloqueia o envio (**prova nº 14**)
- endereço interno nunca sai ao cliente
- arquivo suspeito vai para quarentena e não entra no projeto
- versão nova não sobrescreve a anterior
- confirmação de recebimento exige integridade conferida
- CAPTCHA / sessão expirada / bloqueio param a automação
- exceção vencida grita
- `ceo` não pode ser responsável na fila
- `perdida → retomar` legal **e** `perdida → ganha` ilegal (`funil.ts` — você
  não edita o arquivo, mas PODE mutá-lo pelo script; o alvo é `perdida: ["retomar", "excecao_operacional"],`)

Mire 12 a 16 guardas. Menos que isso deixa trava sem prova; mais que isso vira
catálogo que ninguém lê.

## TAREFA 3 — O SCRIPT
`scripts/mutacao-onda-3.mjs`, no molde de `scripts/mutacao-onda-1.mjs`:
lê o catálogo → confere no disco que o `de` existe **uma vez** → aplica →
**confere no disco que o `para` entrou** (`replace` sem `assert` não é conserto,
é esperança) → roda `npx vitest run <teste>` → **restaura em `finally`** →
confere **byte a byte** (sha256) que voltou ao original → grava o resultado em
JSON. Linha de base verde conferida ANTES da primeira mutação, e aborta se já
estiver vermelha.

⚠️ **Cuidado que só existe nesta onda:** há 3 testes VERMELHOS de outra frente
(`trava-de-conversa`, `trava-de-promessa`). A linha de base **só pode rodar os
10 arquivos de teste da Onda 3**, nunca a suíte inteira — senão o script aborta
por defeito que não é nosso. Deixe essa lista escrita no topo do script.

## ENTREGA
Bullets curtos: o laudo (com linha) · o que você consertou e por quê · o
catálogo (quantas guardas, quais) · **o que NÃO está protegido**, com todas as
letras.
