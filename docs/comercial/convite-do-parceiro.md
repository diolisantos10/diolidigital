# O convite do parceiro — como se cunha e como se entrega

> **Para que serve:** fazer a casa **saber** que uma conversa da sala de briefing
> é a de um parceiro — e só então **parar de perguntar a verba** a quem não paga.
>
> **Escrito junto com o mecanismo, de propósito.** Esta casa teve seis "travas
> sem fechadura" em 24 horas: mecanismos prontos, testados, e sem nenhuma porta
> que os acionasse. A própria `IsencaoDeParceria` foi uma — nasceu com quem a lê
> e quem a apaga, e nada que a criasse. O resultado literal foi *"não concedi
> porque não alcanço o banco"*. Mecanismo que só existe em documento **parece
> resolvido**, e é pior que mecanismo nenhum.

---

## O problema, em uma frase

O parceiro não paga. A pergunta obrigatória da verba existe para a casa **não
mandar preço errado** — e para quem não vai receber preço nenhum ela não protege
ninguém: só **trava o pedido**. Foi onde a conversa das 13:43 de 27/08/2026
parou, e por isso nenhum orçamento chegou.

Mas dispensar a pergunta exige **saber** que é parceria. Na sala de briefing o
visitante é **anônimo** (só `sessionId`), e as duas fontes tentadoras estão as
duas erradas:

| Fonte tentadora | Por que não |
|---|---|
| `clientRequestId` do corpo | É *"um id que qualquer pessoa digita"* — a própria casa já o trata como não-confiável. |
| O modelo perceber pela conversa | Quem digitasse *"somos parceiros de vocês"* deixaria de ser perguntado sobre verba. Seria abrir a maior porta da casa com a chave mais fraca que ela tem. |

**A verdade vem de um token que a casa cunhou.** É o molde de `PortalAccess` e a
regra de 03/08: *em caminho público, o `clientId` sai **sempre** do token —
derivação, nunca comparação.*

---

## ⚠️ O nó circular que existia — e por que a ordem mudou (27/08/2026)

A primeira versão fazia o convite apontar para a `IsencaoDeParceria`. Só que a
isenção é **por pedido** (*"isenção sem pedido não isenta nada"*), o pedido nasce
do briefing, e o briefing do parceiro só corre liso **com o convite**:

```
convite → isenção → pedido → briefing → (convite)
```

**A porta existia e não podia ser aberta a primeira vez.** Era a sétima "trava
sem fechadura" da casa, agora em círculo.

*(Precisão: o **pedido** nunca ficou trancado — `budget_range` fecha com qualquer
resposta. O parceiro conseguia terminar o briefing respondendo justamente a
pergunta que a parceria deveria poupar. O que estava trancado era o **convite**.)*

**O conserto:** a autorização passou a viver no nível do **parceiro**
(`ParceriaDoCliente`), existindo **antes de qualquer pedido**. É dela que o
convite nasce — e a isenção de cada pedido virou **consequência** dela.

> *Verdade escrita em dois lugares já está errada em um deles.*

---

## A ordem dos atos (a segunda não funciona sem a primeira)

### 1. Autorizar a parceria — **a autorização**, no nível do parceiro

```
POST /api/agency/parcerias               (sessão de agência)
{ "clientId": "cli_...", "autorizadaPor": "Dioli Santos (CEO), D-0B9",
  "validaAte": "2026-11-27T00:00:00.000Z",
  "escopo": "Social Media — parceria de lançamento",
  "pecasContratadas": 12, "tetoDeIaCentavosUsd": 200 }
```

**Não precisa de pedido.** É este ato que rompe o círculo.

- `autorizadaPor` é **nominal** (a fonte: o CEO, citando D-0B9); `registradaPor`
  sai da **sessão**.
- **Teto e validade são obrigatórios.** Teto ausente é **erro**, nunca zero —
  sem teto o parceiro come o crédito do cliente pagante.
- ⛔ **Não é pagamento.** Nenhuma linha em `PagamentoConfirmado`. Receita R$ 0,
  custo contado normalmente, margem negativa à vista.

O convite **não é** a autorização — ele só **aponta** para ela. Sem parceria
viva, a cunhagem é **recusada** (`sem_parceria_viva`): credencial que espera
autorização é credencial **sem** autorização.

### 2. Cunhar o convite — **a chave**

```
POST /api/agency/convites-de-parceria    (sessão de agência, CSRF)
{ "clientId": "cli_...", "expiraEm": "2026-09-10T00:00:00.000Z" }
```

Resposta (**o token aparece UMA vez — não há rota que o releia**):

```json
{ "ok": true, "token": "…43+ chars…",
  "link": "https://www.diolidigital.com.br/briefing?convite=…",
  "expiraEm": "2026-09-10T00:00:00.000Z" }
```

- `criadoPor` sai da **sessão**, nunca do corpo — quem cunhou fica na linha.
- `expiraEm` é **prazo próprio** (padrão: 14 dias) e **nunca** pode passar da
  validade da parceria (`passa_da_parceria`). Parceria eterna pela porta dos
  fundos continua sendo parceria eterna.

### 3. Entregar o **link** ao parceiro

É o link — não o token solto — que se manda. Quem abre a sala **sem** ele
continua sendo perguntado a verba, **e isso é o comportamento correto**.

### 4. Revogar, se o link vazar

```
DELETE /api/agency/convites-de-parceria?token=…
```

---

## O que mata um convite (qualquer um destes, sozinho)

| Evento | Efeito |
|---|---|
| Passou de `expiraEm` | Morre. |
| `DELETE` (revogação) | Morre na hora. |
| **A parceria venceu** | **Morre na hora** — a parceria é conferida **viva a cada uso**, não só na cunhagem. |
| **A parceria foi revogada** (`DELETE /api/agency/parcerias?clientId=…`) | **Morre na hora**, sem precisar caçar link nenhum. |
| Banco fora do ar | Vale como convite nenhum — *"não sei" significa **continua perguntando***. |

---

## A isenção de cada pedido é **derivada** — ninguém a concede à mão

Quando um pedido do parceiro chega ao portão de pagamento, a casa lê a parceria
viva do cliente e **escreve a isenção daquele pedido** com **os mesmos termos**
da autorização (validade, escopo, peças, teto). Uma fonte, um valor.

- **Idempotente:** já havendo isenção, nada é reescrito — a do pedido é o fato
  **daquele momento**, e reescrevê-la mudaria a história de uma produção que já
  correu.
- **Sem parceria viva, nada é derivado:** o pedido segue pagante e o portão
  fecha normalmente.
- `POST /api/admin/isencoes-de-parceria` continua existindo para o caso avulso
  (isentar **um** pedido de quem **não** é parceiro recorrente).

## O que morre quando se revoga a parceria

| Morre | Continua |
|---|---|
| Os **convites** do parceiro (conferem a parceria a cada uso) | As isenções **já derivadas** de pedidos anteriores — são o registro do que valia naquele momento |
| A derivação de **novos** pedidos (voltam a travar no portão) | O histórico de custo e a margem já medidos |

## O que o convite **não** faz

- **Não concede parceria.** Autorizar continua sendo outro ato, com outra porta e
  outro dono.
- **Não afrouxa o resto.** O SDR continua proibido de cotar preço e de prometer o
  que não foi acordado. O levantamento continua **inteiro**: o que o parceiro
  quer **alcançar**, para quem vende, como opera, a marca. Sai **uma** pergunta —
  a do bolso de quem não tem bolso nesta relação.
- **Não vale para cliente pagante.** Sem convite válido, a verba continua
  obrigatória e o portão de envio continua fechado sem ela. É ela que escolhe o
  degrau.
