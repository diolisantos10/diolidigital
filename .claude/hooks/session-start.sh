#!/bin/bash
#
# .claude/hooks/session-start.sh — o gancho que faz o ambiente nascer PRONTO
# em toda sessão nova, para ninguém gastar um turno concluindo que o
# repositório está quebrado quando o que falta é `npm install`.
#
# ── O INCIDENTE QUE PRODUZIU ESTE ARQUIVO (16/08/2026) ──────────────────────
# Um container subiu sem `node_modules`. `npx tsc --noEmit` devolvia 25.534
# erros, `zustand` ausente, sem `node_modules/.package-lock.json`. Um
# `npm install` (769 pacotes, 33s) zerou o typecheck na hora. Três PMs
# diferentes chegaram a concluir, cada um, que o repositório estava quebrado.
#
# Sem este gancho isso se repete em toda sessão nova, para todo mundo, para
# sempre — e é pago EM SILÊNCIO, porque quem chega acha que é o código que
# está quebrado, não o ambiente que nasceu pela metade. É a mesma família do
# que a trava de reivindicação consertou no mesmo dia: a casa tinha a regra
# (`npm install` está escrito no CLAUDE.md) e não tinha o mecanismo.
#
# ── SÍNCRONO, DE PROPÓSITO ───────────────────────────────────────────────────
# A skill que rege este gancho é explícita: NÃO usar modo assíncrono nesta
# primeira versão. Assíncrono introduz corrida — a sessão começa e o agente
# pode tentar rodar teste antes de a instalação acabar, que é exatamente o
# sintoma que estamos matando. Melhor esperar alguns segundos na abertura do
# que ver um `tsc` reprovando por falta de pacote no meio do trabalho.
#
# ── `set -e` NO CORPO, MAS NUNCA MATANDO A SESSÃO ───────────────────────────
# `set -euo pipefail` para que variável não definida ou pipe quebrado não
# passe batido. Mas todo comando que pode falhar por causa externa (rede,
# registry do npm, disco) está dentro da condição de um `if` — bash não
# aciona o `errexit` para o comando testado num `if`, então a falha vira
# aviso acumulado em $FALHAS, não script morto. O script SEMPRE termina em
# `exit 0`: falha do gancho não pode derrubar a sessão. Bloquear a abertura
# por causa de uma rede instável é pior que o problema original.
set -euo pipefail

# `${CLAUDE_PROJECT_DIR:-.}` e não `$CLAUDE_PROJECT_DIR`: com `set -u`, a
# variável ausente mataria o script na primeira linha útil — e ela ESTÁ
# ausente quando alguém roda o gancho à mão para depurar, que é justamente a
# hora em que ele mais precisa funcionar.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Acumula avisos para relatar no fim. Silêncio aqui recriaria exatamente o
# defeito que este gancho existe para matar.
FALHAS=()

# ── PASSO 1 — dependências (o mínimo obrigatório) ───────────────────────────
# O teste de "precisa instalar" é barato e honesto: o marcador que o npm
# escreve ao terminar, ou um `package.json` mais novo que ele. Ambiente já
# pronto sai em milissegundos, sem reinstalar à toa — gancho que custa dois
# minutos em toda abertura vira gancho que alguém desliga, e aí ele deixa de
# existir.
MARCADOR="node_modules/.package-lock.json"
if [ ! -f "$MARCADOR" ] || [ "package.json" -nt "$MARCADOR" ]; then
  echo "[session-start] node_modules ausente ou desatualizado — rodando npm install..."
  # `npm install`, não `npm ci`: o estado do contêiner é cacheado depois que o
  # gancho completa, e `npm install` aproveita esse cache. `npm ci` apaga
  # `node_modules` e recomeça do zero, pagando o custo cheio toda vez.
  if npm install; then
    echo "[session-start] npm install concluído."
  else
    FALHAS+=("npm install falhou (rede ou registry do npm instável). Rode 'npm install' à mão antes de confiar em 'tsc' ou 'npm test'.")
  fi
else
  echo "[session-start] node_modules já pronto — pulando npm install."
fi

# O cliente do Prisma é gerado, não versionado, e o `tsc` não compila sem ele.
# Normalmente o postinstall do próprio Prisma resolve durante o `npm install`;
# esta é a rede de segurança para quando `node_modules` existe mas a geração
# não aconteceu (instalação interrompida, cache parcial). Barato e idempotente.
if [ ! -d "lib/generated/prisma" ]; then
  echo "[session-start] cliente do Prisma ausente — gerando..."
  if npx prisma generate; then
    echo "[session-start] cliente do Prisma gerado."
  else
    FALHAS+=("'npx prisma generate' falhou — 'npx tsc --noEmit' vai acusar erros que NÃO são do código.")
  fi
fi

# ── PASSO 2 — o ambiente local, só o que o CLAUDE.md já documenta ───────────
# Receita da seção "Como rodar e ver o app localmente". NENHUM segredo de
# produção passa por aqui: nada de CRON_SECRET, chave de provedor de IA,
# senha de Gmail ou credencial do Railway.
#
# NUNCA sobrescreve um `.env` existente. Ele pode ter sido posto por alguém
# com valores que só aquela pessoa tem, e apagá-lo destruiria trabalho de
# forma irreversível — o tipo de dano que uma "conveniência" automática nunca
# pode causar.
# ⚠️ O CAMINHO DO BANCO É ABSOLUTO, E ISSO NÃO É FRESCURA — custou um falso
# alarme em 16/08/2026.
#
# Com `DATABASE_URL="file:./dev.db"` (relativo), DOIS componentes resolvem o
# mesmo texto para arquivos DIFERENTES:
#   • o Prisma Client rodando dentro do Next resolve relativo ao CWD  → <raiz>/dev.db
#   • o Prisma CLI e qualquer script via tsx resolvem relativo ao DIRETÓRIO DO
#     SCHEMA (`prisma.config.ts` declara schema: "prisma/schema.prisma")
#                                                                    → <raiz>/prisma/dev.db
#
# Medido no dia: `dev.db` na raiz com 1,29 MB (onde o servidor escrevia) e
# `prisma/dev.db` com 0 BYTES (o que os scripts liam). Um percurso ponta a ponta
# reportou "no such table" e acusou a esteira de quebrada quando o defeito era
# o caminho. DUAS VERDADES SOBRE ONDE MORA O BANCO, no mesmo repositório.
#
# Caminho absoluto faz os dois resolverem para o MESMO arquivo, sempre.
if [ ! -f ".env" ]; then
  if { echo "DATABASE_URL=\"file:$(pwd)/dev.db\""; echo 'JWT_SECRET=dev-secret-local-only'; } > .env; then
    echo "[session-start] .env criado (banco em caminho absoluto: $(pwd)/dev.db)."
  else
    FALHAS+=("não consegui escrever .env. Crie à mão — a receita está no CLAUDE.md.")
  fi
else
  echo "[session-start] .env já existe — não mexo nele."
  # `.env` existente NUNCA é sobrescrito (é regra desta casa, e ela é boa).
  # Mas quem já tem um `.env` com caminho relativo continua com a ambiguidade
  # acima, e ela falha em SILÊNCIO — o script lê um banco vazio e conclui que o
  # sistema está quebrado. Então aqui não se conserta: avisa-se, com a linha
  # pronta para copiar.
  if grep -q 'DATABASE_URL="file:\./' .env 2>/dev/null; then
    echo "[session-start] ⚠️  Seu .env usa caminho RELATIVO para o banco. O servidor e os scripts vão ler ARQUIVOS DIFERENTES (medido em 16/08: 1,29 MB contra 0 byte). Para alinhar:"
    echo "[session-start]     sed -i 's|file:./dev.db|file:$(pwd)/dev.db|' .env"
  fi
fi

# `prisma db push` + semente são o passo mais caro e o mais dispensável: quem
# só vai rodar `tsc` e testes não precisa de banco nenhum. Por isso vêm por
# último e pulam se o banco já existir.
#
# O caminho é `dev.db` NA RAIZ, e isso foi medido, não suposto: é onde o
# banco com dados de verdade está neste repositório (`prisma/dev.db` também
# existe, mas com 0 byte — artefato, não banco). Por isso o teste é `-s`
# (existe E não está vazio), e não `-f`: um arquivo de 0 byte passaria por
# `-f` e deixaria a sessão com um banco que não tem uma tabela sequer.
if [ ! -s "dev.db" ]; then
  echo "[session-start] banco local ausente — provisionando..."
  if npx prisma db push; then
    if node scripts/seed-db.mjs; then
      echo "[session-start] banco local provisionado e semeado (login: master@dioli.studio)."
    else
      FALHAS+=("scripts/seed-db.mjs falhou — o banco existe mas está sem dados. Rode 'node scripts/seed-db.mjs' à mão.")
    fi
  else
    FALHAS+=("'npx prisma db push' falhou — não há banco local. Só atrapalha quem for subir o app; 'tsc' e 'npm test' seguem valendo.")
  fi
else
  echo "[session-start] dev.db já existe — pulando provisionamento."
fi

# ── PASSO 2.5 — a idade do espelho da doutrina, dita na abertura ────────────
# `docs/kit/` se apresenta como a fonte da doutrina e é um ESPELHO gerado. Em
# 16/08/2026 ele estava 7 dias parado, e as doutrinas 25 a 29 — inclusive a 29,
# que rege a camada de delegação que esta casa cumpre todo dia — não estavam
# nele. Ninguém percebia, porque espelho velho não avisa que é velho.
#
# O aviso mora aqui porque é AQUI que a pessoa lê: na abertura do turno, antes
# de ir procurar doutrina na pasta. Um arquivo dentro de `docs/kit/` só é lido
# por quem já abriu a pasta acreditando nela.
#
# Nunca falha e nunca bloqueia: se o carimbo não puder ser lido, segue calado.
# Sessão não pode morrer por causa de um aviso sobre documentação.
if [ -f "docs/kit/ESPELHO.json" ]; then
  IDADE_DO_ESPELHO="$(node -e '
    try {
      const c = JSON.parse(require("fs").readFileSync("docs/kit/ESPELHO.json", "utf8"));
      const d = Math.floor((Date.now() - Date.parse(c.espelhadoEm)) / 86400000);
      if (Number.isFinite(d) && d > 3) console.log(d);
    } catch {}
  ' 2>/dev/null || true)"
  if [ -n "${IDADE_DO_ESPELHO:-}" ]; then
    echo "[session-start] ⚠️  docs/kit/ está parado há ${IDADE_DO_ESPELHO} dias — pode estar ATRÁS do kit. Doutrina ausente lá não significa doutrina inexistente. Confira: docs/kit/LEIA-PRIMEIRO.md"
  fi
fi

# ── PASSO 3 — o relato, nunca o silêncio ────────────────────────────────────
# Dizer o que falhou é metade do valor deste gancho: quem abre a sessão
# precisa saber que o ambiente está incompleto, senão volta a achar que o
# código é que está quebrado.
if [ "${#FALHAS[@]}" -gt 0 ]; then
  echo ""
  echo "[session-start] ⚠️  O AMBIENTE FICOU INCOMPLETO. Isto não é o código quebrado — é o gancho que não terminou:"
  for f in "${FALHAS[@]}"; do
    echo "  - $f"
  done
  echo ""
fi

exit 0
