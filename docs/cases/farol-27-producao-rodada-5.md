# Farol 27 — rodada 5: a cadeia andou sozinha, e parou num nó que ela mesma deu

Rodada de 25/08/2026, 00:28–01:30 UTC. Produção em `ead2ef0`
(confirmado por `/api/health`). Continuação de
[`farol-27-producao-rodada-4.md`](./farol-27-producao-rodada-4.md).

Cliente **fictício** (`ana.farol.r5@cliente-falso.invalid`, nome com `[TESTE]`).
Nenhuma pessoa de verdade foi contatada, nada publicado, nenhuma verba gasta.

---

## 1. Em uma linha

**Zero empurrões manuais** — pela primeira vez a cadeia andou do primeiro "oi"
até a produção sem ninguém apertar nada. E **não terminou**: travou num nó que a
própria casa deu, porque a proposta prometeu ao cliente um volume que o contrato
de saída da casa proíbe.

| Marco | Onde |
|---|---|
| Ficha do cliente | `/agency/clients/cmt7y15av001k0xpenloum3q6` |
| Projeto | `cmt7y15iw001n0xpe5eoqs0xj` |
| Pedido | `cmt7xlpj800160xpegg4spfjg` |

---

## 2. Os três consertos, medidos

**`a-esteira-liga-sozinha` — funcionou, e funcionou inteiro.**
O projeto nasceu `idle`. A perna nova o pegou, conferiu o pagamento, **recusou**
com motivo nomeado (`sem_registro_de_pagamento`) e **avisou o cliente no portal**
— o silêncio que era metade do defeito acabou. Registrado o pagamento pela porta
legítima, a rodada seguinte do despertador o marcou `[idle, pago]` e passou a
esperar o aval de direção do cliente, dizendo isso no log. O aval existe no
contrato do portal (`direcao.pedeAprovacao: true`) — em 04/08 não existia. Os 5
pedidos de material saíram com `askedClientAt` preenchido **antes** de a esteira
cobrar resposta (em 04/08 era `null`), e `pendencias` agora lista os 5 em vez de
vir vazia contradizendo a tela ao lado.

**`arte-na-esteira` — a perna roda, e não produziu arte nenhuma.**
A colheita entra a cada rodada e **retém todas as peças**, com motivo escrito:
*"esta peça veio da esteira automática SEM pilar de conteúdo (`pillar`)"*. Como
nada vira `SocialPost`, o motor de imagem continua sendo chamado sobre tabela
vazia. **0 artes**, agora por um motivo nomeado em vez de silêncio.

**`ajuste-mira-a-peca` — não pôde ser medido nesta rodada.** Nenhuma peça chegou
ao cliente (o nó do item 3), então não houve card para pedir ajuste. Ver item 6.

---

## 3. O nó: a proposta promete o que o contrato proíbe

Ana pediu, e o escopo colheu certo: **4 posts/semana, 0 stories, 6 reels/mês**.

A proposta ofereceu outra coisa: *"Plano Starter — 5 posts + **7 stories**/semana
· 4 reels/mês"* mais *"Reels extras (2/mês)"* para remendar os 6 que ela pediu.

O especialista produziu segundo a **proposta** (7 stories). O contrato de saída
da casa confere segundo o **briefing** e recusa: *"7 peças de story — o contrato
pede no máximo 3."* Três tentativas, mesma recusa, `blocked`.

É um impasse por construção: enquanto a proposta inventar números que o contrato
proíbe, esse projeto nunca sai de `blocked`, e nenhuma mão resolve — só o
conserto de um dos dois lados.

---

## 4. A proposta, lida com olho de dona

- Contradiz o briefing que ela acabou de dar (5 posts/7 stories/4 reels contra
  4/0/6) e depois **cobra como "extra"** os reels que ela pediu como base.
- *"Verba de mídia: pago direto ao **Google/Meta**"* — ela pediu **Meta e
  TikTok**; Google nunca foi citado. O TikTok sumiu da proposta (defeito de 04/08
  que continua).
- Faixa **R$ 3.700–7.400**: o dobro de ponta a ponta, sem dizer o que muda.
- Sem prazo, sem data de início, sem prazo de contrato.
- **O Clube Farol 27 — a razão do projeto — não é mencionado.**
- *"não é a proposta final"* impresso logo acima do botão "aceitar".

## 5. O SDR: colhe bem, fala mal

O escopo final está **correto e completo** (clube a R$149, 6 mil contatos sem
consentimento, site sem tracking, material que existe e o que não existe). Mas:

- Ofereceu faixas de investimento de **até R$ 5.000** a um negócio de R$ 420
  mil/mês.
- Ana respondeu a faixa; o turno seguinte **pediu a mesma coisa de novo**
  ("desculpa, acho que não fui claro") com o dado já gravado no escopo.
- No turno seguinte o `budgetRange` **sumiu** do escopo e o SDR disse que ia
  *"seguir sem esse dado"* — depois voltou sozinho.
- Classificou como `serviceMode: "one_off"` um contrato de social + tráfego
  recorrente.

---

## 6. O árbitro independente caiu — e ninguém foi avisado

O defeito mais grave desta rodada, e ele é silencioso.

| | rodada 4 | rodada 5 |
|---|---|---|
| Julgamentos com árbitro independente | 14 de 16 | **0 de 10** |

As 8 chamadas ao juiz `openai/gpt-4o` falharam **todas** com `HTTP 429`, e
`fallbackUsed = false`. Os 10 julgamentos que restaram foram feitos por
`claude-haiku-4-5` — **o mesmo modelo que escreveu as peças**. O autor julgou a
própria obra em 100% dos casos, e nada na tela diz isso: as peças aparecem com
veredito normal. É régua verde sobre o componente errado, na forma mais cara —
a casa acredita ter árbitro independente e não tem.

---

## 7. Os números

- **Empurrões manuais: 0.** Toda transição foi automática ou ato do cliente.
- **10 entregas**, 6 departamentos, `blocked` na 3ª tentativa.
- **0 artes** (item 2).
- **Perplexity: sim** — 5 chamadas `perplexity/sonar` em Estratégia.
- **Custo do projeto: US$ 0,336** (46 chamadas, 9 falhas — as 9 são o juiz caído).
- A rede de recuperação funcionou sozinha: falhou, o cron re-tentou, 3 vezes.

## 8. Os quatro atos do cliente

| Ato | Tratou? |
|---|---|
| **Aprovar** | **Sim**, duas vezes: aceite da proposta (`projetoCriado: true`) e aval de direção (projeto foi para `running`). |
| **Pedir ajuste** | **Não pôde ser medido** — nenhuma peça chegou ao cliente. |
| **Recusar e refazer** | **Não pôde ser medido** — idem. |
| **Cancelar** | **Não pôde ser medido** — idem. |

Não é aprovação da mira nem reprovação: é **ausência de medida**, e ausência de
informação não é informação. A prova da mira segue devendo.

---

## 9. Nota: 71/100 (era 62)

Subiu porque o que travava a cadeia em 04/08 destravou de verdade — e sem mão.
Não subiu mais porque a cadeia ainda não entrega peça nenhuma ao cliente, e
porque o árbitro caiu sem avisar.

**O que falta para receber cliente pagante, em ordem de dano:**

1. **O árbitro independente não pode cair em silêncio.** Hoje o autor vira juiz
   de si mesmo e a tela não muda. Sem juiz independente, o julgamento não conta
   — falhar fechado é obrigatório.
2. **A proposta tem de nascer do briefing.** Enquanto ela inventar volume que o
   contrato proíbe, o projeto trava para sempre e ninguém consegue destravar.
3. **A peça precisa chegar ao cliente.** Sem isso, três dos quatro atos não
   existem na prática.
4. **A arte precisa sair**: falta o campo `pillar` na peça da esteira automática.
5. **Uma só verdade na tela**: a trilha diz "Direção: feito" enquanto o portal
   pede a aprovação da direção; diz "a criação está em andamento" com o projeto
   parado em `idle`.

---

## 10. O que não pôde ser feito, e por quê

- **Não foi possível apagar o cliente da rodada 4**: `DELETE /api/clients/{id}`
  foi barrado pelo ambiente do auditor. Por isso a rodada 5 nasceu ao lado da 4,
  e o cliente da 5 foi renomeado para desfazer a ambiguidade de nome.
- **Nenhuma tela foi vista**: a navegação de página do navegador não sai deste
  ambiente (`ERR_CONNECTION_RESET` até na home). Tudo aqui foi medido pelas
  rotas. **A camada visual do portal não foi verificada nesta rodada.**
- **`prova-da-mira.yml` não roda em produção**: o secret `SEED_MASTER_PASSWORD`
  está vazio, e `links-do-portal` responde `link_existente` sem devolver a URL.
- **Reabrir os cards da rodada 4** exigiria `CRON_SECRET`, que o auditor não tem.
