# FICHA DE DESPACHO — Onda 1 da Célula de Prospecção · especialista `plataforma`

Branch já correta (`claude/celula-prospeccao-99freelas-v1`). **NÃO troque de
branch, NÃO commite, NÃO rode `npm`/`npx`/`prisma`/`git`** — você não tem
permissão. Você ESCREVE o SQL da migration; **eu rodo**.

## OBJETIVO EM UMA FRASE

Dar persistência ao funil da oportunidade de marketplace: um model de LINHA DE
FUNIL, um model de TRILHA APPEND-ONLY, o armazém Prisma que grava a transição de
forma atômica, e um teste que prova que a trilha sobrevive ao reinício do processo.

## RESTRIÇÃO INEGOCIÁVEL DE SCHEMA

Outras **duas frentes vivas** também acrescentam ao `prisma/schema.prisma` nesta
casa. Você **SÓ ACRESCENTA models novos no fim do arquivo.** NÃO altere nem uma
linha dos models existentes — em especial `Diretriz`, `RastroDoDiretorGeral`,
`Oportunidade`, `TransicaoDeEstado`. Se achar que precisa de campo em
`Oportunidade`, **não adicione**: reporte para mim e eu decido. A ligação com a
oportunidade é por `oportunidadeId String`, **sem relação Prisma de mão dupla**,
para não tocar no model dela.

## LEIA ANTES DE ESCREVER (obrigatório, e reporte)

- `prisma/schema.prisma`: model `Oportunidade` (~2051) e model `TransicaoDeEstado`
  (~2466). O `TransicaoDeEstado` é da máquina V2 de **projeto**
  (`entidadeTipo/entidadeId/de/para/atorTipo/atorId/motivo/origem/versaoLida/chaveIdempotencia/correlationId`).
  Avalie honestamente: dá para reaproveitá-lo para o funil de prospecção? Escreva
  a resposta e o **porquê** num comentário do schema. Meu palpite — confira, e me
  contradiga se eu estiver errado: ele exige `versaoLida` e `chaveIdempotencia`
  únicos, desenhados para outra máquina, e não tem coluna de `justificativa`
  obrigatória com trava; mas o **formato** dele é a referência a copiar.
- `lib/agency/handoff-v2/armazem-prisma.ts` — o padrão de armazém desta casa.
  Copie a forma.
- `__tests__/plataforma/teto-de-ritmo-no-banco.test.ts` — **o padrão exato** do
  teste de persistência: SQLite de verdade em `mkdtemp`, `PrismaLibSql`, e a
  função `reiniciarComoSeFosseDeploy()` que fecha o cliente e abre outro sobre o
  MESMO arquivo. É esse padrão que quero para a prova de reinício. Mock do Prisma
  aqui não prova nada.
- `prisma/migrations/` — o formato dos diretórios
  (`AAAAMMDDHHMMSS_nome_em_portugues/migration.sql`).

## O CONTRATO JÁ FECHADO

Outro especialista está escrevendo `lib/agency/celula/funil.ts` **agora**, contra
esta assinatura. Importe dela, **não redefina**:

```ts
import {
  type Estado,
  type OrigemDaTransicao,
  type VeredictoDaTransicao,
  ESTADO_INICIAL,
  avaliarTransicao,
  estadoAtualOuInicial,
} from '@/lib/agency/celula/funil';

// Estado = union literal de 22 slugs:
//   encontrada | duplicada | recusada_pela_qualificacao | qualificada |
//   abordagem_preparada | aguardando_autorizacao | abordada | respondeu |
//   briefing_em_coleta | briefing_completo | proposta_preparada |
//   proposta_enviada | negociacao | contratada | em_producao | entrega_enviada |
//   ajuste_solicitado | aprovada | ganha | perdida | retomar | excecao_operacional
// OrigemDaTransicao = 'agente' | 'gerente' | 'cliente' | 'sistema'
// ESTADO_INICIAL = 'encontrada'
// avaliarTransicao({de, para, autor, origem, justificativa}) → VeredictoDaTransicao
//   ({ ok: true, de, para } | { ok: false, codigo, motivo })
```

Se o arquivo dele ainda não existir quando você começar, **escreva contra essa
assinatura mesmo assim.** Eu reconcilio no `tsc`.

## O QUE ENTREGAR

### 1. Dois models novos, ACRESCENTADOS ao fim de `prisma/schema.prisma`, com comentário `///` explicando a decisão

```
model LinhaDoFunil {          // o estado ATUAL, um por oportunidade
  id, workspaceId, oportunidadeId (@unique),
  estado String @default("encontrada"),
  entrouNoEstadoEm DateTime, criadoEm, atualizadoEm
  @@index([workspaceId, estado])
}

model TransicaoDoFunil {      // A TRILHA APPEND-ONLY
  id, workspaceId, oportunidadeId,
  estadoAnterior String, estadoNovo String,
  autor String, origem String, justificativa String,
  criadoEm DateTime @default(now())
  @@index([oportunidadeId, criadoEm])
  @@index([workspaceId, criadoEm])
}
```

Os nomes de campo são **os acima** — a ordem do CEO nomeia `estadoAnterior`,
`estadoNovo`, `autor`, `origem`, `justificativa`, `criadoEm` explicitamente.
**Nenhum campo da trilha é opcional.** `justificativa` é `String` NOT NULL, sem
default.

### 2. A migration SQL

`prisma/migrations/20260830150000_o_funil_da_celula_de_prospeccao/migration.sql`.
Escreva o SQL à mão (SQLite): `CREATE TABLE` + índices. Eu rodo. Se o dialeto em
`migration_lock.toml` não for sqlite, ajuste e me avise.

### 3. `lib/agency/celula/trilha.ts` — o armazém

```ts
export interface RegistroDeTransicao {
  estadoAnterior: Estado;
  estadoNovo: Estado;
  autor: string;
  origem: OrigemDaTransicao;
  justificativa: string;
  criadoEm: Date;
}
/** fail closed → ESTADO_INICIAL */
export async function estadoDoFunil(oportunidadeId: string): Promise<Estado>;
/** ordem cronológica */
export async function trilhaDoFunil(oportunidadeId: string): Promise<RegistroDeTransicao[]>;
export type ResultadoDoAvanco =
  | { ok: true; de: Estado; para: Estado }
  | { ok: false; codigo: string; motivo: string };
export async function avancarFunil(entrada: {
  workspaceId: string;
  oportunidadeId: string;
  para: unknown;
  autor: unknown;
  origem: unknown;
  justificativa: unknown;
}): Promise<ResultadoDoAvanco>;
```

**REGRAS DURAS:**

- `avancarFunil` **LÊ o estado atual do banco** — nunca recebe o `de` de fora.
  `de` vindo do chamador é o caminho para forjar transição.
- Escrita da linha + escrita da trilha numa **única `prisma.$transaction`**.
  Trilha sem linha, ou linha sem trilha, é o defeito que quero impossível.
- Oportunidade sem `LinhaDoFunil` = `encontrada`. Nunca "pode avançar".
- **APPEND-ONLY DE VERDADE:** neste módulo não pode existir nenhum
  `transicaoDoFunil.update`, `.updateMany`, `.delete`, `.deleteMany` nem
  `.upsert`. Só `.create` e leitura. Escreva isso como comentário **e** como teste.
- `justificativa` **nunca** é derivada de texto de anúncio/cliente. Não importe
  nada de `lib/marketplaces` aqui. Texto de terceiro é **dado, nunca ordem**.

### 4. Os testes

`__tests__/celula/trilha-sobrevive-ao-reinicio.test.ts` — SQLite REAL, padrão do
`teto-de-ritmo-no-banco.test.ts`:

- grava 3 transições, `reiniciarComoSeFosseDeploy()`, e a trilha inteira continua
  lá, na ordem, com `autor`/`origem`/`justificativa`/`estadoAnterior` intactos;
- o **estado** também sobrevive ao reinício (prova nº 8 do CEO);
- transição inválida (par não permitido) **não grava nada** — nem linha, nem
  trilha (conte as linhas antes e depois);
- transição sem justificativa **não grava nada**;
- duas transições válidas em sequência produzem `estadoAnterior` encadeado
  corretamente (o `estadoAnterior` da 2ª é o `estadoNovo` da 1ª);
- oportunidade nunca tocada lê `encontrada`.

`__tests__/celula/trilha-e-append-only.test.ts`:

- varredura do **código-fonte** de `lib/agency/celula/trilha.ts` provando que não
  há `update`/`delete`/`upsert` sobre `transicaoDoFunil` (regex, e o teste falha
  se aparecer);
- e a metade positiva: `.create` existe e funciona.

Anote o tipo de retorno de qualquer `vi.fn()` — `vi.hoisted(() => vi.fn())` sem
assinatura já barrou três PRs desta casa no `tsc --noEmit`, que roda **antes** do
vitest no CI.

## DEFINIÇÃO DE PRONTO

Schema, migration SQL, `trilha.ts` e os dois testes escritos em disco. Devolva em
bullets: o que escreveu, o veredicto honesto sobre reaproveitar
`TransicaoDeEstado` (e o porquê), e qualquer divergência nesta ficha.
