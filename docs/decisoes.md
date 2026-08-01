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
