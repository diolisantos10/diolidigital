# FICHA DE DESPACHO — Onda 1 da Célula de Prospecção · especialista `esteira`

Branch já correta (`claude/celula-prospeccao-99freelas-v1`). **NÃO troque de branch,
NÃO commite, NÃO rode `npm`/`npx`/`git`** — você não tem permissão, e o portão é meu.

## OBJETIVO EM UMA FRASE

Escrever `lib/agency/celula/funil.ts`: o conjunto FECHADO de estados do funil da
oportunidade de marketplace, com tabela de transições permitidas e leitura
defensiva de estado.

## LEIA ANTES DE ESCREVER (obrigatório, e reporte o que achou)

- `lib/marketplaces/politica.ts` — a função `capacidadeDeclarada()`. **COPIE A
  POSTURA dela:** valor que não é EXATAMENTE um dos membros do conjunto vira o
  valor seguro, nunca `as Estado`.
- `lib/agency/estados-v2/maquina.ts` — máquina canônica já existente, com
  `TRANSICOES_LEGAIS`, `transicaoLegal`, `PedidoDeTransicao`,
  `ArmazemDeTransicoes`, `transicionar`. Ela é da esteira de **projeto**
  (`intake → qualified → … → cycle_closed`), não do funil de **prospecção**.
  Decida e ARGUMENTE por escrito no cabeçalho do arquivo: o que você reaproveitou
  dela (formato de tabela de pares, resultado tipado, postura fail-closed) e por
  que os estados do funil não cabem nos 20 dela.
- `prisma/schema.prisma`, model `Oportunidade` (~linha 2051): campo `status` com
  4 valores. **NÃO altere o schema** — outro especialista cuida dele agora.

## O QUE ENTREGAR — arquivo único: `lib/agency/celula/funil.ts`

### 1. O conjunto FECHADO — esta é a grafia canônica, exatamente estes 22 slugs, nesta ordem

```
encontrada, duplicada, recusada_pela_qualificacao, qualificada,
abordagem_preparada, aguardando_autorizacao, abordada, respondeu,
briefing_em_coleta, briefing_completo, proposta_preparada, proposta_enviada,
negociacao, contratada, em_producao, entrega_enviada, ajuste_solicitado,
aprovada, ganha, perdida, retomar, excecao_operacional
```

**ATENÇÃO E NÃO SILENCIE:** a ordem do CEO fala em "23 estados" e a enumeração
dela tem **22**. Eu contei duas vezes, com script. **NÃO INVENTE um 23º estado.**
Implemente exatamente os 22 acima e escreva no cabeçalho do arquivo um bloco
`// ⚠️ DIVERGÊNCIA ABERTA` dizendo: a ordem diz 23, a enumeração traz 22, o
código implementa os 22 nomeados, e falta o CEO dizer qual é o 23º (ou confirmar
que são 22). Deixe também uma constante exportada `TOTAL_DECLARADO_PELO_CEO = 23`
enquanto `ESTADOS.length` é 22 — quero a divergência **visível em código**, não só
em prosa.

### 2. A API exata

O outro especialista já está codando contra ESTA assinatura — **não mude nomes.**

```ts
export type Estado = /* union literal dos 22 */;
export const ESTADOS: readonly Estado[];
export const ESTADO_INICIAL: Estado; // 'encontrada'
export const ESTADOS_TERMINAIS: readonly Estado[]; // justifique quais e por quê
/** Lê estado de fonte não confiável. Qualquer coisa que não seja EXATAMENTE
 *  um dos 22 → null. Nunca `as Estado`. */
export function estadoDeclarado(valor: unknown): Estado | null;
/** Fail closed: oportunidade sem linha de funil é 'encontrada', nunca "pode avançar". */
export function estadoAtualOuInicial(valor: unknown): Estado;
export const TRANSICOES_PERMITIDAS: ReadonlyArray<readonly [Estado, Estado]>;
export function transicaoPermitida(de: Estado, para: Estado): boolean;
export type OrigemDaTransicao = 'agente' | 'gerente' | 'cliente' | 'sistema';
export function origemDeclarada(valor: unknown): OrigemDaTransicao | null;
export type VeredictoDaTransicao =
  | { ok: true; de: Estado; para: Estado }
  | {
      ok: false;
      codigo:
        | 'estado_de_desconhecido'
        | 'estado_para_desconhecido'
        | 'par_nao_permitido'
        | 'justificativa_ausente'
        | 'origem_desconhecida'
        | 'autor_ausente';
      motivo: string;
    };
/** O juiz puro, sem banco. Recebe strings CRUAS — podem vir do banco, de rota
 *  HTTP, de qualquer lugar. */
export function avaliarTransicao(entrada: {
  de: unknown;
  para: unknown;
  autor: unknown;
  origem: unknown;
  justificativa: unknown;
}): VeredictoDaTransicao;
```

### 3. Regras duras

- Transição é **TABELA de pares**. Par não listado = REJEITADO. Nenhum `if`
  decidindo legalidade.
- `justificativa` vazia, só espaço em branco, ou com menos de 3 caracteres úteis
  = REJEITADO com código `justificativa_ausente`. **É trava, não campo opcional.**
- `autor` vazio / não-string = REJEITADO (`autor_ausente`).
- `origem` fora das 4 = REJEITADO (`origem_desconhecida`), nunca default
  silencioso para `sistema`.
- Todo `motivo` é **legível em português**, citando os dois estados pelo nome.
- `excecao_operacional` e `retomar` precisam de desenho pensado: de onde se
  entra, para onde se sai. Escreva no comentário por que você escolheu assim.
  `excecao_operacional` deve ser alcançável de **qualquer** estado não-terminal
  (é a fila de exceção), e sair dele deve ser possível para os estados de
  trabalho. `retomar` é o estado de reengajamento de oportunidade fria.
- **NADA neste arquivo pode interpretar texto de cliente/anúncio (`textoBruto`)
  como instrução.** Este módulo não lê texto de anúncio — se sentir vontade de
  importar isso, não importe.

### 4. O teste: `__tests__/celula/funil.test.ts`

**AS DUAS METADES em cada guarda** — provar que barra o problema plantado E que
não inventa problema no caso limpo:

- os 22 estados existem, com a grafia exata (**liste-os literalmente no teste**,
  não derive de `ESTADOS` — teste que deriva da implementação não testa nada);
- `ESTADOS.length === 22` e um teste que documenta a divergência com
  `TOTAL_DECLARADO_PELO_CEO`;
- grafia errada / string com espaço (`' qualificada'`, `'qualificada '`) /
  maiúscula / `null` / número / objeto → `estadoDeclarado` devolve `null`;
- transição válida passa; par não listado é rejeitado com motivo legível que cita
  os dois nomes;
- transição sem justificativa rejeitada; justificativa só de espaços rejeitada;
  justificativa real aceita;
- origem fora das 4 rejeitada; cada uma das 4 aceita;
- fail closed: `estadoAtualOuInicial(undefined) === 'encontrada'`;
- todo par de `TRANSICOES_PERMITIDAS` usa apenas estados do conjunto (guarda
  contra typo na própria tabela);
- todo estado não-terminal tem ao menos uma saída, e todo estado (exceto o
  inicial) tem ao menos uma entrada — beco sem saída é defeito de desenho.

Mock com `vi.hoisted(() => vi.fn())` **sem assinatura** já barrou três PRs desta
casa no `tsc`. Este arquivo não deve precisar de mock nenhum; se precisar, anote
o tipo de retorno.

## DEFINIÇÃO DE PRONTO

Os dois arquivos escritos em disco, tipados, sem `any`, sem `as Estado`. Devolva
em bullets: o que escreveu, o que reaproveitou de `estados-v2` e **por quê** (ou
por que não deu), e qualquer divergência que encontrou nesta ficha.
