# A TABELA DO NEGOCIADOR — custo · preço · piso · margem

> **Para quem vende.** Uma folha só, e é esta. A fonte em código é
> `lib/agency/financeiro/tabela-de-precos.ts` — se um número aqui e um número lá
> discordarem, **o código é que vale**, e este documento é que está velho.
>
> Fechada em 27/08/2026. Régua do CEO: *"preço de custo, preço final, margem de
> desconto — até onde eu posso dar de desconto, pro SDR negociador ter na manga.
> Isso tem que estar claríssimo pro negociador."* E, junto:
> **"Margem mínima nesse início: dez por cento de lucro."**

---

## 1. A TABELA

| Serviço | Produtor | Peças/mês | Custo | Preço final | **Piso de desconto** | Margem no piso |
|---|---|---|---|---|---|---|
| Plano **Ritmo** | máquina | 12 | **NÃO MEDIDO** | R$ 290,00 | **R$ 290,00** | não calculável |
| Plano **Presença** | humano | 20 | **NÃO MEDIDO** | R$ 490,00 | **R$ 490,00** | não calculável |
| Plano **Conteúdo** | humano | 36 | **NÃO MEDIDO** | R$ 790,00 | **R$ 790,00** | não calculável |
| Post (balcão) | máquina | 1 | **NÃO MEDIDO** | R$ 79,00 | **R$ 79,00** | não calculável |
| Carrossel (balcão) | máquina | 1 | **NÃO MEDIDO** | R$ 129,00 | **R$ 129,00** | não calculável |
| Post avulso | máquina + direção | 1 | **NÃO MEDIDO** | R$ 190,00 | **R$ 190,00** | não calculável |
| Carrossel avulso | máquina + direção | 1 | **NÃO MEDIDO** | R$ 290,00 | **R$ 290,00** | não calculável |

**Vídeo, reel e stories NÃO estão na tabela** — não há quem produza. *Vitrine é
promessa; promessa sem produtor é dívida.* Volume acima de **36 peças/mês** não
se vende: é a capacidade provada da casa.

### O piso é o preço de tabela hoje. Desconto: ZERO.

E isso não é timidez — é a conta que o CEO pediu, feita direito:

> Margem no piso = preço no piso − custo. Com o custo **não medido**, a margem no
> piso é **desconhecida** — e *não se pode provar que uma margem desconhecida não
> é negativa*. A ordem foi "dez por cento de lucro no mínimo". O que não se prova,
> não vale. Logo o piso não desce.

*Margem calculada sobre custo incompleto é pior que margem nenhuma: ela dá
confiança falsa ao negociador para descer o preço até um lugar que parece lucro
e é prejuízo.*

### O que fazer quando o cliente diz "está caro"

**Muda-se de degrau, não de preço.** Oferecer o degrau de baixo é venda — ele
existe, tem preço, entrega menos. Baixar o preço do mesmo degrau é sangria.

Conteúdo caro → Presença. Presença caro → Ritmo. Ritmo caro → é o degrau mais
barato: **escale ao gerente do projeto** com o que o cliente disse. Quem abre
exceção é gente, não a esteira.

### E o SDR **não consegue** furar isso

Não é uma recomendação num prompt. `podeOfertar()` devolve `pode: false` no
servidor, e a recusa vem com o caminho de saída junto. *Prompt é aviso; código é
trava.*

---

## 2. O QUE É MEDIDO E O QUE É **NÃO MEDIDO**

| Parcela do custo | Estado | Dono / próxima ação |
|---|---|---|
| **IA (imagem + texto)** | ✅ **MEDIDO** — `AIRunLog`, ~US$ 0,17/peça; 3,8–4,2% da receita nos três planos | Financeiro (a casa mede sozinha) |
| Taxa do gateway (Mercado Pago) | ❌ **NÃO MEDIDO** — nenhum pagamento real passou pelo gateway ainda; o caminho da medição foi construído neste PR (`fee_details` do provedor) | **CEO — definir `MERCADOPAGO_WEBHOOK_SECRET` no Railway.** Sem ele o webhook recusa tudo com 401 e nenhum pagamento chega a ser registrado. |
| Infraestrutura (Railway, banco, volume) | ❌ **NÃO MEDIDO** — a fatura existe, o rateio por cliente não existe em código nenhum | CEO — informar a fatura mensal; o rateio a casa deriva |
| Domínio e e-mail (Resend) | ❌ **NÃO MEDIDO** | CEO — informar o custo mensal |
| Hora humana | ❌ **NÃO MEDIDO** — não há apontamento de horas. É o custo REAL do Presença e do Conteúdo | CEO — decidir se haverá apontamento, ou um custo/hora de referência |
| Impostos | ❌ **NÃO MEDIDO** — regime tributário não declarado à casa | CEO — informar o regime e a alíquota efetiva |

⚠️ **Há um buraco dentro do único número medido.** Na janela de 30 dias medida em
27/08, **485 de 1.747 chamadas de IA não têm preço gravado** e 543 não têm token.
28% das chamadas do mês entram na conta **como zero**. O custo de IA é medido
**por baixo** — o que significa que a margem real é *menor* que a calculada, nunca
maior.

### O dia em que o custo fechar

O piso desce sozinho, e com trava dupla: (1) até a faixa que o CEO autorizar, e
(2) **nunca abaixo de 10% de lucro**, ainda que a faixa autorizada mande mais
fundo. É `MARGEM_MINIMA_PCT` no código, e a leitura escolhida está escrita lá:
**10% do PREÇO** (custo ÷ 0,90), não 10% em cima do custo — que daria 9,1% e
passaria por baixo da ordem do CEO sem ninguém ver a diferença.

---

## 3. TODA CONCESSÃO FICA REGISTRADA

Não há caminho para um desconto de boca. Quando houver faixa autorizada, ela
mora em `descontoAutorizadoPct` **do serviço**, com quem autorizou e qual foi o
pedido — no mesmo lugar em que o preço vive, e revisável em um `git log`.
