# O cliente respondeu, e o piso de verdade continuou dizendo que ele nunca informou

> Achado do cliente oculto em PRODUÇÃO, 26/08/2026. **Consertado.**

## A cadeia inteira, medida

Pedido `cmt9exi95001f0xo74bhonn77` · projeto `cmt9f1f7w001y0xo781zi2jt4`
(CANTINA DO PORTO TESTE, contato `.invalid`).

1. **A porta da frente não perguntou o horário.** O SDR atendeu os 5 turnos
   (HTTP 200 em todos), mas insistiu **três vezes** na faixa de investimento e
   nunca chegou à pergunta `operacao_basica` — que é a que traz "horário e dias
   que vocês funcionam". Pior: ele preencheu o campo `operacao` com a frase de
   **objetivo** do cliente ("Mogi das Cruzes, terça a quinta (dias com menos
   movimento)"), e com o campo preenchido a pergunta passou por respondida.
2. **O briefing chegou à produção sem horário.**
3. **O especialista de Estratégia escreveu sobre horário.**
4. **O piso de verdade reprovou** — e com a frase exata:
   `piso_de_verdade_barrou · "Horário de funcionamento. O cliente nunca informou
   isso. Afirmar sobre o que ele não contou é invenção."` ✅ Portão certo.
5. **O árbitro da Qualidade pegou a mesma raiz** noutra peça:
   `qualidade_reprovou · Analytics — "Falta de confirmação de horários"`. ✅
6. **O projeto do cliente PAGANTE ficou `blocked`**, com **zero peças**, e foi
   escalado duas vezes (`pacote_travado_escalado · "Precisa de decisão"`). ✅
   Nada capenga foi entregue.

Até aqui, a casa está certa em cada portão. O buraco é o passo 7:

7. **O cliente RESPONDEU o horário** — na conversa do portal, que é o único
   canal que ele tem: *"abrimos de terça a domingo, das 18h às 23h30"*
   (`PortalMessage cmt9fmecn00420xo74elvpdwp`, HTTP 201). **E nada consumiu essa
   fala.** O piso continuou dizendo que ele nunca informou.

## A causa, com caminho e linha

`lib/dioli-brain/client-snapshot.ts` → `palavrasDoCliente()` montava a verdade
do cliente a partir de `rawContext`, `briefingJson`, `sdrHandoffJson`, três
campos do BrandBrain e o site. **`PortalMessage` não estava na lista.**

Esta casa já tinha escrito metade da lição: *"coluna gravada não é cliente
informado"*. Esta é a outra metade: **cliente informado não é coluna lida.**

## O conserto

`falasDoClienteNoPortal(clientRequestId)` entra em `palavrasDoCliente`, nos dois
caminhos (`buildClientSnapshot` e `buildVerdadeDoCliente`).

**A trava, e ela é o ponto:** a consulta filtra `authorRole: "client"`. As
mensagens da EQUIPE moram na mesma tabela — incluí-las faria a agência atestar
as próprias invenções (bastaria um agente escrever "vocês abrem às 9h" para o
piso passar a aceitar aquele horário como fato do cliente). Seria a porta dos
fundos perfeita para o portão que esta função alimenta. Há teste que afirma o
filtro e a âncora no pedido.

Leitura fail-closed: conversa ilegível vira ausência de fala, e ausência de fala
mantém o piso reprovando — o comportamento de antes.

## O que continua aberto (não é desta correção)

O SDR ainda pode marcar `operacao` como respondida com um texto que não
responde. Enquanto isso valer, o horário só chega se o cliente o escrever por
conta própria depois. **Dono: quem mantém `question-engine.ts` /
`prospect-engine.ts`.**
