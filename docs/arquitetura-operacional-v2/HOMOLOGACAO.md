# Relatório de Prontidão — Homologação da Integração V2

> **Atualização de catálogo — 15/08/2026:** Produto & Tecnologia entrou como o
> 12º departamento, com sete funções desligadas por padrão. O catálogo atual
> contém 81 funções (69 executoras + 12 gerentes). As contagens de 62/372 abaixo preservam a evidência da
> homologação anterior e não substituem a nova validação estrutural.

> Ordem do CEO (15/08/2026): "inicie imediatamente o rollout técnico de
> construção e integração da nova arquitetura. Mantenha os 62 agentes
> desligados para produção. Construa todos os departamentos, handoffs,
> permissões, auditoria, observabilidade e mecanismos de segurança. Depois
> execute a homologação completa com dados fictícios e apresente o relatório
> de prontidão antes da ativação do primeiro piloto."
>
> **Veredito: PRONTO PARA DECISÃO DE PILOTO.** Tudo construído, tudo
> homologado com dado fictício, tudo desligado para produção. Nenhum piloto
> foi ativado — ativar é decisão do CEO, não desta entrega.

---

## O que a homologação provou (números reais do ensaio)

A homologação é um TESTE que roda no CI (`__tests__/v2/homologacao-62.test.ts`),
não um relato. Banco SQLite descartável com as migrations completas; todo dado
marcado `[SINTÉTICO]`; zero produção, zero cliente real, zero gasto.

| Prova | Resultado |
|---|---|
| Produção recusa as 62 funções **mesmo com a flag ligada** | ✅ 62/62 recusadas (ficha diz `ativa: false`) |
| A segunda chave tranca sozinha (ficha ligada, flag desligada) | ✅ recusa nomeando a flag |
| Homologação sem dado marcado sintético | ✅ 62/62 recusadas |
| Golden **normal**: executa, registra e fica no teto de custo | ✅ 62/62 executadas; 62 registros gravados (ator, modelo, versão, custo, ferramentas, correlação) |
| Golden **recusa**: entrada obrigatória faltando | ✅ 62/62 recusam nomeando a falta |
| Golden **recusa**: ferramenta proibida pela ficha | ✅ 62/62 barram antes de qualquer trabalho, sem registro |
| Golden **escalada**: gatilho humano da ficha | ✅ 62/62 escalam com pacote completo, sem executar |
| Custo previsto acima do teto | ✅ recusa antes de gastar |
| Custo real estourando o teto | ✅ registra o gasto E escala — estouro não se esconde |
| IA sem modelo declarado | ✅ recusa ANTES de realizar trabalho |
| Handoff: contrato do 03 completo → `aguardando_recebimento` | ✅ na tabela real (`HandoffV2`) |
| Handoff: recebedor de outro departamento tenta aceitar | ✅ negado; linha continua na fila anterior |
| Handoff: aceite pelo destino + reaceite | ✅ fecha; reaceite é idempotente |
| Handoff: contrato incompleto / departamento falso / para si mesmo | ✅ nada cria linha |

Ao todo: **as 62 funções × 6 passagens pelo motor (372 execuções de ensaio)**
mais as travas avulsas — 16 blocos de teste, todos verdes.

## O que foi construído nesta entrega

1. **A ficha virou contrato executável** (`lib/agency/catalogo-v2/specs.ts`) —
   o bloco de especificação de cada uma das 62 fichas é lido pelo motor em
   runtime. Ficha ilegível = função não roda, com motivo nomeado.
2. **O executor com trava dupla** (`lib/agency/execucao-v2/executor.ts`) —
   produção só roda com `ativa: true` NA FICHA **e** flag `v2_execucao` ligada
   no escopo. Hoje as 62 dizem `ativa: false`: produção recusa sempre, mesmo
   com flag ligada por engano. Homologação exige dado marcado sintético.
   Entradas obrigatórias, ferramentas (negar por padrão), teto de custo,
   timeout, gatilhos humanos e registro validado — tudo vindo da ficha.
3. **Handoffs entre departamentos** (`lib/agency/handoff-v2/` + tabela
   `HandoffV2`, migração aditiva) — o contrato literal do 03-ESTEIRA: o que
   entra, o que sai, versão, critérios, responsável, prazo, bloqueios. Sem
   aceite do recebedor, a tarefa NÃO some da fila anterior.
4. **Observabilidade** (`GET /api/v2/observabilidade`) — o mínimo do 05 num
   JSON: volume/idade por estado, bloqueios abertos por motivo, outbox com
   dead letters, prova de vida dos relógios (ausência é achado), execuções
   humano × IA com custo somado, handoffs aguardando recebimento.
5. **Permissões** — o executor consulta `podeExecutarFuncao` (negar por
   padrão, 04-PERMISSOES) antes de qualquer trava de modo; o aceite de
   handoff exige escrever no departamento destino; a observabilidade fica
   atrás da guarda de página interna.

## O que continua DESLIGADO (por ordem do CEO)

- As **62 funções** (`ativa: false` em todas as fichas — e o CI reprova ficha
  que nasça ligada).
- A flag **`v2_execucao`** (não existe linha no banco = desligada, fail-closed).
- As flags de escrita/superfícies da migração continuam como estavam.
- Nada publica, nada gasta, nada fala com cliente real.

## O que falta para o primeiro piloto (decisões, não código)

1. **CEO escolhe o escopo do piloto** (qual workspace/cliente sintético ou
   demo, e quais funções).
2. **Ligar é decisão registrada, em duas chaves**: editar a ficha da função
   escolhida (`ativa: true` — só o CEO ou Diretor a mando altera ficha) e
   ligar a flag `v2_execucao` no escopo com motivo e decididoPor.
3. Escada de sempre: **sombra → allowlist → wide**, preservada integralmente.

*Homologação executada em 15/08/2026 pelo ensaio automatizado; este relatório
descreve o que o CI prova a cada rodada, não uma fotografia manual.*
