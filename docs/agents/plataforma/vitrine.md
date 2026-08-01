# Vitrine — plataforma

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

---

## `params` de rota de API é uma Promise e precisa de `await`

Next.js **16.2.1** tem breaking changes em relação ao que a maioria dos modelos
aprendeu. O caso que mais morde: em rotas de API, `params` **não é mais um objeto
síncrono** — é uma `Promise`.

O padrão correto está em `app/api/projects/[id]/marketing/route.ts`. Copie de lá.

Antes de escrever qualquer rota nova, leia o guia em `node_modules/next/dist/docs/`.
O `AGENTS.md` avisa isso na primeira linha do repositório por este motivo.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §0 e §5.5 (commit `3f888f1`)

---

## A chave de IA da tela é a fonte de verdade, não a variável de ambiente

O PM/orchestrator resolve a chave via `lib/ai/resolve-key.ts`, a partir do que o
usuário configurou em `AiKeyManager.tsx`. **Não de env hardcoded.**

Isso existe porque houve um furo real: a chave era salva na tela e o orquestrador
continuava lendo do ambiente — o usuário configurava e nada acontecia, sem
mensagem de erro.

Vale para todo provedor, inclusive o DeepSeek.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §4.4 (commit `3f888f1`)

---

## ⚠️ O proxy deste ambiente intercepta TLS — não confie no erro de certificado

Ao diagnosticar HTTPS **de dentro de um ambiente de agente**, `curl` e `openssl`
**enganam**: o certificado observado tem issuer *"Anthropic Egress Gateway"*,
porque o proxy de saída intercepta o TLS. Um erro de certificado aqui **não prova
nada** sobre o mundo real.

**O sinal confiável** é a comparação: se o `www` responde perfeito pelo mesmo
proxy e só o apex falha, o problema é emissão de certificado pendente — não
configuração. Confirme pelos headers `x-railway` e por DNS-over-HTTPS
(`cloudflare-dns.com/dns-query`), não pelo cadeado local.

Verificação de verdade se faz de uma máquina sem o proxy.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` §7.1 (commit `3f888f1`)
