# O que é este gancho

`session-start.sh` roda automaticamente no início de toda sessão nova (gatilho
`SessionStart`, registrado em `.claude/settings.json`). Ele instala
`node_modules` se estiver ausente ou desatualizado, gera o cliente do Prisma se
faltar, e — **só se ainda não existirem** — cria o `.env` de desenvolvimento
local e provisiona o banco SQLite com a semente do `CLAUDE.md`.

É **idempotente**: rodar de novo com o ambiente já pronto não reinstala nada e
sai em milissegundos. Falha em qualquer passo **nunca derruba a sessão** — ele
avisa, com todas as letras, e deixa o trabalho seguir.

## O incidente que o produziu

Em 16/08/2026 um container subiu sem `node_modules`: `npx tsc --noEmit` devolvia
**25.534 erros**, `zustand` ausente, nem `.package-lock.json` presente. Um
`npm install` (769 pacotes, 33s) zerou o typecheck na hora.

**Três PMs diferentes chegaram a concluir, cada um, que o repositório estava
quebrado** — e o custo se pagava em silêncio, porque quem chega acha que é o
código, não o ambiente. A regra já existia (`npm install` está escrito no
`CLAUDE.md`); o que faltava era o mecanismo que a executasse sozinho. É a mesma
família da trava de reivindicação, construída no mesmo dia: **letra sem
mecanismo não protege nada.**

## O que ele NUNCA faz

- **Não sobrescreve um `.env` existente.** Ele pode ter valores que só uma
  pessoa tem, e apagá-lo destruiria trabalho de forma irreversível.
- **Não põe segredo de produção em lugar nenhum.** Nada de `CRON_SECRET`, chave
  de provedor de IA, senha de Gmail ou credencial do Railway — só a receita de
  desenvolvimento local que já está no `CLAUDE.md`.
- **Não bloqueia a abertura da sessão.** Sempre sai `0`, mesmo com falha.

## Como rodar à mão para depurar

```sh
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```

Ele funciona sem `$CLAUDE_PROJECT_DIR` definido (cai no diretório atual), que é
exatamente o caso de quem está depurando.
