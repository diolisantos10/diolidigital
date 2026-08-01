# O corredor — decisões que atravessam domínios

> Decisão que afeta mais de um especialista não mora na sala de nenhum deles.
> Mora aqui. **Só o PM escreve neste arquivo.**
>
> Decisão que serve a **mais de um projeto** não mora aqui: vai como proposta ao
> **Diretor Geral do Cérebro**, no `dioli-brain-kit`.

---

## O piloto roda 100% IA, sem revisão humana

**Decidido em** 2026-07-31 · **por** CEO

Não existe pessoa conferindo antes de o entregável chegar ao cliente.

**O que muda para todos:** esta casa passa a ter um perfil de risco **mais
exposto que o do Foocci**. Lá o erro de um agente é uma frase numa conversa; aqui
é uma peça, um plano de mídia ou um post publicado em nome de um cliente pagante.

Consequência direta e não negociável: **rodar 100% IA não significa pular a
escada.** Significa que a escada é a única proteção que sobrou. Departamento novo
nasce em sombra e sobe com evidência — sem exceção "só pra esse cliente".

---

## A fonte das regras de IA é o kit, não este repositório

**Decidido em** 2026-07-31 · **por** CEO · **origem:** commit `af3c96f`

As regras de agentes moram no `dioli-brain-kit`. Este repositório **aponta**, não
copia.

**O que muda para todos:** aprendeu algo que serve a mais de um produto? **Não
escreva no kit por conta própria** — proponha ao Diretor Geral. Cópia espalhada
diverge: atualiza-se um repositório, esquecem-se os outros, e em três meses
ninguém sabe qual versão vale.

---

## A IA dá pensamento, não poder

**Decidido em** 2026-06/07 · **por** CEO · **origem:** `ARCHITECTURE.md` §3

Quatro consequências cravadas no código:

1. **IA é plugável** — `BRAIN_AI_PROVIDER`. Nunca chame um SDK direto.
2. **IA nunca inventa** — campo nulo vira `undefined` e entra em `missingFields`.
   Nunca é preenchido por inferência.
3. **IA nunca aplica sozinha** — aprovar e aplicar são transições **separadas**.
4. **Rule-based é o fallback universal** — IA off, falhando ou inválida → o motor
   determinístico assume sem derrubar nada.

**O que muda para todos:** se você escrever um caminho onde a falha da IA quebra a
aplicação, você quebrou esta lei.

---

## Um PM por projeto; o chat deixa de ser a memória

**Decidido em** 2026-08-01 · **por** CEO · **origem:** a reestruturação
CEO → PM → especialistas

Esta casa passa a ter **uma porta**: o PM. Assuntos deixam de virar abas
separadas — viram despacho para especialista, e o resultado vira registro no
repositório **na mesma sessão**.

**O que muda para todos:** nenhum aprendizado durável pode existir só na conversa.
E **nenhum chat antigo é fechado antes de exportado e minerado** — ver
`docs/arquivo/README.md`. Conversa apagada não volta.

---

## Dado real ou estado honesto — nunca número inventado

**Decidido em** 2026-08-01 · **por** PM da sessão de design · **origem:**
`HANDOFF.md` §5.1 (commit `3f888f1`)

A Inteligência de Marketing devolve `null` ou vazio e a tela mostra *"não
informado"* / *"conecte"* em vez de preencher com estimativa. Motivo: é um painel
de **decisão de marketing** — número inventado é pior que ausência, porque ausência
o dono vê e corrige, e número inventado ele usa.

**O que muda para todos:** vale em toda superfície que mostra dado de cliente, não
só nessa aba. Campo ausente vira estado honesto na UI, nunca preenchimento.

> **Proposto ao Diretor Geral como regra de companhia.** É a contraparte de
> interface do guardrail "ausência de informação não é informação" — o mesmo
> princípio, aplicado à tela em vez da conversa.

---

## Verdade se lê no servidor, não se monta no cliente

**Decidido em** 2026-08-01 · **por** PM da sessão de design · **origem:**
`HANDOFF.md` §5.2

O endpoint de marketing faz o fan-out no backend (`Promise.all` sobre request,
artifacts, brandBrain, connections, posts) e entrega um shape já normalizado. O
componente fica burro e testável, e o parsing de JSON fica num lugar só.

**O que muda para todos:** esta decisão é a **mesma** do P0 aberto em
`docs/pendencias.md` — *"a verdade do cliente é montada no cliente"* em
`reason.ts`. O padrão certo já existe e já está em produção num endpoint. Quem for
fechar aquele P0 deve copiar este desenho, não inventar outro.

Registrar isso aqui é o ponto do corredor: sem ele, o especialista `cerebro`
resolveria de um jeito e o `esteira` de outro, e em um mês haveria dois padrões
brigando.

---

## O reset da casa preserva a porta de entrada

**Decidido em** 2026-08-01 · **por** CEO, na sessão do PM · **origem:** pedido
direto de "começar do zero"

Zerar a operação apaga cliente, projeto, entregas, aprovações, portal e o cérebro
de marca — mas **não** apaga as solicitações de novos clientes. Elas voltam ao
estado `new`, desligadas do cliente que foi apagado, e são o ponto de partida da
operação seguinte.

Motivo: a solicitação é a única coisa no banco que **veio de fora**. Cliente,
projeto e entrega o sistema refaz sozinho a partir dela; a solicitação, não —
quem a escreveu foi um prospect, e ela não se reconstrói.

**O que muda para todos:** `DELETE /api/admin/reset` passa a ter dois modos, e o
**padrão é preservar** (`keep-requests`). Apagar a porta de entrada exige pedir
`mode: "everything"` de propósito. Junto veio um `GET /api/admin/reset` — auditoria
somente-leitura que mostra o que seria apagado e o que seria preservado, **sem
apagar nada**. Regra: nunca se roda o reset sem rodar a auditoria antes.

O que nenhum modo toca: workspace, usuários e login, chaves de IA e integrações,
contas conectadas da Meta, o Radar de mercado, a governança do Brain e o histórico
de treino do SDR. Isso é a agência, não é dado de cliente.
