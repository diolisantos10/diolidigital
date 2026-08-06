# Subidas forçadas — o registro da porta de emergência

> Cada entrada aqui é uma vez em que a produção recebeu código **sem prova de
> CI**, de propósito, porque alguém decidiu que o risco de não subir era maior.
> Escrito por `scripts/deploy-de-emergencia.mts`, antes da subida acontecer.
>
> **Se esta lista começar a crescer, o problema não é a lista.** Porta de
> emergência usada com frequência é o caminho normal com outro nome, e aí o
> portão do deploy virou decoração.

## 2026-08-06 23:27 UTC — `0ce8ea2`

- **Quem forçou:** Project Manager (agente), sessao de 06/08/2026
- **Commit:** `0ce8ea25e12d7127559911c8a9e80ee7b2135928` — Nome de modelo do Gemini é apelido móvel — o versionado está todo morto
- **Estado da CI no momento:** `APROVADO` — Este commit passou na CI.
- **Incidente da plataforma:** Incident with Actions
- **Run da CI:** https://github.com/diolisantos10/diolidigital/actions/runs/31129882678
- **Motivo:** TESTE CONTROLADO DA PORTA DE EMERGENCIA, autorizado pelo CEO no pedido desta sessao. Redeploy do MESMO commit que ja estava em producao (0ce8ea2), para provar que o caminho de emergencia funciona num dia de pane do GitHub Actions.
- **Resultado: O DISPARO FALHOU** — `Railway recusou: Bad Access`. **Nada subiu; a produção não foi tocada.** O token de projeto do Railway (`Project-Access-Token`) só lê: recusou `deploymentTriggerUpdate`, `serviceInstanceAutoDeployUpdate` e `environmentTriggersDeploy`. A porta de emergência precisa de um token de CONTA do Railway — ver `docs/pendencias.md`.
- **Linha anotada à mão** nesta mesma sessão: o script gravava o registro antes do disparo e não voltava para dizer que o disparo falhou. Corrigido em `scripts/deploy-de-emergencia.mts` — a partir daqui, toda entrada termina com o resultado.
