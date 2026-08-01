# Vitrine — esteira

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.

---

## Quem aprova a proposta é o CLIENTE, não a agência

Fluxo: a agência **cria e envia** → o cliente aprova **no portal** → isso cria o
projeto e dispara os agentes.

Decisão de produto do CEO: *"meu único botão é aprovar/reprovar; quem decide é o
cliente."*

**Custo de desfazer:** devolver a aprovação para o lado da agência quebra o modelo
inteiro. Não é uma tela — é a tese do produto.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §B1 (commit `465cf05`)

---

## Preço vem do calculador; a IA só EXPLICA

`lib/agency/live-calculator.ts` (`computeEstimate`) produz os números — itens e
totais. A IA reescreve **apenas a descrição**, com explicação inline dos termos.

**Se a IA gerar preço, ela inventa valor.** É a aplicação direta do guardrail da
companhia ao dinheiro.

A explicação é **inline e automática**, nunca toggle ou acordeão — o CEO rejeitou
essa solução ("coisa dos anos 90"). Exemplo: *"3 criativos/semana (3 artes novas
por semana)"*. Serve os dois públicos de uma vez, sem clique.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §B2 e §B3 (commit `465cf05`)

---

## Portão de recursos: não se produz no escuro

`lib/agency/execution/assess-resources.ts` roda **na aprovação**: *"temos material
para criar o que o cliente pediu?"* Sim → produz. Não → abre `MaterialRequest` por
item faltante, avisa o cliente no portal e **segura a produção**.

Regra explícita do CEO. Desfazer significa agentes produzindo sem base e entrega
confusa chegando ao cliente.

> **Buraco conhecido:** não existe gatilho que **retome** a produção quando o
> material chega. Projeto travado fica travado para sempre. Ver `pendencias.md`.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §B4 (commit `465cf05`)

---

## O conteúdo trafega no `reviewNote`, e o join é frágil

A proposta e as entregas são exibidas via o campo **`reviewNote` do
`ApprovalRequest`** — campo reaproveitado para carregar o texto.

**Não há FK formal entre `ApprovalRequest` e `Deliverable`.** O "join" é por
agente-dono, com **fallback por ORDEM**. Funciona e é frágil: qualquer mudança na
ordem de produção desalinha conteúdo e aprovação, silenciosamente.

Um link real (`artifactId`/`deliverableId`) seria o conserto.

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §F4 (commit `465cf05`)

---

## Existem DOIS caminhos que criam projeto — ambos com guarda de idempotência

(a) a rota de review da agência (`/api/brain/auto-scope/[id]/review`), e
(b) o cliente aprovando no portal → `createProjectFromRequest`.

Os dois têm guarda contra duplicata — houve um bug real em que um reenvio criava
dois projetos idênticos.

**Não confirmado:** se o caminho (a) ainda é usado pela UI depois da decisão de que
quem aprova é o cliente. **Confirme antes de remover qualquer um dos dois.**

— promovido em 2026-08-01 pelo PM · origem: `HANDOFF.md` rev.2 §F5 (commit `465cf05`)
