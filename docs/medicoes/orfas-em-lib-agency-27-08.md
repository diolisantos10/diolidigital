# A lista das órfãs — onde mora a próxima "trava sem fechadura"

> Medição de 27/08/2026. **Levantamento, não conserto** — por ordem expressa.
> Custo: US$ 0,00. Nada aqui foi alterado.

## Por que esta lista existe

Em uma noite, três ocorrências do mesmo defeito: **código certo, testado,
provado por mutação — e ligado em lugar nenhum.**

1. `volumeQueACasaVende` / `aCasaProduz` — conserto dos defeitos de escopo do
   cliente 001, com teste e mutação, e **nenhuma tela chamava**;
2. `IsencaoDeParceria` — portão que lê, reset que apaga, **nada que cria**. O
   cliente 001 ficou inconcedível;
3. `CanalDeAviso` listava `"email"` e **nada enviava um**;
4. e a quarta foi minha: escrevi a conferência da isenção e **não fiz porta**.

`tsc` fica verde (o código existe e compila). A suíte fica verde (os testes
chamam a função direto). A única coisa que falta é **alguém chamar**.

## O que NÃO virou catraca, e por quê

**Função exportada sem chamador: 356** em `lib/agency`. Não vira régua: a classe
de falso positivo domina. Exemplo conferido — `pisoRespeitado` (a trava do piso
do SDR, #360) aparece na lista e é chamada **na linha 262 do próprio arquivo**,
por uma função irmã. É auxiliar interno, não órfã.

*Régua larga é régua desligada na primeira reclamação.*

## O que vale olhar: MÓDULOS que ninguém importa

Pergunta mais precisa e com muito menos ruído: *que arquivo de `lib/agency`
nenhum código de produção importa?* Um módulo inteiro sem importador é ou
**trava sem fechadura** (a regra existe e não está ligada) ou **resíduo** (devia
sair). As duas exigem decisão humana.

- módulos em `lib/agency`: **331**
- **módulos que NENHUM código de produção importa: 51**

| módulo | linhas | tem teste? |
|---|---|---|
| `lib/agency/cliente-falso/percurso.ts` | 1167 | sim |
| `lib/agency/question-engine.ts` | 1119 | sim |
| `lib/agency/cliente-falso/verificacoes.ts` | 1065 | sim |
| `lib/agency/strategy-room.ts` | 430 | **NÃO** |
| `lib/agency/training/dynamic-scenario-generator.ts` | 406 | **NÃO** |
| `lib/agency/cliente-falso/placar.ts` | 287 | sim |
| `lib/agency/financeiro/caminhos-que-gastam.ts` | 268 | sim |
| `lib/agency/design/mockup.ts` | 267 | sim |
| `lib/agency/cliente-falso/roteiro.ts` | 256 | sim |
| `lib/agency/produto-tecnologia/guarda-de-patch.ts` | 249 | sim |
| `lib/agency/gerencia/laco.ts` | 236 | sim |
| `lib/agency/medicao/conciliacao.ts` | 222 | sim |
| `lib/agency/training/evaluator.ts` | 219 | **NÃO** |
| `lib/agency/orchestration/dependencies.ts` | 205 | sim |
| `lib/agency/briefing-extractor.ts` | 204 | **NÃO** |
| `lib/agency/design/trava-de-fundo.ts` | 200 | sim |
| `lib/agency/intelligence/operations.ts` | 198 | sim |
| `lib/agency/produtos/conferencia-do-arquivo.ts` | 195 | sim |
| `lib/agency/cliente-falso/servidor-de-teste.ts` | 184 | **NÃO** |
| `lib/agency/produtos/regua-da-marca-na-peca.ts` | 183 | sim |
| `lib/agency/medicao/leitura-da-conta.ts` | 180 | sim |
| `lib/agency/comercial/resposta-que-responde.ts` | 165 | sim |
| `lib/agency/intelligence/deliverable-builders.ts` | 157 | **NÃO** |
| `lib/agency/gerencia/despacho.ts` | 154 | sim |
| `lib/agency/medicao/plano-de-mensuracao.ts` | 152 | sim |
| `lib/agency/sala-dos-agentes/elenco.ts` | 150 | sim |
| `lib/agency/medicao/serie.ts` | 142 | sim |
| `lib/agency/consentimento/portas-de-saida.ts` | 138 | sim |
| `lib/agency/financeiro/custo-de-infraestrutura.ts` | 138 | **NÃO** |
| `lib/agency/estados-v2/maquina.ts` | 137 | sim |
| `lib/agency/comercial/quem-bateu-na-porta.ts` | 135 | sim |
| `lib/agency/esteira/aprovacao-parada.ts` | 134 | sim |
| `lib/agency/cliente-falso/pecas-em-texto.ts` | 130 | **NÃO** |
| `lib/agency/intelligence/brand-hub.ts` | 129 | sim |
| `lib/agency/training/suggestions.ts` | 127 | sim |
| `lib/agency/esteira/causas-de-refacao-contagem.ts` | 120 | sim |
| `lib/agency/production-templates.ts` | 118 | **NÃO** |
| `lib/agency/medicao/apresentacao.ts` | 100 | sim |
| `lib/agency/medicao/integridade-do-panorama.ts` | 92 | sim |
| `lib/agency/medicao/recuperacao.ts` | 90 | sim |
| `lib/agency/design/medir-fundo.ts` | 82 | sim |
| `lib/agency/training/alerts.ts` | 78 | sim |
| `lib/agency/gerencia/cadeia.ts` | 71 | sim |
| `lib/agency/comercial/nome-do-negocio-no-texto.ts` | 63 | **NÃO** |
| `lib/agency/design/fontes-embutidas.ts` | 61 | sim |
| `lib/agency/execucao-v2/registro.ts` | 54 | sim |
| `lib/agency/estados-v2/leitura-dupla.ts` | 53 | sim |
| `lib/agency/persistence/save-artifact.ts` | 44 | **NÃO** |
| `lib/agency/ai-runner.ts` | 42 | **NÃO** |
| `lib/agency/clients/workspace/guarda.ts` | 40 | sim |
| `lib/agency/design/texto-da-peca.ts` | 38 | **NÃO** |

## ⚠️ Como esta lista foi calibrada — e ela FALHOU duas vezes antes

Detector cego devolve verde, e verde por ausência não é verde. Antes de
entregar, a varredura foi provada nos dois sentidos:

**Ela ACHA o que eu sei que era órfão** (ignorando os arquivos que fiei hoje,
= o estado de ontem): `volumeQueACasaVende` ✓ · `aCasaProduz` ✓ ·
`concederIsencaoDeParceria` ✓.

**Ela NÃO acusa o que está fiado**: `avisarCliente` · `linhaDeVolume` ·
`apresentarPacotesProntos` e os três acima, depois de ligados.

**Os dois erros que ela cometeu no caminho, e o conserto:**

| erro | causa | como apareceu |
|---|---|---|
| devolvia "nenhum caso" | `lib/generated/prisma/` traz, em comentário, um exemplo de CADA operação para CADA modelo | todo modelo parecia ter `create` |
| acusava `despertador.ts` (1.323 linhas) | eu não varria `instrumentation.ts`, na raiz | o relógio da casa listado como morto |

## ⛔ O que esta lista NÃO prova

- **Não prova que o módulo é lixo.** Vários são regra viva esperando o fio —
  que é exatamente o caso 1 desta noite.
- **Não cobre import dinâmico com caminho montado em execução.** Escaparia de
  qualquer análise estática; esta casa não usa esse padrão hoje no caminho de
  produção.
- **Não olha `app/`, `components/` nem `scripts/`.** Só `lib/agency`.
- **Nenhum item foi verificado um a um.** Cinco foram conferidos por `grep`
  independente (`question-engine`, `cliente-falso/percurso`,
  `esteira/aprovacao-parada`, `gerencia/laco`, `estados-v2/maquina`) — os cinco
  bateram. **Os outros são leitura de ferramenta, não veredito.**

## A pergunta para amanhã, item a item

Para cada linha, uma pergunta e três saídas honestas:

> **Isto é regra que devia estar ligada, ou resto que devia sair?**

1. **ligar** — achar o ponto de chamada que falta (foi o conserto dos três de hoje);
2. **remover** — se é resto, sai do repositório, e o teste sai junto;
3. **declarar** — se é ferramenta de bancada (o `cliente-falso` inteiro cai
   aqui), escrever isso no cabeçalho do arquivo, para o próximo não medir de novo.

**Nenhuma delas se resolve baixando a régua.**
