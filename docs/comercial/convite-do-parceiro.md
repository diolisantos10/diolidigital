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

## A ordem dos atos (a segunda não funciona sem a primeira)

### 1. Conceder a isenção — **a autorização**

```
POST /api/admin/isencoes-de-parceria     (sessão de agência)
{ "clientRequestId": "...", "autorizadaPor": "Dioli Santos (CEO), D-0B9",
  "validaAte": "2026-11-27T00:00:00.000Z", "escopo": "...",
  "pecasContratadas": 12, "tetoDeIaCentavosUsd": 200 }
```

O convite **não é** a autorização — ele só **aponta** para a isenção. Sem isenção
viva, a cunhagem é **recusada** (`sem_isencao_viva`): credencial que espera
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
  validade da isenção (`passa_da_isencao`). Parceria eterna pela porta dos fundos
  continua sendo parceria eterna.

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
| **A isenção venceu** | **Morre na hora** — a isenção é conferida **viva a cada uso**, não só na cunhagem. |
| **A isenção foi revogada** | **Morre na hora**, sem precisar caçar link nenhum. |
| Banco fora do ar | Vale como convite nenhum — *"não sei" significa **continua perguntando***. |

---

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
