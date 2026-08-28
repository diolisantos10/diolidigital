# O custo de construir — e o trabalho que não chegou

> **Origem:** o Diretor do Foocci me avisou, em 28/08, que o custo das sessões de
> Claude Code ia aparecer no relatório ao CEO e que era feio eu descobrir por lá.
> Ele estava certo, e o aviso foi útil. **Fui medir — e o número dele está
> desatualizado, e a conclusão muda.**
> **Custo desta medição:** zero. Leitura da listagem de sessões da conta.

---

## 1. O número, medido agora

| Bolso | US$ | sessões | % |
|---|---:|---:|---:|
| **Control Room / Diretor Geral** | **4.272,19** | 4 | **61,8%** |
| Dioli Digital | 1.588,88 | 17 | 23,0% |
| Foocci | 519,90 | 14 | 7,5% |
| outros / transversal | 429,27 | 20 | 6,2% |
| Dioli Political | 102,85 | 1 | 1,5% |
| **TOTAL VISÍVEL** | **6.913,10** | 56 | |

Ao câmbio 5,16: **R$ 35.671**.

### O que isso corrige no aviso que recebi

| | o par mediu | eu medi |
|---|---|---|
| Dioli Digital | US$ 1.046,88 · 24 sessões | **US$ 1.588,88 · 17 sessões** |

Números diferentes, e não é discordância: são recortes diferentes da mesma
listagem, feitos em momentos diferentes. **O dele é piso; o meu também.** Não
tratem nenhum dos dois como fechamento — o fechamento exige a fonte de billing,
não a listagem.

### 🔴 O que ninguém tinha medido, e é o maior bolso da casa

**A camada de governança custa mais que todos os produtos somados.**

- **Control Room / Diretor Geral: US$ 4.272 — 61,8% de tudo, em 4 sessões.**
- Uma única sessão, "Diretor Geral": **US$ 2.995,44**.
- Os três produtos juntos (Digital + Foocci + Political): US$ 2.211.

A conclusão do meu par foi *"o maior custo é construir, não rodar"*. Confirmo a
direção e **estendo**: o maior custo não é construir **produto** — é **coordenar
quem constrói**. Uma sessão de governança custou mais que o Foocci inteiro.

⚠️ **Isto não é acusação e não é desperdício provado.** Sessão de coordenação cara
que destrava seis produtos pode ser o melhor dinheiro da casa. **O ponto é que
ninguém sabia**, e o que não se mede não se decide. Quem julga se vale é o CEO —
mas ele precisa do número para julgar.

### Comparação que dá escala

O Railway da casa **inteira** custa US$ 40,99/mês. O total visível de sessões
equivale a **169 meses** — 14 anos — de servidor de todos os nove projetos.

---

## 2. O trabalho que foi pago e não chegou — a mesma doença, agora com preço

O par apontou ~10 sessões da Dioli paradas em "precisa de decisão" desde 16/08.
**Confirmei, e o achado é pior do que parado: é pago e perdido.**

Onze sessões da Dioli Digital de **15 e 16/08**, todas sem avanço desde então:

| data | US$ | assunto |
|---|---:|---|
| 16/08 | 389,35 | Diretor da Dioli — dono do ritmo do piloto (**rejected**) |
| 16/08 | 301,32 | P0: chat do portal serve a conversa do cliente errado |
| 16/08 | 107,05 | achados do piloto do CEO (rodada 1) |
| 16/08 | 98,33 | P0: o orçamento prometido não tem quem entregue |
| 16/08 | 79,02 | piloto rodada 2: preço vazando no SDR |
| 15/08 | 79,46 | raio-x e prontidão para religar a agência |
| 15/08 | 42,02 | os 4 cards do quadro do CEO |
| 16/08 | 37,35 | a agência tem que FUNCIONAR: esteira ponta a ponta |
| 16/08 | 34,02 | o SDR volta a pedir e-mail e WhatsApp |
| 16/08 | 19,13 | as duas decisões destravadas: tabela de preços |
| 15/08 | 10,70 | P0: card de aprovação expõe custo ao cliente |

**Somam ~US$ 1.198 — 75% de tudo que a Dioli Digital gastou.**

### 🔴 O elo que fecha o caso

**Os assuntos dessas sessões são os mesmos dos PRs que triei em `triagem-dos-prs-parados-28-08.md`** — preço, esteira, SDR, portal, contato do lead. E aqueles PRs (#169–#172, de 16/08) **não conseguem mais ser mergeados**: a branch de deploy virou história órfã em relação a eles.

Ou seja, a linha inteira do defeito:

1. em 15-16/08 a casa **pagou ~US$ 1.198** para diagnosticar e consertar;
2. o trabalho virou **PRs**;
3. a base foi **recriada por baixo**, e os PRs ficaram órfãos;
4. as **sessões pararam** com decisões dentro delas;
5. **ninguém colheu nada** — e 12 dias depois eu reencontrei um dos defeitos
   ainda **vivo em produção** (o vazamento da ficha de marca, PR #376).

*A casa não perdeu tempo. Perdeu dinheiro já gasto, e não sabia.*

---

## 3. A ordem do CEO sobre departamento financeiro — registrada, não executada

Palavras dele, de 28/08, repassadas pelo Diretor do Foocci:

> *"Todo produto precisa ter o seu departamento financeiro… Railway, assinatura e
> tudo mais… Esses departamentos precisam reportar pra um novo departamento, que
> é o departamento financeiro da empresa, que fica lá dentro da Control Room."*

**O padrão já existe e não deve ser reinventado:**
`diolisantos10/FOOCCI` → `docs/financeiro-padrao-da-casa.md` (PR #169 de lá).
Quatro bolsos (infraestrutura · uso de terceiros · assinaturas · receita), toda
linha com **origem** e **grau de confiança** (MEDIDO / ESTIMADO / NÃO MEDIDO), e
**nunca zero por falta de informação**.

*Regra não se copia, se aponta* — por isso o padrão não está transcrito aqui.

### A proposta que eu levo junto

O par vai propor um **quinto bolso: custo de construção**. **Apoio, e proponho
que ele seja separado em dois**, porque a medição de hoje mostra que são
naturezas diferentes e uma esconde a outra:

- **construção de produto** — sessões que produzem o que o cliente usa;
- **coordenação** — governança, direção, ronda.

Somados num bolso só, os 61,8% da Control Room ficariam diluídos como "custo de
construir a Dioli Digital", e a pergunta cara — *quanto custa coordenar?* — nunca
seria feita.

**Não construí o departamento financeiro da Dioli Digital nesta madrugada**, e a
razão é a regra em vigor: um cliente real entra de manhã e nada pode
desestabilizar a casa antes disso. Fica enquadrado e medido; o trabalho é de
poucas horas quando a manhã estiver ganha.

---

## 🚩 O que eu NÃO consegui provar

1. **O número não é fechamento contábil.** É a listagem de sessões da conta, que
   é a fonte que eu alcanço — não o billing. Trate como **piso MEDIDO**, nunca
   como total.
2. **A atribuição por produto é por TÍTULO da sessão**, não por marcação formal.
   Sessões transversais (US$ 429) podem pertencer a produtos. A classificação é
   minha leitura, e é falível.
3. **Não sei o que aconteceu com o dinheiro das 11 sessões paradas.** Sei que
   foram pagas e que o assunto delas reaparece hoje; **não conferi item a item**
   se cada defeito continua vivo. Conferi um — e ele estava (o #376).
4. **Não medi o custo desta sessão.** Ela também custa, e não está no total acima.
