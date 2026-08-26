# A 7ª volta de cliente oculto — 26/08/2026

> Medido contra `https://www.diolidigital.com.br`, commit em produção `0377042`,
> a partir das 05:20 UTC. Cliente fictício **Cantina Oculta NOME TESTE**, pedido
> `cmt9jxkhn003e0xmnpfqq3qbx`, contato em `.invalid`. Nenhuma publicação em rede
> social, nenhuma mensagem a pessoa real, nenhum recurso real tocado.
>
> Esta volta **retoma** a 6ª, que parou na trava de pagamento.

---

## 0. O trabalho da volta anterior JÁ ESTAVA MERGEADO

O relato de retomada dizia "4 commits não mergeados". Não era mais verdade
quando esta sessão abriu: `0377042c` é o merge do PR **#338** com exatamente
aqueles quatro commits, e é **o commit que está em produção agora**
(`/api/health` → `{"commit":"0377042"}`). Nada se perdeu no reinício do
contêiner; a suíte da base foi rodada mesmo assim para conferir: **462
arquivos, 6.539 testes, verde**.

---

## 1. O empurrão de bloqueio do CEO: o Pix registrado pela agência

```
POST /api/admin/pagamentos
{"clientRequestId":"cmt9jxkhn003e0xmnpfqq3qbx","valorCentavos":59000, ...}
→ HTTP 200
"Pagamento registrado. A produção deste projeto é liberada na próxima rodada
 da esteira (o despertador passa a cada 5 minutos) — não é preciso empurrar
 nada à mão."
```

**Isto não é furar a trava**: é a rota da agência que existe justamente para o
Pix fora do gateway, com sessão de agência, CSRF e dono na linha. É um
**bloqueio do CEO** (não há gateway), não um defeito da casa.

Funcionou, e a máquina confirmou sozinha: no `/api/pulso` seguinte, o projeto
migrou de *"parados por falta de pagamento confirmado"* para *"pagos esperando
o cliente aprovar a direção"*.

---

## 2. O que a jornada alcançou desta vez

| Passo | Estado |
|---|---|
| Pagamento registrado (rota da agência) | ✅ 200 |
| Cliente respondeu os 5 pedidos de material (portal) | ✅ 201 |
| Cliente aprovou a direção | ✅ 200 — **e demorou mais de 2 minutos** |
| Produção rodou | ✅ 6 entregas nasceram |
| Peça apresentada ao cliente | ❌ **barrada: ausência de auditor** |
| Aprovar · pedir ajuste · recusar · cancelar a PEÇA | ❌ **não exercitado** |

As 6 entregas do projeto `cmt9l4eu0005e0xmngtcm4w3o`, todas `in_review` e
`visibility: interno`:

```
cmt9nxve000300xs8tg3y438u  analytics           quality_ok
cmt9nxg70002p0xs844fwomeh  analytics           quality_ok
cmt9nx6cj002j0xs8zrku93qu  social              quality_nao_auditado   ← a trava
cmt9nvhus00290xs87sjcas2e  plano-de-conteudo   quality_ok
cmt9nuset00230xs82o5w7i5g  strategy            quality_ok
cmt9nucsc001x0xs8cm3nc5pq  strategy            quality_ok
```

Nenhuma arte (imagem) foi produzida: a esteira não chega às artes com o pacote
retido. **Zero peças visuais nesta volta.**

---

## 3. 🔴 O ACHADO DA VOLTA: o pacote que ninguém auditou SOME

O freio funcionou, e funcionou bem. `ActivityEvent` do projeto:

> `apresentacao_bloqueada` — "O pacote de Cantina Oculta NOME TESTE ficou pronto
> mas NÃO foi apresentado: **1 entrega(s) que NINGUÉM auditou — ausência de
> auditor**"
>
> `qualidade_nao_auditou` — "Social Media · Copy dos posts: **SEM AUDITORIA
> (limite_de_taxa)**"

A causa é externa e legítima: `quality-auditor` levou `OpenAI HTTP 429` nas
chamadas de árbitro independente (visível em `/api/ai-run-logs`).

E aí vem o defeito, que é da casa:

| instrumento | o que ele mostrou |
|---|---|
| `GET /api/pacotes-travados` | **1 pacote — e não é este.** Só o Farol 27 |
| perna `destravar` do despertador | nunca passou por este projeto |
| reauditoria | **nunca aconteceu** |

`pacotesTravados()` filtrava `revisionStatus: "quality_flag"` e mais nada. O
pacote parado por **ausência de juiz** não estava em lista nenhuma: invisível
para o painel, invisível para o relógio, sem ninguém para reauditar. A frase da
recusa manda *"destrave a auditoria"* — e mandava para um humano que nunca
ficava sabendo que o pacote existia.

**Proibição sem instrução gêmea empurra o operador para o contorno**, e o
contorno disponível é `mesmoComRessalva`, que desliga o único freio da casa.

Consertado nesta rodada (`reauditarSemArbitro`): o relógio passa a chamar o
juiz de novo, **sem reescrever a peça** — ela não tem defeito conhecido, falta
parecer. Árbitro ainda fora do ar deixa tudo como está.

---

## 4. O plano ainda vende o que o cliente recusou — agora com a trava

O achado nº 8 da 6ª volta continua **vivo em produção neste minuto**:

```
projeto  cmt9l4803004s0xmnk0907s0m
tarefa   cmt9l485b004z0xmn7uyzdiv3
         "Planejamento de Paid Strategy (Opcional)"  → agente a4 (tráfego pago)

pedido   cmt9jxkhn003e0xmnpfqq3qbx
         services: ["social_media"]
         briefingJson.scope.wantsPaidTraffic: false
```

A trava foi escrita nesta rodada (`contrato-do-plano.ts`), na porta por onde
TODO plano entra. **Duas travas, não uma**: o departamento recusado E as
palavras da tarefa — porque a tarefa medida chegou carimbada como `strategy`,
e uma régua que só olhasse `department` daria verde sobre o defeito que a mediu.

---

## 5. O que foi conferido e PASSOU

| o que | prova |
|---|---|
| `SocialPost.deliverableId` preenchido em produção | **18 de 18 posts** com FK preenchida (`/api/social-posts`). Fecha o "não sei" declarado na 6ª volta |
| Alarme não grita mais sobre o normal | Na batida corrente (`/api/pulso` → `ultima.falhas`) sobrou **1 falha**, a dos preços (dono: CEO). Os 101×/57× viraram `estados` |
| Trava de saída de e-mail | `avisoOrcamentoDetalhe: "bloqueado:dominio_inexistente"` para o `.invalid` — a trava funcionando |
| Portão de pagamento | recusou produzir antes do registro (`projeto_aguardando_pagamento: sem_registro_de_pagamento`) e liberou depois |
| Gerente Geral recusando demanda | 2 recusas registradas com motivo: *"O Gerente Geral não despacha para si mesmo"* |
| Árbitro fail-closed | segurou a peça sem parecer, com a frase certa e sem mandar reescrever |

---

## 6. O que a volta achou e NÃO consertou — com o dono

| achado | por que ficou | dono |
|---|---|---|
| **A aprovação da direção segura o cliente por mais de 2 minutos** — `POST /api/portal/esteira {aprovar_direcao}` roda a produção inteira dentro da requisição do navegador | é obra de fila/assíncrono, não de linha; e a rodada acabaria aqui | agência (plataforma) |
| **A esteira pede a coisa errada.** O `/api/pulso` dizia "esperando o cliente aprovar a direção"; a tela dele dizia "responder os 5 pedidos" e **nunca** mencionou que havia uma direção a aprovar | é a 6ª contradição de portal da série; merece o mesmo tratamento das outras cinco (uma verdade só), não um remendo | agência (portal) |
| **Os 10 pedidos de material continuam `pending`** depois de o cliente responder todos por escrito no portal | é o "cliente falou e ninguém leu" com outra roupa: falta quem case resposta com pedido | agência |
| **Dois projetos para o mesmo pedido** (achado nº 5 da 6ª volta) e a rota do portal decide sempre no `orderBy createdAt desc` — o cliente só consegue aprovar UM dos dois, o outro fica órfão para sempre | a duplicação é a causa; consertar a rota trataria o sintoma | agência |
| **`relógio ausente: cron-execute`**, 25× | mesma razão da volta anterior | agência (plataforma) |

---

## 7. O que depende só do CEO

1. **Qual tabela de preço vale.** A casa GRITA enquanto divergirem — o alarme
   apareceu de novo nesta volta, com dono e próxima ação: *"3 preço(s) que a
   esteira COTA não existem na página pública /planos (Plano Essencial R$ 590 ·
   Plano Crescimento R$ 990 · Plano Completo R$ 1790)"*. A casa não escolhe.
2. **Gateway de pagamento.** Sem ele, todo mês alguém registra Pix à mão.
3. **Chave de IA com folga / segundo provedor de árbitro.** O `HTTP 429` de
   hoje não é bug: é teto de plano. Enquanto ele bater, pacote fica retido —
   agora visível e reauditado, mas retido.
4. **`RESEND_FROM`**, para o aviso por e-mail sair para cliente real.
5. **A política de cancelamento** — quem pode, em que estados, e o que acontece
   com o dinheiro.

---

## 8. Custo

Janela desta volta (`/api/ai-run-logs`, a partir de 05:20 UTC): **US$ 0,1098 em
29 chamadas** — `esteira-pacote-travado` US$ 0,0271 · `a3` US$ 0,0191 ·
`quality-auditor` US$ 0,0152 (14 chamadas, várias em 429) ·
`strategy-posicionamento` US$ 0,0121 · `social-copy` US$ 0,0110 ·
`analytics-otimizacao` US$ 0,0092 · `strategy-concorrencia` US$ 0,0066 ·
`a5` US$ 0,0064 · `pm-responde` US$ 0,0030.
