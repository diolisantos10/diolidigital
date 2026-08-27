# Como conceder uma isenção de parceria

> **Instrução gêmea da proibição.** A concessão **não é rota HTTP** — é decisão
> declarada (libera produção de graça; uma porta dessas na internet custa o
> crédito da casa, que é finito e sem recarga automática). *Toda proibição
> precisa da instrução gêmea*: se não se pode clicar, tem que estar escrito como
> se faz.

## Quem faz

**Um humano com acesso ao ambiente de produção.** Não há automação, e é de
propósito: a concessão é ato **nominal, raro e revisável**.

## O que você precisa ter em mãos, antes de começar

| campo | por que é obrigatório |
|---|---|
| **id do pedido** (`clientRequestId`) | é o que se isenta. Um pedido, uma isenção. |
| **quem autorizou** (`autorizadaPor`) | *isenção sem dono é buraco* — em seis meses ninguém sabe quem liberou, e "sempre foi assim" vira a resposta. **Cite a fonte da autorização** (ex.: `Dioli Santos (CEO) — D-0B9`). |
| **validade** (`validaAte`) | *parceria eterna vira esquecimento* — a casa segue produzindo de graça anos depois de a contrapartida ter acabado. Vencida, o pedido volta a travar no portão, com o motivo `parceria_vencida`. |
| **escopo** | isenção sem escopo cobre tudo, para sempre. |
| **peças contratadas** | **zero é ZERO**, nunca "sem limite". |
| **teto de custo de IA**, em centavos de dólar | sem teto, o parceiro come o crédito do cliente pagante. |

**Nenhum campo tem valor padrão.** Padrão em campo de isenção é a forma
silenciosa de escancarar a porta: quem esquece o teto receberia um teto em vez
de um erro, e a casa descobriria no extrato.

## Passo a passo

**1. Ache o id do pedido.** É o `ClientRequestDb.id` do pedido do parceiro
(um `cuid`). Ele aparece no painel da agência, na ficha do pedido, e nos alarmes
do despertador.

**2. Rode o script**, no ambiente que enxerga o banco de produção:

```
npx tsx scripts/conceder-isencao-de-parceria.mts \
  --pedido <clientRequestId> \
  --autorizada-por "Dioli Santos (CEO) — D-0B9" \
  --valida-ate 2026-11-27 \
  --escopo "Social Media — parceria de lançamento, cliente 001" \
  --pecas 12 \
  --teto-ia-centavos-usd 200
```

**3. Leia a resposta.** Ou sai `Isenção <id> concedida — vale até <data>`, ou
sai `RECUSADO (<motivo>)` e **nada foi escrito**. A conferência inteira roda
antes da escrita: recusar depois de escrever seria liberar.

`--cliente` é opcional e **normalmente não precisa**: o `clientId` é derivado do
próprio pedido. Ele importa porque o DRE agrupa por cliente — isenção sem
cliente fica invisível no relatório que deveria mostrar a margem negativa dela.

## O que acontece depois

- o portão de pagamento passa a devolver **`parceria_isenta`** para aquele
  pedido — **não** `pagamento_confirmado`. Nome diferente de propósito, para que
  nenhum relatório some isto como venda;
- **não existe linha em `PagamentoConfirmado`.** Registrar um pagamento de
  R$ 0,00 inventaria receita fantasma e destruiria a única testemunha de quem
  pagou de verdade;
- no **financeiro** (`/agency/financeiro`), a linha do parceiro passa a mostrar
  **R$ 0,00 com o selo `parceria · até <data>`**, o **custo contado
  normalmente** ao lado e a **margem negativa à vista**. É a ordem do CEO
  (D-0B9): *"tudo tem que ser medido, inclusive as parcerias"*. Antes disso a
  receita saía como "nada lançado", indistinguível de calote ou descuido.

## As recusas, e o que cada uma quer dizer

| recusa | o que fazer |
|---|---|
| `sem_dono` · `sem_escopo` · `sem_pedido` | preencher o campo. Não há padrão. |
| `validade_ilegivel` | a data não foi entendida — **e data ilegível NÃO vira "vale para sempre"**. Use `AAAA-MM-DD`. |
| `validade_no_passado` | a isenção nasceria vencida. |
| `teto_invalido` · `pecas_invalidas` | inteiro ≥ 0. `NaN` e fração são recusa, **não zero**. |
| `pedido_inexistente` | id errado. Isenção órfã é produção de graça sem cliente a que responder. |
| `leitura_indisponivel` | o banco não respondeu. **Leitura que falha é recusa, nunca liberação.** |
| `ja_existe` | o pedido já tem isenção. **Renovar é outro ato**, não uma segunda linha. |

## Para renovar

Não há caminho de renovação hoje — `clientRequestId` é `@unique` e a segunda
concessão é recusada com nome próprio. **Isso é dívida declarada, não
esquecimento**: renovar é decidir de novo, e a decisão precisa de dono. Quem
construir a renovação deve mantê-la nominal e datada, como esta.

## Fonte da autorização

**D-0B9** — ordem direta do CEO:

> *"Vou acabar de mandar o primeiro projeto pra agência. O projeto é do Foocci,
> quem está nos apresentando é um agente de IA que vai ser a ponte. Ele está
> todo briefado, e vamos começar o teste agora. (…) **É parceria: não paga
> nada.**"*

> *"**Todo gasto tem que ser salvo, medido e contabilizado. Independente se é
> parceria ou não, porque alguém vai pagar por esse investimento. Tudo tem que
> ser medido, inclusive as parcerias.**"*
