# O portão do deploy — como a produção recebe código

> Decidido pelo CEO em 06/08/2026: **deploy só com CI verde, com porta de
> emergência declarada.**

## O dia que escreveu esta regra

06/08/2026, 12h22. O GitHub Actions entrou em pane, os workflows não rodaram, e
a produção recebeu um commit **sem nenhum resultado de CI** — não vermelho:
inexistente. Deu certo porque alguém rodou o portão à mão. A proteção era
alguém lembrar.

O motivo mecânico: o Railway faz deploy **por push**, não por CI verde. Os
testes rodavam ao lado do deploy, não na frente dele. E, para todo mundo rio
abaixo, "a CI não rodou" e "a CI passou" têm exatamente a mesma aparência —
nenhum e-mail vermelho. **Silêncio foi lido como aprovação.**

## Como funciona a partir de agora

1. Alguém dá push na branch de produção (`claude/dioli-agency-os-architecture-kk7kp`).
2. O Railway cria a implantação em estado **WAITING** e **não sobe nada** enquanto
   os workflows daquele push não terminarem.
3. Se algum falhar, a implantação vira **SKIPPED** — a produção continua servindo
   a versão anterior.
4. Só com tudo verde a implantação segue. Commit com CI verde sobe sem atrito.

Isso é o recurso **"Wait for CI"** do próprio Railway
([docs](https://docs.railway.com/deployments/github-autodeploys)) — na API
pública, o campo `checkSuites` do `DeploymentTrigger` do serviço.

### Por que esse caminho, e não um workflow que dispara o deploy

O caminho alternativo estudado era: desligar o autodeploy por push e mandar o
deploy de dentro de um workflow que só roda depois da CI verde. Foi descartado,
por três motivos:

1. **A trava tem que valer no dia da pane.** Um workflow que deploya só deploya
   se o GitHub Actions estiver de pé. No dia exato que motivou esta regra,
   nenhum workflow rodou — a produção ficaria sem **nenhum** caminho automático.
   O `checkSuites` mora do lado do Railway e não depende disso.
2. **Não exige o token do Railway como segredo do repositório.** Token de deploy
   dentro do CI é uma credencial a mais exposta a cada action de terceiro.
3. **É um mecanismo só.** O outro caminho criaria uma **segunda** régua de "o que
   conta como verde", ao lado da que o sentinela já usa — e é assim que "sem
   prova" volta a contar como verde de um lado só.

### "Sem CI" nunca conta como verde

A régua é uma só e mora em `lib/plataforma/sentinela-do-deploy.ts`
(`julgarProva`). Só `success` aprova. Cancelada, estourada, em pane, pulada,
ainda rodando ou **inexistente** caem todas em `SEM_PROVA` — e o texto diz qual
dos casos é. Quem usa essa régua: o sentinela (que confere depois) e a porta de
emergência (que registra o estado da CI no instante em que alguém força).
Duas cópias da regra é como um dos lados volta a ler ausência como aprovação.

### O sentinela saiu da frente do deploy

`sentinela-do-deploy.yml` **não roda mais no push**. Com o portão ligado, um
workflow vermelho descarta a implantação — e o sentinela fecha vermelho
justamente quando a produção está ruim. Somando os dois nascia um impasse:
produção ruim → sentinela vermelho → deploy descartado → o conserto não sobe.
O alarme de incêndio trancando a porta. Ele agora roda de hora em hora e por
disparo manual, e denuncia **abrindo issue**, que é o alarme de verdade.

## Ver o estado do portão

```sh
RAILWAY_TOKEN=<token de conta> npm run portao
```

Sai 0 se o portão está ligado, 1 se não está. Também grita quando o portão está
ligado mas o Railway **não reconhece nenhum workflow** para esperar — portão sem
o que esperar aprova tudo com cara de trava.

Ligar (é o comando que ativa a regra deste documento):

```sh
RAILWAY_TOKEN=<token de conta> npm run portao -- --ligar
```

Pela tela: Railway → projeto Dioli Digital → serviço `diolidigital` →
Settings → Source → **Wait for CI**.

## A porta de emergência

Num dia de pane a CI não fecha nunca, e o portão que protege vira o portão que
impede o conserto. Por isso existe:

```sh
RAILWAY_TOKEN=<token de conta> npm run deploy:emergencia -- \
  --quem="Dioli" \
  --motivo="GitHub Actions em major outage e o portal do cliente está fora" \
  --confirmo
```

Ensaio, que não escreve e não sobe nada: acrescente `--ensaio`.

**Ela não abre sem rastro.** Nesta ordem:

| Passo | O que trava |
|---|---|
| Sem `--quem` | subida forçada sem autor é anonimato, não rastro |
| Sem `--motivo` (mín. 20 caracteres) | motivo-carimbo não é motivo |
| Sem `--confirmo` | produção não se força por engano de comando |
| Com o portão **já liberando** o commit | recusa, e manda usar o caminho normal — porta de emergência com o portão aberto é como ela vira o caminho normal (`--mesmo-aprovado` insiste, e fica registrado) |
| **Registro gravado antes do disparo** | se não deu para registrar, **não sobe** |

O rastro fica em **`docs/deploys/emergencias.md`**: quem forçou, quando, sobre
qual commit (com assunto), o estado da CI naquele momento, o incidente da
plataforma quando havia, o motivo escrito por gente, e o **resultado** do
disparo. Melhor esforço adicional: uma issue no repositório.

Depois de forçar, **commitar o registro** — o script imprime o comando. Ele não
commita sozinho de propósito: empurrar um commit novo na branch de produção
mudaria justamente o commit que está subindo.

O portão é reaberto só pelo instante do disparo e **fechado de volta no
`finally`, com releitura**. Se o fechamento falhar, o script sai vermelho
dizendo com todas as letras que o portão ficou aberto.

## O que ainda não está provado

Ver `docs/pendencias.md`. Em uma linha: **o token de projeto do Railway só lê.**
Ele recusou `deploymentTriggerUpdate`, `serviceInstanceAutoDeployUpdate` e
`environmentTriggersDeploy` com `Bad Access`. Ligar o portão e usar a porta de
emergência exigem um **token de conta** do Railway.
