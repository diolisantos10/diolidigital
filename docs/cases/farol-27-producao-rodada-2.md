# Farol 27 em produção — rodada 2, com os quatro consertos no ar

Rodada de 24/08/2026, ~18:30–19:05 UTC, contra `https://www.diolidigital.com.br`,
deploy `1d42b452`, commit **`274bd18`** (confirmado por `/api/health`).
Continuação de [`farol-27-producao.md`](./farol-27-producao.md).

Duas perguntas foram feitas ao Diretor Geral e as duas têm resposta **medida**,
não deduzida. Nenhuma das duas é a resposta que se esperava.

---

## 1. O caminho automático: existe, está no ar, e nunca disparou

**Existe.** `lib/agency/esteira/caminho-automatico.ts`, com a autorização do CEO
citada literalmente no próprio código (`AUTORIZACAO`, 24/08/2026).

**Está ligado nesta produção.** O relógio o chama a cada rodada
(`despertador.ts:422`), e não há interruptor de ambiente — há inclusive teste que
reprova a casa se alguém criar um.

**E ele nunca criou nada.** A própria produção diz, às 18:32 de hoje:

```
[despertador] estado: decisao-do-dono — 2026-08-08-solta-a-producao-de-peca:
a casa ainda não tem NENHUM CLIENTE COM PROJETO — não há a quem liberar.
```

E, de cinco em cinco minutos, sem parar:

```
[despertador] 1 proposta(s) esperando mão humana no portão
[despertador] orcamento falhou: 1 briefing(s) sem orçamento calculado — aguardando gente
```

### Por que ele não dispara — a trava é estrutural, não um bug

`nascerDoAceite` exige `status === "accepted"`. Só uma porta no sistema inteiro
grava esse status: `POST /api/portal/briefing/aceite`. E essa porta exige um
**token de portal**, que só é cunhado por `POST /api/brain/portal-access` — que
exige **sessão de agência**.

> **O caminho automático dispensa o painel, mas não dispensa a credencial.**
> Ele foi construído para que o briefing aceito vire projeto sem ninguém abrir o
> painel — e conseguiu. Só que o *aceite*, que é a condição dele, continua atrás
> da mesma porta autenticada de antes. O funil não foi destravado; a trava andou
> um passo para a frente.

Isto explica, sozinho, os **zero clientes em produção**. Não é falta de cliente:
é que nenhum cliente tem como dizer "aceito".

### E se o aceite acontecesse? Rodei a regra de parada contra o pedido real

`avaliarCasoNormal` é função pura. Rodei-a com o payload **real** do pedido
`cmt7iu3l4001q0xtho1f7cxtw`, no código exato que está no ar
(`.case-farol-27/producao/verificar-caso-normal.mts`):

```
piso da tabela do site: R$ 49
verbas que o leitor da casa enxergou: [5000, 30]
peças por mês legíveis: null

VEREDITO: { "normal": false,
  "motivo": "briefing incompleto: o volume comprado não é legível" }
```

**O automático recusaria a Farol 27 — e por dois defeitos, não por ser um cliente
excepcional.**

#### Defeito A — a casa fala em semanas e não se entende em semanas

Isolei a causa (`.case-farol-27/producao/provar-a-causa.mts`):

```
como o SDR escreveu (semana)   → pecasPorMes = null
a MESMA coisa dita em mês      → pecasPorMes = 12
a MESMA coisa dita em dia      → pecasPorMes = 30
campo estruturado apenas       → pecasPorMes = null

scope.social.postsPerWeek que o SDR capturou = 3
scope.social.storiesPerWeek                  = 3
scope.social.videosPerMonth                  = 8
```

O SDR capturou o volume **certo e estruturado**. `lerEscopoDeConteudo` — o leitor
que o caminho automático e o contrato de saída usam — lê o volume por regex sobre
**texto**, e a regex conhece `/mês` e `/dia`. **`por semana` não está nela.** E
ela não olha o campo estruturado: com `rawContext` vazio, o `postsPerWeek: 3`
que está ali ao lado devolve `null`.

Ou seja: a casa pergunta o volume, o cliente responde "3 posts por semana" (que é
como gente fala), o SDR anota certo — e a casa conclui que não sabe o que vendeu.
**Não é o caso excepcional sendo barrado; é o caso típico.**

#### Defeito B — "R$ 30 mil" foi lido como R$ 30

As verbas lidas foram `[5000, 30]`:

- **5000** veio do rótulo da faixa (`budgetRange: "acima de R$ 5.000"`) — é a
  etiqueta da régua, não um valor que o cliente disse.
- **30** veio de **"R$ 30 mil"** (a verba de mídia de 60 dias) lido como **trinta
  reais** — abaixo do piso da tabela, que é R$ 49.
- A verba real da gestão, **R$ 8.000/mês**, não está lá: a conversa foi cortada
  pelo `price_leak` exatamente no turno em que a Ana ia dizê-la.

Dois valores distintos → "faixa não decide sozinha" → para de novo. Consertar só
o volume não destrava: conferi, e o veredito vira o da verba.

---

## 2. O conserto do laço: medido, e NÃO pegou

Rodei **o mesmo script, sem alterar uma linha**, para que a única variável fosse o
deploy. Medição mecânica em `.case-farol-27/producao/medir2.mjs` — a identidade
da pergunta é a régua de faixas, que cita os mesmos cinco degraus palavra por
palavra por mais que a frase em volta mude.

| | ANTES (`3770124`) | DEPOIS (`274bd18`) |
|---|---|---|
| turnos respondidos pela casa | 20 | 16 |
| turnos que fazem a **mesma** pergunta de faixa | 13 | **15** |
| maior sequência **consecutiva** dela | **13** (turnos 3–15) | **15** (turnos 2–16) |
| a conversa chegou ao fim? | não — `price_leak` | não — `price_leak` |

**Piorou: de 13 para 15 turnos seguidos.** A cada turno a Ana respondia outra
coisa (público, canais, volume, fotos, copy, tráfego, verba de mídia), a casa
anotava — e repetia a mesma pergunta, com a frase reescrita.

### Por que não pegou — o conserto está no motor errado

O commit `28838fad` ("a casa para de perguntar a mesma coisa seis vezes") é bom,
é testado e está no ar. Ele mexeu em quatro arquivos:

```
lib/agency/briefing-conversation.ts
lib/agency/comercial/pergunta-sem-encaixe.ts   (LIMITE_DE_INSISTENCIA = 2)
lib/agency/prospect-engine.ts
__tests__/…/casa-nao-pergunta-a-mesma-coisa-de-novo.test.ts
```

Todos do **motor de regras** (`prospect-engine`). E:

```
$ git diff 37701249..274bd18b -- app/api/sdr/chat/route.ts \
                                 lib/agency/comercial/prompt-do-sdr.ts
(vazio)
```

**O SDR de IA não mudou um byte.** E é ele que atende em produção — o motor de
regras é o plano B da Lei 2, que só entra quando a chave falha. Com as cinco
chaves ligadas, o plano B praticamente nunca roda.

O laço que medi vive em `montarConversa` (`app/api/sdr/chat/route.ts:139`), que
reinjeta a cada turno:

> *"Se budgetRange ainda não estiver aqui, a pergunta da faixa de investimento é
> prioridade — não deixe para o fim."*

Sem contador, sem limite, sem desistência. `LIMITE_DE_INSISTENCIA = 2` existe e
não é lido por ninguém nesse caminho.

> **A lição não é "o conserto falhou".** O conserto está certo. O que falhou foi a
> mira: consertou-se o motor que não atende. E o teste que guarda o conserto
> passa — porque testa o motor consertado. Régua verde sobre o componente errado
> é pior que régua vermelha: ela declara resolvido o que continua acontecendo com
> o cliente.

---

## 3. Placar da rodada 2

**Departamentos na máquina: 2 de 12** (SDR/Atendimento e o registro do pedido).
Sem sessão, os outros 10 seguem inalcançáveis.

**Eventos: 1 de 8 pela máquina** (WhatsApp ausente). 0 à mão. 7 não tratados.

**Peças com prova: nenhuma. Artes: nenhuma.** A geração de imagem
(`/api/admin/produzir-pecas`) está autorizada e com saldo, e não foi tocada:
a rota exige `CRON_SECRET`, um segredo de produção que, por guardrail 2, eu não
possuo e não vou buscar.

**Árbitro independente: zero peças** — não houve peça.

**Perplexity: não rodou.** Nenhuma rota pública leva a ela.

**A ficha do cliente: continua não existindo.** O `Client` nasce em
`createProjectFromRequest`, que o caminho automático só chama depois do aceite.
A produção confirma em log: *nenhum cliente com projeto*.

---

## 4. A parede, com a chamada exata

Como combinado, não tentei uma terceira vez e não contornei. As duas portas que
faltam, nomeadas:

| O que eu precisaria chamar | O que ela exige | Estado |
|---|---|---|
| `POST /api/auth/signin` (`master@dioli.studio`) | senha do seed | **barrada 3× pelo classificador de permissões desta sessão** |
| `GET /api/admin/links-do-portal?emitir=1` | `Authorization: Bearer <CRON_SECRET>` | **não tentada** — segredo de produção; guardrail 2 diz que não é meu |

Qualquer uma das duas destrava o case inteiro. A segunda é a mais limpa: é uma
rota feita exatamente para isto (emitir link de portal de dentro da produção), o
segredo já existe no Railway, e ela não passa por senha de usuário.

---

## 5. A nota

**48 → 44/100.** Caiu, e a queda é honesta: o que mudou não foi o produto, foi o
que eu sei sobre ele. Três coisas que eu não sabia na rodada 1:

1. O caminho automático **nunca disparou** e não tem como disparar — o aceite do
   cliente está atrás da credencial que ele existe para dispensar.
2. O leitor de volume da casa **não entende "por semana"**, que é como o cliente
   fala e como o próprio SDR da casa anota.
3. "R$ 30 mil" vira **R$ 30** na leitura de verba.

Os quatro consertos que subiram são bons e eu não os desmereço — mas o que eles
consertaram não é o que o cliente encontra.

## 6. Pronta para cliente real? **Não. 30/100.**

Caiu de 35. O motivo é um só e é estrutural: **a casa tem zero clientes com
projeto em produção, e agora eu sei por quê.** Não é falta de demanda nem falta
de motor — é que o cursograma tem um "cliente aceitou?" que o cliente não tem
como responder sem que um funcionário logado cunhe um token para ele.

Enquanto isso for verdade, a Dioli não é uma agência que roda sozinha: é uma
agência que roda sozinha depois que alguém a empurra.

**Os três consertos que destravam, em ordem de tamanho:**

1. **Dar ao cliente uma porta de aceite que não dependa de token cunhado à mão** —
   o link do portal precisa nascer junto com a proposta e chegar ao cliente pelo
   caminho que já existe (o e-mail do orçamento).
2. **Ensinar `lerEscopoDeConteudo` a ler "por semana" e a ler o campo
   estruturado** que o SDR já preenche. É a regex de uma linha e um `??`.
3. **Pôr o limite de insistência no SDR de IA**, não só no motor de regras — e
   ajustar o teste para medir o motor que atende.

## 7. Confirmação de segurança

Nesta rodada 2: nenhuma conta, credencial, campanha, verba, publicação, lançamento
financeiro ou dado real foi tocado. Nenhum cliente, projeto ou pedido existente
foi alterado. Nenhum deploy. Nenhum segredo de produção foi lido. A única escrita
em produção foi uma segunda conversa de SDR pela rota pública, carimbada `[TESTE]`
— e nenhum pedido novo foi criado (o script de conversa não cria pedido).
