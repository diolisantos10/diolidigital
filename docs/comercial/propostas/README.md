# Propostas prontas para o CEO enviar

> **Estado: TODAS PRONTAS E PARADAS. Nada foi enviado a ninguém.**
> Nenhuma mensagem, e-mail, DM, WhatsApp ou chamada a API de plataforma saiu da
> sessão que escreveu estes arquivos. Nenhum `ClientNotice` foi criado, o
> despertador não foi acionado e nada foi marcado como "a enviar".
> **Quem aborda é o CEO.**

Escrito em **08/08/2026**. As três pessoas entraram pelo briefing público da
Dioli Digital e nunca foram respondidas. A causa — o briefing não pedia contato —
já foi consertada em `ce6ea9b`; **os três continuam parados.**

---

## A fila

| Lead | Parado há | Canal para falar | O que falta para enviar |
|---|---|---|---|
| **[Sushi Cazza](2026-08-08-sushi-cazza.md)** | **51 dias** (desde 18/06) | 🟡 `@sushicazzaoficial` — **pista**, não contato confirmado | CEO confirma que o perfil é o certo e a DM está aberta · escolhe entre Opção A (R$ 1.150/mês) e Opção B (R$ 1.390/mês) |
| **[Camila Pereira](2026-08-08-camila-pereira.md)** (Beauty Clinic) | **29 dias** (desde 10/07) | 🔴 **NENHUM** — sem telefone, e-mail ou pista | CEO **fornece o contato** · CEO decide **qual das duas fichas duplicadas é a boa** |
| **[Beatriz Gimenes](2026-08-08-beatriz-gimenes.md)** (lash designer) | **28 dias** (desde 11/07) | 🔴 **NENHUM** — sem telefone, e-mail ou pista | CEO **fornece o contato** · CEO decide **o que a proposta promete sobre tráfego pago** |

---

## As decisões que só o CEO toma

Em ordem de peso. As três primeiras são bloqueadoras — sem elas a proposta
correspondente não sai.

1. 🔴 **O que a Dioli promete à Beatriz sobre tráfego pago.**
   A auditoria `docs/raio-x-trafego-pago.md` mede a frente em **30%**: a casa
   planeja tráfego, **não coloca anúncio no ar**. Criar criativo (15%), subir
   campanha (0%), rotina semanal (0%) e ler resultado de campanha (0%) estão
   vermelhos, e a conta de anúncios da agência está **restrita desde 03/08**.
   Isso conflita com duas linhas do plano **Crescimento** na tabela aprovada.
   Três saídas estão descritas no §3 da proposta dela. **É promessa ao cliente —
   decisão de dono do negócio, não de execução.**

2. 🔴 **O contato da Camila e o da Beatriz.**
   Não existe canal registrado para nenhuma das duas, nem pista. A casa **não
   deduz contato** — contato inventado desliga o alarme sem dar para onde ligar.
   Se o CEO as conhece de outro lugar, o caminho vem dele.

3. 🔴 **Qual das duas fichas de "Camila Pereira" é a boa** — `cmqyb0bpo…` ou
   `cmrt7aecz…`. Ninguém fundiu, porque afirmar que duas fichas são o mesmo
   negócio é afirmação de negócio, e a ficha escolhida define para onde vai o
   histórico.

4. 🟡 **O degrau do Sushi Cazza:** Presença + 2 excedentes (**R$ 1.150/mês**, 12
   peças — exatamente o que ele pediu) ou Conteúdo (**R$ 1.390/mês**, 14 peças).
   As duas cabem no "algo em torno de 1500 por mês" que ele escreveu.

5. 🟡 **Confirmar `@sushicazzaoficial`** antes de mandar DM: que o perfil é o
   restaurante certo e que a DM está aberta.

---

## Duas coisas que qualquer um que pegar isto precisa saber

**1. O "rodízio R$ 99" do Sushi Cazza NÃO está no briefing dele.**
`docs/ENTREGA-DE-BASTAO.md:247` descreve o briefing como *"rodízio R$ 99, paleta,
público"*, mas esse número só aparece em **scripts de ensaio interno**
(`scripts/prod-pilot-full.ts`, `scripts/p0-clean-slate-rehearsal.ts`,
`scripts/pilot-sushi-cazza.ts`) — texto escrito pela casa para testar a esteira,
não pelo cliente. O briefing dele diz **ticket médio R$ 180** e paleta **preto,
vermelho e dourado**; os scripts dizem **branco**. **Não repita o R$ 99 numa
proposta.**

**2. Só o Sushi Cazza tem briefing recuperável daqui.**
A conversa dele está reproduzida em `__tests__/comercial/dossie-do-lead.test.ts`
e `__tests__/comercial/contato-do-lead.test.ts`. Da Camila e da Beatriz **só
existem duas linhas de resumo** escritas pela casa, em `docs/pendencias.md` e
`docs/ENTREGA-DE-BASTAO.md` — não achei o texto que elas digitaram. O registro
vivo está em `ClientRequestDb`, **no banco de produção, fora do alcance desta
sessão**. Antes da versão final das duas, vale abrir **`/agency/leads`** no admin
e ler o dossiê direto do banco: as propostas delas melhoram muito com isso.

---

## Como estas propostas foram escritas

- **Preço só da tabela.** `docs/precos.md` — **"v1, 05/08/2026"**, lido em
  08/08/2026 com o repositório em `a35849e`, documento **intacto**
  (`md5 13239933dc2023889ea55ea8afcca6e8`).
  ⚠️ **A tabela executável mudou no meio desta sessão, e os números foram
  reconferidos às 18h16.** `lib/agency/planos.ts` passou de `de468204…` para
  `f3ce9548…` por obra de outro agente — **sem tocar em preço**: as cinco
  mensalidades (49 · 297 · 790 · 1.390 · 2.590), as cinco implantações e a peça
  excedente de R$ 180 continuam idênticas; a mudança só acrescentou campos de
  volume (`pecasPorMes` e afins). Volumes reconferidos contra a versão nova:
  Ritmo 8 · Presença 10 · Conteúdo 14 · Crescimento 18.
  **A tabela segue viva sob outro agente — conferir de novo antes de enviar.**
  Onde o serviço pedido não tem preço na tabela, está escrito **"a definir"**,
  nunca estimado.
- **Nada afirmado sobre o negócio da pessoa que não esteja no registro dela.**
  Ausência de informação não é informação — o que não se sabe aparece como não
  sabido.
- **Nenhuma promessa de resultado**, nenhum depoimento, caso de sucesso, número
  de seguidores ou resultado de cliente. Nada disso existe e nada disso foi
  inventado.
- **Sem jargão de robô.** O espírito da lista negra da casa
  (`lib/agency/design/trava-de-texto.ts`, `CLASSES_PROIBIDAS_NA_ARTE`) foi
  respeitado: sem superlativo não sustentável, sem promessa comercial vazia, sem
  "solução inovadora".
- **Somente leitura fora de `docs/comercial/propostas/`.** Nenhum arquivo em
  `lib/`, `app/`, `prisma/` ou `__tests__/` foi tocado.
