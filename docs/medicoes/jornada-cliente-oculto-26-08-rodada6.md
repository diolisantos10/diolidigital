# A 6ª volta de cliente oculto, em produção — 26/08/2026

> Medido contra `https://www.diolidigital.com.br`, commit `4efc491`, entre 03:43 e
> 04:40 UTC. Cliente fictício `Cantina Oculta NOME TESTE`, contato em `.invalid`.
> Nenhum recurso real tocado, nenhuma publicação, nenhuma mensagem a pessoa real.
>
> Este arquivo guarda **as medições**. Os consertos estão no PR #336; o que ficou
> por decidir está no fim, com o dono de cada coisa.

---

## O que a volta cobriu

| Passo | Como foi exercitado |
|---|---|
| Porta pública (SDR) | 14 turnos reais em `POST /api/sdr/chat`, com a IA de produção |
| Briefing → pedido | `POST /api/brain/client-requests` → 201 em 694 ms |
| Triagem / auto-escopo | `status: new → scope_ready → proposal_pending`, sozinho |
| Orçamento | R$ 590/mês derivado, `confidence: high`, entregue no portal |
| Decisão do cliente | **recusei**, depois aceitei, depois pedi cancelamento |
| Planejamento (GG) | 7 tarefas + 5 pedidos de material, todos cobrados ao cliente |
| Portal | 6 rotas lidas com o mesmo token |
| Produção / arte | **não alcançada** — trava de pagamento (bloqueio do CEO) |
| Aviso ao cliente | portal: entregue · e-mail: **barrado pela trava de saída** (`.invalid`) |

Custo de IA da janela da volta: **US$ 0,1431** em 31 chamadas
(`comercial-sdr` US$ 0,0557 em 16 · `esteira-pacote-travado` US$ 0,0679 em 11 ·
`pm-orquestrador` US$ 0,0133 · `pm-cronograma` US$ 0,0063).

---

## 1. A casa chamou o cliente de `<UNKNOWN>` — nove vezes

O modelo devolveu `prospectName: "<UNKNOWN>"`. A casa gravou como nome e passou a
falar assim **com ele**:

> "Entendi, `<UNKNOWN>` — e tudo bem. Anotei isso do seu jeito e vou seguir sem
> esse dado por enquanto; a equipe confirma com você depois."

Nove turnos, palavra por palavra — e nos turnos em que ele **estava respondendo**:
o e-mail dele, o horário de funcionamento, a área atendida. A casa disse nove vezes
que ia seguir sem um dado que acabara de receber.

Dois defeitos somados, os dois consertados: a ausência declarada pelo modelo virando
fato, e o remédio da repetição virando a repetição.

## 2. O escopo saiu certo — e a verba veio do jeito errado

`operacao` chegou completa (`@cantinaoculta`, terça a domingo 18h–23h, Pinheiros e
Vila Madalena, WhatsApp). Mas a lacuna registrada foi:

> "A casa perguntou sobre a faixa de investimento e não entendeu a resposta. O
> cliente disse: *Quero começar no mês que vem*."

Ele tinha dito **"Tá caro. Meu teto é R$ 900 por mês"** dois turnos antes.

## 3. O preço cotado não existe na vitrine

| onde | o que diz |
|---|---|
| proposta que a casa me mandou | **R$ 590/mês — "Plano Essencial"** |
| `GET /planos` (200, 119.413 B, sha256 `24366713ab8de471…`) | R$ 49 · 297 · 790 · 1.390 · 2.590 |

**590 não aparece na página.** Nem o nome "Essencial". Confirmado nos bytes.

## 4. A recusa não trava nada

```
POST /api/portal/briefing/aceite {recusado} → 200   status vira `rejected`
GET  /api/portal/briefing/proposta          → decidivel:false, jaRecusado:true
POST /api/portal/briefing/aceite {aceito}   → 200   E O PROJETO NASCE
```

A rota que lê dizia que não havia mais o que decidir; a que escreve decidiu assim
mesmo. E a direção cara é a oposta: aceitar e depois recusar marcaria `rejected`
com o projeto já criado.

## 5. Dois projetos para o mesmo pedido

`cmt9l4803004s0xmnk0907s0m` e `cmt9l4eu0005e0xmngtcm4w3o`, ambos de
`cmt9jxkhn003e0xmnpfqq3qbx`, criados às **04:19:22** e **04:19:31** — 9 segundos.
O cliente abriu o portal e viu o projeto dele duas vezes, com dois nomes diferentes.

## 6. Duas contradições novas do portal (a 4ª e a 5ª)

Mesmo token, mesmo minuto:

| rota | antes do aceite | depois do aceite |
|---|---|---|
| `/api/portal/esteira` | "Ainda estamos organizando tudo" | "Precisamos de uma coisa sua" |
| `/api/portal/messages` | **a proposta, com valor e link de aceitar** | — |
| `/api/portal/projetos` | **403 "Acesso negado"** | "Aguardando o pagamento para começar" |
| `/api/portal/pedidos` | **403 "Acesso negado"** | 200 |
| `/api/portal/vista` | **403 "Acesso negado"** | 200 |

Três abas fechadas para quem a casa acabara de convidar — porque a ficha de
`Client` só nasce no aceite, e a ausência dela virava "acesso negado".

## 7. O alarme que grita sobre o normal — o número subiu enquanto eu media

`/api/pulso`, 24h:

| vezes | perna | texto |
|---|---|---|
| **101** | orcamento | 2 briefing(s) sem orçamento calculado — aguardando gente |
| **57** | pm-responde | 5 mensagem(ns) sem resposta automática — aguardando gente |
| 27 | orcamento | 1 briefing(s) sem orçamento calculado |
| 25 | v2-batida | relógio ausente: `cron-execute` |
| 18 | orcamento | 1 briefing(s) sem orçamento calculado |

O despacho trazia 76; ao longo desta volta passou de 90 para 101. São **146** da
perna do orçamento e **60** da do PM, sobre comportamento correto nas duas.

## 8. O plano incluiu o que o cliente recusou

Eu disse **"Anúncios não, agora não"**; o escopo aceito registrou
`wantsPaidTraffic: false` e `services: ["social_media"]`. O plano do GG saiu com
sete tarefas, e uma delas é:

> **"Planejamento de Paid Strategy (Opcional)"** — agente `a4`

## 9. O cancelamento é ouvido e não tem estado

Pedi cancelamento na conversa às 04:36. O PM respondeu sozinho em ~4 minutos:

> "Entendi, cancela a proposta da Cantina Oculta. Vou confirmar isso com a equipe
> e te falo por aqui se precisar de mais alguma coisa."

O `status` continuou `proposal_pending`, e a esteira continuou dizendo ao mesmo
cliente *"Ainda estamos organizando tudo. Seu projeto está sendo preparado."*
A casa **ouve** o cancelamento, **responde** honestamente, e não tem para onde
levá-lo: a promessa vai para uma fila de gente que é a mesma dos 57 alarmes.

## 10. A régua do título media a tinta, não o fundo

Experimento controlado, fundo chapado, tinta branca:

| fundo | razão VERDADEIRA | régua antiga | régua nova (texto real) |
|---|---|---|---|
| `#595959`, 15% de letra | 7,00:1 | **2,07** | 6,39 (−8,7%) |
| `#595959`, 30% de letra | 7,00:1 | **1,00** | — |
| `#767676` | 4,54:1 | — | 4,00 (−11,9%) |
| `#a0a0a0` | 2,61:1 | — | 2,22 (−14,9%) |

Erro de até **86%**, colapsando em 1,00 a partir de ~30% de cobertura de letra.

### E a peça do despacho, medida pelas duas réguas

Baixei o arquivo que carrega a marca `[titulo ilegivel] 2,61:1`:

```
/api/media/med_96e37c4f_mt9h2a2j
HTTP 200 · 108.934 B · image/jpeg · 1080×1350
sha256 96e37c4fe34881a3c12b59cedcbb12d8a9b7d5bbce73eee562cf822dec337c6d
```

A régua NOVA, faixa a faixa do quadro:

| faixa (y) | razão | fundo | veredito |
|---|---|---|---|
| 0 | 17,24:1 | `#1b1b1a` | passa |
| 135 | **2,70:1** | `#9e9d9d` | **declara** |
| 270 | **2,96:1** | `#969695` | **declara** |
| 405 | 11,66:1 | `#3b3834` | passa |
| 540–1215 | 8,9 a 18,3:1 | escuros | passa |

**Esta peça é de verdade marginal** — há um pedaço claro real sob o título — e ela
cai exatamente na faixa do meio: **declarada, não barrada**. Nenhuma peça paga foi
jogada fora pela decisão nova.

E isto refina a acusação, para ela ficar exata: a régua antiga **não estava sempre
errada — ela era ilimitada**. O erro dela cresce com a cobertura de letra. Nesta
peça a cobertura era baixa e o número saiu perto; numa peça com 30% de letra ele
colapsa em 1,00 para qualquer fundo. O problema nunca foi o valor de um caso — era
não haver como saber, olhando o número, se ele descrevia o fundo ou a tinta.

---

## ⚠️ Um diagnóstico meu, errado, declarado

Li três peças em `/api/social-posts` e vi `deliverableId` ausente nas três. Quase
registrei como causa-raiz que a chave nunca é escrita. **Não estava nula — o
`toDTO` daquela rota não devolvia o campo.** Eu ia afirmar uma negação a partir do
silêncio, que é o guardrail 1 que esta casa escreve em todo arquivo.

Fica como está: **não sei** se a FK está preenchida nas peças de produção. A mira
por FK está provada por régua, não por medição em produção.

---

## O que depende só do CEO

1. **Qual tabela de preço vale** — a da vitrine (49/297/790/1.390/2.590) ou a da
   proposta (590/990/1.790). A casa passou a gritar enquanto divergirem; ela não
   escolhe. Ver `docs/medicoes/duas-tabelas-vivas-26-08.md`.
2. **Gateway de pagamento** — sem ele a produção não liga e cinco departamentos
   ficam sem como ser medidos de ponta a ponta.
3. **`RESEND_FROM`** — sem ele o aviso por e-mail não sai para cliente real.
   (Para o cliente fictício ele foi corretamente **barrado pela trava de saída**,
   `bloqueado:dominio_inexistente` — isso é a trava funcionando, não uma falta.)
4. **A política de cancelamento** — quem pode cancelar, em que estados, e o que
   acontece com o dinheiro. Sem essa decisão, o pedido de cancelamento continua
   sendo uma promessa sem estado.
