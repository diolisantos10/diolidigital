# FICHA A — A BIBLIOTECA DE MENSAGENS COMO DADO VERSIONADO

Leia antes: `docs/celula-prospeccao/despachos/COMUM.md`. Ele vale inteiro.

## OBJETIVO EM UMA FRASE
Tirar as mensagens de dentro de prompt e transformá-las em biblioteca
versionada e administrável, cujo leitor **recusa entregar para envio** qualquer
modelo que não esteja `aprovado` e completo.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/tipos.ts`   (novo)
- `lib/agency/celula/mensagens/biblioteca.ts` (novo)
- `docs/plataformas/99freelas/mensagens.json` (novo)
- `__tests__/celula/biblioteca-de-mensagens.test.ts` (novo)

## 1. `tipos.ts` — O CONTRATO. Outros cinco especialistas vão importar daqui.
Escreva-o PRIMEIRO e mantenha-o pequeno. Ele exporta, no mínimo:

```ts
export type EstadoDoModelo = "rascunho" | "aprovado" | "pausado" | "aposentado";

export interface HistoricoDoModelo {
  versao: string;      // "1.0.0"
  em: string;          // ISO
  autor: string;
  aprovador: string | null;
  oQueMudou: string;
}

export interface ModeloDeMensagem {
  codigo: string;                    // "M01".."M22"
  nome: string;
  plataforma: string;                // "99freelas"
  etapaDoFunil: string;              // texto livre por ora — a Onda 1 tipa depois
  finalidade: string;
  textoBase: string;                 // com {{variaveis}} entre chaves duplas
  variaveisObrigatorias: string[];
  variaveisOpcionais: string[];
  palavrasProibidas: string[];
  condicaoDeEntrada: string;
  condicaoDeSaida: string;
  proximaAcao: string;
  tempoDeEsperaHoras: number | null; // null = sem espera declarada
  maximoDeUsos: number | null;       // null = sem teto declarado
  versao: string;
  autor: string;
  aprovador: string | null;
  estado: EstadoDoModelo;
  historico: HistoricoDoModelo[];
  /** Preenchido quando o texto oficial do CEO ainda não chegou. Ver seção 4. */
  pendencia?: string | null;
}
```
Além disso, um resultado de leitura que **nunca lança e nunca devolve `false`
mudo**:
```ts
export type LeituraDoModelo =
  | { ok: true; modelo: ModeloDeMensagem }
  | { ok: false; motivo: string; codigo: string };
```

## 2. `biblioteca.ts` — O LEITOR TIPADO, FAIL CLOSED
Ele lê o JSON e responde. As regras, todas com teste:

- `carregarBiblioteca()` → valida o arquivo inteiro na carga. **Modelo com
  qualquer campo obrigatório faltando, vazio, do tipo errado, ou com `estado`
  fora da lista, é INVÁLIDO** — não entra na biblioteca e o motivo fica legível.
  Nunca preencha default. "Assumir o default" é como um modelo sem aprovador
  vira mensagem enviada.
- `modeloParaEnvio(codigo)` → só devolve `{ok:true}` se o modelo existe, é
  VÁLIDO e tem `estado: "aprovado"`. Rascunho, pausado e aposentado devolvem
  `{ok:false, motivo}` dizendo o estado por extenso.
- `preencher(modelo, variaveis)` → substitui `{{chave}}`. **Variável obrigatória
  ausente, `null`, `undefined` ou string vazia/só espaço ⇒ BLOQUEIA** com o nome
  da variável no motivo. Placeholder que sobrou no texto final (`{{` ainda
  presente) ⇒ BLOQUEIA. NÃO invente valor, NÃO deixe o placeholder passar.
- `preencher` roda `validarTexto` (de `conformidade.ts`) no texto final e
  BLOQUEIA com os achados. Não escreva outro validador.
- `palavrasProibidas` do próprio modelo também bloqueiam, e o motivo diz qual.
- Codificação de duplicidade de código (dois M07) ⇒ biblioteca inválida.
- `codigo` deve casar `/^M\d{2}$/`.
- Nada de `any`. Faça um validador de forma explícito, campo a campo.

⚠️ **Não implemente comparação com textos já enviados nem detecção de frase
genérica aqui.** Isso é a Ficha B, outro especialista, outro arquivo. Você para
na porta: seu módulo entrega o texto preenchido e conforme, ou o motivo do
bloqueio.

## 3. `mensagens.json` — O DADO
Formato no modelo de `docs/plataformas/99freelas/policy.json`: bloco
`_leia_isto` no topo explicando o que é, `plataforma`, `versao`, `atualizadoEm`,
e `modelos: [...]`.

## 4. ⚠️ O BURACO QUE VOCÊ **NÃO** VAI TAPAR INVENTANDO — leia com atenção
A ordem do CEO manda copiar **LITERALMENTE** o texto-base dos 22 modelos
M01–M22. **Esse texto não chegou até nós e não existe em lugar nenhum do
repositório** (foi procurado). Escrever um texto nosso no lugar seria a casa
inventando a fala que vai ao cliente em nome do CEO — exatamente o que a lei 3
proíbe.

Então:
- Crie os **22 slots M01 a M22**, cada um com `textoBase: ""`,
  `estado: "rascunho"`, `aprovador: null`, e
  `pendencia: "texto oficial do CEO não recebido — modelo não pode ser enviado"`.
- Preencha `nome`, `etapaDoFunil`, `finalidade`, `condicaoDeEntrada`,
  `condicaoDeSaida` e `proximaAcao` **apenas onde a ordem do CEO já disse**, e
  onde não disse escreva literalmente `"preciso confirmar com o CEO"`.
  O que já se sabe da ordem: **M01** é a primeira abordagem e é o modelo em que
  o CEO nomeou o caso da variável genérica; **M07, M08 e M09** envolvem PREÇO e
  por isso leem do motor de preços, nunca de constante; **M15, M16, M18 e M19**
  prometem data e por isso caem na trava de compromisso. Não invente o resto.
- Escreva um teste que PROVA o fail-closed com dado real:
  **nenhum dos 22 modelos do arquivo hoje é entregável por `modeloParaEnvio`.**
  Esse teste é a prova de que a casa não vai enviar texto que ela mesma inventou.
- Escreva também um teste com um modelo APROVADO montado inline no próprio teste
  (fixture), para exercitar `preencher` no caminho feliz. A biblioteca de
  produção continua vazia de aprovados; a fixture é só do teste.

## CRITÉRIO DE ACEITE (o PM vai conferir cada um)
1. Modelo em `rascunho`/`pausado`/`aposentado` NÃO sai — teste.
2. Modelo com campo faltando NÃO entra na biblioteca — teste, um por campo
   obrigatório (pode ser `it.each`).
3. Variável obrigatória vazia BLOQUEIA — teste.
4. Placeholder remanescente BLOQUEIA — teste.
5. Texto final que viola o Guardião BLOQUEIA, com o achado — teste.
6. O caso LIMPO passa (modelo aprovado + variáveis preenchidas + texto conforme)
   — teste. Sem esta metade a trava não vale.
7. Os 22 modelos reais do JSON são todos não-entregáveis hoje — teste.
