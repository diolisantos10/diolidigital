# Farol 27 — rodada 4: o primeiro cliente de verdade nasceu em produção

Rodada de 24/08/2026, 21:39–22:41 UTC. Produção em `3a2245c`
(confirmado por `/api/health`). Continuação de
[`farol-27-producao-rodada-3.md`](./farol-27-producao-rodada-3.md).

Cliente **fictício** (`ana.farol@cliente-falso.invalid`, nome com `[TESTE]`).
Nenhuma pessoa de verdade foi contatada, nada foi publicado, nenhuma verba de
mídia gasta.

---

## 1. O que aconteceu, em uma linha

**A cadeia andou do pedido até a entrega, e pela primeira vez existe um cliente
com projeto em `www.diolidigital.com.br`.** Ela não andou sozinha: parou três
vezes, e cada parada exigiu uma mão.

| Marco | URL em produção |
|---|---|
| Ficha do cliente | `/agency/clients/cmt7savi4001r0xpab37an3dr` |
| Projeto | `cmt7savmn001u0xpajd03nq73` |
| Portal do cliente | `/portal/access/eqN9zQPTqZMEKPBH1rpwaKmlRtSwQ3Vja7k3CUioftI` |

---

## 2. A porta de aceite funcionou

O link da proposta estava na conversa do pedido, como prometido. "Aceitar e
começar" devolveu `projetoCriado: true`, e o `Client` + `Project` + `BrandBrain`
nasceram no mesmo segundo, sem ninguém abrir o painel.

**A proposta, lida com olho de dona:** a faixa de R$ 3.100–6.100 é o dobro de
ponta a ponta e o texto não diz o que muda de uma ponta à outra; não há prazo,
data de início nem prazo de contrato; a verba declarada (R$ 8.000) não é
mencionada; o TikTok que a cliente pediu virou "Google/Meta"; o projeto de
lançamento de 8 semanas sumiu. E o texto diz *"não é a proposta final"* logo
acima de um botão escrito *"Aceitar e começar"*.

---

## 3. As três paradas

1. **Projeto nasce `idle` e nada o liga.** O cron de produção só recupera
   `running` travado e `failed`; `idle` não é candidato. Só o aceite de um card
   de *proposta* dispara produção — e o caminho automático não cria esse card.
2. **O botão "aprovar direção" não existe na tela.** O portal só o desenha
   quando a etapa contém a string `"confirme o caminho"`
   (`EsteiraDoCliente.tsx:226`). A etapa era "Precisamos de uma coisa sua",
   então o botão sumiu — enquanto a conversa dizia *"é só aprovar"*.
   A rota pública `POST /api/portal/esteira {decisao:"aprovar_direcao"}` aceita
   e liga o motor: falta a porta na parede, não a fechadura.
3. **Cinco pedidos de material que nunca foram pedidos.** `askedClientAt: null`
   nos cinco, `pendencias: []` na visão do cliente, e mesmo assim a esteira
   dizia "responda os 5 pedidos que te mandamos". Um deles pede *"capturas de
   tela do seu app/painel"* — a uma padaria.

---

## 4. O que a máquina produziu, medido

- **7 departamentos** existem em `DEPARTAMENTOS` (não 12): Branding,
  Estratégia, Social Media, Design, Tráfego Pago, Analytics, Financeiro.
  **Rodaram 6**; o Financeiro não produziu nada.
- **14 entregas**, de 14 especialistas distintos. **6 chegaram ao portal**
  (as outras são internas, por desenho).
- **0 artes.** A esteira nunca chama o motor de imagem: `/api/generate-image`
  só tem um chamador, a tela `/agency/design-agent`, na mão. As peças de Design
  descrevem a arte em texto. A porta foi exercida uma vez nesta rodada e
  **funcionou** (gpt-image-1, HTTP 200) — mas ela **não escreve no livro-caixa
  de IA**, então gasto de imagem é invisível no relatório de custo.
- **Concorrência pela Perplexity: sim.** 3 chamadas `perplexity/sonar` no
  departamento de Estratégia, neste projeto.
- **Árbitro independente: 14 de 16 julgamentos.** Autor `claude-haiku-4-5`,
  juiz `openai/gpt-4o` em 14; nos outros 2 o juiz foi o mesmo modelo do autor.
- **Custo: US$ 0,53** em 47 chamadas, zero falhas.
- **A Qualidade barrou 5 de 14** (4 `quality_flag`, 1 `quality_nao_auditado`) e
  `apresentar` recusou o pacote inteiro — corretamente. Só passou com o escape
  declarado `mesmoComRessalva`, que é decisão registrada de gente.
- A produção travou em `blocked` depois de 3 tentativas, sempre no mesmo ponto:
  Social Media · Copy dos posts, reprovada pelo piso de verdade e pelo contrato
  de saída. O cron de recuperação re-tentou sozinho — essa rede funcionou.

---

## 5. Os quatro atos do cliente

| Ato | A máquina tratou? |
|---|---|
| **Aprovar** | Sim. 0,7 s, status `approved`. (Uma tentativa anterior devolveu **502** — intermitente.) |
| **Pedir ajuste** | **Não.** Ver abaixo. |
| **Recusar e refazer** | Mecanicamente sim, no alvo errado — o mesmo defeito. |
| **Cancelar** | Sim. `cancelled`, versão v3 preservada, nada apagado. |

### O defeito caro: o ajuste caiu na peça errada

A cliente pediu para trocar **um título da Pauta do Mês**. A máquina reescreveu
os **Roteiros de Vídeo** — outra peça, que estava boa — e não tocou na Pauta.

Causa, medida: `refazerPorPedidoDoCliente` mira por **departamento**, não por
peça (`refacao.ts:193`), e exclui do alvo o que está `quality_flag`. A Pauta
estava `quality_flag`; sobrou o vizinho. Efeitos: a Pauta continua idêntica, o
Roteiro foi reescrito duas vezes com um pedido que não era sobre ele, e perdeu a
auditoria (`quality_ok` → `quality_nao_auditado`). Recusar com o motivo escrito
*"vocês mexeram na peça errada"* produziu **a mesma reescrita da peça errada**.

---

## 6. O portal: os modos Básico e Avançado não existem

Zero ocorrências de "básico"/"avançado" em `app`, `components` e `lib`.
O que existe é **um portal só, com 11 abas iguais para todo mundo** (Visão
Geral, Social Media, Tráfego Pago, Resultados, Projetos, Aprovações, Entregas,
Brand Hub, Solicitações, Integrações, Minha conta). O token é do **cliente**,
não da pessoa: Ana e Lucas são o mesmo usuário, e o nome do autor é texto livre
digitado por quem estiver com o link.

**Duas telas do portal se contradizem:** "Entregas" lista 6 peças "Esperando
você"; a Esteira, ao lado, diz *"Estas entregas ainda não têm material para você
ver"*. E a conversa anuncia **14 entregas** quando o portal mostra 6.

---

## 7. Nota: 62/100

Nasceu cliente em produção — o buraco das três rodadas anteriores fechou, e os
portões de qualidade se comportaram com honestidade. O que falta para receber
cliente pagante:

1. **Ligar o motor sem mão humana**: projeto `idle` precisa de relógio, e o
   botão de aprovar direção precisa existir na tela (hoje depende de uma
   comparação de string).
2. **Ajuste tem de mirar a PEÇA**, não o departamento. Hoje o pedido do cliente
   estraga trabalho bom.
3. **Pedido de material tem de ser enviado** antes de a esteira cobrar resposta
   dele — e não pode pedir print de app a uma padaria.
4. **Arte de verdade**: a esteira precisa chamar o motor de imagem, e a porta de
   imagem precisa escrever no livro-caixa.
5. **Uma só verdade na tela do cliente**: 14 x 6 entregas, "esperando você" x
   "ainda produzindo".
