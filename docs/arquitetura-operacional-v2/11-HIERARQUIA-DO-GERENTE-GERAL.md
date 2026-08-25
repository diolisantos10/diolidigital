# 11 — A hierarquia do Gerente Geral, em código

> Ordem do CEO, 25/08/2026. Este documento registra o que passou a ser TRAVA,
> onde ela mora, e o que continua sendo só desenho.

## A ordem, no essencial

O antigo Project Manager **não foi extinto: foi promovido.** Virou o **Gerente
Geral (GG)** da agência:

- transita o tempo todo pela agência — **o agente que não para**, sempre
  checando quem está atrasado, o timing e o SLA;
- recebe do SDR e **distribui aos gerentes** de departamento; é o elo dos doze;
- **é a ponte entre o cliente e a agência** — por ora não há um agente por
  cliente, quem conversa e responde é o GG;
- **manda nos gerentes, nunca nos agentes deles.** Cada departamento é um mundo
  fechado que sobe pelo seu gerente;
- meio estratégico, meio operacional: **executa E delega**, mas não executa
  100%.

O **Diretor** é o 100% estratégico: cobra direto do GG, sem que isso o impeça de
cobrar de qualquer agente a qualquer momento.

## O que virou trava, e onde

| A regra | O código | O teste que a prova |
|---|---|---|
| A cadeia sai do manifesto, não da mão | `lib/agency/gerencia/cadeia.ts` | `__tests__/gerencia/despacho.test.ts` |
| Toda demanda entra pelo GG e vai ao **gerente** | `lib/agency/gerencia/despacho.ts` → `entrarPeloGerenteGeral` | idem |
| ⛔ O GG **não chama agente de linha** (os 69) | `despacho.ts` → `despacharDoGerenteGeral` | idem |
| ⛔ Nenhum agente de linha fala para fora do departamento | `despacho.ts` → `subirDoDepartamento` | idem |
| O laço percorre os projetos e dá veredito | `lib/agency/gerencia/laco.ts` | `__tests__/gerencia/laco.test.ts` |
| Atraso vira **linha com dono**, não log | `lib/agency/gerencia/rodada.ts` → `BloqueioV2` | `__tests__/gerencia/rodada.integracao.test.ts` |
| **Coluna gravada não é cliente informado** | `laco.ts` + `rodada.ts` → `OutboxV2` | `laco.test.ts` + integração |
| Só o GG fala com o cliente | `lib/agency/gerencia/voz-unica.ts` | `__tests__/gerencia/voz-unica.test.ts` |
| A fala ao cliente é **fail-closed** | `lib/agency/gerencia/aviso-ao-cliente.ts` | `__tests__/gerencia/aviso-fail-closed.test.ts` |
| O laço está **pendurado no relógio que já existe** | `lib/agency/despertador.ts` + `app/api/cron/v2/route.ts` | `__tests__/gerencia/ligado-no-relogio.test.ts` |

## O que NÃO foi feito, e por quê

1. **Nenhuma flag da V2 foi ligada.** `v2_leitura_dupla`, `v2_escrita`,
   `v2_superficies` e `v2_execucao` continuam desligadas (sem linha = fechada).
   Ligar exige escrever `FlagV2` no banco de PRODUÇÃO, e o único caminho
   suportado é `POST /api/v2/rollout`, restrito a sessão de direção — credencial
   que só o CEO possui. Além disso, o `06-PLANO-DE-MIGRACAO` exige leitura dupla
   **reconciliada** antes da escrita, e não há como conferir a reconciliação de
   produção sem acesso ao banco. **Ligar às cegas seria o contrário do plano.**

2. **A voz única não reescreveu as 19 ocorrências.** A casa ainda fala com o
   cliente por três nomes ("Gerente de projeto", "Equipe Dioli", "SDR") em 14
   arquivos. A dívida foi **congelada com catraca** em
   `__tests__/gerencia/voz-unica.test.ts`: não pode crescer, e arquivo novo que
   tente falar por fora fica vermelho na CI.

3. **`gerente-geral` continua `"ativa": false` na ficha.** Ligar função é
   decisão registrada, nunca efeito de deploy. A cadeia de comando (este
   documento) é independente disso: ela vale para o despacho, esteja a execução
   de IA ligada ou não.

## O achado do dia: o relógio da V2 estava mudo

`POST /api/cron/v2` — o relógio construído no M6, que processa o outbox, bate o
heartbeat e detecta parados — **não tem chamador nenhum**: nem workflow do
GitHub, nem perna do despertador, nem `scripts/`. Está construído e mudo desde
15/08/2026.

Por isso o laço do GG foi pendurado **no despertador**, que roda de verdade a
cada 5 minutos com o app no ar. A chamada em `/api/cron/v2` foi mantida porque é
o lugar certo quando alguém ligar o agendador.

**Consequência declarada:** o aviso de atraso ao cliente entra no `OutboxV2`,
mas quem DRENA o outbox é `/api/cron/v2` — que ninguém chama. Hoje isso não
muda nada visível (a flag `v2_execucao` está desligada e nada sairia de
qualquer forma), mas é dívida com dono: **ligar um agendador para
`/api/cron/v2` é decisão do CEO.**
