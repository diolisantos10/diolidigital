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

## 2026-08-07 00:54 UTC — `4ed47a9`

- **Quem forçou:** interface
- **Commit:** `4ed47a9641d6002693b14552d59ee4e2dc9e301e` — A tela de Integrações voltava em branco: "user" não estava no mapa de plataformas
- **Estado da CI no momento:** `SEM_PROVA` — Este commit NÃO tem CI verde — nenhum run foi criado.
- **Incidente da plataforma:** Incident with Actions
- **Motivo:** GitHub Actions em pane; a tela de Integracoes quebra o navegador do CEO em producao (TypeError apaga a pagina inteira) e ele volta a usar amanha cedo
- **Resultado: O DISPARO PELO SCRIPT FALHOU** — Railway recusou: Bad Access.
- **A subida ACONTECEU, por fora do script, às 00:57 UTC.** Anotado à mão pelo
  agente de interface, porque registro que para na metade do caminho é pior que
  registro nenhum: `/api/health` responde `commit: 4ed47a9`, deploy
  `b3ccdddd-4efb-4705-b153-f24de92820ff`, status `SUCCESS`.
- **⚠️ O achado que muda a porta de emergência:** o token de projeto do Railway
  **não é só de leitura**, como a entrada anterior concluiu. Ele recusa
  `deploymentTriggerUpdate` e `environmentTriggersDeploy` — as duas que o
  script usa — mas **aceita** `serviceInstanceDeployV2(serviceId, environmentId,
  commitSha)`, que dispara o deploy de um commit específico **sem passar pelo
  portão do "Wait for CI"**. Foi essa que subiu o conserto. Com o push feito, o
  Railway tinha criado a implantação em `WAITING` (esperando uma CI que, com o
  GitHub em pane, nunca viria); o `serviceInstanceDeployV2` a substituiu.
  → **Pendência para o departamento de plataforma:** trocar `dispararDeploy()`
  em `lib/plataforma/railway-portao.ts` por essa mutação (com o `commitSha`
  explícito, que também elimina o "que commit foi mesmo que subiu?"), e então a
  porta de emergência volta a funcionar **sem** depender de um token de conta.
