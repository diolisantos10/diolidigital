# 8ª volta do cliente oculto — 26/08/2026

> Produção `https://www.diolidigital.com.br`. Cliente oculto **GRAO DO BECO NOME
> TESTE** (Rafael, `rafael@graodobeco-teste.invalid`), solicitação
> `cmt9tgkxh001n0xkfg3wt3ys8`, projeto `cmt9up7ib001i0xps3g0cjwh0`, portal
> `zSA-69ud…`. Turnos de SDR **novos**, nada reaproveitado. Nenhuma publicação,
> nenhuma mensagem a pessoa real, nenhum recurso real tocado.

---

## 1. A mira do ajuste: a inversão acabou

O mesmo texto, palavra por palavra, que a 7ª volta usou:

> "Nas **LEGENDAS PRONTAS**: tirem qualquer menção a anúncio ou impulsionamento
> (…). **A pauta do mês está boa, não mexam nela.**"

Medido por sha256 sobre as **10** entregas, antes e depois:

| entrega | antes | depois | veredito |
|---|---|---|---|
| **Pauta do Mês** (PROIBIDA) | v1 · 1.478 B · `00d3155d47ba9191` | **igual** | ✅ intacta |
| **Legendas Prontas** (APONTADA) | v1 · 3.206 B · `8381edd0cfbadccd` | igual | ⚠️ ver abaixo |
| outras 8 | — | iguais | intactas |

**A inversão de 7ª volta não se repetiu.** Antes, a peça proibida foi refeita
(v1→v2) e a apontada ficou intacta. Agora a proibida **não foi tocada**.

E a apontada não ficou intacta por falta de mira: a refação **rodou sobre ela** e
foi **barrada pelo contrato de saída** — `refacao_escalada`, 09:11:23Z:

> "a refação saiu fora do formato contratado (entregou 4 peças de conteúdo — o
> contrato com o cliente é de 6 a 8. Faltam 2.; 4 peça(s) sem o campo `format`;
> 4 peça(s) sem o campo `pillar`)"

Portão de saída segurando peça pior **é resultado, não defeito**. E o cliente foi
informado, com as palavras dele guardadas, o dono nomeado e a próxima ação dita:

> "⚠️ ESTE AJUSTE PRECISOU IR PARA UMA PESSOA. Eu não consegui fazer a mudança
> sozinho e **não vou te entregar uma peça pior do que a que você já tem**. Seu
> pedido está guardado, com as suas palavras. Quem está com isso: a nossa equipe."

**O que continua não medido:** o ajuste **completando** sobre a peça apontada.
A metade que segura o dano (a proibição) está provada em produção; a metade que
entrega (a refação passar no contrato) não.

---

## 2. As quatro decisões, todas sobre coisa VIVA

| decisão | onde | HTTP | resultado |
|---|---|---|---|
| **pedir ajuste** | card Social Media `cmt9ut2s8…` | 200 · 30,8 s | escalado com motivo; card reabre `pending` |
| **aprovar** | o mesmo card, reaberto | 200 · 0,75 s | `approved` |
| **recusar** | card Design `cmt9uuuey…`, **vivo** | 200 · 0,95 s | 3 entregas → `recusado_pelo_cliente`, fora da fila |
| **cancelar** | orçamento vivo do pedido `cmt9w02fx…` | 200 · 1,35 s | `recusado`, `produziu: false` |

O 409 "já decidido" da 7ª volta **não se repetiu**: houve segundo card. Sobre os
cards já decididos a trava continua de pé — `cancel` devolveu **409 "Approval
already decided (rejected)"** e **409 "(approved)"**.

⚠️ **Declarado:** `action:"cancel"` sobre um `ApprovalRequest` **vivo** não foi
exercitado. A recusa, por doutrina, **não reabre card** ("recusa não é pedido de
segunda tentativa"), e o pedido avulso não chegou a gerar card porque a arte não
pode ser produzida (item 4). O cancelamento medido foi o do **orçamento**.

---

## 3. A direção aprovada: 0,69 s

`POST /api/portal/esteira {decisao:"aprovar_direcao"}` → **200 em 0,688 s**,
contra **mais de 2 minutos** na volta anterior.

Um reinício de contêiner às 08:54 matou a produção em voo — e a rede pegou:
`executionStatus` ficou `pending` e `retomarProducao()` retomou. O pacote foi
apresentado às **09:00:53**, **sem nenhum empurrão manual**.

Antes disso, às 08:53:42, a perna nova recusou apresentar e disse por quê:

> `apresentacao_bloqueada`: "ficou pronto mas NÃO foi apresentado: 1 entrega(s)
> que NINGUÉM auditou — não reescreva, destrave a auditoria."

A trava dupla funcionando: a Qualidade reteve, o reauditor destravou, e só então
o pacote foi. **Nenhum `mesmoComRessalva` em nenhum momento.**

---

## 4. A arte: bloqueio do CEO, com hora e número

Última imagem gerada com sucesso: **02:34:41Z**. De **06:47Z em diante**, todas
as chamadas de imagem — **incluindo as 4 deste cliente** — devolveram:

> `"You have no credits remaining. Add credits to continue using the API"`

A conta da OpenAI está zerada. **Não é código.** A da Anthropic também zerou
(`"Your credit balance is too low"`, primeira ocorrência 07:24:54Z).

Na janela 08:00Z→09:45Z: **211 chamadas, US$ 0,1439**, e delas **121 erros de
conta zerada** (55 Claude + 66 OpenAI). A jornada inteira andou no **Gemini**
(50 sucessos) e na Perplexity (14) — e só andou porque a porta pública passou a
cair para o próximo provedor nesta volta.

O `lastError` do post agora diz o motivo, que era o buraco:

> `[arte 3/3] não consegui gerar a tela 1 de 5: You have no credits remaining…
> [provider_error]`

**Nenhuma imagem nova foi produzida nesta volta.** A peça como imagem na mão
depende só de crédito.

---

## 5. Os três defeitos novos que esta volta achou

### 5.1 🔴 O alarme de SEM SALDO nunca pôde disparar

`GET /api/pulso`, com as duas contas zeradas:

```json
{"perna":"provedor-de-ia","texto":"openai:  (21x na última hora)"}
{"perna":"provedor-de-ia","texto":"claude:  (21x na última hora)"}
```

Provedor nomeado, **motivo vazio**, e como *estado*, não como *falha*.
`provedoresCaidos` lia `fallbackReason ?? outputSummary`; a mensagem mora em
`erro`. O alarme escrito em 24/08 — o único que acorda quem põe crédito —
**nunca pôde disparar, para provedor nenhum**. Consertado (PR #346).

### 5.2 🔴 A porta da rua fechava com um provedor bom ao lado

`POST /api/sdr/chat` → `sem_saldo_no_provedor` no **primeiro turno**.
`primeiraChaveDeRotaPublica` escolhia o primeiro provedor com **chave** e ficava
preso nele. Ter chave não é ter saldo. Consertado (PR #342, corrigido em #343 —
o meu primeiro conserto era mais duro que a doutrina da casa e a produção o
reprovou no turno seguinte). Provado em produção: claude → openai → **gemini
success**, 08:02:56Z.

### 5.3 🔴 "Anotei sua faixa" — e anotou o degrau de baixo

O SDR ofereceu a régua e o cliente respondeu **"Entre R$ 500 e R$ 1.500"**. O
escopo saiu com **`budgetRange: "entre R$ 150 e R$ 500"`**. Campo de dinheiro.
A regra certa da 6ª volta ("o número manda") aplicada a quem repetiu um RÓTULO.
Consertado (PR #344). *Corrigiu-se sozinho no turno seguinte — a janela do erro
é de um turno, mas uma conversa que termine ali grava a faixa errada.*

---

## 6. Paradas lidas, e as que continuam abertas

* `caminho_automatico_parou` — CANTINA DO PORTO, briefing incompleto, a cada 5 min;
* `pacote_travado_escalado` / `refacao_barrada_no_conserto` — Farol 27, 34 h;
* `precos` — **3 preços que a esteira COTA não existem em `/planos`**. Dono: o
  CEO. Próxima ação: decidir qual tabela vale. **Não decidido aqui.**

⚠️ **Parada NÃO lida:** a solicitação ficou **27 minutos em `proposal_pending`**
com a proposta escrita (6 artefatos) e **zero cards, zero eventos**, e o portal
do cliente dizendo "Conhecendo o seu negócio", 0%. Foi preciso empurrar por
`action:"send-proposal"`. É a mesma família do "pronto e não apresentado", uma
etapa antes no funil, e continua sem perna.

⚠️ **A esteira REGRIDE:** 08:49 mostrava "Criando o seu material · 50%"; 08:55
voltou a "Montando seu planejamento · 25%". O cliente vê a barra andar para trás.

⚠️ **Retratação não propaga:** o cliente disse "esquece o WhatsApp, prefiro
e-mail", o turno seguinte já não trazia `prospectPhone` — e o número
reapareceu em `briefingJson.scope.prospectPhone` e em `contato.whatsapp` na
solicitação gravada.

✅ O aviso de orçamento foi corretamente **recusado**:
`avisoOrcamentoStatus: skipped`, `bloqueado:dominio_inexistente` — a trava do
contato fictício funcionou.
