# O ajuste refez a peça ERRADA — medido por sha256, em produção

> 26/08/2026, commit em produção `6d447fc`. Cliente oculto **Cantina Oculta
> NOME TESTE**, projeto `cmt9l4eu0005e0xmngtcm4w3o`, aprovação
> `cmt9nvi09002b0xs8kb2cdgo7`. Nenhuma publicação, nenhum recurso real tocado.

---

## O que o cliente disse

Palavra por palavra, no comentário do pedido de ajuste pelo portal:

> "Nas **LEGENDAS PRONTAS**: tirem qualquer menção a anúncio ou impulsionamento,
> eu já disse que não quero anúncios agora. E o horário está errado numa
> legenda: a gente abre terça a domingo das 18h às 23h, não almoço.
> **A pauta do mês está boa, não mexam nela.**"

Duas instruções, e as duas explícitas: **mexa nesta**, **não mexa naquela**.

## O que a casa fez

Baseline por `sha256` do conteúdo de cada entrega, ANTES do ajuste, e a mesma
medição depois:

| entrega | antes | depois | veredito |
|---|---|---|---|
| Posicionamento | v1 · 123 B · `c4785944b00a593e` | igual | intacta |
| Concorrência | v1 · 2.302 B · `8a3654b0601d15a1` | igual | intacta |
| **Pauta do Mês** | v1 · 1.954 B · `fe9ceede9ab31aec` | **v2 · 3.966 B · `c9d28b2ddd331ca8`** | 🔴 **REFEITA** |
| **Legendas Prontas** | v1 · 3.225 B · `873510ae3587cc8b` | **igual** | 🔴 **INTACTA** |
| Plano de Medição | v1 · 1.571 B · `c15a67d0c6e90819` | igual | intacta |
| Otimização do próximo ciclo | v1 · 3.133 B · `caa21c87c1bb3073` | igual | intacta |

**A única peça refeita foi a única que ele mandou não tocar.** A peça que ele
apontou pelo nome, com dois defeitos concretos, não mudou um byte.

## Por que isto é pior do que "o ajuste não alcança a arte"

A 6ª volta registrou que o ajuste **não alcançava** a peça
(`docs/medicoes/o-ajuste-nao-alcanca-a-arte-26-08.md`). Aqui a mira não está
apenas ausente: ela está **invertida**. E a diferença importa para o cliente:

* ajuste que não alcança nada → o cliente repete o pedido e percebe;
* ajuste que alcança **outra** peça → a casa entrega uma versão nova de algo que
  estava aprovado, cobra o ciclo, e o defeito apontado continua lá. O cliente vê
  movimento e conclui que foi atendido.

E há uma agravante de escopo neste caso: parte do que ele pediu era **tirar
menção a anúncio** — o mesmo cliente que registrou `wantsPaidTraffic: false` e
para quem o plano tinha aberto uma tarefa de Paid Strategy. A instrução de
escopo dele foi ignorada pela segunda vez, agora dentro do ajuste.

## Estado dos portões — o que NÃO falhou

Registrado para a acusação ficar exata:

* `revision_requested` foi gravado corretamente (200);
* a refação rodou, produziu versão nova e a Qualidade auditou (`quality_ok`);
* a trava **"decisão não se decide duas vezes"** funcionou: depois de
  `approve`, tanto `reject` quanto `cancel` responderam **409 — "Approval
  already decided (approved)"**. É o conserto da 6ª volta de pé.

O defeito é de **mira**, e só dela.

---

## Dois achados menores da mesma passagem

### 1. A esteira REGRIDE depois da aprovação

Logo após o cliente aprovar o pacote, `/api/portal/esteira` voltou a dizer:

> "**Ainda estamos produzindo** — Estas entregas ainda não têm material para
> você ver." · progresso **63%**

O pacote tinha acabado de ser apresentado (progresso 75%, "Na mão do cliente") e
aprovado por ele. A tela do cliente andou para trás.

### 2. A casa não tem perna para "pacote PRONTO e não apresentado"

Medido antes de eu apresentar à mão: o projeto ficou com
`executionStatus: pending`, `presentedAt: null`, direção aprovada, pagamento
registrado, **as 6 entregas `quality_ok`** e todos os pedidos de material
resolvidos. O relógio bateu, pegou o projeto (ele estava `pending`), o motor
rodou — e **nada aconteceu, sem um evento sequer**.

A única consulta da casa que procura projeto não apresentado é
`pacotesTravados()`, e ela exige uma entrega **travada**. Pacote sem nada
travado e não apresentado não está em lista nenhuma: invisível, silencioso, e
o cliente esperando.

Foi por isso que a apresentação precisou de empurrão pela rota de operador
(`POST /api/projects/[id]/esteira {marco:"apresentar"}`, **sem**
`mesmoComRessalva` — todos os portões verdes). É empurrão da AGÊNCIA por
defeito da casa, não bloqueio do CEO.

### 3. A escada de exposição reteve 4 de 6

`escada_reteve_entrega`: "4 entrega(s) NÃO foram compartilhadas com o cliente
pela escada de exposição". O cliente viu 2 das 6. Isso é a escada
(SHADOW/ALLOWLIST/WIDE) funcionando como desenhada — fica registrado para não
ser lido como perda.

---

## O que isto exige da próxima rodada

A mira do ajuste (`pecasApontadasPeloAjuste` / `refazer-a-arte-do-ajuste`)
precisa de uma régua que responda, com o comentário real do cliente na mão:
**qual peça ele apontou, e qual ele proibiu de tocar**. Enquanto a mira não for
provada sobre texto de cliente de verdade, "o ajuste funciona" é afirmação sem
lastro — e esta volta mostra que ela pode estar exatamente invertida.
