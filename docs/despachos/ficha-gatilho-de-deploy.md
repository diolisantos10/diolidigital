# Ficha de despacho — filtro de caminho no gatilho de deploy

**Para:** `plataforma` · **De:** `pm-gatilho-de-deploy` · 16/08/2026
**Reivindicação aberta:** `reivindicacoes/plataforma-gatilho-de-deploy.json`

## Objetivo em uma frase

Fazer com que commit que **só** mexe em papelada (`reivindicacoes/**`, `docs/**`,
`.md` da raiz) **não** dispare build/deploy no Railway — sem afrouxar a CI e sem
encostar na trava de reivindicação.

## O fato medido (não repita a medição, ela já foi feita)

A produção ficou **1 hora** parada no commit `c52aff2` (18:32Z → 19:31Z+).
Na janela do congelamento, **7 de 7** entregas criadas foram disparadas por
commit de **um único arquivo** dentro de `reivindicacoes/`:

| commit | arquivo único | fim |
|---|---|---|
| `d7107a61` | `reivindicacoes/seguranca-csrf-rotas-de-escrita.json` | REMOVED |
| `63579d99` | `reivindicacoes/fila-irmao-fora-do-teto.json` | REMOVED |
| `628594c6` | `reivindicacoes/seguranca-csrf-varredura-da-casa.json` | REMOVED |
| `2f323cf3` | `reivindicacoes/plataforma-ci-concorrencia.json` | REMOVED |
| `d3f6ceea` | `reivindicacoes/registro-dia-16-08-pm-a27b.json` | REMOVED |
| `5c56f800` | `reivindicacoes/esteira-percurso-ponta-a-ponta.json` | BUILDING |
| `538ad53e` | `reivindicacoes/registro-dia-16-08-pm-a27b.json` | SKIPPED |

Build leva ~7 min; chegava push a cada ~1,5 min. Cada um matava o anterior.
Nenhum deles muda uma linha do aplicativo que roda.

## O que já foi decidido — NÃO reabra

1. **O caminho é `build.watchPatterns` no `railway.json`.** Já conferido contra
   o schema oficial (`https://railway.com/railway.schema.json`):
   `build.watchPatterns` existe, é `array de string | null`.
2. **A semântica é gitignore-style, com negação, e está documentada** em
   `docs.railway.com/guides/build-configuration` → "Configure watch paths":
   > "Watch paths are gitignore-style patterns... When specified, any changes
   > that don't match the patterns will skip creating a new deployment."
   > Exemplo oficial: `**` seguido de `!/*.md`.
   > **"negations will only work if you include files in a preceding rule."**
3. **Denylist, nunca allowlist.** O padrão começa em `**` (tudo dispara) e
   depois EXCLUI a papelada. Allowlist (`app/**`, `lib/**`, ...) é proibida
   aqui: diretório novo no futuro deixaria de subir **em silêncio**, e silêncio
   é exatamente a doença que esta casa já pagou para curar.

## O que fazer — três arquivos, e só estes três

### 1. `railway.json` — o filtro

Acrescente o bloco `build` (o `deploy` que já existe fica **intacto**):

```json
"build": {
  "watchPatterns": [
    "**",
    "!/reivindicacoes/**",
    "!/docs/**",
    "!/*.md"
  ]
}
```

⚠️ **`railway.json` é `additionalProperties: false` nos dois níveis** (conferido
no schema). **NÃO** invente chave `"//"` de comentário: quebra o schema. O
porquê vai no arquivo TypeScript abaixo.

### 2. `lib/plataforma/gatilho-de-deploy.ts` — o matcher e o PORQUÊ

- Cabeçalho em **português** explicando, com o caso:
  *em 16/08/2026 a produção ficou 1h parada em `c52aff2` porque a trava de
  coordenação, criada no mesmo dia, gerava ~12 pushes de papelada por dia e cada
  um matava a construção anterior. A trava está certa; o gatilho é que estava
  errado.* Diga também **por que denylist e não allowlist**.
- Exporte `lerPadroesDoRailway(): string[]` — lê `railway.json` **do disco** e
  devolve `build.watchPatterns`. **Não duplique os padrões em código**: o
  `railway.json` é a única fonte; cópia diverge.
- Exporte `disparaBuild(arquivos: string[], padroes: string[]): boolean` —
  implementa a regra do Railway: para cada arquivo, **o último padrão que casa
  vence**; padrão iniciado por `!` desliga. Dispara se **ao menos um** arquivo
  casar. Lista vazia de arquivos → `false`.
- Trate a âncora `/` inicial (raiz do repo) e `**`. Use `picomatch` (já está em
  `node_modules`, v2.3.1) ou implemente à mão — o que for mais legível.
- **Não** importe nada de `lib/plataforma/consulta-de-ci.ts` (frente viva).

### 3. `__tests__/plataforma/gatilho-de-deploy.test.ts` — a prova

Lendo os padrões **do `railway.json` de verdade**, prove as DUAS metades:

**Barra o problema plantado (papelada NÃO dispara):**
- os 7 commits reais da tabela acima, um arquivo cada → `false`
- `docs/pendencias.md` → `false`
- `docs/decisoes.md` + `reivindicacoes/x.json` juntos → `false`
- `CLAUDE.md`, `README.md`, `BACKLOG.md` (raiz) → `false`

**Não inventa problema no caso limpo (código DISPARA):**
- `app/api/health/route.ts` → `true`
- `lib/agency/question-engine.ts` → `true`
- `components/agency/briefing/PublicBriefingRoom.tsx` → `true`
- `package.json`, `package-lock.json`, `prisma/schema.prisma` → `true`
- `.github/workflows/ci.yml` → `true`
- **misto**: `reivindicacoes/x.json` + `lib/agency/y.ts` → `true`
  (papelada junto de código **tem** que subir — este é o caso do push agrupado)
- **`agentes/linha/product-technology/backend-engineer.md` → `true`**
  (ficha de agente é lida pelo CI e por `lib/agency`; NÃO é papelada)
- **fail-safe:** `diretorio-que-ainda-nao-existe/arquivo.ts` → `true`
  (prova que é denylist, não allowlist)

E um teste que **cobra o próprio `railway.json`**: os padrões precisam começar
por `**` (senão as negações não funcionam, segundo a doc do Railway) e o bloco
`deploy` existente (`healthcheckPath`, `overlapSeconds`, etc.) precisa continuar
lá — para ninguém reescrever o arquivo e derrubar o healthcheck sem perceber.

## O que NÃO fazer — restrições duras

- **NÃO** reverta nem edite `.github/workflows/ci.yml` (o `7bfd7a32` fica).
  A CI continua rodando em **todo** push, inclusive papelada. Não afrouxe.
- **NÃO** toque em `scripts/reivindicar.mts`, `lib/coordenacao/**` nem em
  `reivindicacoes/*.json` de outras frentes.
- **NÃO** toque em `components/agency/briefing/`, `lib/agency/`,
  `lib/plataforma/consulta-de-ci.ts` — frentes vivas.
- **NÃO** faça deploy, não promova, não cancele entrega.
- **NÃO** mexa em `docs/decisoes.md` (frente viva `docs-alarme-que-mente`).

## Critério de aceite

- `npx tsc --noEmit` limpo e a suíte nova verde (quem roda os portões e commita
  é o PM — você escreve).
- Papelada comprovadamente não dispara; código comprovadamente dispara;
  push misto dispara; diretório novo dispara.
- O porquê está escrito em português, com o caso de 16/08, no `.ts`.
